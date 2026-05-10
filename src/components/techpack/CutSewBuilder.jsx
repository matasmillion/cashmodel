// Cut & Sew library atom editor — mirrors TechPackBuilder layout exactly:
// left sidebar with page numbers, middle form, right live SVG preview.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { FR } from './techPackConstants';
import { saveCutSew, archiveCutSew, restoreCutSew } from '../../utils/cutSewStore';
import { CUT_SEW_CATEGORIES, CUT_SEW_CATEGORY_LABEL, CUT_SEW_STATUSES, STANDARD_SIZE_SETS } from '../../utils/cutSewLibrary';
import CoverImagePicker from './CoverImagePicker';
import FileSlot from './FileSlot';
import { migrateLegacyCoverIfNeeded, isLegacyDataUrl } from '../../utils/plmAssets';
import CutSewBOMPreview from './CutSewBOMPreview';

// ── Page definitions (mirrors STEPS icons in techPackConstants) ───────────────
const PAGES = [
  { id: 'identity',  icon: '01', title: 'Identity',          phase: 'Block Info' },
  { id: 'flatlay',   icon: '06', title: 'Flat Lay',           phase: 'Cut & Sew' },
  { id: 'callouts1', icon: '07', title: 'Call Outs',          phase: 'Cut & Sew' },
  { id: 'callouts2', icon: '08', title: 'Call Outs',          phase: 'Cut & Sew' },
  { id: 'stitching', icon: '09', title: 'Stitching',          phase: 'Cut & Sew' },
  { id: 'pattern',   icon: '10', title: 'Pattern & Cutting',  phase: 'Cut & Sew' },
  { id: 'pom',       icon: '11', title: 'POM',                phase: 'Cut & Sew' },
  { id: 'grading',   icon: '12', title: 'Size Grading',       phase: 'Cut & Sew' },
];

const STATUS_PILL = {
  draft:    { bg: 'rgba(116,116,116,0.10)', fg: '#5A5A5A' },
  testing:  { bg: 'rgba(133,79,11,0.12)',   fg: '#854F0B' },
  approved: { bg: 'rgba(99,153,34,0.12)',   fg: '#3B6D11' },
  archived: { bg: 'rgba(58,58,58,0.06)',    fg: '#9A9A9A' },
};

const INPUT_STYLE = {
  width: '100%', padding: '6px 8px', border: `1px solid ${FR.sand}`,
  borderRadius: 4, fontSize: 12, color: FR.slate, background: '#fff',
  fontFamily: "'Inter', sans-serif", outline: 'none', boxSizing: 'border-box',
};
const LABEL_STYLE  = { fontSize: 11, color: FR.stone, marginBottom: 4, display: 'block', letterSpacing: 0.2 };
const SECTION_LABEL = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };
const CARD = { background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: 20, marginBottom: 14 };
const SECTION_HEAD = { fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: FR.slate, margin: 0, marginBottom: 14 };

const SEAM_HEADERS = [
  { key: 'operation',    label: 'Operation',    placeholder: 'Side seam / Hem' },
  { key: 'seam_type',    label: 'Seam Type',    placeholder: 'Flatlock / French' },
  { key: 'stitch_type',  label: 'Stitch Type',  placeholder: '301 / 401' },
  { key: 'machine',      label: 'Machine',      placeholder: 'Juki MO-6814' },
  { key: 'spi_spcm',     label: 'SPI/SPCM',     placeholder: '10 SPI' },
  { key: 'thread_color', label: 'Thread Color', placeholder: 'Match body' },
  { key: 'thread_type',  label: 'Thread Type',  placeholder: 'Tex 40 / Poly' },
  { key: 'notes',        label: 'Notes' },
];

const PIECE_HEADERS = [
  { key: 'piece_num',  label: 'Piece #',  placeholder: 'P-01' },
  { key: 'piece_name', label: 'Name',     placeholder: 'Front Body' },
  { key: 'quantity',   label: 'Qty',      placeholder: '2' },
  { key: 'fabric',     label: 'Fabric',   placeholder: 'Shell' },
  { key: 'grain',      label: 'Grain',    placeholder: 'Lengthwise' },
  { key: 'fusing',     label: 'Fusing',   placeholder: 'None' },
  { key: 'notes',      label: 'Notes' },
];

const POM_HEADERS = [
  { key: 'name',   label: 'Measurement', placeholder: 'Chest Width' },
  { key: 's',      label: 'S',           placeholder: '' },
  { key: 'm',      label: 'M',           placeholder: '' },
  { key: 'l',      label: 'L',           placeholder: '' },
  { key: 'xl',     label: 'XL',          placeholder: '' },
  { key: 'tol',    label: 'Tol (cm)',    placeholder: '1' },
  { key: 'method', label: 'Method',      placeholder: 'Lay flat' },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div>
      <label style={LABEL_STYLE}>{label}</label>
      {children}
    </div>
  );
}

function Textarea({ label, value, onChange, rows = 3, placeholder }) {
  return (
    <Field label={label}>
      <textarea
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        style={{ ...INPUT_STYLE, resize: 'vertical', fontFamily: "'Inter', sans-serif" }}
      />
    </Field>
  );
}

function InlineTable({ headers, rows, onUpdate, onAdd, onRemove, addLabel = '+ Add row' }) {
  const cellStyle = {
    border: 'none', background: 'transparent', fontSize: 11, padding: '4px 6px',
    color: FR.slate, outline: 'none', width: '100%', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box',
  };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: FR.salt }}>
            {headers.map(h => (
              <th key={h.key} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, color: FR.soil, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', borderBottom: `1px solid ${FR.sand}`, whiteSpace: 'nowrap' }}>
                {h.label}
              </th>
            ))}
            <th style={{ width: 24, borderBottom: `1px solid ${FR.sand}` }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: `0.5px solid ${FR.sand}` }}>
              {headers.map(h => (
                <td key={h.key} style={{ padding: 0 }}>
                  <input value={row[h.key] ?? ''} onChange={e => onUpdate(i, h.key, e.target.value)} placeholder={h.placeholder || ''} style={cellStyle} />
                </td>
              ))}
              <td style={{ padding: '0 4px', textAlign: 'center' }}>
                <button onClick={() => onRemove(i)} style={{ background: 'none', border: 'none', color: FR.stone, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2 }}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={onAdd} style={{ marginTop: 8, background: 'none', border: `0.5px dashed ${FR.soil}`, borderRadius: 4, padding: '4px 12px', fontSize: 10, color: FR.soil, cursor: 'pointer', fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>
        {addLabel}
      </button>
    </div>
  );
}

function CalloutDetailCard({ entry, onChange, ownerId }) {
  return (
    <div style={{ background: FR.salt, border: `0.5px solid ${FR.sand}`, borderRadius: 6, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <CoverImagePicker value={entry.image_url || ''} onChange={url => onChange({ ...entry, image_url: url })} label={`Detail ${entry.num} image`} hint="4:3 close-up" assetScope="cut-sew" assetOwnerId={ownerId} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: '#A32D2D', color: '#fff', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{entry.num}</span>
        <input value={entry.title || ''} onChange={e => onChange({ ...entry, title: e.target.value })} placeholder="Title (e.g. Hood Construction)" style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 12, fontWeight: 600, color: FR.slate, fontFamily: "'Inter', sans-serif" }} />
      </div>
      <textarea value={entry.description || ''} onChange={e => onChange({ ...entry, description: e.target.value })} placeholder="Detail description" rows={2} style={{ border: `0.5px dashed ${FR.sand}`, borderRadius: 4, padding: '6px 8px', background: '#fff', fontSize: 11, color: FR.slate, resize: 'vertical', outline: 'none', lineHeight: 1.5, fontFamily: "'Inter', sans-serif", boxSizing: 'border-box', width: '100%' }} />
    </div>
  );
}

function StitchBlockCard({ block, onChange, onHide, ownerId }) {
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${FR.sand}`, borderRadius: 6, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
      <button onClick={onHide} title="Hide" style={{ position: 'absolute', top: 6, right: 6, zIndex: 5, width: 20, height: 20, borderRadius: 10, background: FR.slate, color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
      <CoverImagePicker value={block.image_url || ''} onChange={url => onChange({ ...block, image_url: url })} label={`Stitch ${block.num}`} hint="2:3 reference" assetScope="cut-sew" assetOwnerId={ownerId} />
      <input value={block.label || ''} onChange={e => onChange({ ...block, label: e.target.value })} placeholder="e.g. 401 Coverstitch" style={INPUT_STYLE} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CutSewBuilder({ block, onBack }) {
  const [draft, setDraft]               = useState(block);
  const [savedSnapshot, setSavedSnapshot] = useState(block);
  const [saving, setSaving]             = useState(false);
  const [pageIdx, setPageIdx]           = useState(0);

  const draftRef         = useRef(draft);
  const savingRef        = useRef(false);
  const savedSnapshotRef = useRef(block);

  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { setDraft(block); setSavedSnapshot(block); savedSnapshotRef.current = block; }, [block.id]);

  // Legacy cover migration
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return undefined;
    if (!isLegacyDataUrl(draft?.cover_image)) return undefined;
    if (!draft?.id) return undefined;
    migratedRef.current = true;
    let cancelled = false;
    (async () => {
      const newPath = await migrateLegacyCoverIfNeeded(draft.cover_image, { scope: 'cut-sew', ownerId: draft.id });
      if (cancelled || !newPath) return;
      setDraft(d => ({ ...d, cover_image: newPath }));
      try { await saveCutSew(draft.id, { cover_image: newPath }); }
      catch (err) { console.error('CutSewBuilder lazy migration save:', err); }
    })();
    return () => { cancelled = true; };
  }, [draft?.id, draft?.cover_image]);

  // Autosave — 1200 ms debounce
  useEffect(() => {
    if (JSON.stringify(draftRef.current) === JSON.stringify(savedSnapshotRef.current)) return;
    const t = setTimeout(async () => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      try {
        const d = draftRef.current;
        const { id, code, created_at, ...updates } = d;
        await saveCutSew(id, updates);
        setSavedSnapshot({ ...d });
        savedSnapshotRef.current = { ...d };
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [draft]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (JSON.stringify(draftRef.current) === JSON.stringify(savedSnapshotRef.current)) return;
      if (savingRef.current) return;
      savingRef.current = true;
      const d = draftRef.current;
      const { id, code, created_at, ...updates } = d;
      saveCutSew(id, updates).catch(() => {});
    };
  }, []);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(savedSnapshot), [draft, savedSnapshot]);
  const set = useCallback((patch) => setDraft(d => ({ ...d, ...patch })), []);

  const toggleArchive = async () => {
    if (draft.status === 'archived') {
      await restoreCutSew(draft.id);
      set({ status: 'draft' });
    } else {
      const ok = confirm(`Archive "${draft.name || draft.code}"? You can restore it any time.`);
      if (!ok) return;
      await archiveCutSew(draft.id);
      set({ status: 'archived' });
    }
  };

  // Array helpers
  const updSeam  = (i, k, v) => set({ seams: (draft.seams || []).map((r, idx) => idx === i ? { ...r, [k]: v } : r) });
  const addSeam  = () => set({ seams: [...(draft.seams || []), { operation: '', seam_type: '', stitch_type: '', machine: '', spi_spcm: '', thread_color: '', thread_type: '', notes: '' }] });
  const rmSeam   = (i) => set({ seams: (draft.seams || []).filter((_, idx) => idx !== i) });

  const updPiece = (i, k, v) => set({ pattern_pieces: (draft.pattern_pieces || []).map((r, idx) => idx === i ? { ...r, [k]: v } : r) });
  const addPiece = () => set({ pattern_pieces: [...(draft.pattern_pieces || []), { piece_num: '', piece_name: '', quantity: '', fabric: '', grain: '', fusing: '', notes: '' }] });
  const rmPiece  = (i) => set({ pattern_pieces: (draft.pattern_pieces || []).filter((_, idx) => idx !== i) });

  const updPom   = (i, k, v) => set({ pom_rows: (draft.pom_rows || []).map((r, idx) => idx === i ? { ...r, [k]: v } : r) });
  const addPom   = () => set({ pom_rows: [...(draft.pom_rows || []), { name: '', tol: '1', s: '', m: '', l: '', xl: '', method: '' }] });
  const rmPom    = (i) => set({ pom_rows: (draft.pom_rows || []).filter((_, idx) => idx !== i) });

  const updCallout = (page, i, next) => {
    const field = page === 1 ? 'callout_details_page1' : 'callout_details_page2';
    set({ [field]: (draft[field] || []).map((e, idx) => idx === i ? next : e) });
  };

  const updStitchBlock   = (num, next) => set({ seam_stitch_blocks: (draft.seam_stitch_blocks || []).map(b => b.num === num ? next : b) });
  const hideStitchBlock  = (num) => set({ seam_stitch_blocks: (draft.seam_stitch_blocks || []).map(b => b.num === num ? { ...b, hidden: true } : b) });
  const showStitchBlock  = (num) => set({ seam_stitch_blocks: (draft.seam_stitch_blocks || []).map(b => b.num === num ? { ...b, hidden: false } : b) });

  // Grading helpers
  const gradingMatrix = draft.graded_size_matrix || { baseSize: 'M', sizes: draft.sizes || ['S', 'M', 'L', 'XL'], grading: [] };
  const updGradingDelta = (pomName, size, val) => {
    const rows = gradingMatrix.grading.map(r => r.pomName === pomName ? { ...r, perSizeDelta: { ...r.perSizeDelta, [size]: val === '' ? null : parseFloat(val) || 0 } } : r);
    set({ graded_size_matrix: { ...gradingMatrix, grading: rows } });
  };
  const addGradingRow = () => {
    const perSizeDelta = Object.fromEntries((gradingMatrix.sizes || []).map(sz => [sz, null]));
    set({ graded_size_matrix: { ...gradingMatrix, grading: [...(gradingMatrix.grading || []), { pomName: '', perSizeDelta }] } });
  };
  const rmGradingRow = (i) => set({ graded_size_matrix: { ...gradingMatrix, grading: (gradingMatrix.grading || []).filter((_, idx) => idx !== i) } });
  const updGradingName = (i, name) => {
    const rows = (gradingMatrix.grading || []).map((r, idx) => idx === i ? { ...r, pomName: name } : r);
    set({ graded_size_matrix: { ...gradingMatrix, grading: rows } });
  };

  const status       = draft.status || 'draft';
  const pill         = STATUS_PILL[status] || STATUS_PILL.draft;
  const sizeSetMatch = STANDARD_SIZE_SETS.find(s => s.join(',') === (draft.sizes || []).join(','));
  const stitchBlocks = draft.seam_stitch_blocks || [1, 2, 3, 4, 5, 6].map(num => ({ num, label: '', hidden: false, image_url: '' }));
  const visibleBlocks = stitchBlocks.filter(b => !b.hidden);
  const hiddenCount   = stitchBlocks.filter(b => b.hidden).length;
  const activePage    = PAGES[pageIdx];

  // ── Sidebar ──────────────────────────────────────────────────────────────────

  const sidebar = (
    <div style={{ width: 220, minWidth: 220, borderRight: `1px solid ${FR.sand}`, background: FR.salt, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '12px 16px 8px' }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: FR.stone, fontSize: 11, cursor: 'pointer', padding: 0 }}>
          <ArrowLeft size={12} /> Cut &amp; Sew
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {PAGES.map((p, i) => {
          const phaseChanged = i === 0 || PAGES[i - 1].phase !== p.phase;
          return (
            <div key={p.id}>
              {phaseChanged && (
                <div style={{ padding: i === 0 ? '6px 16px 4px' : '12px 16px 4px', borderTop: i === 0 ? 'none' : `1px solid ${FR.sand}`, marginTop: i === 0 ? 0 : 4 }}>
                  <span style={{ fontSize: 8, color: FR.soil, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>{p.phase}</span>
                </div>
              )}
              <button
                onClick={() => setPageIdx(i)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 16px', border: 'none', cursor: 'pointer', background: i === pageIdx ? '#fff' : 'transparent', borderLeft: i === pageIdx ? `3px solid ${FR.soil}` : '3px solid transparent' }}
              >
                <span style={{ fontSize: 10, color: i === pageIdx ? FR.soil : FR.stone, fontWeight: 700, width: 18, fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace" }}>
                  {p.icon}
                </span>
                <span style={{ fontSize: 11, color: i === pageIdx ? FR.slate : FR.stone, textAlign: 'left', flex: 1 }}>
                  {p.title}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Page forms ────────────────────────────────────────────────────────────────

  const pageContent = (() => {
    switch (activePage.id) {

      case 'identity': return (
        <>
          <div style={{ ...CARD, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <CoverImagePicker
              value={draft.cover_image}
              onChange={url => set({ cover_image: url })}
              label="Cover image"
              hint="Drop a photo of the block"
              assetScope="cut-sew"
              assetOwnerId={draft.id}
            />
            <div style={{ flex: 1, minWidth: 280 }}>
              <h4 style={SECTION_HEAD}>Identity</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <Field label="Category">
                  <select value={draft.category} onChange={e => set({ category: e.target.value })} style={INPUT_STYLE}>
                    {CUT_SEW_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </Field>
                <Field label="Version">
                  <input value={draft.version || ''} onChange={e => set({ version: e.target.value })} placeholder="v1.0" style={INPUT_STYLE} />
                </Field>
                <Field label="Base block">
                  <input value={draft.base_block || ''} onChange={e => set({ base_block: e.target.value })} placeholder="FR-MASTER-HD" style={INPUT_STYLE} />
                </Field>
              </div>
            </div>
          </div>

          <div style={CARD}>
            <h4 style={SECTION_HEAD}>Spec</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <Field label="Size set">
                <select
                  value={sizeSetMatch ? sizeSetMatch.join(',') : 'custom'}
                  onChange={e => { const v = e.target.value; if (v !== 'custom') set({ sizes: v.split(',') }); }}
                  style={INPUT_STYLE}
                >
                  {STANDARD_SIZE_SETS.map(s => <option key={s.join(',')} value={s.join(',')}>{s.join(' / ')}</option>)}
                  <option value="custom">Custom</option>
                </select>
              </Field>
              <Field label="Sizes (comma-separated)">
                <input value={(draft.sizes || []).join(', ')} onChange={e => set({ sizes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="S, M, L, XL" style={INPUT_STYLE} />
              </Field>
              <Field label="Grade rule">
                <input value={draft.grade_rule || ''} onChange={e => set({ grade_rule: e.target.value })} placeholder="2 cm chest · 1.5 cm length" style={INPUT_STYLE} />
              </Field>
              <Field label="Ease at chest (cm)">
                <input type="number" step="0.1" value={draft.ease_chest_cm ?? 0} onChange={e => set({ ease_chest_cm: parseFloat(e.target.value) || 0 })} style={INPUT_STYLE} />
              </Field>
              <Field label="Drop (cm)">
                <input type="number" step="0.1" value={draft.drop_cm ?? 0} onChange={e => set({ drop_cm: parseFloat(e.target.value) || 0 })} style={INPUT_STYLE} />
              </Field>
              <Field label="Seam allowance (cm)">
                <input type="number" step="0.1" value={draft.seam_allowance_cm ?? 0} onChange={e => set({ seam_allowance_cm: parseFloat(e.target.value) || 0 })} style={INPUT_STYLE} />
              </Field>
            </div>
          </div>

          <div style={CARD}>
            <h4 style={SECTION_HEAD}>Files &amp; notes</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              <Field label="DXF / CAD file">
                <FileSlot value={draft.cad_file_url} onChange={v => set({ cad_file_url: v })} accept=".dxf,.dwg,.ai,.pdf" hint="Drop a .dxf / .dwg / .ai pattern file" />
              </Field>
              <Field label="Thumbnail">
                <FileSlot value={draft.thumbnail_url} onChange={v => set({ thumbnail_url: v })} accept="image/*" hint="Drop a thumbnail image" />
              </Field>
            </div>
            <div style={{ marginTop: 14 }}>
              <Textarea label="Notes" value={draft.notes} onChange={v => set({ notes: v })} rows={4} placeholder="Construction notes, fit notes, sloper history…" />
            </div>
          </div>
        </>
      );

      case 'flatlay': return (
        <div style={CARD}>
          <h4 style={SECTION_HEAD}>Flat Lay</h4>
          <p style={{ fontSize: 11, color: FR.stone, marginBottom: 16, fontStyle: 'italic' }}>Front and back technical flats. Each fills an A4 landscape so callouts stay legible when printed.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <Field label="Front flat lay">
              <CoverImagePicker value={draft.flat_lay_front_url} onChange={url => set({ flat_lay_front_url: url })} label="Front flat lay" hint="Drop front technical flat" assetScope="cut-sew" assetOwnerId={`${draft.id}-fl-front`} />
            </Field>
            <Field label="Back flat lay">
              <CoverImagePicker value={draft.flat_lay_back_url} onChange={url => set({ flat_lay_back_url: url })} label="Back flat lay" hint="Drop back technical flat" assetScope="cut-sew" assetOwnerId={`${draft.id}-fl-back`} />
            </Field>
          </div>
          <Textarea label="Flat lay notes" value={draft.flat_lay_notes} onChange={v => set({ flat_lay_notes: v })} rows={3} placeholder="Callouts, annotations, measurement notes…" />
        </div>
      );

      case 'callouts1': return (
        <div style={CARD}>
          <h4 style={SECTION_HEAD}>Call Outs — Page 1</h4>
          <p style={{ fontSize: 11, color: FR.stone, marginBottom: 16, fontStyle: 'italic' }}>Number each callout on the reference image (red dots) and describe the matching detail below.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 0.55fr) 1.45fr', gap: 18, alignItems: 'start' }}>
            <div>
              <label style={SECTION_LABEL}>Reference image (2:3)</label>
              <CoverImagePicker value={draft.callout_ref_page1_url} onChange={url => set({ callout_ref_page1_url: url })} label="Reference image" hint="Drop callout reference (numbered red dots overlaid)" assetScope="cut-sew" assetOwnerId={`${draft.id}-co1-ref`} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {(draft.callout_details_page1 || []).map((entry, i) => (
                <CalloutDetailCard key={entry.num} entry={entry} onChange={next => updCallout(1, i, next)} ownerId={`${draft.id}-co1-d${entry.num}`} />
              ))}
            </div>
          </div>
        </div>
      );

      case 'callouts2': return (
        <div style={CARD}>
          <h4 style={SECTION_HEAD}>Call Outs — Page 2</h4>
          <p style={{ fontSize: 11, color: FR.stone, marginBottom: 16, fontStyle: 'italic' }}>Continue callout details for a second page of construction references.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 0.55fr) 1.45fr', gap: 18, alignItems: 'start' }}>
            <div>
              <label style={SECTION_LABEL}>Reference image (2:3)</label>
              <CoverImagePicker value={draft.callout_ref_page2_url} onChange={url => set({ callout_ref_page2_url: url })} label="Reference image" hint="Drop callout reference page 2" assetScope="cut-sew" assetOwnerId={`${draft.id}-co2-ref`} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {(draft.callout_details_page2 || []).map((entry, i) => (
                <CalloutDetailCard key={entry.num} entry={entry} onChange={next => updCallout(2, i, next)} ownerId={`${draft.id}-co2-d${entry.num}`} />
              ))}
            </div>
          </div>
        </div>
      );

      case 'stitching': return (
        <div style={CARD}>
          <h4 style={SECTION_HEAD}>Stitching</h4>

          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ ...SECTION_LABEL, marginBottom: 0 }}>Stitch reference images</label>
              {hiddenCount > 0 && (
                <button onClick={() => { const next = stitchBlocks.find(b => b.hidden); if (next) showStitchBlock(next.num); }} style={{ background: 'none', border: `0.5px dashed ${FR.soil}`, borderRadius: 4, padding: '4px 10px', fontSize: 10, color: FR.soil, cursor: 'pointer', fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                  + Add stitch ({hiddenCount} hidden)
                </button>
              )}
            </div>
            <p style={{ fontSize: 11, color: FR.stone, marginBottom: 12, fontStyle: 'italic' }}>Up to 6 stitch reference blocks. Labels cross-reference the Stitch Type column in the table below.</p>
            {visibleBlocks.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', border: `0.5px dashed ${FR.sand}`, borderRadius: 6, color: FR.stone, fontStyle: 'italic', fontSize: 11 }}>
                All blocks hidden — click + Add stitch above.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(visibleBlocks.length, 3)}, 1fr)`, gap: 12 }}>
                {visibleBlocks.map(b => (
                  <StitchBlockCard key={b.num} block={b} onChange={next => updStitchBlock(b.num, next)} onHide={() => hideStitchBlock(b.num)} ownerId={`${draft.id}-st-${b.num}`} />
                ))}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={SECTION_LABEL}>Seam &amp; stitch specification</label>
            <InlineTable headers={SEAM_HEADERS} rows={draft.seams || []} onUpdate={updSeam} onAdd={addSeam} onRemove={rmSeam} addLabel="+ Add seam" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
            <Field label="C&S labor cost (USD)">
              <input type="number" step="0.01" min="0" value={draft.labor_cost_usd ?? 0} onChange={e => set({ labor_cost_usd: parseFloat(e.target.value) || 0 })} style={INPUT_STYLE} />
            </Field>
            <Textarea label="Labor cost notes" value={draft.labor_cost_notes} onChange={v => set({ labor_cost_notes: v })} rows={2} placeholder="CMT breakdown, efficiency notes…" />
          </div>
        </div>
      );

      case 'pattern': return (
        <div style={CARD}>
          <h4 style={SECTION_HEAD}>Pattern &amp; Cutting</h4>
          <div style={{ marginBottom: 16 }}>
            <label style={SECTION_LABEL}>Pattern pieces layout</label>
            <CoverImagePicker value={draft.pattern_layout_url} onChange={url => set({ pattern_layout_url: url })} label="Pattern layout" hint="Drop the pattern pieces layout image" assetScope="cut-sew" assetOwnerId={`${draft.id}-pat-layout`} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={SECTION_LABEL}>Pattern piece index</label>
            <InlineTable headers={PIECE_HEADERS} rows={draft.pattern_pieces || []} onUpdate={updPiece} onAdd={addPiece} onRemove={rmPiece} addLabel="+ Add piece" />
          </div>
          <Textarea label="Cutting instructions" value={draft.cutting_instructions} onChange={v => set({ cutting_instructions: v })} rows={3} placeholder="Marker plan, nap direction, utilisation target, shrinkage allowance…" />
        </div>
      );

      case 'pom': return (
        <div style={CARD}>
          <h4 style={SECTION_HEAD}>Points of Measure</h4>
          <div style={{ marginBottom: 16 }}>
            <label style={SECTION_LABEL}>POM diagram (numbered measurement points)</label>
            <CoverImagePicker value={draft.pom_diagram_url} onChange={url => set({ pom_diagram_url: url })} label="POM diagram" hint="Drop the POM diagram image" assetScope="cut-sew" assetOwnerId={`${draft.id}-pom-diag`} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <Field label="Size type">
              <select value={draft.pom_size_type || 'apparel'} onChange={e => set({ pom_size_type: e.target.value })} style={INPUT_STYLE}>
                <option value="apparel">Apparel (S / M / L / XL)</option>
                <option value="waist">Waist (W30 / W32 / W34 / W36)</option>
                <option value="one-size">One size</option>
              </select>
            </Field>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={SECTION_LABEL}>Graded spec table (cm)</label>
            <InlineTable headers={POM_HEADERS} rows={draft.pom_rows || []} onUpdate={updPom} onAdd={addPom} onRemove={rmPom} addLabel="+ Add measurement" />
          </div>
          <Textarea label="Measurement method" value={draft.pom_measurement_method} onChange={v => set({ pom_measurement_method: v })} rows={2} placeholder="Lay garment flat on table. Smooth without stretching. Measure with flexible tape." />
        </div>
      );

      case 'grading': {
        const sizes = gradingMatrix.sizes || draft.sizes || ['S', 'M', 'L', 'XL'];
        return (
          <div style={CARD}>
            <h4 style={SECTION_HEAD}>Size Grading</h4>
            <p style={{ fontSize: 11, color: FR.stone, marginBottom: 16, fontStyle: 'italic' }}>
              Per-size deltas (cm) relative to the base size. Add a row for each POM measurement you need to grade.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
              <Field label="Base / sample size">
                <select
                  value={gradingMatrix.baseSize || 'M'}
                  onChange={e => set({ graded_size_matrix: { ...gradingMatrix, baseSize: e.target.value } })}
                  style={INPUT_STYLE}
                >
                  {(draft.sizes || ['S', 'M', 'L', 'XL']).map(sz => <option key={sz} value={sz}>{sz}</option>)}
                </select>
              </Field>
            </div>

            <label style={SECTION_LABEL}>Grading deltas (cm)</label>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: FR.salt }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, color: FR.soil, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', borderBottom: `1px solid ${FR.sand}`, whiteSpace: 'nowrap', minWidth: 140 }}>Measurement</th>
                    {sizes.map(sz => (
                      <th key={sz} style={{ padding: '6px 8px', textAlign: 'center', fontSize: 10, color: sz === gradingMatrix.baseSize ? FR.slate : FR.soil, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', borderBottom: `1px solid ${FR.sand}`, minWidth: 60 }}>
                        {sz}{sz === gradingMatrix.baseSize ? ' ●' : ''}
                      </th>
                    ))}
                    <th style={{ width: 24, borderBottom: `1px solid ${FR.sand}` }} />
                  </tr>
                </thead>
                <tbody>
                  {(gradingMatrix.grading || []).map((row, i) => (
                    <tr key={i} style={{ borderBottom: `0.5px solid ${FR.sand}` }}>
                      <td style={{ padding: 0 }}>
                        <input value={row.pomName || ''} onChange={e => updGradingName(i, e.target.value)} placeholder="e.g. Chest Width" style={{ border: 'none', background: 'transparent', fontSize: 11, padding: '4px 8px', color: FR.slate, outline: 'none', width: '100%', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box' }} />
                      </td>
                      {sizes.map(sz => (
                        <td key={sz} style={{ padding: 0, textAlign: 'center' }}>
                          <input
                            type="number" step="0.1"
                            value={row.perSizeDelta?.[sz] ?? ''}
                            onChange={e => updGradingDelta(row.pomName, sz, e.target.value)}
                            placeholder={sz === gradingMatrix.baseSize ? '0' : '±'}
                            disabled={sz === gradingMatrix.baseSize}
                            style={{ border: 'none', background: sz === gradingMatrix.baseSize ? FR.salt : 'transparent', fontSize: 11, padding: '4px 6px', color: FR.slate, outline: 'none', width: '100%', textAlign: 'center', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box', opacity: sz === gradingMatrix.baseSize ? 0.45 : 1 }}
                          />
                        </td>
                      ))}
                      <td style={{ padding: '0 4px', textAlign: 'center' }}>
                        <button onClick={() => rmGradingRow(i)} style={{ background: 'none', border: 'none', color: FR.stone, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2 }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={addGradingRow} style={{ marginTop: 8, background: 'none', border: `0.5px dashed ${FR.soil}`, borderRadius: 4, padding: '4px 12px', fontSize: 10, color: FR.soil, cursor: 'pointer', fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                + Add measurement
              </button>
            </div>
          </div>
        );
      }

      default: return null;
    }
  })();

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', minHeight: 0 }}>
      {/* Sidebar */}
      {sidebar}

      {/* Main form */}
      <div style={{ flex: 1, minWidth: 0, padding: '20px 28px', maxHeight: '75vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <input
              value={draft.name || ''}
              onChange={e => set({ name: e.target.value })}
              placeholder="Untitled cut & sew"
              style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, color: FR.slate, border: 'none', outline: 'none', background: 'transparent', width: '100%' }}
            />
            <div style={{ fontSize: 11, color: FR.stone, marginTop: 2, fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace" }}>
              {draft.code} · {CUT_SEW_CATEGORY_LABEL[draft.category] || draft.category} · {draft.version}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {saving && <span style={{ fontSize: 10, color: FR.stone }}>Saving…</span>}
            {!saving && !dirty && <span style={{ fontSize: 10, color: FR.stone }}>Saved</span>}
            <select value={status} onChange={e => set({ status: e.target.value })} style={{ background: pill.bg, color: pill.fg, padding: '6px 10px', borderRadius: 5, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
              {CUT_SEW_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={toggleArchive} title={status === 'archived' ? 'Restore' : 'Archive'} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', background: 'transparent', color: FR.stone, border: `1px solid ${FR.sand}`, borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
              <Trash2 size={12} /> {status === 'archived' ? 'Restore' : 'Archive'}
            </button>
          </div>
        </div>

        {pageContent}

        {/* Prev / Next */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTop: `1px solid ${FR.sand}` }}>
          <button onClick={() => setPageIdx(Math.max(0, pageIdx - 1))} disabled={pageIdx === 0} style={{ padding: '8px 20px', background: 'none', border: `1px solid ${pageIdx === 0 ? FR.sand : FR.slate}`, borderRadius: 3, color: pageIdx === 0 ? FR.sand : FR.slate, fontSize: 12, cursor: pageIdx === 0 ? 'default' : 'pointer' }}>
            Previous
          </button>
          <span style={{ fontSize: 10, color: FR.stone, alignSelf: 'center' }}>Page {pageIdx + 1} of {PAGES.length}</span>
          <button onClick={() => setPageIdx(Math.min(PAGES.length - 1, pageIdx + 1))} disabled={pageIdx === PAGES.length - 1} style={{ padding: '8px 20px', background: pageIdx === PAGES.length - 1 ? FR.sand : FR.slate, border: 'none', borderRadius: 3, color: '#fff', fontSize: 12, cursor: pageIdx === PAGES.length - 1 ? 'default' : 'pointer' }}>
            Next
          </button>
        </div>
      </div>

      {/* Live preview */}
      <div style={{ flex: '1 1 560px', minWidth: 400, maxWidth: 820, borderLeft: `1px solid ${FR.sand}`, background: FR.sand, padding: '20px', maxHeight: '75vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: FR.stone, letterSpacing: 2, fontWeight: 600, textTransform: 'uppercase' }}>Live Preview</div>
          <div style={{ fontSize: 9, color: FR.stone }}>Page {pageIdx + 1} / {PAGES.length}</div>
        </div>
        <CutSewBOMPreview block={draft} activePage={activePage.id} />
      </div>
    </div>
  );
}
