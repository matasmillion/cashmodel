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
 *   shrinkage_pct: number,
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
    weight_gsm: 0,
    weave: 'jersey',
    hand: '',
    width_cm: 0,
    shrinkage_pct: 0,
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
