// Per-use-case wrapper around `falImageGen` for the Tech Pack Design Overview.
// Generates Flat Lay views (front / back / side) of a garment using the
// Nano Banana 2 model, optionally seeded by reference images uploaded by
// the designer plus a free-form context note.
//
// All shared brand-defaults, prompt templates, and fal.ai plumbing live
// in `falImageGen.js`. This file only handles the Tech Pack-specific
// orchestration: reading the source image entry, running Claude Vision,
// then dispatching a Flat Lay job per view.

import { getAssetUrl, invalidateAssetUrl } from './plmAssets';
import { blobToDataUrl } from './blobDataUrl';
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
 * Image entries have four possible shapes depending on storage state:
 *   - Offline / Supabase disabled: { data: 'data:image/...;base64,...' }
 *   - During cloud upload (in-flight): { _blob: Blob, _blobUrl: 'blob:...' }
 *   - After URL revocation (Blob still valid): { _blob: Blob }
 *   - After cloud upload: { path: 'org/scope/owner/slot-uuid.webp' }
 *
 * The `_blob` transient field is checked before `_blobUrl` because a Blob
 * survives URL.revokeObjectURL — the modal captures entries in a mount-time
 * closure and the blob URL may be revoked before the modal reads the entry.
 *
 * @param {{ data?: string, _blob?: Blob, _blobUrl?: string, path?: string }} entry
 * @returns {Promise<string|null>}
 */
export async function imageEntryToDataUrl(entry) {
  if (!entry) return null;

  if (entry.data?.startsWith('data:')) return entry.data;

  // Prefer the raw Blob (survives URL.revokeObjectURL; the modal's mount-time
  // closure can't go stale when the upload completes and revokes the blob URL).
  if (entry._blob instanceof Blob) return blobToDataUrl(entry._blob);

  if (entry._blobUrl) return fetchToDataUrl(entry._blobUrl);

  if (entry.path) {
    const signedUrl = await getAssetUrl(entry.path);
    if (!signedUrl) return null;
    // Wrap in try/catch — a cached signed URL can expire or be revoked after
    // the page loaded (7-day TTL, re-signed on each page load). On failure:
    // evict the stale URL from the in-memory cache, re-sign once, and retry.
    // If the fresh URL is also unavailable, rethrow the original error so the
    // caller can name the failing slot precisely.
    try {
      return await fetchToDataUrl(signedUrl);
    } catch (originalErr) {
      invalidateAssetUrl(entry.path);
      const freshUrl = await getAssetUrl(entry.path);
      if (!freshUrl) throw originalErr;
      return fetchToDataUrl(freshUrl);
    }
  }

  return null;
}

async function fetchToDataUrl(src) {
  const res = await fetch(src, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error(`Image load failed: HTTP ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Shrink a data URL to a max dimension before sending to Claude Vision.
 * Keeps the payload well under Supabase Edge Function's ~6 MB body limit.
 *
 * @param {string} dataUrl
 * @param {number} [maxDim=1024]
 * @returns {Promise<string>} JPEG data URL at reduced size
 */
export function resizeDataUrlForAI(dataUrl, maxDim = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => reject(new Error('Could not decode image for resize'));
    img.src = dataUrl;
  });
}
