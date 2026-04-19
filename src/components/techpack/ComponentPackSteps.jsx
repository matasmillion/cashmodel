// Component Pack wizard step panels. Scoped to the 4-page template:
//   1. Cover & Identity (fully built)
//   2. Specification & Artwork  (fully built)
//   3. BOM & Color               — placeholder
//   4. Construction, QC & Approval — placeholder

import { STATUSES, COMPONENT_TYPES, POM_UNITS } from './componentPackConstants';
import { FR } from './techPackConstants';
import { Input, Select, Row, SectionTitle, CoverPhoto, EditableSelect, PhotoUpload, ArrayTable } from './TechPackPrimitives';

function Signature({ label, value, onNameChange, onDateChange }) {
  const v = value || { name: '', date: '' };
  return (
    <Row>
      <Input label={`${label} — Name`} value={v.name} onChange={onNameChange} />
      <Input label={`${label} — Date`} value={v.date} onChange={onDateChange} placeholder="YYYY-MM-DD" />
    </Row>
  );
}

export function StepCover({ data, set, images, onUpload, onRemove, existingSuppliers = [] }) {
  const setSig = (field, key, value) => set(field, { ...(data[field] || { name: '', date: '' }), [key]: value });

  return (
    <div>
      <SectionTitle>Cover & Identity</SectionTitle>

      <CoverPhoto label="Component Photo" slotKey="component-cover" images={images} onUpload={onUpload} onRemove={onRemove} />

      <Row>
        <Input label="Component Name" value={data.componentName} onChange={v => set('componentName', v)} placeholder="e.g. Main Label — Woven" />
        <Input label="Style #" value={data.styleNumber} onChange={v => set('styleNumber', v)} placeholder="e.g. FR-CMP-001" />
      </Row>

      <Row cols="1fr 1fr 1fr">
        <Select label="Component Type" value={data.componentType} onChange={v => set('componentType', v)} options={COMPONENT_TYPES} />
        <EditableSelect
          label="Supplier"
          value={data.supplier}
          onChange={v => set('supplier', v)}
          options={existingSuppliers}
          placeholder="Add a new supplier…" />
        <Input label="Season" value={data.season} onChange={v => set('season', v)} placeholder="SS26 / FW26 / Core" />
      </Row>

      <Row cols="1fr 1fr 1fr">
        <Input label="Date Created" value={data.dateCreated} onChange={v => set('dateCreated', v)} placeholder="YYYY-MM-DD" />
        <Input label="Revision" value={data.revision} onChange={v => set('revision', v)} placeholder="V1.0" />
        <Select label="Status" value={data.status} onChange={v => set('status', v)} options={STATUSES} />
      </Row>

      <Row>
        <Input label="Parent Styles" value={data.parentStyles} onChange={v => set('parentStyles', v)} placeholder="Comma-separated style numbers" />
        <Input label="Colorways" value={data.colorways} onChange={v => set('colorways', v)} placeholder="e.g. Black, Natural, Slate" />
      </Row>

      <Row cols="1fr 1fr 1fr">
        <Input label="Dimensions" value={data.dimensions} onChange={v => set('dimensions', v)} placeholder='e.g. 40 × 15 mm' />
        <Input label="Target Unit Cost ($)" value={data.targetUnitCost} onChange={v => set('targetUnitCost', v)} placeholder="0.85" />
        <Input label="MOQ" value={data.moq} onChange={v => set('moq', v)} placeholder="1000" />
      </Row>

      <SectionTitle>Approvals</SectionTitle>
      <Signature
        label="Designed By"
        value={data.designedBy}
        onNameChange={v => setSig('designedBy', 'name', v)}
        onDateChange={v => setSig('designedBy', 'date', v)} />
      <Signature
        label="Approved By"
        value={data.approvedBy}
        onNameChange={v => setSig('approvedBy', 'name', v)}
        onDateChange={v => setSig('approvedBy', 'date', v)} />
      <Signature
        label="Supplier Confirmed"
        value={data.supplierConfirmed}
        onNameChange={v => setSig('supplierConfirmed', 'name', v)}
        onDateChange={v => setSig('supplierConfirmed', 'date', v)} />
    </div>
  );
}

function ComingSoon({ title }) {
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#716F70', fontSize: 13, fontStyle: 'italic', border: '1px dashed #EBE5D5', borderRadius: 6, background: '#F5F0E8' }}>
        Coming in the next session
      </div>
    </div>
  );
}

export function StepSpec({ data, set, images, onUpload, onRemove }) {
  const poms = data.poms && data.poms.length ? data.poms : [{ measurement: '', spec: '', unit: 'mm', tolerance: '', method: '' }];
  const updatePom = (i, k, v) => {
    const next = poms.map((row, idx) => (idx === i ? { ...row, [k]: v } : row));
    set('poms', next);
  };
  const addPom = () => set('poms', [...poms, { measurement: '', spec: '', unit: 'mm', tolerance: '', method: '' }]);
  const removePom = (i) => set('poms', poms.filter((_, idx) => idx !== i));

  return (
    <div>
      <SectionTitle>Specification & Artwork</SectionTitle>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>Component Drawing</label>
        <Row cols="1fr 1fr 1fr">
          <PhotoUpload label="Front / Top View"        slotKey="component-front" images={images} onUpload={onUpload} onRemove={onRemove} />
          <PhotoUpload label="Back / Bottom View"      slotKey="component-back"  images={images} onUpload={onUpload} onRemove={onRemove} />
          <PhotoUpload label="Side / Cross-Section"    slotKey="component-side"  images={images} onUpload={onUpload} onRemove={onRemove} />
        </Row>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>Dimensions / Points of Measure</label>
        <ArrayTable
          headers={[
            { key: 'measurement', label: 'Measurement', placeholder: 'e.g. Overall length' },
            { key: 'spec',        label: 'Spec',        placeholder: '40.0' },
            { key: 'unit',        label: 'Unit',        render: (v, onChange) => (
              <select value={v || 'mm'} onChange={e => onChange(e.target.value)}
                style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '3px 2px', color: FR.slate, outline: 'none', fontFamily: "'Helvetica Neue',sans-serif", boxSizing: 'border-box' }}>
                {POM_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            ) },
            { key: 'tolerance',   label: 'Tolerance',   placeholder: '±0.5' },
            { key: 'method',      label: 'Method',      placeholder: 'Ruler / Caliper / Template' },
          ]}
          rows={poms} onUpdate={updatePom} onAdd={addPom} onRemove={removePom} />
      </div>

      <Input
        label="Measurement Method Note"
        value={data.pomMethod}
        onChange={v => set('pomMethod', v)}
        multiline
        placeholder="Specify instrument, conditions, lay-flat vs relaxed, etc." />
    </div>
  );
}
export function StepBOMColor() { return <ComingSoon title="BOM & Color" />; }
export function StepQC() { return <ComingSoon title="Construction, QC & Approval" />; }

export const COMPONENT_STEP_FNS = [StepCover, StepSpec, StepBOMColor, StepQC];
