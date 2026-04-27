// Treatments library — typedefs + a few small constants the store and the
// builder both reach for. Persistence lives in `treatmentStore.js`; this file
// is the schema of record.
//
// A Treatment is any garment-level transformation that isn't a fabric, a
// trim, or a color in itself: a wash, a piece/garment dye, a print, a
// finish, or a distress technique. Each one carries:
//
//   • Physical spec — chemistry, duration, temperature, vendor + backup,
//     MOQ, lead time, cost — the recipe a vendor needs to reproduce it.
//   • Digital twin — a LoRA checkpoint trained on swatches of the real
//     output, plus optional CLO-SET .ZFAB / Rhino files. The digital twin
//     is what designers render with; the physical spec is what production
//     orders against. Drift between the two is how we know when to retrain.
//
// Records are JSDoc-typed for editor completion only — runtime is plain
// JSON in localStorage with an optional Supabase mirror.

// eslint-disable-next-line no-unused-vars
import * as _atomTypes from '../types/atoms';

/**
 * @typedef {import('../types/atoms').AtomBase & {
 *   type: 'wash'|'garment_dye'|'piece_dye'|'print'|'finish'|'distress',
 *   base_color_id: string,
 *   chemistry: string,
 *   duration_minutes: number,
 *   temperature_c: number,
 *   compatible_fabric_ids: string[],
 *   compatible_pattern_categories: string[],
 *   shrinkage_expected_pct: number,
 *   primary_vendor_id: string,
 *   backup_vendor_id?: string,
 *   cost_per_unit_usd: number,
 *   lead_time_days: number,
 *   moq_units: number,
 *   notes: string,
 *   swatch_image_url?: string,
 *   digital: TreatmentDigital
 * }} Treatment
 */

/**
 * @typedef {import('../types/atoms').DigitalAsset & {
 *   lora_checkpoint_url?: string,
 *   lora_base_model?: 'flux'|'sdxl'|'nano_banana_2'|'gemini_3_image',
 *   lora_trigger_phrase?: string,
 *   lora_training_image_urls: string[],
 *   lora_trained_at?: Date,
 *   lora_version?: string,
 *   derived_zfab_urls?: Record<string,string>
 * }} TreatmentDigital
 */

// Treatment types in the order they appear in the UI. The three-letter code
// after each is what feeds the auto-code (TR-WSH-001, TR-GDY-007, …).
export const TREATMENT_TYPES = [
  { id: 'wash',        label: 'Wash',        code: 'WSH' },
  { id: 'garment_dye', label: 'Garment dye', code: 'GDY' },
  { id: 'piece_dye',   label: 'Piece dye',   code: 'PDY' },
  { id: 'print',       label: 'Print',       code: 'PRT' },
  { id: 'finish',      label: 'Finish',      code: 'FIN' },
  { id: 'distress',    label: 'Distress',    code: 'DST' },
];

export const TREATMENT_TYPE_LABEL = Object.fromEntries(
  TREATMENT_TYPES.map(t => [t.id, t.label])
);

export const TREATMENT_TYPE_CODE = Object.fromEntries(
  TREATMENT_TYPES.map(t => [t.id, t.code])
);

export const TREATMENT_STATUSES = ['draft', 'testing', 'approved', 'archived'];

// Empty initial library — runtime data lives in localStorage via
// treatmentStore. Exported so callers that want a deterministic empty
// shape can import a single name instead of inlining a literal.
export const INITIAL_LIBRARY = [];

export const LORA_BASE_MODELS = [
  { id: 'flux',             label: 'Flux' },
  { id: 'sdxl',             label: 'SDXL' },
  { id: 'nano_banana_2',    label: 'Nano Banana 2' },
  { id: 'gemini_3_image',   label: 'Gemini 3 Image' },
];

// Empty digital envelope — applied to every treatment that hasn't yet had
// a LoRA trained or a CLO-SET asset attached.
export function emptyTreatmentDigital() {
  return {
    digital_source: 'manual',
    clo_asset_url: '',
    clo_asset_type: undefined,
    clo_set_content_id: '',
    rhino_file_url: '',
    pbr_thumbnail_url: '',
    last_digital_sync_at: null,
    lora_checkpoint_url: '',
    lora_base_model: undefined,
    lora_trigger_phrase: '',
    lora_training_image_urls: [],
    lora_trained_at: null,
    lora_version: '',
    derived_zfab_urls: {},
  };
}

// Empty treatment record — every field defaulted so a freshly-created
// treatment renders without conditional `?.` chains every line.
export function emptyTreatment(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: '',
    code: '',
    name: '',
    status: 'draft',
    version: 'v1.0',
    created_at: now,
    updated_at: now,
    type: 'wash',
    base_color_id: '',
    chemistry: '',
    duration_minutes: 0,
    temperature_c: 0,
    compatible_fabric_ids: [],
    compatible_pattern_categories: [],
    shrinkage_expected_pct: 0,
    primary_vendor_id: '',
    backup_vendor_id: '',
    cost_per_unit_usd: 0,
    lead_time_days: 0,
    moq_units: 0,
    notes: '',
    swatch_image_url: '',
    digital: emptyTreatmentDigital(),
    ...overrides,
  };
}
