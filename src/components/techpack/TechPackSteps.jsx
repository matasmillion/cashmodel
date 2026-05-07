// Tech Pack wizard — 14 step panels mapping 1:1 to the pages of
// FR_TechPack_Template_Blank.pdf.
//
// Page 1 (Cover & Identity) is fully built. All other pages are placeholders
// that will be replaced in subsequent prompts.

import React, { useEffect, useState, useMemo } from 'react';
import { FR, BOM_COMPONENT_OPTIONS, STATUSES, APPROVAL_STATUSES, PASS_FAIL, DEFAULT_DATA, isStepLocked, COLLECTIONS, PRODUCT_TYPES, deriveStyleNumber } from './techPackConstants';
import { listFRColors } from '../../utils/colorLibrary';
import { Input, Select, Row, SectionTitle, CoverPhoto, PhotoUpload, ArrayTable, EditableSelect, FRColorCell, FilesPanel } from './TechPackPrimitives';
import { generatePackingList, getStoredKey, saveKey } from '../../utils/aiPackingList';
import { addSupplier } from '../../utils/plmDirectory';
import { getFRColor } from '../../utils/colorLibrary';
import { listTreatments, getTreatmentRollups } from '../../utils/treatmentStore';
import { TREATMENT_TYPE_LABEL } from '../../utils/treatmentLibrary';
import { computePackDiff } from '../../utils/techPackDiff';
import { useApp } from '../../context/AppContext';
import { analyzeGarmentImage, generateGarmentView, imageEntryToDataUrl } from '../../utils/techPackViews';

const COST_TIER_CAP = 5;
const SIZE_OPTIONS = ['S', 'M', 'L', 'XL', 'NS', 'W30', 'W32', 'W34', 'W36'];

function CostTiersTable({ tiers, onChange }) {
  const safe = Array.isArray(tiers) && tiers.length ? tiers : [{ quantity: '', unitCost: '' }];
  const update = (i, key, val) => onChange(safe.map((t, idx) => idx === i ? { ...t, [key]: val } : t));
  const add = () => { if (safe.length < COST_TIER_CAP) onChange([...safe, { quantity: '', unitCost: '' }]); };
  const remove = (i) => onChange(safe.filter((_, idx) => idx !== i));
  const cell = { padding: '4px 6px', borderBottom: `1px solid ${FR.sand}`, fontSize: 11 };
  const headerCell = { ...cell, background: FR.slate, color: FR.salt, fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', borderBottom: 'none' };
  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup><col style={{ width: 60 }} /><col /><col /><col style={{ width: 30 }} /></colgroup>
        <thead>
          <tr>
            <th style={{ ...headerCell, textAlign: 'left' }}>Tier</th>
            <th style={{ ...headerCell, textAlign: 'left' }}>Quantity</th>
            <th style={{ ...headerCell, textAlign: 'left' }}>Unit Cost ($)</th>
            <th style={headerCell} />
          </tr>
        </thead>
        <tbody>
          {safe.map((t, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? FR.salt : FR.white }}>
              <td style={{ ...cell, color: FR.soil, fontWeight: 600, fontSize: 10 }}>{i === 0 ? 'MOQ' : `T${i + 1}`}</td>
              <td style={cell}><input value={t.quantity || ''} onChange={e => update(i, 'quantity', e.target.value)} placeholder={i === 0 ? '100' : '1000'} style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '2px 0', color: FR.slate, outline: 'none' }} /></td>
              <td style={cell}><input value={t.unitCost || ''} onChange={e => update(i, 'unitCost', e.target.value)} placeholder={i === 0 ? '28.00' : '24.00'} style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '2px 0', color: FR.slate, outline: 'none' }} /></td>
              <td style={{ ...cell, textAlign: 'center' }}>
                {safe.length > 1 && <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: FR.stone, cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {safe.length < COST_TIER_CAP && (
        <button type="button" onClick={add} style={{ marginTop: 6, padding: '4px 12px', background: 'none', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 10, color: FR.soil, cursor: 'pointer' }}>
          + Add tier
        </button>
      )}
    </div>
  );
}

function computeFulfillmentCost(weightKg, rateCard) {
  if (!weightKg || !rateCard) return null;
  const weightLbs = parseFloat(weightKg) * 2.20462;
  if (!weightLbs || isNaN(weightLbs)) return null;
  const tier = (rateCard.weightTiers || []).find(t => weightLbs >= t.minLbs && weightLbs < t.maxLbs)
    || (rateCard.weightTiers || []).slice(-1)[0];
  if (!tier) return null;
  return (rateCard.pickPack || 0) + (tier.rate || 0) + (rateCard.packagingMaterials || 0);
}

function LockedBanner({ status }) {
  return (
    <div style={{ padding: 14, background: FR.salt, border: `1px dashed ${FR.soil}`, borderRadius: 6, marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: FR.slate, fontWeight: 600, marginBottom: 4 }}>🔒 Locked until Pre-Production</div>
      <div style={{ fontSize: 11, color: FR.stone, lineHeight: 1.5 }}>
        Current status: <strong>{status || 'Design'}</strong>. This step unlocks when you set the status to <strong>Pre-Production</strong> (or later) on Page 1.
      </div>
    </div>
  );
}

function ComingSoon({ title }) {
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <p style={{ fontSize: 12, color: FR.stone, lineHeight: 1.6, padding: '20px 16px', background: FR.salt, border: `1px dashed ${FR.sand}`, borderRadius: 6, fontStyle: 'italic' }}>
        Coming in the next session.
      </p>
    </div>
  );
}

function SignatureBlock({ label, value, onNameChange, onDateChange }) {
  const v = value || { name: '', date: '' };
  return (
    <div style={{ padding: 12, border: `1px solid ${FR.sand}`, borderRadius: 6, background: FR.white }}>
      <div style={{ fontSize: 10, color: FR.soil, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
      <Input label="Name" value={v.name} onChange={onNameChange} />
      <div>
        <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 3, letterSpacing: 0.5, textTransform: 'uppercase' }}>Date</label>
        <input type="date" value={v.date || ''} onChange={e => onDateChange(e.target.value)}
          style={{ width: '100%', padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 3, fontFamily: "'Helvetica Neue', sans-serif", fontSize: 13, color: FR.slate, background: FR.white, outline: 'none', boxSizing: 'border-box' }} />
      </div>
    </div>
  );
}

export function StepCover({ data, set, images, onUpload, onRemove, existingSuppliers = [] }) {
  const { state } = useApp();
  const rateCard = state.rateCard;

  // Library colors for colorway chip picker
  const [libraryColors, setLibraryColors] = useState([]);
  useEffect(() => { setLibraryColors(listFRColors()); }, []);

  // Colorways — array of { name, frColor, hex }
  const selectedColorways = Array.isArray(data.colorways) ? data.colorways : [];
  const toggleColorway = (color) => {
    const idx = selectedColorways.findIndex(c => c.frColor === color.name);
    if (idx >= 0) {
      set('colorways', selectedColorways.filter((_, i) => i !== idx));
    } else {
      set('colorways', [...selectedColorways, { name: color.name, frColor: color.name, hex: color.hex || '', pantone: '', approvalStatus: 'Pending' }]);
    }
  };

  // Size range — array of size strings
  const selectedSizes = Array.isArray(data.sizeRange) ? data.sizeRange
    : (data.sizeRange ? String(data.sizeRange).split(/[/,\s]+/).map(s => s.trim()).filter(Boolean) : []);
  const toggleSize = (s) => {
    const next = selectedSizes.includes(s) ? selectedSizes.filter(x => x !== s) : [...selectedSizes, s];
    set('sizeRange', next);
  };

  // Style number derivation
  const updateStyleNumber = (patch) => {
    const next = deriveStyleNumber({
      season:        patch.season        ?? data.season,
      collection:    patch.collection    ?? data.collection,
      productType:   patch.productType   ?? data.productType,
      productNumber: patch.productNumber ?? data.productNumber,
    });
    Object.entries(patch).forEach(([k, v]) => set(k, v));
    set('styleNumber', next);
  };

  const styleNumberDisplay = data.styleNumber || deriveStyleNumber({
    season: data.season, collection: data.collection,
    productType: data.productType, productNumber: data.productNumber,
  }) || '—';

  // Fulfillment cost from weight + rate card
  const fulfillmentCost = useMemo(
    () => computeFulfillmentCost(data.weightKg, rateCard),
    [data.weightKg, rateCard]
  );

  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  const fieldLabel = { fontSize: 9, color: FR.stone, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3 };
  const chipBase = { padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer', border: `1px solid ${FR.sand}`, transition: 'background 0.15s' };
  const readonlyField = { padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 13, background: FR.salt, boxSizing: 'border-box' };

  const packAssumptions = data.assumptions || {};
  const a = state.assumptions || {};
  const cogsRate = parseFloat(a.cogsRate ?? 0.27);
  const fulfillmentPercent = parseFloat(a.fulfillmentPercent ?? 0.10);
  const seaFreightSpot = parseFloat(packAssumptions.seaFreightSpot ?? 4);
  const shippingCharge = parseFloat(packAssumptions.shippingCharge ?? 0);
  const retail = parseFloat(data.targetRetail) || 0;
  const maxFOB = retail > 0
    ? retail * (cogsRate + fulfillmentPercent) - (fulfillmentCost || 0) + shippingCharge - seaFreightSpot
    : null;

  return (
    <div>
      {/* ── Zone 1: Hero — cover image + identity fields ─────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, marginBottom: 20, alignItems: 'start' }}>
        {/* Left: cover photo */}
        <CoverPhoto
          label="Ghost Mannequin Image"
          slotKey="cover"
          images={images}
          onUpload={onUpload}
          onRemove={onRemove}
          portrait
          uploadPrompt="Click or drop ghost mannequin image here."
        />

        {/* Right: identity fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Style number badge */}
          <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${FR.sand}` }}>
            <div style={fieldLabel}>Style #</div>
            <div style={{ fontFamily: "'ui-monospace','SF Mono',Menlo,monospace", fontSize: 16, color: FR.slate, letterSpacing: 1.2, fontWeight: 600 }}>
              {styleNumberDisplay}
            </div>
            <div style={{ fontSize: 9, color: FR.stone, marginTop: 2 }}>Product # {data.productNumber || '—'} · auto-generated</div>
          </div>

          <Row cols="1fr 1fr">
            <Select label="Season" value={data.season} onChange={v => updateStyleNumber({ season: v })}
              options={['Core (Evergreen)', 'SS26', 'FW26', 'SS27', 'FW27']} />
            <Select label="Collection" value={data.collection} onChange={v => updateStyleNumber({ collection: v })}
              options={COLLECTIONS.map(c => c.label)} />
          </Row>

          <Row cols="1fr 1fr">
            <Select label="Product Type" value={data.productType} onChange={v => updateStyleNumber({ productType: v })}
              options={PRODUCT_TYPES.map(t => t.label)} />
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 3, letterSpacing: 0.5, textTransform: 'uppercase' }}>Version</label>
              <div style={{ ...readonlyField, color: FR.stone }}>{data.revision || 'V1.0'}</div>
            </div>
          </Row>

          <EditableSelect label="Vendor" value={data.vendor}
            onChange={v => set('vendor', v)}
            options={existingSuppliers}
            onAddOption={addSupplier}
            placeholder="Add a new vendor…" />

          <div style={{ marginTop: 2 }}>
            <Select label="Status" value={data.status} onChange={v => set('status', v)} options={STATUSES} />
            <p style={{ fontSize: 10, color: FR.stone, marginTop: -6, marginBottom: 0, lineHeight: 1.5 }}>
              Labels, Order &amp; Delivery, and Compliance unlock at Pre-Production.
            </p>
          </div>
        </div>
      </div>

      {/* ── Zone 2: Colorways + Size Range ───────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20, paddingTop: 16, borderTop: `1px solid ${FR.sand}` }}>
        <div>
          <div style={fieldLabel}>Colorways</div>
          {libraryColors.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
              {libraryColors.map(color => {
                const active = selectedColorways.some(c => c.frColor === color.name);
                return (
                  <button key={color.name} type="button" onClick={() => toggleColorway(color)}
                    style={{ ...chipBase, background: active ? FR.slate : FR.white, color: active ? FR.salt : FR.slate, borderColor: active ? FR.slate : FR.sand, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color.hex || FR.sand, border: `1px solid rgba(0,0,0,0.1)`, flexShrink: 0 }} />
                    {color.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: FR.stone, fontStyle: 'italic', marginTop: 6 }}>No colors in library yet.</div>
          )}
          {selectedColorways.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 10, color: FR.stone }}>
              {selectedColorways.map(c => c.name).join(' · ')}
            </div>
          )}
        </div>

        <div>
          <div style={fieldLabel}>Size Range</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
            {SIZE_OPTIONS.map(s => {
              const active = selectedSizes.includes(s);
              return (
                <button key={s} type="button" onClick={() => toggleSize(s)}
                  style={{ ...chipBase, background: active ? FR.slate : FR.white, color: active ? FR.salt : FR.slate, borderColor: active ? FR.slate : FR.sand, minWidth: 38, textAlign: 'center' }}>
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Zone 3: Pricing ──────────────────────────────────────────────────── */}
      <div style={{ paddingTop: 16, borderTop: `1px solid ${FR.sand}`, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 10 }}>
          <Input label="Target Retail ($)" value={data.targetRetail} onChange={v => set('targetRetail', v)} placeholder="117" />
          <div style={{ marginBottom: 10 }}>
            <div style={fieldLabel}>Maximum FOB ($)</div>
            <div style={{ ...readonlyField, color: maxFOB != null ? FR.slate : FR.stone, fontStyle: maxFOB != null ? 'normal' : 'italic', fontFamily: maxFOB != null ? "'ui-monospace',monospace" : 'inherit', marginTop: 3 }}>
              {maxFOB != null ? `$${maxFOB.toFixed(2)}` : 'Enter target retail'}
            </div>
          </div>
        </div>

        {/* Assumptions — collapsible */}
        <div style={{ border: `1px solid ${FR.sand}`, borderRadius: 6, overflow: 'hidden' }}>
          <button type="button" onClick={() => setAssumptionsOpen(o => !o)}
            style={{ width: '100%', padding: '7px 12px', background: FR.salt, border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: FR.soil, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Pricing Assumptions
            <span style={{ fontSize: 11, color: FR.stone }}>{assumptionsOpen ? '▲' : '▼'}</span>
          </button>
          {assumptionsOpen && (
            <div style={{ padding: 12, background: FR.white, borderTop: `1px solid ${FR.sand}` }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
                {[
                  ['COGS %', a.cogsRate != null ? `${(parseFloat(a.cogsRate) * 100).toFixed(1)}%` : '—'],
                  ['Fulfillment %', a.fulfillmentPercent != null ? `${(parseFloat(a.fulfillmentPercent) * 100).toFixed(1)}%` : '—'],
                  ['Fulfillment Cost', fulfillmentCost != null ? `$${fulfillmentCost.toFixed(2)}` : '—'],
                ].map(([label, val]) => (
                  <div key={label}>
                    <div style={{ fontSize: 9, color: FR.stone, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 12, color: FR.slate, fontFamily: "'ui-monospace',monospace" }}>{val}</div>
                  </div>
                ))}
              </div>
              <Row cols="1fr 1fr">
                <Input label="Shipping Revenue Offset ($)" value={packAssumptions.shippingCharge ?? '0'}
                  onChange={v => set('assumptions', { ...packAssumptions, shippingCharge: v })} placeholder="0" />
                <Input label="Sea Freight Spot ($)" value={packAssumptions.seaFreightSpot ?? '4'}
                  onChange={v => set('assumptions', { ...packAssumptions, seaFreightSpot: v })} placeholder="4" />
              </Row>
              <p style={{ fontSize: 10, color: FR.stone, margin: 0, lineHeight: 1.5 }}>
                Max FOB = Retail × (COGS% + Fulfillment%) − Fulfillment Cost + Shipping Offset − Sea Freight.
                COGS% and Fulfillment% are set in the Cash tab.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Zone 4: Quote + Fulfillment (unified card) ───────────────────────── */}
      <div style={{ padding: 18, background: FR.white, border: `1px solid ${FR.sand}`, borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
          <h4 style={{ margin: 0, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 19, color: FR.slate, fontWeight: 500 }}>Quote &amp; Fulfillment</h4>
          <span style={{ fontSize: 10, color: FR.stone, letterSpacing: 0.5 }}>Pricing, lead times &amp; shipping weight</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 24 }}>
          {/* Left col: cost tiers + weight */}
          <div>
            <div style={{ ...fieldLabel, marginBottom: 6 }}>Cost Tiers</div>
            <CostTiersTable tiers={data.costTiers || []} onChange={tiers => set('costTiers', tiers)} />

            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${FR.sand}` }}>
              <Row cols="1fr 1fr">
                <Input label="Weight (kg)" value={data.weightKg} onChange={v => set('weightKg', v)} placeholder="0.45" />
                <div style={{ marginBottom: 10 }}>
                  <div style={fieldLabel}>Fulfillment Cost</div>
                  <div style={{ ...readonlyField, marginTop: 3, color: fulfillmentCost != null ? FR.slate : FR.stone, fontStyle: fulfillmentCost != null ? 'normal' : 'italic', fontFamily: fulfillmentCost != null ? "'ui-monospace',monospace" : 'inherit' }}>
                    {fulfillmentCost != null ? `$${fulfillmentCost.toFixed(2)}` : rateCard ? 'Enter weight' : 'No rate card'}
                  </div>
                </div>
              </Row>
            </div>
          </div>

          {/* Right col: lead times + provider */}
          <div>
            <Row cols="1fr 1fr">
              <Input label="Lead Time (days)" value={data.leadTimeDays} onChange={v => set('leadTimeDays', v)} placeholder="28" />
              <Input label="Sample Lead Time (days)" value={data.sampleLeadTimeDays} onChange={v => set('sampleLeadTimeDays', v)} placeholder="14" />
            </Row>
            <Row cols="1fr 1fr">
              <Input label="Sample Cost ($)" value={data.sampleCost} onChange={v => set('sampleCost', v)} placeholder="25" />
              <div />
            </Row>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 3, letterSpacing: 0.5, textTransform: 'uppercase' }}>Quote Provider</label>
              <input value={data.quoteProviderLink || ''} onChange={e => set('quoteProviderLink', e.target.value)}
                placeholder="e.g. Dongguan Shengde Clothing Ltd."
                style={{ width: '100%', padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 3, fontFamily: "'Helvetica Neue', sans-serif", fontSize: 13, color: FR.slate, background: FR.white, outline: 'none', boxSizing: 'border-box' }} />
              <p style={{ fontSize: 10, color: FR.stone, marginTop: 4, marginBottom: 0 }}>Manufacturer or sourcing agent that provided this quote.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const VIEW_LABELS = { front: 'Front View', back: 'Back View', side: 'Side View' };
const VIEWS = ['front', 'back', 'side'];

function GenerateViewsModal({ srcEntry, onAccept, onClose }) {
  const [phase, setPhase]       = useState('analyzing'); // analyzing | generating | done | error
  const [description, setDesc]  = useState('');
  const [views, setViews]       = useState({ front: null, back: null, side: null });
  const [vstatus, setVstatus]   = useState({ front: 'pending', back: 'pending', side: 'pending' });
  const [verrors, setVerrors]   = useState({ front: '', back: '', side: '' });
  const [errMsg, setErrMsg]     = useState('');

  useEffect(() => { startAll(); }, []);

  function toMsg(e) {
    return (typeof e?.message === 'string' ? e.message : String(e)) || 'Unknown error';
  }

  async function startAll(viewsToRun = VIEWS, existingDesc = null) {
    try {
      let desc = existingDesc;
      if (!desc) {
        setPhase('analyzing');
        const dataUrl = await imageEntryToDataUrl(srcEntry);
        if (!dataUrl) throw new Error('Could not read source image');
        const mime = dataUrl.match(/^data:([^;]+);/)?.[1] || 'image/jpeg';
        const b64  = dataUrl.replace(/^data:[^;]+;base64,/, '');
        desc = await analyzeGarmentImage(b64, mime);
        setDesc(desc);
      }

      setPhase('generating');
      setVstatus(vs => {
        const next = { ...vs };
        viewsToRun.forEach(v => { next[v] = 'loading'; });
        return next;
      });

      await Promise.all(viewsToRun.map(async view => {
        try {
          const url = await generateGarmentView(desc, view);
          setViews(vs => ({ ...vs, [view]: url }));
          setVstatus(vs => ({ ...vs, [view]: 'done' }));
        } catch (e) {
          setVstatus(vs => ({ ...vs, [view]: 'error' }));
          setVerrors(ve => ({ ...ve, [view]: toMsg(e) }));
        }
      }));

      setPhase('done');
    } catch (e) {
      setErrMsg(toMsg(e));
      setPhase('error');
    }
  }

  async function regenView(view) {
    if (!description) return;
    setViews(vs => ({ ...vs, [view]: null }));
    setVstatus(vs => ({ ...vs, [view]: 'loading' }));
    setVerrors(ve => ({ ...ve, [view]: '' }));
    try {
      const url = await generateGarmentView(description, view);
      setViews(vs => ({ ...vs, [view]: url }));
      setVstatus(vs => ({ ...vs, [view]: 'done' }));
    } catch (e) {
      setVstatus(vs => ({ ...vs, [view]: 'error' }));
      setVerrors(ve => ({ ...ve, [view]: toMsg(e) }));
    }
  }

  async function handleAccept() {
    await Promise.all(VIEWS.map(async view => {
      const url = views[view];
      if (!url) return;
      try {
        const res    = await fetch(url);
        const blob   = await res.blob();
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload  = e => resolve(e.target.result);
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
        onAccept(`design-${view}`, dataUrl);
      } catch { /* skip failed view */ }
    }));
    onClose();
  }

  const allDone = VIEWS.every(v => views[v]);
  const anyLoading = Object.values(vstatus).some(s => s === 'loading');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(58,58,58,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: FR.salt, borderRadius: 8, padding: 28, width: 800, maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto', position: 'relative', border: `0.5px solid rgba(58,58,58,0.15)` }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: FR.slate, lineHeight: 1 }}>Generate Garment Views</div>
            <div style={{ fontSize: 10, color: FR.stone, marginTop: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>Nano Banana 2 · fal.ai · Claude Vision</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: FR.stone, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {/* Status bar */}
        {(phase === 'analyzing' || (phase === 'generating' && anyLoading)) && (
          <div style={{ fontSize: 12, color: FR.stone, marginBottom: 18, fontStyle: 'italic' }}>
            {phase === 'analyzing' ? 'Analyzing garment with Claude Vision…' : 'Generating views with Nano Banana 2…'}
          </div>
        )}

        {/* View grid */}
        {(phase === 'generating' || phase === 'done') && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
            {VIEWS.map(view => (
              <div key={view}>
                <div style={{ fontSize: 10, color: FR.soil, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>{VIEW_LABELS[view]}</div>
                <div style={{
                  aspectRatio: '2 / 3',
                  border: `1px dashed ${vstatus[view] === 'error' ? '#A32D2D' : FR.sand}`,
                  borderRadius: 6,
                  overflow: 'hidden',
                  background: FR.white,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {vstatus[view] === 'loading' && (
                    <div style={{ fontSize: 11, color: FR.stone }}>Generating…</div>
                  )}
                  {vstatus[view] === 'error' && (
                    <div style={{ fontSize: 10, color: '#A32D2D', padding: '0 8px', textAlign: 'center', lineHeight: 1.4 }}>
                      {verrors[view] || 'Failed'}
                    </div>
                  )}
                  {views[view] && (
                    <img src={views[view]} alt={VIEW_LABELS[view]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
                {(vstatus[view] === 'done' || vstatus[view] === 'error') && (
                  <button
                    onClick={() => regenView(view)}
                    style={{ marginTop: 6, width: '100%', fontSize: 10, background: 'none', border: `0.5px solid ${FR.sand}`, borderRadius: 4, padding: '4px 0', cursor: 'pointer', color: FR.stone, letterSpacing: 0.3 }}>
                    Regenerate
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {phase === 'error' && (
          <div style={{ fontSize: 12, color: '#A32D2D', marginBottom: 18 }}>{errMsg}</div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', background: 'none', border: `0.5px solid ${FR.sand}`, borderRadius: 6, cursor: 'pointer', fontSize: 12, color: FR.slate }}>
            Cancel
          </button>
          {allDone && (
            <button onClick={handleAccept} style={{ padding: '8px 22px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, letterSpacing: 0.3 }}>
              Use These Views
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function StepDesignOverview({ images, onUpload, onRemove }) {
  const [showModal, setShowModal] = useState(false);

  const srcEntry = (images || []).find(i => i.slot === 'design-source');

  return (
    <div>
      <SectionTitle>Design Overview</SectionTitle>

      {/* Reference image for AI view generation */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>Reference Image</label>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <PhotoUpload
              label="Upload any source — CLO3D render, flat lay, sketch, photo"
              slotKey="design-source"
              images={images}
              onUpload={onUpload}
              onRemove={onRemove}
            />
          </div>
          {srcEntry && (
            <button
              onClick={() => setShowModal(true)}
              style={{
                marginBottom: 14,
                padding: '9px 18px',
                background: FR.slate,
                color: FR.salt,
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 11,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
              Generate Views with AI
            </button>
          )}
        </div>
      </div>

      {/* Manual / generated garment views */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>Garment Views</label>
        <Row cols="1fr 1fr 1fr">
          <PhotoUpload label="Front View" slotKey="design-front" images={images} onUpload={onUpload} onRemove={onRemove} aspect="2 / 3" />
          <PhotoUpload label="Back View"  slotKey="design-back"  images={images} onUpload={onUpload} onRemove={onRemove} aspect="2 / 3" />
          <PhotoUpload label="Side View"  slotKey="design-side"  images={images} onUpload={onUpload} onRemove={onRemove} aspect="2 / 3" />
        </Row>
      </div>

      {showModal && srcEntry && (
        <GenerateViewsModal
          srcEntry={srcEntry}
          onAccept={(slot, dataUrl) => onUpload(slot, dataUrl, `${slot}-generated.jpg`)}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

export function StepFlatlays({ data, set, images, onUpload, onRemove }) {
  return (
    <div>
      <SectionTitle>Technical Flat Lay Diagrams</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <PhotoUpload label="Top Left"     slotKey="flatlay-tl" images={images} onUpload={onUpload} onRemove={onRemove} />
        <PhotoUpload label="Top Right"    slotKey="flatlay-tr" images={images} onUpload={onUpload} onRemove={onRemove} />
        <PhotoUpload label="Bottom Left"  slotKey="flatlay-bl" images={images} onUpload={onUpload} onRemove={onRemove} />
        <PhotoUpload label="Bottom Right" slotKey="flatlay-br" images={images} onUpload={onUpload} onRemove={onRemove} />
      </div>
      <Input label="Flat Lay Notes" value={data.flatLayNotes} onChange={v => set('flatLayNotes', v)} multiline placeholder="Callouts, annotations, measurement notes…" />
    </div>
  );
}
const FABRIC_CATEGORIES = new Set(['Fabric', 'Lining', 'Rib', 'Interfacing', 'Interfacing / Fusing']);

export function StepBOM({ data, set, existingSuppliers = [] }) {
  const [picker, setPicker] = useState(false);
  const [components, setComponents] = useState([]);
  // Active (non-archived) treatments for the additive Treatment dropdown on
  // each fabric BOM row. Loaded once on mount; the dropdown defaults to None
  // so existing tech packs without a `treatment_id` keep rendering unchanged.
  const [treatments, setTreatments] = useState([]);
  useEffect(() => {
    let cancelled = false;
    listTreatments({ includeArchived: false }).then(rows => {
      if (!cancelled) setTreatments(rows || []);
    });
    return () => { cancelled = true; };
  }, []);

  const fabrics = data.fabrics && data.fabrics.length ? data.fabrics : [{ component: '', fabricType: '', composition: '', weightGsm: '', colorPantone: '', supplier: '', notes: '' }];
  const trims   = data.trimsAccessories && data.trimsAccessories.length ? data.trimsAccessories : [{ component: '', type: '', material: '', color: '', sizeSpec: '', supplier: '', qtyPerGarment: '' }];
  const labels  = data.labelsBranding && data.labelsBranding.length ? data.labelsBranding : [{ labelType: '', material: '', size: '', placement: '', artworkRef: '', notes: '' }];

  const updF = (i, k, v) => set('fabrics', fabrics.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addF = () => set('fabrics', [...fabrics, { component: '', fabricType: '', composition: '', weightGsm: '', colorPantone: '', supplier: '', notes: '' }]);
  const rmF  = (i) => set('fabrics', fabrics.filter((_, idx) => idx !== i));

  const updT = (i, k, v) => set('trimsAccessories', trims.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addT = () => set('trimsAccessories', [...trims, { component: '', type: '', material: '', color: '', sizeSpec: '', supplier: '', qtyPerGarment: '' }]);
  const rmT  = (i) => set('trimsAccessories', trims.filter((_, idx) => idx !== i));

  const updL = (i, k, v) => set('labelsBranding', labels.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addL = () => set('labelsBranding', [...labels, { labelType: '', material: '', size: '', placement: '', artworkRef: '', notes: '' }]);
  const rmL  = (i) => set('labelsBranding', labels.filter((_, idx) => idx !== i));

  const openPicker = async () => {
    if (components.length === 0) {
      const { listComponentPacks } = await import('../../utils/componentPackStore');
      setComponents(await listComponentPacks());
    }
    setPicker(true);
  };

  const addFromComponent = async (id) => {
    const { getComponentPack } = await import('../../utils/componentPackStore');
    const full = await getComponentPack(id);
    if (!full) return;
    const c = full.data || {};
    const category = c.componentType || full.component_category || c.componentCategory || '';
    if (FABRIC_CATEGORIES.has(category)) {
      set('fabrics', [...fabrics, {
        component: category,
        fabricType: c.componentName || '',
        composition: c.composition || c.material || '',
        weightGsm: c.weight || '',
        colorPantone: c.pantone || '',
        supplier: c.supplier || '',
        notes: c.hex ? `Hex: ${c.hex}` : '',
      }]);
    } else {
      set('trimsAccessories', [...trims, {
        component: category || c.componentName || '',
        type: c.componentName || '',
        material: c.material || c.composition || '',
        color: c.frColor || '',
        sizeSpec: c.dimensions || c.width || '',
        supplier: c.supplier || '',
        qtyPerGarment: '',
      }]);
    }
    setPicker(false);
  };

  const supplierRender = (val, onChange) => (
    <EditableSelect value={val} onChange={onChange} options={existingSuppliers} onAddOption={addSupplier} placeholder="Add new…" />
  );
  const treatmentRender = (val, onChange) => (
    <select value={val || ''} onChange={e => onChange(e.target.value || undefined)}
      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '3px 0', color: FR.slate, fontFamily: "'Helvetica Neue',sans-serif" }}>
      <option value="">&lt;None&gt;</option>
      {treatments.map(t => (
        <option key={t.id} value={t.id}>{t.name} · {t.code}</option>
      ))}
    </select>
  );
  const colorRender = (val, onChange) => <FRColorCell value={val} onChange={onChange} />;
  const componentRender = (val, onChange) => (
    <select value={val || ''} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '3px 0', color: FR.slate, fontFamily: "'Helvetica Neue',sans-serif" }}>
      <option value="">Select…</option>
      {BOM_COMPONENT_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
    </select>
  );

  const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };

  return (
    <div>
      <SectionTitle>Bill of Materials</SectionTitle>

      <div style={{ position: 'relative', marginBottom: 12 }}>
        <button onClick={openPicker}
          style={{ padding: '6px 14px', background: FR.slate, border: 'none', borderRadius: 3, fontSize: 11, color: FR.salt, cursor: 'pointer' }}>
          ◆ Pick from Component Pack
        </button>
        {picker && (
          <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: 'white', border: `1px solid ${FR.sand}`, borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 300, overflowY: 'auto', minWidth: 340, marginTop: 4 }}>
            <div style={{ padding: '8px 12px', background: FR.salt, fontSize: 10, color: FR.stone, display: 'flex', justifyContent: 'space-between' }}>
              <span>Select a Component Pack ({components.length})</span>
              <button onClick={() => setPicker(false)} style={{ background: 'none', border: 'none', color: FR.stone, cursor: 'pointer', fontSize: 12 }}>×</button>
            </div>
            {components.length === 0 ? (
              <div style={{ padding: 14, fontSize: 11, color: FR.stone, textAlign: 'center' }}>No Component Packs yet.</div>
            ) : components.map(c => (
              <button key={c.id} onClick={() => addFromComponent(c.id)}
                style={{ display: 'block', width: '100%', padding: '8px 12px', border: 'none', borderBottom: `1px solid ${FR.sand}`, background: 'white', cursor: 'pointer', textAlign: 'left', fontSize: 11, color: FR.slate }}>
                <strong>{c.component_name || 'Untitled'}</strong>
                <span style={{ color: FR.stone, marginLeft: 6 }}>{c.component_category || ''} {c.supplier ? `· ${c.supplier}` : ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel}>Fabrics</label>
        <ArrayTable
          headers={[
            { key: 'component',    label: 'Component',    render: componentRender },
            { key: 'fabricType',   label: 'Fabric Type',  placeholder: 'Twill / Jersey / Denim' },
            { key: 'composition',  label: 'Composition',  placeholder: '100% Cotton' },
            { key: 'weightGsm',    label: 'Weight (GSM)', placeholder: '400' },
            { key: 'colorPantone', label: 'Color / Pantone', placeholder: 'Pantone 19-4305' },
            { key: 'supplier',     label: 'Vendor',       render: supplierRender },
            { key: 'treatment_id', label: 'Treatment',    render: treatmentRender },
            { key: 'notes',        label: 'Notes' },
          ]}
          rows={fabrics} onUpdate={updF} onAdd={addF} onRemove={rmF} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel}>Trims & Accessories</label>
        <ArrayTable
          headers={[
            { key: 'component',     label: 'Component',     render: componentRender },
            { key: 'type',          label: 'Type',          placeholder: 'YKK #5 Coil' },
            { key: 'material',      label: 'Material',      placeholder: 'Metal / Nylon' },
            { key: 'color',         label: 'Color',         render: colorRender },
            { key: 'sizeSpec',      label: 'Size / Spec',   placeholder: '15mm' },
            { key: 'supplier',      label: 'Vendor',        render: supplierRender },
            { key: 'qtyPerGarment', label: 'Qty/Garment',   placeholder: '2' },
          ]}
          rows={trims} onUpdate={updT} onAdd={addT} onRemove={rmT} />
      </div>

    </div>
  );
}

export function StepBOMTrims({ data, set, packId, existingSuppliers = [] }) {
  const labels = data.labelsBranding && data.labelsBranding.length
    ? data.labelsBranding
    : [{ labelType: '', material: '', size: '', placement: '', artworkRef: '', notes: '' }];
  const attachments = Array.isArray(data.attachments) ? data.attachments : [];

  const updL = (i, k, v) => set('labelsBranding', labels.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addL = () => set('labelsBranding', [...labels, { labelType: '', material: '', size: '', placement: '', artworkRef: '', notes: '' }]);
  const rmL  = (i) => set('labelsBranding', labels.filter((_, idx) => idx !== i));

  const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };

  return (
    <div>
      <SectionTitle>Labels, Branding &amp; Source Files</SectionTitle>

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel}>Labels & Branding</label>
        <ArrayTable
          headers={[
            { key: 'labelType',  label: 'Label Type',  placeholder: 'Main / Care / Size / Hang Tag' },
            { key: 'material',   label: 'Material',    placeholder: 'Woven / Printed' },
            { key: 'size',       label: 'Size',        placeholder: '40 × 15 mm' },
            { key: 'placement',  label: 'Placement',   placeholder: 'Back neck / Side seam' },
            { key: 'artworkRef', label: 'Artwork Ref', placeholder: 'Filename or URL' },
            { key: 'notes',      label: 'Notes' },
          ]}
          rows={labels} onUpdate={updL} onAdd={addL} onRemove={rmL} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={sectionLabel}>Source Documents</label>
        <div style={{ fontSize: 11, color: FR.stone, marginBottom: 8, lineHeight: 1.5 }}>
          Attach spec sheets, artwork files, or reference documents. Files are stored securely and can be downloaded by any team member with access.
        </div>
        <FilesPanel
          attachments={attachments}
          packId={packId}
          onAdd={(ref) => set('attachments', [...attachments, ref])}
          onRemove={(i) => set('attachments', attachments.filter((_, idx) => idx !== i))}
        />
      </div>
    </div>
  );
}

export function StepColor({ data, set }) {
  const colorways = data.colorways && data.colorways.length ? data.colorways : [{ name: '', frColor: '', pantone: '', hex: '', fabricSwatch: '', approvalStatus: 'Pending' }];
  // When frColor changes, cache the library's Pantone TCX + hex onto the
  // colorway row so preview rendering keeps working without extra lookups.
  // The Pantone/hex columns themselves render read-only from the library.
  const updateCW = (i, k, v) => {
    set('colorways', colorways.map((r, idx) => {
      if (idx !== i) return r;
      if (k === 'frColor') {
        const entry = getFRColor(v);
        return {
          ...r, frColor: v,
          pantone: entry?.pantoneTCX || r.pantone || '',
          hex:     entry?.hex        || r.hex     || '',
        };
      }
      return { ...r, [k]: v };
    }));
  };
  const addCW = () => set('colorways', [...colorways, { name: '', frColor: '', pantone: '', hex: '', fabricSwatch: '', approvalStatus: 'Pending' }]);
  const rmCW = (i) => set('colorways', colorways.filter((_, idx) => idx !== i));

  const frColorRender = (v, onChange) => <FRColorCell value={v} onChange={onChange} />;
  // Read-only text cells that pull their value from the color library using
  // the row's frColor as the key. Edits happen only on PLM → Colors.
  const libraryCellRender = (field) => (_val, _onChange, row) => {
    const entry = row?.frColor ? getFRColor(row.frColor) : null;
    const v = entry?.[field] || '';
    return (
      <div style={{ padding: '3px 2px', fontSize: 11, color: FR.stone, fontFamily: "'Helvetica Neue',sans-serif" }}>
        {v || '—'}
      </div>
    );
  };
  const approvalRender = (v, onChange) => (
    <select value={v || 'Pending'} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '3px 2px', color: FR.slate, outline: 'none', fontFamily: "'Helvetica Neue',sans-serif", boxSizing: 'border-box' }}>
      {APPROVAL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );

  const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };

  return (
    <div>
      <SectionTitle>Colorways</SectionTitle>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {listFRColors().map(c => (
          <div key={c.name} style={{ textAlign: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: 4, background: c.hex || FR.salt, border: c.name === 'Salt' || !c.hex ? `1px solid ${FR.sand}` : 'none' }} />
            <div style={{ fontSize: 8, color: FR.stone, marginTop: 2 }}>{c.name}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel}>Colorway Specification</label>
        <p style={{ fontSize: 10, color: FR.stone, marginTop: -4, marginBottom: 6, fontStyle: 'italic' }}>
          Pantone TCX and Hex are pulled from the Colors palette. Edit them on <strong>PLM → Colors</strong>.
        </p>
        <ArrayTable
          headers={[
            { key: 'name',           label: 'Colorway Name', placeholder: 'Slate Wash' },
            { key: 'frColor',        label: 'FR Color',      render: frColorRender },
            { key: 'pantone',        label: 'Pantone TCX',   render: libraryCellRender('pantoneTCX') },
            { key: 'hex',            label: 'Hex',           render: libraryCellRender('hex') },
            { key: 'fabricSwatch',   label: 'Fabric Swatch', placeholder: 'Filename / code' },
            { key: 'approvalStatus', label: 'Approval',      render: approvalRender },
          ]}
          rows={colorways} onUpdate={updateCW} onAdd={addCW} onRemove={rmCW} />
      </div>
    </div>
  );
}

export function StepArtwork({ data, set, images, onUpload, onRemove }) {
  const placements = data.artworkPlacements && data.artworkPlacements.length ? data.artworkPlacements : [{ placement: '', artworkFile: '', method: '', sizeCm: '', positionFrom: '', color: '', notes: '' }];
  const updateAP = (i, k, v) => set('artworkPlacements', placements.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addAP = () => set('artworkPlacements', [...placements, { placement: '', artworkFile: '', method: '', sizeCm: '', positionFrom: '', color: '', notes: '' }]);
  const rmAP = (i) => set('artworkPlacements', placements.filter((_, idx) => idx !== i));

  const frColorRender = (v, onChange) => <FRColorCell value={v} onChange={onChange} />;

  const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };

  return (
    <div>
      <SectionTitle>Artwork & Placement</SectionTitle>

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel}>Logo & Method</label>
        <Row>
          <Input label="Front Logo"  value={data.logoFront}  onChange={v => set('logoFront', v)}  placeholder="Foreign Resource wordmark" />
          <Input label="Back Logo"   value={data.logoBack}   onChange={v => set('logoBack', v)}   placeholder="—" />
          <Input label="Method"      value={data.logoMethod} onChange={v => set('logoMethod', v)} placeholder="Embroidery / Screen Print" />
        </Row>
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel}>Artwork References</label>
        <Row>
          <PhotoUpload label="Front Artwork — Position, Size, Method" slotKey="artwork-front" images={images} onUpload={onUpload} onRemove={onRemove} />
          <PhotoUpload label="Back Artwork — Position, Size, Method"  slotKey="artwork-back"  images={images} onUpload={onUpload} onRemove={onRemove} />
        </Row>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={sectionLabel}>Placement Detail</label>
        <ArrayTable
          headers={[
            { key: 'placement',    label: 'Placement',    placeholder: 'Center chest / Back yoke' },
            { key: 'artworkFile',  label: 'Artwork File', placeholder: 'logo-v1.ai' },
            { key: 'method',       label: 'Method',       placeholder: 'Embroidery / Screen Print' },
            { key: 'sizeCm',       label: 'Size (cm)',    placeholder: '8 × 2' },
            { key: 'positionFrom', label: 'Position From',placeholder: '12 cm below HPS' },
            { key: 'color',        label: 'Color',        render: frColorRender },
            { key: 'notes',        label: 'Notes' },
          ]}
          rows={placements} onUpdate={updateAP} onAdd={addAP} onRemove={rmAP} />
      </div>
    </div>
  );
}
export function StepConstruction({ data, set }) {
  const seams = data.seams && data.seams.length ? data.seams : [{ operation: '', seamType: '', stitchType: '', spiSpcm: '', threadColor: '', threadType: '', notes: '' }];
  const updS = (i, k, v) => set('seams', seams.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addS = () => set('seams', [...seams, { operation: '', seamType: '', stitchType: '', spiSpcm: '', threadColor: '', threadType: '', notes: '' }]);
  const rmS  = (i) => set('seams', seams.filter((_, idx) => idx !== i));

  const threadColorRender = (v, onChange) => <FRColorCell value={v} onChange={onChange} />;
  const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };

  return (
    <div>
      <SectionTitle>Seam &amp; Stitch Specifications</SectionTitle>

      <div style={{ marginBottom: 10 }}>
        <label style={sectionLabel}>Seam &amp; Stitch Specification</label>
        <ArrayTable
          headers={[
            { key: 'operation',   label: 'Operation',    placeholder: 'Side seam / Hem / Collar' },
            { key: 'seamType',    label: 'Seam Type',    placeholder: 'Flatlock / French seam' },
            { key: 'stitchType',  label: 'Stitch Type',  placeholder: '301 / 401 / 504' },
            { key: 'spiSpcm',     label: 'SPI / SPCM',   placeholder: '10 SPI' },
            { key: 'threadColor', label: 'Thread Color', render: threadColorRender },
            { key: 'threadType',  label: 'Thread Type',  placeholder: 'Tex 40 / Polyester' },
            { key: 'notes',       label: 'Notes' },
          ]}
          rows={seams} onUpdate={updS} onAdd={addS} onRemove={rmS} />
      </div>
    </div>
  );
}

export function StepConstructionNotes({ data, set }) {
  const notes = data.constructionNotesTable && data.constructionNotesTable.length ? data.constructionNotesTable : [{ detail: '', area: '', description: '', reference: '' }];
  const updN = (i, k, v) => set('constructionNotesTable', notes.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addN = () => set('constructionNotesTable', [...notes, { detail: '', area: '', description: '', reference: '' }]);
  const rmN  = (i) => set('constructionNotesTable', notes.filter((_, idx) => idx !== i));

  const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };

  return (
    <div>
      <SectionTitle>Construction Notes</SectionTitle>
      <p style={{ fontSize: 11, color: FR.stone, marginBottom: 12, lineHeight: 1.5 }}>
        Free-form construction details that don't fit the seam/stitch grid: how the collar is built, pocket bag attachment, special bartacks, etc. Each row maps to a numbered detail callout that can be referenced from sketches.
      </p>
      <div style={{ marginBottom: 10 }}>
        <label style={sectionLabel}>Detail Callouts</label>
        <ArrayTable
          headers={[
            { key: '__idx',       label: 'Detail #',    render: (_v, _onChange, row) => (
              <span style={{ fontSize: 11, color: FR.stone, padding: '3px 4px' }}>{notes.indexOf(row) + 1}</span>
            ) },
            { key: 'area',        label: 'Area',         placeholder: 'Collar / Cuff / Pocket' },
            { key: 'description', label: 'Description',  placeholder: 'How it is constructed' },
            { key: 'reference',   label: 'Reference',    placeholder: 'Filename or sketch #' },
          ]}
          rows={notes} onUpdate={updN} onAdd={addN} onRemove={rmN} />
      </div>
      <div>
        <label style={sectionLabel}>Free-Form Notes</label>
        <Input
          multiline
          value={data.constructionNotes || ''}
          onChange={v => set('constructionNotes', v)}
          placeholder="Anything that doesn't fit a row — overall garment construction philosophy, special instructions, vendor-specific guidance…"
        />
      </div>
    </div>
  );
}

export function StepSketches({ images, onUpload, onRemove }) {
  const slots = [
    { key: 'sketch-1', label: 'Detail 1' },
    { key: 'sketch-2', label: 'Detail 2' },
    { key: 'sketch-3', label: 'Detail 3' },
    { key: 'sketch-4', label: 'Detail 4' },
    { key: 'sketch-5', label: 'Detail 5' },
    { key: 'sketch-6', label: 'Detail 6' },
  ];
  return (
    <div>
      <SectionTitle>Construction Detail Sketches</SectionTitle>
      <p style={{ fontSize: 11, color: FR.stone, marginBottom: 12, fontStyle: 'italic' }}>
        Detailed construction sketches: seam closeups, pocket assembly, cuff detail, collar build, etc.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {slots.map(s => (
          <PhotoUpload key={s.key} label={s.label} slotKey={s.key} images={images} onUpload={onUpload} onRemove={onRemove} />
        ))}
      </div>
    </div>
  );
}
export function StepPattern({ data, set, images, onUpload, onRemove }) {
  const pieces = data.patternPieces && data.patternPieces.length ? data.patternPieces : [{ pieceNum: '', pieceName: '', quantity: '', fabric: '', grain: '', fusing: '', notes: '' }];
  const updP = (i, k, v) => set('patternPieces', pieces.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addP = () => set('patternPieces', [...pieces, { pieceNum: '', pieceName: '', quantity: '', fabric: '', grain: '', fusing: '', notes: '' }]);
  const rmP  = (i) => set('patternPieces', pieces.filter((_, idx) => idx !== i));

  return (
    <div>
      <SectionTitle>Pattern Pieces &amp; Cutting</SectionTitle>

      <PhotoUpload label="Pattern Pieces Layout" slotKey="pattern-layout" images={images} onUpload={onUpload} onRemove={onRemove} />

      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>Pattern Piece Index</label>
        <ArrayTable
          headers={[
            { key: 'pieceNum',  label: 'Piece #',          placeholder: 'P-01' },
            { key: 'pieceName', label: 'Piece Name',       placeholder: 'Front Body' },
            { key: 'quantity',  label: 'Quantity',         placeholder: '2' },
            { key: 'fabric',    label: 'Fabric',           placeholder: 'Shell' },
            { key: 'grain',     label: 'Grain',            placeholder: 'Lengthwise' },
            { key: 'fusing',    label: 'Fusing/Interlining', placeholder: 'None' },
            { key: 'notes',     label: 'Notes' },
          ]}
          rows={pieces} onUpdate={updP} onAdd={addP} onRemove={rmP} />
      </div>

      <Input label="Cutting Instructions" value={data.cuttingInstructions} onChange={v => set('cuttingInstructions', v)} multiline
        placeholder="Marker plan, nap direction, utilisation target, shrinkage allowance…" />
    </div>
  );
}

export function StepPom({ data, set, images, onUpload, onRemove }) {
  const poms = data.poms && data.poms.length ? data.poms : [{ name: '', tol: '1', s: '', m: '', l: '', xl: '', method: '' }];
  const updPom = (i, k, v) => set('poms', poms.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addPom = () => set('poms', [...poms, { name: '', tol: '1', s: '', m: '', l: '', xl: '', method: '' }]);
  const rmPom  = (i) => set('poms', poms.filter((_, idx) => idx !== i));

  const szH = data.sizeType === 'waist'
    ? [{ key: 's', label: 'W30' }, { key: 'm', label: 'W32' }, { key: 'l', label: 'W34' }, { key: 'xl', label: 'W36' }]
    : [{ key: 's', label: 'S' }, { key: 'm', label: 'M' }, { key: 'l', label: 'L' }, { key: 'xl', label: 'XL' }];

  return (
    <div>
      <SectionTitle>Points of Measure (cm)</SectionTitle>

      <PhotoUpload label="POM Diagram (numbered measurement points)" slotKey="pom-diagram" images={images} onUpload={onUpload} onRemove={onRemove} />

      <Select label="Size Type" value={data.sizeType} onChange={v => set('sizeType', v)} options={['apparel', 'waist', 'one-size']} />

      {data.sizeType !== 'one-size' && (
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>Graded Spec Table (cm)</label>
          <ArrayTable
            headers={[
              { key: '__idx',  label: '#',            render: (_v, _onChange, row) => (
                <span style={{ fontSize: 11, color: FR.stone, padding: '3px 4px' }}>{poms.indexOf(row) + 1}</span>
              ) },
              { key: 'name',   label: 'Measurement',  placeholder: 'Chest Width' },
              ...szH,
              { key: 'method', label: 'Method',       placeholder: 'Lay flat / Tape' },
            ]}
            rows={poms} onUpdate={updPom} onAdd={addPom} onRemove={rmPom} />
        </div>
      )}

      <Input label="Measurement Method" value={data.measurementMethod} onChange={v => set('measurementMethod', v)} multiline
        placeholder="Lay garment flat on table. Smooth without stretching. Measure with flexible tape." />

      <p style={{ fontSize: 10, color: FR.stone, marginTop: 8, fontStyle: 'italic' }}>
        All measurements in centimetres. Measure flat, relaxed. Tolerance ±1 cm unless otherwise specified.
      </p>
    </div>
  );
}
// StepSizeMatrix — graded size table. Sizes are derived from the Style Overview
// sizeRange field; the user picks the sample size (whose values come straight
// from the POM page) and enters per-size deltas. Final values: sample + delta.
export function StepSizeMatrix({ data, set }) {
  const matrix = data.gradedSizeMatrix || { baseSize: 'M', sizes: [], grading: [] };

  // Sizes always come from Style Overview → sizeRange
  const rawSizes = Array.isArray(data.sizeRange)
    ? data.sizeRange
    : (data.sizeRange ? String(data.sizeRange).split(/[/,]+/).map(s => s.trim()).filter(Boolean) : []);
  const sizes = rawSizes.length ? rawSizes : ['S', 'M', 'L', 'XL'];
  const baseSize = sizes.includes(matrix.baseSize) ? matrix.baseSize : sizes[0];
  const poms = (data.poms || []).filter(p => p.name);

  const update = (patch) => set('gradedSizeMatrix', { ...matrix, ...patch });

  const setDelta = (pomName, size, value) => {
    const grading = Array.isArray(matrix.grading) ? matrix.grading : [];
    const idx = grading.findIndex(g => g.pomName === pomName);
    const num = value === '' ? null : Number(value);
    if (idx === -1) {
      update({ grading: [...grading, { pomName, perSizeDelta: { [size]: num } }] });
    } else {
      const next = [...grading];
      next[idx] = { ...next[idx], perSizeDelta: { ...(next[idx].perSizeDelta || {}), [size]: num } };
      update({ grading: next });
    }
  };

  const baseValueFor = (pom) => {
    const key = baseSize.toLowerCase();
    const v = pom[key];
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  const deltaFor = (pomName, size) => {
    const g = (matrix.grading || []).find(x => x.pomName === pomName);
    const v = g?.perSizeDelta?.[size];
    return (v === undefined || v === null || Number.isNaN(v)) ? null : Number(v);
  };
  const cellFor = (pom, size) => {
    const base = baseValueFor(pom);
    if (size === baseSize) return base !== null ? base.toFixed(1) : '—';
    const d = deltaFor(pom.name, size);
    if (d === null || base === null) return '—';
    return (base + d).toFixed(1);
  };

  const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };
  const cellStyle = { width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '3px 4px', textAlign: 'center', color: FR.slate, outline: 'none', fontFamily: "'Helvetica Neue', sans-serif" };

  return (
    <div>
      <SectionTitle>Graded Size Matrix</SectionTitle>
      <p style={{ fontSize: 11, color: FR.stone, marginBottom: 14, lineHeight: 1.5 }}>
        Sizes are pulled from the Style Overview page. Select the sample size — its values come straight from the Points of Measure page. Enter per-size deltas for all other sizes; final values are computed as <code style={{ fontFamily: 'ui-monospace,Menlo,monospace', background: FR.salt, padding: '1px 5px', borderRadius: 3 }}>sample + delta</code>.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 18 }}>
        <div>
          <label style={sectionLabel}>Sizes (from Style Overview)</label>
          <div style={{ width: '100%', padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 13, color: FR.stone, background: FR.salt, boxSizing: 'border-box', fontFamily: 'ui-monospace,Menlo,monospace' }}>
            {sizes.join(', ')}
          </div>
        </div>
        <div>
          <label style={sectionLabel}>Sample Size</label>
          <select value={baseSize} onChange={e => update({ baseSize: e.target.value })}
            style={{ width: '100%', padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 13, color: FR.slate, background: FR.white }}>
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
                <tr key={ri} style={{ background: ri % 2 === 0 ? FR.white : FR.salt }}>
                  <td style={{ padding: '4px 8px', borderBottom: `1px solid ${FR.sand}`, color: FR.slate, fontWeight: 500 }}>{pom.name}</td>
                  {sizes.map(s => {
                    const isBase = s === baseSize;
                    const delta = deltaFor(pom.name, s);
                    const computed = cellFor(pom, s);
                    return (
                      <React.Fragment key={s}>
                        <td style={{ padding: '2px', borderBottom: `1px solid ${FR.sand}`, borderLeft: `1px solid ${FR.sand}`, width: 50 }}>
                          {isBase ? (
                            <span style={{ ...cellStyle, color: FR.stone, display: 'block' }}>—</span>
                          ) : (
                            <input
                              type="number" step="0.1"
                              value={delta === null ? '' : delta}
                              onChange={e => setDelta(pom.name, s, e.target.value)}
                              placeholder="0"
                              style={cellStyle}
                            />
                          )}
                        </td>
                        <td style={{ padding: '4px', borderBottom: `1px solid ${FR.sand}`, width: 60, textAlign: 'center', color: isBase ? FR.soil : FR.slate, fontWeight: isBase ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>
                          {computed}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LinkedTreatmentCard({ treatment, components, rollups }) {
  const procBits = [];
  if (treatment.chemistry) procBits.push(treatment.chemistry);
  if (treatment.temperature_c) procBits.push(`${treatment.temperature_c}°C`);
  if (treatment.duration_minutes) procBits.push(`${treatment.duration_minutes} min`);
  const process = procBits.join(' · ') || '—';
  // Defect rate vs spec is the closest proxy we surface as a "drift" signal
  // on the tech pack: if the treatment has shipped enough POs to register a
  // weighted average, show it tinted by severity. <2% green, 2-5% amber,
  // >5% red. No history → no chip (rather than a misleading 0).
  const defect = rollups?.pos_count > 0 ? rollups.defect_rate_pct : null;
  const defectColor = defect == null ? FR.stone
    : defect > 5 ? '#A32D2D'
    : defect > 2 ? '#854F0B'
    : '#3B6D11';
  const open = (e) => {
    e.preventDefault();
    window.location.hash = `#plm/library/treatments/${treatment.id}`;
  };
  return (
    <div style={{ flex: '0 0 280px', padding: 12, background: FR.white, border: `1px solid ${FR.sand}`, borderRadius: 6, fontFamily: "'Helvetica Neue',sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong style={{ fontSize: 12, color: FR.slate }}>{treatment.name || 'Untitled'}</strong>
        <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 10, color: FR.stone }}>{treatment.code || '—'}</span>
      </div>
      <div style={{ fontSize: 10, color: FR.soil, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        {TREATMENT_TYPE_LABEL[treatment.type] || treatment.type || 'Treatment'}
      </div>
      <div style={{ fontSize: 11, color: FR.slate, marginBottom: 8, minHeight: 16 }}>{process}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {components.map(c => (
          <span key={c} style={{ padding: '2px 8px', background: FR.salt, border: `1px solid ${FR.sand}`, borderRadius: 5, fontSize: 10, color: FR.slate, letterSpacing: 0.3 }}>
            {c}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {defect != null ? (
          <span style={{ fontSize: 10, fontWeight: 600, color: defectColor }}>Defect {defect.toFixed(1)}%</span>
        ) : <span style={{ fontSize: 10, color: FR.stone }}>No production yet</span>}
        <a href={`#plm/library/treatments/${treatment.id}`} onClick={open}
          style={{ fontSize: 10, color: FR.soil, textDecoration: 'none', fontWeight: 600 }}>
          Open in PLM →
        </a>
      </div>
    </div>
  );
}

export function StepTreatments({ data, set, images, onUpload, onRemove }) {
  // Resolve `treatment_id` selections from BOM fabric rows into rich cards
  // (name, code, process summary, drift) so the designer sees what the
  // BOM picker pinned without leaving this page. This is a read-only
  // surface; clearing the link happens on the BOM page.
  const [tlib, setTlib] = useState([]);
  const [rollupsById, setRollupsById] = useState({});

  const linked = (() => {
    const byId = new Map();
    (data.fabrics || []).forEach(f => {
      if (!f.treatment_id) return;
      const arr = byId.get(f.treatment_id) || [];
      const tag = (f.component || '').trim();
      if (tag && !arr.includes(tag)) arr.push(tag);
      byId.set(f.treatment_id, arr);
    });
    return Array.from(byId.entries()).map(([id, components]) => ({ id, components }));
  })();

  useEffect(() => {
    let cancelled = false;
    listTreatments({ includeArchived: true }).then(rows => {
      if (!cancelled) setTlib(rows || []);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all(linked.map(async ({ id }) => [id, await getTreatmentRollups(id)])).then(pairs => {
      if (cancelled) return;
      setRollupsById(Object.fromEntries(pairs));
    });
    return () => { cancelled = true; };
    // linked is rebuilt every render, but its identity-defining input is the
    // treatment_id list — re-run only when that list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked.map(l => l.id).join('|')]);

  const treatments = data.treatments && data.treatments.length ? data.treatments : [{ step: '', treatment: '', process: '', temperature: '', duration: '', chemicals: '', notes: '' }];
  const updT = (i, k, v) => set('treatments', treatments.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addT = () => set('treatments', [...treatments, { step: '', treatment: '', process: '', temperature: '', duration: '', chemicals: '', notes: '' }]);
  const rmT  = (i) => set('treatments', treatments.filter((_, idx) => idx !== i));

  const distressing = data.distressing && data.distressing.length ? data.distressing : [{ area: '', technique: '', intensity: '', referenceImage: '', notes: '' }];
  const updD = (i, k, v) => set('distressing', distressing.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addD = () => set('distressing', [...distressing, { area: '', technique: '', intensity: '', referenceImage: '', notes: '' }]);
  const rmD  = (i) => set('distressing', distressing.filter((_, idx) => idx !== i));

  const intensityRender = (v, onChange) => (
    <select value={v || ''} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '3px 2px', color: FR.slate, outline: 'none', fontFamily: "'Helvetica Neue',sans-serif", boxSizing: 'border-box' }}>
      <option value="">—</option>
      {[1, 2, 3, 4, 5].map(n => <option key={n} value={String(n)}>{n}</option>)}
    </select>
  );
  const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };

  const tById = new Map((tlib || []).map(t => [t.id, t]));
  const resolvedLinks = linked
    .map(({ id, components }) => ({ treatment: tById.get(id), components, rollups: rollupsById[id] }))
    .filter(l => l.treatment);

  return (
    <div>
      <SectionTitle>Garment Treatments</SectionTitle>

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel}>Linked Treatments (from BOM)</label>
        {resolvedLinks.length === 0 ? (
          <div style={{ padding: '10px 14px', background: FR.salt, border: `1px dashed ${FR.sand}`, borderRadius: 4, fontSize: 11, color: FR.stone, fontStyle: 'italic' }}>
            No treatments selected on BOM fabric rows yet. Pick a treatment in the Fabrics table on the BOM step to see it resolved here.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {resolvedLinks.map(({ treatment, components, rollups }) => (
              <LinkedTreatmentCard key={treatment.id} treatment={treatment} components={components} rollups={rollups} />
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel}>Wash &amp; Dye Treatments</label>
        <ArrayTable
          headers={[
            { key: 'step',        label: 'Step',                  placeholder: '1 / 2 / 3' },
            { key: 'treatment',   label: 'Treatment',             placeholder: 'Acid Wash / Garment Dye' },
            { key: 'process',     label: 'Process',               placeholder: 'Stone wash, enzyme, etc.' },
            { key: 'temperature', label: 'Temperature',           placeholder: '40°C' },
            { key: 'duration',    label: 'Duration',              placeholder: '45 min' },
            { key: 'chemicals',   label: 'Chemicals or Agents',   placeholder: 'Pumice, enzyme, sodium…' },
            { key: 'notes',       label: 'Notes' },
          ]}
          rows={treatments} onUpdate={updT} onAdd={addT} onRemove={rmT} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel}>Distressing &amp; Special Finishes</label>
        <ArrayTable
          headers={[
            { key: 'area',           label: 'Area',             placeholder: 'Front pocket / Knee' },
            { key: 'technique',      label: 'Technique',        placeholder: 'Sandblast / Hand scrape' },
            { key: 'intensity',      label: 'Intensity (1-5)',  render: intensityRender },
            { key: 'referenceImage', label: 'Reference Image',  placeholder: 'Filename' },
            { key: 'notes',          label: 'Notes' },
          ]}
          rows={distressing} onUpdate={updD} onAdd={addD} onRemove={rmD} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={sectionLabel}>Before / After Reference</label>
        <Row>
          <PhotoUpload label="Before Treatment" slotKey="treatment-before" images={images} onUpload={onUpload} onRemove={onRemove} />
          <PhotoUpload label="After Treatment"  slotKey="treatment-after"  images={images} onUpload={onUpload} onRemove={onRemove} />
        </Row>
      </div>
    </div>
  );
}
export function StepLabels({ data, set, images, onUpload, onRemove }) {
  const locked = isStepLocked(16, data.status);

  const packaging = data.packagingItems && data.packagingItems.length ? data.packagingItems : [{ component: '', material: '', color: '', size: '', artworkPrint: '', qtyPerOrder: '', notes: '' }];
  const updP = (i, k, v) => set('packagingItems', packaging.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addP = () => set('packagingItems', [...packaging, { component: '', material: '', color: '', size: '', artworkPrint: '', qtyPerOrder: '', notes: '' }]);
  const rmP  = (i) => set('packagingItems', packaging.filter((_, idx) => idx !== i));

  const colorRender = (v, onChange) => <FRColorCell value={v} onChange={onChange} />;
  const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };

  return (
    <div>
      <SectionTitle>Labels &amp; Packaging</SectionTitle>
      {locked && <LockedBanner status={data.status} />}
      <fieldset disabled={locked} style={{ border: 'none', padding: 0, margin: 0, opacity: locked ? 0.45 : 1, pointerEvents: locked ? 'none' : 'auto' }}>

        <div style={{ marginBottom: 16 }}>
          <label style={sectionLabel}>Care &amp; Content Labels</label>
          <Row cols="1fr 1fr 1fr">
            <PhotoUpload label="Care Label Artwork" slotKey="label-care" images={images} onUpload={onUpload} onRemove={onRemove} />
            <PhotoUpload label="Main Label Artwork" slotKey="label-main" images={images} onUpload={onUpload} onRemove={onRemove} />
            <PhotoUpload label="Size Label Artwork" slotKey="label-size" images={images} onUpload={onUpload} onRemove={onRemove} />
          </Row>
        </div>

        <Input label="Care Instructions" value={data.careInstructions} onChange={v => set('careInstructions', v)} multiline
          placeholder="One instruction per line" />

        <div style={{ marginTop: 16 }}>
          <label style={sectionLabel}>Packaging Specification</label>
          <ArrayTable
            headers={[
              { key: 'component',    label: 'Component',         placeholder: 'Poly mailer / Dust bag / Hang tag' },
              { key: 'material',     label: 'Material',          placeholder: 'Recycled poly / Cotton muslin' },
              { key: 'color',        label: 'Color',             render: colorRender },
              { key: 'size',         label: 'Size',              placeholder: '35 × 45 cm' },
              { key: 'artworkPrint', label: 'Artwork or Print',  placeholder: 'Filename / Pantone' },
              { key: 'qtyPerOrder',  label: 'Qty per Order',     placeholder: '500' },
              { key: 'notes',        label: 'Notes' },
            ]}
            rows={packaging} onUpdate={updP} onAdd={addP} onRemove={rmP} />
        </div>
      </fieldset>
    </div>
  );
}
function computeQtyRow(row) {
  const s = parseFloat(row.s) || 0;
  const m = parseFloat(row.m) || 0;
  const l = parseFloat(row.l) || 0;
  const xl = parseFloat(row.xl) || 0;
  const totalUnits = s + m + l + xl;
  const unitCost = parseFloat(row.unitCost) || 0;
  const totalCost = totalUnits * unitCost;
  return { totalUnits, totalCost };
}

export function StepOrder({ data, set, library, saveToLibrary }) {
  const locked = isStepLocked(17, data.status);
  const [unitWeightG, setUnitWeightG] = useState(data.unitWeightGrams || '500');
  const [aiKey, setAiKey] = useState(getStoredKey());
  const [aiNotes, setAiNotes] = useState('');
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState('');

  const quantities = data.quantities && data.quantities.length ? data.quantities : [{ colorway: '', s: '', m: '', l: '', xl: '', unitCost: '' }];
  const updQ = (i, k, v) => set('quantities', quantities.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addQ = () => set('quantities', [...quantities, { colorway: '', s: '', m: '', l: '', xl: '', unitCost: '' }]);
  const rmQ  = (i) => set('quantities', quantities.filter((_, idx) => idx !== i));

  const cartons = data.cartons && data.cartons.length ? data.cartons : [{ cartonNum: '', colorway: '', sizeBreakdown: '', qtyPerCarton: '', dims: '', grossWeight: '', netWeight: '' }];
  const updC = (i, k, v) => set('cartons', cartons.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addC = () => set('cartons', [...cartons, { cartonNum: '', colorway: '', sizeBreakdown: '', qtyPerCarton: '', dims: '', grossWeight: '', netWeight: '' }]);
  const rmC  = (i) => set('cartons', cartons.filter((_, idx) => idx !== i));

  const cwOptions = (data.colorways || []).filter(c => c && c.name).map(c => c.name);
  const colorwayRender = (v, onChange) => (
    <select value={v || ''} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '3px 2px', color: FR.slate, outline: 'none', fontFamily: "'Helvetica Neue',sans-serif", boxSizing: 'border-box' }}>
      <option value="">—</option>
      {cwOptions.map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  );
  const totalUnitsRender = (_v, _onChange, row) => {
    const { totalUnits } = computeQtyRow(row);
    return <span style={{ fontSize: 11, color: FR.stone, padding: '3px 4px' }}>{totalUnits || 0}</span>;
  };
  const totalCostRender = (_v, _onChange, row) => {
    const { totalCost } = computeQtyRow(row);
    return <span style={{ fontSize: 11, color: FR.slate, padding: '3px 4px' }}>{totalCost > 0 ? `$${totalCost.toFixed(2)}` : '—'}</span>;
  };

  const orderTotal = quantities.reduce((sum, r) => sum + computeQtyRow(r).totalCost, 0);

  const addLocation = (val) => saveToLibrary && saveToLibrary('locations', val);

  async function runAIPackingList() {
    setAiRunning(true);
    setAiError('');
    try {
      if (aiKey) saveKey(aiKey);
      const result = await generatePackingList({
        apiKey: aiKey,
        styleName: data.styleName,
        productCategory: data.productCategory,
        quantities: data.quantities,
        unitWeightGrams: parseFloat(unitWeightG) || 500,
        shipMethod: data.shipMethod,
        notes: aiNotes,
      });
      set('cartons', result);
      set('unitWeightGrams', unitWeightG);
    } catch (err) {
      setAiError(err.message);
    }
    setAiRunning(false);
  }

  const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };

  return (
    <div>
      <SectionTitle>Order &amp; Delivery</SectionTitle>
      {locked && <LockedBanner status={data.status} />}
      <fieldset disabled={locked} style={{ border: 'none', padding: 0, margin: 0, opacity: locked ? 0.45 : 1, pointerEvents: locked ? 'none' : 'auto' }}>

        <div style={{ marginBottom: 18 }}>
          <label style={sectionLabel}>Quantity Per Size</label>
          <ArrayTable
            headers={[
              { key: 'colorway',   label: 'Colorway',   render: cwOptions.length > 0 ? colorwayRender : undefined, placeholder: 'Slate Wash' },
              { key: 's',          label: 'S',          placeholder: '0' },
              { key: 'm',          label: 'M',          placeholder: '0' },
              { key: 'l',          label: 'L',          placeholder: '0' },
              { key: 'xl',         label: 'XL',         placeholder: '0' },
              { key: '__total',    label: 'Total Units', render: totalUnitsRender },
              { key: 'unitCost',   label: 'Unit Cost $',placeholder: '0.00' },
              { key: '__totalCost',label: 'Total Cost', render: totalCostRender },
            ]}
            rows={quantities} onUpdate={updQ} onAdd={addQ} onRemove={rmQ} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 12px', marginTop: 4, background: FR.slate, color: FR.salt, borderRadius: 3, fontSize: 12, fontWeight: 600, letterSpacing: 1 }}>
            ORDER TOTAL: ${orderTotal.toFixed(2)}
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={sectionLabel}>Delivery Details</label>
          <Row>
            <EditableSelect label="Ship To" value={data.shipTo} onChange={v => set('shipTo', v)}
              options={(library && library.locations) || []} onAddOption={addLocation} placeholder="New ship-to address…" />
            <EditableSelect label="Delivery Location / Warehouse" value={data.deliveryLocation} onChange={v => set('deliveryLocation', v)}
              options={(library && library.locations) || []} onAddOption={addLocation} placeholder="New warehouse…" />
          </Row>
          <Row cols="1fr 1fr 1fr">
            <Select label="Ship Method" value={data.shipMethod} onChange={v => set('shipMethod', v)} options={['Air', 'Sea', 'Express (DHL/FedEx)']} />
            <Select label="Incoterm" value={data.incoterm} onChange={v => set('incoterm', v)} options={['FOB', 'CIF', 'EXW', 'DDP']} />
            <Input label="Freight Forwarder" value={data.freightForwarder} onChange={v => set('freightForwarder', v)} />
          </Row>
          <Row>
            <Input label="Target Ship Date" value={data.targetShipDate} onChange={v => set('targetShipDate', v)} placeholder="YYYY-MM-DD" />
            <Input label="Target Arrival Date" value={data.targetArrivalDate} onChange={v => set('targetArrivalDate', v)} placeholder="YYYY-MM-DD" />
          </Row>
          <Input label="Special Instructions" value={data.specialInstructions} onChange={v => set('specialInstructions', v)} multiline />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={sectionLabel}>Packing List</label>

          <div style={{ padding: 14, background: FR.salt, border: `1px solid ${FR.sand}`, borderRadius: 6, marginBottom: 12 }}>
            <Row cols="1fr 2fr">
              <Input label="Unit Weight (grams)" value={unitWeightG} onChange={setUnitWeightG} placeholder="500" />
              <Input label="AI Notes (optional)" value={aiNotes} onChange={setAiNotes} placeholder="e.g. use 50×30×25cm cartons, single colorway only" />
            </Row>
            <Input label="Anthropic API key" value={aiKey} onChange={setAiKey} placeholder="sk-ant-…" />
            <button onClick={runAIPackingList} disabled={aiRunning || !aiKey}
              style={{ padding: '7px 16px', background: aiRunning ? FR.stone : FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 11, cursor: aiRunning ? 'wait' : 'pointer', fontWeight: 600 }}>
              {aiRunning ? 'Generating…' : '✨ Generate with AI'}
            </button>
            {aiError && <p style={{ fontSize: 10, color: '#C0392B', marginTop: 8 }}>{aiError}</p>}
          </div>

          <ArrayTable
            headers={[
              { key: 'cartonNum',     label: 'Carton #',            placeholder: '1' },
              { key: 'colorway',      label: 'Colorway',            render: cwOptions.length > 0 ? colorwayRender : undefined },
              { key: 'sizeBreakdown', label: 'Size Breakdown',      placeholder: 'S:10 M:20 L:15 XL:5' },
              { key: 'qtyPerCarton',  label: 'Qty / Carton',        placeholder: '50' },
              { key: 'dims',          label: 'Carton Dims (cm)',    placeholder: '60×40×30' },
              { key: 'grossWeight',   label: 'Gross Weight (kg)',   placeholder: '18' },
              { key: 'netWeight',     label: 'Net Weight (kg)',     placeholder: '15' },
            ]}
            rows={cartons} onUpdate={updC} onAdd={addC} onRemove={rmC} />
        </div>
      </fieldset>
    </div>
  );
}
export function StepCompliance({ data, set }) {
  const locked = isStepLocked(14, data.status);

  const shipping = data.shippingReqs && data.shippingReqs.length ? data.shippingReqs : [{ requirement: '', specification: '', notes: '' }];
  const updS = (i, k, v) => set('shippingReqs', shipping.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addS = () => set('shippingReqs', [...shipping, { requirement: '', specification: '', notes: '' }]);
  const rmS  = (i) => set('shippingReqs', shipping.filter((_, idx) => idx !== i));

  const tests = data.testingStandards && data.testingStandards.length ? data.testingStandards : [{ test: '', standard: '', requirement: '', testMethod: '', passFail: 'Pending' }];
  const updT = (i, k, v) => set('testingStandards', tests.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addT = () => set('testingStandards', [...tests, { test: '', standard: '', requirement: '', testMethod: '', passFail: 'Pending' }]);
  const rmT  = (i) => set('testingStandards', tests.filter((_, idx) => idx !== i));

  // Auto-seed barcode matrix from colorways × sizeRange on first use
  const sizes = (data.sizeRange || 'S / M / L / XL').split('/').map(s => s.trim()).filter(Boolean);
  const colorways = (data.colorways || []).filter(c => c && c.name);
  const seedMatrix = () => {
    const rows = [];
    colorways.forEach(cw => sizes.forEach(sz => rows.push({
      size: sz, sku: '', upc: '', colorCode: cw.frColor || cw.name || '', shopifyVariantId: '',
    })));
    return rows.length ? rows : [{ size: '', sku: '', upc: '', colorCode: '', shopifyVariantId: '' }];
  };
  const matrix = data.barcodeMatrix && data.barcodeMatrix.length ? data.barcodeMatrix : seedMatrix();
  const updM = (i, k, v) => set('barcodeMatrix', matrix.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addM = () => set('barcodeMatrix', [...matrix, { size: '', sku: '', upc: '', colorCode: '', shopifyVariantId: '' }]);
  const rmM  = (i) => set('barcodeMatrix', matrix.filter((_, idx) => idx !== i));
  const reseedM = () => set('barcodeMatrix', seedMatrix());

  const passFailRender = (v, onChange) => (
    <select value={v || 'Pending'} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '3px 2px', color: FR.slate, outline: 'none', fontFamily: "'Helvetica Neue',sans-serif", boxSizing: 'border-box' }}>
      {PASS_FAIL.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
  const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };

  return (
    <div>
      <SectionTitle>Compliance &amp; Testing</SectionTitle>
      {locked && <LockedBanner status={data.status} />}
      <fieldset disabled={locked} style={{ border: 'none', padding: 0, margin: 0, opacity: locked ? 0.45 : 1, pointerEvents: locked ? 'none' : 'auto' }}>

        <div style={{ marginBottom: 18 }}>
          <label style={sectionLabel}>Shipping Requirements</label>
          <ArrayTable
            headers={[
              { key: 'requirement',   label: 'Requirement',   placeholder: 'Polybag, hang tag, etc.' },
              { key: 'specification', label: 'Specification', placeholder: 'Size, thickness, barcode…' },
              { key: 'notes',         label: 'Notes' },
            ]}
            rows={shipping} onUpdate={updS} onAdd={addS} onRemove={rmS} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={sectionLabel}>Testing Standards</label>
          <ArrayTable
            headers={[
              { key: 'test',        label: 'Test',        placeholder: 'Colorfastness / Tensile' },
              { key: 'standard',    label: 'Standard',    placeholder: 'AATCC 61 / ASTM D5034' },
              { key: 'requirement', label: 'Requirement', placeholder: 'Grade 4 / ≥ 15N' },
              { key: 'testMethod',  label: 'Test Method', placeholder: 'ISO 105-C06 / Instron' },
              { key: 'passFail',    label: 'Pass-Fail',   render: passFailRender },
            ]}
            rows={tests} onUpdate={updT} onAdd={addT} onRemove={rmT} />
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={sectionLabel}>Barcode &amp; SKU Matrix</label>
            <button onClick={reseedM}
              style={{ padding: '4px 10px', background: 'none', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 10, color: FR.soil, cursor: 'pointer' }}>
              ↻ Reseed from colorways × sizes
            </button>
          </div>
          <ArrayTable
            headers={[
              { key: 'size',             label: 'Size',              placeholder: 'S / M / L / XL' },
              { key: 'sku',              label: 'SKU',               placeholder: 'FR-BB-HD-001-SLT-M' },
              { key: 'upc',              label: 'UPC or Barcode',    placeholder: '123456789012' },
              { key: 'colorCode',        label: 'Color Code',        placeholder: 'SLATE / #3A3A3A' },
              { key: 'shopifyVariantId', label: 'Shopify Variant ID',placeholder: 'gid://…' },
            ]}
            rows={matrix} onUpdate={updM} onAdd={addM} onRemove={rmM} />
        </div>
      </fieldset>
    </div>
  );
}

const INSPECTION_STAGES = ['Pre-Production', 'During Production', 'Final Random Inspection', 'Pre-Shipment'];
const SEVERITY_OPTIONS = ['Critical', 'Major', 'Minor'];

export function StepQuality({ data, set }) {
  const locked = isStepLocked(15, data.status);

  const qi = data.qualityInspection || { aqlMajor: '2.5', aqlMinor: '4.0', inspectionStage: 'During Production', checklist: [], photoRequirements: '' };
  const setQI = (k, v) => set('qualityInspection', { ...qi, [k]: v });

  const checklist = qi.checklist && qi.checklist.length ? qi.checklist : [{ area: '', criterion: '', severity: 'Major' }];
  const updC = (i, k, v) => setQI('checklist', checklist.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addC = () => setQI('checklist', [...checklist, { area: '', criterion: '', severity: 'Major' }]);
  const rmC  = (i) => setQI('checklist', checklist.filter((_, idx) => idx !== i));

  const severityRender = (v, onChange) => (
    <select value={v || 'Major'} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '3px 2px', color: FR.slate, outline: 'none', fontFamily: "'Helvetica Neue',sans-serif", boxSizing: 'border-box' }}>
      {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );

  const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };

  return (
    <div>
      <SectionTitle>Quality Inspection (AQL)</SectionTitle>
      {locked && <LockedBanner status={data.status} />}
      <fieldset disabled={locked} style={{ border: 'none', padding: 0, margin: 0, opacity: locked ? 0.45 : 1, pointerEvents: locked ? 'none' : 'auto' }}>

        <div style={{ marginBottom: 18 }}>
          <label style={sectionLabel}>AQL Standard</label>
          <Row cols="1fr 1fr 1fr">
            <Input label="Major Defects (AQL)" value={qi.aqlMajor} onChange={v => setQI('aqlMajor', v)} placeholder="2.5" />
            <Input label="Minor Defects (AQL)" value={qi.aqlMinor} onChange={v => setQI('aqlMinor', v)} placeholder="4.0" />
            <div>
              <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>Inspection Stage</label>
              <select value={qi.inspectionStage || 'During Production'} onChange={e => setQI('inspectionStage', e.target.value)}
                style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: `1px solid ${FR.sand}`, borderRadius: 3, background: FR.white, color: FR.slate, fontFamily: "'Helvetica Neue',sans-serif" }}>
                {INSPECTION_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </Row>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={sectionLabel}>Inspection Checklist</label>
          <ArrayTable
            headers={[
              { key: 'area',      label: 'Area',      placeholder: 'Seam / Hem / Print' },
              { key: 'criterion', label: 'Criterion', placeholder: 'Stitches per inch ≥ 8' },
              { key: 'severity',  label: 'Severity',  render: severityRender },
            ]}
            rows={checklist} onUpdate={updC} onAdd={addC} onRemove={rmC} />
        </div>

        <Input label="Photo Requirements" value={qi.photoRequirements} onChange={v => setQI('photoRequirements', v)} multiline
          placeholder="What photos must the vendor send with each batch (front / back / detail / packaging)?" />
      </fieldset>
    </div>
  );
}
function isApprovalComplete(v) {
  if (!v) return false;
  const date = v.date || v.dateChop;
  return Boolean(v.name && v.signature && date);
}

function ApprovalCard({ title, value, onChange, dateLabel = 'Date', stepNumber, locked = false }) {
  const v = value || { name: '', signature: '', date: '', dateChop: '' };
  const dateKey = dateLabel === 'Date / Chop' ? 'dateChop' : 'date';
  const update = (k, val) => onChange({ ...v, [k]: val });
  const complete = isApprovalComplete(v);
  // Sequential gating (Designer → Brand Owner → Vendor): the first card is
  // always editable; downstream cards stay locked until the previous one
  // has name + signature + date.
  return (
    <div style={{ padding: 12, border: `1px solid ${complete ? FR.sage : FR.sand}`, borderRadius: 6, background: locked ? FR.salt : FR.white, opacity: locked ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: FR.soil, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
          {stepNumber ? <span style={{ marginRight: 6, color: FR.stone }}>{stepNumber}.</span> : null}{title}
        </div>
        {complete && <span style={{ fontSize: 9, color: '#3B6D11', fontWeight: 700, letterSpacing: 0.5 }}>SIGNED</span>}
        {!complete && locked && <span style={{ fontSize: 9, color: FR.stone, letterSpacing: 0.5 }}>LOCKED</span>}
      </div>
      <fieldset disabled={locked} style={{ border: 'none', padding: 0, margin: 0, pointerEvents: locked ? 'none' : 'auto' }}>
        <Input label="Name" value={v.name} onChange={val => update('name', val)} />
        <Input label="Signature" value={v.signature} onChange={val => update('signature', val)} placeholder="Typed signature" />
        <div style={{ marginBottom: 4 }}>
          <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 3, letterSpacing: 0.5, textTransform: 'uppercase' }}>{dateLabel}</label>
          <input type="date" value={v[dateKey] || ''} onChange={e => update(dateKey, e.target.value)}
            style={{ width: '100%', padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 3, fontFamily: "'Helvetica Neue', sans-serif", fontSize: 13, color: FR.slate, background: FR.white, outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </fieldset>
    </div>
  );
}

function RevisionDiff({ revisions }) {
  const lastIdx = revisions.length - 1;
  const [fromIdx, setFromIdx] = useState(Math.max(0, lastIdx - 1));
  const [toIdx, setToIdx] = useState(lastIdx);

  const from = revisions[fromIdx];
  const to   = revisions[toIdx];
  const fromSnap = from?.dataSnapshot;
  const toSnap   = to?.dataSnapshot;
  // Snapshots only landed in revisions[] from the asset-versioning commit
  // onward, so older revisions can lack `dataSnapshot`. Fall back to the
  // pre-computed `changedFields` written at snapshot time when one side
  // is missing.
  const changed = (fromSnap && toSnap)
    ? computePackDiff(fromSnap, toSnap)
    : (to?.changedFields || []);

  const opt = (r, i) => `${r.rev || `v${r.version || i + 1}`} · ${r.date || ''}${r.note ? ` · ${r.note.slice(0, 24)}` : ''}`;

  const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };
  const selectStyle = { width: '100%', padding: '6px 8px', fontSize: 12, border: `1px solid ${FR.sand}`, borderRadius: 3, background: FR.white, color: FR.slate, fontFamily: "'Helvetica Neue', sans-serif" };

  return (
    <div style={{ marginBottom: 18 }}>
      <label style={sectionLabel}>Revision Diff</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 9, color: FR.stone, letterSpacing: 0.5, marginBottom: 4 }}>FROM</div>
          <select value={fromIdx} onChange={e => setFromIdx(Number(e.target.value))} style={selectStyle}>
            {revisions.map((r, i) => <option key={i} value={i}>{opt(r, i)}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 9, color: FR.stone, letterSpacing: 0.5, marginBottom: 4 }}>TO</div>
          <select value={toIdx} onChange={e => setToIdx(Number(e.target.value))} style={selectStyle}>
            {revisions.map((r, i) => <option key={i} value={i}>{opt(r, i)}</option>)}
          </select>
        </div>
      </div>
      <div style={{ padding: 12, background: FR.white, border: `1px solid ${FR.sand}`, borderRadius: 6 }}>
        {fromIdx === toIdx ? (
          <div style={{ fontSize: 11, color: FR.stone, fontStyle: 'italic' }}>Pick two different revisions to see what changed.</div>
        ) : changed.length === 0 ? (
          <div style={{ fontSize: 11, color: FR.stone, fontStyle: 'italic' }}>No tracked fields changed between these revisions.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {changed.map(label => (
              <span key={label} style={{ padding: '4px 10px', background: FR.salt, border: `1px solid ${FR.sand}`, borderRadius: 5, fontSize: 11, color: FR.slate, letterSpacing: 0.3 }}>{label}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function StepRevision({ data, set, onSubmit, submitting, submitResult, onCreateRevision }) {
  const seedRevision = () => ({ rev: data.revision || 'V1.0', date: data.dateCreated || '', changedBy: '', section: '', description: 'Initial release', approvedBy: '' });
  const revisions = data.revisions && data.revisions.length ? data.revisions : [seedRevision()];
  const updR = (i, k, v) => set('revisions', revisions.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addR = () => set('revisions', [...revisions, { rev: '', date: '', changedBy: '', section: '', description: '', approvedBy: '' }]);
  const rmR  = (i) => set('revisions', revisions.filter((_, idx) => idx !== i));

  const fa = data.finalApproval || { designer: {}, brandOwner: {}, vendor: {} };
  const setFA = (key, val) => set('finalApproval', { ...fa, [key]: val });

  const designerDone   = isApprovalComplete(fa.designer);
  const brandOwnerDone = isApprovalComplete(fa.brandOwner);
  const vendorDone     = isApprovalComplete(fa.vendor);
  const allSigned      = designerDone && brandOwnerDone && vendorDone;

  // Auto-bump the pack to Released once all three approval cards are
  // complete. We only ever move forward — if the pack is already past
  // Released (or somehow ahead of it in the future), leave the status
  // alone. Status moves are append-only via `set('status', ...)`.
  useEffect(() => {
    if (!allSigned) return;
    const idx = STATUSES.indexOf(data.status);
    const releasedIdx = STATUSES.indexOf('Released');
    if (idx < releasedIdx || idx === -1) {
      set('status', 'Released');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSigned, data.status]);

  const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };

  return (
    <div>
      <SectionTitle>Revision History &amp; Approval</SectionTitle>

      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <label style={sectionLabel}>Revision History</label>
          {onCreateRevision && (
            <button onClick={onCreateRevision}
              style={{ padding: '4px 10px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 10, cursor: 'pointer' }}>
              + Snapshot
            </button>
          )}
        </div>
        <ArrayTable
          headers={[
            { key: 'rev',         label: 'Rev #',                 placeholder: 'V1.0' },
            { key: 'date',        label: 'Date',                  placeholder: 'YYYY-MM-DD' },
            { key: 'changedBy',   label: 'Changed By',            placeholder: 'Name' },
            { key: 'section',     label: 'Section',               placeholder: 'Cover / BOM / POM…' },
            { key: 'description', label: 'Description of Change', placeholder: 'Initial release' },
            { key: 'approvedBy',  label: 'Approved By',           placeholder: 'Name' },
          ]}
          rows={revisions} onUpdate={updR} onAdd={addR} onRemove={rmR} />
      </div>

      {revisions.length >= 2 && <RevisionDiff revisions={revisions} />}

      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <label style={sectionLabel}>Final Approval — sequential sign-off</label>
          {allSigned && <span style={{ fontSize: 10, fontWeight: 700, color: '#3B6D11', letterSpacing: 0.5 }}>FULLY SIGNED · STATUS BUMPED TO RELEASED</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <ApprovalCard stepNumber={1} title="Designer"    value={fa.designer}   onChange={v => setFA('designer', v)} />
          <ApprovalCard stepNumber={2} title="Brand Owner" value={fa.brandOwner} onChange={v => setFA('brandOwner', v)} locked={!designerDone} />
          <ApprovalCard stepNumber={3} title="Vendor"      value={fa.vendor}     onChange={v => setFA('vendor', v)} dateLabel="Date / Chop" locked={!brandOwnerDone} />
        </div>
      </div>

      <div style={{ marginTop: 20, padding: 16, border: `2px solid ${FR.soil}`, borderRadius: 6, background: FR.white }}>
        <div style={{ fontSize: 13, color: FR.slate, fontWeight: 600, marginBottom: 6 }}>Generate &amp; Download</div>
        <div style={{ fontSize: 11, color: FR.stone, lineHeight: 1.6, marginBottom: 12 }}>
          Creates a 14-page PDF and an editable SVG containing all the data above. Both files download to your device.
        </div>
        <button onClick={onSubmit} disabled={submitting}
          style={{ padding: '10px 24px', background: submitting ? FR.stone : FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 12, fontWeight: 600, cursor: submitting ? 'wait' : 'pointer', letterSpacing: 0.5 }}>
          {submitting ? 'Generating…' : 'Generate & Download'}
        </button>
        {submitResult && (
          <div style={{ marginTop: 10, fontSize: 11, color: submitResult.error ? '#C0392B' : FR.sage }}>
            {submitResult.error ? `Error: ${submitResult.error}` : `✓ Downloaded: ${submitResult.filename}.pdf and .svg`}
          </div>
        )}
      </div>
    </div>
  );
}

// Order mirrors STEPS in techPackConstants.js — by manufacturing stage.
export const STEP_FNS = [
  StepCover,             // 00 Design
  StepDesignOverview,    // 01 Design
  StepFlatlays,          // 02 Design
  StepBOM,               // 03 Materials — Fabrics & Trims
  StepBOMTrims,          // 04 Materials — Labels & Files (skippable)
  StepConstruction,      // 05 Cut & Sew — Seam & Stitch
  StepConstructionNotes, // 06 Cut & Sew — Construction Notes (skippable)
  StepSketches,          // 07 Cut & Sew — Detail Sketches
  StepPattern,           // 08 Cut & Sew — Pattern & Cutting
  StepPom,               // 09 Cut & Sew — POM (base size)
  StepSizeMatrix,        // 10 Cut & Sew — Graded Size Matrix (skippable)
  StepColor,             // 11 Embellishments — Colorways
  StepArtwork,           // 12 Embellishments — Artwork & Placement
  StepTreatments,        // 13 Treatments
  StepCompliance,        // 14 QC — Compliance & Testing
  StepQuality,           // 15 QC — Quality Inspection (AQL)
  StepLabels,            // 16 Packaging
  StepOrder,             // 17 Logistics
  StepRevision,          // 18 Sign-off
];

// Backwards-compat aliases so older references keep resolving during the
// multi-prompt rewrite. Remove once PLM / PDF / SVG utilities are updated.
export const StepIdentity = StepCover;
export const StepSku = () => <ComingSoon title="SKU & Numbering" />;
export const StepVendor = () => <ComingSoon title="Vendor" />;
export const StepDesign = StepDesignOverview;
export const StepMaterials = StepBOM;
export const StepReview = StepRevision;
