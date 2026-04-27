// Pattern detail / editor — single-page form. Loaded via the
// `#product/library/patterns/:id` deep link or by clicking a card in
// PatternList. All edits write back through patternStore.savePattern,
// which auto-stamps updated_at.
//
// Layout matches the visual rhythm of the rest of the PLM atom detail
// pages: breadcrumb back · header with name + status · two-column spec
// grid · notes box. Status pill is editable inline. Identity fields
// (code) are read-only — codes are issued at create time and never
// regenerated.

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { FR } from './techPackConstants';
import { savePattern, archivePattern, restorePattern } from '../../utils/patternStore';
import { PATTERN_CATEGORIES, PATTERN_CATEGORY_LABEL, PATTERN_STATUSES, STANDARD_SIZE_SETS } from '../../utils/patternLibrary';
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

export default function PatternBuilder({ pattern, onBack }) {
  const [draft, setDraft] = useState(pattern);
  const [savedAt, setSavedAt] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(pattern); }, [pattern.id]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(pattern), [draft, pattern]);

  const set = (patch) => setDraft(d => ({ ...d, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      const { id, code, created_at, ...updates } = draft;
      await savePattern(id, updates);
      setSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async () => {
    if (draft.status === 'archived') {
      await restorePattern(draft.id);
      set({ status: 'draft' });
    } else {
      const ok = confirm(`Archive "${draft.name || draft.code}"? It will hide from default lists; you can restore it any time.`);
      if (!ok) return;
      await archivePattern(draft.id);
      set({ status: 'archived' });
    }
  };

  const status = draft.status || 'draft';
  const pill = STATUS_PILL[status] || STATUS_PILL.draft;

  const sizeSetMatch = STANDARD_SIZE_SETS.find(s => s.join(',') === (draft.sizes || []).join(','));

  return (
    <div>
      <button onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: FR.stone, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 12 }}>
        <ArrowLeft size={13} /> Patterns
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <input
            value={draft.name || ''}
            onChange={e => set({ name: e.target.value })}
            placeholder="Untitled pattern"
            style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, color: FR.slate, border: 'none', outline: 'none', background: 'transparent', width: '100%' }}
          />
          <div style={{ fontSize: 11, color: FR.stone, marginTop: 2, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {draft.code} · {PATTERN_CATEGORY_LABEL[draft.category] || draft.category} · {draft.version}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={status}
            onChange={e => set({ status: e.target.value })}
            style={{ background: pill.bg, color: pill.fg, padding: '6px 10px', borderRadius: 5, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, border: 'none', cursor: 'pointer' }}
          >
            {PATTERN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
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
        <div style={{ fontSize: 10, color: FR.stone, marginBottom: 12 }}>
          Saved {savedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}

      <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: 20, marginBottom: 14, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <CoverImagePicker
          value={draft.cover_image}
          onChange={dataUrl => set({ cover_image: dataUrl })}
          label="Cover image"
          hint="Drop a photo of the block"
        />
        <div style={{ flex: 1, minWidth: 280 }}>
          <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: FR.slate, margin: 0, marginBottom: 14 }}>Identity</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <Field label="Category">
            <select
              value={draft.category}
              onChange={e => set({ category: e.target.value })}
              style={INPUT_STYLE}
            >
              {PATTERN_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Version">
            <input
              value={draft.version || ''}
              onChange={e => set({ version: e.target.value })}
              placeholder="v1.0"
              style={INPUT_STYLE}
            />
          </Field>
          <Field label="Base block">
            <input
              value={draft.base_block || ''}
              onChange={e => set({ base_block: e.target.value })}
              placeholder="FR-MASTER-HD"
              style={INPUT_STYLE}
            />
          </Field>
        </div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: 20, marginBottom: 14 }}>
        <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: FR.slate, margin: 0, marginBottom: 14 }}>Spec</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <Field label="Size set">
            <select
              value={sizeSetMatch ? sizeSetMatch.join(',') : 'custom'}
              onChange={e => {
                const v = e.target.value;
                if (v === 'custom') return;
                set({ sizes: v.split(',') });
              }}
              style={INPUT_STYLE}
            >
              {STANDARD_SIZE_SETS.map(s => <option key={s.join(',')} value={s.join(',')}>{s.join(' / ')}</option>)}
              <option value="custom">Custom</option>
            </select>
          </Field>
          <Field label="Sizes (comma-separated)">
            <input
              value={(draft.sizes || []).join(', ')}
              onChange={e => set({ sizes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              placeholder="S, M, L, XL"
              style={INPUT_STYLE}
            />
          </Field>
          <Field label="Grade rule">
            <input
              value={draft.grade_rule || ''}
              onChange={e => set({ grade_rule: e.target.value })}
              placeholder="2 cm chest · 1.5 cm length"
              style={INPUT_STYLE}
            />
          </Field>
          <Field label="Ease at chest (cm)">
            <input
              type="number" step="0.1"
              value={draft.ease_chest_cm ?? 0}
              onChange={e => set({ ease_chest_cm: parseFloat(e.target.value) || 0 })}
              style={INPUT_STYLE}
            />
          </Field>
          <Field label="Drop (cm)">
            <input
              type="number" step="0.1"
              value={draft.drop_cm ?? 0}
              onChange={e => set({ drop_cm: parseFloat(e.target.value) || 0 })}
              style={INPUT_STYLE}
            />
          </Field>
          <Field label="Seam allowance (cm)">
            <input
              type="number" step="0.1"
              value={draft.seam_allowance_cm ?? 0}
              onChange={e => set({ seam_allowance_cm: parseFloat(e.target.value) || 0 })}
              style={INPUT_STYLE}
            />
          </Field>
        </div>
      </div>

      <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: 20, marginBottom: 14 }}>
        <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: FR.slate, margin: 0, marginBottom: 14 }}>Files & notes</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          <Field label="DXF / CAD file URL">
            <input
              value={draft.cad_file_url || ''}
              onChange={e => set({ cad_file_url: e.target.value })}
              placeholder="fr_hoodie_block_v3.dxf"
              style={INPUT_STYLE}
            />
          </Field>
          <Field label="Thumbnail URL">
            <input
              value={draft.thumbnail_url || ''}
              onChange={e => set({ thumbnail_url: e.target.value })}
              placeholder="https://…"
              style={INPUT_STYLE}
            />
          </Field>
        </div>
        <div style={{ marginTop: 14 }}>
          <Field label="Notes">
            <textarea
              value={draft.notes || ''}
              onChange={e => set({ notes: e.target.value })}
              rows={4}
              placeholder="Construction notes, fit notes, sloper history…"
              style={{ ...INPUT_STYLE, resize: 'vertical', fontFamily: "'Inter', sans-serif" }}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}
