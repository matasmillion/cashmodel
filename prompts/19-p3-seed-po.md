# 19 · P3 · Seed one PO walked through the full lifecycle

Read `CLAUDE.md` first. Then do ONLY this task. Stop when done.

## Prereq
Chunk 18 merged.

## Goal
Create one real PO that's been walked through draft → placed → received → closed, so the Treatment detail view has live rollup data on first load.

## Steps

1. Add `seedProductionIfEmpty()` to `src/utils/productionStore.js`. Idempotent — never overwrites existing data.

2. Logic:
   - Check if any POs exist. If yes, skip.
   - Find the seeded "Stone wash" treatment from chunk 11. If not found, skip.
   - Create or find a tech pack (style) that uses Stone wash. If no such style exists, create a minimal one: `AP-HD-STONE-01 · Borderless stone hoodie` with a BOM that references at least the Stone wash treatment_id. (Use `techPackStore.createTechPack`.)
   - Create the PO: `createPO({ style_id, vendor_id: <Guangdong Ocean>, units_ordered: 320, notes: 'Seed PO for demo data' })`. Code: should auto-generate as `PO-2026-0024` or similar.

3. Walk it through the state machine programmatically:
   - `transitionPO(id, 'placed')` → triggers BOM snapshot
   - `transitionPO(id, 'in_production')`
   - `transitionPO(id, 'received')`
   - `transitionPO(id, 'closed', { actuals: [...] })` with these per-atom actuals:
     ```js
     {
       atom_type: 'treatment',
       atom_id: <stone_wash_id>,
       physical_lot_number: 'GO-2602-A',
       units_used: 320,
       actual_cost_per_unit_usd: 3.80,
       actual_lead_days: 12,
       defect_rate_pct: 0.3,
       quality_notes: 'Clean run, no callbacks.',
       qc_photo_urls: []
     }
     ```
     Plus actuals for any other atoms in the BOM.

4. Also append one DriftLog row for this PO/treatment combo:
   ```js
   appendDriftLog({
     po_id, treatment_id: stone_wash_id,
     predicted_render_url: null,
     actual_photo_urls: [],
     drift_score_pct: 3.1,
     retrained_after: false,
     measured_at: now
   })
   ```

5. Call `seedProductionIfEmpty()` once on app mount, after `seedTreatmentsIfEmpty()`.

## Acceptance

- First load (or after clearing localStorage): one PO appears in Production list, status `closed`.
- Open the seeded PO's detail page: BOM snapshot tree, atom usage log, drift section all populated.
- Open the Stone wash treatment detail: stat cards show 320 units, $3.80, 12d, 0.3%; production log has 1 row; drift strip has 1 paired tile at 3.1%.
- Reload page: still 1 PO, no duplicates.

## Stop after

Commit message: `feat(plm): seed one demo PO walked through full lifecycle`. Push. Done.

**Sprint 1 is now complete.** Walk through the full loop in the browser:

1. Library / Treatments / Stone wash → see live rollup data.
2. Production / PO-2026-0024 → see BOM snapshot, usage log, drift.
3. Create a new PO for the same style, walk it to closed → watch Stone wash's stat cards update.

If all three work: ship it. Use it for two real POs before starting Sprint 2.
