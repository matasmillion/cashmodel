# 02 · P1 · Add Library/Styles/Production top tabs

Read `CLAUDE.md` first. Then do ONLY this task. Stop when done.

## Prereq
Chunk 01 (vendor rename) is merged.

## Goal
Restructure `PLMView.jsx` from flat 4-tab layout into 3 top tabs with Library having 7 sub-tabs.

## Steps

1. In `src/components/techpack/PLMView.jsx`, add a wrapper nav with three top tabs:
   - **Library** (default)
   - **Styles**
   - **Production**

2. Inside the **Library** tab, add seven sub-tabs in order:
   Patterns · Fabrics · Colors · Trims · Treatments · Embellishments · Vendors

3. Mount existing components in their new locations:
   - `Library / Colors` → `ColorPaletteManager`
   - `Library / Trims` → `ComponentPackList` + `ComponentPackBuilder`
   - `Library / Vendors` → `VendorManager`
   - `Styles` (top tab) → `TechPackList` + `TechPackBuilder`

4. The other four Library sub-tabs (Patterns, Fabrics, Treatments, Embellishments) — render an empty placeholder card for now: "Coming in Phase 2." Stubs come in chunk 03.

5. **Production** top tab — render an empty state:
   - Title: "Production"
   - Copy: "Every PO snapshots a Style's BOM and writes actuals back to the Library. Coming in Phase 3."

## Design constraints

- Salt `#F5F0E8` background, Slate `#3A3A3A` text, Sand `#EBE5D5` accent.
- Active tab: Slate bg + Salt text, 6px radius. Inactive: ghost.
- Cormorant Garamond for headings, system sans for body.
- Cards: white, 0.5px border `rgba(58,58,58,0.15)`, 8px radius, 18-22px padding.

## Do NOT

- Modify `TechPackBuilder.jsx` or `ComponentPackBuilder.jsx`. Mount-only.

## Acceptance

- `/plm` shows 3 top tabs.
- Library has 7 sub-tabs, all render without error.
- Colors / Trims / Vendors render existing data unchanged.
- Styles tab shows existing tech packs unchanged.
- Production shows empty state.

## Stop after

Commit message: `feat(plm): add library/styles/production top-tab IA`. Push. Done.
