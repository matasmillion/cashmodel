// Central image-generation engine driven by the fal-image-gen skill spec.
// Owns: brand color translations, photography defaults, prompt templates,
// fal.ai queue plumbing (submit → poll → fetch response_url), and
// reference-image handling. Consumers (tech pack views, future label macro
// generator, campaign shots, etc.) call into the per-template helpers.
//
// Architectural rules from the skill (NB2 = Gemini 3.1 Flash Image, NOT diffusion):
//   - Natural language sentences, not keyword lists.
//   - No (concept:1.4) weighting, no negative_prompt — embed exclusions inline.
//   - No guidance_scale / num_inference_steps — diffusion-only.
//   - Most critical specs FIRST.
//   - Hex codes alone fail — pair with descriptive color language.
//   - Use the /edit endpoint when references are provided, base endpoint otherwise.
//   - Re-supply original reference on every call (we don't iterate — each view
//     is a fresh generation from the same source set).

import { getClerkToken, describeAuthFailure } from '../lib/auth';
import { IS_SUPABASE_ENABLED } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY;

const NB2_TXT2IMG = 'fal-ai/nano-banana-2';
const NB2_EDIT    = 'fal-ai/nano-banana-2/edit';

const POLL_MS   = 3000;
const MAX_POLLS = 40; // ~2 min

// ─── FR brand color translation ──────────────────────────────────────────────
// Hex alone reads as near-black on NB2. Always pair with descriptive language.
// Hex is included AFTER the description as a secondary anchor.
export const FR_COLOR_PROMPT = {
  slate:  'medium-dark slate grey hex #3A3A3A, the color of weathered concrete, approximately 25% lightness, warm neutral undertone — clearly distinguishable as GREY, NOT near-black, NOT charcoal',
  salt:   'warm cream ivory hex #F5F0E8, the color of unbleached raw linen — warm off-white with subtle tan warmth, NOT pure white, NOT yellow',
  sand:   'warm sand beige hex #EBE5D5, the color of dry beach sand — between cream and khaki, desaturated warm mid-tone',
  stone:  'mid-tone grey-brown hex #716F70, the color of river stone — balanced neutral, approximately 45% lightness',
  soil:   'warm earth brown hex #9A816B, the color of dry clay soil — muted, desaturated, NOT orange, NOT chocolate',
  sea:    'dusty steel blue hex #B5C7D3, the color of overcast ocean — muted, desaturated, soft blue-grey',
  sage:   'muted sage green hex #ADBDA3, the color of dried eucalyptus — desaturated, grey-green, NOT lime, NOT forest',
  sienna: 'warm sienna orange-brown hex #D4956A, the color of terracotta clay — earthy, muted, NOT bright orange',
};

// ─── Brand photography defaults ──────────────────────────────────────────────
const BRAND_DEFAULTS = [
  'Color grading: warm highlights, slightly lifted shadows, desaturated greens, rich skin tones, Kodak Portra 400 film quality.',
  'Visible surface fiber detail, matte cotton texture, no sheen or shine.',
  'Heavyweight fabric, substantial drape, structured silhouette, 400gsm cotton mass when applicable.',
].join(' ');

const EXCLUSIONS = 'EXCLUSIONS: No text overlays beyond what is specified, no watermarks, no brand logos other than explicitly specified FR marks, no extra props unless specified, no visible mannequin seams or stands, no background clutter. Color accuracy for e-commerce product rendering is critical.';

// Resolution presets per shot type (skill's resolution table).
const RES = {
  flatLay:        { width: 1360, height: 1360 },
  ghostMannequin: { width: 1360, height: 2032 },
  wovenLabel:     { width: 1360, height: 1024 },
  productDetail:  { width: 1360, height: 1360 },
  campaignVert:   { width: 1080, height: 1350 },
  campaignHoriz:  { width: 1920, height: 1080 },
};

// ─── Edge function plumbing ──────────────────────────────────────────────────

// Detect a JWT that is already expired or will expire within 90 seconds.
function jwtExpiringSoon(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(b64 + '==='.slice((b64.length + 3) % 4)));
    return typeof exp === 'number' && exp * 1000 - Date.now() < 90_000;
  } catch { return false; }
}

// One in-flight token refresh at a time — prevents three parallel runOneView
// calls each racing to hit Clerk's endpoint with skipCache simultaneously.
let _tokenRefreshPromise = null;
async function getFreshToken() {
  if (_tokenRefreshPromise) return _tokenRefreshPromise;
  _tokenRefreshPromise = (async () => {
    try {
      const t = await getClerkToken('supabase', { skipCache: true });
      return t;
    } finally {
      _tokenRefreshPromise = null;
    }
  })();
  return _tokenRefreshPromise;
}

// Module-level token cache: reuse the last valid JWT across parallel calls so
// three concurrent view-generation jobs don't each hit Clerk's auth endpoint.
// Clerk's 'supabase' template requires a round-trip to Clerk's servers — if
// that call fails transiently the three parallel generateGarmentView calls all
// see null and throw "Sign in first" even though the user is logged in.
let _cachedToken = null;
let _cachedTokenExp = 0;

async function buildHeaders() {
  const now = Date.now();
  const MARGIN = 30_000; // 30 s safety margin before expiry

  // Fast path: cached token still valid — no Clerk network call needed
  if (_cachedToken && _cachedTokenExp - now > MARGIN) {
    return {
      Authorization: `Bearer ${_cachedToken}`,
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    };
  }

  // Slow path: fetch / refresh from Clerk
  let token = await getClerkToken('supabase');
  if (!token || jwtExpiringSoon(token)) token = await getFreshToken();
  if (!token) throw new Error(describeAuthFailure());

  // Cache with its JWT expiry so we don't refresh until necessary
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(b64 + '==='.slice((b64.length + 3) % 4)));
    _cachedTokenExp = typeof exp === 'number' ? exp * 1000 : now + 3_600_000;
  } catch {
    _cachedTokenExp = now + 3_600_000;
  }
  _cachedToken = token;

  return {
    Authorization: `Bearer ${_cachedToken}`,
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
    const e = data.error;
    const msg = typeof e === 'string'
      ? e
      : (e?.message || e?.type || JSON.stringify(e) || `${name} returned ${res.status}`);
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Errors worth retrying: 5xx gateway errors AND network-level TypeErrors
// ("Failed to fetch"). 4xx errors (auth, bad request) are permanent.
const FAL_RETRYABLE = new Set([502, 503, 504]);
const POLL_RETRY_DELAY_MS = 5000;
const POLL_RETRIES = 3;

function isRetryable(err) {
  if (err.status) return FAL_RETRYABLE.has(err.status); // HTTP error
  // Network-level TypeError ("Failed to fetch") — no status code
  return err instanceof TypeError && !err.status;
}

// Submit a fal queue job, poll status, fetch response body, return image URL.
async function runFalJob({ endpoint, payload, onStatus }) {
  onStatus?.('submitting');

  // Retry the submit on gateway / network errors.
  let submitted;
  let lastSubmitErr;
  for (let attempt = 0; attempt <= POLL_RETRIES; attempt++) {
    try {
      submitted = await callProxy('fal-proxy', { endpoint, payload });
      lastSubmitErr = null;
      break;
    } catch (err) {
      lastSubmitErr = err;
      if (!isRetryable(err)) throw err;
      if (attempt < POLL_RETRIES) await new Promise(r => setTimeout(r, POLL_RETRY_DELAY_MS));
    }
  }
  if (lastSubmitErr) throw lastSubmitErr;
  if (!submitted.request_id) throw new Error('No request_id from fal');

  const statusUrl = submitted.status_url
    || `https://queue.fal.run/${endpoint}/requests/${submitted.request_id}/status`;
  const responseUrl = submitted.response_url
    || `https://queue.fal.run/${endpoint}/requests/${submitted.request_id}`;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, POLL_MS));
    onStatus?.('polling', i + 1);

    let s;
    let lastPollErr;
    for (let attempt = 0; attempt <= POLL_RETRIES; attempt++) {
      try {
        s = await callProxy('fal-proxy', { endpoint: statusUrl, method: 'GET' });
        lastPollErr = null;
        break;
      } catch (err) {
        lastPollErr = err;
        if (!isRetryable(err)) throw err; // non-retryable — bubble up
        if (attempt < POLL_RETRIES) await new Promise(r => setTimeout(r, POLL_RETRY_DELAY_MS));
      }
    }
    if (lastPollErr) throw lastPollErr; // exhausted retries

    if (s.status === 'COMPLETED') {
      const result = await callProxy('fal-proxy', { endpoint: responseUrl, method: 'GET' });
      const imgs = result.images || result.output?.images || [];
      const url = imgs[0]?.url ?? (typeof imgs[0] === 'string' ? imgs[0] : null);
      if (url) return url;
      console.error('[falImageGen] Empty fal result body:', result);
      throw new Error('Job completed but no image URL in response body');
    }
    if (s.status === 'FAILED') {
      throw new Error(`Generation failed: ${s.error || 'unknown error'}`);
    }
  }
  throw new Error('Generation timed out (2 min)');
}

// ─── Claude Vision: garment description from any image ──────────────────────

/**
 * Send an image to Claude Vision and get a precise technical garment
 * description suitable for driving NB2 prompts.
 *
 * @param {string} imageBase64 - raw base64 (no "data:..." prefix)
 * @param {string} mediaType   - MIME type, e.g. "image/jpeg"
 * @returns {Promise<string>}
 */
export async function analyzeGarmentImage(imageBase64, mediaType = 'image/jpeg') {
  if (!IS_SUPABASE_ENABLED) throw new Error('Supabase not configured');

  const result = await callProxy('anthropic-proxy', {
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        { type: 'text', text: 'You are a technical fashion designer. Analyze this garment image and output a precise description for generating technical flat lay renders. Include: garment type and silhouette, construction details (panels, seams, pockets, closures), fabric texture and apparent weight, colors and any patterns, hardware and trims, neckline and collar style, sleeve type, hem finish, any graphics or embellishments, and overall style category. Be highly specific and technical. Output only the description — no preamble, no headings.' },
      ],
    }],
  });

  const text = result?.content?.[0]?.text;
  if (!text) throw new Error('No garment description returned from Claude');
  return text;
}

// ─── Background color resolution ─────────────────────────────────────────────
// Translate an FR color name into descriptive language for the prompt.
// Surface mode: 'mannequin' = "background"; 'flat' = "surface".
function describeBackground(colorName, surfaceMode) {
  const key = (colorName || '').toLowerCase();
  const desc = FR_COLOR_PROMPT[key];
  if (!desc) {
    return surfaceMode === 'mannequin'
      ? 'pure white seamless studio background filling every pixel uniformly'
      : 'pure white seamless paper surface filling every pixel uniformly';
  }
  // Critical-spec wording — every pixel must read the specified color, no
  // gradients, no white halo, no spillover. NB2 needs the emphatic phrasing.
  return surfaceMode === 'mannequin'
    ? `seamless ${desc} studio background. EVERY pixel of background behind, above, below, and around the garment must be this exact color — no white, no gradient, no other tones. Solid uniform fill of ${desc}.`
    : `${desc} flat surface. EVERY pixel of surface beneath and around the garment must be this exact color — no white, no gradient, no other tones. Solid uniform fill of ${desc}.`;
}

// ─── Ghost Mannequin generator (default for tech pack design overview) ─────

const GHOST_MANNEQUIN_VIEW_ANGLE = {
  front: 'front-facing view, garment as if worn by an invisible body facing the camera directly, full chest and front panel visible',
  back:  'rear view, garment rotated 180 degrees as if worn by an invisible body facing away, full back panel and any back construction visible',
  side:  'profile side view, garment rotated 90 degrees as if worn by an invisible body in profile, side seam silhouette and sleeve drape visible',
};

/**
 * Generate a single Ghost Mannequin view (front / back / side) using NB2.
 *
 * @param {object} args
 * @param {string} args.garmentDescription
 * @param {'front'|'back'|'side'} args.view
 * @param {string[]} [args.references]      - base64 data URIs (max 6)
 * @param {string} [args.customContext]     - free-form designer additions
 * @param {string} [args.bgColorName]       - FR color name (defaults to 'salt')
 * @param {function} [args.onStatus]
 * @returns {Promise<string>} image CDN URL
 */
export async function generateGhostMannequin({
  garmentDescription,
  view,
  references = [],
  customContext = '',
  bgColorName = 'salt',
  onStatus,
}) {
  if (!IS_SUPABASE_ENABLED) throw new Error('Supabase not configured');
  if (!GHOST_MANNEQUIN_VIEW_ANGLE[view]) throw new Error(`Unknown view: ${view}`);

  const trimmedRefs = references.slice(0, 6);
  const usingRefs = trimmedRefs.length > 0;
  const endpoint = usingRefs ? NB2_EDIT : NB2_TXT2IMG;
  const bg = describeBackground(bgColorName, 'mannequin');

  const refClause = usingRefs
    ? `Using the reference image${trimmedRefs.length > 1 ? 's' : ''} as the source for garment shape, color, fabric texture, construction details, treatments, and embellishments — preserve those elements exactly. `
    : '';

  // Skill rule: critical specs FIRST. The vertical 2:3 portrait composition
  // and the background color are non-negotiable, so they lead.
  const prompt = [
    refClause + `Professional e-commerce product photograph in a strict vertical 2:3 portrait aspect ratio composition. The garment must fill the frame from near the top edge to near the bottom edge with consistent margin on both sides — minimal negative space above the collar or below the hem.`,
    `BACKGROUND: ${bg}`,
    `${garmentDescription}, ghost mannequin invisible mannequin presentation, garment perfectly three-dimensional as if worn by an invisible body, centered horizontally and vertically against the background.`,
    `${GHOST_MANNEQUIN_VIEW_ANGLE[view]}, centered, full garment visible from collar to hem, garment scaled large to fill the vertical frame.`,
    `Visible interior at neckline showing hollow collar construction and any rib trim. Realistic garment volume and natural drape from shoulders, no flat or pasted-on appearance.`,
    customContext ? `Additional designer direction: ${customContext}` : '',
    `Soft even diffuse studio lighting, neutral white balance, no harsh shadows. Sharp focus across entire garment, high-resolution editorial quality, professional fashion product photography.`,
    BRAND_DEFAULTS,
    EXCLUSIONS,
  ].filter(Boolean).join('\n\n');

  return runFalJob({
    endpoint,
    payload: {
      prompt,
      num_images: 1,
      output_format: 'jpeg',
      image_size: RES.ghostMannequin,        // 1360 × 2032 (2:3 portrait)
      aspect_ratio: '2:3',                   // belt-and-suspenders for NB2
      ...(usingRefs ? { image_urls: trimmedRefs } : {}),
    },
    onStatus,
  });
}

// ─── Flat Lay generator ──────────────────────────────────────────────────────

const FLAT_LAY_VIEW_ANGLE = {
  front: 'garment laid perfectly flat face-up on the surface, showing the front panel, neckline, and any front pockets or hardware',
  back:  'garment laid perfectly flat face-down on the surface, showing the back panel, back yoke, and any back construction details',
  side:  'garment laid in profile orientation showing the side seam silhouette, with one sleeve folded neatly along the body and hem visible from the side',
};

/**
 * Generate a single Flat Lay view (front / back / side) using Nano Banana 2.
 *
 * @param {object} args
 * @param {string} args.garmentDescription  - technical garment spec (Claude vision output)
 * @param {'front'|'back'|'side'} args.view
 * @param {string[]} [args.references]      - base64 data URIs (max 6)
 * @param {string} [args.customContext]     - free-form designer additions
 * @param {string} [args.surface]           - flat-lay surface description
 * @param {function} [args.onStatus]        - progress callback
 * @returns {Promise<string>} image CDN URL
 */
export async function generateFlatLay({
  garmentDescription,
  view,
  references = [],
  customContext = '',
  bgColorName = 'salt',
  onStatus,
}) {
  if (!IS_SUPABASE_ENABLED) throw new Error('Supabase not configured');
  if (!FLAT_LAY_VIEW_ANGLE[view]) throw new Error(`Unknown view: ${view}`);

  const trimmedRefs = references.slice(0, 6);
  const usingRefs = trimmedRefs.length > 0;
  const endpoint = usingRefs ? NB2_EDIT : NB2_TXT2IMG;
  const surface = describeBackground(bgColorName, 'flat');

  const refClause = usingRefs
    ? `Using the reference image${trimmedRefs.length > 1 ? 's' : ''} as the source for garment shape, color, fabric texture, construction details, treatments, and embellishments — preserve those elements exactly. `
    : '';

  const prompt = [
    refClause + `Professional flat lay product photograph in a strict vertical 2:3 portrait aspect ratio composition. The garment must fill the vertical frame from near the top edge to near the bottom edge with consistent margin on both sides — minimal negative space at the top or bottom.`,
    `SURFACE: ${surface}`,
    `Top-down overhead orthographic view. ${garmentDescription}, ${FLAT_LAY_VIEW_ANGLE[view]}.`,
    `Garment fully spread, no wrinkles, centered composition with small consistent margin around edges, garment scaled large to fill the vertical frame.`,
    customContext ? `Additional designer direction: ${customContext}` : '',
    `Soft diffuse overhead studio lighting, even illumination, minimal shadows. Sharp focus across entire garment, fabric texture visible. E-commerce catalog standard, professional product photography.`,
    BRAND_DEFAULTS,
    EXCLUSIONS,
  ].filter(Boolean).join('\n\n');

  return runFalJob({
    endpoint,
    payload: {
      prompt,
      num_images: 1,
      output_format: 'jpeg',
      image_size: { width: 1360, height: 2032 }, // override to 2:3 portrait per UI requirement
      aspect_ratio: '2:3',
      ...(usingRefs ? { image_urls: trimmedRefs } : {}),
    },
    onStatus,
  });
}
