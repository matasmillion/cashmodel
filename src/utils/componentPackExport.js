// Trim Pack export — multi-page SVG + PDF built by rasterising the live
// `ComponentPackPagePreview` component at each step. Reuses 100% of the
// preview layout code so what you see on the right-hand pane is exactly
// what lands in the file.
//
// SVG export: each page's SVG markup is wrapped in a group translated by
// the page index so the resulting file reads as a vertical strip of 7 A4
// landscape pages — importable in Illustrator or any SVG viewer.
//
// PDF export: each page is rasterised to a PNG via an offscreen canvas,
// then dropped into a jsPDF A4 landscape document. Client-only, no network.

import { jsPDF } from 'jspdf';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ComponentPackPagePreview from '../components/techpack/ComponentPackPagePreview';

const PAGE_W = 1123;
const PAGE_H = 794;
const TOTAL_PAGES = 7;

// Render one page of the preview to a standalone SVG string. The
// ComponentPackPagePreview returns a full <svg> element already, so we can
// just stringify it directly.
function renderPageSVG(data, images, step) {
  const markup = renderToStaticMarkup(
    createElement(ComponentPackPagePreview, { data, images, step })
  );
  // renderToStaticMarkup returns the <svg ...> root; strip React-only attrs
  // that xml parsers may not like and make sure the xmlns is present.
  return markup.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
}

// Concatenate the 7 page SVGs into a single vertical multi-page SVG.
export function generateComponentPackSVG(data, images) {
  const gap = 24;
  const totalH = PAGE_H * TOTAL_PAGES + gap * (TOTAL_PAGES - 1);
  const pages = [];
  for (let i = 0; i < TOTAL_PAGES; i++) {
    const pageSVG = renderPageSVG(data, images, i);
    // Extract the inner contents of the page's <svg> element so we can
    // re-wrap it in a <g> with the correct translation.
    const inner = pageSVG
      .replace(/^<svg[^>]*>/, '')
      .replace(/<\/svg>\s*$/, '');
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

// Rasterise a single SVG string to a PNG data URL at the given pixel size.
// Uses an <img> load → <canvas> drawImage pipeline.
function svgToPNGDataURL(svgString, width, height) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        // 2× scale for crisper output without exploding file size.
        const scale = 2;
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err instanceof Event ? new Error('SVG image failed to load') : err);
    };
    img.src = url;
  });
}

// Build a jsPDF document — A4 landscape, one PNG-rasterised preview per page.
export async function generateComponentPackPDF(data, images) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const mmW = 297;
  const mmH = 210;

  for (let i = 0; i < TOTAL_PAGES; i++) {
    if (i > 0) doc.addPage('a4', 'landscape');
    const svg = renderPageSVG(data, images, i);
    try {
      const png = await svgToPNGDataURL(svg, PAGE_W, PAGE_H);
      doc.addImage(png, 'JPEG', 0, 0, mmW, mmH, undefined, 'FAST');
    } catch (err) {
      // If a single page fails to rasterise (rare — e.g. a broken image data
      // URL inside a photo slot), skip rendering it but keep the blank A4
      // page so pagination matches the SVG export.
      console.error('PDF page', i + 1, 'failed to rasterise:', err);
    }
  }

  return doc.output('blob');
}
