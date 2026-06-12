# Foreign Resource PLM — Architecture & Decisions Context

> **Purpose of this file.** Hand this to any AI assistant (Claude in chat, Cursor, etc.)
> so it understands the **PLM** (Product Lifecycle Management) part of the Foreign
> Resource ERP — how it's built, every major architectural decision, and the many small
> conventions that govern its structure. It is a **reference**, not a tutorial. The
> source code is always the final word; where this doc and the code disagree, trust the
> code (and update this file).
>
> _Compiled 2026-06-12 from a full read of the PLM codebase (`src/components/techpack/`,
> `src/components/production/`, `src/components/vendor/`, the `src/utils/*Store.js`
> layer, the Supabase migrations/functions, and the in-repo handoff docs)._

---

## 0. TL;DR — the 90-second model

- The **PLM** is the product-development half of an internal apparel ERP for the brand
  **Foreign Resource** (FR). It is run by **one non-technical operator** who directs all
  work through an AI agent. (The other halves are Cash, Inventory, and a Creative Engine;
  there is also an external Vendor Portal.)
- The PLM is built from **four record families** that compose into each other:
  1. **Atoms** — reusable library building blocks: **fabrics, colors, treatments,
     embellishments, vendors**. Each is its own store, its own list/builder/preview UI.
  2. **Component Packs** ("trim packs") — single-component spec docs (a label, a zipper,
     a drawcord) reused across many styles.
  3. **Cut & Sew blocks** — the **geometric skeleton** (flat lays, construction callouts,
     stitching, pattern pieces, POM, grading, and an internal-only labor-cost estimate) that
     a style inherits.
  4. **Tech Packs** (a.k.a. **Styles**) — the full per-garment spec, a 26-page wizard that
     **picks atoms / packs / a cut-&-sew block by reference** and rolls them into a costed,
     printable document.
- Plus **Production**: **Purchase Orders**, immutable **BOM snapshots**, append-only
  **atom-usage** and **drift** logs.
- The defining engineering principle is **LOCAL-FIRST**: everything the user sees is read
  synchronously from the local device; the cloud (Supabase) is a **silent background
  backup/sync**, never on the read/render/image critical path.
- **Stack:** Vite + React, **plain JavaScript + JSDoc** (no TypeScript, no Zustand, no Zod).
  Auth = **Clerk** with **Organizations** as the multi-tenant boundary. Backend = **Supabase**
  (Postgres + **RLS keyed on the Clerk JWT `org_id`** + a Storage bucket + Edge Functions).
  Hosted as a static SPA on GitHub Pages; installable PWA.

---

## 1. Where the PLM sits in the app

The ERP has several top-level tabs (`src/context/AppContext.jsx`). The PLM is the
**`product`** tab, mounted in `src/App.jsx` as a lazy-loaded `<PLMView />`. Siblings:

| Area | What it is | Lives in |
|---|---|---|
| **Cash** | 13/58-week cashflow model (the original app) | `src/context/AppContext.jsx`, `src/utils/cashflow58Week.js` |
| **PLM** *(this doc)* | Styles + Library of atoms + Production | `src/components/techpack/`, `src/components/production/` |
| **Inventory** | Cockpit, sell-through, OTB, forecast, read-only AI agent | `src/components/inventory/` |
| **Creative Engine** | Ad/creative pipeline | `src/components/creative/` |
| **Vendor Portal** | `/vendor/*`, auth-scoped, **never exposes cost data** | `src/components/vendor/` |

The operator is **non-technical**: explanations should be plain, changes should be small
and well-scoped, and UI work goes through an HTML mockup in `docs/mockups/` for approval
**before** any JSX is written. These are hard rules in the top-level `CLAUDE.md`.

---

## 2. Stack, hosting & multi-tenancy (the facts)

- **Vite + React 19**, **plain JS + JSDoc**. No TypeScript / Zustand / Zod. Shared
  typedefs live in `src/types/` (documentation only; runtime is plain JSON).
- **Hosting:** GitHub Pages static SPA, `base: '/cashmodel/'`, deployed by
  `.github/workflows/deploy.yml` on push to `main`. **Deploys rename content-hashed
  chunks**, which can crash a long-open tab — the app auto-reloads on a stale-chunk
  error (`lazyWithReload` + an ErrorBoundary), so a sudden reload is expected, not a bug.
- **PWA:** installable + offline via `vite-plugin-pwa` (`vite.config.js`). The service
  worker precaches the app shell and **caches PLM image bytes** (see §10).
- **Auth: Clerk** (`@clerk/clerk-react`) with **Organizations = multi-tenancy**. All
  store/util code reads the user/org **synchronously** off `window.Clerk` via
  `src/lib/auth` — **never import `@clerk/clerk-react` directly; go through `src/lib/auth`.**
- **Backend: Supabase** — Postgres with **Row-Level Security keyed on the Clerk JWT
  `org_id` claim** (`public.jwt_org_id()`), a private Storage bucket **`plm-assets`**, and
  a couple dozen Edge Functions (anthropic / fal / shopify / meta / plaid / mercury /
  slack proxies, trash purge, etc.). On the Supabase Pro plan (daily backups).
- **AI calls** never carry a key in the browser. They go through the **`anthropic-proxy`**
  Edge Function, which verifies the Clerk JWT, looks up the org's stored Anthropic key in
  `user_integrations` (RLS-scoped), and forwards to the Claude Messages API.

---

## 3. THE defining principle: local-first (cloud = backup, not critical path)

This is the most important architectural fact about the PLM. It was learned the hard way
(a whole session of perf failures traced to one root cause: the cloud was on the critical
path for things that should be purely local — most damagingly **images** and
**change-notifications** — on a backend too small to hide the latency, behind a web-deploy
model that breaks long-lived sessions).

> **Everything the user sees comes from local. The cloud is a silent background
> backup/sync — never on the read, render, or image path.**

Concretely:

- **Reads are synchronous** from an in-memory cache hydrated once at boot from IndexedDB
  (`src/utils/localDb.js`, hydrated in `src/main.jsx` before first render).
- **Writes go local first** (instant), then attempt the cloud upsert with full
  JWT/RLS/schema recovery, falling back to a **durable outbox** (`src/utils/syncQueue.js`)
  that retries on reconnect.
- **Images** are stored as Storage objects referenced by path + signed URL, with the
  **bytes cached locally** by the service worker, plus an offline base64 fallback so a
  network blip can never drop a photo.
- **Conflicts** are resolved last-write-wins, but the **loser is never lost** — it's
  stashed in a conflict backup + a local **version vault** the operator can browse/restore.

**Direction note (solo operator).** Because there is one operator working across two
personal machines, the **collaboration layer was deliberately removed**: no single-writer
locking / read-only mode, no scary "Restore mine / Keep theirs" conflict prompts. The
`record_locks` machinery still exists in the DB/migrations but is **not enforced** in the
builders (a `readOnly` constant is kept as a no-op so old guards don't break). The
replacement is the silent **version vault** (§11).

> ⚠️ Practical rule when touching storage: **a localStorage/IDB key is often read by many
> files** (its store + `atomCloudSync` + `plmBackup` + diagnostics + `StorageHealthPanel` +
> `vendorLibrary`). Convert/reclaim a key only when **all** its readers go through the
> engine, or local and cloud desync.

---

## 4. The domain model — atoms, packs, blocks, styles, production

```
                         ┌─────────────────────────────────────────────┐
   LIBRARY (atoms)       │  fabrics · colors · treatments ·             │
   reusable building     │  embellishments · vendors                    │
   blocks                └───────────────┬─────────────────────────────┘
                                         │ referenced by id
   COMPONENT PACKS  ───────┐             │
   (trims: labels,         │             │
    zippers, cords…)       ▼             ▼
                    ┌──────────────────────────────┐
   CUT & SEW BLOCK  │  TECH PACK  (= a "Style")     │   ← 26-page wizard,
   (geometry        │  picks atoms/packs/block by   │     library-first,
    skeleton) ─────▶│  reference, rolls up cost     │     per-style overrides
                    └───────────────┬──────────────┘
                                    │ placed as
                                    ▼
   PRODUCTION   Purchase Order ──▶ BOM snapshot (frozen) ──▶ on close: atom_usage
                                                              + drift logs (append-only)
```

Key relationships:

- A **Style/Tech Pack** does **not** define materials inline. It **picks** library atoms
  and component packs **by id** and stores a **thin reference plus per-style overrides**
  (price, finishes, notes, placement, yield). Editing the library does **not** silently
  rewrite 50 packs; overrides isolate each style.
- A **Cut & Sew block** is referenced by many styles (the geometric skeleton). Its
  construction/grading pages embed into a style's tech pack; its **labor-cost pages are
  internal-only and never embed**.
- A **Purchase Order** freezes an **immutable BOM snapshot** at placement, so actuals can
  always be traced to the exact spec that was in force, even after the library evolves.

Shared atom shape (`src/types/atoms.js`, JSDoc only): every atom has
`id, code, name, status ∈ {draft|testing|approved|archived}, version, created_at,
updated_at, digital` (a `DigitalAsset` slot for CLO3D / Rhino / LoRA references).

---

## 5. The Library — atoms (fabrics, colors, treatments, embellishments, vendors)

### 5.1 The "atom" concept
An **atom** is a reusable, **never-hard-deleted** library record describing one material /
treatment / decoration and its supply-chain properties (cost, lead, MOQ, vendor). Atoms
are picked into styles by id and snapshot-frozen into POs.

### 5.2 The common store pattern (the template every store mirrors)
Each atom family has **exactly one store file** in `src/utils/` (`fabricStore.js`,
`treatmentStore.js`, `embellishmentStore.js`, …) plus a **library file**
(`fabricLibrary.js`, …). Mirror `techPackStore.js` when adding anything.

- **Dual-layer persistence:** local-first (IndexedDB via `localDb`, was localStorage) is
  the synchronous read source; **Supabase is a fire-and-forget mirror**.
- **CRUD + archive (no hard delete):** `list / get / create / save / archive / restore /
  duplicate`. Archive flips `status:'archived'`; the row persists forever so old POs still
  resolve.
- **Auto-generated `code`** on create (see prefixes below). Sequence numbers are never
  reused.
- **Orphan healing:** every `list*()` upserts any local-only rows to the cloud (covers a
  failed insert / RLS blip / offline edit). Idempotent.
- **Cloud column allow-lists:** each store keeps a whitelist of known DB columns and
  strips everything else before upsert (Postgres rejects unknown columns → silent failure
  otherwise). Schema-drift errors are caught and the offending column is dropped + retried.
- **Code de-dup:** two offline devices can mint the same next code; `dedupeCodesOnce()`
  re-issues one after sync.
- **localStorage keys:** `cashmodel_fabrics`, `cashmodel_treatments`,
  `cashmodel_embellishments`, `cashmodel_fr_colors`, `cashmodel_vendors`, etc.

### 5.3 Library file vs store file
- **`*Library.js`** = schema + taxonomy: enums (types/categories/weaves), lookup tables,
  helper functions (`deriveShrinkSpec`, `bumpVersion`), and the `emptyX({…overrides})`
  record factory.
- **`*Store.js`** = persistence: local+cloud CRUD, code generation, migrations, orphan heal.

### 5.4 Code/ID prefix conventions
| Atom | Code pattern | Example | Notes |
|---|---|---|---|
| Fabric | `FB-{WEAVE}-{seq}` | `FB-FRT-007` | weave codes JSY/FRT/FLC/RIB/PQE (knit), TWL/DNM/PPL/OXF/CNV (woven), GEN |
| Treatment | `TR-{TYPE}-{seq}` | `TR-WSH-001` | types WSH/GDY/PDY/PRT/FIN/DST |
| Embellishment | `EM-{TYPE}-{seq}` | `EM-EMB-003` | types EMB/APP/BD/SCR/ART/PCH/FOL/PFF/GEN |
| Color | name-keyed | `"Bone"`, `"Moss"` | no prefix; the **name is the key** |
| Cut & Sew block | `CS-{CAT}-{seq}` | `CS-HD-001` | cats HD/TE/SP/CG/JK/SH/SR/SK/DR/GEN |
| Style number | `{season}-{collection}-{type}-{0000}` | `SS26-BB-ZH-0001` | derived, not a DB code |
| PO | `PO-{year}-{seq}` | `PO-2026-0001` | |
| Vendor lot (physical) | vendor-assigned | `GO-2602-A` | |

### 5.5 Per-atom data shapes (the parts that matter)

**Fabric** (`fabricLibrary.emptyFabric`): `category` (knit/woven), `weave`, `composition`,
`weight_gsm` + `width_cm` + `stretch_pct` (pre-wash) and optional `*_post` (post-wash),
**directional shrinkage** `shrinkage_warp_pct` / `shrinkage_weft_pct` (replaced a single
`shrinkage_pct`; legacy still read as fallback), sourcing (`mill_id`, `lead_time_days`,
`moq_meters`), **dual-currency pricing** `price_per_meter_usd/cny` + `price_per_kg_usd/cny`
(auto-synced via live FX), `mill_finishes[]` (named price deltas with `executed_at` =
mill/secondary/at_treatment), ribbing fields, `color_card_images[]` (`{url,label,hex}`),
`default_garment_area` + placement image/notes, media (`front/back_image_url`,
`cover_image`, `zfab_file_url`, `documents[]`), `notes`.

> **Units migration:** fabrics were originally yards/`price_per_yard_usd`; a one-time
> `migrateYardsToMeters()` converts on first read. **All current code assumes metric.**
> Mills quote in CNY per meter or per kg, hence the four price fields.

**Treatment** (`treatmentLibrary.emptyTreatment`): `type` (wash/garment_dye/piece_dye/
print/finish/distress), `base_color_id`, `chemistry`, `duration_minutes`, `temperature_c`,
`compatible_fabric_ids[]`, `compatible_cut_sew_categories[]`, `shrinkage_expected_pct`,
swatch/sample/cover images, vendors (`primary_vendor_id`, `backup_vendor_id`),
`cost_per_unit_usd`, lead/MOQ, and a **`digital{}` twin** (LoRA checkpoint + base model +
trigger phrase + training images, derived `.ZFAB`/CLO assets). **Production rollups**
(latest cost/lead, units produced, defect rate) are computed **live** from the append-only
`atom_usage` + `drift_logs`, not stored.

**Embellishment** (`embellishmentLibrary.emptyEmbellishment`): `type` (embroidery/applique/
beading/screen_print/art_print/patch/foil/puff_print), `technique`, artwork files,
`placement`, `size_w/h_cm`, `color_count`, `thread_color_ids[]`, vendors, cost/lead/MOQ,
Adobe (`adobe_ai_url`, `adobe_psd_url`) + `digitizing_file_url`.

**Color** (`colorLibrary.js`) — **special pattern:** stored as a **map keyed by color
name** (`cashmodel_fr_colors`), edits are **fire-and-forget to cloud** and **propagate
instantly** to every tech pack referencing the name (no snapshot). Per color: `hex`, `rgb`,
`pantoneTCX/TPG/C`, `cardImage`, `costPerUnit`, Adobe `.ase`/`.ace`, CLO3D ref. Seeded
brand colors (`FR_COLOR_OPTIONS`) can't be deleted; custom ones can.

**Vendor** (`vendorLibrary.js`, key `cashmodel_vendors`, migrated from `cashmodel_factories`):
keyed by **`name` (a string, not a UUID)** — this is the cross-row foreign key everywhere
(`po.vendor_id`, `treatment.primary_vendor_id`, …). Holds contact/sourcing/terms, plus two
**cost-model** fields the AI estimator uses: `samRateUsdPerMin` (fully-loaded labor rate)
and `markupPct` (sticky factory profit %). `archivedAt` soft-deletes. `renameVendor()`
re-keys locally and cascades through all referencing stores; cloud cascade is best-effort
(rows heal on next save). **These cost/rating/notes fields must never reach the vendor portal.**

### 5.6 AI extraction (mill cards → structured fields)
- **`FabricAIExtract` + `aiFabricExtract.js`:** drop mill fabric-card images/PDFs (often
  Chinese). Pass 1 — Claude **vision** via `anthropic-proxy` returns structured JSON
  (translates CN textile terms, maps to the weave vocabulary, reads GSM/width/shrinkage/
  pricing, reads every swatch + estimates hex). Pass 2 — client-side **swatch cropping**
  turns each printed swatch into a real cropped image. Includes **vendor fuzzy-matching**
  (`normalizeVendorName` de-dupes "Jufeng Textile" vs "Jufeng Cloth Industry Ltd") and
  **FX backfill** (fills USD from CNY using the live rate).
- **`SwatchScanModal` + `SwatchBoxEditor`:** two-pass swatch scanner — detect boxes →
  operator drags/resizes overlays → OCR the printed color numbers → upload crops as
  `color_card_images`.
- **`TreatmentAIExtract` + `aiTreatmentExtract.js`:** same idea for treatment spec sheets
  (chemistry/duration/temp/compatibility); no swatch cropping.

### 5.7 BOM previews
Each family has a `*BOMPreview.jsx` that renders an **A4-landscape SVG page** used both in
the library editor's right pane and embedded in the tech pack. They accept **`chosen*`
override props** (color, area, finishes, notes, placement, price, yield) so the same
component renders the library default or a style-specific variant. Fabric cost/unit =
`(basePrice/m + Σ finish deltas/m) × yieldMeters`; treatments/embellishments are per-garment.

---

## 6. Component Packs (trim packs)

A **Component Pack** is a standalone, reusable **single-component** spec (a label, zipper,
elastic, button, thread, drawcord, even a fabric-as-trim). It exists **separately from tech
packs** for the same reason cut-&-sew blocks do: a trim is used across hundreds of styles,
so you spec it **once** and link it by id.

- **Files:** `ComponentPackBuilder.jsx` (PROTECTED — additive only),
  `ComponentPackList.jsx`, `ComponentPackPagePreview.jsx`, `ComponentPackSteps.jsx`,
  `componentPackStore.js`, `componentPackConstants.js`, `componentPackExport.js`.
- **8 A4-landscape pages** (`COMPONENT_STEPS`): Overview · Design · Materials ·
  Construction · Embellishments · Treatment · Quality Control · **Samples & Approval**.
  Any page can be marked skipped (`skippedSteps[]`) → renders a "PAGE NOT USED" overlay.
- **Record:** `{ id, data{…}, images[], cover_image, component_name, component_category,
  status, supplier, cost_per_unit, currency, …, deleted_at }`. The `data` blob holds
  `costTiers[]` (MOQ-tiered pricing, cap 5), `colorwayPicks[]` (FR color names),
  `materials[]`, `constructionCallouts[]` (each with a normalized `dot{x,y}`), `treatments[]`,
  `qcPoints[]`, `samples[]`, `finalApproval{designer,manager,vendor}`, and a `revisions[]`
  log with full data/image **snapshots**.
- **Store:** same local-first dual-write pattern; **soft-delete** (`deleted_at`), restore,
  and **purge** (hard delete row + Storage assets). Returns `idChanged:{from,to}` when RLS
  forces an id rotation (see §10). Heavy **legacy-migration** logic (status keys, sample
  types, `factory`→`vendor`, comma-string colorways → `colorwayPicks[]`, scalar cost →
  `costTiers[]`).
- **Export:** `componentPackExport.js` → 8-page PDF/SVG via `ComponentPackPagePreview`.

Status pipeline (kanban): `Design → Sample → Production-Ready` (+ `Archived`).

---

## 7. Cut & Sew blocks (the geometry skeleton + internal cost)

The **Cut & Sew library** is the reusable construction/grading skeleton a style inherits.
Files: `CutSewBuilder.jsx`, `CutSewList.jsx`, `CutSewBOMPreview.jsx`, `CutSewCostChat.jsx`,
`cutSewStore.js`, `cutSewLibrary.js`, `cutSewAnnotations.js`. (It **superseded** the older
"patterns" concept; the legacy `#…/library/patterns` route redirects to `cut-sew`, and a
`patterns` table still exists in early migrations.)

**9 pages** map onto tech-pack pages 07–13:

| Block page | id | Tech-pack page | Embeds in style? |
|---|---|---|---|
| Identity | `identity` | — | no |
| Flat lay | `flatlay` | 07 | yes |
| Callouts 1–4 | `callouts1` | 08 | yes |
| Callouts 5–8 | `callouts2` | 09 | yes |
| Stitching 1–4 + **labor cost** | `stitching` | 10 | **cost block: NO** |
| Stitching 5–8 | `stitching2` | 10 | partial |
| Pattern pieces & cutting | `pattern` | 11 | yes |
| POM | `pom` | 12 | yes |
| Grading matrix | `grading` | 13 | yes |

**Record** (`cutSewLibrary.emptyCutSew`, table `cut_sew`, key `cashmodel_cut_sew`):
identity (`category`, `base_block`, `cover_image`), spec (`sizes[]`, `grade_rule`,
`ease_chest_cm`, `drop_cm`, `seam_allowance_cm`), flat-lay images, `callout_details_page1/2[]`
(each `{num,title,description,image_url,dot}`), `seam_stitch_blocks[]` + `seams[]`
(operation/seam_type/stitch_type/machine/SPI/thread), **`labor_cost_usd` + `labor_cost_meta`
+ `labor_cost_chat[]`** (internal only), `pattern_pieces[]`, `cutting_instructions`,
`pom_rows[]` + `pom_size_type` + method, `graded_size_matrix{baseSize,sizes,grading[]}`, and
**`annotations{slot: Annotation[]}`**.

**Annotations** (`cutSewAnnotations.js` + `ImageAnnotator.jsx`): red boxes / red text drawn
on callout photos, stored with **normalized 0..1 coordinates** so they land in the same
place at any scale (editor / preview / PDF). The **block is the single source of truth** —
both the library editor and any style that links the block read/write the same
`annotations[slot]` map; only the edited slot is persisted (optimistic concurrency).

### 7.1 The internal Cut & Sew Cost feature (CMT labor estimate)
- **What:** an AI estimate of **CMT** (Cut-Make-Trim) labor **per garment** — cutting,
  sewing, pressing, QC, packing, factory overhead + margin. **Explicitly excludes** fabric,
  trims, treatments, embellishments (each rolled up on its own step) and vendor profit %
  (added via `markupPct`).
- **`aiLaborCost.js`** (single-turn) + **`aiLaborCostChat.js` / `CutSewCostChat.jsx`**
  (multi-turn refinement). Two modes: **SAM mode** (vendor's `samRateUsdPerMin` × benchmark
  SAM minutes) or **regional-benchmark mode** (coastal-China CMT baseline + regional and
  complexity adjustments). The chat is grounded with the full garment spec on the first
  turn; when it converges it emits `SUGGESTED_VALUE: $X.XX`, which the UI parses into an
  **Apply** button. Model is routed through `anthropic-proxy` (a Claude Opus model).
- **Internal-only:** the cost lives on the block (`labor_cost_*`) and **never renders in any
  vendor-facing export**. Only construction/grading pages embed into a style; the cost
  page does not.

---

## 8. Tech Packs ("Styles") — the 26-step wizard

The centerpiece. A tech pack is the full per-garment spec, authored in a wizard whose live
preview / PDF / SVG stay in lockstep.

- **Files:** `TechPackBuilder.jsx` (PROTECTED — additive only; orchestration, cost rollup,
  save/exit guards, image upload), `TechPackSteps.jsx` (the step renderers — huge),
  `TechPackBOMSteps.jsx` (the library pickers + per-style overrides), `TechPackPagePreview.jsx`
  (live preview + sidebar), `TechPackPrimitives.jsx` (shared UI atoms), `techPackConstants.js`
  (the `STEPS`/`DEFAULT_DATA`/palette source of truth), `TechPackList.jsx` (grid + kanban),
  `techPackStore.js`, `techPackPDF.js`, `techPackSVG.js`, `techPackViews.js`, `techPackDiff.js`.

### 8.1 The wizard structure
`STEPS` in `techPackConstants.js` is the **single source of truth**; the live preview, PDF,
and SVG all index off it. It has **grown over time: 14 → 17 → 19 → (currently) 26 steps**,
grouped into manufacturing **phases** (Merchandising · Design · BOM · Cut & Sew ·
Embellishments · Treatments · QC · Packaging · Logistics · Sign-off). Each step has
`{id, title, icon, phase, skippable}`; `icon` is a string so it can be `000`, `00`, `$`.

Hard invariants to preserve on any step change (see `docs/techpack-phases.md`):
`STEPS.length === STEP_FNS.length === PAGE_FNS.length === TOTAL_PAGES`; PDF issues exactly
one `newPage(title,null,stepIdx)` per step; SVG `skipIf()` uses the same indices;
`LOCKED_STEPS` (Compliance/Quality/Labels/Order, currently indices 22–25) lock until
**Pre-Production** status; `MERCH_STEPS` (0–1) lock once Merchandising closes; **`data` only
gains fields, never renames/removes** so old packs keep loading.

Status enum: `Merchandising → Design → Sampling → Testing → Pre-Production → Production →
Released`.

> Note: older handoff docs (`docs/techpack-context-handoff.md`, `docs/techpack-phases.md`)
> describe the 14→19 plan. They're **historical** — the live `techPackConstants.js` is now
> at 26 steps (it later added Merchandising/competitor pages, BOM splits, an embellishments
> expansion, and the internal cut-sew cost page). Trust the code.

### 8.2 The data model
A row is `{ id, style_name, product_category, status, completion_pct, cover_image, data{…},
images[], library{…}, created_at, updated_at, deleted_at, user_id, organization_id }`.
The big `data` blob (`DEFAULT_DATA`) holds everything: identity/numbering, merchandising
(competitors, positioning), **library picks** (`pickedFabrics[]`, `pickedTrims[]`,
`pickedPackaging[]` — thin refs + per-style overrides), legacy free-text BOM (being phased
out), `colorways[]`, `artworkPlacements[]`, construction callouts (`constructionDetailsPage1/2[]`
with `dot`), `seamStitchBlocks[]` + `seams[]`, `cutSewLaborCost(+Meta)`, treatments/
distressing/care, embellishment + treatment callout pages, `poms[]` + `gradedSizeMatrix`,
`patternPieces[]`, labels/packaging, order/delivery + `cartons[]`, QC (`testingStandards[]`,
`qualityInspection{aql…}`), commercial (`targetRetail`, `targetFOB`, **persisted**
`totalUnitCost`, `maxFOB`, `costTiers[]`, `assumptions{}`), and PLM features
(`skippedSteps[]`, `revisions[]`, `samples[]`, `finalApproval{designer,brandOwner,vendor}`,
`parentStyleId` for variants).

`images[]` entries carry `{slot, name}` plus **one of** `data` (legacy base64), `path`
(Storage), or transient upload state (`_blobUrl/_uploading/_uploadError/_tempId`). `library{}`
is a small **per-pack** stash of reusable rows (distinct from the global atom stores).

### 8.3 Library-first picking + per-style overrides (a core decision)
Fabrics/trims/packaging/treatments/embellishments **must exist in the global library first**;
the tech pack only stores references. A generic `LibraryPickerModal` (in `TechPackBOMSteps`)
resolves every cover image up front, then a fabric flow is **picker → area(s) → colorway →
commit**. Each picked fabric can override **price** (`$/m` or `$/kg`, with kg↔m conversion
via GSM×width), **finishes** (`chosenFinishes`, delta-based, with secondary-vendor picker),
**notes**, **placement image**, and **yield** (`metersPerUnit`, auto from `GARMENT_YIELDS`
or manual/CLO3D). `null` override = inherit library.

### 8.4 Live cost rollup (and why it's gated)
The builder computes unit cost **live** from async-resolved library maps:
`fabricsCost + trimsCost + packagingCost (+ legacy bom)` → `+ embellishments (deduped
colorways + artwork) + treatments + cutSew labor` = `preMarkup`; `× (1 + vendor.markupPct)`
= `totalUnitCost`. `maxFOB` is derived from `targetRetail × (COGS% + fulfillment%) − …`.
Because the maps fill in asynchronously, the value **climbs** during resolution — a
`costInputsReady` **key-equality gate** ensures only the **settled** value is debounced into
`data.totalUnitCost`, which is what the grid cards read (they can't resolve libraries). This
is why card prices match the builder and don't drift on reload.

### 8.5 Output
- **PDF** (`techPackPDF.js`, jsPDF, A4 landscape): one page per step; **images are
  pre-resolved to inline data URLs** so a recipient opening it later doesn't hit expired
  signed URLs; skipped pages get a diagonal "PAGE NOT USED" overlay. Specialized renderers
  for construction-detail and stitching pages match the editor's aspect locks
  (`CALLOUT_MAIN_RATIO 1.5`, support `1.0`, narrow reference `0.44`).
- **SVG** (`techPackSVG.js`): hand-written XML, a compact ~7-page summary, editable as live
  text in Illustrator (no font embedding / clipping-mask issues — a deliberate choice over
  PDF for editing).
- **`techPackViews.js`:** AI flat-lay / ghost-mannequin generation + image-entry format
  conversion. **`techPackDiff.js`:** a curated `TRACKED[]` field list diffed on save to
  label revision-history changes.

### 8.6 Store specifics (`techPackStore.js`)
Same local-first dual-write as the atoms, with the most hardened save path in the codebase:
upsert (self-heals missing rows) with a **retry ladder** — JWT-expiry refresh, **RLS id
rotation** (`adoptAndRotate` → returns `idChanged:{from,to}`, builder updates its hash),
transient-network retries, and **schema-drift column-stripping**. Soft delete / restore /
**purge** (row + Storage), `duplicate` (re-signs images under a new owner so neither pack
breaks the other; auto-increments `productNumber`), throttled **version snapshots** on save.

---

## 9. Production — POs, BOM snapshots, atom usage, drift

Files: `src/components/production/ProductionDetail.jsx`, `ProductionList.jsx`,
`src/utils/productionStore.js`, `poAllocations.js`, `poScheduler.js`. (`po_page_v3.jsx` at
repo root is an older reference, not the live module.)

### 9.1 Purchase Order (`purchase_orders`)
`code = PO-{year}-{seq}`; **status machine** enforced by `assertLegalTransition` and only
mutated via `transitionPO()` (`updatePO()` refuses status changes):
`draft → placed → in_production → received → closed` (+ `cancelled`). Key fields:
`style_id`, `vendor_id` (a **name**), `units`, `unit_cost_usd` (internal), `lead_days`,
`size_break{}`, `payment_schedule[]` (deposit/mid/final), `freight_method`,
`expected_landing`, timestamps per transition, `total_cost_actual` (set on close).

### 9.2 BOM snapshot (`bom_snapshots`) — immutable
Auto-created **on `draft → placed`**: a frozen deep copy of the style's fabrics/trims/labels
+ pack metadata at that moment. **Append-only** — `updateBOMSnapshot()` throws. This is what
drift detection and actuals trace back to.

### 9.3 Atom usage (`atom_usage`) & drift (`drift_logs`) — append-only
On `→ closed`, the operator's actuals are written as `atom_usage` rows (`atom_type/id/name/
code/version`, `lot`, `units`, `unit_cost_usd`, `lead_days`, `defect_pct`, `qc_photo_urls`).
`recomputeAtomRollups()` blends the **last 3 usages** per atom into weighted KPIs that
surface on the treatment/atom cards. `drift_logs` records LoRA-prediction-vs-actual
(`score_pct`, predicted/actual gradients, `retrained`); >8% flags a retrain. Both reject
update/delete at the store layer.

### 9.4 Allocation & scheduling
- **`poAllocations.js` — `buildPOArrivalsByVariant()`:** maps open POs onto Shopify variants
  for inbound forecasting. Resolution order: explicit `variantMappingStore` mapping →
  fuzzy style-name match (auto-registers an `auto-fuzzy` mapping for operator review).
  Splits PO units across sibling variants **weighted by sales velocity**.
- **`poScheduler.js` — `schedulePO()`:** legacy cashflow-derived timeline (production 35d,
  sea 35d / air 9d, final payment +30d) producing a 3-milestone payment schedule.

---

## 10. Vendors — internal management & the external portal

### 10.1 Internal vendor management
`VendorManager.jsx` + `vendorLibrary.js` (see §5.5). Holds cost-sensitive fields
(`samRateUsdPerMin`, `markupPct`, `rating`, internal `notes`). Vendor names that appear in
packs but lack a record show as empty cards (`_hasRecord:false`).

### 10.2 The vendor portal (hard isolation)
Served at **`/vendor/*`** with **session-based Clerk auth and React-Router routes — NOT hash
routing**. Code in `src/components/vendor/`; data exclusively via `vendorPortalStore.js`.
The portal must **never** expose cost/margin, ratings, internal notes, or any other vendor's
data. Enforcement is layered:

- **`scopedQuery(vendorId, qb)`** appends `.eq('vendor_id', vendorId)` to every query and
  **throws if `vendorId` is missing** (crash loudly > leak silently).
- **`redact()`** strips `REDACTED_PO_FIELDS` / `REDACTED_BOM_FIELDS` (all cost/internal
  fields) at the store layer.
- **Module boundary:** vendor components import **only** `vendorPortalStore` / `sampleStore`
  / i18n / Clerk — never `productionStore`, `vendorLibrary`, or `techPackStore`. Supabase
  **RLS** is the server-side backstop; JS redaction is defense-in-depth.
- **Identity:** vendor users carry `vendor_id` (the name) in Clerk `publicMetadata`; the
  admin side (`vendorUserStore.js`, never imported by the portal) invites/revokes via an
  edge function and the `vendor_users` table.
- **i18n:** every portal string goes through the i18n layer (`en`, `zh-CN`); dates/numbers
  via `Intl.*`. CJK gets line-height ≥1.6 and a Noto/PingFang/YaHei fallback stack.

### 10.3 Sending to a vendor
`SendToVendorButton` → `SendPOModal` (creates a PO and **immediately places it**, which
freezes the BOM snapshot and fires a notification — irreversible) or `SendSampleModal`
(creates a `sample_requests` row). `vendorNotificationStore.js` writes an **append-only**
`vendor_notifications` audit row and calls a `vendor-notify` edge function fire-and-forget
(email never blocks the placement). Sample verdicts: Pending/Approved/Rejected/Resubmit.

---

## 11. Infrastructure — routing, storage, sync, versioning

### 11.1 Routing (`plmRouting.js`, `plmDirectory.js`, `PLMView.jsx`)
Internal PLM is **hash-routed** under the `product` tab. Canonical grammar:

```
#product/library/<atom>[/<packId>[/<step>]]     atoms: cut-sew (default), fabrics, colors,
#product/styles[/<packId>[/<step>]]                    trims, treatments, embellishments,
#product/production[/<poId>]                            vendors, variant-mapping
#product/storage-health
```

`step` is **1-indexed in the URL, 0-indexed in state**. `setPLMHash` (pushState + manual
popstate dispatch) for navigation; `replacePLMHash` for in-builder step changes (no
back-stack pollution); `normalizeLegacyHash()` rewrites old `#plm/…` / single-word routes
(`#product/components`, `#product/factories`, …) once on load so bookmarks never break.
`plmDirectory.js` is the cross-store registry of names/ids used for vendor reconciliation and
backup. `PLMView.jsx` parses the hash and orchestrates Library/Styles/Production/StorageHealth.

### 11.2 Local store engine (`localDb.js`)
IndexedDB (`cashmodel_local`, store `kv`) with an **in-memory cache** hydrated once at boot
(synchronous reads). Writes are debounced/coalesced and flushed off the render thread.
**Lazy migration:** on first access of a legacy localStorage key it imports the value into
IDB; for `RECLAIMABLE_KEYS` (all PLM + production keys) it then deletes the localStorage copy
**after** the IDB commit, freeing the old ~5 MB quota. Falls back to localStorage if IDB is
unavailable. API: `getCollection/setCollection`, `getBlob/setBlob`, `removeKey`, `hydrate`,
`flush`.

### 11.3 Assets / images (`plmAssets.js`, image components)
Large binaries live in the private Supabase **`plm-assets`** bucket, **not** as base64 in
JSONB. Path = `{orgId}/{scope}/{ownerId}/{slot}-{uuid}.{ext}` (scopes: component-packs,
tech-packs, fabrics, patterns, treatments, embellishments, colors, vendors, po).
`uploadAsset()` compresses to ≤2400px WebP@0.92; **local-first fallback** converts to a
base64 data URL with a `_pendingUpload` flag if the cloud write fails, so the photo always
renders and migrates later. **Signed URLs** are cached (7-day TTL) in memory + localStorage
and **invalidated on org switch** (App.jsx). `persistableImage()` strips transient fields and
**rejects ghost entries** (no `path` and no `data`). Components: `MultiImageSlot` (labeled
galleries / swatches), `SimpleImageSlot` (single + crop via `CropModal`), `FileSlot`
(non-image attachments → `uploadFile`), `ImageAnnotator` (red-box/text overlays),
`CoverImagePicker`/`CoverThumb` (cover resolution across all three storage shapes),
`VariantMapper` (Shopify variant ↔ style mapping).

> **Image-cache lesson (don't reintroduce):** the service worker caches image **bytes**
> (CacheFirst, cache `fr-plm-images-v2`, `ignoreSearch` so a re-signed `?token` hits the same
> bytes). It must cache **only HTTP 200** responses and normalize fills to
> `mode:'cors', credentials:'omit'`. The old v1 rule cached opaque (status-0) `<img>`
> responses, which then poisoned every later `cors` `fetch()` of the same object (AI views,
> PDF export). `main.jsx` purges the orphaned v1 cache at boot (`purgeLegacyImageCache.js`).

### 11.4 Cloud sync (`atomCloudSync.js`, `syncQueue.js`, `conflictBackup.js`, `connectivity.js`)
- **`atomCloudSync.robustUpsertAtomBatch()`** is the hub for atom writes. The #1 cross-device
  bug was **silent RLS failures** from a stale JWT `org_id`; the fix: derive org from the JWT
  claim itself, `ensure_org_exists()` RPC, force-refresh the JWT on mismatch, one RLS retry,
  and **schema-drift column-dropping**. Records a sync-event ring buffer for diagnostics.
- **`syncQueue.js`** is the durable outbox: coalesces by `{table,id}` (newest `updated_at`
  wins), backs off `[0,1,3,8,20,60]s`, drains on reconnect via `connectivity.onConnectivityChange`.
  The flusher is registered by `atomCloudSync` to avoid circular imports.
- **`conflictBackup.js`** stashes last-write-wins losers (`cashmodel_conflict_backups`,
  capped) so nothing is silently lost; surfaced + restorable in `SyncDiagnosticsPanel`.
- **`StorageHealthPanel` / `SyncDiagnosticsPanel`** expose ghosts/orphans/broken refs, the
  sync log, last error per table, and a force-resync.

### 11.5 Versioning (`versionHistoryStore.js`, `VersionHistoryPanel.jsx`)
A **local append-only version vault** (`cashmodel_version_history` in IDB). `snapshotVersion()`
is called on meaningful saves and on conflict losers (`reason: save|clash-backup|restore`),
**throttled 90s** (rolls the latest snapshot forward within the window; skips identical
`_sig`), capped 20/record and 400 global. The panel lists versions newest-first with a
**Restore** that loads a past snapshot back into the open builder — current work stays in the
list, so restore is always reversible. This replaced the collaboration conflict prompts.

### 11.6 App integration (`App.jsx`)
Lazy-loads `PLMView` (`lazyWithReload` for stale-chunk auto-recovery). `OrgGate` requires a
Clerk org before rendering and **clears the signed-URL cache on org switch** (anti-leak).
RLS everywhere enforces `organization_id = jwt_org_id()`; Storage paths are org-prefixed.

---

## 12. Supabase schema & edge functions (PLM-relevant)

**Migrations** (chronological highlights, in `supabase/migrations/`):
- `…plm_tables` — core tables: `tech_packs`, `component_packs`, `fabrics`, `patterns`,
  `treatments`, `embellishments`, `purchase_orders`, `bom_snapshots`, `atom_usage`,
  `drift_logs`.
- `…org_cloud_storage` — multi-tenant layer: `jwt_org_id()`, `organizations`,
  `user_org_memberships`, `colors`, `vendors`, `org_settings`, `app_state`; adds
  `organization_id` + org-scoped RLS to every table; re-keys `user_integrations` to
  `(org_id, provider)`.
- `…plm_assets_storage` — the private `plm-assets` bucket + org-folder RLS.
- `…plm_soft_delete` — `deleted_at` + trash semantics.
- `…plm_cover_image_*` — cover-image columns + backfill.
- `…fabrics_yards_to_meters`, `…fabric_pricing_kg_cny`, `…fabric_shrink_specs` — fabric unit
  & pricing evolution (yards→meters, add CNY-per-kg, directional shrink).
- `…plm_atom_schema_drift_fix` — **critical**: added ~15 missing atom columns that had been
  causing silent INSERT failures (the cross-device sync killer). Must be applied.
- `…vendor_portal`, `…org_vendor_settings`, `…vendors_sam_rate`, `…vendors_archived_at`,
  `…variant_mappings` — vendor portal + vendor cost fields + Shopify mapping.
- `…record_locks` — single-writer locks (table + acquire/heartbeat/release RPCs, 90s TTL).
  **Present but intentionally not enforced** in the builders (solo-operator direction).

**Edge functions** (`supabase/functions/`): `anthropic-proxy` (org-scoped Claude calls — used
by every PLM AI feature), `purge-plm-trash` (nightly hard-delete of `deleted_at` rows + their
Storage objects after retention), plus the non-PLM proxies (fal/meta/plaid/mercury/slack/etc.).

---

## 13. Conventions & hard rules (what an agent must not break)

- **Folder discipline.** Every feature lives in its own folder; PLM library/builder code in
  `src/components/techpack/`, production in `…/production/`, vendor portal in `…/vendor/`.
  **One store file per data type** in `src/utils/`. Cross-module communication goes **through
  stores only** — a `vendor/` component must not import from `production/`.
- **Protected builders.** `TechPackBuilder.jsx`, `ComponentPackBuilder.jsx`,
  `TreatmentBuilder.jsx` are carefully architected — **additive changes only** unless
  explicitly approved. Don't structurally refactor them.
- **Append-only collections** (reject UPDATE/DELETE at the store layer): `atom_usage`,
  `state_transition`, `agent_interaction`, `bom_snapshot`, `tracking_audit`,
  `vendor_notifications`. Corrections = a new row.
- **No hard delete of records.** Atoms archive; packs/styles soft-delete (`deleted_at`) →
  trash → purge (the only true delete, which also removes Storage assets).
- **Never discount.** This is a permanent brand stance — **no markdown logic, sale-price
  fields, or discount engines anywhere**. Overstock levers are pause-reorder / hold / archive
  at full price. (Mostly relevant to Inventory, but applies brand-wide.)
- **Vendor surfaces never see cost/margin/ratings/other-vendors** — enforced at the query
  layer via `scopedQuery` + `redact` + RLS, not just the UI.
- **Naming.** Components PascalCase, utils camelCase. IDs are prefix-based UPPER-hyphenated
  (§5.4). DB-shaped foreign keys are `snake_case` `{thing}_id`; React props/vars camelCase.
- **Brand/design system is part of the spec.** Salt `#F5F0E8` background, Slate `#3A3A3A`
  text, Sand `#EBE5D5` accent; Cormorant Garamond headings, General Sans body, monospace for
  IDs/codes; cards = white fill + 0.5px `rgba(58,58,58,.15)` border + 8px radius. **No emojis,
  no off-palette colors, no heavy shadows, no popups.** UI work is **mockup-first**
  (`docs/mockups/`) and approved before any JSX.
- **`data` shape only grows** (tech packs & component packs) — never rename/remove a field, so
  old records keep loading. Keep `STEPS`/`STEP_FNS`/`PAGE_FNS`/PDF/SVG indices in sync.
- **Verify before claiming done:** `npm run build` (the real gate) and the self-test
  (`node scripts/selftest.mjs` / `npm run selftest`). Don't over-deploy; batch changes.

---

## 14. Notable gotchas & "minor decisions" worth knowing

- **`vendor_id` is a name string, not a UUID.** It's the join key across POs, treatments,
  samples, notifications, vendor users. Renames cascade locally; cloud heals on next save.
- **Colors are name-keyed and propagate live** (no snapshot) — editing a color updates every
  pack that references it by name. (Fabric color *swatches* are likewise resolved at render
  time, so re-rendering a pack picks up new swatches unless captured.)
- **Cost climbs during library resolution** — only the settled `data.totalUnitCost` is
  persisted (the `costInputsReady` gate); cards read the persisted value.
- **Two storage shapes for every image** (legacy `data:` base64 vs Storage `path`) plus
  transient blob state — `AssetImage`/`CoverThumb`/resolvers handle all of them; legacy data
  URLs lazily migrate to Storage on next edit.
- **Schema cache misses** (PostgREST hasn't reloaded after a migration) look like "column not
  found" → stores drop the column and retry. Reactive, not proactive.
- **`navigator.onLine` is not trusted** — the flush attempt itself is the arbiter of
  connectivity.
- **PO placement is irreversible** from the UI (snapshot frozen + notification sent).
- **The legacy "patterns" concept was replaced by Cut & Sew** (route redirects + a stale
  `patterns` table remain).
- **`po_page_v3.jsx`, `fr-techpack-builder.jsx`, `fr-inventory-portal.tsx` at repo root** are
  old reference artifacts, not the live modules.

---

## 15. History & current direction (so you don't re-litigate decisions)

- **Origin (Mar–Apr 2026):** the tech pack started as a 14-page A4-landscape template with
  English + Chinese (CID-font) PDF output and an SVG-for-Illustrator path; the brand
  questionnaire/factory registry live in `FR_TechPack_SKILL.md`. Chinese rendering requires a
  CJK CID font for **every** text draw (Helvetica silently renders nothing for CJK).
- **Phased buildout (May 2026):** the wizard grew 14→17→19 via `docs/techpack-phases.md`, and
  the PLM gained the atom libraries, component packs, cut & sew, production, and the vendor
  portal. It has since reached **26 steps** (merchandising, BOM/construction splits, the
  internal cut-sew cost page).
- **Local-first rework (Jun 2026):** the big architecture pivot in §3/§11 — IndexedDB engine,
  code-splitting, PWA, image-byte caching, robust RLS-aware sync, conflict/version vault.
- **Solo-operator direction (current):** collaboration/locking removed; cloud demoted to
  silent two-machine sync; version vault replaces conflict prompts.
- **Open/known items:** throttle the background cloud read-sync to ≤ once / 10 min with a
  manual "Sync now"; finish a portable `.techpack` export/import bundle; clean up a few broken
  vendor-logo references; (bigger, separate) an "agent" layer modeled on the read-only
  Inventory agent + `agent_interaction` append-only table.

---

## 16. File map (where to look)

**Tech Pack (Style):** `techpack/TechPackBuilder.jsx`, `TechPackSteps.jsx`,
`TechPackBOMSteps.jsx`, `TechPackPagePreview.jsx`, `TechPackPrimitives.jsx`,
`techPackConstants.js`, `TechPackList.jsx` · utils `techPackStore.js`, `techPackPDF.js`,
`techPackSVG.js`, `techPackViews.js`, `techPackDiff.js`.

**Atoms:** `Fabric*.jsx`/`fabricStore.js`/`fabricLibrary.js`/`aiFabricExtract.js`;
`Treatment*.jsx`/`treatmentStore.js`/`treatmentLibrary.js`/`aiTreatmentExtract.js`;
`Embellishment*.jsx`/`embellishmentStore.js`/`embellishmentLibrary.js`;
`ColorPaletteManager.jsx`/`colorLibrary.js`/`Swatch*.jsx`;
`VendorManager.jsx`/`vendorLibrary.js`.

**Component Packs:** `ComponentPack*.jsx` · `componentPackStore.js`,
`componentPackConstants.js`, `componentPackExport.js`.

**Cut & Sew:** `CutSew*.jsx`, `ImageAnnotator.jsx` · `cutSewStore.js`, `cutSewLibrary.js`,
`cutSewAnnotations.js`, `aiLaborCost.js`, `aiLaborCostChat.js`.

**Production:** `production/ProductionDetail.jsx`, `ProductionList.jsx` ·
`productionStore.js`, `poAllocations.js`, `poScheduler.js`, `sampleStore.js`.

**Vendor portal:** `src/components/vendor/*` · `vendorPortalStore.js`, `vendorUserStore.js`,
`vendorNotificationStore.js`.

**Infra:** `plmRouting.js`, `plmDirectory.js`, `plmAssets.js`, `localDb.js`,
`atomCloudSync.js`, `syncQueue.js`, `conflictBackup.js`, `connectivity.js`,
`versionHistoryStore.js`, `purgeLegacyImageCache.js`, `PLMView.jsx`, `StorageHealthPanel.jsx`,
`SyncDiagnosticsPanel.jsx`, `VersionHistoryPanel.jsx` · `src/App.jsx`, `src/main.jsx`,
`src/lib/auth/`, `src/lib/supabase.js` · `supabase/migrations/*`, `supabase/functions/*`.

**Operating manual & handoffs:** `CLAUDE.md` (law) · `docs/plm-local-first-context.md`,
`docs/techpack-context-handoff.md`, `docs/techpack-phases.md`, `fr_techpack_build_context.md`,
`FR_TechPack_SKILL.md`.
