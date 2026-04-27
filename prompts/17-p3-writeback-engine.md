# 17 · P3 · Writeback engine

Read `CLAUDE.md` first. Then do ONLY this task. Stop when done.

## Prereq
Chunk 16 merged.

## Goal
Wire the two state transitions that do real work: `placePO` (snapshot BOM) and `closePO` (writeback to library).

## Steps

1. In `src/utils/productionStore.js`, extend `transitionPO(id, newStatus, payload?)` to handle two specific transitions specially.

2. **`draft → placed`** (action: `placePO`):
   - Load the PO's `style_id`, fetch the style via `techPackStore.getTechPack(style_id)`
   - Deep-clone the style's BOM (including atom version stamps as they exist NOW)
   - Insert into `bom_snapshots` collection: `{ po_id, bom_json, snapshotted_at: now }`
   - Update PO: status = 'placed', placed_at = now
   - The snapshot is immutable. Future edits to the source style's BOM do NOT change this snapshot.

3. **`received → closed`** (action: `closePO`):
   - Receives `payload`: per-atom actuals from a form (built lightly inline — see step 4)
   - For each atom in the snapshot's BOM, INSERT one `AtomUsage` row:
     - `{ id, po_id, atom_type, atom_id, atom_version_at_po, physical_lot_number, units_used, actual_cost_per_unit_usd, actual_lead_days, defect_rate_pct, quality_notes, qc_photo_urls, produced_at }`
   - After inserts: recompute rolling averages on each referenced atom record:
     - For each atom touched, fetch last 3 `AtomUsage` rows (ordered by `produced_at` desc)
     - Weighted average for: `cost_per_unit_usd`, `lead_time_days`, `defect_rate_pct`
     - Total sum for: derived `units_produced_total` (computed on read, not stored — but for this initial impl, you may store it as a simple count)
     - Update the atom record via its respective store (`treatmentStore.updateTreatment`, etc.)
   - Update PO: status = 'closed', closed_at = now, total_cost_actual = sum of all line costs

4. **`closePO` UI** — minimal:
   - On `ProductionDetail.jsx`, the "Close PO" button opens an inline form (or modal) with one row per atom in the BOM snapshot.
   - Fields per row: lot number, units used, actual cost/unit, actual lead days, defect %, notes, photo URLs (comma-separated for now).
   - Submit calls `transitionPO(po_id, 'closed', { actuals: [...] })`.
   - On success: toast "{N} atoms updated from {po.code}", refresh detail page.

5. After successful close, navigate to the **Treatment detail** of the first treatment atom in the BOM (if any). User sees their stat cards updated immediately. (This makes the writeback loop visceral.)

## Acceptance

- Place a draft PO → BOM snapshot is created, status flips to placed.
- Edit the source style's BOM after placement → snapshot is unchanged.
- Walk the PO through to received, then close it with actuals.
- After close: `atom_usage` rows exist, atom records have updated rolling averages.
- Treatment detail's stat cards now reflect the new data (visible because `getTreatmentRollups` will be wired in chunk 18 — for now it still returns mock; the rolling averages on the atom record are what update first).

## Stop after

Commit message: `feat(plm): writeback engine — placePO snapshot + closePO atom usage + rolling averages`. Push. Done.
