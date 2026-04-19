// Live A4-landscape page preview for the Component Pack wizard.
// One page per section, same rendering conventions as TechPackPagePreview
// so Styles and Components feel like the same document family.

import { FR } from './techPackConstants';

const PAGE_W = 1123;
const PAGE_H = 794;

function esc(s) { return String(s ?? ''); }
function clampLine(s, maxW, charW = 6.5) {
  const max = Math.floor(maxW / charW);
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + '…';
}

function PageFrame({ title, pageNum, totalPages, componentInfo, children }) {
  return (
    <g>
      <rect x="0" y="0" width={PAGE_W} height={PAGE_H} fill={FR.white} />
      <rect x="0" y="0" width={PAGE_W} height={70} fill={FR.slate} />
      <text x="40" y="28" fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="3">FR · COMPONENT PACK</text>
      <text x="40" y="55" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="22" fill={FR.salt}>{title}</text>
      <rect x="0" y="70" width={PAGE_W} height={2} fill={FR.soil} />
      <text x="40" y="775" fontSize="9" fill={FR.stone}>{componentInfo}</text>
      <text x={PAGE_W - 40} y="775" textAnchor="end" fontSize="9" fill={FR.stone}>Page {pageNum} of {totalPages}</text>
      {children}
    </g>
  );
}

function SectionHeading({ x, y, children }) {
  return (
    <g>
      <text x={x} y={y} fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="18" fill={FR.slate}>{children}</text>
      <rect x={x} y={y + 4} width="60" height="2" fill={FR.soil} />
    </g>
  );
}

function Field({ x, y, label, value, w = 320 }) {
  return (
    <g>
      <text x={x} y={y} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">{esc((label || '').toUpperCase())}</text>
      <text x={x} y={y + 14} fontSize="11" fill={FR.slate}>{clampLine(esc(value || '—'), w, 6.5)}</text>
    </g>
  );
}

function Table({ x, y, headers, rows, widths, maxRows = 14 }) {
  const rowH = 22;
  const totalW = widths.reduce((a, b) => a + b, 0);
  const displayRows = rows.slice(0, maxRows);
  let cx = x;
  return (
    <g>
      <rect x={x} y={y} width={totalW} height={rowH} fill={FR.slate} />
      {headers.map((h, i) => {
        const tx = cx + 6;
        cx += widths[i];
        return <text key={i} x={tx} y={y + 15} fontSize="9" fontWeight="bold" fill={FR.salt} letterSpacing="0.5">{esc((h || '').toUpperCase())}</text>;
      })}
      {displayRows.map((row, ri) => {
        const ry = y + rowH + ri * rowH;
        let cx2 = x;
        return (
          <g key={ri}>
            {ri % 2 === 0 && <rect x={x} y={ry} width={totalW} height={rowH} fill={FR.salt} />}
            {row.map((cell, i) => {
              const tx = cx2 + 6;
              const w = widths[i];
              cx2 += widths[i];
              return <text key={i} x={tx} y={ry + 15} fontSize="10" fill={FR.slate}>{clampLine(esc(cell || ''), w - 10)}</text>;
            })}
          </g>
        );
      })}
    </g>
  );
}

function EmptyNote({ x, y, children }) {
  return <text x={x} y={y} fontSize="10" fill={FR.stone} fontStyle="italic">{children}</text>;
}

function PhotoGrid({ images, slot, x, y, cols = 3, cellW = 180, cellH = 180, gap = 12, max = 6 }) {
  const slotImgs = (images || []).filter(img => img.slot === slot).slice(0, max);
  if (slotImgs.length === 0) {
    return (
      <g>
        <rect x={x} y={y} width={cellW * cols + gap * (cols - 1)} height={cellH} fill={FR.salt} stroke={FR.sand} strokeDasharray="4 4" />
        <text x={x + 12} y={y + cellH / 2 + 4} fontSize="11" fill={FR.stone} fontStyle="italic">Drop photos on the left to see them here</text>
      </g>
    );
  }
  return (
    <g>
      {slotImgs.map((img, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        return (
          <image key={i}
            href={img.data}
            x={x + col * (cellW + gap)}
            y={y + row * (cellH + gap)}
            width={cellW}
            height={cellH}
            preserveAspectRatio="xMidYMid slice" />
        );
      })}
    </g>
  );
}

// ─── Page bodies ─────────────────────────────────────────────────────────────
function PageIdentity({ d }) {
  return (
    <g>
      <text x={PAGE_W / 2} y="260" textAnchor="middle" fontFamily="'Cormorant Garamond', Georgia, serif" fontSize="48" fill={FR.slate}>
        {clampLine(d.componentName || 'New Component', 900, 24)}
      </text>
      <text x={PAGE_W / 2} y="300" textAnchor="middle" fontSize="14" fill={FR.soil}>
        {esc(d.componentNumber || 'FR-CMP-000')}
      </text>
      <text x={PAGE_W / 2} y="330" textAnchor="middle" fontSize="12" fill={FR.stone}>
        {[d.componentCategory, d.season].filter(Boolean).join('  ·  ') || '—'}
      </text>
      <rect x={PAGE_W / 2 - 80} y="355" width="160" height="36" rx="6" fill={FR.soil} />
      <text x={PAGE_W / 2} y="379" textAnchor="middle" fontSize="11" fontWeight="bold" fill={FR.salt} letterSpacing="1">
        {esc((d.status || 'DESIGN').toUpperCase())}
      </text>
      <SectionHeading x={40} y={460}>Identity & Classification</SectionHeading>
      <Field x={40} y={495} label="Component Name" value={d.componentName} />
      <Field x={400} y={495} label="Category" value={d.componentCategory} />
      <Field x={760} y={495} label="Component #" value={d.componentNumber} />
      <Field x={40} y={555} label="Status" value={d.status} />
      <Field x={400} y={555} label="Season" value={d.season} />
    </g>
  );
}

function PageSupplier({ d }) {
  return (
    <g>
      <SectionHeading x={40} y={110}>Supplier</SectionHeading>
      <Field x={40} y={145} label="Supplier" value={d.supplier} w={480} />
      <Field x={560} y={145} label="Contact" value={d.supplierContact} w={500} />
      <Field x={40} y={200} label="Email" value={d.supplierEmail} w={480} />
      <Field x={560} y={200} label="Phone / WeChat" value={d.supplierPhone} w={500} />
      <Field x={40} y={255} label="Website" value={d.supplierWebsite} w={1020} />
      <SectionHeading x={40} y={330}>Terms</SectionHeading>
      <Field x={40} y={365} label="Lead Time" value={d.leadTime ? `${d.leadTime} days` : ''} />
      <Field x={400} y={365} label="MOQ" value={d.moq} />
      <Field x={760} y={365} label="MOQ Unit" value={d.moqUnit} />
    </g>
  );
}

function PageSpecs({ d }) {
  return (
    <g>
      <SectionHeading x={40} y={110}>Specifications</SectionHeading>
      <Field x={40} y={145} label="Material" value={d.material} w={500} />
      <Field x={560} y={145} label="Composition" value={d.composition} w={500} />
      <Field x={40} y={200} label="Weight / GSM" value={d.weight} />
      <Field x={400} y={200} label="Width" value={d.width} />
      <Field x={760} y={200} label="Dimensions" value={d.dimensions} />
      <Field x={40} y={255} label="Finish" value={d.finish} w={1020} />
      <text x={40} y={335} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">SPEC NOTES</text>
      <foreignObject x="40" y="345" width={PAGE_W - 80} height="380">
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 11, color: FR.slate, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {d.specNotes || '—'}
        </div>
      </foreignObject>
    </g>
  );
}

function PageColor({ d }) {
  const swatch = d.hex || '#CCCCCC';
  return (
    <g>
      <SectionHeading x={40} y={110}>Color</SectionHeading>
      <rect x="40" y="145" width="300" height="300" fill={swatch} stroke={FR.sand} />
      <Field x={380} y={170} label="FR Color" value={d.frColor} w={380} />
      <Field x={380} y={225} label="Custom Color Name" value={d.customColorName} w={380} />
      <Field x={380} y={280} label="Pantone" value={d.pantone} w={380} />
      <Field x={380} y={335} label="Hex" value={d.hex} w={380} />
      <Field x={380} y={390} label="Dye Method" value={d.dyeMethod} w={380} />
    </g>
  );
}

function PageCost({ d }) {
  const pbRows = (d.priceBreaks || []).filter(p => p.qty || p.price).map(p => [p.qty, `${p.price || ''} ${d.currency || ''}`]);
  return (
    <g>
      <SectionHeading x={40} y={110}>Cost & Pricing</SectionHeading>
      <Field x={40} y={145} label="Cost per Unit" value={d.costPerUnit ? `${d.costPerUnit} ${d.currency || 'USD'}` : ''} />
      <Field x={400} y={145} label="Currency" value={d.currency} />
      <SectionHeading x={40} y={230}>Price Breaks</SectionHeading>
      {pbRows.length === 0
        ? <EmptyNote x={40} y={275}>No price breaks entered</EmptyNote>
        : <Table x={40} y={255} headers={['Min Qty', `Price`]} rows={pbRows} widths={[400, 400]} />}
    </g>
  );
}

function PageCompliance({ d }) {
  const certs = (d.certifications || []).filter(Boolean);
  return (
    <g>
      <SectionHeading x={40} y={110}>Compliance</SectionHeading>
      <text x={40} y={145} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">CERTIFICATIONS</text>
      {certs.length === 0 ? (
        <EmptyNote x={40} y={175}>No certifications selected</EmptyNote>
      ) : (
        certs.map((c, i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const x = 40 + col * 360;
          const y = 165 + row * 40;
          return (
            <g key={i}>
              <rect x={x} y={y} width={340} height={28} rx={14} fill={FR.soil} />
              <text x={x + 170} y={y + 19} textAnchor="middle" fontSize="11" fill={FR.salt}>{esc(c)}</text>
            </g>
          );
        })
      )}
      <SectionHeading x={40} y={480}>Origin</SectionHeading>
      <Field x={40} y={515} label="Country of Origin" value={d.countryOfOrigin} />
      <Field x={400} y={515} label="HS Code" value={d.hsCode} />
    </g>
  );
}

function PageImages({ images }) {
  return (
    <g>
      <SectionHeading x={40} y={110}>Reference Images</SectionHeading>
      <text x={40} y={145} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">PRODUCT PHOTOS</text>
      <PhotoGrid images={images} slot="component-photo" x={40} y={160} cellW={210} cellH={160} cols={5} max={5} />
      <text x={40} y={355} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">SWATCH / SAMPLE</text>
      <PhotoGrid images={images} slot="component-swatch" x={40} y={370} cellW={210} cellH={160} cols={5} max={5} />
      <text x={40} y={565} fontSize="8" fontWeight="bold" fill={FR.soil} letterSpacing="0.5">SPEC / TECH DRAWING</text>
      <PhotoGrid images={images} slot="component-spec" x={40} y={580} cellW={210} cellH={160} cols={5} max={5} />
    </g>
  );
}

function PageNotes({ d }) {
  return (
    <g>
      <SectionHeading x={40} y={110}>Notes</SectionHeading>
      <foreignObject x="40" y="145" width={PAGE_W - 80} height="580">
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 12, color: FR.slate, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {d.notes || '—'}
        </div>
      </foreignObject>
    </g>
  );
}

const PAGE_FNS = [
  { title: 'Identity & Classification', body: PageIdentity },
  { title: 'Supplier', body: PageSupplier },
  { title: 'Specifications', body: PageSpecs },
  { title: 'Color', body: PageColor },
  { title: 'Cost & Pricing', body: PageCost },
  { title: 'Compliance', body: PageCompliance },
  { title: 'Reference Images', body: PageImages },
  { title: 'Notes', body: PageNotes },
];

export default function ComponentPackPagePreview({ data, images, step }) {
  const d = data || {};
  const componentInfo = `${d.componentName || 'Untitled'} · ${d.componentNumber || ''}`;
  const totalPages = PAGE_FNS.length;
  const pageNum = Math.min(Math.max(step + 1, 1), totalPages);
  const current = PAGE_FNS[step] || PAGE_FNS[0];
  const Body = current.body;

  return (
    <svg xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${PAGE_W} ${PAGE_H}`}
      preserveAspectRatio="xMidYMin meet"
      style={{ width: '100%', height: 'auto', background: FR.white, boxShadow: '0 2px 14px rgba(0,0,0,0.12)', borderRadius: 6, fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <PageFrame title={current.title} pageNum={pageNum} totalPages={totalPages} componentInfo={componentInfo}>
        <Body d={d} images={images} />
      </PageFrame>
    </svg>
  );
}
