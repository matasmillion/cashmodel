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

## When in doubt

Stop and ask. Better to pause for clarification than to regress a working workflow.

If a prompt is more than 30 days old, re-read the current codebase first and flag any tasks that no longer apply.

---

## Versioning

- This file evolves. Update it whenever a new convention is established.
- Significant changes get a one-line entry in the changelog at the bottom.

---

## Changelog

- 2026-04-25 — initial conventions established (folder structure, module boundaries, brand system, append-only collections, vendor surface hard rules)
