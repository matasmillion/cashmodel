// Live A4-landscape page preview for the Trim Pack wizard.
// 7 pages total: Overview, Design, Materials, Construction, Embellishments,
// Treatment, Quality Control.

import { FR } from './techPackConstants';

const PAGE_W = 1123;
const PAGE_H = 794;
const TOTAL_PAGES = 7;

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

  // ── Layout budget (PAGE_H = 794, footer at 775) ────────────────────────────
  //   header bar  ..................... 0–70
  //   title + photo  .................. 90–250
  //   identity grid  .................. 270–390
  //   revision history  ............... 410–510
  //   samples strip  .................. 530–575
  //   final approval cards  ........... 595–745
  //   footer stripe  .................. 775

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

  const revCols = [
    { key: 'rev',         label: 'Rev #',                 w: 60 },
    { key: 'date',        label: 'Date',                  w: 90 },
    { key: 'changedBy',   label: 'Changed By',            w: 170 },
    { key: 'description', label: 'Description of Change', w: 553 },
    { key: 'approvedBy',  label: 'Approved By',           w: 170 },
  ];
  const revRows = (d.revisions || []).filter(r => r.rev || r.date || r.changedBy || r.description || r.approvedBy);

  const fa = d.finalApproval || {};
  const designer = fa.designer || {};
  const manager  = fa.manager  || {};
  const factory  = fa.factory  || {};

  // Vertical layout budget (PAGE_H = 794, footer at 775):
  //   70                        header bar
  //   90–270                    title block + 2:3 trim photo top-right (160×240)
  //   280                       divider rule
  //   298                       "OVERVIEW" subheading
  //   316–400                   identity grid (4 rows × 22px, two columns)
  //   420                       Revision History heading
  //   436–516                   revision grid (header 22 + 3 body rows × 22)
  //   534                       Samples heading
  //   550–580                   sample strip pills (30)
  //   598                       Final Approval heading
  //   614–764                   three approval cards (150 tall)
  //   775                       footer

  const photoW = 160;
  const photoH = Math.round(photoW * 3 / 2); // 2:3 portrait
  const photoX = PAGE_W - photoW - 40;
  const photoY = 90;

  const idY = 316;
  const idRowGap = 22;

  const cardY = 614;
  const cardH = 150;
  const cardGap = 14;
  const cardW = (PAGE_W - 80 - cardGap * 2) / 3;

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

      {/* Trim photo — 2:3 portrait, top-right. Sits entirely above the OVERVIEW divider. */}
      {cover
        ? <image href={cover.data} x={photoX} y={photoY} width={photoW} height={photoH} preserveAspectRatio="xMidYMid slice" />
        : (
          <g>
            <rect x={photoX} y={photoY} width={photoW} height={photoH} fill={FR.salt} stroke={FR.sand} strokeDasharray="6 6" />
            <text x={photoX + photoW / 2} y={photoY + photoH / 2 + 4} textAnchor="middle" fontSize="10" fill={FR.stone} fontStyle="italic">Trim photo · 2:3</text>
          </g>
        )}

      {/* Identity grid — tight 4×2 with under-line separators */}
      <rect x="40" y="280" width={PAGE_W - 80} height="1" fill={FR.sand} />
      <text x={40} y={300} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="2">OVERVIEW</text>
      {leftCol.map((f, i) => {
        const y = idY + i * idRowGap;
        return (
          <g key={`L${i}`}>
            <Field x={40} y={y} label={f.label} value={f.value} w={500} />
            <line x1={40} y1={y + 20} x2={540} y2={y + 20} stroke={FR.sand} />
          </g>
        );
      })}
      {rightCol.map((f, i) => {
        const y = idY + i * idRowGap;
        return (
          <g key={`R${i}`}>
            <Field x={580} y={y} label={f.label} value={f.value} w={500} />
            <line x1={580} y1={y + 20} x2={PAGE_W - 40} y2={y + 20} stroke={FR.sand} />
          </g>
        );
      })}

      {/* Revision history strip */}
      <SectionHeading x={40} y={420}>Revision History</SectionHeading>
      <GridTable x={40} y={436} cols={revCols} rows={revRows} bodyRows={3} rowH={22} headerH={22} />

      {/* Samples — 3 stages */}
      <SectionHeading x={40} y={534}>Samples</SectionHeading>
      <SampleStrip d={d} x={40} y={548} w={PAGE_W - 80} />

      {/* Final approval — 3 compact cards */}
      <SectionHeading x={40} y={598}>Final Approval</SectionHeading>
      <CompactApprovalCard x={40}                         y={cardY} w={cardW} h={cardH} title="Designer" name={designer.name} signature={designer.signature} date={designer.date} />
      <CompactApprovalCard x={40 + cardW + cardGap}       y={cardY} w={cardW} h={cardH} title="Manager"  name={manager.name}  signature={manager.signature}  date={manager.date} />
      <CompactApprovalCard x={40 + (cardW + cardGap) * 2} y={cardY} w={cardW} h={cardH} title="Factory"  name={factory.name}  signature={factory.signature}  date={factory.dateChop} dateLabel="Date / Chop" />
    </g>
  );
}

// Compact sign-off card used on the Overview preview — 3 stacked label+value
// rows in 150px. The original ApprovalPreviewCard assumes ~220px of height
// and overflows when squeezed. This variant hard-codes tight spacing.
function CompactApprovalCard({ x, y, w, h, title, name, signature, date, dateLabel = 'Date' }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={FR.white} stroke={FR.sand} />
      <rect x={x} y={y} width={w} height={22} fill={FR.salt} />
      <text x={x + 10} y={y + 15} fontSize="8.5" fontWeight="bold" fill={FR.soil} letterSpacing="1.5">{esc(title.toUpperCase())}</text>

      <text x={x + 10} y={y + 40} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">NAME</text>
      <text x={x + 10} y={y + 55} fontSize="10" fill={FR.slate}>{clampLine(esc(name || '—'), w - 20, 5.8)}</text>
      <line x1={x + 10} y1={y + 59} x2={x + w - 10} y2={y + 59} stroke={FR.sand} />

      <text x={x + 10} y={y + 78} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">SIGNATURE</text>
      <text x={x + 10} y={y + 93} fontSize="10" fill={FR.slate}>{clampLine(esc(signature || '—'), w - 20, 5.8)}</text>
      <line x1={x + 10} y1={y + 97} x2={x + w - 10} y2={y + 97} stroke={FR.sand} />

      <text x={x + 10} y={y + 116} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">{esc(dateLabel.toUpperCase())}</text>
      <text x={x + 10} y={y + 131} fontSize="10" fill={FR.slate}>{clampLine(esc(date || '—'), w - 20, 5.8)}</text>
      <line x1={x + 10} y1={y + 135} x2={x + w - 10} y2={y + 135} stroke={FR.sand} />
    </g>
  );
}

// Horizontal strip: one pill per trim sample stage (Design / Sample /
// Production-Ready). Each pill shows the latest verdict dot + date for
// that stage so the reader can scan progress at a glance.
function SampleStrip({ d, x, y, w }) {
  const STAGES = ['Design', 'Sample', 'Production-Ready'];
  const samples = d.samples || [];
  const cellW = (w - 10 * (STAGES.length - 1)) / STAGES.length;

  const latestByType = {};
  samples.forEach(s => { latestByType[s.type] = s; });

  const verdictColor = (verdict) => {
    if (verdict === 'Approved') return '#4CAF7D';
    if (verdict === 'Rejected') return '#C0392B';
    if (verdict === 'Revise')   return '#D4956A';
    return FR.stone;
  };

  return (
    <g>
      {STAGES.map((t, i) => {
        const cx = x + i * (cellW + 10);
        const s = latestByType[t];
        return (
          <g key={t}>
            <rect x={cx} y={y} width={cellW} height={30} fill={FR.white} stroke={FR.sand} rx="3" />
            <text x={cx + 12} y={y + 12} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="0.8">{esc(t.toUpperCase())}</text>
            {s
              ? (
                <>
                  <circle cx={cx + cellW - 16} cy={y + 11} r="4" fill={verdictColor(s.verdict)} />
                  <text x={cx + 12} y={y + 25} fontSize="9" fill={FR.slate}>{clampLine(esc(`${s.verdict || 'Pending'} · ${s.date || ''}`), cellW - 24, 5.5)}</text>
                </>
              )
              : <text x={cx + 12} y={y + 25} fontSize="9" fill={FR.sand}>No sample logged yet</text>}
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
        ? <image href={image.data} x={x + 4} y={y + 4} width={w - 8} height={h - 8} preserveAspectRatio="xMidYMid meet" />
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
// name + composition + weight/gauge + factory.
function PageMaterials({ d, images }) {
  const imgs = images || [];
  const materials = (d.materials || []).slice(0, 3);
  while (materials.length < 3) materials.push({});

  const cardGap = 16;
  const cardW = (PAGE_W - 80 - cardGap * 2) / 3;
  const cardY = 170;
  const cardH = 560;
  // Swatch photo: 2:3 portrait, centered in the card.
  const imgW = 200;
  const imgH = Math.round(imgW * 3 / 2);

  return (
    <g>
      <InfoStrip d={d} />
      <SectionHeading x={40} y={158}>Materials</SectionHeading>

      {materials.map((m, i) => {
        const cx = 40 + i * (cardW + cardGap);
        const img = imgs.find(x => x.slot === `material-${i}`);
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

            <text x={cx + 14} y={cardY + 38 + imgH + 146} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">FACTORY</text>
            <text x={cx + 14} y={cardY + 38 + imgH + 162} fontSize="11" fill={FR.slate}>{clampLine(esc(m.factory || '—'), cardW - 28, 6.2)}</text>
            <line x1={cx + 14} y1={cardY + 38 + imgH + 166} x2={cx + cardW - 14} y2={cardY + 38 + imgH + 166} stroke={FR.sand} />
          </g>
        );
      })}
    </g>
  );
}

// ── Page 3: Construction ───────────────────────────────────────────────────
// 16:9 hero diagram (left 2/3 of page) + 3 stacked callout blocks (right 1/3).
function PageConstruction({ d, images }) {
  const imgs = images || [];
  const diagram = imgs.find(x => x.slot === 'construction-diagram');
  const callouts = (d.constructionCallouts || []).slice(0, 3);
  while (callouts.length < 3) callouts.push({});

  // A4 landscape diagram on the left (≈600 × 424). Callouts stacked on the
  // right to fill the remaining horizontal space without the previous
  // overflow problem the old 16:9 hero caused.
  const heroX = 40;
  const heroY = 170;
  const heroW = 600;
  const heroH = Math.round(heroW * 210 / 297); // A4 landscape

  const coColX = heroX + heroW + 30;
  const coColW = PAGE_W - coColX - 40;
  const coGap = 10;
  const coH = Math.round((heroH - coGap * 2) / 3);

  return (
    <g>
      <InfoStrip d={d} />
      <SectionHeading x={40} y={158}>Construction</SectionHeading>

      <PhotoSlot x={heroX} y={heroY} w={heroW} h={heroH} image={diagram} placeholder="Measurement diagram · A4 landscape" />
      <rect x={heroX} y={heroY + heroH - 22} width={140} height={22} fill={FR.slate} />
      <text x={heroX + 10} y={heroY + heroH - 7} fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="1.5">MEASUREMENT DIAGRAM</text>

      {callouts.map((c, i) => {
        const cy = heroY + i * (coH + coGap);
        return (
          <g key={i}>
            <rect x={coColX} y={cy} width={coColW} height={coH} fill={FR.white} stroke={FR.sand} />
            <rect x={coColX} y={cy} width={coColW} height={22} fill={FR.salt} />
            <text x={coColX + 12} y={cy + 15} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="1.5">
              CALLOUT {i + 1}
            </text>
            <text x={coColX + 12} y={cy + 38} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">LABEL</text>
            <text x={coColX + 12} y={cy + 54} fontSize="11" fill={FR.slate}>{clampLine(esc(c.label || '—'), coColW - 24, 6.2)}</text>
            <text x={coColX + 12} y={cy + 74} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">DETAIL</text>
            <foreignObject x={coColX + 12} y={cy + 80} width={coColW - 24} height={coH - 88}>
              <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 10, color: FR.slate, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                {c.detail || '—'}
              </div>
            </foreignObject>
          </g>
        );
      })}
    </g>
  );
}

// ── Page 4: Embellishments ─────────────────────────────────────────────────
// Colorways table + front/back artwork + attachments list.
function PageEmbellishments({ d, images }) {
  const imgs = images || [];
  const frontArt = imgs.find(x => x.slot === 'embellishment-artwork-front');
  const backArt  = imgs.find(x => x.slot === 'embellishment-artwork-back');

  const cwCols = [
    { key: 'name',           label: 'Name',           w: 220 },
    { key: 'frColor',        label: 'FR Color',       w: 180 },
    { key: 'pantone',        label: 'Pantone',        w: 180 },
    { key: 'hex',            label: 'Hex',            w: 150 },
    { key: 'approvalStatus', label: 'Approval',       w: 313 },
  ];
  const colorways = (d.colorwaysList || []).filter(r => r.name || r.frColor || r.pantone || r.hex);

  // Artwork slots: A4 landscape. Shrunk to 400px wide so both fit side by
  // side without filling the vertical height reserved for the attachments
  // row below.
  const artY = 320;
  const artW = 400;
  const artH = Math.round(artW * 210 / 297);
  const artGap = 16;
  const artRowTotalW = artW * 2 + artGap;
  const artStartX = Math.round((PAGE_W - artRowTotalW) / 2);

  // Attachments row
  const attY = artY + artH + 34;
  const attachments = d.attachments || [];
  const attGap = 12;
  const maxAttPerRow = 5;

  return (
    <g>
      <InfoStrip d={d} />
      <SectionHeading x={40} y={158}>Colorways</SectionHeading>
      <GridTable x={40} y={170} cols={cwCols} rows={colorways} bodyRows={4} />

      <SectionHeading x={40} y={308}>Artwork</SectionHeading>
      <PhotoSlot x={artStartX} y={artY} w={artW} h={artH} image={frontArt} placeholder="Front artwork · A4 landscape" />
      <rect x={artStartX} y={artY + artH - 22} width={64} height={22} fill={FR.slate} />
      <text x={artStartX + 10} y={artY + artH - 7} fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="1.5">FRONT</text>
      <PhotoSlot x={artStartX + artW + artGap} y={artY} w={artW} h={artH} image={backArt}  placeholder="Back artwork · A4 landscape" />
      <rect x={artStartX + artW + artGap} y={artY + artH - 22} width={56} height={22} fill={FR.slate} />
      <text x={artStartX + artW + artGap + 10} y={artY + artH - 7} fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="1.5">BACK</text>

      <SectionHeading x={40} y={attY - 12}>Attachments</SectionHeading>
      {attachments.length === 0
        ? <text x={40} y={attY + 18} fontSize="10" fill={FR.stone} fontStyle="italic">No source files attached — SVG / AI / PDF go here.</text>
        : attachments.slice(0, maxAttPerRow).map((a, i) => {
            const pillW = (PAGE_W - 80 - attGap * (maxAttPerRow - 1)) / maxAttPerRow;
            const px = 40 + i * (pillW + attGap);
            return (
              <g key={a.id}>
                <rect x={px} y={attY} width={pillW} height={56} fill={FR.white} stroke={FR.sand} rx="3" />
                <text x={px + 10} y={attY + 20} fontSize="10" fontWeight="bold" fill={FR.slate}>📄 {clampLine(esc(a.name), pillW - 22, 5.8)}</text>
                <text x={px + 10} y={attY + 36} fontSize="9" fill={FR.stone}>{(a.size / 1024).toFixed(0)} kB</text>
                <text x={px + 10} y={attY + 50} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">CLICK TO DOWNLOAD</text>
              </g>
            );
          })}
      {attachments.length > maxAttPerRow && (
        <text x={40} y={attY + 76} fontSize="9" fill={FR.stone} fontStyle="italic">+ {attachments.length - maxAttPerRow} more file(s)</text>
      )}
    </g>
  );
}

// ── Page 5: Treatment ──────────────────────────────────────────────────────
// Three finish cards: 2:3 photo + name + description. Preview layout mirrors
// the form.
function PageTreatment({ d, images }) {
  const imgs = images || [];
  const treatments = (d.treatments || []).slice(0, 3);
  while (treatments.length < 3) treatments.push({});

  const cardGap = 16;
  const cardW = (PAGE_W - 80 - cardGap * 2) / 3;
  const cardY = 170;
  const cardH = 560;
  // 2:3 portrait photo, centered in each card.
  const imgW = 240;
  const imgH = Math.round(imgW * 3 / 2);

  return (
    <g>
      <InfoStrip d={d} />
      <SectionHeading x={40} y={158}>Treatment</SectionHeading>

      {treatments.map((t, i) => {
        const cx = 40 + i * (cardW + cardGap);
        const img = imgs.find(x => x.slot === `treatment-${i}`);
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
  const qcPoints = (d.qcPoints || []).slice(0, 3);
  while (qcPoints.length < 3) qcPoints.push({});

  const cardGap = 16;
  const cardW = (PAGE_W - 80 - cardGap * 2) / 3;
  const cardY = 170;
  const cardH = 560;
  // 2:3 portrait reference photo, centered in each card.
  const imgW = 240;
  const imgH = Math.round(imgW * 3 / 2);

  return (
    <g>
      <InfoStrip d={d} />
      <SectionHeading x={40} y={158}>Quality Control</SectionHeading>

      {qcPoints.map((q, i) => {
        const cx = 40 + i * (cardW + cardGap);
        const img = imgs.find(x => x.slot === `qc-${i}`);
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

            <text x={cx + 14} y={cardY + 38 + imgH + 66} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">METHOD / PASS</text>
            <foreignObject x={cx + 14} y={cardY + 38 + imgH + 72} width={cardW - 28} height={cardH - (38 + imgH + 80)}>
              <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 10, color: FR.slate, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                {q.method || '—'}
              </div>
            </foreignObject>
          </g>
        );
      })}
    </g>
  );
}

const PAGE_FNS = [
  { title: 'Overview',         body: ({ d, images }) => <PageCover d={d} images={images} /> },
  { title: 'Design',           body: ({ d, images }) => <PageDesign d={d} images={images} /> },
  { title: 'Materials',        body: ({ d, images }) => <PageMaterials d={d} images={images} /> },
  { title: 'Construction',     body: ({ d, images }) => <PageConstruction d={d} images={images} /> },
  { title: 'Embellishments',   body: ({ d, images }) => <PageEmbellishments d={d} images={images} /> },
  { title: 'Treatment',        body: ({ d, images }) => <PageTreatment d={d} images={images} /> },
  { title: 'Quality Control',  body: ({ d, images }) => <PageQC d={d} images={images} /> },
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
