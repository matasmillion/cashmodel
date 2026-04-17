// Component Pack Builder — spec sheet for individual BOM items
// Simpler than tech pack: single scrollable form with collapsible sections

import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { FR, STATUSES, BOM_COMPONENT_OPTIONS, CURRENCIES, DYE_METHODS, CERTIFICATIONS, DEFAULT_COMPONENT_DATA } from './componentPackConstants';
import { FR_COLOR_OPTIONS } from './techPackConstants';
import { Input, Select, Row, SectionTitle, ArrayTable, PhotoUpload } from './TechPackPrimitives';
import { saveComponentPack } from '../../utils/componentPackStore';

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: 'white', border: `1px solid ${FR.sand}`, borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '12px 16px', background: FR.salt, border: 'none', cursor: 'pointer', fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: FR.slate, fontWeight: 400 }}>
        <span>{title}</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && <div style={{ padding: 16 }}>{children}</div>}
    </div>
  );
}

export default function ComponentPackBuilder({ pack, onBack }) {
  const [data, setData] = useState(pack.data || DEFAULT_COMPONENT_DATA);
  const [images, setImages] = useState(pack.images || []);
  const [saving, setSaving] = useState(false);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await saveComponentPack(pack.id, {
          data, images,
          component_name: data.componentName || '',
          component_category: data.componentCategory || '',
          status: data.status || 'Design',
          supplier: data.supplier || '',
          cost_per_unit: data.costPerUnit || '',
          currency: data.currency || 'USD',
        });
      } catch (err) { console.error(err); }
      setTimeout(() => setSaving(false), 300);
    }, 600);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [data, images, pack.id]);

  const set = useCallback((k, v) => setData(p => ({ ...p, [k]: v })), []);

  const handleImgUpload = useCallback((slot, b64, name) =>
    setImages(p => [...p, { slot, data: b64, name }]), []);
  const handleImgRemove = useCallback((slot, idx) => {
    setImages(p => {
      let c = 0;
      return p.filter(img => {
        if (img.slot === slot) { if (c === idx) { c++; return false; } c++; }
        return true;
      });
    });
  }, []);

  // Price breaks table
  const updatePB = (i, k, v) => { const b = [...data.priceBreaks]; b[i] = { ...b[i], [k]: v }; set('priceBreaks', b); };
  const addPB = () => set('priceBreaks', [...data.priceBreaks, { qty: '', price: '' }]);
  const removePB = (i) => set('priceBreaks', data.priceBreaks.filter((_, idx) => idx !== i));

  // Certifications checkboxes
  const toggleCert = (cert) => {
    const current = data.certifications || [];
    if (current.includes(cert)) set('certifications', current.filter(c => c !== cert));
    else set('certifications', [...current, cert]);
  };

  // Auto-fill hex from FR color
  const pickFRColor = (colorName) => {
    set('frColor', colorName);
    const match = FR_COLOR_OPTIONS.find(c => c.name === colorName);
    if (match) set('hex', match.hex);
  };

  return (
    <div style={{ background: FR.salt, borderRadius: 8, overflow: 'hidden', border: `1px solid ${FR.sand}` }}>
      <div style={{ background: FR.slate, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: FR.salt, padding: '5px 10px', borderRadius: 3, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <ArrowLeft size={12} /> Back to Components
          </button>
          <div>
            <div style={{ color: FR.salt, fontSize: 9, letterSpacing: 3, fontWeight: 600 }}>F R · C O M P O N E N T  P A C K</div>
            <div style={{ fontFamily: "'Cormorant Garamond','Georgia',serif", color: FR.salt, fontSize: 16, marginTop: 2 }}>
              {data.componentName || 'New Component'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saving && <span style={{ fontSize: 10, color: FR.sage }}>Saving…</span>}
          <span style={{ fontSize: 9, color: FR.stone }}>{data.componentCategory || '—'}</span>
        </div>
      </div>

      <div style={{ padding: 20, maxHeight: '75vh', overflowY: 'auto' }}>
        <Section title="Identity & Classification">
          <Row>
            <Input label="Component Name" value={data.componentName} onChange={v => set('componentName', v)} placeholder="e.g. YKK #5 Coil Zipper - Slate" />
            <Select label="Category" value={data.componentCategory} onChange={v => set('componentCategory', v)} options={BOM_COMPONENT_OPTIONS} />
          </Row>
          <Row cols="1fr 1fr 1fr">
            <Input label="Component Number" value={data.componentNumber} onChange={v => set('componentNumber', v)} placeholder="e.g. FR-ZIP-001" />
            <Select label="Status" value={data.status} onChange={v => set('status', v)} options={STATUSES} />
            <Input label="Season" value={data.season} onChange={v => set('season', v)} placeholder="Core / SS26 / FW26" />
          </Row>
        </Section>

        <Section title="Supplier">
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
        </Section>

        <Section title="Specifications">
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
        </Section>

        <Section title="Color">
          <Row cols="1fr 1fr 1fr">
            <Select label="FR Color" value={data.frColor} onChange={pickFRColor} options={FR_COLOR_OPTIONS.map(c => c.name)} />
            <Input label="Custom Color Name" value={data.customColorName} onChange={v => set('customColorName', v)} placeholder="Non-FR palette" />
            <Select label="Dye Method" value={data.dyeMethod} onChange={v => set('dyeMethod', v)} options={DYE_METHODS} />
          </Row>
          <Row>
            <Input label="Pantone" value={data.pantone} onChange={v => set('pantone', v)} placeholder="Pantone 19-4305" />
            <Input label="Hex" value={data.hex} onChange={v => set('hex', v)} placeholder="#3A3A3A" />
          </Row>
        </Section>

        <Section title="Cost & Pricing">
          <Row cols="1fr 1fr">
            <Input label="Cost per Unit" value={data.costPerUnit} onChange={v => set('costPerUnit', v)} placeholder="0.85" />
            <Select label="Currency" value={data.currency} onChange={v => set('currency', v)} options={CURRENCIES} />
          </Row>
          <div style={{ marginTop: 8 }}>
            <label style={{ display: 'block', fontSize: 10, color: FR.soil, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>Price Breaks</label>
            <ArrayTable
              headers={[
                { key: 'qty', label: 'Min Qty', placeholder: '1000' },
                { key: 'price', label: `Price (${data.currency})`, placeholder: '0.80' },
              ]}
              rows={data.priceBreaks} onUpdate={updatePB} onAdd={addPB} onRemove={removePB} />
          </div>
        </Section>

        <Section title="Compliance" defaultOpen={false}>
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
        </Section>

        <Section title="Reference Images">
          <PhotoUpload label="Product Photos" slotKey="component-photo" images={images} onUpload={handleImgUpload} onRemove={handleImgRemove} />
          <PhotoUpload label="Swatch / Sample Photos" slotKey="component-swatch" images={images} onUpload={handleImgUpload} onRemove={handleImgRemove} />
          <PhotoUpload label="Spec Sheet / Tech Drawing" slotKey="component-spec" images={images} onUpload={handleImgUpload} onRemove={handleImgRemove} />
        </Section>

        <Section title="Notes" defaultOpen={false}>
          <Input value={data.notes} onChange={v => set('notes', v)} multiline placeholder="Anything else worth remembering about this component…" />
        </Section>
      </div>
    </div>
  );
}
