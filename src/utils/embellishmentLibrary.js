// Embellishments library — schema constants the store and builder both
// reach for. Persistence lives in `embellishmentStore.js`; this file is
// the schema of record.
//
// An Embellishment is the decorative layer applied to a finished garment
// — embroidery, applique, beading, screen prints, art prints. Each one
// pairs an artwork file with placement rules and a vendor handoff.

// eslint-disable-next-line no-unused-vars
import * as _atomTypes from '../types/atoms';

/**
 * @typedef {import('../types/atoms').AtomBase & {
 *   type: 'embroidery'|'applique'|'beading'|'screen_print'|'art_print'|'patch'|'foil'|'puff_print'|'other',
 *   technique: string,
 *   artwork_file_url: string,
 *   placement: string,
 *   placement_image_url: string,
 *   size_w_cm: number,
 *   size_h_cm: number,
 *   color_count: number,
 *   thread_color_ids: string[],
 *   primary_vendor_id: string,
 *   backup_vendor_id: string,
 *   cost_per_unit_usd: number,
 *   currency: string,
 *   lead_time_days: number,
 *   moq_units: number,
 *   notes: string
 * }} Embellishment
 */

export const EMBELLISHMENT_TYPES = [
  { id: 'embroidery',    label: 'Embroidery',     code: 'EMB' },
  { id: 'applique',      label: 'Applique',       code: 'APP' },
  { id: 'beading',       label: 'Beading',        code: 'BD' },
  { id: 'screen_print',  label: 'Screen print',   code: 'SCR' },
  { id: 'art_print',     label: 'Art print',      code: 'ART' },
  { id: 'patch',         label: 'Patch',          code: 'PCH' },
  { id: 'foil',          label: 'Foil',           code: 'FOL' },
  { id: 'puff_print',    label: 'Puff print',     code: 'PFF' },
  { id: 'other',         label: 'Other',          code: 'GEN' },
];

export const EMBELLISHMENT_TYPE_LABEL = Object.fromEntries(
  EMBELLISHMENT_TYPES.map(t => [t.id, t.label])
);

export const EMBELLISHMENT_TYPE_CODE = Object.fromEntries(
  EMBELLISHMENT_TYPES.map(t => [t.id, t.code])
);

export const EMBELLISHMENT_STATUSES = ['draft', 'testing', 'approved', 'archived'];

export const PLACEMENT_OPTIONS = [
  'Left chest',
  'Right chest',
  'Center chest',
  'Front full',
  'Back yoke',
  'Back full',
  'Left sleeve',
  'Right sleeve',
  'Hem',
  'Hood',
  'Pocket',
  'Other',
];

export function emptyEmbellishment(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: '',
    code: '',
    name: '',
    status: 'draft',
    version: 'v1.0',
    created_at: now,
    updated_at: now,
    type: 'embroidery',
    technique: '',
    artwork_file_url: '',
    placement: '',
    placement_image_url: '',
    size_w_cm: 0,
    size_h_cm: 0,
    color_count: 1,
    thread_color_ids: [],
    primary_vendor_id: '',
    backup_vendor_id: '',
    cost_per_unit_usd: 0,
    currency: 'USD',
    lead_time_days: 0,
    moq_units: 0,
    cover_image: null, // base64 data URL of a 2:3 portrait crop
    // CLO3D / Adobe asset references. Embellishments live as graphics in
    // CLO3D (a graphic .png with placement metadata) and as artwork
    // packs in Adobe (.ai / .psd / .eps for vendor handoff).
    adobe_ai_url: '',         // Illustrator working file
    adobe_psd_url: '',        // Photoshop working file
    clo3d_graphic_url: '',    // CLO3D-compatible graphic export
    digitizing_file_url: '',  // .DST / .EXP for embroidery
    notes: '',
    ...overrides,
  };
}
