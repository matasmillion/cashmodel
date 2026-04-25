// AI-generated packing list — uses Anthropic API directly from browser
// Takes product data + quantities and returns a structured carton breakdown
//
// Same pattern as the rate card parser: API key in localStorage, direct fetch,
// anthropic-dangerous-direct-browser-access header.

const API_KEY_STORAGE = 'cashmodel_anthropic_key';
const MODEL = 'claude-sonnet-4-5';

export function getStoredKey() {
  return localStorage.getItem(API_KEY_STORAGE) || '';
}

export function saveKey(key) {
  localStorage.setItem(API_KEY_STORAGE, key);
}

export async function generatePackingList({
  apiKey,
  styleName,
  productCategory,
  quantities,       // [{colorway, s, m, l, xl, unitCost}]
  unitWeightGrams,  // number — weight of a single garment
  shipMethod,       // 'Air' | 'Sea' | 'Express (DHL/FedEx)'
  notes,            // optional extra instructions from the user
}) {
  if (!apiKey) throw new Error('Anthropic API key is required. Set it in the Fulfillment tab or paste one here.');

  const totalUnits = (quantities || []).reduce(
    (sum, q) => sum + (['s','m','l','xl'].reduce((s2, k) => s2 + (parseInt(q[k]) || 0), 0)),
    0,
  );

  const prompt = `You are a packaging and logistics expert for a fashion brand shipping from China.

Generate an efficient packing list (carton breakdown) for the following production run:

STYLE: ${styleName || 'Untitled'}
CATEGORY: ${productCategory || 'Apparel'}
UNIT WEIGHT: ${unitWeightGrams || 500} grams per garment
SHIP METHOD: ${shipMethod || 'Sea'}
TOTAL UNITS: ${totalUnits}

QUANTITIES PER COLORWAY:
${(quantities || []).filter(q => q.colorway).map(q => `- ${q.colorway}: S=${q.s || 0}, M=${q.m || 0}, L=${q.l || 0}, XL=${q.xl || 0}`).join('\n')}

${notes ? `ADDITIONAL INSTRUCTIONS:\n${notes}\n` : ''}

Rules:
- Standard export carton: 60×40×30 cm (adjust if clearly better)
- Max carton weight: 25kg for air freight, 30kg for sea freight
- Keep each carton single-colorway when possible
- Within a carton, mix sizes for easier receiving at warehouse
- Round to whole units

Return ONLY valid JSON (no markdown, no prose), as an array of carton objects:
[
  {
    "cartonNum": "1",
    "colorway": "exact name from input",
    "sizeBreakdown": "S:10 M:15 L:15 XL:10",
    "qtyPerCarton": "50",
    "dims": "60x40x30",
    "grossWeight": "26.5",
    "netWeight": "25.0"
  }
]

All numeric values should be strings. grossWeight = netWeight + ~1.5kg for carton/packaging.`;

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
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errText.slice(0, 200)}`);
  }

  const json = await res.json();
  const text = json.content?.[0]?.text || '';
  // Strip any leading/trailing fences Claude occasionally adds
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('Response was not an array');
    return parsed;
  } catch (err) {
    throw new Error(`Failed to parse AI response as JSON: ${err.message}\n\nRaw:\n${cleaned.slice(0, 500)}`);
  }
}
