# Inventory module — implementation plan

This is the execution plan for the Inventory module. Designed to be picked up
task by task by an agent (Sonnet 4.6 or similar). Every task is self-contained:
it lists the files to create/edit, the spec, the dependencies, and clear
acceptance criteria.

---

## Locked references

Before starting any task, read these:

1. **`docs/mockups/inventory-portal.html`** — the canonical visual spec.
   All 6 inventory tabs and the SKU drill-down are designed here. The mockup
   is the source of truth for layout, copy, spacing, and interaction. If a
   task description and the mockup conflict, the mockup wins. Tell the user.

2. **`fr-inventory-portal.tsx`** — visual language reference. Tokens and
   patterns extracted from this file informed the mockup. Use it for:
   - Color tokens (`BRAND` object, lines 5–22)
   - Typography (`serif`, `sans`, `mono` styles, lines 24–26)
   - Card pattern (4px radius, `BRAND.card` background `#FBF7EE`, 1px border)
   - Pill pattern (lines 96–111, tiny: 2px padding-y, 9–10px font, 2px radius)

3. **`CLAUDE.md`** — operating rules. Most relevant sections:
   - Folder structure (every feature in its own folder, one store per file)
   - Brand operating principles (**never discount**, **tracked vs untracked
     SKUs**) — these are hard rules, do not violate.
   - Append-only collections (`atom_usage`, `bom_snapshot`, etc.). Add
     `tracking_audit` to this list when Phase 1B ships.

4. **`src/utils/variantMappingStore.js`** — Phase 1A foundation. Already
   shipped. Joins Shopify variants to PLM styles via explicit mapping.

---

## Brand palette (use these exact values)

```
slate    #3A3A3A   primary text, structural lines
salt     #F5F0E8   page background
sand     #EBE5D5   accent surfaces (filter chips, hover)
card     #FBF7EE   warmer card background — NOT pure white
stone    #716F70   secondary text
soil     #9A816B   "Drop" tier label, secondary accent
sienna   #D4956A   the only "movement" accent — vs-prior deltas,
                   ad-projection elements, PO arrival markers
good     #6B8E6B   healthy state (muted green)
warn     #C8924A   restock-window state (muted amber)
bad      #A8543C   stockout / critical state (muted red)
sea      #B5C7D3   overstock state (muted blue)
```

Faded variants:
- `slate@0.60` — secondary text on cards
- `slate@0.10` — borders
- `slate@0.06` — soft dividers between rows in a card

Type scale:
- KPI value (the hero number on a card): Cormorant Garamond serif, 32px, weight 400
- Section title: Cormorant Garamond, 20px, weight 400
- Eyebrow label: Inter, 10px, 0.12em letter-spacing, uppercase, faded slate, weight 500
- Body: Inter, 12-13px
- Mono numerals + SKU codes: SF Mono, varies (9–13px)
- All numbers must use `font-variant-numeric: tabular-nums`

Card pattern (memorize):
```
background: var(--card);
border: 1px solid var(--line);
border-radius: 4px;
padding: 20px;
```

---

## Existing stack notes for the agent

- React + plain JavaScript (no TypeScript). Type with JSDoc only.
- Stores live in `src/utils/{thing}Store.js` — one file per data type. Pattern:
  localStorage primary, optional Supabase mirror behind a flag, CRUD + archive
  (no hard delete), auto-generated `code` field on create. Mirror
  `src/utils/techPackStore.js` and `src/utils/variantMappingStore.js`.
- Hash-based routing for internal PLM (`#plm/...`). Inventory will use
  `#inventory/...`. Vendor portal uses real session-based routes at `/vendor/*`
  and is a separate concern.
- Recharts for any chart (already used elsewhere — match conventions).
- No Zustand, no Redux, no TypeScript, no Zod.
- Supabase via `getAuthedSupabase()` for every cloud call.
- Append-only stores reject UPDATE and DELETE at the JS layer.

---

## Phases at a glance

| Phase | Theme                                  | User-visible? |
|-------|----------------------------------------|---------------|
| 1     | Data foundation                        | No            |
| 2     | Routing + Cockpit (the daily view)     | Yes — hero    |
| 3     | SKU detail                             | Yes           |
| 4     | Inventory tab + tracking system wiring | Yes           |
| 5     | Sell-Through · POs · Open-to-Buy tabs  | Yes           |
| 6     | Forecast tab                           | Yes           |
| 7     | Inventory agent + cleanup              | Yes           |

Each phase is independently shippable. After every phase the system is in a
working state — you can pause indefinitely between phases.

---

## PHASE 1 — Data foundation (no UI changes)

**Goal:** unify the PO concept and stand up the inventory read model. Nothing
visible to the operator changes.

### 1A — variantMappingStore + Supabase migration ✅ DONE

Already shipped in commit `87be6a3`. Files:
- `src/utils/variantMappingStore.js`
- Supabase migration creating `variant_mappings` table

### 1B — inventoryStore.js + tracking system

**Files to create:**
- `src/utils/inventoryStore.js`

**Spec:**

Build a read model that joins three things into a single per-SKU record:
1. Shopify on-hand (from existing Shopify integration — find it via
   `grep -r 'shopify' src/utils` to locate the current sync layer)
2. PLM style + variant (from existing `techPackStore.js`)
3. Explicit variant mapping (from `variantMappingStore.js`)

Plus the new tracked flag.

Schema (JSDoc typedef):
```js
/**
 * @typedef {Object} InventorySku
 * @property {string} sku                 // 'AP-HD-BBHOOD-25-1-SLATE-L'
 * @property {string} style_id            // PLM style code
 * @property {string} variant_id          // Shopify variant ID
 * @property {string} style_name          // 'Borderless Basic Hoodie'
 * @property {string} color
 * @property {string} size
 * @property {string} cat                 // 'Hoodies'
 * @property {'Staple'|'Drop'} tier
 * @property {number} on_hand             // sum across locations
 * @property {{[loc: string]: number}} on_hand_by_location
 * @property {number} on_order            // sum from open POs
 * @property {number} allocated           // unfulfilled order qty
 * @property {number} cost                // landed unit cost
 * @property {number} retail
 * @property {number} sold_4w
 * @property {number} sold_12w
 * @property {boolean} tracked            // ★ / ☆
 * @property {string} first_received      // ISO date
 */
```

Key methods (mirror techPackStore patterns):
- `list()` — returns `InventorySku[]`
- `get(sku)` — returns `InventorySku | null`
- `setTracked(sku, tracked)` — toggles flag, appends to `tracking_audit`
- `listTracked()` — `list().filter(s => s.tracked)`
- `listUntracked()` — `list().filter(s => !s.tracked)`

**Defaults for `tracked`:**
- Staples: `tracked = true` (tracked by default)
- Drops: `tracked = false` (untracked by default — drops are sell-out plans)

Add `tracking_audit` to the append-only list at the JS layer. Each record:
```js
{ at: ISO, sku, prev: bool, next: bool, actor: 'system' | email }
```

**Supabase migration:**

```sql
create table inventory_tracking (
  sku text primary key,
  tracked boolean not null default true,
  updated_at timestamptz not null default now()
);

create table tracking_audit (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  prev boolean not null,
  next boolean not null,
  actor text not null,
  at timestamptz not null default now()
);
-- append-only — no update / delete grants
```

**Acceptance:**
- `inventoryStore.list()` returns a non-empty array in the dev env
- Star toggle persists across page reload (localStorage primary)
- `tracking_audit` records every toggle
- Update/delete on `tracking_audit` is rejected at the JS store layer

### 1C — VariantMapper.jsx (backfill UI)

**Files to create:**
- `src/components/techpack/VariantMapper.jsx`
- Add hash route `#plm/library/variant-mapping` to `plmRouting.js`
- Add nav link in PLM library sidebar

**Spec:**

A one-time-use UI for the operator to review and confirm fuzzy-match variant
mappings created by `poAllocations.js`. Show every mapping where `source ===
'auto-fuzzy'` and `confidence < 0.95`. For each row:
- Left: PLM style + variant options
- Right: matched Shopify variant + confidence score
- Action: [Confirm] (sets source='manual', confidence=1.0) / [Reject] (archives mapping, prompts for correct match)

This is plumbing — keep visual treatment minimal but consistent (4px cards,
brand palette, etc.).

**Acceptance:**
- Operator can see every fuzzy-match mapping in the system
- Confirm/Reject actions persist via `variantMappingStore`
- Page accessible at `#plm/library/variant-mapping`

### 1D — poAllocations migration

**Files to edit:**
- `src/utils/poAllocations.js` (find via grep)

**Spec:**

Currently this file does fuzzy string matching on PO line items to find the
Shopify variant. Migrate to:
1. First check `variantMappingStore.getByStyle(style_id, options)` — if a
   confirmed mapping exists, use it.
2. Fall back to fuzzy match — but log a warning to `console.warn` AND write a
   record into `variantMappingStore` with `source='auto-fuzzy'`,
   `confidence=<computed>`. The operator will review later via 1C.

**Acceptance:**
- Existing PO allocation tests still pass
- New PO line items flow through explicit mapping first, fuzzy fallback second
- Every fuzzy fallback produces a `variantMappingStore` record for review

### 1E – 1H — productionStore PO unification

**Files to edit / migrate:**
- `src/utils/productionStore.js` — extend the PO schema
- `src/components/production/POBuilder.jsx` — write to productionStore
- `src/components/production/POSchedule.jsx` — read from productionStore
- `src/components/production/Cashflow58Week.jsx` — read from productionStore
- `src/AppContext.js` (or wherever it lives) — drop `manualPOs` / `autoPOs`

**Spec:**

Currently the codebase has two parallel PO concepts:
- `manualPOs` / `autoPOs` in AppContext (used by POBuilder, POSchedule, Cashflow58Week)
- `productionStore` (used by PLM Production list)

Unify into one. Extend `productionStore.PO` with:
```js
{
  payment_schedule: [
    { milestone: 'deposit', percent: 30, paid_at: ISO|null, due: ISO },
    { milestone: 'mid',     percent: 40, paid_at: ISO|null, due: ISO },
    { milestone: 'final',   percent: 30, paid_at: ISO|null, due: ISO },
  ],
  expected_landing: ISO,    // already exists, ensure populated
  status: 'draft' | 'placed' | 'in_production' | 'received' | 'closed',
}
```

Migration order (do these as separate commits — don't try to do all four in one):
1E. Extend productionStore schema + write a one-time migration shim that
    pulls existing manualPOs/autoPOs into productionStore on app load
1F. Migrate POBuilder.jsx → write to productionStore (drop the ADD_PO dispatch)
1G. Migrate POSchedule.jsx + Cashflow58Week → read from productionStore
1H. Delete `manualPOs` and `autoPOs` from AppContext. Delete the migration
    shim from 1E (one-time job is done).

**Acceptance:**
- Cashflow visual identical before/after migration (within rounding)
- POSchedule list shows the same POs
- New PO creation via POBuilder writes to productionStore only
- AppContext no longer has manualPOs/autoPOs after 1H

---

## PHASE 2 — Routing + Cockpit

**Goal:** the operator's daily morning view. Operator opens the app, sees the
multi-SKU stockout calendar, scans the urgent reorders, takes action.

### 2A — Routing + nav

**Files to create:**
- `src/utils/inventoryRouting.js` (mirror `plmRouting.js`)

**Files to edit:**
- The top bar component (find via grep `Cash.*Marketing.*Product`)

**Spec:**

Hash routes (must match the mockup exactly):
- `#inventory/cockpit` — landing
- `#inventory/inventory` — SKU master table
- `#inventory/sell-through` — velocity matrix
- `#inventory/otb` — quarterly OTB plan
- `#inventory/pos` — PO list
- `#inventory/forecast` — forward 12 months
- `#inventory/sku/<sku>` — SKU drill-down

Add "Inventory" as a top-bar peer alongside Cash · Marketing · Product · Operations. Hover reveals a dropdown listing the 6 sub-tabs (see mockup `<div class="dropdown">` block).

In-page sub-tab nav: a horizontal strip of tabs visible on every inventory page (see mockup `<nav class="subtabs">`). Active tab gets slate background + salt text + 6px radius. Inactive is ghost.

**Acceptance:**
- All 6 inventory hash routes resolve to a placeholder page
- Top-bar dropdown works on hover
- In-page sub-tabs work for navigation
- Old routes (e.g. `#sell-through`) redirect to new routes

### 2B — InventoryCockpit.jsx (page shell + KPIs)

**Files to create:**
- `src/components/inventory/InventoryCockpit.jsx`

**Spec:**

The Cockpit page composes 5 sections in this exact vertical order:
1. KPI tiles row (this task)
2. Multi-SKU calendar (task 2C)
3. Urgent reorders + Inventory health (task 2D)
4. Revenue trend + Category performance (task 2E)

For this task, build the KPI tiles row only. 4 tiles, equal-width grid:
- **Inventory at cost** — sum of `on_hand × cost` across tracked SKUs.
  Display: `$3.42M`, sub `$11.8M at retail`, sienna delta `↗ 4.2% vs prior`,
  faint sparkline at right edge.
- **Sell-through 12W** — `sold_12w / (on_hand + sold_12w + allocated)` brand-wide.
  Display: `54.5%`, sub `$165k sold-thru`, good-green delta.
- **Forward WOS (ad-adj)** — brand-wide weeks of supply at projected demand.
  Apply the lift multiplier from the Forecast assumption. Display: `9.2w`,
  warn-amber delta `↘ 1.4w vs trailing`.
- **GMROI (annualized)** — `(annual_revenue × gross_margin) / avg_inventory_at_cost`.
  Display: `3.2×`, sub `Target 2.5–4.0×`, good-green delta.

Every KPI eyebrow gets a hover-explain tooltip (the ⓘ glyph pattern). Reference
the mockup's `.explain` and `.tip` styles. Tooltip shows the formula in mono
font + 2-3 input rows + a one-line source note.

**Acceptance:**
- Tiles render with real data from `inventoryStore`
- Hover tooltips work and show formula + inputs
- Sparklines render (Recharts mini-line chart, height 24px)
- Visual matches mockup KPI tile pattern exactly (4px card, 32px serif value)

### 2C — CockpitCalendar.jsx (the hero)

**Files to create:**
- `src/components/inventory/CockpitCalendar.jsx`
- `src/components/inventory/CalendarStrip.jsx` (reusable cell strip — used here and on SKU detail)
- `src/components/inventory/CalendarTooltip.jsx` (the date hover tooltip)

**Spec:**

Multi-row 12-month projected daily cover, top 6 best-selling tracked products
(blended across variants when in by-product mode). Reference the mockup
section under `<!-- Multi-SKU stockout calendar -->`.

Layout requirements:
- Card with eyebrow "Inventory cover" only (no large title — see latest commit `e0e3bab`)
- Filter chips: `By SKU | By product` (default `By product`) and a select for "Top 6 by 90d revenue"
- Single horizontal scroller containing:
  - Two header rows: month labels (positioned absolutely) + week numbers
  - 6 SKU/product rows, each with a sticky-left label and a day-cell strip
- Cell sizing (compact mode): 7px wide × 13px tall, 0px gap within week, 3px gap between weeks. Each week column = 49px, week pitch = 52px.
- Legend at bottom: Healthy / Restock window / Stockout / PO arrival / Today
- No footer text about tracked-only behavior (the rule lives in CLAUDE.md and is implicit in the star icon)

Per-row rendering:
- Star icon (filled, sienna — every row here is tracked because this calendar is tracked-only)
- Product name (or SKU when in by-SKU mode) — single line, no sub-line
- FWOS value — mono font, bad-red color when below lead-time threshold
- Day-cell strip — 52 weeks of cells, color-coded by daily projected cover state

Day-cell coloring math (compute in a pure function `coverState(sku, dayIdx, planAssumption)`):
```
remaining(d) = onHand − Σ velocity·d (with lift) + Σ POs landed by d
state(d) =
  remaining(d) <= 0                   → 'Stockout'   (red)
  remaining(d) / velocity < lead+safety → 'Restock window' (amber)
  otherwise                            → 'Healthy'   (green)
PO arrival on day d                  → outline cell in sienna
day === 0                             → outline cell in slate (today)
```

By-product mode blends variants:
- Sum on-hand and on-order across the product's tracked variants
- Use weighted-average velocity (weighted by sold_12w)
- Earliest stockout day across variants drives the product's stockout state for that day
- This is the "best math" the user asked for — keep it simple and document it in the function header

Hover tooltip — see CalendarTooltip. Single floating element, follows the cursor.
Anchor: today is May 9, 2026 in the mockup; in production, `new Date()`.
Format: big serif date (e.g. `May 10`) on top, small uppercase day-of-week +
state line below (e.g. `Monday · Healthy` or `Tuesday · Stockout · PO arrives`).

**Acceptance:**
- Calendar renders 6 rows × 52 weeks per row
- Filter chip toggles between SKU and Product modes (different row content)
- Hover any cell shows the floating date tooltip
- Click any row navigates to `#inventory/sku/<sku>` (or for by-product mode, to the highest-revenue variant)
- Untracked SKUs are NEVER shown here, regardless of revenue
- Untracked SKUs do NOT trigger any Slack alerts from this component

### 2D — UrgentReorders.jsx + InventoryHealth.jsx

**Files to create:**
- `src/components/inventory/UrgentReorders.jsx`
- `src/components/inventory/InventoryHealth.jsx`

**Spec:**

Sit side by side under the calendar in a 2fr / 1fr grid.

UrgentReorders:
- Eyebrow "Action required" + title "Urgent reorders (N)"
- Right-side link "Generate POs →" (drafts a productionStore PO for each row using size-curve allocation)
- Each row: small swatch · style + sku code · on-hand value · weeks value · status pill
- Sort: WOS ascending (most urgent first)
- Show top 6 rows
- **Excludes untracked SKUs**
- Click a row → SKU detail

InventoryHealth:
- Eyebrow "Inventory health · tracked only"
- 6 bucket counts (Stockout / Critical / Reorder Now / Reorder Soon / Healthy / Overstock) — small dot + label + count
- Plus a 7th muted row: "Untracked" with the count of untracked SKUs (so the operator can see they exist without the system pestering about them)

**Acceptance:**
- Both components render at proper widths in a 2fr/1fr grid
- Untracked SKUs counted in InventoryHealth's "Untracked" row only
- UrgentReorders has zero rows for untracked SKUs even if they're red
- Generating a PO from "Generate POs →" creates a draft in productionStore
  with size-curve-allocated quantities

### 2E — Revenue trend + Category performance

**Files to create:**
- `src/components/inventory/RevenueTrend.jsx`
- `src/components/inventory/CategoryPerformance.jsx`

**Spec:**

Bottom row of the cockpit, 2fr / 1fr.

RevenueTrend: a 12-week revenue line chart with units overlay (Recharts
ComposedChart). Slate area fill under revenue, sienna line for units.
Reference the mockup's SVG for shape and styling.

CategoryPerformance: bar list — for each top-level category (Hoodies,
Sweatpants, Cargos, Tees, Accessories, Outerwear), show:
- Name
- Total $ revenue 12W (right-aligned)
- Filled bar showing sell-thru %
- "X% sell-thru" label below

**Acceptance:**
- Both render at proper widths
- Numbers reflect tracked-only state (untracked excluded from category totals)
- Visuals match mockup

---

## PHASE 3 — SKU detail

**Goal:** the per-SKU drill-down. Click any row from Cockpit, Inventory,
Sell-Through, or PO breakdown → land here. Operator can see when this SKU
stocks out, when POs land, and draft a chase if needed.

### 3A — SkuDetail.jsx

**Files to create:**
- `src/components/inventory/SkuDetail.jsx`

**Spec:**

Page composition (top to bottom, no extra cards):
1. Breadcrumb: `Inventory / <product> · <color> · <size>`
2. Identity row: large product name + SKU code + 4 quick-stat tiles right-aligned.
   - QS tiles: On hand · FWOS · Velocity · On order
   - **NO Shopify GID, NO vendor/class/last-received meta line.** Those are backend-only details, available to the inventory agent later.
3. Decision strip (only if action needed) — single line headline + action
   buttons (Hold · Pause reorder · Air-freight Nu →). **No paragraph.**
4. The 12-month calendar — single full-width strip (the same `CalendarStrip`
   component from 2C, but in default size mode 12px cells × 12px). Just the
   chart + legend. **No eyebrow, no subtitle.**
5. PO cards row — 3 cards: existing POs + Suggested chase
   - Each card: PO code (or "Suggested chase") · landing date · units +
     days-of-cover added · status pill
   - **NO `+17d`/`+88d` lead-time inline indicators, NO vendor name, NO
     payment-schedule details.** Just landing date and impact.

Things explicitly NOT on this page (per locked spec, commit `e0e3bab`):
- Sales velocity matrix card
- Inventory by location card
- PLM ↔ Shopify mapping card
- Mapping history card

Those details live in `inventoryStore` and will be queryable through the
inventory agent (Phase 7A) when the operator asks.

**Acceptance:**
- Navigating to `#inventory/sku/<sku>` renders this page
- Calendar shows the SKU's 12-month projected cover
- "Air-freight Nu →" suggests a sized bridge quantity with a one-click draft
- "Draft chase →" creates a productionStore PO sized to ad-adjusted velocity
  × (lead time + safety) × size curve for that style

### 3B — SkuCalendar wrapper

**Files to edit:**
- `src/components/inventory/SkuDetail.jsx` — render `<CalendarStrip mode="default" data={...} />`

**Spec:**

Reuse the `CalendarStrip` component from Phase 2C. Pass it a `mode="default"`
prop that uses 12px × 12px cells (vs the cockpit's 7px × 13px compact mode).

Same hover tooltip, same color logic, same legend. The component handles both
modes via the `mode` prop. Don't fork.

**Acceptance:**
- Single CalendarStrip component used in both cockpit (compact) and SKU detail (default)
- Mode prop drives sizing only — math and tooltip are identical

### 3C — Chase draft flow

**Files to edit:**
- `src/components/inventory/SkuDetail.jsx`

**Spec:**

"Draft chase →" button on the Suggested chase card opens a modal pre-filling a
productionStore PO with:
- Style: this SKU's parent style
- Color: this SKU's color
- Size curve: brand default (or per-style override if defined)
- Total qty: sized to cover (lead_time + safety) weeks at ad-adjusted velocity
- Vendor: the most-recent vendor for this style (from productionStore history)
- Expected landing: today + lead_time

Operator reviews, edits if needed, clicks Save. PO is created in
productionStore with status `draft`.

**Acceptance:**
- Clicking Draft chase opens the PO builder modal
- Modal is pre-filled with the right qty + size curve + vendor
- Saving creates a draft PO that appears on the POs tab

---

## PHASE 4 — Inventory tab + tracking system wiring

**Goal:** the SKU master ledger view + wire the star toggle everywhere it matters.

### 4A — InventoryTable.jsx

**Files to create:**
- `src/components/inventory/InventoryTable.jsx`

**Spec:**

Reference the mockup's "Inventory" tab structure exactly. Specifically:

Filter chip strip:
- All (count) · ★ Tracked (count) · ☆ Untracked (count) · | divider |
- Critical · Stockout · Reorder · Healthy · Overstock
- Right side: sort selector (default: WOS ascending)

Table columns (in order):
1. Star toggle (★ filled sienna / ☆ hollow stone)
2. Swatch (22×28px)
3. Style / SKU (style name + sku code mono small below)
4. Tier (Staple / Drop — "Staple" is slate, "Drop" is soil)
5. Color / Size
6. On Hand (mono, right-aligned)
7. On Order (mono, right-aligned, faded if 0)
8. Vel/wk (mono)
9. WOS (mono, bad-red bold when below lead time)
10. Sell-Thru (mono)
11. GMROI (mono)
12. Status (pill)

Rows for untracked SKUs render at 0.45 opacity. Their status pill shows
"Untracked" instead of the actual state (overstock/critical/etc.).

Click a row → `#inventory/sku/<sku>`.
Click the star → toggle tracked, persist to inventoryStore + tracking_audit.

**Acceptance:**
- Table renders all SKUs from inventoryStore
- All filter chips work
- All column sorts work
- Star toggle persists across reload
- Untracked rows visibly faded but still clickable

### 4B — Star toggle wiring

**Files to edit:**
- `src/components/inventory/CockpitCalendar.jsx` — read `tracked` flag
- `src/components/inventory/UrgentReorders.jsx` — filter to tracked only
- `src/components/inventory/InventoryHealth.jsx` — count tracked + show untracked total
- `src/components/inventory/InventoryTable.jsx` — render star, wire toggle

**Spec:**

Every consumer of inventoryStore filters by `tracked` according to its
contract:
- Cockpit calendar: tracked only
- Urgent reorders: tracked only
- Inventory health: tracked counts + a separate "Untracked" total
- Inventory table: shows both, with untracked faded
- Sell-through tab: tracked only by default, with a toggle to show untracked
- Forecast bridge chart: tracked only

**Acceptance:**
- Toggling a star anywhere updates everywhere within one frame
- Toggling never causes a re-render of components that don't depend on the changed SKU

### 4C — Slack alert filtering

**Files to edit:**
- The Slack alert dispatcher (find via `grep -r 'slack' src/`)

**Spec:**

Wherever the system sends a Slack alert about a SKU (low cover, stockout,
ad-spend-driven demand spike, etc.), check `inventoryStore.get(sku).tracked`
first. If untracked, suppress the alert.

Add a unit test: feed a stockout event for an untracked SKU, assert no Slack
call was made.

**Acceptance:**
- Untracked SKU stockout produces zero Slack messages
- Tracked SKU stockout still produces the alert

---

## PHASE 5 — Sell-Through · POs · Open-to-Buy tabs

**Goal:** absorb existing pages into the inventory module structure, add OTB.

### 5A — Sell-Through tab

**Files to create:**
- `src/components/inventory/InventorySellThrough.jsx`

**Files to edit:**
- Existing standalone Sell-Through page → keep file but update to redirect
  `#sell-through` → `#inventory/sell-through`

**Spec:**

Reference the mockup's Sell-Through tab. Velocity matrix table:
- Columns: Swatch · Style/SKU · On Hand · 7d · 14d · 30d · 90d · FWOS (ad-adj) · Status
- Click any row → SKU detail
- Tracked-only by default. Toggle in filter strip to show untracked.

**Acceptance:**
- Same velocity data as the existing standalone Sell-Through page
- Old `#sell-through` redirects to new location
- Visual matches mockup

### 5B — Purchase Orders tab

**Files to create:**
- `src/components/inventory/InventoryPOs.jsx`

**Spec:**

PO list reading from productionStore. Filter chips by status (All / Draft /
Placed / In production / Received / Closed). Right-side button: `+ New PO`
opens the same builder used in 1F.

Columns: PO code · Vendor · Style · Units · Cost · Placed date · Lands date · Status pill.

Click a PO row → PO detail (existing PLM Production list detail page works fine here).

**Acceptance:**
- All POs from productionStore appear
- Filters work
- New PO button opens the unified builder

### 5C — Open-to-Buy tab

**Files to create:**
- `src/utils/otbStore.js`
- `src/components/inventory/InventoryOTB.jsx`

**Spec:**

`otbStore.js` holds a per-quarter, per-class plan:
```js
{ quarter: 'Q2-2026', class: 'Hoodies', planned_receipts: 320000 }
```

InventoryOTB renders a grid of class × quarter showing planned vs committed
vs remaining. Committed = sum of productionStore POs landing in that quarter
× cost. Negative remaining = overcommitted, color cell red.

Operator can edit planned values inline. Each PO placement debits OTB.
Overcommit on any class surfaces as a warning chip on the cockpit.

**Acceptance:**
- Grid renders with the right columns
- Editing a planned value persists to otbStore
- Committed values match productionStore + landing dates
- Overcommit warning surfaces on cockpit

---

## PHASE 6 — Forecast tab

**Goal:** the forward-looking view. Bridge chart, modular Assumptions strip,
brand-wide stockout calendar.

### 6A — Modular Assumptions strip

**Files to create:**
- `src/utils/forecastAssumptionsStore.js`
- `src/components/inventory/AssumptionsStrip.jsx`

**Spec:**

4-cell horizontal strip (matches mockup `<div class="assumptions">`):
1. Planned daily ad spend — editable input (e.g. `$11,500/d`)
2. Planned MER — editable input (e.g. `3.0×`)
3. Planned daily revenue — derived from spend × MER (read-only, mono)
4. Demand lift applied — derived from planned-rev / trailing-rev, in sienna (read-only)

Each cell has an "anchor" line below showing the trailing 7-day actual
(`Last 7d $10,000`).

The lift multiplier propagates to: cockpit FWOS, urgent reorders sizing,
chase qty suggestions, OTB consumption, bridge chart, calendar projections.

**Acceptance:**
- Editing spend or MER updates derived rev + lift instantly
- Lift propagates to all consumers
- Values persist to forecastAssumptionsStore

### 6B — BridgeChart

**Files to create:**
- `src/components/inventory/BridgeChart.jsx`

**Spec:**

Recharts ComposedChart (16-week horizon by default):
- Slate area: brand-wide on-hand projection
- Stone dashed line: trailing-velocity demand
- Sienna solid line: ad-adjusted demand
- Sienna circle markers on PO landing weeks
- Bad-red dot at the crossover point (where on-hand crosses zero)

Label the crossover with "Crossover · W<n>" small text near the dot.

Reference the mockup's bridge SVG for proportions and color.

**Acceptance:**
- Chart renders with real data from inventoryStore + productionStore + assumptions
- Tooltip on hover shows the underlying numbers per week
- Crossover marker positioned correctly

### 6C — Forecast calendar (top 20 by revenue)

**Spec:**

Reuse `CockpitCalendar` component but in default-size mode (12px cells) and
top-20 instead of top-6. SKU search filter at the top to drill into a single
SKU's row.

**Acceptance:**
- Same component, different config
- SKU search filter works (typing collapses the list to matching SKUs)

### 6D — forecastStore + sprint-store integration

**Files to create:**
- `src/utils/forecastStore.js` (append-only)

**Files to edit:**
- `src/components/creative/sprintStore.js` — add a `getPlannedSpendByWeek()` reader

**Spec:**

`forecastStore` holds append-only snapshots of weekly demand projections per
SKU per week. Each snapshot has a `version` (timestamp) so we can back-test
forecast accuracy later.

The Assumptions strip's spend value defaults to `sprintStore.getPlannedSpendByWeek()`
when a sprint is active. Operator can override per-week.

Add `forecast_snapshots` to the append-only list at the JS layer.

**Acceptance:**
- Daily cron creates a new forecast snapshot
- Old snapshots are preserved (append-only)
- Sprint planned spend feeds the assumption strip when present

---

## PHASE 7 — Inventory agent + cleanup

**Goal:** the inventory agent — Claude API endpoint that answers detail
queries we removed from the UI. Plus retire legacy pages.

### 7A — Inventory agent

**Files to create:**
- `src/components/inventory/InventoryAgentChat.jsx`
- `src/utils/inventoryAgent.js` (Claude API client)

**Spec:**

Floating chat panel accessible from any inventory tab. Operator types a
question; agent has read-only access to:
- inventoryStore
- productionStore
- variantMappingStore
- otbStore
- forecastStore

Agent answers questions like:
- "Show me velocity by location for AP-HD-BBHOOD-25-1-SLATE-L"
- "What's the mapping history for this SKU?"
- "Which vendors have the longest lead times in our hoodie program?"
- "When was this SKU last received?"

**Important:** the agent must call into the stores via well-defined methods
(no raw SQL), so the surface remains controlled.

Use prompt caching on the system prompt + store schema. See `claude-api`
skill for guidance.

**Acceptance:**
- Operator can ask any of the example questions and get a useful answer
- Agent never modifies any store
- Prompt caching is on
- Latency is reasonable (under 3s for typical question)

### 7B + 7C — Retire legacy pages

**Files to delete:**
- The old standalone Sell-Through page (after grace period — keep the redirect)
- The old standalone POSchedule page
- The old standalone New PO page

**Spec:** delete the files, remove the routes, ensure all in-bound links from
the rest of the app go through the inventory tab structure.

**Acceptance:**
- No dead routes
- Old hash routes still redirect (don't 404)
- No broken links in tests

### 7D — Documentation pass

**Files to edit:**
- `CLAUDE.md` — add an "Inventory Module Conventions" section after the
  Creative Module Conventions section. Mirror the structure: Stack, Palette,
  Hash grammar, Append-only enforcement, Design reference, Brand operating
  principles (link back to existing rules).
- Add changelog entry.

**Acceptance:**
- A future agent can read CLAUDE.md and understand the inventory module's
  shape, conventions, and where to find the design reference.

---

## How to execute this plan

1. **One phase at a time.** Don't skip ahead. Don't combine.
2. **One task per commit.** Each task above maps to one focused commit. Use
   the task name in the commit message: `inventory: 2C — CockpitCalendar
   (multi-SKU 12-month projected cover)`.
3. **Mockup is the source of truth.** Before any UI task, open
   `docs/mockups/inventory-portal.html` in a browser and study the section
   you're implementing.
4. **Use existing patterns.** Read `src/utils/techPackStore.js` before
   creating any new store. Read `src/components/techpack/TechPackBuilder.jsx`
   before any complex form work.
5. **Resist scope creep.** If you find yourself adding helpers, abstractions,
   or "while I'm here" cleanups — stop. Ship the focused change. The
   never-discount + tracked-vs-untracked rules are absolute; everything else
   is mockup-conformant.
6. **Ask before deviating.** If the spec and the mockup conflict, the mockup
   wins. If the mockup and CLAUDE.md conflict, CLAUDE.md wins. If you're not
   sure, ask the user.
7. **Test the visual.** For UI tasks, open the running app in a browser and
   compare to the mockup. Don't ship a UI task without confirming the visual
   matches.
