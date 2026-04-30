// Component Pack storage — dual-write to localStorage + Supabase
// Mirrors techPackStore.js but for the `component_packs` table

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentUserIdSync, getCurrentOrgIdSync } from '../lib/auth';

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

function extractCover(images) {
  const list = Array.isArray(images) ? images : [];
  const cover = list.find(img => img && img.slot === 'component-cover');
  return cover ? cover.data : null;
}

// See listTechPacks comment — avoid pulling the images JSONB column from
// Supabase because it's the source of heavy lag when components have photos.
// A dedicated cover_image text column gives us thumbnails without that cost.
export async function listComponentPacks() {
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('component_packs')
      .select('id, component_name, component_category, status, supplier, cost_per_unit, currency, cover_image, updated_at, created_at')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false });
    if (!error && data) {
      // Until every row has had its cover_image + cost_per_unit backfilled
      // (pre-projection rows are null for both), lean on the dual-written
      // local copy to fill in any missing projected fields.
      const local = readLocal();
      return data.map(r => {
        let row = r;
        const mirror = row.cover_image && row.cost_per_unit ? null : local.find(l => l.id === r.id);
        // Prefer mirror.cover_image (saveComponentPack writes it directly)
        // and fall back to extracting from images for older local rows.
        if (!row.cover_image && mirror) {
          const localCover = mirror.cover_image || extractCover(mirror.images);
          if (localCover) row = { ...row, cover_image: localCover };
        }
        if (!row.cost_per_unit && mirror) {
          const tier0 = mirror.data?.costTiers?.[0];
          const cost = (tier0 && tier0.unitCost)
            || mirror.data?.targetUnitCost
            || mirror.data?.costPerUnit
            || '';
          if (cost) row = { ...row, cost_per_unit: cost };
        }
        return row;
      });
    }
    if (error) console.error('listComponentPacks:', error);
  }
  return readLocal()
    .map(p => ({
      id: p.id,
      component_name: p.data?.componentName || p.component_name || '',
      component_category: p.data?.componentCategory || p.component_category || '',
      status: p.data?.status || p.status || 'Design',
      supplier: p.data?.supplier || p.supplier || '',
      cost_per_unit: (p.data?.costTiers?.[0]?.unitCost) || p.data?.targetUnitCost || p.data?.costPerUnit || p.cost_per_unit || '',
      currency: p.data?.currency || p.currency || 'USD',
      updated_at: p.updated_at,
      created_at: p.created_at,
      // Prefer the directly-written cover_image (saveComponentPack writes it
      // both to the projection field and inside the images JSONB). Falls
      // back to extracting from images for older rows that predate the
      // direct projection.
      cover_image: p.cover_image || extractCover(p.images),
    }))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
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
  const cover = updates.images !== undefined ? extractCover(updates.images) : undefined;

  // Fold cover_image into the main update so it travels in a single atomic
  // write. The previous two-update flow had a silent-failure path: if the
  // second `update({ cover_image })` call failed (e.g. payload size, transient
  // network), the function still reported ok=true and the card lost its
  // thumbnail. One write means one outcome.
  const corePatch = { ...updates, updated_at: now };
  if (cover !== undefined) corePatch.cover_image = cover;

  // Belt-and-suspenders local mirror — also writes cover_image so the
  // listComponentPacks local-fallback path can read it directly without
  // having to re-extract from the (potentially stale) images JSONB.
  const localPatch = corePatch;

  const rows = readLocal();
  const idx = rows.findIndex(p => p.id === id);
  if (idx >= 0) {
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
  const { error } = await db.from('component_packs').update(corePatch).eq('id', id).eq('organization_id', orgId);
  if (error) {
    // Tolerate pre-migration schemas that don't have the cover_image column
    // yet — retry without it so the rest of the patch still lands.
    if (cover !== undefined && /column .* does not exist|could not find.*column/i.test(error.message || '')) {
      const patchWithoutCover = { ...corePatch };
      delete patchWithoutCover.cover_image;
      const retry = await db.from('component_packs').update(patchWithoutCover).eq('id', id).eq('organization_id', orgId);
      if (retry.error) {
        console.error('saveComponentPack retry:', retry.error);
        return { ok: false, error: retry.error };
      }
      return { ok: true };
    }
    console.error('saveComponentPack:', error);
    return { ok: false, error };
  }
  return { ok: true };
}

export async function deleteComponentPack(id) {
  writeLocal(readLocal().filter(p => p.id !== id));
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db.from('component_packs').delete().eq('id', id).eq('organization_id', orgId);
    if (error) console.error('deleteComponentPack:', error);
  }
}

export async function duplicateComponentPack(id) {
  const source = await getComponentPack(id);
  if (!source) return null;
  const newId = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
  const now = new Date().toISOString();
  const copy = {
    ...source, id: newId,
    component_name: (source.component_name || source.data?.componentName || '') + ' (Copy)',
    data: { ...source.data, componentName: (source.data?.componentName || '') + ' (Copy)' },
    cover_image: extractCover(source.images),
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
