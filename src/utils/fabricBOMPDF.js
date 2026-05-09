// Single-page A4 LANDSCAPE PDF for the fabric BOM card. Lays out exactly
// like a tech pack page (slate header bar with FOREIGN RESOURCE CO. /
// title / page label, soil divider, and footer with copyright) so the
// fabric library export and the tech pack BOM page read as one document.

import { jsPDF } from 'jspdf';
import { getAssetUrl, isLegacyDataUrl } from './plmAssets';
import { FABRIC_WEAVE_LABEL } from './fabricLibrary';

const FR = {
  slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70',
  soil: '#9A816B', white: '#FFFFFF',
};

const TOTAL_PAGES = 20;
const PAGE_LABEL = 'BOM-F';

const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function fmtPrice(p) {
  if (p == null || p === '' || Number.isNaN(Number(p))) return '—';
  return `$${Number(p).toFixed(2)} / m`;
}
function fmtNum(n, suffix = '') {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
  return `${Number(n)}${suffix}`;
}

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
  const images = await preloadImages(fabric);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  drawBOMPage(doc, fabric, images);
  doc.save(`${fabric.code || 'fabric'}-${(fabric.mill_fabric_no || 'bom').replace(/[^a-z0-9-]/gi, '_')}.pdf`);
}

// ─── Tech-pack-matched page chrome ─────────────────────────────────────────
function drawHeaderFooter(doc, { title, phase, styleNumber, styleInfo, pageLabel }) {
  const W = 297, H = 210;

  // Header slate bar (height 18mm, mirrors the tech pack's 70/794 ratio).
  doc.setFillColor(...hex(FR.slate));
  doc.rect(0, 0, W, 18, 'F');

  doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
  doc.setTextColor(...hex(FR.salt));
  doc.text('FOREIGN RESOURCE CO.', 10, 7);

  if (phase) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
    doc.setTextColor(...hex(FR.sand));
    doc.text(phase.toUpperCase(), 10, 13);
  }

  // Centered title in serif.
  doc.setFont('times', 'normal'); doc.setFontSize(14);
  doc.setTextColor(...hex(FR.salt));
  doc.text(title, W / 2, 11, { align: 'center' });

  // Top-right style number + page label.
  if (styleNumber) {
    doc.setFont('courier', 'bold'); doc.setFontSize(7.5);
    doc.setTextColor(...hex(FR.salt));
    doc.text(styleNumber, W - 10, 7, { align: 'right' });
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
  doc.setTextColor(...hex(FR.sand));
  doc.text(`PAGE ${pageLabel} / ${TOTAL_PAGES}`, W - 10, 13, { align: 'right' });

  // Soil divider under the header.
  doc.setFillColor(...hex(FR.soil));
  doc.rect(0, 18, W, 0.5, 'F');

  // Footer.
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.setTextColor(...hex(FR.stone));
  doc.text(styleInfo, 10, H - 7);
  doc.text(`PAGE ${pageLabel} / ${TOTAL_PAGES}`, W - 10, H - 7, { align: 'right' });
}

// ─── Body ──────────────────────────────────────────────────────────────────
export function drawBOMPage(doc, fabric, images) {
  const W = 297, H = 210;
  const M = 10;

  const styleNumber = fabric.code
    ? (fabric.mill_fabric_no ? `${fabric.code} · #${fabric.mill_fabric_no}` : fabric.code)
    : '';

  drawHeaderFooter(doc, {
    title: 'Fabric BOM Card',
    phase: 'Materials',
    styleNumber,
    styleInfo: '© 2026 Foreign Resource Co. — Confidential Tech Pack',
    pageLabel: PAGE_LABEL,
  });

  // Sub-title centered under header.
  doc.setFont('times', 'normal'); doc.setFontSize(11);
  doc.setTextColor(...hex(FR.slate));
  const subtitle = [
    fabric.name || 'Untitled fabric',
    fabric.version,
    FABRIC_WEAVE_LABEL[fabric.weave] || fabric.weave,
    fabric.category ? fabric.category.toUpperCase() : null,
  ].filter(Boolean).join('  ·  ');
  doc.text(subtitle, W / 2, 26, { align: 'center' });

  // ─── Spec strip ──────────────────────────────────────────────────
  const stripY = 32;
  const stripH = 14;
  const cells = [
    { label: 'Mill / Vendor',  value: fabric.mill_id || '—' },
    { label: 'Mill Fabric #',  value: fabric.mill_fabric_no || '—', mono: true },
    { label: 'Composition',    value: fabric.composition || '—' },
    { label: 'Weight',         value: fmtNum(fabric.weight_gsm, ' gsm') },
    { label: 'Width',          value: fmtNum(fabric.width_cm, ' cm') },
    { label: 'Lead Time',      value: fmtNum(fabric.lead_time_days, ' days') },
    { label: 'MOQ',            value: fmtNum(fabric.moq_meters, ' m') },
    { label: 'Price',          value: fmtPrice(fabric.price_per_meter_usd) },
  ];
  const stripCellW = (W - M * 2) / cells.length;

  doc.setFillColor(...hex(FR.salt));
  doc.setDrawColor(...hex(FR.sand));
  doc.setLineWidth(0.2);
  doc.rect(M, stripY, W - M * 2, stripH, 'FD');

  cells.forEach((c, i) => {
    const x = M + i * stripCellW;
    if (i > 0) doc.line(x, stripY, x, stripY + stripH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5);
    doc.setTextColor(...hex(FR.soil));
    doc.text(String(c.label).toUpperCase(), x + 2, stripY + 4);
    doc.setFont(c.mono ? 'courier' : 'helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...hex(FR.slate));
    const value = String(c.value || '—');
    const maxChars = Math.floor((stripCellW - 4) / 1.6);
    const trimmed = value.length > maxChars ? value.slice(0, maxChars - 1) + '…' : value;
    doc.text(trimmed, x + 2, stripY + 10);
  });

  // ─── Photos (left column) ────────────────────────────────────────
  const photosX = M;
  const photosY = stripY + stripH + 6;
  const photoW = 130;
  const photoH = 70;
  const gap = 4;

  function photoBox(x, y, label, src) {
    doc.setDrawColor(...hex(FR.sand));
    doc.setFillColor(...hex(FR.salt));
    doc.rect(x, y, photoW, photoH, 'FD');
    if (src) {
      try { doc.addImage(src, 'JPEG', x + 0.3, y + 0.3, photoW - 0.6, photoH - 0.6, undefined, 'FAST'); }
      catch (err) { console.warn('FabricBOMPDF photo:', err); }
    } else {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
      doc.setTextColor(...hex(FR.stone));
      doc.text('No image', x + photoW / 2, y + photoH / 2, { align: 'center' });
    }
    doc.setFillColor(...hex(FR.slate));
    doc.rect(x, y + photoH - 5, 16, 5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6);
    doc.setTextColor(...hex(FR.salt));
    doc.text(label.toUpperCase(), x + 8, y + photoH - 1.5, { align: 'center' });
  }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(6);
  doc.setTextColor(...hex(FR.soil));
  doc.text('FABRIC PHOTOS', photosX, photosY - 1.5);

  photoBox(photosX, photosY, 'FRONT', images.front);
  photoBox(photosX, photosY + photoH + gap, 'BACK', images.back);

  // ─── Color card (right column) ───────────────────────────────────
  const ccX = photosX + photoW + 8;
  const ccY = photosY;
  const ccW = W - ccX - M;
  const ccH = photoH * 2 + gap;
  const colors = images.colors || [];

  doc.setFont('helvetica', 'bold'); doc.setFontSize(6);
  doc.setTextColor(...hex(FR.soil));
  doc.text('COLOR CARD', ccX, ccY - 1.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...hex(FR.stone));
  doc.text(`${colors.length} colorways`, ccX + ccW, ccY - 1.5, { align: 'right' });

  doc.setDrawColor(...hex(FR.sand));
  doc.setFillColor(...hex(FR.salt));
  doc.rect(ccX, ccY, ccW, ccH, 'FD');

  const cols = 6;
  const swGap = 2.5;
  const swSize = (ccW - swGap * (cols - 1) - 6) / cols;
  const labelH = 4;
  const rowH = swSize + labelH + 1.5;
  const maxRows = Math.max(1, Math.floor((ccH - 3) / rowH));
  const maxItems = cols * maxRows;
  const slice = colors.slice(0, maxItems);
  slice.forEach((c, i) => {
    const r = Math.floor(i / cols);
    const cc = i % cols;
    const x = ccX + 3 + cc * (swSize + swGap);
    const y = ccY + 3 + r * rowH;
    if (c.url) {
      try { doc.addImage(c.url, 'JPEG', x, y, swSize, swSize, undefined, 'FAST'); }
      catch (err) { console.warn('FabricBOMPDF swatch:', err); }
    } else if (c.hex) {
      doc.setFillColor(...hex(c.hex));
      doc.rect(x, y, swSize, swSize, 'F');
    } else {
      doc.setFillColor(...hex(FR.salt));
      doc.setDrawColor(...hex(FR.sand));
      doc.rect(x, y, swSize, swSize, 'FD');
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5);
    doc.setTextColor(...hex(FR.slate));
    const label = (c.label || '').slice(0, 18);
    doc.text(label, x + swSize / 2, y + swSize + 3, { align: 'center' });
  });

  if (colors.length === 0) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
    doc.setTextColor(...hex(FR.stone));
    doc.text('No swatches uploaded yet', ccX + ccW / 2, ccY + ccH / 2, { align: 'center' });
  }

  // ─── Hand / notes caption ────────────────────────────────────────
  if (fabric.hand || fabric.notes) {
    const y = photosY + photoH * 2 + gap + 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6);
    doc.setTextColor(...hex(FR.soil));
    doc.text('HAND / NOTES', M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.setTextColor(...hex(FR.slate));
    const captionWidth = W - M * 2;
    const text = [fabric.hand, fabric.notes].filter(Boolean).join(' — ');
    const wrapped = doc.splitTextToSize(text, captionWidth);
    wrapped.slice(0, 2).forEach((line, i) => {
      doc.text(line, M, y + 4 + i * 4);
    });
  }
}
