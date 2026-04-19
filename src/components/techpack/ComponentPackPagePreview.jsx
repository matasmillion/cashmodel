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
      <text x="40" y="28" fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="3">FR · COMPONENT PACK</text>
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

  // Two-column identity grid (6 rows × 2 columns)
  const leftX = 40;
  const rightX = 580;
  const colW = 480;
  const rowStartY = 350;
  const rowGap = 48;
  const leftCol = [
    { label: 'Style #',             value: d.styleNumber },
    { label: 'Component Type',      value: d.componentType },
    { label: 'Supplier',            value: d.supplier },
    { label: 'Season',              value: d.season },
    { label: 'Date Created',        value: d.dateCreated },
    { label: 'Revision',            value: d.revision },
  ];
  const rightCol = [
    { label: 'Parent Styles',       value: d.parentStyles },
    { label: 'Colorways',           value: d.colorways },
    { label: 'Dimensions',          value: d.dimensions },
    { label: 'Target Unit Cost ($)', value: d.targetUnitCost },
    { label: 'MOQ',                 value: d.moq },
    { label: 'Status',              value: d.status },
  ];

  // Signature cards along the bottom
  const sigY = 640;
  const sigH = 130;
  const sigGap = 20;
  const sigW = (PAGE_W - 80 - sigGap * 2) / 3;

  return (
    <g>
      {/* Title block */}
      <text x={40} y={120} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="42" fill={FR.slate}>Component Spec</text>
      <rect x={40} y={132} width="80" height="2" fill={FR.soil} />
      <text x={40} y={168} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="26" fill={FR.slate}>
        {clampLine(d.componentName || 'New Component', 900, 14)}
      </text>

      {/* Cover photo */}
      {cover
        ? <image href={cover.data} x={PAGE_W - 320 - 40} y={100} width="320" height="200" preserveAspectRatio="xMidYMid meet" />
        : (
          <g>
            <rect x={PAGE_W - 320 - 40} y={100} width="320" height="200" fill={FR.salt} stroke={FR.sand} strokeDasharray="6 6" />
            <text x={PAGE_W - 160 - 40} y={205} textAnchor="middle" fontSize="11" fill={FR.stone} fontStyle="italic">Component photo goes here</text>
          </g>
        )}

      {/* Section divider */}
      <rect x="40" y="320" width={PAGE_W - 80} height="1" fill={FR.sand} />
      <text x={40} y={340} fontSize="10" fontWeight="bold" fill={FR.soil} letterSpacing="2">IDENTITY</text>

      {/* Two-column grid */}
      {leftCol.map((f, i) => (
        <Field key={`L${i}`} x={leftX} y={rowStartY + i * rowGap} label={f.label} value={f.value} w={colW} />
      ))}
      {rightCol.map((f, i) => (
        <Field key={`R${i}`} x={rightX} y={rowStartY + i * rowGap} label={f.label} value={f.value} w={colW} />
      ))}

      {/* Signature cards */}
      <SignatureCard x={40}                         y={sigY} w={sigW} h={sigH} title="Designed By"        name={d.designedBy?.name}        date={d.designedBy?.date} />
      <SignatureCard x={40 + sigW + sigGap}         y={sigY} w={sigW} h={sigH} title="Approved By"        name={d.approvedBy?.name}        date={d.approvedBy?.date} />
      <SignatureCard x={40 + (sigW + sigGap) * 2}   y={sigY} w={sigW} h={sigH} title="Supplier Confirmed" name={d.supplierConfirmed?.name} date={d.supplierConfirmed?.date} />
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

const PAGE_FNS = [
  { title: 'Cover & Identity',              body: ({ d, images }) => <PageCover d={d} images={images} /> },
  { title: 'Specification & Artwork',       body: () => <ComingSoonPage pageNum={2} /> },
  { title: 'BOM & Color',                   body: () => <ComingSoonPage pageNum={3} /> },
  { title: 'Construction, QC & Approval',   body: () => <ComingSoonPage pageNum={4} /> },
];

export default function ComponentPackPagePreview({ data, images, step }) {
  const d = data || {};
  const componentInfo = `${d.componentName || 'Untitled'} · ${d.styleNumber || ''}`;
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
