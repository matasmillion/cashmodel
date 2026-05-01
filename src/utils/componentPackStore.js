// Component Pack storage — dual-write to localStorage + Supabase
// Mirrors techPackStore.js but for the `component_packs` table

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentUserIdSync, getCurrentOrgIdSync } from '../lib/auth';
import { persistableImages, deleteAssets, copyAsset } from './plmAssets';

const LOCAL_KEY = 'cashmodel_component_packs';

// Materials and the final-approval slot used to be keyed `factory`; the rename
// landed in componentPackConstants but pre-rename rows still hold the old key.
// Surface them under `vendor` on read so the builder + preview can read one
// shape regardless of when the record was saved.
function migrateLegacyVendorKeys(row) {
  if (!row || !row.data) return row;
  const d = row.data;
  let nextData = d;
  if (Array.isArray(d.materials) && d.materials.some(m => m && m.vendor === undefined && m.factory !== undefined)) {
    nextData = {
      ...nextData,
      materials: d.materials.map(m => (m && m.vendor === undefined && m.factory !== undefined ? { ...m, vendor: m.factory } : m)),
    };
  }
  const fa = nextData.finalApproval;
  if (fa && fa.vendor === undefined && fa.factory !== undefined) {
    nextData = { ...nextData, finalApproval: { ...fa, vendor: fa.factory } };
  }
  return nextData === d ? row : { ...row, data: nextData };
}

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
}
function writeLocal(rows) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); } catch (err) { console.error(err); }
}

// Cover extraction handles both shapes:
//   • legacy:    { slot: 'component-cover', data: 'data:image/...;base64,…' }
//   • persisted: { slot: 'component-cover', path: 'org/component-packs/…webp' }
// We persist whichever is present into the cover_image column. Renderers
// detect data: URLs vs Storage paths and resolve accordingly.
function extractCover(images) {
  const list = Array.isArray(images) ? images : [];
  const cover = list.find(img => img && img.slot === 'component-cover');
  if (!cover) return null;
  return cover.path || cover.data || null;
}

// Compare two image arrays and return the Storage paths that disappeared
// from `next` — those files should be removed from the bucket so we don't
// accumulate orphans every time a slot is replaced.
function orphanedPaths(prev, next) {
  const prevPaths = new Set();
  const nextPaths = new Set();
  for (const img of prev || []) if (img?.path) prevPaths.add(img.path);
  for (const img of next || []) if (img?.path) nextPaths.add(img.path);
  const dropped = [];
  for (const p of prevPaths) if (!nextPaths.has(p)) dropped.push(p);
  return dropped;
}

// Project a localStorage row into the same projected shape that the cloud
// listing returns (id + scalar columns + cover_image, no images JSONB).
function projectLocalRow(p) {
  return {
    id: p.id,
    component_name: p.data?.componentName || p.component_name || '',
    component_category: p.data?.componentCategory || p.component_category || '',
    status: p.data?.status || p.status || 'Design',
    supplier: p.data?.supplier || p.supplier || '',
    cost_per_unit: (p.data?.costTiers?.[0]?.unitCost) || p.data?.targetUnitCost || p.data?.costPerUnit || p.cost_per_unit || '',
    currency: p.data?.currency || p.currency || 'USD',
    updated_at: p.updated_at,
    created_at: p.created_at,
    cover_image: p.cover_image || extractCover(p.images),
  };
}

// See listTechPacks comment — avoid pulling the images JSONB column from
// Supabase because it's the source of heavy lag when components have photos.
// A dedicated cover_image text column gives us thumbnails without that cost.
//
// Cloud + local always get unioned. Cloud-only rows (canonical), local-only
// rows (cloud insert failed silently, RLS, JWT/org not loaded), and rows in
// both (cloud wins, but cover_image / cost_per_unit are filled in from
// local when the cloud projection is still null) all surface in the list.
export async function listComponentPacks() {
  const orgId = getCurrentOrgIdSync();
  let cloudRows = null;
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('component_packs')
      .select('id, component_name, component_category, status, supplier, cost_per_unit, currency, cover_image, updated_at, created_at')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
    if (!error && Array.isArray(data)) cloudRows = data;
    else if (error) console.error('listComponentPacks:', error);
  }

  const local = readLocal().filter(p => !p?.deleted_at);
  const localById = new Map(local.map(p => [p.id, p]));
  const seen = new Set();
  const out = [];

  // Cloud rows first. Backfill cover_image / cost_per_unit from local
  // mirror when the cloud projection columns aren't yet populated.
  (cloudRows || []).forEach(r => {
    if (!r || !r.id) return;
    seen.add(r.id);
    let row = r;
    const mirror = (row.cover_image && row.cost_per_unit) ? null : localById.get(r.id);
    if (!row.cover_image && mirror) {
      const localCover = mirror.cover_image || extractCover(mirror.images);
      if (localCover) row = { ...row, cover_image: localCover };
    }
    if (!row.cost_per_unit && mirror) {
      const tier0 = mirror.data?.costTiers?.[0];
      const cost = (tier0 && tier0.unitCost) || mirror.data?.targetUnitCost || mirror.data?.costPerUnit || '';
      if (cost) row = { ...row, cost_per_unit: cost };
    }
    out.push(row);
  });

  // Local-only rows: project to the same shape and append. These are
  // either fresh creates that haven't reached the cloud yet, cloud writes
  // that failed silently, or rows from a prior session before cloud was
  // accessible. Either way, the user shouldn't lose visibility on them.
  local.forEach(p => {
    if (!p || !p.id || seen.has(p.id)) return;
    out.push(projectLocalRow(p));
  });

  return out.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function getComponentPack(id) {
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('component_packs')
      .select('*')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!error && data) {
      // Mirror the cloud row into localStorage so subsequent
      // saveComponentPack calls have a local row to update — without this,
      // a pack opened from cloud-only state has nothing to update locally
      // and the local cover_image / image fallback paths in
      // listComponentPacks return nothing, causing the card to render
      // without a thumbnail even though the user just uploaded one.
      try {
        const rows = readLocal();
        const idx = rows.findIndex(p => p.id === id);
        if (idx >= 0) rows[idx] = { ...rows[idx], ...data };
        else rows.push(data);
        writeLocal(rows);
      } catch (err) {
        console.error('getComponentPack mirror:', err);
      }

      // Lazy backfill: older rows predate the cover_image column; populate it
      // the first time they're opened so subsequent list views show the
      // thumbnail without another edit.
      if (!data.cover_image) {
        const cover = extractCover(data.images);
        if (cover) {
          getAuthedSupabase().then(authDb => {
            if (authDb) authDb.from('component_packs').update({ cover_image: cover }).eq('id', id).eq('organization_id', orgId)
              .then(({ error: upErr }) => { if (upErr) console.error('cover_image backfill:', upErr); });
          });
          return migrateLegacyVendorKeys({ ...data, cover_image: cover });
        }
      }
      return migrateLegacyVendorKeys(data);
    }
    if (error) console.error('getComponentPack:', error);
  }
  const local = readLocal().find(p => p.id === id);
  return local ? migrateLegacyVendorKeys(local) : null;
}

export async function createComponentPack(defaultData) {
  const id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
  const now = new Date().toISOString();
  const row = {
    id,
    component_name: '',
    component_category: '',
    status: 'Design',
    supplier: '',
    cost_per_unit: '',
    currency: 'USD',
    data: defaultData,
    images: [],
    created_at: now,
    updated_at: now,
  };

  const rows = readLocal(); rows.push(row); writeLocal(rows);

  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const userId = getCurrentUserIdSync();
    const db = await getAuthedSupabase();
    const { error } = await db.from('component_packs').insert({ ...row, user_id: userId, organization_id: orgId });
    if (error) console.error('createComponentPack:', error);
  }
  return row;
}

export async function saveComponentPack(id, updates) {
  const now = new Date().toISOString();

  // Strip transient upload-state fields (_blobUrl, _uploading, _uploadError)
  // before anything is persisted — they exist purely for the in-memory render
  // of an upload in flight and must never end up in the DB or localStorage.
  const cleanedUpdates = updates.images !== undefined
    ? { ...updates, images: persistableImages(updates.images) }
    : { ...updates };
  const cover = cleanedUpdates.images !== undefined ? extractCover(cleanedUpdates.images) : undefined;

  // Fold cover_image into the main update so it travels in a single atomic
  // write. The previous two-update flow had a silent-failure path: if the
  // second `update({ cover_image })` call failed (e.g. payload size, transient
  // network), the function still reported ok=true and the card lost its
  // thumbnail. One write means one outcome.
  const corePatch = { ...cleanedUpdates, updated_at: now };
  if (cover !== undefined) corePatch.cover_image = cover;

  // Belt-and-suspenders local mirror — also writes cover_image so the
  // listComponentPacks local-fallback path can read it directly without
  // having to re-extract from the (potentially stale) images JSONB.
  const localPatch = corePatch;

  // Detect orphaned Storage paths so they can be GC'd from the bucket after
  // the save lands. Only meaningful when images are part of this update.
  let toGc = [];
  const rows = readLocal();
  const idx = rows.findIndex(p => p.id === id);
  if (idx >= 0) {
    if (cleanedUpdates.images !== undefined) {
      toGc = orphanedPaths(rows[idx].images, cleanedUpdates.images);
    }
    rows[idx] = { ...rows[idx], ...localPatch };
  } else {
    // Insert when missing — happens when the pack was created on another
    // device and this device's localStorage hasn't been backfilled yet
    // (getComponentPack now mirrors on read, but we still defend in depth).
    rows.push({ id, ...localPatch });
  }
  writeLocal(rows);

  const orgId = getCurrentOrgIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId) return { ok: true };

  const db = await getAuthedSupabase();
  // Schema-resilient save: if Postgres / PostgREST rejects the patch because
  // a column is missing (column added recently, schema cache stale, etc.),
  // we strip the failing column from the patch and retry — up to a small
  // number of times — instead of dropping the whole save and showing the
  // user a "Cloud save failed" pill. Local already wrote successfully, so
  // edits are never lost; this just keeps cloud in sync best-effort.
  let patch = { ...corePatch };
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { error } = await db
      .from('component_packs')
      .update(patch)
      .eq('id', id)
      .eq('organization_id', orgId);
    if (!error) {
      if (toGc.length) deleteAssets(toGc);
      return { ok: true };
    }
    lastError = error;
    // Match Postgres "column ... does not exist" and PostgREST
    // "Could not find the 'X' column" / "schema cache" wording. If a
    // specific column is named, drop just that one. Otherwise drop every
    // non-essential column (keep data + images so the user's actual edits
    // still land).
    const msg = String(error.message || error.details || '');
    const named = msg.match(/column\s+(?:["']?)([\w.]+)(?:["']?)\s+(?:does not exist|of relation)/i)
      || msg.match(/Could not find the '([^']+)' column/i)
      || msg.match(/the '([^']+)' column .* (?:does not exist|schema cache)/i);
    if (named && named[1]) {
      const col = named[1].split('.').pop();
      if (col in patch) {
        const next = { ...patch };
        delete next[col];
        patch = next;
        continue;
      }
    }
    if (/schema cache|does not exist|could not find.*column/i.test(msg)) {
      // Generic schema mismatch — strip every projection column, keep only
      // the JSONB payloads so the save still represents the user's edits.
      const safePatch = {};
      if (patch.data !== undefined) safePatch.data = patch.data;
      if (patch.images !== undefined) safePatch.images = patch.images;
      if (patch.updated_at !== undefined) safePatch.updated_at = patch.updated_at;
      if (Object.keys(safePatch).length === Object.keys(patch).length) break;
      patch = safePatch;
      continue;
    }
    break;
  }
  console.error('saveComponentPack:', lastError);
  return { ok: false, error: lastError };
}

// Soft delete — moves a pack to Trash. Storage files are intentionally
// kept so a Restore can put the pack back exactly as it was. A future
// purgeComponentPack (called from the Trash view's "Delete forever") is
// what actually removes Storage objects.
export async function deleteComponentPack(id) {
  const now = new Date().toISOString();
  const rows = readLocal();
  const idx = rows.findIndex(p => p.id === id);
  if (idx >= 0) {
    rows[idx] = { ...rows[idx], deleted_at: now, updated_at: now };
    writeLocal(rows);
  }
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db
      .from('component_packs')
      .update({ deleted_at: now, updated_at: now })
      .eq('id', id)
      .eq('organization_id', orgId);
    if (error) console.error('deleteComponentPack:', error);
  }
}

// Restore a pack from Trash — clears deleted_at and surfaces it again
// in the active list view.
export async function restoreComponentPack(id) {
  const now = new Date().toISOString();
  const rows = readLocal();
  const idx = rows.findIndex(p => p.id === id);
  if (idx >= 0) {
    const next = { ...rows[idx], updated_at: now };
    delete next.deleted_at;
    rows[idx] = next;
    writeLocal(rows);
  }
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db
      .from('component_packs')
      .update({ deleted_at: null, updated_at: now })
      .eq('id', id)
      .eq('organization_id', orgId);
    if (error) console.error('restoreComponentPack:', error);
  }
}

// Permanent delete — invoked from the Trash view's "Delete forever".
// This is the only path that hard-deletes the row + cleans up Storage.
export async function purgeComponentPack(id) {
  const local = readLocal().find(p => p.id === id);
  const paths = (local?.images || [])
    .map(img => img && img.path)
    .filter(Boolean);

  writeLocal(readLocal().filter(p => p.id !== id));
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db.from('component_packs').delete().eq('id', id).eq('organization_id', orgId);
    if (error) console.error('purgeComponentPack:', error);
  }
  if (paths.length) deleteAssets(paths);
}

// List trashed packs — same projection shape as listComponentPacks so the
// Trash view can render the same card-style rows.
export async function listDeletedComponentPacks() {
  const orgId = getCurrentOrgIdSync();
  let cloudRows = null;
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('component_packs')
      .select('id, component_name, component_category, status, supplier, cost_per_unit, currency, cover_image, updated_at, created_at, deleted_at')
      .eq('organization_id', orgId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    if (!error && Array.isArray(data)) cloudRows = data;
    else if (error) console.error('listDeletedComponentPacks:', error);
  }

  const local = readLocal().filter(p => p?.deleted_at);
  const seen = new Set();
  const out = [];
  (cloudRows || []).forEach(r => {
    if (!r || !r.id) return;
    seen.add(r.id);
    out.push(r);
  });
  local.forEach(p => {
    if (!p || !p.id || seen.has(p.id)) return;
    out.push({
      id: p.id,
      component_name: p.data?.componentName || p.component_name || '',
      component_category: p.data?.componentCategory || p.component_category || '',
      status: p.data?.status || p.status || 'Design',
      supplier: p.data?.supplier || p.supplier || '',
      cost_per_unit: (p.data?.costTiers?.[0]?.unitCost) || p.data?.targetUnitCost || p.cost_per_unit || '',
      currency: p.data?.currency || p.currency || 'USD',
      updated_at: p.updated_at,
      created_at: p.created_at,
      deleted_at: p.deleted_at,
      cover_image: p.cover_image || extractCover(p.images),
    });
  });
  return out.sort((a, b) => (b.deleted_at || '').localeCompare(a.deleted_at || ''));
}

export async function duplicateComponentPack(id) {
  const source = await getComponentPack(id);
  if (!source) return null;
  const newId = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
  const now = new Date().toISOString();

  // Copy Storage files to new paths so the duplicate has its own assets and
  // either pack can be edited/deleted without touching the other's files.
  // Legacy entries (with `data` and no `path`) carry over as-is — they're
  // self-contained base64 and don't share Storage state.
  const sourceImages = Array.isArray(source.images) ? source.images : [];
  const copiedImages = await Promise.all(sourceImages.map(async (img) => {
    if (!img) return img;
    if (img.path) {
      const cloned = await copyAsset({ sourceRef: img, newOwnerId: newId, newScope: 'component-packs' });
      // If copy failed (network, RLS), keep the original ref so the duplicate
      // at least renders — orphan risk is acceptable vs blank slot.
      return cloned || img;
    }
    return img;
  }));

  const copy = {
    ...source, id: newId,
    component_name: (source.component_name || source.data?.componentName || '') + ' (Copy)',
    data: { ...source.data, componentName: (source.data?.componentName || '') + ' (Copy)' },
    images: copiedImages,
    cover_image: extractCover(copiedImages),
    created_at: now, updated_at: now,
  };
  delete copy.user_id;
  delete copy.organization_id;

  const rows = readLocal(); rows.push(copy); writeLocal(rows);

  // Fire-and-forget the cloud insert so the UI can update optimistically
  // off the local copy. Errors still surface in the console; the local row
  // is the source of truth until cloud catches up on next list/refresh.
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const userId = getCurrentUserIdSync();
    getAuthedSupabase().then(db => {
      if (!db) return;
      db.from('component_packs').insert({ ...copy, user_id: userId, organization_id: orgId })
        .then(({ error }) => { if (error) console.error('duplicateComponentPack:', error); });
    });
  }
  return copy;
}
