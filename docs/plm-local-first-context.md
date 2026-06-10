# Foreign Resource ERP — Deep Context & Handoff

_Last updated: 2026-06-04. Working branch: `claude/amazing-cerf-4UOnb`._

This document is a full-context handoff for any AI agent (or human) picking up
work on this ERP — especially the **PLM performance / local-first** thread and
the **AI-agent system** the operator wants to build next. Read this first, then
read `CLAUDE.md` (the operating manual). Both override default behavior.

---

## 1. What this app is

A custom apparel ERP for **Foreign Resource** (operator: matias@foreignresource.com):
- **Cash** — 13/58-week cashflow model (the original app; `src/context/AppContext.jsx`).
- **PLM** — Product Lifecycle Management: styles (tech packs), and a Library of
  reusable atoms (fabrics, trims/component-packs, treatments, embellishments,
  cut & sew, vendors, colors) + Production (POs, BOM snapshots).
- **Inventory** — cockpit, sell-through, OTB, forecast, read-only AI agent.
- **Creative Engine** — ad/creative pipeline.
- **Vendor portal** — `/vendor/*`, auth-scoped, never exposes cost data.

## 2. Stack & hosting (the facts)

- **Vite 8 + React 19**, plain JavaScript + JSDoc. **No TypeScript, no Zustand, no Zod.**
- **Hosting: GitHub Pages** (static SPA), `base: '/cashmodel/'`, deployed by
  `.github/workflows/deploy.yml` on push to `main`. Live at
  `https://matasmillion.github.io/cashmodel/`.
- **Auth: Clerk** (`@clerk/clerk-react`), with **Organizations** = multi-tenancy.
  All store/util code reads the user/org synchronously off `window.Clerk` via
  `src/lib/auth`. Never import `@clerk/clerk-react` directly — go through `src/lib/auth`.
- **Backend: Supabase** — Postgres + **RLS keyed on the Clerk JWT `org_id` claim**
  (`public.jwt_org_id()`), a Storage bucket `plm-assets`, and ~24 Edge Functions
  (anthropic/fal/shopify/meta/plaid/mercury/slack proxies, etc.). **Now on the Pro
  plan ($25/mo)** — daily backups + headroom (previously free tier, which throttled
  and amplified every cloud op).
- **PWA**: installable + offline via `vite-plugin-pwa` (`vite.config.js`). Service
  worker precaches the app shell and (new) caches PLM image bytes.

## 3. The core architecture: LOCAL-FIRST (cloud = backup, not critical path)

The defining principle, learned the hard way this session:

> **Everything the user sees comes from local. The cloud is a silent background
> backup/sync — never on the read, render, or image path.**

### Local store engine — `src/utils/localDb.js` (NEW, the foundation)
- IndexedDB-backed, with an **in-memory cache** (synchronous reads) hydrated once
  at boot (`hydrate()` in `src/main.jsx`, awaited before render).
- API: `getCollection(key)`/`setCollection(key, arr)` (arrays of records),
  `getBlob(key)`/`setBlob(key, value)` (objects/maps), `removeKey`, `flush`.
- Writes are async + coalesced; **no ~5 MB localStorage quota, no synchronous
  whole-collection JSON.stringify** (the old pain).
- **Lazy, staleness-free migration**: on first access of a key still in
  localStorage, it imports that value into the cache + IndexedDB. Keys in
  `RECLAIMABLE_KEYS` then have their localStorage copy deleted **after** the IDB
  commit succeeds (frees the old quota; data is also in the cloud, so no loss window).
- Graceful fallback to localStorage if IndexedDB is unavailable.

### What's converted to the engine
- ✅ **Cash-model state** (`AppContext` `cashmodel_state`).
- ✅ **Entire PLM library + production**: techPackStore, componentPackStore,
  treatmentStore, fabricStore, embellishmentStore, cutSewStore, sampleStore,
  vendorLibrary, colorLibrary, plmDirectory, productionStore — **and all their
  shared readers**: atomCloudSync (cloud→local mirror), plmBackup,
  atomSyncDiagnostics, StorageHealthPanel. (A key read by multiple files must be
  converted across ALL of them together, or local/cloud desync — that's the rule.)
- ❌ **NOT converted (still on localStorage)**: Inventory stores, Creative Engine
  stores. Same treatment can be applied later; same all-readers-together rule.

### Sync / backup mechanics
- **Writes**: PLM `saveX()` writes local first (instant), then does the cloud
  upsert (with RLS/JWT/schema recovery), falling back to the durable outbox.
  Writes only happen on edit (already activity-gated).
- **Durable outbox**: `src/utils/syncQueue.js` (coalescing, backoff, survives
  reload) + generic flusher `src/utils/atomCloudSync.js` → `executeCloudWrite`
  (LWW by `updated_at`, conflict backup, org reconciliation).
- **Conflict safety**: lost LWW edits are stashed in `conflictBackup` (surfaced in
  Sync Diagnostics) — no silent data loss.

### Images — `src/utils/plmAssets.js`
- Stored in Supabase Storage; resolved via **signed URLs** (now **7-day TTL**).
- **Image BYTES are cached locally** by a service-worker CacheFirst rule scoped to
  `/storage/v1/object/` (see `vite.config.js`), matched with `ignoreSearch` so a
  re-signed URL (same object, new `?token`) hits the same cached bytes. → photos
  load instantly after first view, work offline, never re-download.

### Locking (single-writer check-out) — hard lock, auto-expire only
- DB: `supabase/migrations/20260603000000_record_locks.sql` — `record_locks` table
  (PK `(resource_type, resource_id)`) + atomic RPCs `acquire_record_lock`
  (steal-if-stale-or-mine), `heartbeat_record_lock`, `release_record_lock`. 90s TTL.
- Client: `src/utils/recordLockStore.js` + `src/hooks/useRecordLock.js` +
  `src/components/RecordLockBanner.jsx`. **Per-tab** holder id (sessionStorage), so
  the same account on two computers/tabs locks to one live session.
- Wired into **FabricBuilder** (fabric) + **TechPackBuilder** (style). Same 3-line
  pattern (hook + banner + `fieldset disabled` + save-gate) extends to treatments /
  component packs / POs.
- ⚠️ **The migration must be applied to Supabase** (SQL editor) to activate locking.
  Until then it safely no-ops and editing stays unblocked.

## 4. The single root cause (first-principles)

Every PLM perf failure this session traced to **one** thing:

> The PLM put the **cloud on the critical path** for things that should be purely
> local — most damagingly **images** and **change-notifications** — and fired
> change-events far more often than data actually changes, on a backend (free tier)
> too small to hide the latency, behind a web-deploy model (content-hashed chunks)
> that breaks long-lived sessions.

The cure is the local-first principle in §3, now largely applied to data + images.

## 5. What shipped this session (merged to `main` unless noted)

In rough order (PR #s):
1. **#154** IndexedDB engine + cash-model migration; **code-splitting** (main bundle 2.8 MB → 335 KB); **PWA**; **single-writer locking** (table + hook + per-tab).
2. **#155 / #156** Installable PWA: PNG icons + an always-visible "Install app" button (`InstallAppButton.jsx`, `pwaInstall.js`).
3. **#157** JWT-expiry fix: proactive token refresh in `getAuthedSupabase` + retry in saves; 8s timeout on first-load list reads so a slow cloud can't hang the UI.
4. **#158** Images self-heal: `getAssetUrl`/`getAssetUrls` refresh the token + retry on a failed re-sign.
5. **#159** Builder live-preview stopped re-resolving images on every focus/sync (reuse by `updated_at`, breaks the re-resolve loop).
6. **#161** **PLM library + production → local-first** (the big store conversion, §3).
7. **#162 / #163** Unit-cost stability: persist the **settled** `data.totalUnitCost` (debounced) and show the persisted value in the builder header → card and builder match, no climbing.
8. **#164** Debounced all six PLM list views (`usePlmStoreRefresh`) → no more re-fetch/re-render churn on every sync tick.
9. **#165** **Image bytes cached locally** (SW CacheFirst); **stale-chunk crash auto-recovery** (`lazyWithReload` + ErrorBoundary auto-reload).
10. **(branch only, not merged)** `npm run selftest` — Node self-test harness, 21 checks green (fake-indexeddb). See `scripts/selftest.mjs`.

## 6. Current state

- **Data + images are local-first** → instant loads, no quota failures, offline-capable.
- **Crashes fixed**: JWT-expired saves, broken images, infinite "Loading…", preview
  reload loop, list churn, stale-chunk deploy crash, unstable card prices.
- **Verified** via `npm run selftest` (logic/integration) + production build. **Not**
  verified by me in a real browser/cloud (no creds here) — operator should smoke-test.

### Operator smoke-test checklist (on the live app, after deploy + hard-refresh)
1. Open a style → Trims: images instant, stay put, no placeholders.
2. Same style in two windows → 2nd is read-only (needs `record_locks` SQL applied).
3. Edit a fabric on one device → appears on another (cloud sync flowing).
4. Card prices match the builder and don't move on reload.

## 7. Open work items (prioritized)

1. **10-minute cloud-check throttle (PLM)** — the operator's "don't re-check the
   cloud while I'm just browsing" rule. *Writes are already activity-gated (only on
   edit).* The win is throttling the background **read-sync** (currently fires on
   every list/record open) to ≤ once per 10 min, with a manual "Sync now". Add a
   `lastSyncAt` guard in each store's `syncFromCloud`/list-sync.
2. **Apply `record_locks` migration to Supabase** (operator action; SQL editor) to
   turn locking on; then extend the lock hook to treatments / component packs / POs.
3. **Inventory + Creative → local-first** (same conversion as PLM; all-readers-together rule).
4. **Portable `.techpack` file** (export/import a bundle of record + images that
   auto-populates on re-import — like `.zprj`/`.psd`). Operator wants this; deferred.
5. **Broken vendor-logo references (3)** in Storage Health — re-upload or remove the
   slots (cosmetic; Dongguan Shengde / Foshan Jufengsheng / Jufeng logos).
6. **AI-agent system (the big new feature the operator wants):** a "Head of
   Inventory" agent that runs daily ERP checks, lives in a dedicated Slack channel +
   a company-wide channel with peer agents (CFO/CPO/COO/Chief of Customer), is fed
   full ERP context, and learns from mistakes (recursive memory). Design not started.
   Foundations that exist: Clerk orgs, Supabase + Edge Functions (incl. slack-proxy,
   anthropic-proxy), a read-only Inventory agent (`src/utils/inventoryAgent.js`) and
   `agent_interaction` append-only table as a model.

## 8. Key files

- Local engine: `src/utils/localDb.js` · boot: `src/main.jsx`
- PLM stores: `src/utils/{techPack,componentPack,treatment,fabric,embellishment,cutSew,sample,production}Store.js`, `vendorLibrary.js`, `colorLibrary.js`, `plmDirectory.js`
- Sync: `src/utils/syncQueue.js`, `src/utils/atomCloudSync.js`, `src/utils/conflictBackup.js`
- Images: `src/utils/plmAssets.js` · SW config: `vite.config.js`
- Locking: `supabase/migrations/20260603000000_record_locks.sql`, `src/utils/recordLockStore.js`, `src/hooks/useRecordLock.js`, `src/components/RecordLockBanner.jsx`
- List de-churn: `src/hooks/usePlmStoreRefresh.js` + the six `src/components/techpack/*List.jsx`
- Builders (PROTECTED — additive changes only): `TechPackBuilder.jsx`, `ComponentPackBuilder.jsx`, `TreatmentBuilder.jsx`
- Auth/Supabase: `src/lib/auth/`, `src/lib/supabase.js`
- Self-test: `scripts/selftest.mjs` (`npm run selftest`)

## 9. Gotchas & conventions

- **CLAUDE.md is law.** One store file per data type; cross-module comms via stores
  only; brand palette is part of the spec (no emojis in UI); **never discount**
  (no markdown logic anywhere); append-only collections (`atom_usage`,
  `state_transition`, `agent_interaction`, `bom_snapshot`, `tracking_audit`).
- **Don't structurally refactor** `TechPackBuilder` / `ComponentPackBuilder` /
  `TreatmentBuilder` — additive only.
- **Deploys rename chunks**; an open old tab now auto-reloads (don't mistake it for a bug).
- **Don't over-deploy.** This session shipped ~17 times in hours; let changes settle
  and batch them. Pre-existing lint debt exists (unused vars, a couple `no-undef` in
  TechPackBuilder) — don't chase it; just don't add new errors. The build (`npm run
  build`) is the real gate; `eslint` is not run in CI.
- Each PLM key may be read by several files (stores + atomCloudSync + plmBackup +
  diagnostics + StorageHealthPanel + vendorLibrary). Convert/reclaim a key only when
  ALL its readers go through the engine.

## 10. How to resume

A fresh session should: read this file + `CLAUDE.md`, confirm it's on branch
`claude/amazing-cerf-4UOnb`, run `npm install` then `npm run build` and `npm run
selftest` to confirm a green baseline, then pick from §7. Do not open a PR unless
asked; commit + push to the working branch and merge via PR only on request.

---

## Addendum (2026-06-10, branch `claude/eager-johnson-mm8g3d`) — direction change: solo operator, delete collaboration

Ported to this branch from `claude/amazing-cerf-4UOnb`. The operator confirmed a
direction change that **completes** the §4 axiom rather than contradicting it:

- **Solo operator for the next 6–8 months**, working across **two personal machines
  (MacBook + PC)**. Chosen model: **local-first + cloud demoted to a silent
  background sync/backup** ("two machines, auto-synced"). The cloud must never be on
  the critical path — never block a save, lock an edit, or overwrite in-progress work.
- **Delete the collaboration layer entirely** (the §3 locking feature + the §7-item-2
  plan to extend it). The three remaining cloud-on-critical-path violations that are
  still biting the operator: (1) single-writer **locking / read-only**, (2) conflict
  **last-write-wins** that discards local edits, (3) **auth-gated image upload** that
  throws-and-drops on a token blip instead of queuing (root cause of the lost
  placement image + the red "Save failed" banner).
- **Add a local version-history vault** (silent per-record backups + a browse/restore
  panel) to replace the scary "Restore mine / Keep theirs" conflict prompt.
- Each fix is verified 5–10× against the `npm run selftest` harness (extended with a
  new check per fix). Work stays on `claude/eager-johnson-mm8g3d`; no PR / no deploy
  to `main` without explicit request.
