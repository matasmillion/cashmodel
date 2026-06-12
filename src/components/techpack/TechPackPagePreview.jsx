// Live A4-landscape page preview for the Tech Pack builder.
// 21 pages total: two Merchandising pages (000, 00) up front, then the 19
// numbered tech pack pages. The denominator stays 19 — merchandising pages
// are pre-pack strategy and aren't counted toward the numbered total.

import { FR, STEPS, CALLOUT_REF_RATIO, CALLOUT_MAIN_RATIO, CALLOUT_SUPPORT_RATIO } from './techPackConstants';
import { FabricBOMPreviewBody } from './FabricBOMPreview';
import { AnnotationSvg } from './ImageAnnotator';

const PAGE_W = 1123;
const PAGE_H = 794;
const TOTAL_PAGES = 25;

function esc(s) { return String(s ?? ''); }
function clampLine(s, maxW, charW = 6.5) {
  const max = Math.floor(maxW / charW);
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + '…';
}

function PageFrame({ title, phase, pageNum, styleInfo, styleNumber, children, internal }) {
  const headerTag = internal ? 'INTERNAL · NOT EXPORTED' : `PAGE ${pageNum} / ${TOTAL_PAGES}`;
  return (
    <g>
      <rect x="0" y="0" width={PAGE_W} height={PAGE_H} fill={FR.white} />
      <rect x="0" y="0" width={PAGE_W} height={70} fill={FR.slate} />
      <text x="40" y="28" fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="3">FOREIGN RESOURCE CO.</text>
      {phase && (
        <text x="40" y="50" fontSize="8" fill={FR.sand} letterSpacing="2">{esc(phase.toUpperCase())}</text>
      )}
      <text x={PAGE_W / 2} y="44" textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="20" fill={FR.salt}>{title}</text>
      {styleNumber && (
        <text x={PAGE_W - 40} y="28" textAnchor="end" fontSize="10" fontWeight="bold" fill={FR.salt} letterSpacing="2" fontFamily="ui-monospace,Menlo,monospace">{esc(styleNumber)}</text>
      )}
      <text x={PAGE_W - 40} y="50" textAnchor="end" fontSize="8" fill={FR.sand} letterSpacing="2">{headerTag}</text>
      <rect x="0" y="70" width={PAGE_W} height={2} fill={FR.soil} />
      <text x="40" y="775" fontSize="9" fill={FR.stone}>{styleInfo}</text>
      <text x={PAGE_W - 40} y="775" textAnchor="end" fontSize="9" fill={internal ? '#854F0B' : FR.stone} fontWeight={internal ? 'bold' : 'normal'}>{internal ? 'INTERNAL — NOT EXPORTED' : `PAGE ${pageNum} / ${TOTAL_PAGES}`}</text>
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

// ─── Page 000 — Competitor Landscape ───────────────────────────────────────
function PageCompetitorLandscape({ d }) {
  const competitors = (d?.competitors || []).filter(c => c.brand || c.product || c.price);
  const cols = [
    { key: 'brand',    label: 'Brand',          w: 130 },
    { key: 'product',  label: 'Product',        w: 220 },
    { key: 'price',    label: 'Price',          w: 100 },
    { key: 'currency', label: 'Currency',       w: 70  },
    { key: 'features', label: 'Key Features',   w: 320 },
    { key: 'notes',    label: 'Notes',          w: 203 },
  ];
  const positioning = (d?.competitivePositioning || '').trim();

  return (
    <g>
      <text x={PAGE_W / 2} y={108} textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="16" fill={FR.slate}>
        Competitive Pricing & Feature Analysis
      </text>

      <SectionHeading x={40} y={148}>Pricing & Features</SectionHeading>
      <GridTable x={40} y={160} cols={cols} rows={competitors} bodyRows={10} />

      <SectionHeading x={40} y={460}>Competitive Landscape — FR Positioning</SectionHeading>
      {positioning ? positioning.split('\n').slice(0, 14).map((line, i) => (
        <text key={i} x={40} y={482 + i * 14} fontSize={11} fill={FR.slate} fontFamily="Helvetica, Arial, sans-serif">{line}</text>
      )) : (
        <text x={40} y={482} fontSize={11} fill={FR.stone} fontStyle="italic" fontFamily="Helvetica, Arial, sans-serif">No positioning notes yet.</text>
      )}
    </g>
  );
}

// ─── Page 00 — Merchandising Preview (desktop + iPhone frames) ─────────────
function PageMerchandisingPreview({ d }) {
  void d;
  // Desktop frame: 16:10 — sits left, takes more horizontal room.
  const deskW = 620;
  const deskH = deskW * (10 / 16); // 387.5
  const deskX = 80;
  const deskY = 200;

  // Phone frame: 9:19.5 — sits right.
  const phoneW = 130;
  const phoneH = phoneW * (19.5 / 9); // 281.7
  const phoneX = deskX + deskW + 60;
  const phoneY = 200;

  // Browser chrome inside the desktop frame
  const chromeH = 28;
  const dot = (cx, cy, fill) => <circle cx={cx} cy={cy} r={4.5} fill={fill} />;

  return (
    <g>
      <text x={PAGE_W / 2} y={108} textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="16" fill={FR.slate}>
        Storefront Visualization — Desktop & Mobile
      </text>
      <text x={PAGE_W / 2} y={130} textAnchor="middle" fontSize={10} fill={FR.stone} fontStyle="italic">
        Live PDP preview will replace these frames once the product preview engine ships.
      </text>

      {/* Section labels above each device */}
      <text x={deskX + deskW / 2} y={deskY - 14} textAnchor="middle"
        fontSize={9} fontWeight={600} fill={FR.soil} letterSpacing={1.5}>DESKTOP · 16:10</text>
      <text x={phoneX + phoneW / 2} y={phoneY - 14} textAnchor="middle"
        fontSize={9} fontWeight={600} fill={FR.soil} letterSpacing={1.5}>iPHONE · 9:19.5</text>

      {/* Desktop frame */}
      <rect x={deskX} y={deskY} width={deskW} height={deskH}
        fill={FR.white} stroke={FR.sand} strokeWidth={0.5} rx={10} />
      {/* Browser chrome bar */}
      <rect x={deskX} y={deskY} width={deskW} height={chromeH} fill={FR.salt} rx={10} />
      <rect x={deskX} y={deskY + chromeH - 6} width={deskW} height={6} fill={FR.salt} />
      <line x1={deskX} y1={deskY + chromeH} x2={deskX + deskW} y2={deskY + chromeH}
        stroke={FR.sand} strokeWidth={0.5} />
      {dot(deskX + 14, deskY + 14, '#FF5F57')}
      {dot(deskX + 28, deskY + 14, '#FEBC2E')}
      {dot(deskX + 42, deskY + 14, '#28C840')}
      {/* Address bar */}
      <rect x={deskX + 70} y={deskY + 6} width={deskW - 80} height={16}
        fill={FR.white} stroke={FR.sand} strokeWidth={0.5} rx={3} />
      <text x={deskX + 80} y={deskY + 17} fontSize={9} fill={FR.stone}
        fontFamily="ui-monospace,Menlo,monospace">foreignresource.co/products/{'{style-slug}'}</text>
      {/* Empty viewport */}
      <text x={deskX + deskW / 2} y={deskY + chromeH + (deskH - chromeH) / 2 - 6}
        textAnchor="middle" fontSize={9} fontWeight={600}
        fill={FR.stone} letterSpacing={1.5}>COMING SOON</text>
      <text x={deskX + deskW / 2} y={deskY + chromeH + (deskH - chromeH) / 2 + 14}
        textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif"
        fontSize={18} fill={FR.slate}>PDP Layout</text>

      {/* iPhone frame — outer slate body */}
      <rect x={phoneX} y={phoneY} width={phoneW} height={phoneH}
        fill={FR.slate} rx={18} />
      {/* Inner screen */}
      <rect x={phoneX + 5} y={phoneY + 5} width={phoneW - 10} height={phoneH - 10}
        fill={FR.white} rx={14} />
      {/* Dynamic Island */}
      <rect x={phoneX + phoneW / 2 - 18} y={phoneY + 12} width={36} height={11}
        fill={FR.slate} rx={6} />
      {/* Bottom home indicator */}
      <rect x={phoneX + phoneW / 2 - 22} y={phoneY + phoneH - 11} width={44} height={2.5}
        fill={FR.slate} opacity={0.4} rx={1.5} />
      {/* Inner copy */}
      <text x={phoneX + phoneW / 2} y={phoneY + phoneH / 2 - 6}
        textAnchor="middle" fontSize={8} fontWeight={600}
        fill={FR.stone} letterSpacing={1.5}>COMING SOON</text>
      <text x={phoneX + phoneW / 2} y={phoneY + phoneH / 2 + 10}
        textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif"
        fontSize={13} fill={FR.slate}>Mobile PDP</text>
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

      {/* ── Band 3: PRICING (maximum FOB only — retail is internal, excluded from PDF) ── */}
      {(() => {
        const bandY = 430;
        const bandH = 80;
        return (
          <g>
            <rect x={leftX} y={bandY} width={leftW} height={bandH} fill={FR.salt} />
            <rect x={leftX} y={bandY} width="3" height={bandH} fill={FR.soil} />
            <text x={leftX + 16} y={bandY + 18} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="2">PRICING</text>
            <text x={leftX + 16} y={bandY + 42} fontSize="8" fontWeight="bold" fill={FR.stone} letterSpacing="1.2">MAXIMUM FOB</text>
            <text x={leftX + 16} y={bandY + 66} fontFamily="ui-monospace, 'SF Mono', Menlo, monospace" fontSize="22" fill={FR.soil}>{maxFOB}</text>
          </g>
        );
      })()}

      {/* ── Quote strip — header row + one row per cost tier ───────────── */}
      {(() => {
        const tiers = (d.costTiers || []).filter(t => t.quantity || t.unitCost);
        const safeTiers = tiers.length ? tiers : [{}];
        const stripX   = 40;
        const stripW   = PAGE_W - 80;
        const headerH  = 38;
        const rowH     = 32;
        const stripY   = 555;
        const stripH   = headerH + safeTiers.length * rowH + 10;
        // Column layout: Tier | Qty | Unit Cost | Lead Time | Sample Lead | Sample Cost
        const cols = [
          { label: 'Tier',         w: 0.10 },
          { label: 'Quantity',     w: 0.16 },
          { label: 'Unit Cost',    w: 0.16 },
          { label: 'Lead Time',    w: 0.19 },
          { label: 'Sample Lead',  w: 0.19 },
          { label: 'Sample Cost',  w: 0.20 },
        ];
        let xCursor = 0;
        const colX = cols.map(c => { const x = xCursor; xCursor += c.w; return x; });
        const tierLabel = (i) => i === 0 ? 'MOQ' : `T${i + 1}`;
        return (
          <g>
            <rect x={stripX} y={stripY} width={stripW} height={stripH} fill={FR.slate} />
            <text x={stripX + 16} y={stripY + 16} fontSize="8" fontWeight="bold" fill={FR.sand} letterSpacing="2">
              QUOTE  ·  {esc((d.quoteProviderLink || 'Quote provider TBD').toUpperCase())}
            </text>
            <rect x={stripX + 16} y={stripY + 22} width="40" height="1.5" fill={FR.soil} />
            {/* Column headers */}
            {cols.map((c, ci) => (
              <text key={ci} x={stripX + 16 + colX[ci] * stripW} y={stripY + headerH - 6}
                fontSize="7" fontWeight="bold" fill={FR.sand} letterSpacing="1.2">{c.label.toUpperCase()}</text>
            ))}
            {/* One row per tier */}
            {safeTiers.map((t, ti) => {
              const rowY = stripY + headerH + ti * rowH;
              const vals = [
                tierLabel(ti),
                t.quantity ? `${t.quantity}` : '—',
                t.unitCost ? `$${t.unitCost}` : '—',
                ti === 0 && d.leadTimeDays ? `${d.leadTimeDays} days` : (ti === 0 ? '—' : ''),
                ti === 0 && d.sampleLeadTimeDays ? `${d.sampleLeadTimeDays} days` : (ti === 0 ? '—' : ''),
                ti === 0 && d.sampleCost ? `$${d.sampleCost}` : (ti === 0 ? '—' : ''),
              ];
              return (
                <g key={ti}>
                  {ti > 0 && <line x1={stripX} y1={rowY} x2={stripX + stripW} y2={rowY} stroke="rgba(245,240,232,0.10)" />}
                  {vals.map((v, ci) => (
                    <text key={ci}
                      x={stripX + 16 + colX[ci] * stripW}
                      y={rowY + 20}
                      fontFamily={ci >= 1 ? "ui-monospace, 'SF Mono', Menlo, monospace" : 'inherit'}
                      fontSize={ci === 0 ? 9 : 14}
                      fontWeight={ci === 0 ? 'bold' : 'normal'}
                      fill={ci === 0 ? FR.soil : FR.salt}>
                      {esc(v)}
                    </text>
                  ))}
                </g>
              );
            })}
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

// SMIL-animated spinner — pure SVG so it works inside the live-preview <svg>
// without any CSS-in-JS plumbing. Stroke arc renders ~3/4 of the circle then
// rotates indefinitely. Use it whenever a cover image is in flight so the
// supplier knows the system is working, not stuck.
function Spinner({ cx, cy, r = 14, color = FR.soil }) {
  const stroke = Math.max(2, r / 6);
  const c = 2 * Math.PI * r;
  return (
    <g>
      {/* faint background ring so the spinner reads against any fill */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={stroke} />
      {/* animated arc */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * 0.25} ${c}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from={`0 ${cx} ${cy}`}
          to={`360 ${cx} ${cy}`}
          dur="0.9s"
          repeatCount="indefinite"
        />
      </circle>
    </g>
  );
}

function PhotoSlot({ x, y, w, h, label, image, placeholder, loading = false }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={FR.white} stroke={FR.soil} strokeDasharray="5 4" />
      {image ? (
        <image href={image.data} x={x + 4} y={y + 4} width={w - 8} height={h - 8} preserveAspectRatio="xMidYMid meet" />
      ) : loading ? (
        <Spinner cx={x + w / 2} cy={y + h / 2} r={Math.min(20, Math.max(10, Math.min(w, h) * 0.12))} />
      ) : (
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
function PageFlatlays({ d, images, frontSlot = 'flatlay-front', backSlot = 'flatlay-back', subtitle = 'Front and back annotated flat lay diagrams.', frontLabel = 'Front', backLabel = 'Back' }) {
  const imgs = images || [];
  const front = imgs.find(i => i.slot === frontSlot);
  const back  = imgs.find(i => i.slot === backSlot);

  // Two side-by-side cells maximised to fill the content area below the
  // info strip. Each cell is A4-landscape so the in-app preview matches
  // what lands on the printed page.
  const gridY   = 170;
  const gridGap = 18;
  const cellW   = (PAGE_W - 80 - gridGap) / 2;
  const cellH   = PAGE_H - gridY - 70;

  return (
    <g>
      <InfoStrip d={d} />

      <text x={PAGE_W / 2} y={152} textAnchor="middle" fontSize="11" fill={FR.stone} fontStyle="italic">
        {subtitle}
      </text>

      <PhotoSlot x={40}                   y={gridY} w={cellW} h={cellH} label={frontLabel} image={front} />
      <PhotoSlot x={40 + cellW + gridGap} y={gridY} w={cellW} h={cellH} label={backLabel}  image={back} />
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
// ─── Page 03 — Fabrics (live preview reads pickedFabrics references) ────────
// Page 03 now renders the same `FabricBOMPreviewBody` the library card
// uses, so the tech pack live preview cannot drift from the fabric card.
// Single-fabric mode for now — the picker still allows up to three
// fabrics, but the live preview shows the first picked fabric on its
// dedicated page. Multi-fabric pagination (one A4 per fabric, dropdown
// nav) is the follow-up.
function PageFabrics({ d, fabricsById = {}, fabricPageIdx = 0 }) {
  const picked = (d?.pickedFabrics || []).filter(p => p?.fabricId);
  if (picked.length === 0) {
    return (
      <g>
        <text x={PAGE_W / 2} y={94} textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="14" fill={FR.stone}>
          Pick fabrics in the BOM step to populate this page.
        </text>
        <rect x={(PAGE_W - 540) / 2} y={300} width="540" height="180"
          fill={FR.salt} stroke={FR.sand} strokeWidth="0.5" rx="8" />
        <text x={PAGE_W / 2} y={395} textAnchor="middle" fontSize="13" fill={FR.stone} fontStyle="italic">
          No fabric picked
        </text>
      </g>
    );
  }
  const entry = picked[Math.min(fabricPageIdx, picked.length - 1)];
  const fabric = fabricsById[entry.fabricId];
  // Show a spinner card while the fabric library row is still being fetched
  // (signed cover URL, vendor lookup, color cards). Without it the page
  // looked frozen for the seconds it takes the loader to resolve everything.
  if (!fabric) {
    return (
      <g>
        <text x={PAGE_W / 2} y={94} textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="14" fill={FR.stone}>
          Loading fabric…
        </text>
        <rect x={(PAGE_W - 540) / 2} y={240} width="540" height="280"
          fill={FR.salt} stroke={FR.sand} strokeWidth="0.5" rx="8" />
        <Spinner cx={PAGE_W / 2} cy={380} r={28} />
      </g>
    );
  }
  const chosenColor = entry.colorLabel || entry.colorHex || entry.colorUrl
    ? { label: entry.colorLabel, hex: entry.colorHex, url: entry.colorUrl }
    : null;
  return (
    <FabricBOMPreviewBody
      fabric={fabric}
      chosenColor={chosenColor}
      chosenArea={entry.role || null}
      chosenFinishes={entry.chosenFinishes || null}
      chosenNotes={entry.chosenNotes != null ? entry.chosenNotes : null}
      chosenPlacementImage={entry.chosenPlacementImage != null ? entry.chosenPlacementImage : null}
      chosenPlacementNotes={entry.chosenPlacementNotes != null ? entry.chosenPlacementNotes : null}
      yieldM={entry.metersPerUnit || null}
      chosenPricePerMeterUsd={entry.chosenPricePerMeterUsd ?? null}
      chosenPricePerKgUsd={entry.chosenPricePerKgUsd ?? null}
    />
  );
}

// ─── Page 04 — Trims (image-first 6-card grid) ──────────────────────────────
function PageTrims({ d, componentsById = {} }) {
  return <ComponentGridPage entries={(d?.pickedTrims || []).slice(0, 6)} subtitle="Image-first detail of every trim and hardware component, picked from the Component Pack library." componentsById={componentsById} />;
}

// ─── Page 05 — Packaging ────────────────────────────────────────────────────
function PagePackaging({ d, componentsById = {} }) {
  return <ComponentGridPage entries={(d?.pickedPackaging || []).slice(0, 6)} subtitle="Polybags, hang tags, stickers, branded boxes — every packaging component." componentsById={componentsById} />;
}

function ComponentGridPage({ entries, subtitle, componentsById = {} }) {
  const cols = 3, rows = 2;
  const cardW = 320;
  const cardH = 250;
  const gap = 14;
  const totalW = cardW * cols + gap * (cols - 1);
  const startX = (PAGE_W - totalW) / 2;
  const startY = 130;
  const imgH = cardH * 0.5;

  return (
    <g>
      <text x={PAGE_W / 2} y={108} textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="14" fill={FR.stone}>
        {subtitle}
      </text>
      {Array.from({ length: cols * rows }).map((_, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const x = startX + c * (cardW + gap);
        const y = startY + r * (cardH + gap);
        const entry = entries[i];
        const entryId = entry?.componentId || entry?.id || null;
        const full = entryId ? componentsById[entryId] : null;
        const cd = full?.data || {};
        const tier = (cd.costTiers || [])[0];
        const unitCost = parseFloat(tier?.unitCost) || parseFloat(full?.cost_per_unit) || parseFloat(cd?.targetUnitCost) || 0;
        const qtyNum = parseFloat(String(entry?.quantity || '').replace(/[^0-9.]/g, '')) || 1;
        const lineCost = unitCost * qtyNum;
        const formatM = (n) => n > 0 ? `$${n.toFixed(2)}` : '$0.00';
        const cover  = full?.cover_image || cd.cover_image;
        const name   = full?.component_name || cd.componentName || (full ? (entry?.role || 'Untitled') : (entry ? 'Loading…' : ''));
        const type   = cd.componentType || full?.component_category || (entry?.role || '');
        const qty    = entry?.quantity || '—';
        const packHref = entry?.componentId
          ? `${(typeof window !== 'undefined' ? window.location.origin : '')}/#plm/library/trims/${entry.componentId}`
          : null;
        return (
          <g key={i}>
            <rect x={x} y={y} width={cardW} height={cardH}
              fill={FR.white} stroke={FR.sand} strokeWidth={0.5} rx={6} />
            {!entry && (
              <text x={x + cardW / 2} y={y + cardH / 2} textAnchor="middle"
                fontSize={11} fill={FR.stone} fontStyle="italic">Empty slot</text>
            )}
            {entry && (
              <>
                <rect x={x} y={y} width={cardW} height={imgH} fill={FR.salt} rx={6} />
                {cover ? (
                  // `meet` so the full image is visible without cropping.
                  <image href={cover} x={x + 4} y={y + 4} width={cardW - 8} height={imgH - 8}
                    preserveAspectRatio="xMidYMid meet" />
                ) : entryId && !full ? (
                  // Pack reference exists but the full row hasn't resolved
                  // yet — spinner so the user sees we're working on it.
                  <Spinner cx={x + cardW / 2} cy={y + imgH / 2} r={18} />
                ) : (
                  <text x={x + cardW / 2} y={y + imgH / 2 + 4} textAnchor="middle"
                    fontSize={9} fill={FR.stone} fontStyle="italic">cover image</text>
                )}
                <text x={x + 14} y={y + imgH + 22}
                  fontSize={9} fontWeight={600} fill={FR.soil} letterSpacing={1}>
                  {String(type || `Slot ${i + 1}`).toUpperCase()}
                </text>
                <text x={x + 14} y={y + imgH + 44}
                  fontSize={14} fill={FR.slate} fontFamily="'Cormorant Garamond', Georgia, serif">
                  {name}
                </text>
                {packHref && (
                  <a href={packHref} target="_blank" rel="noopener">
                    <text x={x + cardW - 14} y={y + imgH + 44} textAnchor="end"
                      fontSize={10} fill={FR.soil}
                      style={{ textDecoration: 'underline', cursor: 'pointer' }}>
                      View tech pack ↗
                    </text>
                  </a>
                )}
                <text x={x + 14} y={y + cardH - 32} fontSize={9} fill={FR.stone}>
                  Quantity · {qty}    Unit · {formatM(unitCost)}
                </text>
                <text x={cardW + x - 14} y={y + cardH - 14} textAnchor="end"
                  fontSize={12} fontWeight={700} fill={FR.slate}
                  fontFamily="ui-monospace, Menlo, monospace">
                  {formatM(lineCost)}
                </text>
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}

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

// ─── Stitching — two pages (09 = stitches 1–4, 10 = 5–8) ────────────────────
// Mirrors the Call Outs pages: a tall garment callout reference (left) with
// placed numbered dots + a 2×2 grid of stitch cards (each = main 3D render +
// optional supporting reference image + number + name), then the shared-header
// Seam & Stitch spec table below for that page's four stitches.
function PageConstruction({ d, images, pageKey = 'page1' }) {
  const imgs   = images || [];
  const nums   = pageKey === 'page2' ? [5, 6, 7, 8] : [1, 2, 3, 4];
  const rowStart = pageKey === 'page2' ? 4 : 0;
  const refSlot  = `seam-stitch-callout-${pageKey}`;
  const callout  = imgs.find(i => i.slot === refSlot);
  const allBlocks = (d.seamStitchBlocks && d.seamStitchBlocks.length) ? d.seamStitchBlocks : [];
  const blockFor = (n) => allBlocks.find(b => b.num === n) || { num: n, label: '', dot: null };
  const seams = d.seams || [];

  const padX   = 40;
  const refY   = 170;
  const refH   = 392;                 // top region height (cards bottom-align)
  const refLabel = 22;
  const refW   = Math.round(refH * CALLOUT_REF_RATIO);
  const colGap = 24;
  const rightX = padX + refW + colGap;
  const rightW = PAGE_W - padX - rightX;
  const rowGap = 16;
  const colGap2 = 16;
  const cardW  = (rightW - colGap2) / 2;
  const cardH  = (refH - rowGap) / 2;
  const pad      = 9;
  const imgGap   = 8;
  const dotR     = 11;
  const labelGap = 14;   // room for the small RENDER / REFERENCE label above the image
  const bandW  = cardW - pad * 2;
  // Height-cap so the small label above + the numbered title row below both fit
  // inside the (shorter) stitch card — the spec table beneath leaves less
  // vertical room than the Call Outs page. Main then fills the leftover width.
  const imageH = Math.min(
    Math.round((bandW - imgGap) / (CALLOUT_MAIN_RATIO + CALLOUT_SUPPORT_RATIO)),
    cardH - 48 - labelGap,
  );

  // Spec table below, one fixed row per stitch on this page (# = stitch number).
  const tableY   = refY + refH + refLabel + 40;
  const seamColsRaw = [
    { key: 'num',        label: '#',           w: 28  },
    { key: 'seam',       label: 'Seam',        w: 150 },
    { key: 'seamType',   label: 'Seam Type',   w: 120 },
    { key: 'stitchType', label: 'Stitch Type', w: 90  },
    { key: 'machine',    label: 'Machine',     w: 158 },
    { key: 'spiSpcm',    label: 'SPI/SPCM',    w: 80  },
    { key: 'threadColor',label: 'Thread Color',w: 100 },
    { key: 'threadType', label: 'Thread Type', w: 120 },
    { key: 'notes',      label: 'Notes',       w: 153 },
  ];
  // Stretch the table so its right edge lines up with the cards and the header
  // strip — left at padX, right at PAGE_W - padX, everything even.
  const seamTableW = PAGE_W - padX * 2;
  const seamRawSum = seamColsRaw.reduce((a, c) => a + c.w, 0);
  const seamCols   = seamColsRaw.map(c => ({ ...c, w: c.w * seamTableW / seamRawSum }));
  // The "Seam" column is the stitch's name — kept in sync with the card title.
  const pageRows = nums.map((n, i) => ({ num: n, ...(seams[rowStart + i] || {}), seam: blockFor(n).label || '' }));

  return (
    <g>
      <InfoStrip d={d} />

      <text x={PAGE_W / 2} y={158} textAnchor="middle" fontSize="11" fill={FR.stone} fontStyle="italic">
        Numbered dots mark where each stitch runs. Each card carries the closed 3D render, an optional reference photo, and its number; specs are in the table below.
      </text>

      {/* garment callout reference (left) — one narrow image, or two stacked 2:3 */}
      {d?.referenceLayout?.[refSlot] ? (
        <TwoStackedRefs imgs={imgs} baseSlot={refSlot} x={padX} y={refY} w={refW} h={refH} d={d} keyPrefix={`sg-${pageKey}`}
          dots={nums.map(n => blockFor(n)).filter(b => b.dot).map(b => ({ num: b.num, x: b.dot.x, y: b.dot.y }))} />
      ) : (
        <>
          <PhotoSlot x={padX} y={refY} w={refW} h={refH} label="Stitch Map" image={callout} />
          {nums.map(n => { const b = blockFor(n); return b.dot ? (
            <g key={`dot-${n}`}>
              <circle cx={padX + 4 + b.dot.x * (refW - 8)} cy={refY + 4 + b.dot.y * (refH - 8)} r={dotR} fill="#A32D2D" stroke="#FFFFFF" strokeWidth={1.5} />
              <text x={padX + 4 + b.dot.x * (refW - 8)} y={refY + 4 + b.dot.y * (refH - 8) + 4} textAnchor="middle" fontSize="12" fontWeight="600" fill="#FFFFFF">{n}</text>
            </g>
          ) : null; })}
          <AnnotationSvg annos={d?.calloutAnnotations?.[refSlot]} x={padX + 4} y={refY + 4} w={refW - 8} h={refH - 8} keyPrefix={`sg-${pageKey}`} />
        </>
      )}

      {/* 2×2 grid of stitch cards */}
      {nums.map((n, i) => {
        const b = blockFor(n);
        const col = i % 2;
        const row = Math.floor(i / 2);
        const cx = rightX + col * (cardW + colGap2);
        const cy = refY + row * (cardH + rowGap);
        const mainImg = imgs.find(im => im.slot === `seam-stitch-${n}`);
        const suppImg = imgs.find(im => im.slot === `seam-stitch-${n}-support`);
        const bandX = cx + pad;
        const bandY = cy + pad + labelGap;
        const supW  = CALLOUT_SUPPORT_RATIO * imageH;
        const mainW = suppImg ? (bandW - imgGap - supW) : bandW;
        const titleY = bandY + imageH + 24;
        const labelY = cy + pad + 9;
        const numCx  = bandX + 11;
        const code   = (seams[n - 1] || {}).stitchType;
        return (
          <g key={n}>
            <rect x={cx} y={cy} width={cardW} height={cardH} fill={FR.white} stroke={FR.sand} strokeWidth={0.5} rx={6} />
            {/* small labels above each image */}
            <text x={bandX} y={labelY} fontSize="7.5" fontWeight="bold" fill={FR.soil} letterSpacing="0.8">RENDER</text>
            {suppImg && (
              <text x={bandX + mainW + imgGap} y={labelY} fontSize="7.5" fontWeight="bold" fill={FR.soil} letterSpacing="0.8">REFERENCE</text>
            )}
            <ImageCell x={bandX} y={bandY} w={mainW} h={imageH} image={mainImg} placeholder={`Stitch ${n} — 3D render`} />
            <AnnotationSvg annos={d?.calloutAnnotations?.[`seam-stitch-${n}`]} x={bandX} y={bandY} w={mainW} h={imageH} keyPrefix={`sm-${n}`} />
            {suppImg && <ImageCell x={bandX + mainW + imgGap} y={bandY} w={supW} h={imageH} image={suppImg} placeholder="Ref" />}
            {suppImg && <AnnotationSvg annos={d?.calloutAnnotations?.[`seam-stitch-${n}-support`]} x={bandX + mainW + imgGap} y={bandY} w={supW} h={imageH} keyPrefix={`ss-${n}`} />}
            <circle cx={numCx} cy={titleY - 4} r={11} fill="#A32D2D" />
            <text x={numCx} y={titleY} textAnchor="middle" fontSize="12" fontWeight="600" fill="#FFFFFF">{n}</text>
            <text x={bandX + 29} y={titleY} fontSize="13" fontWeight="600" fill={FR.slate}>
              {esc((b.label || `Stitch ${n}`).slice(0, 34))}
            </text>
            {code ? (
              <text x={bandX + bandW} y={titleY} textAnchor="end" fontSize="10" fontWeight="600" fill={FR.soil} fontFamily="ui-monospace, Menlo, monospace">{esc(String(code).slice(0, 14))}</text>
            ) : null}
          </g>
        );
      })}

      <SectionHeading x={40} y={tableY - 12}>Seam &amp; Stitch Specification</SectionHeading>
      <GridTable
        x={40} y={tableY} cols={seamCols} rows={pageRows} bodyRows={nums.length}
        renderCell={(key, row, cellX, ry) => {
          if (key !== 'num') return null;
          const ccx = cellX + 13;
          const ccy = ry + 11;
          return (
            <>
              <circle cx={ccx} cy={ccy} r={8} fill="#A32D2D" />
              <text x={ccx} y={ccy + 3} textAnchor="middle" fontSize="9" fontWeight="600" fill="#FFFFFF">{row.num}</text>
            </>
          );
        }}
      />
    </g>
  );
}

// Image cell without a caption bar — used by the enhanced Cut & Sew call-out
// cards so the numbered title sits cleanly below the image (no overlap).
function ImageCell({ x, y, w, h, image, placeholder }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={FR.white} stroke={FR.soil} strokeDasharray="5 4" />
      {image ? (
        // slice = cover: the image is pre-cropped to the slot shape, so it fills
        // edge-to-edge with no letterboxing (and cover-fills if the slot widened).
        <image href={image.data} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize="11" fill={FR.stone} fontStyle="italic">
          {placeholder}
        </text>
      )}
    </g>
  );
}

// Two stacked strict-2:3 reference images centred in the reference column,
// each with its own annotations. Used when the operator picks the 2-image
// reference layout on the Construction / Sewing pages.
function TwoStackedRefs({ imgs, baseSlot, x, y, w, h, d, keyPrefix, dots = [] }) {
  const gap = 12;
  const cellH = (h - gap) / 2;
  const cellW = Math.round(cellH * (2 / 3));   // strict 2:3 portrait
  const cx = x + (w - cellW) / 2;              // centred in the column
  const slots = [baseSlot, `${baseSlot}-b`];
  return (
    <g>
      {slots.map((slot, i) => {
        const im = (imgs || []).find(g => g.slot === slot);
        const cy = y + i * (cellH + gap);
        return (
          <g key={slot}>
            <rect x={cx} y={cy} width={cellW} height={cellH} fill={FR.white} stroke={FR.soil} strokeDasharray="5 4" />
            {im ? (
              <image href={im.data} x={cx} y={cy} width={cellW} height={cellH} preserveAspectRatio="xMidYMid slice" />
            ) : (
              <text x={cx + cellW / 2} y={cy + cellH / 2 + 4} textAnchor="middle" fontSize="10" fill={FR.stone} fontStyle="italic">{`Reference ${i + 1}`}</text>
            )}
            <AnnotationSvg annos={d?.calloutAnnotations?.[slot]} x={cx} y={cy} w={cellW} h={cellH} keyPrefix={`${keyPrefix}-${i}`} />
          </g>
        );
      })}
      {/* numbered dots — coords are 0..1 over the whole stack (cellW × h), the
          same box the editor normalises to, so they land on the same spot. */}
      {(dots || []).map(dt => (
        <g key={`dot-${dt.num}`}>
          <circle cx={cx + dt.x * cellW} cy={y + dt.y * h} r={11} fill="#A32D2D" stroke="#FFFFFF" strokeWidth={1.5} />
          <text x={cx + dt.x * cellW} y={y + dt.y * h + 4} textAnchor="middle" fontSize="12" fontWeight="600" fill="#FFFFFF">{dt.num}</text>
        </g>
      ))}
      <rect x={x} y={y + h} width={w} height={22} fill={FR.salt} stroke={FR.sand} />
      <text x={x + w / 2} y={y + h + 15} textAnchor="middle" fontSize="9" fontWeight="bold" fill={FR.slate} letterSpacing="1.5">REFERENCE</text>
    </g>
  );
}

// ─── Page 7 — Construction Notes ────────────────────────────────────────────
// ─── Construction Details Pages (1 of 2) ────────────────────────────────────
// Construction Details — page 1 or page 2 depending on `pageKey`. Layout:
// 2:3 reference image on the left, 2x2 grid of detail cards on the right. Each
// card has a red-numbered circle + translatable title + description.
//
// `enhanced` (Cut & Sew 07/08) fills the full page height, gives each call-out
// a large main image plus an optional smaller supporting image (main expands
// when there's no support), and renders the in-app placed numbered dots over
// the garment. Without `enhanced` (Embellishments 16, Treatments 19) the
// original compact layout is preserved exactly.
function PageSketches({ d, images, pageKey = 'page1', fieldName, slotKey, enhanced }) {
  const imgs = images || [];
  const resolvedField = fieldName || (pageKey === 'page2' ? 'constructionDetailsPage2' : 'constructionDetailsPage1');
  const resolvedSlot  = slotKey  || `sketch-callout-${pageKey}`;
  const entries = ((d?.[resolvedField]) || []).slice(0, 4);
  const callout = imgs.find(i => i.slot === resolvedSlot);

  const topY = 158;
  const padX = 40;
  const refY = 170;

  if (enhanced) {
    // ── Big, page-filling layout (Cut & Sew pages 07 / 08) ──
    const bottomY  = 762;                 // leave a band above the footer
    const refLabel = 22;                  // PhotoSlot caption bar height
    const refH     = bottomY - refY - refLabel;       // image area height
    const refW     = Math.round(refH * CALLOUT_REF_RATIO); // narrow portrait → wider cards
    const colGap   = 24;
    const rightX   = padX + refW + colGap;
    const rightW   = PAGE_W - padX - rightX;
    const rowGap   = 16;
    const colGap2  = 16;
    const cardW    = (rightW - colGap2) / 2;
    const cardH    = (refH - rowGap) / 2;  // right grid bottom aligns to the ref
    const pad      = 9;
    const imgGap   = 8;
    const dotR     = 11;
    const bandW    = cardW - pad * 2;
    // Image-band height derived so a 3:2 main + 1:1 support tile the band width
    // exactly (mainW + gap + supW == bandW). Same shapes the editor crops to, so
    // every image fills its slot with no letterboxing.
    const imageH   = Math.round((bandW - imgGap) / (CALLOUT_MAIN_RATIO + CALLOUT_SUPPORT_RATIO));

    return (
      <g>
        <InfoStrip d={d} />

        <text x={PAGE_W / 2} y={topY - 6} textAnchor="middle" fontSize="11" fill={FR.stone} fontStyle="italic">
          Numbered dots mark each call-out on the garment. Each card carries a large main close-up, an optional supporting image, a title, and a description.
        </text>

        {/* garment reference (left) — one narrow image, or two stacked 2:3 */}
        {d?.referenceLayout?.[resolvedSlot] ? (
          <TwoStackedRefs imgs={imgs} baseSlot={resolvedSlot} x={padX} y={refY} w={refW} h={refH} d={d} keyPrefix={`ga-${pageKey}`}
            dots={entries.filter(e => e.dot).map(e => ({ num: e.num, x: e.dot.x, y: e.dot.y }))} />
        ) : (
          <>
            <PhotoSlot x={padX} y={refY} w={refW} h={refH} label="Reference" image={callout} />
            {/* in-app placed numbered dots — coords are 0..1 over the image area
                drawn inside the PhotoSlot (inset 4px) */}
            {entries.map(entry => entry.dot ? (
              <g key={`dot-${entry.num}`}>
                <circle cx={padX + 4 + entry.dot.x * (refW - 8)} cy={refY + 4 + entry.dot.y * (refH - 8)}
                  r={dotR} fill="#A32D2D" stroke="#FFFFFF" strokeWidth={1.5} />
                <text x={padX + 4 + entry.dot.x * (refW - 8)} y={refY + 4 + entry.dot.y * (refH - 8) + 4}
                  textAnchor="middle" fontSize="12" fontWeight="600" fill="#FFFFFF">
                  {entry.num}
                </text>
              </g>
            ) : null)}
            <AnnotationSvg annos={d?.calloutAnnotations?.[resolvedSlot]} x={padX + 4} y={refY + 4} w={refW - 8} h={refH - 8} keyPrefix={`ga-${pageKey}`} />
          </>
        )}

        {/* 2x2 grid of large detail cards */}
        {entries.map((entry, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const cx  = rightX + col * (cardW + colGap2);
          const cy  = refY   + row * (cardH + rowGap);
          const detailImg  = imgs.find(im => im.slot === `construction-detail-${entry.num}`);
          const supportImg = imgs.find(im => im.slot === `construction-detail-${entry.num}-support`);
          const bandX = cx + pad;
          const bandY = cy + pad;
          // With a support image: main = 3:2, support = 1:1, both height imageH,
          // tiling the band. Without support: main expands to the full band.
          const mainW = supportImg ? CALLOUT_MAIN_RATIO * imageH : bandW;
          const supW  = CALLOUT_SUPPORT_RATIO * imageH;
          const titleY = bandY + imageH + 24;
          const numCx  = bandX + 11;
          const descY  = titleY + 9;
          return (
            <g key={entry.num}>
              <rect x={cx} y={cy} width={cardW} height={cardH}
                fill={FR.white} stroke={FR.sand} strokeWidth={0.5} rx={6} />
              <ImageCell x={bandX} y={bandY} w={mainW} h={imageH} image={detailImg} placeholder={`Detail ${entry.num}`} />
              <AnnotationSvg annos={d?.calloutAnnotations?.[`construction-detail-${entry.num}`]} x={bandX} y={bandY} w={mainW} h={imageH} keyPrefix={`dm-${entry.num}`} />
              {supportImg && (
                <ImageCell x={bandX + mainW + imgGap} y={bandY} w={supW} h={imageH} image={supportImg} placeholder="Ref" />
              )}
              {supportImg && <AnnotationSvg annos={d?.calloutAnnotations?.[`construction-detail-${entry.num}-support`]} x={bandX + mainW + imgGap} y={bandY} w={supW} h={imageH} keyPrefix={`ds-${entry.num}`} />}
              {/* red numbered circle + title row, cleanly below the image */}
              <circle cx={numCx} cy={titleY - 4} r={11} fill="#A32D2D" />
              <text x={numCx} y={titleY} textAnchor="middle" fontSize="12" fontWeight="600" fill="#FFFFFF">
                {entry.num}
              </text>
              <text x={bandX + 29} y={titleY} fontSize="13" fontWeight="600" fill={FR.slate}>
                {entry.title || `Detail ${entry.num}`}
              </text>
              <foreignObject x={bandX} y={descY} width={bandW} height={cy + cardH - pad - descY}>
                <div xmlns="http://www.w3.org/1999/xhtml"
                  style={{ fontSize: 10.5, color: FR.slate, lineHeight: 1.45, fontFamily: "'Helvetica Neue', sans-serif", whiteSpace: 'pre-wrap' }}>
                  {entry.description || ''}
                </div>
              </foreignObject>
            </g>
          );
        })}
      </g>
    );
  }

  // ── Original compact layout (Embellishments 16 / Treatments 19) — unchanged ──
  const colGap  = 18;
  const refW    = 240;
  const refH    = refW * (3 / 2); // 2:3 vertical (taller than wide)

  const rightX  = padX + refW + colGap;
  const rightW  = PAGE_W - padX - rightX;
  const rowGap  = 12;
  const colGap2 = 12;
  const cardCols = 2;
  const cardRows = 2;
  const cardW   = (rightW - colGap2 * (cardCols - 1)) / cardCols;
  const cardH   = (refH - rowGap) / cardRows;
  const imageH  = cardH * 0.55;

  return (
    <g>
      <InfoStrip d={d} />

      <text x={PAGE_W / 2} y={topY - 6} textAnchor="middle" fontSize="11" fill={FR.stone} fontStyle="italic">
        Number each callout on the reference image (red dots). Each detail card carries its own close-up image, title, and description.
      </text>

      {/* 2:3 reference image on the left */}
      <PhotoSlot
        x={padX} y={refY}
        w={refW} h={refH}
        label="Reference"
        image={callout}
      />

      {/* 2x2 grid of detail cards on the right; each card has its own image */}
      {entries.map((entry, i) => {
        const col = i % cardCols;
        const row = Math.floor(i / cardCols);
        const cx  = rightX + col * (cardW + colGap2);
        const cy  = refY   + row * (cardH + rowGap);
        const detailImg = imgs.find(im => im.slot === `construction-detail-${entry.num}`);
        const titleY = cy + imageH + 18;
        const descY  = titleY + 8;
        const numCx  = cx + 18;
        return (
          <g key={entry.num}>
            {/* card border */}
            <rect x={cx} y={cy} width={cardW} height={cardH}
              fill={FR.white} stroke={FR.sand} strokeWidth={0.5} rx={4} />
            {/* image area at the top */}
            <PhotoSlot
              x={cx} y={cy}
              w={cardW} h={imageH}
              label={`Detail ${entry.num}`}
              image={detailImg}
            />
            {/* red numbered circle at the start of the title row */}
            <circle cx={numCx} cy={titleY - 4} r={9} fill="#A32D2D" />
            <text x={numCx} y={titleY} textAnchor="middle"
              fontSize="10" fontWeight="600" fill="#FFFFFF">
              {entry.num}
            </text>
            {/* title */}
            <text x={cx + 34} y={titleY} fontSize="11" fontWeight="600" fill={FR.slate}>
              {entry.title || `Detail ${entry.num}`}
            </text>
            {/* description body */}
            <foreignObject x={cx + 12} y={descY} width={cardW - 24} height={cy + cardH - descY - 8}>
              <div xmlns="http://www.w3.org/1999/xhtml"
                style={{ fontSize: 9, color: FR.slate, lineHeight: 1.4, fontFamily: "'Helvetica Neue', sans-serif", whiteSpace: 'pre-wrap' }}>
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
  const pickedFabrics = (d?.pickedFabrics || []).filter(p => p?.fabricId);
  const yieldCols = Math.max(pickedFabrics.length, 1);
  const yieldColW = (PAGE_W - 80) / yieldCols;

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
      {/* bodyRows=4 frees ~22px for the yield strip below */}
      <GridTable x={40} y={432} cols={cols} rows={pieces} bodyRows={4} />

      {/* Fabric Yield — compact 3-column strip, one cell per picked fabric */}
      <SectionHeading x={40} y={545}>Fabric Yield</SectionHeading>
      {pickedFabrics.length === 0 && (
        <text x={50} y={568} fontSize={10} fill={FR.stone} fontStyle="italic">
          No fabrics picked yet — set garment type in the BOM step.
        </text>
      )}
      {pickedFabrics.map((entry, i) => {
        const fx = 40 + i * yieldColW;
        const hasMpu = entry.metersPerUnit != null;
        return (
          <g key={i}>
            <text x={fx + 10} y={562} fontSize={8} fontWeight={600} fill={FR.soil} letterSpacing={0.4}>
              {(entry.role || `FABRIC ${i + 1}`).toUpperCase()}
            </text>
            <text x={fx + 10} y={578} fontSize={12} fontWeight={600} fill={hasMpu ? FR.slate : FR.stone}
              fontFamily="ui-monospace, Menlo, monospace">
              {hasMpu ? `${entry.metersPerUnit}m` : '— TBD'}
            </text>
            <text x={fx + 10} y={592} fontSize={8}
              fill={hasMpu ? (entry.yieldIsActual || entry.yieldIsManual ? '#3B6D11' : '#854F0B') : '#854F0B'}>
              {hasMpu
                ? (entry.yieldIsActual ? 'CLO3D actual' : entry.yieldIsManual ? 'manual' : 'std. estimate')
                : 'set garment type in BOM step'}
            </text>
          </g>
        );
      })}

      <SectionHeading x={40} y={615}>Cutting Instructions</SectionHeading>
      <foreignObject x="40" y="630" width={PAGE_W - 80} height="130">
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

// ─── Treatments — Render (three-angle photos + wash types) ──────────────────
function PageTreatments({ d, images }) {
  const imgs = images || [];
  const front = imgs.find(i => i.slot === 'treatment-front');
  const back  = imgs.find(i => i.slot === 'treatment-back');
  const side  = imgs.find(i => i.slot === 'treatment-side');

  const washTypes = (d.treatmentWashTypes || []).filter(r => r.name || r.notes);

  const gridY   = 152;
  const gridGap = 14;
  const cellW   = (PAGE_W - 80 - gridGap * 2) / 3;
  const cellH   = 380;
  const tableY  = gridY + cellH + 26;

  const wCols = [
    { key: 'name',  label: 'Wash Type', w: 320 },
    { key: 'notes', label: 'Notes',     w: PAGE_W - 80 - 320 },
  ];

  return (
    <g>
      <InfoStrip d={d} />

      <PhotoSlot x={40}                            y={gridY} w={cellW} h={cellH} label="Front" image={front} />
      <PhotoSlot x={40 + cellW + gridGap}          y={gridY} w={cellW} h={cellH} label="Back"  image={back} />
      <PhotoSlot x={40 + (cellW + gridGap) * 2}    y={gridY} w={cellW} h={cellH} label="Side"  image={side} />

      <SectionHeading x={40} y={tableY}>Wash Types</SectionHeading>
      <GridTable x={40} y={tableY + 12} cols={wCols} rows={washTypes} bodyRows={4} />
    </g>
  );
}

// ─── Embellishments — Sizing & Colors ───────────────────────────────────────
function PageEmbSizing({ d, images }) {
  const imgs = images || [];
  const ref  = imgs.find(i => i.slot === 'emb-sizing-reference');
  const s1   = imgs.find(i => i.slot === 'emb-sizing-source-1');
  const s2   = imgs.find(i => i.slot === 'emb-sizing-source-2');
  const s3   = imgs.find(i => i.slot === 'emb-sizing-source-3');

  const refY    = 152;
  const refH    = 320;
  const refW    = (PAGE_W - 80 - 14) / 2;
  const sourceX = 40 + refW + 14;
  const sourceCellH = (refH - 12 * 2) / 3;

  const notes = (d.embSizingNotes || '').trim();
  const notesY = refY + refH + 22;

  return (
    <g>
      <InfoStrip d={d} />

      <PhotoSlot x={40} y={refY} w={refW} h={refH} label="Sizing & Color Reference" image={ref} />
      <PhotoSlot x={sourceX} y={refY}                                w={refW} h={sourceCellH} label="Source File 1" image={s1} />
      <PhotoSlot x={sourceX} y={refY + sourceCellH + 12}             w={refW} h={sourceCellH} label="Source File 2" image={s2} />
      <PhotoSlot x={sourceX} y={refY + (sourceCellH + 12) * 2}       w={refW} h={sourceCellH} label="Source File 3" image={s3} />

      {notes && (
        <g>
          <SectionHeading x={40} y={notesY}>Sizing &amp; Color Notes</SectionHeading>
          <foreignObject x={40} y={notesY + 14} width={PAGE_W - 80} height={Math.max(60, PAGE_H - notesY - 80)}>
            <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontSize: 10.5, color: FR.slate, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {notes}
            </div>
          </foreignObject>
        </g>
      )}
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
// Index parity is required — TechPackPagePreview indexes into PAGE_FNS by
// `step` directly, so a misaligned slot here means the wrong page renders
// for the wrong sidebar entry (the bug from PR #83).
// Cut & Sew Cost — internal-only page. Mirrors the AI labor estimate + the
// specs it reads off the Construction (07–08) and Sewing (09–10) pages. Never
// exported to the factory pack (PageFrame draws the INTERNAL tag).
function PageCutSewCost({ d }) {
  const meta = d.cutSewLaborCostMeta;
  const costVal = meta?.value != null ? Number(meta.value)
    : (d.cutSewLaborCost ? Number(d.cutSewLaborCost) : null);
  const hasCost = costVal != null && !Number.isNaN(costVal);
  const src = meta?.mode === 'sam_rate'
    ? `via SAM × $${Number(meta.samRate || meta.vendorSamRate || 0).toFixed(2)}/min`
    : 'via Regional CMT Benchmark';

  // specs pulled off pages 07–10
  const callouts = [...(d.constructionDetailsPage1 || []), ...(d.constructionDetailsPage2 || [])]
    .filter(c => c && (c.title || c.description));
  const blocks = d.seamStitchBlocks || [];
  const seams = d.seams || [];
  const stitches = [];
  for (let i = 0; i < 8; i++) {
    const label = (blocks.find(b => b.num === i + 1) || {}).label || '';
    const s = seams[i] || {};
    if (label || s.seamType || s.stitchType) stitches.push({ num: i + 1, label, stitchType: s.stitchType || '', spi: s.spiSpcm || '' });
  }

  const wrap = (str, max) => {
    const words = String(str || '').split(/\s+/).filter(Boolean);
    const lines = []; let cur = '';
    for (const w of words) {
      if ((cur ? cur + ' ' + w : w).length > max) { if (cur) lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const x0 = 40, x1 = PAGE_W - 40, fullW = x1 - x0;
  const heroY = 154, heroH = 190;
  const splitX = x0 + 330;
  const colY = heroY + heroH + 56, colGap = 16, colW = (fullW - colGap) / 2, colX2 = x0 + colW + colGap, colH = 300;

  const ListCol = ({ x, name, pages, count, rows, render }) => (
    <g>
      <rect x={x} y={colY} width={colW} height={colH} fill={FR.white} stroke="rgba(58,58,58,0.15)" strokeWidth={0.5} rx={8} />
      <text x={x + 16} y={colY + 22} fontSize="10" fontWeight="bold" fill={FR.soil} letterSpacing="0.8">{name}</text>
      <text x={x + colW - 16} y={colY + 22} textAnchor="end" fontSize="9" fill={FR.stone} fontFamily="ui-monospace,Menlo,monospace">{pages}</text>
      <text x={x + colW - 56} y={colY + 22} textAnchor="end" fontSize="13" fontWeight="600" fill={FR.slate}>{count}</text>
      {rows.length === 0 && <text x={x + 16} y={colY + 48} fontSize="11" fill={FR.stone} fontStyle="italic">Nothing specified yet on these pages.</text>}
      {rows.slice(0, 8).map((r, i) => {
        const ry = colY + 40 + i * 30;
        return (
          <g key={i}>
            <circle cx={x + 24} cy={ry + 4} r={8} fill="#A32D2D" />
            <text x={x + 24} y={ry + 7} textAnchor="middle" fontSize="9" fontWeight="600" fill="#fff">{r.num}</text>
            {render(r, x, ry)}
            <line x1={x + 16} y1={ry + 18} x2={x + colW - 16} y2={ry + 18} stroke={FR.sand} />
          </g>
        );
      })}
      {rows.length > 8 && <text x={x + 16} y={colY + 40 + 8 * 30 + 6} fontSize="10" fill={FR.stone} fontStyle="italic">+{rows.length - 8} more</text>}
    </g>
  );

  return (
    <g>
      <InfoStrip d={d} />

      {/* internal banner */}
      <rect x={x0} y={heroY - 40} width={fullW} height={28} rx={6} fill="rgba(133,79,11,0.06)" stroke="rgba(133,79,11,0.45)" strokeWidth={0.5} />
      <circle cx={x0 + 16} cy={heroY - 26} r={4} fill="#854F0B" />
      <text x={x0 + 28} y={heroY - 22} fontSize="11" fontWeight="600" fill="#854F0B">INTERNAL — Cut &amp; Sew labor cost. For your eyes only; left out of the exported factory pack.</text>

      {/* hero cost card */}
      <rect x={x0} y={heroY} width={fullW} height={heroH} rx={8} fill={FR.white} stroke="rgba(58,58,58,0.15)" strokeWidth={0.5} />
      <line x1={splitX} y1={heroY} x2={splitX} y2={heroY + heroH} stroke="rgba(58,58,58,0.12)" />
      {/* left — number */}
      <text x={x0 + 26} y={heroY + 28} fontSize="9" fontWeight="600" fill={FR.stone} letterSpacing="1">ESTIMATED CUT &amp; SEW LABOR</text>
      {hasCost ? (
        <>
          <text x={x0 + 24} y={heroY + 76} fontSize="42" fontWeight="500" fill={FR.slate} fontFamily="Helvetica, Arial, sans-serif">${costVal.toFixed(2)}</text>
          <text x={x0 + 26} y={heroY + 98} fontSize="12" fill={FR.stone}>per garment{meta && (meta.low != null || meta.high != null) ? ` · range $${Number(meta.low ?? costVal).toFixed(2)}–$${Number(meta.high ?? costVal).toFixed(2)}` : ''}</text>
          <text x={x0 + 26} y={heroY + 128} fontSize="9" fontWeight="600" fill={FR.soil} letterSpacing="1">{esc(src.toUpperCase())}</text>
          <text x={x0 + 26} y={heroY + 150} fontSize="11" fill={FR.slate}>{esc((meta?.vendor || d.vendor || '—'))}</text>
          {meta?.vendorCity && meta?.vendorCountry && <text x={x0 + 26} y={heroY + 165} fontSize="11" fill={FR.stone}>{esc(`${meta.vendorCity}, ${meta.vendorCountry}`)}</text>}
          <text x={x0 + 26} y={heroY + 181} fontSize="9" fill={FR.stone} fontStyle="italic">{meta?.generatedAt ? `Generated ${new Date(meta.generatedAt).toLocaleString()}` : ''}</text>
        </>
      ) : (
        <>
          <text x={x0 + 24} y={heroY + 78} fontSize="34" fontWeight="500" fill={FR.sand} fontFamily="Helvetica, Arial, sans-serif">$—.——</text>
          <text x={x0 + 26} y={heroY + 104} fontSize="11" fill={FR.stone} fontStyle="italic">Run “Estimate with AI” on the</text>
          <text x={x0 + 26} y={heroY + 119} fontSize="11" fill={FR.stone} fontStyle="italic">left to populate this page.</text>
        </>
      )}
      {/* right — reasoning */}
      <text x={splitX + 26} y={heroY + 28} fontSize="9" fontWeight="600" fill={FR.stone} letterSpacing="1">HOW THE AI GOT HERE</text>
      {hasCost ? (
        <>
          {wrap(meta?.reasoning || meta?.vendorContext || '', 92).slice(0, 5).map((ln, i) => (
            <text key={i} x={splitX + 26} y={heroY + 50 + i * 18} fontSize="12.5" fill={FR.slate}>{esc(ln)}</text>
          ))}
        </>
      ) : (
        <text x={splitX + 26} y={heroY + 50} fontSize="12" fill={FR.stone} fontStyle="italic">The AI’s reasoning will show here once you run the estimate.</text>
      )}
      <text x={splitX + 26} y={heroY + heroH - 30} fontSize="10" fill={FR.stone}>CMT-only — conversion labor (cut, sew, finish, pack, overhead).</text>
      <text x={splitX + 26} y={heroY + heroH - 16} fontSize="10" fill={FR.stone}>Excludes fabric, trims, treatments &amp; vendor markup — those roll up elsewhere.</text>

      {/* what it reads */}
      <text x={x0} y={colY - 26} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="17" fill={FR.slate}>What this estimate reads</text>
      <text x={x0} y={colY - 10} fontSize="11" fill={FR.stone} fontStyle="italic">Pulled live off pages 07–10 — change a call-out or stitch row and re-run to update the number.</text>
      <ListCol x={x0} name="CONSTRUCTION CALL-OUTS" pages="PAGES 07–08" count={callouts.length} rows={callouts}
        render={(r, x, ry) => (<>
          <text x={x + 40} y={ry + 7} fontSize="12" fontWeight="600" fill={FR.slate}>{esc((r.title || '(untitled)').slice(0, 32))}</text>
          {r.description && <text x={x + colW - 16} y={ry + 7} textAnchor="end" fontSize="10" fill={FR.stone}>{esc(r.description.slice(0, 26))}</text>}
        </>)} />
      <ListCol x={colX2} name="STITCH OPERATIONS" pages="PAGES 09–10" count={stitches.length} rows={stitches}
        render={(r, x, ry) => (<>
          <text x={x + 40} y={ry + 7} fontSize="12" fontWeight="600" fill={FR.slate}>{esc((r.label || '(unnamed)').slice(0, 30))}</text>
          <text x={x + colW - 16} y={ry + 7} textAnchor="end" fontSize="10" fill={FR.stone} fontFamily="ui-monospace,Menlo,monospace">{esc([r.stitchType, r.spi].filter(Boolean).join(' · '))}</text>
        </>)} />
    </g>
  );
}

const PAGE_FNS = [
  // 00, 01 — Merchandising
  { title: 'Competitor Landscape',              phase: 'Merchandising',     body: ({ d }) => <PageCompetitorLandscape d={d} /> },
  { title: 'Merchandising Preview',             phase: 'Merchandising',     body: ({ d }) => <PageMerchandisingPreview d={d} /> },
  // 02, 03 — Design
  { title: 'Style Overview',                    phase: 'Design',            body: ({ d, images }) => <PageCover d={d} images={images} /> },
  { title: 'Design Overview',                   phase: 'Design',            body: ({ d, images }) => <PageDesignOverview d={d} images={images} /> },
  // 04, 05, 06 — Bill of Materials
  { title: 'Fabrics',                           phase: 'Bill of Materials', body: ({ d, fabricsById, fabricPageIdx }) => <PageFabrics d={d} fabricsById={fabricsById} fabricPageIdx={fabricPageIdx} /> },
  { title: 'Trims',                             phase: 'Bill of Materials', body: ({ d, componentsById }) => <PageTrims d={d} componentsById={componentsById} /> },
  { title: 'Packaging',                         phase: 'Bill of Materials', body: ({ d, componentsById }) => <PagePackaging d={d} componentsById={componentsById} /> },
  // 07–13 — Cut & Sew
  { title: 'Pattern',                           phase: 'Cut & Sew',         body: ({ d, images }) => <PageFlatlays d={d} images={images} /> },
  { title: 'Construction (1)',                  phase: 'Cut & Sew',         body: ({ d, images }) => <PageSketches d={d} images={images} pageKey="page1" enhanced /> },
  { title: 'Construction (2)',                  phase: 'Cut & Sew',         body: ({ d, images }) => <PageSketches d={d} images={images} pageKey="page2" enhanced /> },
  { title: 'Sewing (1)',                        phase: 'Cut & Sew',         body: ({ d, images }) => <PageConstruction d={d} images={images} pageKey="page1" /> },
  { title: 'Sewing (2)',                        phase: 'Cut & Sew',         body: ({ d, images }) => <PageConstruction d={d} images={images} pageKey="page2" /> },
  { title: 'Cut & Sew Cost',                    phase: 'Cut & Sew',         body: ({ d }) => <PageCutSewCost d={d} /> },
  { title: 'Cutting',                           phase: 'Cut & Sew',         body: ({ d, images }) => <PagePattern d={d} images={images} /> },
  { title: 'Points of Measure',                 phase: 'Cut & Sew',         body: ({ d, images }) => <PagePom d={d} images={images} /> },
  { title: 'Size Grading',                      phase: 'Cut & Sew',         body: ({ d }) => <PageSizeMatrix d={d} /> },
  // 14–18 — Embellishments
  { title: 'Colorways',                         phase: 'Embellishments',    body: ({ d }) => <PageColorways d={d} /> },
  { title: 'Artwork & Placement',               phase: 'Embellishments',    body: ({ d, images }) => <PageArtwork d={d} images={images} /> },
  { title: 'Flat Lay',                          phase: 'Embellishments',    body: ({ d, images }) => <PageFlatlays d={d} images={images} frontSlot="emb-flatlay-front" backSlot="emb-flatlay-back" subtitle="Front and back embellishment placement flats." frontLabel="Front (with embellishment)" backLabel="Back (with embellishment)" /> },
  { title: 'Call Outs',                         phase: 'Embellishments',    body: ({ d, images }) => <PageSketches d={d} images={images} pageKey="emb-callouts" fieldName="embCalloutDetails" slotKey="sketch-callout-emb-callouts" /> },
  { title: 'Sizing & Colors',                   phase: 'Embellishments',    body: ({ d, images }) => <PageEmbSizing d={d} images={images} /> },
  // 19, 20 — Treatments
  { title: 'Render',                            phase: 'Treatments',        body: ({ d, images }) => <PageTreatments d={d} images={images} /> },
  { title: 'Call Outs',                         phase: 'Treatments',        body: ({ d, images }) => <PageSketches d={d} images={images} pageKey="treat-callouts" fieldName="treatCalloutDetails" slotKey="sketch-callout-treat-callouts" /> },
  // 21–25 — QC, Packaging, Logistics, Sign-off
  { title: 'Compliance & Testing',              phase: 'QC',                body: ({ d }) => <PageCompliance d={d} /> },
  { title: 'Quality Inspection (AQL)',          phase: 'QC',                body: ({ d }) => <PageQuality d={d} /> },
  { title: 'Labels & Packaging',                phase: 'Packaging',         body: ({ d, images }) => <PageLabels d={d} images={images} /> },
  { title: 'Order & Delivery',                  phase: 'Logistics',         body: ({ d }) => <PageOrder d={d} /> },
  { title: 'Revision History & Approval',       phase: 'Sign-off',          body: ({ d }) => <PageRevision d={d} /> },
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

export default function TechPackPagePreview({ data, images, step, skippedSteps, treatmentsById, componentsById = {}, fabricsById = {}, fabricPageIdx = 0 }) {
  const d = data || {};
  const styleInfo = `© 2026 Foreign Resource Co. — Confidential Tech Pack`;
  // Page number uses STEPS[step].icon — '000', '00', '01' … '19'.
  // Fabrics step gets a "03.N" suffix when the operator picks multiple fabrics
  // and is paginating through them via the sidebar sub-entries.
  const stepEntry = STEPS[step] || STEPS[0];
  let pageNum = stepEntry.icon || String((step ?? 0) + 1);
  if (stepEntry.id === 'fabrics' && fabricPageIdx > 0) {
    pageNum = `${pageNum}.${fabricPageIdx}`;
  }
  const current = PAGE_FNS[step] || PAGE_FNS[0];
  const Body = current.body;
  const isSkipped = Array.isArray(skippedSteps) && skippedSteps.includes(step);

  return (
    <svg xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      preserveAspectRatio="xMidYMin meet"
      style={{ width: '100%', height: 'auto', background: FR.white, boxShadow: '0 2px 14px rgba(0,0,0,0.12)', borderRadius: 6, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <PageFrame title={current.title} phase={current.phase} pageNum={pageNum} styleInfo={styleInfo} styleNumber={d.styleNumber} internal={!!stepEntry.internal}>
        <Body d={d} images={images} treatmentsById={treatmentsById} componentsById={componentsById} fabricsById={fabricsById} fabricPageIdx={fabricPageIdx} />
      </PageFrame>
      {isSkipped && <SkipOverlay />}
    </svg>
  );
}
