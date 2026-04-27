# 10 · P2 · TreatmentBuilder — drift, used-in, footer

Read `CLAUDE.md` first. Then do ONLY this task. Stop when done.

## Prereq
Chunk 09 merged.

## Goal
Finish the Treatment detail view. Three remaining sections.

## Steps

1. Open `src/components/techpack/TreatmentBuilder.jsx`. Below the production log, add the remaining sections.

2. **Section: Digital drift** (mock data, real wiring in chunk 16):
   - Card chrome same as others
   - Header: "Digital drift" / hint "LoRA prediction vs production photo · retrain if > 8%"
   - 3-column grid, 16px gap
   - Each item: a 2-column 6px-gap row of two squares (`aspect-ratio: 1`, 6px radius), each filled with a different gradient. Below: 10px uppercase mono label like "PO #0024 · Feb 2026" left-aligned, drift % right-aligned (color-coded as in chunk 09).
   - Mock data: pull from the same 4 PO records in chunk 09, take the 3 most recent.

3. **Section: Used in**:
   - Card chrome same as others
   - Header: "Used in" / hint "Active styles referencing this atom"
   - List of style rows. Each row:
     - Left: mono 11.5px style code + name (e.g. `AP-HD-STONE-01 · Borderless stone hoodie`)
     - Right: muted "740 units · live"
     - 0.5px bottom border between rows, padding 10px 0
   - Query: filter `listTechPacks()` for tech packs whose BOM references `treatment.id`. If empty, show "Not yet referenced in any style."

4. **Footer action row**:
   - 18px margin-top
   - Two-column row: actions on the left, "Last updated {date} · {actor}" on the right
   - Left actions, separated by middots: Edit · Retrain LoRA · Export tech pack · Sync to CLO-SET · New production run
   - Each action is an `<a>` styled as a dashed-underline link, color muted, hover darker
   - **Stub behavior:**
     - Edit → toggles edit mode (already wired in chunk 08)
     - Retrain LoRA → `alert('LoRA retraining wires to Fal API in Phase 7. For now, manual.')`
     - Export tech pack → `alert('Tech pack export coming in a future phase.')`
     - Sync to CLO-SET → `alert('CLO-SET sync wires to CLO Open API in Phase 7.')`
     - New production run → navigate to `#plm/production/new?treatment={id}` (stub for chunk 14)

## Acceptance

- Detail page is visually complete and matches `docs/mockups/fr-plm-treatment-detail.html` at 1080px viewport.
- All sections render without error.
- Stub buttons fire their alerts; Edit toggles to edit mode.

## Stop after

Commit message: `feat(plm): treatment builder drift + used-in + footer actions`. Push. Done.

**P2 Treatment detail view is now visually complete (with mock data).** Chunks 11-12 finish P2.
