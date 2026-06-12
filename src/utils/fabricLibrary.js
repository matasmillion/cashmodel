// Fabrics library — schema constants the store and builder both reach for.
// Persistence lives in `fabricStore.js`; this file is the schema of record.
//
// A Fabric is the base material a Style is cut from: composition, weight,
// hand, weave, mill, lead time. Every PO snapshots the exact fabric
// version so a later mill-side change never silently propagates into a
// closed run.
//
// Records are JSDoc-typed for editor completion only — runtime is plain
// JSON in localStorage with an optional Supabase mirror.

// eslint-disable-next-line no-unused-vars
import * as _atomTypes from '../types/atoms';

/**
 * @typedef {import('../types/atoms').AtomBase & {
 *   category: 'knit'|'woven',
 *   mill_fabric_no: string,
 *   composition: string,
 *   weight_gsm: number,
 *   weave: 'jersey'|'french_terry'|'fleece'|'twill'|'denim'|'poplin'|'oxford'|'rib'|'pique'|'canvas'|'other',
 *   hand: string,
 *   width_cm: number,
 *   shrinkage_warp_pct: number,
 *   shrinkage_weft_pct: number,
 *   weight_gsm_post: (number|null),
 *   width_cm_post: (number|null),
 *   stretch_pct: number,
 *   mill_id: string,
 *   lead_time_days: number,
 *   moq_meters: number,
 *   price_per_meter_usd: number,
 *   price_per_meter_cny: number,
 *   price_per_kg_usd: number,
 *   price_per_kg_cny: number,
 *   currency: string,
 *   front_image_url: string,
 *   back_image_url: string,
 *   color_card_images: Array<{ url: string, label: string, hex: string }>,
 *   notes: string
 * }} Fabric
 */

// Top-level category — every fabric is either knit or woven.
export const FABRIC_CATEGORIES = [
  { id: 'knit',  label: 'Knit' },
  { id: 'woven', label: 'Woven' },
];

export const FABRIC_WEAVES = [
  { id: 'jersey',        label: 'Jersey',        code: 'JSY', category: 'knit' },
  { id: 'french_terry',  label: 'French terry',  code: 'FRT', category: 'knit' },
  { id: 'fleece',        label: 'Fleece',        code: 'FLC', category: 'knit' },
  { id: 'rib',           label: 'Rib',           code: 'RIB', category: 'knit' },
  { id: 'pique',         label: 'Piqué',         code: 'PQE', category: 'knit' },
  { id: 'twill',         label: 'Twill',         code: 'TWL', category: 'woven' },
  { id: 'denim',         label: 'Denim',         code: 'DNM', category: 'woven' },
  { id: 'poplin',        label: 'Poplin',        code: 'PPL', category: 'woven' },
  { id: 'oxford',        label: 'Oxford',        code: 'OXF', category: 'woven' },
  { id: 'canvas',        label: 'Canvas',        code: 'CNV', category: 'woven' },
  { id: 'other',         label: 'Other',         code: 'GEN', category: 'knit' },
];

export function weavesForCategory(category) {
  if (!category) return FABRIC_WEAVES;
  return FABRIC_WEAVES.filter(w => w.category === category || w.id === 'other');
}

export function categoryForWeave(weaveId) {
  const w = FABRIC_WEAVES.find(x => x.id === weaveId);
  return w ? w.category : 'knit';
}

export const FABRIC_WEAVE_LABEL = Object.fromEntries(
  FABRIC_WEAVES.map(w => [w.id, w.label])
);

export const FABRIC_WEAVE_CODE = Object.fromEntries(
  FABRIC_WEAVES.map(w => [w.id, w.code])
);

export const FABRIC_STATUSES = ['draft', 'testing', 'approved', 'archived'];

const round1 = n => Math.round(n * 10) / 10;

/**
 * Spec read-outs for the fabric form. Pre-wash and post-wash GSM/width are
 * captured as printed on the mill card; this only computes the derived
 * helpers shown read-only beside them.
 *
 * Convention (confirmed with the operator): lengthwise = warp (经向),
 * widthwise = weft (纬向). CLO3D's Shrinkage-Warp / Shrinkage-Weft fields
 * take the REMAINING dimension as a percent (5% shrink → 95), so those are
 * exposed for copying straight into CLO3D. The implied width shrink + GSM
 * gain are a cross-check derived from the pre/post pair (null until both
 * sides of a pair are entered).
 *
 * @param {{ gsmPre?:number, widthPre?:number, gsmPost?:number, widthPost?:number, warpPct?:number, weftPct?:number }} [s]
 * @returns {{ cloWarp:number, cloWeft:number, impliedWidthShrink:(number|null), impliedGsmGain:(number|null) }}
 */
export function deriveShrinkSpec({ gsmPre = 0, widthPre = 0, gsmPost = 0, widthPost = 0, warpPct = 0, weftPct = 0 } = {}) {
  const cloWarp = round1(100 - (Number(warpPct) || 0));
  const cloWeft = round1(100 - (Number(weftPct) || 0));
  const gp = Number(gsmPost) || 0;
  const wp = Number(widthPost) || 0;
  const impliedWidthShrink = (widthPre && wp) ? round1((1 - wp / Number(widthPre)) * 100) : null;
  const impliedGsmGain = (gsmPre && gp) ? round1((gp / Number(gsmPre) - 1) * 100) : null;
  return { cloWarp, cloWeft, impliedWidthShrink, impliedGsmGain };
}

/**
 * Tumble-dry shrinkage, derived from GSM. Principle: GSM = mass ÷ area and mass
 * is fixed, so a GSM change is a pure area change. For this fabric class length
 * stays ~constant and shrink is width-dominant, so width ∝ 1/GSM. From one new
 * number (tumble-dry GSM) we predict the tumble width + weft shrink, the residual
 * a garment-dyed style pulls (hang→tumble), and a self-validation flag.
 *
 * Inputs as plain numbers (gsmHang/widthHang = the existing "post-wash" pair).
 * Outputs are null where their inputs are missing (e.g. no tumble GSM entered).
 *
 * @returns {{ predWidthTumble:(number|null), weftShrinkTumble:(number|null),
 *   predWidthHang:(number|null), weftShrinkHang:(number|null), residualWeft:(number|null),
 *   modelValid:(boolean|null), hangWidthDelta:(number|null), statedWeft:(number|null),
 *   consistent:(boolean|null) }}
 */
export function deriveTumbleShrink({ gsmPre = 0, widthPre = 0, gsmHang = 0, widthHang = 0, gsmTumble = 0, statedWeftPct = null } = {}) {
  const gp = Number(gsmPre) || 0;
  const wp = Number(widthPre) || 0;
  const gh = Number(gsmHang) || 0;
  const wh = Number(widthHang) || 0;
  const gt = Number(gsmTumble) || 0;
  const hasTumble = gp > 0 && wp > 0 && gt > 0;
  const predWidthTumble = hasTumble ? round1(wp * gp / gt) : null;
  const weftShrinkTumble = hasTumble ? round1((1 - gp / gt) * 100) : null;
  const predWidthHang = (gp > 0 && wp > 0 && gh > 0) ? round1(wp * gp / gh) : null;
  const weftShrinkHang = (gp > 0 && gh > 0) ? round1((1 - gp / gh) * 100) : null;
  const residualWeft = (gh > 0 && gt > 0) ? round1((1 - gh / gt) * 100) : null;
  // Self-validation: the GSM-width model is trustworthy when the predicted hang
  // width matches the entered hang width (±1 cm). If it diverges the fabric also
  // shrinks in length — flag it and don't trust the GSM-derived tumble width.
  const hangWidthDelta = (predWidthHang != null && wh > 0) ? round1(predWidthHang - wh) : null;
  const modelValid = (hangWidthDelta != null) ? (Math.abs(hangWidthDelta) <= 1) : null;
  // Cross-check the GSM-derived hang shrink against any stated weft shrinkage.
  const stated = (statedWeftPct != null && statedWeftPct !== '') ? Number(statedWeftPct) : null;
  const consistent = (weftShrinkHang != null && stated != null && Number.isFinite(stated))
    ? (Math.abs(weftShrinkHang - stated) <= 2) : null;
  return { predWidthTumble, weftShrinkTumble, predWidthHang, weftShrinkHang, residualWeft, modelValid, hangWidthDelta, statedWeft: stated, consistent };
}

/**
 * Cut-pattern upscale for a finished-shrink %, per direction. Compensation is
 * 1 ÷ (1 − r), NOT ×(1 + r): a piece that loses r% must be cut 1/(1−r) bigger to
 * land on-spec. Returns the extra % to add (e.g. 5 → 5.3), or null if out of range.
 */
export function cutUpscalePct(shrinkPct) {
  const r = (Number(shrinkPct) || 0) / 100;
  if (r <= 0 || r >= 1) return null;
  return round1((1 / (1 - r) - 1) * 100);
}

export function emptyFabric(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: '',
    code: '',
    name: '',
    status: 'draft',
    version: 'v1.0',
    created_at: now,
    updated_at: now,
    category: 'knit',
    mill_fabric_no: '',
    composition: '',
    weight_gsm: 0,            // PRE-wash GSM (yield / consumption math reads this)
    weave: 'jersey',
    hand: '',
    width_cm: 0,              // PRE-wash width (yield / consumption math reads this)
    // Directional shrinkage %: warp = lengthwise (经向), weft = widthwise (纬向).
    // Width is governed by weft; GSM by both. CLO3D render values are the
    // remaining dimension (100 − shrink) — see deriveShrinkSpec().
    shrinkage_warp_pct: null,
    shrinkage_weft_pct: null,
    // Finished (post-wash) GSM + width, captured as printed on the card.
    // null ⇒ not provided (the form shows the implied shrink as a cross-check).
    weight_gsm_post: null,
    width_cm_post: null,
    // Tumble-dry (machine-dried) GSM — drives the derived tumble shrink + roll
    // width in the Cutting step. Optional; null ⇒ tumble outputs stay blank.
    weight_gsm_tumble: null,
    // Measured swatch shrink at the tumble state — overrides the GSM-derived
    // value and flips its status from ASSUMED to CONFIRMED. null ⇒ use derived.
    measured_weft_tumble_pct: null,
    measured_warp_tumble_pct: null,
    stretch_pct: 0,
    mill_id: '',
    lead_time_days: 0,
    moq_meters: 0,
    price_per_meter_usd: 0,
    price_per_meter_cny: 0,
    price_per_kg_usd: 0,
    price_per_kg_cny: 0,
    currency: 'USD',
    front_image_url: '',
    back_image_url: '',
    color_card_images: [],
    cover_image: null,
    zfab_file_url: '',
    notes: '',
    // Mill finishes — internal addons that adjust the base price. Each entry:
    // { name, delta_per_meter_usd, delta_per_meter_cny, delta_per_kg_usd,
    //   delta_per_kg_cny, executed_at, vendor_id }. executed_at ∈
    //   'mill' | 'secondary' | 'at_treatment'. Picker can override per style.
    mill_finishes: [],
    default_garment_area: '',
    garment_placement_image_url: '',
    garment_placement_notes: '',
    // Knit-only: the matched ribbing fabric carried alongside the main mill fabric.
    ribbing_fabric_no: '',
    ribbing_image_url: '',
    // Raw photos of the physical color card and full fabric card — kept for
    // archival reference, distinct from the per-swatch images in color_card_images.
    original_images: [],
    // Misc files attached to this fabric: AI-parser source mill cards (auto-saved
    // when the user runs AI auto-fill), certifications, vendor chats, PDFs, etc.
    // Each entry: { path, name, kind?, uploaded_at }
    documents: [],
    ...overrides,
  };
}

// Areas a fabric can be cut for. Used by FabricBuilder default + the tech
// pack picker's area-of-product step. Order matters — body first.
export const FABRIC_GARMENT_AREAS = [
  'Body', 'Lining', 'Rib', 'Pocket', 'Hood', 'Hood lining',
  'Cuff', 'Hem', 'Yoke', 'Sleeve', 'Collar', 'Other',
];

// Mill finish execution targets. Picker shows the library default; per-style
// override flips between these without editing the library row.
export const FINISH_EXECUTED_AT = [
  { id: 'mill',         label: 'At the mill (default)' },
  { id: 'secondary',    label: 'Secondary finishing facility' },
  { id: 'at_treatment', label: 'Bundled with wash-house treatment' },
];

// A starter catalog of mill finish names. The fabric form lets users add
// new ones; the catalog grows organically — this just seeds the dropdown.
export const MILL_FINISH_CATALOG = [
  'Brushing (interior)', 'Antibacterial', 'Anti-mite', 'UV protection',
  'Negative ion', 'Anti-odor', 'Anti-pilling', 'Mercerization',
  'Sanforization', 'Calendering', 'Peaching', 'Singeing',
];

// Bump v1.0 → v1.1, v1.9 → v2.0, v2 → v2.1, etc. Always returns a "v{maj}.{min}"
// string. Minor wraps to next major every 10 minor steps.
export function bumpVersion(current) {
  const m = /^v?(\d+)(?:\.(\d+))?/i.exec(String(current || 'v1.0'));
  let maj = m ? parseInt(m[1], 10) || 1 : 1;
  let min = m && m[2] !== undefined ? parseInt(m[2], 10) || 0 : 0;
  min += 1;
  if (min >= 10) { maj += 1; min = 0; }
  return `v${maj}.${min}`;
}
