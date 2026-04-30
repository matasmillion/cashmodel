// Tech Pack PDF generator — client-side using jsPDF
// A4 landscape, FR brand-styled, functional (not pixel-match to the reportlab template yet)

import { jsPDF } from 'jspdf';
import { resolveImagesToDataUrls } from './plmAssets';

const FR = {
  slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70',
  soil: '#9A816B', white: '#FFFFFF',
};

const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export async function generateTechPackPDF(pack) {
  const d = pack.data || {};
  // Pre-resolve any Storage-backed image refs into inline data URLs so jsPDF
  // can addImage() them synchronously below — signed URLs would 401 for the
  // recipient, and addImage doesn't fetch.
  const images = await resolveImagesToDataUrls(pack.images || []);
  const skippedSteps = Array.isArray(d.skippedSteps) ? d.skippedSteps : [];

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297, H = 210;
  let page = 1;

  // Paints a "PAGE NOT USED" diagonal-cross overlay on top of the current
  // page when the user marked the corresponding wizard step as skipped.
  function drawSkipOverlay() {
    // White wash at 80% so the skipped page reads as explicitly suppressed
    // without losing the underlying context.
    doc.setFillColor(255, 255, 255);
    doc.setGState && doc.setGState(new doc.GState({ opacity: 0.8 }));
    doc.rect(0, 0, W, H, 'F');
    if (doc.setGState) doc.setGState(new doc.GState({ opacity: 0.4 }));
    doc.setDrawColor(192, 57, 43);
    doc.setLineWidth(3);
    doc.line(0, 0, W, H);
    doc.line(W, 0, 0, H);
    if (doc.setGState) doc.setGState(new doc.GState({ opacity: 1 }));
    doc.setFillColor(192, 57, 43);
    doc.roundedRect(W / 2 - 40, H / 2 - 8, 80, 16, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('PAGE NOT USED', W / 2, H / 2 + 2, { align: 'center' });
    // Reset state so subsequent pages draw normally.
    doc.setTextColor(...hex(FR.slate));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setDrawColor(...hex(FR.soil));
  }

  function header(title, subtitle) {
    doc.setFillColor(...hex(FR.slate));
    doc.rect(0, 0, W, 18, 'F');
    doc.setTextColor(...hex(FR.salt));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('FOREIGN RESOURCE CO.', 10, 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.text(title, 10, 14);
    if (subtitle) {
      doc.setFontSize(8);
      doc.setTextColor(...hex(FR.stone));
      doc.text(subtitle, W - 10, 14, { align: 'right' });
    }
    // Footer bar
    doc.setFillColor(...hex(FR.soil));
    doc.rect(0, 18, W, 0.5, 'F');
  }

  function footer() {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...hex(FR.stone));
    doc.text(`${d.styleName || 'Untitled'} · ${d.styleNumber || ''}`, 10, H - 7);
    doc.text(`Page ${page}`, W - 10, H - 7, { align: 'right' });
  }

  // `stepIdx` ties the PDF page back to the wizard STEPS[] index so the skip
  // flag from the builder can draw a "PAGE NOT USED" overlay here. Multiple
  // PDF pages may share a single step (e.g. the cover and identity pages
  // both map to step 0) — all of them pick up the skip. We record the page
  // → step mapping now and draw the overlay in a second pass at the end so
  // it lands on top of the page content, not underneath it.
  let currentStep = 0;
  const pageToStep = {};
  function newPage(title, subtitle, stepIdx) {
    if (page > 1) doc.addPage('a4', 'landscape');
    header(title, subtitle);
    footer();
    if (Number.isFinite(stepIdx)) currentStep = stepIdx;
    pageToStep[page] = currentStep;
    page++;
  }

  function sectionHeading(text, y) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...hex(FR.slate));
    doc.text(text, 10, y);
    doc.setDrawColor(...hex(FR.soil));
    doc.setLineWidth(0.5);
    doc.line(10, y + 1.5, 30, y + 1.5);
  }

  function field(label, value, x, y, wLabel = 40) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...hex(FR.soil));
    doc.text((label || '').toUpperCase(), x, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...hex(FR.slate));
    doc.text(String(value || '—'), x, y + 4);
  }

  function table(headers, rows, x, y, colWidths) {
    const rowH = 6;
    // header row
    doc.setFillColor(...hex(FR.slate));
    doc.rect(x, y, colWidths.reduce((a, b) => a + b, 0), rowH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...hex(FR.salt));
    let cx = x;
    headers.forEach((h, i) => {
      doc.text((h || '').toUpperCase(), cx + 1.5, y + 4);
      cx += colWidths[i];
    });
    // body rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...hex(FR.slate));
    rows.forEach((row, ri) => {
      const ry = y + rowH + ri * rowH;
      if (ri % 2 === 0) {
        doc.setFillColor(...hex(FR.salt));
        doc.rect(x, ry, colWidths.reduce((a, b) => a + b, 0), rowH, 'F');
      }
      let cx2 = x;
      row.forEach((cell, i) => {
        const txt = String(cell || '').slice(0, Math.floor(colWidths[i] / 1.8));
        doc.text(txt, cx2 + 1.5, ry + 4);
        cx2 += colWidths[i];
      });
    });
    // return end-y for chaining
    return y + rowH * (rows.length + 1);
  }

  function addImage(slotKey, x, y, w, h) {
    const img = images.find(i => i.slot === slotKey);
    if (!img) {
      doc.setDrawColor(...hex(FR.sand));
      doc.setLineDashPattern([1, 1], 0);
      doc.rect(x, y, w, h);
      doc.setLineDashPattern([], 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...hex(FR.stone));
      doc.text('(no photo)', x + w / 2, y + h / 2, { align: 'center' });
      return;
    }
    try {
      doc.addImage(img.data, 'JPEG', x, y, w, h, undefined, 'FAST');
    } catch (err) {
      console.error('image embed failed:', err);
    }
  }

  // ─── Page 1: Cover ───
  newPage('Tech Pack', `Rev. ${new Date().toISOString().slice(0, 10)}`, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(38);
  doc.setTextColor(...hex(FR.slate));
  doc.text(d.styleName || 'Untitled Tech Pack', W / 2, 90, { align: 'center' });
  doc.setFontSize(13);
  doc.setTextColor(...hex(FR.soil));
  doc.text(d.styleNumber || 'STYLE-000', W / 2, 102, { align: 'center' });
  doc.setFontSize(9);
  doc.setTextColor(...hex(FR.stone));
  doc.text([d.productCategory, d.productTier, d.season].filter(Boolean).join('  ·  '), W / 2, 115, { align: 'center' });
  // Status pill
  doc.setFillColor(...hex(FR.soil));
  doc.roundedRect(W / 2 - 25, 125, 50, 9, 2, 2, 'F');
  doc.setTextColor(...hex(FR.salt));
  doc.setFontSize(8);
  doc.text((d.status || 'DEVELOPMENT').toUpperCase(), W / 2, 131, { align: 'center' });

  // ─── Page 2: Identity & Classification ───
  newPage('Identity & Classification', null, 0);
  let y = 28;
  sectionHeading('Product', y); y += 8;
  field('Style Name', d.styleName, 10, y);
  field('Category', d.productCategory, 100, y);
  field('Tier', d.productTier, 180, y); y += 14;
  field('Season', d.season, 10, y);
  field('Target Retail', d.targetRetail, 100, y);
  field('Target FOB', d.targetFOB, 180, y); y += 14;
  field('Status', d.status, 10, y); y += 18;

  sectionHeading('SKU & Numbering', y); y += 8;
  field('Style Number', d.styleNumber, 10, y);
  field('SKU Prefix', d.skuPrefix, 100, y);
  field('Barcode Method', d.barcodeMethod, 180, y); y += 18;

  sectionHeading('Vendor', y); y += 8;
  field('Vendor', d.vendor, 10, y);
  field('Contact', d.vendorContact, 150, y); y += 14;
  field('Fabric Type', d.fabricType, 10, y);

  // ─── Page 3: Design ───
  newPage('Design & Construction', null, 1);
  y = 28;
  sectionHeading('Fit & Features', y); y += 8;
  field('Fit', d.fit, 10, y); y += 12;
  field('Key Features', d.keyFeatures, 10, y); y += 20;
  field('Design Notes', d.designNotes, 10, y); y += 6;
  addImage('design-refs', 180, 28, 100, 80);

  // ─── Page 4: Flat Lays ───
  newPage('Flat Lay Diagrams', null, 2);
  addImage('flatlay-front', 10, 28, 85, 90);
  addImage('flatlay-back', 105, 28, 85, 90);
  addImage('flatlay-detail', 200, 28, 85, 90);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...hex(FR.soil));
  doc.text('FRONT', 10, 125);
  doc.text('BACK', 105, 125);
  doc.text('DETAIL', 200, 125);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...hex(FR.slate));
  doc.text(d.flatLayNotes || '', 10, 140, { maxWidth: W - 20 });

  // ─── Page 5: Bill of Materials ───
  newPage('Bill of Materials', null, 3);
  y = 28;
  sectionHeading('Components', y); y += 8;
  const bomItems = d.bom || d.trims || [];
  const bomRows = bomItems.filter(b => b.component || b.type).map(b =>
    [b.component, b.type, b.material, b.color, b.weight || '', b.supplier || '', b.costPerUnit || '', b.notes]);
  table(['Component', 'Type / Spec', 'Material', 'Color', 'Weight', 'Supplier', 'Cost/Unit', 'Notes'], bomRows, 10, y, [30, 40, 35, 25, 20, 35, 25, 67]);

  // ─── Page 6: Color & Artwork ───
  newPage('Color & Artwork', null, 4);
  y = 28;
  sectionHeading('Colorways', y); y += 8;
  const cwRows = (d.colorways || []).filter(c => c.name).map(c => [c.name, c.frColor, c.pantone, c.hex]);
  table(['Name', 'FR Color', 'Pantone', 'Hex'], cwRows, 10, y, [70, 50, 60, 50]);
  y += 30 + cwRows.length * 6;
  sectionHeading('Logo Placement', y); y += 8;
  field('Front Logo', d.logoFront, 10, y);
  field('Back Logo', d.logoBack, 100, y);
  field('Method', d.logoMethod, 200, y);

  // ─── Page 7: Construction ───
  newPage('Construction Details', null, 5);
  y = 28;
  sectionHeading('Seam Specifications', y); y += 8;
  const seamRows = (d.seams || []).filter(s => s.operation).map(s =>
    [s.operation, s.seamType, s.stitchType, s.spiSpcm, s.threadColor, s.notes]);
  table(['Operation', 'Seam Type', 'Stitch', 'SPI', 'Thread', 'Notes'], seamRows, 10, y, [50, 40, 30, 20, 40, 97]);

  // ─── Page 8: Pattern & Cutting ───
  newPage('Pattern Pieces & Cutting', null, 7);
  y = 28;
  const ppRows = (d.patternPieces || []).filter(p => p.name).map(p =>
    [p.name, p.qty, p.fabric, p.grain, p.fusing, p.notes]);
  table(['Piece', 'Qty', 'Fabric', 'Grain', 'Fusing', 'Notes'], ppRows, 10, y, [50, 20, 40, 40, 30, 97]);
  y += 30 + ppRows.length * 6;
  field('Cutting Notes', d.cuttingNotes, 10, y);

  // ─── Page 9: POM ───
  newPage('Points of Measure (cm)', null, 8);
  y = 28;
  field('Size Type', d.sizeType, 10, y); y += 14;
  const sz = d.sizeType === 'waist' ? ['W30', 'W32', 'W34', 'W36'] : ['S', 'M', 'L', 'XL'];
  const pomRows = (d.poms || []).filter(p => p.name).map(p =>
    [p.name, p.tol, p.s, p.m, p.l, p.xl]);
  table(['Measurement', 'Tol ±', ...sz], pomRows, 10, y, [70, 25, 30, 30, 30, 30]);

  // ─── Page 10: Treatments ───
  newPage('Garment Treatments', null, 9);
  y = 28;
  sectionHeading('Wash & Dye', y); y += 8;
  const trtRows = (d.treatments || []).filter(t => t.treatment).map(t =>
    [t.treatment, t.process, t.temp, t.duration, t.chemicals, t.notes]);
  table(['Treatment', 'Process', 'Temp', 'Duration', 'Chemicals', 'Notes'], trtRows, 10, y, [45, 50, 20, 25, 50, 87]);
  y += 30 + trtRows.length * 6;
  sectionHeading('Distressing', y); y += 8;
  const distRows = (d.distressing || []).filter(dd => dd.area).map(dd =>
    [dd.area, dd.technique, dd.intensity, dd.notes]);
  table(['Area', 'Technique', 'Intensity', 'Notes'], distRows, 10, y, [50, 50, 30, 147]);

  // ─── Page 11: Labels & Packaging ───
  newPage('Labels & Packaging', null, 10);
  y = 28;
  field('Packaging', d.packaging, 10, y); y += 14;
  field('Packaging Notes', d.packagingNotes, 10, y); y += 14;
  sectionHeading('Care Instructions', y); y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...hex(FR.slate));
  const careLines = (d.careInstructions || '').split('\n');
  careLines.forEach((line, i) => doc.text(line, 10, y + i * 5));

  // ─── Page 12: Order & Delivery ───
  newPage('Order & Delivery', null, 11);
  y = 28;
  sectionHeading('Quantity Per Size', y); y += 8;
  const qRows = (d.quantities || []).filter(q => q.colorway).map(q =>
    [q.colorway, q.s, q.m, q.l, q.xl, q.unitCost]);
  table(['Colorway', 'S', 'M', 'L', 'XL', 'Unit $'], qRows, 10, y, [70, 20, 20, 20, 20, 40]);
  y += 30 + qRows.length * 6;
  sectionHeading('Delivery Details', y); y += 8;
  field('Ship To', d.shipTo, 10, y);
  field('Location', d.deliveryLocation, 100, y);
  field('Method', d.shipMethod, 200, y); y += 14;
  field('Incoterm', d.incoterm, 10, y);
  field('Target Ship', d.targetShipDate, 100, y);
  field('Target Arrival', d.targetArrivalDate, 200, y);

  // ─── Page 13: Packing List ───
  newPage('Packing List', null, 11);
  y = 28;
  const pkRows = (d.cartons || []).filter(c => c.cartonNum).map(c =>
    [c.cartonNum, c.colorway, c.sizeBreakdown, c.qtyPerCarton, c.dims, c.grossWeight, c.netWeight]);
  table(['#', 'Colorway', 'Size Breakdown', 'Qty', 'Dims (cm)', 'Gross kg', 'Net kg'], pkRows, 10, y, [15, 40, 60, 25, 40, 30, 67]);

  // ─── Page 14: Review & Revision ───
  newPage('Review & Revision', null, 13);
  y = 40;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...hex(FR.slate));
  doc.text('Revision History', 10, y); y += 10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...hex(FR.stone));
  doc.text(`Generated: ${new Date().toLocaleString()}`, 10, y); y += 6;
  doc.text(`Source: Foreign Resource Cash Model — Product tab`, 10, y); y += 6;
  doc.text(`Tech pack ID: ${pack.id}`, 10, y);

  // Second pass — stamp the "PAGE NOT USED" overlay on top of any skipped
  // pages. Done after all content is drawn so the overlay actually lands
  // on top instead of under the page text / images.
  if (skippedSteps.length) {
    Object.entries(pageToStep).forEach(([pageNum, stepIdx]) => {
      if (!skippedSteps.includes(stepIdx)) return;
      doc.setPage(Number(pageNum));
      drawSkipOverlay();
    });
  }

  return doc.output('blob');
}
