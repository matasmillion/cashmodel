# 03 · P1 · Create atom stubs + shared types

Read `CLAUDE.md` first. Then do ONLY this task. Stop when done.

## Prereq
Chunk 02 merged.

## Goal
Create empty stub components for the four missing atoms, plus the shared `atoms.js` types file.

## Steps

1. Create stub files. Each is ~20 lines: a functional React component that renders a single empty-state card. No CRUD, no data.

   - `src/components/techpack/PatternList.jsx` — title "Pattern library" · copy "Patterns are the skeleton every garment is built on. Coming soon."
   - `src/components/techpack/PatternBuilder.jsx` — placeholder
   - `src/components/techpack/FabricList.jsx` — title "Fabric library" · copy "Every fabric stored as a reusable atom with mill, cost, and digital twin. Coming soon."
   - `src/components/techpack/FabricBuilder.jsx` — placeholder
   - `src/components/techpack/TreatmentList.jsx` — title "Treatment library" · copy "Every wash, dye, and finish stored as a reusable recipe. Test once, reference forever. Coming soon."
   - `src/components/techpack/TreatmentBuilder.jsx` — placeholder
   - `src/components/techpack/EmbellishmentList.jsx` — title "Embellishment library" · copy "Logos, prints, and embroidery stored with placement files and vendors. Coming soon."
   - `src/components/techpack/EmbellishmentBuilder.jsx` — placeholder

2. Update the four placeholder Library sub-tabs from chunk 02 to mount the new `*List` components instead of the placeholder cards.

3. Create `src/types/atoms.js` with these JSDoc typedefs:

   ```js
   /**
    * @typedef {Object} DigitalAsset
    * @property {string=} clo_asset_url
    * @property {'zfab'|'ztrm'|'dxf'|'zprj'|'obj'|'3dm'|'ase'|'ace'|'graphic'|'lora'=} clo_asset_type
    * @property {string=} clo_set_content_id
    * @property {string=} rhino_file_url
    * @property {string=} pbr_thumbnail_url
    * @property {Date=} last_digital_sync_at
    * @property {'clo_set'|'rhino'|'scanned'|'ai_generated'|'lora_trained'|'manual'} digital_source
    */

   /**
    * @typedef {Object} AtomBase
    * @property {string} id
    * @property {string} code
    * @property {string} name
    * @property {'draft'|'testing'|'approved'|'archived'} status
    * @property {string} version
    * @property {Date} created_at
    * @property {Date} updated_at
    * @property {DigitalAsset | null} digital
    */

   export {};
   ```

4. Import `atoms.js` from at least one of the stub files (any of them) so we know the types path is wired.

## Design constraints

- Empty-state cards: white, 0.5px border `rgba(58,58,58,0.15)`, 8px radius, centered text in Slate.
- Title: Cormorant Garamond. Body copy: system sans, muted color.

## Acceptance

- Eight new component files exist.
- `src/types/atoms.js` exists.
- All four Library sub-tabs (Patterns, Fabrics, Treatments, Embellishments) render their empty state.

## Stop after

Commit message: `feat(plm): add atom stubs and shared types`. Push. Done.
