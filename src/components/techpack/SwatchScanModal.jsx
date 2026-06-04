// SwatchScanModal — Claude Vision predetermines one crop box per fabric
// swatch, the operator fine-tunes any box that's off, then the modal crops
// every box from the source image and returns them as uploadable Blobs with
// labels. The caller (FabricBuilder) uploads and appends them to
// color_card_images.
//
// Flow:
//   1. Drop a single swatch-card photo
//   2. "Scan" — Claude Vision returns a box per swatch ({label,x,y,w,h}).
//      The model is reliable on the labels but not always pixel-accurate on
//      edges, so the boxes are a starting point, not the final word.
//   3. Edit — operator drags/resizes any box that's off, adds a missing one,
//      removes a spurious one (SwatchBoxEditor). Every box is independent.
//   4. Crop — canvas-crop each box from the source image
//   5. Preview — deselect any, edit labels, "Add X swatches"

import { useEffect, useRef, useState } from 'react';
import { Loader2, X, Scan, Plus, Trash2 } from 'lucide-react';
import { FR } from './techPackConstants';
import { extractSwatchGrid, gridToRegions, extractSwatchesFromImage, fileToMedia, cropRegionFromFile, readSwatchLabels } from '../../utils/aiFabricExtract';
import SwatchBoxEditor from './SwatchBoxEditor';

const clamp01 = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
};

// Coerce a model region into a safe in-bounds box. Pass 1 estimates shape
// only — the label is left blank and read off the finalized crop in Pass 2.
function normalizeBox(r) {
  const x = clamp01(r?.x, 0);
  const y = clamp01(r?.y, 0);
  const w = Math.min(clamp01(r?.w, 0.1) || 0.1, 1 - x);
  const h = Math.min(clamp01(r?.h, 0.1) || 0.1, 1 - y);
  return { label: '', x, y, w, h };
}

export default function SwatchScanModal({ onClose, onApply }) {
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState(''); // object URL of dropped image
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState(null);
  const [phase, setPhase]       = useState('drop'); // drop | edit | preview
  const [boxes, setBoxes]       = useState([]);     // [{ label, x, y, w, h }]
  const [selected, setSelected] = useState(null);   // index | null
  const [swatches, setSwatches] = useState([]);     // [{ label, blob, blobUrl, selected }]
  const [progress, setProgress] = useState(null);   // { done, total } during Pass-2 OCR
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
    setBoxes([]);
    setSelected(null);
    setPhase('drop');
    setError(null);
  }

  // Pass 1 — estimate how many swatches there are and a rough box for each.
  // Boxes cover the full cell (fabric + the printed code beneath it) so the
  // operator can keep the code inside the crop and Pass 2 can read it back.
  // Labels are intentionally left blank here. If detection fails the operator
  // still lands in the editor and can box the card by hand.
  async function runScan() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const media = await fileToMedia(file);
      let regions = [];
      try {
        const grid = await extractSwatchGrid({ media });
        if (grid && grid.is_regular_grid && Array.isArray(grid.rows) && grid.rows.length) {
          regions = gridToRegions({
            grid: grid.grid, rows: grid.rows, columns: grid.columns,
            cell_fabric_top_frac: 0, cell_fabric_bottom_frac: 1,
          });
        }
      } catch { /* fall through to per-box detection */ }
      if (!regions.length) {
        try {
          const detected = await extractSwatchesFromImage({ media });
          // That detector trims to the fabric square; grow each box back down
          // to include the printed code so Pass 2 can read it.
          regions = detected.map(r => ({ ...r, h: Math.min((r.h || 0.1) / 0.72, 1 - (r.y || 0)) }));
        } catch (err) {
          setError(`${err.message || 'Auto-detect failed'} — add the boxes manually below.`);
        }
      }
      setBoxes((Array.isArray(regions) ? regions : []).map(normalizeBox));
      setSelected(null);
      setPhase('edit');
    } catch (err) {
      setError(err.message || 'Scan failed');
    } finally {
      setBusy(false);
    }
  }

  function addBox() {
    const nb = { label: `Color ${String(boxes.length + 1).padStart(2, '0')}`, x: 0.44, y: 0.44, w: 0.12, h: 0.1 };
    setBoxes(prev => [...prev, nb]);
    setSelected(boxes.length);
  }
  function removeSelected() {
    if (selected == null) return;
    setBoxes(prev => prev.filter((_, i) => i !== selected));
    setSelected(null);
  }

  // Crop every box exactly, then Pass 2 — read the printed code off each crop
  // to name it. OCR failures degrade to a numbered placeholder; the operator
  // can fix any name in the preview step.
  async function cropFromBoxes() {
    if (!file || !boxes.length) { setError('Add at least one swatch box.'); return; }
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const cropped = await Promise.all(boxes.map(async (b) => {
        try {
          const blob = await cropRegionFromFile(file, b);
          return blob ? { blob, blobUrl: URL.createObjectURL(blob) } : null;
        } catch { return null; }
      }));
      const valid = cropped.filter(Boolean);
      if (!valid.length) { setError('No crops produced — check the boxes cover fabric.'); setBusy(false); return; }

      setProgress({ done: 0, total: valid.length });
      let labels = [];
      try {
        labels = await readSwatchLabels(valid.map(c => c.blob), { onProgress: (done, total) => setProgress({ done, total }) });
      } catch { labels = []; }

      revokeSwatches(swatches);
      setSwatches(valid.map((c, i) => ({
        label: labels[i] || `Color ${String(i + 1).padStart(2, '0')}`,
        blob: c.blob, blobUrl: c.blobUrl, selected: true,
      })));
      setPhase('preview');
    } catch (err) {
      setError(err.message || 'Cropping failed');
    } finally {
      setBusy(false);
      setProgress(null);
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

  const chosen = swatches.filter(s => s.selected);
  const N = boxes.length;

  const miniBtn    = { fontSize: 9, color: FR.slate, background: 'none', border: `0.5px solid ${FR.sand}`, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' };
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
                ? 'Claude estimated the swatch boxes. Drag/resize so each covers a swatch and its printed code, then submit — the names are read from your crops.'
                : 'Drop a swatch sheet photo. Claude estimates the swatch boxes; you crop each exactly; the names are read back from your crops.'}
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

          {/* Scan step — image + scan button before boxes exist */}
          {file && phase === 'drop' && (
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ position: 'relative' }}>
                <img src={preview} alt="Swatch sheet" style={{ width: '100%', borderRadius: 4, border: `0.5px solid ${FR.sand}` }} />
                <button
                  onClick={() => { setFile(null); setPreview(''); setBoxes([]); setSelected(null); revokeSwatches(swatches); setSwatches([]); setError(null); }}
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

          {/* Edit step — adjust the per-swatch boxes */}
          {file && phase === 'edit' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 18, alignItems: 'flex-start' }}>
              <div style={{ maxHeight: '64vh', overflowY: 'auto', border: `0.5px solid ${FR.sand}`, borderRadius: 4 }}>
                <SwatchBoxEditor src={preview} boxes={boxes} selected={selected} onSelect={setSelected} onChange={setBoxes} />
              </div>

              <div>
                <div style={{ fontSize: 13, color: FR.slate, fontWeight: 600, marginBottom: 2 }}>{N} swatch{N === 1 ? '' : 'es'} detected</div>
                <div style={{ fontSize: 10, color: FR.stone, marginBottom: 12, lineHeight: 1.5 }}>
                  Drag a box to move, a corner to resize. Keep each swatch&apos;s printed code inside its box — names are read from the crops when you submit.
                </div>

                {/* Selected box — remove only (names come from Pass 2, editable in preview) */}
                <div style={{ marginBottom: 12, padding: 10, background: FR.white, border: `0.5px solid ${FR.sand}`, borderRadius: 6 }}>
                  <div style={smallLabel}>Selected swatch</div>
                  {selected == null ? (
                    <div style={{ fontSize: 10, color: FR.stone }}>Click a box on the card to select it.</div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 11, color: FR.slate }}>Box {selected + 1} of {N}</div>
                      <button onClick={removeSelected}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#A32D2D', background: 'none', border: `0.5px solid rgba(163,45,45,0.3)`, borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <Trash2 size={11} /> Remove
                      </button>
                    </div>
                  )}
                </div>

                <button onClick={addBox}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center', fontSize: 11, color: FR.slate, background: FR.white, border: `0.5px solid ${FR.sand}`, borderRadius: 6, padding: '7px 10px', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 14 }}>
                  <Plus size={13} /> Add a box
                </button>

                {error && <div style={{ fontSize: 11, color: '#A32D2D', marginBottom: 10, padding: '8px 10px', background: 'rgba(163,45,45,0.07)', borderRadius: 4 }}>{error}</div>}

                <button onClick={cropFromBoxes} disabled={busy || !N}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 18px', background: (busy || !N) ? FR.sand : FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: (busy || !N) ? 'default' : 'pointer' }}>
                  {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Scan size={14} />}
                  {busy ? (progress ? `Reading names ${progress.done}/${progress.total}…` : 'Cropping…') : `Crop & read ${N} swatch${N === 1 ? '' : 'es'}`}
                </button>
                <button onClick={() => { setFile(null); setPreview(''); setBoxes([]); setSelected(null); setError(null); }}
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
                  {chosen.length}/{swatches.length} selected — click to toggle, edit labels
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={selectAll} style={miniBtn}>Select all</button>
                  <button onClick={deselectAll} style={miniBtn}>Deselect all</button>
                  <button onClick={() => setPhase('edit')} style={miniBtn}>← Adjust boxes</button>
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
            onClick={() => chosen.length && onApply(chosen.map(s => ({ label: s.label, blob: s.blob })))}
            disabled={phase !== 'preview' || !chosen.length}
            style={{ padding: '7px 18px', background: (phase === 'preview' && chosen.length) ? FR.slate : FR.sand, color: FR.salt, border: 'none', borderRadius: 6, cursor: (phase === 'preview' && chosen.length) ? 'pointer' : 'default', fontSize: 11, fontWeight: 600 }}>
            Add {phase === 'preview' && chosen.length ? chosen.length : ''} swatch{chosen.length === 1 ? '' : 'es'}
          </button>
        </div>
      </div>
    </div>
  );
}
