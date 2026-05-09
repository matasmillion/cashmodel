# Tech Pack Builder — Phased Buildout

Plan of record for evolving `src/components/techpack/TechPackBuilder.jsx` and
its surrounding utilities from a 14-step wizard into a 19-step wizard. Each
phase ships behind a single PR against `main`, keeps the live preview /
PDF / SVG export aligned, and adds at most one new skippable step.

## Target shape

| Metric | Start | Target |
| --- | --- | --- |
| Wizard steps | 14 | **19** |
| Skippable steps | 0 | **3** |
| Locked-until-Pre-Production steps | 3 (Compliance, Labels, Order) | 3 (same, indices shift) |

A "skippable" step renders the existing **PAGE NOT USED** overlay in the live
preview / PDF when the user adds its index to `data.skippedSteps[]`. The
overlay stays a per-pack toggle, never a permanent removal.

## Status

| Phase | Title | Status | Step delta | Skippable delta |
| --- | --- | --- | --- | --- |
| 1 | Materials split | ✅ shipped (PR #24) | +1 | +1 (BOM-Trims) |
| 2 | Construction split | ✅ shipped (PR #24) | +1 | +1 (Construction-Notes) |
| 3 | POM + Size Matrix | ✅ shipped (PR #24) | +1 | +1 (Size Matrix) |
| 4 | Color & Artwork split | ⏳ planned | +1 | 0 |
| 5 | Compliance & QC split | ⏳ planned | +1 | 0 |
| 6 | Treatments deepening | ⏳ planned | 0 | 0 |
| 7 | Sign-off & revision diff | ⏳ planned | 0 | 0 |

Net: **14 → 19 steps**, **0 → 3 skippable**.

---

## Cross-cutting acceptance criteria

Every phase must, before merge:

1. `npm run build` succeeds with no new errors.
2. `STEPS.length` matches `STEP_FNS.length` in `TechPackSteps.jsx`.
3. `PAGE_FNS.length` in `TechPackPagePreview.jsx` matches `STEPS.length`.
4. `TOTAL_PAGES` in `TechPackPagePreview.jsx` matches `STEPS.length`.
5. `LOCKED_STEPS` in `techPackConstants.js` still points at Compliance,
   Labels, Order (indices update with each phase).
6. `IMG_STEPS` set still covers every step that surfaces an image upload.
7. `techPackPDF.js` issues exactly one `newPage(...)` per `STEPS[]` entry,
   with `stepIdx` matching the wizard index, plus the standalone Cover
   and Packing-List pages that piggyback on existing steps.
8. `techPackSVG.js` (compact 6-page export) updates `skipIf(...)` calls
   to reference the new step indices.
9. The `data` shape only **adds** fields. Never rename, reshape, or
   delete an existing field — old packs must keep loading.
10. Append-only collections (`atom_usage`, `state_transition`,
    `agent_interaction`, `bom_snapshot`) are untouched.

---

## Phase 3 — POM + Graded Size Matrix

**Why now:** the current `data.poms[]` carries one row per measurement
with S/M/L/XL columns hard-coded. Real grading needs:

- Custom size lists (e.g. `XS, S, M, L, XL, XXL` or `W28..W40`)
- Per-size base values, not per-row repeated keys
- A separate page that prints cleanly when the spec sheet travels alone

**Step changes:**

| New idx | id | title | phase | skippable |
| --- | --- | --- | --- | --- |
| 9 | `pom` | Points of Measure (Base Size) | Cut & Sew | no |
| 10 | `size-matrix` | Graded Size Matrix | Cut & Sew | **yes** |

All steps from old index 10 onward shift by +1. `LOCKED_STEPS` →
`[14, 15, 16]`. Step count: 16 → 17.

**Data additions** (in `DEFAULT_DATA`):

```js
gradedSizeMatrix: {
  baseSize: 'M',                  // which column in `poms` is the spec base
  sizes: ['S', 'M', 'L', 'XL'],   // editable list, default = current sizeRange
  grading: [],                    // [{ pomName, perSizeDelta: { S: -2, L: 2, XL: 4 } }]
},
```

`data.poms[]` keeps its current shape — base values come from the
matching size column. The graded page derives full per-size measurements
on the fly using `base + delta`.

**Files touched:**

- `techPackConstants.js` — STEPS, IMG_STEPS, LOCKED_STEPS, DEFAULT_DATA
- `TechPackSteps.jsx` — rename existing `StepPom` to drop graded
  columns; new `StepSizeMatrix` (size list editor + per-POM delta grid)
- `TechPackPagePreview.jsx` — `PageSizeMatrix` SVG renderer; PAGE_FNS
- `techPackPDF.js` — split POM page; render derived per-size table
- `techPackSVG.js` — shift Order skipIf to step 15

**Acceptance:** opening a tech pack with only legacy `poms[]` shows
the new POM page populated as before; the Size Matrix page shows an
empty grid that the user can fill in incrementally.

---

## Phase 4 — Color & Artwork split

**Why now:** today's combined Color & Artwork page tries to fit
colorways, logo placement, and artwork placements into one screen.
Print-on-demand SKUs care about colorways but not artwork; embellished
SKUs care about artwork placement intensely. Splitting makes both
groups reviewable separately.

**Step changes:**

| New idx | id | title | phase | skippable |
| --- | --- | --- | --- | --- |
| 11 | `color` | Colorways | Embellishments | no |
| 12 | `artwork` | Artwork & Placement | Embellishments | no |

All steps from old index 11 onward shift by +1. Step count: 17 → 18.

**Data:** no schema change. `data.colorways[]` lives on the Color page;
`data.artworkPlacements[]`, `data.logoFront`, `data.logoBack`,
`data.logoMethod` move to the Artwork page.

**Files touched:**

- `techPackConstants.js` — STEPS, IMG_STEPS
- `TechPackSteps.jsx` — `StepColor` becomes colorways-only;
  new `StepArtwork` for placements + logo. Both keep the existing
  `images[]` slot keys for the `artwork-front` / `artwork-back` covers.
- `TechPackPagePreview.jsx` — split `PageColor` into `PageColorways` +
  `PageArtwork`
- `techPackPDF.js`, `techPackSVG.js` — shift stepIdx values

**Acceptance:** logo image slots from existing packs still resolve;
the live preview shows two separate pages with content correctly
distributed.

---

## Phase 5 — Compliance & QC split

**Why now:** "Compliance & Quality" today is a single page mixing
regulatory testing standards with vendor-side QC instructions. These
have different audiences (compliance team vs. inspection team) and
different cadences (testing happens once per fabric/colorway; QC
happens every PO).

**Step changes:**

| New idx | id | title | phase | skippable |
| --- | --- | --- | --- | --- |
| 13 | `compliance` | Compliance & Testing | QC | no (locked until Pre-Production) |
| 14 | `quality` | Quality Inspection (AQL) | QC | no (locked until Pre-Production) |

All steps from old index 13 onward shift by +1. `LOCKED_STEPS` →
`[13, 14, 15, 16]` (both compliance and quality lock until
Pre-Production, alongside Labels and Order). Step count: 18 → 19.

**Data additions:**

```js
qualityInspection: {
  aqlMajor: '2.5',          // standard FR default
  aqlMinor: '4.0',
  inspectionStage: 'During Production',
  checklist: [],            // [{ area, criterion, severity }]
  photoRequirements: '',
},
```

**Files touched:** same set as previous phases — STEPS, STEP_FNS,
PAGE_FNS, PDF stepIdx, SVG.

**Acceptance:** existing `testingStandards[]` data stays on the
Compliance page; the new Quality page is empty for legacy packs.

---

## Phase 6 — Treatments deepening (no step change)

Wire BOM fabric rows' `treatment_id` selections (already saved by
`StepBOM`) into the Treatments step so a designer sees:

- Resolved treatment cards (name, code, process summary, drift score
  if any) for every BOM fabric that has a `treatment_id`
- Inline link to open the treatment in the PLM library
- Read-only "applies to" badges showing which fabric component (Body /
  Lining / Rib) uses the treatment

No new step. No data shape changes beyond enriching the live render
on `StepTreatments`.

**Files touched:** `TechPackSteps.jsx`, `TechPackPagePreview.jsx`.

**Acceptance:** a pack that has any fabric with `treatment_id` set
shows resolved treatment cards on the Treatments step; clearing the
`treatment_id` removes the card without touching `data.treatments[]`.

---

## Phase 7 — Sign-off & revision diff (no step change)

Polish the final two steps without growing the wizard:

- Revision History (existing step 14 → 17 after Phases 3–5) gains a
  side-by-side diff between revisions, computed off `data.revisions[]`.
- Sign-off block enforces sequential approval: Designer → Brand Owner →
  Vendor (vendor signature uses the existing `vendorConfirmed` shape).
- A pack with at least one full sign-off record auto-bumps its status
  to `Released` if it isn't already past that.

No new step. No data shape changes.

**Files touched:** `TechPackSteps.jsx` (StepRevision), no PDF / SVG
changes beyond label tweaks.

**Acceptance:** a fully-signed pack flips to `Released`. Revision diff
view renders for any pack with ≥ 2 revisions.

---

## Sequencing notes

- Each phase is independent. They can ship in any order, but the
  index-shift bookkeeping is easier in the listed order because
  Phase 6 and 7 are pure additions and play well with whatever step
  indices are current.
- After every phase, update the **Status** table at the top of this
  doc and the changelog at the bottom of `CLAUDE.md`.
- If a phase needs to skip or invert order, edit this doc in the same
  PR — never let code drift from the plan.

---

## Changelog

- 2026-05-07 — initial plan written. Phases 1 and 2 already shipped
  (PR #24); Phases 3–7 still ⏳ planned.
