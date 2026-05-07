// Tech Pack SVG generator — produces a single editable SVG with all tech pack data
// A4 landscape dimensions (in px at 96dpi): 1123 × 794

const FR = {
  slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70',
  soil: '#9A816B', white: '#FFFFFF',
};

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function table(x, y, headers, rows, colWidths) {
  const rowH = 22;
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  let out = '';
  // header row
  out += `<rect x="${x}" y="${y}" width="${totalW}" height="${rowH}" fill="${FR.slate}"/>`;
  let cx = x;
  headers.forEach((h, i) => {
    out += `<text x="${cx + 6}" y="${y + 15}" font-family="Helvetica, Arial, sans-serif" font-size="9" font-weight="bold" fill="${FR.salt}" letter-spacing="0.5">${esc((h || '').toUpperCase())}</text>`;
    cx += colWidths[i];
  });
  // body rows
  rows.forEach((row, ri) => {
    const ry = y + rowH + ri * rowH;
    if (ri % 2 === 0) {
      out += `<rect x="${x}" y="${ry}" width="${totalW}" height="${rowH}" fill="${FR.salt}"/>`;
    }
    let cx2 = x;
    row.forEach((cell, i) => {
      out += `<text x="${cx2 + 6}" y="${ry + 15}" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="${FR.slate}">${esc(cell || '')}</text>`;
      cx2 += colWidths[i];
    });
  });
  return { svg: out, endY: y + rowH * (rows.length + 1) };
}

function field(label, value, x, y) {
  return `
    <text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="8" font-weight="bold" fill="${FR.soil}" letter-spacing="0.5">${esc((label || '').toUpperCase())}</text>
    <text x="${x}" y="${y + 14}" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="${FR.slate}">${esc(value || '—')}</text>
  `;
}

function sectionHeading(text, x, y) {
  return `
    <text x="${x}" y="${y}" font-family="'Cormorant Garamond', Georgia, serif" font-size="18" fill="${FR.slate}">${esc(text)}</text>
    <rect x="${x}" y="${y + 4}" width="60" height="2" fill="${FR.soil}"/>
  `;
}

function pageFrame(title, subtitle, pageNum, totalPages, styleInfo) {
  return `
    <rect x="0" y="0" width="1123" height="794" fill="${FR.white}"/>
    <!-- header -->
    <rect x="0" y="0" width="1123" height="70" fill="${FR.slate}"/>
    <text x="40" y="28" font-family="Helvetica, Arial, sans-serif" font-size="9" font-weight="bold" fill="${FR.salt}" letter-spacing="3">FOREIGN RESOURCE CO.</text>
    <text x="40" y="55" font-family="'Cormorant Garamond', Georgia, serif" font-size="22" fill="${FR.salt}">${esc(title)}</text>
    ${subtitle ? `<text x="1083" y="55" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="${FR.stone}">${esc(subtitle)}</text>` : ''}
    <rect x="0" y="70" width="1123" height="2" fill="${FR.soil}"/>
    <!-- footer -->
    <text x="40" y="775" font-family="Helvetica, Arial, sans-serif" font-size="9" fill="${FR.stone}">${esc(styleInfo)}</text>
    <text x="1083" y="775" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="9" fill="${FR.stone}">Page ${pageNum} of ${totalPages}</text>
  `;
}

// Sync export — assumes images already have inline `data` fields. Use
// generateTechPackSVGAsync (below) when starting from a pack that may
// contain Supabase Storage refs.
export function generateTechPackSVG(pack) {
  const d = pack.data || {};
  const images = pack.images || [];
  const styleInfo = `${d.styleName || 'Untitled'} · ${d.styleNumber || ''}`;
  const skippedSteps = Array.isArray(d.skippedSteps) ? d.skippedSteps : [];

  // Paints the "PAGE NOT USED" diagonal-cross overlay on top of a single
  // page when that step was marked skipped in the builder. Rendered as the
  // last child of the page's <g> so it sits above the content.
  const skipOverlaySVG = () => (
    `<rect x="0" y="0" width="1123" height="794" fill="#FFFFFF" fill-opacity="0.8"/>` +
    `<line x1="0" y1="0" x2="1123" y2="794" stroke="#C0392B" stroke-width="12" stroke-opacity="0.35"/>` +
    `<line x1="1123" y1="0" x2="0" y2="794" stroke="#C0392B" stroke-width="12" stroke-opacity="0.35"/>` +
    `<rect x="421" y="369" width="280" height="56" fill="#C0392B" rx="5"/>` +
    `<text x="561" y="406" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="19" font-weight="bold" fill="#FFFFFF" letter-spacing="5">PAGE NOT USED</text>`
  );
  const skipIf = (stepIdx) => skippedSteps.includes(stepIdx) ? skipOverlaySVG() : '';

  // Cover page as an illustrative single SVG — a full 14-page SVG export would be huge.
  // For the MVP, we produce one comprehensive "summary" SVG showing all critical data.
  // The PDF is the printable deliverable; the SVG is for editing in Illustrator.

  const pageH = 794;
  const numPages = 7; // compact layout — cover + identity + materials + bom-trims + construction + colorways + order
  const totalH = pageH * numPages;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  viewBox="0 0 1123 ${totalH}" width="1123" height="${totalH}"
  style="font-family: Helvetica, Arial, sans-serif;">
  <defs>
    <style><![CDATA[
      text { font-family: Helvetica, Arial, sans-serif; }
      .title { font-family: 'Cormorant Garamond', Georgia, serif; }
    ]]></style>
  </defs>
`;

  // ─── Cover ───
  svg += `<g id="page-1-cover">`;
  svg += pageFrame('Tech Pack', new Date().toISOString().slice(0, 10), 1, numPages, styleInfo);
  svg += `<text x="561" y="340" text-anchor="middle" class="title" font-family="'Cormorant Garamond', Georgia, serif" font-size="54" fill="${FR.slate}">${esc(d.styleName || 'Untitled Tech Pack')}</text>`;
  svg += `<text x="561" y="380" text-anchor="middle" font-size="16" fill="${FR.soil}">${esc(d.styleNumber || 'STYLE-000')}</text>`;
  svg += `<text x="561" y="415" text-anchor="middle" font-size="12" fill="${FR.stone}">${esc([d.productCategory, d.productTier, d.season].filter(Boolean).join('  ·  '))}</text>`;
  svg += `<rect x="481" y="440" width="160" height="36" rx="6" fill="${FR.soil}"/>`;
  svg += `<text x="561" y="464" text-anchor="middle" font-size="11" font-weight="bold" fill="${FR.salt}" letter-spacing="1">${esc((d.status || 'DEVELOPMENT').toUpperCase())}</text>`;
  svg += skipIf(2);
  svg += `</g>`;

  // ─── Identity ───
  let yOff = pageH;
  svg += `<g id="page-2-identity" transform="translate(0 ${yOff})">`;
  svg += pageFrame('Identity & Classification', null, 2, numPages, styleInfo);
  svg += sectionHeading('Product', 40, 110);
  svg += field('Style Name', d.styleName, 40, 145);
  svg += field('Category', d.productCategory, 400, 145);
  svg += field('Tier', d.productTier, 700, 145);
  svg += field('Season', d.season, 40, 195);
  svg += field('Target Retail', d.targetRetail, 400, 195);
  svg += field('Target FOB', d.targetFOB, 700, 195);
  svg += field('Status', d.status, 40, 245);
  svg += sectionHeading('SKU & Numbering', 40, 310);
  svg += field('Style Number', d.styleNumber, 40, 345);
  svg += field('SKU Prefix', d.skuPrefix, 400, 345);
  svg += field('Barcode Method', d.barcodeMethod, 700, 345);
  svg += sectionHeading('Vendor', 40, 410);
  svg += field('Vendor', d.vendor, 40, 445);
  svg += field('Contact', d.vendorContact, 500, 445);
  svg += field('Fabric Type', d.fabricType, 40, 495);
  svg += skipIf(2);
  svg += `</g>`;

  // ─── Materials & BOM: Fabrics & Trims ───
  yOff += pageH;
  svg += `<g id="page-3-bom" transform="translate(0 ${yOff})">`;
  svg += pageFrame('BOM — Fabrics & Trims', null, 3, numPages, styleInfo);
  svg += sectionHeading('Fabrics', 40, 110);
  const fabRows = (d.fabrics || []).filter(f => f.component || f.fabricType).map(f => [f.component, f.fabricType, f.composition, f.weightGsm, f.colorPantone, f.supplier]);
  if (fabRows.length) {
    const tf = table(40, 130, ['Component', 'Fabric Type', 'Composition', 'Weight GSM', 'Color/Pantone', 'Vendor'], fabRows, [130, 160, 160, 110, 150, 333]);
    svg += tf.svg;
  }
  // Fabric yield from library-picked fabrics (metersPerUnit stored on pack data)
  const yieldFabs = (d.pickedFabrics || []).filter(p => p?.fabricId && p.metersPerUnit != null);
  if (yieldFabs.length) {
    svg += sectionHeading('Fabric Yield', 40, 250);
    const yieldRows = yieldFabs.map(p => [
      p.role || '—',
      `${p.metersPerUnit}m/unit`,
      p.yieldIsActual ? 'CLO3D actual' : 'Std. estimate',
    ]);
    const ty = table(40, 270, ['Fabric Area', 'Yield', 'Source'], yieldRows, [280, 180, 583]);
    svg += ty.svg;
  }

  svg += sectionHeading('Trims & Accessories', 40, 380);
  const trimsRows = (d.trimsAccessories || []).filter(t => t.component || t.type).map(t => [t.component, t.type, t.material, t.color, t.sizeSpec, t.supplier, t.qtyPerGarment]);
  if (trimsRows.length) {
    const tt = table(40, 400, ['Component', 'Type', 'Material', 'Color', 'Size/Spec', 'Vendor', 'Qty'], trimsRows, [130, 150, 130, 110, 120, 180, 223]);
    svg += tt.svg;
  }
  svg += skipIf(4);
  svg += `</g>`;

  // ─── Materials & BOM: Labels & Files (now stepIdx 3) ───
  yOff += pageH;
  svg += `<g id="page-4-bom-trims" transform="translate(0 ${yOff})">`;
  svg += pageFrame('BOM — Labels & Source Files', null, 4, numPages, styleInfo);
  svg += sectionHeading('Labels & Branding', 40, 110);
  const lblRows = (d.labelsBranding || []).filter(l => l.labelType || l.placement).map(l => [l.labelType, l.material, l.size, l.placement, l.artworkRef, l.notes]);
  if (lblRows.length) {
    const tl = table(40, 130, ['Label Type', 'Material', 'Size', 'Placement', 'Artwork Ref', 'Notes'], lblRows, [150, 130, 110, 180, 200, 273]);
    svg += tl.svg;
  }
  svg += sectionHeading('Source Documents', 40, 400);
  const attRows = (d.attachments || []).filter(a => a.name);
  if (attRows.length) {
    const ta = table(40, 420, ['File Name', 'Type', 'Size', 'Uploaded'], attRows.map(a => [a.name, (a.type || '').split('/').pop()?.toUpperCase() || '', a.size ? `${Math.round(a.size / 1024)} KB` : '', a.uploaded_at ? a.uploaded_at.slice(0, 10) : '']), [500, 120, 120, 303]);
    svg += ta.svg;
  }
  svg += skipIf(5);
  svg += `</g>`;

  // ─── Construction (Seam & Stitch — now stepIdx 7) ───
  yOff += pageH;
  svg += `<g id="page-5-construction" transform="translate(0 ${yOff})">`;
  svg += pageFrame('Construction Details', null, 5, numPages, styleInfo);
  svg += sectionHeading('Seam Specifications', 40, 110);
  const seamRows = (d.seams || []).filter(s => s.operation).map(s => [s.operation, s.seamType, s.stitchType, s.spiSpcm, s.threadColor, s.notes]);
  if (seamRows.length) {
    const t2 = table(40, 140, ['Operation', 'Seam Type', 'Stitch', 'SPI', 'Thread', 'Notes'], seamRows, [180, 140, 100, 60, 140, 423]);
    svg += t2.svg;
  }
  svg += skipIf(10);
  svg += `</g>`;

  // ─── Colorways ───
  yOff += pageH;
  svg += `<g id="page-6-colorways" transform="translate(0 ${yOff})">`;
  svg += pageFrame('Colorways', null, 6, numPages, styleInfo);
  svg += sectionHeading('Colorway Specification', 40, 110);
  const cwRows = (d.colorways || []).filter(c => c && (c.name || c.frColor || c.pantone || c.hex)).map(c =>
    [c.name, c.frColor, c.pantone, c.hex, c.fabricSwatch, c.approvalStatus]);
  if (cwRows.length) {
    const tc = table(40, 140, ['Name', 'FR Color', 'Pantone TCX', 'Hex', 'Fabric Swatch', 'Approval'], cwRows, [180, 140, 150, 120, 270, 183]);
    svg += tc.svg;
  }
  svg += skipIf(14);
  svg += `</g>`;

  // ─── Order & Delivery ───
  yOff += pageH;
  svg += `<g id="page-7-order" transform="translate(0 ${yOff})">`;
  svg += pageFrame('Order & Delivery', null, 7, numPages, styleInfo);
  svg += sectionHeading('Quantity Per Size', 40, 110);
  const qRows = (d.quantities || []).filter(q => q.colorway).map(q => [q.colorway, q.s, q.m, q.l, q.xl, q.unitCost]);
  if (qRows.length) {
    const t3 = table(40, 140, ['Colorway', 'S', 'M', 'L', 'XL', 'Unit $'], qRows, [280, 80, 80, 80, 80, 140]);
    svg += t3.svg;
  }
  const orderY = 300;
  svg += sectionHeading('Delivery Details', 40, orderY);
  svg += field('Ship To', d.shipTo, 40, orderY + 35);
  svg += field('Location', d.deliveryLocation, 400, orderY + 35);
  svg += field('Method', d.shipMethod, 700, orderY + 35);
  svg += field('Incoterm', d.incoterm, 40, orderY + 85);
  svg += field('Target Ship', d.targetShipDate, 400, orderY + 85);
  svg += field('Target Arrival', d.targetArrivalDate, 700, orderY + 85);
  svg += skipIf(20);
  svg += `</g>`;

  svg += `</svg>`;
  return svg;
}

export function svgToBlob(svgString) {
  return new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
}

// Storage-aware variant: pre-resolves any { path } image refs into inline
// data URLs so the exported SVG is fully self-contained (signed URLs would
// expire and break the file when the recipient opens it later).
export async function generateTechPackSVGAsync(pack) {
  const { resolveImagesToDataUrls } = await import('./plmAssets');
  const resolvedImages = await resolveImagesToDataUrls(pack.images || []);
  return generateTechPackSVG({ ...pack, images: resolvedImages });
}
