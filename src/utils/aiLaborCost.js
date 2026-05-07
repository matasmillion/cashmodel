// AI Cut & Sew labor cost estimator — asks Claude to anchor a per-garment
// stitching labor cost against the chosen vendor's region/tier and the
// garment's complexity (fabric count, seam count, pattern pieces).
//
// Routes through the same `anthropic-proxy` Supabase edge function the
// rest of the app uses (see aiFabricExtract.js), so the org's stored
// Anthropic credential is reused — no per-feature API key prompt.

import { getClerkToken } from '../lib/auth';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY;
const MODEL        = 'claude-opus-4-7';

function buildSystemPrompt() {
  return `You are a garment manufacturing cost analyst. You estimate the BEST-CASE per-garment Cut-Make-Trim (CMT) price an established factory would charge a brand, in USD.

CMT is the all-in price the factory invoices for cutting, sewing, and finishing one garment. It already INCLUDES: direct sewing labor, indirect labor, factory overhead, machinery cost, and the factory's profit margin. CMT is NOT a raw worker wage. A coastal China factory billing roughly \$0.30–0.45/SAM-minute corresponds to ~\$3–5/hr in actual operator wages — most of the rate is overhead + margin.

Anchor your estimate against the observed CMT BENCHMARKS below (best case → typical for an established mid-tier factory):

CHINA (coastal — Guangdong / Zhejiang / Jiangsu / Fujian)
- Tee / tank:               \$1.20–\$2.50
- Polo:                     \$1.80–\$3.50
- Crew sweatshirt:          \$3.00–\$5.50
- Pullover hoodie:          \$4.00–\$6.50
- Zip-up hoodie:            \$5.00–\$8.00
- Joggers / sweatpants:     \$3.00–\$5.00
- Shorts:                   \$1.80–\$3.20
- Chinos / dress pants:     \$5.50–\$8.50
- Denim pants:              \$6.00–\$10.00
- Track / bomber jacket:    \$6.50–\$10.50
- Denim jacket:             \$7.00–\$12.00
- Blazer (unstructured):    \$13.00–\$22.00
- Coat (hip-length):        \$18.00–\$32.00
- Trench coat:              \$25.00–\$45.00

REGIONAL ADJUSTMENTS (apply to the China-coastal benchmark):
- China inland (Hubei / Anhui / Sichuan): −20%
- Vietnam:                                 −5% to −10%
- Cambodia:                                −35%
- Bangladesh:                              −55%
- India:                                   −30%
- Indonesia:                               −20%
- Mexico (near-shore for US):              +35%
- Turkey:                                  +30%
- Portugal / Eastern Europe:               +75%
- USA (domestic):                          +500%

COMPLEXITY ADJUSTMENTS (apply to the base CMT only when warranted):
- More than 3 fabrics in the BOM:          +5–10%
- More than 6 trims:                       +5–10%
- More than 10 seam operations:            +10–15%
- Unusual treatments / dyes / artwork:     +5–15%
- Premium tier requirements (Tier 1 brands, AQL 1.5, photography support): +10–20%

BEST CASE means the LOW end of the range with NO upward adjustments unless complexity genuinely demands it. A simple pullover hoodie out of coastal Guangdong with a normal BOM should land around \$4.00–\$5.00, not the high end.

Return ONLY a single JSON object (no markdown fences, no prose) with this exact shape:

{
  "value": number,
  "low": number,
  "high": number,
  "reasoning": string,
  "vendorContext": string
}

- value: best-case CMT in USD, rounded to 2 decimals (low end of the range, all-in)
- low / high: tight bracket around best case (low ≤ value ≤ high)
- reasoning: 2-4 short sentences. Cite the regional benchmark you started from, any complexity adjustments you applied, and the final number. Do NOT present "rate × SAM" as if the rate were a wage — explain that the regional CMT benchmark for this garment is X and you adjusted by Y.
- vendorContext: 1 sentence summarising what you know about the vendor + city/country and the typical factory tier there
- Output ONLY the JSON. No prose. No code fence.`;
}

function buildUserMessage({ vendor, garment }) {
  return `VENDOR
Name: ${vendor.name || '—'}
Country: ${vendor.country || '—'}
City: ${vendor.city || '—'}

GARMENT
Style name: ${garment.styleName || '—'}
Style number: ${garment.styleNumber || '—'}
Product type: ${garment.productType || '—'}
Tier: ${garment.productTier || '—'}
Designer notes: ${garment.designNotes || '—'}
Key features: ${garment.keyFeatures || '—'}
Fit: ${garment.fit || '—'}

COMPLEXITY
Fabrics picked: ${garment.fabricsCount} (${garment.fabricsList || 'none'})
Trims picked: ${garment.trimsCount}
Seam operations: ${garment.seamCount}
Pattern pieces: ${garment.pieceCount}
Treatments: ${garment.treatmentsCount}

Estimate the best-case Cut & Sew labor cost per garment for this vendor, in USD. Return JSON only.`;
}

async function callAnthropicProxy(body) {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error('Supabase is not configured for this build.');
  }
  const token = await getClerkToken();
  if (!token) throw new Error('Sign in to use AI estimation.');
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
 * Ask Claude to estimate a per-garment Cut & Sew labor cost.
 * @param {Object} args
 * @param {{name?: string, country?: string, city?: string}} args.vendor
 * @param {Object} args.garment style/BOM/seam summary
 * @returns {Promise<{value:number, low:number, high:number, reasoning:string, vendorContext:string}>}
 */
export async function estimateLaborCost({ vendor, garment }) {
  if (!vendor?.name) {
    throw new Error('Set a vendor on the Style Overview page first — the AI uses the vendor name and location to anchor the estimate.');
  }
  const json = await callAnthropicProxy({
    model: MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: buildUserMessage({ vendor, garment }) }],
  });
  const blocks = Array.isArray(json?.content) ? json.content : [];
  const text = blocks.find(b => b?.type === 'text')?.text || blocks[0]?.text || '';
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Could not parse AI response as JSON: ${err.message}\n\nRaw:\n${cleaned.slice(0, 400)}`);
  }
  // Coerce numerics — model occasionally returns strings.
  const value = Number(parsed.value);
  const low   = Number(parsed.low ?? value);
  const high  = Number(parsed.high ?? value);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('AI returned a non-numeric estimate. Try again or enter the cost manually.');
  }
  return {
    value,
    low,
    high,
    reasoning: String(parsed.reasoning || ''),
    vendorContext: String(parsed.vendorContext || ''),
  };
}
