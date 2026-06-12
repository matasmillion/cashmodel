// Tech Pack wizard — 14 step panels mapping 1:1 to the pages of
// FR_TechPack_Template_Blank.pdf.
//
// Page 1 (Cover & Identity) is fully built. All other pages are placeholders
// that will be replaced in subsequent prompts.

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { FR, FR_COLOR_OPTIONS, BOM_COMPONENT_OPTIONS, STATUSES, APPROVAL_STATUSES, PASS_FAIL, DEFAULT_DATA, CALLOUT_REF_RATIO, CALLOUT_MAIN_RATIO, CALLOUT_SUPPORT_RATIO, isStepLocked, isMerchLocked, COLLECTIONS, PRODUCT_TYPES, deriveStyleNumber } from './techPackConstants';

// Aspect used by the Cut & Sew call-out garment reference upload/crop, matching
// the live preview + PDF reference box so placed dots line up everywhere.
const CALLOUT_REF_ASPECT = { ratio: CALLOUT_REF_RATIO, label: 'Tall garment reference', shortLabel: 'garment reference' };

// Aspects for the call-out card images. Cropping uploads to these exact shapes
// (the same shapes the preview + PDF draw) means each image fills its card slot
// with no letterboxing. Exported so the Cut & Sew library card reuses them.
export const CALLOUT_MAIN_ASPECT    = { ratio: CALLOUT_MAIN_RATIO,    label: 'Main close-up', shortLabel: 'main 3:2' };
export const CALLOUT_SUPPORT_ASPECT = { ratio: CALLOUT_SUPPORT_RATIO, label: 'Support',        shortLabel: 'support 1:1' };
import { listFRColors } from '../../utils/colorLibrary';
import { Input, Select, Row, SectionTitle, CoverPhoto, PhotoUpload, AspectPhoto, ASPECTS, AssetImage, entryToDataUrl, ArrayTable, EditableSelect, FRColorCell, FilesPanel } from './TechPackPrimitives';
import { AnnotationOverlay } from './ImageAnnotator';

// Small "Annotate (N)" pill shown under any call-out photo that has an image, so
// the operator can open the red box / red text editor for that exact photo.
const ANNOTATE_BTN = { display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, padding: '3px 8px', borderRadius: 4, border: '0.5px solid rgba(58,58,58,0.15)', background: FR.salt, color: FR.slate, fontSize: 10, fontWeight: 600, letterSpacing: 0.3, cursor: 'pointer' };
export function AnnotateButton({ slot, images, annotations, onAnnotate, title }) {
  if (!onAnnotate) return null;
  if (!(images || []).some(i => i.slot === slot)) return null; // only when a photo exists
  const n = (annotations && annotations[slot] && annotations[slot].length) || 0;
  return (
    <button onClick={() => onAnnotate(slot, title)} style={ANNOTATE_BTN} title="Draw red box / text on this photo">
      <span style={{ color: '#A32D2D', fontWeight: 700 }}>+</span> Annotate{n ? ` (${n})` : ''}
    </button>
  );
}
import CropModal from './CropModal';
import { generatePackingList, getStoredKey, saveKey } from '../../utils/aiPackingList';
import { addSupplier } from '../../utils/plmDirectory';
import { getFRColor } from '../../utils/colorLibrary';
import { listTreatments, getTreatmentRollups, createTreatment } from '../../utils/treatmentStore';
import { TREATMENT_TYPE_LABEL } from '../../utils/treatmentLibrary';
import { listVendors } from '../../utils/vendorLibrary';
import { listEmbellishments, createEmbellishment } from '../../utils/embellishmentStore';
import { computePackDiff } from '../../utils/techPackDiff';
import { useApp } from '../../context/AppContext';
import { analyzeGarmentImage, generateGarmentView, imageEntryToDataUrl, resizeDataUrlForAI } from '../../utils/techPackViews';
import { StepFabrics, StepTrims, StepPackaging } from './TechPackBOMSteps';
import { estimateLaborCost } from '../../utils/aiLaborCost';
import CutSewCostChat from './CutSewCostChat';
import { getVendor } from '../../utils/vendorLibrary';

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

// Merchandising pages lock the moment status moves past Merchandising —
// once design starts, competitor and storefront prep is "decided".
function MerchLockedBanner({ status }) {
  return (
    <div style={{ padding: 14, background: FR.salt, border: `1px dashed ${FR.soil}`, borderRadius: 6, marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: FR.slate, fontWeight: 600, marginBottom: 4 }}>🔒 Locked — Merchandising phase only</div>
      <div style={{ fontSize: 11, color: FR.stone, lineHeight: 1.5 }}>
        Current status: <strong>{status}</strong>. This page is editable only while the pack status is <strong>Merchandising</strong>. Lower the status on Page 01 to re-open it.
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

// Page 000 — Competitor Landscape. Pre-tech-pack strategy: pricing table,
// feature comparison, plus a free-form positioning note. Each row is one
// competitor product the brand is benchmarking against. Locks once the
// pack moves past the Merchandising phase.
export function StepCompetitorLandscape({ data, set }) {
  const locked = isMerchLocked(0, data.status);
  const competitors = data.competitors && data.competitors.length
    ? data.competitors
    : [{ brand: '', product: '', url: '', price: '', currency: 'USD', features: '', notes: '' }];
  const updC = (i, k, v) => set('competitors', competitors.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addC = () => set('competitors', [...competitors, { brand: '', product: '', url: '', price: '', currency: 'USD', features: '', notes: '' }]);
  const rmC  = (i) => set('competitors', competitors.filter((_, idx) => idx !== i));

  const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };

  return (
    <div>
      <SectionTitle>Competitor Landscape</SectionTitle>
      {locked && <MerchLockedBanner status={data.status} />}
      <p style={{ fontSize: 11, color: FR.stone, marginBottom: 14, lineHeight: 1.5 }}>
        Map the products you're benchmarking against — brand, product, retail price, key features. The Competitive Landscape note below is for FR's positioning relative to the field.
      </p>

      <fieldset disabled={locked} style={{ border: 'none', padding: 0, margin: 0, opacity: locked ? 0.45 : 1, pointerEvents: locked ? 'none' : 'auto' }}>
        <div style={{ marginBottom: 18 }}>
          <label style={sectionLabel}>Pricing & Feature Analysis</label>
          <ArrayTable
            headers={[
              { key: 'brand',    label: 'Brand',         placeholder: 'e.g. Carhartt WIP' },
              { key: 'product',  label: 'Product',       placeholder: 'Product / SKU name' },
              { key: 'url',      label: 'URL',           placeholder: 'https://…' },
              { key: 'price',    label: 'Retail Price',  placeholder: '180' },
              { key: 'currency', label: 'Currency',      placeholder: 'USD' },
              { key: 'features', label: 'Key Features',  placeholder: '400gsm, drop shoulder, garment-dyed…' },
              { key: 'notes',    label: 'Notes',         placeholder: 'positioning, distribution, hype…' },
            ]}
            rows={competitors} onUpdate={updC} onAdd={addC} onRemove={rmC}
          />
        </div>

        <div>
          <label style={sectionLabel}>Competitive Landscape — FR Positioning</label>
          <Input
            multiline
            value={data.competitivePositioning || ''}
            onChange={v => set('competitivePositioning', v)}
            placeholder="Where this product sits in the market — pricing tier vs competitors, distinctive construction, brand story angle, target customer, distribution strategy…"
          />
        </div>
      </fieldset>
    </div>
  );
}

// Stylised mac-style desktop browser frame. Empty inside until the
// storefront preview engine is wired in.
function DesktopFrame() {
  return (
    <div style={{ width: '100%' }}>
      <div style={{ fontSize: 9, color: FR.soil, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, textAlign: 'center' }}>
        Desktop · 16:10
      </div>
      <div style={{
        background: FR.white,
        border: `0.5px solid ${FR.sand}`,
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(58,58,58,0.06)',
        aspectRatio: '16 / 10',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Browser chrome */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: FR.salt,
          borderBottom: `0.5px solid ${FR.sand}`,
        }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#FF5F57' }} />
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#FEBC2E' }} />
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#28C840' }} />
          <div style={{ flex: 1, marginLeft: 14, fontSize: 10, color: FR.stone, fontFamily: 'ui-monospace,Menlo,monospace', background: FR.white, border: `0.5px solid ${FR.sand}`, borderRadius: 4, padding: '3px 8px' }}>
            foreignresource.co/products/{'{style-slug}'}
          </div>
        </div>
        {/* Empty viewport */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 9, color: FR.stone, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase' }}>Coming Soon</div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 18, color: FR.slate }}>PDP Layout</div>
        </div>
      </div>
    </div>
  );
}

// Stylised iPhone frame with notch / Dynamic Island and bottom indicator.
function PhoneFrame() {
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ fontSize: 9, color: FR.soil, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, textAlign: 'center' }}>
        iPhone · 9:19.5
      </div>
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 220,
        aspectRatio: '9 / 19.5',
        background: FR.slate,
        borderRadius: 30,
        padding: 6,
        boxShadow: '0 6px 24px rgba(58,58,58,0.18)',
      }}>
        <div style={{
          width: '100%',
          height: '100%',
          background: FR.white,
          borderRadius: 24,
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 4,
        }}>
          {/* Dynamic Island */}
          <div style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 60,
            height: 18,
            background: FR.slate,
            borderRadius: 12,
          }} />
          {/* Bottom indicator */}
          <div style={{
            position: 'absolute',
            bottom: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 80,
            height: 3,
            background: FR.slate,
            borderRadius: 2,
            opacity: 0.4,
          }} />
          <div style={{ fontSize: 8, color: FR.stone, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase' }}>Coming Soon</div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 14, color: FR.slate }}>Mobile PDP</div>
        </div>
      </div>
    </div>
  );
}

// Page 00 — Merchandising Preview. Pre-tech-pack placeholder showing
// desktop and mobile storefront frames side-by-side. Locks once the
// pack moves past the Merchandising phase.
export function StepMerchandisingPreview({ data }) {
  const locked = isMerchLocked(1, data?.status);
  return (
    <div>
      <SectionTitle>Merchandising Preview</SectionTitle>
      {locked && <MerchLockedBanner status={data.status} />}
      <p style={{ fontSize: 11, color: FR.stone, marginBottom: 22, lineHeight: 1.5 }}>
        This page will render live storefront previews — desktop and mobile — so the launch experience is locked at the design phase. Wired in once the product preview engine ships.
      </p>

      <fieldset disabled={locked} style={{ border: 'none', padding: 0, margin: 0, opacity: locked ? 0.45 : 1, pointerEvents: locked ? 'none' : 'auto' }}>
        <div style={{
          padding: '32px 28px',
          border: `2px dashed ${FR.sand}`,
          borderRadius: 8,
          background: FR.salt,
          display: 'grid',
          gridTemplateColumns: '2.4fr 1fr',
          gap: 32,
          alignItems: 'center',
        }}>
          <DesktopFrame />
          <PhoneFrame />
        </div>
      </fieldset>
    </div>
  );
}

export function StepCover({ data, set, images, onUpload, onRemove, existingSuppliers = [] }) {
  const { state } = useApp();
  const rateCard = state.rateCard;

  // Library colors for colorway chip picker
  const [libraryColors, setLibraryColors] = useState([]);
  useEffect(() => { setLibraryColors(listFRColors()); }, []);

  // Vendors for quote provider dropdown
  const [vendorNames, setVendorNames] = useState(null);
  useEffect(() => {
    listVendors({ includeArchived: false }).then(rows => {
      setVendorNames((rows || []).map(r => r.name).filter(Boolean).sort());
    }).catch(() => setVendorNames([]));
  }, []);

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
  const productWeightKg = parseFloat(data.weightKg ?? data.shippingWeightKg ?? 0) || 0;
  const seaFreightCost = seaFreightSpot * productWeightKg;
  const maxFOB = retail > 0
    ? retail * (cogsRate + fulfillmentPercent) - (fulfillmentCost || 0) + shippingCharge - seaFreightCost
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
                <Input label="Sea Freight Spot ($/kg)" value={packAssumptions.seaFreightSpot ?? '4'}
                  onChange={v => set('assumptions', { ...packAssumptions, seaFreightSpot: v })} placeholder="4" />
              </Row>
              <p style={{ fontSize: 10, color: FR.stone, margin: 0, lineHeight: 1.5 }}>
                Max FOB = Retail × (COGS% + Fulfillment%) − Fulfillment Cost + Shipping Offset − (Sea Freight $/kg × Product Weight).
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
              {/* Dropdown from vendor library; falls back to free-text if "Other" selected */}
              {vendorNames && vendorNames.length > 0 && (() => {
                const isCustom = data.quoteProviderLink && !vendorNames.includes(data.quoteProviderLink);
                const selectVal = isCustom ? '__custom__' : (data.quoteProviderLink || '');
                return (
                  <>
                    <select
                      value={selectVal}
                      onChange={e => {
                        if (e.target.value === '__custom__') set('quoteProviderLink', '');
                        else set('quoteProviderLink', e.target.value);
                      }}
                      style={{ width: '100%', padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 13, color: FR.slate, background: FR.white, outline: 'none', boxSizing: 'border-box', marginBottom: 4 }}>
                      <option value="">— Select vendor —</option>
                      {vendorNames.map(n => <option key={n} value={n}>{n}</option>)}
                      <option value="__custom__">Other / enter manually…</option>
                    </select>
                    {(selectVal === '__custom__' || (!selectVal && isCustom)) && (
                      <input value={data.quoteProviderLink || ''} onChange={e => set('quoteProviderLink', e.target.value)}
                        placeholder="Enter manufacturer or sourcing agent name"
                        autoFocus
                        style={{ width: '100%', padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 13, color: FR.slate, background: FR.white, outline: 'none', boxSizing: 'border-box' }} />
                    )}
                  </>
                );
              })()}
              {(!vendorNames || vendorNames.length === 0) && (
                <input value={data.quoteProviderLink || ''} onChange={e => set('quoteProviderLink', e.target.value)}
                  placeholder="e.g. Dongguan Shengde Clothing Ltd."
                  style={{ width: '100%', padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 13, color: FR.slate, background: FR.white, outline: 'none', boxSizing: 'border-box' }} />
              )}
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

// Indeterminate "still working" bar — a slate blob that loops left to
// right inside a sand track. No percentage, since we don't actually
// know when fal will finish.
function LoopingBar() {
  return (
    <>
      <style>{`
        @keyframes fr-loop-bar {
          0%   { left: -45%; }
          100% { left: 100%; }
        }
      `}</style>
      <div style={{ position: 'relative', width: '100%', height: 3, background: FR.sand, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          position: 'absolute',
          top: 0,
          width: '40%',
          height: '100%',
          background: FR.slate,
          borderRadius: 2,
          animation: 'fr-loop-bar 1.6s ease-in-out infinite',
        }} />
      </div>
    </>
  );
}

function GenerateViewsModal({ viewSources, sharedRefs, customContext, style, bgColorName, onAccept, onClose }) {
  const [phase, setPhase]       = useState('analyzing');
  const [description, setDesc]  = useState('');
  const [perViewRefs, setPVR]   = useState({ front: [], back: [], side: [] }); // resolved data URIs per view
  const [views, setViews]       = useState({ front: null, back: null, side: null });
  const [vstatus, setVstatus]   = useState({ front: 'pending', back: 'pending', side: 'pending' });
  const [verrors, setVerrors]   = useState({ front: '', back: '', side: '' });
  const [regenInput, setRegen]  = useState({ front: '', back: '', side: '' });
  const [errMsg, setErrMsg]     = useState('');

  useEffect(() => { startAll(); }, []);

  function toMsg(e) {
    return (typeof e?.message === 'string' ? e.message : String(e)) || 'Unknown error';
  }

  // Combine the top-level designer context with any per-regeneration feedback.
  function buildCtx(extra) {
    const trimmed = (extra || '').trim();
    if (!trimmed) return customContext;
    const feedback = `Designer feedback for this iteration: ${trimmed}`;
    return customContext ? `${customContext}\n\n${feedback}` : feedback;
  }

  async function runOneView(view, desc, refs, ctx) {
    setVstatus(vs => ({ ...vs, [view]: 'loading' }));
    setVerrors(ve => ({ ...ve, [view]: '' }));
    try {
      const url = await generateGarmentView(desc, view, {
        references: refs,
        customContext: ctx,
        style,
        bgColorName,
      });
      setViews(vs => ({ ...vs, [view]: url }));
      setVstatus(vs => ({ ...vs, [view]: 'done' }));
    } catch (e) {
      console.error(`[techpack-views] ${view} failed:`, e);
      setVstatus(vs => ({ ...vs, [view]: 'error' }));
      setVerrors(ve => ({ ...ve, [view]: toMsg(e) }));
    }
  }

  async function startAll(viewsToRun = VIEWS) {
    try {
      setPhase('analyzing');

      // Step 1: convert image entries to data URLs — each load is labeled so
      // an error names the failing slot (e.g. "front reference — Failed to fetch").
      const SLOT_LABELS = {
        'design-treatment-ref':     'treatment reference',
        'design-embellishment-ref': 'embellishment reference',
      };
      const loadRef = (entry, name) =>
        imageEntryToDataUrl(entry).catch(e => { throw new Error(`${name} — ${toMsg(e)}`); });

      let imageUrls;
      try {
        const [frontUrl, backUrl, sideUrl, ...sharedUrls] = await Promise.all([
          viewSources?.front ? loadRef(viewSources.front, 'front reference')  : Promise.resolve(null),
          viewSources?.back  ? loadRef(viewSources.back,  'back reference')   : Promise.resolve(null),
          viewSources?.side  ? loadRef(viewSources.side,  'side reference')   : Promise.resolve(null),
          ...(sharedRefs || []).map(r => loadRef(r, SLOT_LABELS[r.slot] || 'shared reference')),
        ]);
        imageUrls = { frontUrl, backUrl, sideUrl, sharedClean: sharedUrls.filter(Boolean) };
      } catch (e) {
        throw new Error(`Could not load reference image: ${toMsg(e)}`);
      }

      const { frontUrl, backUrl, sideUrl, sharedClean } = imageUrls;
      const refs = {
        front: [frontUrl, ...sharedClean].filter(Boolean),
        back:  [backUrl,  ...sharedClean].filter(Boolean),
        side:  [sideUrl,  ...sharedClean].filter(Boolean),
      };

      const seed = frontUrl || backUrl || sideUrl || sharedClean[0];
      if (!seed) throw new Error('Upload at least one reference image first');
      setPVR(refs);

      // Step 2: resize all images — two budgets:
      //   • 1024px for Claude Vision (JSON body through anthropic-proxy)
      //   • 768px for fal.ai references (image_urls payload through fal-proxy)
      // Without this, full-res photos (~3-5 MB base64) time out the Supabase
      // Edge Function before fal.ai can even queue the job (504).
      const safeResize = async (url, maxDim) => {
        if (!url) return url;
        try { return await resizeDataUrlForAI(url, maxDim); } catch { return url; }
      };

      const [smallSeed, ...resizedRefArrays] = await Promise.all([
        safeResize(seed, 1024),
        Promise.all(refs.front.map(u => safeResize(u, 768))),
        Promise.all(refs.back.map(u => safeResize(u, 768))),
        Promise.all(refs.side.map(u => safeResize(u, 768))),
      ]);
      const [smallFront, smallBack, smallSide] = resizedRefArrays;
      const smallRefs = { front: smallFront, back: smallBack, side: smallSide };

      // Step 3: Claude Vision — describe the garment
      let desc;
      try {
        const mime = 'image/jpeg';
        const b64  = smallSeed.replace(/^data:[^;]+;base64,/, '');
        desc = await analyzeGarmentImage(b64, mime);
      } catch (e) {
        throw new Error(`Garment analysis failed: ${toMsg(e)}`);
      }
      setDesc(desc);

      // Step 4: fal.ai generation (references capped at 768px each)
      setPhase('generating');
      await Promise.all(viewsToRun.map(view => runOneView(view, desc, smallRefs[view], customContext)));
      setPhase('done');
    } catch (e) {
      console.error('[techpack-views] generate failed:', e);
      setErrMsg(toMsg(e));
      setPhase('error');
    }
  }

  async function regenView(view) {
    if (!description) return;
    const extra = regenInput[view];
    const ctx = buildCtx(extra);
    setRegen(p => ({ ...p, [view]: '' }));
    setViews(vs => ({ ...vs, [view]: null }));
    await runOneView(view, description, perViewRefs[view] || [], ctx);
  }

  // accepting guards against double-click duplicates. The fetch + base64
  // pass takes a beat, so an undisabled button used to let the user mash
  // through repeated accept cycles, each one stacking a fresh copy of
  // every generated view into design-front/back/side.
  const [accepting, setAccepting] = useState(false);
  async function handleAccept() {
    if (accepting) return;
    setAccepting(true);
    try {
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
        } catch (e) {
          console.error(`[techpack-views] accept failed for ${view}:`, e);
        }
      }));
    } finally {
      onClose();
    }
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

        {/* Analyzing phase — single looping bar across the modal */}
        {phase === 'analyzing' && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: FR.stone, marginBottom: 10, fontStyle: 'italic' }}>
              Analyzing garment with Claude Vision…
            </div>
            <LoopingBar />
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
                  position: 'relative',
                }}>
                  {vstatus[view] === 'loading' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '0 16px', width: '100%' }}>
                      <div style={{ fontSize: 11, color: FR.stone, fontStyle: 'italic' }}>Generating…</div>
                      <LoopingBar />
                    </div>
                  )}
                  {vstatus[view] === 'error' && (
                    <div style={{ fontSize: 10, color: '#A32D2D', padding: '0 10px', textAlign: 'center', lineHeight: 1.4, wordBreak: 'break-word' }}>
                      {verrors[view] || 'Failed'}
                    </div>
                  )}
                  {views[view] && (
                    <img src={views[view]} alt={VIEW_LABELS[view]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
                {(vstatus[view] === 'done' || vstatus[view] === 'error') && (
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <textarea
                      value={regenInput[view]}
                      onChange={e => setRegen(p => ({ ...p, [view]: e.target.value }))}
                      placeholder="What to improve? (optional)"
                      rows={2}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: `0.5px solid ${FR.sand}`,
                        borderRadius: 4,
                        fontSize: 10,
                        color: FR.slate,
                        background: FR.white,
                        resize: 'none',
                        fontFamily: "'Helvetica Neue', sans-serif",
                        lineHeight: 1.35,
                        boxSizing: 'border-box',
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => regenView(view)}
                      style={{ width: '100%', fontSize: 10, background: 'none', border: `0.5px solid ${FR.sand}`, borderRadius: 4, padding: '5px 0', cursor: 'pointer', color: FR.stone, letterSpacing: 0.3 }}>
                      Regenerate
                    </button>
                  </div>
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
          <button onClick={onClose} disabled={accepting} style={{ padding: '8px 18px', background: 'none', border: `0.5px solid ${FR.sand}`, borderRadius: 6, cursor: accepting ? 'not-allowed' : 'pointer', fontSize: 12, color: FR.slate, opacity: accepting ? 0.5 : 1 }}>
            Cancel
          </button>
          {phase === 'error' && (
            <button onClick={() => { setErrMsg(''); startAll(); }} style={{ padding: '8px 22px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, letterSpacing: 0.3 }}>
              Try Again
            </button>
          )}
          {allDone && (
            <button onClick={handleAccept} disabled={accepting} style={{ padding: '8px 22px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, cursor: accepting ? 'not-allowed' : 'pointer', fontSize: 12, letterSpacing: 0.3, opacity: accepting ? 0.7 : 1 }}>
              {accepting ? 'Saving…' : 'Use These Views'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Tiny inline section wrapper — label + content, FR brand spacing.
function GenSection({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</label>
      {children}
    </div>
  );
}

function StyleChip({ active, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 18px',
        background: active ? FR.slate : FR.white,
        color: active ? FR.salt : FR.slate,
        border: `0.5px solid ${active ? FR.slate : FR.sand}`,
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 11,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        fontWeight: active ? 600 : 400,
      }}>
      {label}
    </button>
  );
}

function ColorBlock({ name, hex, active, onClick }) {
  return (
    <button
      onClick={onClick}
      title={name}
      style={{
        width: 36,
        height: 36,
        borderRadius: 6,
        background: hex,
        border: active ? `2px solid ${FR.slate}` : `0.5px solid ${FR.sand}`,
        cursor: 'pointer',
        padding: 0,
        boxShadow: active ? `0 0 0 2px ${FR.salt}` : 'none',
        transition: 'all 0.15s',
      }}
    />
  );
}

export function StepDesignOverview({ data, set, images, onUpload, onRemove }) {
  const [showModal, setShowModal] = useState(false);

  const sourceFront      = (images || []).find(i => i.slot === 'design-source-front');
  const sourceBack       = (images || []).find(i => i.slot === 'design-source-back');
  const sourceSide       = (images || []).find(i => i.slot === 'design-source-side');
  const treatmentRefs    = (images || []).filter(i => i.slot === 'design-treatment-ref');
  const embellishmentRefs = (images || []).filter(i => i.slot === 'design-embellishment-ref');

  const customContext = data?.designContextPrompt || '';
  const style         = data?.designStyle || 'ghost-mannequin';
  const bgColor       = data?.designBgColor || 'salt';

  const hasAnyRef = !!(sourceFront || sourceBack || sourceSide || treatmentRefs.length || embellishmentRefs.length);

  return (
    <div>
      <SectionTitle>Design Overview</SectionTitle>

      {/* Style toggle */}
      <GenSection label="Generation Style">
        <div style={{ display: 'flex', gap: 8 }}>
          <StyleChip active={style === 'ghost-mannequin'} label="Ghost Mannequin" onClick={() => set('designStyle', 'ghost-mannequin')} />
          <StyleChip active={style === 'flat-lay'}        label="Flat Lay"        onClick={() => set('designStyle', 'flat-lay')} />
        </div>
      </GenSection>

      {/* Background color from FR palette */}
      <GenSection label="Background Color">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {FR_COLOR_OPTIONS.map(opt => (
            <ColorBlock
              key={opt.name}
              name={opt.name}
              hex={opt.hex}
              active={bgColor === opt.name.toLowerCase()}
              onClick={() => set('designBgColor', opt.name.toLowerCase())}
            />
          ))}
          <span style={{ fontSize: 11, color: FR.stone, marginLeft: 6, fontFamily: 'ui-monospace,Menlo,monospace' }}>
            {FR_COLOR_OPTIONS.find(o => o.name.toLowerCase() === bgColor)?.name || '—'}
          </span>
        </div>
      </GenSection>

      {/* Per-view source images (CLO3D workflow) */}
      <GenSection label="Reference Per View — CLO3D Renders or Sketches">
        <Row cols="1fr 1fr 1fr">
          <PhotoUpload single label="Front Reference" slotKey="design-source-front" images={images} onUpload={onUpload} onRemove={onRemove} />
          <PhotoUpload single label="Back Reference"  slotKey="design-source-back"  images={images} onUpload={onUpload} onRemove={onRemove} />
          <PhotoUpload single label="Side Reference"  slotKey="design-source-side"  images={images} onUpload={onUpload} onRemove={onRemove} />
        </Row>
      </GenSection>

      {/* Treatments / wash references */}
      <GenSection label="Treatment & Wash Reference — Fabric Finish, Dye, Distressing">
        <PhotoUpload
          single
          label="Upload one swatch or image showing the wash, dye, or fabric finish"
          slotKey="design-treatment-ref"
          images={images}
          onUpload={onUpload}
          onRemove={onRemove}
        />
      </GenSection>

      {/* Embellishment / artwork references */}
      <GenSection label="Embellishment Reference — Graphics, Embroidery, Hardware">
        <PhotoUpload
          single
          label="Upload one artwork, print, embroidery, or hardware reference"
          slotKey="design-embellishment-ref"
          images={images}
          onUpload={onUpload}
          onRemove={onRemove}
        />
      </GenSection>

      {/* Free-form context */}
      <GenSection label="Additional Context for AI">
        <textarea
          value={customContext}
          onChange={e => set('designContextPrompt', e.target.value)}
          placeholder='e.g., "oversized boxy fit, drop shoulder, garment-dyed Slate, invisible kangaroo pocket, raw flat hem, 400gsm heavyweight french terry"'
          rows={3}
          style={{
            width: '100%',
            padding: '10px 12px',
            border: `1px solid ${FR.sand}`,
            borderRadius: 4,
            fontSize: 12,
            color: FR.slate,
            background: FR.white,
            resize: 'vertical',
            fontFamily: "'Helvetica Neue', sans-serif",
            lineHeight: 1.5,
            boxSizing: 'border-box',
          }}
        />
      </GenSection>

      {/* Generate button */}
      <div style={{ marginBottom: 26 }}>
        <button
          onClick={() => setShowModal(true)}
          disabled={!hasAnyRef}
          style={{
            padding: '11px 24px',
            background: hasAnyRef ? FR.slate : FR.sand,
            color: hasAnyRef ? FR.salt : FR.stone,
            border: 'none',
            borderRadius: 6,
            cursor: hasAnyRef ? 'pointer' : 'not-allowed',
            fontSize: 11,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            fontWeight: 600,
          }}>
          Generate Views with AI
        </button>
        {!hasAnyRef && (
          <span style={{ marginLeft: 12, fontSize: 11, color: FR.stone, fontStyle: 'italic' }}>
            Upload at least one reference image to enable
          </span>
        )}
      </div>

      {/* Manual / generated garment views */}
      <GenSection label="Garment Views">
        <Row cols="1fr 1fr 1fr">
          <PhotoUpload single label="Front View" slotKey="design-front" images={images} onUpload={onUpload} onRemove={onRemove} aspect="2 / 3" />
          <PhotoUpload single label="Back View"  slotKey="design-back"  images={images} onUpload={onUpload} onRemove={onRemove} aspect="2 / 3" />
          <PhotoUpload single label="Side View"  slotKey="design-side"  images={images} onUpload={onUpload} onRemove={onRemove} aspect="2 / 3" />
        </Row>
      </GenSection>

      {showModal && (
        <GenerateViewsModal
          viewSources={{ front: sourceFront, back: sourceBack, side: sourceSide }}
          sharedRefs={[...treatmentRefs, ...embellishmentRefs]}
          customContext={customContext}
          style={style}
          bgColorName={bgColor}
          onAccept={(slot, dataUrl) => {
            // Replace any existing image in this slot — single-image enforcement.
            const existing = (images || []).filter(i => i.slot === slot);
            for (let i = existing.length - 1; i >= 0; i--) onRemove(slot, i);
            onUpload(slot, dataUrl, `${slot}-generated.jpg`);
          }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

// Compact inline dropdown bar for loading a library block into a step.
// `items` should be null (loading) or an array; `onSelect(item)` is called
// with the chosen item. Resets to the placeholder immediately after selection.
function LibraryDropdownBar({ label, items, getLabel, onSelect, linkedLabel, placeholder }) {
  return (
    <div style={{ marginBottom: 12, padding: '8px 12px', background: FR.white, border: `0.5px solid ${FR.sand}`, borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, color: FR.soil, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {linkedLabel && (
        <span style={{ fontSize: 10, color: FR.stone, fontFamily: "ui-monospace, Menlo, monospace", flex: 1, minWidth: 0 }}>
          {linkedLabel}
        </span>
      )}
      <select
        value=""
        onChange={e => {
          const id = e.target.value;
          if (!id || !items) return;
          const item = items.find(x => x.id === id);
          if (item) onSelect(item);
        }}
        disabled={!items}
        style={{ padding: '5px 8px', border: `1px solid ${FR.sand}`, borderRadius: 4, fontSize: 11, color: FR.slate, background: FR.salt, cursor: items ? 'pointer' : 'wait', minWidth: 160, maxWidth: 320 }}
      >
        <option value="">{!items ? 'Loading…' : (placeholder || '— Load from library —')}</option>
        {(items || []).map(item => (
          <option key={item.id} value={item.id}>{getLabel(item)}</option>
        ))}
      </select>
    </div>
  );
}

// Applies a cut & sew library block's construction data to tech pack fields.
// Called from both StepConstruction (seams/pattern) and StepFlatlays (images).
function applyCutSewBlock(block, set, { onSeedImages } = {}) {
  if (block.flat_lay_notes) set('flatLayNotes', block.flat_lay_notes);
  if (block.callout_details_page1?.length) set('constructionDetailsPage1', block.callout_details_page1.map(d => ({ num: d.num, title: d.title || '', description: d.description || '' })));
  if (block.callout_details_page2?.length) set('constructionDetailsPage2', block.callout_details_page2.map(d => ({ num: d.num, title: d.title || '', description: d.description || '' })));
  if (block.seam_stitch_blocks?.length) set('seamStitchBlocks', block.seam_stitch_blocks.map(b => ({ num: b.num, label: b.label || '', hidden: b.hidden || false })));
  if (block.seams?.length) set('seams', block.seams.map(s => ({ operation: s.operation || '', seamType: s.seam_type || '', stitchType: s.stitch_type || '', machine: s.machine || '', spiSpcm: s.spi_spcm || '', threadColor: s.thread_color || '', threadType: s.thread_type || '', notes: s.notes || '' })));
  if (block.labor_cost_usd) set('cutSewLaborCost', String(block.labor_cost_usd));
  if (block.pattern_pieces?.length) set('patternPieces', block.pattern_pieces.map(p => ({ pieceNum: p.piece_num || '', pieceName: p.piece_name || '', quantity: p.quantity || '', fabric: p.fabric || '', grain: p.grain || '', fusing: p.fusing || '', notes: p.notes || '' })));
  if (block.cutting_instructions) set('cuttingInstructions', block.cutting_instructions);
  if (block.pom_rows?.length) set('poms', block.pom_rows.map(r => ({ name: r.name || '', tol: r.tol || '1', s: r.s || '', m: r.m || '', l: r.l || '', xl: r.xl || '', method: r.method || '' })));
  if (block.pom_size_type) set('sizeType', block.pom_size_type);
  if (block.pom_measurement_method) set('measurementMethod', block.pom_measurement_method);
  if (block.graded_size_matrix?.grading?.length) set('gradedSizeMatrix', block.graded_size_matrix);
  set('pickedCutSewBlockId', block.id);
  if (onSeedImages) {
    const imageMap = {};
    if (block.flat_lay_front_url) imageMap['flatlay-front'] = block.flat_lay_front_url;
    if (block.flat_lay_back_url) imageMap['flatlay-back'] = block.flat_lay_back_url;
    if (block.callout_ref_page1_url) imageMap['sketch-callout-page1'] = block.callout_ref_page1_url;
    if (block.callout_ref_page2_url) imageMap['sketch-callout-page2'] = block.callout_ref_page2_url;
    (block.callout_details_page1 || []).forEach(d => { if (d.image_url) imageMap[`construction-detail-${d.num}`] = d.image_url; });
    (block.callout_details_page2 || []).forEach(d => { if (d.image_url) imageMap[`construction-detail-${d.num}`] = d.image_url; });
    (block.seam_stitch_blocks || []).forEach(b => { if (b.image_url) imageMap[`seam-stitch-${b.num}`] = b.image_url; });
    if (block.pattern_layout_url) imageMap['pattern-layout'] = block.pattern_layout_url;
    if (block.pom_diagram_url) imageMap['pom-diagram'] = block.pom_diagram_url;
    onSeedImages(imageMap);
  }
}

export function StepFlatlays({ data, set, images, onUpload, onRemove, onSeedImages }) {
  const [blocks, setBlocks] = useState(null);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    import('../../utils/cutSewStore').then(({ listCutSew }) =>
      listCutSew({ includeArchived: false }).then(rows => setBlocks(rows || []))
    );
  }, []);

  const applyBlock = (block) => {
    setSeeding(true);
    try { applyCutSewBlock(block, set, { onSeedImages }); }
    finally { setSeeding(false); }
  };

  const linkedName = data.pickedCutSewBlockId && blocks
    ? (blocks.find(b => b.id === data.pickedCutSewBlockId)?.name || data.pickedCutSewBlockId)
    : null;

  return (
    <div>
      <SectionTitle>Pattern</SectionTitle>

      <LibraryDropdownBar
        label="Garment Block"
        items={seeding ? null : blocks}
        getLabel={b => [b.category, b.name || b.code].filter(Boolean).join(' · ')}
        onSelect={applyBlock}
        linkedLabel={linkedName ? `Linked: ${linkedName}` : 'No block linked — or select one above to auto-populate construction data.'}
        placeholder="— Select garment block —"
      />

      <p style={{ fontSize: 11, color: FR.stone, marginBottom: 14, fontStyle: 'italic' }}>
        Front and back technical flats. Each maximised to A4 landscape so callouts stay legible on the printed page.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <PhotoUpload label="Front" slotKey="flatlay-front" images={images} onUpload={onUpload} onRemove={onRemove} aspect="1.414 / 1" />
        <PhotoUpload label="Back"  slotKey="flatlay-back"  images={images} onUpload={onUpload} onRemove={onRemove} aspect="1.414 / 1" />
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
  const emptyAP = { placement: '', artworkFile: '', method: '', sizeCm: '', positionFrom: '', color: '', notes: '', cost_per_unit_usd: '', embellishment_id: '' };
  const placements = data.artworkPlacements && data.artworkPlacements.length ? data.artworkPlacements : [emptyAP];
  const updateAP = (i, k, v) => set('artworkPlacements', placements.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const patchAP = (i, patch) => set('artworkPlacements', placements.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addAP = () => set('artworkPlacements', [...placements, emptyAP]);
  const rmAP = (i) => set('artworkPlacements', placements.filter((_, idx) => idx !== i));

  const [elib, setElib] = useState([]);
  const [elibTick, setElibTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    listEmbellishments({ includeArchived: true }).then(rows => {
      if (!cancelled) setElib(rows || []);
    });
    return () => { cancelled = true; };
  }, [elibTick]);
  const refreshElib = () => setElibTick(t => t + 1);

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
        <p style={{ fontSize: 11, color: FR.stone, marginTop: -4, marginBottom: 6, fontStyle: 'italic' }}>
          Each placement carries a per-unit cost that rolls into the Embellishments total. Save the row to the Embellishments library to reuse the artwork across packs.
        </p>
        <LibraryDropdownBar
          label="Add from library"
          items={elib.length ? elib : null}
          getLabel={a => [a.technique, a.name || a.code].filter(Boolean).join(' · ')}
          onSelect={atom => set('artworkPlacements', [...(data.artworkPlacements || []), { placement: atom.placement || atom.name || '', method: atom.technique || '', sizeCm: (atom.size_w_cm && atom.size_h_cm) ? `${atom.size_w_cm} × ${atom.size_h_cm}` : '', notes: atom.notes || '', cost_per_unit_usd: atom.cost_per_unit_usd || '', embellishment_id: atom.id }])}
          placeholder="— Add embellishment from library —"
        />
        <ArrayTable
          headers={[
            { key: 'placement',    label: 'Placement',    placeholder: 'Center chest / Back yoke' },
            { key: 'artworkFile',  label: 'Artwork File', placeholder: 'logo-v1.ai' },
            { key: 'method',       label: 'Method',       placeholder: 'Embroidery / Screen Print' },
            { key: 'sizeCm',       label: 'Size (cm)',    placeholder: '8 × 2' },
            { key: 'positionFrom', label: 'Position From',placeholder: '12 cm below HPS' },
            { key: 'color',        label: 'Color',        render: frColorRender },
            { key: 'notes',        label: 'Notes' },
            { key: 'cost_per_unit_usd', label: 'Cost / unit', render: (v, onChange, row) => (
              <CostCell row={row} value={v} onChange={onChange} linked={row.embellishment_id ? elib.find(a => a.id === row.embellishment_id) : null} />
            )},
            { key: 'embellishment_id', label: 'Library', render: (_v, _onChange, row, ri) => (
              <LibraryLinkCell
                row={row} rowIndex={ri} idField="embellishment_id"
                atoms={elib} atomLabel="Embellishments" nameField="placement"
                onPatchRow={patchAP}
                onCreate={async (r) => createEmbellishment({
                  // Pick a sensible type from the method field; falls back
                  // to embroidery as the most common default for FR.
                  type: /screen|print/i.test(r.method || '') ? 'screen_print'
                      : /heat/i.test(r.method || '') ? 'heat_transfer'
                      : /patch/i.test(r.method || '') ? 'patch'
                      : 'embroidery',
                  name: r.placement || r.artworkFile || 'Untitled embellishment',
                  technique: r.method || '',
                  placement: r.placement || '',
                  notes: r.notes || '',
                  cost_per_unit_usd: parseFloat(r.cost_per_unit_usd) || 0,
                })}
                onCreated={refreshElib}
              />
            )},
          ]}
          rows={placements} onUpdate={updateAP} onAdd={addAP} onRemove={rmAP} />
      </div>
    </div>
  );
}
// Cut & Sew labor cost block — manual entry plus an "Estimate with AI"
// button that asks Claude to anchor the value against the chosen vendor's
// region/tier and the garment's complexity. The model's reasoning,
// vendor context, and timestamp are stored on data.cutSewLaborCostMeta
// so the user can see why the estimate is what it is.
export function CutSewLaborCostBlock({ data, set, sectionLabel }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const meta = data.cutSewLaborCostMeta;

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const vendorName = data.vendor || '';
      const v = vendorName ? getVendor(vendorName) : null;
      const vendor = {
        name: vendorName,
        country: v?.country || '',
        city: v?.city || '',
        samRateUsdPerMin: v?.samRateUsdPerMin || '',
      };
      // Specs the AI should read off the Construction (07–08) and Sewing (09–10)
      // pages so the estimate reflects the real build, not just the BOM counts.
      const constructionCallouts = [...(data.constructionDetailsPage1 || []), ...(data.constructionDetailsPage2 || [])]
        .filter(c => c && (c.title || c.description))
        .map(c => ({ title: c.title || '', description: c.description || '' }));
      const blocks = data.seamStitchBlocks || [];
      const seamRows = data.seams || [];
      const stitchOperations = [];
      for (let i = 0; i < 8; i++) {
        const label = (blocks.find(b => b.num === i + 1) || {}).label || '';
        const s = seamRows[i] || {};
        if (label || s.seamType || s.stitchType) {
          stitchOperations.push({ seam: label, seamType: s.seamType || '', stitchType: s.stitchType || '', machine: s.machine || '', spi: s.spiSpcm || '' });
        }
      }
      const garment = {
        styleName: data.styleName,
        styleNumber: data.styleNumber,
        productType: data.productType,
        productTier: data.productTier,
        designNotes: data.designNotes,
        keyFeatures: data.keyFeatures,
        fit: data.fit,
        fabricsCount: (data.pickedFabrics || []).length,
        fabricsList: (data.pickedFabrics || []).map(f => f.role).filter(Boolean).join(', '),
        trimsCount: (data.pickedTrims || []).length,
        seamCount: stitchOperations.length,
        pieceCount: (data.patternPieces || []).filter(p => p.pieceName).length,
        treatmentsCount: (data.treatments || []).filter(t => t.treatment).length,
        constructionCallouts,
        stitchOperations,
      };
      const result = await estimateLaborCost({ vendor, garment });
      set('cutSewLaborCost', String(result.value.toFixed(2)));
      set('cutSewLaborCostMeta', {
        ...result,
        vendor: vendor.name,
        vendorCountry: vendor.country,
        vendorCity: vendor.city,
        vendorSamRate: vendor.samRateUsdPerMin || null,
        generatedAt: new Date().toISOString(),
      });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setRunning(false);
    }
  };

  const hasVendor = !!data.vendor;

  return (
    <div style={{ marginTop: 18, padding: '14px 16px', background: FR.salt, border: `0.5px solid ${FR.sand}`, borderRadius: 6 }}>
      <label style={sectionLabel}>Cut &amp; Sew Labor Cost (per garment)</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: FR.stone, fontFamily: "ui-monospace, Menlo, monospace" }}>$</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={data.cutSewLaborCost || ''}
          onChange={e => set('cutSewLaborCost', e.target.value)}
          placeholder="0.00"
          style={{ flex: 1, padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 4, fontSize: 13, color: FR.slate, background: FR.white, fontFamily: "ui-monospace, Menlo, monospace", outline: 'none' }}
        />
        <button
          onClick={run}
          disabled={running || !hasVendor}
          style={{
            padding: '8px 14px',
            border: `1px solid ${FR.slate}`,
            background: running ? FR.sand : FR.slate,
            color: running ? FR.slate : FR.salt,
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            cursor: running ? 'wait' : (hasVendor ? 'pointer' : 'not-allowed'),
            opacity: hasVendor ? 1 : 0.55,
            whiteSpace: 'nowrap',
          }}
          title={hasVendor ? 'Ask Claude to estimate based on vendor + design' : 'Set a vendor on Style Overview first'}
        >
          {running ? 'Estimating…' : 'Estimate with AI'}
        </button>
      </div>
      {!hasVendor && (
        <div style={{ fontSize: 10, color: '#854F0B', marginBottom: 8 }}>
          Pick a vendor on the Style Overview page first — the AI uses the vendor's location and tier to anchor the estimate.
        </div>
      )}
      {error && (
        <div style={{ fontSize: 11, color: '#A32D2D', background: '#FBEDED', border: `0.5px solid #E8C8C8`, padding: '6px 10px', borderRadius: 4, marginBottom: 8 }}>
          {error}
        </div>
      )}
      {meta && (
        <div style={{ background: FR.white, border: `0.5px solid ${FR.sand}`, borderRadius: 4, padding: '10px 12px', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 9, color: FR.soil, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>AI Estimate</div>
            <div style={{ fontSize: 9, color: meta.mode === 'sam_rate' ? '#3B6D11' : '#854F0B', fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'ui-monospace, Menlo, monospace' }}>
              {meta.mode === 'sam_rate' ? `via SAM × $${Number(meta.samRate || meta.vendorSamRate || 0).toFixed(2)}/min` : 'via regional CMT benchmark'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6, fontFamily: "ui-monospace, Menlo, monospace" }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: FR.slate }}>${Number(meta.value || 0).toFixed(2)}</span>
            <span style={{ fontSize: 10, color: FR.stone }}>
              range ${Number(meta.low || meta.value).toFixed(2)}–${Number(meta.high || meta.value).toFixed(2)}
            </span>
          </div>
          {meta.vendorContext && (
            <div style={{ fontSize: 11, color: FR.stone, marginBottom: 6, fontStyle: 'italic' }}>{meta.vendorContext}</div>
          )}
          {meta.reasoning && (
            <div style={{ fontSize: 11, color: FR.slate, lineHeight: 1.5 }}>{meta.reasoning}</div>
          )}
          <div style={{ fontSize: 9, color: FR.stone, marginTop: 8 }}>
            Generated {meta.generatedAt ? new Date(meta.generatedAt).toLocaleString() : '—'} · {meta.vendor || data.vendor}
            {meta.vendorCity && meta.vendorCountry && ` (${meta.vendorCity}, ${meta.vendorCountry})`}
          </div>
        </div>
      )}
      <div style={{ fontSize: 11, color: FR.stone, lineHeight: 1.4 }}>
        <strong style={{ color: FR.slate, fontWeight: 600 }}>CMT-only — conversion labor.</strong> Cutting, sewing, finishing, packing, factory overhead. <strong>Excludes</strong> fabric, trims, packaging, treatments, embellishments, and vendor markup % — those live on their own tech-pack steps and roll up separately, so adding them here would double-count. Click Estimate with AI to anchor against the vendor's region or SAM rate, then override manually if you have a real quote.
      </div>
    </div>
  );
}

const STITCH_SECTION_LABEL = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };

// Blank seam-spec row, shared by the table seeding helpers.
const blankSeamRow = () => ({ operation: '', seamType: '', stitchType: '', machine: '', spiSpcm: '', threadColor: '', threadType: '', notes: '' });

// One Stitching callout card — mirrors the Cut & Sew call-out card (07/08):
// a large main image (the closed 3D render) + an optional smaller supporting
// reference image, a red number, an editable stitch-name, and the stitch-type
// code (read from the matching spec row below). The card pairs positionally
// with row `num` of the seams[] table.
function StitchCalloutCard({ num, label, code, images, onUpload, onRemove, onRename, annotations, onAnnotate }) {
  const mainSlot = `seam-stitch-${num}`;
  const suppSlot = `seam-stitch-${num}-support`;
  return (
    <div style={{ background: FR.white, border: `0.5px solid ${FR.sand}`, borderRadius: 6, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: `${CALLOUT_MAIN_RATIO} 1 0`, minWidth: 0 }}>
          <AspectPhoto slotKey={mainSlot} aspect={CALLOUT_MAIN_ASPECT} images={images} onUpload={onUpload} onRemove={onRemove} label={`Stitch ${num} — 3D render`} />
          <AnnotateButton slot={mainSlot} images={images} annotations={annotations} onAnnotate={onAnnotate} title={`Stitch ${num} — main image`} />
        </div>
        <div style={{ flex: `${CALLOUT_SUPPORT_RATIO} 1 0`, minWidth: 0 }}>
          <AspectPhoto slotKey={suppSlot} aspect={CALLOUT_SUPPORT_ASPECT} images={images} onUpload={onUpload} onRemove={onRemove} label="Reference (optional)" />
          <AnnotateButton slot={suppSlot} images={images} annotations={annotations} onAnnotate={onAnnotate} title={`Stitch ${num} — supporting image`} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <RedNumberCircle n={num} />
        <input
          value={label || ''}
          onChange={e => onRename(e.target.value)}
          placeholder="Stitch name (e.g. 4-Thread Overlock)"
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontWeight: 600, color: FR.slate, fontFamily: "'Helvetica Neue', sans-serif" }}
        />
        {code ? (
          <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, fontWeight: 600, color: FR.soil, background: FR.salt, border: `0.5px solid ${FR.sand}`, borderRadius: 4, padding: '2px 6px' }}>{code}</span>
        ) : null}
      </div>
    </div>
  );
}

// Shared-header spec table for one Stitching page — labels written once, one
// fixed row per callout card, with a leading # that ties the row to its card
// and its placed dot. No add/remove: the eight cards (4 per page) are fixed,
// mirroring the Call Outs pages.
function StitchSpecTableC({ seams, rowStart, count, onUpdateAt, seamNames = [] }) {
  const th = { textAlign: 'left', padding: '5px 6px', background: FR.slate, color: FR.salt, fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', whiteSpace: 'nowrap' };
  const td = { padding: '3px 4px', borderBottom: `1px solid ${FR.sand}`, verticalAlign: 'middle' };
  const inp = { width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '3px 2px', color: FR.slate, outline: 'none', fontFamily: "'Helvetica Neue', sans-serif", boxSizing: 'border-box' };
  // The Seam column is the stitch's name — it mirrors the card title above and
  // is not edited here (rename the stitch card to change it).
  const cols = [
    { key: 'seamType',   label: 'Seam Type',   ph: 'Flatlock / French seam' },
    { key: 'stitchType', label: 'Stitch Type', ph: '301 / 401 / 504' },
    { key: 'machine',    label: 'Machine',     ph: 'e.g. Juki MO-6814 overlock' },
    { key: 'spiSpcm',    label: 'SPI / SPCM',  ph: '10 SPI' },
    { key: 'threadColor',label: 'Thread Color',color: true },
    { key: 'threadType', label: 'Thread Type', ph: 'Tex 40 / Polyester' },
    { key: 'notes',      label: 'Notes',       ph: '' },
  ];
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 28, textAlign: 'center' }}>#</th>
            <th style={th}>Seam</th>
            {cols.map(c => <th key={c.key} style={th}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: count }).map((_, i) => {
            const gi = rowStart + i;
            const row = seams[gi] || {};
            const name = seamNames[i] || '';
            return (
              <tr key={gi} style={{ background: i % 2 === 0 ? FR.salt : FR.white }}>
                <td style={{ ...td, textAlign: 'center', fontFamily: 'ui-monospace, Menlo, monospace', color: FR.stone }}>{gi + 1}</td>
                <td style={{ ...td, fontWeight: 600 }}>
                  {name
                    ? <span style={{ color: FR.slate }}>{name}</span>
                    : <span style={{ color: FR.stone, fontStyle: 'italic', fontWeight: 400 }}>Name on the card</span>}
                </td>
                {cols.map(c => (
                  <td key={c.key} style={td}>
                    {c.color
                      ? <FRColorCell value={row[c.key]} onChange={v => onUpdateAt(gi, c.key, v)} />
                      : <input value={row[c.key] || ''} onChange={e => onUpdateAt(gi, c.key, e.target.value)} placeholder={c.ph} style={inp} />}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Shared body for both Stitching pages: garment callout reference (left) +
// 2×2 grid of stitch cards (right) + the shared-header spec table below.
function StitchingPageBody({ refSlot, nums, rowStart, tableCount, data, set, images, onUpload, onRemove, annotations, onAnnotate }) {
  const base = (data.seamStitchBlocks && data.seamStitchBlocks.length) ? data.seamStitchBlocks : DEFAULT_DATA.seamStitchBlocks;
  const entries = nums.map(n => base.find(b => b.num === n) || { num: n, label: '', dot: null });
  const seams = data.seams || [];

  const setBlock = (n, patch) => {
    const map = new Map((data.seamStitchBlocks && data.seamStitchBlocks.length ? data.seamStitchBlocks : DEFAULT_DATA.seamStitchBlocks).map(b => [b.num, b]));
    nums.forEach(x => { if (!map.has(x)) map.set(x, { num: x, label: '', dot: null }); });
    const next = Array.from(map.values()).sort((a, b) => a.num - b.num).map(b => (b.num === n ? { ...b, ...patch } : b));
    set('seamStitchBlocks', next);
  };
  const setDot = (n, dot) => setBlock(n, { dot });
  const onUpdateSeamAt = (gi, key, value) => {
    const arr = (data.seams || []).slice();
    while (arr.length <= gi) arr.push(blankSeamRow());
    arr[gi] = { ...arr[gi], [key]: value };
    set('seams', arr);
  };

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 0.55fr) 1.45fr', gap: 18, alignItems: 'stretch', marginBottom: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <CalloutGarmentRef
            label="Stitch Map · Callout Reference"
            slotKey={refSlot}
            images={images}
            onUpload={onUpload}
            onRemove={onRemove}
            entries={entries}
            onSetDot={setDot}
            annotations={(annotations && annotations[refSlot]) || []}
            onAnnotate={onAnnotate}
            splitMode={!!(data?.referenceLayout?.[refSlot])}
            onToggleSplit={(v) => set('referenceLayout', { ...(data?.referenceLayout || {}), [refSlot]: v })}
            annotationsB={(annotations && annotations[`${refSlot}-b`]) || []}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignContent: 'start' }}>
          {entries.map(e => (
            <StitchCalloutCard
              key={e.num}
              num={e.num}
              label={e.label}
              code={(seams[e.num - 1] || {}).stitchType}
              images={images}
              onUpload={onUpload}
              onRemove={onRemove}
              onRename={v => setBlock(e.num, { label: v })}
              annotations={annotations}
              onAnnotate={onAnnotate}
            />
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={STITCH_SECTION_LABEL}>Seam &amp; Stitch Specification</label>
        <StitchSpecTableC seams={seams} rowStart={rowStart} count={tableCount} onUpdateAt={onUpdateSeamAt} seamNames={entries.map(e => e.label || '')} />
      </div>
    </>
  );
}

// Stitching — page 1 (stitches 1–4). Carries the garment-block auto-populate
// dropdown on top and the full Cut & Sew labor calculator at the bottom.
export function StepConstruction({ data, set, images, onUpload, onRemove, annotations, onAnnotate }) {
  const [cutSewBlocks, setCutSewBlocks] = useState(null);

  useEffect(() => {
    import('../../utils/cutSewStore').then(({ listCutSew }) =>
      listCutSew({ includeArchived: false }).then(rows => setCutSewBlocks(rows || []))
    );
  }, []);

  const linkedBlockName = data.pickedCutSewBlockId && cutSewBlocks
    ? (cutSewBlocks.find(b => b.id === data.pickedCutSewBlockId)?.name || data.pickedCutSewBlockId)
    : null;

  return (
    <div>
      <SectionTitle>Sewing (1)</SectionTitle>

      <LibraryDropdownBar
        label="Garment Block"
        items={cutSewBlocks}
        getLabel={b => [b.category, b.name || b.code].filter(Boolean).join(' · ')}
        onSelect={block => applyCutSewBlock(block, set)}
        linkedLabel={linkedBlockName ? `Linked: ${linkedBlockName}` : null}
        placeholder="— Select garment block to auto-populate —"
      />

      <p style={{ fontSize: 11, color: FR.stone, marginBottom: 14, fontStyle: 'italic' }}>
        Click the garment to drop a numbered dot for each stitch, then add its closed 3D render (main) and an optional real-garment reference. The number ties the card to its row in the spec table. Stitches 1–4 here; 5–8 on the next page.
      </p>

      <StitchingPageBody
        refSlot="seam-stitch-callout-page1"
        nums={[1, 2, 3, 4]}
        rowStart={0}
        tableCount={4}
        data={data} set={set} images={images} onUpload={onUpload} onRemove={onRemove}
        annotations={annotations} onAnnotate={onAnnotate}
      />
    </div>
  );
}

// Stitching — page 2 (stitches 5–8). Continuation page: garment reference,
// 2×2 grid of cards, and the spec table for rows 5 onward. (The labor
// calculator lives on its own Cut & Sew Cost page now.)
export function StepConstruction2({ data, set, images, onUpload, onRemove, annotations, onAnnotate }) {
  const totalSeams = (data.seams || []).length;
  const tableCount = Math.max(4, totalSeams - 4);
  return (
    <div>
      <SectionTitle>Sewing (2)</SectionTitle>
      <p style={{ fontSize: 11, color: FR.stone, marginBottom: 14, fontStyle: 'italic' }}>
        Continuation — stitches 5–8. Click the garment to place dots 5–8; each pairs with its callout card (3D render + reference) and its row in the spec table below.
      </p>

      <StitchingPageBody
        refSlot="seam-stitch-callout-page2"
        nums={[5, 6, 7, 8]}
        rowStart={4}
        tableCount={tableCount}
        data={data} set={set} images={images} onUpload={onUpload} onRemove={onRemove}
        annotations={annotations} onAnnotate={onAnnotate}
      />
    </div>
  );
}

// Cut & Sew Cost — dedicated internal page (after Sewing 2). Holds the full AI
// labor estimate + cost chat (moved off Sewing 1). The estimate reads every
// construction call-out and stitch operation off pages 07–10. Internal only —
// excluded from the exported factory pack.
export function StepCutSewCost({ data, set }) {
  return (
    <div>
      <SectionTitle>Cut &amp; Sew Cost</SectionTitle>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, border: '0.5px solid rgba(133,79,11,0.45)', background: 'rgba(133,79,11,0.06)', borderRadius: 6, padding: '8px 14px', marginBottom: 14 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#854F0B', flex: '0 0 auto' }} />
        <span style={{ fontSize: 11, color: '#854F0B', fontWeight: 600, letterSpacing: 0.3 }}>
          Internal — for your eyes only. This page is left out of the exported factory tech pack.
        </span>
      </div>
      <p style={{ fontSize: 11, color: FR.stone, marginBottom: 14, fontStyle: 'italic' }}>
        The AI reads every construction call-out (Construction 1–2) and stitch operation (Sewing 1–2), plus your BOM and chosen vendor, to estimate best-case cut &amp; sew labor. Argue with it or paste a real factory quote in the chat to refine.
      </p>
      <CutSewLaborCostBlock data={data} set={set} sectionLabel={STITCH_SECTION_LABEL} />
      <CutSewCostChat data={data} set={set} sectionLabel={STITCH_SECTION_LABEL} />
    </div>
  );
}

// Red-numbered circle used on every detail card. Diameter scales to font size.
function RedNumberCircle({ n, size = 22 }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      borderRadius: '50%',
      background: '#A32D2D',
      color: '#FFFFFF',
      fontSize: size * 0.5,
      fontWeight: 600,
      letterSpacing: 0.3,
      flexShrink: 0,
      fontFamily: "'Helvetica Neue', sans-serif",
    }}>
      {n}
    </span>
  );
}

// Single detail card — image (top) + red number + translatable title + description.
// The card stretches vertically; the image area is a fixed 4:3 frame so each
// detail can carry its own close-up shot of the construction in question.
// When `enhanced` (Cut & Sew pages 07/08), the card also carries a smaller
// optional supporting image beside the large main image. Leaving the support
// slot empty lets the live preview / PDF expand the main image to fill.
function ConstructionDetailCard({ entry, onChange, images, onUpload, onRemove, enhanced, annotations, onAnnotate }) {
  const slotKey = `construction-detail-${entry.num}`;
  return (
    <div style={{
      background: FR.white,
      border: `0.5px solid ${FR.sand}`,
      borderRadius: 6,
      padding: 10,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {enhanced ? (
        // Flex weights mirror the slot ratios so the two crop frames line up at
        // equal height and look exactly like the printed card.
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: `${CALLOUT_MAIN_RATIO} 1 0`, minWidth: 0 }}>
            <AspectPhoto
              slotKey={slotKey}
              aspect={CALLOUT_MAIN_ASPECT}
              images={images}
              onUpload={onUpload}
              onRemove={onRemove}
              label={`Detail ${entry.num} — main image`}
            />
            <AnnotateButton slot={slotKey} images={images} annotations={annotations} onAnnotate={onAnnotate} title={`Detail ${entry.num} — main image`} />
          </div>
          <div style={{ flex: `${CALLOUT_SUPPORT_RATIO} 1 0`, minWidth: 0 }}>
            <AspectPhoto
              slotKey={`${slotKey}-support`}
              aspect={CALLOUT_SUPPORT_ASPECT}
              images={images}
              onUpload={onUpload}
              onRemove={onRemove}
              label="Support (optional)"
            />
            <AnnotateButton slot={`${slotKey}-support`} images={images} annotations={annotations} onAnnotate={onAnnotate} title={`Detail ${entry.num} — supporting image`} />
          </div>
        </div>
      ) : (
        <PhotoUpload
          single
          slotKey={slotKey}
          images={images}
          onUpload={onUpload}
          onRemove={onRemove}
          aspect="4 / 3"
          label={`Detail ${entry.num} image`}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <RedNumberCircle n={entry.num} />
        <input
          value={entry.title}
          onChange={e => onChange({ ...entry, title: e.target.value })}
          placeholder="Title (e.g. Hood Construction)"
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            outline: 'none',
            fontSize: 13,
            fontWeight: 600,
            color: FR.slate,
            fontFamily: "'Helvetica Neue', sans-serif",
          }}
        />
      </div>
      <textarea
        value={entry.description}
        onChange={e => onChange({ ...entry, description: e.target.value })}
        placeholder="Detail description — this text is per-factory translatable."
        rows={3}
        style={{
          border: `0.5px dashed ${FR.sand}`,
          borderRadius: 4,
          padding: '8px 10px',
          background: FR.salt,
          fontSize: 11,
          color: FR.slate,
          resize: 'vertical',
          outline: 'none',
          lineHeight: 1.5,
          fontFamily: "'Helvetica Neue', sans-serif",
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

// Clickable garment reference for the Cut & Sew call-out pages. Shows the whole
// garment photo; the operator clicks to drop a numbered red dot for each
// call-out (replacing the old "draw the dots in Photoshop first" workflow).
// Each dot's position is stored as normalized { x, y } (0..1) on the matching
// call-out entry so the live preview and PDF render the same dots. Exported so
// the Cut & Sew library builder can reuse the exact same control.
export function CalloutGarmentRef({ label, slotKey, images, onUpload, onRemove, entries, onSetDot, annotations, onAnnotate, splitMode = false, onToggleSplit, annotationsB }) {
  const boxRef = useRef(null);
  const draggingRef = useRef(false);
  const [armed, setArmed] = useState(null);
  const [cropSrc, setCropSrc] = useState(null);
  const img = (images || []).find(i => i.slot === slotKey);
  const slotKeyB = `${slotKey}-b`;
  // 2:3 portrait used by the two stacked references (strict 2:3 per operator).
  const REF_2x3 = { ratio: 2 / 3, label: 'Reference (2 : 3)', shortLabel: '2:3 reference' };

  // Re-open the crop modal on the already-uploaded reference so the operator
  // can reposition / zoom / crop it to the reference shape. Dots live on the
  // call-out entries (not the image), so re-cropping keeps every placed dot.
  const recrop = async () => {
    const dataUrl = await entryToDataUrl(img);
    if (dataUrl) setCropSrc(dataUrl);
  };
  const saveCropped = (dataUrl) => {
    onRemove(slotKey, 0);
    onUpload(slotKey, dataUrl, img?.name || 'reference.jpg');
    setCropSrc(null);
  };

  const clamp = (v) => Math.min(1, Math.max(0, v));
  const coordsFrom = (clientX, clientY) => {
    const r = boxRef.current.getBoundingClientRect();
    return { x: clamp((clientX - r.left) / r.width), y: clamp((clientY - r.top) / r.height) };
  };

  // Which call-out number a click will place: the explicitly armed one, else
  // the first call-out that has no dot yet, else the first call-out.
  const firstUnplaced = entries.find(e => !e.dot);
  const armedNum = armed != null ? armed : (firstUnplaced ? firstUnplaced.num : entries[0]?.num);

  const placeAt = (e) => {
    if (draggingRef.current) { draggingRef.current = false; return; }
    if (armedNum == null) return;
    onSetDot(armedNum, coordsFrom(e.clientX, e.clientY));
    const next = entries.find(en => en.num !== armedNum && !en.dot);
    if (next) setArmed(next.num);
  };

  const startDrag = (num, e) => {
    e.stopPropagation();
    setArmed(num);
    draggingRef.current = false;
    const move = (ev) => { draggingRef.current = true; onSetDot(num, coordsFrom(ev.clientX, ev.clientY)); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Two-image mode: the dot layer is click-through (so the photos take uploads /
  // recrops) until the operator clicks a number chip, which arms placement for a
  // single click, then returns to normal so the photos stay editable.
  const placeAtSplit = (e) => {
    if (draggingRef.current) { draggingRef.current = false; return; }
    if (armed == null) return;
    onSetDot(armed, coordsFrom(e.clientX, e.clientY));
    setArmed(null);
  };
  const startDragSplit = (num, e) => {
    e.stopPropagation();
    draggingRef.current = false;
    const move = (ev) => { draggingRef.current = true; onSetDot(num, coordsFrom(ev.clientX, ev.clientY)); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setArmed(null); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Number chips — click to arm which call-out the next click drops, with a
  // per-chip × to clear a placed dot. Shared by single- and two-image modes.
  const numberChips = (
    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
      {entries.map(e => {
        const active = armedNum === e.num;
        const placed = !!e.dot;
        return (
          <button
            key={e.num}
            onClick={() => setArmed(e.num)}
            title={placed ? `Call-out ${e.num} placed — click to re-arm` : `Click, then click the garment to place ${e.num}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 12,
              border: `1px solid ${active ? '#A32D2D' : FR.sand}`,
              background: active ? 'rgba(163,45,45,0.08)' : FR.white,
              color: FR.slate, fontSize: 11, cursor: 'pointer', fontFamily: "'Helvetica Neue', sans-serif",
            }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: placed ? '#A32D2D' : 'transparent', border: placed ? 'none' : `1.5px solid ${FR.stone}`, color: '#fff', fontSize: 9, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{placed ? e.num : ''}</span>
            {!placed ? `Place ${e.num}` : `#${e.num}`}
            {placed && (
              <span
                onClick={ev => { ev.stopPropagation(); onSetDot(e.num, null); }}
                title="Clear this dot"
                style={{ marginLeft: 2, color: FR.stone, fontSize: 13, lineHeight: 1 }}>×</span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</label>
      {onToggleSplit && (
        <div style={{ display: 'inline-flex', gap: 2, marginBottom: 10, background: FR.salt, borderRadius: 6, padding: 2, border: `0.5px solid ${FR.sand}`, alignSelf: 'flex-start' }}>
          {[{ v: false, l: '1 image' }, { v: true, l: '2 images' }].map(({ v, l }) => (
            <button key={l} onClick={() => onToggleSplit(v)} style={{
              padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
              background: (!!splitMode === v) ? FR.slate : 'transparent', color: (!!splitMode === v) ? FR.salt : FR.stone,
            }}>{l}</button>
          ))}
        </div>
      )}
      {splitMode ? (
        <>
          <div ref={boxRef} style={{ position: 'relative', width: '74%', margin: '0 auto', userSelect: 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <AspectPhoto flush slotKey={slotKey}  aspect={REF_2x3} images={images} onUpload={onUpload} onRemove={onRemove} label={undefined} />
              <AspectPhoto flush slotKey={slotKeyB} aspect={REF_2x3} images={images} onUpload={onUpload} onRemove={onRemove} label={undefined} />
            </div>
            {/* dot layer over the whole stack: click-through unless a number is
                armed (so the photos still take uploads / recrops); dots stay
                draggable, and the coords are normalised to the stack so they
                land in the same spot in the live preview. */}
            <div
              onClick={placeAtSplit}
              style={{ position: 'absolute', inset: 0, pointerEvents: armed != null ? 'auto' : 'none', cursor: armed != null ? 'crosshair' : 'default' }}>
              {entries.map(e => e.dot ? (
                <div
                  key={e.num}
                  onPointerDown={ev => startDragSplit(e.num, ev)}
                  title={`Call-out ${e.num} — drag to move`}
                  style={{
                    position: 'absolute', left: `${e.dot.x * 100}%`, top: `${e.dot.y * 100}%`,
                    transform: 'translate(-50%, -50%)', width: 21, height: 21, borderRadius: '50%',
                    background: '#A32D2D', color: '#fff', border: '1.5px solid #fff',
                    fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'grab', boxShadow: '0 1px 4px rgba(0,0,0,0.28)', pointerEvents: 'auto',
                    fontFamily: "'Helvetica Neue', sans-serif",
                    outline: armedNum === e.num ? '2px solid rgba(163,45,45,0.35)' : 'none', outlineOffset: 1,
                  }}>
                  {e.num}
                </div>
              ) : null)}
            </div>
          </div>
          {onAnnotate && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              {[{ slot: slotKey, ann: annotations, ttl: 'Reference (top)', lbl: 'Annotate top' }, { slot: slotKeyB, ann: annotationsB, ttl: 'Reference (bottom)', lbl: 'Annotate bottom' }].map(({ slot, ann, ttl, lbl }) => (
                (images || []).some(i => i.slot === slot) ? (
                  <button key={slot} onClick={() => onAnnotate(slot, ttl)} style={ANNOTATE_BTN}>
                    <span style={{ color: '#A32D2D', fontWeight: 700 }}>+</span> {lbl}{(ann && ann.length) ? ` (${ann.length})` : ''}
                  </button>
                ) : null
              ))}
            </div>
          )}
          {numberChips}
          <p style={{ fontSize: 10, color: FR.stone, marginTop: 6, fontStyle: 'italic' }}>
            Two stacked 2:3 references. Click a number, then click a photo to drop its dot; drag to fine-tune. Each photo can be cropped and annotated.
          </p>
        </>
      ) : (
      <>
      {img ? (
        <>
          <div
            ref={boxRef}
            onClick={placeAt}
            style={{
              position: 'relative', width: '100%', aspectRatio: `${CALLOUT_REF_RATIO}`,
              background: FR.salt, border: `0.5px solid ${FR.sand}`, borderRadius: 6,
              overflow: 'hidden', cursor: 'crosshair', userSelect: 'none',
            }}>
            <AssetImage image={img} alt="garment reference" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }} />
            <AnnotationOverlay annos={annotations} />
            {onAnnotate && (
              <button
                onClick={ev => { ev.stopPropagation(); onAnnotate(slotKey, 'Garment reference'); }}
                title="Draw red box / text on the garment reference"
                style={{ position: 'absolute', top: 6, left: 6, padding: '4px 10px', borderRadius: 12, background: FR.salt, color: FR.slate, border: '0.5px solid rgba(58,58,58,0.2)', fontSize: 10, fontWeight: 600, cursor: 'pointer', letterSpacing: 0.3, zIndex: 4 }}>
                <span style={{ color: '#A32D2D', fontWeight: 700 }}>+</span> Annotate{(annotations && annotations.length) ? ` (${annotations.length})` : ''}
              </button>
            )}
            {entries.map(e => e.dot ? (
              <div
                key={e.num}
                onPointerDown={ev => startDrag(e.num, ev)}
                title={`Call-out ${e.num} — drag to move`}
                style={{
                  position: 'absolute', left: `${e.dot.x * 100}%`, top: `${e.dot.y * 100}%`,
                  transform: 'translate(-50%, -50%)', width: 21, height: 21, borderRadius: '50%',
                  background: '#A32D2D', color: '#fff', border: '1.5px solid #fff',
                  fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'grab', boxShadow: '0 1px 4px rgba(0,0,0,0.28)',
                  fontFamily: "'Helvetica Neue', sans-serif",
                  outline: armedNum === e.num ? '2px solid rgba(163,45,45,0.35)' : 'none', outlineOffset: 1,
                }}>
                {e.num}
              </div>
            ) : null)}
            <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 6 }}>
              <button
                onClick={ev => { ev.stopPropagation(); recrop(); }}
                title="Reposition / zoom / crop the reference"
                style={{ padding: '4px 10px', borderRadius: 12, background: FR.soil, color: FR.salt, border: 'none', fontSize: 10, cursor: 'pointer', fontWeight: 600, letterSpacing: 0.3 }}>
                Recrop
              </button>
              <button
                onClick={ev => { ev.stopPropagation(); onRemove(slotKey, 0); }}
                title="Remove garment image (keeps the dots)"
                style={{ width: 24, height: 24, borderRadius: 12, background: FR.slate, color: FR.salt, border: 'none', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
          </div>
          {/* number chips: click to arm which dot the next click places */}
          {numberChips}
          <p style={{ fontSize: 10, color: FR.stone, marginTop: 6, fontStyle: 'italic' }}>
            Click a number, then click the garment to drop its dot. Drag a dot to fine-tune; × clears it.
          </p>
        </>
      ) : (
        <AspectPhoto
          slotKey={slotKey}
          aspect={CALLOUT_REF_ASPECT}
          images={images}
          onUpload={onUpload}
          onRemove={onRemove}
          label={undefined}
        />
      )}
      </>
      )}
      {cropSrc && (
        <CropModal
          src={cropSrc}
          aspect={CALLOUT_REF_RATIO}
          label="Drag to reposition · scroll or slider to zoom · rotate if needed"
          onCancel={() => setCropSrc(null)}
          onConfirm={saveCropped}
        />
      )}
    </div>
  );
}

// Shared layout: 2:3 vertical reference (left) + 2x2 grid of detail boxes on
// the right. When `enhanced` (Cut & Sew pages 07/08) the left reference becomes
// the clickable in-app dot-placement garment image, and each card carries an
// optional supporting image beside its main image. Without `enhanced`
// (Embellishments 16, Treatments 19) the original layout is preserved exactly.
function ConstructionDetailsPage({ pageKey, dataKey, fieldName, data, set, images, onUpload, onRemove, enhanced, annotations, onAnnotate, heading = 'Call Outs' }) {
  const entries = (data?.[fieldName] || DEFAULT_DATA[fieldName]).slice(0, 4);
  const update = (idx, next) => {
    const copy = [...(data?.[fieldName] || DEFAULT_DATA[fieldName])];
    copy[idx] = next;
    set(fieldName, copy);
  };
  const setDot = (num, dot) => {
    const copy = [...(data?.[fieldName] || DEFAULT_DATA[fieldName])];
    const idx = copy.findIndex(e => e.num === num);
    if (idx === -1) return;
    copy[idx] = { ...copy[idx], dot };
    set(fieldName, copy);
  };
  return (
    <div>
      <SectionTitle>{heading}</SectionTitle>
      <p style={{ fontSize: 11, color: FR.stone, marginBottom: 14, fontStyle: 'italic' }}>
        {enhanced
          ? 'Click the garment image on the left to drop a numbered dot for each call-out, then add a main close-up, an optional supporting image, and the description. All text is per-field so it can be translated per factory.'
          : 'Number each callout on the left reference image (red dots) and describe the matching detail in the box. All text is dedicated per-field so it can be translated per factory.'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 0.55fr) 1.45fr', gap: 18, alignItems: 'stretch' }}>
        {/* left reference column */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {enhanced ? (
            <CalloutGarmentRef
              label="Garment Reference"
              slotKey={`sketch-callout-${pageKey}`}
              images={images}
              onUpload={onUpload}
              onRemove={onRemove}
              entries={entries}
              onSetDot={setDot}
              annotations={(annotations && annotations[`sketch-callout-${pageKey}`]) || []}
              onAnnotate={onAnnotate}
              splitMode={!!(data?.referenceLayout?.[`sketch-callout-${pageKey}`])}
              onToggleSplit={(v) => set('referenceLayout', { ...(data?.referenceLayout || {}), [`sketch-callout-${pageKey}`]: v })}
              annotationsB={(annotations && annotations[`sketch-callout-${pageKey}-b`]) || []}
            />
          ) : (
            <>
              <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>Reference Image (2 : 3)</label>
              <PhotoUpload
                single
                label="Drop the callout reference (numbered red dots overlaid in Photoshop)"
                slotKey={`sketch-callout-${pageKey}`}
                images={images}
                onUpload={onUpload}
                onRemove={onRemove}
                aspect="2 / 3"
              />
            </>
          )}
        </div>

        {/* 2x2 grid of detail cards — each carries its own close-up image */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignContent: 'start' }}>
          {entries.map((entry, i) => (
            <ConstructionDetailCard
              key={entry.num}
              entry={entry}
              onChange={next => update(i, next)}
              images={images}
              onUpload={onUpload}
              onRemove={onRemove}
              enhanced={enhanced}
              annotations={annotations}
              onAnnotate={onAnnotate}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function StepSketches({ data, set, images, onUpload, onRemove, annotations, onAnnotate }) {
  return (
    <ConstructionDetailsPage
      pageKey="page1"
      fieldName="constructionDetailsPage1"
      heading="Construction (1)"
      data={data}
      set={set}
      images={images}
      onUpload={onUpload}
      onRemove={onRemove}
      enhanced
      annotations={annotations}
      onAnnotate={onAnnotate}
    />
  );
}

export function StepSketches2({ data, set, images, onUpload, onRemove, annotations, onAnnotate }) {
  return (
    <ConstructionDetailsPage
      pageKey="page2"
      fieldName="constructionDetailsPage2"
      heading="Construction (2)"
      data={data}
      set={set}
      images={images}
      onUpload={onUpload}
      onRemove={onRemove}
      enhanced
      annotations={annotations}
      onAnnotate={onAnnotate}
    />
  );
}
export function StepPattern({ data, set, images, onUpload, onRemove }) {
  const pieces = data.patternPieces && data.patternPieces.length ? data.patternPieces : [{ pieceNum: '', pieceName: '', quantity: '', fabric: '', grain: '', fusing: '', notes: '' }];
  const updP = (i, k, v) => set('patternPieces', pieces.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addP = () => set('patternPieces', [...pieces, { pieceNum: '', pieceName: '', quantity: '', fabric: '', grain: '', fusing: '', notes: '' }]);
  const rmP  = (i) => set('patternPieces', pieces.filter((_, idx) => idx !== i));

  return (
    <div>
      <SectionTitle>Cutting</SectionTitle>

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

      {/* Fabric Yield — CLO3D actual override */}
      {(data.pickedFabrics || []).some(p => p?.fabricId) && (
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Fabric Yield — CLO3D Actual
          </label>
          <p style={{ fontSize: 10, color: FR.stone, marginBottom: 10, lineHeight: 1.5 }}>
            After optimizing the marker in CLO3D, enter the actual yield per unit here. This overrides the standard estimate from the BOM step and updates the cost roll-up.
          </p>
          {(data.pickedFabrics || []).map((entry, i) => {
            if (!entry?.fabricId) return null;
            const role = entry.role || `Fabric ${i + 1}`;
            return (
              <div key={entry.fabricId} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, padding: '8px 10px', background: FR.salt, borderRadius: 4, border: `0.5px solid ${FR.sand}` }}>
                <span style={{ fontSize: 11, color: FR.slate, fontWeight: 500, minWidth: 90 }}>{role}</span>
                <span style={{ fontSize: 10, color: FR.stone, flex: 1 }}>
                  {entry.metersPerUnit
                    ? `${entry.metersPerUnit}m/unit — ${entry.yieldIsActual ? 'CLO3D actual' : entry.yieldIsManual ? 'manual' : 'std. estimate'}`
                    : 'No yield set'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    max="10"
                    value={entry.metersPerUnit || ''}
                    placeholder="m/unit"
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      const arr = [...(data.pickedFabrics || [])];
                      arr[i] = { ...arr[i], metersPerUnit: Number.isFinite(v) ? v : null, yieldIsActual: Number.isFinite(v) };
                      set('pickedFabrics', arr);
                    }}
                    style={{ width: 70, border: `0.5px solid ${FR.sand}`, borderRadius: 3, padding: '4px 6px', fontSize: 10, color: FR.slate, background: FR.white, outline: 'none' }}
                  />
                  <span style={{ fontSize: 10, color: FR.stone }}>m/unit</span>
                  {entry.yieldIsActual && (
                    <span style={{ fontSize: 9, color: '#3B6D11', fontWeight: 600, padding: '2px 5px', background: '#EEF6E8', borderRadius: 3 }}>CLO3D</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
      <SectionTitle>Size Grading</SectionTitle>
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

// Cost cell — number input prefixed with "$", stored as string on the row
// and coerced to Number at roll-up time. Read-only with a small "lib"
// chip when the row is linked to a library atom (cost flows from the
// library entry, so editing on the row would silently desync).
function CostCell({ row, value, onChange, linked }) {
  if (linked) {
    const libCost = parseFloat(linked.cost_per_unit_usd) || 0;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: FR.slate, fontFamily: "'Helvetica Neue',sans-serif" }}>
        <span style={{ color: FR.stone }}>$</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{libCost.toFixed(2)}</span>
        <span style={{ marginLeft: 'auto', fontSize: 8, color: FR.stone, textTransform: 'uppercase', letterSpacing: 0.4 }}>lib</span>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <span style={{ color: FR.stone, fontSize: 10 }}>$</span>
      <input
        type="number" step="0.01" min="0"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder="0.00"
        style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '3px 2px', color: FR.slate, outline: 'none', fontFamily: "'Helvetica Neue',sans-serif", boxSizing: 'border-box', fontVariantNumeric: 'tabular-nums' }} />
    </div>
  );
}

// Library link cell — when row.{idField} is set, shows the linked atom's
// code with an unlink × button (cost flows from the library entry).
// Otherwise shows a dropdown of matching-type atoms plus a "+ Save row as
// new" option that promotes the current row's fields into a library atom.
function LibraryLinkCell({
  row,
  rowIndex,
  idField,             // 'treatment_id' or 'embellishment_id'
  atoms,               // pre-filtered list of matching atoms
  atomLabel = 'Library',
  nameField = 'name',  // which row field is the primary display name
  onPatchRow,          // (rowIndex, patch) => void
  onCreate,            // async (rowData) => createdAtom — caller decides type/shape
  onCreated,           // () => void — caller refreshes its atom list
}) {
  const [busy, setBusy] = useState(false);
  const linkedId = row?.[idField] || '';
  const linked = linkedId ? atoms.find(a => a.id === linkedId) : null;

  if (linked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 10, color: FR.soil, fontWeight: 600 }}>
          {linked.code || '—'}
        </span>
        <button
          type="button"
          onClick={() => onPatchRow(rowIndex, { [idField]: '' })}
          title="Unlink from library"
          style={{ background: 'none', border: 'none', color: FR.stone, fontSize: 12, cursor: 'pointer', padding: 0, lineHeight: 1 }}>
          ×
        </button>
      </div>
    );
  }

  const hasRowContent = !!(row?.[nameField] || row?.treatment || row?.technique);

  return (
    <select
      value=""
      disabled={busy}
      onChange={async e => {
        const val = e.target.value;
        e.target.value = ''; // reset dropdown after action
        if (!val) return;
        if (val === '__new__') {
          if (!hasRowContent) {
            alert(`Add a name to this row before saving to the ${atomLabel} library.`);
            return;
          }
          setBusy(true);
          try {
            const created = await onCreate(row);
            if (created?.id) {
              onPatchRow(rowIndex, { [idField]: created.id });
              if (onCreated) onCreated();
            }
          } catch (err) {
            console.error('save to library:', err);
            alert(`Could not save to ${atomLabel} library — see console for details.`);
          } finally {
            setBusy(false);
          }
          return;
        }
        const picked = atoms.find(a => a.id === val);
        if (!picked) return;
        const cost = parseFloat(picked.cost_per_unit_usd) || 0;
        onPatchRow(rowIndex, {
          [idField]: picked.id,
          [nameField]: picked.name || row[nameField] || '',
          cost_per_unit_usd: cost,
        });
      }}
      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 10, padding: '3px 2px', color: FR.slate, outline: 'none', fontFamily: "'Helvetica Neue',sans-serif", boxSizing: 'border-box', cursor: busy ? 'wait' : 'pointer' }}>
      <option value="">{busy ? 'Saving…' : '—'}</option>
      {atoms.length > 0 && <optgroup label={`Pick from ${atomLabel} library`}>
        {atoms.map(a => (
          <option key={a.id} value={a.id}>
            {a.code ? `${a.code} · ` : ''}{a.name || 'Untitled'}
          </option>
        ))}
      </optgroup>}
      <option value="__new__" disabled={!hasRowContent}>
        {hasRowContent ? '+ Save row as new' : '(fill row first)'}
      </option>
    </select>
  );
}

export function StepTreatments({ data, set, images, onUpload, onRemove }) {
  // Resolve `treatment_id` selections from BOM fabric rows into rich cards
  // (name, code, process summary, drift) so the designer sees what the
  // BOM picker pinned without leaving this page. This is a read-only
  // surface; clearing the link happens on the BOM page.
  const [tlib, setTlib] = useState([]);
  const [rollupsById, setRollupsById] = useState({});
  const [tlibTick, setTlibTick] = useState(0);

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
  }, [tlibTick]);
  const refreshTlib = () => setTlibTick(t => t + 1);

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

  const emptyWashDye = { step: '', treatment: '', process: '', temperature: '', duration: '', chemicals: '', notes: '', cost_per_unit_usd: '', treatment_id: '' };
  const treatments = data.treatments && data.treatments.length ? data.treatments : [emptyWashDye];
  const updT = (i, k, v) => set('treatments', treatments.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const patchT = (i, patch) => set('treatments', treatments.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addT = () => set('treatments', [...treatments, emptyWashDye]);
  const rmT  = (i) => set('treatments', treatments.filter((_, idx) => idx !== i));

  const emptyDistress = { area: '', technique: '', intensity: '', referenceImage: '', notes: '', cost_per_unit_usd: '', treatment_id: '' };
  const distressing = data.distressing && data.distressing.length ? data.distressing : [emptyDistress];
  const updD = (i, k, v) => set('distressing', distressing.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const patchD = (i, patch) => set('distressing', distressing.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addD = () => set('distressing', [...distressing, emptyDistress]);
  const rmD  = (i) => set('distressing', distressing.filter((_, idx) => idx !== i));

  const emptyWashType = { name: '', notes: '', cost_per_unit_usd: '', treatment_id: '' };
  const washTypeRows = (data.treatmentWashTypes && data.treatmentWashTypes.length) ? data.treatmentWashTypes : [emptyWashType];
  const updWT = (i, k, v) => set('treatmentWashTypes', washTypeRows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const patchWT = (i, patch) => set('treatmentWashTypes', washTypeRows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addWT = () => set('treatmentWashTypes', [...washTypeRows, emptyWashType]);
  const rmWT  = (i) => set('treatmentWashTypes', washTypeRows.filter((_, idx) => idx !== i));

  const washAtoms = tlib.filter(t => t.type === 'wash');
  // Wash & Dye step accepts wash + both dye families — operators pick the
  // right family from a combined list rather than guessing the type field.
  const washDyeAtoms = tlib.filter(t => t.type === 'wash' || t.type === 'garment_dye' || t.type === 'piece_dye');
  const finishAtoms = tlib.filter(t => t.type === 'finish' || t.type === 'distress');

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
      <SectionTitle>Render</SectionTitle>
      <p style={{ fontSize: 11, color: FR.stone, marginBottom: 18, fontStyle: 'italic' }}>
        Three angles of the wash render. When the wash is brand-new and untested, generate a render to align everyone before sampling. Once the wash is tested, replace these with the real photos.
      </p>

      <div style={{ marginBottom: 22 }}>
        <Row cols="1fr 1fr 1fr">
          <PhotoUpload single label="Front" slotKey="treatment-front" images={images} onUpload={onUpload} onRemove={onRemove} aspect="2 / 3" />
          <PhotoUpload single label="Back"  slotKey="treatment-back"  images={images} onUpload={onUpload} onRemove={onRemove} aspect="2 / 3" />
          <PhotoUpload single label="Side"  slotKey="treatment-side"  images={images} onUpload={onUpload} onRemove={onRemove} aspect="2 / 3" />
        </Row>
      </div>

      <div style={{ marginBottom: 22 }}>
        <label style={sectionLabel}>Wash Types</label>
        <p style={{ fontSize: 11, color: FR.stone, marginTop: -2, marginBottom: 8 }}>
          One row per wash applied to this garment. Stone wash, garment dye, enzyme wash — list each as a separate row. Each wash carries a per-unit cost that rolls into the Treatments total. Save the row to the Treatments library to reuse the wash across packs.
        </p>
        <LibraryDropdownBar
          label="Add from library"
          items={tlib.length ? washAtoms : null}
          getLabel={a => a.name || a.code || 'Untitled'}
          onSelect={atom => set('treatmentWashTypes', [...(data.treatmentWashTypes || []), { name: atom.name || '', notes: atom.notes || '', cost_per_unit_usd: atom.cost_per_unit_usd || '', treatment_id: atom.id }])}
          placeholder="— Add wash type from library —"
        />
        <ArrayTable
          headers={[
            { key: 'name',  label: 'Wash Type', placeholder: 'Stone Wash / Garment Dye / Enzyme Wash' },
            { key: 'notes', label: 'Notes',     placeholder: 'Color / intensity / process detail' },
            { key: 'cost_per_unit_usd', label: 'Cost / unit', render: (v, onChange, row) => (
              <CostCell row={row} value={v} onChange={onChange} linked={row.treatment_id ? washAtoms.find(a => a.id === row.treatment_id) : null} />
            )},
            { key: 'treatment_id', label: 'Library', render: (_v, _onChange, row, ri) => (
              <LibraryLinkCell
                row={row} rowIndex={ri} idField="treatment_id"
                atoms={washAtoms} atomLabel="Treatments" nameField="name"
                onPatchRow={patchWT}
                onCreate={async (r) => createTreatment({
                  type: 'wash',
                  name: r.name || 'Untitled wash',
                  notes: r.notes || '',
                  cost_per_unit_usd: parseFloat(r.cost_per_unit_usd) || 0,
                })}
                onCreated={refreshTlib}
              />
            )},
          ]}
          rows={washTypeRows}
          onUpdate={updWT}
          onAdd={addWT}
          onRemove={rmWT}
        />
      </div>

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
        <LibraryDropdownBar
          label="Add from library"
          items={tlib.length ? washDyeAtoms : null}
          getLabel={a => [TREATMENT_TYPE_LABEL[a.type] || a.type, a.name || a.code].filter(Boolean).join(' · ')}
          onSelect={atom => set('treatments', [...(data.treatments || []), { treatment: atom.name || '', process: atom.notes || '', temperature: atom.temperature_c ? `${atom.temperature_c}°C` : '', duration: atom.duration_minutes ? `${atom.duration_minutes} min` : '', chemicals: atom.chemistry || '', cost_per_unit_usd: atom.cost_per_unit_usd || '', treatment_id: atom.id }])}
          placeholder="— Add wash / dye treatment from library —"
        />
        <ArrayTable
          headers={[
            { key: 'step',        label: 'Step',                  placeholder: '1 / 2 / 3' },
            { key: 'treatment',   label: 'Treatment',             placeholder: 'Acid Wash / Garment Dye' },
            { key: 'process',     label: 'Process',               placeholder: 'Stone wash, enzyme, etc.' },
            { key: 'temperature', label: 'Temperature',           placeholder: '40°C' },
            { key: 'duration',    label: 'Duration',              placeholder: '45 min' },
            { key: 'chemicals',   label: 'Chemicals or Agents',   placeholder: 'Pumice, enzyme, sodium…' },
            { key: 'notes',       label: 'Notes' },
            { key: 'cost_per_unit_usd', label: 'Cost / unit', render: (v, onChange, row) => (
              <CostCell row={row} value={v} onChange={onChange} linked={row.treatment_id ? washDyeAtoms.find(a => a.id === row.treatment_id) : null} />
            )},
            { key: 'treatment_id', label: 'Library', render: (_v, _onChange, row, ri) => (
              <LibraryLinkCell
                row={row} rowIndex={ri} idField="treatment_id"
                atoms={washDyeAtoms} atomLabel="Treatments" nameField="treatment"
                onPatchRow={patchT}
                onCreate={async (r) => createTreatment({
                  // Default newly-saved Wash & Dye rows to a wash atom; designer
                  // can flip the type in the library after the fact if needed.
                  type: 'wash',
                  name: r.treatment || 'Untitled treatment',
                  chemistry: r.chemicals || '',
                  temperature_c: parseFloat(r.temperature) || 0,
                  duration_minutes: parseFloat(r.duration) || 0,
                  notes: r.process || r.notes || '',
                  cost_per_unit_usd: parseFloat(r.cost_per_unit_usd) || 0,
                })}
                onCreated={refreshTlib}
              />
            )},
          ]}
          rows={treatments} onUpdate={updT} onAdd={addT} onRemove={rmT} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel}>Distressing &amp; Special Finishes</label>
        <LibraryDropdownBar
          label="Add from library"
          items={tlib.length ? finishAtoms : null}
          getLabel={a => [TREATMENT_TYPE_LABEL[a.type] || a.type, a.name || a.code].filter(Boolean).join(' · ')}
          onSelect={atom => set('distressing', [...(data.distressing || []), { technique: atom.name || '', notes: atom.notes || '', cost_per_unit_usd: atom.cost_per_unit_usd || '', treatment_id: atom.id }])}
          placeholder="— Add distress / finish from library —"
        />
        <ArrayTable
          headers={[
            { key: 'area',           label: 'Area',             placeholder: 'Front pocket / Knee' },
            { key: 'technique',      label: 'Technique',        placeholder: 'Sandblast / Hand scrape' },
            { key: 'intensity',      label: 'Intensity (1-5)',  render: intensityRender },
            { key: 'referenceImage', label: 'Reference Image',  placeholder: 'Filename' },
            { key: 'notes',          label: 'Notes' },
            { key: 'cost_per_unit_usd', label: 'Cost / unit', render: (v, onChange, row) => (
              <CostCell row={row} value={v} onChange={onChange} linked={row.treatment_id ? finishAtoms.find(a => a.id === row.treatment_id) : null} />
            )},
            { key: 'treatment_id', label: 'Library', render: (_v, _onChange, row, ri) => (
              <LibraryLinkCell
                row={row} rowIndex={ri} idField="treatment_id"
                atoms={finishAtoms} atomLabel="Treatments" nameField="technique"
                onPatchRow={patchD}
                onCreate={async (r) => createTreatment({
                  type: 'distress',
                  name: r.technique || 'Untitled finish',
                  notes: [r.area, r.notes].filter(Boolean).join(' · '),
                  cost_per_unit_usd: parseFloat(r.cost_per_unit_usd) || 0,
                })}
                onCreated={refreshTlib}
              />
            )},
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
  const locked = isStepLocked(23, data.status);

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
  const locked = isStepLocked(24, data.status);
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
  const locked = isStepLocked(21, data.status);

  const shipping = data.shippingReqs && data.shippingReqs.length ? data.shippingReqs : [{ requirement: '', specification: '', notes: '' }];
  const updS = (i, k, v) => set('shippingReqs', shipping.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addS = () => set('shippingReqs', [...shipping, { requirement: '', specification: '', notes: '' }]);
  const rmS  = (i) => set('shippingReqs', shipping.filter((_, idx) => idx !== i));

  const tests = data.testingStandards && data.testingStandards.length ? data.testingStandards : [{ test: '', standard: '', requirement: '', testMethod: '', passFail: 'Pending' }];
  const updT = (i, k, v) => set('testingStandards', tests.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addT = () => set('testingStandards', [...tests, { test: '', standard: '', requirement: '', testMethod: '', passFail: 'Pending' }]);
  const rmT  = (i) => set('testingStandards', tests.filter((_, idx) => idx !== i));

  // Auto-seed barcode matrix from colorways × sizeRange on first use.
  // sizeRange may be an array (newer shape) or a "S / M / L" string (legacy);
  // tolerate both so opening this page never crashes the app.
  const sizes = Array.isArray(data.sizeRange)
    ? data.sizeRange.map(s => String(s).trim()).filter(Boolean)
    : String(data.sizeRange || 'S / M / L / XL').split(/[/,]+/).map(s => s.trim()).filter(Boolean);
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
  const locked = isStepLocked(22, data.status);

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

// New step components added for the Embellishments + Treatments page expansion.
// Each one mirrors an existing pattern (flat lay, call-outs, source-files) so the
// supplier sees a consistent layout end-to-end.
export function StepEmbFlatlay({ data, set, images, onUpload, onRemove }) {
  return (
    <div>
      <SectionTitle>Flat Lay</SectionTitle>
      <p style={{ fontSize: 11, color: FR.stone, marginBottom: 14, fontStyle: 'italic' }}>
        Two flat-lay sketches showing print or embellishment placement. Each maximised to A4 landscape so the supplier can read the artwork at scale.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <PhotoUpload label="Front (with embellishment)" slotKey="emb-flatlay-front" images={images} onUpload={onUpload} onRemove={onRemove} aspect="1.414 / 1" />
        <PhotoUpload label="Back (with embellishment)"  slotKey="emb-flatlay-back"  images={images} onUpload={onUpload} onRemove={onRemove} aspect="1.414 / 1" />
      </div>
      <Row cols="1fr 1fr">
        <Input label="Print Type" value={data.embPrintType} onChange={v => set('embPrintType', v)} placeholder="Screen print / DTG / Embroidery / Patch / Heat transfer" />
        <Input label="Process Details" value={data.embProcessDetails} onChange={v => set('embProcessDetails', v)} placeholder="Plastisol, 4-color, 320 mesh, …" />
      </Row>
      <Input label="Flat Lay Notes" value={data.embFlatLayNotes} onChange={v => set('embFlatLayNotes', v)} multiline placeholder="Callouts, annotations, embellishment placement notes…" />
    </div>
  );
}

export function StepEmbCallouts({ data, set, images, onUpload, onRemove }) {
  return (
    <ConstructionDetailsPage
      pageKey="emb-callouts"
      fieldName="embCalloutDetails"
      data={data}
      set={set}
      images={images}
      onUpload={onUpload}
      onRemove={onRemove}
    />
  );
}

export function StepEmbSizing({ data, set, images, onUpload, onRemove }) {
  return (
    <div>
      <SectionTitle>Sizing &amp; Colors</SectionTitle>
      <p style={{ fontSize: 11, color: FR.stone, marginBottom: 14, fontStyle: 'italic' }}>
        Per-size artwork and colorway swatches. Drop the working source files (Illustrator / Photoshop / Figma exports) so the supplier can scale and recolor without rebuilding from scratch.
      </p>
      <div style={{ marginBottom: 14 }}>
        <PhotoUpload
          label="Sizing & Color Reference"
          slotKey="emb-sizing-reference"
          images={images}
          onUpload={onUpload}
          onRemove={onRemove}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        <PhotoUpload single label="Source File 1" slotKey="emb-sizing-source-1" images={images} onUpload={onUpload} onRemove={onRemove} />
        <PhotoUpload single label="Source File 2" slotKey="emb-sizing-source-2" images={images} onUpload={onUpload} onRemove={onRemove} />
        <PhotoUpload single label="Source File 3" slotKey="emb-sizing-source-3" images={images} onUpload={onUpload} onRemove={onRemove} />
      </div>
      <Input label="Sizing &amp; Color Notes" value={data.embSizingNotes} onChange={v => set('embSizingNotes', v)} multiline placeholder="Per-size print scaling, color swap rules, gradient handling, source-file format…" />
    </div>
  );
}

export function StepTreatmentCallouts({ data, set, images, onUpload, onRemove }) {
  return (
    <ConstructionDetailsPage
      pageKey="treat-callouts"
      fieldName="treatCalloutDetails"
      data={data}
      set={set}
      images={images}
      onUpload={onUpload}
      onRemove={onRemove}
    />
  );
}

// Order mirrors STEPS in techPackConstants.js — by manufacturing stage.
export const STEP_FNS = [
  StepCompetitorLandscape, // 00 Merchandising — Competitor Landscape (000)
  StepMerchandisingPreview,// 01 Merchandising — Merchandising Preview (00)
  StepCover,               // 02 Design — Style Overview
  StepDesignOverview,      // 03 Design — Design Overview
  StepFabrics,             // 04 Bill of Materials — Fabrics
  StepTrims,               // 05 Bill of Materials — Trims
  StepPackaging,           // 06 Bill of Materials — Packaging (skippable)
  StepFlatlays,            // 07 Cut & Sew — Flat Lay
  StepSketches,            // 08 Cut & Sew — Call Outs (page 1)
  StepSketches2,           // 09 Cut & Sew — Call Outs (page 2)
  StepConstruction,        // 10 Cut & Sew — Sewing (page 1, stitches 1–4)
  StepConstruction2,       // 11 Cut & Sew — Sewing (page 2, stitches 5–8)
  StepCutSewCost,          // 11$ Cut & Sew — Cost (internal, AI labor estimate + chat)
  StepPattern,             // 12 Cut & Sew — Cutting
  StepPom,                 // 13 Cut & Sew — POM
  StepSizeMatrix,          // 14 Cut & Sew — Size Grading (skippable)
  StepColor,               // 15 Embellishments — Colorways
  StepArtwork,             // 16 Embellishments — Artwork & Placement
  StepEmbFlatlay,          // 17 Embellishments — Flat Lay
  StepEmbCallouts,         // 18 Embellishments — Call Outs
  StepEmbSizing,           // 19 Embellishments — Sizing & Colors
  StepTreatments,          // 20 Treatments — Render
  StepTreatmentCallouts,   // 21 Treatments — Call Outs
  StepCompliance,          // 22 QC — Compliance & Testing (locked)
  StepQuality,             // 23 QC — Quality Inspection (locked)
  StepLabels,              // 24 Packaging — Labels & Packaging (locked)
  StepOrder,               // 25 Logistics (locked)
  StepRevision,            // 26 Sign-off
];

// Backwards-compat aliases so older references keep resolving during the
// multi-prompt rewrite. Remove once PLM / PDF / SVG utilities are updated.
export const StepIdentity = StepCover;
export const StepSku = () => <ComingSoon title="SKU & Numbering" />;
export const StepVendor = () => <ComingSoon title="Vendor" />;
export const StepDesign = StepDesignOverview;
export const StepMaterials = StepBOM;
export const StepReview = StepRevision;
