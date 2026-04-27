# 12 · P2 · TechPackBuilder — additive treatment picker

Read `CLAUDE.md` first. Then do ONLY this task. Stop when done.

## Prereq
Chunk 11 merged.

## ⚠️ Critical: Read CLAUDE.md rules

`TechPackBuilder.jsx` is a perfected workflow. Only the additive change in this prompt is permitted. **Do not refactor anything else.** If the addition feels awkward or requires touching unrelated code, STOP AND FLAG.

## Goal
Add an optional `treatment_id` field to BOM line items. Existing tech packs continue to work unchanged.

## Steps

1. Read `src/components/techpack/TechPackBuilder.jsx` first. Understand the BOM line item structure. Note:
   - How are existing fields stored?
   - How are existing inputs rendered?
   - What's the smallest possible additive change?

2. Add one optional field to the BOM line item type: `treatment_id?: string`. Default: `undefined`.

3. Add a single dropdown next to (or below) existing inputs on the BOM row:
   - Label: "Treatment"
   - Options: `<None>` (default), then all `listTreatments()` filtered to `status !== 'archived'`. Display: `{name} · {code}`.
   - On change: update the line item with the chosen `treatment_id`.

4. Existing tech packs without `treatment_id` continue to render and save unchanged. The new field is purely additive.

5. **Do not touch:**
   - Existing BOM logic
   - Existing save/load flow
   - Layout of other fields
   - Any other component file

6. If you find yourself wanting to do anything beyond adding the dropdown — stop and write a comment in the chat explaining what's awkward, then exit without committing.

## Acceptance

- Open an existing tech pack: renders unchanged. New dropdown appears with default `<None>`.
- Pick a treatment: saves to the line item.
- Reload tech pack: dropdown shows the picked treatment.
- Existing tech packs without `treatment_id` continue to load without error.

## Stop after

Commit message: `feat(plm): additive treatment picker on techpack BOM rows`. Push. Done.

**P2 (Treatments) is now complete.** Verify in browser before starting P3.
