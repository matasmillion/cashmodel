// Component Pack wizard step panels. Scoped to the 4-page template:
//   1. Cover & Identity (fully built)
//   2. Specification & Artwork  (fully built)
//   3. BOM & Color               — placeholder
//   4. Construction, QC & Approval — placeholder

import { STATUSES, COMPONENT_TYPES, POM_UNITS, APPROVAL_STATUSES, PASS_FAIL } from './componentPackConstants';
import { FR, FR_COLOR_OPTIONS } from './techPackConstants';
import { Input, Select, Row, SectionTitle, CoverPhoto, EditableSelect, PhotoUpload, ArrayTable, FRColorCell } from './TechPackPrimitives';

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
export function StepBOMColor({ data, set, images, onUpload, onRemove, existingSuppliers = [] }) {
  // Materials
  const materials = data.materials && data.materials.length ? data.materials : [{ component: '', typeDescription: '', composition: '', weightGauge: '', supplier: '', notes: '' }];
  const updateMat = (i, k, v) => set('materials', materials.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addMat = () => set('materials', [...materials, { component: '', typeDescription: '', composition: '', weightGauge: '', supplier: '', notes: '' }]);
  const removeMat = (i) => set('materials', materials.filter((_, idx) => idx !== i));

  // Colorways
  const colorways = data.colorwaysList && data.colorwaysList.length ? data.colorwaysList : [{ name: '', frColor: '', pantone: '', hex: '', swatch: '', approvalStatus: 'Pending' }];
  const updateCW = (i, k, v) => {
    set('colorwaysList', colorways.map((r, idx) => {
      if (idx !== i) return r;
      if (k === 'frColor') {
        const match = FR_COLOR_OPTIONS.find(c => c.name === v);
        return { ...r, frColor: v, hex: match ? match.hex : r.hex };
      }
      return { ...r, [k]: v };
    }));
  };
  const addCW = () => set('colorwaysList', [...colorways, { name: '', frColor: '', pantone: '', hex: '', swatch: '', approvalStatus: 'Pending' }]);
  const removeCW = (i) => set('colorwaysList', colorways.filter((_, idx) => idx !== i));

  // Artwork placements
  const placements = data.artworkPlacements && data.artworkPlacements.length ? data.artworkPlacements : [{ placement: '', artworkFile: '', method: '', size: '', position: '', color: '', notes: '' }];
  const updateAP = (i, k, v) => set('artworkPlacements', placements.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addAP = () => set('artworkPlacements', [...placements, { placement: '', artworkFile: '', method: '', size: '', position: '', color: '', notes: '' }]);
  const removeAP = (i) => set('artworkPlacements', placements.filter((_, idx) => idx !== i));

  const sectionLabel = (text) => ({ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' });

  return (
    <div>
      <SectionTitle>BOM & Color</SectionTitle>

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel()}>Materials</label>
        <ArrayTable
          headers={[
            { key: 'component',       label: 'Component',        placeholder: 'Shell / Trim / Thread' },
            { key: 'typeDescription', label: 'Type / Description', placeholder: 'Twill, YKK #5, etc.' },
            { key: 'composition',     label: 'Composition',      placeholder: '100% Cotton' },
            { key: 'weightGauge',     label: 'Weight / Gauge',   placeholder: '400 GSM / 6mm' },
            { key: 'supplier',        label: 'Supplier',         render: (v, onChange) => (
              <EditableSelect value={v} onChange={onChange} options={existingSuppliers} placeholder="Add new…" />
            ) },
            { key: 'notes',           label: 'Notes',            placeholder: 'Optional' },
          ]}
          rows={materials} onUpdate={updateMat} onAdd={addMat} onRemove={removeMat} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel()}>Colorway Specification</label>
        <ArrayTable
          headers={[
            { key: 'name',           label: 'Name',           placeholder: 'Natural / Black' },
            { key: 'frColor',        label: 'FR Color',       render: (v, onChange) => <FRColorCell value={v} onChange={onChange} /> },
            { key: 'pantone',        label: 'Pantone',        placeholder: '19-4305' },
            { key: 'hex',            label: 'Hex',            placeholder: '#3A3A3A' },
            { key: 'swatch',         label: 'Swatch',         placeholder: 'Physical ref #' },
            { key: 'approvalStatus', label: 'Approval',       render: (v, onChange) => (
              <select value={v || 'Pending'} onChange={e => onChange(e.target.value)}
                style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '3px 2px', color: FR.slate, outline: 'none', fontFamily: "'Helvetica Neue',sans-serif", boxSizing: 'border-box' }}>
                {APPROVAL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) },
          ]}
          rows={colorways} onUpdate={updateCW} onAdd={addCW} onRemove={removeCW} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel()}>Artwork / Marking Placement</label>
        <Row>
          <PhotoUpload label="Face — Position, Size, Method" slotKey="component-artwork-face" images={images} onUpload={onUpload} onRemove={onRemove} />
          <PhotoUpload label="Back — Position, Size, Method" slotKey="component-artwork-back" images={images} onUpload={onUpload} onRemove={onRemove} />
        </Row>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={sectionLabel()}>Placement</label>
        <ArrayTable
          headers={[
            { key: 'placement',   label: 'Placement',    placeholder: 'Face / Back / Side' },
            { key: 'artworkFile', label: 'Artwork File', placeholder: 'logo-v1.ai' },
            { key: 'method',      label: 'Method',       placeholder: 'Embroidery / Print / Emboss' },
            { key: 'size',        label: 'Size',         placeholder: '40 × 15 mm' },
            { key: 'position',    label: 'Position',     placeholder: '20 mm from top' },
            { key: 'color',       label: 'Color',        placeholder: 'Black / Pantone ref' },
            { key: 'notes',       label: 'Notes',        placeholder: 'Optional' },
          ]}
          rows={placements} onUpdate={updateAP} onAdd={addAP} onRemove={removeAP} />
      </div>
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

export function StepQC({ data, set }) {
  // Process spec
  const procRows = data.processSpec && data.processSpec.length ? data.processSpec : [{ operation: '', type: '', specification: '', notes: '' }];
  const updateProc = (i, k, v) => set('processSpec', procRows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addProc = () => set('processSpec', [...procRows, { operation: '', type: '', specification: '', notes: '' }]);
  const removeProc = (i) => set('processSpec', procRows.filter((_, idx) => idx !== i));

  // Testing
  const testRows = data.testingStandards && data.testingStandards.length ? data.testingStandards : [{ test: '', standardRequirement: '', testMethod: '', passFail: 'Pending' }];
  const updateTest = (i, k, v) => set('testingStandards', testRows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addTest = () => set('testingStandards', [...testRows, { test: '', standardRequirement: '', testMethod: '', passFail: 'Pending' }]);
  const removeTest = (i) => set('testingStandards', testRows.filter((_, idx) => idx !== i));

  // Revisions (seed first row from componentPack fields when empty)
  const seedRevision = () => ({ rev: '1.0', date: data.dateCreated || '', changedBy: '', description: 'Initial release', approvedBy: '' });
  const revRows = data.revisions && data.revisions.length ? data.revisions : [seedRevision()];
  const updateRev = (i, k, v) => set('revisions', revRows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addRev = () => set('revisions', [...revRows, { rev: '', date: '', changedBy: '', description: '', approvedBy: '' }]);
  const removeRev = (i) => set('revisions', revRows.filter((_, idx) => idx !== i));

  // Final approval
  const fa = data.finalApproval || { designer: {}, brandOwner: {}, factory: {} };
  const setFA = (key, val) => set('finalApproval', { ...fa, [key]: val });

  const sectionLabel = { display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' };

  return (
    <div>
      <SectionTitle>Construction, QC & Approval</SectionTitle>

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel}>Construction / Process Specification</label>
        <ArrayTable
          headers={[
            { key: 'operation',     label: 'Operation',     placeholder: 'Weaving / Cutting / Assembly' },
            { key: 'type',          label: 'Type',          placeholder: 'Damask / Laser / Ultrasonic' },
            { key: 'specification', label: 'Specification', placeholder: 'Stitch count, tension, etc.' },
            { key: 'notes',         label: 'Notes',         placeholder: 'Optional' },
          ]}
          rows={procRows} onUpdate={updateProc} onAdd={addProc} onRemove={removeProc} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel}>Quality & Testing Standards</label>
        <ArrayTable
          headers={[
            { key: 'test',                 label: 'Test',                   placeholder: 'Colorfastness / Pull strength' },
            { key: 'standardRequirement',  label: 'Standard or Requirement',placeholder: 'AATCC 61 / ≥ 15N' },
            { key: 'testMethod',           label: 'Test Method',            placeholder: 'ISO 105-C06 / Instron' },
            { key: 'passFail',             label: 'Pass / Fail',            render: (v, onChange) => (
              <select value={v || 'Pending'} onChange={e => onChange(e.target.value)}
                style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '3px 2px', color: FR.slate, outline: 'none', fontFamily: "'Helvetica Neue',sans-serif", boxSizing: 'border-box' }}>
                {PASS_FAIL.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) },
          ]}
          rows={testRows} onUpdate={updateTest} onAdd={addTest} onRemove={removeTest} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel}>Revision History</label>
        <ArrayTable
          headers={[
            { key: 'rev',         label: 'Rev #',                  placeholder: '1.0' },
            { key: 'date',        label: 'Date',                   placeholder: 'YYYY-MM-DD' },
            { key: 'changedBy',   label: 'Changed By',             placeholder: 'Name' },
            { key: 'description', label: 'Description of Change',  placeholder: 'Initial release' },
            { key: 'approvedBy',  label: 'Approved By',            placeholder: 'Name' },
          ]}
          rows={revRows} onUpdate={updateRev} onAdd={addRev} onRemove={removeRev} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={sectionLabel}>Final Approval</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <ApprovalCard title="Designer"         value={fa.designer}   onChange={v => setFA('designer', v)} />
          <ApprovalCard title="Brand Owner"      value={fa.brandOwner} onChange={v => setFA('brandOwner', v)} />
          <ApprovalCard title="Factory / Supplier" value={fa.factory}    onChange={v => setFA('factory', v)} dateLabel="Date / Chop" />
        </div>
      </div>
    </div>
  );
}

export const COMPONENT_STEP_FNS = [StepCover, StepSpec, StepBOMColor, StepQC];
