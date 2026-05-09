// Single-page A4 LANDSCAPE PDF for the treatment BOM card. Mirrors the
// fabric BOM card's chrome (slate header, soil divider, footer) so the
// treatment library export and the tech-pack pages it lands on read as
// one document.
//
// Treatments are recipes the vendor reproduces — a stone wash, a garment
// dye, a print. We deliberately don't surface the chemistry/duration/
// temperature spec on the printable card: the brand doesn't dictate
// that to the laundry, the laundry hits a target swatch. The PDF
// instead carries: cover swatch, vendor + backup, target cost, lead
// time, MOQ, payment terms, designer notes, and a row of reference
// swatches the designer wants matched.

import { jsPDF } from 'jspdf';
import { getAssetUrl, isLegacyDataUrl } from './plmAssets';
import { TREATMENT_TYPE_LABEL } from './treatmentLibrary';
import { resolveVendor } from './vendorLibrary';
import { getFRColor } from './colorLibrary';

const FR = {
  slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70',
  soil: '#9A816B', white: '#FFFFFF',
};

const TOTAL_PAGES = 20;
const PAGE_LABEL = 'BOM-T';

const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function fmtMoney(p) {
  if (p == null || p === '' || Number.isNaN(Number(p))) return '—';
  return `$${Number(p).toFixed(2)} / unit`;
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
    console.warn('treatmentBOMPDF refToDataUrl:', err);
    return null;
  }
}

async function preloadImages(treatment) {
  const refs = (treatment.reference_swatch_urls || []).slice(0, 12);
  const [cover, swatch, ...references] = await Promise.all([
    refToDataUrl(treatment.cover_image),
    refToDataUrl(treatment.swatch_image_url),
    ...refs.map(refToDataUrl),
  ]);
  return { cover, swatch, references };
}

export async function generateTreatmentBOMPDF(treatment) {
  const images = await preloadImages(treatment);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  drawTreatmentPage(doc, treatment, images);
  const slug = (treatment.name || treatment.code || 'treatment').replace(/[^a-z0-9-]/gi, '_');
  doc.save(`${treatment.code || 'treatment'}-${slug}.pdf`);
}

function drawHeaderFooter(doc, { title, phase, styleNumber, styleInfo, pageLabel }) {
  const W = 297, H = 210;

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

  doc.setFont('times', 'normal'); doc.setFontSize(14);
  doc.setTextColor(...hex(FR.salt));
  doc.text(title, W / 2, 11, { align: 'center' });

  if (styleNumber) {
    doc.setFont('courier', 'bold'); doc.setFontSize(7.5);
    doc.setTextColor(...hex(FR.salt));
    doc.text(styleNumber, W - 10, 7, { align: 'right' });
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
  doc.setTextColor(...hex(FR.sand));
  doc.text(`PAGE ${pageLabel} / ${TOTAL_PAGES}`, W - 10, 13, { align: 'right' });

  doc.setFillColor(...hex(FR.soil));
  doc.rect(0, 18, W, 0.5, 'F');

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.setTextColor(...hex(FR.stone));
  doc.text(styleInfo, 10, H - 7);
  doc.text(`PAGE ${pageLabel} / ${TOTAL_PAGES}`, W - 10, H - 7, { align: 'right' });
}

export function drawTreatmentPage(doc, treatment, images) {
  const W = 297, H = 210;
  const M = 10;

  const primary = resolveVendor(treatment.primary_vendor_id);
  const backup  = resolveVendor(treatment.backup_vendor_id);
  const baseColor = treatment.base_color_id ? getFRColor(treatment.base_color_id) : null;
  const styleNumber = treatment.code || '';

  drawHeaderFooter(doc, {
    title: 'Treatment Spec Card',
    phase: 'Treatments',
    styleNumber,
    styleInfo: '© 2026 Foreign Resource Co. — Confidential Tech Pack',
    pageLabel: PAGE_LABEL,
  });

  // Subtitle.
  doc.setFont('times', 'normal'); doc.setFontSize(11);
  doc.setTextColor(...hex(FR.slate));
  const subtitle = [
    treatment.name || 'Untitled treatment',
    treatment.version,
    TREATMENT_TYPE_LABEL[treatment.type] || treatment.type,
    baseColor?.name ? `Base: ${baseColor.name}` : null,
  ].filter(Boolean).join('  ·  ');
  doc.text(subtitle, W / 2, 26, { align: 'center' });

  // ─── Spec strip ──────────────────────────────────────────────────
  const stripY = 32;
  const stripH = 14;
  const cells = [
    { label: 'Type',          value: TREATMENT_TYPE_LABEL[treatment.type] || treatment.type || '—' },
    { label: 'Base color',    value: baseColor?.name || treatment.base_color_id || '—' },
    { label: 'Vendor',        value: primary?.name || treatment.primary_vendor_id || '—' },
    { label: 'Backup',        value: backup?.name || treatment.backup_vendor_id || '—' },
    { label: 'Target cost',   value: fmtMoney(treatment.cost_per_unit_usd) },
    { label: 'Lead time',     value: fmtNum(treatment.lead_time_days, ' days') },
    { label: 'MOQ',           value: fmtNum(treatment.moq_units, ' units') },
    { label: 'Payment terms', value: primary?.payment_terms || '—' },
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
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.setTextColor(...hex(FR.slate));
    const value = String(c.value || '—');
    const maxChars = Math.floor((stripCellW - 4) / 1.6);
    const trimmed = value.length > maxChars ? value.slice(0, maxChars - 1) + '…' : value;
    doc.text(trimmed, x + 2, stripY + 10);
  });

  // ─── Reference swatch (left column) ──────────────────────────────
  const photoX = M;
  const photoY = stripY + stripH + 6;
  const photoW = 130;
  const photoH = 110;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(6);
  doc.setTextColor(...hex(FR.soil));
  doc.text('REFERENCE SWATCH', photoX, photoY - 1.5);

  doc.setDrawColor(...hex(FR.sand));
  doc.setFillColor(...hex(FR.salt));
  doc.rect(photoX, photoY, photoW, photoH, 'FD');

  const heroSrc = images.cover || images.swatch;
  if (heroSrc) {
    try { doc.addImage(heroSrc, 'JPEG', photoX + 0.3, photoY + 0.3, photoW - 0.6, photoH - 0.6, undefined, 'FAST'); }
    catch (err) { console.warn('treatmentBOMPDF cover:', err); }
  } else if (baseColor?.hex) {
    doc.setFillColor(...hex(baseColor.hex));
    doc.rect(photoX + 0.3, photoY + 0.3, photoW - 0.6, photoH - 0.6, 'F');
  } else {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
    doc.setTextColor(...hex(FR.stone));
    doc.text('No reference swatch uploaded', photoX + photoW / 2, photoY + photoH / 2, { align: 'center' });
  }

  // ─── Variations (right column) ───────────────────────────────────
  const refX = photoX + photoW + 8;
  const refY = photoY;
  const refW = W - refX - M;
  const refH = photoH;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(6);
  doc.setTextColor(...hex(FR.soil));
  doc.text('VARIATIONS · DETAIL ANGLES', refX, refY - 1.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...hex(FR.stone));
  const refCount = (images.references || []).length;
  doc.text(`${refCount} reference${refCount === 1 ? '' : 's'}`, refX + refW, refY - 1.5, { align: 'right' });

  doc.setDrawColor(...hex(FR.sand));
  doc.setFillColor(...hex(FR.salt));
  doc.rect(refX, refY, refW, refH, 'FD');

  const cols = 4;
  const swGap = 3;
  const swSize = (refW - swGap * (cols - 1) - 6) / cols;
  const rows = 2;
  const slice = (images.references || []).slice(0, cols * rows);
  slice.forEach((src, i) => {
    const r = Math.floor(i / cols);
    const cc = i % cols;
    const x = refX + 3 + cc * (swSize + swGap);
    const y = refY + 3 + r * (swSize + swGap);
    if (src) {
      try { doc.addImage(src, 'JPEG', x, y, swSize, swSize, undefined, 'FAST'); }
      catch (err) { console.warn('treatmentBOMPDF reference:', err); }
    } else {
      doc.setFillColor(...hex(FR.salt));
      doc.setDrawColor(...hex(FR.sand));
      doc.rect(x, y, swSize, swSize, 'FD');
    }
  });

  if (slice.length === 0) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
    doc.setTextColor(...hex(FR.stone));
    doc.text('AI-generated variations will land here after the next render',
      refX + refW / 2, refY + refH / 2, { align: 'center' });
  }

  // ─── Notes (full width) ──────────────────────────────────────────
  if (treatment.notes) {
    const ny = photoY + photoH + 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6);
    doc.setTextColor(...hex(FR.soil));
    doc.text('NOTES', M, ny);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.setTextColor(...hex(FR.slate));
    const lines = doc.splitTextToSize(treatment.notes, W - M * 2);
    doc.text(lines.slice(0, 4), M, ny + 4);
  }
}
