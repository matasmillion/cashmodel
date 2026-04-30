// PLM asset storage — Supabase Storage helper for all PLM images.
//
// Replaces the legacy "base64-in-JSONB" pattern. Every cover image, material
// photo, embellishment artwork, QC photo, color card, and vendor logo lives
// in the `plm-assets` bucket as a standalone file. The DB stores only a
// small reference object pointing at the file.
//
// Asset reference shape (what gets persisted in `images` JSONB / cover_image):
//   {
//     slot:         'component-cover' | 'material-3' | 'qc-photo-1' | ...
//     path:         '{org_id}/{scope}/{owner_id}/{slot}-{uuid}.{ext}'
//     size:         bytes (post-compression)
//     content_type: 'image/webp' | 'image/jpeg' | ...
//     width:        px
//     height:       px
//     uploaded_at:  ISO timestamp
//   }
//
// Resolve a reference to a usable URL via getAssetUrl(ref). URLs are signed
// (1h TTL by default) and cached in memory for the life of the page.

import { getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';

const BUCKET = 'plm-assets';

const DEFAULT_MAX_DIM = 1600;
const DEFAULT_QUALITY = 0.82;
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNED_URL_REFRESH_BUFFER_MS = 5 * 60 * 1000;

const signedUrlCache = new Map(); // path -> { url, expiresAt }

// ─────────────────────────────────────────────────────────────────────
// Compression / encoding
// ─────────────────────────────────────────────────────────────────────

/**
 * Compress + resize a Blob/File for upload.
 * Returns { blob, width, height, contentType }. Original is untouched.
 *
 * Defaults: 1600px max dimension, WebP @ 0.82 quality (~150–300 KB typical).
 * SVGs and tiny images bypass compression.
 */
export async function compressForUpload(input, opts = {}) {
  const { maxDim = DEFAULT_MAX_DIM, quality = DEFAULT_QUALITY, format } = opts;
  const blob = input instanceof Blob ? input : new Blob([input]);

  if (blob.type === 'image/svg+xml') {
    return { blob, width: null, height: null, contentType: 'image/svg+xml' };
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return { blob, width: null, height: null, contentType: blob.type || 'application/octet-stream' };
  }

  const ratio = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * ratio));
  const h = Math.max(1, Math.round(bitmap.height * ratio));

  const targetType = format || (await supportsWebP() ? 'image/webp' : 'image/jpeg');
  const out = await encodeToBlob(bitmap, w, h, targetType, quality);
  bitmap.close?.();

  // If WebP encoding made the file *bigger* than the source (rare; tiny PNGs
  // can do this), fall back to the original — we still cap dimensions below.
  if (out.size > blob.size && ratio === 1) {
    return { blob, width: bitmap.width, height: bitmap.height, contentType: blob.type };
  }
  return { blob: out, width: w, height: h, contentType: targetType };
}

async function encodeToBlob(bitmap, w, h, type, quality) {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.convertToBlob({ type, quality });
  }
  // Fallback: <canvas> + toBlob (older Safari)
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

let _webpProbe = null;
async function supportsWebP() {
  if (_webpProbe !== null) return _webpProbe;
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const c = new OffscreenCanvas(1, 1);
      const b = await c.convertToBlob({ type: 'image/webp' });
      _webpProbe = b.type === 'image/webp';
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = 1; canvas.height = 1;
      _webpProbe = canvas.toDataURL('image/webp').startsWith('data:image/webp');
    }
  } catch {
    _webpProbe = false;
  }
  return _webpProbe;
}

// ─────────────────────────────────────────────────────────────────────
// Upload
// ─────────────────────────────────────────────────────────────────────

/**
 * Upload an asset to Storage. Returns the asset reference object.
 *
 *   scope:        'component-packs' | 'tech-packs' | 'fabrics' | 'patterns' |
 *                 'treatments' | 'embellishments' | 'colors' | 'vendors' | 'po'
 *   ownerId:      row id (pack id, fabric id, etc.) — file lives under this folder
 *   slot:         semantic slot ('cover', 'material-3', 'qc-photo', ...)
 *   blob:         Blob/File to upload
 *   skipCompress: pass true for already-optimized inputs
 *   compressOpts: { maxDim, quality, format }
 */
export async function uploadAsset({ scope, ownerId, slot, blob, skipCompress = false, compressOpts = {} } = {}) {
  if (!scope) throw new Error('uploadAsset: scope is required');
  if (!ownerId) throw new Error('uploadAsset: ownerId is required');
  if (!slot) throw new Error('uploadAsset: slot is required');
  if (!(blob instanceof Blob)) throw new Error('uploadAsset: blob must be a Blob/File');

  const orgId = getCurrentOrgIdSync();
  if (!orgId) throw new Error('uploadAsset: no organization context (sign in required)');

  const supabase = await getAuthedSupabase();
  if (!supabase) throw new Error('uploadAsset: Supabase client not configured');

  const compressed = skipCompress
    ? { blob, width: null, height: null, contentType: blob.type || 'application/octet-stream' }
    : await compressForUpload(blob, compressOpts);

  const ext = extFromContentType(compressed.contentType);
  const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  const path = `${orgId}/${scope}/${ownerId}/${sanitizeSlot(slot)}-${uuid}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, compressed.blob, {
      contentType: compressed.contentType,
      cacheControl: '31536000', // 1 year — paths are immutable (UUID-suffixed)
      upsert: false,
    });
  if (error) {
    const wrapped = new Error(`uploadAsset failed: ${error.message || error}`);
    wrapped.cause = error;
    throw wrapped;
  }

  return {
    slot,
    path,
    size: compressed.blob.size,
    content_type: compressed.contentType,
    width: compressed.width,
    height: compressed.height,
    uploaded_at: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────
// URL resolution (signed, cached)
// ─────────────────────────────────────────────────────────────────────

/**
 * Resolve a single asset reference (or path) to a signed URL.
 * Returns null if Supabase is unavailable or the path is missing.
 */
export async function getAssetUrl(refOrPath) {
  const path = pathOf(refOrPath);
  if (!path) return null;

  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt - SIGNED_URL_REFRESH_BUFFER_MS > Date.now()) {
    return cached.url;
  }

  const supabase = await getAuthedSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    if (error) console.error('getAssetUrl:', error);
    return null;
  }

  signedUrlCache.set(path, {
    url: data.signedUrl,
    expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
  });
  return data.signedUrl;
}

/**
 * Batch-resolve multiple references in a single round-trip.
 * Returns Map<path, signedUrl>. Missing/failed paths are absent from the map.
 */
export async function getAssetUrls(refsOrPaths = []) {
  const paths = refsOrPaths.map(pathOf).filter(Boolean);
  const result = new Map();
  if (!paths.length) return result;

  const now = Date.now();
  const toFetch = [];
  for (const path of paths) {
    const cached = signedUrlCache.get(path);
    if (cached && cached.expiresAt - SIGNED_URL_REFRESH_BUFFER_MS > now) {
      result.set(path, cached.url);
    } else {
      toFetch.push(path);
    }
  }

  if (toFetch.length) {
    const supabase = await getAuthedSupabase();
    if (!supabase) return result;
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(toFetch, SIGNED_URL_TTL_SECONDS);
    if (error) console.error('getAssetUrls:', error);
    for (const item of data || []) {
      if (!item?.signedUrl || !item?.path) continue;
      signedUrlCache.set(item.path, {
        url: item.signedUrl,
        expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
      });
      result.set(item.path, item.signedUrl);
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────────────────────

/** Delete a single asset. Soft-fails (returns { ok: false, error }) on failure. */
export async function deleteAsset(refOrPath) {
  const path = pathOf(refOrPath);
  if (!path) return { ok: true };
  return deleteAssets([path]);
}

/** Delete many assets in a single call. */
export async function deleteAssets(refsOrPaths = []) {
  const paths = refsOrPaths.map(pathOf).filter(Boolean);
  if (!paths.length) return { ok: true };

  for (const p of paths) signedUrlCache.delete(p);

  const supabase = await getAuthedSupabase();
  if (!supabase) return { ok: false, error: new Error('Supabase not configured') };

  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) {
    console.error('deleteAssets:', error);
    return { ok: false, error };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Migration helpers (for legacy base64 data)
// ─────────────────────────────────────────────────────────────────────

/** Convert a `data:...;base64,...` URL to a Blob. Returns null on parse failure. */
export function dataUrlToBlob(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const [, mime, b64] = match;
  try {
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
  } catch {
    return null;
  }
}

/** True if the value looks like a Storage asset reference (has .path). */
export function isAssetRef(value) {
  return !!(value && typeof value === 'object' && typeof value.path === 'string' && value.path.length);
}

/** True if the value is a legacy base64 data URL. */
export function isLegacyDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:');
}

// ─────────────────────────────────────────────────────────────────────
// Internal
// ─────────────────────────────────────────────────────────────────────

function pathOf(refOrPath) {
  if (!refOrPath) return null;
  if (typeof refOrPath === 'string') return refOrPath;
  if (typeof refOrPath.path === 'string') return refOrPath.path;
  return null;
}

function sanitizeSlot(slot) {
  return String(slot)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'asset';
}

function extFromContentType(ct) {
  if (!ct) return 'bin';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('svg')) return 'svg';
  if (ct.includes('gif')) return 'gif';
  return 'bin';
}

// Test-only: clear the in-memory signed URL cache.
export function __resetAssetCacheForTests() {
  signedUrlCache.clear();
}
