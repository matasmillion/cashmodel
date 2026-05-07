// Live A4-landscape preview of the fabric BOM page.
//
// Header / footer chrome is the same as TechPackPagePreview (slate bar +
// soil divider on top, copyright + page label on the bottom) so the
// fabric library's preview and the tech pack's BOM page read as one
// continuous artifact.
//
// Body uses the landscape canvas: spec strip across the top, then
// front/back photos on the left, color card grid on the right.

import { useEffect, useState } from 'react';
import { FR } from './techPackConstants';
import { FABRIC_WEAVE_LABEL } from '../../utils/fabricLibrary';
import { getAssetUrl, isLegacyDataUrl } from '../../utils/plmAssets';

const PAGE_W = 1123;
const PAGE_H = 794;
const TOTAL_PAGES = 20;
const PAGE_LABEL = 'BOM-F';

const esc = (s) => String(s ?? '');

function clamp(s, maxW, charW = 6.5) {
  const max = Math.floor(maxW / charW);
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + '…';
}

// Resolve a Storage path → signed URL while caching by ref so we never
// call setState synchronously inside the effect body.
function useResolved(ref) {
  const inline = ref && (isLegacyDataUrl(ref) || /^https?:\/\//i.test(ref)) ? ref : '';
  const [resolvedByRef, setResolvedByRef] = useState({});
  useEffect(() => {
    if (!ref || inline) return undefined;
    if (resolvedByRef[ref]) return undefined;
    let cancelled = false;
    getAssetUrl(ref).then(u => {
      if (cancelled || !u) return;
      setResolvedByRef(m => ({ ...m, [ref]: u }));
    });
    return () => { cancelled = true; };
  }, [ref, inline, resolvedByRef]);
  return inline || resolvedByRef[ref] || '';
}

function fmtPrice(p) {
  if (p == null || p === '' || Number.isNaN(Number(p))) return '—';
  return `$${Number(p).toFixed(2)} / m`;
}
function fmtNum(n, suffix = '') {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
  return `${Number(n)}${suffix}`;
}

// ─── Header / footer (matches TechPackPagePreview) ──────────────────────────
function PageFrame({ title, phase, pageNum, styleInfo, styleNumber, children }) {
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
      <text x={PAGE_W - 40} y="50" textAnchor="end" fontSize="8" fill={FR.sand} letterSpacing="2">PAGE {pageNum} / {TOTAL_PAGES}</text>
      <rect x="0" y="70" width={PAGE_W} height={2} fill={FR.soil} />
      <text x="40" y="775" fontSize="9" fill={FR.stone}>{styleInfo}</text>
      <text x={PAGE_W - 40} y="775" textAnchor="end" fontSize="9" fill={FR.stone}>PAGE {pageNum} / {TOTAL_PAGES}</text>
      {children}
    </g>
  );
}

// ─── Body bits ──────────────────────────────────────────────────────────────
function StatBlock({ x, y, label, value, valueSize = 12, mono = false, w = 200 }) {
  return (
    <g>
      <text x={x} y={y} fontSize="7.5" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">{esc((label || '').toUpperCase())}</text>
      <text x={x} y={y + 18} fontSize={valueSize} fill={FR.slate}
        fontFamily={mono ? "ui-monospace, 'SF Mono', Menlo, monospace" : "Helvetica, Arial, sans-serif"}>
        {clamp(esc(value || '—'), w)}
      </text>
    </g>
  );
}

function PhotoBox({ x, y, w, h, src, label }) {
  const resolved = useResolved(src);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={FR.salt} stroke={FR.sand} strokeWidth="0.5" />
      {resolved && (
        <image href={resolved} x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} preserveAspectRatio="xMidYMid slice" />
      )}
      {!resolved && (
        <text x={x + w / 2} y={y + h / 2} textAnchor="middle" fontSize="10" fill={FR.stone} fontStyle="italic">No image</text>
      )}
      <rect x={x} y={y + h - 18} width="60" height="18" fill={FR.slate} />
      <text x={x + 30} y={y + h - 5} textAnchor="middle" fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="2">{label}</text>
    </g>
  );
}

function Swatch({ x, y, w, entry }) {
  const resolved = useResolved(entry.url);
  return (
    <g>
      <rect x={x} y={y} width={w} height={w} fill={entry.hex || FR.salt} stroke={FR.sand} strokeWidth="0.5" />
      {resolved && (
        <image href={resolved} x={x} y={y} width={w} height={w} preserveAspectRatio="xMidYMid slice" />
      )}
      <text x={x + w / 2} y={y + w + 11} textAnchor="middle" fontSize="7.5" fill={FR.slate}>
        {clamp(esc(entry.label || ''), w, 5)}
      </text>
    </g>
  );
}

function PageBody({ fabric }) {
  const colors = (fabric.color_card_images || []).slice(0, 32);

  // Spec strip — eight stat blocks across the top of the body.
  const stripY = 100;
  const stripCells = [
    { label: 'Mill / Vendor',  value: fabric.mill_id },
    { label: 'Mill Fabric #',  value: fabric.mill_fabric_no, mono: true },
    { label: 'Composition',    value: fabric.composition },
    { label: 'Weight',         value: fmtNum(fabric.weight_gsm, ' gsm') },
    { label: 'Width',          value: fmtNum(fabric.width_cm, ' cm') },
    { label: 'Lead Time',      value: fmtNum(fabric.lead_time_days, ' days') },
    { label: 'MOQ',            value: fmtNum(fabric.moq_meters, ' m') },
    { label: 'Price',          value: fmtPrice(fabric.price_per_meter_usd) },
  ];
  const stripStartX = 40;
  const stripCellW = (PAGE_W - stripStartX * 2) / stripCells.length;

  // Photos: front + back stacked vertically on the left ~46%.
  const photosX = 40;
  const photosY = 200;
  const photoW = 470;
  const photoH = 250;
  const gap = 14;

  // Color card on the right side.
  const ccX = photosX + photoW + 30;
  const ccY = 200;
  const ccW = PAGE_W - ccX - 40;
  const cols = 6;
  const swGap = 10;
  const swSize = (ccW - swGap * (cols - 1) - 24) / cols;
  const ccH = photoH * 2 + gap;
  const rows = Math.min(4, Math.ceil(colors.length / cols) || 1);

  return (
    <g>
      {/* Sub-title under header */}
      <text x={PAGE_W / 2} y={108} textAnchor="middle"
        fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="16" fill={FR.slate}>
        {fabric.name || 'Untitled fabric'}
        {fabric.version ? ` · ${fabric.version}` : ''}
        {fabric.weave ? ` · ${FABRIC_WEAVE_LABEL[fabric.weave] || fabric.weave}` : ''}
        {fabric.category ? ` · ${fabric.category.toUpperCase()}` : ''}
      </text>

      {/* Spec strip */}
      <rect x={stripStartX} y={stripY + 18} width={PAGE_W - stripStartX * 2} height={56}
        fill={FR.salt} stroke={FR.sand} strokeWidth="0.5" />
      {stripCells.map((c, i) => (
        <g key={i}>
          <StatBlock
            x={stripStartX + i * stripCellW + 12}
            y={stripY + 38}
            label={c.label}
            value={c.value}
            valueSize={11}
            mono={c.mono}
            w={stripCellW - 16}
          />
          {i > 0 && (
            <line x1={stripStartX + i * stripCellW} y1={stripY + 22} x2={stripStartX + i * stripCellW} y2={stripY + 70} stroke={FR.sand} strokeWidth="0.5" />
          )}
        </g>
      ))}

      {/* Photos */}
      <text x={photosX} y={photosY - 6} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">FABRIC PHOTOS</text>
      <PhotoBox x={photosX} y={photosY} w={photoW} h={photoH} src={fabric.front_image_url} label="FRONT" />
      <PhotoBox x={photosX} y={photosY + photoH + gap} w={photoW} h={photoH} src={fabric.back_image_url} label="BACK" />

      {/* Color card */}
      <text x={ccX} y={ccY - 6} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">COLOR CARD</text>
      <text x={PAGE_W - 40} y={ccY - 6} textAnchor="end" fontSize="8" fill={FR.stone}>{colors.length} colorways</text>
      <rect x={ccX} y={ccY} width={ccW} height={ccH} fill={FR.salt} stroke={FR.sand} strokeWidth="0.5" />
      {Array.from({ length: rows }).flatMap((_, r) =>
        Array.from({ length: cols }).map((__, c) => {
          const idx = r * cols + c;
          const entry = colors[idx];
          if (!entry) return null;
          const x = ccX + 12 + c * (swSize + swGap);
          const y = ccY + 14 + r * (swSize + 22);
          return <Swatch key={`${r}-${c}`} x={x} y={y} w={swSize} entry={entry} />;
        })
      )}
      {colors.length === 0 && (
        <text x={ccX + ccW / 2} y={ccY + ccH / 2} textAnchor="middle" fontSize="11" fill={FR.stone} fontStyle="italic">
          No swatches uploaded yet
        </text>
      )}

      {/* Hand / notes caption */}
      {(fabric.hand || fabric.notes) && (
        <g>
          <text x={40} y={photosY + photoH * 2 + gap + 30} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">HAND / NOTES</text>
          <text x={40} y={photosY + photoH * 2 + gap + 48} fontSize="10" fill={FR.slate}>
            {clamp(esc([fabric.hand, fabric.notes].filter(Boolean).join(' — ')), PAGE_W - 80, 5.6)}
          </text>
        </g>
      )}
    </g>
  );
}

export default function FabricBOMPreview({ fabric }) {
  const styleInfo = `© 2026 Foreign Resource Co. — Confidential Tech Pack`;
  const styleNumber = fabric.code
    ? (fabric.mill_fabric_no ? `${fabric.code} · #${fabric.mill_fabric_no}` : fabric.code)
    : '';
  const title = 'Fabric BOM Card';

  return (
    <svg xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      preserveAspectRatio="xMidYMin meet"
      style={{ width: '100%', height: 'auto', background: FR.white, boxShadow: '0 2px 14px rgba(0,0,0,0.12)', borderRadius: 6, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <PageFrame title={title} phase="MATERIALS" pageNum={PAGE_LABEL} styleInfo={styleInfo} styleNumber={styleNumber}>
        <PageBody fabric={fabric} />
      </PageFrame>
    </svg>
  );
}
