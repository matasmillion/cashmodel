// AI fabric-card extractor — analyzes mill-supplied fabric color cards
// (image or PDF) with Claude Vision and returns structured fields the
// FabricBuilder can drop straight onto the draft.
//
// Mill cards are routinely Chinese-only or mixed CN/EN. The model is
// instructed to translate technical terms into the canonical English
// vocabulary the rest of the system uses (composition strings, weave
// keywords, mm/cm units).
//
// Routes through the same `anthropic-proxy` Supabase edge function the
// Creative Engine uses, so the org's stored Anthropic credential is
// reused — no per-feature API key prompt.

import { getClerkToken } from '../lib/auth';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY;
const MODEL        = 'claude-opus-4-7';

const WEAVE_VOCAB = [
  'jersey', 'french_terry', 'fleece', 'twill', 'denim',
  'poplin', 'oxford', 'rib', 'pique', 'canvas', 'other',
];

function buildSystemPrompt(knownVendors) {
  const vendorBlock = knownVendors && knownVendors.length
    ? `\n\nKNOWN VENDORS (existing in our library):\n${knownVendors.map(n => `- ${n}`).join('\n')}\n\nIf the mill on the card matches one of these (even partially — e.g. "Jufeng Textile", "Jufeng Cloth Industry", "Jufeng Mill" all refer to the same Jufeng), output the EXACT name from the list above in mill_id. Only invent a new mill_id if no entry above plausibly matches.`
    : '';

  return `You are a textile sourcing analyst for a US fashion brand. You read fabric color cards / spec sheets supplied by Asian mills (often Chinese, sometimes mixed CN/EN, sometimes Japanese or Korean) and translate them into a canonical English schema.

Return ONLY a single JSON object (no markdown fences, no prose) with this shape:

{
  "name": string | null,
  "mill_fabric_no": string | null,
  "category": "knit" | "woven" | null,
  "weave": one of [${WEAVE_VOCAB.join(', ')}] | null,
  "composition": string | null,
  "weight_gsm": number | null,
  "width_cm": number | null,
  "shrinkage_pct": number | null,
  "stretch_pct": number | null,
  "hand": string | null,
  "mill_id": string | null,
  "lead_time_days": number | null,
  "moq_meters": number | null,
  "price_per_meter_usd": number | null,
  "price_per_meter_cny": number | null,
  "price_per_kg_usd": number | null,
  "price_per_kg_cny": number | null,
  "colors": [ { "label": string, "hex": string | null } ],
  "notes": string | null
}

Rules:
- Output ONLY the JSON object. No prose, no markdown code fence.
- If a field is not present or not derivable, use null.
- Translate Chinese terms: 棉=Cotton, 涤纶=Polyester, 氨纶=Spandex, 粘胶=Viscose, 羊毛=Wool, 麻=Linen, 毛圈=Terry, 卫衣=French terry/Fleece, 平纹=Plain/Jersey, 斜纹=Twill, 牛仔=Denim, 罗纹=Rib, 珠地=Piqué, 帆布=Canvas.
- Map mill weaves to our vocabulary (${WEAVE_VOCAB.join(', ')}). If a fabric is "interlock" / "double knit" pick "jersey". If unsure, use "other".
- "category" must match the weave: jersey/french_terry/fleece/rib/pique → knit; twill/denim/poplin/oxford/canvas → woven.
- Read every distinct color swatch on the card. Estimate hex from the swatch fill where visible; null if unclear.
- All numeric fields must be plain numbers (no units).
- Units are METRIC. moq_meters is in meters; price_per_meter_usd is USD per meter.
- Pricing and MOQ are often buried in free-form notes / footers / margin scrawl rather than a labeled field. SCAN the entire card (including handwritten notes, footnotes, "备注", "价格", "起订量") for these.
  · Capture each price exactly as it appears on the card: if you see "37.5 RMB/m", set price_per_meter_cny = 37.5; if you see "55.12 RMB/kg", set price_per_kg_cny = 55.12; if you see "$5.20/m", set price_per_meter_usd = 5.20. Do NOT convert currencies — the client handles USD ↔ RMB conversion with a live FX rate.
  · price_per_meter and price_per_kg are independent quotes from the mill. Fill in only the ones actually shown; leave the others null. Never derive one unit from the other.
  · MOQ may appear as "起订量 1000m", "MOQ 1000m", "min order 1000m" — capture the numeric value as moq_meters.
- Honor any instructions from the user message. If the user says they only want certain fields (e.g. "just add these new colors, leave everything else alone"), return null for every field they didn't ask about — the apply step skips null fields, so this leaves the existing draft untouched.${vendorBlock}`;
}

function buildContent(media, instructions) {
  const out = [];
  for (const m of media) {
    if (m.mediaType === 'application/pdf') {
      out.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: m.base64 },
      });
    } else {
      out.push({
        type: 'image',
        source: { type: 'base64', media_type: m.mediaType, data: m.base64 },
      });
    }
  }
  const trimmed = String(instructions || '').trim();
  const userText = trimmed
    ? `User instructions:\n${trimmed}\n\nExtract the fabric specification from these mill documents, honoring the instructions above. Return JSON only.`
    : 'Extract the fabric specification from these mill documents. Return JSON only.';
  out.push({ type: 'text', text: userText });
  return out;
}

async function callAnthropicProxy(body) {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error('Supabase is not configured for this build.');
  }
  const token = await getClerkToken();
  if (!token) throw new Error('Sign in to use AI extraction.');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/anthropic-proxy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const e = data.error;
    const msg = typeof e === 'string'
      ? e
      : (e?.message || e?.type || JSON.stringify(e) || `anthropic-proxy returned ${res.status}`);
    if (/credential|api[_ ]?key|integration|provider/i.test(msg)) {
      throw new Error('No Anthropic credential found for this org. Add one in Settings → Integrations.');
    }
    throw new Error(msg);
  }
  return data;
}

/**
 * Run Claude Vision against one or more fabric-card files.
 * @param {Object} args
 * @param {Array<{mediaType: string, base64: string}>} args.media
 * @param {string[]} [args.knownVendors] vendor names already in the library —
 *   passed into the system prompt so the model reuses an existing entry
 *   instead of inventing a near-duplicate (e.g. "Jufeng Textile" vs
 *   "Jufeng Cloth Industry Ltd").
 * @param {string} [args.instructions] free-form user note appended to the
 *   user message. Lets the user scope the extraction (e.g. "just add these
 *   new colors, don't change anything else"). The system prompt tells the
 *   model to return null for fields the user didn't ask about, and the
 *   apply step skips null fields — so partial updates leave the draft
 *   untouched everywhere except where the user wants changes.
 */
export async function extractFabricFromMedia({ media, knownVendors = [], instructions = '' }) {
  if (!media || media.length === 0) throw new Error('Upload at least one fabric image or PDF.');

  // Big swatch cards (20+ colorways) can produce 4–8KB of JSON. Cap well
  // above worst-case observed output so we don't get a mid-string cutoff.
  const json = await callAnthropicProxy({
    model: MODEL,
    max_tokens: 16384,
    system: buildSystemPrompt(knownVendors),
    messages: [{ role: 'user', content: buildContent(media, instructions) }],
  });

  const blocks = Array.isArray(json?.content) ? json.content : [];
  const text = blocks.find(b => b?.type === 'text')?.text || blocks[0]?.text || '';
  const stop = json?.stop_reason;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (firstErr) {
    // Truncation is the common failure mode: 20+ colorways across 5 cards
    // can blow past max_tokens, or the upstream connection drops mid-stream.
    // Try to repair (close dangling strings / arrays / objects) so the user
    // still gets the fields the model managed to emit.
    const repaired = repairTruncatedJson(cleaned);
    if (repaired !== null) {
      try { return JSON.parse(repaired); } catch { /* fall through */ }
    }

    const truncated = stop && stop !== 'end_turn' && stop !== 'stop_sequence';
    if (truncated) {
      throw new Error(`AI response was cut off (stop_reason: ${stop}) — too many color swatches to fit in one pass. Try uploading fewer cards at a time, or split very large color cards.`);
    }
    throw new Error(`Could not parse AI response as JSON: ${firstErr.message}\n\nRaw:\n${cleaned.slice(0, 500)}`);
  }
}

/**
 * Best-effort repair of a JSON string truncated mid-output. Closes a
 * dangling string, drops the trailing partial element back to the last
 * comma or container opener, and closes any still-open arrays/objects.
 * Returns null if the input doesn't look recoverable.
 */
function repairTruncatedJson(src) {
  if (!src || src[0] !== '{' && src[0] !== '[') return null;

  const stack = [];
  let inString = false;
  let escape = false;
  let lastSafe = -1;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') { inString = false; }
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '{' || c === '[') { stack.push(c); lastSafe = i; }
    else if (c === '}' || c === ']') { stack.pop(); lastSafe = i; }
    else if (c === ',') { lastSafe = i; }
  }

  if (stack.length === 0 && !inString) return null;

  let head = inString ? src.slice(0, lastSafe + 1) : src;
  head = head.replace(/[,\s]+$/, '');
  // If truncation lands right on an unfilled opener (e.g. `..., {`),
  // drop the empty placeholder and any preceding comma so we don't
  // leave a stray `{}` or `[]` entry in the parent container.
  if (/[{[]$/.test(head)) {
    head = head.replace(/[,\s]*[{[]$/, '');
    head = head.replace(/[,\s]+$/, '');
  }

  const openers = [];
  let s = false, e = false;
  for (let i = 0; i < head.length; i++) {
    const c = head[i];
    if (s) {
      if (e) { e = false; continue; }
      if (c === '\\') { e = true; continue; }
      if (c === '"') s = false;
      continue;
    }
    if (c === '"') { s = true; continue; }
    if (c === '{' || c === '[') openers.push(c);
    else if (c === '}' || c === ']') openers.pop();
  }

  let tail = '';
  for (let i = openers.length - 1; i >= 0; i--) {
    tail += openers[i] === '{' ? '}' : ']';
  }
  return head + tail;
}

const SWATCH_SYSTEM = `You are analyzing a fabric swatch color card image. Your job is to identify every individual color swatch region in the image.

Return ONLY a JSON array. Each element represents one distinct color swatch:
[
  {
    "label": "color name or number exactly as printed near the swatch (e.g. '01 Ivory', 'Stone', '#4 Navy')",
    "x": 0.05,
    "y": 0.10,
    "w": 0.20,
    "h": 0.15
  }
]

Rules:
- x, y = top-left corner as a fraction of the full image dimensions (0.0–1.0)
- w, h = width/height of the swatch region as fractions (0.0–1.0)
- x + w must be ≤ 1.0, y + h must be ≤ 1.0
- Include only the actual textile swatch area — not the text label below/beside it
- If the label text is below the swatch, exclude it from the bounding box
- Exclude headers, logos, spec tables, white margins, borders
- If no label is visible for a swatch, use "Color NN" (sequential number)
- Output ONLY the JSON array, nothing else`;

/**
 * Run Claude Vision against a single swatch-card image and return detected
 * swatch regions as [{ label, x, y, w, h }] with coordinates as 0-1 fractions.
 * @param {{ mediaType: string, base64: string }} media
 */
export async function extractSwatchesFromImage({ media }) {
  if (!media) throw new Error('No image provided.');
  const json = await callAnthropicProxy({
    model: MODEL,
    max_tokens: 8192,
    system: SWATCH_SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: media.mediaType, data: media.base64 } },
        { type: 'text', text: 'Identify all individual color swatches in this fabric color card. Return the JSON array of swatch regions.' },
      ],
    }],
  });

  const text = (Array.isArray(json?.content) ? json.content : []).find(b => b?.type === 'text')?.text || '';
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A large color card (20-30+ swatches) can blow past max_tokens and cut
    // the array off mid-element. Salvage the regions that did come through.
    const repaired = repairTruncatedJson(cleaned);
    if (repaired !== null) {
      try {
        const parsed = JSON.parse(repaired);
        return Array.isArray(parsed) ? parsed : [];
      } catch { /* fall through */ }
    }
    return [];
  }
}

/**
 * Crop a normalized (0-1 fraction) region out of an image File and return a
 * WebP Blob. Shared by SwatchScanModal and FabricAIExtract so both produce
 * identical crops. Returns null if the region is too small to be useful.
 * @param {File|Blob} file source image
 * @param {{x:number,y:number,w:number,h:number}} region 0-1 fractions
 */
export function cropRegionFromFile(file, { x, y, w, h }) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const srcX = Math.round(img.naturalWidth  * Math.max(0, x));
      const srcY = Math.round(img.naturalHeight * Math.max(0, y));
      const srcW = Math.round(img.naturalWidth  * Math.min(w, 1 - x));
      const srcH = Math.round(img.naturalHeight * Math.min(h, 1 - y));
      if (srcW < 4 || srcH < 4) { resolve(null); return; }
      const canvas = document.createElement('canvas');
      canvas.width  = srcW;
      canvas.height = srcH;
      canvas.getContext('2d').drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/webp', 0.92);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image load failed')); };
    img.src = objectUrl;
  });
}

/**
 * Detect + crop every swatch in a single image File in one call. Returns
 * [{ label, blob }] ready for upload. Used by both the dedicated scanner and
 * the general fabric-card importer so a dropped color card always yields the
 * actual cropped swatch images labeled by their printed color number.
 * @param {File} file
 */
export async function detectAndCropSwatches(file) {
  const media = await fileToMedia(file);
  const regions = await extractSwatchesFromImage({ media });
  const cropped = await Promise.all(regions.map(async (r, i) => {
    try {
      const blob = await cropRegionFromFile(file, r);
      if (!blob) return null;
      return { label: r.label || `Color ${String(i + 1).padStart(2, '0')}`, blob };
    } catch { return null; }
  }));
  return cropped.filter(Boolean);
}

/**
 * Read a File into { mediaType, base64 } suitable for extractFabricFromMedia.
 */
export function fileToMedia(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const m = /^data:([^;]+);base64,(.*)$/.exec(result);
      if (!m) { reject(new Error('Unsupported file encoding')); return; }
      resolve({ mediaType: m[1], base64: m[2] });
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}
