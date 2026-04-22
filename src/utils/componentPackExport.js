// Trim Pack export — multi-page SVG + PDF built from the live
// `ComponentPackPagePreview` component. SVG export concatenates the 7
// A4-landscape pages into one editable vertical strip; PDF export
// mounts each page in a hidden DOM node and rasterises it with
// html2canvas (required because the preview uses `<foreignObject>` for
// multiline text, which browsers refuse to serialise through the usual
// SVG-as-image → canvas path for security reasons).

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import ComponentPackPagePreview from '../components/techpack/ComponentPackPagePreview';

const PAGE_W = 1123;
const PAGE_H = 794;
const TOTAL_PAGES = 7;

// ── SVG export ─────────────────────────────────────────────────────────────
// `renderToStaticMarkup` gives us the page's root <svg> as a string. We
// strip the wrapper and re-wrap inside a <g transform="translate(0, y)"> so
// the 7 pages land stacked in one viewBox. This one imports into Illustrator
// as a tall multi-page document.
function renderPageMarkup(data, images, step) {
  const markup = renderToStaticMarkup(
    createElement(ComponentPackPagePreview, { data, images, step })
  );
  return markup.includes('xmlns=')
    ? markup
    : markup.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
}

export function generateComponentPackSVG(data, images) {
  const gap = 24;
  const totalH = PAGE_H * TOTAL_PAGES + gap * (TOTAL_PAGES - 1);
  const pages = [];
  for (let i = 0; i < TOTAL_PAGES; i++) {
    const pageSVG = renderPageMarkup(data, images, i);
    const inner = pageSVG.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const y = i * (PAGE_H + gap);
    pages.push(
      `<g transform="translate(0,${y})">` +
      `<rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="#FFFFFF"/>` +
      inner +
      `</g>`
    );
  }
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${totalH}" width="${PAGE_W}" height="${totalH}">` +
    pages.join('\n') +
    `</svg>`
  );
}

export function svgToBlob(svg) {
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}

// ── PDF export ─────────────────────────────────────────────────────────────
// Mount the preview into an off-screen div one page at a time, let React
// flush, html2canvas the result, addImage into jsPDF. A single A4 landscape
// page per wizard step.
function waitForFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

// Pre-warm any <img> tags inside the node so html2canvas doesn't capture
// an empty slot while the data URL is still decoding. Data URL images are
// usually instant but we still wait one tick so the browser has laid them
// out before rasterisation.
function waitForImages(root) {
  const imgs = root.querySelectorAll('img, image');
  if (!imgs.length) return Promise.resolve();
  const pending = [];
  imgs.forEach(img => {
    // SVG <image> elements use href instead of the HTMLImageElement.src
    const src = img.getAttribute('href') || img.getAttribute('xlink:href') || img.src;
    if (!src) return;
    if (img instanceof HTMLImageElement && img.complete) return;
    pending.push(new Promise(resolve => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
      // Fallback safety so a broken image never hangs the export.
      setTimeout(resolve, 1500);
    }));
  });
  return Promise.all(pending);
}

export async function generateComponentPackPDF(data, images) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const mmW = 297;
  const mmH = 210;

  // One shared hidden host for all pages; we remount the React tree inside
  // it between pages.
  const host = document.createElement('div');
  host.style.cssText = `position: fixed; top: 0; left: -10000px;
    width: ${PAGE_W}px; height: ${PAGE_H}px;
    background: #FFFFFF; pointer-events: none; overflow: hidden;`;
  document.body.appendChild(host);

  const root = createRoot(host);

  try {
    for (let i = 0; i < TOTAL_PAGES; i++) {
      if (i > 0) doc.addPage('a4', 'landscape');

      // Render this page, wait for it to settle + images to load, then
      // rasterise.
      root.render(createElement(ComponentPackPagePreview, { data, images, step: i }));
      await waitForFrame();
      await waitForImages(host);
      // Fonts may still be loading on the very first page — block once so
      // the serif / sans headings don't fall back to a system default mid-
      // rasterisation.
      if (i === 0 && document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch { /* ignore */ }
      }

      try {
        const canvas = await html2canvas(host, {
          width: PAGE_W,
          height: PAGE_H,
          scale: 2,            // crisper output
          backgroundColor: '#FFFFFF',
          useCORS: true,
          logging: false,
          foreignObjectRendering: false,
        });
        const png = canvas.toDataURL('image/jpeg', 0.9);
        doc.addImage(png, 'JPEG', 0, 0, mmW, mmH, undefined, 'FAST');
      } catch (err) {
        console.error('PDF page', i + 1, 'failed to rasterise:', err);
      }
    }
  } finally {
    root.unmount();
    host.remove();
  }

  return doc.output('blob');
}
