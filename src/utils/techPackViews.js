// AI-powered garment view generator for the Design Overview step.
//
// Flow:
//   1. analyzeGarmentImage  — Claude Vision extracts a technical garment description
//      from any source image (CLO3D render, flat-lay vector, photo, etc.)
//   2. generateGarmentView  — submits a Nano Banana 2 job via fal-proxy (queue),
//      polls until complete, and returns the CDN image URL.
//
// Both functions route through existing Supabase Edge Function proxies so that
// API keys never reach the browser.

import { getClerkToken } from '../lib/auth';
import { IS_SUPABASE_ENABLED } from '../lib/supabase';
import { getAssetUrl } from './plmAssets';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY;
const NB2_ENDPOINT = 'fal-ai/nano-banana-2';
const POLL_MS      = 3000;
const MAX_POLLS    = 40; // ~2-minute timeout

async function buildHeaders() {
  const token = await getClerkToken();
  if (!token) throw new Error('Sign in first');
  return {
    Authorization: `Bearer ${token}`,
    apikey: ANON_KEY,
    'Content-Type': 'application/json',
  };
}

async function callProxy(name, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: await buildHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    // Anthropic / fal errors return { error: { type, message } } — flatten to a string
    const e = data.error;
    const msg = typeof e === 'string' ? e
      : (e?.message || e?.type || JSON.stringify(e) || `${name} returned ${res.status}`);
    throw new Error(msg);
  }
  return data;
}

/**
 * Analyze a garment image with Claude Vision and return a technical description
 * suitable for driving Nano Banana 2 prompts.
 *
 * @param {string} imageBase64 - raw base64 (no "data:..." prefix)
 * @param {string} mediaType   - MIME type, e.g. "image/jpeg"
 * @returns {Promise<string>}
 */
export async function analyzeGarmentImage(imageBase64, mediaType = 'image/jpeg') {
  if (!IS_SUPABASE_ENABLED) throw new Error('Supabase not configured');

  const result = await callProxy('anthropic-proxy', {
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: imageBase64 },
        },
        {
          type: 'text',
          text: 'You are a technical fashion designer. Analyze this garment image and output a precise description for generating technical flat lay renders. Include: garment type and silhouette, construction details (panels, seams, pockets, closures), fabric texture and apparent weight, colors and any patterns, hardware and trims, neckline and collar style, sleeve type, hem finish, any graphics or embellishments, and overall style category. Be highly specific and technical. Output only the description — no preamble, no headings.',
        },
      ],
    }],
  });

  const text = result?.content?.[0]?.text;
  if (!text) throw new Error('No garment description returned from Claude');
  return text;
}

const VIEW_CONTEXT = {
  front: 'front-facing view, showing the chest, neckline, front panels, and any front hardware or pockets',
  back:  'back view, showing the back panel, back yoke, and any back construction details',
  side:  'side profile view, showing side seams, sleeve silhouette, and hem length',
};

/**
 * Generate one garment view (front / back / side) using Nano Banana 2 via
 * the fal.ai queue. Polls until the job completes and returns a CDN image URL.
 *
 * @param {string}   description - output of analyzeGarmentImage
 * @param {'front'|'back'|'side'} view
 * @param {function} [onStatus]  - optional callback(phase: string, detail?: number)
 * @returns {Promise<string>} CDN URL of the generated image
 */
export async function generateGarmentView(description, view, onStatus) {
  if (!IS_SUPABASE_ENABLED) throw new Error('Supabase not configured');
  if (!VIEW_CONTEXT[view]) throw new Error(`Unknown view: ${view}`);

  const prompt = [
    `Technical fashion flat lay, ${VIEW_CONTEXT[view]},`,
    'pure white background, overhead top-down studio photography,',
    'no shadows, no model, no mannequin, perfectly flat garment.',
    description,
    'Ultra-detailed 4K, professional apparel product photography.',
  ].join(' ');

  onStatus?.('submitting');

  // Nano Banana takes a minimal input schema — no FLUX-style sampling params.
  const submitted = await callProxy('fal-proxy', {
    endpoint: NB2_ENDPOINT,
    payload: {
      prompt,
      num_images: 1,
      output_format: 'jpeg',
      aspect_ratio: '2:3',
    },
  });

  if (!submitted.request_id) throw new Error('No request_id from fal');

  // fal queue API: status_url returns COMPLETED but no result body.
  // The actual images live at response_url and need a separate GET.
  const statusUrl   = submitted.status_url
    || `https://queue.fal.run/${NB2_ENDPOINT}/requests/${submitted.request_id}/status`;
  const responseUrl = submitted.response_url
    || `https://queue.fal.run/${NB2_ENDPOINT}/requests/${submitted.request_id}`;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, POLL_MS));
    onStatus?.('polling', i + 1);

    const s = await callProxy('fal-proxy', { endpoint: statusUrl, method: 'GET' });

    if (s.status === 'COMPLETED') {
      // Fetch the actual result body from response_url.
      const result = await callProxy('fal-proxy', { endpoint: responseUrl, method: 'GET' });
      const imgs = result.images || result.output?.images || [];
      const url = imgs[0]?.url ?? (typeof imgs[0] === 'string' ? imgs[0] : null);
      if (url) return url;
      console.error('[techpack-views] Empty fal result body:', result);
      throw new Error('Job completed but no image URL in response body');
    }
    if (s.status === 'FAILED') {
      throw new Error(`Generation failed: ${s.error || 'unknown error'}`);
    }
    // IN_QUEUE or IN_PROGRESS — keep polling
  }

  throw new Error('Generation timed out after 2 minutes');
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

  // Offline / Supabase-disabled storage — already a data URL
  if (entry.data?.startsWith('data:')) return entry.data;

  // In-flight upload — blob URL is still alive at this point
  if (entry._blobUrl) return fetchToDataUrl(entry._blobUrl);

  // Cloud-stored — resolve path to a signed URL first
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
