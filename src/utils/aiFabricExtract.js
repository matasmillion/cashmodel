// AI fabric-card extractor — analyzes mill-supplied fabric color cards
// (image or PDF) with Claude Vision and returns structured fields the
// FabricBuilder can drop straight onto the draft.
//
// Mill cards are routinely Chinese-only or mixed CN/EN. The model is
// instructed to translate technical terms into the canonical English
// vocabulary the rest of the system uses (composition strings, weave
// keywords, mm/cm units).
//
// Same browser-direct pattern as aiPackingList: API key in localStorage,
// anthropic-dangerous-direct-browser-access header. Falls back to Claude's
// PDF support natively when the user uploads a PDF.

const API_KEY_STORAGE = 'cashmodel_anthropic_key';
const MODEL = 'claude-opus-4-7';

const WEAVE_VOCAB = [
  'jersey', 'french_terry', 'fleece', 'twill', 'denim',
  'poplin', 'oxford', 'rib', 'pique', 'canvas', 'other',
];

export function getStoredKey() {
  return localStorage.getItem(API_KEY_STORAGE) || '';
}

export function saveKey(key) {
  localStorage.setItem(API_KEY_STORAGE, key);
}

const SYSTEM_PROMPT = `You are a textile sourcing analyst for a US fashion brand. You read fabric color cards / spec sheets supplied by Asian mills (often Chinese, sometimes mixed CN/EN, sometimes Japanese or Korean) and translate them into a canonical English schema.

Return ONLY a single JSON object (no markdown fences, no prose) with this shape:

{
  "name": string | null,                    // short fabric name in English ("French Terry 340", "Heavy Selvedge Denim")
  "mill_fabric_no": string | null,          // factory's internal fabric/article number (e.g. "FT-340-OE", "HX-2025-7")
  "category": "knit" | "woven" | null,
  "weave": one of [${WEAVE_VOCAB.join(', ')}] | null,
  "composition": string | null,             // e.g. "100% Cotton (combed)" or "65% Cotton 35% Polyester"
  "weight_gsm": number | null,              // grams per square meter
  "width_cm": number | null,                // usable cuttable width in cm (convert from inches if needed)
  "shrinkage_pct": number | null,           // percent
  "stretch_pct": number | null,             // percent
  "hand": string | null,                    // hand-feel description in English ("soft, dry, slight loop back")
  "mill_id": string | null,                 // mill / supplier name in English when given
  "lead_time_days": number | null,
  "moq_yards": number | null,               // convert from meters or kg if necessary
  "price_per_yard_usd": number | null,      // convert from USD/m, USD/kg, RMB/m if rate is obvious; null otherwise
  "colors": [                                // every distinct swatch/color visible on the card
    { "label": string, "hex": string | null }
  ],
  "notes": string | null                    // anything important not captured above (care, certifications, special finishes)
}

Rules:
- Output ONLY the JSON object. No prose, no markdown code fence.
- If a field is not present or not derivable, use null.
- Translate Chinese terms: 棉=Cotton, 涤纶=Polyester, 氨纶=Spandex, 粘胶=Viscose, 羊毛=Wool, 麻=Linen, 毛圈=Terry, 卫衣=French terry/Fleece, 平纹=Plain/Jersey, 斜纹=Twill, 牛仔=Denim, 罗纹=Rib, 珠地=Piqué, 帆布=Canvas.
- Map mill weaves to our vocabulary (${WEAVE_VOCAB.join(', ')}). If a fabric is "interlock" / "double knit" pick "jersey". If unsure, use "other".
- "category" must match the weave: jersey/french_terry/fleece/rib/pique → knit; twill/denim/poplin/oxford/canvas → woven.
- For colors: read every swatch on the page. Use the mill's color name in English (translate if Chinese). Estimate hex from the swatch fill where visible; null if unclear.
- weight_gsm, width_cm, shrinkage_pct, stretch_pct, lead_time_days, moq_yards, price_per_yard_usd must be plain numbers (no units).`;

function buildContent(media) {
  // media is an array of { mediaType, base64 } — Claude accepts multiple
  // images in one message. PDFs use a "document" block with base64 source.
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

/**
 * Run Claude Vision against one or more fabric-card files.
 * @param {Object} args
 * @param {string} args.apiKey
 * @param {Array<{mediaType: string, base64: string}>} args.media
 * @returns {Promise<Object>} structured fabric fields
 */
export async function extractFabricFromMedia({ apiKey, media }) {
  if (!apiKey) throw new Error('Anthropic API key is required. Add it in Settings → AI.');
  if (!media || media.length === 0) throw new Error('Upload at least one fabric image or PDF.');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildContent(media) }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errText.slice(0, 240)}`);
  }

  const json = await res.json();
  const text = json.content?.[0]?.text || '';
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Could not parse AI response as JSON: ${err.message}\n\nRaw:\n${cleaned.slice(0, 500)}`);
  }
}

/**
 * Read a File into { mediaType, base64 } suitable for extractFabricFromMedia.
 * @param {File} file
 * @returns {Promise<{mediaType: string, base64: string}>}
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
