# 13 · P3 · Production schemas + store

Read `CLAUDE.md` first. Then do ONLY this task. Stop when done.

## Prereq
P2 (chunks 05-12) merged.

## Goal
Create the production data layer: PO, BOM snapshot, atom usage, drift log. No UI yet.

## Steps

1. Create `src/utils/productionStore.js`. Mirror the storage pattern from `treatmentStore.js`.

2. Add typedefs for: `PurchaseOrder`, `BOMSnapshot`, `AtomUsage`, `DriftLog`. Use the schemas from the original Sprint 1 prompt file (Prompt 3, task 1).

3. Required functions:
   - `listPOs(filters?)` — supports `{ status, vendor_id, style_id }`
   - `getPO(id)`
   - `createPO(data)` — auto-generates code `PO-{YYYY}-{SEQ}`, defaults to `status: 'draft'`
   - `updatePO(id, patch)` — only fields like notes/units allowed; status changes go through `transitionPO`
   - `transitionPO(id, newStatus, payload?)` — state machine (see step 4)
   - `listBOMSnapshots(po_id)` — usually 0 or 1 result
   - `listAtomUsage(filters?)` — supports `{ atom_type, atom_id, po_id }`
   - `appendAtomUsage(record)` — INSERT only
   - `listDriftLogs(filters?)` — supports `{ treatment_id, po_id }`
   - `appendDriftLog(record)` — INSERT only

4. State machine for `transitionPO`. Legal transitions:
   - `draft → placed`
   - `placed → in_production`
   - `in_production → received`
   - `received → closed`
   - Any → `cancelled` (additive — add this state)
   Throw on illegal transitions.

5. **Append-only enforcement**: at the store layer, `atom_usage` and `drift_log` collections must reject any UPDATE or DELETE attempts. Throw an error: "atom_usage is append-only. Inserts only."

   Also reject any attempt to modify a `BOMSnapshot` after creation (snapshots are immutable).

6. Empty initial state: no seed records here (seed comes in chunk 19).

## Acceptance

- File exists, imports without errors.
- From browser console: `createPO({...})` returns a record. `transitionPO(id, 'placed')` succeeds. Trying `transitionPO(id, 'closed')` directly from `draft` throws.
- From console: `appendAtomUsage({...})` succeeds. Trying to update or delete an `atom_usage` row throws.

## Stop after

Commit message: `feat(plm): production store with state machine and append-only enforcement`. Push. Done.
