// Blob → base64 data URL: dependency-free and isomorphic (browser + Node).
//
// Lives in its own module (no React / Clerk / Supabase imports) so the
// local-first image-upload fallback in plmAssets.js — which keeps a photo's
// bytes inline when the cloud is unreachable, so a login blip can never drop an
// image — stays unit-testable in the Node self-test harness.

/**
 * Convert a Blob/File to a base64 `data:` URL. Chunked so a large byte array
 * doesn't overflow the call stack via `String.fromCharCode(...spread)`.
 * @param {Blob} blob
 * @returns {Promise<string>} e.g. "data:image/webp;base64,AAAA…"
 */
export async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  const b64 = (typeof btoa !== 'undefined')
    ? btoa(bin)
    : Buffer.from(bin, 'binary').toString('base64');
  return `data:${blob.type || 'application/octet-stream'};base64,${b64}`;
}
