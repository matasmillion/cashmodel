// Treatment detail / editor — 2-column shell. Form left (scroll),
// live tech-pack-aligned preview right (sticky). Autosaves on dirty
// with 1200ms debounce; flushes on unmount. Mirrors FabricBuilder's
// pattern exactly.
//
// Production log, digital drift, and used-in sections render below the
// 2-col shell to preserve history without cluttering the edit surface.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Save, Loader2, Sparkles, FileDown } from 'lucide-react';
import { FR } from './techPackConstants';
import { saveTreatment, getTreatment, getProductionLog, getUsedInForTreatment } from '../../utils/treatmentStore';
import { listDriftLogs } from '../../utils/productionStore';
import {
  TREATMENT_TYPES, TREATMENT_TYPE_LABEL, TREATMENT_STATUSES, LORA_BASE_MODELS,
} from '../../utils/treatmentLibrary';
import { generateTreatmentBOMPDF } from '../../utils/treatmentBOMPDF';
import VendorPicker from './VendorPicker';
import FileSlot from './FileSlot';
import SimpleImageSlot from './SimpleImageSlot';
import TreatmentAIExtract from './TreatmentAIExtract';
import TreatmentBOMPreview from './TreatmentBOMPreview';
import { migrateLegacyCoverIfNeeded, isLegacyDataUrl } from '../../utils/plmAssets';

const STATUS_PILL = {
  draft:    { bg: 'rgba(116,116,116,0.10)', fg: '#5A5A5A' },
  testing:  { bg: 'rgba(133,79,11,0.12)',   fg: '#854F0B' },
  approved: { bg: 'rgba(99,153,34,0.12)',   fg: '#3B6D11' },
  archived: { bg: 'rgba(58,58,58,0.06)',    fg: '#9A9A9A' },
};

const INPUT_STYLE = {
  width: '100%', padding: '5px 7px', border: `1px solid ${FR.sand}`,
  borderRadius: 4, fontSize: 12, color: FR.slate, background: '#fff',
  fontFamily: "'Inter', sans-serif", outline: 'none', boxSizing: 'border-box',
};

const LABEL_STYLE = {
  fontSize: 10, color: FR.stone, marginBottom: 2, display: 'block',
  letterSpacing: 0.2, textTransform: 'uppercase', fontWeight: 600,
};

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

function bumpVersion(ver = 'v1.0') {
  const m = /v(\d+)\.(\d+)/.exec(ver || '');
  if (!m) return 'v1.1';
  return `v${m[1]}.${Number(m[2]) + 1}`;
}

function defectColor(pct) {
  if (pct == null) return 'rgba(58,58,58,0.5)';
  if (pct < 0.5) return '#3B6D11';
  if (pct <= 1.0) return '#854F0B';
  return '#A32D2D';
}

function driftColor(pct) {
  if (pct == null) return 'rgba(58,58,58,0.5)';
  if (pct < 5) return '#3B6D11';
  if (pct <= 10) return '#854F0B';
  return '#A32D2D';
}

function migrateCutSewField(t) {
  if (!t) return t;
  if (t.compatible_pattern_categories && !t.compatible_cut_sew_categories) {
    return { ...t, compatible_cut_sew_categories: t.compatible_pattern_categories };
  }
  return t;
}

export default function TreatmentBuilder({ treatment: treatmentProp, treatmentId, onBack }) {
  const id = treatmentProp?.id || treatmentId;
  const [draft, setDraft] = useState(() => migrateCutSewField(treatmentProp) || null);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(migrateCutSewField(treatmentProp) || null));
  const [savedAt, setSavedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!treatmentProp && !!id);
  const [productionLog, setProductionLog] = useState([]);
  const [driftRows, setDriftRows] = useState([]);
  const [usedIn, setUsedIn] = useState([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (treatmentProp) {
      const t = migrateCutSewField(treatmentProp);
      setDraft(t);
      setSavedSnapshot(JSON.stringify(t));
      setLoading(false);
    } else if (id) {
      setLoading(true);
      getTreatment(id).then(row => {
        if (cancelled) return;
        const t = migrateCutSewField(row);
        setDraft(t);
        setSavedSnapshot(JSON.stringify(t));
        setLoading(false);
      });
    }
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    if (!id) return undefined;
    Promise.all([
      getProductionLog(id),
      listDriftLogs({ treatment_id: id }),
      getUsedInForTreatment(id),
    ]).then(([log, drift, usedInRows]) => {
      if (cancelled) return;
      setProductionLog(log);
      setDriftRows([...drift].sort((a, b) => (b.recorded_at || '').localeCompare(a.recorded_at || '')));
      setUsedIn(usedInRows);
    });
    return () => { cancelled = true; };
  }, [id]);

  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return undefined;
    if (!isLegacyDataUrl(draft?.cover_image)) return undefined;
    if (!draft?.id) return undefined;
    migratedRef.current = true;
    let cancelled = false;
    (async () => {
      const newPath = await migrateLegacyCoverIfNeeded(draft.cover_image, { scope: 'treatments', ownerId: draft.id });
      if (cancelled || !newPath) return;
      setDraft(d => ({ ...d, cover_image: newPath }));
      try { await saveTreatment(draft.id, { cover_image: newPath }); }
      catch (err) { console.error('TreatmentBuilder lazy migration save:', err); }
    })();
    return () => { cancelled = true; };
  }, [draft?.id, draft?.cover_image]);

  const dirty = useMemo(() => JSON.stringify(draft) !== savedSnapshot, [draft, savedSnapshot]);

  const set = (patch) => setDraft(d => ({ ...d, ...patch }));
  const setDigital = (key, val) => setDraft(d => ({ ...d, digital: { ...(d.digital || {}), [key]: val } }));

  const save = async () => {
    if (saving || !draft?.id) return;
    setSaving(true);
    const snap = JSON.stringify(draft);
    try {
      const { id: _id, code, created_at, ...updates } = draft;
      await saveTreatment(_id, updates);
      setSavedSnapshot(snap);
      setSavedAt(new Date());
    } catch (err) {
      console.error('TreatmentBuilder save:', err);
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
      const { id: _id, code, created_at, ...updates } = draftRef.current;
      saveTreatment(_id, updates).catch(err => console.error('TreatmentBuilder flush:', err));
    }
  }, []);

  useEffect(() => {
    if (!dirty || !draft?.id) return undefined;
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
    try { await saveTreatment(draft.id, { version: next }); }
    catch (err) { console.error('bump version:', err); }
  };

  const onExportPDF = async () => {
    setExporting(true);
    try { await generateTreatmentBOMPDF(draft); }
    catch (err) { console.error('Export Treatment PDF:', err); alert(err?.message || 'PDF export failed'); }
    finally { setExporting(false); }
  };

  const onApplyAI = (patch) => {
    setAiOpen(false);
    setDraft(d => ({ ...(d || {}), ...patch }));
  };

  if (loading) {
    return <div style={{ padding: 40, color: FR.stone, fontSize: 12 }}>Loading…</div>;
  }
  if (!draft) {
    return (
      <div style={{ padding: 40, background: FR.salt, borderRadius: 8, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: FR.slate }}>Not found</div>
        <div style={{ fontSize: 12, color: FR.stone, marginTop: 8 }}>This treatment doesn't exist or has been removed.</div>
        {onBack && (
          <button onClick={onBack} style={{ marginTop: 16, padding: '6px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
            Back to library
          </button>
        )}
      </div>
    );
  }

  const status = draft.status || 'draft';
  const pill = STATUS_PILL[status] || STATUS_PILL.draft;
  const dig = draft.digital || {};

  return (
    <div>
      <button onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: FR.stone, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 10 }}>
        <ArrowLeft size={13} /> Treatments
      </button>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <input
            value={draft.name || ''}
            onChange={e => set({ name: e.target.value })}
            placeholder="Treatment name"
            style={{ fontFamily: "'General Sans', 'Inter', system-ui, sans-serif", fontWeight: 600, fontSize: 26, color: FR.slate, border: 'none', outline: 'none', background: 'transparent', width: '100%', letterSpacing: 0.2 }}
          />
          <div style={{ fontSize: 10, color: FR.stone, marginTop: 4, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{draft.code}</span>
            <span>· {TREATMENT_TYPE_LABEL[draft.type] || draft.type}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px', background: FR.salt, borderRadius: 3, color: FR.slate }}>
              {draft.version}
              <button onClick={onBumpVersion} title="Bump version"
                style={{ background: 'transparent', border: 'none', color: FR.soil, cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}>
                +
              </button>
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setAiOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: FR.salt, color: FR.soil, border: `1px solid ${FR.sand}`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            <Sparkles size={12} /> AI auto-fill
          </button>
          <button onClick={onExportPDF} disabled={exporting}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', background: 'transparent', color: FR.slate, border: `1px solid ${FR.sand}`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: exporting ? 'wait' : 'pointer' }}>
            <FileDown size={12} /> {exporting ? 'Exporting…' : 'Export spec PDF'}
          </button>
          <select
            value={status}
            onChange={e => set({ status: e.target.value })}
            style={{ background: pill.bg, color: pill.fg, padding: '5px 9px', borderRadius: 5, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, border: 'none', cursor: 'pointer' }}
          >
            {TREATMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={save} disabled={!dirty || saving} title={dirty ? 'Save now' : 'All changes saved'}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: dirty ? FR.slate : FR.sand, color: dirty ? FR.salt : FR.stone, border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: dirty && !saving ? 'pointer' : 'not-allowed', opacity: saving ? 0.85 : 1 }}>
            {saving ? <Loader2 size={12} /> : <Save size={12} />}
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

      {/* 2-column shell: form left, live preview right */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: 14, alignItems: 'flex-start' }}>

        {/* LEFT — form cards stacked */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Type */}
          <div style={CARD_STYLE}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h4 style={SECTION_TITLE}>Type</h4>
              <div style={{ display: 'flex', background: FR.salt, borderRadius: 6, padding: 2, gap: 2, flexWrap: 'wrap' }}>
                {TREATMENT_TYPES.map(t => (
                  <button key={t.id} onClick={() => set({ type: t.id })}
                    style={{
                      padding: '4px 10px',
                      background: draft.type === t.id ? FR.slate : 'transparent',
                      color: draft.type === t.id ? FR.salt : FR.stone,
                      border: 'none', borderRadius: 4,
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Base color ID">
                <input value={draft.base_color_id || ''} onChange={e => set({ base_color_id: e.target.value })} placeholder="FR-SLATE, FR-SAND…" style={INPUT_STYLE} />
              </Field>
              <Field label="Shrinkage expected (%)">
                <input type="number" step="0.1" value={draft.shrinkage_expected_pct ?? 0} onChange={e => set({ shrinkage_expected_pct: parseFloat(e.target.value) || 0 })} style={INPUT_STYLE} />
              </Field>
            </div>
          </div>

          {/* Photos */}
          <div style={CARD_STYLE}>
            <h4 style={SECTION_TITLE}>Photos</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <SimpleImageSlot
                value={draft.swatch_image_url}
                onChange={v => set({ swatch_image_url: v })}
                label="Swatch"
                hint="9:16 vertical"
                height={300}
                assetScope="treatments"
                assetOwnerId={draft.id}
                assetSlot="swatch"
              />
              <SimpleImageSlot
                value={draft.sample_image_url}
                onChange={v => set({ sample_image_url: v })}
                label="On garment"
                hint="9:16 vertical"
                height={300}
                assetScope="treatments"
                assetOwnerId={draft.id}
                assetSlot="sample"
              />
            </div>
          </div>

          {/* Chemistry — gated Coming soon */}
          <div style={CARD_STYLE}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h4 style={{ ...SECTION_TITLE, marginBottom: 0 }}>Chemistry</h4>
              <span style={{ fontSize: 9, color: FR.soil, letterSpacing: '0.1em', textTransform: 'uppercase', background: FR.salt, border: `0.5px solid ${FR.sand}`, borderRadius: 3, padding: '2px 7px' }}>
                Coming soon
              </span>
            </div>
            <div style={{ opacity: 0.45, pointerEvents: 'none', userSelect: 'none', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <Field label="Chemistry">
                <input value={draft.chemistry || ''} style={INPUT_STYLE} readOnly />
              </Field>
              <Field label="Duration (min)">
                <input type="number" value={draft.duration_minutes ?? 0} style={INPUT_STYLE} readOnly />
              </Field>
              <Field label="Temperature (°C)">
                <input type="number" value={draft.temperature_c ?? 0} style={INPUT_STYLE} readOnly />
              </Field>
            </div>
          </div>

          {/* Compatible substrates */}
          <div style={CARD_STYLE}>
            <h4 style={SECTION_TITLE}>Compatible substrates</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Fabric IDs (comma-separated)">
                <input
                  value={(draft.compatible_fabric_ids || []).join(', ')}
                  onChange={e => set({ compatible_fabric_ids: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  placeholder="FB-CTN-007, FB-CTN-008"
                  style={INPUT_STYLE}
                />
              </Field>
              <Field label="Cut & sew categories">
                <input
                  value={(draft.compatible_cut_sew_categories || []).join(', ')}
                  onChange={e => set({ compatible_cut_sew_categories: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  placeholder="hoodie, sweatpant"
                  style={INPUT_STYLE}
                />
              </Field>
            </div>
          </div>

          {/* Vendor */}
          <div style={CARD_STYLE}>
            <h4 style={SECTION_TITLE}>Vendor</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <Field label="Primary vendor">
                <VendorPicker value={draft.primary_vendor_id} onChange={v => set({ primary_vendor_id: v })} placeholder="Select vendor…" />
              </Field>
              <Field label="Cost / unit (USD)">
                <input type="number" step="0.01" value={draft.cost_per_unit_usd ?? 0} onChange={e => set({ cost_per_unit_usd: parseFloat(e.target.value) || 0 })} style={INPUT_STYLE} />
              </Field>
              <Field label="Lead time (days)">
                <input type="number" value={draft.lead_time_days ?? 0} onChange={e => set({ lead_time_days: parseInt(e.target.value, 10) || 0 })} style={INPUT_STYLE} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 10 }}>
              <Field label="Backup vendor">
                <VendorPicker value={draft.backup_vendor_id} onChange={v => set({ backup_vendor_id: v })} placeholder="Select backup…" />
              </Field>
              <Field label="MOQ (units)">
                <input type="number" value={draft.moq_units ?? 0} onChange={e => set({ moq_units: parseInt(e.target.value, 10) || 0 })} style={INPUT_STYLE} />
              </Field>
              <div />
            </div>
          </div>

          {/* Digital asset */}
          <div style={CARD_STYLE}>
            <h4 style={SECTION_TITLE}>Digital asset</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="LoRA checkpoint">
                <FileSlot
                  value={dig.lora_checkpoint_url}
                  onChange={v => setDigital('lora_checkpoint_url', v)}
                  accept=".safetensors,.ckpt,.bin,.pt"
                  hint="Drop a .safetensors checkpoint"
                />
              </Field>
              <Field label="Base model">
                <select value={dig.lora_base_model || ''} onChange={e => setDigital('lora_base_model', e.target.value)} style={INPUT_STYLE}>
                  <option value="">—</option>
                  {LORA_BASE_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </Field>
              <Field label="Trigger phrase">
                <input value={dig.lora_trigger_phrase || ''} onChange={e => setDigital('lora_trigger_phrase', e.target.value)} placeholder="garment_wash_v2" style={{ ...INPUT_STYLE, fontFamily: 'ui-monospace, Menlo, monospace' }} />
              </Field>
              <Field label="CLO .ZFAB (optional)">
                <input value={dig.clo_asset_url || ''} onChange={e => setDigital('clo_asset_url', e.target.value)} placeholder="CLO-SET content ID or URL" style={INPUT_STYLE} />
              </Field>
            </div>
          </div>

          {/* Notes */}
          <div style={CARD_STYLE}>
            <h4 style={SECTION_TITLE}>Notes</h4>
            <textarea
              value={draft.notes || ''}
              onChange={e => set({ notes: e.target.value })}
              rows={4}
              placeholder="Vendor recipe guidance, substrate restrictions, certifications…"
              style={{ ...INPUT_STYLE, resize: 'vertical' }}
            />
          </div>
        </div>

        {/* RIGHT — sticky live preview */}
        <div style={{ position: 'sticky', top: 12, alignSelf: 'flex-start' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, padding: '0 4px' }}>
            <h4 style={{ ...SECTION_TITLE, marginBottom: 0 }}>Live preview</h4>
            <span style={{ fontSize: 10, color: FR.stone }}>identical to tech pack page BOM-T</span>
          </div>
          <TreatmentBOMPreview treatment={draft} />
        </div>
      </div>

      {/* Below shell: production history */}
      <div style={{ marginTop: 22 }}>
        <ProductionLog rows={productionLog} />
        <DigitalDrift rows={driftRows.map(d => ({
          po_code: d.po_id,
          date: d.recorded_at ? d.recorded_at.slice(0, 7) : '',
          score: d.score_pct,
          retrained: d.retrained,
          predicted_grad: d.predicted_grad,
          actual_grad: d.actual_grad,
        }))} />
        <UsedIn rows={usedIn} />
      </div>

      {aiOpen && (
        <TreatmentAIExtract
          onClose={() => setAiOpen(false)}
          onApply={onApplyAI}
        />
      )}
    </div>
  );
}

function DigitalDrift({ rows }) {
  const muted = 'rgba(58,58,58,0.55)';
  const items = rows.slice(0, 3);
  return (
    <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '20px 22px', marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, color: FR.slate }}>Digital drift</div>
        <div style={{ fontSize: 10, color: muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>LoRA prediction vs production photo · retrain if &gt; 8%</div>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: muted, padding: '14px 0' }}>No drift data — drift is measured on PO close.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {items.map((item, i) => {
            const pred = item.predicted_grad || ['#EBE5D5', '#D6CFB9'];
            const act  = item.actual_grad    || ['#EBE5D5', '#D6CFB9'];
            const dateLabel = (() => {
              if (!item.date) return '';
              try { return new Date(`${item.date}-01`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }
              catch { return item.date; }
            })();
            const score = Number(item.score);
            const dClr = driftColor(score);
            return (
              <div key={item.po_code || i}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                  <div style={{ aspectRatio: '1 / 1', borderRadius: 6, background: `linear-gradient(135deg, ${pred[0]} 0%, ${pred[1]} 100%)` }} />
                  <div style={{ aspectRatio: '1 / 1', borderRadius: 6, background: `linear-gradient(140deg, ${act[0]} 0%, ${act[1]} 100%)` }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: muted, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  <span>{item.po_code || '—'}{dateLabel ? ` · ${dateLabel}` : ''}</span>
                  <span style={{ color: dClr }}>{Number.isFinite(score) ? `${score.toFixed(1)}%` : '—'}{item.retrained ? ' · retrained' : ''}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UsedIn({ rows }) {
  const muted = 'rgba(58,58,58,0.5)';
  return (
    <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '20px 22px', marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, color: FR.slate }}>Used in</div>
        <div style={{ fontSize: 10, color: 'rgba(58,58,58,0.55)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Active styles referencing this atom</div>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: muted, padding: '14px 0' }}>Not yet referenced in any style.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((r, i) => {
            const rid = r.style_id || r.id;
            const name = r.style_name || r.name || '';
            const units = r.units != null ? `${Number(r.units).toLocaleString()} units` : '';
            const rstatus = r.status || '';
            const right = [units, rstatus].filter(Boolean).join(' · ');
            const isLast = i === rows.length - 1;
            return (
              <div key={rid || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', fontSize: 12.5, borderBottom: isLast ? 'none' : '0.5px solid rgba(58,58,58,0.08)' }}>
                <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, color: FR.slate }}>
                  {rid}{rid && name ? ' · ' : ''}{name}
                </span>
                <span style={{ color: muted }}>{right}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProductionLog({ rows }) {
  const muted = 'rgba(58,58,58,0.55)';
  const borderTop = '0.5px solid rgba(58,58,58,0.1)';
  const headerCell = {
    fontSize: 11, color: muted, textTransform: 'uppercase', letterSpacing: '0.04em',
    padding: '6px 8px 6px 0', fontWeight: 500, textAlign: 'left',
    borderBottom: '0.5px solid rgba(58,58,58,0.1)',
  };
  const headerCellRight = { ...headerCell, textAlign: 'right' };
  const dataCell = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5,
    padding: '9px 8px 9px 0', color: FR.slate, borderTop,
  };
  const dataCellRight = { ...dataCell, textAlign: 'right' };
  return (
    <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '20px 22px', marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, color: FR.slate }}>Production log</div>
        <div style={{ fontSize: 10, color: muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Append-only · every PO that used this atom</div>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: muted, padding: '14px 0' }}>
          No production runs yet — first PO using this treatment will populate this log.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={headerCell}>PO</th>
              <th style={headerCell}>Date</th>
              <th style={headerCell}>Style</th>
              <th style={headerCellRight}>Units</th>
              <th style={headerCell}>Lot</th>
              <th style={headerCellRight}>Cost</th>
              <th style={headerCellRight}>Lead</th>
              <th style={headerCellRight}>Defect</th>
              <th style={headerCellRight}>Drift</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.po_code || i}>
                <td style={dataCell}>{r.po_code || '—'}</td>
                <td style={dataCell}>{r.date || '—'}</td>
                <td style={{ ...dataCell, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{r.style || '—'}</td>
                <td style={dataCellRight}>{r.units != null ? Number(r.units).toLocaleString() : '—'}</td>
                <td style={dataCell}>{r.lot || '—'}</td>
                <td style={dataCellRight}>{r.cost != null ? `$${Number(r.cost).toFixed(2)}` : '—'}</td>
                <td style={dataCellRight}>{r.lead != null ? `${r.lead}d` : '—'}</td>
                <td style={{ ...dataCellRight, color: defectColor(r.defect) }}>{r.defect != null ? `${Number(r.defect).toFixed(1)}%` : '—'}</td>
                <td style={{ ...dataCellRight, color: driftColor(r.drift) }}>{r.drift != null ? `${Number(r.drift).toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
