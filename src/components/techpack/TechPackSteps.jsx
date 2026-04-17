// All 14 step components for the Tech Pack builder
import { useState } from 'react';
import { FR, FR_COLOR_OPTIONS, BOM_COMPONENT_OPTIONS, STATUSES, DEFAULT_DATA, computeCompletion, isStepLocked } from './techPackConstants';
import { Input, Select, Row, SectionTitle, ArrayTable, PhotoUpload, LibraryPicker, FRColorCell, EditableSelect } from './TechPackPrimitives';
import { generatePackingList, getStoredKey, saveKey } from '../../utils/aiPackingList';

export function StepIdentity({ data, set, bomCost, costVariance }) {
  return (
    <div>
      <SectionTitle>Identity & Classification</SectionTitle>
      {data.parentStyleName && (
        <div style={{ padding: 10, background: FR.salt, border: `1px solid ${FR.sand}`, borderRadius: 6, marginBottom: 12, fontSize: 11, color: FR.stone }}>
          Variant of <strong style={{ color: FR.slate }}>{data.parentStyleName}</strong>
        </div>
      )}
      <Row>
        <Input label="Style Name" value={data.styleName} onChange={v => set('styleName', v)} placeholder="e.g. Borderless Basic Hoodie" />
        <Select label="Product Category" value={data.productCategory} onChange={v => set('productCategory', v)}
          options={['Hoodie', 'Zip Up Hoodie', 'Sweatpants', 'T-Shirt', 'Shorts', 'Jacket / Outerwear', 'Bag / Sling', 'Accessory', 'Denim', 'Pants', 'Button-up / Woven Shirt']} />
      </Row>
      <Row>
        <Select label="Product Tier" value={data.productTier} onChange={v => set('productTier', v)}
          options={['Tier 1: Staple — Borderless Basics', 'Tier 1: Staple — Snowflake Staples', 'Tier 2: Drop — Destination Designer', 'Tier 2: Drop — Nomadic Necessities', 'Tier 2: Drop — Technical Travel']} />
        <Select label="Season" value={data.season} onChange={v => set('season', v)}
          options={['Core (Evergreen)', 'SS26', 'FW26', 'SS27', 'FW27']} />
      </Row>
      <Row>
        <Input label="Target Retail Price" value={data.targetRetail} onChange={v => set('targetRetail', v)} placeholder="$117" />
        <Input label="Target FOB Price" value={data.targetFOB} onChange={v => set('targetFOB', v)} placeholder="$" />
      </Row>
      <Select label="Status" value={data.status} onChange={v => set('status', v)}
        options={STATUSES} />
      <p style={{ fontSize: 10, color: FR.stone, marginTop: -4, lineHeight: 1.5 }}>
        SKU, Labels, and Order & Delivery are locked during Design, Sampling, and Testing. They unlock at Pre-Production.
      </p>

      {/* Cost roll-up from BOM */}
      {bomCost > 0 && (
        <div style={{ marginTop: 12, padding: 12, background: FR.salt, borderRadius: 6, border: `1px solid ${FR.sand}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: FR.soil, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Calculated FOB (from BOM)</div>
              <div style={{ fontSize: 18, color: FR.slate, fontWeight: 600, fontFamily: "'Cormorant Garamond', serif" }}>${bomCost.toFixed(2)}</div>
            </div>
            {parseFloat(data.targetFOB) > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: FR.soil, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Variance</div>
                <div style={{ fontSize: 14, color: costVariance > 0 ? '#C0392B' : '#4CAF7D', fontWeight: 600 }}>
                  {costVariance > 0 ? '+' : ''}{costVariance.toFixed(2)}
                  <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 4 }}>
                    ({costVariance > 0 ? 'over target' : 'under target'})
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LockedBanner({ status }) {
  return (
    <div style={{ padding: 14, background: FR.salt, border: `1px dashed ${FR.soil}`, borderRadius: 6, marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: FR.slate, fontWeight: 600, marginBottom: 4 }}>🔒 Locked until Pre-Production</div>
      <div style={{ fontSize: 11, color: FR.stone, lineHeight: 1.5 }}>
        Current status: <strong>{status || 'Development'}</strong>. This step unlocks when you set the status to <strong>Pre-Production</strong> (or later) on step 1.
      </div>
    </div>
  );
}

export function StepSku({ data, set }) {
  const locked = isStepLocked(1, data.status);
  return (
    <div>
      <SectionTitle>SKU & Numbering</SectionTitle>
      {locked && <LockedBanner status={data.status} />}
      <p style={{ fontSize: 11, color: FR.stone, marginBottom: 12 }}>SKUs and barcodes auto-generate via Shopify when this tech pack moves from Sampling → Production. Enter manually if you already have one.</p>
      <fieldset disabled={locked} style={{ border: 'none', padding: 0, margin: 0, opacity: locked ? 0.45 : 1, pointerEvents: locked ? 'none' : 'auto' }}>
        <Row>
          <Input label="Style Number" value={data.styleNumber} onChange={v => set('styleNumber', v)} placeholder="e.g. FR-BB-HD-001" />
          <Input label="SKU Prefix" value={data.skuPrefix} onChange={v => set('skuPrefix', v)} placeholder="Auto-generated" />
        </Row>
        <Input label="Barcode Method" value={data.barcodeMethod} onChange={v => set('barcodeMethod', v)} />
      </fieldset>
    </div>
  );
}

export function StepFactory({ data, set }) {
  return (
    <div>
      <SectionTitle>Factory Assignment</SectionTitle>
      <Select label="Factory" value={data.factory} onChange={v => set('factory', v)}
        options={['Dongguan Shengde Clothing Co., Ltd. (圣德)', 'Guangzhou Yuanfuyuan Leather Co., Ltd.', 'Other']} />
      <Input label="Factory Contact" value={data.factoryContact} onChange={v => set('factoryContact', v)} placeholder="Name / WeChat / Email" />
      <Select label="Fabric Type" value={data.fabricType} onChange={v => set('fabricType', v)}
        options={['Cotton Jersey', 'Denim', 'Twill Cotton', 'Waxed Canvas', 'Other']} />
    </div>
  );
}

export function StepDesign({ data, set, images, onUpload, onRemove }) {
  return (
    <div>
      <SectionTitle>Design & Construction</SectionTitle>
      <PhotoUpload label="Design References / Mood Board" slotKey="design-refs" images={images} onUpload={onUpload} onRemove={onRemove} />
      <Select label="Fit" value={data.fit} onChange={v => set('fit', v)} options={['Oversized', 'Relaxed', 'Regular', 'Slim']} />
      <Input label="Key Design Features" value={data.keyFeatures} onChange={v => set('keyFeatures', v)} multiline placeholder="e.g. Crossover hood, kangaroo pocket, dropped shoulder..." />
      <Input label="Design Notes" value={data.designNotes} onChange={v => set('designNotes', v)} multiline />
    </div>
  );
}

export function StepFlatlays({ data, set, images, onUpload, onRemove }) {
  return (
    <div>
      <SectionTitle>Technical Flat Lay Diagrams</SectionTitle>
      <PhotoUpload label="Front View" slotKey="flatlay-front" images={images} onUpload={onUpload} onRemove={onRemove} />
      <PhotoUpload label="Back View" slotKey="flatlay-back" images={images} onUpload={onUpload} onRemove={onRemove} />
      <PhotoUpload label="Side / Detail Views" slotKey="flatlay-detail" images={images} onUpload={onUpload} onRemove={onRemove} />
      <Input label="Notes" value={data.flatLayNotes} onChange={v => set('flatLayNotes', v)} multiline />
    </div>
  );
}

export function StepMaterials({ data, set, library, saveToLibrary, images, onUpload, onRemove }) {
  const [componentPicker, setComponentPicker] = useState(false);
  const [componentList, setComponentList] = useState([]);

  // Lazy-load component packs on first open of picker
  const openComponentPicker = async () => {
    if (componentList.length === 0) {
      const { listComponentPacks } = await import('../../utils/componentPackStore');
      setComponentList(await listComponentPacks());
    }
    setComponentPicker(true);
  };

  const addFromComponent = async (compId) => {
    const { getComponentPack } = await import('../../utils/componentPackStore');
    const full = await getComponentPack(compId);
    if (!full) return;
    const c = full.data || {};
    const newRow = {
      component: c.componentCategory || '',
      type: c.componentName || '',
      material: c.material || c.composition || '',
      color: c.frColor || '',
      weight: c.weight || '',
      supplier: c.supplier || '',
      supplierContact: c.supplierContact || c.supplierEmail || '',
      costPerUnit: c.costPerUnit || '',
      notes: (c.hex ? `Hex: ${c.hex}` : '') + (c.dyeMethod ? (c.hex ? ' · ' : '') + c.dyeMethod : ''),
      componentPackId: compId,
    };
    set('bom', [...bom, newRow]);
    setComponentPicker(false);
  };

  // Unified BOM — migrate old tech packs that had separate trims/shellFabric
  const bom = data.bom || (data.trims
    ? [
        ...(data.shellFabric ? [{ component: 'Fabric', type: data.shellFabric, material: data.shellComposition || '', color: '', weight: data.shellWeight || '', supplier: '', supplierContact: '', costPerUnit: '', notes: '' }] : []),
        ...data.trims.map(t => ({ ...t, weight: '', supplier: '', supplierContact: '', costPerUnit: '' })),
      ]
    : [{ component: '', type: '', material: '', color: '', weight: '', supplier: '', supplierContact: '', costPerUnit: '', notes: '' }]);

  const updateBom = (i, k, v) => { const b = [...bom]; b[i] = { ...b[i], [k]: v }; set('bom', b); };
  const addBom = () => set('bom', [...bom, { component: '', type: '', material: '', color: '', weight: '', supplier: '', supplierContact: '', costPerUnit: '', notes: '' }]);
  const removeBom = (i) => set('bom', bom.filter((_, idx) => idx !== i));

  const saveBomToLib = (item) => {
    if (!item.component && !item.type) return;
    const lib = library.bom || [];
    const exists = lib.some(b => b.component === item.component && b.type === item.type && b.material === item.material);
    if (!exists) saveToLibrary('bom', item);
  };

  const libCount = (library.bom || []).length + (library.trims || []).length;

  const componentRender = (val, onChange) => (
    <select value={val || ''} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, padding: '3px 0', color: FR.slate, fontFamily: "'Helvetica Neue',sans-serif" }}>
      <option value="">Select...</option>
      {BOM_COMPONENT_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
    </select>
  );

  const colorRender = (val, onChange) => <FRColorCell value={val} onChange={onChange} />;

  return (
    <div>
      <SectionTitle>Bill of Materials</SectionTitle>
      <p style={{ fontSize: 11, color: FR.stone, marginBottom: 12, lineHeight: 1.5 }}>
        All fabrics, trims, and accessories for this garment. Add supplier info so automations can contact them for samples and POs.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap', position: 'relative' }}>
        <button onClick={openComponentPicker}
          style={{ padding: '5px 12px', background: FR.slate, border: 'none', borderRadius: 3, fontSize: 11, color: FR.salt, cursor: 'pointer' }}>
          ◆ Pick from Component Pack
        </button>
        <LibraryPicker category="bom" library={library} buttonLabel={`★ From Library (${libCount})`}
          onSelect={item => set('bom', [...bom, { ...item }])} />
        {(library.trims || []).length > 0 && (
          <LibraryPicker category="trims" library={library} buttonLabel={`★ Legacy Trims (${library.trims.length})`}
            onSelect={item => set('bom', [...bom, { ...item, weight: '', supplier: '', supplierContact: '', costPerUnit: '' }])} />
        )}

        {componentPicker && (
          <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: 'white', border: `1px solid ${FR.sand}`, borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 300, overflowY: 'auto', minWidth: 320, marginTop: 4 }}>
            <div style={{ padding: '8px 12px', background: FR.salt, fontSize: 10, color: FR.stone, display: 'flex', justifyContent: 'space-between' }}>
              <span>Select a Component Pack ({componentList.length})</span>
              <button onClick={() => setComponentPicker(false)} style={{ background: 'none', border: 'none', color: FR.stone, cursor: 'pointer', fontSize: 12 }}>×</button>
            </div>
            {componentList.length === 0 ? (
              <div style={{ padding: 14, fontSize: 11, color: FR.stone, textAlign: 'center' }}>
                No Component Packs yet. Create one in the PLM → Components tab.
              </div>
            ) : componentList.map(c => (
              <button key={c.id} onClick={() => addFromComponent(c.id)}
                style={{ display: 'block', width: '100%', padding: '8px 12px', border: 'none', borderBottom: `1px solid ${FR.sand}`, background: 'white', cursor: 'pointer', textAlign: 'left', fontSize: 11, color: FR.slate }}>
                <strong>{c.component_name || 'Untitled'}</strong>
                <span style={{ color: FR.stone, marginLeft: 6 }}>
                  {c.component_category} {c.supplier ? `· ${c.supplier}` : ''} {c.cost_per_unit ? `· ${c.currency || 'USD'} ${c.cost_per_unit}` : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <ArrayTable
        headers={[
          { key: 'component', label: 'Component', render: componentRender },
          { key: 'type', label: 'Type / Spec', placeholder: 'e.g. YKK #5 Coil' },
          { key: 'material', label: 'Material', placeholder: 'e.g. 100% Cotton' },
          { key: 'color', label: 'Color', render: colorRender },
          { key: 'weight', label: 'Weight / GSM', placeholder: '400' },
          { key: 'supplier', label: 'Supplier', placeholder: 'Name' },
          { key: 'supplierContact', label: 'Contact', placeholder: 'Email / WeChat' },
          { key: 'costPerUnit', label: 'Cost/Unit', placeholder: '$' },
          { key: 'notes', label: 'Notes', placeholder: '' },
        ]}
        rows={bom} onUpdate={updateBom} onAdd={addBom} onRemove={removeBom} />

      {bom.some(b => b.component || b.type) && (
        <div style={{ marginTop: 4, marginBottom: 8 }}>
          <button onClick={() => bom.forEach(b => saveBomToLib(b))}
            style={{ padding: '5px 14px', background: FR.soil, border: 'none', borderRadius: 3, fontSize: 10, color: FR.salt, cursor: 'pointer' }}>
            Save all to library
          </button>
          <span style={{ fontSize: 9, color: FR.stone, marginLeft: 8 }}>Duplicates are skipped automatically</span>
        </div>
      )}

      <PhotoUpload label="Material Samples / Supplier References" slotKey="bom-refs" images={images} onUpload={onUpload} onRemove={onRemove} />
    </div>
  );
}

export function StepColor({ data, set, images, onUpload, onRemove }) {
  const updateCW = (i, k, v) => {
    const c = [...data.colorways]; c[i] = { ...c[i], [k]: v };
    if (k === 'frColor') {
      const match = FR_COLOR_OPTIONS.find(fc => fc.name === v);
      if (match) c[i].hex = match.hex;
    }
    set('colorways', c);
  };
  const addCW = () => set('colorways', [...data.colorways, { name: '', frColor: '', pantone: '', hex: '' }]);
  const removeCW = (i) => set('colorways', data.colorways.filter((_, idx) => idx !== i));
  const frColorRender = (val, onChange) => <FRColorCell value={val} onChange={onChange} />;
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
      <ArrayTable
        headers={[
          { key: 'name', label: 'Colorway Name', placeholder: 'e.g. Slate Wash' },
          { key: 'frColor', label: 'FR Color', render: frColorRender },
          { key: 'pantone', label: 'Pantone Ref', placeholder: '' },
          { key: 'hex', label: 'HEX', placeholder: '#3A3A3A' },
        ]}
        rows={data.colorways} onUpdate={updateCW} onAdd={addCW} onRemove={removeCW} />
      <h4 style={{ fontSize: 12, color: FR.slate, margin: '16px 0 8px', fontWeight: 600 }}>Logo Placement</h4>
      <Row cols="1fr 1fr 1fr">
        <Select label="Front Logo" value={data.logoFront} onChange={v => set('logoFront', v)}
          options={['Snowflake Emblem Center Chest', 'Snowflake Left Chest', 'None', 'Custom']} />
        <Select label="Back Logo" value={data.logoBack} onChange={v => set('logoBack', v)}
          options={['FOREIGN RESOURCE Wordmark Upper Back', 'None', 'Custom']} />
        <Select label="Method" value={data.logoMethod} onChange={v => set('logoMethod', v)}
          options={['Tonal Embroidery', 'Puff Print', 'Screen Print', 'Heat Transfer', 'Woven Patch']} />
      </Row>
      <PhotoUpload label="Artwork Files / Placement References" slotKey="artwork" images={images} onUpload={onUpload} onRemove={onRemove} />
    </div>
  );
}

export function StepConstruction({ data, set, images, onUpload, onRemove }) {
  const updateSeam = (i, k, v) => { const s = [...data.seams]; s[i] = { ...s[i], [k]: v }; set('seams', s); };
  const addSeam = () => set('seams', [...data.seams, { operation: '', seamType: '', stitchType: '', spiSpcm: '', threadColor: '', notes: '' }]);
  const removeSeam = (i) => set('seams', data.seams.filter((_, idx) => idx !== i));
  return (
    <div>
      <SectionTitle>Construction Details</SectionTitle>
      <ArrayTable
        headers={[
          { key: 'operation', label: 'Operation', placeholder: 'Side seam' },
          { key: 'seamType', label: 'Seam Type', placeholder: 'Flatlock' },
          { key: 'stitchType', label: 'Stitch', placeholder: '301' },
          { key: 'spiSpcm', label: 'SPI', placeholder: '' },
          { key: 'threadColor', label: 'Thread', placeholder: '' },
          { key: 'notes', label: 'Notes' },
        ]}
        rows={data.seams} onUpdate={updateSeam} onAdd={addSeam} onRemove={removeSeam} />
      <Input label="Construction Notes" value={data.constructionNotes} onChange={v => set('constructionNotes', v)} multiline />
      <PhotoUpload label="Construction Detail Sketches" slotKey="construction-sketches" images={images} onUpload={onUpload} onRemove={onRemove} />
    </div>
  );
}

export function StepPattern({ data, set, images, onUpload, onRemove }) {
  const updatePP = (i, k, v) => { const p = [...data.patternPieces]; p[i] = { ...p[i], [k]: v }; set('patternPieces', p); };
  const addPP = () => set('patternPieces', [...data.patternPieces, { name: '', qty: '', fabric: '', grain: '', fusing: '', notes: '' }]);
  const removePP = (i) => set('patternPieces', data.patternPieces.filter((_, idx) => idx !== i));
  return (
    <div>
      <SectionTitle>Pattern Pieces & Cutting</SectionTitle>
      <PhotoUpload label="Pattern Piece Layouts" slotKey="pattern-layout" images={images} onUpload={onUpload} onRemove={onRemove} />
      <ArrayTable
        headers={[
          { key: 'name', label: 'Piece Name', placeholder: 'Front Body' },
          { key: 'qty', label: 'Qty', placeholder: '2' },
          { key: 'fabric', label: 'Fabric', placeholder: 'Shell' },
          { key: 'grain', label: 'Grain', placeholder: 'Lengthwise' },
          { key: 'fusing', label: 'Fusing', placeholder: 'None' },
          { key: 'notes', label: 'Notes' },
        ]}
        rows={data.patternPieces} onUpdate={updatePP} onAdd={addPP} onRemove={removePP} />
      <Input label="Cutting Notes" value={data.cuttingNotes} onChange={v => set('cuttingNotes', v)} multiline />
    </div>
  );
}

export function StepPom({ data, set, images, onUpload, onRemove }) {
  const updatePom = (i, k, v) => { const p = [...data.poms]; p[i] = { ...p[i], [k]: v }; set('poms', p); };
  const addPom = () => set('poms', [...data.poms, { name: '', tol: '1', s: '', m: '', l: '', xl: '' }]);
  const removePom = (i) => set('poms', data.poms.filter((_, idx) => idx !== i));
  const szH = data.sizeType === 'waist'
    ? [{ key: 's', label: 'W30' }, { key: 'm', label: 'W32' }, { key: 'l', label: 'W34' }, { key: 'xl', label: 'W36' }]
    : [{ key: 's', label: 'S' }, { key: 'm', label: 'M' }, { key: 'l', label: 'L' }, { key: 'xl', label: 'XL' }];
  return (
    <div>
      <SectionTitle>Points of Measure (cm)</SectionTitle>
      <Select label="Size Type" value={data.sizeType} onChange={v => set('sizeType', v)} options={['apparel', 'waist', 'one-size']} />
      <PhotoUpload label="POM Diagram" slotKey="pom-diagram" images={images} onUpload={onUpload} onRemove={onRemove} />
      {data.sizeType !== 'one-size' && (
        <ArrayTable
          headers={[{ key: 'name', label: 'Measurement', placeholder: 'Chest Width' }, { key: 'tol', label: 'Tol ±', placeholder: '1' }, ...szH]}
          rows={data.poms} onUpdate={updatePom} onAdd={addPom} onRemove={removePom} />
      )}
    </div>
  );
}

export function StepTreatments({ data, set, images, onUpload, onRemove }) {
  const updateT = (i, k, v) => { const t = [...data.treatments]; t[i] = { ...t[i], [k]: v }; set('treatments', t); };
  const addT = () => set('treatments', [...data.treatments, { treatment: '', process: '', temp: '', duration: '', chemicals: '', notes: '' }]);
  const removeT = (i) => set('treatments', data.treatments.filter((_, idx) => idx !== i));
  const updateD = (i, k, v) => { const d = [...data.distressing]; d[i] = { ...d[i], [k]: v }; set('distressing', d); };
  const addD = () => set('distressing', [...data.distressing, { area: '', technique: '', intensity: '', notes: '' }]);
  const removeD = (i) => set('distressing', data.distressing.filter((_, idx) => idx !== i));
  return (
    <div>
      <SectionTitle>Garment Treatments</SectionTitle>
      <h4 style={{ fontSize: 12, color: FR.slate, margin: '8px 0', fontWeight: 600 }}>Wash & Dye</h4>
      <ArrayTable
        headers={[
          { key: 'treatment', label: 'Treatment', placeholder: 'Acid Wash' },
          { key: 'process', label: 'Process' },
          { key: 'temp', label: 'Temp', placeholder: '°C' },
          { key: 'duration', label: 'Duration', placeholder: 'min' },
          { key: 'chemicals', label: 'Chemicals' },
          { key: 'notes', label: 'Notes' },
        ]}
        rows={data.treatments} onUpdate={updateT} onAdd={addT} onRemove={removeT} />
      <h4 style={{ fontSize: 12, color: FR.slate, margin: '16px 0 8px', fontWeight: 600 }}>Distressing</h4>
      <ArrayTable
        headers={[
          { key: 'area', label: 'Area', placeholder: 'Front pocket' },
          { key: 'technique', label: 'Technique', placeholder: 'Sandblast' },
          { key: 'intensity', label: 'Intensity (1-5)', placeholder: '3' },
          { key: 'notes', label: 'Notes' },
        ]}
        rows={data.distressing} onUpdate={updateD} onAdd={addD} onRemove={removeD} />
      <PhotoUpload label="Before / After References" slotKey="treatment-refs" images={images} onUpload={onUpload} onRemove={onRemove} />
    </div>
  );
}

export function StepLabels({ data, set, images, onUpload, onRemove }) {
  const locked = isStepLocked(11, data.status);
  return (
    <div>
      <SectionTitle>Labels & Packaging</SectionTitle>
      {locked && <LockedBanner status={data.status} />}
      <fieldset disabled={locked} style={{ border: 'none', padding: 0, margin: 0, opacity: locked ? 0.45 : 1, pointerEvents: locked ? 'none' : 'auto' }}>
        <PhotoUpload label="Label Artwork (care, main, size)" slotKey="label-artwork" images={images} onUpload={onUpload} onRemove={onRemove} />
        <Input label="Care Instructions" value={data.careInstructions} onChange={v => set('careInstructions', v)} multiline />
        <Select label="Packaging" value={data.packaging} onChange={v => set('packaging', v)} options={['Standard FR Packaging', 'Custom', 'Minimal']} />
        {data.packaging === 'Standard FR Packaging' && (
          <div style={{ padding: 12, background: FR.salt, borderRadius: 4, fontSize: 11, color: FR.stone, marginBottom: 12, lineHeight: 1.6 }}>
            Matte Slate poly mailer + Sand dust bag + Salt hang tag + tissue + sticker
          </div>
        )}
        <Input label="Packaging Notes" value={data.packagingNotes} onChange={v => set('packagingNotes', v)} multiline />
      </fieldset>
    </div>
  );
}

export function StepOrder({ data, set, library, saveToLibrary }) {
  const locked = isStepLocked(12, data.status);
  const [unitWeightG, setUnitWeightG] = useState(data.unitWeightGrams || '500');
  const [aiKey, setAiKey] = useState(getStoredKey());
  const [aiNotes, setAiNotes] = useState('');
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState('');

  const updateQ = (i, k, v) => { const q = [...data.quantities]; q[i] = { ...q[i], [k]: v }; set('quantities', q); };
  const addQ = () => set('quantities', [...data.quantities, { colorway: '', s: '', m: '', l: '', xl: '', unitCost: '' }]);
  const removeQ = (i) => set('quantities', data.quantities.filter((_, idx) => idx !== i));
  const updateC = (i, k, v) => { const c = [...data.cartons]; c[i] = { ...c[i], [k]: v }; set('cartons', c); };
  const addC = () => set('cartons', [...data.cartons, { cartonNum: '', colorway: '', sizeBreakdown: '', qtyPerCarton: '', dims: '', grossWeight: '', netWeight: '' }]);
  const removeC = (i) => set('cartons', data.cartons.filter((_, idx) => idx !== i));

  const cwOptions = data.colorways.filter(c => c.name).map(c => c.name);
  const cwRender = (val, onChange) => (
    <select value={val || ''} onChange={e => onChange(e.target.value)} style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, color: FR.slate, fontFamily: "'Helvetica Neue',sans-serif" }}>
      <option value="">Select…</option>
      {cwOptions.map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  );

  const addLocation = (val) => saveToLibrary && saveToLibrary('locations', val);

  async function runAIPackingList() {
    setAiRunning(true);
    setAiError('');
    try {
      if (aiKey) saveKey(aiKey);
      const cartons = await generatePackingList({
        apiKey: aiKey,
        styleName: data.styleName,
        productCategory: data.productCategory,
        quantities: data.quantities,
        unitWeightGrams: parseFloat(unitWeightG) || 500,
        shipMethod: data.shipMethod,
        notes: aiNotes,
      });
      set('cartons', cartons);
      set('unitWeightGrams', unitWeightG);
    } catch (err) {
      setAiError(err.message);
    }
    setAiRunning(false);
  }

  return (
    <div>
      <SectionTitle>Order & Delivery</SectionTitle>
      {locked && <LockedBanner status={data.status} />}
      <fieldset disabled={locked} style={{ border: 'none', padding: 0, margin: 0, opacity: locked ? 0.45 : 1, pointerEvents: locked ? 'none' : 'auto' }}>
        <h4 style={{ fontSize: 12, color: FR.slate, margin: '8px 0', fontWeight: 600 }}>Quantity Per Size</h4>
        <ArrayTable
          headers={[
            { key: 'colorway', label: 'Colorway', render: cwOptions.length > 0 ? cwRender : undefined, placeholder: 'Slate Wash' },
            { key: 's', label: 'S', placeholder: '0' },
            { key: 'm', label: 'M', placeholder: '0' },
            { key: 'l', label: 'L', placeholder: '0' },
            { key: 'xl', label: 'XL', placeholder: '0' },
            { key: 'unitCost', label: 'Unit $', placeholder: '$' },
          ]}
          rows={data.quantities} onUpdate={updateQ} onAdd={addQ} onRemove={removeQ} />

        <h4 style={{ fontSize: 12, color: FR.slate, margin: '16px 0 8px', fontWeight: 600 }}>Delivery Details</h4>
        <Row>
          <EditableSelect label="Ship To (Address)" value={data.shipTo} onChange={v => set('shipTo', v)}
            options={(library && library.locations) || []} onAddOption={addLocation}
            placeholder="New ship-to address…" />
          <EditableSelect label="Delivery Location / Warehouse" value={data.deliveryLocation} onChange={v => set('deliveryLocation', v)}
            options={(library && library.locations) || []} onAddOption={addLocation}
            placeholder="New warehouse…" />
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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0 8px' }}>
          <h4 style={{ fontSize: 12, color: FR.slate, margin: 0, fontWeight: 600 }}>Packing List</h4>
          <div style={{ fontSize: 10, color: FR.stone }}>AI will distribute units across cartons based on weight + ship method</div>
        </div>

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
            { key: 'cartonNum', label: '#', placeholder: '1' },
            { key: 'colorway', label: 'Colorway' },
            { key: 'sizeBreakdown', label: 'Size Breakdown', placeholder: 'S:10 M:20 L:15 XL:5' },
            { key: 'qtyPerCarton', label: 'Qty', placeholder: '50' },
            { key: 'dims', label: 'Dims (cm)', placeholder: '60x40x30' },
            { key: 'grossWeight', label: 'Gross kg' },
            { key: 'netWeight', label: 'Net kg' },
          ]}
          rows={data.cartons} onUpdate={updateC} onAdd={addC} onRemove={removeC} />
      </fieldset>
    </div>
  );
}

export function StepReview({ data, images, library, onSubmit, submitting, submitResult }) {
  const pct = computeCompletion(data);
  const imgCount = (images || []).length;
  const libCount = (library.trims || []).length + (library.fabrics || []).length + (library.labels || []).length;
  return (
    <div>
      <SectionTitle>Review & Export</SectionTitle>
      <div style={{ padding: 20, background: FR.salt, borderRadius: 6, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: FR.slate, fontWeight: 600, marginBottom: 8 }}>
          Completion: {pct}% · {imgCount} photo{imgCount !== 1 ? 's' : ''} · {libCount} library items
        </div>
        <div style={{ width: '100%', height: 6, background: FR.sand, borderRadius: 3 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: FR.soil, borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
      </div>
      <div style={{ fontSize: 12, color: FR.stone, lineHeight: 1.8 }}>
        <p><strong>Style:</strong> {data.styleName || '—'} ({data.productCategory || '—'})</p>
        <p><strong>Tier:</strong> {data.productTier || '—'} / <strong>Season:</strong> {data.season || '—'}</p>
        <p><strong>Factory:</strong> {data.factory || '—'}</p>
        <p><strong>Colorways:</strong> {data.colorways.filter(c => c.name).map(c => `${c.name} (${c.frColor})`).join(', ') || '—'}</p>
        <p><strong>Retail:</strong> {data.targetRetail || '—'} / <strong>FOB:</strong> {data.targetFOB || '—'}</p>
      </div>
      <div style={{ marginTop: 20, padding: 16, border: `2px solid ${FR.soil}`, borderRadius: 6, background: FR.white }}>
        <div style={{ fontSize: 13, color: FR.slate, fontWeight: 600, marginBottom: 6 }}>Generate & Download</div>
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

export const STEP_FNS = [StepIdentity, StepSku, StepFactory, StepDesign, StepFlatlays, StepMaterials, StepColor, StepConstruction, StepPattern, StepPom, StepTreatments, StepLabels, StepOrder, StepReview];
