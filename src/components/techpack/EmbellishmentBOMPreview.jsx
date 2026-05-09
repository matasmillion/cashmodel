// Live A4-landscape preview of the Embellishment BOM page.
// Left: artwork swatch (9:16) + placement reference photo.
// Centre: placement marker on a garment silhouette + spec table.
// Right: vendor + sourcing strip.
// Bottom: cost / unit big number.
//
// Props:
//   embellishment — Embellishment record from embellishmentStore
//   styleNumber   — top-right code when rendered inside a tech pack
//   pageLabel     — e.g. '05 / 24'

import { useEffect, useState } from 'react';
import { FR } from './techPackConstants';
import { EMBELLISHMENT_TYPE_LABEL } from '../../utils/embellishmentLibrary';
import { getAssetUrl, isLegacyDataUrl } from '../../utils/plmAssets';

const PAGE_W = 1123;
const PAGE_H = 794;

const esc = (s) => String(s ?? '');

function clamp(s, maxChars) {
  if (!s) return '';
  if (s.length <= maxChars) return s;
  return s.slice(0, Math.max(1, maxChars - 1)) + '…';
}

function useResolved(ref) {
  const inline = ref && (isLegacyDataUrl(ref) || /^https?:\/\//i.test(ref) || /^blob:/i.test(ref)) ? ref : '';
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

// 9:16 portrait photo frame with label badge.
function Photo({ x, y, w, h, src, label }) {
  const resolved = useResolved(src);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={FR.salt} stroke={FR.sand} strokeWidth="0.5" />
      {resolved
        ? <image href={resolved} x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} preserveAspectRatio="xMidYMid slice" />
        : <text x={x + w / 2} y={y + h / 2} textAnchor="middle" fontSize="10" fill={FR.stone} fontStyle="italic">No image</text>
      }
      <rect x={x} y={y + h - 18} width={w} height={18} fill="rgba(58,58,58,0.45)" />
      <text x={x + w / 2} y={y + h - 5} textAnchor="middle" fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="2">{label}</text>
    </g>
  );
}

// Garment silhouette with a placement marker dot. `placement` is a string
// like "Left chest" or "Back full" — we map it to approximate [cx,cy] on
// a 120×220 silhouette coordinate space.
const PLACEMENT_COORDS = {
  'Left chest':   [46, 80],
  'Right chest':  [74, 80],
  'Center chest': [60, 88],
  'Front full':   [60, 110],
  'Back yoke':    [60, 72],
  'Back full':    [60, 120],
  'Left sleeve':  [26, 96],
  'Right sleeve': [94, 96],
  'Hem':          [60, 185],
  'Hood':         [60, 42],
  'Pocket':       [50, 130],
};

function PlacementSilhouette({ x, y, w, h, placement }) {
  // Scale from the 120×220 coordinate space to the actual w×h box.
  const sx = w / 120;
  const sy = h / 220;
  const coords = PLACEMENT_COORDS[placement];
  const dotX = coords ? x + coords[0] * sx : null;
  const dotY = coords ? y + coords[1] * sy : null;

  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={FR.salt} stroke={FR.sand} strokeWidth="0.5" />
      {/* Garment ghost — generic hoodie outline */}
      <g transform={`translate(${x + w / 2 - 60 * sx}, ${y + h / 2 - 110 * sy}) scale(${sx}, ${sy})`}
        stroke={FR.sand} strokeWidth={1 / sx} fill="none">
        <path d="M 38 12 L 24 26 L 8 50 L 18 58 L 18 200 L 102 200 L 102 58 L 112 50 L 96 26 L 82 12 Q 72 24 60 24 Q 48 24 38 12 Z" />
        <path d="M 8 50 L 1 80 L 18 84 L 18 58" />
        <path d="M 112 50 L 119 80 L 102 84 L 102 58" />
        {/* Hood */}
        <path d="M 38 12 Q 30 4 28 18 Q 24 30 24 26" fill="none" />
        <path d="M 82 12 Q 90 4 92 18 Q 96 30 96 26" fill="none" />
        <path d="M 28 18 Q 60 32 92 18" fill="none" />
      </g>
      {/* Placement marker */}
      {dotX && dotY && (
        <g>
          <circle cx={dotX} cy={dotY} r="8" fill={FR.soil} opacity="0.85" />
          <circle cx={dotX} cy={dotY} r="3.5" fill={FR.salt} />
        </g>
      )}
      {placement && (
        <text x={x + w / 2} y={y + h - 6} textAnchor="middle" fontSize="9" fill={FR.stone}>
          {placement}
        </text>
      )}
    </g>
  );
}

function wrapText(text, maxChars, maxLines) {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (lines.length >= maxLines) break;
    if (!current) { current = word; continue; }
    if ((current + ' ' + word).length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

function PageBody({ embellishment }) {
  const typeLabel = EMBELLISHMENT_TYPE_LABEL[embellishment.type] || embellishment.type || '';
  const w = embellishment.size_w_cm;
  const h = embellishment.size_h_cm;
  const sizeStr = (w || h) ? `${w || '?'} × ${h || '?'} cm` : '—';
  const noteLines = wrapText(embellishment.notes || '', 42, 5);
  const cost = parseFloat(embellishment.cost_per_unit_usd || 0);

  return (
    <g>
      {/* Title */}
      <text x="40" y="118" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="32" fill={FR.slate}>
        {clamp(esc(embellishment.name || 'Untitled embellishment'), 44)}
      </text>
      {/* Type chip */}
      <rect x={PAGE_W - 40 - 160} y="92" width="160" height="26" fill={FR.slate} rx="3" />
      <text x={PAGE_W - 40 - 80} y="110" textAnchor="middle" fontSize="11" fontWeight="bold" fill={FR.salt} letterSpacing="0.6">
        {typeLabel.toUpperCase()}
      </text>

      {/* ARTWORK SWATCH — 9:16 portrait */}
      <Photo x={40} y={150} w={220} h={391} src={embellishment.artwork_swatch_image_url} label="ARTWORK" />

      {/* PLACEMENT REFERENCE PHOTO */}
      <Photo x={270} y={150} w={220} h={391} src={embellishment.placement_image_url} label="PLACEMENT REF" />

      {/* GARMENT SILHOUETTE with marker */}
      <text x="520" y="166" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">PLACEMENT</text>
      <PlacementSilhouette x={520} y={172} w={200} h={280} placement={embellishment.placement || ''} />

      {/* SPEC — right of the silhouette */}
      <text x="740" y="166" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">SPEC</text>
      <line x1="740" y1="172" x2={PAGE_W - 40} y2="172" stroke={FR.sand} strokeWidth="0.5" />

      {/* Size */}
      <text x="740" y="192" fontSize="9" fill={FR.stone} letterSpacing="0.3">SIZE</text>
      <text x="740" y="210" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="22" fill={FR.slate}>{sizeStr}</text>

      {/* Colors */}
      <text x="740" y="240" fontSize="9" fill={FR.stone} letterSpacing="0.3">COLORS</text>
      <text x="740" y="258" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="22" fill={FR.slate}>
        {embellishment.color_count || 1}
      </text>

      {/* Technique */}
      {embellishment.technique && (
        <g>
          <text x="740" y="288" fontSize="9" fill={FR.stone} letterSpacing="0.3">TECHNIQUE</text>
          <text x="740" y="306" fontSize="12" fill={FR.slate}>{clamp(esc(embellishment.technique), 32)}</text>
        </g>
      )}

      {/* VENDOR strip right */}
      <text x="740" y="346" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">VENDOR</text>
      <text x="740" y="364" fontSize="13" fill={FR.slate} fontWeight="bold">
        {clamp(esc(embellishment.primary_vendor_id || '—'), 28)}
      </text>

      <text x="740" y="392" fontSize="9" fill={FR.stone}>Lead time</text>
      <text x="740" y="408" fontSize="13" fill={FR.slate}>
        {embellishment.lead_time_days ? `${embellishment.lead_time_days} days` : '—'}
      </text>

      <text x="740" y="432" fontSize="9" fill={FR.stone}>MOQ</text>
      <text x="740" y="448" fontSize="13" fill={FR.slate}>
        {embellishment.moq_units ? `${embellishment.moq_units.toLocaleString()} units` : '—'}
      </text>

      {/* NOTES */}
      <text x="520" y="480" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">NOTES</text>
      {noteLines.length > 0
        ? noteLines.map((line, i) => (
          <text key={i} x="520" y={496 + i * 16} fontSize="11" fill={FR.slate}>{line}</text>
        ))
        : <text x="520" y="496" fontSize="11" fill={FR.stone} fontStyle="italic">— none</text>
      }

      {/* Bottom strip */}
      <line x1="40" y1="570" x2={PAGE_W - 40} y2="570" stroke={FR.sand} strokeWidth="0.5" />

      <text x="40" y="592" fontSize="9" fill={FR.stone} letterSpacing="0.4">CODE</text>
      <text x="40" y="612" fontSize="13" fill={FR.slate} fontWeight="bold" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
        {clamp(esc(embellishment.code || '—'), 20)}
      </text>
      <text x="40" y="632" fontSize="11" fill={FR.stone}>
        {typeLabel} · {embellishment.version || 'v1.0'} · {embellishment.placement || 'No placement'}
      </text>

      <line x1="40" y1="650" x2={PAGE_W - 40} y2="650" stroke={FR.sand} strokeWidth="0.5" />
      <text x="40" y="680" fontSize="9" fill={FR.stone} letterSpacing="0.4">VENDOR</text>
      <text x="40" y="700" fontSize="14" fill={FR.slate} fontWeight="bold">
        {clamp(esc(embellishment.primary_vendor_id || '—'), 40)}
      </text>

      <text x={PAGE_W - 40} y="680" textAnchor="end" fontSize="9" fill={FR.stone} letterSpacing="0.4">COST / UNIT</text>
      <text x={PAGE_W - 40} y="720" textAnchor="end" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="44" fill={FR.soil}>
        ${cost.toFixed(2)}
      </text>
    </g>
  );
}

export default function EmbellishmentBOMPreview({
  embellishment,
  styleNumber = null,
  pageLabel = null,
}) {
  const headerCode = styleNumber || embellishment.code || '';
  const pageTag = pageLabel || 'BOM-E';
  const styleInfo = '© 2026 Foreign Resource Co. — Confidential Tech Pack';
  return (
    <svg xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      preserveAspectRatio="xMidYMin meet"
      style={{ width: '100%', height: 'auto', background: FR.salt, boxShadow: '0 2px 14px rgba(0,0,0,0.10)', borderRadius: 6, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <rect x="0" y="0" width={PAGE_W} height={PAGE_H} fill={FR.salt} />
      <rect x="0" y="0" width={PAGE_W} height="70" fill={FR.slate} />
      <text x="40" y="28" fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="3">FOREIGN RESOURCE CO.</text>
      <text x="40" y="50" fontSize="8" fill={FR.sand} letterSpacing="2">BILL OF MATERIALS</text>
      <text x={PAGE_W / 2} y="44" textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="20" fill={FR.salt}>Embellishments</text>
      {headerCode && (
        <text x={PAGE_W - 40} y="28" textAnchor="end" fontSize="10" fontWeight="bold" fill={FR.salt} letterSpacing="2" fontFamily="ui-monospace, Menlo, monospace">{esc(headerCode)}</text>
      )}
      <text x={PAGE_W - 40} y="50" textAnchor="end" fontSize="8" fill={FR.sand} letterSpacing="2">PAGE {pageTag}</text>
      <rect x="0" y="70" width={PAGE_W} height="2" fill={FR.soil} />
      <PageBody embellishment={embellishment} />
      <text x="40" y="775" fontSize="9" fill={FR.stone}>{styleInfo}</text>
      <text x={PAGE_W - 40} y="775" textAnchor="end" fontSize="9" fill={FR.stone}>PAGE {pageTag}</text>
    </svg>
  );
}
