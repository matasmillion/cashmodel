// Embellishment detail / editor — 2-column shell (form left, sticky live
// preview right). Autosaves 1200 ms after the last keystroke and flushes
// on unmount.  No manual "Save" required; the toolbar button is only there
// as a reassurance affordance.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { FR } from './techPackConstants';
import { saveEmbellishment, archiveEmbellishment, restoreEmbellishment } from '../../utils/embellishmentStore';
import { EMBELLISHMENT_TYPES, EMBELLISHMENT_TYPE_LABEL, EMBELLISHMENT_STATUSES, PLACEMENT_OPTIONS } from '../../utils/embellishmentLibrary';
import SimpleImageSlot from './SimpleImageSlot';
import VendorPicker from './VendorPicker';
import FileSlot from './FileSlot';
import EmbellishmentBOMPreview from './EmbellishmentBOMPreview';
import { migrateLegacyCoverIfNeeded, isLegacyDataUrl } from '../../utils/plmAssets';

const STATUS_PILL = {
  draft:    { bg: 'rgba(116,116,116,0.10)', fg: '#5A5A5A', label: 'Draft' },
  testing:  { bg: 'rgba(133,79,11,0.12)',   fg: '#854F0B', label: 'Testing' },
  approved: { bg: 'rgba(99,153,34,0.12)',   fg: '#3B6D11', label: 'Approved' },
  archived: { bg: 'rgba(58,58,58,0.06)',    fg: '#9A9A9A', label: 'Archived' },
};

const INPUT_STYLE = {
  width: '100%', padding: '5px 7px', border: `1px solid ${FR.sand}`,
  borderRadius: 4, fontSize: 12, color: FR.slate, background: '#fff',
  fontFamily: "'Inter', sans-serif", outline: 'none', boxSizing: 'border-box',
};

const LABEL_STYLE = {
  fontSize: 10, color: FR.stone, marginBottom: 2,
  display: 'block', letterSpacing: 0.2, textTransform: 'uppercase', fontWeight: 600,
};

const CARD = {
  background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)',
  borderRadius: 8, padding: 14, marginBottom: 10,
};

const SECTION = {
  fontFamily: "'Cormorant Garamond', serif", fontSize: 15, color: FR.slate,
  margin: 0, marginBottom: 10, letterSpacing: 0.2,
};

function Field({ label, children }) {
  return (
    <div>
      <label style={LABEL_STYLE}>{label}</label>
      {children}
    </div>
  );
}

export default function EmbellishmentBuilder({ embellishment, onBack }) {
  const [draft, setDraft] = useState(embellishment);
  const [savedAt, setSavedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(embellishment));

  useEffect(() => {
    setDraft(embellishment);
    setSavedSnapshot(JSON.stringify(embellishment));
  }, [embellishment.id]);

  // Lazy Storage migration on mount for pre-Phase-3 covers (data: URLs).
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return undefined;
    if (!isLegacyDataUrl(draft?.cover_image)) return undefined;
    if (!draft?.id) return undefined;
    migratedRef.current = true;
    let cancelled = false;
    (async () => {
      const newPath = await migrateLegacyCoverIfNeeded(draft.cover_image, { scope: 'embellishments', ownerId: draft.id });
      if (cancelled || !newPath) return;
      setDraft(d => ({ ...d, cover_image: newPath }));
      try { await saveEmbellishment(draft.id, { cover_image: newPath }); }
      catch (err) { console.error('EmbellishmentBuilder lazy migration save:', err); }
    })();
    return () => { cancelled = true; };
  }, [draft?.id, draft?.cover_image]);

  const dirty = useMemo(() => JSON.stringify(draft) !== savedSnapshot, [draft, savedSnapshot]);

  const set = (patch) => setDraft(d => ({ ...d, ...patch }));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const snapshotAtSave = JSON.stringify(draft);
    try {
      const { id, code, created_at, ...updates } = draft;
      await saveEmbellishment(id, updates);
      setSavedSnapshot(snapshotAtSave);
      setSavedAt(new Date());
    } catch (err) {
      console.error('EmbellishmentBuilder save:', err);
    } finally {
      setSaving(false);
    }
  };

  // Refs for flush-on-unmount (must stay current without re-registering the effect).
  const draftRef = useRef(draft);
  const savingRef = useRef(saving);
  const savedSnapshotRef = useRef(savedSnapshot);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { savingRef.current = saving; }, [saving]);
  useEffect(() => { savedSnapshotRef.current = savedSnapshot; }, [savedSnapshot]);

  // Flush any unsaved changes when the component unmounts.
  useEffect(() => () => {
    const current = JSON.stringify(draftRef.current);
    if (current !== savedSnapshotRef.current && draftRef.current?.id) {
      const { id, code, created_at, ...updates } = draftRef.current;
      saveEmbellishment(id, updates).catch(err => console.error('EmbellishmentBuilder flush:', err));
    }
  }, []);

  // 1200 ms debounce autosave.
  useEffect(() => {
    if (!dirty) return undefined;
    const timer = setTimeout(() => {
      if (savingRef.current) return;
      save();
    }, 1200);
    return () => clearTimeout(timer);
  }, [draft, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleArchive = async () => {
    if (draft.status === 'archived') {
      await restoreEmbellishment(draft.id);
      set({ status: 'draft' });
    } else {
      const ok = confirm(`Archive "${draft.name || draft.code}"? It will hide from default lists; you can restore it any time.`);
      if (!ok) return;
      await archiveEmbellishment(draft.id);
      set({ status: 'archived' });
    }
  };

  const status = draft.status || 'draft';
  const pill = STATUS_PILL[status] || STATUS_PILL.draft;

  return (
    <div>
      {/* ─── Breadcrumb ─────────────────────────────────────────────────── */}
      <button onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: FR.stone, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 12 }}>
        <ArrowLeft size={13} /> Embellishments
      </button>

      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <input
            value={draft.name || ''}
            onChange={e => set({ name: e.target.value })}
            placeholder="Untitled embellishment"
            style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, color: FR.slate, border: 'none', outline: 'none', background: 'transparent', width: '100%' }}
          />
          <div style={{ fontSize: 11, color: FR.stone, marginTop: 2, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {draft.code} · {EMBELLISHMENT_TYPE_LABEL[draft.type] || draft.type} · {draft.version}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={status}
            onChange={e => set({ status: e.target.value })}
            style={{ background: pill.bg, color: pill.fg, padding: '6px 10px', borderRadius: 5, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, border: 'none', cursor: 'pointer' }}
          >
            {EMBELLISHMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={toggleArchive}
            title={status === 'archived' ? 'Restore' : 'Archive'}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', background: 'transparent', color: FR.stone, border: `1px solid ${FR.sand}`, borderRadius: 6, fontSize: 11, cursor: 'pointer' }}
          >
            <Trash2 size={12} /> {status === 'archived' ? 'Restore' : 'Archive'}
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: dirty ? FR.slate : FR.sand, color: dirty ? FR.salt : FR.stone, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: dirty && !saving ? 'pointer' : 'not-allowed', opacity: saving ? 0.6 : 1 }}
          >
            <Save size={13} /> {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>

      {savedAt && !dirty && (
        <div style={{ fontSize: 10, color: FR.stone, marginBottom: 10 }}>
          Saved {savedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}

      {/* ─── 2-col shell ────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>

        {/* LEFT: form */}
        <div>

          {/* Type */}
          <div style={CARD}>
            <h4 style={SECTION}>Type</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {EMBELLISHMENT_TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => set({ type: t.id })}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: draft.type === t.id ? 700 : 400,
                    background: draft.type === t.id ? FR.slate : 'transparent',
                    color: draft.type === t.id ? FR.salt : FR.stone,
                    border: `1px solid ${draft.type === t.id ? FR.slate : FR.sand}`,
                    cursor: 'pointer',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Photos — artwork swatch (flat lay) */}
          <div style={CARD}>
            <h4 style={SECTION}>Artwork</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <SimpleImageSlot
                value={draft.artwork_swatch_image_url || ''}
                onChange={v => set({ artwork_swatch_image_url: v })}
                label="Artwork swatch"
                hint="9:16 flat lay of the artwork"
                height={220}
                assetScope="embellishments"
                assetOwnerId={draft.id}
                assetSlot="artwork_swatch"
              />
              <SimpleImageSlot
                value={draft.placement_image_url || ''}
                onChange={v => set({ placement_image_url: v })}
                label="Placement reference"
                hint="9:16 garment placement photo"
                height={220}
                assetScope="embellishments"
                assetOwnerId={draft.id}
                assetSlot="placement"
              />
            </div>
          </div>

          {/* Placement & spec */}
          <div style={CARD}>
            <h4 style={SECTION}>Placement &amp; spec</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <Field label="Placement">
                <select value={draft.placement || ''} onChange={e => set({ placement: e.target.value })} style={INPUT_STYLE}>
                  <option value="">— Select —</option>
                  {PLACEMENT_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Technique">
                <input value={draft.technique || ''} onChange={e => set({ technique: e.target.value })} placeholder="Flat satin stitch · 2 colors" style={INPUT_STYLE} />
              </Field>
              <Field label="Width (cm)">
                <input type="number" step="0.1" value={draft.size_w_cm ?? 0} onChange={e => set({ size_w_cm: parseFloat(e.target.value) || 0 })} style={INPUT_STYLE} />
              </Field>
              <Field label="Height (cm)">
                <input type="number" step="0.1" value={draft.size_h_cm ?? 0} onChange={e => set({ size_h_cm: parseFloat(e.target.value) || 0 })} style={INPUT_STYLE} />
              </Field>
              <Field label="Color count">
                <input type="number" min="1" value={draft.color_count ?? 1} onChange={e => set({ color_count: parseInt(e.target.value, 10) || 1 })} style={INPUT_STYLE} />
              </Field>
              <Field label="Version">
                <input value={draft.version || ''} onChange={e => set({ version: e.target.value })} placeholder="v1.0" style={INPUT_STYLE} />
              </Field>
            </div>
          </div>

          {/* Sourcing */}
          <div style={CARD}>
            <h4 style={SECTION}>Sourcing</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <Field label="Primary vendor">
                <VendorPicker value={draft.primary_vendor_id} onChange={v => set({ primary_vendor_id: v })} placeholder="Select primary vendor…" />
              </Field>
              <Field label="Backup vendor">
                <VendorPicker value={draft.backup_vendor_id} onChange={v => set({ backup_vendor_id: v })} placeholder="Select backup vendor…" />
              </Field>
              <Field label="Cost / unit (USD)">
                <input type="number" step="0.01" value={draft.cost_per_unit_usd ?? 0} onChange={e => set({ cost_per_unit_usd: parseFloat(e.target.value) || 0 })} style={INPUT_STYLE} />
              </Field>
              <Field label="Lead time (days)">
                <input type="number" value={draft.lead_time_days ?? 0} onChange={e => set({ lead_time_days: parseInt(e.target.value, 10) || 0 })} style={INPUT_STYLE} />
              </Field>
              <Field label="MOQ (units)">
                <input type="number" value={draft.moq_units ?? 0} onChange={e => set({ moq_units: parseInt(e.target.value, 10) || 0 })} style={INPUT_STYLE} />
              </Field>
            </div>
          </div>

          {/* Digital files */}
          <div style={CARD}>
            <h4 style={SECTION}>Digital files</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              <Field label="Adobe Illustrator (.ai)">
                <FileSlot value={draft.adobe_ai_url} onChange={v => set({ adobe_ai_url: v })} accept=".ai,.eps,.svg,.pdf" hint="Drop an .ai / .eps / .svg working file" />
              </Field>
              <Field label="Adobe Photoshop (.psd)">
                <FileSlot value={draft.adobe_psd_url} onChange={v => set({ adobe_psd_url: v })} accept=".psd,.psb,.tif,.tiff" hint="Drop a .psd working file" />
              </Field>
              <Field label="CLO3D graphic (.png export)">
                <FileSlot value={draft.clo3d_graphic_url} onChange={v => set({ clo3d_graphic_url: v })} accept="image/*" hint="Drop a CLO-ready PNG export" />
              </Field>
              <Field label="Digitizing file (.dst / .exp)">
                <FileSlot value={draft.digitizing_file_url} onChange={v => set({ digitizing_file_url: v })} accept=".dst,.exp,.emb,.pes" hint="Drop a .dst / .exp digitizing file" />
              </Field>
              <Field label="Artwork master">
                <FileSlot value={draft.artwork_file_url} onChange={v => set({ artwork_file_url: v })} hint="Drop or paste the master artwork URL" />
              </Field>
            </div>
          </div>

          {/* Notes */}
          <div style={CARD}>
            <Field label="Notes">
              <textarea
                value={draft.notes || ''}
                onChange={e => set({ notes: e.target.value })}
                rows={4}
                placeholder="Placement tolerances, thread brands, machine notes…"
                style={{ ...INPUT_STYLE, resize: 'vertical', fontFamily: "'Inter', sans-serif" }}
              />
            </Field>
          </div>
        </div>

        {/* RIGHT: sticky live preview */}
        <div style={{ position: 'sticky', top: 16 }}>
          <EmbellishmentBOMPreview embellishment={draft} />
        </div>
      </div>
    </div>
  );
}
