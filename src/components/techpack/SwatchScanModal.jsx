// SwatchScanModal — Claude Vision reads a fabric swatch sheet, then the
// operator confirms the grid geometry and the modal crops every swatch from
// the source image and returns them as uploadable Blobs with labels. The
// caller (FabricBuilder) uploads and appends them to color_card_images.
//
// Flow:
//   1. Drop a single swatch-card photo
//   2. "Scan" — Claude Vision returns a draft grid (matrix box + row codes +
//      column tones + row/col counts). The model is reliable on the labels
//      and counts but NOT on pixel-accurate edges, so this is only a guess.
//   3. Edit — operator drags the grid rectangle onto the fabric matrix and
//      adjusts rows/cols + the fabric/label split (SwatchGridEditor). Because
//      a printed card is a uniform grid, the corners + counts fix every cell.
//   4. Crop — even-divide the box (gridToRegions) and canvas-crop each cell
//   5. Preview — deselect any, edit labels, "Add X swatches"

import { useEffect, useRef, useState } from 'react';
import { Loader2, X, Scan, Plus, Minus } from 'lucide-react';
import { FR } from './techPackConstants';
import { extractSwatchGrid, gridToRegions, fileToMedia, cropRegionFromFile } from '../../utils/aiFabricExtract';
import SwatchGridEditor from './SwatchGridEditor';

const clampNum = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const clamp01 = (v, fallback) => Math.max(0, Math.min(1, clampNum(v, fallback)));

// Pad / trim an array of strings to length n.
function resizeArr(arr, n, fill = '') {
  const a = (Array.isArray(arr) ? arr : []).slice(0, n).map(s => String(s ?? ''));
  while (a.length < n) a.push(fill);
  return a;
}

// Turn a (possibly missing / non-grid) model response into a starting grid the
// operator can drag. The model's box is used as a hint only — it's routinely
// anchored too high, which is exactly what the operator corrects.
function gridFromGuess(g) {
  const rect = g && g.grid ? g.grid : {};
  const rows = Array.isArray(g?.rows) && g.rows.length ? g.rows.map(String) : Array(8).fill('');
  const columns = Array.isArray(g?.columns) && g.columns.length ? g.columns.map(String) : [''];
  return {
    x0: clamp01(rect.x0, 0.06),
    y0: clamp01(rect.y0, 0.20),
    x1: clamp01(rect.x1, 0.97),
    y1: clamp01(rect.y1, 0.97),
    rows,
    columns,
    cell_fabric_bottom_frac: clamp01(g?.cell_fabric_bottom_frac, 0.78),
  };
}

export default function SwatchScanModal({ onClose, onApply }) {
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState(''); // object URL of dropped image
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);
  const [phase, setPhase]     = useState('drop'); // drop | edit | preview
  const [grid, setGrid]       = useState(null);
  const [editRows, setEditRows] = useState(false); // reveal the per-row code list
  const [swatches, setSwatches] = useState([]); // [{ label, blob, blobUrl, selected }]
  const fileRef = useRef(null);

  const revokeSwatches = (list) => list.forEach(s => s.blobUrl && URL.revokeObjectURL(s.blobUrl));

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
    revokeSwatches(swatches);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onDrop(files) {
    const f = files[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Please drop an image file (JPEG, PNG, WebP).'); return; }
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(f));
    revokeSwatches(swatches);
    setSwatches([]);
    setGrid(null);
    setPhase('drop');
    setError(null);
  }

  // Ask the model for a draft grid, then drop the operator into the editor.
  // If the model call fails (or returns no grid), still enter the editor with
  // a default rectangle so a card can always be gridded by hand.
  async function runScan() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const media = await fileToMedia(file);
      let guess = null;
      try {
        guess = await extractSwatchGrid({ media });
      } catch (err) {
        setError(`${err.message || 'Auto-detect failed'} — set the grid manually below.`);
      }
      setGrid(gridFromGuess(guess));
      setPhase('edit');
    } catch (err) {
      setError(err.message || 'Scan failed');
    } finally {
      setBusy(false);
    }
  }

  function patchGrid(patch) { setGrid(g => ({ ...g, ...patch })); }
  function setRowCount(n) {
    const R = Math.max(1, Math.min(200, Math.round(n)));
    patchGrid({ rows: resizeArr(grid.rows, R) });
  }
  function setColCount(n) {
    const C = Math.max(1, Math.min(20, Math.round(n)));
    patchGrid({ columns: resizeArr(grid.columns, C) });
  }
  function setColLabel(i, v) {
    const columns = grid.columns.slice();
    columns[i] = v;
    patchGrid({ columns });
  }
  function setRowLabel(i, v) {
    const rows = grid.rows.slice();
    rows[i] = v;
    patchGrid({ rows });
  }

  // Even-divide the confirmed box into cells and crop each from the source.
  async function cropFromGrid() {
    if (!file || !grid) return;
    setBusy(true);
    setError(null);
    const regions = gridToRegions({
      grid: { x0: grid.x0, y0: grid.y0, x1: grid.x1, y1: grid.y1 },
      rows: grid.rows,
      columns: grid.columns,
      cell_fabric_top_frac: 0,
      cell_fabric_bottom_frac: grid.cell_fabric_bottom_frac,
    });
    if (!regions.length) { setError('Set at least one row and column.'); setBusy(false); return; }
    try {
      const cropped = await Promise.all(regions.map(async (r, i) => {
        try {
          const blob = await cropRegionFromFile(file, r);
          if (!blob) return null;
          return { label: r.label || `Color ${String(i + 1).padStart(2, '0')}`, blob, blobUrl: URL.createObjectURL(blob), selected: true };
        } catch { return null; }
      }));
      revokeSwatches(swatches);
      const valid = cropped.filter(Boolean);
      if (!valid.length) { setError('No crops produced — check the grid box covers the fabric.'); setBusy(false); return; }
      setSwatches(valid);
      setPhase('preview');
    } catch (err) {
      setError(err.message || 'Cropping failed');
    } finally {
      setBusy(false);
    }
  }

  function toggleSwatch(i) {
    setSwatches(prev => prev.map((s, idx) => idx === i ? { ...s, selected: !s.selected } : s));
  }
  function setLabel(i, label) {
    setSwatches(prev => prev.map((s, idx) => idx === i ? { ...s, label } : s));
  }
  const selectAll   = () => setSwatches(prev => prev.map(s => ({ ...s, selected: true })));
  const deselectAll = () => setSwatches(prev => prev.map(s => ({ ...s, selected: false })));

  const selected = swatches.filter(s => s.selected);
  const R = grid ? Math.max(1, grid.rows.length) : 0;
  const C = grid ? Math.max(1, grid.columns.length) : 0;

  const miniBtn = { fontSize: 9, color: FR.slate, background: 'none', border: `0.5px solid ${FR.sand}`, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' };
  const stepBtn = { width: 24, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `0.5px solid ${FR.sand}`, background: FR.white, color: FR.slate, cursor: 'pointer', borderRadius: 4 };
  const countInput = { width: 44, textAlign: 'center', fontSize: 12, padding: '4px 2px', border: `0.5px solid ${FR.sand}`, borderRadius: 4, color: FR.slate, background: FR.white, fontFamily: 'inherit' };
  const smallLabel = { fontSize: 9, color: FR.stone, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 5 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(58,58,58,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: FR.salt, borderRadius: 8, padding: 22, width: 1040, maxWidth: '94vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: `0.5px solid rgba(58,58,58,0.15)` }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: FR.slate }}>AI Color Scanner</div>
            <div style={{ fontSize: 11, color: FR.stone, marginTop: 4 }}>
              {phase === 'edit'
                ? 'Drag the box onto the fabric grid, set rows × columns, then crop. Printed cards are uniform — the corners fix every cell.'
                : 'Drop a swatch sheet photo. Claude reads the codes; you confirm the grid; the modal crops each fabric square.'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: FR.stone, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Drop zone */}
          {!file && (
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); onDrop(Array.from(e.dataTransfer.files)); }}
              onClick={() => fileRef.current?.click()}
              style={{ border: `1.5px dashed ${FR.sand}`, borderRadius: 6, padding: '36px 20px', textAlign: 'center', cursor: 'pointer', color: FR.stone, fontSize: 12 }}
            >
              <Scan size={28} style={{ margin: '0 auto 10px', display: 'block', color: FR.soil }} />
              Drop a fabric swatch card photo here, or click to browse
              <div style={{ fontSize: 10, marginTop: 4, color: FR.stone }}>JPEG / PNG / WebP · one swatch sheet per scan</div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { onDrop(Array.from(e.target.files)); e.target.value = ''; }} />
            </div>
          )}

          {/* Scan step — image + scan button before a grid exists */}
          {file && phase === 'drop' && (
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ position: 'relative' }}>
                <img src={preview} alt="Swatch sheet" style={{ width: '100%', borderRadius: 4, border: `0.5px solid ${FR.sand}` }} />
                <button
                  onClick={() => { setFile(null); setPreview(''); setGrid(null); revokeSwatches(swatches); setSwatches([]); setError(null); }}
                  style={{ position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 10, background: FR.slate, color: FR.salt, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={11} />
                </button>
              </div>
              <div>
                {!busy && (
                  <button onClick={runScan}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 10 }}>
                    <Scan size={14} /> Scan for swatches
                  </button>
                )}
                {busy && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: FR.stone, fontSize: 12 }}>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Reading the card…
                  </div>
                )}
                {error && <div style={{ fontSize: 11, color: '#A32D2D', marginTop: 10, padding: '8px 10px', background: 'rgba(163,45,45,0.07)', borderRadius: 4 }}>{error}</div>}
              </div>
            </div>
          )}

          {/* Edit step — drag the grid */}
          {file && phase === 'edit' && grid && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 18, alignItems: 'flex-start' }}>
              <div style={{ maxHeight: '62vh', overflowY: 'auto', border: `0.5px solid ${FR.sand}`, borderRadius: 4 }}>
                <SwatchGridEditor src={preview} grid={grid} onChange={setGrid} />
              </div>

              <div>
                <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
                  <div>
                    <div style={smallLabel}>Rows (colors)</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button style={stepBtn} onClick={() => setRowCount(R - 1)}><Minus size={12} /></button>
                      <input style={countInput} value={R} onChange={e => setRowCount(Number(e.target.value) || 1)} />
                      <button style={stepBtn} onClick={() => setRowCount(R + 1)}><Plus size={12} /></button>
                    </div>
                  </div>
                  <div>
                    <div style={smallLabel}>Columns (tones)</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button style={stepBtn} onClick={() => setColCount(C - 1)}><Minus size={12} /></button>
                      <input style={countInput} value={C} onChange={e => setColCount(Number(e.target.value) || 1)} />
                      <button style={stepBtn} onClick={() => setColCount(C + 1)}><Plus size={12} /></button>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={smallLabel}>Fabric / label split — {Math.round(grid.cell_fabric_bottom_frac * 100)}% fabric</div>
                  <input
                    type="range" min={0.4} max={1} step={0.01}
                    value={grid.cell_fabric_bottom_frac}
                    onChange={e => patchGrid({ cell_fabric_bottom_frac: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: FR.sienna }}
                  />
                  <div style={{ fontSize: 9, color: FR.stone }}>The shaded strip under each cell (the printed code) is trimmed off.</div>
                </div>

                {/* Column tone headers */}
                <div style={{ marginBottom: 12 }}>
                  <div style={smallLabel}>Column tones</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {grid.columns.map((c, i) => (
                      <input key={i} value={c} onChange={e => setColLabel(i, e.target.value)} placeholder={`Tone ${i + 1}`}
                        style={{ width: 64, fontSize: 10, padding: '3px 5px', border: `0.5px solid ${FR.sand}`, borderRadius: 4, color: FR.slate, background: FR.white, fontFamily: 'inherit' }} />
                    ))}
                  </div>
                </div>

                {/* Row codes (collapsed by default — usually correct from the scan) */}
                <div style={{ marginBottom: 14 }}>
                  <button onClick={() => setEditRows(v => !v)} style={{ ...miniBtn, marginBottom: editRows ? 8 : 0 }}>
                    {editRows ? 'Hide' : 'Edit'} row codes ({R})
                  </button>
                  {editRows && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto', paddingRight: 4 }}>
                      {grid.rows.map((r, i) => (
                        <input key={i} value={r} onChange={e => setRowLabel(i, e.target.value)} placeholder={`Row ${i + 1}`}
                          style={{ fontSize: 10, padding: '3px 6px', border: `0.5px solid ${FR.sand}`, borderRadius: 4, color: FR.slate, background: FR.white, fontFamily: 'inherit' }} />
                      ))}
                    </div>
                  )}
                </div>

                {error && <div style={{ fontSize: 11, color: '#A32D2D', marginBottom: 10, padding: '8px 10px', background: 'rgba(163,45,45,0.07)', borderRadius: 4 }}>{error}</div>}

                <button onClick={cropFromGrid} disabled={busy}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 18px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
                  {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Scan size={14} />}
                  {busy ? 'Cropping…' : `Crop ${R * C} swatches`}
                </button>
                <button onClick={() => { setFile(null); setPreview(''); setGrid(null); setError(null); }}
                  style={{ width: '100%', marginTop: 8, fontSize: 10, color: FR.stone, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  Start over with a different photo
                </button>
              </div>
            </div>
          )}

          {/* Preview step — cropped swatches */}
          {file && phase === 'preview' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: FR.soil, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  {selected.length}/{swatches.length} selected — click to toggle, edit labels
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={selectAll} style={miniBtn}>Select all</button>
                  <button onClick={deselectAll} style={miniBtn}>Deselect all</button>
                  <button onClick={() => setPhase('edit')} style={miniBtn}>← Adjust grid</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 8 }}>
                {swatches.map((s, i) => (
                  <div key={i} style={{ opacity: s.selected ? 1 : 0.35, cursor: 'pointer' }} onClick={() => toggleSwatch(i)}>
                    <div style={{ position: 'relative', borderRadius: 4, overflow: 'hidden', border: `2px solid ${s.selected ? FR.slate : FR.sand}`, marginBottom: 4 }}>
                      <img src={s.blobUrl} alt={s.label} style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }} />
                      {!s.selected && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <X size={18} color={FR.stone} />
                        </div>
                      )}
                    </div>
                    <input
                      value={s.label}
                      onChange={e => { e.stopPropagation(); setLabel(i, e.target.value); }}
                      onClick={e => e.stopPropagation()}
                      style={{ width: '100%', fontSize: 9, border: `0.5px solid ${FR.sand}`, borderRadius: 3, padding: '2px 4px', color: FR.slate, background: FR.white, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 14, borderTop: `0.5px solid ${FR.sand}`, marginTop: 14 }}>
          <button onClick={onClose}
            style={{ padding: '7px 14px', background: 'none', border: `0.5px solid ${FR.sand}`, borderRadius: 6, cursor: 'pointer', fontSize: 11, color: FR.stone }}>
            Cancel
          </button>
          <button
            onClick={() => selected.length && onApply(selected.map(s => ({ label: s.label, blob: s.blob })))}
            disabled={phase !== 'preview' || !selected.length}
            style={{ padding: '7px 18px', background: (phase === 'preview' && selected.length) ? FR.slate : FR.sand, color: FR.salt, border: 'none', borderRadius: 6, cursor: (phase === 'preview' && selected.length) ? 'pointer' : 'default', fontSize: 11, fontWeight: 600 }}>
            Add {phase === 'preview' && selected.length ? selected.length : ''} swatch{selected.length === 1 ? '' : 'es'}
          </button>
        </div>
      </div>
    </div>
  );
}
