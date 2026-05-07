# Tech Pack Build-out — Handoff Context (2026-05-07)

This document captures the full state of the Tech Pack rebuild as of the
end of session "Techpack 1.2" so a fresh agent can pick up without
re-reading the entire chat history.

Branch in flight: **`claude/techpack-buildout-VB2ad`**
All PRs squash-merged to **main**.

---

## Wizard structure (22 steps, latest)

```
000  Competitor Landscape       Merchandising  (skippable)
00   Merchandising Preview      Merchandising  (skippable, locks past Merch status)
01   Style Overview             Design
02   Design Overview            Design         (AI view generation lives here)
03   Fabrics                    Bill of Materials
04   Trims                      Bill of Materials
05   Packaging                  Bill of Materials   (skippable)
06   Technical Flat Lay         Cut & Sew
07   Construction Details — 1   Cut & Sew
08   Construction Details — 2   Cut & Sew
09   Seam & Stitch Specs        Cut & Sew     (carries cutSewLaborCost input)
10   Pattern Pieces & Cutting   Cut & Sew
11   Points of Measure (Sample) Cut & Sew
12   Graded Size Matrix         Cut & Sew     (skippable)
13   Colorways                  Embellishments
14   Artwork & Placement        Embellishments
15   Garment Treatments         Treatments
16   Compliance & Testing       QC            (locked until Pre-Production)
17   Quality Inspection (AQL)   QC            (locked until Pre-Production)
18   Labels & Packaging         Packaging     (locked until Pre-Production)
19   Order & Delivery           Logistics     (locked until Pre-Production)
20   Revision History           Sign-off
```

`STEPS[i].icon` is the user-facing page number (`000`, `00`, `01`–`20`).
`TOTAL_PAGES = 20` — the two Merchandising pages are pre-pack and don't
count toward the numbered total.

`STATUSES = ['Merchandising', 'Design', 'Sampling', 'Testing', 'Pre-Production', 'Production', 'Released']`.
`LOCKED_STEPS = {17, 18, 19, 20}`. `MERCH_STEPS = {0, 1}` lock once the
status leaves `Merchandising`.

---

## Where things live

- **`src/components/techpack/techPackConstants.js`** — `STEPS` array,
  `STATUSES`, `LOCKED_STEPS`, `MERCH_STEPS`, `isStepLocked()`,
  `isMerchLocked()`, `DEFAULT_DATA`.
- **`src/components/techpack/TechPackBuilder.jsx`** — wizard shell,
  `phaseCosts` map (sidebar pills), `componentsById` / `fabricsById`
  resolvers (with `useFocusRefresh()` so library edits land on next
  render).
- **`src/components/techpack/TechPackSteps.jsx`** — every step
  component except BOM. Holds the AI view generation modal, the
  Design Overview re-render flow, the construction-detail card grids,
  and the Generate-Views button-disable guard.
- **`src/components/techpack/TechPackBOMSteps.jsx`** — Fabrics, Trims,
  Packaging. Library-first picker modal, fabric color picker modal,
  vendor lookup, cost roll-ups per slot + section subtotal.
- **`src/components/techpack/TechPackPagePreview.jsx`** — live SVG
  preview. Every page renderer mirrors the editor; `PageFrame` shows
  the style number top-right + page number.
- **`src/utils/techPackPDF.js`** — A4 landscape PDF export. Now has a
  `bomCard` helper with cover image + clickable `View pack ↗` link
  annotation via `doc.textWithLink()`.
- **`src/utils/techPackSVG.js`** — compact 6-page summary SVG
  (separate from the live preview).
- **`src/utils/falImageGen.js`** — central skill-driven image
  generator. Brand color descriptions, photography defaults, FLUX/NB2
  queue plumbing, Claude Vision analyzer, Ghost Mannequin + Flat Lay
  templates.
- **`src/utils/techPackViews.js`** — thin wrapper over `falImageGen`
  for the Design Overview AI generation. Exports `generateGarmentView`,
  `analyzeGarmentImage`, `imageEntryToDataUrl`.
- **`fal-image-gen.skill`** at repo root — the user-supplied skill spec
  used as the source of truth for the prompt templates.

---

## BOM data model

Pack data adds three reference arrays beyond the legacy free-text shape:

```js
pickedFabrics:   [{ fabricId, role, notes,
                    colorIndex, colorLabel, colorHex, colorUrl }]
pickedTrims:     [{ componentId, role, notes, quantity }]
pickedPackaging: [{ componentId, role, notes, quantity }]
cutSewLaborCost: ''  // labor $ per garment, drives Cut & Sew phase pill
competitors:     [{ brand, product, url, price, currency, features, notes }]
competitivePositioning: ''
designContextPrompt: ''
designStyle:     'ghost-mannequin' | 'flat-lay'
designBgColor:   FR color name
constructionDetailsPage1 / Page2: [{ num, title, description }] × 4
```

Library rows are NEVER copied into the pack — only IDs. Resolvers fetch
fresh on every render via `useFocusRefresh()` and append `?v=updated_at`
to cover URLs to bust the browser image cache. The resolvers also call
`invalidateAssetUrl(path)` to drop the in-process signed-URL cache.

### Field name traps
- Fabric vendor is `mill_id` (top-level), not `supplier`.
- Fabric cost is `price_per_meter_usd` (top-level), not `costTiers`.
- Fabric cover falls back through `cover_image` → `front_image_url`.
- Component pack vendor is `data.materials[0].vendor` or `data.supplier`.
- Component pack cost is `data.costTiers[0].unitCost`.
- Component pack length / size live on `data.materials[0].length` / `.size`
  (added to `componentPackConstants.emptyMaterial()` this session).

---

## Cost roll-up

```
billOfMaterials = fabrics + trims (qty × unit) + packaging (qty × unit)
                + legacy free-text bom (kept for old packs)
cutSew          = data.cutSewLaborCost
embellishments  = colorway library cost (existing computeColorwayCost)
treatments      = sum of treatment library cost across data.fabrics[].treatment_id
totalUnitCost   = bom + cutSew + embellishments + treatments + colorways
```

Both `phaseCosts` (sidebar pills) and the header `Total Unit Cost` pill
recompute off this. FOB variance and price-tier delta also recompute.

---

## AI view generation (Design Overview, step 02)

- Uses `fal-ai/nano-banana-2/edit` when reference images are uploaded;
  `fal-ai/nano-banana-2` otherwise.
- Input shape: per-view source slots + treatment refs + embellishment
  refs + free-form context.
- Cover priority for the trim/packaging cards on BOM:
  `data.cover_image` only (no construction-diagram / sketch fallback).
- "Use These Views" button has an `accepting` guard that prevents the
  click-stacking bug that filled the slots with duplicates.

API keys flow through Supabase Edge Function proxies
(`anthropic-proxy`, `fal-proxy`); the browser never holds a key.

---

## Current visual / UX state

**BOM Trims & Packaging cards** (editor + live preview SVG + PDF):
1. Cover image (4:3, contain, top of card)
2. Trim Type (auto-pulled from `data.componentType`)
3. Component name + `View pack ↗` link
4. Qty input
5. Unit cost · qty multiplier · line cost row

**Fabrics card** (editor + live preview SVG):
1. Cover image (large, top of card)
2. Area of product: BODY / LINING / RIB select
3. Fabric name (NOT the SKU code)
4. Selected colorway swatch + label (or "Pick colorway" button)
5. Composition + weight + weave
6. Vendor block: name (bold) + primary contact + email + phone
7. Cost / m row at bottom

**Sidebar phase pills** show running cost beside each phase header.
**Header "Total Unit Cost" pill** sums everything and runs the FOB
variance pill.

---

## Open work / known issues

- The legacy free-text `fabrics`, `trimsAccessories`, `labelsBranding`,
  `packagingItems` fields still exist in `DEFAULT_DATA` for backward
  compat. Old packs render their data; new packs use the picker fields.
  Cleanup is deferred until every existing pack is migrated.
- `IMG_STEPS` set in `techPackConstants.js` is imported by
  `TechPackBuilder` but not actually used — was always dead code.
  Leaving it alone for now.
- The compact SVG summary export (`src/utils/techPackSVG.js`) only
  shows ~7 representative pages and was not updated for the BOM split
  visually; its `skipIf()` indices were updated for the +2 / +1
  shifts but its body is still the old condensed layout.
- `docs/techpack-phases.md` Status table is stale — every phase 1-7
  is shipped.

---

## Conventions reinforced this session

- **Editor → Live preview → PDF parity is non-negotiable.** Every UI
  affordance the designer touches must land in both the SVG live
  preview and the downloadable PDF. Multiple times this session the
  user pushed back when a change only landed in the editor.
- Library-first: components / fabrics / packaging cannot be added
  from inside the BOM. They must exist in the library; the BOM only
  picks references.
- "View pack ↗" on every BOM card. The factory rep clicks through
  to the full Component Pack / Fabric library page for the spec.
- Cost is the spine. Every cost-bearing line item must roll into the
  phase pill and the Total Unit Cost.

---

## Recent PRs (squash-merged to main, latest first)

- #60 — simplify BOM cards, View pack hyperlink in editor / SVG / PDF
- #59 — mirror fabric editor card to live preview SVG
- #57 — fabric vendor + color picker + cost / m label
- #54 — read fabric cost from price_per_meter_usd, fix grid clipping
- #52 — comprehensive cost roll-up — phase pills, slot cards, labor
- #51 — BOM 2x3 grid + stale-image fix + Design Sketch fallback
- #50 — trim slot wider 3:2 image, per-card pack link
- #48 — trim slot full image, measurement diagram, quantity
- #45 — rename Role→Trim Type, color from colorways, self-heal
- #43 — auto-fill specs, compact grid, length/size, live preview
- #41 — picker fixes — populate library, resolve cover paths
- #40 — BOM phase split (Fabrics/Trims/Packaging) + style # in header
- #39 — device-frame Merch Preview, lockable, skippable, auto-open cover
- #38 — Merchandising phase (Competitor Landscape + Merch Preview)
- #37 — restructure Cut & Sew (flatlays moved + dual construction details)
- #36 — Website Preview placeholder on Design Overview
- #35 — regen feedback + single-image slots + 2:3 + bg color fix
- #34 — AI view generation skill engine + ghost mannequin + per-view refs
- #33 — fetch fal response_url + indeterminate loading bar
- #32 — testProxy distinguishes proxy 404 from upstream 404
- #31 — progress bars + NB2 payload fix + better error surfacing
- #30 — imageEntryToDataUrl resolves path via getAssetUrl
- #29 — AI view generation + size matrix fixes
- #28 — simplify Design Overview to 3 garment-view photos in 2:3
- #27 — Phase 7 — Sign-off & revision diff
- #26 — Phase 6 — Treatments deepening
- #25 — Tech Pack Phases 4+5: Color/Artwork split + Compliance/QC split
- #24 — initial Phases 1-3 (Materials/Construction/POM splits)
