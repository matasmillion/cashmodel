import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "fr-techpack-data";
const IMG_KEY = "fr-tp-img:all";
const LIB_KEY = "fr-tp-library";

const COLORS = {
  slate: "#3A3A3A", salt: "#F5F0E8", sand: "#EBE5D5", stone: "#716F70",
  soil: "#9A816B", sea: "#B5C7D3", sage: "#ADBDA3", sienna: "#D4956A", white: "#FFFFFF",
};

const FR_COLOR_OPTIONS = [
  { name: "Slate", hex: "#3A3A3A" }, { name: "Salt", hex: "#F5F0E8" }, { name: "Sand", hex: "#EBE5D5" },
  { name: "Stone", hex: "#716F70" }, { name: "Soil", hex: "#9A816B" }, { name: "Sea", hex: "#B5C7D3" },
  { name: "Sage", hex: "#ADBDA3" }, { name: "Sienna", hex: "#D4956A" },
];

const DEFAULT_LIBRARY = { fabrics: [], trims: [], labels: [] };

const STEPS = [
  { id: "identity", title: "Identity & Classification", icon: "01" },
  { id: "sku", title: "SKU & Numbering", icon: "02" },
  { id: "factory", title: "Factory Assignment", icon: "03" },
  { id: "design", title: "Design & Construction", icon: "04" },
  { id: "flatlays", title: "Flat Lay Diagrams", icon: "05" },
  { id: "materials", title: "Materials & BOM", icon: "06" },
  { id: "color", title: "Color & Artwork", icon: "07" },
  { id: "construction", title: "Construction Details", icon: "08" },
  { id: "pattern", title: "Pattern & Cutting", icon: "09" },
  { id: "pom", title: "Points of Measure", icon: "10" },
  { id: "treatments", title: "Garment Treatments", icon: "11" },
  { id: "labels", title: "Labels & Packaging", icon: "12" },
  { id: "order", title: "Order & Delivery", icon: "13" },
  { id: "review", title: "Review & Export", icon: "14" },
];

const DEFAULT_DATA = {
  styleName: "", productCategory: "", productTier: "", season: "", targetRetail: "", targetFOB: "", status: "Development",
  styleNumber: "", skuPrefix: "", barcodeMethod: "Shopify Retail Barcode Labels",
  factory: "", factoryContact: "", fabricType: "",
  designNotes: "", fit: "", keyFeatures: "", flatLayNotes: "",
  shellFabric: "", shellWeight: "", shellComposition: "", ribComposition: "",
  trims: [{ component: "", type: "", material: "", color: "", notes: "" }],
  colorways: [{ name: "", frColor: "Slate", pantone: "", hex: "#3A3A3A" }],
  logoFront: "", logoBack: "", logoMethod: "",
  seams: [{ operation: "", seamType: "", stitchType: "", spiSpcm: "", threadColor: "", notes: "" }],
  constructionNotes: "",
  patternPieces: [{ name: "", qty: "", fabric: "", grain: "", fusing: "", notes: "" }],
  cuttingNotes: "",
  poms: [
    { name: "Chest Width (1/2)", tol: "1", s: "", m: "", l: "", xl: "" },
    { name: "Body Length (HPS)", tol: "1", s: "", m: "", l: "", xl: "" },
    { name: "Shoulder Width", tol: "1", s: "", m: "", l: "", xl: "" },
    { name: "Sleeve Length", tol: "1", s: "", m: "", l: "", xl: "" },
    { name: "Sleeve Opening", tol: "0.5", s: "", m: "", l: "", xl: "" },
    { name: "Hem Width (1/2)", tol: "1", s: "", m: "", l: "", xl: "" },
    { name: "Armhole", tol: "1", s: "", m: "", l: "", xl: "" },
    { name: "Cuff Width", tol: "0.5", s: "", m: "", l: "", xl: "" },
  ],
  sizeType: "apparel",
  treatments: [{ treatment: "", process: "", temp: "", duration: "", chemicals: "", notes: "" }],
  distressing: [{ area: "", technique: "", intensity: "", notes: "" }],
  careInstructions: "Machine wash cold, inside out\nTumble dry low\nDo not bleach\nIron low if needed\nDo not dry clean",
  packaging: "Standard FR Packaging", packagingNotes: "",
  quantities: [{ colorway: "", s: "", m: "", l: "", xl: "", unitCost: "" }],
  shipTo: "", deliveryLocation: "", shipMethod: "", incoterm: "FOB", targetShipDate: "", targetArrivalDate: "", freightForwarder: "", specialInstructions: "",
  cartons: [{ cartonNum: "", colorway: "", sizeBreakdown: "", qtyPerCarton: "", dims: "", grossWeight: "", netWeight: "" }],
};

// ─── Helpers ───
function resizeImage(file, maxW = 1200) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > maxW) { h = (maxW / w) * h; w = maxW; }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Reusable UI ───
const labelStyle = { display: "block", fontSize: 10, color: COLORS.soil, fontWeight: 600, marginBottom: 3, letterSpacing: 0.5, textTransform: "uppercase" };
const inputBase = { width: "100%", padding: "8px 10px", border: `1px solid ${COLORS.sand}`, borderRadius: 3, fontFamily: "'Helvetica Neue', sans-serif", fontSize: 13, color: COLORS.slate, background: COLORS.white, outline: "none", boxSizing: "border-box" };

function Input({ label, value, onChange, placeholder, multiline }) {
  const props = { value, onChange: e => onChange(e.target.value), placeholder, style: inputBase, onFocus: e => e.target.style.borderColor = COLORS.soil, onBlur: e => e.target.style.borderColor = COLORS.sand };
  return (<div style={{ marginBottom: 10 }}>
    {label && <label style={labelStyle}>{label}</label>}
    {multiline ? <textarea {...props} rows={4} style={{ ...inputBase, resize: "vertical", minHeight: 60 }} /> : <input {...props} />}
  </div>);
}
function Select({ label, value, onChange, options }) {
  return (<div style={{ marginBottom: 10 }}>
    {label && <label style={labelStyle}>{label}</label>}
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputBase }}><option value="">Select...</option>{options.map(o => <option key={o} value={o}>{o}</option>)}</select>
  </div>);
}
function Row({ children, cols }) { return <div style={{ display: "grid", gridTemplateColumns: cols || "1fr 1fr", gap: 12 }}>{children}</div>; }
function SectionTitle({ children }) {
  return (<div style={{ marginBottom: 16, marginTop: 8 }}><h3 style={{ fontFamily: "'Cormorant Garamond','Georgia',serif", fontSize: 20, fontWeight: 400, color: COLORS.slate, margin: 0, marginBottom: 4 }}>{children}</h3><div style={{ width: 50, height: 2, background: COLORS.soil }}></div></div>);
}

function ArrayTable({ headers, rows, onUpdate, onAdd, onRemove }) {
  return (<div style={{ marginBottom: 12, overflowX: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
      <thead><tr>{headers.map(h => <th key={h.key} style={{ textAlign: "left", padding: "5px 6px", background: COLORS.slate, color: COLORS.salt, fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h.label}</th>)}<th style={{ width: 30, background: COLORS.slate }}></th></tr></thead>
      <tbody>{rows.map((row, ri) => (
        <tr key={ri} style={{ background: ri % 2 === 0 ? COLORS.salt : COLORS.white }}>
          {headers.map(h => (<td key={h.key} style={{ padding: "3px 4px", borderBottom: `1px solid ${COLORS.sand}` }}>
            {h.render ? h.render(row[h.key], v => onUpdate(ri, h.key, v), row) :
              <input value={row[h.key] || ""} onChange={e => onUpdate(ri, h.key, e.target.value)} placeholder={h.placeholder || ""}
                style={{ width: "100%", border: "none", background: "transparent", fontSize: 11, padding: "3px 2px", color: COLORS.slate, outline: "none", fontFamily: "'Helvetica Neue',sans-serif", boxSizing: "border-box" }} />}
          </td>))}
          <td style={{ padding: "3px", borderBottom: `1px solid ${COLORS.sand}`, textAlign: "center" }}>
            {rows.length > 1 && <button onClick={() => onRemove(ri)} style={{ background: "none", border: "none", color: COLORS.stone, cursor: "pointer", fontSize: 13 }}>{"\u00D7"}</button>}
          </td>
        </tr>
      ))}</tbody>
    </table>
    <button onClick={onAdd} style={{ marginTop: 6, padding: "4px 12px", background: "none", border: `1px solid ${COLORS.sand}`, borderRadius: 3, fontSize: 10, color: COLORS.soil, cursor: "pointer" }}>+ Add Row</button>
  </div>);
}

// ─── Photo Upload ───
function PhotoUpload({ label, slotKey, images, onUpload, onRemove }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const handleFiles = async (files) => { for (const f of files) { if (!f.type.startsWith("image/")) continue; onUpload(slotKey, await resizeImage(f), f.name); } };
  const slotImages = (images || []).filter(img => img.slot === slotKey);
  return (<div style={{ marginBottom: 14 }}>
    <label style={labelStyle}>{label}</label>
    <div onClick={() => fileRef.current?.click()} onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
      style={{ border: `2px dashed ${dragging ? COLORS.soil : COLORS.sand}`, borderRadius: 6, padding: slotImages.length ? 10 : 24, textAlign: "center", cursor: "pointer", background: dragging ? COLORS.sand : COLORS.white, transition: "all 0.2s", minHeight: 50 }}>
      <input ref={fileRef} type="file" accept="image/*" multiple onChange={e => { if (e.target.files.length) handleFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
      {slotImages.length === 0 ? (<><div style={{ fontSize: 20, color: COLORS.sand }}>+</div><div style={{ fontSize: 11, color: COLORS.stone }}>Click or drag photos here</div><div style={{ fontSize: 9, color: COLORS.sand, marginTop: 2 }}>JPG, PNG — auto-resized</div></>) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {slotImages.map((img, i) => (<div key={i} style={{ position: "relative", width: 100, height: 100, borderRadius: 4, overflow: "hidden", border: `1px solid ${COLORS.sand}` }}>
            <img src={img.data} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <button onClick={e => { e.stopPropagation(); onRemove(slotKey, i); }} style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 9, background: COLORS.slate, color: COLORS.salt, border: "none", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u00D7"}</button>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(58,58,58,0.7)", padding: "2px 4px", fontSize: 8, color: COLORS.salt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.name || `Photo ${i+1}`}</div>
          </div>))}
          <div style={{ width: 100, height: 100, borderRadius: 4, border: `2px dashed ${COLORS.sand}`, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.stone, fontSize: 24 }}>+</div>
        </div>
      )}
    </div>
  </div>);
}

// ─── Library Picker (for BOM reuse) ───
function LibraryPicker({ category, library, onSelect, buttonLabel }) {
  const [open, setOpen] = useState(false);
  const items = library[category] || [];
  if (items.length === 0) return null;
  return (<div style={{ position: "relative", display: "inline-block", marginBottom: 8 }}>
    <button onClick={() => setOpen(!open)} style={{ padding: "4px 10px", background: COLORS.white, border: `1px solid ${COLORS.soil}`, borderRadius: 3, fontSize: 10, color: COLORS.soil, cursor: "pointer" }}>
      {buttonLabel || `\u2B50 Pick from Library (${items.length})`}
    </button>
    {open && (<div style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, background: COLORS.white, border: `1px solid ${COLORS.sand}`, borderRadius: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxHeight: 200, overflowY: "auto", minWidth: 280, marginTop: 4 }}>
      {items.map((item, i) => (
        <button key={i} onClick={() => { onSelect(item); setOpen(false); }}
          style={{ display: "block", width: "100%", padding: "8px 12px", border: "none", borderBottom: `1px solid ${COLORS.sand}`, background: i % 2 === 0 ? COLORS.salt : COLORS.white, cursor: "pointer", textAlign: "left", fontSize: 11, color: COLORS.slate }}>
          <strong>{item.component || item.name || item.labelType}</strong>
          <span style={{ color: COLORS.stone, marginLeft: 6 }}>{item.type || item.fabric || ""} {item.material ? `\u00B7 ${item.material}` : ""} {item.color ? `\u00B7 ${item.color}` : ""}</span>
        </button>
      ))}
    </div>)}
  </div>);
}

// ─── FR Color Picker Cell ───
function FRColorCell({ value, onChange }) {
  return (<select value={value || ""} onChange={e => onChange(e.target.value)}
    style={{ width: "100%", border: "none", background: "transparent", fontSize: 11, padding: "3px 0", color: COLORS.slate, fontFamily: "'Helvetica Neue',sans-serif" }}>
    <option value="">Select color...</option>
    {FR_COLOR_OPTIONS.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
  </select>);
}

// ─── Step Components ───

function StepIdentity({ data, set }) {
  return (<div><SectionTitle>Identity & Classification</SectionTitle>
    <Row><Input label="Style Name" value={data.styleName} onChange={v => set("styleName", v)} placeholder="e.g. Borderless Basic Hoodie" />
      <Select label="Product Category" value={data.productCategory} onChange={v => set("productCategory", v)} options={["Hoodie","Sweatpants","T-Shirt","Shorts","Jacket / Outerwear","Bag / Sling","Accessory","Denim","Pants","Button-up / Woven Shirt"]} /></Row>
    <Row><Select label="Product Tier" value={data.productTier} onChange={v => set("productTier", v)} options={["Tier 1: Staple \u2014 Borderless Basics","Tier 1: Staple \u2014 Snowflake Staples","Tier 2: Drop \u2014 Destination Designer","Tier 2: Drop \u2014 Nomadic Necessities","Tier 2: Drop \u2014 Technical Travel"]} />
      <Select label="Season" value={data.season} onChange={v => set("season", v)} options={["Core (Evergreen)","SS26","FW26","SS27","FW27"]} /></Row>
    <Row><Input label="Target Retail Price" value={data.targetRetail} onChange={v => set("targetRetail", v)} placeholder="$117" />
      <Input label="Target FOB Price" value={data.targetFOB} onChange={v => set("targetFOB", v)} placeholder="$" /></Row>
    <Select label="Status" value={data.status} onChange={v => set("status", v)} options={["Development","Sampling","Production","Completed"]} />
  </div>);
}

function StepSku({ data, set }) {
  return (<div><SectionTitle>SKU & Numbering</SectionTitle>
    <p style={{ fontSize: 11, color: COLORS.stone, marginBottom: 12 }}>SKU auto-generates once system is finalized. Enter what you have or leave blank.</p>
    <Row><Input label="Style Number" value={data.styleNumber} onChange={v => set("styleNumber", v)} placeholder="e.g. FR-BB-HD-001" />
      <Input label="SKU Prefix" value={data.skuPrefix} onChange={v => set("skuPrefix", v)} placeholder="Auto-generated" /></Row>
    <Input label="Barcode Method" value={data.barcodeMethod} onChange={v => set("barcodeMethod", v)} />
  </div>);
}

function StepFactory({ data, set }) {
  return (<div><SectionTitle>Factory Assignment</SectionTitle>
    <Select label="Factory" value={data.factory} onChange={v => set("factory", v)} options={["Dongguan Shengde Clothing Co., Ltd. (\u5723\u5FB7)","Guangzhou Yuanfuyuan Leather Co., Ltd.","Other"]} />
    <Input label="Factory Contact" value={data.factoryContact} onChange={v => set("factoryContact", v)} placeholder="Name / WeChat / Email" />
    <Select label="Fabric Type" value={data.fabricType} onChange={v => set("fabricType", v)} options={["Cotton Jersey","Denim","Twill Cotton","Waxed Canvas","Other"]} />
  </div>);
}

function StepDesign({ data, set, images, onUpload, onRemove }) {
  return (<div><SectionTitle>Design & Construction</SectionTitle>
    <PhotoUpload label="Design References / Mood Board" slotKey="design-refs" images={images} onUpload={onUpload} onRemove={onRemove} />
    <Select label="Fit" value={data.fit} onChange={v => set("fit", v)} options={["Oversized","Relaxed","Regular","Slim"]} />
    <Input label="Key Design Features" value={data.keyFeatures} onChange={v => set("keyFeatures", v)} multiline placeholder="e.g. Crossover hood, kangaroo pocket, dropped shoulder..." />
    <Input label="Design Notes" value={data.designNotes} onChange={v => set("designNotes", v)} multiline />
  </div>);
}

function StepFlatlays({ data, set, images, onUpload, onRemove }) {
  return (<div><SectionTitle>Technical Flat Lay Diagrams</SectionTitle>
    <PhotoUpload label="Front View" slotKey="flatlay-front" images={images} onUpload={onUpload} onRemove={onRemove} />
    <PhotoUpload label="Back View" slotKey="flatlay-back" images={images} onUpload={onUpload} onRemove={onRemove} />
    <PhotoUpload label="Side / Detail Views" slotKey="flatlay-detail" images={images} onUpload={onUpload} onRemove={onRemove} />
    <Input label="Notes" value={data.flatLayNotes} onChange={v => set("flatLayNotes", v)} multiline />
  </div>);
}

function StepMaterials({ data, set, library, saveToLibrary }) {
  const updateTrim = (i, k, v) => { const t = [...data.trims]; t[i] = { ...t[i], [k]: v }; set("trims", t); };
  const addTrim = () => set("trims", [...data.trims, { component: "", type: "", material: "", color: "", notes: "" }]);
  const removeTrim = (i) => set("trims", data.trims.filter((_, idx) => idx !== i));

  const saveTrimToLib = (trim) => {
    if (!trim.component) return;
    const exists = (library.trims || []).some(t => t.component === trim.component && t.type === trim.type && t.material === trim.material);
    if (!exists) saveToLibrary("trims", trim);
  };

  // FR color dropdown renderer for trim color column
  const colorRender = (val, onChange) => <FRColorCell value={val} onChange={onChange} />;

  return (<div><SectionTitle>Materials & BOM</SectionTitle>
    <h4 style={{ fontSize: 12, color: COLORS.slate, margin: "12px 0 8px", fontWeight: 600 }}>Shell Fabric</h4>
    <Row cols="1fr 1fr 1fr">
      <Input label="Fabric Type" value={data.shellFabric} onChange={v => set("shellFabric", v)} placeholder="e.g. French Terry" />
      <Input label="Weight (GSM)" value={data.shellWeight} onChange={v => set("shellWeight", v)} placeholder="400" />
      <Input label="Composition" value={data.shellComposition} onChange={v => set("shellComposition", v)} placeholder="100% Cotton" />
    </Row>
    <Input label="Rib Composition" value={data.ribComposition} onChange={v => set("ribComposition", v)} placeholder="95% Cotton / 5% Spandex" />

    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, marginBottom: 8 }}>
      <h4 style={{ fontSize: 12, color: COLORS.slate, margin: 0, fontWeight: 600 }}>Trims & Accessories</h4>
      <LibraryPicker category="trims" library={library} buttonLabel={`\u2B50 From Library (${(library.trims||[]).length})`}
        onSelect={item => set("trims", [...data.trims, { ...item }])} />
    </div>

    <ArrayTable headers={[
      { key: "component", label: "Component", placeholder: "e.g. Zipper" },
      { key: "type", label: "Type", placeholder: "e.g. YKK #5 Coil" },
      { key: "material", label: "Material", placeholder: "e.g. Metal" },
      { key: "color", label: "Color", render: colorRender },
      { key: "notes", label: "Notes", placeholder: "" },
    ]} rows={data.trims} onUpdate={updateTrim} onAdd={addTrim} onRemove={removeTrim} />

    {/* Save to library button */}
    {data.trims.some(t => t.component) && (
      <div style={{ marginTop: 4, marginBottom: 8 }}>
        <button onClick={() => data.trims.forEach(t => saveTrimToLib(t))}
          style={{ padding: "5px 14px", background: COLORS.soil, border: "none", borderRadius: 3, fontSize: 10, color: COLORS.salt, cursor: "pointer" }}>
          Save all trims to library
        </button>
        <span style={{ fontSize: 9, color: COLORS.stone, marginLeft: 8 }}>Duplicates are skipped automatically</span>
      </div>
    )}
  </div>);
}

function StepColor({ data, set, images, onUpload, onRemove }) {
  const updateCW = (i, k, v) => {
    const c = [...data.colorways]; c[i] = { ...c[i], [k]: v };
    // Auto-fill hex when FR color is selected
    if (k === "frColor") {
      const match = FR_COLOR_OPTIONS.find(fc => fc.name === v);
      if (match) c[i].hex = match.hex;
    }
    set("colorways", c);
  };
  const addCW = () => set("colorways", [...data.colorways, { name: "", frColor: "", pantone: "", hex: "" }]);
  const removeCW = (i) => set("colorways", data.colorways.filter((_, idx) => idx !== i));

  const frColorRender = (val, onChange) => <FRColorCell value={val} onChange={onChange} />;

  return (<div><SectionTitle>Color & Artwork</SectionTitle>
    {/* Color swatches */}
    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      {FR_COLOR_OPTIONS.map(c => (
        <div key={c.name} style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, borderRadius: 4, background: c.hex, border: c.name === "Salt" ? `1px solid ${COLORS.sand}` : "none" }}></div>
          <div style={{ fontSize: 8, color: COLORS.stone, marginTop: 2 }}>{c.name}</div>
        </div>
      ))}
    </div>

    <ArrayTable headers={[
      { key: "name", label: "Colorway Name", placeholder: "e.g. Slate Wash" },
      { key: "frColor", label: "FR Color", render: frColorRender },
      { key: "pantone", label: "Pantone Ref", placeholder: "" },
      { key: "hex", label: "HEX", placeholder: "#3A3A3A" },
    ]} rows={data.colorways} onUpdate={updateCW} onAdd={addCW} onRemove={removeCW} />

    <h4 style={{ fontSize: 12, color: COLORS.slate, margin: "16px 0 8px", fontWeight: 600 }}>Logo Placement</h4>
    <Row cols="1fr 1fr 1fr">
      <Select label="Front Logo" value={data.logoFront} onChange={v => set("logoFront", v)} options={["Snowflake Emblem Center Chest","Snowflake Left Chest","None","Custom"]} />
      <Select label="Back Logo" value={data.logoBack} onChange={v => set("logoBack", v)} options={["FOREIGN RESOURCE Wordmark Upper Back","None","Custom"]} />
      <Select label="Method" value={data.logoMethod} onChange={v => set("logoMethod", v)} options={["Tonal Embroidery","Puff Print","Screen Print","Heat Transfer","Woven Patch"]} />
    </Row>
    <PhotoUpload label="Artwork Files / Placement References" slotKey="artwork" images={images} onUpload={onUpload} onRemove={onRemove} />
  </div>);
}

function StepConstruction({ data, set, images, onUpload, onRemove }) {
  const updateSeam = (i, k, v) => { const s = [...data.seams]; s[i] = { ...s[i], [k]: v }; set("seams", s); };
  const addSeam = () => set("seams", [...data.seams, { operation: "", seamType: "", stitchType: "", spiSpcm: "", threadColor: "", notes: "" }]);
  const removeSeam = (i) => set("seams", data.seams.filter((_, idx) => idx !== i));
  return (<div><SectionTitle>Construction Details</SectionTitle>
    <ArrayTable headers={[{ key: "operation", label: "Operation", placeholder: "Side seam" },{ key: "seamType", label: "Seam Type", placeholder: "Flatlock" },{ key: "stitchType", label: "Stitch", placeholder: "301" },{ key: "spiSpcm", label: "SPI", placeholder: "" },{ key: "threadColor", label: "Thread", placeholder: "" },{ key: "notes", label: "Notes" }]}
      rows={data.seams} onUpdate={updateSeam} onAdd={addSeam} onRemove={removeSeam} />
    <Input label="Construction Notes" value={data.constructionNotes} onChange={v => set("constructionNotes", v)} multiline />
    <PhotoUpload label="Construction Detail Sketches" slotKey="construction-sketches" images={images} onUpload={onUpload} onRemove={onRemove} />
  </div>);
}

function StepPattern({ data, set, images, onUpload, onRemove }) {
  const updatePP = (i, k, v) => { const p = [...data.patternPieces]; p[i] = { ...p[i], [k]: v }; set("patternPieces", p); };
  const addPP = () => set("patternPieces", [...data.patternPieces, { name: "", qty: "", fabric: "", grain: "", fusing: "", notes: "" }]);
  const removePP = (i) => set("patternPieces", data.patternPieces.filter((_, idx) => idx !== i));
  return (<div><SectionTitle>Pattern Pieces & Cutting</SectionTitle>
    <PhotoUpload label="Pattern Piece Layouts" slotKey="pattern-layout" images={images} onUpload={onUpload} onRemove={onRemove} />
    <ArrayTable headers={[{ key: "name", label: "Piece Name", placeholder: "Front Body" },{ key: "qty", label: "Qty", placeholder: "2" },{ key: "fabric", label: "Fabric", placeholder: "Shell" },{ key: "grain", label: "Grain", placeholder: "Lengthwise" },{ key: "fusing", label: "Fusing", placeholder: "None" },{ key: "notes", label: "Notes" }]}
      rows={data.patternPieces} onUpdate={updatePP} onAdd={addPP} onRemove={removePP} />
    <Input label="Cutting Notes" value={data.cuttingNotes} onChange={v => set("cuttingNotes", v)} multiline />
  </div>);
}

function StepPom({ data, set, images, onUpload, onRemove }) {
  const updatePom = (i, k, v) => { const p = [...data.poms]; p[i] = { ...p[i], [k]: v }; set("poms", p); };
  const addPom = () => set("poms", [...data.poms, { name: "", tol: "1", s: "", m: "", l: "", xl: "" }]);
  const removePom = (i) => set("poms", data.poms.filter((_, idx) => idx !== i));
  const szH = data.sizeType === "waist" ? [{ key: "s", label: "W30" },{ key: "m", label: "W32" },{ key: "l", label: "W34" },{ key: "xl", label: "W36" }] : [{ key: "s", label: "S" },{ key: "m", label: "M" },{ key: "l", label: "L" },{ key: "xl", label: "XL" }];
  return (<div><SectionTitle>Points of Measure (cm)</SectionTitle>
    <Select label="Size Type" value={data.sizeType} onChange={v => set("sizeType", v)} options={["apparel","waist","one-size"]} />
    <PhotoUpload label="POM Diagram" slotKey="pom-diagram" images={images} onUpload={onUpload} onRemove={onRemove} />
    {data.sizeType !== "one-size" && <ArrayTable headers={[{ key: "name", label: "Measurement", placeholder: "Chest Width" },{ key: "tol", label: "Tol \u00B1", placeholder: "1" }, ...szH]}
      rows={data.poms} onUpdate={updatePom} onAdd={addPom} onRemove={removePom} />}
  </div>);
}

function StepTreatments({ data, set, images, onUpload, onRemove }) {
  const updateT = (i, k, v) => { const t = [...data.treatments]; t[i] = { ...t[i], [k]: v }; set("treatments", t); };
  const addT = () => set("treatments", [...data.treatments, { treatment: "", process: "", temp: "", duration: "", chemicals: "", notes: "" }]);
  const removeT = (i) => set("treatments", data.treatments.filter((_, idx) => idx !== i));
  const updateD = (i, k, v) => { const d = [...data.distressing]; d[i] = { ...d[i], [k]: v }; set("distressing", d); };
  const addD = () => set("distressing", [...data.distressing, { area: "", technique: "", intensity: "", notes: "" }]);
  const removeD = (i) => set("distressing", data.distressing.filter((_, idx) => idx !== i));
  return (<div><SectionTitle>Garment Treatments</SectionTitle>
    <h4 style={{ fontSize: 12, color: COLORS.slate, margin: "8px 0", fontWeight: 600 }}>Wash & Dye</h4>
    <ArrayTable headers={[{ key: "treatment", label: "Treatment", placeholder: "Acid Wash" },{ key: "process", label: "Process" },{ key: "temp", label: "Temp", placeholder: "\u00B0C" },{ key: "duration", label: "Duration", placeholder: "min" },{ key: "chemicals", label: "Chemicals" },{ key: "notes", label: "Notes" }]}
      rows={data.treatments} onUpdate={updateT} onAdd={addT} onRemove={removeT} />
    <h4 style={{ fontSize: 12, color: COLORS.slate, margin: "16px 0 8px", fontWeight: 600 }}>Distressing</h4>
    <ArrayTable headers={[{ key: "area", label: "Area", placeholder: "Front pocket" },{ key: "technique", label: "Technique", placeholder: "Sandblast" },{ key: "intensity", label: "Intensity (1-5)", placeholder: "3" },{ key: "notes", label: "Notes" }]}
      rows={data.distressing} onUpdate={updateD} onAdd={addD} onRemove={removeD} />
    <PhotoUpload label="Before / After References" slotKey="treatment-refs" images={images} onUpload={onUpload} onRemove={onRemove} />
  </div>);
}

function StepLabels({ data, set, images, onUpload, onRemove }) {
  return (<div><SectionTitle>Labels & Packaging</SectionTitle>
    <PhotoUpload label="Label Artwork (care, main, size)" slotKey="label-artwork" images={images} onUpload={onUpload} onRemove={onRemove} />
    <Input label="Care Instructions" value={data.careInstructions} onChange={v => set("careInstructions", v)} multiline />
    <Select label="Packaging" value={data.packaging} onChange={v => set("packaging", v)} options={["Standard FR Packaging","Custom","Minimal"]} />
    {data.packaging === "Standard FR Packaging" && <div style={{ padding: 12, background: COLORS.salt, borderRadius: 4, fontSize: 11, color: COLORS.stone, marginBottom: 12, lineHeight: 1.6 }}>Matte Slate poly mailer + Sand dust bag + Salt hang tag + tissue + sticker</div>}
    <Input label="Packaging Notes" value={data.packagingNotes} onChange={v => set("packagingNotes", v)} multiline />
  </div>);
}

function StepOrder({ data, set }) {
  const updateQ = (i, k, v) => { const q = [...data.quantities]; q[i] = { ...q[i], [k]: v }; set("quantities", q); };
  const addQ = () => set("quantities", [...data.quantities, { colorway: "", s: "", m: "", l: "", xl: "", unitCost: "" }]);
  const removeQ = (i) => set("quantities", data.quantities.filter((_, idx) => idx !== i));
  const updateC = (i, k, v) => { const c = [...data.cartons]; c[i] = { ...c[i], [k]: v }; set("cartons", c); };
  const addC = () => set("cartons", [...data.cartons, { cartonNum: "", colorway: "", sizeBreakdown: "", qtyPerCarton: "", dims: "", grossWeight: "", netWeight: "" }]);
  const removeC = (i) => set("cartons", data.cartons.filter((_, idx) => idx !== i));

  // Colorway dropdown from filled colorways
  const cwOptions = data.colorways.filter(c => c.name).map(c => c.name);
  const cwRender = (val, onChange) => (
    <select value={val || ""} onChange={e => onChange(e.target.value)} style={{ width: "100%", border: "none", background: "transparent", fontSize: 11, color: COLORS.slate, fontFamily: "'Helvetica Neue',sans-serif" }}>
      <option value="">Select...</option>{cwOptions.map(n => <option key={n} value={n}>{n}</option>)}
      <option value="__custom">Other...</option>
    </select>
  );

  return (<div><SectionTitle>Order & Delivery</SectionTitle>
    <h4 style={{ fontSize: 12, color: COLORS.slate, margin: "8px 0", fontWeight: 600 }}>Quantity Per Size</h4>
    <ArrayTable headers={[{ key: "colorway", label: "Colorway", render: cwOptions.length > 0 ? cwRender : undefined, placeholder: "Slate Wash" },{ key: "s", label: "S", placeholder: "0" },{ key: "m", label: "M", placeholder: "0" },{ key: "l", label: "L", placeholder: "0" },{ key: "xl", label: "XL", placeholder: "0" },{ key: "unitCost", label: "Unit $", placeholder: "$" }]}
      rows={data.quantities} onUpdate={updateQ} onAdd={addQ} onRemove={removeQ} />
    <h4 style={{ fontSize: 12, color: COLORS.slate, margin: "16px 0 8px", fontWeight: 600 }}>Delivery Details</h4>
    <Row><Input label="Ship To (Address)" value={data.shipTo} onChange={v => set("shipTo", v)} /><Input label="Delivery Location / Warehouse" value={data.deliveryLocation} onChange={v => set("deliveryLocation", v)} /></Row>
    <Row cols="1fr 1fr 1fr"><Select label="Ship Method" value={data.shipMethod} onChange={v => set("shipMethod", v)} options={["Air","Sea","Express (DHL/FedEx)"]} />
      <Select label="Incoterm" value={data.incoterm} onChange={v => set("incoterm", v)} options={["FOB","CIF","EXW","DDP"]} />
      <Input label="Freight Forwarder" value={data.freightForwarder} onChange={v => set("freightForwarder", v)} /></Row>
    <Row><Input label="Target Ship Date" value={data.targetShipDate} onChange={v => set("targetShipDate", v)} placeholder="YYYY-MM-DD" />
      <Input label="Target Arrival Date" value={data.targetArrivalDate} onChange={v => set("targetArrivalDate", v)} placeholder="YYYY-MM-DD" /></Row>
    <Input label="Special Instructions" value={data.specialInstructions} onChange={v => set("specialInstructions", v)} multiline />
    <h4 style={{ fontSize: 12, color: COLORS.slate, margin: "16px 0 8px", fontWeight: 600 }}>Packing List</h4>
    <ArrayTable headers={[{ key: "cartonNum", label: "#", placeholder: "1" },{ key: "colorway", label: "Colorway" },{ key: "sizeBreakdown", label: "Size Breakdown", placeholder: "S:10 M:20 L:15 XL:5" },{ key: "qtyPerCarton", label: "Qty", placeholder: "50" },{ key: "dims", label: "Dims (cm)", placeholder: "60x40x30" },{ key: "grossWeight", label: "Gross kg" },{ key: "netWeight", label: "Net kg" }]}
      rows={data.cartons} onUpdate={updateC} onAdd={addC} onRemove={removeC} />
  </div>);
}

function StepReview({ data, images, library }) {
  const filled = Object.entries(data).filter(([k, v]) => { if (Array.isArray(v)) return v.some(r => Object.values(r).some(x => x)); return v && v !== DEFAULT_DATA[k]; }).length;
  const total = Object.keys(DEFAULT_DATA).length;
  const pct = Math.round((filled / total) * 100);
  const imgCount = (images || []).length;
  const libCount = (library.trims || []).length + (library.fabrics || []).length + (library.labels || []).length;
  return (<div><SectionTitle>Review & Export</SectionTitle>
    <div style={{ padding: 20, background: COLORS.salt, borderRadius: 6, marginBottom: 16 }}>
      <div style={{ fontSize: 13, color: COLORS.slate, fontWeight: 600, marginBottom: 8 }}>Completion: {pct}% {"\u00B7"} {imgCount} photo{imgCount !== 1 ? "s" : ""} {"\u00B7"} {libCount} library items</div>
      <div style={{ width: "100%", height: 6, background: COLORS.sand, borderRadius: 3 }}><div style={{ width: `${pct}%`, height: "100%", background: COLORS.soil, borderRadius: 3, transition: "width 0.3s" }}></div></div>
    </div>
    <div style={{ fontSize: 12, color: COLORS.stone, lineHeight: 1.8 }}>
      <p><strong>Style:</strong> {data.styleName || "\u2014"} ({data.productCategory || "\u2014"})</p>
      <p><strong>Tier:</strong> {data.productTier || "\u2014"} / <strong>Season:</strong> {data.season || "\u2014"}</p>
      <p><strong>Factory:</strong> {data.factory || "\u2014"}</p>
      <p><strong>Colorways:</strong> {data.colorways.filter(c => c.name).map(c => `${c.name} (${c.frColor})`).join(", ") || "\u2014"}</p>
      <p><strong>Retail:</strong> {data.targetRetail || "\u2014"} / <strong>FOB:</strong> {data.targetFOB || "\u2014"}</p>
    </div>
    <div style={{ marginTop: 20, padding: 16, border: `2px solid ${COLORS.soil}`, borderRadius: 6, background: COLORS.white }}>
      <div style={{ fontSize: 13, color: COLORS.slate, fontWeight: 600, marginBottom: 6 }}>Ready to generate?</div>
      <div style={{ fontSize: 11, color: COLORS.stone, lineHeight: 1.6 }}>Tell Claude: <strong>"Generate my tech pack"</strong> {"\u2014"} English + Chinese PDFs with all data and photos.</div>
    </div>
  </div>);
}

const STEP_FNS = [StepIdentity, StepSku, StepFactory, StepDesign, StepFlatlays, StepMaterials, StepColor, StepConstruction, StepPattern, StepPom, StepTreatments, StepLabels, StepOrder, StepReview];
const IMG_STEPS = new Set([3,4,6,7,8,9,10,11]);

// ─── MAIN ───
export default function TechPackBuilder() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState(DEFAULT_DATA);
  const [images, setImages] = useState([]);
  const [library, setLibrary] = useState(DEFAULT_LIBRARY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try { const r = await window.storage.get(STORAGE_KEY); if (r?.value) setData(p => ({ ...p, ...JSON.parse(r.value) })); } catch (e) {}
      try { const r = await window.storage.get(IMG_KEY); if (r?.value) setImages(JSON.parse(r.value)); } catch (e) {}
      try { const r = await window.storage.get(LIB_KEY); if (r?.value) setLibrary(p => ({ ...p, ...JSON.parse(r.value) })); } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  const saveData = useCallback(async (d) => { setSaving(true); try { await window.storage.set(STORAGE_KEY, JSON.stringify(d)); } catch(e){} setTimeout(() => setSaving(false), 400); }, []);
  const saveImages = useCallback(async (imgs) => { try { await window.storage.set(IMG_KEY, JSON.stringify(imgs)); } catch(e){} }, []);
  const saveLib = useCallback(async (lib) => { try { await window.storage.set(LIB_KEY, JSON.stringify(lib)); } catch(e){} }, []);

  const set = useCallback((k, v) => { setData(p => { const n = { ...p, [k]: v }; saveData(n); return n; }); }, [saveData]);

  const handleImgUpload = useCallback((slot, b64, name) => { setImages(p => { const n = [...p, { slot, data: b64, name }]; saveImages(n); return n; }); }, [saveImages]);
  const handleImgRemove = useCallback((slot, idx) => {
    setImages(p => { let c = 0; const n = p.filter(img => { if (img.slot === slot) { if (c === idx) { c++; return false; } c++; } return true; }); saveImages(n); return n; });
  }, [saveImages]);

  const saveToLibrary = useCallback((category, item) => {
    setLibrary(p => { const n = { ...p, [category]: [...(p[category] || []), { ...item }] }; saveLib(n); return n; });
  }, [saveLib]);

  const reset = async () => {
    if (confirm("Reset all data, photos, and library?")) {
      setData(DEFAULT_DATA); setImages([]); setLibrary(DEFAULT_LIBRARY);
      try { await window.storage.delete(STORAGE_KEY); } catch(e){}
      try { await window.storage.delete(IMG_KEY); } catch(e){}
      try { await window.storage.delete(LIB_KEY); } catch(e){}
      setStep(0);
    }
  };

  const resetDataOnly = async () => {
    if (confirm("Reset tech pack data and photos? Library will be kept.")) {
      setData(DEFAULT_DATA); setImages([]);
      try { await window.storage.delete(STORAGE_KEY); } catch(e){}
      try { await window.storage.delete(IMG_KEY); } catch(e){}
      setStep(0);
    }
  };

  if (!loaded) return <div style={{ padding: 40, textAlign: "center", color: COLORS.stone, fontFamily: "'Helvetica Neue',sans-serif" }}>Loading...</div>;

  const Comp = STEP_FNS[step];
  const needsImg = IMG_STEPS.has(step);
  const needsLib = step === 5; // Materials
  const libCount = (library.trims||[]).length + (library.fabrics||[]).length;

  const stepProps = { data, set, images, onUpload: handleImgUpload, onRemove: handleImgRemove, library, saveToLibrary };

  return (
    <div style={{ minHeight: "100vh", background: COLORS.salt, fontFamily: "'Helvetica Neue',sans-serif" }}>
      <div style={{ background: COLORS.slate, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: COLORS.salt, fontSize: 9, letterSpacing: 3, fontWeight: 600 }}>F O R E I G N  R E S O U R C E  C O .</div>
          <div style={{ fontFamily: "'Cormorant Garamond','Georgia',serif", color: COLORS.salt, fontSize: 18, marginTop: 2 }}>Tech Pack Builder</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {saving && <span style={{ fontSize: 10, color: COLORS.sage }}>Saving...</span>}
          <span style={{ fontSize: 9, color: COLORS.stone }}>{images.length} photos {"\u00B7"} {libCount} in library</span>
          <button onClick={resetDataOnly} style={{ padding: "5px 10px", background: "none", border: `1px solid ${COLORS.stone}`, borderRadius: 3, color: COLORS.salt, fontSize: 9, cursor: "pointer" }}>New Pack</button>
          <button onClick={reset} style={{ padding: "5px 10px", background: "none", border: `1px solid ${COLORS.stone}`, borderRadius: 3, color: COLORS.sienna, fontSize: 9, cursor: "pointer" }}>Reset All</button>
        </div>
      </div>
      <div style={{ display: "flex", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ width: 220, minWidth: 220, padding: "16px 0", borderRight: `1px solid ${COLORS.sand}`, background: COLORS.salt }}>
          {STEPS.map((s, i) => (
            <button key={s.id} onClick={() => setStep(i)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 16px", border: "none", cursor: "pointer", background: i === step ? COLORS.white : "transparent", borderLeft: i === step ? `3px solid ${COLORS.soil}` : "3px solid transparent" }}>
              <span style={{ fontSize: 10, color: i === step ? COLORS.soil : COLORS.stone, fontWeight: 700, width: 18 }}>{s.icon}</span>
              <span style={{ fontSize: 11, color: i === step ? COLORS.slate : COLORS.stone, textAlign: "left" }}>{s.title}</span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1, padding: "24px 32px", maxHeight: "calc(100vh - 70px)", overflowY: "auto" }}>
          <Comp {...stepProps} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, paddingTop: 16, borderTop: `1px solid ${COLORS.sand}` }}>
            <button onClick={() => setStep(Math.max(0, step-1))} disabled={step===0} style={{ padding: "8px 20px", background: "none", border: `1px solid ${step===0 ? COLORS.sand : COLORS.slate}`, borderRadius: 3, color: step===0 ? COLORS.sand : COLORS.slate, fontSize: 12, cursor: step===0 ? "default" : "pointer" }}>Previous</button>
            <span style={{ fontSize: 10, color: COLORS.stone, alignSelf: "center" }}>Step {step+1} of {STEPS.length}</span>
            <button onClick={() => setStep(Math.min(STEPS.length-1, step+1))} disabled={step===STEPS.length-1} style={{ padding: "8px 20px", background: step===STEPS.length-1 ? COLORS.sand : COLORS.slate, border: "none", borderRadius: 3, color: COLORS.salt, fontSize: 12, cursor: step===STEPS.length-1 ? "default" : "pointer" }}>{step===STEPS.length-2 ? "Review" : "Next"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
