# FR PLM — Claude Code execution prompts

Execute in order. Each prompt is self-contained. Commit after each prompt, review, then move to the next.

**Repo:** `matasmillion/cashmodel`
**Base branch:** `claude/build-cash-mod-00tyz` (HEAD `71ff064`)
**Reference mockup:** `fr-plm-treatment-detail.html` (commit to `docs/mockups/` before running Prompt 2)

---

## GLOBAL RULES — APPLY TO ALL PROMPTS

1. **ADDITIVE ONLY. NO DELETIONS.** Do not delete any existing file, component, function, field, or route. Every change must preserve existing behavior. If a task appears to require a deletion, stop and flag it.

2. **PRESERVE EXISTING WORKFLOWS.** `TechPackBuilder.jsx` and `ComponentPackBuilder.jsx` (trim packs) have been carefully architected. Do not refactor them. The only permitted edits are explicitly additive ones called out in the task list. Mount-location changes only, otherwise.

3. **RENAMES ARE NOT DELETIONS** when done atomically: update the file, every import, every reference, and every string literal in the same commit. Factory → Vendor is an approved rename; no other renames without approval.

4. **WHEN IN DOUBT, STOP AND ASK.** Better to pause for clarification than to regress a working workflow.

---

## Prompt 1 — Foundation: IA migration, Factory→Vendor rename, atom stubs

**Estimate: 2–3 hours.**

### Context files to read first

- `src/components/techpack/PLMView.jsx`
- `src/components/techpack/TechPackList.jsx`
- `src/components/techpack/TechPackBuilder.jsx` — understand, do not modify
- `src/components/techpack/ComponentPackList.jsx`
- `src/components/techpack/ComponentPackBuilder.jsx` — understand, do not modify
- `src/components/techpack/ColorPaletteManager.jsx`
- `src/components/techpack/FactoryManager.jsx`
- `src/utils/colorLibrary.js`
- `src/utils/factoryLibrary.js`
- `src/utils/techPackStore.js`
- `src/utils/componentPackStore.js`
- `src/utils/plmRouting.js`

Also grep the repo for every occurrence of `factory`, `Factory`, `FACTORY`, `factories`, `Factories` — you need a complete inventory before the rename.

### Goal
Restructure the PLM from four flat sub-tabs (Styles / Trims / Colors / Factories) into a three-layer architecture — **Library / Styles / Production** — with seven atom types nested under Library. Rename Factory → Vendor everywhere.

### Tasks

1. **Top-level nav in `PLMView.jsx`:** add a wrapper nav with three top tabs — Library, Styles, Production. Default = Library. Existing sub-tab logic stays alive but gets nested inside the Library tab.

2. **Library sub-tabs (seven atoms, in order):**
   Patterns · Fabrics · Colors · Trims · Treatments · Embellishments · Vendors

3. **Mount existing components in new locations:**
   - `ColorPaletteManager` → `Library / Colors` (no edits).
   - `ComponentPackList` + `ComponentPackBuilder` → `Library / Trims` (no edits).
   - `FactoryManager` → see Factory→Vendor rename below.
   - `TechPackList` + `TechPackBuilder` → `Styles` top tab (no edits).

4. **Factory → Vendor rename — thorough, atomic, additive:**

   File renames:
   - `src/components/techpack/FactoryManager.jsx` → `src/components/techpack/VendorManager.jsx`
   - `src/utils/factoryLibrary.js` → `src/utils/vendorLibrary.js`

   Inside the renamed files:
   - Component `FactoryManager` → `VendorManager`
   - All internal identifiers: `factory` → `vendor`, `Factory` → `Vendor`, `factories` → `vendors`, `FACTORY` → `VENDOR`
   - UI strings: "Factory" / "Factories" → "Vendor" / "Vendors"

   Every other file in the repo:
   - Grep all `factory` / `Factory` variants; update imports, references, prop names, store keys, route hashes.
   - **Data compatibility is non-negotiable.** Existing localStorage records under the old key must still load. In `vendorLibrary.js`:
     - Read: try new key first, fall back to old key, migrate silently on first read.
     - Write: new key only.
   - Any existing `factory_id` foreign key in other records (e.g. tech pack BOM items) must continue to resolve. Expose a `resolveVendor(id)` helper that accepts either the new `vendor_id` or a legacy `factory_id` and returns the same vendor record.

   Schema additions (additive, defaults for existing records):
   - `capabilities: string[]` — default `[]`
   - `moq_units: number` — default `0`
   - `lead_time_days: number` — default `0`
   - `payment_terms: string` — default `""`
   - `rating: number` — default `0`

5. **Create empty stubs** (empty-state card only, no CRUD):
   - `src/components/techpack/PatternList.jsx` + `PatternBuilder.jsx`
   - `src/components/techpack/FabricList.jsx` + `FabricBuilder.jsx`
   - `src/components/techpack/TreatmentList.jsx` + `TreatmentBuilder.jsx`
   - `src/components/techpack/EmbellishmentList.jsx` + `EmbellishmentBuilder.jsx`

6. **Create `src/types/atoms.js`** — shared JSDoc typedefs:

   ```js
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
   ```

7. **`plmRouting.js` — additive routes:**
   - `#plm/library/{patterns|fabrics|colors|trims|treatments|embellishments|vendors}`
   - `#plm/styles`, `#plm/styles/:id`
   - `#plm/production`, `#plm/production/:poId`
   - Backwards compat: old routes redirect. `#plm/factories` → `#plm/library/vendors`.

8. **Production tab:** empty state. Title "Production", copy: "Every PO snapshots a Style's BOM and writes actuals back to the Library. Coming in Phase 3."

### Design constraints (FR brand)

- Background `#F5F0E8` Salt · Primary text `#3A3A3A` Slate · Accent `#EBE5D5` Sand.
- Headings: Cormorant Garamond. Body: system sans. IDs/paths: mono.
- Cards: white, 0.5px border `rgba(58,58,58,0.15)`, 8px radius, 18–22px padding.
- Tabs active = Slate bg + Salt text, 6px radius. Inactive = ghost.
- No emojis, no bright colors, no deep shadows.

### Non-goals

- Do not modify `TechPackBuilder.jsx` or `ComponentPackBuilder.jsx`.
- Do not implement `digital` envelope fields on existing atoms — just import the type.
- Do not build production logging.

### Acceptance

- `/plm` shows three top tabs.
- Library has seven sub-tabs, all render.
- Colors, Trims, Vendors show existing data from new locations (vendor migration works).
- Styles tab shows existing tech packs unchanged.
- Production shows the empty state.
- Old hash routes redirect correctly; `#plm/factories` → `#plm/library/vendors`.
- Grep for `factory` / `Factory` returns zero results in source.
- Legacy `factory_id` FKs on BOM items still resolve.
- `src/types/atoms.js` exists.

---

## Prompt 2 — Treatments atom + BOM picker

**Estimate: 4–6 hours.** Prompt 1 must be merged first.

### Context files

- `src/types/atoms.js`
- `src/utils/colorLibrary.js` — mirror this library pattern
- `src/utils/techPackStore.js` — mirror this persistence pattern
- `src/utils/vendorLibrary.js`
- `src/components/techpack/TechPackBuilder.jsx` — understand BOM for picker addition
- `docs/mockups/fr-plm-treatment-detail.html` — **pixel-level spec**

### Tasks

1. **`src/utils/treatmentLibrary.js`** — schema:

   ```js
   /**
    * @typedef {AtomBase} Treatment
    * @property {'wash'|'garment_dye'|'piece_dye'|'print'|'finish'|'distress'} type
    * @property {string} base_color_id
    * @property {string} chemistry
    * @property {number} duration_minutes
    * @property {number} temperature_c
    * @property {string[]} compatible_fabric_ids
    * @property {string[]} compatible_pattern_categories
    * @property {number} shrinkage_expected_pct
    * @property {string} primary_vendor_id
    * @property {string=} backup_vendor_id
    * @property {number} cost_per_unit_usd
    * @property {number} lead_time_days
    * @property {number} moq_units
    * @property {string} notes
    * @property {string=} swatch_image_url
    * @property {TreatmentDigital} digital
    */

   /**
    * @typedef {DigitalAsset} TreatmentDigital
    * @property {string=} lora_checkpoint_url
    * @property {'flux'|'sdxl'|'nano_banana_2'|'gemini_3_image'=} lora_base_model
    * @property {string=} lora_trigger_phrase
    * @property {string[]} lora_training_image_urls
    * @property {Date=} lora_trained_at
    * @property {string=} lora_version
    * @property {Record<string,string>=} derived_zfab_urls
    */
   ```

2. **`src/utils/treatmentStore.js`** — mirror `techPackStore.js`. localStorage + Supabase mirror. CRUD + archive (no hard delete). Auto-code `TR-{WSH|GDY|PDY|PRT|FIN|DST}-{SEQ}`.

3. **`TreatmentList.jsx`** — card grid matching the earlier mockup. Rollups come from `getTreatmentRollups(id)` helper — mock data for now, swapped for real in Prompt 3.

4. **`TreatmentBuilder.jsx` — match `docs/mockups/fr-plm-treatment-detail.html` exactly.** Open it side-by-side and replicate. Sections in order: breadcrumb, header row, four-card stat strip, twin columns (Physical spec + Digital asset), production log (mock), drift strip (3 paired gradient tiles), used-in list, footer actions. Edit mode toggles inline fields. LoRA checkpoint upload + training images array on Digital panel. "Retrain LoRA" and "Sync to CLO-SET" are stubs.

5. Mount under `Library / Treatments`.

6. **Seed data** (dev only, if empty):
   - Stone wash on Sienna — Guangdong Ocean Wash — use numbers from mockup.
   - Vintage soft on Sand — Foshan Blue Wash.
   - Gone global dye on Slate — Guangdong Ocean Wash.

7. **`TechPackBuilder` — additive BOM picker (only permitted edit):**
   - Add one optional field `treatment_id` to BOM line items.
   - Dropdown populated from `listTreatments()` filtered to `status !== 'archived'`.
   - Optional, default none. Existing line items continue to work unchanged.
   - No other refactors. If awkward, stop and flag.

### Design

- Same brand.
- Stat deltas: green `#3B6D11` good, amber `#854F0B` warn, red `#A32D2D` bad.
- Mono for codes/paths/IDs. Cormorant for titles/stat values.
- Drift pairs: gradient tiles, `aspect-ratio: 1`, 6px radius.

### Non-goals

- No real LoRA training. No real CLO-SET sync. No production writeback (rollups still mock).

### Acceptance

- Create / edit / archive a treatment from the UI.
- Detail matches mockup at 1080px.
- Three seed treatments on first load.
- LoRA upload persists URL to `digital.lora_checkpoint_url`.
- `TechPackBuilder` shows treatment picker; existing tech packs render unchanged.
- Schema matches typedef.

---

## Prompt 3 — Production layer: POs, BOM snapshot, writeback

**Estimate: 4–6 hours.** Prompts 1 and 2 must be merged first.

### Context files

- `src/utils/techPackStore.js`
- `src/utils/treatmentStore.js`
- `src/components/techpack/TechPackBuilder.jsx` — BOM structure (read-only)
- `src/components/techpack/TreatmentBuilder.jsx` — where real data lands

### Tasks

1. **`src/utils/productionStore.js`** — schemas:

   ```js
   /**
    * @typedef {Object} PurchaseOrder
    * @property {string} id
    * @property {string} code
    * @property {string} style_id
    * @property {'draft'|'placed'|'in_production'|'received'|'closed'} status
    * @property {string} vendor_id
    * @property {number} units_ordered
    * @property {number=} units_received
    * @property {number=} total_cost_actual
    * @property {Date=} placed_at
    * @property {Date=} received_at
    * @property {Date=} closed_at
    * @property {string} notes
    */

   /**
    * @typedef {Object} BOMSnapshot
    * @property {string} po_id
    * @property {object} bom_json
    * @property {Date} snapshotted_at
    */

   /**
    * @typedef {Object} AtomUsage
    * @property {string} id
    * @property {string} po_id
    * @property {'pattern'|'fabric'|'color'|'trim'|'treatment'|'embellishment'} atom_type
    * @property {string} atom_id
    * @property {string} atom_version_at_po
    * @property {string=} physical_lot_number
    * @property {number} units_used
    * @property {number} actual_cost_per_unit_usd
    * @property {number} actual_lead_days
    * @property {number} defect_rate_pct
    * @property {string} quality_notes
    * @property {string[]} qc_photo_urls
    * @property {Date} produced_at
    */

   /**
    * @typedef {Object} DriftLog
    * @property {string} id
    * @property {string} po_id
    * @property {string} treatment_id
    * @property {string=} predicted_render_url
    * @property {string[]} actual_photo_urls
    * @property {number} drift_score_pct
    * @property {boolean} retrained_after
    * @property {Date} measured_at
    */
   ```

2. **Writeback engine:**
   - `placePO(po_id)`: deep-clone `style.bom` with atom versions into `BOMSnapshot`. Status → `placed`. Snapshot immutable.
   - `closePO(po_id, actuals)`: for each atom in the snapshot, INSERT an `AtomUsage` row. Recompute rolling averages (weighted avg of last 3 for cost/lead/defect; SUM for total units).
   - `AtomUsage` **append-only**: store-layer guard rejects UPDATE / DELETE.

3. **`ProductionList.jsx`** — table: Code · Style · Vendor · Units · Status pill · Placed · Closed · Total cost. Status colors: draft gray, placed Sand, in_production Soil, received Sea, closed green. `+ New PO` top-right.

4. **`ProductionDetail.jsx`** — full PO view:
   - Header with status stepper.
   - BOM snapshot tree (read-only, with `v2.1`-style version tags). Label: "Snapshot taken {date} — immutable."
   - Atom usage log table.
   - Digital drift section (treatments only): paired tiles, drift score, "Retrain recommended" flag if > 8%.
   - Actions: Place · Mark Received · Close (state-aware).
   - Close triggers writeback + toast + navigate to updated Treatment detail.

5. **Wire real data into `TreatmentBuilder`:**
   - Replace `getTreatmentRollups()` with real query: `atom_usage` filtered by `atom_type='treatment', atom_id=X`.
   - Stat cards, production log, drift strip all pull live data.
   - Editing `TreatmentBuilder.jsx` is fine here — it's your Prompt 2 code, not a perfected workflow.

6. Mount Production tab — replace empty state with `ProductionList`.

7. **Seed data** (dev only): one PO (PO-2026-0024) against a seeded Style using Stone wash. Walk programmatically: draft → placed → received → closed.

### Design

- Same brand.
- Status pills: 5px radius, 11px font, 0.06em tracking, 5×12px padding.
- BOM snapshot tree: indented, mono codes, `v2.1` version tags.
- Drift tiles: `aspect-ratio: 1`, 6px radius, 10px uppercase mono drift % label below.

### Non-goals

- No LoRA retraining automation.
- No CLO-SET sync.
- No inventory integration.
- Drift log treatments-only.

### Acceptance

- Create draft PO → place (snapshots BOM) → receive → close.
- Close triggers `atom_usage` inserts + rolling average updates on every referenced atom.
- Treatment detail stat cards pull real data.
- Production log in Treatment detail pulls real rows.
- BOM snapshot immutable: editing Style's BOM post-placement does not change snapshot.
- UPDATE / DELETE on `atom_usage` rejected.
- Drift entries render on both Production detail and Treatment detail.

---

## Timeline

All three prompts: **one long day or two evenings.** Parallel Claude Code sessions could land it under a day.

## Commits

- Prompt 1: `feat(plm): migrate to library/styles/production IA + factory→vendor rename`
- Prompt 2: `feat(plm): treatments atom with digital twin + lora envelope + bom picker`
- Prompt 3: `feat(plm): production writeback loop + immutable bom snapshots`

## Next atoms

Patterns → Fabrics → Embellishments, each ~half day following the Treatment pattern. Colors/Trims/Vendors get a small additive migration prompt to add the `digital` envelope. CLO-SET API integration deferred to Phase 7+; no research task needed now.
