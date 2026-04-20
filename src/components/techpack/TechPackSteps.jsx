// Tech Pack wizard — 14 step panels mapping 1:1 to the pages of
// FR_TechPack_Template_Blank.pdf.
//
// Page 1 (Cover & Identity) is fully built. All other pages are placeholders
// that will be replaced in subsequent prompts.

import { useState } from 'react';
import { FR, FR_COLOR_OPTIONS, BOM_COMPONENT_OPTIONS, STATUSES, APPROVAL_STATUSES, DEFAULT_DATA } from './techPackConstants';
import { Input, Select, Row, SectionTitle, CoverPhoto, PhotoUpload, ArrayTable, EditableSelect, FRColorCell } from './TechPackPrimitives';

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
        <Input label="Factory Contact" value={data.factoryContact} onChange={v => set('factoryContact', v)} placeholder="Name / WeChat / Email" />
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
    <EditableSelect value={val} onChange={onChange} options={existingSuppliers} placeholder="Add new…" />
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
            { key: 'supplier',     label: 'Supplier',     render: supplierRender },
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
            { key: 'supplier',      label: 'Supplier',      render: supplierRender },
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
  const updateCW = (i, k, v) => {
    set('colorways', colorways.map((r, idx) => {
      if (idx !== i) return r;
      if (k === 'frColor') {
        const match = FR_COLOR_OPTIONS.find(c => c.name === v);
        return { ...r, frColor: v, hex: match ? match.hex : r.hex };
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
        {FR_COLOR_OPTIONS.map(c => (
          <div key={c.name} style={{ textAlign: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: 4, background: c.hex, border: c.name === 'Salt' ? `1px solid ${FR.sand}` : 'none' }} />
            <div style={{ fontSize: 8, color: FR.stone, marginTop: 2 }}>{c.name}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={sectionLabel}>Colorway Specification</label>
        <ArrayTable
          headers={[
            { key: 'name',           label: 'Colorway Name', placeholder: 'Slate Wash' },
            { key: 'frColor',        label: 'FR Color',      render: frColorRender },
            { key: 'pantone',        label: 'Pantone Ref',   placeholder: '19-4305' },
            { key: 'hex',            label: 'Hex',           placeholder: '#3A3A3A' },
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
