# 06 · P2 · TreatmentList card grid

Read `CLAUDE.md` first. Then do ONLY this task. Stop when done.

## Prereq
Chunk 05 merged.

## Goal
Replace the empty stub in `TreatmentList.jsx` with a working card grid.

## Steps

1. Open `src/components/techpack/TreatmentList.jsx`. Replace its current content.

2. Header section:
   - Title (Cormorant Garamond, ~26px): "Treatment library"
   - Subline (~12px, muted): "Every wash, dye, and finish stored as a reusable recipe. Test once, reference forever."
   - "+ Add treatment" button bottom-left of the grid area.

3. Grid: 3 columns, 14px gap. Each card:
   - Top: 54px tall colored band — the base color swatch (lookup `base_color_id` against `colorLibrary`).
   - Bottom (padding 14px):
     - Treatment name in Cormorant Garamond, ~18px
     - Six stat rows in a 60px / 1fr grid, ~11px font, line-height 1.3:
       - House → vendor name (lookup `primary_vendor_id` via `resolveVendor`)
       - Chemistry → first 30 chars of `chemistry` field, then `…`
       - Cost → `$X.XX / unit` from `getTreatmentRollups(id).latest_cost_usd`
       - Lead → `X days` from rollups
       - Since → "Mon YYYY" of `created_at`
       - Run → `X,XXX units` from `getTreatmentRollups(id).units_produced`
   - Card chrome: white, 0.5px border `rgba(58,58,58,0.15)`, 8px radius, hover state with subtle shadow.

4. Empty state (when `listTreatments()` returns `[]`):
   - Centered card: "No treatments yet — every wash, dye, and finish you test becomes a permanent library asset."
   - "+ Add treatment" CTA inside the empty state.

5. Clicking a card navigates to that treatment's detail view (route: `#plm/library/treatments/:id`). The detail view itself is built across chunks 07-10. For now, navigation just sets the hash — the detail page can render an empty placeholder until chunk 07.

6. Clicking "+ Add treatment" calls `createTreatment({})` with sensible defaults and navigates to the new record's detail view.

## Design constraints

- Don't use bright colors. Don't use emojis.
- Mono font (`ui-monospace`) for any IDs you display.
- Filter `listTreatments()` to `status !== 'archived'` by default.

## Acceptance

- Empty library shows the empty state.
- Adding via console shows the card.
- Click a card → URL hash updates to `#plm/library/treatments/:id`.

## Stop after

Commit message: `feat(plm): treatment list card grid`. Push. Done.
