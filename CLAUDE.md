# Cash Model — operating conventions for Claude Code

This file is the operating manual for any AI agent (Claude Code, Cursor, Copilot, etc.) working on this repo. Read it at the start of every session. Follow it strictly. Update it when conventions evolve.

---

## Operator context (read first)

This repo is an internal ERP for Foreign Resource, run by a single **non-technical operator** who directs all work through Claude Code and cannot read code. This is a permanent fact about how the repo is built, not a temporary state.

**Explain everything like you're explaining it to a dumb 8 year old.** Every change, every diagnosis, every plan — no jargon, no code-speak, short words and plain analogies. When you reference a file or function, say in one plain sentence what it does and why it matters. Never assume the operator can read the code on the screen.

Always explain in plain English what you're about to do and why, and wait for approval, before writing code.

---

## Folder structure (strict)

Every feature lives in its own folder. New features create new folders. Never put feature code into an unrelated folder because "it was nearby."

- `src/components/techpack/` — PLM library atoms (patterns, fabrics, colors, trims, treatments, embellishments, vendors) and the style builder.
- `src/components/production/` — POs, BOM snapshots, atom usage logs, drift logs.
- `src/components/collab/` — comments, approvals, notifications, DAM.
- `src/components/vendor/` — vendor-facing portal (auth-scoped, never exposes internal cost data).
- `src/components/marketing/` — Meta ads, creator pipelines (future).
- `src/utils/` — shared stores and helpers. **One file per library.**
- `src/types/` — JSDoc typedefs shared across modules.
- `src/i18n/` — translation files (en, zh-CN, future locales).
- `docs/mockups/` — HTML pixel-level specs for UI work.

---

## Module boundaries (strict)

A component in `vendor/` MUST NOT import from `production/` directly. Cross-module communication goes through stores in `src/utils/` only.

If you find yourself wanting to import across folders, stop and flag it.

---

## Stores

Every data type has exactly one store file: `src/utils/{thing}Store.js`.

Mirror the pattern in `src/utils/techPackStore.js`:
- localStorage primary
- Optional Supabase mirror behind a flag
- CRUD + archive (no hard delete)
- Auto-generated `code` field on create

Never create a parallel store for the same data. If a store needs more capability, extend the existing one.

---

## Naming

- Files: PascalCase for components (`TreatmentBuilder.jsx`), camelCase for utils (`treatmentStore.js`).
- IDs: prefix-based, uppercase, hyphenated. Examples:
  - Atoms: `TR-WSH-001`, `PT-HD-001`, `FB-CTN-007`
  - Styles: `AP-HD-STONE-01`
  - POs: `PO-2026-0024`
  - Vendor lots: `GO-2602-A`
- Foreign keys: `{thing}_id` not `{thing}Id` (snake_case for DB-shaped fields).
- React props and JS variables: camelCase.

---

## Before adding anything new

1. Check if a similar utility already exists in `src/utils/`. Don't duplicate.
2. Check if the type is already defined in `src/types/atoms.js`. Don't redefine.
3. If replacing old behavior, DELETE the old code in the same commit. Never leave parallel implementations "just in case."
4. If a task seems to require deleting or refactoring `TechPackBuilder.jsx`, `ComponentPackBuilder.jsx`, or `TreatmentBuilder.jsx` — stop and flag. These are carefully architected workflows. Only additive changes are allowed unless explicitly approved.

---

## Scope discipline (hard rule)

One coherent change per session. Stay inside the area the task names.

- Do not edit adjacent code that already works, even if it looks improvable. Note it separately and move on.
- If finishing the task seems to require touching a file or module outside its scope, STOP and flag it before proceeding.
- Never bundle a bug fix and a new feature in the same change. They are separate sessions.
- Smaller, well-scoped changes are always preferred. When a change starts touching many files, stop and ask whether it should be split.

---

## UI work — mockup first (hard rule)

Any work that creates or changes UI or layout produces an HTML mockup in `docs/mockups/` FIRST, and the operator approves the look, before any JSX is written. No exceptions.

- The mockup is a pixel-level spec: real proportions, real spacing, the actual brand colors and type, on a Salt background.
- Show the operator the mockup and STOP. Do not touch the real app until the look is approved.
- Once approved, the mockup is the locked spec — build to match it. If the build has to deviate, flag it and say why.
- Existing locked specs live in `docs/mockups/` (e.g. `creative-engine-v5.html`, `inventory-portal.html`). New UI work adds a new mockup file there.

---

## Debugging protocol (follow in order)

When something is broken, never jump straight to a fix. Work in this order, and do not write code until step 4 is approved:

1. **Reproduce** — restate, in plain English, exactly what the operator did, what they expected, and what happened instead.
2. **Isolate** — find the file(s) actually responsible. Read them. Don't guess.
3. **Diagnose the root cause** — explain WHY it happens, not just what's visibly wrong. Fix the cause, not the symptom, so the bug can't reappear elsewhere.
4. **Show and wait** — show the operator the diagnosis in plain English and wait for approval before changing anything.
5. **Fix at the root**, then say exactly how to test that it's actually fixed.

A bug that gets patched at the surface and comes back later is a failure. Find the real cause.

---

## Commands (verify your own work)

Before claiming a change is done, build it and run the self-test. Don't rely on reading the code alone. (Confirm these match the scripts in `package.json`.)

- Build: `npm run build`
- Dev server: `npm run dev`
- Preview a production build: `npm run preview`
- Self-test: `node scripts/selftest.mjs` — must pass green before a change is considered done.

If a change touches money, vendor data, or production state, run the self-test and report the result.

---

## Append-only data

These collections are append-only. Reject any UPDATE or DELETE operation on them at the store layer:

- `atom_usage` — every atom referenced in a closed PO
- `state_transition` — every approval state change
- `agent_interaction` — every Claude API call from the agent layer
- `bom_snapshot` — frozen at PO placement, immutable

---

## Brand / design system (Foreign Resource)

Visual decisions are not optional — they are part of the spec.

**Color**
- Background: Salt `#F5F0E8` (never pure white on top-level surfaces)
- Primary text: Slate `#3A3A3A`
- Accent: Sand `#EBE5D5` (only)
- Stat deltas: green `#3B6D11` good, amber `#854F0B` warn, red `#A32D2D` bad

**Type**
- Headings, card titles, stat values: Cormorant Garamond
- Body, UI labels: General Sans (Inter / Helvetica Neue fallback)
- IDs, file paths, lot numbers, code: monospace (`ui-monospace`, `SF Mono`, Menlo)

**Components**
- Cards: white fill, `0.5px` border at `rgba(58,58,58,0.15)`, 8px radius, 18–22px padding
- Tabs active = Slate background + Salt text, 6px radius. Inactive = ghost.
- Status pills: 5px radius, 11px font, 0.06em letter-spacing, 5×12px padding

**Never**
- No emojis in UI
- No bright colors outside the brand palette
- No deep shadows or heavy borders
- No pop-ups or cluttered banners

---

## Brand operating principles (hard rules)

**Never discount.** Foreign Resource never marks down, never runs sales, never offers promotional codes that reduce price. This is a permanent brand stance — do not introduce markdown logic, discount engines, sale-price fields, or markdown-trigger automation in any module. The overstock lever is to **pause reorders** and let inventory sell through at full price, or archive / repurpose the stock (creator seeding, sample sale at cost, write-off). The inventory module must surface "pause reorder" and "hold" actions, never "mark down" or "−X%" actions.

If a future product spec or industry-standard report references markdown KPIs (first-markdown rate, markdown depth, terminal markdown rate), translate them to the never-discount equivalents: weeks-to-clear-at-current-velocity, pause-reorder candidate count, archived-without-discount rate.

**Tracked vs untracked SKUs.** Every SKU in the inventory module has a `tracked` flag (default true for staples, default false for drop variants where the plan is to sell out without restock). Untracked SKUs:
- are excluded from the cockpit Top-6 stockout calendar,
- never trigger Slack alerts (stockout, low cover, ad-spend-driven demand spikes),
- don't surface in the urgent reorders list or in any chase-PO suggestions,
- still appear on the Inventory tab table (faded / opacity 0.45) so the operator can see them and re-track if needed.

The toggle is a star icon (★ tracked / ☆ untracked) on every SKU row. State lives in `inventoryStore.tracked[sku]`. This is how the brand handles drop products that are intentionally one-and-done — the system shouldn't pester the team about a SKU that's expected to die.

---

## i18n (vendor portal and any external surface)

Every user-facing string on `/vendor/*` and any external surface goes through the i18n layer. No string literals.

- Translation keys nested by route: `vendor.dashboard.title`, `vendor.po.status.shipped`
- Dates via `Intl.DateTimeFormat` (locale-aware)
- Numbers / currency via `Intl.NumberFormat`
- CJK typography: line-height ≥ 1.6, font stack falls back to `Noto Sans SC`, `PingFang SC`, `Microsoft YaHei`

---

## Vendor-facing surfaces — hard rules

Anything served at `/vendor/*` MUST NEVER expose:
- Cost fields (unit cost, total cost, margin)
- Vendor ratings or internal notes
- Other vendors' names, POs, or any data

Enforce at the query layer (row-level security via `scopedQuery(vendorId, ...)`), not just in the UI.

---

## Routing

- Hash-based routing for internal PLM (`#plm/library/treatments`, `#plm/styles/:id`, `#plm/production/:poId`).
- Vendor portal lives at `/vendor/*` with proper session-based auth, NOT hash routing.
- Old hash routes redirect to new ones; never break a URL someone might have bookmarked.

---

## When in doubt

Stop and ask. Better to pause for clarification than to regress a working workflow.

If a prompt is more than 30 days old, re-read the current codebase first and flag any tasks that no longer apply.

---

## Versioning

- This file evolves. Update it whenever a new convention is established.
- Significant changes get a one-line entry in the changelog at the bottom.

---

## Module conventions live in subtree files

This file holds the **universal** rules only. Deep, module-specific conventions live in a `CLAUDE.md` inside that module's own folder, which Claude Code loads automatically when working in that area:

- `src/components/inventory/CLAUDE.md` — inventory module conventions
- `src/components/creative/CLAUDE.md` — creative engine conventions

When you establish a new convention, put universal rules here and module-specific rules in the matching subtree file. Keep this top-level file lean.

> Migration note: the two module sections below (Creative, Inventory) are kept inline for now so this file stays self-contained. They are candidates to move into the subtree files named above. Do that as a doc-only change when convenient — do not delete the content, move it.

---

## Creative Module Conventions

All Creative Engine code lives in `src/components/creative/`. Stores in `src/utils/` (one file per data type, mirroring `treatmentStore.js`). Types in `src/types/creative.js` (JSDoc, no TypeScript). Hash routing via `src/utils/creativeRouting.js` mirroring `plmRouting.js`.

**Stack:** Plain JavaScript + JSDoc. No Zustand, no TypeScript, no Zod. localStorage primary + Supabase cloud mirror. `getAuthedSupabase()` for every store cloud call.

**Palette:** FR brand (Salt `#F5F0E8` / Slate `#3A3A3A` / Sand `#EBE5D5`) for all surfaces. Navy `#1B2741` reserved as single accent: `<LiveAds />` table `<thead>` and `<TodayView />` budget guardrail bar only.

**Hash grammar:** `#creative-engine/{view}[/{id}]`
Views: `today | knowledge | pulse | sprints | brief | jobs | production | queue | ads | library | learnings`

**Lane enum:** `ai | high_production | creator | founder`

**Sprint status enum:** `drafting | brief_ready | rendering | in_queue | live | closed`

**Render status enum:** `pending | processing | done | approved | rejected`

**Ad status enum:** `paused | active | killed | scaled`

**Ad naming:** `S{sprintNumber}_{lane}_{slug}_v{version}` — all Meta ads created PAUSED.

**Append-only enforcement** (at JS store layer, not DB): `learnings`, `metrics_daily`, `agent_interaction`. Reject any update/delete calls.

**Credential storage:** New providers `anthropic`, `fal`, `higgsfield`, `slack`, `transloadit`, `apify` stored in `user_integrations (org_id, provider)` with RLS. Proxies use `.maybeSingle()` — never `.eq('org_id', ...)` (RLS handles org isolation).

**Design reference:** `docs/mockups/creative-engine-v5.html` (1055 lines, 11 sub-views, locked V5 spec).

---

## Inventory Module Conventions

All inventory code lives in `src/components/inventory/`. Stores in `src/utils/` (one file per data type, mirroring `treatmentStore.js`). The module is phase 7-complete: cockpit, SKU master ledger, SKU detail, sell-through, POs, OTB, forecast, and the read-only inventory agent.

**Stack:** Plain JavaScript + JSDoc. localStorage primary + Supabase cloud mirror where shared. No TypeScript, no Zustand, no Zod.

**Palette:** FR brand (Salt `#F5F0E8` / Slate `#3A3A3A` / Sand `#EBE5D5`) for surfaces. Sienna `#D4956A` is the single "movement" accent — vs-prior deltas, ad-projection lines, PO arrival markers, sienna ★ on tracked SKUs. Calendar states: good `#6B8E6B` healthy / warn `#C8924A` restock / bad `#A8543C` stockout / sea `#B5C7D3` overstock. Tokens: `src/components/inventory/inventoryTokens.js`.

**KPI numbers:** General Sans 28px wt500 (operator override of the Cormorant-for-stat-values rule, 2026-05-09). Headings stay Cormorant.

**Hash grammar:** `#inventory/{view}[/{id}]`
Views: `cockpit | inventory | sell-through | otb | pos | forecast | sku/{sku}`
Routing helper: `src/utils/inventoryRouting.js` (mirrors `plmRouting.js`). `migrateLegacyInventoryHash()` redirects pre-Phase-7 bookmarks (`#sell-through`, `#po-schedule`, `#pos`, `#new-po`).

**Stores (one per data type, mirroring techPackStore.js):**
- `inventoryStore.js` — joined SKU read model (Shopify on-hand + sales + PLM + POs + tracked flag)
- `variantMappingStore.js` — Shopify variant ↔ PLM style mapping
- `sellThroughStore.js` — snapshot of variant on-hand + 90d salesByDay
- `productionStore.js` — POs, BOM snapshots, atom usage, drift logs
- `otbStore.js` — quarterly per-class planned receipts $ (localStorage-only)
- `forecastAssumptionsStore.js` — operator's planned ad spend / MER → derives liftMultiplier

**Append-only enforcement** (at JS store layer): `tracking_audit` (every star toggle), plus the existing `atom_usage`, `state_transition`, `agent_interaction`, `bom_snapshot`. Reject any update/delete calls.

**Tracked vs untracked SKUs (hard rule, mirrors top-level CLAUDE.md):** `inventoryStore.tracked[sku]`. Default true for Staples, false for Drops. Untracked SKUs:
- excluded from cockpit calendar, urgent reorders, chase suggestions, Slack alerts
- still visible on the Inventory tab (faded 0.45 opacity) with a "Untracked" pill replacing their bucket
- ★ tracked / ☆ untracked toggle in the table, on the SKU detail header, and on cockpit cover rows

**Never discount (hard rule, mirrors top-level CLAUDE.md):** No markdown actions anywhere in the inventory module. Overstock surfaces as a status pill and an OTB warning chip; the only operator levers are pause reorder (= setTracked false), hold for review, archive / repurpose at full price. The inventory agent's system prompt explicitly forbids proposing markdowns.

**Inventory agent:** `src/utils/inventoryAgent.js` + `InventoryAgentChat.jsx`. Floating chat panel (bottom-right) accessible from every inventory tab. Read-only Claude Opus 4.7 with prompt-cached system prompt and 7 read-only tools dispatched into the stores. Routes through the existing `anthropic-proxy` Supabase Edge Function — no per-feature API key prompt.

**Design reference:** `docs/mockups/inventory-portal.html` (1392 lines, 7 views, locked V1 spec). Implementation plan: `docs/inventory-implementation-plan.md`.

---

## Changelog

- 2026-04-25 — initial conventions established (folder structure, module boundaries, brand system, append-only collections, vendor surface hard rules)
- 2026-05-06 — Creative Module Conventions added (Creative Engine phase 0)
- 2026-05-09 — Type system: General Sans is the brand sans for body / UI labels (Cormorant Garamond stays as the heading face).
- 2026-05-09 — Brand operating principle: never discount. Inventory module phase 0 (variant mapping store + Today/SKU mockups locked).
- 2026-05-09 — Inventory module phases 1–7 shipped: cockpit, SKU master ledger, SKU detail, sell-through, POs, Open-to-Buy, forecast bridge + assumptions strip + top-20 calendar, read-only Claude agent. Legacy standalone `#sell-through`, `#po-schedule`, `#pos` routes retired (redirects preserved). KPI hero numbers switched from Cormorant to General Sans.
- 2026-06-11 — Working-process rules added: operator context (non-technical operator + explain-like-an-8-year-old rule), scope discipline (one change per session, no bundling bugs with features), mockup-first hard rule (HTML mockup approved before any JSX), debugging protocol (reproduce → isolate → diagnose root cause → show → fix at root), commands/self-test section. Subtree-CLAUDE.md convention introduced; Creative + Inventory module sections flagged for future migration into their folders.
