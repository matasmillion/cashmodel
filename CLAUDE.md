# Cash Model — operating conventions for Claude Code

This file is the operating manual for any AI agent (Claude Code, Cursor, Copilot, etc.) working on this repo. Read it at the start of every session. Follow it strictly. Update it when conventions evolve.

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
- Body, UI labels: system sans (Inter / Helvetica Neue fallback)
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

## Multi-device sync — required architecture (PLM **and** the rest of the ERP)

This whole codebase is, at heart, a digital asset management platform. Every
record (atom, pack, sprint, ad, vendor, PO, sample…) is an asset that one
person edits on a laptop while another opens it on a phone. The default
"localStorage primary, fire-and-forget upsert" pattern was fine for the
single-user prototype; it is not safe under concurrency. Going forward,
**every editable cloud-mirrored table must use optimistic concurrency
control + Realtime presence** — never the legacy blind UPSERT.

The pieces are already in the codebase:

- **Server-stamped `updated_at`** — `set_updated_at()` BEFORE UPDATE trigger
  on every editable table. The server, not the client, decides what
  `updated_at` becomes after a write. Migration template:
  `supabase/migrations/20260509000001_occ_updated_at_triggers.sql`.
- **Conditional UPDATE primitive** — `robustUpdateAtomOptimistic(table, id,
  baseUpdatedAt, patch)` in `src/utils/atomCloudSync.js`. Returns
  `{ ok, row }`, `{ ok: false, conflict: true, latest }`, or
  `{ ok: false, error }`.
- **3-way merge** — `threeWayMerge(base, mine, theirs, { deepFields })` in
  `src/utils/threeWayMerge.js`. Auto-merges non-overlapping field changes;
  surfaces only true per-field clashes. Use `deepFields: ['data']` on JSONB
  body tables (`tech_packs`, `component_packs`).
- **Realtime presence + row updates** — `joinPresence(rowKey, …)` and
  `subscribeRowChanges(table, id, onChange)` in
  `src/utils/presenceChannel.js`.
- **Builder wiring hook** — `useOptimisticSync` in
  `src/components/techpack/useOptimisticSync.jsx` is the single place that
  threads all of the above. New builders should import and use it; do not
  re-invent the conflict / presence wiring per builder.
- **UI** — `<ConflictResolver />` and `<PresencePill />` in
  `src/components/techpack/`.

Hard rules:

1. New editable tables MUST have a `set_updated_at()` trigger and MUST be
   added to the `supabase_realtime` publication in their first migration.
2. Store-layer `saveX` functions return
   `{ ok, row?, conflict?, latest?, error? }` — not the merged row directly.
   Builders call `useOptimisticSync` and pass the result through
   `handleSaveResult`.
3. Append-only tables (`atom_usage`, `state_transition`,
   `agent_interaction`, `learnings`, `metrics_daily`, `bom_snapshot`)
   reject updates at the store layer; OCC is a no-op for them.
4. Vendor portal queries (`/vendor/*`) MUST go through `scopedQuery` even
   on the conflict re-fetch path. Cost columns must never leak.

Status of conversion:
- ✅ atoms — fabrics, treatments, patterns, embellishments
- ✅ packs — tech_packs, component_packs (JSONB-aware merge via
  `deepFields: ['data']`)
- ✅ libraries — vendors, colors (composite-keyed via
  `robustUpdateAtomOptimisticByName(table, orgId, name, baseUpdatedAt,
  patch)`; per-entry `_updatedAt` carries the ETag in localStorage)
- ⏳ Creative — sprints, briefs, renders, ads, discussions, budget_config,
  creative_library, creative_knowledge (groundwork in the migration; store
  conversions follow)
- ⏳ ERP-wide — POs, samples, drift logs, sample_requests, etc. — same
  rules apply when each store gains its first cloud-mirroring write.

If you are adding a new editable cloud table and you are not using the
hooks above, **stop and flag it**. There is no second-best path.

---

## When in doubt

Stop and ask. Better to pause for clarification than to regress a working workflow.

If a prompt is more than 30 days old, re-read the current codebase first and flag any tasks that no longer apply.

---

## Versioning

- This file evolves. Update it whenever a new convention is established.
- Significant changes get a one-line entry in the changelog at the bottom.

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

## Changelog

- 2026-04-25 — initial conventions established (folder structure, module boundaries, brand system, append-only collections, vendor surface hard rules)
- 2026-05-06 — Creative Module Conventions added (Creative Engine phase 0)
- 2026-05-09 — Multi-device sync architecture: optimistic concurrency control + Realtime presence is mandatory for every editable cloud-mirrored table (PLM and the rest of the ERP)
