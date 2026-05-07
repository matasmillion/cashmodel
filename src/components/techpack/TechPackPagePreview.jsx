// Live A4-landscape page preview for the Tech Pack builder.
// 14 pages matching FR_TechPack_Template_Blank.pdf. Page 1 is fully rendered;
// pages 2–14 render a "coming soon" placeholder with the correct title until
// later prompts fill them in.

import { FR } from './techPackConstants';

const PAGE_W = 1123;
const PAGE_H = 794;
const TOTAL_PAGES = 19;

function esc(s) { return String(s ?? ''); }
function clampLine(s, maxW, charW = 6.5) {
  const max = Math.floor(maxW / charW);
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + '…';
}

function PageFrame({ title, phase, pageNum, styleInfo, children }) {
  return (
    <g>
      <rect x="0" y="0" width={PAGE_W} height={PAGE_H} fill={FR.white} />
      <rect x="0" y="0" width={PAGE_W} height={70} fill={FR.slate} />
      <text x="40" y="28" fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="3">FOREIGN RESOURCE CO.</text>
      {phase && (
        <text x="40" y="50" fontSize="8" fill={FR.sand} letterSpacing="2">{esc(phase.toUpperCase())}</text>
      )}
      <text x={PAGE_W / 2} y="44" textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="20" fill={FR.salt}>{title}</text>
      <text x={PAGE_W - 40} y="28" textAnchor="end" fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="2">PAGE {pageNum} / {TOTAL_PAGES}</text>
      <rect x="0" y="70" width={PAGE_W} height={2} fill={FR.soil} />
      <text x="40" y="775" fontSize="9" fill={FR.stone}>{styleInfo}</text>
      <text x={PAGE_W - 40} y="775" textAnchor="end" fontSize="9" fill={FR.stone}>PAGE {pageNum} / {TOTAL_PAGES}</text>
      {children}
    </g>
  );
}

// ─── Page 1 — Style Overview ──────────────────────────────────────────────
function MetaRow({ x, y, label, value, w = 400 }) {
  return (
    <g>
      <text x={x} y={y} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">{esc((label || '').toUpperCase())}</text>
      <text x={x} y={y + 16} fontSize="11" fill={FR.slate}>{clampLine(esc(value || '—'), w, 6.5)}</text>
      <line x1={x} y1={y + 22} x2={x + w} y2={y + 22} stroke={FR.sand} />
    </g>
  );
}

// Compact stat block: small uppercase label above a larger value. Used to
// build the grouped info bands on the cover page.
function StatBlock({ x, y, label, value, valueSize = 13, mono = false }) {
  return (
    <g>
      <text x={x} y={y} fontSize="7.5" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">{esc((label || '').toUpperCase())}</text>
      <text x={x} y={y + 18} fontSize={valueSize} fill={FR.slate}
        fontFamily={mono ? "ui-monospace, 'SF Mono', Menlo, monospace" : "Helvetica, Arial, sans-serif"}>
        {esc(value || '—')}
      </text>
    </g>
  );
}

function PageCover({ d, images }) {
  const cover = (images || []).find(img => img.slot === 'cover');
  const colorways = (d.colorways || []).filter(c => c && c.name).map(c => c.name);
  const colorwaysText = colorways.length ? colorways.join(' · ') : '—';
  const sizeRange = Array.isArray(d.sizeRange) ? d.sizeRange.join(' · ') : (d.sizeRange || '—');
  const maxFOB = d.maxFOB != null && d.maxFOB !== '' ? `$${parseFloat(d.maxFOB).toFixed(2)}` : '—';
  const targetRetail = d.targetRetail ? `$${parseFloat(d.targetRetail).toFixed(2)}` : '—';

  // Cover image: 2:3 portrait, right column
  const imgW = 280;
  const imgH = imgW * 3 / 2; // 420
  const imgX = PAGE_W - imgW - 40;
  const imgY = 100;
  const leftX = 40;
  const leftW = imgX - 60; // ≈ 743 px

  return (
    <g>
      {/* ── Right column: 2:3 cover image ─────────────────────────────────── */}
      {cover
        ? <image href={cover.data} x={imgX} y={imgY} width={imgW} height={imgH} preserveAspectRatio="xMidYMid slice" />
        : (
          <g>
            <rect x={imgX} y={imgY} width={imgW} height={imgH} fill={FR.salt} stroke={FR.sand} strokeDasharray="6 6" />
            <text x={imgX + imgW / 2} y={imgY + imgH / 2} textAnchor="middle" fontSize="10" fill={FR.stone} fontStyle="italic">Product render goes here</text>
          </g>
        )}

      {/* ── Hero: Tech Pack wordmark + style number ──────────────────────── */}
      <text x={leftX} y={140} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="46" fill={FR.slate}>Tech Pack</text>
      <rect x={leftX} y={150} width="60" height="2" fill={FR.soil} />
      <text x={leftX} y={188} fontFamily="ui-monospace, 'SF Mono', Menlo, monospace" fontSize="20" fill={FR.slate} letterSpacing="2">
        {clampLine(d.styleNumber || 'Untitled Style', leftW, 11)}
      </text>
      <text x={leftX} y={208} fontSize="11" fill={FR.stone} letterSpacing="0.5">
        {[d.collection, d.productType, d.season].filter(Boolean).join('  ·  ') || '—'}
      </text>

      {/* ── Band 1: IDENTITY (vendor, version, status) ──────────────────── */}
      {(() => {
        const bandY = 250;
        const bandH = 70;
        return (
          <g>
            <rect x={leftX} y={bandY} width={leftW} height={bandH} fill={FR.salt} />
            <rect x={leftX} y={bandY} width="3" height={bandH} fill={FR.soil} />
            <text x={leftX + 16} y={bandY + 18} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="2">IDENTITY</text>
            <StatBlock x={leftX + 16}              y={bandY + 38} label="Vendor"  value={d.vendor} />
            <StatBlock x={leftX + leftW * 0.55}    y={bandY + 38} label="Version" value={d.revision} mono />
            <StatBlock x={leftX + leftW * 0.78}    y={bandY + 38} label="Status"  value={d.status} />
          </g>
        );
      })()}

      {/* ── Band 2: PRODUCTION (colorways + size range) ─────────────────── */}
      {(() => {
        const bandY = 340;
        const bandH = 70;
        return (
          <g>
            <rect x={leftX} y={bandY} width={leftW} height={bandH} fill={FR.salt} />
            <rect x={leftX} y={bandY} width="3" height={bandH} fill={FR.soil} />
            <text x={leftX + 16} y={bandY + 18} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="2">PRODUCTION</text>
            <StatBlock x={leftX + 16}              y={bandY + 38} label="Colorways"  value={clampLine(colorwaysText, leftW * 0.5, 6.5)} />
            <StatBlock x={leftX + leftW * 0.55}    y={bandY + 38} label="Size Range" value={sizeRange} />
          </g>
        );
      })()}

      {/* ── Band 3: PRICING (target retail + maximum FOB) ───────────────── */}
      {(() => {
        const bandY = 430;
        const bandH = 80;
        return (
          <g>
            <rect x={leftX} y={bandY} width={leftW} height={bandH} fill={FR.salt} />
            <rect x={leftX} y={bandY} width="3" height={bandH} fill={FR.soil} />
            <text x={leftX + 16} y={bandY + 18} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="2">PRICING</text>
            <text x={leftX + 16}              y={bandY + 42} fontSize="8" fontWeight="bold" fill={FR.stone} letterSpacing="1.2">TARGET RETAIL</text>
            <text x={leftX + 16}              y={bandY + 66} fontFamily="ui-monospace, 'SF Mono', Menlo, monospace" fontSize="22" fill={FR.slate}>{targetRetail}</text>
            <text x={leftX + leftW * 0.55}    y={bandY + 42} fontSize="8" fontWeight="bold" fill={FR.stone} letterSpacing="1.2">MAXIMUM FOB</text>
            <text x={leftX + leftW * 0.55}    y={bandY + 66} fontFamily="ui-monospace, 'SF Mono', Menlo, monospace" fontSize="22" fill={FR.soil}>{maxFOB}</text>
          </g>
        );
      })()}

      {/* ── Quote strip — large, prominent, full-width below the image ───── */}
      {(() => {
        const tiers = d.costTiers || [];
        const moq = tiers[0];
        const stripY = 555;
        const stripH = 110;
        const stripW = PAGE_W - 80;
        const cells = [
          { label: 'MOQ',           value: moq && moq.quantity ? `${moq.quantity}` : '—', sub: 'units' },
          { label: 'Unit Cost',     value: moq && moq.unitCost ? `$${moq.unitCost}` : '—', sub: 'at MOQ' },
          { label: 'Lead Time',     value: d.leadTimeDays ? `${d.leadTimeDays}` : '—',  sub: 'days' },
          { label: 'Sample Lead',   value: d.sampleLeadTimeDays ? `${d.sampleLeadTimeDays}` : '—', sub: 'days' },
          { label: 'Sample Cost',   value: d.sampleCost ? `$${d.sampleCost}` : '—', sub: 'per unit' },
        ];
        const cw = stripW / cells.length;
        return (
          <g>
            <rect x={40} y={stripY} width={stripW} height={stripH} fill={FR.slate} />
            <text x={40 + 16} y={stripY + 22} fontSize="8" fontWeight="bold" fill={FR.sand} letterSpacing="2">QUOTE  ·  {esc((d.quoteProviderLink || 'Quote provider TBD').toUpperCase())}</text>
            <rect x={40 + 16} y={stripY + 30} width="40" height="1.5" fill={FR.soil} />
            {cells.map((c, i) => (
              <g key={i}>
                {i > 0 && <line x1={40 + i * cw} y1={stripY + 50} x2={40 + i * cw} y2={stripY + stripH - 14} stroke="rgba(245,240,232,0.18)" />}
                <text x={40 + i * cw + 16} y={stripY + 60} fontSize="8" fontWeight="bold" fill={FR.sand} letterSpacing="1.5">{esc(c.label.toUpperCase())}</text>
                <text x={40 + i * cw + 16} y={stripY + 88} fontFamily="ui-monospace, 'SF Mono', Menlo, monospace" fontSize="22" fill={FR.salt}>{esc(c.value)}</text>
                <text x={40 + i * cw + 16} y={stripY + 102} fontSize="9" fill={FR.sand} fontStyle="italic">{esc(c.sub)}</text>
              </g>
            ))}
          </g>
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
    { label: 'Style #',     value: d.styleNumber || d.styleName },
    { label: 'Collection',  value: d.collection },
    { label: 'Season',      value: d.season },
    { label: 'Version',     value: d.revision },
    { label: 'Colorway',    value: ((d.colorways || []).find(c => c && c.name) || {}).name || '—' },
    { label: 'Size Range',  value: Array.isArray(d.sizeRange) ? d.sizeRange.join(' / ') : d.sizeRange },
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

  // Three 2:3 portrait slots, centered on the available canvas. Canvas
  // height between the InfoStrip and the page footer is ~600px; we cap
  // each slot's height so it fits while staying as large as possible.
  const drawGap = 24;
  const maxW = (PAGE_W - 80 - drawGap * 2) / 3;
  const maxH = 560;
  // Fit by whichever dimension binds first.
  const wByH = (maxH * 2) / 3;
  const drawW = Math.min(maxW, wByH);
  const drawH = drawW * 1.5;
  const totalW = drawW * 3 + drawGap * 2;
  const startX = (PAGE_W - totalW) / 2;
  const drawY = 170;

  return (
    <g>
      <InfoStrip d={d} />

      <PhotoSlot x={startX}                         y={drawY} w={drawW} h={drawH} label="Front View" image={front} />
      <PhotoSlot x={startX + drawW + drawGap}       y={drawY} w={drawW} h={drawH} label="Back View"  image={back} />
      <PhotoSlot x={startX + (drawW + drawGap) * 2} y={drawY} w={drawW} h={drawH} label="Side View"  image={side} />
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

  const fabCols = [
    { key: 'component',    label: 'Component',    w: 120 },
    { key: 'fabricType',   label: 'Fabric Type',  w: 140 },
    { key: 'composition',  label: 'Composition',  w: 170 },
    { key: 'weightGsm',    label: 'Weight (GSM)', w: 110 },
    { key: 'colorPantone', label: 'Color / Pantone', w: 150 },
    { key: 'supplier',     label: 'Vendor',       w: 170 },
    { key: 'notes',        label: 'Notes',        w: 183 },
  ];

  const trimCols = [
    { key: 'component',     label: 'Component',   w: 140 },
    { key: 'type',          label: 'Type',        w: 160 },
    { key: 'material',      label: 'Material',    w: 150 },
    { key: 'color',         label: 'Color',       w: 120 },
    { key: 'sizeSpec',      label: 'Size / Spec', w: 130 },
    { key: 'supplier',      label: 'Vendor',      w: 180 },
    { key: 'qtyPerGarment', label: 'Qty/Garment', w: 163 },
  ];

  return (
    <g>
      <InfoStrip d={d} />

      <SectionHeading x={40} y={158}>Fabrics</SectionHeading>
      <GridTable x={40} y={170} cols={fabCols} rows={fabrics} bodyRows={5} />

      <SectionHeading x={40} y={320}>Trims &amp; Accessories</SectionHeading>
      <GridTable x={40} y={332} cols={trimCols} rows={trims} bodyRows={6} />
    </g>
  );
}

// ─── Page 5 — BOM Labels & Files ────────────────────────────────────────────
function PageBOMTrims({ d }) {
  const labels = (d.labelsBranding || []).filter(r => r.labelType || r.material || r.placement);
  const attachments = (d.attachments || []).filter(a => a.name);

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

      <SectionHeading x={40} y={158}>Labels &amp; Branding</SectionHeading>
      <GridTable x={40} y={170} cols={labelCols} rows={labels} bodyRows={5} />

      <SectionHeading x={40} y={320}>Source Documents &amp; Attachments</SectionHeading>
      {attachments.length === 0 ? (
        <text x={40} y={345} fontSize={11} fill={FR.stone} fontFamily="Helvetica, Arial, sans-serif" fontStyle="italic">No source documents attached.</text>
      ) : attachments.slice(0, 8).map((att, i) => (
        <g key={att.id || i} transform={`translate(40 ${338 + i * 22})`}>
          <rect x={0} y={0} width={1043} height={20} fill={i % 2 === 0 ? FR.salt : '#FFFFFF'} />
          <text x={6} y={14} fontSize={10} fill={FR.slate} fontFamily="ui-monospace,Menlo,monospace">{att.name || '—'}</text>
          <text x={320} y={14} fontSize={10} fill={FR.stone} fontFamily="Helvetica, Arial, sans-serif">{(att.type || '').split('/').pop()?.toUpperCase() || '—'}</text>
          <text x={440} y={14} fontSize={10} fill={FR.stone} fontFamily="Helvetica, Arial, sans-serif">{att.size ? `${Math.round(att.size / 1024)} KB` : '—'}</text>
          <text x={560} y={14} fontSize={10} fill={FR.stone} fontFamily="Helvetica, Arial, sans-serif">{att.uploaded_at ? att.uploaded_at.slice(0, 10) : '—'}</text>
        </g>
      ))}
    </g>
  );
}

// ─── Embellishments — Colorways ──────────────────────────────────────────────
function PageColorways({ d }) {
  const colorways = (d.colorways || []).filter(c => c && (c.name || c.frColor || c.pantone || c.hex));

  const cwCols = [
    { key: 'name',           label: 'Colorway Name',   w: 180 },
    { key: 'frColor',        label: 'FR Color',        w: 140 },
    { key: 'pantone',        label: 'Pantone Ref',     w: 150 },
    { key: 'hex',            label: 'Hex',             w: 120 },
    { key: 'fabricSwatch',   label: 'Fabric Swatch',   w: 293 },
    { key: 'approvalStatus', label: 'Approval',        w: 160 },
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

  return (
    <g>
      <InfoStrip d={d} />

      <SectionHeading x={40} y={158}>Colorway Specification</SectionHeading>
      <GridTable x={40} y={170} cols={cwCols} rows={colorways} bodyRows={12} renderCell={renderCWCell} />
    </g>
  );
}

// ─── Embellishments — Artwork & Placement ────────────────────────────────────
function PageArtwork({ d, images }) {
  const imgs = images || [];
  const front = imgs.find(i => i.slot === 'artwork-front');
  const back  = imgs.find(i => i.slot === 'artwork-back');

  const placements = (d.artworkPlacements || []).filter(r => r.placement || r.artworkFile || r.method || r.sizeCm || r.positionFrom || r.color);

  const plCols = [
    { key: 'placement',    label: 'Placement',     w: 150 },
    { key: 'artworkFile',  label: 'Artwork File',  w: 160 },
    { key: 'method',       label: 'Method',        w: 150 },
    { key: 'sizeCm',       label: 'Size (cm)',     w: 110 },
    { key: 'positionFrom', label: 'Position From', w: 170 },
    { key: 'color',        label: 'Color',         w: 130 },
    { key: 'notes',        label: 'Notes',         w: 173 },
  ];

  const logoY = 158;
  const artY = 230;
  const artH = 200;
  const plY = 470;

  return (
    <g>
      <InfoStrip d={d} />

      <SectionHeading x={40} y={logoY}>Logo &amp; Method</SectionHeading>
      <text x={40}  y={logoY + 30} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">FRONT LOGO</text>
      <text x={40}  y={logoY + 46} fontSize="11" fill={FR.slate}>{esc(d.logoFront || '—')}</text>
      <text x={400} y={logoY + 30} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">BACK LOGO</text>
      <text x={400} y={logoY + 46} fontSize="11" fill={FR.slate}>{esc(d.logoBack || '—')}</text>
      <text x={760} y={logoY + 30} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">METHOD</text>
      <text x={760} y={logoY + 46} fontSize="11" fill={FR.slate}>{esc(d.logoMethod || '—')}</text>

      <SectionHeading x={40} y={artY}>Artwork References</SectionHeading>
      <PhotoSlot x={40}                                y={artY + 20} w={(PAGE_W - 80 - 16) / 2} h={artH} label="Front Artwork" image={front} />
      <PhotoSlot x={40 + (PAGE_W - 80 - 16) / 2 + 16} y={artY + 20} w={(PAGE_W - 80 - 16) / 2} h={artH} label="Back Artwork"  image={back} />

      <SectionHeading x={40} y={plY}>Placement Detail</SectionHeading>
      <GridTable x={40} y={plY + 12} cols={plCols} rows={placements} bodyRows={8} />
    </g>
  );
}

// ─── Page 6 — Seam & Stitch Specifications ──────────────────────────────────
function PageConstruction({ d }) {
  const seams = (d.seams || []).filter(r => r.operation || r.seamType || r.stitchType || r.threadColor);

  const seamCols = [
    { key: 'operation',   label: 'Operation',     w: 180 },
    { key: 'seamType',    label: 'Seam Type',     w: 150 },
    { key: 'stitchType',  label: 'Stitch Type',   w: 120 },
    { key: 'spiSpcm',     label: 'SPI / SPCM',    w: 110 },
    { key: 'threadColor', label: 'Thread Color',  w: 130 },
    { key: 'threadType',  label: 'Thread Type',   w: 160 },
    { key: 'notes',       label: 'Notes',         w: 193 },
  ];

  return (
    <g>
      <InfoStrip d={d} />

      <SectionHeading x={40} y={158}>Seam &amp; Stitch Specification</SectionHeading>
      <GridTable x={40} y={170} cols={seamCols} rows={seams} bodyRows={12} />
    </g>
  );
}

// ─── Page 7 — Construction Notes ────────────────────────────────────────────
// ─── Construction Details Pages (1 of 2) ────────────────────────────────────
// Construction Details — page 1 or page 2 depending on `pageKey`. Layout:
// 9:16 reference image on the left (designer adds red-dot callouts in
// Photoshop), 2x2 grid of A4-landscape detail cards on the right. Each card
// has a red-numbered circle at the top + translatable title + description.
function PageSketches({ d, images, pageKey = 'page1' }) {
  const imgs = images || [];
  const fieldName = pageKey === 'page2' ? 'constructionDetailsPage2' : 'constructionDetailsPage1';
  const entries = ((d?.[fieldName]) || []).slice(0, 4);
  const callout = imgs.find(i => i.slot === `sketch-callout-${pageKey}`);

  const topY    = 158;
  const padX    = 40;
  const colGap  = 18;
  const refW    = 240;
  const refH    = refW * (16 / 9); // 9:16 aspect
  const refY    = 170;

  const rightX  = padX + refW + colGap;
  const rightW  = PAGE_W - padX - rightX;
  const rowGap  = 12;
  const colGap2 = 12;
  const cardCols = 2;
  const cardRows = 2;
  const cardW   = (rightW - colGap2 * (cardCols - 1)) / cardCols;
  const cardH   = cardW / 1.414; // A4 landscape
  const cardsTotalH = cardH * cardRows + rowGap * (cardRows - 1);

  return (
    <g>
      <InfoStrip d={d} />

      <text x={PAGE_W / 2} y={topY - 6} textAnchor="middle" fontSize="11" fill={FR.stone} fontStyle="italic">
        Number each callout on the reference image (red dots). Titles and descriptions are translatable per factory.
      </text>

      {/* 9:16 reference image on the left */}
      <PhotoSlot
        x={padX} y={refY}
        w={refW} h={refH}
        label="Reference"
        image={callout}
      />

      {/* 2x2 grid of A4 landscape detail cards on the right */}
      {entries.map((entry, i) => {
        const col = i % cardCols;
        const row = Math.floor(i / cardCols);
        const cx  = rightX + col * (cardW + colGap2);
        const cy  = refY   + row * (cardH + rowGap);
        const numCx = cx + 18;
        const numCy = cy + 18;
        return (
          <g key={entry.num}>
            {/* card border */}
            <rect x={cx} y={cy} width={cardW} height={cardH}
              fill={FR.white} stroke={FR.sand} strokeWidth={0.5} rx={4} />
            {/* red numbered circle at top-left */}
            <circle cx={numCx} cy={numCy} r={11} fill="#A32D2D" />
            <text x={numCx} y={numCy + 4} textAnchor="middle"
              fontSize="11" fontWeight="600" fill="#FFFFFF">
              {entry.num}
            </text>
            {/* title */}
            <text x={cx + 38} y={numCy + 5} fontSize="11" fontWeight="600" fill={FR.slate}>
              {entry.title || `Detail ${entry.num}`}
            </text>
            {/* description body */}
            <foreignObject x={cx + 12} y={cy + 38} width={cardW - 24} height={cardH - 50}>
              <div xmlns="http://www.w3.org/1999/xhtml"
                style={{ fontSize: 9, color: FR.slate, lineHeight: 1.5, fontFamily: "'Helvetica Neue', sans-serif", whiteSpace: 'pre-wrap' }}>
                {entry.description || ''}
              </div>
            </foreignObject>
          </g>
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

// ─── Page 11 — Graded Size Matrix ───────────────────────────────────────────
function PageSizeMatrix({ d }) {
  const matrix = d.gradedSizeMatrix || { baseSize: 'M', grading: [] };
  const rawSizes = Array.isArray(d.sizeRange)
    ? d.sizeRange
    : (d.sizeRange ? String(d.sizeRange).split(/[/,]+/).map(s => s.trim()).filter(Boolean) : []);
  const sizes = rawSizes.length ? rawSizes : ['S', 'M', 'L', 'XL'];
  const baseSize = sizes.includes(matrix.baseSize) ? matrix.baseSize : sizes[0];
  const poms = (d.poms || []).filter(p => p && p.name);

  const baseValue = (pom) => {
    const v = pom[baseSize.toLowerCase()];
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  const cellFor = (pom, size) => {
    const base = baseValue(pom);
    if (size === baseSize) return base !== null ? base.toFixed(1) : '—';
    const g = (matrix.grading || []).find(x => x.pomName === pom.name);
    const d2 = g?.perSizeDelta?.[size];
    if (d2 === undefined || d2 === null || base === null) return '—';
    return (base + Number(d2)).toFixed(1);
  };

  const tableX = 40;
  const tableW = PAGE_W - 80;
  const labelW = 240;
  const sizeColW = (tableW - labelW) / sizes.length;
  const rowH = 22;
  const headerH = 28;
  const startY = 180;

  return (
    <g>
      <InfoStrip d={d} />
      <SectionHeading x={40} y={158}>Graded Size Matrix (cm)</SectionHeading>

      <g transform={`translate(${tableX} ${startY})`}>
        <rect x={0} y={0} width={tableW} height={headerH} fill={FR.slate} />
        <text x={10} y={18} fontSize={9} fontWeight={600} fill={FR.salt} letterSpacing={0.5}>MEASUREMENT</text>
        {sizes.map((s, i) => (
          <g key={s}>
            <rect x={labelW + i * sizeColW} y={0} width={sizeColW} height={headerH} fill={s === baseSize ? FR.soil : FR.slate} />
            <line x1={labelW + i * sizeColW} y1={0} x2={labelW + i * sizeColW} y2={headerH} stroke={FR.salt} strokeOpacity={0.2} />
            <text x={labelW + i * sizeColW + sizeColW / 2} y={18} fontSize={10} fontWeight={600} fill={FR.salt} textAnchor="middle" letterSpacing={1}>
              {s}{s === baseSize ? ' · SAMPLE' : ''}
            </text>
          </g>
        ))}
        {poms.slice(0, 14).map((pom, ri) => (
          <g key={ri} transform={`translate(0 ${headerH + ri * rowH})`}>
            <rect x={0} y={0} width={tableW} height={rowH} fill={ri % 2 === 0 ? FR.salt : '#FFFFFF'} />
            <text x={10} y={15} fontSize={11} fill={FR.slate}>{pom.name}</text>
            {sizes.map((s, i) => (
              <g key={s}>
                <line x1={labelW + i * sizeColW} y1={0} x2={labelW + i * sizeColW} y2={rowH} stroke={FR.sand} />
                <text x={labelW + i * sizeColW + sizeColW / 2} y={15} fontSize={11} fill={s === baseSize ? FR.soil : FR.slate} fontWeight={s === baseSize ? 600 : 400} textAnchor="middle" fontFamily="ui-monospace,Menlo,monospace">
                  {cellFor(pom, s)}
                </text>
              </g>
            ))}
          </g>
        ))}
      </g>

      <text x={40} y={680} fontSize={10} fill={FR.stone} fontStyle="italic">
        Per-size values derived as <tspan fontFamily="ui-monospace,Menlo,monospace">base + delta</tspan>. Base column comes from Points of Measure.
      </text>
    </g>
  );
}

// ─── Page 12 — Garment Treatments ───────────────────────────────────────────
function PageTreatments({ d, images, treatmentsById }) {
  const imgs = images || [];
  const before = imgs.find(i => i.slot === 'treatment-before');
  const after  = imgs.find(i => i.slot === 'treatment-after');

  const treatments  = (d.treatments  || []).filter(r => r.step || r.treatment || r.process);
  const distressing = (d.distressing || []).filter(r => r.area || r.technique || r.intensity);

  // Group BOM fabric rows by treatment_id so the linked-treatments strip
  // shows one chip per unique treatment with all using-components listed.
  const linkedById = new Map();
  (d.fabrics || []).forEach(f => {
    if (!f.treatment_id) return;
    const arr = linkedById.get(f.treatment_id) || [];
    const tag = (f.component || '').trim();
    if (tag && !arr.includes(tag)) arr.push(tag);
    linkedById.set(f.treatment_id, arr);
  });
  const linked = Array.from(linkedById.entries())
    .map(([id, components]) => ({ id, components, t: (treatmentsById || {})[id] }))
    .filter(l => l.t);

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

  // Layout shifts when there's a linked-treatments strip, so the wash table
  // and downstream blocks can claim their original Y offsets when nothing
  // is linked.
  const linkedY = 158;
  const linkedH = linked.length ? 92 : 0;
  const tableY = 158 + (linked.length ? linkedH + 24 : 0);
  const distressY = tableY + 148;
  const refY = distressY + 148;

  return (
    <g>
      <InfoStrip d={d} />

      {linked.length > 0 && (
        <g>
          <SectionHeading x={40} y={linkedY}>Linked Treatments (from BOM)</SectionHeading>
          {linked.slice(0, 4).map(({ t, components }, i) => {
            const cardW = (PAGE_W - 80 - 12 * 3) / 4;
            const x = 40 + i * (cardW + 12);
            const y = linkedY + 14;
            const procBits = [];
            if (t.chemistry) procBits.push(t.chemistry);
            if (t.temperature_c) procBits.push(`${t.temperature_c}°C`);
            if (t.duration_minutes) procBits.push(`${t.duration_minutes} min`);
            const proc = procBits.join(' · ') || '—';
            return (
              <g key={t.id}>
                <rect x={x} y={y} width={cardW} height={70} fill={FR.white} stroke={FR.sand} />
                <text x={x + 10} y={y + 16} fontSize="10.5" fontWeight="bold" fill={FR.slate}>{esc(clampLine(t.name || 'Untitled', cardW - 70, 5.4))}</text>
                <text x={x + cardW - 10} y={y + 16} textAnchor="end" fontSize="9" fontFamily="ui-monospace, SF Mono, Menlo, monospace" fill={FR.stone}>{esc(t.code || '—')}</text>
                <text x={x + 10} y={y + 32} fontSize="9" fill={FR.slate}>{esc(clampLine(proc, cardW - 20, 5))}</text>
                <text x={x + 10} y={y + 50} fontSize="8" fill={FR.soil} letterSpacing="0.4">APPLIES TO</text>
                <text x={x + 10} y={y + 62} fontSize="9" fill={FR.slate}>{esc(clampLine(components.join(' · ') || '—', cardW - 20, 5.2))}</text>
              </g>
            );
          })}
        </g>
      )}

      <SectionHeading x={40} y={tableY}>Wash &amp; Dye Treatments</SectionHeading>
      <GridTable x={40} y={tableY + 12} cols={tCols} rows={treatments} bodyRows={4} />

      <SectionHeading x={40} y={distressY}>Distressing &amp; Special Finishes</SectionHeading>
      <GridTable x={40} y={distressY + 12} cols={dCols} rows={distressing} bodyRows={4} />

      <SectionHeading x={40} y={refY}>Before / After Reference</SectionHeading>
      <PhotoSlot x={40}                                 y={refY + 21} w={(PAGE_W - 80 - 16) / 2} h={Math.max(140, PAGE_H - refY - 110)} label="Before Treatment" image={before} />
      <PhotoSlot x={40 + (PAGE_W - 80 - 16) / 2 + 16}  y={refY + 21} w={(PAGE_W - 80 - 16) / 2} h={Math.max(140, PAGE_H - refY - 110)} label="After Treatment"  image={after} />
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

// ─── QC — Compliance & Testing ───────────────────────────────────────────────
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

      <SectionHeading x={40} y={290}>Testing Standards</SectionHeading>
      <GridTable x={40} y={302} cols={testCols} rows={tests} bodyRows={4} />

      <SectionHeading x={40} y={434}>Barcode &amp; SKU Matrix</SectionHeading>
      <GridTable x={40} y={446} cols={matrixCols} rows={matrix} bodyRows={10} />
    </g>
  );
}

// ─── QC — Quality Inspection (AQL) ───────────────────────────────────────────
function PageQuality({ d }) {
  const qi = d.qualityInspection || { aqlMajor: '2.5', aqlMinor: '4.0', inspectionStage: 'During Production', checklist: [], photoRequirements: '' };
  const checklist = (qi.checklist || []).filter(r => r.area || r.criterion);

  const cCols = [
    { key: 'area',      label: 'Area',      w: 240 },
    { key: 'criterion', label: 'Criterion', w: 600 },
    { key: 'severity',  label: 'Severity',  w: 203 },
  ];

  const aqlY = 158;
  const listY = 270;
  const photoY = 590;

  return (
    <g>
      <InfoStrip d={d} />

      <SectionHeading x={40} y={aqlY}>AQL Standard</SectionHeading>
      <text x={40}  y={aqlY + 30} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">MAJOR (AQL)</text>
      <text x={40}  y={aqlY + 50} fontSize="14" fill={FR.slate}>{esc(qi.aqlMajor || '—')}</text>
      <text x={300} y={aqlY + 30} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">MINOR (AQL)</text>
      <text x={300} y={aqlY + 50} fontSize="14" fill={FR.slate}>{esc(qi.aqlMinor || '—')}</text>
      <text x={560} y={aqlY + 30} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">INSPECTION STAGE</text>
      <text x={560} y={aqlY + 50} fontSize="14" fill={FR.slate}>{esc(qi.inspectionStage || '—')}</text>

      <SectionHeading x={40} y={listY}>Inspection Checklist</SectionHeading>
      <GridTable x={40} y={listY + 12} cols={cCols} rows={checklist} bodyRows={14} />

      <SectionHeading x={40} y={photoY}>Photo Requirements</SectionHeading>
      <foreignObject x="40" y={photoY + 14} width={PAGE_W - 80} height="120">
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 11, color: FR.slate, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {qi.photoRequirements || '—'}
        </div>
      </foreignObject>
    </g>
  );
}

// ─── Page 14 — Revision History & Approval ──────────────────────────────────
function ApprovalPreviewCard({ x, y, w, h, title, name, signature, date, dateLabel = 'Date:' }) {
  const lineY = (row) => y + 58 + row * 42;
  const Line = ({ row, label, value }) => (
    <g>
      <text x={x + 14} y={lineY(row)} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">{esc(label)}</text>
      {value
        ? <text x={x + 68} y={lineY(row)} fontSize="11" fill={FR.slate}>{clampLine(esc(value), w - 82, 6.2)}</text>
        : <line x1={x + 68} y1={lineY(row) + 2} x2={x + w - 14} y2={lineY(row) + 2} stroke={FR.sand} />}
    </g>
  );
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={FR.white} stroke={FR.sand} />
      <rect x={x} y={y} width={w} height={28} fill={FR.salt} />
      <text x={x + 14} y={y + 18} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="1.8">{esc(title.toUpperCase())}</text>
      <Line row={0} label="NAME:"      value={name} />
      <Line row={1} label="SIG:"       value={signature} />
      <Line row={2} label={dateLabel.toUpperCase()} value={date} />
    </g>
  );
}

function PageRevision({ d }) {
  const revisions = (d.revisions || []).filter(r => r.rev || r.date || r.changedBy || r.description);

  const revCols = [
    { key: 'rev',         label: 'Rev #',                 w: 80  },
    { key: 'date',        label: 'Date',                  w: 110 },
    { key: 'changedBy',   label: 'Changed By',            w: 160 },
    { key: 'section',     label: 'Section',               w: 150 },
    { key: 'description', label: 'Description of Change', w: 383 },
    { key: 'approvedBy',  label: 'Approved By',           w: 160 },
  ];

  const fa = d.finalApproval || {};
  const designer = fa.designer || {};
  const brand    = fa.brandOwner || {};
  const vendor   = fa.vendor || {};

  const cardY = 500;
  const cardH = 240;
  const cardGap = 20;
  const cardW = (PAGE_W - 80 - cardGap * 2) / 3;

  return (
    <g>
      <InfoStrip d={d} />

      <SectionHeading x={40} y={158}>Revision History</SectionHeading>
      <GridTable x={40} y={170} cols={revCols} rows={revisions} bodyRows={10} />

      <SectionHeading x={40} y={478}>Final Approval</SectionHeading>
      <ApprovalPreviewCard x={40}                              y={cardY} w={cardW} h={cardH} title="Designer"    name={designer.name} signature={designer.signature} date={designer.date} />
      <ApprovalPreviewCard x={40 + cardW + cardGap}            y={cardY} w={cardW} h={cardH} title="Brand Owner" name={brand.name}    signature={brand.signature}    date={brand.date} />
      <ApprovalPreviewCard x={40 + (cardW + cardGap) * 2}      y={cardY} w={cardW} h={cardH} title="Vendor"      name={vendor.name}   signature={vendor.signature}   date={vendor.dateChop}  dateLabel="Date / Chop:" />
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

// Page order mirrors STEPS in techPackConstants.js (manufacturing stage).
const PAGE_FNS = [
  { title: 'Style Overview',                    phase: 'Design',         body: ({ d, images }) => <PageCover d={d} images={images} /> },
  { title: 'Design Overview',                   phase: 'Design',         body: ({ d, images }) => <PageDesignOverview d={d} images={images} /> },
  { title: 'BOM — Fabrics & Trims',             phase: 'Materials',      body: ({ d }) => <PageBOM d={d} /> },
  { title: 'BOM — Labels & Source Files',       phase: 'Materials',      body: ({ d }) => <PageBOMTrims d={d} /> },
  { title: 'Technical Flat Lay Diagrams',       phase: 'Cut & Sew',      body: ({ d, images }) => <PageFlatlays d={d} images={images} /> },
  { title: 'Construction Details — Page 1',     phase: 'Cut & Sew',      body: ({ d, images }) => <PageSketches d={d} images={images} pageKey="page1" /> },
  { title: 'Construction Details — Page 2',     phase: 'Cut & Sew',      body: ({ d, images }) => <PageSketches d={d} images={images} pageKey="page2" /> },
  { title: 'Seam & Stitch Specifications',      phase: 'Cut & Sew',      body: ({ d }) => <PageConstruction d={d} /> },
  { title: 'Pattern Pieces & Cutting',          phase: 'Cut & Sew',      body: ({ d, images }) => <PagePattern d={d} images={images} /> },
  { title: 'Points of Measure (Sample Size)',   phase: 'Cut & Sew',      body: ({ d, images }) => <PagePom d={d} images={images} /> },
  { title: 'Graded Size Matrix',                phase: 'Cut & Sew',      body: ({ d }) => <PageSizeMatrix d={d} /> },
  { title: 'Colorways',                         phase: 'Embellishments', body: ({ d }) => <PageColorways d={d} /> },
  { title: 'Artwork & Placement',               phase: 'Embellishments', body: ({ d, images }) => <PageArtwork d={d} images={images} /> },
  { title: 'Garment Treatments',                phase: 'Treatments',     body: ({ d, images, treatmentsById }) => <PageTreatments d={d} images={images} treatmentsById={treatmentsById} /> },
  { title: 'Compliance & Testing',              phase: 'QC',             body: ({ d }) => <PageCompliance d={d} /> },
  { title: 'Quality Inspection (AQL)',          phase: 'QC',             body: ({ d }) => <PageQuality d={d} /> },
  { title: 'Labels & Packaging',                phase: 'Packaging',      body: ({ d, images }) => <PageLabels d={d} images={images} /> },
  { title: 'Order & Delivery',                  phase: 'Logistics',      body: ({ d }) => <PageOrder d={d} /> },
  { title: 'Revision History & Approval',       phase: 'Sign-off',       body: ({ d }) => <PageRevision d={d} /> },
];

function SkipOverlay() {
  const cx = PAGE_W / 2;
  const cy = PAGE_H / 2;
  return (
    <g>
      <rect x={0} y={0} width={PAGE_W} height={PAGE_H} fill="white" opacity={0.8} />
      <line x1={0} y1={0} x2={PAGE_W} y2={PAGE_H} stroke="#C0392B" strokeWidth={12} opacity={0.35} />
      <line x1={PAGE_W} y1={0} x2={0} y2={PAGE_H} stroke="#C0392B" strokeWidth={12} opacity={0.35} />
      <rect x={cx - 140} y={cy - 28} width={280} height={56} fill="#C0392B" rx={5} />
      <text x={cx} y={cy + 9} textAnchor="middle" fontSize={19} fontWeight="bold" fill="white" letterSpacing={5} fontFamily="Helvetica, Arial, sans-serif">PAGE NOT USED</text>
    </g>
  );
}

export default function TechPackPagePreview({ data, images, step, skippedSteps, treatmentsById }) {
  const d = data || {};
  const styleInfo = `© 2026 Foreign Resource Co. — Confidential Tech Pack`;
  const pageNum = Math.min(Math.max((step ?? 0) + 1, 1), TOTAL_PAGES);
  const current = PAGE_FNS[step] || PAGE_FNS[0];
  const Body = current.body;
  const isSkipped = Array.isArray(skippedSteps) && skippedSteps.includes(step);

  return (
    <svg xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      preserveAspectRatio="xMidYMin meet"
      style={{ width: '100%', height: 'auto', background: FR.white, boxShadow: '0 2px 14px rgba(0,0,0,0.12)', borderRadius: 6, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <PageFrame title={current.title} phase={current.phase} pageNum={pageNum} styleInfo={styleInfo}>
        <Body d={d} images={images} treatmentsById={treatmentsById} />
      </PageFrame>
      {isSkipped && <SkipOverlay />}
    </svg>
  );
}
