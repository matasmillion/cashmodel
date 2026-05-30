// Component Pack storage — dual-write to localStorage + Supabase
// Mirrors techPackStore.js but for the `component_packs` table

import { IS_SUPABASE_ENABLED, getAuthedSupabase, refreshAuthedSupabase } from '../lib/supabase';
import { getCurrentUserIdSync, getCurrentOrgIdSync, getJwtOrgId } from '../lib/auth';
import { persistableImages, deleteAssets, copyAsset, scheduleOrphanDeletion, cancelOrphanDeletion } from './plmAssets';
import { robustUpsertAtomBatch } from './atomCloudSync';
import { enqueue } from './syncQueue';

// Cloud column allow-list. Anything outside this set (transient UI state,
// legacy fields) gets stripped before going to Supabase — Postgres rejects
// the whole row if a single unknown column is sent, which is exactly how
// trim packs silently failed to sync to the second device.
const COMPONENT_PACK_CLOUD_COLUMNS = new Set([
  'id', 'component_name', 'component_category', 'status', 'supplier',
  'cost_per_unit', 'currency', 'cover_image', 'data', 'images',
  'created_at', 'updated_at', 'deleted_at',
  'organization_id', 'user_id',
]);

function toComponentPackCloudRow(row) {
  const out = {};
  for (const k of Object.keys(row || {})) {
    if (COMPONENT_PACK_CLOUD_COLUMNS.has(k)) out[k] = row[k];
  }
  return out;
}

// Push every local-only component pack to cloud on each list call. Mirrors
// fabricStore.healOrphanFabrics — without this, a trim created on Mac that
// silently failed its initial cloud insert (RLS, schema-cache miss, network
// blip) stays local-only forever and never reaches the second device.
async function healOrphanComponentPacks(localRows, cloudRows) {
  if (!Array.isArray(localRows) || localRows.length === 0) return;
  const cloudIds = new Set((cloudRows || []).map(r => r.id));
  const orphans = localRows.filter(r => r && r.id && !cloudIds.has(r.id));
  if (orphans.length === 0) return;
  const userId = getCurrentUserIdSync();
  const payload = orphans.map(r => toComponentPackCloudRow({ ...r, user_id: userId }));
  await robustUpsertAtomBatch('component_packs', payload);
}

const LOCAL_KEY = 'cashmodel_component_packs';

// localStorage quota state — surfaced via getLocalQuotaError() so the
// builder UI can show a real banner when writes start failing instead
// of silently swallowing every save.
let lastQuotaError = null;
export function getLocalQuotaError() { return lastQuotaError; }
export function clearLocalQuotaError() { lastQuotaError = null; }

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
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
    if (lastQuotaError) lastQuotaError = null;
    return { ok: true };
  } catch (err) {
    // Quota errors are how localStorage tells us "your local backup is
    // stale and any future cross-session edits will lean entirely on
    // cloud." Capture the error so the builder UI can surface it
    // prominently — silent swallowing was the failure mode that
    // produced months of confusion.
    console.error('writeLocal:', err);
    const isQuota = err && (err.name === 'QuotaExceededError'
      || err.code === 22
      || /quota/i.test(err.message || ''));
    if (isQuota) lastQuotaError = err;
    return { ok: false, error: err, quota: !!isQuota };
  }
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

// Adopt-and-rotate: when an upsert keeps failing with RLS, the cloud row
// for this id is owned by a different organization_id (or NULL — common
// for rows that pre-date the org-cloud migration). Postgres won't ever
// let this user UPDATE it. The recovery is to INSERT a fresh row under a
// new uuid that the current org owns, then rewrite the local mirror so
// subsequent saves target the new id. Caller updates the URL hash via the
// `idChanged` field on the save result.
async function adoptAndRotate({ db, oldId, jwtOrgId, userId, corePatch, cleanedUpdates }) {
  const newId = (crypto.randomUUID && crypto.randomUUID())
    || `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
  const freshRow = {
    id: newId,
    organization_id: jwtOrgId,
    user_id: userId,
    ...corePatch,
  };
  // INSERT (not upsert) — we just minted a fresh uuid, conflict is
  // impossible. If somehow it does conflict, surface that as an error
  // rather than retry-storming.
  const { error } = await db.from('component_packs').insert(freshRow);
  if (error) return { ok: false, error };
  // Rewrite the local mirror so the next save targets the rotated id.
  // Carry over any fields the local row had that the freshRow doesn't
  // (e.g. created_at) so the local list view still renders correctly.
  try {
    const rows = readLocal();
    const idx = rows.findIndex(p => p.id === oldId);
    if (idx >= 0) {
      rows[idx] = {
        ...rows[idx],
        ...freshRow,
        id: newId,
        images: cleanedUpdates.images !== undefined ? cleanedUpdates.images : rows[idx].images,
      };
    } else {
      rows.push({ ...freshRow, images: cleanedUpdates.images || [] });
    }
    writeLocal(rows);
  } catch (err) {
    console.error('adoptAndRotate local mirror update:', err);
  }
  return { ok: true, newId };
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
function _mergeComponentPackList(cloudRows, localRows) {
  const localById = new Map(localRows.map(p => [p.id, p]));
  const seen = new Set();
  const out = [];
  (cloudRows || []).forEach(r => {
    if (!r || !r.id) return;
    seen.add(r.id);
    const localNewer = localById.get(r.id);
    if (localNewer && (localNewer.updated_at || '') > (r.updated_at || '')) {
      out.push(projectLocalRow(localNewer));
      return;
    }
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
  localRows.forEach(p => {
    if (!p || !p.id || seen.has(p.id)) return;
    out.push(projectLocalRow(p));
  });
  return out;
}

async function _syncComponentPackListFromCloud() {
  const orgId = getCurrentOrgIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId) return;
  try {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('component_packs')
      .select('*')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
    if (!error && Array.isArray(data)) {
      const local = readLocal().filter(p => !p?.deleted_at);
      try { await healOrphanComponentPacks(local, data); } catch { /* ok */ }
      // Merge full rows into localStorage (LWW) so future fast-path reads are complete
      const allLocal = readLocal();
      const cloudById = new Map(data.map(r => [r.id, r]));
      const merged = allLocal.map(p => {
        const cloud = cloudById.get(p.id);
        if (!cloud) return p;
        return (p.updated_at || '') > (cloud.updated_at || '') ? p : { ...p, ...cloud };
      });
      data.forEach(r => { if (!allLocal.some(p => p.id === r.id)) merged.push(r); });
      try { writeLocal(merged); } catch { /* ok */ }
      window.dispatchEvent(new CustomEvent('plm-store-updated', { detail: { table: 'component_packs' } }));
    }
  } catch { /* ok */ }
}

export async function listComponentPacks() {
  const orgId = getCurrentOrgIdSync();
  const local = readLocal().filter(p => !p?.deleted_at);
  if (local.length > 0) {
    if (IS_SUPABASE_ENABLED && orgId) _syncComponentPackListFromCloud().catch(() => {});
    return _mergeComponentPackList(null, local)
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  }
  if (IS_SUPABASE_ENABLED && orgId) await _syncComponentPackListFromCloud();
  return _mergeComponentPackList(null, readLocal().filter(p => !p?.deleted_at))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

// Sync a single component pack from cloud → localStorage, notify on change.
async function _syncComponentPackFromCloud(id) {
  const orgId = getCurrentOrgIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId) return null;
  try {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('component_packs')
      .select('*')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (error || !data) { if (error) console.error('getComponentPack:', error); return null; }
    const rows = readLocal();
    const idx = rows.findIndex(p => p.id === id);
    const localRow = idx >= 0 ? rows[idx] : null;
    // LWW: keep local if it has unsynced newer edits
    if (localRow && (localRow.updated_at || '') > (data.updated_at || '')) return migrateLegacyVendorKeys(localRow);
    let merged = localRow ? { ...localRow, ...data } : data;
    if (!merged.cover_image) {
      const cover = extractCover(merged.images);
      if (cover) {
        merged = { ...merged, cover_image: cover };
        getAuthedSupabase().then(authDb => {
          if (authDb) authDb.from('component_packs').update({ cover_image: cover }).eq('id', id).eq('organization_id', orgId)
            .then(({ error: upErr }) => { if (upErr) console.error('cover_image backfill:', upErr); });
        });
      }
    }
    if (idx >= 0) rows[idx] = merged; else rows.push(merged);
    writeLocal(rows);
    window.dispatchEvent(new CustomEvent('plm-store-updated', { detail: { table: 'component_packs', id } }));
    return migrateLegacyVendorKeys(merged);
  } catch { return null; }
}

export async function getComponentPack(id) {
  const local = readLocal().find(p => p.id === id);
  // Stale-while-revalidate: serve local immediately, sync cloud in background.
  if (local) {
    _syncComponentPackFromCloud(id).catch(() => {});
    return migrateLegacyVendorKeys(local);
  }
  // No local copy yet — must wait for cloud (first open from another device).
  return await _syncComponentPackFromCloud(id);
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
    // Use robustUpsert so transient failures (stale JWT, schema-cache miss,
    // network blip) get a refreshed-token retry instead of a silent log.
    const result = await robustUpsertAtomBatch('component_packs', [
      toComponentPackCloudRow({ ...row, user_id: userId }),
    ]);
    if (result?.ok === false) console.error('createComponentPack:', result.error);
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

  const clientOrgId = getCurrentOrgIdSync();
  if (!IS_SUPABASE_ENABLED || !clientOrgId) return { ok: true };

  // Use the JWT's org_id claim as the authoritative organization_id for the
  // upsert body rather than clientOrgId. The two can drift when Clerk's
  // token cache still holds a token minted before the active org was set
  // (e.g. immediately after sign-in or an org switch). When they differ
  // we force-refresh the token first so the body and the JWT go in together.
  let jwtOrgId = await getJwtOrgId();
  if (!jwtOrgId || jwtOrgId !== clientOrgId) {
    jwtOrgId = await getJwtOrgId({ skipCache: true });
  }
  // If the JWT has no org_id even after a fresh fetch, Postgres will see
  // jwt_org_id()=NULL and the WITH CHECK will always fail. Return a
  // structured error so the UI can surface a "diagnose" link instead of
  // spamming retries.
  if (!jwtOrgId) {
    const jwtErr = Object.assign(new Error('JWT is missing the org_id claim — open Storage Health to diagnose'), { code: 'JWT_NO_ORG_ID' });
    console.error('saveComponentPack:', jwtErr);
    // Park it in the durable outbox so it flushes once the JWT/org loads.
    enqueue({ table: 'component_packs', id, op: 'upsert', payload: { id, ...corePatch }, onConflict: 'id', updated_at: now });
    return { ok: false, error: jwtErr, queued: true };
  }

  let db = await getAuthedSupabase();
  const userId = getCurrentUserIdSync();

  // Ensure the org row exists in public.organizations before writing any
  // PLM rows that FK-reference it. The Clerk webhook that auto-creates org
  // rows may not be configured, so we call ensure_org_exists() as a cheap
  // SECURITY DEFINER RPC that upserts the org record. This is a no-op if
  // the row already exists (ON CONFLICT DO NOTHING).
  try {
    await db.rpc('ensure_org_exists', { p_org_id: jwtOrgId, p_org_name: '' });
  } catch (_) { /* best-effort — if the RPC doesn't exist yet, proceed anyway */ }

  // Upsert (not update) so a save against a row that doesn't yet exist
  // in cloud — most commonly because a duplicate's fire-and-forget
  // insert was silently eaten — actually creates it. The previous
  // pure-update path matched zero rows and returned no error, so the
  // UI cheerfully showed Saved ✓ while the duplicate's edits dropped
  // straight into the void. Upsert with onConflict: id makes saves
  // self-healing.
  let patch = { id, organization_id: jwtOrgId, user_id: userId, ...corePatch };
  // Ensure corePatch can never override the JWT-derived org — it comes from
  // the form, which doesn't carry organization_id, but belt-and-suspenders.
  patch.organization_id = jwtOrgId;
  let lastError = null;
  let networkAttempts = 0;
  const isRlsError = (err) => {
    const code = String(err?.code || '');
    const msg = String(err?.message || '').toLowerCase();
    return code === '42501' || /row-level security|row level security/.test(msg);
  };
  const isTransientNetworkError = (err) => {
    const msg = String(err?.message || '').toLowerCase();
    return /networkerror|failed to fetch|timeout|aborted|temporarily|rate limit|503|502|504|connection/i.test(msg);
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    const { error } = await db
      .from('component_packs')
      .upsert(patch, { onConflict: 'id' });
    if (!error) {
      if (toGc.length) {
        // Cancel any pending deferred-deletes for paths in the new
        // images set (a re-claimed path must never be deleted), then
        // schedule deletion of orphans with a 5s grace window so a
        // concurrent in-flight save / upload that re-claims the path
        // can rescue it.
        const stillReferenced = (cleanedUpdates.images || [])
          .map(img => img && img.path).filter(Boolean);
        cancelOrphanDeletion(stillReferenced);
        scheduleOrphanDeletion(toGc);
      }
      return { ok: true };
    }
    lastError = error;
    const msg = String(error.message || error.details || '');

    // RLS rejection — force-refresh the JWT and the client, then re-derive
    // org_id from the fresh token and retry once. This heals the case where
    // the cached token was minted before the active org was established.
    if (isRlsError(error) && attempt === 0) {
      db = await refreshAuthedSupabase();
      const refreshedOrgId = await getJwtOrgId({ skipCache: true });
      if (refreshedOrgId) patch = { ...patch, organization_id: refreshedOrgId };
      continue;
    }
    // Second RLS failure after a fresh token. JWT chain checks out (verified
    // earlier in this function), so the existing cloud row is owned by a
    // different organization_id (or NULL — common for rows created before
    // the org-cloud migration ran). Postgres can never let us update it.
    // Adopt-and-rotate: keep the user's data, give it a fresh id, and
    // INSERT it as a new row owned by the current org. Old cloud row is
    // orphaned (it's already invisible to this org via RLS, so there's
    // nothing to clean up from the client).
    if (isRlsError(error)) {
      const rotated = await adoptAndRotate({
        db, oldId: id, jwtOrgId, userId, corePatch, cleanedUpdates,
      });
      if (rotated.ok) {
        if (toGc.length) {
          const stillReferenced = (cleanedUpdates.images || [])
            .map(img => img && img.path).filter(Boolean);
          cancelOrphanDeletion(stillReferenced);
          scheduleOrphanDeletion(toGc);
        }
        return { ok: true, idChanged: { from: id, to: rotated.newId } };
      }
      // Rotation failed — surface the original RLS error so the caller
      // can deep-link to the diagnostic.
      lastError = rotated.error || error;
      break;
    }

    // Match Postgres "column ... does not exist" and PostgREST
    // "Could not find the 'X' column" / "schema cache" wording. If a
    // specific column is named, drop just that one. Otherwise drop every
    // non-essential column (keep data + images so the user's actual edits
    // still land).
    const named = msg.match(/column\s+(?:["']?)([\w.]+)(?:["']?)\s+(?:does not exist|of relation)/i)
      || msg.match(/Could not find the '([^']+)' column/i)
      || msg.match(/the '([^']+)' column .* (?:does not exist|schema cache)/i);
    if (named && named[1]) {
      const col = named[1].split('.').pop();
      // Never drop the upsert keys — without id / organization_id /
      // user_id the upsert can't INSERT a missing row and the save
      // silently no-ops.
      if (col in patch && !['id', 'organization_id', 'user_id'].includes(col)) {
        const next = { ...patch };
        delete next[col];
        patch = next;
        continue;
      }
    }
    if (/schema cache|does not exist|could not find.*column/i.test(msg)) {
      // Generic schema mismatch — strip every projection column, keep only
      // the JSONB payloads so the save still represents the user's edits.
      // id / organization_id / user_id are required for the upsert to be
      // able to INSERT a missing row, so they're preserved unconditionally.
      const safePatch = { id: patch.id };
      if (patch.organization_id !== undefined) safePatch.organization_id = patch.organization_id;
      if (patch.user_id !== undefined) safePatch.user_id = patch.user_id;
      if (patch.data !== undefined) safePatch.data = patch.data;
      if (patch.images !== undefined) safePatch.images = patch.images;
      if (patch.updated_at !== undefined) safePatch.updated_at = patch.updated_at;
      if (Object.keys(safePatch).length === Object.keys(patch).length) break;
      patch = safePatch;
      continue;
    }
    if (isTransientNetworkError(error) && networkAttempts < 3) {
      const delay = [200, 600, 1400][networkAttempts];
      networkAttempts += 1;
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    break;
  }
  console.error('saveComponentPack:', lastError);
  // Couldn't reach the cloud after retries — park it for the durable outbox to
  // heal later through the LWW-guarded writer.
  enqueue({ table: 'component_packs', id, op: 'upsert', payload: { id, ...corePatch }, onConflict: 'id', updated_at: now });
  return { ok: false, error: lastError, queued: true };
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

  // Await the cloud insert (was fire-and-forget) so failures surface
  // before the user enters the builder thinking the duplicate is safe.
  // Without this, a JWT / RLS / schema error silently lost the row,
  // every subsequent edit ran .update().eq('id', ...) against nothing
  // (zero rows affected, no error returned), the UI cheerfully showed
  // Saved ✓, and on close+refresh the duplicate was just gone. Now
  // saveComponentPack is also upsert so even if this insert fails,
  // the first edit in the builder creates the row — but we still want
  // to know about insert failures up front.
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const userId = getCurrentUserIdSync();
    const db = await getAuthedSupabase();
    if (db) {
      const { error } = await db
        .from('component_packs')
        .insert({ ...copy, user_id: userId, organization_id: orgId });
      if (error) {
        console.error('duplicateComponentPack cloud insert:', error);
        // Don't fail the whole duplicate — the local row is written and
        // saveComponentPack's upsert will heal cloud on the next edit.
      }
    }
  }
  return copy;
}
