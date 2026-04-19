// Tech Pack wizard — 14 step panels mapping 1:1 to the pages of
// FR_TechPack_Template_Blank.pdf.
//
// Page 1 (Cover & Identity) is fully built. All other pages are placeholders
// that will be replaced in subsequent prompts.

import { FR, STATUSES, DEFAULT_DATA } from './techPackConstants';
import { Input, Select, Row, SectionTitle, CoverPhoto } from './TechPackPrimitives';

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

export function StepCover({ data, set, images, onUpload, onRemove }) {
  const colorways = data.colorways && data.colorways.length ? data.colorways : [{ name: '', frColor: '', pantone: '', hex: '' }];
  const updateCWName = (i, v) => set('colorways', colorways.map((r, idx) => idx === i ? { ...r, name: v } : r));
  const addCW = () => set('colorways', [...colorways, { name: '', frColor: '', pantone: '', hex: '' }]);
  const removeCW = (i) => set('colorways', colorways.filter((_, idx) => idx !== i));

  const setSig = (key, field, val) => set(key, { ...(data[key] || { name: '', date: '' }), [field]: val });

  return (
    <div>
      <SectionTitle>Cover & Identity</SectionTitle>

      <CoverPhoto label="Product Render" slotKey="cover" images={images} onUpload={onUpload} onRemove={onRemove} />

      <Row>
        <Input label="Style Name" value={data.styleName} onChange={v => set('styleName', v)} placeholder="e.g. Borderless Basic Hoodie" />
        <Input label="Style #" value={data.styleNumber} onChange={v => set('styleNumber', v)} placeholder="FR-BB-HD-001" />
      </Row>

      <Row cols="1fr 1fr 1fr">
        <Input label="SKU Prefix" value={data.skuPrefix} onChange={v => set('skuPrefix', v)} placeholder="FR-BB-HD" />
        <Select label="Product Tier" value={data.productTier} onChange={v => set('productTier', v)}
          options={['Tier 1: Staple — Borderless Basics', 'Tier 1: Staple — Snowflake Staples', 'Tier 2: Drop — Destination Designer', 'Tier 2: Drop — Nomadic Necessities', 'Tier 2: Drop — Technical Travel']} />
        <Select label="Season" value={data.season} onChange={v => set('season', v)}
          options={['Core (Evergreen)', 'SS26', 'FW26', 'SS27', 'FW27']} />
      </Row>

      <Row cols="1fr 1fr 1fr">
        <Input label="Date Created" value={data.dateCreated} onChange={v => set('dateCreated', v)} placeholder="YYYY-MM-DD" />
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 3, letterSpacing: 0.5, textTransform: 'uppercase' }}>Revision</label>
          <input readOnly value={data.revision || 'V1.0'}
            style={{ width: '100%', padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 3, fontFamily: "'Helvetica Neue', sans-serif", fontSize: 13, color: FR.stone, background: FR.salt, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <Select label="Factory" value={data.factory} onChange={v => set('factory', v)}
          options={['Dongguan Shengde Clothing Co., Ltd. (圣德)', 'Guangzhou Yuanfuyuan Leather Co., Ltd.', 'Other']} />
      </Row>

      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>Colorways</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {colorways.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={c.name || ''} onChange={e => updateCWName(i, e.target.value)} placeholder="Colorway name (e.g. Slate Wash)"
                style={{ flex: 1, padding: '8px 10px', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 13, color: FR.slate, background: FR.white, outline: 'none', boxSizing: 'border-box' }} />
              {colorways.length > 1 && (
                <button onClick={() => removeCW(i)} style={{ background: 'none', border: 'none', color: FR.stone, cursor: 'pointer', fontSize: 16 }}>×</button>
              )}
            </div>
          ))}
          <button onClick={addCW} style={{ alignSelf: 'flex-start', padding: '4px 12px', background: 'none', border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 10, color: FR.soil, cursor: 'pointer' }}>+ Add colorway</button>
        </div>
      </div>

      <Row cols="1fr 1fr 1fr">
        <Input label="Size Range" value={data.sizeRange} onChange={v => set('sizeRange', v)} placeholder="S / M / L / XL" />
        <Input label="Target Retail ($)" value={data.targetRetail} onChange={v => set('targetRetail', v)} placeholder="117" />
        <Input label="Target FOB ($)" value={data.targetFOB} onChange={v => set('targetFOB', v)} placeholder="28" />
      </Row>

      <Select label="Status" value={data.status} onChange={v => set('status', v)} options={STATUSES} />
      <p style={{ fontSize: 10, color: FR.stone, marginTop: -4, lineHeight: 1.5 }}>
        Labels, Order &amp; Delivery, and Compliance unlock at Pre-Production.
      </p>

      <SectionTitle>Approvals</SectionTitle>
      <Row cols="1fr 1fr 1fr">
        <SignatureBlock label="Designed By" value={data.designedBy}
          onNameChange={v => setSig('designedBy', 'name', v)}
          onDateChange={v => setSig('designedBy', 'date', v)} />
        <SignatureBlock label="Approved By" value={data.approvedBy}
          onNameChange={v => setSig('approvedBy', 'name', v)}
          onDateChange={v => setSig('approvedBy', 'date', v)} />
        <SignatureBlock label="Factory Confirmed" value={data.factoryConfirmed}
          onNameChange={v => setSig('factoryConfirmed', 'name', v)}
          onDateChange={v => setSig('factoryConfirmed', 'date', v)} />
      </Row>
    </div>
  );
}

export function StepDesignOverview()   { return <ComingSoon title="Design Overview" />; }
export function StepFlatlays()         { return <ComingSoon title="Technical Flat Lay Diagrams" />; }
export function StepBOM()              { return <ComingSoon title="Bill of Materials" />; }
export function StepColor()            { return <ComingSoon title="Color & Artwork" />; }
export function StepConstruction()     { return <ComingSoon title="Construction Details" />; }
export function StepSketches()         { return <ComingSoon title="Construction Detail Sketches" />; }
export function StepPattern()          { return <ComingSoon title="Pattern Pieces & Cutting" />; }
export function StepPom()              { return <ComingSoon title="Points of Measure" />; }
export function StepTreatments()       { return <ComingSoon title="Garment Treatments" />; }
export function StepLabels()           { return <ComingSoon title="Labels & Packaging" />; }
export function StepOrder()            { return <ComingSoon title="Order & Delivery" />; }
export function StepCompliance()       { return <ComingSoon title="Compliance & Quality" />; }
export function StepRevision()         { return <ComingSoon title="Revision History & Approval" />; }

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
export const StepFactory = () => <ComingSoon title="Factory" />;
export const StepDesign = StepDesignOverview;
export const StepMaterials = StepBOM;
export const StepReview = StepRevision;
