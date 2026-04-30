// PLM migration health — quick read of how many packs in the org are
// fully on Storage vs still carrying legacy base64 entries.
//
// Useful for verifying that the Phase 2/3 lazy migration actually ran
// against your data (open the browser console and call
// `await window.plmMigrationStatus()`). Read-only — does not write or
// repair anything; just reports counts.

import { listTechPacks, getTechPack } from './techPackStore';
import { listComponentPacks, getComponentPack } from './componentPackStore';

function classify(images) {
  const list = Array.isArray(images) ? images : [];
  let legacy = 0;
  let migrated = 0;
  for (const img of list) {
    if (!img) continue;
    if (img.path) migrated += 1;
    else if (typeof img.data === 'string' && img.data.startsWith('data:')) legacy += 1;
  }
  return { legacy, migrated };
}

async function classifyPack(getOne, id) {
  const row = await getOne(id);
  if (!row) return { legacy: 0, migrated: 0, missing: true };
  return classify(row.images);
}

export async function getMigrationStatus() {
  const [techPacks, componentPacks] = await Promise.all([
    listTechPacks(),
    listComponentPacks(),
  ]);

  const buckets = {
    techPacks: { total: techPacks.length, fullyMigrated: 0, hasLegacy: 0, hasNoImages: 0 },
    componentPacks: { total: componentPacks.length, fullyMigrated: 0, hasLegacy: 0, hasNoImages: 0 },
  };

  // Walk each pack to inspect the images JSONB. Sequential to keep memory
  // bounded — at typical org scale (≤ a few hundred packs each) it's fast.
  for (const p of techPacks) {
    const c = await classifyPack(getTechPack, p.id);
    if (c.missing) continue;
    if (c.legacy === 0 && c.migrated === 0) buckets.techPacks.hasNoImages += 1;
    else if (c.legacy === 0) buckets.techPacks.fullyMigrated += 1;
    else buckets.techPacks.hasLegacy += 1;
  }
  for (const p of componentPacks) {
    const c = await classifyPack(getComponentPack, p.id);
    if (c.missing) continue;
    if (c.legacy === 0 && c.migrated === 0) buckets.componentPacks.hasNoImages += 1;
    else if (c.legacy === 0) buckets.componentPacks.fullyMigrated += 1;
    else buckets.componentPacks.hasLegacy += 1;
  }
  return buckets;
}

// Expose on window for ad-hoc console use during Phase 2-5 migration.
if (typeof window !== 'undefined') {
  window.plmMigrationStatus = getMigrationStatus;
}
