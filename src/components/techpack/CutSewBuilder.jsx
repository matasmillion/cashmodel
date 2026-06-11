// Cut & Sew library atom editor — mirrors TechPackBuilder layout exactly:
// left sidebar with page numbers, middle form, right live SVG preview.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { FR, STEPS } from './techPackConstants';
import { saveCutSew, archiveCutSew, restoreCutSew } from '../../utils/cutSewStore';
import { CUT_SEW_CATEGORIES, CUT_SEW_CATEGORY_LABEL, CUT_SEW_STATUSES, STANDARD_SIZE_SETS } from '../../utils/cutSewLibrary';
import { PhotoUpload, AspectPhoto, ASPECTS, ArrayTable, FRColorCell } from './TechPackPrimitives';
import { CutSewLaborCostBlock, CalloutGarmentRef, CALLOUT_MAIN_ASPECT, CALLOUT_SUPPORT_ASPECT } from './TechPackSteps';
import CutSewCostChat from './CutSewCostChat';
import FileSlot from './FileSlot';
import { migrateLegacyCoverIfNeeded, isLegacyDataUrl, useResolvedImageEntries } from '../../utils/plmAssets';
import TechPackPagePreview from './TechPackPagePreview';
import CutSewBOMPreview from './CutSewBOMPreview';
import CoverImagePicker from './CoverImagePicker';

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

// Maps each Cut & Sew library page to the equivalent Styles tech-pack STEP id,
// so the live preview can reuse the exact same TechPackPagePreview renderer the
// Styles builder uses (identical cards, chrome, tables, photo slots).
const PAGE_TO_STEP_ID = {
  flatlay:   'flatlays',
  callouts1: 'sketches',
  callouts2: 'sketches-2',
  stitching: 'construction',
  pattern:   'pattern',
  pom:       'pom',
  grading:   'size-matrix',
};

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
const LABEL_STYLE   = { fontSize: 11, color: FR.stone, marginBottom: 4, display: 'block', letterSpacing: 0.2 };
const SECTION_LABEL = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };
const CARD          = { background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: 20, marginBottom: 14 };
const SECTION_HEAD  = { fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: FR.slate, margin: 0, marginBottom: 14 };

const SEAM_HEADERS = [
  { key: 'operation',    label: 'Operation',    placeholder: 'Side seam / Hem / Collar' },
  { key: 'seam_type',    label: 'Seam Type',    placeholder: 'Flatlock / French seam' },
  { key: 'stitch_type',  label: 'Stitch Type',  placeholder: '301 / 401 / 504' },
  { key: 'machine',      label: 'Machine',       placeholder: 'e.g. Juki MO-6814 overlock' },
  { key: 'spi_spcm',     label: 'SPI / SPCM',   placeholder: '10 SPI' },
  { key: 'thread_color', label: 'Thread Color', render: (v, onChange) => <FRColorCell value={v} onChange={onChange} /> },
  { key: 'thread_type',  label: 'Thread Type',  placeholder: 'Tex 40 / Polyester' },
  { key: 'notes',        label: 'Notes' },
];

// Default callout entries — mirrors DEFAULT_DATA in techPackConstants so the
// Call Outs pages always show 4 cards each (page 1 = 1-4, page 2 = 5-8), exactly
// like the Styles → Call Outs steps.
const DEFAULT_CALLOUTS_PAGE1 = [
  { num: 1, title: '', description: '' },
  { num: 2, title: '', description: '' },
  { num: 3, title: '', description: '' },
  { num: 4, title: '', description: '' },
];
const DEFAULT_CALLOUTS_PAGE2 = [
  { num: 5, title: '', description: '' },
  { num: 6, title: '', description: '' },
  { num: 7, title: '', description: '' },
  { num: 8, title: '', description: '' },
];

const PIECE_HEADERS = [
  { key: 'piece_num',  label: 'Piece #',              placeholder: 'P-01' },
  { key: 'piece_name', label: 'Piece Name',           placeholder: 'Front Body' },
  { key: 'quantity',   label: 'Quantity',             placeholder: '2' },
  { key: 'fabric',     label: 'Fabric',               placeholder: 'Shell' },
  { key: 'grain',      label: 'Grain',                placeholder: 'Lengthwise' },
  { key: 'fusing',     label: 'Fusing/Interlining',   placeholder: 'None' },
  { key: 'notes',      label: 'Notes' },
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

// Red-numbered circle used on callout detail cards.
function RedNumberCircle({ n, size = 22 }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: '50%', background: '#A32D2D',
      color: '#FFFFFF', fontSize: size * 0.5, fontWeight: 600, letterSpacing: 0.3,
      flexShrink: 0, fontFamily: "'Helvetica Neue', sans-serif",
    }}>
      {n}
    </span>
  );
}

// Callout detail card — matches ConstructionDetailCard in TechPackSteps exactly.
// Carries a large main image plus a smaller optional supporting image; leaving
// the support slot empty lets the preview/PDF expand the main image to fill.
function CalloutDetailCard({ entry, onChange, images, onUpload, onRemove }) {
  const slotKey = `construction-detail-${entry.num}`;
  return (
    <div style={{
      background: '#fff', border: `0.5px solid ${FR.sand}`,
      borderRadius: 6, padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: `${CALLOUT_MAIN_ASPECT.ratio} 1 0`, minWidth: 0 }}>
          <AspectPhoto
            slotKey={slotKey}
            aspect={CALLOUT_MAIN_ASPECT}
            images={images}
            onUpload={onUpload}
            onRemove={onRemove}
            label={`Detail ${entry.num} — main image`}
          />
        </div>
        <div style={{ flex: `${CALLOUT_SUPPORT_ASPECT.ratio} 1 0`, minWidth: 0 }}>
          <AspectPhoto
            slotKey={`${slotKey}-support`}
            aspect={CALLOUT_SUPPORT_ASPECT}
            images={images}
            onUpload={onUpload}
            onRemove={onRemove}
            label="Support (optional)"
          />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <RedNumberCircle n={entry.num} />
        <input
          value={entry.title || ''}
          onChange={e => onChange({ ...entry, title: e.target.value })}
          placeholder="Title (e.g. Hood Construction)"
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontWeight: 600, color: FR.slate, fontFamily: "'Helvetica Neue', sans-serif" }}
        />
      </div>
      <textarea
        value={entry.description || ''}
        onChange={e => onChange({ ...entry, description: e.target.value })}
        placeholder="Detail description"
        rows={3}
        style={{ border: `0.5px dashed ${FR.sand}`, borderRadius: 4, padding: '8px 10px', background: FR.salt, fontSize: 11, color: FR.slate, resize: 'vertical', outline: 'none', lineHeight: 1.5, fontFamily: "'Helvetica Neue', sans-serif", boxSizing: 'border-box' }}
      />
    </div>
  );
}

// Stitch block card — matches the block in StepConstruction exactly.
function StitchBlockCard({ block, onChange, onHide, images, onUpload, onRemove }) {
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${FR.sand}`, borderRadius: 6, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
      <button
        onClick={onHide}
        title="Hide this stitch reference"
        style={{ position: 'absolute', top: 6, right: 6, zIndex: 5, width: 22, height: 22, borderRadius: 11, background: FR.slate, color: '#fff', border: 'none', fontSize: 14, cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        ×
      </button>
      <AspectPhoto
        slotKey={`seam-stitch-${block.num}`}
        aspect={ASPECTS.TWO_THIRDS}
        images={images}
        onUpload={onUpload}
        onRemove={onRemove}
        label={`Stitch ${block.num}`}
      />
      <input
        value={block.label || ''}
        onChange={e => onChange({ ...block, label: e.target.value })}
        placeholder="e.g. 401 Coverstitch"
        style={{ width: '100%', border: `0.5px solid ${FR.sand}`, borderRadius: 3, padding: '6px 8px', fontSize: 11, color: FR.slate, background: FR.salt, outline: 'none', boxSizing: 'border-box', fontFamily: "'Helvetica Neue', sans-serif" }}
      />
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

  // Slot-based image upload/remove (same pattern as TechPackBuilder)
  const handleImgUpload = useCallback((slot, data, name) => {
    setDraft(d => ({
      ...d,
      images: [...(d.images || []).filter(i => i.slot !== slot), { slot, data, name }],
    }));
  }, []);

  const handleImgRemove = useCallback((slot) => {
    setDraft(d => ({ ...d, images: (d.images || []).filter(i => i.slot !== slot) }));
  }, []);

  const images = draft.images || [];
  // Resolve path-only / blob image entries to signed URLs the SVG <image>
  // tags can render — same pipeline the Styles builder feeds its preview.
  const previewImages = useResolvedImageEntries(images);

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

  // Array helpers — seams. Seed one blank row when empty, like StepConstruction.
  const seamRows = (draft.seams && draft.seams.length) ? draft.seams : [{ operation: '', seam_type: '', stitch_type: '', machine: '', spi_spcm: '', thread_color: '', thread_type: '', notes: '' }];
  const updSeam = (i, k, v) => set({ seams: seamRows.map((r, idx) => idx === i ? { ...r, [k]: v } : r) });
  const addSeam = () => set({ seams: [...seamRows, { operation: '', seam_type: '', stitch_type: '', machine: '', spi_spcm: '', thread_color: '', thread_type: '', notes: '' }] });
  const rmSeam  = (i) => set({ seams: seamRows.filter((_, idx) => idx !== i) });

  // Array helpers — pattern pieces. Seed one blank row when empty, like StepPattern.
  const pieceRows = (draft.pattern_pieces && draft.pattern_pieces.length) ? draft.pattern_pieces : [{ piece_num: '', piece_name: '', quantity: '', fabric: '', grain: '', fusing: '', notes: '' }];
  const updPiece = (i, k, v) => set({ pattern_pieces: pieceRows.map((r, idx) => idx === i ? { ...r, [k]: v } : r) });
  const addPiece = () => set({ pattern_pieces: [...pieceRows, { piece_num: '', piece_name: '', quantity: '', fabric: '', grain: '', fusing: '', notes: '' }] });
  const rmPiece  = (i) => set({ pattern_pieces: pieceRows.filter((_, idx) => idx !== i) });

  // Array helpers — POM. Seed one blank row when empty, like StepPom.
  const pomEditRows = (draft.pom_rows && draft.pom_rows.length) ? draft.pom_rows : [{ name: '', tol: '1', s: '', m: '', l: '', xl: '', method: '' }];
  const updPom = (i, k, v) => set({ pom_rows: pomEditRows.map((r, idx) => idx === i ? { ...r, [k]: v } : r) });
  const addPom = () => set({ pom_rows: [...pomEditRows, { name: '', tol: '1', s: '', m: '', l: '', xl: '', method: '' }] });
  const rmPom  = (i) => set({ pom_rows: pomEditRows.filter((_, idx) => idx !== i) });

  // Array helpers — callout entries. Seed from the defaults when the field is
  // empty so editing the first card materialises all four (matches Styles).
  const updCallout = (page, i, next) => {
    const field = page === 1 ? 'callout_details_page1' : 'callout_details_page2';
    const base = (draft[field] && draft[field].length)
      ? draft[field]
      : (page === 1 ? DEFAULT_CALLOUTS_PAGE1 : DEFAULT_CALLOUTS_PAGE2);
    set({ [field]: base.map((e, idx) => idx === i ? next : e) });
  };

  // Set/clear a call-out's placed dot (normalized { x, y } in 0..1, or null).
  const setCalloutDot = (page, num, dot) => {
    const field = page === 1 ? 'callout_details_page1' : 'callout_details_page2';
    const base = (draft[field] && draft[field].length)
      ? draft[field]
      : (page === 1 ? DEFAULT_CALLOUTS_PAGE1 : DEFAULT_CALLOUTS_PAGE2);
    set({ [field]: base.map(e => e.num === num ? { ...e, dot } : e) });
  };

  // Stitch block helpers
  const updStitchBlock  = (num, next) => set({ seam_stitch_blocks: (draft.seam_stitch_blocks || []).map(b => b.num === num ? next : b) });
  const hideStitchBlock = (num) => set({ seam_stitch_blocks: (draft.seam_stitch_blocks || []).map(b => b.num === num ? { ...b, hidden: true } : b) });
  const showStitchBlock = (num) => set({ seam_stitch_blocks: (draft.seam_stitch_blocks || []).map(b => b.num === num ? { ...b, hidden: false } : b) });

  // Grading helpers
  const gradingMatrix = draft.graded_size_matrix || { baseSize: 'M', sizes: draft.sizes || ['S', 'M', 'L', 'XL'], grading: [] };

  const updGradingDelta = (pomName, size, val) => {
    const grading = gradingMatrix.grading || [];
    const idx = grading.findIndex(r => r.pomName === pomName);
    const num = val === '' ? null : parseFloat(val) || 0;
    if (idx === -1) {
      set({ graded_size_matrix: { ...gradingMatrix, grading: [...grading, { pomName, perSizeDelta: { [size]: num } }] } });
    } else {
      const next = [...grading];
      next[idx] = { ...next[idx], perSizeDelta: { ...(next[idx].perSizeDelta || {}), [size]: num } };
      set({ graded_size_matrix: { ...gradingMatrix, grading: next } });
    }
  };

  // Adapter: map draft fields → camelCase shape for CutSewLaborCostBlock / CutSewCostChat
  const laborData = {
    cutSewLaborCost:     String(draft.labor_cost_usd ?? ''),
    cutSewLaborCostMeta: draft.labor_cost_meta || null,
    cutSewLaborCostChat: draft.labor_cost_chat || [],
    vendor: '',
    seams:         draft.seams || [],
    patternPieces: (draft.pattern_pieces || []).map(p => ({ pieceName: p.piece_name })),
    pickedFabrics: [], pickedTrims: [], treatments: [],
  };
  const laborSet = (key, value) => {
    if (key === 'cutSewLaborCost')     set({ labor_cost_usd: parseFloat(value) || 0 });
    else if (key === 'cutSewLaborCostMeta') set({ labor_cost_meta: value });
    else if (key === 'cutSewLaborCostChat') set({ labor_cost_chat: value });
  };

  const status       = draft.status || 'draft';
  const pill         = STATUS_PILL[status] || STATUS_PILL.draft;
  const sizeSetMatch = STANDARD_SIZE_SETS.find(s => s.join(',') === (draft.sizes || []).join(','));
  const stitchBlocks = draft.seam_stitch_blocks || [1, 2, 3, 4, 5, 6].map(num => ({ num, label: '', hidden: false }));
  const visibleBlocks = stitchBlocks.filter(b => !b.hidden);
  const hiddenBlocks  = stitchBlocks.filter(b =>  b.hidden);
  const activePage    = PAGES[pageIdx];

  // ── Preview mapping ────────────────────────────────────────────────────────
  // Map the library atom's snake_case fields onto the camelCase `data` shape the
  // shared TechPackPagePreview page bodies read. The DB schema stays snake_case;
  // only the preview input is translated so the cards render identically to the
  // Styles → Cut & Sew cards.
  const previewData = useMemo(() => ({
    styleNumber: draft.code || '',
    collection: '',
    season: '',
    revision: draft.version || '',
    colorways: [],
    sizeRange: draft.sizes || [],
    // Flat Lay — slots flatlay-front / flatlay-back (no mapping needed)
    // Call Outs — pass undefined when empty so the shared body falls back to
    // its 4-card default (identical to the Styles preview).
    constructionDetailsPage1: (draft.callout_details_page1 && draft.callout_details_page1.length) ? draft.callout_details_page1 : undefined,
    constructionDetailsPage2: (draft.callout_details_page2 && draft.callout_details_page2.length) ? draft.callout_details_page2 : undefined,
    // Stitching
    seams: (draft.seams || []).map(s => ({
      operation: s.operation,
      seamType: s.seam_type,
      stitchType: s.stitch_type,
      machine: s.machine,
      spiSpcm: s.spi_spcm,
      threadColor: s.thread_color,
      threadType: s.thread_type,
      notes: s.notes,
    })),
    seamStitchBlocks: draft.seam_stitch_blocks || [],
    // Pattern & Cutting
    patternPieces: (draft.pattern_pieces || []).map(p => ({
      pieceNum: p.piece_num,
      pieceName: p.piece_name,
      quantity: p.quantity,
      fabric: p.fabric,
      grain: p.grain,
      fusing: p.fusing,
      notes: p.notes,
    })),
    cuttingInstructions: draft.cutting_instructions || '',
    pickedFabrics: [],
    // POM
    poms: draft.pom_rows || [],
    sizeType: draft.pom_size_type || 'apparel',
    measurementMethod: draft.pom_measurement_method || '',
    // Size Grading
    gradedSizeMatrix: draft.graded_size_matrix || { baseSize: 'M', grading: [] },
  }), [draft]);

  const previewStep = STEPS.findIndex(s => s.id === PAGE_TO_STEP_ID[activePage.id]);

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
          <p style={{ fontSize: 11, color: FR.stone, marginBottom: 14, fontStyle: 'italic' }}>
            Front and back technical flats. Each maximised to A4 landscape so callouts stay legible on the printed page.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <PhotoUpload label="Front" slotKey="flatlay-front" images={images} onUpload={handleImgUpload} onRemove={handleImgRemove} aspect="1.414 / 1" />
            <PhotoUpload label="Back"  slotKey="flatlay-back"  images={images} onUpload={handleImgUpload} onRemove={handleImgRemove} aspect="1.414 / 1" />
          </div>
          <Textarea label="Flat Lay Notes" value={draft.flat_lay_notes} onChange={v => set({ flat_lay_notes: v })} rows={3} placeholder="Callouts, annotations, measurement notes…" />
        </div>
      );

      case 'callouts1': {
        const entries1 = ((draft.callout_details_page1 && draft.callout_details_page1.length) ? draft.callout_details_page1 : DEFAULT_CALLOUTS_PAGE1).slice(0, 4);
        return (
        <div style={CARD}>
          <h4 style={SECTION_HEAD}>Call Outs — Page 1</h4>
          <p style={{ fontSize: 11, color: FR.stone, marginBottom: 14, fontStyle: 'italic' }}>
            Click the garment image on the left to drop a numbered dot for each call-out, then add a main close-up, an optional supporting image, and the description.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 0.55fr) 1.45fr', gap: 18, alignItems: 'stretch' }}>
            <CalloutGarmentRef
              label="Garment Reference"
              slotKey="sketch-callout-page1"
              images={images}
              onUpload={handleImgUpload}
              onRemove={handleImgRemove}
              entries={entries1}
              onSetDot={(num, dot) => setCalloutDot(1, num, dot)}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignContent: 'start' }}>
              {entries1.map((entry, i) => (
                <CalloutDetailCard
                  key={entry.num}
                  entry={entry}
                  onChange={next => updCallout(1, i, next)}
                  images={images}
                  onUpload={handleImgUpload}
                  onRemove={handleImgRemove}
                />
              ))}
            </div>
          </div>
        </div>
      );
      }

      case 'callouts2': {
        const entries2 = ((draft.callout_details_page2 && draft.callout_details_page2.length) ? draft.callout_details_page2 : DEFAULT_CALLOUTS_PAGE2).slice(0, 4);
        return (
        <div style={CARD}>
          <h4 style={SECTION_HEAD}>Call Outs — Page 2</h4>
          <p style={{ fontSize: 11, color: FR.stone, marginBottom: 14, fontStyle: 'italic' }}>
            Continue callout details for a second page of construction references. Click the garment to place dots 5–8.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 0.55fr) 1.45fr', gap: 18, alignItems: 'stretch' }}>
            <CalloutGarmentRef
              label="Garment Reference"
              slotKey="sketch-callout-page2"
              images={images}
              onUpload={handleImgUpload}
              onRemove={handleImgRemove}
              entries={entries2}
              onSetDot={(num, dot) => setCalloutDot(2, num, dot)}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignContent: 'start' }}>
              {entries2.map((entry, i) => (
                <CalloutDetailCard
                  key={entry.num}
                  entry={entry}
                  onChange={next => updCallout(2, i, next)}
                  images={images}
                  onUpload={handleImgUpload}
                  onRemove={handleImgRemove}
                />
              ))}
            </div>
          </div>
        </div>
      );
      }

      case 'stitching': return (
        <div style={CARD}>
          <h4 style={SECTION_HEAD}>Stitching</h4>

          {/* Stitch reference image blocks — up to six modular 2:3 vertical cells */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ ...SECTION_LABEL, marginBottom: 0 }}>Stitch Reference Images</label>
              {hiddenBlocks.length > 0 && (
                <button
                  onClick={() => { const next = stitchBlocks.find(b => b.hidden); if (next) showStitchBlock(next.num); }}
                  style={{ background: 'none', border: `0.5px dashed ${FR.soil}`, borderRadius: 4, padding: '4px 10px', fontSize: 10, color: FR.soil, cursor: 'pointer', fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase' }}
                >
                  + Add stitch ({hiddenBlocks.length} hidden)
                </button>
              )}
            </div>
            <p style={{ fontSize: 11, color: FR.stone, marginBottom: 12, fontStyle: 'italic' }}>
              Up to six modular 2:3 stitch image blocks. Each shows the actual stitch the factory will run; labels cross-reference the Stitch Type column below. Hide a block with × if you don't need it.
            </p>
            {visibleBlocks.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', border: `0.5px dashed ${FR.sand}`, borderRadius: 6, color: FR.stone, fontStyle: 'italic', fontSize: 11, background: FR.salt }}>
                All stitch reference blocks hidden. Click <strong>+ Add stitch</strong> above to bring one back.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleBlocks.length}, minmax(0, 1fr))`, gap: 12 }}>
                {visibleBlocks.map(b => (
                  <StitchBlockCard
                    key={b.num}
                    block={b}
                    onChange={next => updStitchBlock(b.num, next)}
                    onHide={() => hideStitchBlock(b.num)}
                    images={images}
                    onUpload={handleImgUpload}
                    onRemove={handleImgRemove}
                  />
                ))}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={SECTION_LABEL}>Seam &amp; Stitch Specification</label>
            <ArrayTable
              headers={SEAM_HEADERS}
              rows={seamRows}
              onUpdate={updSeam}
              onAdd={addSeam}
              onRemove={rmSeam}
            />
          </div>

          <CutSewLaborCostBlock data={laborData} set={laborSet} sectionLabel={SECTION_LABEL} />
          <CutSewCostChat data={laborData} set={laborSet} sectionLabel={SECTION_LABEL} />
        </div>
      );

      case 'pattern': return (
        <div style={CARD}>
          <h4 style={SECTION_HEAD}>Pattern &amp; Cutting</h4>

          <PhotoUpload label="Pattern Pieces Layout" slotKey="pattern-layout" images={images} onUpload={handleImgUpload} onRemove={handleImgRemove} />

          <div style={{ marginBottom: 10 }}>
            <label style={SECTION_LABEL}>Pattern Piece Index</label>
            <ArrayTable
              headers={PIECE_HEADERS}
              rows={pieceRows}
              onUpdate={updPiece}
              onAdd={addPiece}
              onRemove={rmPiece}
            />
          </div>

          <Textarea label="Cutting Instructions" value={draft.cutting_instructions} onChange={v => set({ cutting_instructions: v })} rows={3} placeholder="Marker plan, nap direction, utilisation target, shrinkage allowance…" />
        </div>
      );

      case 'pom': {
        const pomRows = pomEditRows;
        const szH = draft.pom_size_type === 'waist'
          ? [{ key: 's', label: 'W30' }, { key: 'm', label: 'W32' }, { key: 'l', label: 'W34' }, { key: 'xl', label: 'W36' }]
          : [{ key: 's', label: 'S' }, { key: 'm', label: 'M' }, { key: 'l', label: 'L' }, { key: 'xl', label: 'XL' }];

        return (
          <div style={CARD}>
            <h4 style={SECTION_HEAD}>Points of Measure</h4>

            <PhotoUpload label="POM Diagram (numbered measurement points)" slotKey="pom-diagram" images={images} onUpload={handleImgUpload} onRemove={handleImgRemove} />

            <Field label="Size type">
              <select value={draft.pom_size_type || 'apparel'} onChange={e => set({ pom_size_type: e.target.value })} style={INPUT_STYLE}>
                <option value="apparel">Apparel (S / M / L / XL)</option>
                <option value="waist">Waist (W30 / W32 / W34 / W36)</option>
                <option value="one-size">One size</option>
              </select>
            </Field>

            {draft.pom_size_type !== 'one-size' && (
              <div style={{ marginTop: 14, marginBottom: 10 }}>
                <label style={SECTION_LABEL}>Graded Spec Table (cm)</label>
                <ArrayTable
                  headers={[
                    { key: '__idx', label: '#', render: (_v, _onChange, row) => (
                      <span style={{ fontSize: 11, color: FR.stone, padding: '3px 4px' }}>{pomRows.indexOf(row) + 1}</span>
                    ) },
                    { key: 'name', label: 'Measurement', placeholder: 'Chest Width' },
                    ...szH,
                    { key: 'method', label: 'Method', placeholder: 'Lay flat / Tape' },
                  ]}
                  rows={pomRows}
                  onUpdate={updPom}
                  onAdd={addPom}
                  onRemove={rmPom}
                />
              </div>
            )}

            <Textarea label="Measurement Method" value={draft.pom_measurement_method} onChange={v => set({ pom_measurement_method: v })} rows={2} placeholder="Lay garment flat on table. Smooth without stretching. Measure with flexible tape." />
            <p style={{ fontSize: 10, color: FR.stone, marginTop: 8, fontStyle: 'italic' }}>
              All measurements in centimetres. Measure flat, relaxed. Tolerance ±1 cm unless otherwise specified.
            </p>
          </div>
        );
      }

      case 'grading': {
        const sizes = draft.sizes || ['S', 'M', 'L', 'XL'];
        const baseSize = sizes.includes(gradingMatrix.baseSize) ? gradingMatrix.baseSize : sizes[0];
        const poms = (draft.pom_rows || []).filter(p => p.name);

        const deltaFor = (pomName, size) => {
          const g = (gradingMatrix.grading || []).find(x => x.pomName === pomName);
          const v = g?.perSizeDelta?.[size];
          return (v === undefined || v === null || isNaN(v)) ? null : Number(v);
        };

        const baseValueFor = (pom) => {
          const key = baseSize.toLowerCase();
          const n = parseFloat(pom[key]);
          return isFinite(n) ? n : null;
        };

        const cellFor = (pom, size) => {
          const base = baseValueFor(pom);
          if (size === baseSize) return base !== null ? base.toFixed(1) : '—';
          const d = deltaFor(pom.name, size);
          if (d === null || base === null) return '—';
          return (base + d).toFixed(1);
        };

        const cellStyle = { width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '3px 4px', textAlign: 'center', color: FR.slate, outline: 'none', fontFamily: "'Helvetica Neue', sans-serif" };

        return (
          <div style={CARD}>
            <h4 style={SECTION_HEAD}>Size Grading</h4>
            <p style={{ fontSize: 11, color: FR.stone, marginBottom: 14, lineHeight: 1.5 }}>
              Sizes are pulled from the Identity page. Select the sample size — its values come from the POM page. Enter per-size deltas for all other sizes; final values are computed as <code style={{ fontFamily: 'ui-monospace,Menlo,monospace', background: FR.salt, padding: '1px 5px', borderRadius: 3 }}>sample + delta</code>.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 18 }}>
              <div>
                <label style={SECTION_LABEL}>Sizes (from Identity page)</label>
                <div style={{ width: '100%', padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 13, color: FR.stone, background: FR.salt, boxSizing: 'border-box', fontFamily: 'ui-monospace,Menlo,monospace' }}>
                  {sizes.join(', ')}
                </div>
              </div>
              <div>
                <label style={SECTION_LABEL}>Sample Size</label>
                <select
                  value={baseSize}
                  onChange={e => set({ graded_size_matrix: { ...gradingMatrix, baseSize: e.target.value } })}
                  style={{ width: '100%', padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 13, color: FR.slate, background: '#fff' }}
                >
                  {sizes.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {poms.length === 0 ? (
              <div style={{ padding: 16, background: FR.salt, border: `1px dashed ${FR.sand}`, borderRadius: 6, fontSize: 12, color: FR.stone, fontStyle: 'italic' }}>
                Add at least one row on the Points of Measure page to grade.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '5px 8px', background: FR.slate, color: FR.salt, fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Measurement</th>
                      {sizes.map(s => (
                        <th key={s} colSpan={2} style={{ textAlign: 'center', padding: '5px 8px', background: s === baseSize ? FR.soil : FR.slate, color: FR.salt, fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                          {s}{s === baseSize ? ' · sample' : ''}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <th style={{ background: FR.salt }} />
                      {sizes.map(s => (
                        <React.Fragment key={s}>
                          <th style={{ padding: '3px 4px', fontSize: 8, color: FR.stone, fontWeight: 500, background: FR.salt, borderBottom: `1px solid ${FR.sand}` }}>Δ</th>
                          <th style={{ padding: '3px 4px', fontSize: 8, color: FR.stone, fontWeight: 500, background: FR.salt, borderBottom: `1px solid ${FR.sand}` }}>cm</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {poms.map((pom, ri) => (
                      <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : FR.salt }}>
                        <td style={{ padding: '4px 8px', fontSize: 11, color: FR.slate, borderBottom: `0.5px solid ${FR.sand}` }}>{pom.name}</td>
                        {sizes.map(sz => (
                          <React.Fragment key={sz}>
                            <td style={{ padding: 0, borderBottom: `0.5px solid ${FR.sand}` }}>
                              <input
                                type="number" step="0.1"
                                value={sz === baseSize ? '' : (deltaFor(pom.name, sz) ?? '')}
                                disabled={sz === baseSize}
                                onChange={e => updGradingDelta(pom.name, sz, e.target.value)}
                                placeholder={sz === baseSize ? '—' : '±'}
                                style={{ ...cellStyle, opacity: sz === baseSize ? 0.4 : 1, background: sz === baseSize ? FR.salt : 'transparent' }}
                              />
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'center', fontSize: 11, color: FR.stone, borderBottom: `0.5px solid ${FR.sand}`, background: sz === baseSize ? FR.salt : 'transparent', opacity: sz === baseSize ? 0.7 : 1 }}>
                              {cellFor(pom, sz)}
                            </td>
                          </React.Fragment>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
        {activePage.id === 'identity' ? (
          // Identity is a library-only "Block Info" page with no Styles
          // equivalent — keep the block-summary card for it.
          <CutSewBOMPreview block={draft} activePage="identity" />
        ) : (
          // Every Cut & Sew page reuses the exact same renderer the Styles
          // builder uses, so the cards are pixel-identical.
          <TechPackPagePreview data={previewData} images={previewImages} step={previewStep} />
        )}
      </div>
    </div>
  );
}
