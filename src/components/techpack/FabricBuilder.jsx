// Fabric detail / editor — single-page form mirroring PatternBuilder.
// Loaded via the `#product/library/fabrics/:id` deep link or by clicking
// a card in FabricList. All edits write back through fabricStore.saveFabric.

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { FR, FR_COLOR_OPTIONS } from './techPackConstants';
import { saveFabric, archiveFabric, restoreFabric } from '../../utils/fabricStore';
import { FABRIC_WEAVES, FABRIC_WEAVE_LABEL, FABRIC_STATUSES } from '../../utils/fabricLibrary';
import CoverImagePicker from './CoverImagePicker';

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

export default function FabricBuilder({ fabric, onBack }) {
  const [draft, setDraft] = useState(fabric);
  const [savedAt, setSavedAt] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(fabric); }, [fabric.id]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(fabric), [draft, fabric]);

  const set = (patch) => setDraft(d => ({ ...d, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      const { id, code, created_at, ...updates } = draft;
      await saveFabric(id, updates);
      setSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async () => {
    if (draft.status === 'archived') {
      await restoreFabric(draft.id);
      set({ status: 'draft' });
    } else {
      const ok = confirm(`Archive "${draft.name || draft.code}"?`);
      if (!ok) return;
      await archiveFabric(draft.id);
      set({ status: 'archived' });
    }
  };

  const status = draft.status || 'draft';
  const pill = STATUS_PILL[status] || STATUS_PILL.draft;

  return (
    <div>
      <button onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: FR.stone, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 12 }}>
        <ArrowLeft size={13} /> Fabrics
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <input
            value={draft.name || ''}
            onChange={e => set({ name: e.target.value })}
            placeholder="Untitled fabric"
            style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, color: FR.slate, border: 'none', outline: 'none', background: 'transparent', width: '100%' }}
          />
          <div style={{ fontSize: 11, color: FR.stone, marginTop: 2, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {draft.code} · {FABRIC_WEAVE_LABEL[draft.weave] || draft.weave} · {draft.version}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={status}
            onChange={e => set({ status: e.target.value })}
            style={{ background: pill.bg, color: pill.fg, padding: '6px 10px', borderRadius: 5, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, border: 'none', cursor: 'pointer' }}
          >
            {FABRIC_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
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

      <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: 20, marginBottom: 14, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <CoverImagePicker
          value={draft.cover_image}
          onChange={dataUrl => set({ cover_image: dataUrl })}
          label="Cover image"
          hint="Drop a swatch photo"
        />
        <div style={{ flex: 1, minWidth: 280 }}>
          <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: FR.slate, margin: 0, marginBottom: 14 }}>Identity</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <Field label="Weave">
              <select value={draft.weave} onChange={e => set({ weave: e.target.value })} style={INPUT_STYLE}>
                {FABRIC_WEAVES.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
              </select>
            </Field>
            <Field label="Version">
              <input value={draft.version || ''} onChange={e => set({ version: e.target.value })} placeholder="v1.0" style={INPUT_STYLE} />
            </Field>
            <Field label="Composition">
              <input value={draft.composition || ''} onChange={e => set({ composition: e.target.value })} placeholder="100% Cotton" style={INPUT_STYLE} />
            </Field>
            <Field label="Hand / feel">
              <input value={draft.hand || ''} onChange={e => set({ hand: e.target.value })} placeholder="Soft, dry, slight loop back" style={INPUT_STYLE} />
            </Field>
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: 20, marginBottom: 14 }}>
        <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: FR.slate, margin: 0, marginBottom: 14 }}>Spec</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <Field label="Weight (gsm)">
            <input type="number" value={draft.weight_gsm ?? 0} onChange={e => set({ weight_gsm: parseFloat(e.target.value) || 0 })} style={INPUT_STYLE} />
          </Field>
          <Field label="Width (cm)">
            <input type="number" value={draft.width_cm ?? 0} onChange={e => set({ width_cm: parseFloat(e.target.value) || 0 })} style={INPUT_STYLE} />
          </Field>
          <Field label="Shrinkage (%)">
            <input type="number" step="0.1" value={draft.shrinkage_pct ?? 0} onChange={e => set({ shrinkage_pct: parseFloat(e.target.value) || 0 })} style={INPUT_STYLE} />
          </Field>
          <Field label="Stretch (%)">
            <input type="number" step="0.1" value={draft.stretch_pct ?? 0} onChange={e => set({ stretch_pct: parseFloat(e.target.value) || 0 })} style={INPUT_STYLE} />
          </Field>
          <Field label="Base color">
            <select value={draft.color_id || ''} onChange={e => set({ color_id: e.target.value })} style={INPUT_STYLE}>
              <option value="">— None —</option>
              {FR_COLOR_OPTIONS.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: 20, marginBottom: 14 }}>
        <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: FR.slate, margin: 0, marginBottom: 14 }}>Sourcing</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <Field label="Mill / supplier">
            <input value={draft.mill_id || ''} onChange={e => set({ mill_id: e.target.value })} placeholder="Lien Hsing Knits (Taipei)" style={INPUT_STYLE} />
          </Field>
          <Field label="Lead time (days)">
            <input type="number" value={draft.lead_time_days ?? 0} onChange={e => set({ lead_time_days: parseInt(e.target.value, 10) || 0 })} style={INPUT_STYLE} />
          </Field>
          <Field label="MOQ (yards)">
            <input type="number" value={draft.moq_yards ?? 0} onChange={e => set({ moq_yards: parseInt(e.target.value, 10) || 0 })} style={INPUT_STYLE} />
          </Field>
          <Field label="Price / yard (USD)">
            <input type="number" step="0.01" value={draft.price_per_yard_usd ?? 0} onChange={e => set({ price_per_yard_usd: parseFloat(e.target.value) || 0 })} style={INPUT_STYLE} />
          </Field>
        </div>
      </div>

      <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: 20, marginBottom: 14 }}>
        <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: FR.slate, margin: 0, marginBottom: 14 }}>Files & notes</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
          <Field label="Swatch image URL">
            <input value={draft.swatch_image_url || ''} onChange={e => set({ swatch_image_url: e.target.value })} placeholder="https://…" style={INPUT_STYLE} />
          </Field>
          <Field label="Notes">
            <textarea
              value={draft.notes || ''}
              onChange={e => set({ notes: e.target.value })}
              rows={4}
              placeholder="Compatibility, care, history…"
              style={{ ...INPUT_STYLE, resize: 'vertical' }}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}
