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
function GridTable({ x, y, cols, rows, bodyRows = 4, rowH = 22, headerH = 22, renderCell }) {
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
              const custom = renderCell && renderCell(c.key, row, colX[ci], ry, c.w);
              if (custom) return <g key={c.key}>{custom}</g>;
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

// ─── Page 5 — Color & Artwork ────────────────────────────────────────────────
function PageColor({ d, images }) {
  const imgs = images || [];
  const front = imgs.find(i => i.slot === 'artwork-front');
  const back  = imgs.find(i => i.slot === 'artwork-back');

  const colorways = (d.colorways || []).filter(c => c && (c.name || c.frColor || c.pantone || c.hex));
  const placements = (d.artworkPlacements || []).filter(r => r.placement || r.artworkFile || r.method || r.sizeCm || r.positionFrom || r.color);

  const cwCols = [
    { key: 'name',           label: 'Colorway Name',   w: 180 },
    { key: 'frColor',        label: 'FR Color',        w: 140 },
    { key: 'pantone',        label: 'Pantone Ref',     w: 150 },
    { key: 'hex',            label: 'Hex',             w: 120 },
    { key: 'fabricSwatch',   label: 'Fabric Swatch',   w: 293 },
    { key: 'approvalStatus', label: 'Approval',        w: 160 },
  ];

  const plCols = [
    { key: 'placement',    label: 'Placement',     w: 150 },
    { key: 'artworkFile',  label: 'Artwork File',  w: 160 },
    { key: 'method',       label: 'Method',        w: 150 },
    { key: 'sizeCm',       label: 'Size (cm)',     w: 110 },
    { key: 'positionFrom', label: 'Position From', w: 170 },
    { key: 'color',        label: 'Color',         w: 130 },
    { key: 'notes',        label: 'Notes',         w: 173 },
  ];

  const renderCWCell = (key, row, x, y, w) => {
    if (key === 'fabricSwatch') {
      const hex = row.hex || '#EBE5D5';
      return (
        <>
          <rect x={x + 6} y={y + 4} width="18" height="14" fill={hex} stroke={FR.sand} />
          <text x={x + 30} y={y + 15} fontSize="9.5" fill={FR.slate}>{clampLine(esc(row.fabricSwatch || row.hex || ''), w - 36, 5.8)}</text>
        </>
      );
    }
    return null;
  };

  // Layout
  const cwY = 158;
  const artY = 315;
  const artH = 170;
  const plY = 540;

  return (
    <g>
      <InfoStrip d={d} />

      <SectionHeading x={40} y={cwY}>Colorway Specification</SectionHeading>
      <GridTable x={40} y={cwY + 12} cols={cwCols} rows={colorways} bodyRows={4} renderCell={renderCWCell} />

      <SectionHeading x={40} y={artY}>Artwork &amp; Logo Placement</SectionHeading>
      <PhotoSlot x={40}                                 y={artY + 20} w={(PAGE_W - 80 - 16) / 2} h={artH} label="Front Artwork" image={front} />
      <PhotoSlot x={40 + (PAGE_W - 80 - 16) / 2 + 16}  y={artY + 20} w={(PAGE_W - 80 - 16) / 2} h={artH} label="Back Artwork"  image={back} />

      <SectionHeading x={40} y={plY}>Placement</SectionHeading>
      <GridTable x={40} y={plY + 12} cols={plCols} rows={placements} bodyRows={5} />
    </g>
  );
}

// ─── Page 6 — Construction Details ───────────────────────────────────────────
function PageConstruction({ d }) {
  const seams = (d.seams || []).filter(r => r.operation || r.seamType || r.stitchType || r.threadColor);
  const notes = (d.constructionNotesTable || []).filter(r => r.area || r.description || r.reference);

  const seamCols = [
    { key: 'operation',   label: 'Operation',     w: 180 },
    { key: 'seamType',    label: 'Seam Type',     w: 150 },
    { key: 'stitchType',  label: 'Stitch Type',   w: 120 },
    { key: 'spiSpcm',     label: 'SPI / SPCM',    w: 110 },
    { key: 'threadColor', label: 'Thread Color',  w: 130 },
    { key: 'threadType',  label: 'Thread Type',   w: 160 },
    { key: 'notes',       label: 'Notes',         w: 193 },
  ];

  const noteCols = [
    { key: '#',           label: 'Detail #',    w: 70  },
    { key: 'area',        label: 'Area',        w: 180 },
    { key: 'description', label: 'Description', w: 540 },
    { key: 'reference',   label: 'Reference',   w: 253 },
  ];

  return (
    <g>
      <InfoStrip d={d} />

      <SectionHeading x={40} y={158}>Seam &amp; Stitch Specification</SectionHeading>
      <GridTable x={40} y={170} cols={seamCols} rows={seams} bodyRows={5} />

      <SectionHeading x={40} y={338}>Construction Notes</SectionHeading>
      <GridTable x={40} y={350} cols={noteCols} rows={notes} bodyRows={6} />
    </g>
  );
}

// ─── Page 7 — Construction Detail Sketches ──────────────────────────────────
function PageSketches({ d, images }) {
  const imgs = images || [];
  const slots = [1, 2, 3, 4, 5, 6].map(n => imgs.find(i => i.slot === `sketch-${n}`));

  const gridY = 160;
  const gridGap = 14;
  const cols = 3;
  const rows = 2;
  const cellW = (PAGE_W - 80 - gridGap * (cols - 1)) / cols;
  const cellH = (PAGE_H - gridY - 90 - gridGap * (rows - 1)) / rows;

  return (
    <g>
      <InfoStrip d={d} />

      <text x={PAGE_W / 2} y={152} textAnchor="middle" fontSize="11" fill={FR.stone} fontStyle="italic">
        Detailed construction sketches: seam closeups, pocket assembly, cuff detail, collar build, etc.
      </text>

      {slots.map((img, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        return (
          <PhotoSlot key={i}
            x={40 + col * (cellW + gridGap)}
            y={gridY + row * (cellH + gridGap)}
            w={cellW} h={cellH - 22}
            label={`Detail ${i + 1}`}
            image={img} />
        );
      })}
    </g>
  );
}

// ─── Page 8 — Pattern Pieces & Cutting ──────────────────────────────────────
function PagePattern({ d, images }) {
  const layout = (images || []).find(i => i.slot === 'pattern-layout');
  const pieces = (d.patternPieces || []).filter(r => r.pieceName || r.pieceNum || r.fabric);

  const cols = [
    { key: 'pieceNum',  label: 'Piece #',            w: 90  },
    { key: 'pieceName', label: 'Piece Name',         w: 220 },
    { key: 'quantity',  label: 'Qty',                w: 70  },
    { key: 'fabric',    label: 'Fabric',             w: 160 },
    { key: 'grain',     label: 'Grain',              w: 130 },
    { key: 'fusing',    label: 'Fusing/Interlining', w: 180 },
    { key: 'notes',     label: 'Notes',              w: 193 },
  ];

  return (
    <g>
      <InfoStrip d={d} />

      <SectionHeading x={40} y={158}>Pattern Pieces Layout</SectionHeading>
      <PhotoSlot x={40} y={175} w={PAGE_W - 80} h={200} label="Pattern Layout" image={layout} />

      <SectionHeading x={40} y={420}>Pattern Piece Index</SectionHeading>
      <GridTable x={40} y={432} cols={cols} rows={pieces} bodyRows={5} />

      <SectionHeading x={40} y={580}>Cutting Instructions</SectionHeading>
      <foreignObject x="40" y="594" width={PAGE_W - 80} height="160">
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 11, color: FR.slate, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {d.cuttingInstructions || '—'}
        </div>
      </foreignObject>
    </g>
  );
}

// ─── Page 9 — Points of Measure ─────────────────────────────────────────────
function PagePom({ d, images }) {
  const diagram = (images || []).find(i => i.slot === 'pom-diagram');
  const poms = (d.poms || []).filter(p => p && (p.name || p.s || p.m || p.l || p.xl));

  const szH = d.sizeType === 'waist'
    ? [{ k: 's', l: 'W30' }, { k: 'm', l: 'W32' }, { k: 'l', l: 'W34' }, { k: 'xl', l: 'W36' }]
    : [{ k: 's', l: 'S' }, { k: 'm', l: 'M' }, { k: 'l', l: 'L' }, { k: 'xl', l: 'XL' }];

  const cols = [
    { key: '#',    label: '#',            w: 36  },
    { key: 'name', label: 'Measurement',  w: 234 },
    { key: 'tol',  label: 'Tol ±',        w: 60  },
    ...szH.map(s => ({ key: s.k, label: s.l, w: 65 })),
  ];

  // Two-column layout
  const diagramW = 440;
  const tableX = 40 + diagramW + 20;
  const tableW = PAGE_W - 40 - tableX;
  // Rescale cols to fit right column
  const scale = tableW / cols.reduce((a, c) => a + c.w, 0);
  const scaledCols = cols.map(c => ({ ...c, w: Math.floor(c.w * scale) }));
  // fix rounding
  const diff = tableW - scaledCols.reduce((a, c) => a + c.w, 0);
  scaledCols[scaledCols.length - 1].w += diff;

  return (
    <g>
      <InfoStrip d={d} />

      <SectionHeading x={40} y={158}>POM Diagram</SectionHeading>
      <PhotoSlot x={40} y={175} w={diagramW} h={420} label="Numbered measurement points" image={diagram} />

      <SectionHeading x={tableX} y={158}>Graded Spec Table (cm)</SectionHeading>
      <GridTable x={tableX} y={170} cols={scaledCols} rows={poms} bodyRows={14} rowH={20} headerH={20} />

      <line x1={40} y1={640} x2={PAGE_W - 40} y2={640} stroke={FR.sand} />
      <text x={40} y={656} fontSize="10" fill={FR.stone} fontStyle="italic">
        All measurements in centimetres. Measure flat, relaxed. Tolerance ±1 cm unless otherwise specified.
      </text>
      <text x={40} y={678} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">MEASUREMENT METHOD</text>
      <foreignObject x="40" y="685" width={PAGE_W - 80} height="60">
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 10, color: FR.slate, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {d.measurementMethod || '—'}
        </div>
      </foreignObject>
    </g>
  );
}

// ─── Page 10 — Garment Treatments ───────────────────────────────────────────
function PageTreatments({ d, images }) {
  const imgs = images || [];
  const before = imgs.find(i => i.slot === 'treatment-before');
  const after  = imgs.find(i => i.slot === 'treatment-after');

  const treatments  = (d.treatments  || []).filter(r => r.step || r.treatment || r.process);
  const distressing = (d.distressing || []).filter(r => r.area || r.technique || r.intensity);

  const tCols = [
    { key: 'step',        label: 'Step',                 w: 60  },
    { key: 'treatment',   label: 'Treatment',            w: 180 },
    { key: 'process',     label: 'Process',              w: 180 },
    { key: 'temperature', label: 'Temp',                 w: 90  },
    { key: 'duration',    label: 'Duration',             w: 100 },
    { key: 'chemicals',   label: 'Chemicals or Agents',  w: 230 },
    { key: 'notes',       label: 'Notes',                w: 203 },
  ];

  const dCols = [
    { key: 'area',           label: 'Area',            w: 180 },
    { key: 'technique',      label: 'Technique',       w: 210 },
    { key: 'intensity',      label: 'Intensity (1-5)', w: 140 },
    { key: 'referenceImage', label: 'Reference Image', w: 260 },
    { key: 'notes',          label: 'Notes',           w: 253 },
  ];

  return (
    <g>
      <InfoStrip d={d} />

      <SectionHeading x={40} y={158}>Wash &amp; Dye Treatments</SectionHeading>
      <GridTable x={40} y={170} cols={tCols} rows={treatments} bodyRows={4} />

      <SectionHeading x={40} y={306}>Distressing &amp; Special Finishes</SectionHeading>
      <GridTable x={40} y={318} cols={dCols} rows={distressing} bodyRows={4} />

      <SectionHeading x={40} y={454}>Before / After Reference</SectionHeading>
      <PhotoSlot x={40}                                 y={475} w={(PAGE_W - 80 - 16) / 2} h={230} label="Before Treatment" image={before} />
      <PhotoSlot x={40 + (PAGE_W - 80 - 16) / 2 + 16}  y={475} w={(PAGE_W - 80 - 16) / 2} h={230} label="After Treatment"  image={after} />
    </g>
  );
}

// ─── Page 11 — Labels & Packaging ────────────────────────────────────────────
function PageLabels({ d, images }) {
  const imgs = images || [];
  const care = imgs.find(i => i.slot === 'label-care');
  const main = imgs.find(i => i.slot === 'label-main');
  const size = imgs.find(i => i.slot === 'label-size');

  const packaging = (d.packagingItems || []).filter(r => r.component || r.material || r.size);

  const pkgCols = [
    { key: 'component',    label: 'Component',        w: 180 },
    { key: 'material',     label: 'Material',         w: 170 },
    { key: 'color',        label: 'Color',            w: 120 },
    { key: 'size',         label: 'Size',             w: 140 },
    { key: 'artworkPrint', label: 'Artwork / Print',  w: 200 },
    { key: 'qtyPerOrder',  label: 'Qty / Order',      w: 110 },
    { key: 'notes',        label: 'Notes',            w: 123 },
  ];

  const careLines = (d.careInstructions || '').split('\n').filter(Boolean);

  // Layout: left column = 3 label photo slots stacked, right column = care lines
  const labelY = 160;
  const labelGap = 12;
  const labelW = 260;
  const labelH = 100;
  const careX = 40 + labelW + 30;
  const careW = PAGE_W - 40 - careX;

  return (
    <g>
      <InfoStrip d={d} />

      <SectionHeading x={40} y={152}>Care &amp; Content Labels</SectionHeading>

      <PhotoSlot x={40} y={labelY + 8}                             w={labelW} h={labelH} label="Care Label" image={care} />
      <PhotoSlot x={40} y={labelY + 8 + (labelH + 22 + labelGap)}  w={labelW} h={labelH} label="Main Label" image={main} />
      <PhotoSlot x={40} y={labelY + 8 + (labelH + 22 + labelGap) * 2} w={labelW} h={labelH} label="Size Label" image={size} />

      {/* Care instructions on the right */}
      <text x={careX} y={labelY + 22} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">CARE INSTRUCTIONS</text>
      {careLines.length === 0 ? (
        <text x={careX} y={labelY + 46} fontSize="10" fill={FR.stone} fontStyle="italic">No care instructions yet</text>
      ) : (
        careLines.map((line, i) => (
          <g key={i}>
            <rect x={careX} y={labelY + 34 + i * 26} width={careW} height={22} fill={i % 2 === 0 ? FR.salt : FR.white} stroke={FR.sand} />
            <text x={careX + 10} y={labelY + 49 + i * 26} fontSize="10.5" fill={FR.slate}>
              {clampLine(esc(line), careW - 20, 6)}
            </text>
          </g>
        ))
      )}

      <SectionHeading x={40} y={566}>Packaging Specification</SectionHeading>
      <GridTable x={40} y={578} cols={pkgCols} rows={packaging} bodyRows={5} />
    </g>
  );
}

// ─── Page 12 — Order & Delivery ──────────────────────────────────────────────
function PageOrder({ d }) {
  const qty = (d.quantities || []).filter(r => r.colorway || r.s || r.m || r.l || r.xl || r.unitCost);
  const cartons = (d.cartons || []).filter(r => r.cartonNum || r.colorway || r.qtyPerCarton);

  const qtyCols = [
    { key: 'colorway',    label: 'Colorway',    w: 200 },
    { key: 's',           label: 'S',           w: 70  },
    { key: 'm',           label: 'M',           w: 70  },
    { key: 'l',           label: 'L',           w: 70  },
    { key: 'xl',          label: 'XL',          w: 70  },
    { key: '__total',     label: 'Total Units', w: 130 },
    { key: 'unitCost',    label: 'Unit Cost',   w: 130 },
    { key: '__totalCost', label: 'Total Cost',  w: 303 },
  ];

  const renderQtyCell = (key, row, x, y, w) => {
    const toNum = (v) => parseFloat(v) || 0;
    const totalUnits = toNum(row.s) + toNum(row.m) + toNum(row.l) + toNum(row.xl);
    const totalCost = totalUnits * toNum(row.unitCost);
    if (key === '__total') {
      return <text x={x + 6} y={y + 15} fontSize="9.5" fill={FR.slate}>{totalUnits || '—'}</text>;
    }
    if (key === '__totalCost') {
      return <text x={x + 6} y={y + 15} fontSize="9.5" fill={FR.slate}>{totalCost > 0 ? `$${totalCost.toFixed(2)}` : '—'}</text>;
    }
    if (key === 'unitCost') {
      return <text x={x + 6} y={y + 15} fontSize="9.5" fill={FR.slate}>{row.unitCost ? `$${row.unitCost}` : '—'}</text>;
    }
    return null;
  };

  const orderTotal = qty.reduce((sum, r) => {
    const toNum = (v) => parseFloat(v) || 0;
    const totalUnits = toNum(r.s) + toNum(r.m) + toNum(r.l) + toNum(r.xl);
    return sum + totalUnits * toNum(r.unitCost);
  }, 0);

  const pkCols = [
    { key: 'cartonNum',     label: 'Carton #',           w: 80  },
    { key: 'colorway',      label: 'Colorway',           w: 180 },
    { key: 'sizeBreakdown', label: 'Size Breakdown',     w: 200 },
    { key: 'qtyPerCarton',  label: 'Qty / Carton',       w: 110 },
    { key: 'dims',          label: 'Carton Dims (cm)',   w: 150 },
    { key: 'grossWeight',   label: 'Gross Weight (kg)',  w: 160 },
    { key: 'netWeight',     label: 'Net Weight (kg)',    w: 163 },
  ];

  // Delivery key/value pairs
  const deliveryRows = [
    ['Ship To',              d.shipTo],
    ['Delivery Location',    d.deliveryLocation],
    ['Ship Method',          d.shipMethod],
    ['Incoterm',             d.incoterm],
    ['Freight Forwarder',    d.freightForwarder],
    ['Target Ship Date',     d.targetShipDate],
    ['Target Arrival Date',  d.targetArrivalDate],
    ['Special Instructions', d.specialInstructions],
  ];

  // Layout
  const qtyY = 158;
  const qtyBody = 4;
  const qtyH = 22 + qtyBody * 22;
  const totalY = qtyY + 12 + qtyH;
  const delY = totalY + 42;
  const delRowH = 22;
  const packY = delY + 24 + 4 * delRowH * 2;

  return (
    <g>
      <InfoStrip d={d} />

      <SectionHeading x={40} y={qtyY}>Quantity Per Size</SectionHeading>
      <GridTable x={40} y={qtyY + 12} cols={qtyCols} rows={qty} bodyRows={qtyBody} renderCell={renderQtyCell} />

      {/* Order total row */}
      <rect x={40} y={totalY} width={PAGE_W - 80} height="28" fill={FR.slate} />
      <text x={50} y={totalY + 18} fontSize="10" fontWeight="bold" fill={FR.salt} letterSpacing="2">ORDER TOTAL</text>
      <text x={PAGE_W - 50} y={totalY + 19} textAnchor="end" fontSize="13" fontWeight="bold" fill={FR.salt}>${orderTotal.toFixed(2)}</text>

      <SectionHeading x={40} y={delY}>Delivery Details</SectionHeading>
      {(() => {
        const tX = 40;
        const tY = delY + 12;
        const tW = PAGE_W - 80;
        const labelW = 220;
        return (
          <g>
            <rect x={tX} y={tY} width={tW} height={22} fill={FR.slate} />
            <text x={tX + 8} y={tY + 15} fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="0.5">FIELD</text>
            <text x={tX + labelW + 8} y={tY + 15} fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="0.5">DETAIL</text>
            {deliveryRows.map(([label, value], i) => {
              const ry = tY + 22 + i * delRowH;
              return (
                <g key={label}>
                  {i % 2 === 0 && <rect x={tX} y={ry} width={tW} height={delRowH} fill={FR.salt} />}
                  <line x1={tX} y1={ry + delRowH} x2={tX + tW} y2={ry + delRowH} stroke={FR.sand} />
                  <text x={tX + 8} y={ry + 15} fontSize="9.5" fontWeight="bold" fill={FR.soil}>{esc(label.toUpperCase())}</text>
                  <text x={tX + labelW + 8} y={ry + 15} fontSize="10" fill={FR.slate}>{clampLine(esc(value || '—'), tW - labelW - 20, 6)}</text>
                </g>
              );
            })}
          </g>
        );
      })()}

      <SectionHeading x={40} y={packY}>Packing List</SectionHeading>
      <GridTable x={40} y={packY + 12} cols={pkCols} rows={cartons} bodyRows={3} />
    </g>
  );
}

// ─── Page 13 — Compliance & Quality ──────────────────────────────────────────
function PageCompliance({ d }) {
  const shipping = (d.shippingReqs || []).filter(r => r.requirement || r.specification || r.notes);
  const tests    = (d.testingStandards || []).filter(r => r.test || r.standard || r.requirement);
  const matrix   = (d.barcodeMatrix || []).filter(r => r.size || r.sku || r.upc || r.colorCode);

  const shipCols = [
    { key: 'requirement',   label: 'Requirement',   w: 260 },
    { key: 'specification', label: 'Specification', w: 460 },
    { key: 'notes',         label: 'Notes',         w: 323 },
  ];
  const testCols = [
    { key: 'test',        label: 'Test',        w: 200 },
    { key: 'standard',    label: 'Standard',    w: 200 },
    { key: 'requirement', label: 'Requirement', w: 240 },
    { key: 'testMethod',  label: 'Test Method', w: 230 },
    { key: 'passFail',    label: 'Pass-Fail',   w: 173 },
  ];
  const matrixCols = [
    { key: 'size',             label: 'Size',              w: 100 },
    { key: 'sku',              label: 'SKU',               w: 240 },
    { key: 'upc',              label: 'UPC or Barcode',    w: 210 },
    { key: 'colorCode',        label: 'Color Code',        w: 193 },
    { key: 'shopifyVariantId', label: 'Shopify Variant ID',w: 300 },
  ];

  return (
    <g>
      <InfoStrip d={d} />

      <SectionHeading x={40} y={158}>Shipping Requirements</SectionHeading>
      <GridTable x={40} y={170} cols={shipCols} rows={shipping} bodyRows={3} />

      <SectionHeading x={40} y={290}>Quality &amp; Testing Standards</SectionHeading>
      <GridTable x={40} y={302} cols={testCols} rows={tests} bodyRows={4} />

      <SectionHeading x={40} y={434}>Barcode &amp; SKU Matrix</SectionHeading>
      <GridTable x={40} y={446} cols={matrixCols} rows={matrix} bodyRows={10} />
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
  { title: 'Color & Artwork',              body: ({ d, images }) => <PageColor d={d} images={images} /> },
  { title: 'Construction Details',         body: ({ d }) => <PageConstruction d={d} /> },
  { title: 'Construction Detail Sketches', body: ({ d, images }) => <PageSketches d={d} images={images} /> },
  { title: 'Pattern Pieces & Cutting',     body: ({ d, images }) => <PagePattern d={d} images={images} /> },
  { title: 'Points of Measure',            body: ({ d, images }) => <PagePom d={d} images={images} /> },
  { title: 'Garment Treatments',           body: ({ d, images }) => <PageTreatments d={d} images={images} /> },
  { title: 'Labels & Packaging',           body: ({ d, images }) => <PageLabels d={d} images={images} /> },
  { title: 'Order & Delivery',             body: ({ d }) => <PageOrder d={d} /> },
  { title: 'Compliance & Quality',         body: ({ d }) => <PageCompliance d={d} /> },
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
