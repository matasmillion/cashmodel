// PLM Factory Directory — mirrors ColorPaletteManager.
// Grid of factory cards; click one to open an editor modal with contact
// info, MOQ, lead time, specialties, notes, and a logo upload slot. All
// edits flow through factoryLibrary (localStorage-only for now).
//
// Names that appear in plmDirectory.listAllSuppliers() but don't yet have
// a rich record in the library are stitched in as empty cards with a
// muted "No details yet" badge so users can find and enrich them.

import { useState, useEffect, useRef } from 'react';
import { X, Upload, Plus, Trash2, MapPin, Globe } from 'lucide-react';
import { FR } from './techPackConstants';
import { Input, Row, labelStyle, inputBase } from './TechPackPrimitives';
import {
  listFactoriesLocal, listFactories,
  getFactory, updateFactory, clearFactoryField,
  addFactory, deleteFactory,
} from '../../utils/factoryLibrary';
import { fileToDataUrl } from '../../utils/cropImage';

export default function FactoryManager() {
  const [factories, setFactories] = useState(() => listFactoriesLocal());
  const [activeName, setActiveName] = useState(null);
  const [adding, setAdding] = useState(false);

  // Quick synchronous refresh from library store.
  const refresh = () => setFactories(listFactoriesLocal());

  // Async refresh that also pulls names from plmDirectory. Used on mount
  // and after closing editors so the grid always reflects both sources.
  const refreshAll = async () => {
    try {
      const full = await listFactories();
      setFactories(full);
    } catch (err) {
      console.error(err);
      refresh();
    }
  };
  useEffect(() => { refreshAll(); }, []);

  const handleClose = (openName) => {
    setActiveName(null);
    refreshAll();
    if (openName) setActiveName(openName);
  };

  const handleAdd = (name, country) => {
    const res = addFactory(name, { country });
    if (!res.ok) {
      alert(res.reason);
      return false;
    }
    setAdding(false);
    refreshAll();
    setActiveName(name);
    return true;
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
        <div>
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, margin: 0 }}>Factory Directory</h3>
          <p style={{ color: FR.stone, fontSize: 12, margin: '4px 0 0' }}>
            One place for every factory — contact, MOQ, lead time, specialties.
          </p>
        </div>
        <button onClick={() => setAdding(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <Plus size={12} /> Add factory
        </button>
      </div>

      {factories.length === 0 ? (
        <div style={{ padding: '36px 24px', textAlign: 'center', background: FR.salt, border: `1px dashed ${FR.sand}`, borderRadius: 8 }}>
          <div style={{ fontSize: 13, color: FR.stone }}>No factories yet.</div>
          <div style={{ fontSize: 11, color: FR.sand, marginTop: 6 }}>Click + Add factory or enter one on any pack's Factory dropdown.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {factories.map(f => (
            <FactoryCard key={f.name} factory={f} onClick={() => setActiveName(f.name)} />
          ))}
        </div>
      )}

      {adding && <AddFactoryForm onCancel={() => setAdding(false)} onSubmit={handleAdd} />}
      {activeName && (
        <FactoryEditor
          name={activeName}
          onClose={() => handleClose()}
          onDeleted={() => handleClose()} />
      )}
    </div>
  );
}

function FactoryCard({ factory, onClick }) {
  const f = factory;
  const hasDetails = f._hasRecord;
  const specialties = (f.specialties || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  const location = [f.city, f.country].filter(Boolean).join(', ');

  return (
    <div onClick={onClick}
      style={{ cursor: 'pointer', border: `1px solid ${FR.sand}`, borderRadius: 8, overflow: 'hidden', background: FR.white, transition: 'box-shadow 0.15s, transform 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}>

      <div style={{ padding: '14px 14px 10px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {f.logoImage ? (
          <img src={f.logoImage} alt={`${f.name} logo`}
            style={{ width: 44, height: 44, objectFit: 'cover', border: `1px solid ${FR.sand}`, borderRadius: 4, flexShrink: 0 }} />
        ) : (
          <div style={{ width: 44, height: 44, background: FR.salt, border: `1px solid ${FR.sand}`, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: FR.sand, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
            {(f.name || '?').charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 18, color: FR.slate, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
          {location ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: FR.stone, marginTop: 3 }}>
              <MapPin size={10} /> <span>{location}</span>
            </div>
          ) : !hasDetails ? (
            <div style={{ fontSize: 10, color: FR.sand, fontStyle: 'italic', marginTop: 3 }}>No details yet</div>
          ) : null}
          {f.website && (
            <a
              href={/^https?:\/\//i.test(f.website) ? f.website : `https://${f.website}`}
              target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: FR.soil, marginTop: 3, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}
              title={f.website}>
              <Globe size={10} /> <span>{f.website.replace(/^https?:\/\//i, '').replace(/\/$/, '')}</span>
            </a>
          )}
        </div>
      </div>

      {specialties.length > 0 && (
        <div style={{ padding: '0 14px 10px', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {specialties.map((s, i) => (
            <span key={i} style={{ padding: '2px 8px', background: FR.salt, border: `1px solid ${FR.sand}`, borderRadius: 10, fontSize: 9, color: FR.soil, letterSpacing: 0.3 }}>{s}</span>
          ))}
        </div>
      )}

      {(f.moq || f.leadTimeDays) && (
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${FR.sand}`, background: FR.salt, fontSize: 10, color: FR.stone, lineHeight: 1.75 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: FR.soil, fontWeight: 600, letterSpacing: 0.5 }}>MOQ</span>
            <span style={{ color: FR.slate }}>{f.moq || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: FR.soil, fontWeight: 600, letterSpacing: 0.5 }}>LEAD TIME</span>
            <span style={{ color: FR.slate }}>{f.leadTimeDays ? `${f.leadTimeDays} days` : '—'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function AddFactoryForm({ onCancel, onSubmit }) {
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');

  const submit = (e) => {
    e.preventDefault();
    onSubmit(name, country);
  };

  return (
    <div role="dialog"
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit}
        style={{ background: FR.white, borderRadius: 10, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ background: FR.slate, color: FR.salt, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 3, fontWeight: 600, opacity: 0.8 }}>NEW FACTORY</div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, marginTop: 2 }}>Add to directory</div>
          </div>
          <button type="button" onClick={onCancel} aria-label="Cancel"
            style={{ padding: 6, background: 'rgba(255,255,255,0.1)', color: FR.salt, border: 'none', borderRadius: 3, cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: '18px 20px' }}>
          <Input label="Factory Name" value={name} onChange={setName} placeholder="e.g. Acme Knits" />
          <Input label="Country (optional)" value={country} onChange={setCountry} placeholder="China, Portugal, Italy…" />
          <p style={{ fontSize: 11, color: FR.stone, marginTop: 4 }}>
            Contact, MOQ, lead time, specialties, and logo can be added next.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button type="button" onClick={onCancel}
              style={{ padding: '6px 14px', background: 'transparent', color: FR.stone, border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 11, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit"
              style={{ padding: '6px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              Create factory
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function FactoryEditor({ name, onClose, onDeleted }) {
  const [entry, setEntry] = useState(() => getFactory(name) || { name });
  const fileRef = useRef(null);
  const hasRecord = !!entry._hasRecord;

  const patch = (k, v) => {
    const next = { ...entry, [k]: v };
    setEntry(next);
    // updateFactory ignores empty strings, so a clear has to go through
    // clearFactoryField. For typical edits just write.
    if (v) {
      updateFactory(name, { [k]: v });
      setEntry({ ...getFactory(name), _hasRecord: true });
    }
  };

  const uploadLogo = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const dataUri = await fileToDataUrl(file);
    updateFactory(name, { logoImage: dataUri });
    setEntry({ ...getFactory(name), _hasRecord: true });
  };

  const removeLogo = () => {
    clearFactoryField(name, 'logoImage');
    setEntry(getFactory(name));
  };

  const handleDelete = () => {
    if (!hasRecord) {
      // Nothing to delete — this factory exists only via plmDirectory.
      onClose();
      return;
    }
    if (!window.confirm(`Delete “${name}” from the directory? Any pack that still references this factory will keep the name as a plain text value.`)) return;
    const res = deleteFactory(name);
    if (!res.ok) {
      alert(res.reason);
      return;
    }
    if (onDeleted) onDeleted();
    else onClose();
  };

  return (
    <div role="dialog"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: FR.white, borderRadius: 10, width: '100%', maxWidth: 760, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ background: FR.slate, padding: '18px 22px', color: FR.salt, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 3, fontWeight: 600, opacity: 0.8 }}>FACTORY</div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 26, lineHeight: 1, marginTop: 4 }}>{name}</div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ padding: 6, background: 'rgba(255,255,255,0.12)', color: FR.salt, border: 'none', borderRadius: 3, cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: '18px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 180px', gap: 20 }}>
            <div>
              <Input label="Country" value={entry.country || ''} onChange={v => patch('country', v)} placeholder="China, Portugal, Italy…" />
              <Input label="City" value={entry.city || ''} onChange={v => patch('city', v)} placeholder="Dongguan, Porto, Prato…" />
              <Input label="Primary Contact" value={entry.primaryContact || ''} onChange={v => patch('primaryContact', v)} placeholder="e.g. Lily Chen" />
              <Input label="Email" value={entry.email || ''} onChange={v => patch('email', v)} placeholder="contact@factory.com" />
              <Input label="Phone / WeChat" value={entry.phone || ''} onChange={v => patch('phone', v)} placeholder="+86 138 0000 0000" />
              <Input label="Website" value={entry.website || ''} onChange={v => patch('website', v)} placeholder="https://factory.com" />
            </div>

            <div>
              <Input label="MOQ" value={entry.moq || ''} onChange={v => patch('moq', v)} placeholder="e.g. 500 units, 25 kg" />
              <Input label="Lead Time (days)" value={entry.leadTimeDays || ''} onChange={v => patch('leadTimeDays', v)} placeholder="e.g. 45-60" />
              <Input label="Specialties" value={entry.specialties || ''} onChange={v => patch('specialties', v)} placeholder="Knit, Woven, Trims" />
              <Input label="Notes" value={entry.notes || ''} onChange={v => patch('notes', v)} placeholder="Anything worth remembering" multiline />
            </div>

            <div>
              <label style={labelStyle}>Logo</label>
              <div onClick={() => fileRef.current?.click()}
                style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', border: `1px dashed ${FR.sand}`, borderRadius: 4, background: entry.logoImage ? 'transparent' : FR.salt, cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <input ref={fileRef} type="file" accept="image/*"
                  onChange={e => { if (e.target.files?.[0]) uploadLogo(e.target.files[0]); e.target.value = ''; }}
                  style={{ display: 'none' }} />
                {entry.logoImage ? (
                  <>
                    <img src={entry.logoImage} alt={`${name} logo`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button onClick={e => { e.stopPropagation(); removeLogo(); }}
                      style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, background: FR.slate, color: FR.salt, border: 'none', fontSize: 11, cursor: 'pointer' }}>×</button>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', fontSize: 10, color: FR.stone, padding: 10 }}>
                    <Upload size={18} style={{ color: FR.sand }} />
                    <div style={{ marginTop: 6 }}>Upload logo</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${FR.sand}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 10, color: FR.stone, fontStyle: 'italic' }}>
              Saved automatically. {hasRecord
                ? <>Linked to <strong style={{ color: FR.slate, fontStyle: 'normal' }}>{name}</strong> across every pack.</>
                : <>Edits here will establish <strong style={{ color: FR.slate, fontStyle: 'normal' }}>{name}</strong> in the directory.</>}
            </div>
            {hasRecord && (
              <button type="button" onClick={handleDelete}
                title="Delete this factory from the directory"
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'transparent', color: '#C0392B', border: `1px solid #C0392B`, borderRadius: 3, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <Trash2 size={11} /> Delete factory
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
