// Tech Pack storage — dual-write to localStorage + Supabase when available
// Used by the TechPack list and builder views

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentUserIdSync, getCurrentOrgIdSync } from '../lib/auth';
import { persistableImages, deleteAssets, copyAsset } from './plmAssets';

const LOCAL_KEY = 'cashmodel_techpacks';

// Records written before the factory→vendor rename carry the old keys
// (`factory`, `factoryContact`, `factoryConfirmed`, `finalApproval.factory`).
// Surface them under the new names on read so the rest of the app can rely
// on the renamed shape. The fallback keeps both shapes valid in storage
// until a save rewrites the row with the new keys.
function migrateLegacyVendorKeys(row) {
  if (!row || !row.data) return row;
  const d = row.data;
  const needsTopLevel = (d.vendor === undefined && d.factory !== undefined)
    || (d.vendorContact === undefined && d.factoryContact !== undefined)
    || (d.vendorConfirmed === undefined && d.factoryConfirmed !== undefined);
  const fa = d.finalApproval;
  const needsFA = fa && fa.vendor === undefined && fa.factory !== undefined;
  if (!needsTopLevel && !needsFA) return row;
  const nextData = { ...d };
  if (d.vendor === undefined && d.factory !== undefined) nextData.vendor = d.factory;
  if (d.vendorContact === undefined && d.factoryContact !== undefined) nextData.vendorContact = d.factoryContact;
  if (d.vendorConfirmed === undefined && d.factoryConfirmed !== undefined) nextData.vendorConfirmed = d.factoryConfirmed;
  if (needsFA) nextData.finalApproval = { ...fa, vendor: fa.factory };
  return { ...row, data: nextData };
}

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocal(packs) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(packs));
  } catch (err) {
    console.error('Failed to save tech packs locally:', err);
  }
}

// Pull the cover image (first entry with slot=cover) out of an images array.
// Handles both legacy { data: 'data:...' } and persisted { path: '...' }.
function extractCover(images) {
  const list = Array.isArray(images) ? images : [];
  const cover = list.find(img => img && img.slot === 'cover');
  if (!cover) return null;
  return cover.path || cover.data || null;
}

// Storage paths that disappeared between two image arrays — used to GC
// orphaned files from the bucket on save.
function orphanedPaths(prev, next) {
  const prevPaths = new Set();
  const nextPaths = new Set();
  for (const img of prev || []) if (img?.path) prevPaths.add(img.path);
  for (const img of next || []) if (img?.path) nextPaths.add(img.path);
  const dropped = [];
  for (const p of prevPaths) if (!nextPaths.has(p)) dropped.push(p);
  return dropped;
}

// List all tech packs. Deliberately do NOT fetch the images JSONB column from
// Supabase — a pack with reference photos can be multiple MB per row and
// downloading the full catalogue of images on every list render freezes the
// browser. LocalStorage always has images inline so the fallback still shows
// thumbnails; Supabase users get placeholder icons until a dedicated
// cover_image column is migrated.
//
// Cloud + local always get unioned. Local-only rows (cloud insert failed
// silently, RLS rejected, network blip, JWT/org not loaded yet) still
// surface so the user never loses sight of their work.
export async function listTechPacks() {
  const { computeTotalUnitCost } = await import('../components/techpack/techPackConstants');
  const { getFRColorCost } = await import('./colorLibrary');
  const projectLocal = (p) => ({
    id: p.id,
    style_name: p.data?.styleName || p.style_name || '',
    product_category: p.data?.productCategory || p.product_category || '',
    status: p.data?.status || p.status || 'Development',
    completion_pct: p.completion_pct || 0,
    total_unit_cost: computeTotalUnitCost(p.data || {}, { getColorCost: getFRColorCost }),
    currency: p.data?.currency || p.currency || 'USD',
    updated_at: p.updated_at,
    created_at: p.created_at,
    cover_image: extractCover(p.images),
  });

  const orgId = getCurrentOrgIdSync();
  let cloudRows = null;
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('tech_packs')
      .select('id, style_name, product_category, status, completion_pct, updated_at, created_at')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
    if (!error && Array.isArray(data)) cloudRows = data.map(r => ({ ...r, cover_image: null }));
    else if (error) console.error('listTechPacks:', error);
  }

  const local = readLocal().filter(p => !p?.deleted_at);
  const seen = new Set();
  const out = [];
  (cloudRows || []).forEach(r => {
    if (!r || !r.id) return;
    seen.add(r.id);
    // Backfill cover_image / total_unit_cost from local mirror when cloud
    // doesn't carry those projections.
    const mirror = local.find(l => l.id === r.id);
    let row = r;
    if (mirror) {
      const localCover = extractCover(mirror.images);
      if (localCover && !row.cover_image) row = { ...row, cover_image: localCover };
      if (row.total_unit_cost == null) {
        row = { ...row, total_unit_cost: computeTotalUnitCost(mirror.data || {}, { getColorCost: getFRColorCost }) };
      }
    }
    out.push(row);
  });
  local.forEach(p => {
    if (!p || !p.id || seen.has(p.id)) return;
    out.push(projectLocal(p));
  });
  return out.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

// Fetch one tech pack including data + images
export async function getTechPack(id) {
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('tech_packs')
      .select('*')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!error && data) {
      // Mirror cloud row into localStorage so saveTechPack can find a row
      // to patch — without this, packs created on another device save to
      // cloud only, the local list-view fallback returns nothing, and
      // newly uploaded cover images never appear on the card.
      try {
        const packs = readLocal();
        const idx = packs.findIndex(p => p.id === id);
        if (idx >= 0) packs[idx] = { ...packs[idx], ...data };
        else packs.push(data);
        writeLocal(packs);
      } catch (err) {
        console.error('getTechPack mirror:', err);
      }
      return migrateLegacyVendorKeys(data);
    }
    if (error) console.error('getTechPack:', error);
  }
  const local = readLocal().find(p => p.id === id);
  return local ? migrateLegacyVendorKeys(local) : null;
}

// Create a new empty tech pack
export async function createTechPack(defaultData, defaultLibrary) {
  const id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
  const now = new Date().toISOString();
  const row = {
    id,
    style_name: '',
    product_category: '',
    status: 'Development',
    completion_pct: 0,
    data: defaultData,
    images: [],
    library: defaultLibrary,
    created_at: now,
    updated_at: now,
  };

  // Local first (always)
  const packs = readLocal();
  packs.push(row);
  writeLocal(packs);

  // Cloud if available
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const userId = getCurrentUserIdSync();
    const db = await getAuthedSupabase();
    const { error } = await db.from('tech_packs').insert({ ...row, user_id: userId, organization_id: orgId });
    if (error) console.error('createTechPack:', error);
  }
  return row;
}

// Save full tech pack (used for debounced auto-save). Returns { ok, error }
// so callers can surface failures instead of silently dropping edits.
export async function saveTechPack(id, updates) {
  const now = new Date().toISOString();

  // Strip transient upload-state fields so they never reach the DB.
  const cleanedUpdates = updates.images !== undefined
    ? { ...updates, images: persistableImages(updates.images) }
    : { ...updates };
  const cover = cleanedUpdates.images !== undefined ? extractCover(cleanedUpdates.images) : undefined;

  // Atomic write: cover_image rides along with the main patch so a single
  // failure can't leave the row half-updated (cover lost, data saved).
  const corePatch = { ...cleanedUpdates, updated_at: now };
  if (cover !== undefined) corePatch.cover_image = cover;

  let toGc = [];
  const packs = readLocal();
  const idx = packs.findIndex(p => p.id === id);
  if (idx >= 0) {
    if (cleanedUpdates.images !== undefined) {
      toGc = orphanedPaths(packs[idx].images, cleanedUpdates.images);
    }
    packs[idx] = { ...packs[idx], ...corePatch };
  } else {
    packs.push({ id, ...corePatch });
  }
  writeLocal(packs);

  const orgId = getCurrentOrgIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId) return { ok: true };

  const db = await getAuthedSupabase();
  // Schema-resilient save — see saveComponentPack for the rationale. Local
  // already wrote successfully; this loop keeps cloud in sync best-effort
  // when the DB or PostgREST schema cache disagrees about which columns
  // are valid.
  let patch = { ...corePatch };
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { error } = await db
      .from('tech_packs')
      .update(patch)
      .eq('id', id)
      .eq('organization_id', orgId);
    if (!error) {
      if (toGc.length) deleteAssets(toGc);
      return { ok: true };
    }
    lastError = error;
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
      const safePatch = {};
      if (patch.data !== undefined) safePatch.data = patch.data;
      if (patch.images !== undefined) safePatch.images = patch.images;
      if (patch.library !== undefined) safePatch.library = patch.library;
      if (patch.updated_at !== undefined) safePatch.updated_at = patch.updated_at;
      if (Object.keys(safePatch).length === Object.keys(patch).length) break;
      patch = safePatch;
      continue;
    }
    break;
  }
  console.error('saveTechPack:', lastError);
  return { ok: false, error: lastError };
}

// Soft delete — moves a tech pack to Trash. Storage files stay so a
// Restore can put the pack back exactly as it was. Hard delete (and the
// associated Storage cleanup) only happens via purgeTechPack.
export async function deleteTechPack(id) {
  const now = new Date().toISOString();
  const packs = readLocal();
  const idx = packs.findIndex(p => p.id === id);
  if (idx >= 0) {
    packs[idx] = { ...packs[idx], deleted_at: now, updated_at: now };
    writeLocal(packs);
  }
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db
      .from('tech_packs')
      .update({ deleted_at: now, updated_at: now })
      .eq('id', id)
      .eq('organization_id', orgId);
    if (error) console.error('deleteTechPack:', error);
  }
}

// Restore from Trash — clears deleted_at.
export async function restoreTechPack(id) {
  const now = new Date().toISOString();
  const packs = readLocal();
  const idx = packs.findIndex(p => p.id === id);
  if (idx >= 0) {
    const next = { ...packs[idx], updated_at: now };
    delete next.deleted_at;
    packs[idx] = next;
    writeLocal(packs);
  }
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db
      .from('tech_packs')
      .update({ deleted_at: null, updated_at: now })
      .eq('id', id)
      .eq('organization_id', orgId);
    if (error) console.error('restoreTechPack:', error);
  }
}

// Permanent delete — invoked from the Trash view's "Delete forever".
// Removes the row + every Storage object the pack referenced.
export async function purgeTechPack(id) {
  const local = readLocal().find(p => p.id === id);
  const paths = (local?.images || [])
    .map(img => img && img.path)
    .filter(Boolean);

  writeLocal(readLocal().filter(p => p.id !== id));

  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db.from('tech_packs').delete().eq('id', id).eq('organization_id', orgId);
    if (error) console.error('purgeTechPack:', error);
  }
  if (paths.length) deleteAssets(paths);
}

// List trashed tech packs for the Trash view. Same projection as listTechPacks
// but only returns rows with deleted_at set, ordered by recency-of-deletion.
export async function listDeletedTechPacks() {
  const { computeTotalUnitCost } = await import('../components/techpack/techPackConstants');
  const { getFRColorCost } = await import('./colorLibrary');
  const projectLocal = (p) => ({
    id: p.id,
    style_name: p.data?.styleName || p.style_name || '',
    product_category: p.data?.productCategory || p.product_category || '',
    status: p.data?.status || p.status || 'Development',
    completion_pct: p.completion_pct || 0,
    total_unit_cost: computeTotalUnitCost(p.data || {}, { getColorCost: getFRColorCost }),
    currency: p.data?.currency || p.currency || 'USD',
    updated_at: p.updated_at,
    created_at: p.created_at,
    deleted_at: p.deleted_at,
    cover_image: extractCover(p.images),
  });

  const orgId = getCurrentOrgIdSync();
  let cloudRows = null;
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('tech_packs')
      .select('id, style_name, product_category, status, completion_pct, updated_at, created_at, deleted_at')
      .eq('organization_id', orgId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    if (!error && Array.isArray(data)) cloudRows = data.map(r => ({ ...r, cover_image: null }));
    else if (error) console.error('listDeletedTechPacks:', error);
  }

  const local = readLocal().filter(p => p?.deleted_at);
  const seen = new Set();
  const out = [];
  (cloudRows || []).forEach(r => {
    if (!r || !r.id) return;
    seen.add(r.id);
    const mirror = local.find(l => l.id === r.id);
    let row = r;
    if (mirror) {
      const localCover = extractCover(mirror.images);
      if (localCover && !row.cover_image) row = { ...row, cover_image: localCover };
    }
    out.push(row);
  });
  local.forEach(p => {
    if (!p || !p.id || seen.has(p.id)) return;
    out.push(projectLocal(p));
  });
  return out.sort((a, b) => (b.deleted_at || '').localeCompare(a.deleted_at || ''));
}

// Duplicate a tech pack — returns the new row. Storage files are copied to
// new paths under the duplicate's owner_id so neither pack can break the
// other by deleting "their" image.
export async function duplicateTechPack(id) {
  const source = await getTechPack(id);
  if (!source) return null;
  const newId = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
  const now = new Date().toISOString();

  const sourceImages = Array.isArray(source.images) ? source.images : [];
  const copiedImages = await Promise.all(sourceImages.map(async (img) => {
    if (!img) return img;
    if (img.path) {
      const cloned = await copyAsset({ sourceRef: img, newOwnerId: newId, newScope: 'tech-packs' });
      return cloned || img;
    }
    return img;
  }));

  const copy = {
    ...source,
    id: newId,
    style_name: (source.style_name || source.data?.styleName || '') + ' (Copy)',
    data: { ...source.data, styleName: (source.data?.styleName || '') + ' (Copy)' },
    images: copiedImages,
    cover_image: extractCover(copiedImages),
    created_at: now,
    updated_at: now,
  };
  delete copy.user_id;
  delete copy.organization_id;

  const packs = readLocal();
  packs.push(copy);
  writeLocal(packs);

  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const userId = getCurrentUserIdSync();
    const db = await getAuthedSupabase();
    const { error } = await db.from('tech_packs').insert({ ...copy, user_id: userId, organization_id: orgId });
    if (error) console.error('duplicateTechPack:', error);
  }
  return copy;
}
