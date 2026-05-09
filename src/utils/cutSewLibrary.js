// Cut & Sew library — schema constants the store and builder both reach for.
// Persistence lives in `cutSewStore.js`; this file is the schema of record.
//
// A Cut & Sew block is the geometric skeleton a Style inherits from: the DXF
// pieces, the sloper version, the grading rules, the seam allowances.
// Each one carries a category (Hoodie, Tee, Sweatpant, …), the size set
// it grades to, ease + drop measurements, and an optional CAD asset URL.
//
// Replaces the old patternLibrary.js / patternStore.js ("Pattern" was the
// working name; "Cut & Sew" is the production term used on the factory floor).
//
// Records are JSDoc-typed for editor completion only — runtime is plain
// JSON in localStorage with an optional Supabase mirror.

// eslint-disable-next-line no-unused-vars
import * as _atomTypes from '../types/atoms';

/**
 * @typedef {{ num: number, title: string, description: string, image_url: string }} CalloutDetail
 * @typedef {{ num: number, label: string, hidden: boolean, image_url: string }} StitchBlock
 * @typedef {{ piece_num: string, piece_name: string, quantity: string, fabric: string, grain: string, fusing: string, notes: string }} PatternPiece
 * @typedef {{ name: string, tol: string, s: string, m: string, l: string, xl: string, method: string }} PomRow
 * @typedef {{ operation: string, seam_type: string, stitch_type: string, machine: string, spi_spcm: string, thread_color: string, thread_type: string, notes: string }} SeamSpec
 *
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
 *   notes: string,
 *   flat_lay_front_url: string,
 *   flat_lay_back_url: string,
 *   flat_lay_notes: string,
 *   callout_ref_page1_url: string,
 *   callout_details_page1: CalloutDetail[],
 *   callout_ref_page2_url: string,
 *   callout_details_page2: CalloutDetail[],
 *   seam_stitch_blocks: StitchBlock[],
 *   seams: SeamSpec[],
 *   labor_cost_usd: number,
 *   labor_cost_notes: string,
 *   pattern_layout_url: string,
 *   pattern_pieces: PatternPiece[],
 *   cutting_instructions: string,
 *   pom_diagram_url: string,
 *   pom_rows: PomRow[],
 *   pom_size_type: 'apparel'|'waist'|'one-size',
 *   pom_measurement_method: string,
 *   graded_size_matrix: { baseSize: string, sizes: string[], grading: Array<{ pomName: string, perSizeDelta: Record<string,number|null> }> }
 * }} CutSew
 */

export const CUT_SEW_CATEGORIES = [
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

export const CUT_SEW_CATEGORY_LABEL = Object.fromEntries(
  CUT_SEW_CATEGORIES.map(c => [c.id, c.label])
);

export const CUT_SEW_CATEGORY_CODE = Object.fromEntries(
  CUT_SEW_CATEGORIES.map(c => [c.id, c.code])
);

export const CUT_SEW_STATUSES = ['draft', 'testing', 'approved', 'archived'];

export const STANDARD_SIZE_SETS = [
  ['XS', 'S', 'M', 'L', 'XL'],
  ['S', 'M', 'L', 'XL'],
  ['S', 'M', 'L', 'XL', 'XXL'],
  ['28', '30', '32', '34', '36'],
];

export function emptyCutSew(overrides = {}) {
  const now = new Date().toISOString();
  return {
    // ── Identity ──────────────────────────────────────────────────
    id: '',
    code: '',
    name: '',
    status: 'draft',
    version: 'v1.0',
    created_at: now,
    updated_at: now,
    category: 'hoodie',
    base_block: '',
    cover_image: null,
    notes: '',

    // ── Spec ──────────────────────────────────────────────────────
    sizes: ['S', 'M', 'L', 'XL'],
    grade_rule: '',
    ease_chest_cm: 0,
    drop_cm: 0,
    seam_allowance_cm: 1.0,

    // ── Files ──────────────────────────────────────────────────────
    cad_file_url: '',
    thumbnail_url: '',

    // ── Flat Lay (page 07) ────────────────────────────────────────
    flat_lay_front_url: '',
    flat_lay_back_url: '',
    flat_lay_notes: '',

    // ── Call Outs page 1 (page 08) ────────────────────────────────
    callout_ref_page1_url: '',
    callout_details_page1: [
      { num: 1, title: '', description: '', image_url: '' },
      { num: 2, title: '', description: '', image_url: '' },
      { num: 3, title: '', description: '', image_url: '' },
      { num: 4, title: '', description: '', image_url: '' },
    ],

    // ── Call Outs page 2 (page 09) ────────────────────────────────
    callout_ref_page2_url: '',
    callout_details_page2: [
      { num: 5, title: '', description: '', image_url: '' },
      { num: 6, title: '', description: '', image_url: '' },
      { num: 7, title: '', description: '', image_url: '' },
      { num: 8, title: '', description: '', image_url: '' },
    ],

    // ── Stitching (page 10) ───────────────────────────────────────
    seam_stitch_blocks: [1, 2, 3, 4, 5, 6].map(num => ({ num, label: '', hidden: false, image_url: '' })),
    seams: [],
    labor_cost_usd: 0,
    labor_cost_notes: '',

    // ── Pattern & Cutting (page 11) ───────────────────────────────
    pattern_layout_url: '',
    pattern_pieces: [],
    cutting_instructions: '',

    // ── POM (page 12) ────────────────────────────────────────────
    pom_diagram_url: '',
    pom_rows: [],
    pom_size_type: 'apparel',
    pom_measurement_method: '',

    // ── Size Grading (page 13) ───────────────────────────────────
    graded_size_matrix: { baseSize: 'M', sizes: [], grading: [] },

    ...overrides,
  };
}
