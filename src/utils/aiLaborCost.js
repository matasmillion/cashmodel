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

// Shared scope block both prompts include. The estimator MUST treat
// fabric, trims, treatments, embellishments and the vendor's profit %
// as already-tracked-elsewhere so they aren't baked into the CMT number
// and double-counted by the tech pack roll-up.
const SCOPE_GUARDRAILS = `
# WHAT YOUR NUMBER COVERS (your scope = CMT labor only)
  + Spreading + marker making + cutting (laser / auto / manual)
  + Bundling + transfer between sewing stations
  + ALL sewing operations from the stitch table
  + Pressing + thread trimming + inline QC
  + Folding + packing the garment into the operator-supplied polybag
  + Factory overhead (machinery, supervision, electricity)
  + (Only when the vendor record has NO separate markup %) factory margin

# WHAT YOUR NUMBER MUST NOT INCLUDE (already tracked on other tech-pack steps — including them here = double-counting)
  − Fabric material cost (already in the Fabrics step, $/m × yield)
  − Fabric finishes: brushing, antibacterial, water-repellent (already in Fabrics step)
  − Trims: buttons, zips, labels, drawcords, elastic (already in Trims step)
  − Packaging: polybag, hangtag, mailer (already in Packaging step)
  − Wash / dye / distress treatments (already in Treatments step)
  − Embroidery / screen print / patches (already in Embellishments step)
  − Vendor profit % markup (the vendor record carries its own markupPct that is added on top by the tech pack — DO NOT bake it in)
  − Sea freight, duties, fulfillment (handled at the Cash tab)

If a factory benchmark in your head includes any of the above, mentally strip them out before quoting. A "pullover hoodie all-in $6" quote from a factory includes the fabric and trims; the CMT-only conversion-labor slice of that is closer to $4. Quote the CMT-only slice.
`;

function buildSystemPromptSamRate() {
  return `You are a garment manufacturing cost analyst. The user has provided an EXACT SAM (Standard Allowed Minute) billing rate from their chosen vendor's contract — your job is to estimate the SAM minutes for this specific garment and multiply.
${SCOPE_GUARDRAILS}
Return ONLY a single JSON object (no markdown fences, no prose) with this exact shape:

{
  "value": number,
  "low": number,
  "high": number,
  "reasoning": string,
  "vendorContext": string
}

SAM-MINUTE BENCHMARKS (best case → typical for an established factory):
- Tee / tank:               6–10 min
- Polo:                     10–14 min
- Crew sweatshirt:          14–20 min
- Pullover hoodie:          18–26 min
- Zip-up hoodie:            22–30 min
- Joggers / sweatpants:     14–22 min
- Shorts:                   8–14 min
- Chinos / dress pants:     22–32 min
- Denim pants:              26–36 min
- Track / bomber jacket:    30–50 min
- Denim jacket:             32–45 min
- Blazer (unstructured):    50–80 min
- Coat (hip-length):        75–120 min
- Trench coat:              100–150 min

COMPLEXITY ADJUSTMENTS to SAM minutes (best case = LOW end with no adjustments unless warranted):
- More than 3 fabrics in the BOM:          +5–10%
- More than 6 trims:                       +5–10%
- More than 10 seam operations:            +10–15%
- Unusual treatments / dyes / artwork:     +5–15%
- Premium tier requirements:               +10–20%

Math: cost USD = SAM minutes × user-provided rate. Compute value at the LOW end of SAM minutes; low/high bracket the SAM range × rate.

Rules:
- value: best-case CMT in USD, rounded to 2 decimals
- low / high: low = (low SAM min) × rate; high = (high SAM min) × rate
- reasoning: 2-4 short sentences. Explicitly call out the SAM-minute estimate, the rate received from the vendor record, and the multiplication. e.g. "Pullover hoodie SAM ~22 min (low end of 18-26 range, no upward adjustment because the BOM is simple). Vendor SAM rate from your record is $0.32/min. 22 × 0.32 = $7.04."
- vendorContext: 1 sentence noting this estimate uses the vendor's contracted SAM rate (not a regional benchmark)
- Output ONLY the JSON. No prose. No code fence.`;
}

function buildSystemPromptCmt() {
  return `You are a garment manufacturing cost analyst. You estimate the BEST-CASE per-garment Cut-Make-Trim (CMT) labor price an established factory would charge a brand, in USD.

CMT here = pure conversion labor: cutting + sewing + finishing + factory overhead. It is NOT a raw worker wage (a coastal China $0.30–0.45/SAM-min rate corresponds to ~$3–5/hr in actual operator wages — most of the rate is overhead and the factory's own margin). CMT also does NOT include any materials — those are tracked on their own tech-pack steps and roll up separately.
${SCOPE_GUARDRAILS}
Anchor your estimate against the observed CMT BENCHMARKS below (best case → typical for an established mid-tier factory). These benchmarks are CMT-only — they exclude fabric/trim material cost:

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

function buildUserMessage({ vendor, garment, samRate }) {
  const rateBlock = samRate
    ? `\nVENDOR SAM RATE (from contract): $${samRate}/min — multiply this by your SAM-minute estimate. Do NOT use regional CMT benchmarks; use the rate above.\n`
    : '';
  const calloutBlock = (garment.constructionCallouts && garment.constructionCallouts.length)
    ? garment.constructionCallouts.map((c, i) => `  ${i + 1}. ${c.title || '(untitled)'}${c.description ? ` — ${c.description}` : ''}`).join('\n')
    : '  (none specified)';
  const stitchBlock = (garment.stitchOperations && garment.stitchOperations.length)
    ? garment.stitchOperations.map((s, i) => `  ${i + 1}. ${s.seam || '(unnamed seam)'} — stitch ${s.stitchType || '—'}${s.seamType ? `, ${s.seamType}` : ''}${s.machine ? `, ${s.machine}` : ''}${s.spi ? `, ${s.spi}` : ''}`).join('\n')
    : '  (none specified)';
  return `VENDOR
Name: ${vendor.name || '—'}
Country: ${vendor.country || '—'}
City: ${vendor.city || '—'}
${rateBlock}
GARMENT
Style name: ${garment.styleName || '—'}
Style number: ${garment.styleNumber || '—'}
Product type: ${garment.productType || '—'}
Tier: ${garment.productTier || '—'}
Designer notes: ${garment.designNotes || '—'}
Key features: ${garment.keyFeatures || '—'}
Fit: ${garment.fit || '—'}

CONSTRUCTION CALL-OUTS (from the Construction pages — what is being built)
${calloutBlock}

STITCH OPERATIONS (from the Sewing pages — each seam's stitch type / machine / SPI)
${stitchBlock}

COMPLEXITY DRIVERS THAT BELONG IN YOUR CMT NUMBER
Seam operations: ${garment.seamCount}    ← drives sewing SAM (use the stitch list above for the real operation mix)
Pattern pieces:  ${garment.pieceCount}   ← drives cutting + handling SAM

CONTEXT THAT BELONGS ELSEWHERE — for awareness only, DO NOT add the dollar value into your number
Fabrics picked:  ${garment.fabricsCount} (${garment.fabricsList || 'none'})  ← material $ already in Fabrics step
Trims picked:    ${garment.trimsCount}                                    ← already in Trims step
Treatments:      ${garment.treatmentsCount}                               ← already in Treatments step
(If any of these are unusually high — e.g. 4+ fabrics, 10+ trims, multiple treatments — apply a small COMPLEXITY uplift to SAM only because more pieces means more handling. Never add the per-unit material cost itself.)

Estimate the best-case CMT-only labor cost per garment for this vendor, in USD. Return JSON only.`;
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
 *
 * Two modes:
 *   - When `vendor.samRateUsdPerMin` is a positive number, the model is
 *     told to estimate SAM minutes from garment complexity and multiply
 *     by that contracted rate. Most accurate path.
 *   - Otherwise the model falls back to observed regional CMT benchmarks
 *     by garment + region. Used when the vendor record has no SAM rate
 *     (typical for new vendors or non-Cut & Sew suppliers).
 *
 * @param {Object} args
 * @param {{name?: string, country?: string, city?: string, samRateUsdPerMin?: string|number}} args.vendor
 * @param {Object} args.garment style/BOM/seam summary
 * @returns {Promise<{value:number, low:number, high:number, reasoning:string, vendorContext:string, mode:string, samRate:number|null}>}
 */
export async function estimateLaborCost({ vendor, garment }) {
  if (!vendor?.name) {
    throw new Error('Set a vendor on the Style Overview page first — the AI uses the vendor name and location to anchor the estimate.');
  }
  const samRate = parseFloat(vendor.samRateUsdPerMin);
  const useSamMode = Number.isFinite(samRate) && samRate > 0;
  const system  = useSamMode ? buildSystemPromptSamRate() : buildSystemPromptCmt();
  const userMsg = buildUserMessage({ vendor, garment, samRate: useSamMode ? samRate : null });
  const json = await callAnthropicProxy({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: userMsg }],
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
    mode: useSamMode ? 'sam_rate' : 'cmt_benchmark',
    samRate: useSamMode ? samRate : null,
  };
}
