# 07 · P2 · TreatmentBuilder — header + stat strip

Read `CLAUDE.md` first. Then do ONLY this task. Stop when done.

## Prereq
Chunk 06 merged. Mockup file `docs/mockups/fr-plm-treatment-detail.html` is in the repo.

## Goal
Build the TOP of the Treatment detail page only. Three sections — breadcrumb, header row, stat strip. Nothing below.

**This is the first of four chunks for the detail view.** Keep scope tight. Do not write the rest.

## Steps

1. Open `src/components/techpack/TreatmentBuilder.jsx`. Replace its empty stub.

2. Read `docs/mockups/fr-plm-treatment-detail.html`. Reference the breadcrumb, header, and stat strip sections only (roughly the first 40 lines of `<body>`). Match it visually.

3. Component receives a `treatmentId` prop (from the route). Loads via `getTreatment(id)`. If null, render a "Not found" message.

4. Section 1 — Breadcrumb:
   - 11px font, 0.08em letter-spacing, muted color
   - Format: `Library  /  Treatments  /  {treatment.name}`

5. Section 2 — Header row:
   - Left side: 64×64px colored swatch (base color) + name (Cormorant Garamond, 38px) + meta line beneath name showing `code · type · "Base: {colorName}" · vX.X` separated by middots
   - Right side: status pill (e.g. "Approved" — green bg `rgba(99,153,34,0.12)`, green text `#3B6D11`)
   - Bottom border separating from the rest of the page (0.5px `rgba(58,58,58,0.15)`)

6. Section 3 — Stat strip:
   - 4 cards in a row, 12px gap. Each card:
     - White, 0.5px border, 8px radius, 14×16px padding
     - Top label (10px, 0.08em tracking, muted, uppercase)
     - Big stat value in Cormorant Garamond ~26px
     - Bottom delta line (11px, colored: green `#3B6D11` good, amber `#854F0B` warn, red `#A32D2D` bad, muted gray neutral)
   - Cards: Units produced · Latest unit cost · Latest lead · Defect rate
   - Pull values from `getTreatmentRollups(id)`

7. **Stop here.** Below the stat strip, leave a comment: `{/* TODO: chunks 08-10 */}`.

## Acceptance

- Loading `#plm/library/treatments/:id` for an existing treatment renders breadcrumb, header, stat strip.
- Visually matches mockup top section.
- No errors.

## Stop after

Commit message: `feat(plm): treatment builder header and stat strip`. Push. Done.
