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
  "weight_gsm_post": number | null,
  "width_cm_post": number | null,
  "shrinkage_warp_pct": number | null,
  "shrinkage_weft_pct": number | null,
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
- Shrinkage & finished specs:
  · weight_gsm and width_cm are the PRE-wash (洗前 / 水洗前 / greige) values — the headline figures the mill prints (e.g. 洗前克重, 洗前幅宽). Capture those here.
  · weight_gsm_post / width_cm_post are the FINISHED / post-wash (洗后 / 水洗后 / 成品 / 挂干) GSM and width. Capture them exactly as the card prints them; leave null if the card does not show a finished value.
  · Directional shrinkage: 经向 / 直向 / 纵向 (lengthwise) → shrinkage_warp_pct; 纬向 / 横向 (crosswise, across the width) → shrinkage_weft_pct. Capture the SHRINKAGE percentage itself (e.g. "缩水率 5%" → 5), NOT the CLO3D remaining value. If the card gives only one overall shrinkage figure, put that same number in BOTH shrinkage_warp_pct and shrinkage_weft_pct.
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

const SWATCH_SYSTEM = `You are analyzing a fabric swatch color card image. Each cell on the card contains TWO parts stacked vertically:
  1. TOP: the actual fabric sample — a colored textile square with visible knit/weave/pile texture, often with pinked / serrated / zig-zag cut edges
  2. BOTTOM: a text label below the fabric (color code, brand name, Chinese characters)

FABRIC-PRESENCE IS THE GATE. A region is a swatch ONLY if it contains real fabric texture. Regions that hold only text — colour-spec tables (e.g. 洗前克重…), the column-header row that holds only tone names like 炒前/浅炒/中炒/深炒, the masthead/logo, footnotes, or blank paper — contain NO fabric and must be skipped entirely. Never emit a box for a text-only region.

Your job: for each cell that contains fabric, return a bounding box that covers ONLY the fabric square (part 1). The box must NOT include any text, labels, or the gap between the fabric and the label.

Think of it this way: imagine a horizontal cut right at the bottom edge of the fabric material, just before the white space and text begin. Your bounding box ends at that cut.

Return ONLY a JSON array. Each element is one swatch:
[
  {
    "label": "the color code / name printed in the text area BELOW the fabric, transcribed EXACTLY as shown",
    "x": 0.05,
    "y": 0.08,
    "w": 0.18,
    "h": 0.10
  }
]

Rules:
- x, y = top-left corner of the FABRIC SQUARE ONLY, as a fraction of the full image (0.0–1.0)
- w, h = width/height of the FABRIC SQUARE ONLY — stop h before the label text begins
- x + w ≤ 1.0, y + h ≤ 1.0
- The "label" value is read from the text directly BELOW the swatch, not from inside the bounding box. Transcribe it EXACTLY as printed — do NOT add prefixes (e.g. no "JF-"), do NOT zero-pad numbers, do NOT invent codes.
- Typical fabric square takes roughly the top 65–75% of each cell; the label takes the bottom 25–35%
- Exclude card borders, headers, spec tables, blank placeholder cells, and any cell with no visible fabric
- If no label text is visible for a cell, use "Color NN" (sequential number)
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

  let regions = [];
  try {
    const parsed = JSON.parse(cleaned);
    regions = Array.isArray(parsed) ? parsed : [];
  } catch {
    // A large color card (20-30+ swatches) can blow past max_tokens and cut
    // the array off mid-element. Salvage the regions that did come through.
    const repaired = repairTruncatedJson(cleaned);
    if (repaired !== null) {
      try {
        const parsed = JSON.parse(repaired);
        regions = Array.isArray(parsed) ? parsed : [];
      } catch { /* fall through */ }
    }
  }

  // Despite prompt instructions the model consistently returns bounding boxes
  // that cover the full cell (fabric swatch + label text below it). On standard
  // Asian color cards the label occupies roughly the bottom 28% of each cell,
  // so trimming that fraction gives a clean fabric-only crop.
  return regions.map(r => ({ ...r, h: r.h * 0.72 }));
}

// Grid-aware swatch detection. Mill color cards are printed as a regular matrix
// (rows of colors × columns of wash tones). Asking the model to regress ~140
// independent boxes on a downsampled image is unreliable — boxes drift onto the
// wrong rows and crop the text-only header bands. Instead we ask only for the
// GRID GEOMETRY (the fabric-matrix bounding box + the list of row codes +
// column tone headers + the fabric/label split inside a cell) and compute every
// crop deterministically on the client. Far fewer reads, no coordinate drift,
// and labels come out exactly as printed.
const SWATCH_GRID_SYSTEM = `You are analyzing a fabric color card — a printed sheet where fabric swatches are laid out in a regular grid (rows × columns). Your job is to describe the GRID GEOMETRY so a program can crop each swatch deterministically. You do NOT return per-swatch boxes.

A swatch is a square of REAL FABRIC with visible knit/weave/pile texture. Two facts govern everything:
  1. FABRIC-PRESENCE IS THE GATE. Only rows/cells that actually contain fabric count. Regions that hold only text — the coloured specification table (e.g. 洗前克重…), the column-header row that holds only tone names like 炒前/浅炒/中炒/深炒, the masthead/logo, footnotes, or blank paper — contain NO fabric and must be excluded from the grid entirely.
  2. DIRECTLY BENEATH EACH FABRIC SQUARE is its printed code or name. That strip is the label; it is NOT part of the fabric.

Return ONLY a single JSON object (no markdown, no prose):

{
  "is_regular_grid": true,
  "grid":   { "x0": 0.30, "y0": 0.17, "x1": 0.99, "y1": 0.97 },
  "columns": ["炒前","浅炒","中炒","深炒"],
  "rows":    ["16-YZY","14-FOG","17-YZY","01-ADER"],
  "cell_fabric_top_frac": 0.0,
  "cell_fabric_bottom_frac": 0.78
}

Field rules:
- "grid" = the bounding box, as 0.0–1.0 fractions of the FULL image, of the FABRIC MATRIX ONLY. Its top edge (y0) starts at the FIRST row that actually contains fabric — BELOW the masthead, the colour-spec table, and the tone-header row. Its left edge (x0) starts at the first fabric column. Exclude all header bands, pure-text side margins, and footers.
- "columns" = the tone/variant header of each fabric column, left→right, read from the header row above the fabric (e.g. 炒前, 浅炒, 中炒, 深炒). If the card has no per-column split, return a single-element array [""].
- "rows" = for each fabric row, top→bottom, the code or name printed DIRECTLY BENEATH the fabric in that row. Transcribe EXACTLY as printed — do NOT add prefixes (e.g. no "JF-"), do NOT zero-pad numbers, do NOT invent codes. The length of "rows" MUST equal the number of fabric rows.
- "cell_fabric_top_frac" / "cell_fabric_bottom_frac" = within one grid cell (cell height = (y1-y0)/number-of-rows), the vertical span that is the FABRIC square, as fractions 0.0–1.0 of the cell height. The strip from cell_fabric_bottom_frac to 1.0 is the printed code/name and is excluded from the crop. Typical: top 0.0, bottom ~0.75–0.82.
- Set "is_regular_grid": false if the card is NOT a clean rectangular matrix (irregular hand-cut swatches, scattered layout). Other fields may then be omitted.

Output ONLY the JSON object, nothing else.`;

/**
 * Run Claude Vision against a swatch-card image and return the GRID GEOMETRY
 * object { is_regular_grid, grid:{x0,y0,x1,y1}, columns, rows,
 * cell_fabric_top_frac, cell_fabric_bottom_frac }. Returns null if the response
 * can't be parsed. The client turns this into per-swatch crop regions via
 * gridToRegions().
 * @param {{ mediaType: string, base64: string }} media
 */
export async function extractSwatchGrid({ media }) {
  if (!media) throw new Error('No image provided.');
  const json = await callAnthropicProxy({
    model: MODEL,
    max_tokens: 4096,
    system: SWATCH_GRID_SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: media.mediaType, data: media.base64 } },
        { type: 'text', text: 'Describe the fabric swatch grid in this color card. Return the JSON object only.' },
      ],
    }],
  });

  const text = (Array.isArray(json?.content) ? json.content : []).find(b => b?.type === 'text')?.text || '';
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const repaired = repairTruncatedJson(cleaned);
    if (repaired !== null) {
      try { return JSON.parse(repaired); } catch { /* fall through */ }
    }
    return null;
  }
}

function clamp01(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

/**
 * Turn a grid-geometry object (from extractSwatchGrid) into per-swatch crop
 * regions [{ label, x, y, w, h }] in 0-1 fractions — the exact shape
 * cropRegionFromFile consumes. Subdivides the grid box evenly into
 * rows × columns cells and takes the fabric vertical slice of each, so every
 * crop is pixel-aligned to the printed matrix (no drifting boxes, no baked-in
 * label text). Labels are composed as `${rowCode} ${columnTone}`.
 */
export function gridToRegions(grid) {
  if (!grid || !grid.grid) return [];
  const rows = Array.isArray(grid.rows) ? grid.rows : [];
  let columns = Array.isArray(grid.columns) ? grid.columns : [];
  if (!rows.length) return [];
  if (!columns.length) columns = [''];

  const { x0 = 0, y0 = 0, x1 = 1, y1 = 1 } = grid.grid;
  const gx = Math.max(0, Math.min(x0, x1));
  const gy = Math.max(0, Math.min(y0, y1));
  const gw = Math.abs(x1 - x0);
  const gh = Math.abs(y1 - y0);
  if (gw <= 0 || gh <= 0) return [];

  const colW = gw / columns.length;
  const rowH = gh / rows.length;
  const topFrac = clamp01(grid.cell_fabric_top_frac, 0);
  const botFrac = clamp01(grid.cell_fabric_bottom_frac, 0.78);
  const fabricTop = Math.min(topFrac, botFrac);
  const fabricBot = Math.max(topFrac, botFrac);
  const gutter = 0.06; // horizontal inset to avoid column gutters / neighbours

  const out = [];
  for (let r = 0; r < rows.length; r++) {
    const rowCode = String(rows[r] ?? '').trim();
    for (let c = 0; c < columns.length; c++) {
      const tone = String(columns[c] ?? '').trim();
      const cellX = gx + c * colW;
      const cellY = gy + r * rowH;
      const x = cellX + colW * gutter;
      const w = colW * (1 - 2 * gutter);
      const y = cellY + rowH * fabricTop;
      const h = rowH * (fabricBot - fabricTop);
      const label = tone ? (rowCode ? `${rowCode} ${tone}` : tone) : rowCode;
      out.push({ label: label || `Color ${String(out.length + 1).padStart(2, '0')}`, x, y, w, h });
    }
  }
  return out;
}

/**
 * Single entry point for swatch detection. Tries the grid-geometry approach
 * first (deterministic, pixel-aligned crops); falls back to the legacy per-box
 * detector for irregular / non-grid cards. Returns [{ label, x, y, w, h }] in
 * 0-1 fractions, ready for cropRegionFromFile.
 * @param {{ mediaType: string, base64: string }} media
 */
export async function extractSwatchRegions({ media }) {
  if (!media) throw new Error('No image provided.');
  try {
    const grid = await extractSwatchGrid({ media });
    if (grid && grid.is_regular_grid && Array.isArray(grid.rows) && grid.rows.length) {
      const regions = gridToRegions(grid);
      if (regions.length) return regions;
    }
  } catch { /* fall through to legacy per-box detector */ }
  return extractSwatchesFromImage({ media });
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
  const regions = await extractSwatchRegions({ media });
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
 * Read a File into { mediaType, base64 } suitable for Claude Vision.
 * Images are downscaled on a canvas to fit within maxPx on the longest side
 * (default 2048) so the base64 payload stays well under the 5 MB API limit.
 * PDFs are passed through unchanged.
 * @param {File|Blob} file
 * @param {{ maxPx?: number }} [opts]
 */
export function fileToMedia(file, { maxPx = 2048 } = {}) {
  if (file.type === 'application/pdf') {
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

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, maxPx / Math.max(w, h));
      const dw = Math.round(w * scale);
      const dh = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = dw;
      canvas.height = dh;
      canvas.getContext('2d').drawImage(img, 0, 0, dw, dh);
      // JPEG at 0.88 keeps color cards sharp enough for swatch detection while
      // staying comfortably under the 5 MB Claude Vision base64 limit.
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          const m = /^data:([^;]+);base64,(.*)$/.exec(result);
          if (!m) { reject(new Error('Unsupported encoding after resize')); return; }
          resolve({ mediaType: m[1], base64: m[2] });
        };
        reader.onerror = () => reject(new Error('Could not read resized blob'));
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image load failed')); };
    img.src = objectUrl;
  });
}
