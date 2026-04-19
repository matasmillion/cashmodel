// 8 step components for the Component Pack wizard. Mirrors the per-step
// architecture of TechPackSteps — each step is a small, isolated section
// that feeds the matching page of the live Component Pack preview.

import { FR, STATUSES, BOM_COMPONENT_OPTIONS, CURRENCIES, DYE_METHODS, CERTIFICATIONS } from './componentPackConstants';
import { FR_COLOR_OPTIONS } from './techPackConstants';
import { Input, Select, Row, SectionTitle, ArrayTable, PhotoUpload } from './TechPackPrimitives';

export function StepIdentity({ data, set }) {
  return (
    <div>
      <SectionTitle>Identity & Classification</SectionTitle>
      <Row>
        <Input label="Component Name" value={data.componentName} onChange={v => set('componentName', v)} placeholder="e.g. YKK #5 Coil Zipper - Slate" />
        <Select label="Category" value={data.componentCategory} onChange={v => set('componentCategory', v)} options={BOM_COMPONENT_OPTIONS} />
      </Row>
      <Row cols="1fr 1fr 1fr">
        <Input label="Component Number" value={data.componentNumber} onChange={v => set('componentNumber', v)} placeholder="e.g. FR-ZIP-001" />
        <Select label="Status" value={data.status} onChange={v => set('status', v)} options={STATUSES} />
        <Input label="Season" value={data.season} onChange={v => set('season', v)} placeholder="Core / SS26 / FW26" />
      </Row>
    </div>
  );
}

export function StepSupplier({ data, set }) {
  return (
    <div>
      <SectionTitle>Supplier</SectionTitle>
      <Row>
        <Input label="Supplier Name" value={data.supplier} onChange={v => set('supplier', v)} placeholder="e.g. YKK China" />
        <Input label="Contact Name" value={data.supplierContact} onChange={v => set('supplierContact', v)} />
      </Row>
      <Row cols="1fr 1fr 1fr">
        <Input label="Email" value={data.supplierEmail} onChange={v => set('supplierEmail', v)} placeholder="sales@..." />
        <Input label="Phone / WeChat" value={data.supplierPhone} onChange={v => set('supplierPhone', v)} />
        <Input label="Website" value={data.supplierWebsite} onChange={v => set('supplierWebsite', v)} placeholder="https://..." />
      </Row>
      <Row cols="1fr 1fr 1fr">
        <Input label="Lead Time (days)" value={data.leadTime} onChange={v => set('leadTime', v)} placeholder="30" />
        <Input label="MOQ" value={data.moq} onChange={v => set('moq', v)} placeholder="1000" />
        <Select label="MOQ Unit" value={data.moqUnit} onChange={v => set('moqUnit', v)} options={['units', 'meters', 'yards', 'kg', 'rolls', 'pieces']} />
      </Row>
    </div>
  );
}

export function StepSpecs({ data, set }) {
  return (
    <div>
      <SectionTitle>Specifications</SectionTitle>
      <Row>
        <Input label="Material" value={data.material} onChange={v => set('material', v)} placeholder="e.g. Nylon, Cotton Twill, Metal" />
        <Input label="Composition" value={data.composition} onChange={v => set('composition', v)} placeholder="e.g. 100% Cotton, 95/5 Cotton/Spandex" />
      </Row>
      <Row cols="1fr 1fr 1fr">
        <Input label="Weight / GSM" value={data.weight} onChange={v => set('weight', v)} placeholder="400 GSM" />
        <Input label="Width" value={data.width} onChange={v => set('width', v)} placeholder="cm or inches" />
        <Input label="Dimensions" value={data.dimensions} onChange={v => set('dimensions', v)} placeholder="5×10×2mm (for trims)" />
      </Row>
      <Input label="Finish" value={data.finish} onChange={v => set('finish', v)} placeholder="e.g. Matte, Brushed, Enzyme Washed" />
      <Input label="Spec Notes" value={data.specNotes} onChange={v => set('specNotes', v)} multiline placeholder="Any additional technical details, shrinkage %, colorfastness, etc." />
    </div>
  );
}

export function StepColor({ data, set, pickFRColor }) {
  return (
    <div>
      <SectionTitle>Color</SectionTitle>
      <Row cols="1fr 1fr 1fr">
        <Select label="FR Color" value={data.frColor} onChange={pickFRColor} options={FR_COLOR_OPTIONS.map(c => c.name)} />
        <Input label="Custom Color Name" value={data.customColorName} onChange={v => set('customColorName', v)} placeholder="Non-FR palette" />
        <Select label="Dye Method" value={data.dyeMethod} onChange={v => set('dyeMethod', v)} options={DYE_METHODS} />
      </Row>
      <Row>
        <Input label="Pantone" value={data.pantone} onChange={v => set('pantone', v)} placeholder="Pantone 19-4305" />
        <Input label="Hex" value={data.hex} onChange={v => set('hex', v)} placeholder="#3A3A3A" />
      </Row>
    </div>
  );
}

export function StepCost({ data, set }) {
  const updatePB = (i, k, v) => { const b = [...(data.priceBreaks || [])]; b[i] = { ...b[i], [k]: v }; set('priceBreaks', b); };
  const addPB = () => set('priceBreaks', [...(data.priceBreaks || []), { qty: '', price: '' }]);
  const removePB = (i) => set('priceBreaks', (data.priceBreaks || []).filter((_, idx) => idx !== i));

  return (
    <div>
      <SectionTitle>Cost & Pricing</SectionTitle>
      <Row cols="1fr 1fr">
        <Input label="Cost per Unit" value={data.costPerUnit} onChange={v => set('costPerUnit', v)} placeholder="0.85" />
        <Select label="Currency" value={data.currency} onChange={v => set('currency', v)} options={CURRENCIES} />
      </Row>
      <div style={{ marginTop: 8 }}>
        <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>Price Breaks</label>
        <ArrayTable
          headers={[
            { key: 'qty', label: 'Min Qty', placeholder: '1000' },
            { key: 'price', label: `Price (${data.currency || 'USD'})`, placeholder: '0.80' },
          ]}
          rows={data.priceBreaks || []} onUpdate={updatePB} onAdd={addPB} onRemove={removePB} />
      </div>
    </div>
  );
}

export function StepCompliance({ data, set }) {
  const toggleCert = (cert) => {
    const current = data.certifications || [];
    if (current.includes(cert)) set('certifications', current.filter(c => c !== cert));
    else set('certifications', [...current, cert]);
  };

  return (
    <div>
      <SectionTitle>Compliance</SectionTitle>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>Certifications</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CERTIFICATIONS.map(cert => {
            const active = (data.certifications || []).includes(cert);
            return (
              <button key={cert} onClick={() => toggleCert(cert)}
                style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${active ? FR.soil : FR.sand}`, background: active ? FR.soil : 'white', color: active ? FR.salt : FR.stone, fontSize: 11, cursor: 'pointer' }}>
                {cert}
              </button>
            );
          })}
        </div>
      </div>
      <Row>
        <Input label="Country of Origin" value={data.countryOfOrigin} onChange={v => set('countryOfOrigin', v)} placeholder="China" />
        <Input label="HS Code" value={data.hsCode} onChange={v => set('hsCode', v)} placeholder="9607.11.00" />
      </Row>
    </div>
  );
}

export function StepImages({ images, onUpload, onRemove }) {
  return (
    <div>
      <SectionTitle>Reference Images</SectionTitle>
      <PhotoUpload label="Product Photos" slotKey="component-photo" images={images} onUpload={onUpload} onRemove={onRemove} />
      <PhotoUpload label="Swatch / Sample Photos" slotKey="component-swatch" images={images} onUpload={onUpload} onRemove={onRemove} />
      <PhotoUpload label="Spec Sheet / Tech Drawing" slotKey="component-spec" images={images} onUpload={onUpload} onRemove={onRemove} />
    </div>
  );
}

export function StepNotes({ data, set }) {
  return (
    <div>
      <SectionTitle>Notes</SectionTitle>
      <Input value={data.notes} onChange={v => set('notes', v)} multiline placeholder="Anything else worth remembering about this component…" />
    </div>
  );
}

export const COMPONENT_STEP_FNS = [
  StepIdentity, StepSupplier, StepSpecs, StepColor, StepCost, StepCompliance, StepImages, StepNotes,
];
