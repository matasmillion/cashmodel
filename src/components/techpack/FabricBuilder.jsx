// Fabric detail / editor — compact single-screen layout. Above-the-fold
// on a 1280-wide viewport: identity + sourcing + photos + BOM preview.
//
// Notable behaviors:
//   • The fabric is either KNIT or WOVEN — picked at the top, drives which
//     weaves are selectable.
//   • The version field is read-only. To bump (v1.0 → v1.1) the user
//     clicks the "Bump version" button — there's no free-text editing.
//   • AI auto-fill: drop a mill's color card (image or PDF, Chinese OK)
//     into the FabricAIExtract modal; Claude returns structured fields
//     and the user reviews before applying.
//   • Photos: front, back, plus an unbounded color-card gallery. These
//     three image groups feed the one-page BOM PDF that the tech pack
//     embeds at production time.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Save, Trash2, Sparkles, FileDown, Plus } from 'lucide-react';
import { FR } from './techPackConstants';
import { saveFabric, archiveFabric, restoreFabric } from '../../utils/fabricStore';
import {
  FABRIC_CATEGORIES, FABRIC_WEAVES, FABRIC_WEAVE_LABEL, FABRIC_STATUSES,
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

export default function FabricBuilder({ fabric, onBack }) {
  const [draft, setDraft] = useState(fabric);
  const [savedAt, setSavedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [fx, setFx] = useState(null); // { usdPerCny, fetchedAt, stale }

  useEffect(() => { setDraft(fabric); }, [fabric.id]);

  // Fetch the daily USD/CNY rate once on mount. The helper caches in
  // localStorage for 24 h, so this is effectively free on subsequent
  // visits within a day. The pricing inputs render even before the rate
  // resolves — they just don't auto-convert until it lands.
  useEffect(() => {
    let cancelled = false;
    getUsdCnyRate().then(r => { if (!cancelled) setFx(r); })
      .catch(err => console.error('FabricBuilder FX:', err));
    return () => { cancelled = true; };
  }, []);


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

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(fabric), [draft, fabric]);

  const set = (patch) => setDraft(d => ({ ...d, ...patch }));

  // Mirror a price across the USD/CNY pair as the user types. `kind` is
  // 'meter' or 'kg'; `currency` is 'usd' or 'cny'. We only auto-fill the
  // other side when we have a valid FX rate — without one, the user's
  // typed value still saves, just without a paired conversion.
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

  // Changing knit↔woven retargets the weave to the first weave in that
  // category if the current weave doesn't belong there. Prevents an
  // invalid (category, weave) pair from being saved.
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

  const save = async () => {
    setSaving(true);
    try {
      const { id, ...updates } = draft;
      await saveFabric(id, updates);
      setSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  };

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

  const onApplyAI = (patch) => {
    setAiOpen(false);
    setDraft(d => {
      const next = { ...d, ...patch };
      // Color card from AI is additive: append any swatches the model
      // surfaced that aren't already on the draft. Dedup on the lowercased
      // hex when present, otherwise on the trimmed label, so re-running
      // the importer over the same card doesn't duplicate swatches and
      // an "add only these new colors" run leaves the existing ones alone.
      if (Array.isArray(patch.color_card_images) && patch.color_card_images.length) {
        const existing = Array.isArray(d.color_card_images) ? d.color_card_images : [];
        const seen = new Set(existing.map(c => (c.hex || '').toLowerCase() || (c.label || '').trim().toLowerCase()).filter(Boolean));
        const additions = patch.color_card_images.filter(c => {
          const key = (c.hex || '').toLowerCase() || (c.label || '').trim().toLowerCase();
          if (!key) return true;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        next.color_card_images = [...existing, ...additions];
      } else {
        // Model returned no colors — preserve what's already on the draft.
        next.color_card_images = d.color_card_images || [];
      }
      return next;
    });
  };

  const status = draft.status || 'draft';
  const pill = STATUS_PILL[status] || STATUS_PILL.draft;
  const category = draft.category || categoryForWeave(draft.weave);
  const availableWeaves = weavesForCategory(category);

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
            value={draft.name || ''}
            onChange={e => set({ name: e.target.value })}
            placeholder="Untitled fabric"
            style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: FR.slate, border: 'none', outline: 'none', background: 'transparent', width: '100%' }}
          />
          <div style={{ fontSize: 10, color: FR.stone, marginTop: 2, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{draft.code}</span>
            {draft.mill_fabric_no && <span>·  Mill # {draft.mill_fabric_no}</span>}
            <span>·  {FABRIC_WEAVE_LABEL[draft.weave] || draft.weave}</span>
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
          <button onClick={save} disabled={!dirty || saving}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: dirty ? FR.slate : FR.sand, color: dirty ? FR.salt : FR.stone, border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: dirty && !saving ? 'pointer' : 'not-allowed', opacity: saving ? 0.6 : 1 }}>
            <Save size={12} /> {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>

      {savedAt && !dirty && (
        <div style={{ fontSize: 10, color: FR.stone, marginBottom: 8 }}>
          Saved {savedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}

      {/* ─── Layout: data block, then full-width landscape BOM preview ─ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* DATA — two-column for forms; preview lives below at full width */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>

          {/* Category + Identity */}
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <Field label="Mill fabric #">
                <input value={draft.mill_fabric_no || ''} onChange={e => set({ mill_fabric_no: e.target.value })} placeholder="FT-340-OE" style={{ ...INPUT_STYLE, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
              </Field>
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

          {/* Photos: front + back */}
          <div style={CARD_STYLE}>
            <h4 style={SECTION_TITLE}>Fabric photos</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <SimpleImageSlot
                value={draft.front_image_url}
                onChange={v => set({ front_image_url: v })}
                label="Front"
                hint="Drop the face of the fabric"
                height={150}
                assetScope="fabrics"
                assetOwnerId={draft.id}
                assetSlot="front"
              />
              <SimpleImageSlot
                value={draft.back_image_url}
                onChange={v => set({ back_image_url: v })}
                label="Back"
                hint="Drop the back of the fabric"
                height={150}
                assetScope="fabrics"
                assetOwnerId={draft.id}
                assetSlot="back"
              />
            </div>
          </div>

          {/* Color card gallery */}
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
          </div>

          {/* CLO3D + notes */}
          <div style={CARD_STYLE}>
            <h4 style={SECTION_TITLE}>CLO3D & notes</h4>
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
        </div>

        {/* BOM page preview — full width landscape A4, mirrors tech pack chrome */}
        <div style={{ ...CARD_STYLE, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, padding: '0 4px' }}>
            <h4 style={{ ...SECTION_TITLE, marginBottom: 0 }}>BOM page · live preview</h4>
            <span style={{ fontSize: 10, color: FR.stone }}>A4 landscape · matches tech pack chrome</span>
          </div>
          <FabricBOMPreview fabric={draft} />
          <div style={{ fontSize: 10, color: FR.stone, marginTop: 8, padding: '0 4px', lineHeight: 1.5 }}>
            This is exactly what lands in the tech pack BOM page when this fabric is selected.
          </div>
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
