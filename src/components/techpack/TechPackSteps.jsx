// Tech Pack wizard — 14 step panels mapping 1:1 to the pages of
// FR_TechPack_Template_Blank.pdf.
//
// Page 1 (Cover & Identity) is fully built. All other pages are placeholders
// that will be replaced in subsequent prompts.

import { useEffect, useState, useMemo } from 'react';
import { FR, BOM_COMPONENT_OPTIONS, STATUSES, APPROVAL_STATUSES, PASS_FAIL, DEFAULT_DATA, isStepLocked, COLLECTIONS, PRODUCT_TYPES, deriveStyleNumber } from './techPackConstants';
import { listFRColors } from '../../utils/colorLibrary';
import { Input, Select, Row, SectionTitle, CoverPhoto, PhotoUpload, ArrayTable, EditableSelect, FRColorCell } from './TechPackPrimitives';
import { generatePackingList, getStoredKey, saveKey } from '../../utils/aiPackingList';
import { addSupplier } from '../../utils/plmDirectory';
import { getFRColor } from '../../utils/colorLibrary';
import { listTreatments } from '../../utils/treatmentStore';
import { useApp } from '../../context/AppContext';

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

  const labelStyle = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };
  const chipBase = { padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer', border: `1px solid ${FR.sand}`, transition: 'background 0.15s' };

  return (
    <div>
      <SectionTitle>Style Overview</SectionTitle>

      <CoverPhoto
        label="Ghost Mannequin Product Image"
        slotKey="cover"
        images={images}
        onUpload={onUpload}
        onRemove={onRemove}
        portrait
        uploadPrompt="Click or drop ghost mannequin product image here."
      />

      {/* Style number — read-only derived display */}
      <div style={{ marginBottom: 14, padding: '10px 14px', background: FR.salt, border: `1px solid ${FR.sand}`, borderRadius: 6 }}>
        <div style={{ fontSize: 10, color: FR.soil, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>Style #</div>
        <div style={{ fontFamily: "'ui-monospace','SF Mono',Menlo,monospace", fontSize: 15, color: FR.slate, letterSpacing: 1 }}>
          {styleNumberDisplay}
        </div>
        <div style={{ fontSize: 9, color: FR.stone, marginTop: 3 }}>Product # {data.productNumber || '—'} · auto-generated</div>
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
          <input readOnly value={data.revision || 'V1.0'}
            style={{ width: '100%', padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 3, fontFamily: "'Helvetica Neue', sans-serif", fontSize: 13, color: FR.stone, background: FR.salt, outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </Row>

      <EditableSelect label="Vendor" value={data.vendor}
        onChange={v => set('vendor', v)}
        options={existingSuppliers}
        onAddOption={addSupplier}
        placeholder="Add a new vendor…" />

      {/* Colorways — chip picker from color library */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Colorways</label>
        {libraryColors.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {libraryColors.map(color => {
              const active = selectedColorways.some(c => c.frColor === color.name);
              return (
                <button key={color.name} type="button" onClick={() => toggleColorway(color)}
                  style={{ ...chipBase, background: active ? FR.slate : FR.white, color: active ? FR.salt : FR.slate, borderColor: active ? FR.slate : FR.sand, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: color.hex || FR.sand, border: `1px solid ${FR.sand}`, flexShrink: 0 }} />
                  {color.name}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: FR.stone, fontStyle: 'italic' }}>No colors in library yet — add them in Library → Colors.</div>
        )}
        {selectedColorways.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 10, color: FR.stone }}>
            Selected: {selectedColorways.map(c => c.name).join(', ')}
          </div>
        )}
      </div>

      {/* Size range — multi-select chips */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Size Range</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SIZE_OPTIONS.map(s => {
            const active = selectedSizes.includes(s);
            return (
              <button key={s} type="button" onClick={() => toggleSize(s)}
                style={{ ...chipBase, background: active ? FR.slate : FR.white, color: active ? FR.salt : FR.slate, borderColor: active ? FR.slate : FR.sand, minWidth: 42, textAlign: 'center' }}>
                {s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Target Retail + Maximum FOB */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div>
          <Input label="Target Retail ($)" value={data.targetRetail} onChange={v => set('targetRetail', v)} placeholder="117" />
        </div>
        <div>
          <label style={labelStyle}>Maximum FOB ($)</label>
          {(() => {
            const a = state.assumptions || {};
            const cogsRate = parseFloat(a.cogsRate ?? 0.27);
            const fulfillmentPercent = parseFloat(a.fulfillmentPercent ?? 0.10);
            const seaFreightSpot = parseFloat((data.assumptions || {}).seaFreightSpot ?? 4);
            const shippingCharge = parseFloat((data.assumptions || {}).shippingCharge ?? 8);
            const retail = parseFloat(data.targetRetail) || 0;
            if (!retail) return <div style={{ padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 13, color: FR.stone, background: FR.salt, fontStyle: 'italic' }}>Enter target retail</div>;
            const maxFOB = retail * (cogsRate + fulfillmentPercent) - (fulfillmentCost || 0) + shippingCharge - seaFreightSpot;
            return <div style={{ padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 13, color: FR.slate, background: FR.salt, fontFamily: 'monospace' }}>${maxFOB.toFixed(2)}</div>;
          })()}
        </div>
      </div>

      {/* Assumptions — collapsible */}
      {(() => {
        const packAssumptions = data.assumptions || {};
        const a = state.assumptions || {};
        const fmt = (v, isPct) => v == null ? '—' : isPct ? `${(parseFloat(v) * 100).toFixed(1)}%` : `$${parseFloat(v).toFixed(2)}`;
        return (
          <div style={{ marginBottom: 14, border: `1px solid ${FR.sand}`, borderRadius: 6, overflow: 'hidden' }}>
            <button type="button" onClick={() => setAssumptionsOpen(o => !o)}
              style={{ width: '100%', padding: '8px 12px', background: FR.salt, border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: FR.soil, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Pricing Assumptions
              <span style={{ fontSize: 12, color: FR.stone }}>{assumptionsOpen ? '▲' : '▼'}</span>
            </button>
            {assumptionsOpen && (
              <div style={{ padding: 12, background: FR.white }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10, fontSize: 11 }}>
                  <div><div style={{ fontSize: 9, color: FR.stone, textTransform: 'uppercase', letterSpacing: 0.5 }}>COGS %</div><div style={{ color: FR.slate }}>{fmt(a.cogsRate, true)}</div></div>
                  <div><div style={{ fontSize: 9, color: FR.stone, textTransform: 'uppercase', letterSpacing: 0.5 }}>Fulfillment %</div><div style={{ color: FR.slate }}>{fmt(a.fulfillmentPercent, true)}</div></div>
                  <div><div style={{ fontSize: 9, color: FR.stone, textTransform: 'uppercase', letterSpacing: 0.5 }}>Fulfillment Cost</div><div style={{ color: FR.slate }}>{fulfillmentCost != null ? `$${fulfillmentCost.toFixed(2)}` : '—'}</div></div>
                </div>
                <Row cols="1fr 1fr">
                  <Input label="Shipping Charge ($)" value={packAssumptions.shippingCharge ?? '8'}
                    onChange={v => set('assumptions', { ...packAssumptions, shippingCharge: v })}
                    placeholder="8" />
                  <Input label="Sea Freight Spot ($)" value={packAssumptions.seaFreightSpot ?? '4'}
                    onChange={v => set('assumptions', { ...packAssumptions, seaFreightSpot: v })}
                    placeholder="4" />
                </Row>
                <p style={{ fontSize: 10, color: FR.stone, margin: 0, lineHeight: 1.5 }}>
                  Max FOB = Retail × (COGS% + Fulfillment%) − Fulfillment Cost + Shipping Charge − Sea Freight Spot.
                  COGS% and Fulfillment% pulled from the Cash tab. Fulfillment Cost includes Pick&amp;Pack + weight-tier rate + packaging from the rate card.
                </p>
              </div>
            )}
          </div>
        );
      })()}

      <Select label="Status" value={data.status} onChange={v => set('status', v)} options={STATUSES} />
      <p style={{ fontSize: 10, color: FR.stone, marginTop: -4, lineHeight: 1.5 }}>
        Labels, Order &amp; Delivery, and Compliance unlock at Pre-Production.
      </p>

      {/* Quote tiers */}
      <div style={{ marginTop: 22, padding: 16, background: FR.white, border: `1px solid ${FR.sand}`, borderRadius: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 18, color: FR.slate }}>Quote</h4>
          <span style={{ fontSize: 10, color: FR.stone, letterSpacing: 0.5 }}>Pricing &amp; lead times</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 22 }}>
          <div>
            <label style={labelStyle}>Cost Tiers</label>
            <CostTiersTable tiers={data.costTiers || []} onChange={tiers => set('costTiers', tiers)} />
          </div>
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
              <p style={{ fontSize: 10, color: FR.stone, marginTop: 4 }}>Where this quote came from — manufacturer or sourcing agent.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Weight → fulfillment cost */}
      <div style={{ marginTop: 16, padding: 16, background: FR.white, border: `1px solid ${FR.sand}`, borderRadius: 6 }}>
        <label style={labelStyle}>Weight &amp; Fulfillment</label>
        <Row cols="1fr 1fr">
          <Input label="Weight (kg)" value={data.weightKg} onChange={v => set('weightKg', v)} placeholder="0.45" />
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 3, letterSpacing: 0.5, textTransform: 'uppercase' }}>Fulfillment Cost</label>
            <div style={{ padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 13, color: fulfillmentCost != null ? FR.slate : FR.stone, background: FR.salt, fontStyle: fulfillmentCost != null ? 'normal' : 'italic' }}>
              {fulfillmentCost != null
                ? `$${fulfillmentCost.toFixed(2)}`
                : rateCard ? 'Enter weight above' : 'Set a rate card in Fulfillment tab'}
            </div>
          </div>
        </Row>
      </div>
    </div>
  );
}

export function StepDesignOverview({ data, set, images, onUpload, onRemove }) {
  const notes = data.keyDesignNotes && data.keyDesignNotes.length ? data.keyDesignNotes : [{ detail: '', description: '', reference: '' }];
  const updateNote = (i, k, v) => set('keyDesignNotes', notes.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addNote = () => set('keyDesignNotes', [...notes, { detail: '', description: '', reference: '' }]);
  const removeNote = (i) => set('keyDesignNotes', notes.filter((_, idx) => idx !== i));

  return (
    <div>
      <SectionTitle>Design Overview</SectionTitle>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>Garment Views</label>
        <Row cols="1fr 1fr 1fr">
          <PhotoUpload label="Front View" slotKey="design-front" images={images} onUpload={onUpload} onRemove={onRemove} />
          <PhotoUpload label="Back View"  slotKey="design-back"  images={images} onUpload={onUpload} onRemove={onRemove} />
          <PhotoUpload label="Side View"  slotKey="design-side"  images={images} onUpload={onUpload} onRemove={onRemove} />
        </Row>
      </div>

      <Row>
        <Input label="Vendor Contact" value={data.vendorContact} onChange={v => set('vendorContact', v)} placeholder="Name / WeChat / Email" />
        <Select label="Fabric Type" value={data.fabricType} onChange={v => set('fabricType', v)}
          options={['Cotton Jersey', 'Denim', 'Twill Cotton', 'Waxed Canvas', 'Other']} />
      </Row>

      <div style={{ marginTop: 10 }}>
        <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>Key Design Notes</label>
        <ArrayTable
          headers={[
            { key: '__idx',       label: '#',           render: (_v, _onChange, row) => (
              <span style={{ fontSize: 11, color: FR.stone, padding: '3px 4px' }}>{notes.indexOf(row) + 1}</span>
            ) },
            { key: 'detail',      label: 'Detail',      placeholder: 'e.g. Crossover hood' },
            { key: 'description', label: 'Description', placeholder: 'How it is constructed, the intent…' },
            { key: 'reference',   label: 'Reference',   placeholder: 'Filename or URL' },
          ]}
          rows={notes} onUpdate={updateNote} onAdd={addNote} onRemove={removeNote} />
      </div>
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

      <div style={{ marginBottom: 10 }}>
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
    </div>
  );
}
export function StepColor({ data, set, images, onUpload, onRemove }) {
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

  const placements = data.artworkPlacements && data.artworkPlacements.length ? data.artworkPlacements : [{ placement: '', artworkFile: '', method: '', sizeCm: '', positionFrom: '', color: '', notes: '' }];
  const updateAP = (i, k, v) => set('artworkPlacements', placements.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addAP = () => set('artworkPlacements', [...placements, { placement: '', artworkFile: '', method: '', sizeCm: '', positionFrom: '', color: '', notes: '' }]);
  const rmAP = (i) => set('artworkPlacements', placements.filter((_, idx) => idx !== i));

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
      <SectionTitle>Color & Artwork</SectionTitle>

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

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel}>Artwork & Logo Placement</label>
        <Row>
          <PhotoUpload label="Front Artwork — Position, Size, Method" slotKey="artwork-front" images={images} onUpload={onUpload} onRemove={onRemove} />
          <PhotoUpload label="Back Artwork — Position, Size, Method"  slotKey="artwork-back"  images={images} onUpload={onUpload} onRemove={onRemove} />
        </Row>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={sectionLabel}>Placement</label>
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

  const notes = data.constructionNotesTable && data.constructionNotesTable.length ? data.constructionNotesTable : [{ detail: '', area: '', description: '', reference: '' }];
  const updN = (i, k, v) => set('constructionNotesTable', notes.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addN = () => set('constructionNotesTable', [...notes, { detail: '', area: '', description: '', reference: '' }]);
  const rmN  = (i) => set('constructionNotesTable', notes.filter((_, idx) => idx !== i));

  const threadColorRender = (v, onChange) => <FRColorCell value={v} onChange={onChange} />;
  const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };

  return (
    <div>
      <SectionTitle>Construction Details</SectionTitle>

      <div style={{ marginBottom: 18 }}>
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

      <div style={{ marginBottom: 10 }}>
        <label style={sectionLabel}>Construction Notes</label>
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
export function StepTreatments({ data, set, images, onUpload, onRemove }) {
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

  return (
    <div>
      <SectionTitle>Garment Treatments</SectionTitle>

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
  const locked = isStepLocked(10, data.status);

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
  const locked = isStepLocked(11, data.status);
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
  const locked = isStepLocked(12, data.status);

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
      <SectionTitle>Compliance &amp; Quality</SectionTitle>
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
          <label style={sectionLabel}>Quality &amp; Testing Standards</label>
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
function ApprovalCard({ title, value, onChange, dateLabel = 'Date' }) {
  const v = value || { name: '', signature: '', date: '', dateChop: '' };
  const dateKey = dateLabel === 'Date / Chop' ? 'dateChop' : 'date';
  const update = (k, val) => onChange({ ...v, [k]: val });
  return (
    <div style={{ padding: 12, border: `1px solid ${FR.sand}`, borderRadius: 6, background: FR.white }}>
      <div style={{ fontSize: 10, color: FR.soil, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>
      <Input label="Name" value={v.name} onChange={val => update('name', val)} />
      <Input label="Signature" value={v.signature} onChange={val => update('signature', val)} placeholder="Typed signature" />
      <div style={{ marginBottom: 4 }}>
        <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 3, letterSpacing: 0.5, textTransform: 'uppercase' }}>{dateLabel}</label>
        <input type="date" value={v[dateKey] || ''} onChange={e => update(dateKey, e.target.value)}
          style={{ width: '100%', padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 3, fontFamily: "'Helvetica Neue', sans-serif", fontSize: 13, color: FR.slate, background: FR.white, outline: 'none', boxSizing: 'border-box' }} />
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

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel}>Final Approval</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <ApprovalCard title="Designer"    value={fa.designer}   onChange={v => setFA('designer', v)} />
          <ApprovalCard title="Brand Owner" value={fa.brandOwner} onChange={v => setFA('brandOwner', v)} />
          <ApprovalCard title="Vendor"      value={fa.vendor}     onChange={v => setFA('vendor', v)} dateLabel="Date / Chop" />
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

export const STEP_FNS = [
  StepCover,
  StepDesignOverview,
  StepFlatlays,
  StepBOM,
  StepColor,
  StepConstruction,
  StepSketches,
  StepPattern,
  StepPom,
  StepTreatments,
  StepLabels,
  StepOrder,
  StepCompliance,
  StepRevision,
];

// Backwards-compat aliases so older references keep resolving during the
// multi-prompt rewrite. Remove once PLM / PDF / SVG utilities are updated.
export const StepIdentity = StepCover;
export const StepSku = () => <ComingSoon title="SKU & Numbering" />;
export const StepVendor = () => <ComingSoon title="Vendor" />;
export const StepDesign = StepDesignOverview;
export const StepMaterials = StepBOM;
export const StepReview = StepRevision;
