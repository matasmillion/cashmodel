# 14 · P3 · ProductionList table

Read `CLAUDE.md` first. Then do ONLY this task. Stop when done.

## Prereq
Chunk 13 merged.

## Goal
Build the Production tab's main view — table of POs.

## Steps

1. Create `src/components/production/` directory.

2. Create `src/components/production/ProductionList.jsx`.

3. Page layout:
   - Title: Cormorant Garamond ~26px "Production"
   - Subline: "Every PO snapshots a Style's BOM and writes actuals back to the Library."
   - "+ New PO" button top-right of the table (Slate bg, Salt text)

4. Table:
   - 8 columns: Code · Style · Vendor · Units · Status · Placed · Closed · Total cost
   - Header: 11px uppercase, 0.04em tracking, muted, 0.5px bottom border
   - Rows: 12px font, padding 11px 0, mono for Code, 0.5px bottom border between rows

5. Status pills:
   - 5px radius, 11px font, 0.06em tracking, padding 5×12px
   - Colors: draft = gray bg `rgba(58,58,58,0.08)` / Slate text · placed = Sand `#EBE5D5` · in_production = Soil `#9A816B` (light tint, dark text) · received = Sea `#B5C7D3` · closed = green `rgba(99,153,34,0.12)` / `#3B6D11` · cancelled = muted

6. Empty state: "No POs yet. Create one to start the production loop."

7. Click a row → navigate to `#plm/production/:poId`. Detail comes in chunks 15-16.

8. "+ New PO" button → opens a modal or navigates to `#plm/production/new`. Modal flow:
   - Pick a Style (dropdown of `listTechPacks()`)
   - Pick a Vendor (dropdown of `listVendors()`)
   - Units ordered (number input)
   - Notes (textarea, optional)
   - Submit → calls `createPO({...})`, navigates to the new PO's detail page

9. Mount `ProductionList` under the Production top tab. Replace the empty state from chunk 02.

## Acceptance

- Production tab now shows the list (or empty state if no POs).
- "+ New PO" creates a draft PO and navigates to its detail.
- Status pills color correctly.

## Stop after

Commit message: `feat(plm): production list with new PO modal`. Push. Done.
