// Reusable UI primitives for the Tech Pack builder — ported from the original artifact
import { useState, useRef } from 'react';
import { FR, FR_COLOR_OPTIONS, resizeImage } from './techPackConstants';
import { listFRColors } from '../../utils/colorLibrary';
import { autoCropDataUrl } from '../../utils/autoCrop';
import { fileToDataUrl } from '../../utils/cropImage';
import CropModal from './CropModal';

// Aspect-ratio presets for the trim pack. Ratio is width/height.
//   A4 landscape → technical drawings that will be exported from Illustrator.
//   2:3 portrait → photos (product shots, swatches, references, renders).
export const ASPECTS = {
  A4_LANDSCAPE:   { ratio: 297 / 210, label: 'A4 · 297 × 210 mm',      shortLabel: 'A4 landscape' },
  TWO_THIRDS:     { ratio: 2 / 3,     label: '2:3 · portrait photo',    shortLabel: '2:3 portrait' },
  LANDSCAPE_3_2:  { ratio: 3 / 2,     label: '3:2 · landscape reference', shortLabel: '3:2 landscape' },
};

export const labelStyle = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 3, letterSpacing: 0.5, textTransform: 'uppercase' };
export const inputBase = { width: '100%', padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 3, fontFamily: "'Helvetica Neue', sans-serif", fontSize: 13, color: FR.slate, background: FR.white, outline: 'none', boxSizing: 'border-box' };

// Format a raw cost string (what we store in libraries) into a short display
// string like "$0.00" or "CNY 12.50". USD is special-cased to the $ glyph;
// other currencies use their 3-letter code as a prefix so the user can tell
// what unit they're looking at.
export function formatCost(amount, currency = 'USD') {
  const n = parseFloat(amount);
  const val = Number.isFinite(n) ? n : 0;
  if (currency === 'USD') return `$${val.toFixed(2)}`;
  return `${currency} ${val.toFixed(2)}`;
}

// Tiny dark pill used in the top-right of every modular PLM card (color,
// vendor, trim, style) to anchor the unit cost. Zero costs render too —
// the whole point of the PLM cash model is that every line has a number.
export function CostPill({ amount, currency = 'USD', title, style: override }) {
  return (
    <span title={title || `Unit cost: ${formatCost(amount, currency)}`}
      style={{
        display: 'inline-flex', alignItems: 'center', padding: '3px 10px',
        background: FR.slate, color: FR.salt, borderRadius: 12,
        fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
        fontFamily: "'Helvetica Neue','Inter',sans-serif", whiteSpace: 'nowrap',
        ...override,
      }}>
      {formatCost(amount, currency)}
    </span>
  );
}

export function Input({ label, value, onChange, placeholder, multiline }) {
  const props = { value, onChange: e => onChange(e.target.value), placeholder, style: inputBase, onFocus: e => e.target.style.borderColor = FR.soil, onBlur: e => e.target.style.borderColor = FR.sand };
  return (
    <div style={{ marginBottom: 10 }}>
      {label && <label style={labelStyle}>{label}</label>}
      {multiline
        ? <textarea {...props} rows={4} style={{ ...inputBase, resize: 'vertical', minHeight: 60 }} />
        : <input {...props} />}
    </div>
  );
}

export function Select({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 10 }}>
      {label && <label style={labelStyle}>{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)} style={inputBase}>
        <option value="">Select...</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

export function Row({ children, cols }) {
  return <div style={{ display: 'grid', gridTemplateColumns: cols || '1fr 1fr', gap: 12 }}>{children}</div>;
}

export function SectionTitle({ children }) {
  return (
    <div style={{ marginBottom: 16, marginTop: 8 }}>
      <h3 style={{ fontFamily: "'Cormorant Garamond','Georgia',serif", fontSize: 20, fontWeight: 400, color: FR.slate, margin: 0, marginBottom: 4 }}>{children}</h3>
      <div style={{ width: 50, height: 2, background: FR.soil }} />
    </div>
  );
}

export function ArrayTable({ headers, rows, onUpdate, onAdd, onRemove }) {
  return (
    <div style={{ marginBottom: 12, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h.key} style={{ textAlign: 'left', padding: '5px 6px', background: FR.slate, color: FR.salt, fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                {h.label}
              </th>
            ))}
            <th style={{ width: 30, background: FR.slate }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? FR.salt : FR.white }}>
              {headers.map(h => (
                <td key={h.key} style={{ padding: '3px 4px', borderBottom: `1px solid ${FR.sand}` }}>
                  {h.render
                    ? h.render(row[h.key], v => onUpdate(ri, h.key, v), row)
                    : <input value={row[h.key] || ''} onChange={e => onUpdate(ri, h.key, e.target.value)} placeholder={h.placeholder || ''}
                        style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '3px 2px', color: FR.slate, outline: 'none', fontFamily: "'Helvetica Neue',sans-serif", boxSizing: 'border-box' }} />}
                </td>
              ))}
              <td style={{ padding: 3, borderBottom: `1px solid ${FR.sand}`, textAlign: 'center' }}>
                {rows.length > 1 && (
                  <button onClick={() => onRemove(ri)} style={{ background: 'none', border: 'none', color: FR.stone, cursor: 'pointer', fontSize: 13 }}>×</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={onAdd} style={{ marginTop: 6, padding: '4px 12px', background: 'none', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 10, color: FR.soil, cursor: 'pointer' }}>+ Add Row</button>
    </div>
  );
}

export function PhotoUpload({ label, slotKey, images, onUpload, onRemove }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const handleFiles = async (files) => {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      onUpload(slotKey, await resizeImage(f), f.name);
    }
  };
  const slotImages = (images || []).filter(img => img.slot === slotKey);
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <div onClick={() => fileRef.current?.click()}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        style={{ border: `2px dashed ${dragging ? FR.soil : FR.sand}`, borderRadius: 6, padding: slotImages.length ? 10 : 24, textAlign: 'center', cursor: 'pointer', background: dragging ? FR.sand : FR.white, transition: 'all 0.2s', minHeight: 50 }}>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={e => { if (e.target.files.length) handleFiles(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />
        {slotImages.length === 0 ? (
          <>
            <div style={{ fontSize: 20, color: FR.sand }}>+</div>
            <div style={{ fontSize: 11, color: FR.stone }}>Click or drag photos here</div>
            <div style={{ fontSize: 9, color: FR.sand, marginTop: 2 }}>JPG, PNG — auto-resized</div>
          </>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {slotImages.map((img, i) => (
              <div key={i} style={{ position: 'relative', width: 100, height: 100, borderRadius: 4, overflow: 'hidden', border: `1px solid ${FR.sand}` }}>
                <img src={img.data} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button onClick={e => { e.stopPropagation(); onRemove(slotKey, i); }}
                  style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: 9, background: FR.slate, color: FR.salt, border: 'none', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(58,58,58,0.7)', padding: '2px 4px', fontSize: 8, color: FR.salt, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.name || `Photo ${i + 1}`}</div>
              </div>
            ))}
            <div style={{ width: 100, height: 100, borderRadius: 4, border: `2px dashed ${FR.sand}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: FR.stone, fontSize: 24 }}>+</div>
          </div>
        )}
      </div>
    </div>
  );
}

// CoverPhoto — single-image drop zone used as the "hero" reference card on
// the first step of each builder. Upload replaces the existing photo in the
// slot so there's only ever one cover. Auto-crop tightens the photo to the
// bounding box of the subject (background sampled from corners).
export function CoverPhoto({ label, slotKey, images, onUpload, onRemove, height = 240, autoCropOnUpload = true }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [cropping, setCropping] = useState(false);
  const slotImages = (images || []).filter(img => img.slot === slotKey);
  const current = slotImages[0];

  const handleFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (current) onRemove(slotKey, 0);
    let dataUrl = await resizeImage(file);
    if (autoCropOnUpload) {
      try { dataUrl = await autoCropDataUrl(dataUrl); } catch (e) { /* keep original */ }
    }
    onUpload(slotKey, dataUrl, file.name);
  };

  const handleAutoCropExisting = async () => {
    if (!current || cropping) return;
    setCropping(true);
    try {
      const cropped = await autoCropDataUrl(current.data);
      if (cropped !== current.data) {
        onRemove(slotKey, 0);
        onUpload(slotKey, cropped, current.name);
      }
    } finally {
      setCropping(false);
    }
  };

  return (
    <div style={{ marginBottom: 18 }}>
      {label && <label style={labelStyle}>{label}</label>}
      <div onClick={() => fileRef.current?.click()}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        style={{
          position: 'relative',
          border: `2px dashed ${dragging ? FR.soil : FR.sand}`,
          borderRadius: 8,
          height,
          cursor: 'pointer',
          background: current ? 'transparent' : (dragging ? FR.sand : FR.salt),
          transition: 'all 0.2s',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <input ref={fileRef} type="file" accept="image/*"
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ''; }}
          style={{ display: 'none' }} />
        {current ? (
          <>
            <img src={current.data} alt={current.name || 'Cover'}
              style={{ width: '100%', height: '100%', objectFit: 'contain', background: FR.white }} />
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
              <button onClick={e => { e.stopPropagation(); handleAutoCropExisting(); }} disabled={cropping}
                title="Auto-crop to subject"
                style={{ padding: '4px 10px', borderRadius: 12, background: FR.soil, color: FR.salt, border: 'none', fontSize: 10, cursor: cropping ? 'wait' : 'pointer', fontWeight: 600, letterSpacing: 0.3 }}>
                {cropping ? 'Cropping…' : 'Auto-crop'}
              </button>
              <button onClick={e => { e.stopPropagation(); onRemove(slotKey, 0); }}
                title="Remove"
                style={{ width: 24, height: 24, borderRadius: 12, background: FR.slate, color: FR.salt, border: 'none', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(58,58,58,0.75)', padding: '4px 10px', fontSize: 10, color: FR.salt }}>
              {current.name || 'Cover image'} · click or drop a new file to replace
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, color: FR.sand, lineHeight: 1 }}>+</div>
            <div style={{ fontSize: 12, color: FR.stone, marginTop: 6 }}>Click or drop the product render here</div>
            <div style={{ fontSize: 10, color: FR.sand, marginTop: 3 }}>Auto-cropped to the subject · becomes the cover card on the list view</div>
          </div>
        )}
      </div>
    </div>
  );
}

// AspectPhoto — image upload slot locked to an exact aspect ratio. On
// upload, the raw image is shown in a full-screen crop modal so the user
// can drag + zoom to position. The saved crop matches the slot's aspect
// exactly; re-clicking "Recrop" reopens the modal with the stored image.
//
// `aspect` is an entry from ASPECTS (with .ratio and .label). Container
// width × (1 / ratio) gives the slot height so the drop zone matches the
// output proportion exactly.
export function AspectPhoto({ slotKey, aspect = ASPECTS.A4_LANDSCAPE, images, onUpload, onRemove, label }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);
  const slotImages = (images || []).filter(img => img.slot === slotKey);
  const current = slotImages[0];

  const openCropFor = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const rawUrl = await fileToDataUrl(file);
    setCropSrc(rawUrl);
  };

  const recropCurrent = () => {
    if (current) setCropSrc(current.data);
  };

  const saveCropped = (dataUrl) => {
    if (current) onRemove(slotKey, 0);
    onUpload(slotKey, dataUrl, current?.name || 'cropped.jpg');
    setCropSrc(null);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={labelStyle}>{label}</label>}
      <div
        onClick={() => fileRef.current?.click()}
        onDrop={e => { e.preventDefault(); setDragging(false); openCropFor(e.dataTransfer.files?.[0]); }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: String(aspect.ratio),
          border: `2px dashed ${dragging ? FR.soil : FR.sand}`,
          borderRadius: 6,
          cursor: 'pointer',
          background: current ? FR.white : (dragging ? FR.sand : FR.salt),
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
        }}>
        <input ref={fileRef} type="file" accept="image/*"
          onChange={e => { if (e.target.files?.[0]) openCropFor(e.target.files[0]); e.target.value = ''; }}
          style={{ display: 'none' }} />

        {current ? (
          <>
            <img src={current.data} alt={current.name || slotKey}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
              <button onClick={e => { e.stopPropagation(); recropCurrent(); }}
                title="Recrop"
                style={{ padding: '4px 10px', borderRadius: 12, background: FR.soil, color: FR.salt, border: 'none', fontSize: 10, cursor: 'pointer', fontWeight: 600, letterSpacing: 0.3 }}>
                Recrop
              </button>
              <button onClick={e => { e.stopPropagation(); onRemove(slotKey, 0); }}
                title="Remove"
                style={{ width: 24, height: 24, borderRadius: 12, background: FR.slate, color: FR.salt, border: 'none', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(58,58,58,0.7)', padding: '4px 10px', fontSize: 10, color: FR.salt, display: 'flex', justifyContent: 'space-between' }}>
              <span>{current.name || 'Cropped image'}</span>
              <span>{aspect.shortLabel}</span>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <div style={{ fontSize: 28, color: FR.sand, lineHeight: 1 }}>＋</div>
            <div style={{ fontSize: 12, color: FR.stone, marginTop: 8 }}>
              Drop {aspect.shortLabel} image here
            </div>
            <div style={{ fontSize: 10, color: FR.sand, marginTop: 4 }}>
              {aspect.label}
            </div>
          </div>
        )}
      </div>

      {cropSrc && (
        <CropModal
          src={cropSrc}
          aspect={aspect.ratio}
          label={`${aspect.shortLabel} · drag to position · scroll or slider to zoom`}
          onCancel={() => setCropSrc(null)}
          onConfirm={saveCropped} />
      )}
    </div>
  );
}

export function LibraryPicker({ category, library, onSelect, buttonLabel }) {
  const [open, setOpen] = useState(false);
  const items = library[category] || [];
  if (items.length === 0) return null;
  return (
    <div style={{ position: 'relative', display: 'inline-block', marginBottom: 8 }}>
      <button onClick={() => setOpen(!open)} style={{ padding: '4px 10px', background: FR.white, border: `1px solid ${FR.soil}`, borderRadius: 3, fontSize: 10, color: FR.soil, cursor: 'pointer' }}>
        {buttonLabel || `★ Pick from Library (${items.length})`}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: FR.white, border: `1px solid ${FR.sand}`, borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto', minWidth: 280, marginTop: 4 }}>
          {items.map((item, i) => (
            <button key={i} onClick={() => { onSelect(item); setOpen(false); }}
              style={{ display: 'block', width: '100%', padding: '8px 12px', border: 'none', borderBottom: `1px solid ${FR.sand}`, background: i % 2 === 0 ? FR.salt : FR.white, cursor: 'pointer', textAlign: 'left', fontSize: 11, color: FR.slate }}>
              <strong>{item.component || item.name || item.labelType}</strong>
              <span style={{ color: FR.stone, marginLeft: 6 }}>
                {item.type || item.fabric || ''}
                {item.material ? ` · ${item.material}` : ''}
                {item.color ? ` · ${item.color}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// EditableSelect — dropdown with a saved library of options + ability to add new values
// `options` is the full list of saved options (strings). `onAddOption(value)` persists new ones.
export function EditableSelect({ label, value, onChange, options = [], onAddOption, placeholder = 'Type new value…' }) {
  const [mode, setMode] = useState('select'); // 'select' | 'add'
  const [newValue, setNewValue] = useState('');

  const handleChange = (v) => {
    if (v === '__add__') {
      setMode('add');
      setNewValue('');
    } else {
      onChange(v);
    }
  };

  const commitAdd = () => {
    const val = newValue.trim();
    if (!val) { setMode('select'); return; }
    onChange(val);
    if (onAddOption && !options.includes(val)) onAddOption(val);
    setMode('select');
    setNewValue('');
  };

  const allOptions = [...new Set([...(options || []), ...(value ? [value] : [])])];

  return (
    <div style={{ marginBottom: 10 }}>
      {label && <label style={labelStyle}>{label}</label>}
      {mode === 'add' ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input autoFocus value={newValue} onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') setMode('select'); }}
            placeholder={placeholder} style={inputBase} />
          <button onClick={commitAdd} style={{ padding: '6px 12px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 11, cursor: 'pointer' }}>Save</button>
          <button onClick={() => setMode('select')} style={{ padding: '6px 12px', background: 'none', color: FR.stone, border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
        </div>
      ) : (
        <select value={value || ''} onChange={e => handleChange(e.target.value)} style={inputBase}>
          <option value="">Select…</option>
          {allOptions.map(o => <option key={o} value={o}>{o}</option>)}
          <option value="__add__">+ Add new…</option>
        </select>
      )}
    </div>
  );
}

export function FRColorCell({ value, onChange }) {
  // Live-read the library so custom colors added on the PLM → Colors tab
  // show up in every picker across the app without needing a page refresh.
  const all = listFRColors();
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '3px 0', color: FR.slate, fontFamily: "'Helvetica Neue',sans-serif" }}>
      <option value="">Select color...</option>
      {all.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
    </select>
  );
}
