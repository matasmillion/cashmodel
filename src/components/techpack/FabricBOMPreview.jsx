// Live A4-landscape preview of the fabric BOM page. Apple-simple:
// front + back photos as the visual hero (9:16 portrait, side-by-side),
// big picked color when in tech pack mode (full color card grid in
// library mode), garment placement icon, mill finishes chip line,
// ribbing pair (knit only), and one big cost number.
//
// One component renders both surfaces — the library card live preview
// and the tech pack page 03. Overlay props:
//   chosenColor    — { url, label, hex } | null (library mode = null)
//   chosenArea     — 'Body' | 'Lining' | … (defaults to fabric.default_garment_area)
//   chosenFinishes — array overriding fabric.mill_finishes (per-style picks)
//   yieldM         — meters per unit, used for cost / unit headline
//   styleNumber    — top-right code (FW26-BB-HO-0002) when rendered into a tech pack
//   pageLabel      — e.g. '03 / 24'

import { useEffect, useState } from 'react';
import { FR } from './techPackConstants';
import { getAssetUrl, isLegacyDataUrl } from '../../utils/plmAssets';

const PAGE_W = 1123;
const PAGE_H = 794;

const esc = (s) => String(s ?? '');

function clamp(s, maxChars) {
  if (s.length <= maxChars) return s;
  return s.slice(0, Math.max(1, maxChars - 1)) + '…';
}

// Resolve a Storage path → signed URL while caching by ref so we never
// call setState synchronously inside the effect body.
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

function Photo({ x, y, w, h, src, label }) {
  const resolved = useResolved(src);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={FR.salt} stroke={FR.sand} strokeWidth="0.5" />
      {resolved
        ? <image href={resolved} x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} preserveAspectRatio="xMidYMid slice" />
        : <text x={x + w / 2} y={y + h / 2} textAnchor="middle" fontSize="10" fill={FR.stone} fontStyle="italic">No image</text>
      }
      <rect x={x} y={y + h - 18} width="58" height="18" fill={FR.slate} />
      <text x={x + 29} y={y + h - 5} textAnchor="middle" fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="2">{label}</text>
    </g>
  );
}

function Swatch({ x, y, w, h, entry, picked }) {
  const resolved = useResolved(entry.url);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={entry.hex || FR.salt}
        stroke={picked ? FR.soil : FR.sand} strokeWidth={picked ? 4 : 0.5} />
      {resolved && (
        <image href={resolved} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid slice" />
      )}
    </g>
  );
}

function execBadge(executedAt) {
  if (executedAt === 'secondary') return { fill: 'rgba(133,79,11,0.18)', stroke: '#854F0B', label: 'SECONDARY FACILITY' };
  if (executedAt === 'at_treatment') return { fill: 'rgba(58,90,140,0.18)', stroke: '#3a5a8c', label: 'WASH HOUSE' };
  return { fill: 'rgba(99,153,34,0.18)', stroke: '#3B6D11', label: 'AT MILL' };
}

function PageBody({ fabric, chosenColor, chosenArea, chosenFinishes, yieldM }) {
  const allColors = fabric.color_card_images || [];
  const finishes = chosenFinishes != null ? chosenFinishes : (fabric.mill_finishes || []);
  const area = chosenArea || fabric.default_garment_area || 'Body';
  const isKnit = (fabric.category || 'knit') === 'knit';
  const placementResolved = useResolved(fabric.garment_placement_image_url);
  const ribImgResolved = useResolved(fabric.ribbing_image_url);

  // Cost / unit headline: base + finishes × yield
  const baseUsd = parseFloat(fabric.price_per_meter_usd || 0);
  const finishesUsd = finishes.reduce((s, f) => s + (parseFloat(f.delta_per_meter_usd) || 0), 0);
  const allInUsd = baseUsd + finishesUsd;
  const m = parseFloat(yieldM || 0) || 0;
  const costPerUnit = m > 0 ? allInUsd * m : allInUsd;
  const costLabel = m > 0 ? 'Cost / unit' : 'Cost / m';

  return (
    <g>
      {/* Title row */}
      <text x="40" y="114" fontSize="30" fontWeight="600" fill={FR.slate}>
        {clamp(esc(fabric.name || fabric.mill_fabric_no || 'Untitled fabric'), 48)}
      </text>
      <text x="40" y="134" fontSize="10" fill={FR.stone}>
        {clamp(esc([fabric.mill_id, fabric.composition, fabric.weight_gsm ? `${fabric.weight_gsm} GSM` : null].filter(Boolean).join(' · ') || '—'), 80)}
      </text>
      {/* Area chip top-right of title */}
      <rect x={PAGE_W - 40 - 110} y="92" width="110" height="26" fill={FR.slate} rx="3" />
      <text x={PAGE_W - 40 - 55} y="110" textAnchor="middle" fontSize="11" fontWeight="bold" fill={FR.salt} letterSpacing="0.6">
        {esc(area).toUpperCase()}
      </text>

      {/* PHOTOS — 9:16 front + back, side-by-side hero */}
      <Photo x={40}  y={150} w={220} h={391} src={fabric.front_image_url} label="FRONT" />
      <Photo x={270} y={150} w={220} h={391} src={fabric.back_image_url}  label="BACK"  />

      {/* COLOR — big picked square in tech pack mode, grid in library mode */}
      {chosenColor ? (
        <g>
          <Swatch x={520} y={150} w={300} h={300} entry={chosenColor} picked />
          <text x={670} y={490} textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="32" fill={FR.slate}>
            {clamp(esc(chosenColor.label || 'Selected'), 24)}
          </text>
          {chosenColor.hex && (
            <text x={670} y={512} textAnchor="middle" fontSize="10" fill={FR.stone} fontFamily="ui-monospace, Menlo, monospace">
              {esc(chosenColor.hex)}
            </text>
          )}
          <text x={670} y={540} textAnchor="middle" fontSize="9" fill={FR.stone} letterSpacing="1.5">PICKED · {allColors.length} COLORWAYS AVAILABLE</text>
        </g>
      ) : (
        <g>
          {(() => {
            const cols = 6;
            const gap = 6;
            const colW = (300 - (cols - 1) * gap) / cols;
            const totalRows = 5;
            const rowH = (300 - (totalRows - 1) * gap) / totalRows;
            return Array.from({ length: totalRows }).flatMap((_, r) => (
              Array.from({ length: cols }).map((__, c) => {
                const idx = r * cols + c;
                const sw = allColors[idx];
                if (!sw) return null;
                const x = 520 + c * (colW + gap);
                const y = 150 + r * (rowH + gap);
                return <Swatch key={`${r}-${c}`} x={x} y={y} w={colW} h={rowH} entry={sw} picked={false} />;
              })
            ));
          })()}
          <text x={670} y={540} textAnchor="middle" fontSize="9" fill={FR.stone} letterSpacing="1.5">
            {allColors.length} COLORWAYS · LIBRARY VIEW
          </text>
        </g>
      )}

      {/* GARMENT PLACEMENT — small silhouette top-right */}
      <text x="850" y="166" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">PLACEMENT</text>
      <rect x="850" y="172" width="233" height="220" fill={FR.salt} stroke={FR.sand} strokeWidth="0.5" />
      {placementResolved
        ? <image href={placementResolved} x="850" y="172" width="233" height="220" preserveAspectRatio="xMidYMid meet" />
        : (
          <g>
            <g stroke={FR.slate} strokeWidth="1" fill="#fff">
              <path d="M 925 198 L 940 188 L 990 188 L 1005 198 L 1015 210 L 1010 220 L 998 218 L 998 380 L 935 380 L 935 218 L 923 220 L 918 210 Z" />
              <path d="M 953 188 Q 965 200 977 188" fill="none" />
            </g>
            <rect x="938" y="222" width="57" height="155" fill={FR.soil} opacity="0.30" />
          </g>
        )
      }
      {fabric.garment_placement_notes && (
        <text x="966" y="408" textAnchor="middle" fontSize="9" fill={FR.stone} fontStyle="italic">
          {clamp(esc(fabric.garment_placement_notes), 38)}
        </text>
      )}

      {/* RIBBING — knit only, small chip under placement */}
      {isKnit && fabric.ribbing_fabric_no && (
        <g>
          <text x="850" y="438" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">RIBBING</text>
          <rect x="850" y="444" width="84" height="84" fill={FR.salt} stroke={FR.sand} strokeWidth="0.5" />
          {ribImgResolved && (
            <image href={ribImgResolved} x="850.5" y="444.5" width="83" height="83" preserveAspectRatio="xMidYMid slice" />
          )}
          <text x="944" y="470" fontFamily="ui-monospace, Menlo, monospace" fontSize="11" fill={FR.slate} fontWeight="bold">
            {clamp(esc(fabric.ribbing_fabric_no), 16)}
          </text>
          <text x="944" y="486" fontSize="9" fill={FR.stone}>matched rib</text>
        </g>
      )}

      {/* MILL FINISHES — chip line with execution location label */}
      <text x="40" y="580" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">MILL FINISHES</text>
      {finishes.length === 0 ? (
        <text x="40" y="606" fontSize="11" fill={FR.stone} fontStyle="italic">— none specified</text>
      ) : (
        <g>
          {finishes.slice(0, 5).map((f, i) => {
            const badge = execBadge(f.executed_at);
            const xStart = 40 + i * 200;
            return (
              <g key={i}>
                <rect x={xStart} y={588} width={186} height={38} fill={badge.fill} rx="3" />
                <text x={xStart + 10} y={604} fontSize="11" fill={FR.slate}>{clamp(esc(f.name || 'Finish'), 22)}</text>
                <text x={xStart + 176} y={604} textAnchor="end" fontSize="9" fill={badge.stroke} fontFamily="ui-monospace, Menlo, monospace">
                  {f.delta_per_meter_cny ? `+¥${parseFloat(f.delta_per_meter_cny).toFixed(2)}` : ''}
                </text>
                <text x={xStart + 10} y={620} fontSize="8" fill={badge.stroke} fontFamily="ui-monospace, Menlo, monospace" letterSpacing="0.5">
                  {badge.label}
                </text>
              </g>
            );
          })}
          {finishes.length > 5 && (
            <text x={40 + 5 * 200 + 10} y={604} fontSize="10" fill={FR.stone} fontStyle="italic">
              +{finishes.length - 5} more
            </text>
          )}
        </g>
      )}

      {/* VENDOR + COST — clean horizontal strip at the bottom */}
      <line x1="40" y1="638" x2={PAGE_W - 40} y2="638" stroke={FR.sand} strokeWidth="0.5" />
      <text x="40" y="668" fontSize="9" fill={FR.stone} letterSpacing="0.4">VENDOR</text>
      <text x="40" y="690" fontSize="14" fill={FR.slate} fontWeight="bold">{clamp(esc(fabric.mill_id || '—'), 40)}</text>
      <text x="40" y="710" fontSize="10" fill={FR.stone}>
        {esc(fabric.composition || '—')} · {fabric.weight_gsm ? `${fabric.weight_gsm} GSM` : '—'}
      </text>

      <text x={PAGE_W - 40} y="668" textAnchor="end" fontSize="9" fill={FR.stone} letterSpacing="0.4">{costLabel.toUpperCase()}</text>
      <text x={PAGE_W - 40} y="708" textAnchor="end" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="44" fill={FR.soil}>
        ${costPerUnit ? costPerUnit.toFixed(2) : '0.00'}
      </text>
    </g>
  );
}

export default function FabricBOMPreview({
  fabric,
  chosenColor = null,
  chosenArea = null,
  chosenFinishes = null,
  yieldM = null,
  styleNumber = null,
  pageLabel = null,
}) {
  const styleInfo = '© 2026 Foreign Resource Co. — Confidential Tech Pack';
  const headerCode = styleNumber || fabric.code || '';
  const pageTag = pageLabel || 'BOM-F';
  return (
    <svg xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      preserveAspectRatio="xMidYMin meet"
      style={{ width: '100%', height: 'auto', background: FR.salt, boxShadow: '0 2px 14px rgba(0,0,0,0.10)', borderRadius: 6, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <rect x="0" y="0" width={PAGE_W} height={PAGE_H} fill={FR.salt} />
      <rect x="0" y="0" width={PAGE_W} height="70" fill={FR.slate} />
      <text x="40" y="28" fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="3">FOREIGN RESOURCE CO.</text>
      <text x="40" y="50" fontSize="8" fill={FR.sand} letterSpacing="2">BILL OF MATERIALS</text>
      <text x={PAGE_W / 2} y="44" textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="20" fill={FR.salt}>Fabrics</text>
      {headerCode && (
        <text x={PAGE_W - 40} y="28" textAnchor="end" fontSize="10" fontWeight="bold" fill={FR.salt} letterSpacing="2" fontFamily="ui-monospace, Menlo, monospace">{esc(headerCode)}</text>
      )}
      <text x={PAGE_W - 40} y="50" textAnchor="end" fontSize="8" fill={FR.sand} letterSpacing="2">PAGE {pageTag}</text>
      <rect x="0" y="70" width={PAGE_W} height="2" fill={FR.soil} />
      <PageBody fabric={fabric} chosenColor={chosenColor} chosenArea={chosenArea} chosenFinishes={chosenFinishes} yieldM={yieldM} />
      <text x="40" y="775" fontSize="9" fill={FR.stone}>{styleInfo}</text>
      <text x={PAGE_W - 40} y="775" textAnchor="end" fontSize="9" fill={FR.stone}>PAGE {pageTag}</text>
    </svg>
  );
}
