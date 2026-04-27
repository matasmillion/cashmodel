# 16 · P3 · ProductionDetail — atom usage log + drift

Read `CLAUDE.md` first. Then do ONLY this task. Stop when done.

## Prereq
Chunk 15 merged.

## Goal
Add the bottom sections to the PO detail page: atom usage log + digital drift.

## Steps

1. Open `src/components/production/ProductionDetail.jsx`. Find the `{/* TODO: chunk 16 */}` comment.

2. **Atom usage log section**:
   - Card chrome: white, 0.5px border, 8px radius, 18-22px padding, 22px margin-bottom
   - Header: Cormorant 17px "Atom usage log" / hint "Append-only · written when PO closes"
   - If PO status < `received`: empty state "Usage log will populate when the PO closes."
   - If logs exist: table:
     - Columns: Atom · Code · Version · Lot · Units · Cost · Lead · Defect · Notes
     - Same styling as the production log on the Treatment detail (mono font, 11.5px, 9px row padding, 0.5px borders)
     - Color-code defect (same thresholds as chunk 09)
   - Data: `listAtomUsage({ po_id: po.id })`

3. **Digital drift section** (treatments only):
   - Card chrome same
   - Header: "Digital drift" / hint "LoRA prediction vs production photo · per treatment in this BOM"
   - For each treatment atom in the PO's BOM snapshot:
     - Find the `DriftLog` record (if any) for `{ po_id, treatment_id }`
     - Render a paired-tile row:
       - Left tile: predicted render (gradient placeholder if `predicted_render_url` is null)
       - Right tile: actual photo (gradient placeholder if `actual_photo_urls` is empty)
       - Below: treatment name + drift % (color-coded)
       - If `drift_score_pct > 8`: "⚠ Retrain recommended" flag (subtle, no emoji)
   - If no treatments in BOM: skip this section entirely.

4. **External activity panel** (additive — for vendor portal future use):
   - Card chrome same
   - Header: "External activity"
   - Empty for now. Comment: `{/* Vendor status updates from /vendor/* surface — populated in Sprint 2 Prompt 5 */}`

## Acceptance

- PO detail page is now visually complete.
- For a draft PO: usage log shows empty state, drift section is empty or absent.
- For a closed PO with usage data (test later in chunk 19): usage log renders correctly.

## Stop after

Commit message: `feat(plm): production detail usage log + drift section`. Push. Done.
