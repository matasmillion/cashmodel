# 08 · P2 · TreatmentBuilder — twin columns (Physical + Digital)

Read `CLAUDE.md` first. Then do ONLY this task. Stop when done.

## Prereq
Chunk 07 merged.

## Goal
Add the twin-column section below the stat strip. Two cards side by side: Physical spec on the left, Digital asset on the right.

## Steps

1. Open `src/components/techpack/TreatmentBuilder.jsx`. Find the `{/* TODO: chunks 08-10 */}` comment.

2. Read the corresponding section in `docs/mockups/fr-plm-treatment-detail.html` — the `.twin` section. Match it visually.

3. Add a 2-column grid (1fr 1fr, 14px gap, margin-bottom 22px).

4. Left card — "Physical spec":
   - Card chrome: white, 0.5px border `rgba(58,58,58,0.15)`, 8px radius, 18-22px padding
   - Header row: Cormorant Garamond 17px "Physical spec" on left, muted hint "What the factory produces" on right
   - 100px / 1fr grid, 10px row-gap, 12px font:
     - Chemistry → `treatment.chemistry`
     - Duration → `{duration_minutes} minutes`
     - Temperature → `{temperature_c} °C`
     - Substrate → comma-joined fabric names from `compatible_fabric_ids`
     - Shrinkage → `{shrinkage_expected_pct}% expected`
     - Vendor → name lookup of `primary_vendor_id`
     - Backup → name lookup of `backup_vendor_id` (if set)
     - MOQ · Terms → `{moq_units} units · {payment_terms from vendor}`

5. Right card — "Digital asset":
   - Same chrome
   - Header row: "Digital asset" left, "What the designer renders" right
   - Same grid layout, 12px font:
     - LoRA → `treatment.digital.lora_checkpoint_url` (display filename only, mono font)
     - Base model → `treatment.digital.lora_base_model`
     - Trigger → `treatment.digital.lora_trigger_phrase` (mono font)
     - Training set → `{N} images · v{X} retrained {date}` (count from `lora_training_image_urls.length`)
     - CLO .ZFAB → "not synced — optional" if `clo_asset_url` is null, else show URL
     - Thumbnail → "Last rendered {date}" or "—"
     - Source → `treatment.digital.digital_source`
     - Drift (30d) → "X.X% — within target" (placeholder for now, real drift comes in chunk 16)

6. **Edit mode** — add a small Edit/Save/Cancel toggle on the page (e.g. in a footer action row, or top-right). When in edit mode:
   - All fields in both cards become inputs
   - Save calls `updateTreatment(id, patch)`
   - Cancel reverts

7. **Do NOT yet** add: production log table, drift strip, used-in list, footer actions. Those are chunks 09-10.

## Acceptance

- Twin columns render with correct mockup styling.
- Edit mode works for at least the physical spec fields.
- Digital asset fields display correctly even when `digital` envelope has null fields.

## Stop after

Commit message: `feat(plm): treatment builder twin columns physical+digital`. Push. Done.
