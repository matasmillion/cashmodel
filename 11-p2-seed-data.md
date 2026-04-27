# 11 · P2 · Seed three sample treatments

Read `CLAUDE.md` first. Then do ONLY this task. Stop when done.

## Prereq
Chunk 10 merged.

## Goal
Seed the Treatment library with three real records so the list and detail views aren't empty.

## Steps

1. Add a one-time seed function to `src/utils/treatmentStore.js`:

```js
export function seedTreatmentsIfEmpty() {
  const existing = listTreatments();
  if (existing.length > 0) return; // never overwrite
  // ... create the three records
}
```

2. Three seed records:

   **Stone wash**
   - type: `wash`
   - base_color_id: `Sienna` color ID from your color library
   - chemistry: `Enzyme bath (cellulase 2%), pumice agitation, softener finish. pH 5.5 ± 0.3.`
   - duration_minutes: 40
   - temperature_c: 55
   - shrinkage_expected_pct: 3.5
   - primary_vendor_id: Guangdong Ocean Wash (create this vendor record if it doesn't exist)
   - backup_vendor_id: Foshan Blue Wash (create if needed)
   - cost_per_unit_usd: 3.80
   - lead_time_days: 12
   - moq_units: 500
   - notes: `First run oversoftened — dropped cellulase from 3% to 2% in August. Pumice volume matters more than expected.`
   - status: `approved`
   - version: `2.1`

   **Vintage soft**
   - type: `wash`
   - base_color_id: `Sand` color ID
   - chemistry: `Silicone + enzyme, gentle agitation`
   - duration_minutes: 25
   - temperature_c: 50
   - shrinkage_expected_pct: 2.5
   - primary_vendor_id: Foshan Blue Wash
   - cost_per_unit_usd: 2.10
   - lead_time_days: 8
   - moq_units: 300
   - status: `approved`
   - version: `1.0`

   **Gone global dye**
   - type: `garment_dye`
   - base_color_id: `Slate` color ID
   - chemistry: `Garment dye + softener, slate cast`
   - duration_minutes: 60
   - temperature_c: 65
   - shrinkage_expected_pct: 4.0
   - primary_vendor_id: Guangdong Ocean Wash
   - cost_per_unit_usd: 4.20
   - lead_time_days: 14
   - moq_units: 500
   - status: `approved`
   - version: `1.0`

3. Each record's `digital` field starts with:
   ```js
   {
     digital_source: 'manual',
     lora_training_image_urls: []
   }
   ```

4. Call `seedTreatmentsIfEmpty()` once on app mount (e.g. in `PLMView.jsx` or wherever the app initializes). Idempotent — safe to call repeatedly.

5. After seeding, also create the two seed vendors via `createVendor()` in `vendorLibrary.js` if they don't exist.

## Acceptance

- First load of an empty library: 3 treatments appear.
- Second load: still 3 treatments (no duplicates).
- Each treatment's detail page renders fully.
- Vendor names resolve correctly in the detail view.

## Stop after

Commit message: `feat(plm): seed three sample treatments and vendors`. Push. Done.
