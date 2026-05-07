# Tech Pack Buildout — Context Handoff

**Date:** 2026-05-07  
**Branch:** `claude/techpack-buildout-VB2ad`  
**Base:** rebased cleanly onto `origin/main` (commit `5e2567e`)  
**PR #24** — open, pointing at this branch, ready to merge

---

## What has shipped (Phases 1–3 on branch, not yet merged to main)

Phases 1–3 added 3 new wizard steps (17 total, was 14):

| Step index | id | Title | Skippable |
|---|---|---|---|
| 4 | bom-trims | BOM — Labels & Files | ✅ |
| 6 | construction-notes | Construction Notes | ✅ |
| 10 | size-matrix | Graded Size Matrix | ✅ |

### Files changed by Phases 1–3

| File | What changed |
|---|---|
| `src/components/techpack/techPackConstants.js` | STEPS: 14→17 entries; LOCKED_STEPS=`{14,15,16}`; IMG_STEPS=`new Set([3,4,5,6,7,8,9,10,11,12,13,14])`; DEFAULT_DATA gains `attachments:[]`, `gradedSizeMatrix:{baseSize,sizes,grading}` |
| `src/components/techpack/TechPackSteps.jsx` | `import React` added; StepBOM split (labels removed); new StepBOMTrims (labels + FilesPanel); StepConstruction → seam-only; new StepConstructionNotes; new StepSizeMatrix; STEP_FNS=17 entries |
| `src/components/techpack/TechPackPrimitives.jsx` | New `<FilesPanel>` + `<DownloadLink>` components |
| `src/components/techpack/TechPackPagePreview.jsx` | TOTAL_PAGES=17; new PageBOMTrims, PageConstructionNotes, PageSizeMatrix; PAGE_FNS=17 entries |
| `src/utils/plmAssets.js` | New `uploadFile({packId, file})` helper (bypasses image compression) |
| `src/utils/techPackPDF.js` | BOM split, Construction split, new SizeMatrix page; stepIdx values updated throughout |
| `src/utils/techPackSVG.js` | numPages=6; new BOM-labels/files page; skipIf indices updated |
| `src/components/techpack/TechPackBuilder.jsx` | `packId: pack.id` added to stepProps |
| `docs/techpack-phases.md` | Full 7-phase plan document |

---

## Current STEPS array (techPackConstants.js)

```
0  cover          Style Overview              Design
1  design         Design Overview             Design
2  flatlays       Technical Flat Lay Diagrams Design
3  bom            BOM — Fabrics & Trims       Materials
4  bom-trims      BOM — Labels & Files        Materials        skippable
5  construction   Seam & Stitch Specifications Cut & Sew
6  construction-notes Construction Notes      Cut & Sew        skippable
7  sketches       Construction Detail Sketches Cut & Sew
8  pattern        Pattern Pieces & Cutting    Cut & Sew
9  pom            Points of Measure           Cut & Sew
10 size-matrix    Graded Size Matrix          Cut & Sew        skippable
11 color          Color & Artwork             Embellishments
12 treatments     Garment Treatments          Treatments
13 compliance     Compliance & Quality        QC               locked ≥Pre-Production
14 labels         Labels & Packaging          Packaging        locked ≥Pre-Production
15 order          Order & Delivery            Logistics        locked ≥Pre-Production
16 revision       Revision History & Approval Sign-off
```

---

## Next tasks (Phases 4–7)

See `docs/techpack-phases.md` for full details.

### Phase 4 — Color & Artwork split (step 11 → steps 11+12)
- Split `color` into **Colorways** (11) and **Artwork / Placement** (12)  
- 17→18 steps total  
- No new skippable steps  
- Update STEPS, STEP_FNS, PAGE_FNS, PDF stepIdx, SVG (numPages 6→7)  
- LOCKED_STEPS stays `{14,15,16}` but indices shift to `{15,16,17}` after the split  

### Phase 5 — Compliance & QC split (step 13 → steps 13+14)
- Split `compliance` into **Testing Standards** (13) and **Quality / AQL** (14)  
- 18→19 steps total  
- Both locked until Pre-Production  
- LOCKED_STEPS becomes `{14,15,16,17}` (both compliance pages + labels + order)  

### Phase 6 — Treatments deepening (no new step)
- Wire `data.fabrics[n].treatment_id` into the Treatments step  
- Pull cost from `treatmentStore` into unit cost rollup  

### Phase 7 — Sign-off & revision diff (no new step)
- Revision history diff view (before/after field comparison)  
- Sequential sign-off: designer → brand owner → vendor  

---

## Key invariants to maintain

1. `STEPS.length === STEP_FNS.length === PAGE_FNS.length === TOTAL_PAGES`
2. Every PDF page calls `newPage(title, null, stepIdx)` with the correct wizard step index
3. `LOCKED_STEPS` contains indices for steps that require Pre-Production status
4. `IMG_STEPS` contains indices for steps with image uploads
5. `skipIf(stepIdx)` in SVG uses the same indices
6. `skippedSteps[]` in pack data is index-based (integer array)

---

## How to start a new session

1. Read this file  
2. Read `docs/techpack-phases.md` for full phase specs  
3. Check `git log --oneline -8` to confirm branch state  
4. Merge PR #24 first if it hasn't been merged yet  
5. Continue with Phase 4  
