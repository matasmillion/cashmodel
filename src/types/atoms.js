// Shared JSDoc typedefs for every PLM atom (Pattern, Fabric, Color, Trim,
// Treatment, Embellishment, Vendor). These are documentation-only — the
// runtime stores stay plain localStorage JSON. Import them where you want
// editor-level completion or to signal intent.

/**
 * @typedef {Object} DigitalAsset
 * @property {string=} clo_asset_url
 * @property {'zfab'|'ztrm'|'dxf'|'zprj'|'obj'|'3dm'|'ase'|'ace'|'graphic'|'lora'=} clo_asset_type
 * @property {string=} clo_set_content_id
 * @property {string=} rhino_file_url
 * @property {string=} pbr_thumbnail_url
 * @property {Date=} last_digital_sync_at
 * @property {'clo_set'|'rhino'|'scanned'|'ai_generated'|'lora_trained'|'manual'} digital_source
 */

/**
 * @typedef {Object} AtomBase
 * @property {string} id
 * @property {string} code
 * @property {string} name
 * @property {'draft'|'testing'|'approved'|'archived'} status
 * @property {string} version
 * @property {Date} created_at
 * @property {Date} updated_at
 * @property {DigitalAsset | null} digital
 */

export {};
