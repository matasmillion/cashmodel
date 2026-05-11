// Fabric detail / editor — 2-column shell. Form on the left (scroll),
// live tech-pack-aligned preview on the right. The right preview is the
// same component the tech pack itself uses for page 03 — they cannot
// drift.
//
// Notable behaviors:
//   • The fabric is either KNIT or WOVEN — picked at the top, drives which
//     weaves are selectable.
//   • Mill finishes are internal addons that adjust price/m and price/kg.
//     Each carries an executed-at field (mill / secondary / at_treatment)
//     so the picker can override per-style.
//   • Ribbing only renders for knit fabrics — it's the matched 2×2 rib
//     held alongside the main mill fabric.
//   • The version field is read-only. To bump (v1.0 → v1.1) the user
//     clicks the "Bump version" button — there's no free-text editing.
//   • AI auto-fill: drop a mill's color card (image or PDF, Chinese OK)
//     into the FabricAIExtract modal; Claude returns structured fields
//     and the user reviews before applying.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Save, Trash2, Sparkles, FileDown, Plus, Loader2, X } from 'lucide-react';
import { FR } from './techPackConstants';
import { saveFabric, archiveFabric, restoreFabric } from '../../utils/fabricStore';
import {
  FABRIC_CATEGORIES, FABRIC_WEAVES, FABRIC_WEAVE_LABEL, FABRIC_STATUSES,
  FABRIC_GARMENT_AREAS, FINISH_EXECUTED_AT, MILL_FINISH_CATALOG,
  weavesForCategory, categoryForWeave, bumpVersion,
} from '../../utils/fabricLibrary';
import { getUsdCnyRate, cnyToUsd, usdToCny } from '../../utils/fxRates';
import { generateFabricBOMPDF } from '../../utils/fabricBOMPDF';
import VendorPicker from './VendorPicker';
import FileSlot from './FileSlot';
import SimpleImageSlot from './SimpleImageSlot';
import MultiImageSlot from './MultiImageSlot';
import FabricAIExtract from './FabricAIExtract';
import FabricBOMPreview from './FabricBOMPreview';
import { migrateLegacyCoverIfNeeded, isLegacyDataUrl, uploadAsset } from '../../utils/plmAssets';

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

const LABEL_STYLE = { fontSize: 10, color: FR.stone, marginBottom: 2, display: 'block', letterSpacing: 0.2, textTransform: 'uppercase', fontWeight: 600 };

const CARD_STYLE = {
  background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)',
  borderRadius: 8, padding: 14,
};

const SECTION_TITLE = {
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

// Infer a 3-letter file kind tag for the docs list. The actual mime type
// is whatever the browser sniffed at upload time; this is just a label.
function docKind(name = '') {
  const lower = (name || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'PDF';
  if (/\.(jpe?g|png|webp|gif|heic|heif|avif)$/.test(lower)) return 'IMG';
  if (/\.(docx?|rtf|odt)$/.test(lower)) return 'DOC';
  if (/\.(xlsx?|csv|numbers)$/.test(lower)) return 'XLS';
  if (/\.(txt|md)$/.test(lower)) return 'TXT';
  if (/\.(zip|rar|7z)$/.test(lower)) return 'ZIP';
  return 'FILE';
}

function DocumentsCard({ docs, onChange, fabricId }) {
  const [busy, setBusy] = useState(false);
  const onPick = async (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    if (!list.length || !fabricId) return;
    setBusy(true);
    try {
      const uploaded = await Promise.all(list.map(async (f, i) => {
        try {
          const ref = await uploadAsset({
            scope: 'fabrics',
            ownerId: fabricId,
            slot: `doc-${Date.now()}-${i}`,
            blob: f,
            skipCompress: true,
          });
          return { ...ref, name: f.name || `file-${i + 1}`, kind: docKind(f.name), uploaded_at: new Date().toISOString() };
        } catch (err) { console.error('Document upload:', err); return null; }
      }));
      onChange([...(docs || []), ...uploaded.filter(Boolean)]);
    } finally { setBusy(false); }
  };
  const removeAt = (i) => onChange(docs.filter((_, idx) => idx !== i));
  return (
    <div style={CARD_STYLE}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <h4 style={{ ...SECTION_TITLE, marginBottom: 0 }}>Documents</h4>
        <span style={{ fontSize: 10, color: FR.stone }}>
          {(docs || []).length} file{(docs || []).length === 1 ? '' : 's'} · AI source cards auto-saved
        </span>
      </div>
      {(docs || []).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {docs.map((doc, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: FR.salt, borderRadius: 4, fontSize: 11 }}>
              <span style={{ background: FR.sand, padding: '1px 6px', borderRadius: 3, fontSize: 8, letterSpacing: 0.5, textTransform: 'uppercase', color: FR.soil, fontWeight: 600 }}>
                {doc.kind || docKind(doc.name)}
              </span>
              <span style={{ flex: 1, color: FR.slate, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name || 'Untitled'}</span>
              <span style={{ fontSize: 9, color: FR.stone, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                {doc.uploaded_at ? doc.uploaded_at.slice(0, 10) : ''}
              </span>
              <button onClick={() => removeAt(i)} title="Remove"
                style={{ background: 'transparent', border: 'none', color: FR.stone, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, border: `1px dashed ${FR.sand}`, borderRadius: 4, fontSize: 11, color: busy ? FR.stone : FR.soil, fontStyle: busy ? 'italic' : 'normal', cursor: busy ? 'wait' : 'pointer', fontWeight: 600 }}>
        {busy ? 'Uploading…' : '+ Drop or click to add files'}
        <input type="file" multiple onChange={onPick} disabled={busy}
          accept="image/*,application/pdf,.txt,.md,.doc,.docx,.xlsx,.xls,.csv,.zip"
          style={{ display: 'none' }} />
      </label>
    </div>
  );
}

export default function FabricBuilder({ fabric, onBack }) {
  const [draft, setDraft] = useState(fabric);
  const [savedAt, setSavedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [fx, setFx] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(fabric));

  useEffect(() => {
    setDraft(fabric);
    setSavedSnapshot(JSON.stringify(fabric));
  }, [fabric.id]);

  useEffect(() => {
    let cancelled = false;
    getUsdCnyRate().then(r => { if (!cancelled) setFx(r); })
      .catch(err => console.error('FabricBuilder FX:', err));
    return () => { cancelled = true; };
  }, []);

  // Backfill the missing side of any USD/CNY pair the moment FX resolves
  // (or when the user switches fabrics). Without this, a fabric saved with
  // only the RMB side filled in (because FX hadn't loaded when the user
  // first typed) shows USD = 0 forever, until the user touches the RMB
  // input again. Only fills the empty side; never overwrites an existing value.
  useEffect(() => {
    if (!fx?.usdPerCny) return;
    const patch = {};
    const m = (a, b, dir) => {
      const aVal = parseFloat(draft[a] || 0);
      const bVal = parseFloat(draft[b] || 0);
      if (!aVal && bVal) patch[a] = dir === 'cny->usd' ? cnyToUsd(bVal, fx.usdPerCny) : usdToCny(bVal, fx.usdPerCny);
    };
    m('price_per_meter_usd', 'price_per_meter_cny', 'cny->usd');
    m('price_per_meter_cny', 'price_per_meter_usd', 'usd->cny');
    m('price_per_kg_usd', 'price_per_kg_cny', 'cny->usd');
    m('price_per_kg_cny', 'price_per_kg_usd', 'usd->cny');
    if (Object.keys(patch).length) set(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx?.usdPerCny, draft.id]);

  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return undefined;
    if (!isLegacyDataUrl(draft?.cover_image)) return undefined;
    if (!draft?.id) return undefined;
    migratedRef.current = true;
    let cancelled = false;
    (async () => {
      const newPath = await migrateLegacyCoverIfNeeded(draft.cover_image, { scope: 'fabrics', ownerId: draft.id });
      if (cancelled || !newPath) return;
      setDraft(d => ({ ...d, cover_image: newPath }));
      try { await saveFabric(draft.id, { cover_image: newPath }); }
      catch (err) { console.error('FabricBuilder lazy migration save:', err); }
    })();
    return () => { cancelled = true; };
  }, [draft?.id, draft?.cover_image]);

  const dirty = useMemo(() => JSON.stringify(draft) !== savedSnapshot, [draft, savedSnapshot]);

  const set = (patch) => setDraft(d => ({ ...d, ...patch }));

  const setPrice = (kind, currency, raw) => {
    const value = parseFloat(raw);
    const safe = Number.isFinite(value) ? value : 0;
    const usdKey = kind === 'meter' ? 'price_per_meter_usd' : 'price_per_kg_usd';
    const cnyKey = kind === 'meter' ? 'price_per_meter_cny' : 'price_per_kg_cny';
    const patch = {};
    if (currency === 'usd') {
      patch[usdKey] = safe;
      if (fx?.usdPerCny) patch[cnyKey] = usdToCny(safe, fx.usdPerCny) ?? 0;
    } else {
      patch[cnyKey] = safe;
      if (fx?.usdPerCny) patch[usdKey] = cnyToUsd(safe, fx.usdPerCny) ?? 0;
    }
    set(patch);
  };

  const setCategory = (category) => {
    const current = FABRIC_WEAVES.find(w => w.id === draft.weave);
    if (current && current.category !== category && current.id !== 'other') {
      const fallback = weavesForCategory(category)[0]?.id || 'other';
      set({ category, weave: fallback });
    } else {
      set({ category });
    }
  };

  const setWeave = (weaveId) => {
    set({ weave: weaveId, category: categoryForWeave(weaveId) || draft.category });
  };

  // ─── Mill finish helpers ───────────────────────────────────────────────
  const finishes = draft.mill_finishes || [];
  const addFinish = () => {
    set({
      mill_finishes: [
        ...finishes,
        { name: '', delta_per_meter_usd: 0, delta_per_meter_cny: 0,
          delta_per_kg_usd: 0, delta_per_kg_cny: 0,
          executed_at: 'mill', vendor_id: '' },
      ],
    });
  };
  const updateFinish = (i, patch) => {
    set({
      mill_finishes: finishes.map((f, idx) => idx === i ? { ...f, ...patch } : f),
    });
  };
  const removeFinish = (i) => {
    set({ mill_finishes: finishes.filter((_, idx) => idx !== i) });
  };
  // Mirror USD/CNY for finish deltas as the user types one side.
  const setFinishDelta = (i, kind /* 'meter' | 'kg' */, currency /* 'usd' | 'cny' */, raw) => {
    const value = parseFloat(raw);
    const safe = Number.isFinite(value) ? value : 0;
    const usdKey = kind === 'meter' ? 'delta_per_meter_usd' : 'delta_per_kg_usd';
    const cnyKey = kind === 'meter' ? 'delta_per_meter_cny' : 'delta_per_kg_cny';
    const patch = {};
    if (currency === 'usd') {
      patch[usdKey] = safe;
      if (fx?.usdPerCny) patch[cnyKey] = usdToCny(safe, fx.usdPerCny) ?? 0;
    } else {
      patch[cnyKey] = safe;
      if (fx?.usdPerCny) patch[usdKey] = cnyToUsd(safe, fx.usdPerCny) ?? 0;
    }
    updateFinish(i, patch);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const snapshotAtSave = JSON.stringify(draft);
    try {
      const { id, ...updates } = draft;
      await saveFabric(id, updates);
      setSavedSnapshot(snapshotAtSave);
      setSavedAt(new Date());
    } catch (err) {
      console.error('FabricBuilder save:', err);
    } finally {
      setSaving(false);
    }
  };

  const draftRef = useRef(draft);
  const savingRef = useRef(saving);
  const savedSnapshotRef = useRef(savedSnapshot);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { savingRef.current = saving; }, [saving]);
  useEffect(() => { savedSnapshotRef.current = savedSnapshot; }, [savedSnapshot]);

  useEffect(() => () => {
    const current = JSON.stringify(draftRef.current);
    if (current !== savedSnapshotRef.current && draftRef.current?.id) {
      const { id, ...updates } = draftRef.current;
      saveFabric(id, updates).catch(err => console.error('FabricBuilder flush:', err));
    }
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    const timer = setTimeout(() => {
      if (savingRef.current) return;
      save();
    }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty]);

  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const onBumpVersion = async () => {
    const next = bumpVersion(draft.version);
    set({ version: next });
    try { await saveFabric(draft.id, { version: next }); }
    catch (err) { console.error('bump version:', err); }
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

  const onExportPDF = async () => {
    setExporting(true);
    try { await generateFabricBOMPDF(draft); }
    catch (err) { console.error('Export BOM PDF:', err); alert(err?.message || 'PDF export failed'); }
    finally { setExporting(false); }
  };

  const onApplyAI = async (patch) => {
    setAiOpen(false);
    const { _aiSourceFiles, ...rest } = patch || {};

    // Archive the raw mill-card files the user dropped into the AI parser.
    // We always want the original card preserved for reference, even though
    // the parsed fields become the source of truth on the form.
    let newDocs = [];
    if (Array.isArray(_aiSourceFiles) && _aiSourceFiles.length && draft.id) {
      try {
        const uploaded = await Promise.all(_aiSourceFiles.map(async (f, i) => {
          try {
            const ref = await uploadAsset({
              scope: 'fabrics',
              ownerId: draft.id,
              slot: `doc-ai-${Date.now()}-${i}`,
              blob: f,
              skipCompress: true,
            });
            return { ...ref, name: f.name || `mill-card-${i + 1}`, kind: 'ai-source', uploaded_at: new Date().toISOString() };
          } catch (err) {
            console.error('AI source upload:', err);
            return null;
          }
        }));
        newDocs = uploaded.filter(Boolean);
      } catch (err) {
        console.error('FabricBuilder save AI sources:', err);
      }
    }

    setDraft(d => {
      const next = { ...d, ...rest };
      if (Array.isArray(rest.color_card_images) && rest.color_card_images.length) {
        const existing = Array.isArray(d.color_card_images) ? d.color_card_images : [];
        const seen = new Set(existing.map(c => (c.hex || '').toLowerCase() || (c.label || '').trim().toLowerCase()).filter(Boolean));
        const additions = rest.color_card_images.filter(c => {
          const key = (c.hex || '').toLowerCase() || (c.label || '').trim().toLowerCase();
          if (!key) return true;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        next.color_card_images = [...existing, ...additions];
      } else {
        next.color_card_images = d.color_card_images || [];
      }
      if (newDocs.length) {
        next.documents = [...(d.documents || []), ...newDocs];
      }
      return next;
    });
  };

  const status = draft.status || 'draft';
  const pill = STATUS_PILL[status] || STATUS_PILL.draft;
  const category = draft.category || categoryForWeave(draft.weave);
  const availableWeaves = weavesForCategory(category);
  const isKnit = (category || 'knit') === 'knit';

  return (
    <div>
      {/* ─── Top bar ────────────────────────────────────────────────── */}
      <button onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: FR.stone, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 10 }}>
        <ArrowLeft size={13} /> Fabrics
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <input
            value={draft.mill_fabric_no || ''}
            onChange={e => set({ mill_fabric_no: e.target.value })}
            placeholder="Mill fabric #"
            style={{ fontFamily: "'General Sans', 'Inter', system-ui, sans-serif", fontWeight: 600, fontSize: 26, color: FR.slate, border: 'none', outline: 'none', background: 'transparent', width: '100%', letterSpacing: 0.2 }}
          />
          <input
            value={draft.name || ''}
            onChange={e => set({ name: e.target.value })}
            placeholder="Descriptive name (optional)"
            style={{ fontFamily: "'General Sans', 'Inter', system-ui, sans-serif", fontWeight: 400, fontSize: 14, color: FR.stone, border: 'none', outline: 'none', background: 'transparent', width: '100%', marginTop: 2 }}
          />
          <div style={{ fontSize: 10, color: FR.stone, marginTop: 4, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{FABRIC_WEAVE_LABEL[draft.weave] || draft.weave}</span>
            <span>·  {(category || 'knit').toUpperCase()}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px', background: FR.salt, borderRadius: 3, color: FR.slate }}>
              {draft.version}
              <button onClick={onBumpVersion} title="Bump version"
                style={{ background: 'transparent', border: 'none', color: FR.soil, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                <Plus size={11} />
              </button>
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setAiOpen(true)} title="Auto-fill from mill fabric card"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: FR.salt, color: FR.soil, border: `1px solid ${FR.sand}`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            <Sparkles size={12} /> AI auto-fill
          </button>
          <button onClick={onExportPDF} disabled={exporting}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: 'transparent', color: FR.slate, border: `1px solid ${FR.sand}`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: exporting ? 'wait' : 'pointer' }}>
            <FileDown size={12} /> {exporting ? 'Exporting…' : 'Export BOM PDF'}
          </button>
          <select
            value={status}
            onChange={e => set({ status: e.target.value })}
            style={{ background: pill.bg, color: pill.fg, padding: '5px 9px', borderRadius: 5, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, border: 'none', cursor: 'pointer' }}
          >
            {FABRIC_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={toggleArchive}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 9px', background: 'transparent', color: FR.stone, border: `1px solid ${FR.sand}`, borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
            <Trash2 size={11} /> {status === 'archived' ? 'Restore' : 'Archive'}
          </button>
          <button onClick={save} disabled={!dirty || saving} title={dirty ? 'Save now (autosaves on its own)' : 'All changes saved'}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: dirty ? FR.slate : FR.sand, color: dirty ? FR.salt : FR.stone, border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: dirty && !saving ? 'pointer' : 'not-allowed', opacity: saving ? 0.85 : 1 }}>
            {saving ? <Loader2 size={12} className="spin" /> : <Save size={12} />}
            {saving ? 'Saving…' : dirty ? 'Unsaved' : 'Saved'}
          </button>
        </div>
      </div>

      <div style={{ fontSize: 10, color: FR.stone, marginBottom: 8, height: 14 }}>
        {saving ? 'Saving…'
          : dirty ? 'Unsaved changes — autosaving in a moment'
          : savedAt ? `Auto-saved ${savedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
          : ''}
      </div>

      {/* ─── 2-column shell: form left, live preview right ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: 14, alignItems: 'flex-start' }}>

        {/* LEFT — form cards stacked */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Identity */}
          <div style={CARD_STYLE}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h4 style={SECTION_TITLE}>Identity</h4>
              <div style={{ display: 'flex', background: FR.salt, borderRadius: 6, padding: 2, gap: 2 }}>
                {FABRIC_CATEGORIES.map(c => (
                  <button key={c.id} onClick={() => setCategory(c.id)}
                    style={{
                      padding: '4px 14px',
                      background: category === c.id ? FR.slate : 'transparent',
                      color: category === c.id ? FR.salt : FR.stone,
                      border: 'none', borderRadius: 4,
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      letterSpacing: 0.3,
                    }}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <Field label="Weave">
                <select value={draft.weave} onChange={e => setWeave(e.target.value)} style={INPUT_STYLE}>
                  {availableWeaves.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                </select>
              </Field>
              <Field label="Composition">
                <input value={draft.composition || ''} onChange={e => set({ composition: e.target.value })} placeholder="100% Cotton" style={INPUT_STYLE} />
              </Field>
              <Field label="Hand / feel">
                <input value={draft.hand || ''} onChange={e => set({ hand: e.target.value })} placeholder="Soft, dry" style={INPUT_STYLE} />
              </Field>
            </div>
          </div>

          {/* Spec */}
          <div style={CARD_STYLE}>
            <h4 style={SECTION_TITLE}>Spec</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
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
            </div>
          </div>

          {/* Sourcing */}
          <div style={CARD_STYLE}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <h4 style={{ ...SECTION_TITLE, marginBottom: 0 }}>Sourcing</h4>
              <span style={{ fontSize: 9, color: FR.stone, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {fx?.usdPerCny
                  ? `USD/CNY ${fx.usdPerCny.toFixed(4)}${fx.stale ? ' · cached' : ''}`
                  : 'Loading FX…'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <Field label="Vendor">
                <VendorPicker value={draft.mill_id} onChange={v => set({ mill_id: v })} placeholder="Select vendor…" />
              </Field>
              <Field label="Lead time (days)">
                <input type="number" value={draft.lead_time_days ?? 0} onChange={e => set({ lead_time_days: parseInt(e.target.value, 10) || 0 })} style={INPUT_STYLE} />
              </Field>
              <Field label="MOQ (meters)">
                <input type="number" value={draft.moq_meters ?? 0} onChange={e => set({ moq_meters: parseInt(e.target.value, 10) || 0 })} style={INPUT_STYLE} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              <Field label="Price / m (USD)">
                <input type="number" step="0.01" value={draft.price_per_meter_usd ?? 0} onChange={e => setPrice('meter', 'usd', e.target.value)} style={INPUT_STYLE} />
              </Field>
              <Field label="Price / m (RMB)">
                <input type="number" step="0.01" value={draft.price_per_meter_cny ?? 0} onChange={e => setPrice('meter', 'cny', e.target.value)} style={INPUT_STYLE} />
              </Field>
              <Field label="Price / kg (USD)">
                <input type="number" step="0.01" value={draft.price_per_kg_usd ?? 0} onChange={e => setPrice('kg', 'usd', e.target.value)} style={INPUT_STYLE} />
              </Field>
              <Field label="Price / kg (RMB)">
                <input type="number" step="0.01" value={draft.price_per_kg_cny ?? 0} onChange={e => setPrice('kg', 'cny', e.target.value)} style={INPUT_STYLE} />
              </Field>
            </div>
          </div>

          {/* Where on garment (NEW) */}
          <div style={CARD_STYLE}>
            <h4 style={SECTION_TITLE}>Where on garment</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14, alignItems: 'flex-start' }}>
              <SimpleImageSlot
                value={draft.garment_placement_image_url}
                onChange={v => set({ garment_placement_image_url: v })}
                label=""
                hint="2:3 placement"
                height={180}
                assetScope="fabrics"
                assetOwnerId={draft.id}
                assetSlot="placement"
              />
              <div>
                <Field label="Area of product">
                  <select value={draft.default_garment_area || ''} onChange={e => set({ default_garment_area: e.target.value })} style={INPUT_STYLE}>
                    <option value="">— Select —</option>
                    {FABRIC_GARMENT_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </Field>
                <div style={{ marginTop: 8 }}>
                  <Field label="Notes (optional)">
                    <input
                      value={draft.garment_placement_notes || ''}
                      onChange={e => set({ garment_placement_notes: e.target.value })}
                      placeholder="Main body and hood; not sleeves"
                      style={INPUT_STYLE}
                    />
                  </Field>
                </div>
              </div>
            </div>
          </div>

          {/* Fabric finishes */}
          <div style={CARD_STYLE}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h4 style={{ ...SECTION_TITLE, marginBottom: 0 }}>Fabric finishes</h4>
              <span style={{ fontSize: 9, color: FR.stone }}>internal · adds to base price</span>
            </div>
            {finishes.length === 0 && (
              <div style={{ fontSize: 11, color: FR.stone, fontStyle: 'italic', padding: '4px 0 8px' }}>
                No finishes yet. Add brushing, antibacterial, UV, etc. — each carries its own price delta and where-it's-done.
              </div>
            )}
            {finishes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {finishes.map((f, i) => (
                  <div key={i} style={{ background: FR.salt, borderRadius: 6, padding: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 24px', gap: 8, marginBottom: 6 }}>
                      <input
                        list="mill-finish-catalog"
                        value={f.name || ''}
                        onChange={e => updateFinish(i, { name: e.target.value })}
                        placeholder="Finish name"
                        style={{ ...INPUT_STYLE, fontWeight: 600 }}
                      />
                      <select
                        value={f.executed_at || 'mill'}
                        onChange={e => updateFinish(i, { executed_at: e.target.value })}
                        style={INPUT_STYLE}
                      >
                        {FINISH_EXECUTED_AT.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                      <button onClick={() => removeFinish(i)} title="Remove finish"
                        style={{ background: 'transparent', border: 'none', color: FR.stone, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <X size={13} />
                      </button>
                    </div>
                    {f.executed_at === 'secondary' && (
                      <div style={{ marginBottom: 6 }}>
                        <VendorPicker
                          value={f.vendor_id}
                          onChange={v => updateFinish(i, { vendor_id: v })}
                          placeholder="Pick the secondary finishing facility…"
                        />
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      <Field label="+/m USD">
                        <input type="number" step="0.01" value={f.delta_per_meter_usd ?? 0}
                          onChange={e => setFinishDelta(i, 'meter', 'usd', e.target.value)}
                          style={{ ...INPUT_STYLE, textAlign: 'right', fontFamily: 'ui-monospace, Menlo, monospace' }} />
                      </Field>
                      <Field label="+/m RMB">
                        <input type="number" step="0.01" value={f.delta_per_meter_cny ?? 0}
                          onChange={e => setFinishDelta(i, 'meter', 'cny', e.target.value)}
                          style={{ ...INPUT_STYLE, textAlign: 'right', fontFamily: 'ui-monospace, Menlo, monospace' }} />
                      </Field>
                      <Field label="+/kg USD">
                        <input type="number" step="0.01" value={f.delta_per_kg_usd ?? 0}
                          onChange={e => setFinishDelta(i, 'kg', 'usd', e.target.value)}
                          style={{ ...INPUT_STYLE, textAlign: 'right', fontFamily: 'ui-monospace, Menlo, monospace' }} />
                      </Field>
                      <Field label="+/kg RMB">
                        <input type="number" step="0.01" value={f.delta_per_kg_cny ?? 0}
                          onChange={e => setFinishDelta(i, 'kg', 'cny', e.target.value)}
                          style={{ ...INPUT_STYLE, textAlign: 'right', fontFamily: 'ui-monospace, Menlo, monospace' }} />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={addFinish}
              style={{ marginTop: 10, padding: '6px 10px', background: 'transparent', color: FR.soil, border: `1px dashed ${FR.sand}`, borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', width: '100%' }}>
              + Add finish
            </button>
            <datalist id="mill-finish-catalog">
              {MILL_FINISH_CATALOG.map(n => <option key={n} value={n} />)}
            </datalist>
          </div>

          {/* Photos: front + back, side-by-side 9:16 */}
          <div style={CARD_STYLE}>
            <h4 style={SECTION_TITLE}>Fabric photos</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <SimpleImageSlot
                value={draft.front_image_url}
                onChange={v => set({ front_image_url: v })}
                label="Front"
                hint="9:16 vertical"
                height={300}
                assetScope="fabrics"
                assetOwnerId={draft.id}
                assetSlot="front"
              />
              <SimpleImageSlot
                value={draft.back_image_url}
                onChange={v => set({ back_image_url: v })}
                label="Back"
                hint="9:16 vertical"
                height={300}
                assetScope="fabrics"
                assetOwnerId={draft.id}
                assetSlot="back"
              />
            </div>
          </div>

          {/* Color card */}
          <div style={CARD_STYLE}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <h4 style={SECTION_TITLE}>Color card</h4>
              <span style={{ fontSize: 10, color: FR.stone }}>
                {(draft.color_card_images || []).length} colors · upload one image per swatch
              </span>
            </div>
            <MultiImageSlot
              value={draft.color_card_images || []}
              onChange={v => set({ color_card_images: v })}
              assetScope="fabrics"
              assetOwnerId={draft.id}
              assetSlot="swatch"
              hint="Drop swatch photos"
            />

            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `0.5px solid ${FR.sand}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <h5 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, color: FR.slate, margin: 0, letterSpacing: 0.2 }}>Original images</h5>
                <span style={{ fontSize: 10, color: FR.stone }}>raw photos of the physical color card &amp; full fabric card</span>
              </div>
              <MultiImageSlot
                value={draft.original_images || []}
                onChange={v => set({ original_images: v })}
                assetScope="fabrics"
                assetOwnerId={draft.id}
                assetSlot="original"
                hint="Drop the original card photos"
              />
            </div>
          </div>

          {/* Ribbing — knit only */}
          {isKnit && (
            <div style={CARD_STYLE}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <h4 style={{ ...SECTION_TITLE, marginBottom: 0 }}>Ribbing</h4>
                <span style={{ fontSize: 9, color: FR.stone }}>matched rib · held with the main mill fabric</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14, alignItems: 'center' }}>
                <SimpleImageSlot
                  value={draft.ribbing_image_url}
                  onChange={v => set({ ribbing_image_url: v })}
                  label=""
                  hint="Rib swatch"
                  height={120}
                  assetScope="fabrics"
                  assetOwnerId={draft.id}
                  assetSlot="ribbing"
                />
                <Field label="Rib fabric #">
                  <input
                    value={draft.ribbing_fabric_no || ''}
                    onChange={e => set({ ribbing_fabric_no: e.target.value })}
                    placeholder="ZF-RIB-340-A"
                    style={INPUT_STYLE}
                  />
                </Field>
              </div>
            </div>
          )}

          {/* CLO3D + notes */}
          <div style={CARD_STYLE}>
            <h4 style={SECTION_TITLE}>CLO3D &amp; notes</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label=".ZFAB file (CLO3D)">
                <FileSlot
                  value={draft.zfab_file_url}
                  onChange={v => set({ zfab_file_url: v })}
                  accept=".zfab,.zprj"
                  hint="Drop a .zfab fabric asset"
                />
              </Field>
              <Field label="Notes">
                <textarea
                  value={draft.notes || ''}
                  onChange={e => set({ notes: e.target.value })}
                  rows={4}
                  placeholder="Compatibility, care, certifications…"
                  style={{ ...INPUT_STYLE, resize: 'vertical' }}
                />
              </Field>
            </div>
          </div>

          {/* Documents — AI parser sources, certifications, vendor PDFs, chats */}
          <DocumentsCard
            docs={draft.documents || []}
            onChange={v => set({ documents: v })}
            fabricId={draft.id}
          />
        </div>

        {/* RIGHT — sticky live preview */}
        <div style={{ position: 'sticky', top: 12, alignSelf: 'flex-start' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, padding: '0 4px' }}>
            <h4 style={{ ...SECTION_TITLE, marginBottom: 0 }}>Live preview</h4>
            <span style={{ fontSize: 10, color: FR.stone }}>identical to tech pack page 03</span>
          </div>
          <FabricBOMPreview fabric={draft} />
        </div>
      </div>

      {aiOpen && (
        <FabricAIExtract
          onClose={() => setAiOpen(false)}
          onApply={onApplyAI}
        />
      )}
    </div>
  );
}
