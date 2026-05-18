// PLM Vendor Directory — mirrors ColorPaletteManager.
// Grid of vendor cards; click one to open an editor modal with contact
// info, MOQ, lead time, specialties, notes, and a logo upload slot. All
// edits flow through vendorLibrary (localStorage-only for now).
//
// Names that appear in plmDirectory.listAllSuppliers() but don't yet have
// a rich record in the library are stitched in as empty cards with a
// muted "No details yet" badge so users can find and enrich them.

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Upload, Plus, Trash2, MapPin, Globe, Archive, RotateCcw } from 'lucide-react';
import { FR } from './techPackConstants';
import { Input, labelStyle } from './TechPackPrimitives';
import {
  listVendorsLocal, listVendors,
  getVendor, updateVendor, clearVendorField,
  addVendor, deleteVendor, renameVendor,
  archiveVendor, restoreVendor,
} from '../../utils/vendorLibrary';
import { fileToDataUrl } from '../../utils/cropImage';
import { uploadAsset, deleteAsset, isLegacyDataUrl, dataUrlToBlob } from '../../utils/plmAssets';
import CoverThumb from './CoverThumb';
import VendorPortalAccessPanel from './VendorPortalAccessPanel';
import VendorNotificationLog from './VendorNotificationLog';

export default function VendorManager() {
  const [showArchived, setShowArchived] = useState(false);
  const [vendors, setVendors] = useState(() => listVendorsLocal({ includeArchived: false }));
  const [activeName, setActiveName] = useState(null);
  const [adding, setAdding] = useState(false);

  // Quick synchronous refresh from library store.
  const refresh = () => setVendors(listVendorsLocal({ includeArchived: showArchived }));

  // Async refresh that also pulls names from plmDirectory. Used on mount
  // and after closing editors so the grid always reflects both sources.
  const refreshAll = async () => {
    try {
      const full = await listVendors({ includeArchived: showArchived });
      setVendors(full);
    } catch (err) {
      console.error(err);
      refresh();
    }
  };
  useEffect(() => { refreshAll(); }, [showArchived]);

  const handleClose = (openName) => {
    setActiveName(null);
    refreshAll();
    if (openName) setActiveName(openName);
  };

  const handleAdd = (name, country) => {
    const res = addVendor(name, { country });
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
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, margin: 0 }}>Vendor Directory</h3>
          <p style={{ color: FR.stone, fontSize: 12, margin: '4px 0 0' }}>
            One place for every vendor — contact, MOQ, lead time, specialties.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: FR.stone, cursor: 'pointer' }}>
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
            Show archived
          </label>
          <button onClick={() => setAdding(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <Plus size={12} /> Add vendor
          </button>
        </div>
      </div>

      {vendors.length === 0 ? (
        <div style={{ padding: '36px 24px', textAlign: 'center', background: FR.salt, border: `1px dashed ${FR.sand}`, borderRadius: 8 }}>
          <div style={{ fontSize: 13, color: FR.stone }}>No vendors yet.</div>
          <div style={{ fontSize: 11, color: FR.sand, marginTop: 6 }}>Click + Add vendor or enter one on any pack's Vendor dropdown.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {vendors.map(f => (
            <VendorCard key={f.name} vendor={f} onClick={() => setActiveName(f.name)} />
          ))}
        </div>
      )}

      {adding && <AddVendorForm onCancel={() => setAdding(false)} onSubmit={handleAdd} />}
      {activeName && (
        <VendorEditor
          key={activeName}
          name={activeName}
          onRenamed={(newName) => setActiveName(newName)}
          onClose={() => handleClose()}
          onDeleted={() => handleClose()} />
      )}
    </div>
  );
}

function VendorCard({ vendor, onClick }) {
  const f = vendor;
  const hasDetails = f._hasRecord;
  const isArchived = !!f.archivedAt;
  const specialties = (f.specialties || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  const location = [f.city, f.country].filter(Boolean).join(', ');

  return (
    <div onClick={onClick}
      style={{ cursor: 'pointer', border: `1px solid ${FR.sand}`, borderRadius: 8, overflow: 'hidden', background: FR.white, transition: 'box-shadow 0.15s, transform 0.15s', opacity: isArchived ? 0.6 : 1, position: 'relative' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}>

      {isArchived && (
        <span style={{
          position: 'absolute', top: 8, right: 8,
          padding: '3px 8px',
          background: 'rgba(58,58,58,0.06)', color: '#9A9A9A',
          borderRadius: 5, fontSize: 9, fontWeight: 600,
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>Archived</span>
      )}

      <div style={{ padding: '14px 14px 10px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {f.logoImage ? (
          <div style={{ width: 44, height: 44, border: `1px solid ${FR.sand}`, borderRadius: 4, flexShrink: 0, overflow: 'hidden' }}>
            <CoverThumb src={f.logoImage} alt={`${f.name} logo`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
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
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: FR.soil, marginTop: 3, textDecoration: 'underline' }}
              title={f.website}>
              <Globe size={10} /> <span>Website</span>
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

function AddVendorForm({ onCancel, onSubmit }) {
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
            <div style={{ fontSize: 9, letterSpacing: 3, fontWeight: 600, opacity: 0.8 }}>NEW VENDOR</div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, marginTop: 2 }}>Add to directory</div>
          </div>
          <button type="button" onClick={onCancel} aria-label="Cancel"
            style={{ padding: 6, background: 'rgba(255,255,255,0.1)', color: FR.salt, border: 'none', borderRadius: 3, cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: '18px 20px' }}>
          <Input label="Vendor Name" value={name} onChange={setName} placeholder="e.g. Acme Knits" />
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
              Create vendor
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// Visual indicator for the four save states the editor can be in. Sits
// in the modal header next to the Save & Close button so the operator
// can tell at a glance whether their last keystroke is persisted.
function SaveStateChip({ state, pending }) {
  if (state === 'saving' || pending > 0) {
    return (
      <span style={{ fontSize: 10, color: FR.sand, fontStyle: 'italic', whiteSpace: 'nowrap' }}>
        Saving{pending > 1 ? ` (${pending})` : ''}…
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span title="Last cloud sync failed — local copy is still saved" style={{ fontSize: 10, color: '#e7a8a8', fontWeight: 600, whiteSpace: 'nowrap' }}>
        ⚠︎ Cloud sync failed
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span style={{ fontSize: 10, color: '#a8d5a2', fontWeight: 600, letterSpacing: 0.3, whiteSpace: 'nowrap' }}>
        ✓ Saved
      </span>
    );
  }
  return (
    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap' }}>
      Auto-saves on edit
    </span>
  );
}

function VendorEditor({ name, onClose, onDeleted, onRenamed }) {
  const [entry, setEntry] = useState(() => getVendor(name) || { name });
  const fileRef = useRef(null);
  const hasRecord = !!entry._hasRecord;
  // saveState transitions: idle → saving → saved → idle (after 1.8s)
  //                        idle → error (if cloud sync threw)
  const [saveState, setSaveState] = useState('idle');
  const saveTimerRef = useRef(null);
  // Counts in-flight cloud syncs. Local writes are synchronous so this
  // only tracks the async tail. >0 = something still propagating.
  const pendingSavesRef = useRef(0);
  const [pendingSaves, setPendingSaves] = useState(0);
  const bumpPending = useCallback((delta) => {
    pendingSavesRef.current = Math.max(0, pendingSavesRef.current + delta);
    setPendingSaves(pendingSavesRef.current);
  }, []);
  const flashSaved = useCallback(() => {
    setSaveState('saved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveState('idle'), 1800);
  }, []);

  // Lazy migration: if this vendor's logoImage is still a base64 data URL
  // from before Phase 3, upload it to Storage in the background and save
  // the path back. Renders fine either way; this just stops bloating the
  // vendor row over time.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return undefined;
    if (!isLegacyDataUrl(entry.logoImage)) return undefined;
    migratedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const blob = dataUrlToBlob(entry.logoImage);
        if (!blob) return;
        const ref = await uploadAsset({
          scope: 'vendors',
          ownerId: encodeURIComponent(name),
          slot: 'logo',
          blob,
          skipCompress: false,
        });
        if (cancelled || !ref?.path) return;
        updateVendor(name, { logoImage: ref.path });
        setEntry(prev => ({ ...prev, logoImage: ref.path }));
      } catch (err) {
        console.error('VendorEditor lazy migration:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [name, entry.logoImage]);

  // Patch a single field. Always persists — empty values route through
  // clearVendorField so a deliberate clear actually clears (rather than
  // silently snapping back to the previous value on the next hydrate).
  // Returns a promise so explicit "Save & Close" can await all in-flight
  // syncs before letting the modal close.
  const patch = (k, v) => {
    setEntry(prev => ({ ...prev, [k]: v }));
    setSaveState('saving');
    bumpPending(1);
    const op = (v === '' || v == null)
      ? clearVendorField(name, k)
      : updateVendor(name, { [k]: v });
    return op
      .then(() => {
        setEntry({ ...getVendor(name), _hasRecord: true });
        flashSaved();
      })
      .catch(err => {
        console.error('vendor save:', err);
        setSaveState('error');
      })
      .finally(() => {
        bumpPending(-1);
      });
  };

  // Block exiting while async cloud syncs are still in flight (the local
  // store is already correct, but a close right now could miss the cloud
  // mirror). Confirm before exit if the user really wants to leave with
  // pending sync.
  const attemptClose = () => {
    if (pendingSavesRef.current > 0) {
      const proceed = window.confirm(
        'A cloud sync is still in flight. The vendor is saved on this device, but the cross-device copy may be a moment behind. Close anyway?'
      );
      if (!proceed) return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    onClose();
  };

  // Explicit Save & Close: forces a fresh upsert of the whole entry
  // (closes any cross-field gaps from earlier partial syncs), then
  // waits for it to settle before closing the modal.
  const saveAndClose = async () => {
    setSaveState('saving');
    bumpPending(1);
    try {
      const fresh = { ...getVendor(name), _hasRecord: true };
      // Re-upsert everything so the cloud row matches local exactly —
      // catches the case where an earlier field's sync silently failed.
      await updateVendor(name, fresh);
      setEntry(fresh);
      flashSaved();
    } catch (err) {
      console.error('vendor saveAndClose:', err);
      setSaveState('error');
      const proceed = window.confirm(
        `Save to cloud failed: ${err?.message || err}\n\nLocal copy is already persisted. Close anyway?`
      );
      bumpPending(-1);
      if (!proceed) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      onClose();
      return;
    }
    bumpPending(-1);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    onClose();
  };

  const uploadLogo = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const ref = await uploadAsset({
        scope: 'vendors',
        ownerId: encodeURIComponent(name),
        slot: 'logo',
        blob: file,
      });
      const previousLogo = entry.logoImage;
      updateVendor(name, { logoImage: ref.path });
      setEntry({ ...getVendor(name), _hasRecord: true });
      if (previousLogo && !isLegacyDataUrl(previousLogo) && previousLogo !== ref.path) {
        deleteAsset(previousLogo);
      }
    } catch (err) {
      console.error('uploadLogo failed:', err);
      // Fall back to legacy base64 path so the user keeps the image even
      // if Storage is unreachable (offline, RLS misconfig, etc.).
      const dataUri = await fileToDataUrl(file);
      updateVendor(name, { logoImage: dataUri });
      setEntry({ ...getVendor(name), _hasRecord: true });
    }
  };

  const removeLogo = () => {
    const previousLogo = entry.logoImage;
    clearVendorField(name, 'logoImage');
    setEntry(getVendor(name));
    if (previousLogo && !isLegacyDataUrl(previousLogo)) {
      deleteAsset(previousLogo);
    }
  };

  const handleDelete = () => {
    const message = hasRecord
      ? `Delete “${name}” from the directory? Any pack that still references this vendor will keep the name as a plain text value — to fully hide a vendor that's referenced in a pack, archive it instead.`
      : `Remove “${name}” from the directory? This vendor has no rich record yet — only the manually-added supplier list will be cleaned up. Pack references stay.`;
    if (!window.confirm(message)) return;
    const res = deleteVendor(name);
    if (!res.ok) {
      alert(res.reason);
      return;
    }
    if (onDeleted) onDeleted();
    else onClose();
  };

  const handleArchive = () => {
    if (!window.confirm(`Archive “${name}”? It will be hidden from the active directory until you restore it. Pack references and notification history are kept.`)) return;
    const res = archiveVendor(name);
    if (!res.ok) {
      alert(res.reason);
      return;
    }
    if (onDeleted) onDeleted();
    else onClose();
  };

  const handleRestore = () => {
    const res = restoreVendor(name);
    if (!res.ok) {
      alert(res.reason);
      return;
    }
    setEntry({ ...getVendor(name), _hasRecord: true });
  };

  return (
    <div role="dialog"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: FR.white, borderRadius: 10, width: '100%', maxWidth: 760, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ background: FR.slate, padding: '18px 22px', color: FR.salt, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, letterSpacing: 3, fontWeight: 600, opacity: 0.8 }}>VENDOR · CLICK TO RENAME</div>
            <input
              type="text"
              defaultValue={name}
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (!next || next === name) { e.target.value = name; return; }
                const result = renameVendor(name, next);
                if (!result.ok) {
                  alert(result.reason || 'Could not rename vendor.');
                  e.target.value = name;
                  return;
                }
                if (onRenamed) onRenamed(next);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
                if (e.key === 'Escape') { e.target.value = name; e.target.blur(); }
              }}
              style={{
                width: '100%',
                marginTop: 4,
                padding: '2px 6px',
                marginLeft: -6,
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontSize: 26,
                lineHeight: 1.1,
                color: FR.salt,
                background: 'transparent',
                border: '1px solid transparent',
                borderRadius: 3,
                outline: 'none',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onFocus={e => {
                e.target.style.borderColor = 'rgba(255,255,255,0.35)';
                e.target.style.background = 'rgba(255,255,255,0.06)';
                e.target.select();
              }}
              onMouseLeave={e => {
                if (document.activeElement !== e.target) {
                  e.target.style.borderColor = 'transparent';
                  e.target.style.background = 'transparent';
                }
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12, flexShrink: 0 }}>
            {/* Save state indicator — single source of truth for "did my edit stick?" */}
            <SaveStateChip state={saveState} pending={pendingSaves} />
            {/* Manual Save & Close — re-upserts the whole entry, waits for
                cloud round-trip, then closes. Useful as an explicit
                confirmation that everything got through. */}
            <button onClick={saveAndClose}
              disabled={saveState === 'saving' || pendingSaves > 0}
              title="Force a fresh save then close the editor"
              style={{
                padding: '6px 12px',
                background: FR.salt, color: FR.slate,
                border: 'none', borderRadius: 3,
                fontSize: 11, fontWeight: 600,
                cursor: (saveState === 'saving' || pendingSaves > 0) ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
                opacity: (saveState === 'saving' || pendingSaves > 0) ? 0.6 : 1,
              }}>
              Save &amp; Close
            </button>
            <button onClick={attemptClose} aria-label="Close"
              style={{ padding: 6, background: 'rgba(255,255,255,0.12)', color: FR.salt, border: 'none', borderRadius: 3, cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div style={{ padding: '18px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 180px', gap: 20 }}>
            <div>
              <Input label="Country" value={entry.country || ''} onChange={v => patch('country', v)} placeholder="China, Portugal, Italy…" />
              <Input label="City" value={entry.city || ''} onChange={v => patch('city', v)} placeholder="Dongguan, Porto, Prato…" />
              <Input label="Primary Contact" value={entry.primaryContact || ''} onChange={v => patch('primaryContact', v)} placeholder="e.g. Lily Chen" />
              <Input label="Email" value={entry.email || ''} onChange={v => patch('email', v)} placeholder="contact@vendor.com" />
              <Input label="Phone / WeChat" value={entry.phone || ''} onChange={v => patch('phone', v)} placeholder="+86 138 0000 0000" />
              <Input label="Website" value={entry.website || ''} onChange={v => patch('website', v)} placeholder="https://vendor.com" />
            </div>

            <div>
              <Input label="MOQ" value={entry.moq || ''} onChange={v => patch('moq', v)} placeholder="e.g. 500 units, 25 kg" />
              <Input label="Lead Time (days)" value={entry.leadTimeDays || ''} onChange={v => patch('leadTimeDays', v)} placeholder="e.g. 45-60" />
              <Input label="Specialties" value={entry.specialties || ''} onChange={v => patch('specialties', v)} placeholder="Knit, Woven, Trims" />
              <Input label="Payment Terms" value={entry.payment_terms || ''} onChange={v => patch('payment_terms', v)} placeholder="e.g. 30/70 T/T, Net-60" />
              <div style={{ marginBottom: 12 }}>
                <Input
                  label="SAM Rate (USD / min)"
                  value={entry.samRateUsdPerMin || ''}
                  onChange={v => patch('samRateUsdPerMin', v)}
                  placeholder="e.g. 0.35"
                />
                <p style={{ fontSize: 10, color: FR.stone, marginTop: -4, lineHeight: 1.4, fontStyle: 'italic' }}>
                  Cut &amp; sew manufacturers only. Fully-loaded billing rate per Standard Allowed Minute (includes labor + overhead + factory margin) — typical coastal China $0.30–0.45, Vietnam $0.25–0.40, Bangladesh $0.12–0.20. Leave blank for mills, trim suppliers, etc. The AI Cut &amp; Sew estimator uses this rate × estimated SAM minutes when set; otherwise it falls back to regional CMT benchmarks.
                </p>
              </div>
              <div style={{ marginBottom: 12 }}>
                <Input
                  label="Factory Markup (%)"
                  value={entry.markupPct || ''}
                  onChange={v => patch('markupPct', v)}
                  placeholder="e.g. 12"
                />
                <p style={{ fontSize: 10, color: FR.stone, marginTop: -4, lineHeight: 1.4, fontStyle: 'italic' }}>
                  Flat profit margin this vendor charges on top of unit cost (fabrics + trims + treatments + cut &amp; sew). Sticks with the vendor — every tech pack that names them adds this % automatically. Typical 8–15% for full-package, 0 for CMT-only.
                </p>
              </div>
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
                    <CoverThumb src={entry.logoImage} alt={`${name} logo`} />
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

          <VendorPortalAccessPanel vendorName={name} />
          <VendorNotificationLog vendorName={name} />

          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${FR.sand}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 10, color: FR.stone, fontStyle: 'italic' }}>
              Saved automatically. {hasRecord
                ? <>Linked to <strong style={{ color: FR.slate, fontStyle: 'normal' }}>{name}</strong> across every pack.</>
                : <>Edits here will establish <strong style={{ color: FR.slate, fontStyle: 'normal' }}>{name}</strong> in the directory.</>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {entry.archivedAt
                ? (
                  <button type="button" onClick={handleRestore}
                    title="Restore this vendor — bring it back into the active directory"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'transparent', color: FR.slate, border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <RotateCcw size={11} /> Restore
                  </button>
                )
                : (
                  <button type="button" onClick={handleArchive}
                    title="Archive this vendor — hide from the directory but keep the record"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'transparent', color: FR.slate, border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <Archive size={11} /> Archive
                  </button>
                )
              }
              <button type="button" onClick={handleDelete}
                title="Delete this vendor from the directory"
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'transparent', color: '#C0392B', border: `1px solid #C0392B`, borderRadius: 3, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <Trash2 size={11} /> Delete vendor
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
