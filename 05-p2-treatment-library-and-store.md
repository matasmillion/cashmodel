# 05 · P2 · Treatment library + store

Read `CLAUDE.md` first. Then do ONLY this task. Stop when done.

## Prereq
P1 (chunks 01-04) merged. Browser-tested.

## Goal
Create the Treatment data layer: typedef + store. No UI yet.

## Steps

1. Create `src/utils/treatmentLibrary.js` with this typedef at the top of the file:

```js
/**
 * @typedef {import('../types/atoms.js').AtomBase & {
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
 *
 * @typedef {import('../types/atoms.js').DigitalAsset & {
 *   lora_checkpoint_url?: string,
 *   lora_base_model?: 'flux'|'sdxl'|'nano_banana_2'|'gemini_3_image',
 *   lora_trigger_phrase?: string,
 *   lora_training_image_urls: string[],
 *   lora_trained_at?: Date,
 *   lora_version?: string,
 *   derived_zfab_urls?: Record<string, string>
 * }} TreatmentDigital
 */
```

2. Export an empty initial library array. No seed data here (that's chunk 11).

3. Create `src/utils/treatmentStore.js` mirroring the pattern in `src/utils/techPackStore.js`. Read `techPackStore.js` first to match its conventions exactly.

   Required functions:
   - `listTreatments(filters?)` — returns array, supports `{ status, type }` filters
   - `getTreatment(id)` — returns one or null
   - `createTreatment(data)` — auto-generates `code` (`TR-{TYPE_PREFIX}-{SEQ}` where prefixes are `WSH`, `GDY`, `PDY`, `PRT`, `FIN`, `DST`), returns created record
   - `updateTreatment(id, patch)` — returns updated record
   - `archiveTreatment(id)` — sets status to `archived`. NEVER hard-delete.

4. Storage: localStorage primary, optional Supabase mirror behind a feature flag — match exactly what `techPackStore.js` does.

5. Add a `getTreatmentRollups(id)` helper that returns mock data:
   ```js
   { units_produced: 0, latest_cost_usd: 0, latest_lead_days: 0, defect_rate_pct: 0 }
   ```
   Real data comes in chunk 18.

## Acceptance

- Both files exist and import without errors.
- Calling `createTreatment({ name: 'Test', type: 'wash', ... })` from the browser console succeeds and returns a record with auto-generated code like `TR-WSH-001`.
- Refreshing the page preserves the test record.

## Stop after

Commit message: `feat(plm): add treatment library and store`. Push. Done.
