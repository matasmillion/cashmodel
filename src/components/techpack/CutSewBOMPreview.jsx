// Live A4-landscape preview of the Cut & Sew BOM page.
// Matches the same visual grammar as FabricBOMPreview and
// TreatmentBOMPreview: cover photo on the left, spec table in the
// centre, grade rule + notes on the right, cost / key-ref strip at
// the bottom.
//
// Props:
//   block       — CutSew record from cutSewStore
//   styleNumber — top-right code when rendered inside a tech pack
//   pageLabel   — e.g. '04 / 24'

import { useEffect, useState } from 'react';
import { FR } from './techPackConstants';
import { CUT_SEW_CATEGORY_LABEL } from '../../utils/cutSewLibrary';
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

function Photo({ x, y, w, h, src }) {
  const resolved = useResolved(src);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={FR.salt} stroke={FR.sand} strokeWidth="0.5" />
      {resolved
        ? <image href={resolved} x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} preserveAspectRatio="xMidYMid slice" />
        : (
          // Silhouette placeholder — generic garment ghost
          <g>
            <g stroke={FR.sand} strokeWidth="1.5" fill="none">
              <path d={`M ${x + w * 0.35} ${y + h * 0.12} L ${x + w * 0.2} ${y + h * 0.20} L ${x + w * 0.1} ${y + h * 0.36} L ${x + w * 0.22} ${y + h * 0.40} L ${x + w * 0.22} ${y + h * 0.85} L ${x + w * 0.78} ${y + h * 0.85} L ${x + w * 0.78} ${y + h * 0.40} L ${x + w * 0.90} ${y + h * 0.36} L ${x + w * 0.80} ${y + h * 0.20} L ${x + w * 0.65} ${y + h * 0.12} Q ${x + w * 0.5} ${y + h * 0.19} ${x + w * 0.35} ${y + h * 0.12} Z`} />
            </g>
            <text x={x + w / 2} y={y + h * 0.95} textAnchor="middle" fontSize="9" fill={FR.stone} fontStyle="italic">No cover</text>
          </g>
        )
      }
      <rect x={x} y={y + h - 18} width={w} height={18} fill="rgba(58,58,58,0.45)" />
      <text x={x + w / 2} y={y + h - 5} textAnchor="middle" fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="2">BLOCK</text>
    </g>
  );
}

function SpecRow({ x, y, label, value, mono }) {
  return (
    <g>
      <text x={x} y={y} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">{label}</text>
      <text x={x} y={y + 16} fontSize="13" fill={FR.slate}
        fontFamily={mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined}>
        {clamp(esc(value || '—'), 50)}
      </text>
    </g>
  );
}

function SizeChips({ x, y, sizes }) {
  const CHIP_W = 32;
  const GAP = 8;
  return (
    <g>
      {(sizes || []).slice(0, 10).map((s, i) => (
        <g key={s + i}>
          <rect x={x + i * (CHIP_W + GAP)} y={y} width={CHIP_W} height={22} rx="3"
            fill={FR.sand} stroke={FR.stone} strokeWidth="0.4" />
          <text x={x + i * (CHIP_W + GAP) + CHIP_W / 2} y={y + 15}
            textAnchor="middle" fontSize="11" fontWeight="600" fill={FR.slate}>
            {s}
          </text>
        </g>
      ))}
    </g>
  );
}

// Wrap notes into lines of at most `maxChars` characters. Returns an
// array of strings, up to `maxLines` lines.
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
  if (lines.length === maxLines && words.length > lines.join(' ').split(/\s+/).length) {
    lines[maxLines - 1] = clamp(lines[maxLines - 1], maxChars);
  }
  return lines;
}

function PageBody({ block }) {
  const categoryLabel = CUT_SEW_CATEGORY_LABEL[block.category] || block.category || '';
  const sizes = block.sizes || [];
  const gradeRule = block.grade_rule || '';
  const ease = block.ease_chest_cm != null ? `${block.ease_chest_cm} cm` : '—';
  const drop = block.drop_cm != null ? `${block.drop_cm} cm` : '—';
  const seam = block.seam_allowance_cm != null ? `${block.seam_allowance_cm} cm` : '—';
  const noteLines = wrapText(block.notes || '', 52, 7);

  return (
    <g>
      {/* Title */}
      <text x="40" y="118" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="32" fill={FR.slate}>
        {clamp(esc(block.name || 'Untitled cut & sew'), 44)}
      </text>
      {/* Category chip */}
      <rect x={PAGE_W - 40 - 130} y="92" width="130" height="26" fill={FR.slate} rx="3" />
      <text x={PAGE_W - 40 - 65} y="110" textAnchor="middle" fontSize="11" fontWeight="bold" fill={FR.salt} letterSpacing="0.6">
        {categoryLabel.toUpperCase()}
      </text>

      {/* COVER PHOTO — left column */}
      <Photo x={40} y={150} w={220} h={391} src={block.cover_image} />

      {/* SPEC TABLE — centre column */}
      {/* Sizes */}
      <text x="280" y="166" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">SIZE SET</text>
      <SizeChips x={280} y={175} sizes={sizes} />

      {/* Grade rule */}
      <text x="280" y="228" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">GRADE RULE</text>
      <text x="280" y="246" fontSize="12" fill={FR.slate}>
        {clamp(esc(gradeRule || '—'), 52)}
      </text>

      {/* Measurements grid */}
      <text x="280" y="286" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">MEASUREMENTS</text>
      <line x1="280" y1="292" x2="690" y2="292" stroke={FR.sand} strokeWidth="0.5" />

      {/* Ease */}
      <rect x="280" y="300" width="120" height="60" fill="#fff" stroke={FR.sand} strokeWidth="0.5" rx="2" />
      <text x="290" y="318" fontSize="8" fill={FR.stone} letterSpacing="0.5">EASE AT CHEST</text>
      <text x="340" y="348" textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="26" fill={FR.slate}>{ease}</text>

      {/* Drop */}
      <rect x="412" y="300" width="120" height="60" fill="#fff" stroke={FR.sand} strokeWidth="0.5" rx="2" />
      <text x="422" y="318" fontSize="8" fill={FR.stone} letterSpacing="0.5">DROP</text>
      <text x="472" y="348" textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="26" fill={FR.slate}>{drop}</text>

      {/* Seam allowance */}
      <rect x="544" y="300" width="146" height="60" fill="#fff" stroke={FR.sand} strokeWidth="0.5" rx="2" />
      <text x="554" y="318" fontSize="8" fill={FR.stone} letterSpacing="0.5">SEAM ALLOWANCE</text>
      <text x="617" y="348" textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="26" fill={FR.slate}>{seam}</text>

      {/* Version */}
      <SpecRow x={280} y={400} label="VERSION" value={block.version || 'v1.0'} mono />

      {/* CAD file */}
      {block.cad_file_url && (
        <SpecRow x={280} y={444} label="CAD FILE" value={block.cad_file_url} mono />
      )}

      {/* NOTES — right column */}
      <text x="730" y="166" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">CONSTRUCTION NOTES</text>
      <line x1="730" y1="172" x2={PAGE_W - 40} y2="172" stroke={FR.sand} strokeWidth="0.5" />
      {noteLines.length > 0
        ? noteLines.map((line, i) => (
          <text key={i} x="730" y={190 + i * 18} fontSize="11" fill={FR.slate} fontStyle={i === 0 ? 'normal' : 'normal'}>
            {line}
          </text>
        ))
        : <text x="730" y="190" fontSize="11" fill={FR.stone} fontStyle="italic">— none</text>
      }

      {/* Base block ref + separator */}
      <line x1="40" y1="570" x2={PAGE_W - 40} y2="570" stroke={FR.sand} strokeWidth="0.5" />
      <text x="40" y="592" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">BASE BLOCK</text>
      <text x="40" y="612" fontSize="14" fill={FR.slate} fontWeight="bold" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
        {clamp(esc(block.base_block || '—'), 36)}
      </text>

      {/* Sizes count + status */}
      <text x="40" y="638" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">SIZE RANGE</text>
      <text x="40" y="656" fontSize="12" fill={FR.slate}>
        {sizes.length > 0 ? sizes.join(' · ') : '—'}
      </text>

      {/* Bottom bar */}
      <line x1="40" y1="680" x2={PAGE_W - 40} y2="680" stroke={FR.sand} strokeWidth="0.5" />
      <text x="40" y="710" fontSize="9" fill={FR.stone} letterSpacing="0.4">CODE</text>
      <text x="40" y="730" fontSize="14" fill={FR.slate} fontWeight="bold" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
        {clamp(esc(block.code || '—'), 20)}
      </text>

      <text x={PAGE_W - 40} y="710" textAnchor="end" fontSize="9" fill={FR.stone} letterSpacing="0.4">APPROVED SIZES</text>
      <text x={PAGE_W - 40} y="730" textAnchor="end" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="40" fill={FR.soil}>
        {sizes.length}
      </text>
    </g>
  );
}

export default function CutSewBOMPreview({
  block,
  styleNumber = null,
  pageLabel = null,
}) {
  const headerCode = styleNumber || block.code || '';
  const pageTag = pageLabel || 'BOM-CS';
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
      <text x={PAGE_W / 2} y="44" textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="20" fill={FR.salt}>Cut &amp; Sew</text>
      {headerCode && (
        <text x={PAGE_W - 40} y="28" textAnchor="end" fontSize="10" fontWeight="bold" fill={FR.salt} letterSpacing="2" fontFamily="ui-monospace, Menlo, monospace">{esc(headerCode)}</text>
      )}
      <text x={PAGE_W - 40} y="50" textAnchor="end" fontSize="8" fill={FR.sand} letterSpacing="2">PAGE {pageTag}</text>
      <rect x="0" y="70" width={PAGE_W} height="2" fill={FR.soil} />
      <PageBody block={block} />
      <text x="40" y="775" fontSize="9" fill={FR.stone}>{styleInfo}</text>
      <text x={PAGE_W - 40} y="775" textAnchor="end" fontSize="9" fill={FR.stone}>PAGE {pageTag}</text>
    </svg>
  );
}
