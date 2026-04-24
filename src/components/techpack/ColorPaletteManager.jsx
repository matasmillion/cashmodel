// PLM Color Palette Manager — the single source of truth for FR brand colors.
// Renders a grid of color cards; click one to open an editor modal with
// Pantone TCX/TPG/C, hex, RGB, and a Pantone TCX card image slot. All edits
// flow through the color library (src/utils/colorLibrary.js) and propagate
// to every tech pack and trim pack that references the color by name.

import { useState, useEffect, useRef } from 'react';
import { X, Upload, Plus, Trash2 } from 'lucide-react';
import { FR } from './techPackConstants';
import { Input, Row, labelStyle, inputBase } from './TechPackPrimitives';
import { listFRColors, getFRColor, updateFRColor, clearFRColorField, addFRColor, deleteFRColor, isSeededFRColor } from '../../utils/colorLibrary';
import { fileToDataUrl } from '../../utils/cropImage';

// Pick a readable text color for overlay on a hex swatch.
function contrastColor(hex) {
  if (!hex || typeof hex !== 'string') return FR.slate;
  const m = hex.replace('#', '').trim();
  if (m.length !== 6) return FR.slate;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  if (Number.isNaN(r + g + b)) return FR.slate;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? FR.slate : FR.salt;
}

export default function ColorPaletteManager() {
  const [colors, setColors] = useState([]);
  const [activeName, setActiveName] = useState(null);
  const [adding, setAdding] = useState(false);

  const refresh = () => setColors(listFRColors());
  useEffect(() => { refresh(); }, []);

  const handleClose = (openName) => {
    setActiveName(null);
    refresh();
    // After adding a new color we open its editor right away so the user
    // can enter Pantone/hex details while the intent is still fresh.
    if (openName) setActiveName(openName);
  };

  const handleAdd = (name, hex) => {
    const res = addFRColor(name, { hex });
    if (!res.ok) {
      alert(res.reason);
      return false;
    }
    setAdding(false);
    refresh();
    setActiveName(name);
    return true;
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
        <div>
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, margin: 0 }}>Brand Color Palette</h3>
          <p style={{ color: FR.stone, fontSize: 12, margin: '4px 0 0' }}>
            One source of truth. Edits here propagate to every tech pack and trim pack.
          </p>
        </div>
        <button onClick={() => setAdding(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <Plus size={12} /> Add color
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
        {colors.map(c => (
          <ColorCard key={c.name} color={c} onClick={() => setActiveName(c.name)} />
        ))}
      </div>

      {adding && <AddColorForm onCancel={() => setAdding(false)} onSubmit={handleAdd} />}
      {activeName && <ColorEditor name={activeName} onClose={() => handleClose()} onDeleted={() => handleClose()} />}
    </div>
  );
}

// Inline add-new-color modal. Asks for a unique name + optional starting
// hex; Pantone codes, RGB, and the TCX card image are filled in inside
// the regular editor after the color is created.
function AddColorForm({ onCancel, onSubmit }) {
  const [name, setName] = useState('');
  const [hex, setHex] = useState('');

  const submit = (e) => {
    e.preventDefault();
    onSubmit(name, hex);
  };

  return (
    <div role="dialog"
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit}
        style={{ background: FR.white, borderRadius: 10, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ background: FR.slate, color: FR.salt, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 3, fontWeight: 600, opacity: 0.8 }}>NEW FR COLOR</div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, marginTop: 2 }}>Add to palette</div>
          </div>
          <button type="button" onClick={onCancel} aria-label="Cancel"
            style={{ padding: 6, background: 'rgba(255,255,255,0.1)', color: FR.salt, border: 'none', borderRadius: 3, cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: '18px 20px' }}>
          <Input label="Name" value={name} onChange={setName} placeholder="e.g. Bone, Moss, Rust…" />
          <Input label="Starting Hex (optional)" value={hex} onChange={setHex} placeholder="#AABBCC" />
          <p style={{ fontSize: 11, color: FR.stone, marginTop: 4 }}>
            Pantone codes, RGB, and a TCX card image can be added right after.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button type="button" onClick={onCancel}
              style={{ padding: '6px 14px', background: 'transparent', color: FR.stone, border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 11, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit"
              style={{ padding: '6px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              Create color
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ColorCard({ color, onClick }) {
  const c = color;
  const textColor = contrastColor(c.hex);
  return (
    <div onClick={onClick}
      style={{ cursor: 'pointer', border: `1px solid ${FR.sand}`, borderRadius: 8, overflow: 'hidden', background: FR.white, transition: 'box-shadow 0.15s, transform 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}>
      <div style={{ background: c.hex || FR.salt, height: 110, position: 'relative' }}>
        <div style={{ position: 'absolute', bottom: 10, left: 12, color: textColor, fontFamily: "'Cormorant Garamond', serif", fontSize: 22, lineHeight: 1 }}>
          {c.name}
        </div>
        {c.cardImage && (
          <img src={c.cardImage} alt={`${c.name} TCX card`}
            style={{ position: 'absolute', top: 8, right: 8, width: 34, height: 52, objectFit: 'cover', border: `1px solid rgba(255,255,255,0.4)`, borderRadius: 2 }} />
        )}
      </div>
      <div style={{ padding: '10px 12px', fontSize: 10, color: FR.stone, lineHeight: 1.75 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: FR.soil, fontWeight: 600, letterSpacing: 0.5 }}>TCX</span>
          <span style={{ color: FR.slate, fontVariantNumeric: 'tabular-nums' }}>{c.pantoneTCX || '—'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: FR.soil, fontWeight: 600, letterSpacing: 0.5 }}>TPG</span>
          <span style={{ color: FR.slate, fontVariantNumeric: 'tabular-nums' }}>{c.pantoneTPG || '—'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: FR.soil, fontWeight: 600, letterSpacing: 0.5 }}>HEX</span>
          <span style={{ color: FR.slate, fontFamily: 'monospace' }}>{c.hex || '—'}</span>
        </div>
      </div>
    </div>
  );
}

function ColorEditor({ name, onClose, onDeleted }) {
  const [entry, setEntry] = useState(() => getFRColor(name) || { name });
  const fileRef = useRef(null);
  const seeded = isSeededFRColor(name);

  const handleDelete = () => {
    if (seeded) return;
    if (!window.confirm(`Delete “${name}” from the palette? This cannot be undone, but packs that reference it will keep the name as a plain text value.`)) return;
    const res = deleteFRColor(name);
    if (!res.ok) {
      alert(res.reason);
      return;
    }
    if (onDeleted) onDeleted();
    else onClose();
  };

  const patch = (k, v) => {
    const next = { ...entry, [k]: v };
    setEntry(next);
    // updateFRColor ignores empty strings, so a clear has to go through
    // clearFRColorField. For typical edits just write.
    if (v) updateFRColor(name, { [k]: v });
  };

  const uploadCard = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const dataUri = await fileToDataUrl(file);
    updateFRColor(name, { cardImage: dataUri });
    setEntry(getFRColor(name));
  };

  const removeCard = () => {
    clearFRColorField(name, 'cardImage');
    setEntry(getFRColor(name));
  };

  const seededHex = entry.hex || '';
  const textColor = contrastColor(seededHex);

  return (
    <div role="dialog"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: FR.white, borderRadius: 10, width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ background: seededHex || FR.slate, padding: '18px 22px', color: textColor, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 3, fontWeight: 600, opacity: 0.8 }}>FR BRAND COLOR</div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 26, lineHeight: 1, marginTop: 4 }}>{name}</div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ padding: 6, background: 'rgba(0,0,0,0.12)', color: textColor, border: 'none', borderRadius: 3, cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: '18px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 20 }}>
            <div>
              <Input label="Pantone TCX" value={entry.pantoneTCX || ''} onChange={v => patch('pantoneTCX', v)} placeholder="e.g. 19-4305 TCX" />
              <Input label="Pantone TPG" value={entry.pantoneTPG || ''} onChange={v => patch('pantoneTPG', v)} placeholder="e.g. 19-4305 TPG" />
              <Input label="Pantone C"   value={entry.pantoneC   || ''} onChange={v => patch('pantoneC',   v)} placeholder="e.g. 19-4305 C" />
              <Row>
                <Input label="Hex" value={entry.hex || ''} onChange={v => patch('hex', v)} placeholder="#3A3A3A" />
                <Input label="RGB" value={entry.rgb || ''} onChange={v => patch('rgb', v)} placeholder="58, 58, 58" />
              </Row>
            </div>

            <div>
              <label style={labelStyle}>Pantone TCX Card</label>
              <div onClick={() => fileRef.current?.click()}
                style={{ position: 'relative', width: '100%', aspectRatio: '2 / 3', border: `1px dashed ${FR.sand}`, borderRadius: 4, background: entry.cardImage ? 'transparent' : FR.salt, cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <input ref={fileRef} type="file" accept="image/*"
                  onChange={e => { if (e.target.files?.[0]) uploadCard(e.target.files[0]); e.target.value = ''; }}
                  style={{ display: 'none' }} />
                {entry.cardImage ? (
                  <>
                    <img src={entry.cardImage} alt={`${name} TCX card`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button onClick={e => { e.stopPropagation(); removeCard(); }}
                      style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, background: FR.slate, color: FR.salt, border: 'none', fontSize: 11, cursor: 'pointer' }}>×</button>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', fontSize: 10, color: FR.stone, padding: 10 }}>
                    <Upload size={18} style={{ color: FR.sand }} />
                    <div style={{ marginTop: 6 }}>Upload TCX card</div>
                    <div style={{ fontSize: 9, color: FR.sand, marginTop: 2 }}>Shared with every pack</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${FR.sand}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 10, color: FR.stone, fontStyle: 'italic' }}>
              Saved automatically. Changes appear on every tech pack and trim pack using <strong style={{ color: FR.slate, fontStyle: 'normal' }}>{name}</strong>.
            </div>
            {!seeded && (
              <button type="button" onClick={handleDelete}
                title="Delete this custom color"
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'transparent', color: '#C0392B', border: `1px solid #C0392B`, borderRadius: 3, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <Trash2 size={11} /> Delete color
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
