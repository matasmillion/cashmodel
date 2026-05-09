// AI treatment-card extractor — analyzes vendor-supplied wash / dye /
// print sample cards (image or PDF) with Claude Vision and returns
// structured fields the TreatmentBuilder can drop straight onto the
// draft.
//
// Vendor cards are routinely Chinese-only or mixed CN/EN. The model is
// instructed to translate technical terms into the canonical English
// vocabulary the rest of the system uses (treatment type ids, units).
//
// Routes through the same `anthropic-proxy` Supabase edge function the
// fabric extractor uses, so the org's stored Anthropic credential is
// reused — no per-feature API key prompt.

import { getClerkToken } from '../lib/auth';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY;
const MODEL        = 'claude-opus-4-7';

const TYPE_VOCAB = ['wash', 'garment_dye', 'piece_dye', 'print', 'finish', 'distress'];

function buildSystemPrompt(knownVendors) {
  const vendorBlock = knownVendors && knownVendors.length
    ? `\n\nKNOWN VENDORS (existing in our library):\n${knownVendors.map(n => `- ${n}`).join('\n')}\n\nIf the laundry / dyehouse / print shop on the card matches one of these (even partially — e.g. "Guangzhou Stoneworks", "Stoneworks Wash Lab", "Stoneworks Garment Dye" all refer to the same Stoneworks), output the EXACT name from the list above in primary_vendor. Only invent a new primary_vendor if no entry above plausibly matches.`
    : '';

  return `You are a garment-finishing sourcing analyst for a US fashion brand. You read sample / spec cards supplied by Asian laundries, dyehouses, and print shops (often Chinese, sometimes mixed CN/EN, sometimes Japanese or Korean) and translate them into a canonical English schema.

Return ONLY a single JSON object (no markdown fences, no prose) with this shape:

{
  "name": string | null,
  "type": one of [${TYPE_VOCAB.join(', ')}] | null,
  "base_color_name": string | null,
  "base_color_hex": string | null,
  "primary_vendor": string | null,
  "lead_time_days": number | null,
  "moq_units": number | null,
  "cost_per_unit_usd": number | null,
  "cost_per_unit_cny": number | null,
  "shrinkage_expected_pct": number | null,
  "notes": string | null
}

Rules:
- Output ONLY the JSON object. No prose, no markdown code fence.
- If a field is not present or not derivable, use null.
- Translate Chinese terms: 水洗=Wash, 石洗=Stone wash, 酶洗=Enzyme wash, 漂洗=Bleach wash, 成衣染=Garment dye, 匹染=Piece dye, 印花=Print, 后整理=Finish, 做旧=Distress, 起订量=MOQ, 交期=Lead time, 单价=Unit cost.
- Map the finishing process to our vocabulary (${TYPE_VOCAB.join(', ')}). Stone / enzyme / acid / bleach washes → "wash". Reactive / pigment garment dye → "garment_dye". Yarn-dye or fabric-dye in the piece → "piece_dye". Screen / sublimation / DTG → "print". Softeners, anti-pill, water-repellent → "finish". Sandblasting, hand-sanding, rips → "distress".
- "base_color_name" is the dominant finished color shown on the card (the customer-facing name like "Vintage Indigo", "Sun Bleached Sand"). "base_color_hex" is the closest visual hex.
- All numeric fields must be plain numbers (no units).
- Units are METRIC. moq_units is in pieces; lead_time_days is in days.
- Pricing and MOQ are often buried in free-form notes / footers / margin scrawl rather than a labeled field. SCAN the entire card (including handwritten notes, footnotes, "备注", "价格", "起订量") for these.
  · Capture the cost exactly as it appears on the card: if you see "¥12 RMB/pc", set cost_per_unit_cny = 12; if you see "$1.80/pc", set cost_per_unit_usd = 1.80. Do NOT convert currencies — the client handles USD ↔ RMB conversion with a live FX rate.
  · MOQ may appear as "起订量 1000pcs", "MOQ 1000", "min order 1000pc" — capture the numeric value as moq_units.
- Honor any instructions from the user message. If the user says they only want certain fields (e.g. "just refresh the vendor and lead time, leave everything else"), return null for every field they didn't ask about — the apply step skips null fields, so this leaves the existing draft untouched.${vendorBlock}`;
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
    ? `User instructions:\n${trimmed}\n\nExtract the treatment specification from these vendor documents, honoring the instructions above. Return JSON only.`
    : 'Extract the treatment specification from these vendor documents. Return JSON only.';
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
 * Run Claude Vision against one or more treatment-card files.
 * @param {Object} args
 * @param {Array<{mediaType: string, base64: string}>} args.media
 * @param {string[]} [args.knownVendors] vendor names already in the library —
 *   passed into the system prompt so the model reuses an existing entry
 *   instead of inventing a near-duplicate.
 * @param {string} [args.instructions] free-form user note appended to the
 *   user message. Lets the user scope the extraction.
 */
export async function extractTreatmentFromMedia({ media, knownVendors = [], instructions = '' }) {
  if (!media || media.length === 0) throw new Error('Upload at least one treatment image or PDF.');

  const json = await callAnthropicProxy({
    model: MODEL,
    max_tokens: 4096,
    system: buildSystemPrompt(knownVendors),
    messages: [{ role: 'user', content: buildContent(media, instructions) }],
  });

  const blocks = Array.isArray(json?.content) ? json.content : [];
  const text = blocks.find(b => b?.type === 'text')?.text || blocks[0]?.text || '';
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Could not parse AI response as JSON: ${err.message}\n\nRaw:\n${cleaned.slice(0, 500)}`);
  }
}

/**
 * Read a File into { mediaType, base64 } suitable for extractTreatmentFromMedia.
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
