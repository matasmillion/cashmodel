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
  return `You are a garment manufacturing cost analyst with deep knowledge of regional labor rates across China, Vietnam, Bangladesh, India, Cambodia, Indonesia, Mexico, Portugal, Turkey, and the United States. Given a tech pack and the chosen factory's location, you estimate the BEST-CASE Cut & Sew labor cost per garment in USD.

Return ONLY a single JSON object (no markdown fences, no prose) with this exact shape:

{
  "value": number,
  "low": number,
  "high": number,
  "reasoning": string,
  "vendorContext": string
}

Rules:
- value: best-case (lowest realistic) per-garment Cut & Sew labor cost in USD, rounded to 2 decimals
- low / high: a tight range bracket around the best case (low ≤ value ≤ high)
- reasoning: 2-4 short sentences explaining the math (regional rate × SAM minutes × complexity)
- vendorContext: 1 sentence summarising what you know about the vendor and its city/country (e.g. "Coastal Chinese knit specialist — typical SAM rate \$0.45–0.65/min")
- Use REAL-WORLD knowledge of labor rates. Anchors: China coastal \$0.45–0.80/min, China inland \$0.30–0.50/min, Vietnam \$0.30–0.55/min, Bangladesh \$0.18–0.35/min, India \$0.25–0.45/min, Cambodia \$0.22–0.40/min, Mexico \$0.55–1.00/min, Portugal \$0.85–1.40/min, Turkey \$0.60–1.10/min, USA \$3.50–6.00/min.
- Estimate SAM (Standard Allowed Minutes) from garment complexity:
  · Tee/tank: 6-10 min
  · Polo: 10-14 min
  · Crew sweatshirt: 14-20 min
  · Hoodie (pullover): 18-26 min
  · Zip-up hoodie: 22-30 min
  · Joggers/sweatpants: 14-22 min
  · Shorts: 8-14 min
  · Chinos / dress pants: 22-32 min
  · Denim pants: 26-36 min
  · Denim jacket: 32-45 min
  · Track / bomber jacket: 30-50 min
  · Blazer (unstructured): 50-80 min
  · Coat: 75-120 min
- Adjust SAM up by 10-30% for: more than 3 fabrics, more than 6 trims, more than 10 seam operations, premium tier, complex artwork or treatments.
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
