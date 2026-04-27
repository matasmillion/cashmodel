# 01 · P1 · Factory → Vendor rename

Read `CLAUDE.md` first. Then do ONLY this task. Stop when done.

## Goal
Rename Factory → Vendor across the codebase. Atomic, additive, no data loss.

## Steps

1. Grep the repo for every occurrence: `factory`, `Factory`, `FACTORY`, `factories`, `Factories`. Inventory before editing.

2. Rename files:
   - `src/components/techpack/FactoryManager.jsx` → `src/components/techpack/VendorManager.jsx`
   - `src/utils/factoryLibrary.js` → `src/utils/vendorLibrary.js`

3. Inside renamed files, rename:
   - Component `FactoryManager` → `VendorManager`
   - All identifiers: `factory` → `vendor`, etc.
   - All UI strings: "Factory" → "Vendor"

4. In every other file: update imports, references, prop names, store keys, route hashes.

5. Add legacy data compatibility in `vendorLibrary.js`:
   - Read: try new localStorage key first, fall back to old key, migrate silently
   - Write: new key only
   - Export `resolveVendor(id)` helper that accepts old `factory_id` OR new `vendor_id`

6. Extend vendor schema (additive, defaults for existing records):
   - `capabilities: string[]` → `[]`
   - `moq_units: number` → `0`
   - `lead_time_days: number` → `0`
   - `payment_terms: string` → `""`
   - `rating: number` → `0`

## Acceptance

- Grep for `factory` / `Factory` returns zero results in source.
- App still loads. Existing vendor (formerly factory) data renders.
- Legacy `factory_id` foreign keys on BOM items still resolve.

## Stop after

Commit message: `refactor(plm): rename factory → vendor with legacy compatibility`. Push. Done.
