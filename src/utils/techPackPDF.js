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

  // ─── Page 000: Competitor Landscape (Merchandising) ───
  newPage('Competitor Landscape', null, 0);
  let y = 28;
  sectionHeading('Pricing & Features', y); y += 8;
  const compRows = (d.competitors || []).filter(c => c.brand || c.product || c.price).map(c =>
    [c.brand, c.product, c.price, c.currency, c.features, c.notes]);
  table(['Brand', 'Product', 'Price', 'Currency', 'Key Features', 'Notes'], compRows, 10, y, [40, 60, 28, 22, 80, 47]);
  y += 18 + compRows.length * 6;
  sectionHeading('Competitive Landscape — FR Positioning', y); y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...hex(FR.slate));
  (d.competitivePositioning || '').split('\n').forEach((line, i) => doc.text(line, 10, y + i * 5, { maxWidth: W - 20 }));

  // ─── Page 00: Merchandising Preview placeholder ───
  newPage('Merchandising Preview', null, 1);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...hex(FR.stone));
  doc.text('COMING SOON', W / 2, 80, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(20);
  doc.setTextColor(...hex(FR.slate));
  doc.text('Storefront Visualization', W / 2, 100, { align: 'center' });
  doc.setFontSize(9);
  doc.setTextColor(...hex(FR.stone));
  doc.text('Visualize this product on the live storefront before sampling — prototype', W / 2, 115, { align: 'center' });
  doc.text('merchandising, hero imagery, and PDP copy at the design phase.', W / 2, 122, { align: 'center' });

  // ─── Page 01: Cover ───
  newPage('Tech Pack', `Rev. ${new Date().toISOString().slice(0, 10)}`, 2);
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
  newPage('Identity & Classification', null, 2);
  y = 28;
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
  newPage('Design & Construction', null, 3);
  y = 28;
  sectionHeading('Fit & Features', y); y += 8;
  field('Fit', d.fit, 10, y); y += 12;
  field('Key Features', d.keyFeatures, 10, y); y += 20;
  field('Design Notes', d.designNotes, 10, y); y += 6;
  addImage('design-refs', 180, 28, 100, 80);

  // ─── Materials → BOM: Fabrics & Trims (now stepIdx 2) ───
  // ─── Bill of Materials → Fabrics (stepIdx 4) ───
  newPage('Fabrics', null, 4);
  y = 28;
  sectionHeading('Picked from PLM Library', y); y += 8;
  const fabRowsA = (d.pickedFabrics || []).map((f, i) =>
    [String(i + 1), f.role || '', f.fabricId || '—', f.notes || '']);
  table(['#', 'Role', 'Fabric ID', 'Notes'], fabRowsA, 10, y, [10, 50, 80, 167]);

  // ─── Bill of Materials → Trims (stepIdx 5) ───
  newPage('Trims', null, 5);
  y = 28;
  sectionHeading('Component Pack References', y); y += 8;
  const trimRowsA = (d.pickedTrims || []).map((t, i) =>
    [String(i + 1), t.role || '', t.componentId || '—', t.notes || '']);
  table(['#', 'Role', 'Component ID', 'Notes'], trimRowsA, 10, y, [10, 50, 80, 167]);

  // ─── Bill of Materials → Packaging (stepIdx 6) ───
  newPage('Packaging', null, 6);
  y = 28;
  sectionHeading('Component Pack References', y); y += 8;
  const pkgRowsA = (d.pickedPackaging || []).map((p, i) =>
    [String(i + 1), p.role || '', p.componentId || '—', p.notes || '']);
  table(['#', 'Role', 'Component ID', 'Notes'], pkgRowsA, 10, y, [10, 50, 80, 167]);

  // ─── Cut & Sew → Flat Lay Diagrams (stepIdx 7) ───
  newPage('Flat Lay Diagrams', null, 7);
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

  // ─── Cut & Sew → Construction Details Page 1 (stepIdx 5) ───
  newPage('Construction Details — Page 1', null, 8);
  y = 28;
  sectionHeading('Detail Callouts', y); y += 8;
  const cdRows1 = (d.constructionDetailsPage1 || []).map(c =>
    [String(c.num), c.title || '', c.description || '']);
  table(['#', 'Title', 'Description'], cdRows1, 10, y, [15, 60, 202]);

  // ─── Cut & Sew → Construction Details Page 2 (stepIdx 6) ───
  newPage('Construction Details — Page 2', null, 9);
  y = 28;
  sectionHeading('Detail Callouts', y); y += 8;
  const cdRows2 = (d.constructionDetailsPage2 || []).map(c =>
    [String(c.num), c.title || '', c.description || '']);
  table(['#', 'Title', 'Description'], cdRows2, 10, y, [15, 60, 202]);

  // ─── Cut & Sew → Seam & Stitch (now stepIdx 7) ───
  newPage('Seam & Stitch Specifications', null, 10);
  y = 28;
  sectionHeading('Seam Specifications', y); y += 8;
  const seamRows = (d.seams || []).filter(s => s.operation).map(s =>
    [s.operation, s.seamType, s.stitchType, s.spiSpcm, s.threadColor, s.notes]);
  table(['Operation', 'Seam Type', 'Stitch', 'SPI', 'Thread', 'Notes'], seamRows, 10, y, [50, 40, 30, 20, 40, 97]);

  // ─── Cut & Sew → Pattern & Cutting ───
  newPage('Pattern Pieces & Cutting', null, 11);
  y = 28;
  const ppRows = (d.patternPieces || []).filter(p => p.name).map(p =>
    [p.name, p.qty, p.fabric, p.grain, p.fusing, p.notes]);
  table(['Piece', 'Qty', 'Fabric', 'Grain', 'Fusing', 'Notes'], ppRows, 10, y, [50, 20, 40, 40, 30, 97]);
  y += 30 + ppRows.length * 6;
  field('Cutting Notes', d.cuttingNotes, 10, y);

  // ─── Cut & Sew → Points of Measure ───
  newPage('Points of Measure (cm)', null, 12);
  y = 28;
  field('Size Type', d.sizeType, 10, y); y += 14;
  const sz = d.sizeType === 'waist' ? ['W30', 'W32', 'W34', 'W36'] : ['S', 'M', 'L', 'XL'];
  const pomRows = (d.poms || []).filter(p => p.name).map(p =>
    [p.name, p.tol, p.s, p.m, p.l, p.xl]);
  table(['Measurement', 'Tol ±', ...sz], pomRows, 10, y, [70, 25, 30, 30, 30, 30]);

  // ─── Cut & Sew → Graded Size Matrix ───
  newPage('Graded Size Matrix (cm)', null, 13);
  y = 28;
  const matrix = d.gradedSizeMatrix || { baseSize: 'M', grading: [] };
  const rawMSizes = Array.isArray(d.sizeRange)
    ? d.sizeRange
    : (d.sizeRange ? String(d.sizeRange).split(/[/,]+/).map(s => s.trim()).filter(Boolean) : []);
  const matrixSizes = rawMSizes.length ? rawMSizes : ['S', 'M', 'L', 'XL'];
  const baseSize = matrixSizes.includes(matrix.baseSize) ? matrix.baseSize : matrixSizes[0];
  const computeCell = (pom, s) => {
    const base = parseFloat(pom[baseSize.toLowerCase()]);
    if (!Number.isFinite(base)) return '—';
    if (s === baseSize) return base.toFixed(1);
    const g = (matrix.grading || []).find(x => x.pomName === pom.name);
    const dv = g?.perSizeDelta?.[s];
    if (dv === undefined || dv === null || Number.isNaN(dv)) return '—';
    return (base + Number(dv)).toFixed(1);
  };
  const matrixRows = (d.poms || []).filter(p => p.name).map(p => [p.name, ...matrixSizes.map(s => computeCell(p, s))]);
  const sizeColW = Math.floor((W - 20 - 70) / matrixSizes.length);
  table(['Measurement', ...matrixSizes], matrixRows, 10, y, [70, ...matrixSizes.map(() => sizeColW)]);

  // ─── Embellishments → Colorways ───
  newPage('Colorways', null, 14);
  y = 28;
  sectionHeading('Colorway Specification', y); y += 8;
  const cwRows = (d.colorways || []).filter(c => c.name).map(c =>
    [c.name, c.frColor, c.pantone, c.hex, c.fabricSwatch, c.approvalStatus]);
  table(['Name', 'FR Color', 'Pantone', 'Hex', 'Fabric Swatch', 'Approval'], cwRows, 10, y, [55, 45, 50, 40, 60, 27]);

  // ─── Embellishments → Artwork & Placement ───
  newPage('Artwork & Placement', null, 15);
  y = 28;
  sectionHeading('Logo & Method', y); y += 8;
  field('Front Logo', d.logoFront, 10, y);
  field('Back Logo', d.logoBack, 100, y);
  field('Method', d.logoMethod, 200, y); y += 18;
  sectionHeading('Placement Detail', y); y += 8;
  const apRows = (d.artworkPlacements || []).filter(p => p.placement || p.artworkFile).map(p =>
    [p.placement, p.artworkFile, p.method, p.sizeCm, p.positionFrom, p.color, p.notes]);
  table(['Placement', 'Artwork File', 'Method', 'Size (cm)', 'Position From', 'Color', 'Notes'], apRows, 10, y, [40, 45, 40, 25, 40, 30, 57]);

  // ─── Treatments → Garment Treatments ───
  newPage('Garment Treatments', null, 16);
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

  // ─── QC → Compliance & Testing ───
  newPage('Compliance & Testing', null, 17);
  y = 28;
  sectionHeading('Shipping Requirements', y); y += 8;
  const shipRows = (d.shippingReqs || []).filter(r => r.requirement || r.specification).map(r =>
    [r.requirement, r.specification, r.notes]);
  table(['Requirement', 'Specification', 'Notes'], shipRows, 10, y, [70, 130, 77]);
  y += 24 + shipRows.length * 6;
  sectionHeading('Testing Standards', y); y += 8;
  const testRows = (d.testingStandards || []).filter(t => t.test || t.standard).map(t =>
    [t.test, t.standard, t.requirement, t.testMethod, t.passFail]);
  table(['Test', 'Standard', 'Requirement', 'Test Method', 'Pass-Fail'], testRows, 10, y, [55, 55, 55, 60, 52]);

  // ─── QC → Quality Inspection (AQL) ───
  newPage('Quality Inspection (AQL)', null, 18);
  y = 28;
  const qi = d.qualityInspection || { aqlMajor: '2.5', aqlMinor: '4.0', inspectionStage: 'During Production', checklist: [], photoRequirements: '' };
  sectionHeading('AQL Standard', y); y += 8;
  field('Major (AQL)', qi.aqlMajor, 10, y);
  field('Minor (AQL)', qi.aqlMinor, 80, y);
  field('Inspection Stage', qi.inspectionStage, 150, y); y += 18;
  sectionHeading('Inspection Checklist', y); y += 8;
  const cqRows = (qi.checklist || []).filter(c => c.area || c.criterion).map(c =>
    [c.area, c.criterion, c.severity]);
  table(['Area', 'Criterion', 'Severity'], cqRows, 10, y, [55, 180, 42]);
  y += 24 + cqRows.length * 6;
  sectionHeading('Photo Requirements', y); y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...hex(FR.slate));
  (qi.photoRequirements || '—').split('\n').forEach((line, i) => doc.text(line, 10, y + i * 5, { maxWidth: W - 20 }));

  // ─── Packaging → Labels & Packaging ───
  newPage('Labels & Packaging', null, 19);
  y = 28;
  field('Packaging', d.packaging, 10, y); y += 14;
  field('Packaging Notes', d.packagingNotes, 10, y); y += 14;
  sectionHeading('Care Instructions', y); y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...hex(FR.slate));
  const careLines = (d.careInstructions || '').split('\n');
  careLines.forEach((line, i) => doc.text(line, 10, y + i * 5));

  // ─── Logistics → Order & Delivery ───
  newPage('Order & Delivery', null, 20);
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

  // ─── Logistics → Packing List ───
  newPage('Packing List', null, 20);
  y = 28;
  const pkRows = (d.cartons || []).filter(c => c.cartonNum).map(c =>
    [c.cartonNum, c.colorway, c.sizeBreakdown, c.qtyPerCarton, c.dims, c.grossWeight, c.netWeight]);
  table(['#', 'Colorway', 'Size Breakdown', 'Qty', 'Dims (cm)', 'Gross kg', 'Net kg'], pkRows, 10, y, [15, 40, 60, 25, 40, 30, 67]);

  // ─── Sign-off → Review & Revision ───
  newPage('Review & Revision', null, 21);
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
