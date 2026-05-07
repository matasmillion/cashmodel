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

import { getClerkToken } from '../lib/auth';
import { IS_SUPABASE_ENABLED } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY;

const NB2_TXT2IMG = 'fal-ai/nano-banana-2';
const NB2_EDIT    = 'fal-ai/nano-banana-2/edit';

const POLL_MS   = 3000;
const MAX_POLLS = 40; // ~2 min

// ─── FR brand color translation ──────────────────────────────────────────────
// Hex alone reads as near-black on NB2. Always pair with descriptive language.
export const FR_COLOR_PROMPT = {
  slate:  'medium-dark slate grey, the color of weathered concrete, approximately 25% lightness, warm neutral undertone — clearly distinguishable as GREY, NOT near-black, NOT charcoal',
  salt:   'warm cream ivory, the color of unbleached raw linen — warm off-white with subtle tan warmth, NOT pure white, NOT yellow',
  sand:   'warm sand beige, the color of dry beach sand — between cream and khaki, desaturated warm mid-tone',
  stone:  'mid-tone grey-brown, the color of river stone — balanced neutral, approximately 45% lightness',
  soil:   'warm earth brown, the color of dry clay soil — muted, desaturated, NOT orange, NOT chocolate',
  sea:    'dusty steel blue, the color of overcast ocean — muted, desaturated, soft blue-grey',
  sage:   'muted sage green, the color of dried eucalyptus — desaturated, grey-green, NOT lime, NOT forest',
  sienna: 'warm sienna orange-brown, the color of terracotta clay — earthy, muted, NOT bright orange',
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
    const e = data.error;
    const msg = typeof e === 'string'
      ? e
      : (e?.message || e?.type || JSON.stringify(e) || `${name} returned ${res.status}`);
    throw new Error(msg);
  }
  return data;
}

// Submit a fal queue job, poll status, fetch response body, return image URL.
async function runFalJob({ endpoint, payload, onStatus }) {
  onStatus?.('submitting');
  const submitted = await callProxy('fal-proxy', { endpoint, payload });
  if (!submitted.request_id) throw new Error('No request_id from fal');

  const statusUrl = submitted.status_url
    || `https://queue.fal.run/${endpoint}/requests/${submitted.request_id}/status`;
  const responseUrl = submitted.response_url
    || `https://queue.fal.run/${endpoint}/requests/${submitted.request_id}`;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, POLL_MS));
    onStatus?.('polling', i + 1);

    const s = await callProxy('fal-proxy', { endpoint: statusUrl, method: 'GET' });

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
    model: 'claude-opus-4-7',
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

// ─── Flat Lay generator (used by tech pack design overview) ─────────────────

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
  surface = 'pure white seamless paper',
  onStatus,
}) {
  if (!IS_SUPABASE_ENABLED) throw new Error('Supabase not configured');
  if (!FLAT_LAY_VIEW_ANGLE[view]) throw new Error(`Unknown view: ${view}`);

  const trimmedRefs = references.slice(0, 6);
  const usingRefs = trimmedRefs.length > 0;
  const endpoint = usingRefs ? NB2_EDIT : NB2_TXT2IMG;

  // Skill rule: with references, lead with explicit preservation language so
  // the model treats unmentioned elements as creative freedom.
  const refClause = usingRefs
    ? `Using the reference image${trimmedRefs.length > 1 ? 's' : ''} as the source for garment shape, color, fabric texture, and construction details — preserve those exactly. `
    : '';

  // Skill rule: critical specs FIRST.
  const prompt = [
    refClause + `Professional flat lay product photograph, top-down overhead orthographic view.`,
    `${garmentDescription}, ${FLAT_LAY_VIEW_ANGLE[view]}, on ${surface}.`,
    `Garment fully spread, no wrinkles, centered composition with small consistent margin around edges.`,
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
      image_size: RES.flatLay,
      ...(usingRefs ? { image_urls: trimmedRefs } : {}),
    },
    onStatus,
  });
}
