# 18 · P3 · Wire real rollups into TreatmentBuilder

Read `CLAUDE.md` first. Then do ONLY this task. Stop when done.

## Prereq
Chunk 17 merged.

## Goal
Replace mock data in TreatmentBuilder with real queries against `atom_usage` and `drift_log`.

## Steps

1. Open `src/utils/treatmentStore.js`. Find `getTreatmentRollups(id)`.

2. Replace its mock return with a real query:
   ```js
   const rows = listAtomUsage({ atom_type: 'treatment', atom_id: id });
   if (rows.length === 0) return { units_produced: 0, latest_cost_usd: 0, latest_lead_days: 0, defect_rate_pct: 0 };

   // sort by produced_at desc
   rows.sort((a, b) => new Date(b.produced_at) - new Date(a.produced_at));

   const last3 = rows.slice(0, 3);
   const weightedAvg = (field) => {
     const totalUnits = last3.reduce((s, r) => s + r.units_used, 0);
     return last3.reduce((s, r) => s + r[field] * r.units_used, 0) / totalUnits;
   };

   return {
     units_produced: rows.reduce((s, r) => s + r.units_used, 0),
     latest_cost_usd: weightedAvg('actual_cost_per_unit_usd'),
     latest_lead_days: weightedAvg('actual_lead_days'),
     defect_rate_pct: weightedAvg('defect_rate_pct'),
     first_run_at: rows[rows.length - 1].produced_at,
     po_count: new Set(rows.map(r => r.po_id)).size
   };
   ```

3. Open `src/components/techpack/TreatmentBuilder.jsx`. Find `getMockProductionLog` from chunk 09.

4. Replace it with a real query:
   ```js
   function getProductionLog(treatmentId) {
     const rows = listAtomUsage({ atom_type: 'treatment', atom_id: treatmentId });
     // join with PO records via po_id to get po.code, po.placed_at, po.style_id
     // join with techPackStore to get style code/name
     // join with driftStore to get drift_score_pct
     return rows.map(r => ({
       po_code: getPO(r.po_id).code,
       date: format(getPO(r.po_id).placed_at, 'yyyy-MM'),
       style_id: getPO(r.po_id).style_id,
       units: r.units_used,
       lot: r.physical_lot_number,
       cost: r.actual_cost_per_unit_usd,
       lead: r.actual_lead_days,
       defect: r.defect_rate_pct,
       drift: getDriftLog(r.po_id, treatmentId)?.drift_score_pct ?? null
     }));
   }
   ```

5. Update the production log table render in `TreatmentBuilder.jsx` to use real data. Empty state if no rows: "No production runs yet — first PO using this treatment will populate this log."

6. Same wiring for the **drift strip**: pull real `DriftLog` records via `listDriftLogs({ treatment_id: id })`, take 3 most recent. Empty state: "No drift data — drift is measured on PO close."

7. The four stat cards already pull from `getTreatmentRollups` (chunk 07). Now they show real numbers.

## Acceptance

- Open a treatment with no PO history: stat cards show 0s, production log shows empty state, drift strip shows empty state.
- After closing a PO that referenced this treatment (chunk 17): stat cards show real numbers, production log has the row, drift strip has the data.
- Mock data is fully removed from the file.

## Stop after

Commit message: `feat(plm): wire real production rollups into treatment builder`. Push. Done.
