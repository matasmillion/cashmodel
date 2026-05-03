// Live A4-landscape page preview for the Trim Pack wizard.
// 7 pages total: Overview, Design, Materials, Construction, Embellishments,
// Treatment, Quality Control.

import { FR } from './techPackConstants';
import { getFRColor } from '../../utils/colorLibrary';

const PAGE_W = 1123;
const PAGE_H = 794;
const TOTAL_PAGES = 8;

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
  const derivedRevision = `V${(d.revisions || []).length + 1}.0`;

  // ── Layout budget (PAGE_H = 794, footer at 775) ────────────────────────────
  //   header bar  ..................... 0–70
  //   title + 3:2 trim photo  ......... 85–280
  //   divider rule  ................... 288
  //   identity grid  .................. 304–404 (3 rows × 30 px gap)
  //   colorways strip  ................ 420–460
  //   quote panel  .................... 480–760
  //   footer stripe  .................. 775

  // Identity grid — 3 left rows + 3 right rows (no MOQ / target unit cost
  // here; tiered cost moved into the Quote panel below).
  const leftCol = [
    { label: 'Trim Type',         value: d.componentType },
    { label: 'Vendor',            value: d.supplier },
    { label: 'Season',            value: d.season },
  ];
  const rightCol = [
    { label: 'Revision',          value: d.revision || derivedRevision },
    { label: 'Date Last Updated', value: d.dateCreated },
    { label: 'Status',            value: d.status },
  ];

  // 3:2 landscape, sized to fill the title zone without crossing the divider
  // rule at y=288. photoY=85, so max height = 288 - 85 - 11 = 192.
  const photoH = 192;
  const photoW = Math.round(photoH * 3 / 2); // 3:2 landscape → 288
  const photoX = PAGE_W - photoW - 40;
  const photoY = 85;

  const idY = 320;
  const idRowGap = 30;

  // Colorways — chip strip pulled from the FR Colors library. Falls back to
  // the legacy comma-separated `colorways` string if the new shape hasn't
  // been written yet (cloud rows opened on stale clients).
  const picks = (() => {
    if (Array.isArray(d.colorwayPicks)) return d.colorwayPicks.filter(Boolean);
    if (typeof d.colorways === 'string' && d.colorways) {
      return d.colorways.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  })();
  const colorwayY = 420;

  // Quote panel — cost tiers on the left, lead times + provider link on
  // the right. Both bottoms must end before y=770 to clear the footer text.
  const quoteY = 480;
  const quoteHeadingY = quoteY;
  const tierTableX = 40;
  const tierTableW = 540;
  const tierCols = [
    { key: 'tier',     label: 'Tier',          w: 70 },
    { key: 'quantity', label: 'Quantity',      w: 220 },
    { key: 'unitCost', label: 'Unit Cost ($)', w: 250 },
  ];
  const allTiers = Array.isArray(d.costTiers) && d.costTiers.length
    ? d.costTiers
    : [{ quantity: d.moq || '', unitCost: d.targetUnitCost || d.costPerUnit || '' }];
  const tierRows = allTiers.map((t, i) => ({
    tier: i === 0 ? 'MOQ' : `T${i + 1}`,
    quantity: t.quantity || '',
    unitCost: t.unitCost || '',
  }));

  const quoteRightX = tierTableX + tierTableW + 24;
  const quoteRightW = PAGE_W - quoteRightX - 40;

  return (
    <g>
      {/* Title block */}
      <text x={40} y={122} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="34" fill={FR.slate}>Trim Specification</text>
      <rect x={40} y={132} width="70" height="2" fill={FR.soil} />
      <text x={40} y={162} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="20" fill={FR.slate}>
        {clampLine(d.componentName || 'New Trim', 760, 11)}
      </text>
      <text x={40} y={184} fontSize="9" fill={FR.stone} letterSpacing="1.5">
        STATUS · {esc((d.status || '—').toUpperCase())}
      </text>

      {/* Trim photo — 3:2 landscape, top-right. */}
      {cover
        ? <image href={cover.data} xlinkHref={cover.data} x={photoX} y={photoY} width={photoW} height={photoH} preserveAspectRatio="xMidYMid slice" />
        : (
          <g>
            <rect x={photoX} y={photoY} width={photoW} height={photoH} fill={FR.salt} stroke={FR.sand} strokeDasharray="6 6" />
            <text x={photoX + photoW / 2} y={photoY + photoH / 2 + 4} textAnchor="middle" fontSize="10" fill={FR.stone} fontStyle="italic">Trim photo · 3:2</text>
          </g>
        )}

      {/* Identity grid — 3 rows × 30 px row gap, two columns. */}
      <rect x="40" y="288" width={PAGE_W - 80} height="1" fill={FR.sand} />
      <text x={40} y={304} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="2">OVERVIEW</text>
      {leftCol.map((f, i) => {
        const y = idY + i * idRowGap;
        return (
          <g key={`L${i}`}>
            <Field x={40} y={y} label={f.label} value={f.value} w={500} />
            <line x1={40} y1={y + 24} x2={540} y2={y + 24} stroke={FR.sand} />
          </g>
        );
      })}
      {rightCol.map((f, i) => {
        const y = idY + i * idRowGap;
        return (
          <g key={`R${i}`}>
            <Field x={580} y={y} label={f.label} value={f.value} w={500} />
            <line x1={580} y1={y + 24} x2={PAGE_W - 40} y2={y + 24} stroke={FR.sand} />
          </g>
        );
      })}

      {/* Colorways strip — swatches from the FR Colors library. */}
      <text x={40} y={colorwayY} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">COLORWAYS</text>
      {picks.length === 0 ? (
        <text x={40} y={colorwayY + 22} fontSize="11" fill={FR.stone} fontStyle="italic">No colors picked</text>
      ) : <ColorwayChips picks={picks} x={40} y={colorwayY + 8} maxW={PAGE_W - 80} />}

      {/* Quote panel — pricing + lead times + provider link. */}
      <SectionHeading x={40} y={quoteHeadingY}>Quote</SectionHeading>
      <GridTable x={tierTableX} y={quoteHeadingY + 16} cols={tierCols}
        rows={tierRows} bodyRows={Math.max(2, tierRows.length)} rowH={22} headerH={22} />

      {/* Right column: lead times + sample cost + provider link. */}
      <QuoteRightCol d={d} x={quoteRightX} y={quoteHeadingY + 16} w={quoteRightW} />
    </g>
  );
}

// Inline color chips for the cover preview. Each chip is a rounded pill with
// the FR color's hex swatch on the left and the name on the right.
function ColorwayChips({ picks, x, y, maxW }) {
  const charW = 6.0;
  const padX = 8;
  const swatchW = 12;
  const gap = 6;
  let cx = x;
  let cy = y + 12;
  const rowH = 22;
  const chips = [];
  picks.forEach((name, i) => {
    const meta = (() => { try { return getFRColor(name); } catch { return null; } })();
    const text = clampLine(name, 180, charW);
    const chipW = padX * 2 + swatchW + 4 + Math.max(20, text.length * charW);
    if (cx + chipW > x + maxW) { cx = x; cy += rowH + 4; }
    chips.push(
      <g key={`${name}-${i}`} transform={`translate(${cx}, ${cy})`}>
        <rect x={0} y={-12} width={chipW} height={rowH} rx={11} fill={FR.salt} stroke={FR.sand} />
        <circle cx={padX + swatchW / 2} cy={-1} r={swatchW / 2} fill={meta?.hex || 'transparent'} stroke="rgba(0,0,0,0.15)" />
        <text x={padX + swatchW + 4} y={3} fontSize="10" fill={FR.slate}>{text}</text>
      </g>
    );
    cx += chipW + gap;
  });
  return <g>{chips}</g>;
}

// Right column of the Quote panel: provider link at the top, then a 3-up
// strip of mini stat cells (Lead Time / Sample Lead Time / Sample Cost).
function QuoteRightCol({ d, x, y, w }) {
  const link = d.quoteProviderLink || '';
  const statCellH = 56;
  const statY = y + 70;
  const statW = (w - 16) / 3;
  const stats = [
    { label: 'Lead Time',        value: d.leadTimeDays ? `${d.leadTimeDays} days` : '' },
    { label: 'Sample Lead Time', value: d.sampleLeadTimeDays ? `${d.sampleLeadTimeDays} days` : '' },
    { label: 'Sample Cost',      value: d.sampleCost ? `$${d.sampleCost}` : '' },
  ];

  return (
    <g>
      <text x={x} y={y + 12} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">QUOTE PROVIDER</text>
      <text x={x} y={y + 30} fontSize="11" fill={FR.slate}>
        {clampLine(esc(link || '—'), w, 6.2)}
      </text>
      <line x1={x} y1={y + 36} x2={x + w} y2={y + 36} stroke={FR.sand} />

      {stats.map((s, i) => {
        const cx = x + i * (statW + 8);
        return (
          <g key={s.label}>
            <rect x={cx} y={statY} width={statW} height={statCellH} fill={FR.salt} stroke={FR.sand} />
            <text x={cx + 10} y={statY + 18} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">{esc(s.label.toUpperCase())}</text>
            <text x={cx + 10} y={statY + 42} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="18" fill={FR.slate}>
              {clampLine(esc(s.value || '—'), statW - 20, 8)}
            </text>
          </g>
        );
      })}
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

// Reusable image slot renderer used on Materials/Treatment/QC cards. Renders
// the uploaded image (letter-boxed inside a box) or a dashed placeholder.
function PhotoSlot({ x, y, w, h, image, placeholder }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={FR.white} stroke={FR.soil} strokeDasharray="5 4" />
      {image
        ? <image href={image.data} xlinkHref={image.data} x={x + 4} y={y + 4} width={w - 8} height={h - 8} preserveAspectRatio="xMidYMid meet" />
        : (
          <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize="10" fill={FR.stone} fontStyle="italic">
            {placeholder || 'Drop image here'}
          </text>
        )}
    </g>
  );
}

// ── Page 2: Design ─────────────────────────────────────────────────────────
// Left half: 9:16 sketch (portrait). Right half: reference + render stacked
// landscape so both visuals read cleanly on an A4 horizontal page.
function PageDesign({ d, images }) {
  const imgs = images || [];
  const sketch = imgs.find(x => x.slot === 'design-sketch');
  const reference = imgs.find(x => x.slot === 'design-reference');
  const render = imgs.find(x => x.slot === 'design-render');

  // Sketch: A4 landscape (297/210 ≈ 1.414 w/h). 700 × 495 at top-left.
  const sketchX = 40;
  const sketchY = 170;
  const sketchW = 700;
  const sketchH = Math.round(sketchW * 210 / 297);

  // Reference + render: 2:3 portrait, stacked on the right aligned to sketch.
  const stackColX = sketchX + sketchW + 30;
  const stackColW = PAGE_W - stackColX - 40;
  const refH = Math.round((sketchH - 15) / 2);
  const refW = Math.round(refH * 2 / 3);
  const refX = stackColX + Math.round((stackColW - refW) / 2);

  return (
    <g>
      <InfoStrip d={d} />
      <SectionHeading x={40} y={158}>Design</SectionHeading>

      <PhotoSlot x={sketchX} y={sketchY} w={sketchW} h={sketchH} image={sketch} placeholder="Sketch · A4 landscape (297 × 210 mm)" />
      <rect x={sketchX} y={sketchY + sketchH - 22} width={70} height={22} fill={FR.slate} />
      <text x={sketchX + 10} y={sketchY + sketchH - 7} fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="1.5">SKETCH</text>

      <PhotoSlot x={refX} y={sketchY}                  w={refW} h={refH} image={reference} placeholder="Reference · 2:3 portrait" />
      <rect x={refX} y={sketchY + refH - 22} width={80} height={22} fill={FR.slate} />
      <text x={refX + 10} y={sketchY + refH - 7} fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="1.5">REFERENCE</text>

      <PhotoSlot x={refX} y={sketchY + refH + 15}     w={refW} h={refH} image={render}    placeholder="Render · 2:3 portrait" />
      <rect x={refX} y={sketchY + refH + 15 + refH - 22} width={60} height={22} fill={FR.slate} />
      <text x={refX + 10} y={sketchY + refH + 15 + refH - 7} fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="1.5">RENDER</text>
    </g>
  );
}

// ── Page 3: Materials ──────────────────────────────────────────────────────
// Up to 3 material cards rendered side by side. Each card: photo slot +
// name + composition + weight/gauge + vendor.
function PageMaterials({ d, images }) {
  const imgs = images || [];
  // Keep original index for image-slot lookup so hiding Material 2 doesn't
  // shift Material 3's photo into the wrong card.
  const visible = (d.materials || []).slice(0, 3)
    .map((m, origIdx) => ({ m, origIdx }))
    .filter(x => !x.m.hidden);
  const slots = 3;
  const cardGap = 16;
  const cardW = (PAGE_W - 80 - cardGap * (slots - 1)) / slots;
  const cardY = 170;
  const cardH = 560;
  // Swatch photo: 2:3 portrait, centered in the card.
  const imgW = 200;
  const imgH = Math.round(imgW * 3 / 2);

  return (
    <g>
      <InfoStrip d={d} />
      <SectionHeading x={40} y={158}>Materials</SectionHeading>

      {visible.map(({ m, origIdx }, i) => {
        const cx = 40 + i * (cardW + cardGap);
        const img = imgs.find(x => x.slot === `material-${origIdx}`);
        const imgX = cx + Math.round((cardW - imgW) / 2);
        return (
          <g key={i}>
            <rect x={cx} y={cardY} width={cardW} height={cardH} fill={FR.white} stroke={FR.sand} />
            <rect x={cx} y={cardY} width={cardW} height={24} fill={FR.salt} />
            <text x={cx + 12} y={cardY + 16} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="1.5">
              MATERIAL {i + 1}
            </text>

            <PhotoSlot x={imgX} y={cardY + 38} w={imgW} h={imgH} image={img} placeholder="Swatch · 2:3" />

            <text x={cx + 14} y={cardY + 38 + imgH + 26} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">NAME</text>
            <text x={cx + 14} y={cardY + 38 + imgH + 42} fontSize="11" fill={FR.slate}>{clampLine(esc(m.name || '—'), cardW - 28, 6.2)}</text>
            <line x1={cx + 14} y1={cardY + 38 + imgH + 46} x2={cx + cardW - 14} y2={cardY + 38 + imgH + 46} stroke={FR.sand} />

            <text x={cx + 14} y={cardY + 38 + imgH + 66} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">COMPOSITION</text>
            <text x={cx + 14} y={cardY + 38 + imgH + 82} fontSize="11" fill={FR.slate}>{clampLine(esc(m.composition || '—'), cardW - 28, 6.2)}</text>
            <line x1={cx + 14} y1={cardY + 38 + imgH + 86} x2={cx + cardW - 14} y2={cardY + 38 + imgH + 86} stroke={FR.sand} />

            <text x={cx + 14} y={cardY + 38 + imgH + 106} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">WEIGHT / GAUGE</text>
            <text x={cx + 14} y={cardY + 38 + imgH + 122} fontSize="11" fill={FR.slate}>{clampLine(esc(m.weightGauge || '—'), cardW - 28, 6.2)}</text>
            <line x1={cx + 14} y1={cardY + 38 + imgH + 126} x2={cx + cardW - 14} y2={cardY + 38 + imgH + 126} stroke={FR.sand} />

            <text x={cx + 14} y={cardY + 38 + imgH + 146} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">VENDOR</text>
            <text x={cx + 14} y={cardY + 38 + imgH + 162} fontSize="11" fill={FR.slate}>{clampLine(esc(m.vendor || '—'), cardW - 28, 6.2)}</text>
            <line x1={cx + 14} y1={cardY + 38 + imgH + 166} x2={cx + cardW - 14} y2={cardY + 38 + imgH + 166} stroke={FR.sand} />

            {/* COLOR (left) | FINISH (right) — split row */}
            {(() => {
              const hx = Math.round(cardW / 2);
              const hw = hx - 20;
              const by = cardY + 38 + imgH;
              return (
                <g>
                  <text x={cx + 14} y={by + 186} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">COLOR</text>
                  <text x={cx + 14} y={by + 202} fontSize="11" fill={FR.slate}>{clampLine(esc(m.color || '—'), hw, 6.2)}</text>
                  <text x={cx + hx + 4} y={by + 186} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">FINISH</text>
                  <text x={cx + hx + 4} y={by + 202} fontSize="11" fill={FR.slate}>{clampLine(esc(m.finish || '—'), hw, 6.2)}</text>
                  <line x1={cx + 14} y1={by + 206} x2={cx + cardW - 14} y2={by + 206} stroke={FR.sand} />
                </g>
              );
            })()}
          </g>
        );
      })}
    </g>
  );
}

// ── Page 3: Construction ───────────────────────────────────────────────────
// A4-landscape hero diagram (left 2/3) + 3 stacked callout blocks (right 1/3).
// Each callout: red "CALLOUT N — title" header strip, SPECIFICATION text on the
// left, 3:2 landscape reference image on the right.
function PageConstruction({ d, images }) {
  const imgs = images || [];
  const diagram = imgs.find(x => x.slot === 'construction-diagram');
  // Keep original index for the `callout-ref-${origIdx}` image slot lookup.
  const visibleCallouts = (d.constructionCallouts || []).slice(0, 3)
    .map((c, origIdx) => ({ c, origIdx }))
    .filter(x => !x.c.hidden);
  const calloutSlots = 3;

  const heroX = 40;
  const heroY = 170;
  const heroW = 600;
  const heroH = Math.round(heroW * 210 / 297);

  const coColX = heroX + heroW + 30;
  const coColW = PAGE_W - coColX - 40;
  const coGap = 10;
  // Callouts extend to full available page height so spec text + image fit.
  const availH = 775 - heroY - 10;
  const coH = Math.round((availH - coGap * (calloutSlots - 1)) / calloutSlots);

  const pad = 12;
  const innerW = coColW - pad * 2;
  const imgW = 100;
  const imgH = 150; // 2:3 portrait (~28% more area than the old 134×89 landscape)
  const specW = innerW - imgW - 10;

  return (
    <g>
      <InfoStrip d={d} />
      <SectionHeading x={40} y={158}>Construction</SectionHeading>

      <PhotoSlot x={heroX} y={heroY} w={heroW} h={heroH} image={diagram} placeholder="Measurement diagram · A4 landscape" />
      <rect x={heroX} y={heroY + heroH - 22} width={140} height={22} fill={FR.slate} />
      <text x={heroX + 10} y={heroY + heroH - 7} fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="1.5">MEASUREMENT DIAGRAM</text>

      {visibleCallouts.map(({ c, origIdx }, i) => {
        const cy = heroY + i * (coH + coGap);
        const refImg = imgs.find(x => x.slot === `callout-ref-${origIdx}`);
        const specText = c.specification || c.detail || '';
        const imgX = coColX + pad + specW + 10;
        return (
          <g key={i}>
            <rect x={coColX} y={cy} width={coColW} height={coH} fill={FR.white} stroke={FR.sand} />
            <rect x={coColX} y={cy} width={coColW} height={22} fill={FR.salt} />
            <text x={coColX + pad} y={cy + 15} fontSize="9">
              <tspan fontWeight="bold" fill="#C0392B" letterSpacing="1.5">CALLOUT {i + 1}</tspan>
              <tspan fill={FR.stone} letterSpacing="0"> — </tspan>
              <tspan fill={FR.slate} letterSpacing="0">{clampLine(esc(c.label || ''), specW, 5.5)}</tspan>
            </text>
            <text x={coColX + pad} y={cy + 40} fontSize="7" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">SPECIFICATION</text>
            <foreignObject x={coColX + pad} y={cy + 48} width={specW} height={coH - 58}>
              <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 9, color: FR.slate, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                {specText || '—'}
              </div>
            </foreignObject>
            {refImg ? (
              <image href={refImg.data} xlinkHref={refImg.data} x={imgX} y={cy + 30} width={imgW} height={imgH} preserveAspectRatio="xMidYMid meet" />
            ) : (
              <g>
                <rect x={imgX} y={cy + 30} width={imgW} height={imgH} fill={FR.salt} stroke={FR.sand} strokeDasharray="3,2" rx="2" />
                <text x={imgX + imgW / 2} y={cy + 30 + imgH / 2 + 4} textAnchor="middle" fontSize="7" fill={FR.stone}>ref image</text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ── Page 4: Embellishments ─────────────────────────────────────────────────
// Row of up to 4 colorway cards (swatch chip + TCX card thumb + codes + usage)
// + 3 A4-landscape artwork tiles + attachments strip. Pantone TCX card
// images are pulled from the shared color library keyed on FR color name.
function PageEmbellishments({ d, images }) {
  const imgs = images || [];
  const hiddenArt = Array.isArray(d.artworkHidden) ? d.artworkHidden : [];
  const artworkImgs = [1, 2, 3]
    .map(n => ({ img: imgs.find(x => x.slot === `embellishment-artwork-${n}`), origIdx: n - 1 }))
    .filter(x => !hiddenArt[x.origIdx]);

  // Only render colorways that actually have content and aren't hidden.
  // No empty-slot placeholders: if you have one colorway, the preview
  // shows one colorway; if you hid colorway 2, it's just gone.
  const colorways = (d.colorwaysList || [])
    .slice(0, 4)
    .filter(cw => cw && !cw.hidden && (cw.name || cw.frColor || cw.usage));
  const libraryByColor = (() => {
    const out = {};
    colorways.forEach(cw => {
      if (cw?.frColor && !out[cw.frColor]) {
        out[cw.frColor] = getFRColor(cw.frColor);
      }
    });
    return out;
  })();

  // Colorway row — cards scale to fill the row based on how many
  // visible colorways there are (1 wide card, 2 half cards, etc.).
  const cwRowY = 170;
  const cwRowH = 210;
  const cwGap = 14;
  const cwSlots = Math.max(colorways.length, 1);
  const cwW = (PAGE_W - 80 - cwGap * Math.max(cwSlots - 1, 0)) / cwSlots;

  // Artwork row — three A4 landscape tiles centered.
  const artY = cwRowY + cwRowH + 28;
  const artW = 320;
  const artH = Math.round(artW * 210 / 297);
  const artGap = 12;
  const artTotal = artW * 3 + artGap * 2;
  const artStartX = Math.round((PAGE_W - artTotal) / 2);

  // Attachments strip along the bottom.
  const attY = artY + artH + 26;
  const attachments = d.attachments || [];
  const maxAttPerRow = 5;
  const attGap = 12;

  return (
    <g>
      <InfoStrip d={d} />
      <SectionHeading x={40} y={158}>Colorways</SectionHeading>

      {colorways.map((cw, i) => {
        const cx = 40 + i * (cwW + cwGap);
        const entry = cw.frColor ? libraryByColor[cw.frColor] : null;
        const cardImage = entry?.cardImage;
        // Pantone codes / HEX / RGB live in the shared color library —
        // the colorway only stores { name, usage, frColor, hidden } after
        // the palette-manager unification. Read library values first,
        // fall back to any inline pack values so legacy packs that
        // never re-saved still render their old codes.
        const pantoneTCX = entry?.pantoneTCX || cw.pantoneTCX || '';
        const pantoneTPG = entry?.pantoneTPG || cw.pantoneTPG || '';
        const hex        = entry?.hex        || cw.hex        || '';
        const rgb        = entry?.rgb        || cw.rgb        || '';
        // Layout inside the card
        const swatchH = 38;
        const cardThumbW = 50;
        const cardThumbH = Math.round(cardThumbW * 3 / 2);
        const tcxX = cx + cwW - cardThumbW - 10;
        return (
          <g key={i}>
            <rect x={cx} y={cwRowY} width={cwW} height={cwRowH} fill={FR.white} stroke={FR.sand} rx="3" />
            {/* Swatch chip */}
            <rect x={cx} y={cwRowY} width={cwW} height={swatchH} fill={hex || FR.salt} />
            <text x={cx + 10} y={cwRowY + 14} fontSize="8" fontWeight="bold" fill={FR.salt} letterSpacing="1">
              {esc((cw.name || `COLORWAY ${i + 1}`).toUpperCase())}
            </text>
            <text x={cx + 10} y={cwRowY + 30} fontSize="9" fill={FR.salt}>
              {clampLine(esc(cw.usage || 'Usage —'), cwW - 20, 5.8)}
            </text>

            {/* Body: FR color, codes */}
            <text x={cx + 10} y={cwRowY + swatchH + 18} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">FR COLOR</text>
            <text x={cx + 10} y={cwRowY + swatchH + 32} fontSize="10" fill={FR.slate}>{clampLine(esc(cw.frColor || '—'), cwW - 20, 5.8)}</text>

            <text x={cx + 10} y={cwRowY + swatchH + 52} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">PANTONE TCX</text>
            <text x={cx + 10} y={cwRowY + swatchH + 66} fontSize="10" fill={FR.slate}>{clampLine(esc(pantoneTCX || '—'), cwW - 20, 5.8)}</text>

            <text x={cx + 10} y={cwRowY + swatchH + 86} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">PANTONE TPG</text>
            <text x={cx + 10} y={cwRowY + swatchH + 100} fontSize="10" fill={FR.slate}>{clampLine(esc(pantoneTPG || '—'), cwW - 20, 5.8)}</text>

            <text x={cx + 10} y={cwRowY + swatchH + 120} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">HEX · RGB</text>
            <text x={cx + 10} y={cwRowY + swatchH + 134} fontSize="10" fill={FR.slate}>{clampLine(esc(`${hex || '—'} · ${rgb || '—'}`), cwW - 20, 5.8)}</text>

            {/* Pantone TCX card thumbnail (if library has one for the FR color). */}
            {cardImage && (
              <g>
                <image href={cardImage} xlinkHref={cardImage} x={tcxX} y={cwRowY + swatchH + 52} width={cardThumbW} height={cardThumbH} preserveAspectRatio="xMidYMid slice" />
                <rect x={tcxX} y={cwRowY + swatchH + 52} width={cardThumbW} height={cardThumbH} fill="none" stroke={FR.sand} />
              </g>
            )}
          </g>
        );
      })}

      <SectionHeading x={40} y={artY - 12}>Artwork</SectionHeading>
      {artworkImgs.map(({ img, origIdx }, i) => {
        // Reflow visible artwork tiles — if Artwork 2 is hidden, Artwork 3
        // slides left into slot 2 so the page stays balanced.
        const slots = Math.max(artworkImgs.length, 1);
        const tileW = slots === 3 ? artW : Math.min(artW, Math.round((PAGE_W - 80 - artGap * (slots - 1)) / slots));
        const total = tileW * slots + artGap * (slots - 1);
        const startX = Math.round((PAGE_W - total) / 2);
        const ax = startX + i * (tileW + artGap);
        const tileH = Math.round(tileW * 210 / 297);
        return (
          <g key={origIdx}>
            <PhotoSlot x={ax} y={artY} w={tileW} h={tileH} image={img} placeholder={`Artwork ${origIdx + 1} · A4 landscape`} />
            <rect x={ax} y={artY + tileH - 22} width={68} height={22} fill={FR.slate} />
            <text x={ax + 10} y={artY + tileH - 7} fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="1.5">ARTWORK {i + 1}</text>
          </g>
        );
      })}

      <SectionHeading x={40} y={attY - 12}>Attachments</SectionHeading>
      {attachments.length === 0
        ? <text x={40} y={attY + 18} fontSize="10" fill={FR.stone} fontStyle="italic">No source files attached — SVG / AI / PDF go here.</text>
        : attachments.slice(0, maxAttPerRow).map((a, i) => {
            const pillW = (PAGE_W - 80 - attGap * (maxAttPerRow - 1)) / maxAttPerRow;
            const px = 40 + i * (pillW + attGap);
            return (
              <g key={a.id}>
                <rect x={px} y={attY} width={pillW} height={46} fill={FR.white} stroke={FR.sand} rx="3" />
                <text x={px + 10} y={attY + 18} fontSize="10" fontWeight="bold" fill={FR.slate}>📄 {clampLine(esc(a.name), pillW - 22, 5.8)}</text>
                <text x={px + 10} y={attY + 32} fontSize="9" fill={FR.stone}>{(a.size / 1024).toFixed(0)} kB · click to download</text>
              </g>
            );
          })}
      {attachments.length > maxAttPerRow && (
        <text x={40} y={attY + 62} fontSize="9" fill={FR.stone} fontStyle="italic">+ {attachments.length - maxAttPerRow} more file(s)</text>
      )}
    </g>
  );
}

// ── Page 5: Treatment ──────────────────────────────────────────────────────
// Three finish cards: 2:3 photo + name + description. Preview layout mirrors
// the form.
function PageTreatment({ d, images }) {
  const imgs = images || [];
  const visible = (d.treatments || []).slice(0, 3)
    .map((t, origIdx) => ({ t, origIdx }))
    .filter(x => !x.t.hidden);
  const slots = 3;

  const cardGap = 16;
  const cardW = (PAGE_W - 80 - cardGap * (slots - 1)) / slots;
  const cardY = 170;
  const cardH = 560;
  // 2:3 portrait photo, centered in each card.
  const imgW = 240;
  const imgH = Math.round(imgW * 3 / 2);

  return (
    <g>
      <InfoStrip d={d} />
      <SectionHeading x={40} y={158}>Treatment</SectionHeading>

      {visible.map(({ t, origIdx }, i) => {
        const cx = 40 + i * (cardW + cardGap);
        const img = imgs.find(x => x.slot === `treatment-${origIdx}`);
        const imgX = cx + Math.round((cardW - imgW) / 2);
        return (
          <g key={i}>
            <rect x={cx} y={cardY} width={cardW} height={cardH} fill={FR.white} stroke={FR.sand} />
            <rect x={cx} y={cardY} width={cardW} height={24} fill={FR.salt} />
            <text x={cx + 12} y={cardY + 16} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="1.5">
              FINISH {i + 1}
            </text>

            <PhotoSlot x={imgX} y={cardY + 38} w={imgW} h={imgH} image={img} placeholder="Finish · 2:3" />

            <text x={cx + 14} y={cardY + 38 + imgH + 26} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">NAME</text>
            <text x={cx + 14} y={cardY + 38 + imgH + 42} fontSize="11" fill={FR.slate}>{clampLine(esc(t.name || '—'), cardW - 28, 6.2)}</text>
            <line x1={cx + 14} y1={cardY + 38 + imgH + 46} x2={cx + cardW - 14} y2={cardY + 38 + imgH + 46} stroke={FR.sand} />

            <text x={cx + 14} y={cardY + 38 + imgH + 66} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">DESCRIPTION</text>
            <foreignObject x={cx + 14} y={cardY + 38 + imgH + 72} width={cardW - 28} height={cardH - (38 + imgH + 80)}>
              <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 10, color: FR.slate, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                {t.description || '—'}
              </div>
            </foreignObject>
          </g>
        );
      })}
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
      <InfoStripCell x={40 + cellW * 2} y={stripY} w={cellW} label="Vendor"     value={d.supplier} />
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

// (ArtworkSlot + PageBOMColor removed — replaced by PageEmbellishments above.)

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

// ── Page 6: Quality Control ────────────────────────────────────────────────
// Identical card grid to Treatment — photo + focus + method. Intentional
// repetition: user learns one card shape, applies to both pages.
function PageQC({ d, images }) {
  const imgs = images || [];
  const visible = (d.qcPoints || []).slice(0, 3)
    .map((q, origIdx) => ({ q, origIdx }))
    .filter(x => !x.q.hidden);
  const slots = 3;

  const cardGap = 16;
  const cardW = (PAGE_W - 80 - cardGap * (slots - 1)) / slots;
  const cardY = 170;
  const cardH = 560;
  // 2:3 portrait reference photo, centered in each card.
  const imgW = 240;
  const imgH = Math.round(imgW * 3 / 2);

  return (
    <g>
      <InfoStrip d={d} />
      <SectionHeading x={40} y={158}>Quality Control</SectionHeading>

      {visible.map(({ q, origIdx }, i) => {
        const cx = 40 + i * (cardW + cardGap);
        const img = imgs.find(x => x.slot === `qc-${origIdx}`);
        const imgX = cx + Math.round((cardW - imgW) / 2);
        return (
          <g key={i}>
            <rect x={cx} y={cardY} width={cardW} height={cardH} fill={FR.white} stroke={FR.sand} />
            <rect x={cx} y={cardY} width={cardW} height={24} fill={FR.salt} />
            <text x={cx + 12} y={cardY + 16} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="1.5">
              QC FOCUS {i + 1}
            </text>

            <PhotoSlot x={imgX} y={cardY + 38} w={imgW} h={imgH} image={img} placeholder="Reference · 2:3" />

            <text x={cx + 14} y={cardY + 38 + imgH + 26} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">FOCUS</text>
            <text x={cx + 14} y={cardY + 38 + imgH + 42} fontSize="11" fill={FR.slate}>{clampLine(esc(q.focus || '—'), cardW - 28, 6.2)}</text>
            <line x1={cx + 14} y1={cardY + 38 + imgH + 46} x2={cx + cardW - 14} y2={cardY + 38 + imgH + 46} stroke={FR.sand} />

            <text x={cx + 14} y={cardY + 38 + imgH + 66} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">METHOD</text>
            <foreignObject x={cx + 14} y={cardY + 38 + imgH + 72} width={cardW - 28} height={50}>
              <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 10, color: FR.slate, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                {q.method || '—'}
              </div>
            </foreignObject>
            <line x1={cx + 14} y1={cardY + 38 + imgH + 124} x2={cx + cardW - 14} y2={cardY + 38 + imgH + 124} stroke={FR.sand} />

            <text x={cx + 14} y={cardY + 38 + imgH + 142} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">PASS</text>
            <foreignObject x={cx + 14} y={cardY + 38 + imgH + 148} width={cardW - 28} height={cardH - (38 + imgH + 156)}>
              <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 10, color: FR.slate, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                {q.pass || '—'}
              </div>
            </foreignObject>
          </g>
        );
      })}
    </g>
  );
}

// ── Page 8: Samples & Approval ─────────────────────────────────────────────
// Internal sign-off page: sample log on the left, three approval slots on
// the right. Shows the final state of every sample type + who signed off
// on each role. Designed to print at the end so vendors see the spec
// first and the sign-off chain second.
function PageApproval({ d }) {
  // Cap visible sample rows so the revision-history strip below has room
  // without colliding with the footer (samples end at 200 + N×28, must
  // stay above the rev-history block at y=678).
  const samples = (d.samples || []).slice(0, 12);
  const fa = d.finalApproval || {};

  const leftX = 40;
  const leftW = 640;
  const rightX = leftX + leftW + 28;
  const rightW = PAGE_W - rightX - 40;

  // Revision history — moved off the cover page (where vendors don't care
  // about iteration history) onto this internal-only page next to samples
  // and approvals.
  const revCols = [
    { key: 'rev',         label: 'Rev #',                 w: 70 },
    { key: 'date',        label: 'Date',                  w: 90 },
    { key: 'changedBy',   label: 'Changed By',            w: 160 },
    { key: 'description', label: 'Description of Change', w: 553 },
    { key: 'approvedBy',  label: 'Approved By',           w: 170 },
  ];
  const revRows = (d.revisions || []).filter(r => r.rev || r.date || r.changedBy || r.description || r.approvedBy);
  const revY = 678;

  return (
    <g>
      <InfoStrip d={d} />
      <SectionHeading x={40} y={158}>Samples & Approval</SectionHeading>

      {/* Sample log */}
      <rect x={leftX} y={170} width={leftW} height={30} fill={FR.slate} />
      <text x={leftX + 12} y={190} fontSize="10" fontWeight="bold" fill={FR.salt} letterSpacing="1.5">SAMPLE LOG</text>
      <text x={leftX + 120} y={190} fontSize="9" fill={FR.salt}>TYPE</text>
      <text x={leftX + 250} y={190} fontSize="9" fill={FR.salt}>DATE</text>
      <text x={leftX + 360} y={190} fontSize="9" fill={FR.salt}>COURIER / TRACKING</text>
      <text x={leftX + 560} y={190} fontSize="9" fill={FR.salt}>VERDICT</text>
      {samples.length === 0 ? (
        <text x={leftX + 14} y={230} fontSize="11" fill={FR.stone} fontStyle="italic">
          No samples logged yet.
        </text>
      ) : samples.map((s, i) => {
        const ry = 200 + i * 28;
        const verdictColor = s.verdict === 'Approved' ? '#4CAF7D' : s.verdict === 'Rejected' ? '#C0392B' : FR.stone;
        return (
          <g key={s.id || i}>
            <rect x={leftX} y={ry} width={leftW} height={28} fill={i % 2 ? FR.salt : FR.white} stroke={FR.sand} />
            <text x={leftX + 14} y={ry + 18} fontSize="10" fontWeight="bold" fill={FR.slate}>{clampLine(esc(s.type || '—'), 100, 5.8)}</text>
            <text x={leftX + 120} y={ry + 18} fontSize="10" fill={FR.slate}>{clampLine(esc(s.date || '—'), 120, 5.8)}</text>
            <text x={leftX + 250} y={ry + 18} fontSize="10" fill={FR.slate}>—</text>
            <text x={leftX + 360} y={ry + 18} fontSize="10" fill={FR.slate}>
              {clampLine(esc([s.courier, s.trackingNumber].filter(Boolean).join(' · ') || '—'), 190, 5.8)}
            </text>
            <text x={leftX + 560} y={ry + 18} fontSize="10" fontWeight="bold" fill={verdictColor}>{esc(s.verdict || 'Pending')}</text>
          </g>
        );
      })}

      {/* Approval slots */}
      <rect x={rightX} y={170} width={rightW} height={30} fill={FR.slate} />
      <text x={rightX + 12} y={190} fontSize="10" fontWeight="bold" fill={FR.salt} letterSpacing="1.5">FINAL APPROVAL</text>
      {['designer', 'manager', 'vendor'].map((role, idx) => {
        const slot = fa[role] || {};
        const by = 210 + idx * 155;
        const signed = !!(role === 'vendor' ? slot.dateChop : slot.date);
        return (
          <g key={role}>
            <rect x={rightX} y={by} width={rightW} height={145} fill={FR.white} stroke={FR.sand} />
            <rect x={rightX} y={by} width={rightW} height={24} fill={FR.salt} />
            <text x={rightX + 12} y={by + 16} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="1.5">
              {role.toUpperCase()}
            </text>
            {signed && (
              <text x={rightX + rightW - 12} y={by + 16} fontSize="8" fontWeight="bold" fill="#4CAF7D" textAnchor="end" letterSpacing="0.5">✓ SIGNED</text>
            )}
            <text x={rightX + 14} y={by + 46} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">NAME</text>
            <text x={rightX + 14} y={by + 62} fontSize="11" fill={FR.slate}>{clampLine(esc(slot.name || '—'), rightW - 28, 6.2)}</text>
            <line x1={rightX + 14} y1={by + 66} x2={rightX + rightW - 14} y2={by + 66} stroke={FR.sand} />
            <text x={rightX + 14} y={by + 86} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">SIGNATURE</text>
            <text x={rightX + 14} y={by + 104} fontFamily="'Cormorant Garamond', Georgia, serif" fontStyle="italic" fontSize="14" fill={FR.slate}>
              {clampLine(esc(slot.signature || '—'), rightW - 28, 6.2)}
            </text>
            <line x1={rightX + 14} y1={by + 110} x2={rightX + rightW - 14} y2={by + 110} stroke={FR.sand} />
            <text x={rightX + 14} y={by + 128} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">DATE</text>
            <text x={rightX + 80} y={by + 128} fontSize="11" fill={FR.slate}>
              {esc((role === 'vendor' ? slot.dateChop : slot.date) || '—')}
            </text>
          </g>
        );
      })}

      {/* Revision history — bottom strip, full width. */}
      <text x={leftX} y={revY - 6} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="2">REVISION HISTORY</text>
      <GridTable x={leftX} y={revY} cols={revCols} rows={revRows} bodyRows={3} rowH={22} headerH={22} />
    </g>
  );
}

const PAGE_FNS = [
  { title: 'Overview',          body: ({ d, images }) => <PageCover d={d} images={images} /> },
  { title: 'Design',            body: ({ d, images }) => <PageDesign d={d} images={images} /> },
  { title: 'Materials',         body: ({ d, images }) => <PageMaterials d={d} images={images} /> },
  { title: 'Construction',      body: ({ d, images }) => <PageConstruction d={d} images={images} /> },
  { title: 'Embellishments',    body: ({ d, images }) => <PageEmbellishments d={d} images={images} /> },
  { title: 'Treatment',         body: ({ d, images }) => <PageTreatment d={d} images={images} /> },
  { title: 'Quality Control',   body: ({ d, images }) => <PageQC d={d} images={images} /> },
  { title: 'Samples & Approval', body: ({ d }) => <PageApproval d={d} /> },
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

export default function ComponentPackPagePreview({ data, images, step, skippedSteps }) {
  const d = data || {};
  const componentInfo = `${d.componentName || 'Untitled'} · ${d.componentType || ''}`;
  const pageNum = Math.min(Math.max(step + 1, 1), TOTAL_PAGES);
  const current = PAGE_FNS[step] || PAGE_FNS[0];
  const Body = current.body;
  const isSkipped = Array.isArray(skippedSteps) && skippedSteps.includes(step);

  return (
    <svg xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      preserveAspectRatio="xMidYMin meet"
      style={{ width: '100%', height: 'auto', background: FR.white, boxShadow: '0 2px 14px rgba(0,0,0,0.12)', borderRadius: 6, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <PageFrame title={current.title} pageNum={pageNum} componentInfo={componentInfo}>
        <Body d={d} images={images} />
      </PageFrame>
      {isSkipped && <SkipOverlay />}
    </svg>
  );
}
