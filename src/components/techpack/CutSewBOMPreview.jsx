// Multi-page A4-landscape preview for the Cut & Sew library atom.
// Each exported body component corresponds to one tech pack page (pages 07-13).
// The default export renders one page at a time, switching via the `activePage`
// prop so the builder's right-column preview stays synced to the active editor tab.
//
// Exported body components (no SVG wrapper, no header/footer chrome) are
// imported by TechPackPagePreview to render the live tech pack pages.
//
// Props on default export:
//   block       — CutSew record from cutSewStore
//   activePage  — 'identity'|'flatlay'|'callouts1'|'callouts2'|'stitching'|'pattern'|'pom'
//   styleNumber — top-right code when rendered inside a tech pack
//   pageLabel   — e.g. '07 / 24'

import { useEffect, useState } from 'react';
import { FR } from './techPackConstants';
import { CUT_SEW_CATEGORY_LABEL } from '../../utils/cutSewLibrary';
import { getAssetUrl, isLegacyDataUrl } from '../../utils/plmAssets';

const PAGE_W = 1123;
const PAGE_H = 794;

const esc = (s) => String(s ?? '');

function clamp(s, maxChars) {
  if (!s) return '';
  s = String(s);
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

function Img({ x, y, w, h, src, label, noLabel }) {
  const resolved = useResolved(src);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={FR.salt} stroke={FR.sand} strokeWidth="0.5" />
      {resolved
        ? <image href={resolved} x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} preserveAspectRatio="xMidYMid slice" />
        : <text x={x + w / 2} y={y + h / 2} textAnchor="middle" fontSize="10" fill={FR.stone} fontStyle="italic">{label || 'No image'}</text>
      }
      {!noLabel && label && (
        <>
          <rect x={x} y={y + h - 18} width={Math.min(w, 60)} height={18} fill="rgba(58,58,58,0.45)" />
          <text x={x + Math.min(w, 60) / 2} y={y + h - 5} textAnchor="middle" fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="2">{label.toUpperCase()}</text>
        </>
      )}
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
          <rect x={x + i * (CHIP_W + GAP)} y={y} width={CHIP_W} height={22} rx="3" fill={FR.sand} stroke={FR.stone} strokeWidth="0.4" />
          <text x={x + i * (CHIP_W + GAP) + CHIP_W / 2} y={y + 15} textAnchor="middle" fontSize="11" fontWeight="600" fill={FR.slate}>{s}</text>
        </g>
      ))}
    </g>
  );
}

function wrapText(text, maxChars, maxLines) {
  if (!text) return [];
  const words = String(text).split(/\s+/);
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

// ── Page 07: Identity / Block Summary ────────────────────────────────────────
export function CutSewIdentityPageBody({ block }) {
  const categoryLabel = CUT_SEW_CATEGORY_LABEL[block.category] || block.category || '';
  const sizes = block.sizes || [];
  const ease = block.ease_chest_cm != null ? `${block.ease_chest_cm} cm` : '—';
  const drop = block.drop_cm != null ? `${block.drop_cm} cm` : '—';
  const seam = block.seam_allowance_cm != null ? `${block.seam_allowance_cm} cm` : '—';
  const noteLines = wrapText(block.notes || '', 52, 6);

  return (
    <g>
      <text x="40" y="118" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="32" fill={FR.slate}>
        {clamp(esc(block.name || 'Untitled cut & sew'), 44)}
      </text>
      <rect x={PAGE_W - 40 - 130} y="92" width="130" height="26" fill={FR.slate} rx="3" />
      <text x={PAGE_W - 40 - 65} y="110" textAnchor="middle" fontSize="11" fontWeight="bold" fill={FR.salt} letterSpacing="0.6">
        {categoryLabel.toUpperCase()}
      </text>

      <Img x={40} y={150} w={220} h={391} src={block.cover_image} label="BLOCK" />

      <text x="280" y="166" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">SIZE SET</text>
      <SizeChips x={280} y={175} sizes={sizes} />

      <text x="280" y="228" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">GRADE RULE</text>
      <text x="280" y="246" fontSize="12" fill={FR.slate}>{clamp(esc(block.grade_rule || '—'), 52)}</text>

      <text x="280" y="286" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">MEASUREMENTS</text>
      <line x1="280" y1="292" x2="690" y2="292" stroke={FR.sand} strokeWidth="0.5" />

      <rect x="280" y="300" width="120" height="60" fill="#fff" stroke={FR.sand} strokeWidth="0.5" rx="2" />
      <text x="290" y="318" fontSize="8" fill={FR.stone} letterSpacing="0.5">EASE AT CHEST</text>
      <text x="340" y="348" textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="26" fill={FR.slate}>{ease}</text>

      <rect x="412" y="300" width="120" height="60" fill="#fff" stroke={FR.sand} strokeWidth="0.5" rx="2" />
      <text x="422" y="318" fontSize="8" fill={FR.stone} letterSpacing="0.5">DROP</text>
      <text x="472" y="348" textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="26" fill={FR.slate}>{drop}</text>

      <rect x="544" y="300" width="146" height="60" fill="#fff" stroke={FR.sand} strokeWidth="0.5" rx="2" />
      <text x="554" y="318" fontSize="8" fill={FR.stone} letterSpacing="0.5">SEAM ALLOWANCE</text>
      <text x="617" y="348" textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="26" fill={FR.slate}>{seam}</text>

      <text x="280" y="400" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">VERSION</text>
      <text x="280" y="418" fontSize="13" fill={FR.slate} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
        {clamp(esc(block.version || 'v1.0'), 20)}
      </text>

      {block.cad_file_url && (
        <>
          <text x="280" y="444" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">CAD FILE</text>
          <text x="280" y="462" fontSize="11" fill={FR.slate} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
            {clamp(esc(block.cad_file_url), 50)}
          </text>
        </>
      )}

      <text x="730" y="166" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">CONSTRUCTION NOTES</text>
      <line x1="730" y1="172" x2={PAGE_W - 40} y2="172" stroke={FR.sand} strokeWidth="0.5" />
      {noteLines.length > 0
        ? noteLines.map((line, i) => (
          <text key={i} x="730" y={190 + i * 18} fontSize="11" fill={FR.slate}>{line}</text>
        ))
        : <text x="730" y="190" fontSize="11" fill={FR.stone} fontStyle="italic">— none</text>
      }

      <line x1="40" y1="570" x2={PAGE_W - 40} y2="570" stroke={FR.sand} strokeWidth="0.5" />
      <text x="40" y="592" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">BASE BLOCK</text>
      <text x="40" y="612" fontSize="14" fill={FR.slate} fontWeight="bold" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
        {clamp(esc(block.base_block || '—'), 36)}
      </text>

      <text x="40" y="638" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">SIZE RANGE</text>
      <text x="40" y="656" fontSize="12" fill={FR.slate}>{sizes.length > 0 ? sizes.join(' · ') : '—'}</text>

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

// ── Page 07 (tech pack): Flat Lay ─────────────────────────────────────────────
export function CutSewFlatLayPageBody({ block, images }) {
  // Support both the library atom (block.*) and the tech pack images[] array
  const frontSrc = images?.find?.(img => img?.slot === 'flatlay-front')?.data
    || images?.find?.(img => img?.slot === 'flatlay-front')?.path
    || block?.flat_lay_front_url || '';
  const backSrc  = images?.find?.(img => img?.slot === 'flatlay-back')?.data
    || images?.find?.(img => img?.slot === 'flatlay-back')?.path
    || block?.flat_lay_back_url || '';
  const notes = block?.flatLayNotes || block?.flat_lay_notes || '';

  return (
    <g>
      <text x="40" y="118" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="32" fill={FR.slate}>
        {clamp(esc(block?.name || 'Flat Lay'), 44)}
      </text>

      {/* Front flat lay — large portrait, left */}
      <Img x={40} y={148} w={490} h={560} src={frontSrc} label="FRONT" />

      {/* Back flat lay — large portrait, right */}
      <Img x={550} y={148} w={490} h={560} src={backSrc} label="BACK" />

      {/* Notes strip at bottom */}
      {notes && (
        <>
          <line x1="40" y1="720" x2={PAGE_W - 40} y2="720" stroke={FR.sand} strokeWidth="0.5" />
          {wrapText(notes, 140, 2).map((line, i) => (
            <text key={i} x="40" y={738 + i * 16} fontSize="10" fill={FR.slate}>{line}</text>
          ))}
        </>
      )}
    </g>
  );
}

// ── Call Outs page body (shared for pages 08 and 09) ────────────────────────
export function CutSewCallOutsPageBody({ block, images, page }) {
  const pageNum = page === 2 ? 2 : 1;
  const refField = pageNum === 1 ? 'callout_ref_page1_url' : 'callout_ref_page2_url';
  const detailField = pageNum === 1 ? 'callout_details_page1' : 'callout_details_page2';
  const imageSlotRef = pageNum === 1 ? 'sketch-callout-page1' : 'sketch-callout-page2';

  const refSrc = images?.find?.(img => img?.slot === imageSlotRef)?.data
    || images?.find?.(img => img?.slot === imageSlotRef)?.path
    || block?.[refField] || '';

  const details = (block?.[detailField] || []).slice(0, 4);

  // Grid layout: ref image (left, 2:3) + 2×2 detail cards (right)
  const REF_W = 220;
  const REF_H = 564;
  const CARD_W = (PAGE_W - 40 - REF_W - 32 - 40) / 2;
  const CARD_H = (REF_H - 8) / 2;
  const LEFT_X = 40;
  const RIGHT_X = LEFT_X + REF_W + 32;

  return (
    <g>
      <text x="40" y="118" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="32" fill={FR.slate}>
        Call Outs — Page {pageNum}
      </text>

      {/* Reference image */}
      <Img x={LEFT_X} y={140} w={REF_W} h={REF_H} src={refSrc} label="REF" />

      {/* 2×2 detail cards */}
      {[0, 1, 2, 3].map(i => {
        const row = Math.floor(i / 2);
        const col = i % 2;
        const x = RIGHT_X + col * (CARD_W + 8);
        const y = 140 + row * (CARD_H + 8);
        const entry = details[i] || { num: (pageNum - 1) * 4 + i + 1, title: '', description: '', image_url: '' };
        const slotKey = `construction-detail-${entry.num}`;
        const imgSrc = images?.find?.(img => img?.slot === slotKey)?.data
          || images?.find?.(img => img?.slot === slotKey)?.path
          || entry.image_url || '';
        const IMG_H = CARD_H * 0.5;

        return (
          <g key={i}>
            <rect x={x} y={y} width={CARD_W} height={CARD_H} fill="#fff" stroke={FR.sand} strokeWidth="0.5" rx="2" />
            {/* Detail image top half */}
            <Img x={x} y={y} w={CARD_W} h={IMG_H} src={imgSrc} noLabel />
            {/* Red number circle */}
            <circle cx={x + 20} cy={y + IMG_H + 18} r="11" fill="#A32D2D" />
            <text x={x + 20} y={y + IMG_H + 23} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#fff">{entry.num}</text>
            {/* Title */}
            <text x={x + 36} y={y + IMG_H + 22} fontSize="12" fontWeight="600" fill={FR.slate}>{clamp(esc(entry.title), 30)}</text>
            {/* Description */}
            {wrapText(entry.description, 48, 3).map((line, li) => (
              <text key={li} x={x + 10} y={y + IMG_H + 44 + li * 14} fontSize="10" fill={FR.stone}>{line}</text>
            ))}
          </g>
        );
      })}
    </g>
  );
}

// ── Page 10: Stitching ────────────────────────────────────────────────────────
export function CutSewStitchingPageBody({ block, images }) {
  const stitchBlocks = (block?.seam_stitch_blocks || block?.seamStitchBlocks || []).filter(b => !b.hidden);
  const seams = block?.seams || [];

  const BLOCK_W = stitchBlocks.length > 0 ? Math.min(160, Math.floor((PAGE_W - 80) / Math.max(stitchBlocks.length, 1))) : 160;
  const BLOCK_H = Math.round(BLOCK_W * 1.5);

  const ROW_H = 22;
  const COLS = ['Operation', 'Seam Type', 'Stitch Type', 'Machine', 'SPI', 'Thread', 'Notes'];
  const COL_W = Math.floor((PAGE_W - 80) / COLS.length);
  const TABLE_Y = 150 + (stitchBlocks.length > 0 ? BLOCK_H + 48 : 0);

  const laborCost = parseFloat(block?.labor_cost_usd || block?.cutSewLaborCost || 0);

  return (
    <g>
      <text x="40" y="118" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="32" fill={FR.slate}>Stitching</text>

      {/* Stitch reference image blocks */}
      {stitchBlocks.length > 0 && (
        <g>
          <text x="40" y="150" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">STITCH REFERENCES</text>
          {stitchBlocks.map((b, i) => {
            const slotKey = `seam-stitch-${b.num}`;
            const src = images?.find?.(img => img?.slot === slotKey)?.data
              || images?.find?.(img => img?.slot === slotKey)?.path
              || b.image_url || '';
            return (
              <g key={b.num}>
                <Img x={40 + i * (BLOCK_W + 8)} y={160} w={BLOCK_W} h={BLOCK_H} src={src} noLabel />
                {b.label && (
                  <text x={40 + i * (BLOCK_W + 8) + BLOCK_W / 2} y={160 + BLOCK_H + 14} textAnchor="middle" fontSize="9" fill={FR.slate}>{clamp(esc(b.label), 20)}</text>
                )}
              </g>
            );
          })}
        </g>
      )}

      {/* Seam spec table */}
      {seams.length > 0 && (
        <g>
          <text x="40" y={TABLE_Y - 10} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">SEAM &amp; STITCH SPECIFICATION</text>
          {/* Header */}
          <rect x="40" y={TABLE_Y} width={PAGE_W - 80} height={ROW_H} fill={FR.slate} />
          {COLS.map((col, ci) => (
            <text key={ci} x={40 + ci * COL_W + 8} y={TABLE_Y + 15} fontSize="8" fontWeight="bold" fill={FR.salt} letterSpacing="0.8">{col.toUpperCase()}</text>
          ))}
          {/* Rows */}
          {seams.slice(0, 8).map((s, si) => {
            const rowY = TABLE_Y + ROW_H + si * ROW_H;
            const vals = [
              s.operation, s.seam_type || s.seamType, s.stitch_type || s.stitchType,
              s.machine, s.spi_spcm || s.spiSpcm, s.thread_color || s.threadColor, s.notes,
            ];
            return (
              <g key={si}>
                <rect x="40" y={rowY} width={PAGE_W - 80} height={ROW_H} fill={si % 2 === 0 ? '#fff' : FR.salt} />
                {vals.map((v, ci) => (
                  <text key={ci} x={40 + ci * COL_W + 8} y={rowY + 15} fontSize="9" fill={FR.slate}>{clamp(esc(v), 18)}</text>
                ))}
              </g>
            );
          })}
          <line x1="40" y1={TABLE_Y + ROW_H + seams.slice(0, 8).length * ROW_H} x2={PAGE_W - 40} y2={TABLE_Y + ROW_H + seams.slice(0, 8).length * ROW_H} stroke={FR.sand} strokeWidth="0.5" />
        </g>
      )}

      {/* Labor cost */}
      {laborCost > 0 && (
        <g>
          <line x1="40" y1="710" x2={PAGE_W - 40} y2="710" stroke={FR.sand} strokeWidth="0.5" />
          <text x={PAGE_W - 40} y="742" textAnchor="end" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="44" fill={FR.soil}>${laborCost.toFixed(2)}</text>
          <text x={PAGE_W - 40} y="722" textAnchor="end" fontSize="9" fill={FR.stone} letterSpacing="0.4">CUT &amp; SEW LABOR COST / UNIT</text>
        </g>
      )}
    </g>
  );
}

// ── Page 11: Pattern & Cutting ─────────────────────────────────────────────────
export function CutSewPatternPageBody({ block, images }) {
  const pieces = block?.pattern_pieces || block?.patternPieces || [];
  const instructions = block?.cutting_instructions || block?.cuttingInstructions || '';
  const layoutSrc = images?.find?.(img => img?.slot === 'pattern-layout')?.data
    || images?.find?.(img => img?.slot === 'pattern-layout')?.path
    || block?.pattern_layout_url || '';

  const COLS = ['#', 'Piece Name', 'Qty', 'Fabric', 'Grain', 'Fusing', 'Notes'];
  const COL_W_MAP = [40, 180, 40, 100, 100, 100, 0]; // last col gets remaining
  const ROW_H = 22;
  const TABLE_Y = 380;

  return (
    <g>
      <text x="40" y="118" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="32" fill={FR.slate}>Pattern &amp; Cutting</text>

      {/* Layout image — top band */}
      <Img x={40} y={138} w={PAGE_W - 80} h={220} src={layoutSrc} label="PATTERN LAYOUT" />

      {/* Pattern piece table */}
      {pieces.length > 0 && (
        <g>
          <text x="40" y={TABLE_Y - 10} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">PATTERN PIECE INDEX</text>
          <rect x="40" y={TABLE_Y} width={PAGE_W - 80} height={ROW_H} fill={FR.slate} />
          {COLS.map((col, ci) => {
            const xOff = COL_W_MAP.slice(0, ci).reduce((a, b) => a + b, 0);
            return <text key={ci} x={40 + xOff + 6} y={TABLE_Y + 15} fontSize="8" fontWeight="bold" fill={FR.salt} letterSpacing="0.8">{col.toUpperCase()}</text>;
          })}
          {pieces.slice(0, 10).map((p, pi) => {
            const rowY = TABLE_Y + ROW_H + pi * ROW_H;
            const vals = [
              p.piece_num || p.pieceNum,
              p.piece_name || p.pieceName,
              p.quantity,
              p.fabric,
              p.grain,
              p.fusing,
              p.notes,
            ];
            return (
              <g key={pi}>
                <rect x="40" y={rowY} width={PAGE_W - 80} height={ROW_H} fill={pi % 2 === 0 ? '#fff' : FR.salt} />
                {vals.map((v, ci) => {
                  const xOff = COL_W_MAP.slice(0, ci).reduce((a, b) => a + b, 0);
                  return <text key={ci} x={40 + xOff + 6} y={rowY + 15} fontSize="9" fill={FR.slate}>{clamp(esc(v), 22)}</text>;
                })}
              </g>
            );
          })}
        </g>
      )}

      {/* Cutting instructions */}
      {instructions && (
        <g>
          <line x1="40" y1="714" x2={PAGE_W - 40} y2="714" stroke={FR.sand} strokeWidth="0.5" />
          <text x="40" y="728" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">CUTTING INSTRUCTIONS</text>
          {wrapText(instructions, 130, 3).map((line, li) => (
            <text key={li} x="40" y={742 + li * 14} fontSize="10" fill={FR.slate}>{line}</text>
          ))}
        </g>
      )}
    </g>
  );
}

// ── Page 12: POM ──────────────────────────────────────────────────────────────
export function CutSewPomPageBody({ block, images }) {
  const poms = block?.pom_rows || block?.poms || [];
  const sizeType = block?.pom_size_type || block?.sizeType || 'apparel';
  const method = block?.pom_measurement_method || block?.measurementMethod || '';
  const diagSrc = images?.find?.(img => img?.slot === 'pom-diagram')?.data
    || images?.find?.(img => img?.slot === 'pom-diagram')?.path
    || block?.pom_diagram_url || '';

  const sizes = sizeType === 'waist'
    ? [{ key: 's', label: 'W30' }, { key: 'm', label: 'W32' }, { key: 'l', label: 'W34' }, { key: 'xl', label: 'W36' }]
    : [{ key: 's', label: 'S' }, { key: 'm', label: 'M' }, { key: 'l', label: 'L' }, { key: 'xl', label: 'XL' }];

  const ROW_H = 22;
  const DIAG_W = 320;
  const TABLE_X = 40 + DIAG_W + 24;
  const TABLE_W = PAGE_W - 80 - DIAG_W - 24;
  const COL_W = Math.floor(TABLE_W / (sizes.length + 3)); // # + name + sizes + tol + method

  return (
    <g>
      <text x="40" y="118" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="32" fill={FR.slate}>Points of Measure (cm)</text>

      {/* POM diagram — left column */}
      <Img x={40} y={148} w={DIAG_W} h={540} src={diagSrc} label="POM DIAGRAM" />

      {/* POM table — right column */}
      {poms.length > 0 && (
        <g>
          <text x={TABLE_X} y="162" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">GRADED SPEC TABLE</text>
          {/* Header */}
          <rect x={TABLE_X} y={174} width={TABLE_W} height={ROW_H} fill={FR.slate} />
          {['#', 'Measurement', ...sizes.map(s => s.label), 'Tol', 'Method'].map((col, ci) => (
            <text key={ci} x={TABLE_X + ci * COL_W + 6} y={174 + 15} fontSize="8" fontWeight="bold" fill={FR.salt} letterSpacing="0.8">{col}</text>
          ))}
          {/* Rows */}
          {poms.slice(0, 20).map((p, pi) => {
            const rowY = 174 + ROW_H + pi * ROW_H;
            const vals = [
              String(pi + 1),
              p.name,
              ...sizes.map(s => p[s.key] ?? '—'),
              p.tol || '1',
              p.method || '',
            ];
            return (
              <g key={pi}>
                <rect x={TABLE_X} y={rowY} width={TABLE_W} height={ROW_H} fill={pi % 2 === 0 ? '#fff' : FR.salt} />
                {vals.map((v, ci) => (
                  <text key={ci} x={TABLE_X + ci * COL_W + 6} y={rowY + 15} fontSize="9" fill={FR.slate}>{clamp(esc(v), 14)}</text>
                ))}
              </g>
            );
          })}
        </g>
      )}

      {/* Measurement method footer */}
      {method && (
        <g>
          <line x1="40" y1="706" x2={PAGE_W - 40} y2="706" stroke={FR.sand} strokeWidth="0.5" />
          <text x="40" y="720" fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="1.2">MEASUREMENT METHOD</text>
          <text x="40" y="738" fontSize="10" fill={FR.stone} fontStyle="italic">{clamp(esc(method), 140)}</text>
        </g>
      )}
    </g>
  );
}

// ── Page 13: Size Grading ─────────────────────────────────────────────────────
export function CutSewSizeGradingPageBody({ block }) {
  const matrix = block?.graded_size_matrix || block?.gradedSizeMatrix || { baseSize: 'M', sizes: [], grading: [] };
  const poms = block?.pom_rows || block?.poms || [];
  const sizes = (block?.sizes && block.sizes.length > 0) ? block.sizes : ['S', 'M', 'L', 'XL'];
  const baseSize = sizes.includes(matrix.baseSize) ? matrix.baseSize : sizes[0];

  const deltaFor = (pomName, size) => {
    const g = (matrix.grading || []).find(x => x.pomName === pomName);
    return g?.perSizeDelta?.[size] ?? null;
  };
  const baseValFor = (pom) => {
    const key = baseSize.toLowerCase();
    const n = parseFloat(pom[key]);
    return Number.isFinite(n) ? n : null;
  };
  const cellFor = (pom, size) => {
    const base = baseValFor(pom);
    if (size === baseSize) return base !== null ? base.toFixed(1) : '—';
    const d = deltaFor(pom.name, size);
    if (d === null || base === null) return '—';
    return (base + d).toFixed(1);
  };

  const ROW_H = 26;
  const COL_W = Math.min(110, Math.floor((PAGE_W - 80) / (sizes.length + 2)));

  return (
    <g>
      <text x="40" y="118" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="32" fill={FR.slate}>Size Grading</text>
      <text x="40" y="148" fontSize="10" fill={FR.stone}>Sample size: <tspan fontWeight="bold" fill={FR.slate}>{baseSize}</tspan> · All values in cm · Non-sample sizes = sample + grade delta</text>

      {poms.length > 0 ? (
        <g>
          {/* Header */}
          <rect x="40" y="168" width={PAGE_W - 80} height={ROW_H} fill={FR.slate} />
          {['#', 'Measurement', ...sizes].map((col, ci) => (
            <text key={ci} x={40 + ci * COL_W + 8} y={168 + 18} fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="0.8">{col}</text>
          ))}
          {/* Data rows */}
          {poms.slice(0, 24).map((p, pi) => {
            const rowY = 168 + ROW_H + pi * ROW_H;
            return (
              <g key={pi}>
                <rect x="40" y={rowY} width={PAGE_W - 80} height={ROW_H} fill={pi % 2 === 0 ? '#fff' : FR.salt} />
                <text x={40 + 8} y={rowY + 18} fontSize="9" fill={FR.stone}>{pi + 1}</text>
                <text x={40 + COL_W + 8} y={rowY + 18} fontSize="9" fill={FR.slate}>{clamp(esc(p.name), 20)}</text>
                {sizes.map((sz, si) => {
                  const val = cellFor(p, sz);
                  const isBase = sz === baseSize;
                  return (
                    <text key={si} x={40 + (si + 2) * COL_W + 8} y={rowY + 18} fontSize="9"
                      fontWeight={isBase ? '600' : 'normal'}
                      fill={isBase ? FR.soil : FR.slate}>{val}</text>
                  );
                })}
              </g>
            );
          })}
        </g>
      ) : (
        <text x="40" y="200" fontSize="12" fill={FR.stone} fontStyle="italic">No POM data yet — fill in the POM & Grading tab first.</text>
      )}
    </g>
  );
}

// ── Shared SVG chrome ────────────────────────────────────────────────────────
function PageShell({ title, headerCode, pageTag, children }) {
  const styleInfo = '© 2026 Foreign Resource Co. — Confidential Tech Pack';
  return (
    <svg xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      preserveAspectRatio="xMidYMin meet"
      style={{ width: '100%', height: 'auto', background: FR.salt, boxShadow: '0 2px 14px rgba(0,0,0,0.10)', borderRadius: 6, fontFamily: 'Helvetica, Arial, sans-serif', display: 'block', marginBottom: 12 }}>
      <rect x="0" y="0" width={PAGE_W} height={PAGE_H} fill={FR.salt} />
      <rect x="0" y="0" width={PAGE_W} height="70" fill={FR.slate} />
      <text x="40" y="28" fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="3">FOREIGN RESOURCE CO.</text>
      <text x="40" y="50" fontSize="8" fill={FR.sand} letterSpacing="2">CUT &amp; SEW BLOCK</text>
      <text x={PAGE_W / 2} y="44" textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="20" fill={FR.salt}>{title}</text>
      {headerCode && (
        <text x={PAGE_W - 40} y="28" textAnchor="end" fontSize="10" fontWeight="bold" fill={FR.salt} letterSpacing="2" fontFamily="ui-monospace, Menlo, monospace">{esc(headerCode)}</text>
      )}
      <text x={PAGE_W - 40} y="50" textAnchor="end" fontSize="8" fill={FR.sand} letterSpacing="2">PAGE {pageTag}</text>
      <rect x="0" y="70" width={PAGE_W} height="2" fill={FR.soil} />
      {children}
      <text x="40" y="775" fontSize="9" fill={FR.stone}>{styleInfo}</text>
      <text x={PAGE_W - 40} y="775" textAnchor="end" fontSize="9" fill={FR.stone}>PAGE {pageTag}</text>
    </svg>
  );
}

// ── Default export: single-page preview synced to builder tab ───────────────
export default function CutSewBOMPreview({
  block,
  activePage = 'identity',
  styleNumber = null,
  pageLabel = null,
}) {
  const headerCode = styleNumber || block.code || '';

  if (activePage === 'flatlay') {
    return (
      <PageShell title="Flat Lay" headerCode={headerCode} pageTag={pageLabel || '07'}>
        <CutSewFlatLayPageBody block={block} images={null} />
      </PageShell>
    );
  }
  if (activePage === 'callouts1') {
    return (
      <PageShell title="Call Outs" headerCode={headerCode} pageTag={pageLabel || '08'}>
        <CutSewCallOutsPageBody block={block} images={null} page={1} />
      </PageShell>
    );
  }
  if (activePage === 'callouts2') {
    return (
      <PageShell title="Call Outs" headerCode={headerCode} pageTag={pageLabel || '09'}>
        <CutSewCallOutsPageBody block={block} images={null} page={2} />
      </PageShell>
    );
  }
  if (activePage === 'stitching') {
    return (
      <PageShell title="Stitching" headerCode={headerCode} pageTag={pageLabel || '10'}>
        <CutSewStitchingPageBody block={block} images={null} />
      </PageShell>
    );
  }
  if (activePage === 'pattern') {
    return (
      <PageShell title="Pattern &amp; Cutting" headerCode={headerCode} pageTag={pageLabel || '11'}>
        <CutSewPatternPageBody block={block} images={null} />
      </PageShell>
    );
  }
  if (activePage === 'pom') {
    return (
      <>
        <PageShell title="POM" headerCode={headerCode} pageTag={pageLabel || '12'}>
          <CutSewPomPageBody block={block} images={null} />
        </PageShell>
        <PageShell title="Size Grading" headerCode={headerCode} pageTag={pageLabel ? String(parseInt(pageLabel) + 1) : '13'}>
          <CutSewSizeGradingPageBody block={block} />
        </PageShell>
      </>
    );
  }

  // Default: identity / block summary
  return (
    <PageShell title="Cut &amp; Sew" headerCode={headerCode} pageTag={pageLabel || 'BOM-CS'}>
      <CutSewIdentityPageBody block={block} />
    </PageShell>
  );
}
