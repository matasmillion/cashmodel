# 15 · P3 · ProductionDetail — header + BOM snapshot

Read `CLAUDE.md` first. Then do ONLY this task. Stop when done.

## Prereq
Chunk 14 merged.

## Goal
Build the top half of the PO detail page: header, status stepper, BOM snapshot tree.

**This is the first of two chunks for the detail view.** Keep scope tight.

## Steps

1. Create `src/components/production/ProductionDetail.jsx`.

2. Component receives `poId` from the route. Loads via `getPO(id)`. If null, render "Not found".

3. **Breadcrumb**: `Production / {po.code}` — same style as Treatment breadcrumb.

4. **Header row**:
   - Left: PO code in Cormorant Garamond 38px + meta line below (style name, vendor name, units ordered, total cost actual if set)
   - Right: status pill (same colors as ProductionList)
   - Bottom border separating from rest of page

5. **Status stepper**:
   - Horizontal row of 6 pills: draft → placed → in_production → received → closed (cancelled hidden unless current state is cancelled)
   - Past states: Slate bg, Salt text
   - Current state: Sienna bg `#D4956A`, Salt text
   - Future states: muted bg
   - Connecting lines between pills (0.5px)
   - Below: action buttons depending on current state:
     - draft → "Place PO" (calls `transitionPO(id, 'placed')` — also triggers BOM snapshot, see chunk 17)
     - placed → "Mark in production" (`transitionPO(id, 'in_production')`)
     - in_production → "Mark received" (`transitionPO(id, 'received')`)
     - received → "Close PO" (`transitionPO(id, 'closed')` — triggers writeback, see chunk 17)

6. **BOM snapshot section**:
   - Card chrome: white, 0.5px border, 8px radius, 18-22px padding
   - Header: Cormorant 17px "BOM snapshot" / hint right-aligned: `Snapshotted {date} — immutable`
   - If no snapshot exists yet (PO is still draft): show "Snapshot will be taken on PO placement."
   - If snapshot exists: render a tree of atoms referenced. Each row:
     - Indent style (left padding 12px per nesting level)
     - Mono atom code in `ui-monospace`
     - Atom name in regular font
     - Right-aligned: small `v{version}` tag in muted color
     - Examples: `FB-CTN-007 · Heavy cotton twill · v1.0`, `TR-WSH-001 · Stone wash · v2.1`
   - Read-only. No editing.

7. **Stop here.** Below the BOM snapshot, leave `{/* TODO: chunk 16 */}`.

## Acceptance

- PO detail page renders breadcrumb, header, status stepper, BOM snapshot section.
- Action buttons appear based on current PO status.
- BOM snapshot section shows correct empty state for draft POs.

## Stop after

Commit message: `feat(plm): production detail header, stepper, bom snapshot`. Push. Done.
