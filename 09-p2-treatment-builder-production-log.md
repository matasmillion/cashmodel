# 09 · P2 · TreatmentBuilder — production log table

Read `CLAUDE.md` first. Then do ONLY this task. Stop when done.

## Prereq
Chunk 08 merged.

## Goal
Add the production log table below the twin columns. Mock data only — wired to real production data in chunk 18.

## Steps

1. Open `src/components/techpack/TreatmentBuilder.jsx`. Below the twin columns section, add a new card.

2. Reference `docs/mockups/fr-plm-treatment-detail.html` — the production log section. Match visually.

3. Card chrome: white, 0.5px border, 8px radius, 18-22px padding, 22px margin-bottom.

4. Header row:
   - Cormorant Garamond 17px "Production log" on left
   - Muted hint on right: "Append-only · every PO that used this atom"

5. Table:
   - 9 columns: PO · Date · Style · Units · Lot · Cost · Lead · Defect · Drift
   - Header row: 11px uppercase, 0.04em tracking, muted color, padding 6px 0
   - Data rows: 11.5px mono font, padding 9px 0, 0.5px top border `rgba(58,58,58,0.1)`
   - Right-align Units, Cost, Lead, Defect, Drift

6. For now, populate with **mock data** matching the mockup:
   ```
   #0024 · 2026-02 · AP-HD-STONE-01    · 320 · GO-2602-A · $3.80 · 12d · 0.3% · 3.1%
   #0019 · 2025-11 · AP-PA-STONE-01    · 260 · GO-2511-B · $3.85 · 13d · 0.4% · 4.8%
   #0014 · 2025-08 · AP-HD-STONE-01    · 420 · GO-2508-A · $4.00 · 14d · 0.8% · 9.2%
   #0009 · 2025-05 · AP-PA-ECARGO-10   · 240 · FB-2505-A · $4.20 · 16d · 1.1% · 12.4%
   ```

7. Color the Defect and Drift cells:
   - < 0.5% defect / < 5% drift: green `#3B6D11`
   - 0.5-1.0% / 5-10%: amber `#854F0B`
   - > 1.0% / > 10%: red `#A32D2D`

8. Wrap the data array in a function `getMockProductionLog(treatmentId)` for now. Chunk 18 will replace this with a real query.

## Acceptance

- Table renders below twin columns matching mockup.
- Color coding works for defect/drift cells.
- Mono font on data cells.

## Stop after

Commit message: `feat(plm): treatment builder production log with mock data`. Push. Done.
