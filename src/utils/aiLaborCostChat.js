// Cut & Sew labor cost — conversational refinement.
// Multi-turn chat that lets the operator interrogate, push back on, or
// negotiate the AI's CMT estimate against actual factory quotes and the
// real garment spec (seam ops, pattern pieces, vendor SAM rate).
//
// Routes through the same `anthropic-proxy` Supabase edge function the
// rest of the AI features use. The proxy attaches the org's stored
// Anthropic credential, so there's no per-feature API key prompt.

import { getClerkToken } from '../lib/auth';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY;
const MODEL        = 'claude-opus-4-7';

// System prompt locks the assistant's scope. Critical: the assistant must
// NOT include fabric, trims, embellishments, treatments, or vendor markup
// in its number — those are tracked separately on the tech pack and would
// double-count if rolled into CMT. The structured tail (CURRENT ESTIMATE
// + GARMENT + STITCH OPERATIONS + VENDOR) is appended once per
// conversation as the first user message; the chat then proceeds turn by
// turn.
const SYSTEM_PROMPT = `You are a garment manufacturing cost analyst helping a brand operator refine a per-garment CUT-MAKE-TRIM (CMT) labor estimate against a real factory.

# WHAT CMT COVERS (your scope)
CMT is conversion labor only — turning the operator-supplied fabric + trims into a finished garment. The CMT figure you estimate INCLUDES:
  • Spreading + marker making + cutting (laser / auto / manual)
  • Bundling + transfer between stations
  • All sewing operations from the stitch table
  • Pressing, thread trimming, inline QC
  • Folding + packing into the operator-supplied polybag
  • Factory overhead (machinery, supervision, indirect labor, electricity)
  • Factory profit margin (when the operator's vendor record has no separate markup %)

# WHAT CMT DOES *NOT* COVER (already tracked elsewhere on the tech pack — do NOT add these into your number)
  • Fabric material cost — already in the Fabrics step ($/m × yield)
  • Fabric finishes (brushing, antibacterial, water-repellent) — already in the Fabrics step as per-meter deltas
  • Trims (buttons, zips, labels, drawcords) — already in the Trims step
  • Packaging (polybag, hangtag, mailer) — already in the Packaging step
  • Wash / dye / distress treatments — already in the Treatments step
  • Embroidery / screen print / patches — already in the Embellishments step
  • Vendor profit % markup — added on top via the vendor record's "Factory Markup %"
  • Sea freight, duties, fulfillment — handled at the Cash tab

If the operator pastes a factory quote that bundles materials or finishing into one number, help them STRIP IT DOWN to CMT-only so the tech pack roll-up stays clean. Likewise, if they ask "should I add embroidery to the CMT?", the answer is no — that lives on the Embellishments tab.

# CMT BENCHMARKS (best-case → typical, established mid-tier factory)
COASTAL CHINA (Guangdong / Zhejiang / Jiangsu / Fujian):
  Tee/tank $1.20–$2.50 · Polo $1.80–$3.50 · Crew sweatshirt $3.00–$5.50 · Pullover hoodie $4.00–$6.50 · Zip hoodie $5.00–$8.00 · Joggers $3.00–$5.00 · Shorts $1.80–$3.20 · Chinos $5.50–$8.50 · Denim pants $6.00–$10.00 · Track/bomber $6.50–$10.50 · Denim jacket $7.00–$12.00 · Blazer $13.00–$22.00 · Hip coat $18.00–$32.00 · Trench $25.00–$45.00

REGIONAL ADJUSTMENTS to coastal China benchmark:
  China inland −20% · Vietnam −5–10% · Cambodia −35% · Bangladesh −55% · India −30% · Indonesia −20% · Mexico +35% · Turkey +30% · Portugal/EE +75% · USA +500%

COMPLEXITY ADJUSTMENTS (only when warranted by the actual spec):
  >3 fabrics +5–10% · >6 trims +5–10% · >10 seam operations +10–15% · Premium tier (AQL 1.5, photo support) +10–20%

# SAM-RATE MODE
If the vendor record has a SAM (Standard Allowed Minute) rate, ABANDON the regional benchmark and use SAM × rate. Pullover hoodie ~18–26 min · Tee ~6–10 · Polo ~10–14 · Denim pants ~25–35 · Bomber ~30–40 · Blazer ~55–75 · Coat ~70–100. State the SAM minute estimate and show the multiplication.

# YOUR JOB IN THIS CHAT
1. Ground every answer in the actual spec the user gave you (stitch ops, pattern pieces, vendor region, vendor SAM rate if any, garment type).
2. When the user pushes back ("the factory quoted me $3.50, is that fair?"), explain the math both ways — what the benchmark says and what their spec implies — then tell them whether the quote is plausible.
3. When the user paste-dumps a quote breakdown, separate CMT line items from non-CMT line items.
4. Be concrete: cite minute estimates, cite the SAM rate, multiply, show the work in plain text (no tables, no markdown).
5. When you converge on a number you'd recommend the operator use as the tech pack's CMT value, end your reply with a single line on its own:
     SUGGESTED_VALUE: 4.20
   The UI will offer an "Apply" button. If you're not ready to commit, omit the line. Range form is OK too:
     SUGGESTED_VALUE: 4.00-4.50
   When given a range, the UI will apply the low end (best case).

# TONE
Direct, numerate, short sentences. No prefatory throat-clearing. The user is a brand operator who knows their factory — treat them like a peer, not a student. If they're wrong, say so and show why.`;

async function callAnthropicProxy(body) {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error('Supabase is not configured for this build.');
  }
  const token = await getClerkToken();
  if (!token) throw new Error('Sign in to use the cost chat.');
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

// Render the spec block the assistant grounds itself in. Kept compact —
// the model doesn't need a tech-pack-wide dump, just the cost drivers.
export function buildSpecContext({ vendor, garment, currentEstimate }) {
  const samRate = parseFloat(vendor?.samRateUsdPerMin);
  const markupPct = parseFloat(vendor?.markupPct);
  const stitchOps = (garment.stitchOperations || []).filter(s => s.operation || s.seamType || s.stitchType);
  const pieces = (garment.patternPieces || []).filter(p => p.pieceName);
  const embOps = (garment.embellishments || []).filter(e => e.method || e.placement);
  const finishes = (garment.fabricFinishes || []);

  const stitchLines = stitchOps.slice(0, 30).map((s, i) =>
    `  ${i + 1}. ${[s.operation, s.seamType, s.stitchType, s.machine].filter(Boolean).join(' · ')}${s.spiSpcm ? ` @ ${s.spiSpcm}` : ''}`
  ).join('\n') || '  (none specified)';
  const pieceLines = pieces.slice(0, 30).map((p, i) =>
    `  ${i + 1}. ${p.pieceName}${p.quantity ? ` ×${p.quantity}` : ''}${p.fabric ? ` · ${p.fabric}` : ''}`
  ).join('\n') || '  (none specified)';
  const embLines = embOps.map(e => `  • ${e.method || '—'} @ ${e.placement || '—'}`).join('\n') || '  (none)';
  const finishLines = finishes.map(f => `  • ${f.name || f.code}${f.delta_per_meter_usd ? ` ($${f.delta_per_meter_usd}/m)` : ''}`).join('\n') || '  (none)';

  return `# CURRENT ESTIMATE
$${currentEstimate?.value != null ? Number(currentEstimate.value).toFixed(2) : '—'} per garment
Range: $${currentEstimate?.low ?? '—'}–$${currentEstimate?.high ?? '—'}
Mode: ${currentEstimate?.mode || 'manual'}
Reasoning so far: ${currentEstimate?.reasoning || '(none)'}

# VENDOR
Name: ${vendor?.name || '—'}
Location: ${[vendor?.city, vendor?.country].filter(Boolean).join(', ') || '—'}
SAM rate: ${Number.isFinite(samRate) && samRate > 0 ? `$${samRate}/min (use this — skip the regional benchmark)` : '(not set — use regional CMT benchmark)'}
Factory markup: ${Number.isFinite(markupPct) && markupPct > 0 ? `${markupPct}% (applied separately on top — do NOT bake into CMT)` : '(0% / not set)'}

# GARMENT
Style: ${garment.styleName || '—'} (${garment.styleNumber || '—'})
Product type: ${garment.productType || '—'}
Designer notes: ${garment.designNotes || '—'}
Key features: ${garment.keyFeatures || '—'}
Fit: ${garment.fit || '—'}

# COST DRIVERS THAT BELONG IN CMT
Stitch operations (${stitchOps.length} rows):
${stitchLines}

Pattern pieces (${pieces.length} rows):
${pieceLines}

# COST DRIVERS THAT BELONG ELSEWHERE (do NOT bake into CMT)
Fabrics picked: ${garment.fabricsCount} (${garment.fabricsList || 'none'}) — material cost already in the Fabrics step
Fabric finishes:
${finishLines}
Trims picked: ${garment.trimsCount} — already in Trims step
Embellishments:
${embLines}
  → already in Embellishments step; their COMPLEXITY can push CMT up a bit (more handling) but the per-piece embroidery/print charge is NOT yours to add.
Treatments: ${garment.treatmentsCount} — already in Treatments step
`;
}

/**
 * Send one chat turn. The first call's userMessage must be prefixed with
 * the spec context (see buildSpecContext) so the model is grounded; the
 * caller is responsible for that wiring.
 *
 * @param {object[]} messages — full conversation history [{role,content}]
 * @returns {Promise<{text:string, suggestedValue:number|null, suggestedRange:[number,number]|null}>}
 */
export async function sendCostChatMessage({ messages }) {
  const json = await callAnthropicProxy({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages,
  });
  const blocks = Array.isArray(json?.content) ? json.content : [];
  const text = blocks.find(b => b?.type === 'text')?.text || blocks[0]?.text || '';
  return { text, ...parseSuggestion(text) };
}

// Pull the SUGGESTED_VALUE marker out of the assistant's reply. Accepts
// a single number ("4.20") or a low-high range ("4.00-4.50"). Returns
// both forms so the UI can offer "Apply $4.00" with the range as a
// hover tooltip.
export function parseSuggestion(text) {
  if (!text) return { suggestedValue: null, suggestedRange: null };
  const m = text.match(/SUGGESTED_VALUE:\s*\$?(\d+(?:\.\d+)?)(?:\s*[-–]\s*\$?(\d+(?:\.\d+)?))?/i);
  if (!m) return { suggestedValue: null, suggestedRange: null };
  const a = parseFloat(m[1]);
  const b = m[2] ? parseFloat(m[2]) : null;
  if (!Number.isFinite(a)) return { suggestedValue: null, suggestedRange: null };
  if (b != null && Number.isFinite(b)) {
    return { suggestedValue: a, suggestedRange: [a, b] };
  }
  return { suggestedValue: a, suggestedRange: null };
}

// Strip the SUGGESTED_VALUE line out for display — the UI surfaces it as
// an Apply button, so we don't want it duplicated as raw text in the bubble.
export function stripSuggestionMarker(text) {
  if (!text) return '';
  return text.replace(/\n?\s*SUGGESTED_VALUE:.*$/im, '').trim();
}
