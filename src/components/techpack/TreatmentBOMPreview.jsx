// Live A4-landscape preview of the treatment BOM page. Mirrors
// FabricBOMPreview in structure and render contract.
//
// Overlay props (same pattern as FabricBOMPreview):
//   chosenColor  — { url?, label, hex } | null  (null = library mode)
//   styleNumber  — top-right code when rendered into a tech pack
//   pageLabel    — e.g. '18 / 24'

import { useEffect, useState } from 'react';
import { FR } from './techPackConstants';
import { TREATMENT_TYPE_LABEL } from '../../utils/treatmentLibrary';
import { getFRColor } from '../../utils/colorLibrary';
import { getAssetUrl, isLegacyDataUrl } from '../../utils/plmAssets';

const PAGE_W = 1123;
const PAGE_H = 794;

const esc = (s) => String(s ?? '');

function clamp(s, maxChars) {
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

function Photo({ x, y, w, h, src, label }) {
  const resolved = useResolved(src);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={FR.salt} stroke={FR.sand} strokeWidth="0.5" />
      {resolved
        ? <image href={resolved} x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} preserveAspectRatio="xMidYMid slice" />
        : <text x={x + w / 2} y={y + h / 2} textAnchor="middle" fontSize="10" fill={FR.stone} fontStyle="italic">No image</text>
      }
      <rect x={x} y={y + h - 18} width="68" height="18" fill={FR.slate} />
      <text x={x + 34} y={y + h - 5} textAnchor="middle" fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="2">{label}</text>
    </g>
  );
}

function PageBody({ treatment, chosenColor }) {
  const typeLabel = TREATMENT_TYPE_LABEL[treatment.type] || treatment.type || '';
  const baseColorEntry = treatment.base_color_id ? getFRColor(treatment.base_color_id) : null;
  const baseHex = baseColorEntry?.hex || FR.sand;
  const swatchResolved = useResolved(chosenColor?.url);

  return (
    <g>
      {/* Title */}
      <text x="40" y="118" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="32" fill={FR.slate}>
        {clamp(esc(treatment.name || 'Untitled treatment'), 48)}
      </text>
      {/* Type chip top-right */}
      <rect x={PAGE_W - 40 - 150} y="92" width="150" height="26" fill={FR.slate} rx="3" />
      <text x={PAGE_W - 40 - 75} y="110" textAnchor="middle" fontSize="11" fontWeight="bold" fill={FR.salt} letterSpacing="0.6">
        {esc(typeLabel).toUpperCase()}
      </text>

      {/* PHOTOS: swatch + on-garment sample, 9:16 side-by-side */}
      <Photo x={40}  y={150} w={220} h={391} src={treatment.swatch_image_url}  label="SWATCH" />
      <Photo x={270} y={150} w={220} h={391} src={treatment.sample_image_url}  label="SAMPLE" />

      {/* COLOR ZONE */}
      {chosenColor ? (
        <g>
          <rect x={520} y={150} width={300} height={300}
            fill={chosenColor.hex || FR.salt}
            stroke={FR.soil} strokeWidth="4" />
          {swatchResolved && (
            <image href={swatchResolved} x={521} y={151} width={298} height={298} preserveAspectRatio="xMidYMid slice" />
          )}
          <text x={670} y={490} textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="32" fill={FR.slate}>
            {clamp(esc(chosenColor.label || 'Selected'), 24)}
          </text>
          {chosenColor.hex && (
            <text x={670} y={512} textAnchor="middle" fontSize="10" fill={FR.stone} fontFamily="ui-monospace, Menlo, monospace">
              {esc(chosenColor.hex)}
            </text>
          )}
          <text x={670} y={540} textAnchor="middle" fontSize="9" fill={FR.stone} letterSpacing="1.5">PICKED · BASE COLOR</text>
        </g>
      ) : (
        <g>
          <rect x={520} y={150} width={300} height={140} fill={baseHex} stroke={FR.sand} strokeWidth="0.5" />
          <text x={670} y={248} textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="18" fill={FR.slate}>
            {esc(treatment.base_color_id || 'No base color')}
          </text>
          <text x={520} y={320} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">CHEMISTRY</text>
          <text x={520} y={336} fontSize="11" fill={treatment.chemistry ? FR.slate : FR.stone} fontStyle={treatment.chemistry ? 'normal' : 'italic'}>
            {esc(treatment.chemistry) || '— not specified'}
          </text>
          {treatment.shrinkage_expected_pct > 0 && (
            <text x={520} y={354} fontSize="10" fill={FR.stone}>
              {treatment.shrinkage_expected_pct}% shrinkage expected
            </text>
          )}
          {treatment.compatible_fabric_ids && treatment.compatible_fabric_ids.length > 0 && (
            <text x={520} y={374} fontSize="9" fill={FR.stone} letterSpacing="0.5">
              {esc(treatment.compatible_fabric_ids.slice(0, 4).join(', '))}
            </text>
          )}
          <text x={670} y={540} textAnchor="middle" fontSize="9" fill={FR.stone} letterSpacing="1.5">
            {esc(typeLabel).toUpperCase()} · LIBRARY VIEW
          </text>
        </g>
      )}

      {/* RIGHT ZONE: vendor + logistics */}
      <text x="850" y="166" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">VENDOR</text>
      <text x="850" y="184" fontSize="14" fill={FR.slate} fontWeight="bold">
        {clamp(esc(treatment.primary_vendor_id || '—'), 20)}
      </text>
      {treatment.lead_time_days > 0 && (
        <text x="850" y="202" fontSize="11" fill={FR.stone}>Lead {treatment.lead_time_days} days</text>
      )}
      {treatment.moq_units > 0 && (
        <text x="850" y="218" fontSize="11" fill={FR.stone}>MOQ {Number(treatment.moq_units).toLocaleString()} units</text>
      )}
      {treatment.notes ? (
        <>
          <text x="850" y="248" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">NOTES</text>
          <text x="850" y="264" fontSize="10" fill={FR.stone} fontStyle="italic">
            {clamp(esc(treatment.notes), 36)}
          </text>
        </>
      ) : null}

      {/* Separator */}
      <line x1="40" y1="580" x2={PAGE_W - 40} y2="580" stroke={FR.sand} strokeWidth="0.5" />

      {/* Compatible fabrics strip */}
      <text x="40" y="600" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">COMPATIBLE FABRICS</text>
      <text x="40" y="618" fontSize="11" fill={FR.slate}>
        {(treatment.compatible_fabric_ids || []).join(', ') || '—'}
      </text>

      {/* Bottom vendor + cost strip */}
      <line x1="40" y1="638" x2={PAGE_W - 40} y2="638" stroke={FR.sand} strokeWidth="0.5" />
      <text x="40" y="668" fontSize="9" fill={FR.stone} letterSpacing="0.4">VENDOR</text>
      <text x="40" y="690" fontSize="14" fill={FR.slate} fontWeight="bold">
        {clamp(esc(treatment.primary_vendor_id || '—'), 40)}
      </text>
      <text x="40" y="710" fontSize="10" fill={FR.stone}>
        {esc(typeLabel)}{treatment.shrinkage_expected_pct > 0 ? ` · ${treatment.shrinkage_expected_pct}% shrinkage expected` : ''}
      </text>

      <text x={PAGE_W - 40} y="668" textAnchor="end" fontSize="9" fill={FR.stone} letterSpacing="0.4">COST / UNIT</text>
      <text x={PAGE_W - 40} y="708" textAnchor="end" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="44" fill={FR.soil}>
        ${treatment.cost_per_unit_usd ? Number(treatment.cost_per_unit_usd).toFixed(2) : '0.00'}
      </text>
    </g>
  );
}

export default function TreatmentBOMPreview({
  treatment,
  chosenColor = null,
  styleNumber = null,
  pageLabel = null,
}) {
  const styleInfo = '© 2026 Foreign Resource Co. — Confidential Tech Pack';
  const headerCode = styleNumber || treatment.code || '';
  const pageTag = pageLabel || 'BOM-T';
  return (
    <svg xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      preserveAspectRatio="xMidYMin meet"
      style={{ width: '100%', height: 'auto', background: FR.salt, boxShadow: '0 2px 14px rgba(0,0,0,0.10)', borderRadius: 6, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <rect x="0" y="0" width={PAGE_W} height={PAGE_H} fill={FR.salt} />
      <rect x="0" y="0" width={PAGE_W} height="70" fill={FR.slate} />
      <text x="40" y="28" fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="3">FOREIGN RESOURCE CO.</text>
      <text x="40" y="50" fontSize="8" fill={FR.sand} letterSpacing="2">BILL OF MATERIALS</text>
      <text x={PAGE_W / 2} y="44" textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="20" fill={FR.salt}>Treatments</text>
      {headerCode && (
        <text x={PAGE_W - 40} y="28" textAnchor="end" fontSize="10" fontWeight="bold" fill={FR.salt} letterSpacing="2" fontFamily="ui-monospace, Menlo, monospace">{esc(headerCode)}</text>
      )}
      <text x={PAGE_W - 40} y="50" textAnchor="end" fontSize="8" fill={FR.sand} letterSpacing="2">PAGE {pageTag}</text>
      <rect x="0" y="70" width={PAGE_W} height="2" fill={FR.soil} />
      <PageBody treatment={treatment} chosenColor={chosenColor} />
      <text x="40" y="775" fontSize="9" fill={FR.stone}>{styleInfo}</text>
      <text x={PAGE_W - 40} y="775" textAnchor="end" fontSize="9" fill={FR.stone}>PAGE {pageTag}</text>
    </svg>
  );
}
