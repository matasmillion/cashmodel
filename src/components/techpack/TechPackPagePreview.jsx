// Live A4-landscape page preview for the Tech Pack builder.
// Renders the tech pack page that matches the active wizard step so the user
// can see exactly where each field lands.
//
// Page geometry: 1123 × 794 px at 96dpi (A4 landscape). The SVG uses a
// preserveAspectRatio="xMidYMin meet" viewBox so it scales into whatever
// container width we give it.

import { FR } from './techPackConstants';

const PAGE_W = 1123;
const PAGE_H = 794;

function esc(s) { return String(s ?? ''); }

// ─── Shared page chrome ──────────────────────────────────────────────────────
function PageFrame({ title, pageNum, totalPages, styleInfo, children }) {
  return (
    <g>
      <rect x="0" y="0" width={PAGE_W} height={PAGE_H} fill={FR.white} />
      <rect x="0" y="0" width={PAGE_W} height={70} fill={FR.slate} />
      <text x="40" y="28" fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="3">FOREIGN RESOURCE CO.</text>
      <text x="40" y="55" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="22" fill={FR.salt}>{title}</text>
      <rect x="0" y="70" width={PAGE_W} height={2} fill={FR.soil} />
      <text x="40" y="775" fontSize="9" fill={FR.stone}>{styleInfo}</text>
      <text x={PAGE_W - 40} y="775" textAnchor="end" fontSize="9" fill={FR.stone}>Page {pageNum} of {totalPages}</text>
      {children}
    </g>
  );
}

function SectionHeading({ x, y, children }) {
  return (
    <g>
      <text x={x} y={y} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="18" fill={FR.slate}>{children}</text>
      <rect x={x} y={y + 4} width="60" height="2" fill={FR.soil} />
    </g>
  );
}

function Field({ x, y, label, value, w = 320 }) {
  return (
    <g>
      <text x={x} y={y} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">{esc((label || '').toUpperCase())}</text>
      <text x={x} y={y + 14} fontSize="11" fill={FR.slate}>
        {clampLine(esc(value || '—'), w, 6.5)}
      </text>
    </g>
  );
}

function clampLine(s, maxW, charW = 6.5) {
  const max = Math.floor(maxW / charW);
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + '…';
}

function Table({ x, y, headers, rows, widths, maxRows = 14 }) {
  const rowH = 22;
  const totalW = widths.reduce((a, b) => a + b, 0);
  const displayRows = rows.slice(0, maxRows);
  let cx = x;
  return (
    <g>
      <rect x={x} y={y} width={totalW} height={rowH} fill={FR.slate} />
      {headers.map((h, i) => {
        const tx = cx + 6;
        cx += widths[i];
        return <text key={i} x={tx} y={y + 15} fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="0.5">{esc((h || '').toUpperCase())}</text>;
      })}
      {displayRows.map((row, ri) => {
        const ry = y + rowH + ri * rowH;
        let cx2 = x;
        return (
          <g key={ri}>
            {ri % 2 === 0 && <rect x={x} y={ry} width={totalW} height={rowH} fill={FR.salt} />}
            {row.map((cell, i) => {
              const tx = cx2 + 6;
              const w = widths[i];
              cx2 += widths[i];
              return <text key={i} x={tx} y={ry + 15} fontSize="10" fill={FR.slate}>{clampLine(esc(cell || ''), w - 10)}</text>;
            })}
          </g>
        );
      })}
      {rows.length > maxRows && (
        <text x={x} y={y + rowH + displayRows.length * rowH + 14} fontSize="9" fill={FR.stone} fontStyle="italic">
          … {rows.length - maxRows} more row{rows.length - maxRows === 1 ? '' : 's'}
        </text>
      )}
    </g>
  );
}

function EmptyNote({ x, y, children }) {
  return <text x={x} y={y} fontSize="10" fill={FR.stone} fontStyle="italic">{children}</text>;
}

function PhotoGrid({ images, slot, x, y, cols = 3, cellW = 180, cellH = 180, gap = 12, max = 6 }) {
  const slotImgs = (images || []).filter(img => img.slot === slot).slice(0, max);
  if (slotImgs.length === 0) {
    return (
      <g>
        <rect x={x} y={y} width={cellW * cols + gap * (cols - 1)} height={cellH} fill={FR.salt} stroke={FR.sand} strokeDasharray="4 4" />
        <text x={x + 12} y={y + cellH / 2 + 4} fontSize="11" fill={FR.stone} fontStyle="italic">Drop photos on the left to see them here</text>
      </g>
    );
  }
  return (
    <g>
      {slotImgs.map((img, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        return (
          <image key={i}
            href={img.data}
            x={x + col * (cellW + gap)}
            y={y + row * (cellH + gap)}
            width={cellW}
            height={cellH}
            preserveAspectRatio="xMidYMid slice" />
        );
      })}
    </g>
  );
}

// ─── Per-step page bodies ────────────────────────────────────────────────────
// Each Page* returns the children for a PageFrame. Step indexes map 1:1 to
// tech pack page numbers (1-indexed for the user).

function PageCover({ d }) {
  return (
    <g>
      <text x={PAGE_W / 2} y="340" textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="54" fill={FR.slate}>
        {clampLine(d.styleName || 'Untitled Tech Pack', 900, 26)}
      </text>
      <text x={PAGE_W / 2} y="380" textAnchor="middle" fontSize="16" fill={FR.soil}>
        {esc(d.styleNumber || 'STYLE-000')}
      </text>
      <text x={PAGE_W / 2} y="415" textAnchor="middle" fontSize="12" fill={FR.stone}>
        {[d.productCategory, d.productTier, d.season].filter(Boolean).join('  ·  ') || '—'}
      </text>
      <rect x={PAGE_W / 2 - 80} y="440" width="160" height="36" rx="6" fill={FR.soil} />
      <text x={PAGE_W / 2} y="464" textAnchor="middle" fontSize="11" fontWeight="bold" fill={FR.salt} letterSpacing="1">
        {esc((d.status || 'DESIGN').toUpperCase())}
      </text>
    </g>
  );
}

function PageIdentity({ d }) {
  return (
    <g>
      <SectionHeading x={40} y={110}>Identity & Classification</SectionHeading>
      <Field x={40} y={145} label="Style Name" value={d.styleName} />
      <Field x={400} y={145} label="Category" value={d.productCategory} />
      <Field x={760} y={145} label="Tier" value={d.productTier} />
      <Field x={40} y={200} label="Season" value={d.season} />
      <Field x={400} y={200} label="Target Retail" value={d.targetRetail} />
      <Field x={760} y={200} label="Target FOB" value={d.targetFOB} />
      <Field x={40} y={255} label="Status" value={d.status} />
    </g>
  );
}

function PageSku({ d }) {
  return (
    <g>
      <SectionHeading x={40} y={110}>SKU & Numbering</SectionHeading>
      <Field x={40} y={145} label="Style Number" value={d.styleNumber} />
      <Field x={400} y={145} label="SKU Prefix" value={d.skuPrefix} />
      <Field x={760} y={145} label="Barcode Method" value={d.barcodeMethod} />
    </g>
  );
}

function PageFactory({ d }) {
  return (
    <g>
      <SectionHeading x={40} y={110}>Factory Assignment</SectionHeading>
      <Field x={40} y={145} label="Factory" value={d.factory} w={680} />
      <Field x={760} y={145} label="Fabric Type" value={d.fabricType} />
      <Field x={40} y={205} label="Contact" value={d.factoryContact} w={680} />
    </g>
  );
}

function PageDesign({ d, images }) {
  return (
    <g>
      <SectionHeading x={40} y={110}>Design & Construction</SectionHeading>
      <Field x={40} y={145} label="Fit" value={d.fit} w={500} />
      <Field x={560} y={145} label="Key Features" value={d.keyFeatures} w={500} />
      <text x={40} y={215} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">DESIGN NOTES</text>
      <foreignObject x="40" y="225" width={PAGE_W - 80} height="200">
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 11, color: FR.slate, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {d.designNotes || '—'}
        </div>
      </foreignObject>
      <PhotoGrid images={images} slot="design" x={40} y={470} cellW={160} cellH={160} cols={6} max={6} />
    </g>
  );
}

function PageFlatlays({ d, images }) {
  return (
    <g>
      <SectionHeading x={40} y={110}>Flat Lay Diagrams</SectionHeading>
      <PhotoGrid images={images} slot="flatlay" x={40} y={140} cellW={330} cellH={280} cols={3} max={6} />
      <text x={40} y={470} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">FLAT LAY NOTES</text>
      <foreignObject x="40" y="480" width={PAGE_W - 80} height="240">
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 11, color: FR.slate, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {d.flatLayNotes || '—'}
        </div>
      </foreignObject>
    </g>
  );
}

function PageBOM({ d }) {
  const rows = (d.bom || []).filter(b => b.component || b.type || b.material)
    .map(b => [b.component, b.type, b.material, b.color, b.weight, b.supplier, b.costPerUnit]);
  return (
    <g>
      <SectionHeading x={40} y={110}>Bill of Materials</SectionHeading>
      {rows.length === 0
        ? <EmptyNote x={40} y={160}>Add components on the left — zippers, labels, trims, fabric…</EmptyNote>
        : <Table x={40} y={140}
            headers={['Component', 'Type / Spec', 'Material', 'Color', 'Weight', 'Supplier', 'Cost/Unit']}
            rows={rows}
            widths={[130, 170, 150, 110, 85, 180, 218]} />}
    </g>
  );
}

function PageColor({ d, images }) {
  const rows = (d.colorways || []).filter(c => c.name || c.frColor).map(c => [c.name, c.frColor, c.pantone, c.hex]);
  return (
    <g>
      <SectionHeading x={40} y={110}>Color & Artwork</SectionHeading>
      {rows.length === 0
        ? <EmptyNote x={40} y={160}>No colorways yet</EmptyNote>
        : <Table x={40} y={140} headers={['Colorway', 'FR Color', 'Pantone', 'Hex']} rows={rows} widths={[260, 200, 200, 383]} />}
      <SectionHeading x={40} y={370}>Logo Placement</SectionHeading>
      <Field x={40} y={405} label="Front" value={d.logoFront} w={500} />
      <Field x={560} y={405} label="Back" value={d.logoBack} w={500} />
      <Field x={40} y={460} label="Method" value={d.logoMethod} w={1040} />
      <PhotoGrid images={images} slot="artwork" x={40} y={510} cellW={160} cellH={160} cols={6} max={6} />
    </g>
  );
}

function PageConstruction({ d }) {
  const rows = (d.seams || []).filter(s => s.operation || s.seamType)
    .map(s => [s.operation, s.seamType, s.stitchType, s.spiSpcm, s.threadColor, s.notes]);
  return (
    <g>
      <SectionHeading x={40} y={110}>Construction Details</SectionHeading>
      {rows.length === 0
        ? <EmptyNote x={40} y={160}>No seam operations yet</EmptyNote>
        : <Table x={40} y={140} headers={['Operation', 'Seam Type', 'Stitch', 'SPI', 'Thread', 'Notes']} rows={rows} widths={[180, 150, 110, 70, 140, 393]} />}
      <text x={40} y={560} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">CONSTRUCTION NOTES</text>
      <foreignObject x="40" y="570" width={PAGE_W - 80} height="160">
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 11, color: FR.slate, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {d.constructionNotes || '—'}
        </div>
      </foreignObject>
    </g>
  );
}

function PagePattern({ d }) {
  const rows = (d.patternPieces || []).filter(p => p.name).map(p => [p.name, p.qty, p.fabric, p.grain, p.fusing, p.notes]);
  return (
    <g>
      <SectionHeading x={40} y={110}>Pattern Pieces & Cutting</SectionHeading>
      {rows.length === 0
        ? <EmptyNote x={40} y={160}>No pattern pieces yet</EmptyNote>
        : <Table x={40} y={140} headers={['Piece', 'Qty', 'Fabric', 'Grain', 'Fusing', 'Notes']} rows={rows} widths={[200, 70, 170, 130, 130, 343]} />}
      <text x={40} y={560} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">CUTTING NOTES</text>
      <foreignObject x="40" y="570" width={PAGE_W - 80} height="160">
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 11, color: FR.slate, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {d.cuttingNotes || '—'}
        </div>
      </foreignObject>
    </g>
  );
}

function PagePOM({ d }) {
  const rows = (d.poms || []).filter(p => p.name).map(p => [p.name, p.tol, p.s, p.m, p.l, p.xl]);
  return (
    <g>
      <SectionHeading x={40} y={110}>Points of Measure (cm)</SectionHeading>
      {rows.length === 0
        ? <EmptyNote x={40} y={160}>No POMs yet</EmptyNote>
        : <Table x={40} y={140} headers={['POM', 'Tol', 'S', 'M', 'L', 'XL']} rows={rows} widths={[430, 90, 130, 130, 130, 133]} />}
    </g>
  );
}

function PageTreatments({ d }) {
  const tRows = (d.treatments || []).filter(t => t.treatment || t.process).map(t => [t.treatment, t.process, t.temp, t.duration, t.chemicals, t.notes]);
  return (
    <g>
      <SectionHeading x={40} y={110}>Garment Treatments</SectionHeading>
      {tRows.length === 0
        ? <EmptyNote x={40} y={160}>No treatments specified</EmptyNote>
        : <Table x={40} y={140} headers={['Treatment', 'Process', 'Temp', 'Duration', 'Chemicals', 'Notes']} rows={tRows} widths={[180, 170, 90, 120, 180, 303]} />}
      <SectionHeading x={40} y={450}>Care Instructions</SectionHeading>
      <foreignObject x="40" y="470" width={PAGE_W - 80} height="280">
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 11, color: FR.slate, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {d.careInstructions || '—'}
        </div>
      </foreignObject>
    </g>
  );
}

function PageLabels({ d }) {
  return (
    <g>
      <SectionHeading x={40} y={110}>Labels & Packaging</SectionHeading>
      <Field x={40} y={145} label="Packaging" value={d.packaging} w={500} />
      <text x={40} y={215} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">PACKAGING NOTES</text>
      <foreignObject x="40" y="225" width={PAGE_W - 80} height="500">
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 11, color: FR.slate, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {d.packagingNotes || '—'}
        </div>
      </foreignObject>
    </g>
  );
}

function PageOrder({ d }) {
  const qRows = (d.quantities || []).filter(q => q.colorway).map(q => [q.colorway, q.s, q.m, q.l, q.xl, q.unitCost]);
  const cRows = (d.cartons || []).filter(c => c.cartonNum).map(c => [c.cartonNum, c.colorway, c.sizeBreakdown, c.qtyPerCarton, c.dims, c.grossWeight, c.netWeight]);
  return (
    <g>
      <SectionHeading x={40} y={110}>Order & Delivery</SectionHeading>
      <text x={40} y={140} fontSize="10" fontWeight="bold" fill={FR.soil}>QUANTITY PER SIZE</text>
      {qRows.length === 0
        ? <EmptyNote x={40} y={170}>No quantities entered</EmptyNote>
        : <Table x={40} y={148} headers={['Colorway', 'S', 'M', 'L', 'XL', 'Unit $']} rows={qRows} widths={[280, 80, 80, 80, 80, 443]} maxRows={4} />}
      <text x={40} y={320} fontSize="10" fontWeight="bold" fill={FR.soil}>DELIVERY DETAILS</text>
      <Field x={40} y={345} label="Ship To" value={d.shipTo} w={340} />
      <Field x={400} y={345} label="Location" value={d.deliveryLocation} w={340} />
      <Field x={760} y={345} label="Method" value={d.shipMethod} w={320} />
      <Field x={40} y={400} label="Incoterm" value={d.incoterm} w={340} />
      <Field x={400} y={400} label="Ship Date" value={d.targetShipDate} w={340} />
      <Field x={760} y={400} label="Arrival" value={d.targetArrivalDate} w={320} />
      <text x={40} y={470} fontSize="10" fontWeight="bold" fill={FR.soil}>PACKING LIST</text>
      {cRows.length === 0
        ? <EmptyNote x={40} y={500}>No cartons yet</EmptyNote>
        : <Table x={40} y={478} headers={['Carton', 'Colorway', 'Sizes', 'Qty', 'Dims', 'Gross', 'Net']} rows={cRows} widths={[90, 180, 200, 80, 160, 110, 223]} maxRows={8} />}
    </g>
  );
}

function PageReview({ d }) {
  const bomCount = (d.bom || []).filter(b => b.component).length;
  const pomCount = (d.poms || []).filter(p => Object.values(p).some(v => v)).length;
  const seamCount = (d.seams || []).filter(s => s.operation).length;
  return (
    <g>
      <text x={PAGE_W / 2} y="280" textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="44" fill={FR.slate}>
        {clampLine(d.styleName || 'Untitled Tech Pack', 900, 22)}
      </text>
      <text x={PAGE_W / 2} y="320" textAnchor="middle" fontSize="14" fill={FR.soil}>{esc(d.styleNumber || 'STYLE-000')}</text>
      <text x={PAGE_W / 2} y="355" textAnchor="middle" fontSize="11" fill={FR.stone}>
        {[d.productCategory, d.productTier, d.season].filter(Boolean).join('  ·  ') || '—'}
      </text>
      <g transform="translate(281 420)">
        <rect width="180" height="80" fill={FR.salt} stroke={FR.sand} />
        <text x="90" y="30" textAnchor="middle" fontSize="9" fill={FR.soil} letterSpacing="0.5" fontWeight="bold">BOM ITEMS</text>
        <text x="90" y="60" textAnchor="middle" fontSize="26" fill={FR.slate} fontFamily="'Cormorant Garamond', serif">{bomCount}</text>
      </g>
      <g transform="translate(471 420)">
        <rect width="180" height="80" fill={FR.salt} stroke={FR.sand} />
        <text x="90" y="30" textAnchor="middle" fontSize="9" fill={FR.soil} letterSpacing="0.5" fontWeight="bold">POMs</text>
        <text x="90" y="60" textAnchor="middle" fontSize="26" fill={FR.slate} fontFamily="'Cormorant Garamond', serif">{pomCount}</text>
      </g>
      <g transform="translate(661 420)">
        <rect width="180" height="80" fill={FR.salt} stroke={FR.sand} />
        <text x="90" y="30" textAnchor="middle" fontSize="9" fill={FR.soil} letterSpacing="0.5" fontWeight="bold">SEAMS</text>
        <text x="90" y="60" textAnchor="middle" fontSize="26" fill={FR.slate} fontFamily="'Cormorant Garamond', serif">{seamCount}</text>
      </g>
    </g>
  );
}

const PAGE_FNS = [
  { title: 'Cover', body: PageCover },
  { title: 'SKU & Numbering', body: PageSku },
  { title: 'Factory Assignment', body: PageFactory },
  { title: 'Design & Construction', body: PageDesign },
  { title: 'Flat Lay Diagrams', body: PageFlatlays },
  { title: 'Bill of Materials', body: PageBOM },
  { title: 'Color & Artwork', body: PageColor },
  { title: 'Construction Details', body: PageConstruction },
  { title: 'Pattern Pieces & Cutting', body: PagePattern },
  { title: 'Points of Measure', body: PagePOM },
  { title: 'Garment Treatments', body: PageTreatments },
  { title: 'Labels & Packaging', body: PageLabels },
  { title: 'Order & Delivery', body: PageOrder },
  { title: 'Review & Export', body: PageReview },
];

// Step index 0 = Identity, but we show Cover as page 1 of the tech pack.
// To keep it simple: step 0 shows Cover + Identity summary stacked on cover.
// We actually map step 0 → Cover since the title block already carries identity.
// For all other steps, the page matches the form section 1:1.
function PageIdentityCombined({ d }) {
  return (
    <g>
      <PageCover d={d} />
      <g transform="translate(0 10)">
        <PageIdentity d={d} />
      </g>
    </g>
  );
}

export default function TechPackPagePreview({ data, images, step }) {
  const d = data || {};
  const styleInfo = `${d.styleName || 'Untitled'} · ${d.styleNumber || ''}`;
  const totalPages = PAGE_FNS.length;
  const pageNum = Math.min(Math.max(step + 1, 1), totalPages);

  // Step 0 (Identity form) shows a combined Cover + Identity so the cover
  // isn't a blank page while the user fills the first section.
  let Body;
  let title;
  if (step === 0) {
    Body = PageIdentityCombined;
    title = 'Tech Pack';
  } else {
    Body = PAGE_FNS[step]?.body || PageReview;
    title = PAGE_FNS[step]?.title || 'Review';
  }

  return (
    <svg xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      preserveAspectRatio="xMidYMin meet"
      style={{ width: '100%', height: 'auto', background: FR.white, boxShadow: '0 2px 14px rgba(0,0,0,0.12)', borderRadius: 6, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <PageFrame title={title} pageNum={pageNum} totalPages={totalPages} styleInfo={styleInfo}>
        <Body d={d} images={images} />
      </PageFrame>
    </svg>
  );
}
