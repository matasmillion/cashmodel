// Per-use-case wrapper around `falImageGen` for the Tech Pack Design Overview.
// Generates Flat Lay views (front / back / side) of a garment using the
// Nano Banana 2 model, optionally seeded by reference images uploaded by
// the designer plus a free-form context note.
//
// All shared brand-defaults, prompt templates, and fal.ai plumbing live
// in `falImageGen.js`. This file only handles the Tech Pack-specific
// orchestration: reading the source image entry, running Claude Vision,
// then dispatching a Flat Lay job per view.

import { getAssetUrl } from './plmAssets';
import { analyzeGarmentImage, generateFlatLay, generateGhostMannequin } from './falImageGen';

export { analyzeGarmentImage };

/**
 * Generate a single garment view for the Design Overview step.
 *
 * @param {string} description  - Claude Vision output describing the garment
 * @param {'front'|'back'|'side'} view
 * @param {object} [opts]
 * @param {string[]} [opts.references]   - base64 data URIs (refs become image_urls)
 * @param {string} [opts.customContext]  - designer's free-form prompt addition
 * @param {string} [opts.style]          - 'ghost-mannequin' (default) | 'flat-lay'
 * @param {string} [opts.bgColorName]    - FR color name (defaults to 'salt')
 * @param {function} [opts.onStatus]
 * @returns {Promise<string>} CDN URL
 */
export async function generateGarmentView(description, view, opts = {}) {
  const args = {
    garmentDescription: description,
    view,
    references: opts.references || [],
    customContext: opts.customContext || '',
    bgColorName: opts.bgColorName || 'salt',
    onStatus: opts.onStatus,
  };
  return opts.style === 'flat-lay'
    ? generateFlatLay(args)
    : generateGhostMannequin(args);
}

/**
 * Convert an image entry from the tech pack images array to a base64 data URL.
 *
 * Image entries have three possible shapes depending on storage state:
 *   - Offline / Supabase disabled: { data: 'data:image/...;base64,...' }
 *   - During cloud upload (in-flight): { _blobUrl: 'blob:...' }
 *   - After cloud upload: { path: 'org/scope/owner/slot-uuid.webp' }
 *
 * @param {{ data?: string, _blobUrl?: string, path?: string }} entry
 * @returns {Promise<string|null>}
 */
export async function imageEntryToDataUrl(entry) {
  if (!entry) return null;

  if (entry.data?.startsWith('data:')) return entry.data;

  if (entry._blobUrl) return fetchToDataUrl(entry._blobUrl);

  if (entry.path) {
    const signedUrl = await getAssetUrl(entry.path);
    if (!signedUrl) return null;
    return fetchToDataUrl(signedUrl);
  }

  return null;
}

async function fetchToDataUrl(src) {
  const res = await fetch(src);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
