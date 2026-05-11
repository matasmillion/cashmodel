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
import { getVendor } from '../../utils/vendorLibrary';

const PAGE_W = 1123;
const PAGE_H = 794;

const esc = (s) => String(s ?? '');

function clamp(s, maxChars) {
  if (s.length <= maxChars) return s;
  return s.slice(0, Math.max(1, maxChars - 1)) + '…';
}

// Wrap a string into N lines of approx maxCharsPerLine each. Splits on
// whitespace; the final line is hard-truncated with an ellipsis if the
// text would exceed the line budget. Lets the SVG card show fabric notes
// without bringing in foreignObject.
function wrapText(text, maxCharsPerLine, maxLines) {
  if (!text) return [];
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let curr = '';
  for (const w of words) {
    const next = curr ? `${curr} ${w}` : w;
    if (next.length > maxCharsPerLine) {
      if (curr) lines.push(curr);
      curr = w;
      if (lines.length >= maxLines) break;
    } else {
      curr = next;
    }
  }
  if (curr && lines.length < maxLines) lines.push(curr);
  if (lines.length === maxLines) {
    const used = lines.join(' ').split(/\s+/).length;
    if (used < words.length) {
      lines[lines.length - 1] = clamp(lines[lines.length - 1] + '…', maxCharsPerLine);
    }
  }
  return lines;
}

// Pull contact details for the named vendor synchronously from the
// localStorage-backed vendor library. Returns null when the vendor isn't
// in the store (the picker tags those as "Not in library" upstream).
function vendorContact(name) {
  if (!name) return null;
  const v = getVendor(name);
  if (!v || !v._hasRecord) return null;
  return {
    email: v.email || '',
    phone: v.phone || '',
    primaryContact: v.primaryContact || '',
  };
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

function PageBody(props) { return <FabricBOMPreviewBody {...props} />; }

// Body-only renderer (no <svg> wrapper, no header/footer chrome). Used by
// TechPackPagePreview's PageFabrics so the tech pack live preview and the
// library card render through one component. The wrapper above adds the
// salt background + slate header + soil divider for the standalone view.
export function FabricBOMPreviewBody({ fabric, chosenColor, chosenArea, chosenFinishes, yieldM }) {
  const allColors = fabric.color_card_images || [];
  const finishes = chosenFinishes != null ? chosenFinishes : (fabric.mill_finishes || []);
  const area = chosenArea || fabric.default_garment_area || 'Body';
  const isKnit = (fabric.category || 'knit') === 'knit';
  const placementResolved = useResolved(fabric.garment_placement_image_url);
  const ribImgResolved = useResolved(fabric.ribbing_image_url);

  // Cost / unit headline: base + finishes × yield.
  // Mirrors fabricUnitCost() fallback chain so preview matches left-column cost.
  const _d = fabric.data || fabric;
  const _gsm = parseFloat(fabric.weight_gsm ?? _d?.weight_gsm) || 0;
  const _widthCm = parseFloat(fabric.width_cm ?? _d?.width_cm) || 0;
  const _kgUsd = parseFloat(fabric.price_per_kg_usd ?? _d?.price_per_kg_usd) || 0;
  const _fromKg = (_kgUsd && _gsm && _widthCm) ? _kgUsd * (_gsm * _widthCm / 100000) : 0;
  const baseUsd = parseFloat(fabric.price_per_meter_usd) || parseFloat(_d?.price_per_meter_usd) || _fromKg || 0;
  const finishesUsd = finishes.reduce((s, f) => s + (parseFloat(f.delta_per_meter_usd) || 0), 0);
  const allInUsd = baseUsd + finishesUsd;
  const m = parseFloat(yieldM || 0) || 0;
  const costPerUnit = m > 0 ? allInUsd * m : allInUsd;
  const costLabel = m > 0 ? 'Cost / unit' : 'Cost / m';

  // Resolve color selection number (1-based index in the colorway list).
  // When in library mode (no chosen color) we still show the grid.
  const colorIdx = chosenColor
    ? allColors.findIndex(c => c && (
        (chosenColor.url && c.url === chosenColor.url) ||
        (chosenColor.hex && c.hex === chosenColor.hex && c.label === chosenColor.label) ||
        (chosenColor.label && c.label === chosenColor.label)
      ))
    : -1;
  const colorNum = colorIdx >= 0 ? String(colorIdx + 1).padStart(2, '0') : '01';

  // Vendor contact for the main mill + each secondary facility on finishes.
  const mainVendor = vendorContact(fabric.mill_id);

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

      {/* ─── HERO ROW: Photos + Color Selection + Placement ─────────────── */}

      {/* PHOTOS — front + back, shorter than before to make room below */}
      <Photo x={40}  y={150} w={220} h={260} src={fabric.front_image_url} label="FRONT" />
      <Photo x={270} y={150} w={220} h={260} src={fabric.back_image_url}  label="BACK"  />

      {/* COLOR SELECTION — smaller swatch with explicit number label */}
      <text x="520" y="160" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">
        COLOR SELECTION {chosenColor ? colorNum : ''}
      </text>
      {chosenColor ? (
        <g>
          <Swatch x={520} y={170} w={180} h={180} entry={chosenColor} picked />
          <text x={610} y={378} textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="22" fill={FR.slate}>
            {clamp(esc(chosenColor.label || 'Selected'), 22)}
          </text>
        </g>
      ) : (
        <g>
          {(() => {
            const cols = 4;
            const gap = 4;
            const colW = (180 - (cols - 1) * gap) / cols;
            const totalRows = 4;
            const rowH = (180 - (totalRows - 1) * gap) / totalRows;
            return Array.from({ length: totalRows }).flatMap((_, r) => (
              Array.from({ length: cols }).map((__, c) => {
                const idx = r * cols + c;
                const sw = allColors[idx];
                if (!sw) return null;
                const x = 520 + c * (colW + gap);
                const y = 170 + r * (rowH + gap);
                return <Swatch key={`${r}-${c}`} x={x} y={y} w={colW} h={rowH} entry={sw} picked={false} />;
              })
            ));
          })()}
          <text x={610} y={378} textAnchor="middle" fontSize="9" fill={FR.stone} letterSpacing="1.2">
            {allColors.length} COLORWAYS
          </text>
        </g>
      )}

      {/* PLACEMENT — silhouette in the right column */}
      <text x="750" y="160" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">PLACEMENT</text>
      <rect x="750" y="170" width="220" height="220" fill={FR.salt} stroke={FR.sand} strokeWidth="0.5" />
      {placementResolved
        ? <image href={placementResolved} x="750" y="170" width="220" height="220" preserveAspectRatio="xMidYMid meet" />
        : (
          <g>
            <g stroke={FR.slate} strokeWidth="1" fill="#fff">
              <path d="M 825 196 L 840 186 L 890 186 L 905 196 L 915 208 L 910 218 L 898 216 L 898 378 L 835 378 L 835 216 L 823 218 L 818 208 Z" />
              <path d="M 853 186 Q 865 198 877 186" fill="none" />
            </g>
            <rect x="838" y="220" width="57" height="155" fill={FR.soil} opacity="0.30" />
          </g>
        )
      }
      {fabric.garment_placement_notes && (
        <text x="860" y="408" textAnchor="middle" fontSize="9" fill={FR.stone} fontStyle="italic">
          {clamp(esc(fabric.garment_placement_notes), 38)}
        </text>
      )}

      {/* RIBBING — knit only, tucked in the far-right column */}
      {isKnit && fabric.ribbing_fabric_no && (
        <g>
          <text x="990" y="160" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">RIBBING</text>
          <rect x="990" y="170" width="90" height="90" fill={FR.salt} stroke={FR.sand} strokeWidth="0.5" />
          {ribImgResolved && (
            <image href={ribImgResolved} x="990.5" y="170.5" width="89" height="89" preserveAspectRatio="xMidYMid slice" />
          )}
          <text x="990" y="280" fontFamily="ui-monospace, Menlo, monospace" fontSize="10" fill={FR.slate} fontWeight="bold">
            {clamp(esc(fabric.ribbing_fabric_no), 14)}
          </text>
          <text x="990" y="294" fontSize="8" fill={FR.stone}>matched rib</text>
        </g>
      )}

      {/* ─── NOTES SECTION ──────────────────────────────────────────────── */}
      <text x="40" y="438" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">FABRIC NOTES</text>
      <rect x="40" y="446" width={PAGE_W - 80} height="46" fill={FR.salt} stroke={FR.sand} strokeWidth="0.5" rx="3" />
      {(() => {
        const noteText = esc(fabric.notes || '').trim();
        if (!noteText) {
          return (
            <text x="52" y="473" fontSize="10" fill={FR.stone} fontStyle="italic">
              — no notes
            </text>
          );
        }
        const lines = wrapText(noteText, 130, 2);
        return lines.map((line, i) => (
          <text key={i} x="52" y={465 + i * 14} fontSize="10" fill={FR.slate}>
            {line}
          </text>
        ));
      })()}

      {/* ─── FABRIC FINISHES — clean detail rows with contact info ────── */}
      <text x="40" y="514" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">FABRIC FINISHES</text>
      {finishes.length === 0 ? (
        <text x="40" y="538" fontSize="10" fill={FR.stone} fontStyle="italic">— none specified</text>
      ) : (
        <g>
          {finishes.slice(0, 3).map((f, i) => {
            const badge = execBadge(f.executed_at);
            const isSecondary = f.executed_at === 'secondary';
            const facilityName = isSecondary ? (f.vendor_id || '') : (fabric.mill_id || '');
            const facilityContact = vendorContact(facilityName);
            const rowY = 524 + i * 38;
            const cny = f.delta_per_meter_cny ? `+¥${parseFloat(f.delta_per_meter_cny).toFixed(2)}` : '';
            const usd = f.delta_per_meter_usd ? `+$${parseFloat(f.delta_per_meter_usd).toFixed(2)}` : '';
            const priceLabel = [cny, usd].filter(Boolean).join(' · ');
            return (
              <g key={i}>
                {/* Left chip: name + where + price (300 wide) */}
                <rect x={40} y={rowY} width={300} height={34} fill={badge.fill} rx="3" />
                <text x={52} y={rowY + 15} fontSize="11" fontWeight="bold" fill={FR.slate}>
                  {clamp(esc(f.name || 'Finish'), 32)}
                </text>
                <text x={52} y={rowY + 28} fontSize="8" fill={badge.stroke} fontFamily="ui-monospace, Menlo, monospace" letterSpacing="0.4">
                  {badge.label}{priceLabel ? `  ·  ${priceLabel}` : ''}
                </text>
                {/* Right details box: facility + contact (760 wide) */}
                <rect x={350} y={rowY} width={PAGE_W - 40 - 350} height={34} fill="#fff" stroke={FR.sand} strokeWidth="0.5" rx="3" />
                <text x={362} y={rowY + 14} fontSize="8" fill={FR.stone} letterSpacing="0.4">FACILITY</text>
                <text x={362} y={rowY + 28} fontSize="11" fontWeight="bold" fill={FR.slate}>
                  {clamp(esc(facilityName || '— pick facility'), 38)}
                </text>
                <text x={PAGE_W - 52} y={rowY + 14} textAnchor="end" fontSize="8" fill={FR.stone} letterSpacing="0.4">CONTACT</text>
                <text x={PAGE_W - 52} y={rowY + 28} textAnchor="end" fontSize="10" fill={FR.slate} fontFamily="ui-monospace, Menlo, monospace">
                  {facilityContact
                    ? clamp([facilityContact.email, facilityContact.phone].filter(Boolean).join(' · ') || '—', 56)
                    : '— no contact on file'}
                </text>
              </g>
            );
          })}
          {finishes.length > 3 && (
            <text x={40} y={524 + 3 * 38 + 12} fontSize="10" fill={FR.stone} fontStyle="italic">
              +{finishes.length - 3} more finishes
            </text>
          )}
        </g>
      )}

      {/* ─── VENDOR + COST strip at the bottom ──────────────────────── */}
      <line x1="40" y1="666" x2={PAGE_W - 40} y2="666" stroke={FR.sand} strokeWidth="0.5" />
      <text x="40" y="688" fontSize="9" fill={FR.stone} letterSpacing="0.4">MAIN FABRIC VENDOR</text>
      <text x="40" y="710" fontSize="14" fill={FR.slate} fontWeight="bold">{clamp(esc(fabric.mill_id || '—'), 40)}</text>
      <text x="40" y="726" fontSize="10" fill={FR.stone}>
        {esc(fabric.composition || '—')} · {fabric.weight_gsm ? `${fabric.weight_gsm} GSM` : '—'}
      </text>
      <text x="40" y="744" fontSize="10" fill={FR.slate} fontFamily="ui-monospace, Menlo, monospace">
        {mainVendor
          ? clamp([mainVendor.primaryContact, mainVendor.email, mainVendor.phone].filter(Boolean).join(' · ') || '— no contact on file', 86)
          : '— no contact on file'}
      </text>

      <text x={PAGE_W - 40} y="688" textAnchor="end" fontSize="9" fill={FR.stone} letterSpacing="0.4">{costLabel.toUpperCase()}</text>
      <text x={PAGE_W - 40} y="738" textAnchor="end" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="44" fill={FR.soil}>
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
