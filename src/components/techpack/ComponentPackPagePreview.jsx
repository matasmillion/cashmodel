// Live A4-landscape page preview for the Component Pack wizard.
// Matches the 4-page FR_TechPack_Component_Blank_2.svg template:
//   Page 1 — Cover & Identity (fully rendered)
//   Pages 2–4 — placeholders ("coming soon") until the next session.

import { FR } from './techPackConstants';

const PAGE_W = 1123;
const PAGE_H = 794;
const TOTAL_PAGES = 4;

function esc(s) { return String(s ?? ''); }
function clampLine(s, maxW, charW = 6.5) {
  const max = Math.floor(maxW / charW);
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + '…';
}

function PageFrame({ title, pageNum, componentInfo, children }) {
  return (
    <g>
      <rect x="0" y="0" width={PAGE_W} height={PAGE_H} fill={FR.white} />
      <rect x="0" y="0" width={PAGE_W} height={70} fill={FR.slate} />
      <text x="40" y="28" fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="3">FR · TRIM PACK</text>
      <text x="40" y="55" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="22" fill={FR.salt}>{title}</text>
      <rect x="0" y="70" width={PAGE_W} height={2} fill={FR.soil} />
      <text x="40" y="775" fontSize="9" fill={FR.stone}>{componentInfo}</text>
      <text x={PAGE_W - 40} y="775" textAnchor="end" fontSize="9" fill={FR.stone}>PAGE {pageNum} / {TOTAL_PAGES}</text>
      {children}
    </g>
  );
}

function Field({ x, y, label, value, w = 320 }) {
  return (
    <g>
      <text x={x} y={y} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">{esc((label || '').toUpperCase())}</text>
      <text x={x} y={y + 16} fontSize="11" fill={FR.slate}>{clampLine(esc(value || '—'), w, 6.5)}</text>
    </g>
  );
}

function SignatureCard({ x, y, w, h, title, name, date }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={FR.salt} stroke={FR.sand} />
      <rect x={x} y={y} width={w} height={26} fill={FR.slate} />
      <text x={x + 12} y={y + 17} fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="1.5">{esc(title.toUpperCase())}</text>

      <text x={x + 12} y={y + 52} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">NAME</text>
      <text x={x + 12} y={y + 70} fontSize="11" fill={FR.slate}>{clampLine(esc(name || '—'), w - 24, 6.5)}</text>
      <line x1={x + 12} y1={y + 74} x2={x + w - 12} y2={y + 74} stroke={FR.sand} />

      <text x={x + 12} y={y + 96} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">DATE</text>
      <text x={x + 12} y={y + 114} fontSize="11" fill={FR.slate}>{clampLine(esc(date || '—'), w - 24, 6.5)}</text>
      <line x1={x + 12} y1={y + 118} x2={x + w - 12} y2={y + 118} stroke={FR.sand} />
    </g>
  );
}

function PageCover({ d, images }) {
  const cover = (images || []).find(img => img.slot === 'component-cover');

  // Two-column overview grid (4 rows × 2 columns)
  const leftX = 40;
  const rightX = 580;
  const colW = 480;
  const rowStartY = 350;
  const rowGap = 52;
  const derivedRevision = `V${(d.revisions || []).length + 1}.0`;
  const leftCol = [
    { label: 'Trim Type',           value: d.componentType },
    { label: 'Factory',             value: d.supplier },
    { label: 'Season',              value: d.season },
    { label: 'Date Last Updated',   value: d.dateCreated },
  ];
  const rightCol = [
    { label: 'Revision',            value: d.revision || derivedRevision },
    { label: 'Colorways',           value: d.colorways },
    { label: 'Target Unit Cost ($)', value: d.targetUnitCost },
    { label: 'MOQ',                 value: d.moq },
  ];

  // Signature cards along the bottom — two up (Designed By / Approved By)
  const sigY = 610;
  const sigH = 140;
  const sigGap = 24;
  const sigW = (PAGE_W - 80 - sigGap) / 2;

  return (
    <g>
      {/* Title block */}
      <text x={40} y={120} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="42" fill={FR.slate}>Trim Specification</text>
      <rect x={40} y={132} width="80" height="2" fill={FR.soil} />
      <text x={40} y={168} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="26" fill={FR.slate}>
        {clampLine(d.componentName || 'New Trim', 900, 14)}
      </text>
      <text x={40} y={196} fontSize="10" fill={FR.stone} letterSpacing="1.5">STATUS · {esc((d.status || '—').toUpperCase())}</text>

      {/* Cover photo */}
      {cover
        ? <image href={cover.data} x={PAGE_W - 320 - 40} y={100} width="320" height="200" preserveAspectRatio="xMidYMid meet" />
        : (
          <g>
            <rect x={PAGE_W - 320 - 40} y={100} width="320" height="200" fill={FR.salt} stroke={FR.sand} strokeDasharray="6 6" />
            <text x={PAGE_W - 160 - 40} y={205} textAnchor="middle" fontSize="11" fill={FR.stone} fontStyle="italic">Trim photo goes here</text>
          </g>
        )}

      {/* Section divider */}
      <rect x="40" y="320" width={PAGE_W - 80} height="1" fill={FR.sand} />
      <text x={40} y={340} fontSize="10" fontWeight="bold" fill={FR.soil} letterSpacing="2">OVERVIEW</text>

      {/* Two-column grid */}
      {leftCol.map((f, i) => (
        <Field key={`L${i}`} x={leftX} y={rowStartY + i * rowGap} label={f.label} value={f.value} w={colW} />
      ))}
      {rightCol.map((f, i) => (
        <Field key={`R${i}`} x={rightX} y={rowStartY + i * rowGap} label={f.label} value={f.value} w={colW} />
      ))}

      {/* Signature cards */}
      <SignatureCard x={40}                   y={sigY} w={sigW} h={sigH} title="Designed By" name={d.designedBy?.name} date={d.designedBy?.date} />
      <SignatureCard x={40 + sigW + sigGap}   y={sigY} w={sigW} h={sigH} title="Approved By" name={d.approvedBy?.name} date={d.approvedBy?.date} />
    </g>
  );
}

function ComingSoonPage({ pageNum }) {
  return (
    <g>
      <rect x={120} y={260} width={PAGE_W - 240} height={260} fill={FR.salt} stroke={FR.sand} strokeDasharray="6 6" />
      <text x={PAGE_W / 2} y={370} textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="38" fill={FR.slate}>
        Page {pageNum} / {TOTAL_PAGES}
      </text>
      <text x={PAGE_W / 2} y={420} textAnchor="middle" fontSize="14" fill={FR.soil} letterSpacing="1">
        Coming soon
      </text>
    </g>
  );
}

function InfoStripCell({ x, y, w, label, value }) {
  return (
    <g>
      <text x={x + 10} y={y + 14} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">{esc((label || '').toUpperCase())}</text>
      <text x={x + 10} y={y + 32} fontSize="11" fill={FR.slate}>{clampLine(esc(value || '—'), w - 20, 6.5)}</text>
    </g>
  );
}

function DrawingSlot({ x, y, w, h, label, image }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={FR.white} stroke={FR.soil} strokeDasharray="5 4" />
      {image
        ? <image href={image.data} x={x + 4} y={y + 4} width={w - 8} height={h - 8} preserveAspectRatio="xMidYMid meet" />
        : (
          <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize="11" fill={FR.stone} fontStyle="italic">
            Drop {label.toLowerCase()} here
          </text>
        )}
      <rect x={x} y={y + h} width={w} height={22} fill={FR.salt} stroke={FR.sand} />
      <text x={x + w / 2} y={y + h + 15} textAnchor="middle" fontSize="9" fontWeight="bold" fill={FR.slate} letterSpacing="1">
        {esc(label.toUpperCase())}
      </text>
    </g>
  );
}

function PageSpec({ d, images }) {
  const imgs = images || [];
  const front = imgs.find(img => img.slot === 'component-front');
  const back  = imgs.find(img => img.slot === 'component-back');
  const side  = imgs.find(img => img.slot === 'component-side');

  // Info strip
  const stripY = 90;
  const stripH = 46;
  const cellW = (PAGE_W - 80) / 4;

  // Drawing row
  const drawY = 170;
  const drawH = 210;
  const drawGap = 16;
  const drawW = (PAGE_W - 80 - drawGap * 2) / 3;

  // POM table
  const tableX = 40;
  const tableTop = 470;
  const rowH = 24;
  const headerH = 26;
  const widths = [40, 320, 130, 90, 130, 273]; // sum = 983 = PAGE_W - 80 - 60? Need PAGE_W - 80 = 1043
  // Recalc to exactly fill: 1043 total. Use 40, 340, 130, 100, 140, 293.
  const cols = [
    { key: '#',           w: 40 },
    { key: 'Measurement', w: 340 },
    { key: 'Spec',        w: 140 },
    { key: 'Unit',        w: 90 },
    { key: 'Tolerance',   w: 140 },
    { key: 'Method',      w: 293 },
  ];
  const rows = (d.poms || []).filter(p => p.measurement || p.spec || p.tolerance || p.method).slice(0, 8);

  let runningX = tableX;
  const colX = cols.map(c => { const x = runningX; runningX += c.w; return x; });
  const tableW = cols.reduce((a, c) => a + c.w, 0);

  return (
    <g>
      {/* Info strip */}
      <rect x={40} y={stripY} width={PAGE_W - 80} height={stripH} fill={FR.salt} stroke={FR.sand} />
      <InfoStripCell x={40 + cellW * 0} y={stripY} w={cellW} label="Trim Name"  value={d.componentName} />
      <InfoStripCell x={40 + cellW * 1} y={stripY} w={cellW} label="Trim Type"  value={d.componentType} />
      <InfoStripCell x={40 + cellW * 2} y={stripY} w={cellW} label="Factory"    value={d.supplier} />
      <InfoStripCell x={40 + cellW * 3} y={stripY} w={cellW} label="Date"       value={d.dateCreated} />

      {/* Trim Drawing section heading */}
      <text x={40} y={160} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="18" fill={FR.slate}>Trim Drawing</text>
      <rect x={40} y={164} width="60" height="2" fill={FR.soil} />

      {/* Three drawing slots */}
      <DrawingSlot x={40}                              y={drawY} w={drawW} h={drawH} label="Front / Top"       image={front} />
      <DrawingSlot x={40 + drawW + drawGap}            y={drawY} w={drawW} h={drawH} label="Back / Bottom"     image={back} />
      <DrawingSlot x={40 + (drawW + drawGap) * 2}      y={drawY} w={drawW} h={drawH} label="Side / Cross-Section" image={side} />

      {/* Caption */}
      <text x={PAGE_W / 2} y={drawY + drawH + 48} textAnchor="middle" fontSize="10" fill={FR.stone} fontStyle="italic">
        Place annotated diagrams with dimensions, callouts, and tolerances above.
      </text>

      {/* Dimensions / POM heading */}
      <text x={40} y={tableTop - 18} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="18" fill={FR.slate}>Dimensions / Points of Measure</text>
      <rect x={40} y={tableTop - 14} width="60" height="2" fill={FR.soil} />

      {/* Table header */}
      <rect x={tableX} y={tableTop} width={tableW} height={headerH} fill={FR.slate} />
      {cols.map((c, i) => (
        <text key={c.key} x={colX[i] + 8} y={tableTop + 17} fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="0.5">
          {esc(c.key.toUpperCase())}
        </text>
      ))}

      {/* Body rows (always render 6 rows for visual consistency) */}
      {Array.from({ length: 6 }).map((_, ri) => {
        const ry = tableTop + headerH + ri * rowH;
        const row = rows[ri];
        return (
          <g key={ri}>
            {ri % 2 === 0 && <rect x={tableX} y={ry} width={tableW} height={rowH} fill={FR.salt} />}
            <line x1={tableX} y1={ry + rowH} x2={tableX + tableW} y2={ry + rowH} stroke={FR.sand} />
            {row ? (
              <>
                <text x={colX[0] + 8} y={ry + 16} fontSize="10" fill={FR.stone}>{ri + 1}</text>
                <text x={colX[1] + 8} y={ry + 16} fontSize="10" fill={FR.slate}>{clampLine(esc(row.measurement || ''), cols[1].w - 16)}</text>
                <text x={colX[2] + 8} y={ry + 16} fontSize="10" fill={FR.slate}>{clampLine(esc(row.spec || ''), cols[2].w - 16)}</text>
                <text x={colX[3] + 8} y={ry + 16} fontSize="10" fill={FR.slate}>{clampLine(esc(row.unit || ''), cols[3].w - 16)}</text>
                <text x={colX[4] + 8} y={ry + 16} fontSize="10" fill={FR.slate}>{clampLine(esc(row.tolerance || ''), cols[4].w - 16)}</text>
                <text x={colX[5] + 8} y={ry + 16} fontSize="10" fill={FR.slate}>{clampLine(esc(row.method || ''), cols[5].w - 16)}</text>
              </>
            ) : (
              <text x={colX[0] + 8} y={ry + 16} fontSize="10" fill={FR.sand}>{ri + 1}</text>
            )}
          </g>
        );
      })}

      {/* POM method note */}
      <text x={40} y={tableTop + headerH + 6 * rowH + 28} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">
        MEASUREMENT METHOD
      </text>
      <foreignObject x="40" y={tableTop + headerH + 6 * rowH + 34} width={PAGE_W - 80} height="48">
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 10, color: FR.stone, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
          {d.pomMethod || 'As appropriate for component type. Specify instrument and conditions.'}
        </div>
      </foreignObject>
    </g>
  );
}

function InfoStrip({ d }) {
  const stripY = 90;
  const stripH = 46;
  const cellW = (PAGE_W - 80) / 4;
  return (
    <g>
      <rect x={40} y={stripY} width={PAGE_W - 80} height={stripH} fill={FR.salt} stroke={FR.sand} />
      <InfoStripCell x={40 + cellW * 0} y={stripY} w={cellW} label="Trim Name"  value={d.componentName} />
      <InfoStripCell x={40 + cellW * 1} y={stripY} w={cellW} label="Trim Type"  value={d.componentType} />
      <InfoStripCell x={40 + cellW * 2} y={stripY} w={cellW} label="Factory"    value={d.supplier} />
      <InfoStripCell x={40 + cellW * 3} y={stripY} w={cellW} label="Date"       value={d.dateCreated} />
    </g>
  );
}

function SectionHeading({ x, y, children }) {
  return (
    <g>
      <text x={x} y={y} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="16" fill={FR.slate}>{children}</text>
      <rect x={x} y={y + 4} width="50" height="2" fill={FR.soil} />
    </g>
  );
}

// Generic grid table used on Page 3 (fixed body rows, slate header + salt stripes).
function GridTable({ x, y, cols, rows, bodyRows = 4, rowH = 22, headerH = 22, renderCell }) {
  const tableW = cols.reduce((a, c) => a + c.w, 0);
  let rx = x;
  const colX = cols.map(c => { const cx = rx; rx += c.w; return cx; });
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
              const cx = colX[ci];
              const cw = c.w;
              if (renderCell && renderCell(c.key, row, cx, ry, cw)) {
                return <g key={c.key}>{renderCell(c.key, row, cx, ry, cw)}</g>;
              }
              const val = c.key === '#' ? String(ri + 1) : (row[c.key] ?? '');
              return (
                <text key={c.key} x={cx + 6} y={ry + 15} fontSize="9.5" fill={c.key === '#' ? FR.stone : FR.slate}>
                  {clampLine(esc(val), cw - 12, 5.8)}
                </text>
              );
            })}
            {!row && (
              <text x={colX[0] + 6} y={ry + 15} fontSize="9.5" fill={FR.sand}>{ri + 1}</text>
            )}
          </g>
        );
      })}
    </g>
  );
}

function ArtworkSlot({ x, y, w, h, label, image }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={FR.white} stroke={FR.soil} strokeDasharray="5 4" />
      {image
        ? <image href={image.data} x={x + 4} y={y + 4} width={w - 8} height={h - 8} preserveAspectRatio="xMidYMid meet" />
        : (
          <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize="10" fill={FR.stone} fontStyle="italic">
            Drop {label.toLowerCase()} artwork here
          </text>
        )}
      <text x={x + 6} y={y - 4} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="1">
        {esc(label.toUpperCase())}
      </text>
    </g>
  );
}

function PageBOMColor({ d, images }) {
  const imgs = images || [];
  const faceImg = imgs.find(img => img.slot === 'component-artwork-face');
  const backImg = imgs.find(img => img.slot === 'component-artwork-back');

  const matCols = [
    { key: '#',               label: '#',               w: 30  },
    { key: 'component',       label: 'Component',       w: 150 },
    { key: 'typeDescription', label: 'Type/Description',w: 220 },
    { key: 'composition',     label: 'Composition',     w: 190 },
    { key: 'weightGauge',     label: 'Weight/Gauge',    w: 130 },
    { key: 'supplier',        label: 'Factory',         w: 160 },
    { key: 'notes',           label: 'Notes',           w: 163 },
  ];
  const materials = (d.materials || []).filter(r => r.component || r.typeDescription || r.composition);

  const cwCols = [
    { key: 'name',           label: 'Colorway Name',   w: 200 },
    { key: 'frColor',        label: 'FR Color Code',   w: 170 },
    { key: 'pantone',        label: 'Pantone Ref',     w: 170 },
    { key: 'hex',            label: 'Hex',             w: 130 },
    { key: 'swatch',         label: 'Swatch',          w: 213 },
    { key: 'approvalStatus', label: 'Approval',        w: 160 },
  ];
  const colorways = (d.colorwaysList || []).filter(r => r.name || r.frColor || r.pantone || r.hex);

  const plCols = [
    { key: '#',           label: '#',             w: 30  },
    { key: 'placement',   label: 'Placement',     w: 130 },
    { key: 'artworkFile', label: 'Artwork File',  w: 180 },
    { key: 'method',      label: 'Method',        w: 160 },
    { key: 'size',        label: 'Size',          w: 120 },
    { key: 'position',    label: 'Position',      w: 140 },
    { key: 'color',       label: 'Color',         w: 130 },
    { key: 'notes',       label: 'Notes',         w: 153 },
  ];
  const placements = (d.artworkPlacements || []).filter(r => r.placement || r.artworkFile || r.method || r.size || r.position || r.color);

  // Swatch cell renderer — small filled rect with hex label.
  const renderCWCell = (key, row, x, y, w) => {
    if (key === 'swatch') {
      const hex = row.hex || '#EBE5D5';
      return (
        <>
          <rect x={x + 6} y={y + 4} width="18" height="14" fill={hex} stroke={FR.sand} />
          <text x={x + 30} y={y + 15} fontSize="9.5" fill={FR.slate}>{clampLine(esc(row.swatch || row.hex || ''), w - 36, 5.8)}</text>
        </>
      );
    }
    return null;
  };

  return (
    <g>
      <InfoStrip d={d} />

      {/* Materials */}
      <SectionHeading x={40} y={158}>Materials</SectionHeading>
      <GridTable x={40} y={170} cols={matCols} rows={materials} bodyRows={4} />

      {/* Colorway Specification */}
      <SectionHeading x={40} y={302}>Colorway Specification</SectionHeading>
      <GridTable x={40} y={314} cols={cwCols} rows={colorways} bodyRows={4} renderCell={renderCWCell} />

      {/* Artwork / Marking Placement */}
      <SectionHeading x={40} y={446}>Artwork / Marking Placement</SectionHeading>
      <ArtworkSlot x={40}                             y={465} w={(PAGE_W - 80 - 16) / 2} h={110} label="Face" image={faceImg} />
      <ArtworkSlot x={40 + (PAGE_W - 80 - 16) / 2 + 16} y={465} w={(PAGE_W - 80 - 16) / 2} h={110} label="Back" image={backImg} />

      {/* Placement table */}
      <GridTable x={40} y={600} cols={plCols} rows={placements} bodyRows={4} />
    </g>
  );
}

function ApprovalPreviewCard({ x, y, w, h, title, name, signature, date, dateLabel = 'Date:' }) {
  const lineY = (row) => y + 60 + row * 40;
  const Line = ({ row, label, value }) => (
    <g>
      <text x={x + 14} y={lineY(row)} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">{esc(label)}</text>
      {value
        ? <text x={x + 60} y={lineY(row)} fontSize="11" fill={FR.slate}>{clampLine(esc(value), w - 74, 6.2)}</text>
        : <line x1={x + 60} y1={lineY(row) + 2} x2={x + w - 14} y2={lineY(row) + 2} stroke={FR.sand} />}
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

function PageQC({ d }) {
  // Table column specs (tableW = 1043)
  const procCols = [
    { key: '#',             label: '#',              w: 30  },
    { key: 'operation',     label: 'Operation',      w: 200 },
    { key: 'type',          label: 'Type',           w: 200 },
    { key: 'specification', label: 'Specification',  w: 370 },
    { key: 'notes',         label: 'Notes',          w: 243 },
  ];
  const testCols = [
    { key: '#',                    label: '#',                       w: 30  },
    { key: 'test',                 label: 'Test',                    w: 220 },
    { key: 'standardRequirement',  label: 'Standard or Requirement', w: 280 },
    { key: 'testMethod',           label: 'Test Method',             w: 260 },
    { key: 'passFail',             label: 'Pass / Fail',             w: 253 },
  ];
  const revCols = [
    { key: 'rev',         label: 'Rev #',                   w: 70  },
    { key: 'date',        label: 'Date',                    w: 110 },
    { key: 'changedBy',   label: 'Changed By',              w: 180 },
    { key: 'description', label: 'Description of Change',   w: 503 },
    { key: 'approvedBy',  label: 'Approved By',             w: 180 },
  ];

  const procRows = (d.processSpec || []).filter(r => r.operation || r.type || r.specification || r.notes);
  const testRows = (d.testingStandards || []).filter(r => r.test || r.standardRequirement || r.testMethod);
  const revRows  = (d.revisions || []).filter(r => r.rev || r.date || r.changedBy || r.description || r.approvedBy);

  const fa = d.finalApproval || {};
  const designer = fa.designer || {};
  const brand    = fa.brandOwner || {};
  const factory  = fa.factory || {};

  // Approval cards
  const cardY = 530;
  const cardH = 220;
  const cardGap = 16;
  const cardW = (PAGE_W - 80 - cardGap * 2) / 3;

  return (
    <g>
      <InfoStrip d={d} />

      {/* Construction / Process Specification */}
      <SectionHeading x={40} y={158}>Construction / Process Specification</SectionHeading>
      <GridTable x={40} y={170} cols={procCols} rows={procRows} bodyRows={3} />

      {/* Quality & Testing Standards */}
      <SectionHeading x={40} y={280}>Quality & Testing Standards</SectionHeading>
      <GridTable x={40} y={292} cols={testCols} rows={testRows} bodyRows={3} />

      {/* Revision History */}
      <SectionHeading x={40} y={402}>Revision History</SectionHeading>
      <GridTable x={40} y={414} cols={revCols} rows={revRows} bodyRows={3} />

      {/* Final Approval */}
      <SectionHeading x={40} y={515}>Final Approval</SectionHeading>
      <ApprovalPreviewCard x={40}                              y={cardY} w={cardW} h={cardH} title="Designer"           name={designer.name} signature={designer.signature} date={designer.date} />
      <ApprovalPreviewCard x={40 + cardW + cardGap}            y={cardY} w={cardW} h={cardH} title="Brand Owner"        name={brand.name}    signature={brand.signature}    date={brand.date} />
      <ApprovalPreviewCard x={40 + (cardW + cardGap) * 2}      y={cardY} w={cardW} h={cardH} title="Factory"            name={factory.name}  signature={factory.signature}  date={factory.dateChop} dateLabel="Date / Chop:" />
    </g>
  );
}

const PAGE_FNS = [
  { title: 'Overview',                      body: ({ d, images }) => <PageCover d={d} images={images} /> },
  { title: 'Specification & Artwork',       body: ({ d, images }) => <PageSpec d={d} images={images} /> },
  { title: 'Bill of Materials & Color',     body: ({ d, images }) => <PageBOMColor d={d} images={images} /> },
  { title: 'Construction, QC & Approval',   body: ({ d }) => <PageQC d={d} /> },
];

export default function ComponentPackPagePreview({ data, images, step }) {
  const d = data || {};
  const componentInfo = `${d.componentName || 'Untitled'} · ${d.componentType || ''}`;
  const pageNum = Math.min(Math.max(step + 1, 1), TOTAL_PAGES);
  const current = PAGE_FNS[step] || PAGE_FNS[0];
  const Body = current.body;

  return (
    <svg xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      preserveAspectRatio="xMidYMin meet"
      style={{ width: '100%', height: 'auto', background: FR.white, boxShadow: '0 2px 14px rgba(0,0,0,0.12)', borderRadius: 6, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <PageFrame title={current.title} pageNum={pageNum} componentInfo={componentInfo}>
        <Body d={d} images={images} />
      </PageFrame>
    </svg>
  );
}
