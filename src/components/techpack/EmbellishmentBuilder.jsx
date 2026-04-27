// Embellishment detail / editor — single-page form mirroring the
// Pattern and Fabric builders. Loaded via the
// `#product/library/embellishments/:id` deep link or by clicking a card
// in EmbellishmentList. All edits write back through saveEmbellishment.

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { FR } from './techPackConstants';
import { saveEmbellishment, archiveEmbellishment, restoreEmbellishment } from '../../utils/embellishmentStore';
import { EMBELLISHMENT_TYPES, EMBELLISHMENT_TYPE_LABEL, EMBELLISHMENT_STATUSES, PLACEMENT_OPTIONS } from '../../utils/embellishmentLibrary';

const STATUS_PILL = {
  draft:    { bg: 'rgba(116,116,116,0.10)', fg: '#5A5A5A', label: 'Draft' },
  testing:  { bg: 'rgba(133,79,11,0.12)',   fg: '#854F0B', label: 'Testing' },
  approved: { bg: 'rgba(99,153,34,0.12)',   fg: '#3B6D11', label: 'Approved' },
  archived: { bg: 'rgba(58,58,58,0.06)',    fg: '#9A9A9A', label: 'Archived' },
};

const INPUT_STYLE = {
  width: '100%', padding: '6px 8px', border: `1px solid ${FR.sand}`,
  borderRadius: 4, fontSize: 12, color: FR.slate, background: '#fff',
  fontFamily: "'Inter', sans-serif", outline: 'none', boxSizing: 'border-box',
};

const LABEL_STYLE = { fontSize: 11, color: FR.stone, marginBottom: 4, display: 'block', letterSpacing: 0.2 };

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

  useEffect(() => { setDraft(embellishment); }, [embellishment.id]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(embellishment), [draft, embellishment]);

  const set = (patch) => setDraft(d => ({ ...d, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      const { id, code, created_at, ...updates } = draft;
      await saveEmbellishment(id, updates);
      setSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async () => {
    if (draft.status === 'archived') {
      await restoreEmbellishment(draft.id);
      set({ status: 'draft' });
    } else {
      const ok = confirm(`Archive "${draft.name || draft.code}"?`);
      if (!ok) return;
      await archiveEmbellishment(draft.id);
      set({ status: 'archived' });
    }
  };

  const status = draft.status || 'draft';
  const pill = STATUS_PILL[status] || STATUS_PILL.draft;

  return (
    <div>
      <button onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: FR.stone, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 12 }}>
        <ArrowLeft size={13} /> Embellishments
      </button>

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
        <div style={{ fontSize: 10, color: FR.stone, marginBottom: 12 }}>
          Saved {savedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}

      <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: 20, marginBottom: 14 }}>
        <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: FR.slate, margin: 0, marginBottom: 14 }}>Identity</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <Field label="Type">
            <select value={draft.type} onChange={e => set({ type: e.target.value })} style={INPUT_STYLE}>
              {EMBELLISHMENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Version">
            <input value={draft.version || ''} onChange={e => set({ version: e.target.value })} placeholder="v1.0" style={INPUT_STYLE} />
          </Field>
          <Field label="Technique">
            <input value={draft.technique || ''} onChange={e => set({ technique: e.target.value })} placeholder="Flat satin stitch · 2 colors" style={INPUT_STYLE} />
          </Field>
        </div>
      </div>

      <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: 20, marginBottom: 14 }}>
        <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: FR.slate, margin: 0, marginBottom: 14 }}>Placement & spec</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <Field label="Placement">
            <select value={draft.placement || ''} onChange={e => set({ placement: e.target.value })} style={INPUT_STYLE}>
              <option value="">— Select —</option>
              {PLACEMENT_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
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
        </div>
      </div>

      <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: 20, marginBottom: 14 }}>
        <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: FR.slate, margin: 0, marginBottom: 14 }}>Sourcing</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <Field label="Primary vendor">
            <input value={draft.primary_vendor_id || ''} onChange={e => set({ primary_vendor_id: e.target.value })} placeholder="Yiwu Embroidery Co." style={INPUT_STYLE} />
          </Field>
          <Field label="Backup vendor">
            <input value={draft.backup_vendor_id || ''} onChange={e => set({ backup_vendor_id: e.target.value })} style={INPUT_STYLE} />
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

      <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: 20, marginBottom: 14 }}>
        <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: FR.slate, margin: 0, marginBottom: 14 }}>Files & notes</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          <Field label="Artwork file URL">
            <input value={draft.artwork_file_url || ''} onChange={e => set({ artwork_file_url: e.target.value })} placeholder="https://… or fr_logo_v3.dst" style={INPUT_STYLE} />
          </Field>
          <Field label="Placement reference image">
            <input value={draft.placement_image_url || ''} onChange={e => set({ placement_image_url: e.target.value })} placeholder="https://…" style={INPUT_STYLE} />
          </Field>
        </div>
        <div style={{ marginTop: 14 }}>
          <Field label="Notes">
            <textarea
              value={draft.notes || ''}
              onChange={e => set({ notes: e.target.value })}
              rows={4}
              placeholder="Placement tolerances, thread brands, machine notes…"
              style={{ ...INPUT_STYLE, resize: 'vertical' }}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}
