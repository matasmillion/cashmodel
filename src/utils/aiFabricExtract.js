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

const SYSTEM_PROMPT = `You are a textile sourcing analyst for a US fashion brand. You read fabric color cards / spec sheets supplied by Asian mills (often Chinese, sometimes mixed CN/EN, sometimes Japanese or Korean) and translate them into a canonical English schema.

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
  "moq_yards": number | null,
  "price_per_yard_usd": number | null,
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
- All numeric fields must be plain numbers (no units).`;

function buildContent(media) {
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
  out.push({
    type: 'text',
    text: 'Extract the fabric specification from these mill documents. Return JSON only.',
  });
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
 */
export async function extractFabricFromMedia({ media }) {
  if (!media || media.length === 0) throw new Error('Upload at least one fabric image or PDF.');

  // Big swatch cards (20+ colorways) can produce 4–8KB of JSON. Cap well
  // above worst-case observed output so we don't get a mid-string cutoff.
  const json = await callAnthropicProxy({
    model: MODEL,
    max_tokens: 16384,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildContent(media) }],
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
