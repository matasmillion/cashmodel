// SwatchScanModal — Claude Vision scans a fabric swatch sheet, detects
// individual swatches, crops them from the source image, and returns them
// as uploadable Blobs with labels. The caller (FabricBuilder) uploads and
// appends them to color_card_images.
//
// Flow:
//   1. User drops a single swatch-card photo
//   2. Claude Vision identifies bounding boxes + labels (0-1 fractions)
//   3. Canvas API crops each region from the original image
//   4. Preview grid shows detected swatches — user can deselect any
//   5. "Add X swatches" calls onApply([{ label, blob }])

import { useEffect, useRef, useState } from 'react';
import { Loader2, X, Scan } from 'lucide-react';
import { FR } from './techPackConstants';
import { extractSwatchRegions, fileToMedia, cropRegionFromFile } from '../../utils/aiFabricExtract';

export default function SwatchScanModal({ onClose, onApply }) {
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState(''); // object URL of dropped image
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState(null);
  const [swatches, setSwatches] = useState([]); // [{ label, blob, blobUrl, selected }]
  const fileRef = useRef(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
    swatches.forEach(s => s.blobUrl && URL.revokeObjectURL(s.blobUrl));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onDrop(files) {
    const f = files[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Please drop an image file (JPEG, PNG, WebP).'); return; }
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(f));
    setSwatches([]);
    setError(null);
  }

  async function runScan() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setSwatches([]);
    try {
      const media = await fileToMedia(file);
      const regions = await extractSwatchRegions({ media });
      if (!regions.length) { setError('No swatches detected. Try a clearer photo of a color card.'); setBusy(false); return; }

      // Crop each detected region in parallel
      const cropped = await Promise.all(regions.map(async (r, i) => {
        try {
          const blob = await cropRegionFromFile(file, r);
          if (!blob) return null;
          return { label: r.label || `Color ${String(i + 1).padStart(2, '0')}`, blob, blobUrl: URL.createObjectURL(blob), selected: true };
        } catch { return null; }
      }));
      setSwatches(cropped.filter(Boolean));
    } catch (err) {
      setError(err.message || 'Scan failed');
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
  const miniBtn = { fontSize: 9, color: FR.slate, background: 'none', border: `0.5px solid ${FR.sand}`, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(58,58,58,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: FR.salt, borderRadius: 8, padding: 22, width: 760, maxWidth: '94vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: `0.5px solid rgba(58,58,58,0.15)` }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: FR.slate }}>AI Color Scanner</div>
            <div style={{ fontSize: 11, color: FR.stone, marginTop: 4 }}>
              Drop a swatch sheet photo. Claude Vision detects each color and crops the actual fabric image.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: FR.stone, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Drop zone / source image */}
          {!file ? (
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
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, alignItems: 'flex-start' }}>
              {/* Source image */}
              <div style={{ position: 'relative' }}>
                <img src={preview} alt="Swatch sheet" style={{ width: '100%', borderRadius: 4, border: `0.5px solid ${FR.sand}` }} />
                <button
                  onClick={() => { setFile(null); setPreview(''); setSwatches([]); setError(null); }}
                  style={{ position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 10, background: FR.slate, color: FR.salt, border: 'none', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                  <X size={11} />
                </button>
              </div>

              {/* Scan action + results */}
              <div>
                {!swatches.length && !busy && (
                  <button onClick={runScan}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 10 }}>
                    <Scan size={14} /> Scan for swatches
                  </button>
                )}
                {busy && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: FR.stone, fontSize: 12, marginBottom: 10 }}>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Scanning…
                  </div>
                )}
                {error && <div style={{ fontSize: 11, color: '#A32D2D', marginBottom: 10, padding: '8px 10px', background: 'rgba(163,45,45,0.07)', borderRadius: 4 }}>{error}</div>}

                {swatches.length > 0 && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: FR.soil, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                        {selected.length}/{swatches.length} selected — click to toggle, edit labels
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={selectAll} style={miniBtn}>Select all</button>
                        <button onClick={deselectAll} style={miniBtn}>Deselect all</button>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 8, marginBottom: 12 }}>
                      {swatches.map((s, i) => (
                        <div key={i} style={{ opacity: s.selected ? 1 : 0.35, cursor: 'pointer' }}
                          onClick={() => toggleSwatch(i)}>
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
                    <button onClick={runScan} style={{ fontSize: 10, color: FR.stone, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, marginBottom: 4 }}>
                      Re-scan
                    </button>
                  </>
                )}
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
            disabled={!selected.length}
            style={{ padding: '7px 18px', background: selected.length ? FR.slate : FR.sand, color: FR.salt, border: 'none', borderRadius: 6, cursor: selected.length ? 'pointer' : 'default', fontSize: 11, fontWeight: 600 }}>
            Add {selected.length || ''} swatch{selected.length === 1 ? '' : 'es'}
          </button>
        </div>
      </div>
    </div>
  );
}
