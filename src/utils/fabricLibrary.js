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
 *   composition: string,
 *   weight_gsm: number,
 *   weave: 'jersey'|'french_terry'|'fleece'|'twill'|'denim'|'poplin'|'oxford'|'rib'|'pique'|'canvas'|'other',
 *   hand: string,
 *   width_cm: number,
 *   shrinkage_pct: number,
 *   stretch_pct: number,
 *   color_id: string,
 *   mill_id: string,
 *   lead_time_days: number,
 *   moq_yards: number,
 *   price_per_yard_usd: number,
 *   currency: string,
 *   swatch_image_url: string,
 *   notes: string
 * }} Fabric
 */

export const FABRIC_WEAVES = [
  { id: 'jersey',        label: 'Jersey',        code: 'JSY' },
  { id: 'french_terry',  label: 'French terry',  code: 'FRT' },
  { id: 'fleece',        label: 'Fleece',        code: 'FLC' },
  { id: 'twill',         label: 'Twill',         code: 'TWL' },
  { id: 'denim',         label: 'Denim',         code: 'DNM' },
  { id: 'poplin',        label: 'Poplin',        code: 'PPL' },
  { id: 'oxford',        label: 'Oxford',        code: 'OXF' },
  { id: 'rib',           label: 'Rib',           code: 'RIB' },
  { id: 'pique',         label: 'Piqué',         code: 'PQE' },
  { id: 'canvas',        label: 'Canvas',        code: 'CNV' },
  { id: 'other',         label: 'Other',         code: 'GEN' },
];

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
    composition: '',
    weight_gsm: 0,
    weave: 'jersey',
    hand: '',
    width_cm: 0,
    shrinkage_pct: 0,
    stretch_pct: 0,
    color_id: '',
    mill_id: '',
    lead_time_days: 0,
    moq_yards: 0,
    price_per_yard_usd: 0,
    currency: 'USD',
    swatch_image_url: '',
    notes: '',
    ...overrides,
  };
}
