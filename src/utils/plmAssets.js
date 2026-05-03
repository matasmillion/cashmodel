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

import { useEffect, useMemo, useState } from 'react';
import { getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';

const BUCKET = 'plm-assets';

// Canonical upload pipeline. Every PLM image goes through this exactly
// once, regardless of how it entered (file picker → resize → crop →
// upload). 2400px / WebP 0.92 produces ~400-700 KB files that print
// cleanly at A4 spec sheets and look excellent in the live preview.
//
// Don't lower these without checking what they affect — print quality
// regression on vendor-facing spec sheets is a known way to lose face.
const DEFAULT_MAX_DIM = 2400;
const DEFAULT_QUALITY = 0.92;
// 24h signed-URL TTL lets a tab sit idle through a working day without
// covers expiring. 5-min refresh buffer means active pages always have
// a fresh URL well before it actually dies.
const SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;
const SIGNED_URL_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// 5-second deferred GC window: when a save's orphaned paths are queued
// for deletion, we wait this long before actually removing them from
// Storage. Lets concurrent saves / uploads / undo paths re-claim the
// path without ever leaving a dangling reference to a deleted file.
const ORPHAN_DEFERRAL_MS = 5_000;

const signedUrlCache = new Map(); // path -> { url, expiresAt }
const pendingOrphans = new Map(); // path -> { timer, deletedAt }

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

// Reject any path whose org-id prefix doesn't match the caller's
// current org. Defends against:
//   • Cross-org leakage from a stale URL cache after an org switch
//   • Tampered references (e.g., a JSONB row pointing at another org)
// When the orgId is null (auth not yet loaded), allow the request — the
// signing call itself will fail on Storage's RLS if the JWT mismatches.
function pathBelongsToCurrentOrg(path) {
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return true;
  return typeof path === 'string' && path.startsWith(orgId + '/');
}

/**
 * Resolve a single asset reference (or path) to a signed URL.
 * Returns null if Supabase is unavailable, the path is missing, or the
 * path belongs to a different org than the caller's session.
 */
export async function getAssetUrl(refOrPath) {
  const path = pathOf(refOrPath);
  if (!path) return null;

  if (!pathBelongsToCurrentOrg(path)) {
    signedUrlCache.delete(path);
    return null;
  }

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
  const paths = refsOrPaths
    .map(pathOf)
    .filter(p => p && pathBelongsToCurrentOrg(p));
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

/**
 * Copy an asset to a new path (used by pack duplication so the new pack has
 * its own files instead of sharing the source's — otherwise either pack's
 * "remove this image" cleanup would orphan-delete files the other still
 * references). Returns the new asset reference, or null on failure.
 *
 *   sourceRef:    the original ref ({ slot, path, ... })
 *   newOwnerId:   id of the destination pack/row
 *   newScope:     usually the same scope as the source ('component-packs' etc.)
 */
export async function copyAsset({ sourceRef, newOwnerId, newScope } = {}) {
  if (!sourceRef?.path) return null;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return null;
  const supabase = await getAuthedSupabase();
  if (!supabase) return null;

  const ext = extFromContentType(sourceRef.content_type) || (sourceRef.path.split('.').pop() || 'bin');
  const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  const slot = sanitizeSlot(sourceRef.slot || 'asset');
  const newPath = `${orgId}/${newScope}/${newOwnerId}/${slot}-${uuid}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).copy(sourceRef.path, newPath);
  if (error) {
    console.error('copyAsset:', error);
    return null;
  }
  return {
    ...sourceRef,
    path: newPath,
    uploaded_at: new Date().toISOString(),
  };
}

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

/**
 * Schedule asset deletion deferred by ORPHAN_DEFERRAL_MS. If the same
 * path gets re-claimed (via cancelOrphanDeletion) before the timer
 * fires, the delete is cancelled. This is the safety net for races
 * between a save that "orphans" a path and a concurrent upload / save
 * that actually still needs it.
 *
 * Use this everywhere instead of the immediate deleteAssets() in
 * orphan-cleanup paths. Reserve the immediate path for explicit user-
 * initiated deletes (purge from Trash, vendor logo replace, etc.).
 */
export function scheduleOrphanDeletion(refsOrPaths = []) {
  const paths = refsOrPaths.map(pathOf).filter(Boolean);
  if (!paths.length) return;
  const deletedAt = Date.now();
  for (const path of paths) {
    // Cancel any prior scheduled deletion for this path — we want the
    // latest queue entry to win so re-claims always reset the timer.
    const prior = pendingOrphans.get(path);
    if (prior) clearTimeout(prior.timer);
    const timer = setTimeout(() => {
      pendingOrphans.delete(path);
      deleteAssets([path]);
    }, ORPHAN_DEFERRAL_MS);
    pendingOrphans.set(path, { timer, deletedAt });
  }
}

/**
 * If a path that was scheduled for deferred deletion gets re-claimed
 * (a concurrent upload completed, an undo restored a slot, lazy
 * migration re-uploaded under the same path), call this to cancel the
 * pending delete and keep the file alive.
 */
export function cancelOrphanDeletion(refsOrPaths = []) {
  const paths = refsOrPaths.map(pathOf).filter(Boolean);
  for (const path of paths) {
    const entry = pendingOrphans.get(path);
    if (entry) {
      clearTimeout(entry.timer);
      pendingOrphans.delete(path);
    }
  }
}

/**
 * Clear the in-memory signed URL cache. Called when the org context
 * changes — without this, URLs signed for org A would be served from
 * cache when the user has already switched to org B, returning files
 * from the wrong org (or 403 once Storage's RLS catches up).
 */
export function clearAssetUrlCache() {
  signedUrlCache.clear();
}

/**
 * Invalidate a single path's cached signed URL. Used by the onError
 * handler in image renderers — when an `<img src=signed_url>` errors
 * out (typically expired or revoked), evict the cached URL so the next
 * resolve forces a fresh sign.
 */
export function invalidateAssetUrl(refOrPath) {
  const path = pathOf(refOrPath);
  if (path) signedUrlCache.delete(path);
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

/**
 * Resolve a "cover image" column value — which may be a legacy base64
 * data URL, an absolute URL, or a Storage path — into a renderable URL.
 */
export async function resolveCoverImage(coverValue) {
  if (!coverValue || typeof coverValue !== 'string') return null;
  if (coverValue.startsWith('data:')) return coverValue;
  if (/^https?:\/\//i.test(coverValue)) return coverValue;
  return getAssetUrl(coverValue);
}

/**
 * Take an `images` array (mix of legacy base64 entries, transient blob-URL
 * placeholders, and persisted Storage refs) and return a parallel array
 * where every entry has its `data` field populated with something the
 * browser can render. Entries with `path` are resolved to signed URLs in a
 * single batch round-trip; legacy `data` and transient `_blobUrl` pass
 * through unchanged.
 */
export async function resolveImageEntries(images = []) {
  const list = Array.isArray(images) ? images : [];
  const pathsToFetch = [];
  for (const img of list) {
    if (!img) continue;
    if (img.data) continue;
    if (img._blobUrl) continue;
    if (img.path) pathsToFetch.push(img.path);
  }
  const urlMap = pathsToFetch.length ? await getAssetUrls(pathsToFetch) : new Map();
  return list.map(img => {
    if (!img) return img;
    if (img.data) return img;
    if (img._blobUrl) return { ...img, data: img._blobUrl };
    if (img.path) return { ...img, data: urlMap.get(img.path) || '' };
    return img;
  });
}

/**
 * Lazy migration helper for atom libraries — if the current cover value
 * is a legacy base64 data URL, upload it to Storage and return the new
 * path. Returns null when nothing needs to migrate (already a path,
 * empty, an http URL, etc.) so callers can early-exit without a save.
 */
export async function migrateLegacyCoverIfNeeded(value, { scope, ownerId, slot = 'cover' } = {}) {
  if (!value || !ownerId || !isLegacyDataUrl(value)) return null;
  const blob = dataUrlToBlob(value);
  if (!blob) return null;
  const ref = await uploadAsset({ scope, ownerId, slot, blob, skipCompress: false });
  return ref?.path || null;
}

/**
 * For atom-library duplicates — copies the `cover_image` column value to a
 * new Storage path under the duplicate's owner so neither row's later
 * delete/replace can break the other. Returns the new path (or the
 * original value untouched if it's a base64 / HTTP URL / null).
 */
export async function copyCoverImage(coverValue, { newOwnerId, newScope, slot = 'cover' } = {}) {
  if (!coverValue || typeof coverValue !== 'string') return coverValue;
  if (coverValue.startsWith('data:') || /^https?:\/\//i.test(coverValue)) return coverValue;
  const cloned = await copyAsset({
    sourceRef: { path: coverValue, slot, content_type: 'image/webp' },
    newOwnerId,
    newScope,
  });
  return cloned?.path || coverValue;
}

/**
 * For exports — return an images array where every entry has a `data` field
 * populated with a self-contained base64 data URL (no signed URLs that
 * could expire). Fetches each Storage path once, converts to data URL via
 * FileReader, and reuses the result. Legacy `data` entries pass through.
 */
export async function resolveImagesToDataUrls(images = []) {
  const list = Array.isArray(images) ? images : [];
  return Promise.all(list.map(async (img) => {
    if (!img) return img;
    if (img.data && img.data.startsWith('data:')) return img;
    if (!img.path) return img;
    try {
      const url = await getAssetUrl(img.path);
      if (!url) return img;
      const resp = await fetch(url);
      const blob = await resp.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
      });
      return { ...img, data: dataUrl };
    } catch (err) {
      console.error('resolveImagesToDataUrls:', img.path, err);
      return img;
    }
  }));
}

/**
 * React hook for the live preview / read-only renderers — returns an
 * images array where every entry has its `data` field populated with a
 * signed Storage URL (path-based entries), the original data URL (legacy),
 * or the in-flight blob URL (uploading). Path entries are batched into a
 * single signed-URL request and resolve asynchronously.
 */
export function useResolvedImageEntries(images = []) {
  // Synchronous baseline — legacy `data` and transient `_blobUrl` entries
  // render immediately; path-only entries appear once their signed URL
  // lands in the async map below.
  const baseline = useMemo(() => (images || []).map(img => {
    if (!img) return img;
    if (img.data) return img;
    if (img._blobUrl) return { ...img, data: img._blobUrl };
    return img;
  }), [images]);

  const [pathUrls, setPathUrls] = useState(() => new Map());

  useEffect(() => {
    const list = images || [];
    const paths = list.map(img => (img && img.path && !img.data ? img.path : null)).filter(Boolean);
    if (!paths.length) return undefined;
    let cancelled = false;
    getAssetUrls(paths).then((urlMap) => { if (!cancelled) setPathUrls(urlMap); });
    return () => { cancelled = true; };
  }, [images]);

  return useMemo(() => baseline.map(img => {
    if (!img || img.data || img._blobUrl) return img;
    if (img.path) {
      const url = pathUrls.get(img.path);
      return url ? { ...img, data: url } : img;
    }
    return img;
  }), [baseline, pathUrls]);
}

/**
 * Persistable image entry — drops transient fields (object URLs, upload
 * status flags) so they don't end up in the DB.
 *
 * Critical: also drops any entry that ends up with no `path` and no
 * `data` after stripping. Without this, a failed upload (or a
 * placeholder that never resolved) gets persisted as `{ slot, name }`
 * with no source — a ghost entry that locks the slot into a blank
 * state and can't be recovered without manual deletion. Filtering at
 * the persist boundary is the single chokepoint that guarantees we
 * never write a sourceless image into the DB. (See also
 * isGhostImage / countGhosts for diagnostic + cleanup helpers.)
 */
export function persistableImage(img) {
  if (!img) return null;
  const { _blobUrl, _uploading, _uploadError, _tempId, ...rest } = img;
  if (!rest.path && !rest.data) return null;
  return rest;
}

/** Strip transient fields from every entry in an images array AND drop
 *  ghost entries that lack both a Storage path and an inline data URL. */
export function persistableImages(images = []) {
  return (images || []).map(persistableImage).filter(Boolean);
}

/** True when the entry will render as nothing — no Storage path, no
 *  data URL, no in-flight blob. Used by the builder's auto-repair to
 *  detect ghost entries already saved into the row's images JSONB. */
export function isGhostImage(img) {
  if (!img || typeof img !== 'object') return true;
  return !img.path && !img.data && !img._blobUrl;
}

/** Count ghost entries in an images array. */
export function countGhosts(images = []) {
  return (images || []).filter(isGhostImage).length;
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
