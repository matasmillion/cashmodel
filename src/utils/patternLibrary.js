// Patterns library — schema constants the store and builder both reach for.
// Persistence lives in `patternStore.js`; this file is the schema of record.
//
// A Pattern is the geometric skeleton inherited by every Style: the DXF
// blocks, the sloper version, the grading rules, the seam allowances.
// Each one carries a category (Hoodie, Tee, Sweatpant, …), the size set
// it grades to, ease + drop measurements, and an optional CAD asset URL.
//
// Records are JSDoc-typed for editor completion only — runtime is plain
// JSON in localStorage with an optional Supabase mirror.

// eslint-disable-next-line no-unused-vars
import * as _atomTypes from '../types/atoms';

/**
 * @typedef {import('../types/atoms').AtomBase & {
 *   category: 'hoodie'|'tee'|'sweatpant'|'cargo'|'jacket'|'shirt'|'shorts'|'skirt'|'dress'|'other',
 *   base_block: string,
 *   sizes: string[],
 *   grade_rule: string,
 *   ease_chest_cm: number,
 *   drop_cm: number,
 *   seam_allowance_cm: number,
 *   cad_file_url: string,
 *   thumbnail_url: string,
 *   notes: string
 * }} Pattern
 */

export const PATTERN_CATEGORIES = [
  { id: 'hoodie',    label: 'Hoodie',    code: 'HD' },
  { id: 'tee',       label: 'Tee',       code: 'TE' },
  { id: 'sweatpant', label: 'Sweatpant', code: 'SP' },
  { id: 'cargo',     label: 'Cargo',     code: 'CG' },
  { id: 'jacket',    label: 'Jacket',    code: 'JK' },
  { id: 'shirt',     label: 'Shirt',     code: 'SH' },
  { id: 'shorts',    label: 'Shorts',    code: 'SR' },
  { id: 'skirt',     label: 'Skirt',     code: 'SK' },
  { id: 'dress',     label: 'Dress',     code: 'DR' },
  { id: 'other',     label: 'Other',     code: 'GEN' },
];

export const PATTERN_CATEGORY_LABEL = Object.fromEntries(
  PATTERN_CATEGORIES.map(c => [c.id, c.label])
);

export const PATTERN_CATEGORY_CODE = Object.fromEntries(
  PATTERN_CATEGORIES.map(c => [c.id, c.code])
);

export const PATTERN_STATUSES = ['draft', 'testing', 'approved', 'archived'];

export const STANDARD_SIZE_SETS = [
  ['XS', 'S', 'M', 'L', 'XL'],
  ['S', 'M', 'L', 'XL'],
  ['S', 'M', 'L', 'XL', 'XXL'],
  ['28', '30', '32', '34', '36'],
];

export function emptyPattern(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: '',
    code: '',
    name: '',
    status: 'draft',
    version: 'v1.0',
    created_at: now,
    updated_at: now,
    category: 'hoodie',
    base_block: '',
    sizes: ['S', 'M', 'L', 'XL'],
    grade_rule: '',
    ease_chest_cm: 0,
    drop_cm: 0,
    seam_allowance_cm: 1.0,
    cad_file_url: '',
    thumbnail_url: '',
    cover_image: null, // base64 data URL of a 2:3 portrait crop
    notes: '',
    ...overrides,
  };
}
