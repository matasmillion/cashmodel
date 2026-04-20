// Live A4-landscape page preview for the Tech Pack builder.
// 14 pages matching FR_TechPack_Template_Blank.pdf. Page 1 is fully rendered;
// pages 2–14 render a "coming soon" placeholder with the correct title until
// later prompts fill them in.

import { FR } from './techPackConstants';

const PAGE_W = 1123;
const PAGE_H = 794;
const TOTAL_PAGES = 14;

function esc(s) { return String(s ?? ''); }
function clampLine(s, maxW, charW = 6.5) {
  const max = Math.floor(maxW / charW);
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + '…';
}

function PageFrame({ title, pageNum, styleInfo, children }) {
  return (
    <g>
      <rect x="0" y="0" width={PAGE_W} height={PAGE_H} fill={FR.white} />
      <rect x="0" y="0" width={PAGE_W} height={70} fill={FR.slate} />
      <text x="40" y="28" fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="3">FOREIGN RESOURCE CO.</text>
      <text x={PAGE_W / 2} y="44" textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="20" fill={FR.salt}>{title}</text>
      <text x={PAGE_W - 40} y="28" textAnchor="end" fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="2">PAGE {pageNum} / {TOTAL_PAGES}</text>
      <rect x="0" y="70" width={PAGE_W} height={2} fill={FR.soil} />
      <text x="40" y="775" fontSize="9" fill={FR.stone}>{styleInfo}</text>
      <text x={PAGE_W - 40} y="775" textAnchor="end" fontSize="9" fill={FR.stone}>PAGE {pageNum} / {TOTAL_PAGES}</text>
      {children}
    </g>
  );
}

// ─── Page 1 — Cover & Identity ──────────────────────────────────────────────
function MetaRow({ x, y, label, value, w = 400 }) {
  return (
    <g>
      <text x={x} y={y} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">{esc((label || '').toUpperCase())}</text>
      <text x={x} y={y + 16} fontSize="11" fill={FR.slate}>{clampLine(esc(value || '—'), w, 6.5)}</text>
      <line x1={x} y1={y + 22} x2={x + w} y2={y + 22} stroke={FR.sand} />
    </g>
  );
}

function PageCover({ d, images }) {
  const cover = (images || []).find(img => img.slot === 'cover');
  const colorways = (d.colorways || []).filter(c => c && c.name).map(c => c.name).join(', ') || '—';
  const sig = (s) => s && s.name ? `${s.name}${s.date ? ` · ${s.date}` : ''}` : '—';

  return (
    <g>
      {/* Tech Pack wordmark + style name */}
      <text x={40} y={120} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="46" fill={FR.slate}>Tech Pack</text>
      <rect x={40} y={132} width="100" height="2" fill={FR.soil} />
      <text x={40} y={168} fontSize="16" fill={FR.stone}>
        {clampLine(d.styleName || 'Untitled Style', 700, 9)}
      </text>
      <text x={40} y={192} fontSize="11" fill={FR.soil}>
        {esc(d.styleNumber || 'STYLE-000')}
      </text>

      {/* Product render on the right */}
      {cover
        ? <image href={cover.data} x={PAGE_W - 360 - 40} y={100} width="360" height="240" preserveAspectRatio="xMidYMid meet" />
        : (
          <g>
            <rect x={PAGE_W - 360 - 40} y={100} width="360" height="240" fill={FR.salt} stroke={FR.sand} strokeDasharray="6 6" />
            <text x={PAGE_W - 180 - 40} y={225} textAnchor="middle" fontSize="11" fill={FR.stone} fontStyle="italic">Product render goes here</text>
          </g>
        )}

      {/* Section divider */}
      <rect x="40" y="360" width={PAGE_W - 80} height="1" fill={FR.sand} />
      <text x={40} y={380} fontSize="10" fontWeight="bold" fill={FR.soil} letterSpacing="2">STYLE SUMMARY</text>

      {/* Two-column metadata */}
      {(() => {
        const leftX = 40;
        const rightX = PAGE_W / 2 + 20;
        const colW = PAGE_W / 2 - 60;
        const startY = 410;
        const gap = 50;
        const left = [
          { label: 'Style #',        value: d.styleNumber },
          { label: 'SKU Prefix',     value: d.skuPrefix },
          { label: 'Product Tier',   value: d.productTier },
          { label: 'Season',         value: d.season },
          { label: 'Date Created',   value: d.dateCreated },
          { label: 'Revision',       value: d.revision },
          { label: 'Designed By',    value: sig(d.designedBy) },
        ];
        const right = [
          { label: 'Factory',           value: d.factory },
          { label: 'Colorways',         value: colorways },
          { label: 'Size Range',        value: d.sizeRange },
          { label: 'Target Retail ($)', value: d.targetRetail },
          { label: 'Target FOB ($)',    value: d.targetFOB },
          { label: 'Status',            value: d.status },
          { label: 'Approved By',       value: sig(d.approvedBy) },
        ];
        return (
          <>
            {left.map((f, i)  => <MetaRow key={`L${i}`} x={leftX}  y={startY + i * gap} label={f.label} value={f.value} w={colW} />)}
            {right.map((f, i) => <MetaRow key={`R${i}`} x={rightX} y={startY + i * gap} label={f.label} value={f.value} w={colW} />)}
            <MetaRow x={rightX} y={startY + 7 * gap} label="Factory Confirmed" value={sig(d.factoryConfirmed)} w={colW} />
          </>
        );
      })()}
    </g>
  );
}

// ─── Shared info strip (pages 2+) ───────────────────────────────────────────
function InfoStripCell({ x, y, w, label, value }) {
  return (
    <g>
      <text x={x + 10} y={y + 14} fontSize="7.5" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">{esc((label || '').toUpperCase())}</text>
      <text x={x + 10} y={y + 30} fontSize="10.5" fill={FR.slate}>{clampLine(esc(value || '—'), w - 20, 6)}</text>
    </g>
  );
}

function InfoStrip({ d }) {
  const y = 90;
  const h = 44;
  const cells = [
    { label: 'Style #',     value: d.styleNumber },
    { label: 'Style Name',  value: d.styleName },
    { label: 'Season',      value: d.season },
    { label: 'Date',        value: d.dateCreated },
    { label: 'Colorway',    value: ((d.colorways || []).find(c => c && c.name) || {}).name || '—' },
    { label: 'Size Range',  value: d.sizeRange },
  ];
  const cellW = (PAGE_W - 80) / cells.length;
  return (
    <g>
      <rect x={40} y={y} width={PAGE_W - 80} height={h} fill={FR.salt} stroke={FR.sand} />
      {cells.map((c, i) => (
        <InfoStripCell key={i} x={40 + i * cellW} y={y} w={cellW} label={c.label} value={c.value} />
      ))}
    </g>
  );
}

function SectionHeading({ x, y, children }) {
  return (
    <g>
      <text x={x} y={y} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="17" fill={FR.slate}>{children}</text>
      <rect x={x} y={y + 4} width="54" height="2" fill={FR.soil} />
    </g>
  );
}

function PhotoSlot({ x, y, w, h, label, image, placeholder }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={FR.white} stroke={FR.soil} strokeDasharray="5 4" />
      {image
        ? <image href={image.data} x={x + 4} y={y + 4} width={w - 8} height={h - 8} preserveAspectRatio="xMidYMid meet" />
        : (
          <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize="11" fill={FR.stone} fontStyle="italic">
            {placeholder || `Drop ${label.toLowerCase()} here`}
          </text>
        )}
      <rect x={x} y={y + h} width={w} height={22} fill={FR.salt} stroke={FR.sand} />
      <text x={x + w / 2} y={y + h + 15} textAnchor="middle" fontSize="9" fontWeight="bold" fill={FR.slate} letterSpacing="1.5">
        {esc((label || '').toUpperCase())}
      </text>
    </g>
  );
}

// ─── Page 2 — Design Overview ───────────────────────────────────────────────
function PageDesignOverview({ d, images }) {
  const imgs = images || [];
  const front = imgs.find(i => i.slot === 'design-front');
  const back  = imgs.find(i => i.slot === 'design-back');
  const side  = imgs.find(i => i.slot === 'design-side');

  const notes = (d.keyDesignNotes || []).filter(n => n.detail || n.description || n.reference);

  // Info row: Factory / Contact / Fabric Type
  const infoY = 155;
  // Photo slots
  const drawY = 210;
  const drawH = 250;
  const drawGap = 16;
  const drawW = (PAGE_W - 80 - drawGap * 2) / 3;
  // Table
  const tableY = 520;
  const tableW = PAGE_W - 80;

  return (
    <g>
      <InfoStrip d={d} />

      {/* Factory row */}
      <MetaRow x={40}                          y={infoY} label="Factory"         value={d.factory}        w={(PAGE_W - 80 - 20) / 3} />
      <MetaRow x={40 + (PAGE_W - 80) / 3}      y={infoY} label="Factory Contact" value={d.factoryContact} w={(PAGE_W - 80 - 20) / 3} />
      <MetaRow x={40 + (PAGE_W - 80) * 2 / 3}  y={infoY} label="Fabric Type"     value={d.fabricType}     w={(PAGE_W - 80 - 20) / 3} />

      {/* Three photo slots */}
      <PhotoSlot x={40}                         y={drawY} w={drawW} h={drawH} label="Front View" image={front} />
      <PhotoSlot x={40 + drawW + drawGap}       y={drawY} w={drawW} h={drawH} label="Back View"  image={back} />
      <PhotoSlot x={40 + (drawW + drawGap) * 2} y={drawY} w={drawW} h={drawH} label="Side View"  image={side} />

      {/* Key Design Notes table */}
      <SectionHeading x={40} y={tableY}>Key Design Notes</SectionHeading>
      {(() => {
        const cols = [
          { key: '#',           label: '#',            w: 40 },
          { key: 'detail',      label: 'Detail',       w: 200 },
          { key: 'description', label: 'Description',  w: 533 },
          { key: 'reference',   label: 'Reference',    w: 270 },
        ];
        const headerY = tableY + 12;
        const rowH = 22;
        const tableW2 = cols.reduce((a, c) => a + c.w, 0);
        let cx = 40;
        const colX = cols.map(c => { const x = cx; cx += c.w; return x; });
        return (
          <g>
            <rect x={40} y={headerY} width={tableW2} height={rowH} fill={FR.slate} />
            {cols.map((c, i) => (
              <text key={c.key} x={colX[i] + 8} y={headerY + 15} fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="0.5">{esc(c.label.toUpperCase())}</text>
            ))}
            {Array.from({ length: 5 }).map((_, ri) => {
              const ry = headerY + rowH + ri * rowH;
              const row = notes[ri];
              return (
                <g key={ri}>
                  {ri % 2 === 0 && <rect x={40} y={ry} width={tableW2} height={rowH} fill={FR.salt} />}
                  <line x1={40} y1={ry + rowH} x2={40 + tableW2} y2={ry + rowH} stroke={FR.sand} />
                  <text x={colX[0] + 8} y={ry + 15} fontSize="10" fill={FR.stone}>{ri + 1}</text>
                  {row && (
                    <>
                      <text x={colX[1] + 8} y={ry + 15} fontSize="10" fill={FR.slate}>{clampLine(esc(row.detail || ''),      cols[1].w - 16, 5.8)}</text>
                      <text x={colX[2] + 8} y={ry + 15} fontSize="10" fill={FR.slate}>{clampLine(esc(row.description || ''), cols[2].w - 16, 5.8)}</text>
                      <text x={colX[3] + 8} y={ry + 15} fontSize="10" fill={FR.slate}>{clampLine(esc(row.reference || ''),   cols[3].w - 16, 5.8)}</text>
                    </>
                  )}
                </g>
              );
            })}
          </g>
        );
      })()}
    </g>
  );
}

// ─── Page 3 — Technical Flat Lay Diagrams ────────────────────────────────────
function PageFlatlays({ d, images }) {
  const imgs = images || [];
  const tl = imgs.find(i => i.slot === 'flatlay-tl');
  const tr = imgs.find(i => i.slot === 'flatlay-tr');
  const bl = imgs.find(i => i.slot === 'flatlay-bl');
  const br = imgs.find(i => i.slot === 'flatlay-br');

  // Grid layout
  const gridY = 170;
  const gridGap = 18;
  const cellW = (PAGE_W - 80 - gridGap) / 2;
  const cellH = (PAGE_H - gridY - 90 - gridGap) / 2;

  return (
    <g>
      <InfoStrip d={d} />

      <text x={PAGE_W / 2} y={152} textAnchor="middle" fontSize="11" fill={FR.stone} fontStyle="italic">
        Place annotated flat lay diagrams below. Front, back, and detail views.
      </text>

      <PhotoSlot x={40}                  y={gridY}                    w={cellW} h={cellH} label="Top Left"     image={tl} />
      <PhotoSlot x={40 + cellW + gridGap} y={gridY}                    w={cellW} h={cellH} label="Top Right"    image={tr} />
      <PhotoSlot x={40}                  y={gridY + cellH + gridGap}  w={cellW} h={cellH} label="Bottom Left"  image={bl} />
      <PhotoSlot x={40 + cellW + gridGap} y={gridY + cellH + gridGap}  w={cellW} h={cellH} label="Bottom Right" image={br} />
    </g>
  );
}

// ─── Generic table for rendering ArrayTables on preview pages ───────────────
function GridTable({ x, y, cols, rows, bodyRows = 4, rowH = 22, headerH = 22 }) {
  const tableW = cols.reduce((a, c) => a + c.w, 0);
  let cx = x;
  const colX = cols.map(c => { const xx = cx; cx += c.w; return xx; });
  return (
    <g>
      <rect x={x} y={y} width={tableW} height={headerH} fill={FR.slate} />
      {cols.map((c, i) => (
        <text key={c.key} x={colX[i] + 6} y={y + 15} fontSize="8.5" fontWeight="bold" fill={FR.salt} letterSpacing="0.5">
          {esc((c.label || c.key).toUpperCase())}
        </text>
      ))}
      {Array.from({ length: bodyRows }).map((_, ri) => {
        const ry = y + headerH + ri * rowH;
        const row = rows[ri];
        return (
          <g key={ri}>
            {ri % 2 === 0 && <rect x={x} y={ry} width={tableW} height={rowH} fill={FR.salt} />}
            <line x1={x} y1={ry + rowH} x2={x + tableW} y2={ry + rowH} stroke={FR.sand} />
            {row && cols.map((c, ci) => {
              const val = c.key === '#' ? String(ri + 1) : (row[c.key] ?? '');
              return (
                <text key={c.key} x={colX[ci] + 6} y={ry + 15} fontSize="9.5" fill={c.key === '#' ? FR.stone : FR.slate}>
                  {clampLine(esc(val), c.w - 12, 5.6)}
                </text>
              );
            })}
            {!row && <text x={colX[0] + 6} y={ry + 15} fontSize="9.5" fill={FR.sand}>{ri + 1}</text>}
          </g>
        );
      })}
    </g>
  );
}

// ─── Page 4 — Bill of Materials ─────────────────────────────────────────────
function PageBOM({ d }) {
  const fabrics = (d.fabrics || []).filter(r => r.component || r.fabricType || r.composition);
  const trims   = (d.trimsAccessories || []).filter(r => r.component || r.type || r.material);
  const labels  = (d.labelsBranding || []).filter(r => r.labelType || r.material || r.placement);

  const fabCols = [
    { key: 'component',    label: 'Component',    w: 120 },
    { key: 'fabricType',   label: 'Fabric Type',  w: 140 },
    { key: 'composition',  label: 'Composition',  w: 170 },
    { key: 'weightGsm',    label: 'Weight (GSM)', w: 110 },
    { key: 'colorPantone', label: 'Color / Pantone', w: 150 },
    { key: 'supplier',     label: 'Supplier',     w: 170 },
    { key: 'notes',        label: 'Notes',        w: 183 },
  ];

  const trimCols = [
    { key: 'component',     label: 'Component',   w: 140 },
    { key: 'type',          label: 'Type',        w: 160 },
    { key: 'material',      label: 'Material',    w: 150 },
    { key: 'color',         label: 'Color',       w: 120 },
    { key: 'sizeSpec',      label: 'Size / Spec', w: 130 },
    { key: 'supplier',      label: 'Supplier',    w: 180 },
    { key: 'qtyPerGarment', label: 'Qty/Garment', w: 163 },
  ];

  const labelCols = [
    { key: 'labelType',  label: 'Label Type',  w: 160 },
    { key: 'material',   label: 'Material',    w: 140 },
    { key: 'size',       label: 'Size',        w: 130 },
    { key: 'placement',  label: 'Placement',   w: 180 },
    { key: 'artworkRef', label: 'Artwork Ref', w: 200 },
    { key: 'notes',      label: 'Notes',       w: 233 },
  ];

  return (
    <g>
      <InfoStrip d={d} />

      <SectionHeading x={40} y={158}>Fabrics</SectionHeading>
      <GridTable x={40} y={170} cols={fabCols} rows={fabrics} bodyRows={3} />

      <SectionHeading x={40} y={280}>Trims &amp; Accessories</SectionHeading>
      <GridTable x={40} y={292} cols={trimCols} rows={trims} bodyRows={4} />

      <SectionHeading x={40} y={424}>Labels &amp; Branding</SectionHeading>
      <GridTable x={40} y={436} cols={labelCols} rows={labels} bodyRows={4} />
    </g>
  );
}

// ─── Placeholder for pages 2–14 ─────────────────────────────────────────────
function ComingSoon({ pageNum, title }) {
  return (
    <g>
      <rect x={120} y={260} width={PAGE_W - 240} height={260} fill={FR.salt} stroke={FR.sand} strokeDasharray="6 6" />
      <text x={PAGE_W / 2} y={360} textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="36" fill={FR.slate}>
        {esc(title)}
      </text>
      <text x={PAGE_W / 2} y={405} textAnchor="middle" fontSize="14" fill={FR.soil} letterSpacing="1">
        Page {pageNum} / {TOTAL_PAGES} — Coming soon
      </text>
    </g>
  );
}

const PAGE_FNS = [
  { title: 'Cover & Identity',             body: ({ d, images }) => <PageCover d={d} images={images} /> },
  { title: 'Design Overview',              body: ({ d, images }) => <PageDesignOverview d={d} images={images} /> },
  { title: 'Technical Flat Lay Diagrams',  body: ({ d, images }) => <PageFlatlays d={d} images={images} /> },
  { title: 'Bill of Materials',            body: ({ d }) => <PageBOM d={d} /> },
  { title: 'Color & Artwork',              body: () => <ComingSoon pageNum={5}  title="Color & Artwork" /> },
  { title: 'Construction Details',         body: () => <ComingSoon pageNum={6}  title="Construction Details" /> },
  { title: 'Construction Detail Sketches', body: () => <ComingSoon pageNum={7}  title="Construction Detail Sketches" /> },
  { title: 'Pattern Pieces & Cutting',     body: () => <ComingSoon pageNum={8}  title="Pattern Pieces & Cutting" /> },
  { title: 'Points of Measure',            body: () => <ComingSoon pageNum={9}  title="Points of Measure" /> },
  { title: 'Garment Treatments',           body: () => <ComingSoon pageNum={10} title="Garment Treatments" /> },
  { title: 'Labels & Packaging',           body: () => <ComingSoon pageNum={11} title="Labels & Packaging" /> },
  { title: 'Order & Delivery',             body: () => <ComingSoon pageNum={12} title="Order & Delivery" /> },
  { title: 'Compliance & Quality',         body: () => <ComingSoon pageNum={13} title="Compliance & Quality" /> },
  { title: 'Revision History & Approval',  body: () => <ComingSoon pageNum={14} title="Revision History & Approval" /> },
];

export default function TechPackPagePreview({ data, images, step }) {
  const d = data || {};
  const styleInfo = `© 2026 Foreign Resource Co. — Confidential Tech Pack`;
  const pageNum = Math.min(Math.max((step ?? 0) + 1, 1), TOTAL_PAGES);
  const current = PAGE_FNS[step] || PAGE_FNS[0];
  const Body = current.body;

  return (
    <svg xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      preserveAspectRatio="xMidYMin meet"
      style={{ width: '100%', height: 'auto', background: FR.white, boxShadow: '0 2px 14px rgba(0,0,0,0.12)', borderRadius: 6, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <PageFrame title={current.title} pageNum={pageNum} styleInfo={styleInfo}>
        <Body d={d} images={images} />
      </PageFrame>
    </svg>
  );
}
