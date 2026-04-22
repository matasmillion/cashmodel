// Live A4-landscape page preview for the Trim Pack wizard.
// 6 pages total: Overview, Materials, Construction, Embellishments,
// Treatment, Quality Control.

import { FR } from './techPackConstants';

const PAGE_W = 1123;
const PAGE_H = 794;
const TOTAL_PAGES = 6;

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

  const cardY = 595;
  const cardH = 150;
  const cardGap = 16;
  const cardW = (PAGE_W - 80 - cardGap * 2) / 3;

  return (
    <g>
      {/* Title block */}
      <text x={40} y={110} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="34" fill={FR.slate}>Trim Specification</text>
      <rect x={40} y={120} width="70" height="2" fill={FR.soil} />
      <text x={40} y={148} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="20" fill={FR.slate}>
        {clampLine(d.componentName || 'New Trim', 740, 11)}
      </text>
      <text x={40} y={170} fontSize="9" fill={FR.stone} letterSpacing="1.5">STATUS · {esc((d.status || '—').toUpperCase())}</text>

      {/* Cover photo — sized to fit within the title band */}
      {cover
        ? <image href={cover.data} x={PAGE_W - 280 - 40} y={85} width="280" height="160" preserveAspectRatio="xMidYMid meet" />
        : (
          <g>
            <rect x={PAGE_W - 280 - 40} y={85} width="280" height="160" fill={FR.salt} stroke={FR.sand} strokeDasharray="6 6" />
            <text x={PAGE_W - 140 - 40} y={170} textAnchor="middle" fontSize="11" fill={FR.stone} fontStyle="italic">Trim photo goes here</text>
          </g>
        )}

      {/* Identity grid — tight 4×2 */}
      <rect x="40" y="258" width={PAGE_W - 80} height="1" fill={FR.sand} />
      <text x={40} y={276} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="2">OVERVIEW</text>
      {leftCol.map((f, i) => (
        <Field key={`L${i}`} x={40}  y={292 + i * 24} label={f.label} value={f.value} w={500} />
      ))}
      {rightCol.map((f, i) => (
        <Field key={`R${i}`} x={580} y={292 + i * 24} label={f.label} value={f.value} w={500} />
      ))}

      {/* Revision history strip */}
      <SectionHeading x={40} y={410}>Revision History</SectionHeading>
      <GridTable x={40} y={424} cols={revCols} rows={revRows} bodyRows={3} rowH={20} headerH={20} />

      {/* Samples — compact row of the 3 stages */}
      <SectionHeading x={40} y={530}>Samples</SectionHeading>
      <SampleStrip d={d} x={40} y={544} w={PAGE_W - 80} />

      {/* Final approval — compact 3-row cards */}
      <SectionHeading x={40} y={590}>Final Approval</SectionHeading>
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

// ── Page 2: Materials ──────────────────────────────────────────────────────
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
  const imgH = 220;

  return (
    <g>
      <InfoStrip d={d} />
      <SectionHeading x={40} y={158}>Materials</SectionHeading>

      {materials.map((m, i) => {
        const cx = 40 + i * (cardW + cardGap);
        const img = imgs.find(x => x.slot === `material-${i}`);
        return (
          <g key={i}>
            <rect x={cx} y={cardY} width={cardW} height={cardH} fill={FR.white} stroke={FR.sand} />
            <rect x={cx} y={cardY} width={cardW} height={24} fill={FR.salt} />
            <text x={cx + 12} y={cardY + 16} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="1.5">
              MATERIAL {i + 1}
            </text>

            <PhotoSlot x={cx + 14} y={cardY + 38} w={cardW - 28} h={imgH} image={img} placeholder="Swatch photo" />

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

  // 16:9 hero on top.
  const heroX = 40;
  const heroY = 170;
  const heroW = PAGE_W - 80;
  const heroH = heroW * 9 / 16; // ≈ 586 — fills landscape nicely

  // Callouts below.
  const calloutY = heroY + heroH + 28;
  const calloutH = PAGE_H - calloutY - 50;
  const calloutGap = 14;
  const calloutW = (PAGE_W - 80 - calloutGap * 2) / 3;

  return (
    <g>
      <InfoStrip d={d} />
      <SectionHeading x={40} y={158}>Construction</SectionHeading>

      <PhotoSlot x={heroX} y={heroY} w={heroW} h={heroH} image={diagram} placeholder="16:9 measurement diagram" />

      {callouts.map((c, i) => {
        const cx = 40 + i * (calloutW + calloutGap);
        return (
          <g key={i}>
            <rect x={cx} y={calloutY} width={calloutW} height={calloutH} fill={FR.white} stroke={FR.sand} />
            <rect x={cx} y={calloutY} width={calloutW} height={22} fill={FR.salt} />
            <text x={cx + 12} y={calloutY + 15} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="1.5">
              CALLOUT {i + 1}
            </text>
            <text x={cx + 12} y={calloutY + 40} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">LABEL</text>
            <text x={cx + 12} y={calloutY + 56} fontSize="11" fill={FR.slate}>{clampLine(esc(c.label || '—'), calloutW - 24, 6.2)}</text>
            <text x={cx + 12} y={calloutY + 78} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">DETAIL</text>
            <foreignObject x={cx + 12} y={calloutY + 86} width={calloutW - 24} height={calloutH - 96}>
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

  // Artwork slots
  const artY = 330;
  const artH = 190;
  const artGap = 16;
  const artW = (PAGE_W - 80 - artGap) / 2;

  // Attachments row
  const attY = artY + artH + 38;
  const attachments = d.attachments || [];
  const attGap = 12;
  const maxAttPerRow = 5;

  return (
    <g>
      <InfoStrip d={d} />
      <SectionHeading x={40} y={158}>Colorways</SectionHeading>
      <GridTable x={40} y={170} cols={cwCols} rows={colorways} bodyRows={4} />

      <SectionHeading x={40} y={318}>Artwork</SectionHeading>
      <PhotoSlot x={40}                   y={artY} w={artW} h={artH} image={frontArt} placeholder="Front artwork" />
      <text x={40 + 8} y={artY + artH - 8} fontSize="9" fontWeight="bold" fill={FR.white} letterSpacing="1">FRONT</text>
      <PhotoSlot x={40 + artW + artGap}   y={artY} w={artW} h={artH} image={backArt}  placeholder="Back artwork" />
      <text x={40 + artW + artGap + 8} y={artY + artH - 8} fontSize="9" fontWeight="bold" fill={FR.white} letterSpacing="1">BACK</text>

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
  const imgH = 320;

  return (
    <g>
      <InfoStrip d={d} />
      <SectionHeading x={40} y={158}>Treatment</SectionHeading>

      {treatments.map((t, i) => {
        const cx = 40 + i * (cardW + cardGap);
        const img = imgs.find(x => x.slot === `treatment-${i}`);
        return (
          <g key={i}>
            <rect x={cx} y={cardY} width={cardW} height={cardH} fill={FR.white} stroke={FR.sand} />
            <rect x={cx} y={cardY} width={cardW} height={24} fill={FR.salt} />
            <text x={cx + 12} y={cardY + 16} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="1.5">
              FINISH {i + 1}
            </text>

            <PhotoSlot x={cx + 14} y={cardY + 38} w={cardW - 28} h={imgH} image={img} placeholder="Finish reference" />

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
  const imgH = 320;

  return (
    <g>
      <InfoStrip d={d} />
      <SectionHeading x={40} y={158}>Quality Control</SectionHeading>

      {qcPoints.map((q, i) => {
        const cx = 40 + i * (cardW + cardGap);
        const img = imgs.find(x => x.slot === `qc-${i}`);
        return (
          <g key={i}>
            <rect x={cx} y={cardY} width={cardW} height={cardH} fill={FR.white} stroke={FR.sand} />
            <rect x={cx} y={cardY} width={cardW} height={24} fill={FR.salt} />
            <text x={cx + 12} y={cardY + 16} fontSize="9" fontWeight="bold" fill={FR.soil} letterSpacing="1.5">
              QC FOCUS {i + 1}
            </text>

            <PhotoSlot x={cx + 14} y={cardY + 38} w={cardW - 28} h={imgH} image={img} placeholder="Reference photo" />

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
