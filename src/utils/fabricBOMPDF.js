// Single-page A4 PDF for the fabric BOM card. Lands inside the Tech Pack
// BOM section so the mill receives the same visual snapshot we use
// internally — front/back of fabric, the chosen swatch, fabric/mill
// numbers, and commercial terms.
//
// The same renderer powers the live <FabricBOMPreview /> in the builder
// (canvas-on-screen version) — so what the user sees in the library is
// what the mill prints in the tech pack BOM page.

import { jsPDF } from 'jspdf';
import { getAssetUrl, isLegacyDataUrl } from './plmAssets';
import { FABRIC_WEAVE_LABEL } from './fabricLibrary';

const FR = {
  slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70',
  soil: '#9A816B', white: '#FFFFFF',
};

const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function fmtPrice(p) {
  if (p == null || p === '' || Number.isNaN(Number(p))) return '—';
  return `$${Number(p).toFixed(2)} / yd`;
}

function fmtNum(n, suffix = '') {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
  return `${Number(n)}${suffix}`;
}

// Resolve a single ref (data URL, https URL, or Storage path) into a
// self-contained data URL the PDF can embed synchronously.
async function refToDataUrl(ref) {
  if (!ref) return null;
  if (isLegacyDataUrl(ref)) return ref;
  let url = ref;
  if (!/^https?:\/\//i.test(ref)) {
    url = await getAssetUrl(ref);
    if (!url) return null;
  }
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('fabricBOMPDF refToDataUrl:', err);
    return null;
  }
}

async function preloadImages(fabric) {
  const [front, back, ...colors] = await Promise.all([
    refToDataUrl(fabric.front_image_url),
    refToDataUrl(fabric.back_image_url),
    ...((fabric.color_card_images || []).map(c => refToDataUrl(c.url))),
  ]);
  const colorEntries = (fabric.color_card_images || []).map((c, i) => ({
    label: c.label, hex: c.hex, url: colors[i],
  }));
  return { front, back, colors: colorEntries };
}

export async function generateFabricBOMPDF(fabric) {
  const { front, back, colors } = await preloadImages(fabric);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  drawBOMPage(doc, fabric, { front, back, colors });
  doc.save(`${fabric.code || 'fabric'}-${(fabric.mill_fabric_no || 'bom').replace(/[^a-z0-9-]/gi, '_')}.pdf`);
}

// Exposed so the live preview component can render to a temporary doc and
// rasterize into a canvas for on-screen display.
export function drawBOMPage(doc, fabric, images) {
  const W = 210, H = 297; // A4 portrait
  const M = 12; // outer margin

  // ─── Header ───────────────────────────────────────────────────────
  doc.setFillColor(...hex(FR.slate));
  doc.rect(0, 0, W, 22, 'F');
  doc.setTextColor(...hex(FR.salt));
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
  doc.text('FOREIGN RESOURCE CO.  ·  FABRIC BOM CARD', M, 8);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(15);
  doc.text(fabric.name || 'Untitled fabric', M, 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.setTextColor(...hex(FR.sand));
  const subtitle = [
    fabric.code,
    fabric.mill_fabric_no ? `Mill # ${fabric.mill_fabric_no}` : null,
    fabric.version,
    FABRIC_WEAVE_LABEL[fabric.weave] || fabric.weave,
    fabric.category ? fabric.category.toUpperCase() : null,
  ].filter(Boolean).join('  ·  ');
  doc.text(subtitle, M, 20);

  // ─── Identity / spec strip ────────────────────────────────────────
  let y = 30;
  doc.setTextColor(...hex(FR.slate));
  doc.setDrawColor(...hex(FR.sand));
  doc.setLineWidth(0.2);

  // Two-row identity table.
  const labelStyle = () => { doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...hex(FR.stone)); };
  const valueStyle = () => { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...hex(FR.slate)); };

  const cellW = (W - M * 2) / 4;
  const rowH = 12;

  function cell(col, row, label, value) {
    const x = M + col * cellW;
    const yy = y + row * rowH;
    labelStyle();
    doc.text(label.toUpperCase(), x + 2, yy + 4);
    valueStyle();
    doc.text(String(value || '—'), x + 2, yy + 10);
  }

  cell(0, 0, 'Mill / Vendor', fabric.mill_id || '—');
  cell(1, 0, 'Mill Fabric #', fabric.mill_fabric_no || '—');
  cell(2, 0, 'Composition', fabric.composition || '—');
  cell(3, 0, 'Weight', fmtNum(fabric.weight_gsm, ' gsm'));

  cell(0, 1, 'Lead Time', fmtNum(fabric.lead_time_days, ' days'));
  cell(1, 1, 'MOQ', fmtNum(fabric.moq_yards, ' yd'));
  cell(2, 1, 'Price', fmtPrice(fabric.price_per_yard_usd));
  cell(3, 1, 'Width', fmtNum(fabric.width_cm, ' cm'));

  // Divider under spec strip.
  y += rowH * 2 + 2;
  doc.setDrawColor(...hex(FR.sand));
  doc.line(M, y, W - M, y);

  // ─── Front / Back hero photos ─────────────────────────────────────
  y += 4;
  const photoH = 78;
  const photoW = (W - M * 2 - 4) / 2;

  function photoBox(x, label, src) {
    doc.setDrawColor(...hex(FR.sand));
    doc.setFillColor(...hex(FR.salt));
    doc.rect(x, y, photoW, photoH, 'FD');
    if (src) {
      try { doc.addImage(src, 'JPEG', x + 0.5, y + 0.5, photoW - 1, photoH - 1, undefined, 'FAST'); }
      catch (err) { console.warn('FabricBOMPDF addImage:', err); }
    } else {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9);
      doc.setTextColor(...hex(FR.stone));
      doc.text('No image', x + photoW / 2, y + photoH / 2, { align: 'center' });
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
    doc.setTextColor(...hex(FR.salt));
    doc.setFillColor(...hex(FR.slate));
    doc.rect(x, y + photoH - 6, 18, 6, 'F');
    doc.text(label.toUpperCase(), x + 9, y + photoH - 2, { align: 'center' });
  }

  photoBox(M, 'FRONT', images.front);
  photoBox(M + photoW + 4, 'BACK', images.back);

  y += photoH + 6;

  // ─── Color card ───────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.setTextColor(...hex(FR.slate));
  doc.text('COLOR CARD', M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.setTextColor(...hex(FR.stone));
  doc.text(`${(images.colors || []).length} colorways available from this mill`, W - M, y, { align: 'right' });

  y += 3;
  const cols = 6;
  const swatchGap = 3;
  const swatchW = (W - M * 2 - swatchGap * (cols - 1)) / cols;
  const swatchH = swatchW + 8;
  const list = images.colors || [];
  const maxRows = Math.max(1, Math.floor((H - y - 24) / (swatchH + 4)));
  const maxItems = cols * maxRows;
  list.slice(0, maxItems).forEach((c, i) => {
    const r = Math.floor(i / cols);
    const cc = i % cols;
    const x = M + cc * (swatchW + swatchGap);
    const yy = y + r * (swatchH + 4);
    if (c.url) {
      try { doc.addImage(c.url, 'JPEG', x, yy, swatchW, swatchW, undefined, 'FAST'); }
      catch (err) { console.warn('FabricBOMPDF swatch:', err); }
    } else if (c.hex) {
      doc.setFillColor(...hex(c.hex));
      doc.rect(x, yy, swatchW, swatchW, 'F');
    } else {
      doc.setFillColor(...hex(FR.salt));
      doc.setDrawColor(...hex(FR.sand));
      doc.rect(x, yy, swatchW, swatchW, 'FD');
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6);
    doc.setTextColor(...hex(FR.slate));
    const label = (c.label || '').slice(0, 24);
    doc.text(label, x + swatchW / 2, yy + swatchW + 4, { align: 'center' });
  });

  // ─── Footer ───────────────────────────────────────────────────────
  doc.setDrawColor(...hex(FR.soil));
  doc.setLineWidth(0.3);
  doc.line(M, H - 14, W - M, H - 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.setTextColor(...hex(FR.stone));
  doc.text(`${fabric.code || ''}  ·  ${fabric.version || ''}  ·  Generated ${new Date().toLocaleDateString('en-US')}`, M, H - 8);
  doc.text('FOREIGN RESOURCE CO.', W - M, H - 8, { align: 'right' });
}
