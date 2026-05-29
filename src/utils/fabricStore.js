// Fabric storage — localStorage primary with optional Supabase mirror
// behind IS_SUPABASE_ENABLED, mirroring the treatmentStore pattern.
//
// Auto-code: FB-{weave-code}-{seq} — FB-FRT-007, FB-DNM-001, …
// Sequence numbers are scoped per weave family and never reused.
//
// Archive vs delete: there is no hard delete. archiveFabric flips status
// to 'archived'; the record stays so any tech pack that referenced it
// still resolves.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';
import { emptyFabric, FABRIC_WEAVE_CODE } from './fabricLibrary';
import { copyCoverImage } from './plmAssets';
import { robustUpsertAtom, robustUpsertAtomBatch, mergeByIdNewest, dedupeCodesOnce } from './atomCloudSync';

const LOCAL_KEY = 'cashmodel_fabrics';

// Whitelist of columns that exist on the cloud `fabrics` table. Anything
// outside this set (legacy fields lingering in localStorage, in-memory UI
// state, computed values) gets dropped before the upsert — Postgres rejects
// the whole row if a single unknown column is sent, so silently filtering is
// the only way to keep cloud sync robust as the schema evolves.
const FABRIC_CLOUD_COLUMNS = new Set([
  'id', 'code', 'name', 'status', 'version', 'created_at', 'updated_at',
  'category', 'mill_fabric_no', 'composition', 'weight_gsm', 'weave', 'hand',
  'width_cm', 'shrinkage_pct', 'stretch_pct', 'mill_id', 'lead_time_days',
  'moq_meters', 'price_per_meter_usd', 'price_per_meter_cny',
  'price_per_kg_usd', 'price_per_kg_cny', 'currency',
  'front_image_url', 'back_image_url', 'color_card_images', 'cover_image',
  'zfab_file_url', 'color_id', 'notes', 'documents',
  'organization_id', 'user_id',
]);

export function toFabricCloudRow(row) {
  const out = {};
  for (const k of Object.keys(row)) {
    if (FABRIC_CLOUD_COLUMNS.has(k)) out[k] = row[k];
  }
  return out;
}

// 1 yard = 0.9144 meters. Older rows used `moq_yards` / `price_per_yard_usd`;
// we now store everything in meters because every mill we deal with quotes
// in metric. Convert in place once on read so existing rows surface with the
// new field names without losing data.
const YARDS_TO_METERS = 0.9144;
let _unitsMigrated = false;

function migrateYardsToMeters(rows) {
  if (_unitsMigrated) return rows;
  _unitsMigrated = true;
  let dirty = false;
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    if (r.moq_yards != null && r.moq_meters == null) {
      r.moq_meters = Math.round(Number(r.moq_yards) * YARDS_TO_METERS);
      dirty = true;
    }
    if (r.price_per_yard_usd != null && r.price_per_meter_usd == null) {
      r.price_per_meter_usd = Number((Number(r.price_per_yard_usd) / YARDS_TO_METERS).toFixed(2));
      dirty = true;
    }
    delete r.moq_yards;
    delete r.price_per_yard_usd;
  }
  if (dirty) {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); }
    catch (err) { console.error('fabricStore yards→meters migrate:', err); }
  }
  return rows;
}

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const rows = raw ? JSON.parse(raw) : [];
    return migrateYardsToMeters(rows);
  } catch {
    return [];
  }
}

function writeLocal(rows) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); }
  catch (err) { console.error('fabricStore write:', err); }
}

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
}

function nextCodeFor(weave, rows) {
  const codePrefix = FABRIC_WEAVE_CODE[weave] || 'GEN';
  const re = new RegExp(`^FB-${codePrefix}-(\\d+)$`);
  let max = 0;
  rows.forEach(r => {
    const m = re.exec(r.code || '');
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  });
  const next = String(max + 1).padStart(3, '0');
  return `FB-${codePrefix}-${next}`;
}

function filterRows(rows, { includeArchived = false, status = null, weave = null } = {}) {
  let out = rows;
  if (status) out = out.filter(r => r.status === status);
  else if (!includeArchived) out = out.filter(r => r.status !== 'archived');
  if (weave) out = out.filter(r => r.weave === weave);
  return out;
}

// Cloud + local merged at read time, keeping the NEWEST updated_at per id
// (last-write-wins). Local-only rows (queued offline edits, RLS blip, JWT not
// loaded yet) never disappear; an edit made on another computer (newer cloud
// updated_at) wins over a stale local copy; an unsynced local edit (newer
// local updated_at) shows until it syncs.
function unionByIdLocalFirst(cloudRows, localRows) {
  return mergeByIdNewest(cloudRows, localRows);
}

// Heal local-only fabrics: any row in localStorage that's not in cloud gets
// upserted to cloud. Runs on every listFabrics so users don't have to
// manually re-save anything. Uses the robust upsert path so a stale JWT
// (the most common reason heal silently failed before) gets refreshed and
// retried once before giving up — see atomCloudSync.js.
async function healOrphanFabrics(localRows, cloudRows) {
  if (!Array.isArray(localRows) || localRows.length === 0) return;
  const cloudIds = new Set((cloudRows || []).map(r => r.id));
  const orphans = localRows.filter(r => r && r.id && !cloudIds.has(r.id));
  if (orphans.length === 0) return;
  await robustUpsertAtomBatch('fabrics', orphans.map(r => toFabricCloudRow(r)));
}

export async function listFabrics({ includeArchived = false, status = null, weave = null } = {}) {
  const filterOpts = { includeArchived, status, weave };
  const orgId = getCurrentOrgIdSync();
  let cloudRows = null;
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('fabrics')
      .select('*')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false });
    if (!error && Array.isArray(data)) cloudRows = data;
    else if (error) console.error('listFabrics:', error);
    try { await healOrphanFabrics(readLocal(), cloudRows); }
    catch (err) { console.error('healOrphanFabrics:', err); }
  }
  let merged = unionByIdLocalFirst(cloudRows, readLocal());
  if (IS_SUPABASE_ENABLED && orgId) {
    try { merged = await dedupeCodesOnce(merged, { discriminatorField: 'weave', nextCode: nextCodeFor, save: saveFabric }); }
    catch (err) { console.error('fabric dedupeCodes:', err); }
  }
  return filterRows(merged, filterOpts)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function getFabric(id) {
  if (!id) return null;
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('fabrics')
      .select('*')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!error && data) {
      // Mirror cloud row into localStorage so subsequent saveFabric calls
      // have a row to update — without this, a fabric created on another
      // device or by another process saves to cloud only and disappears
      // when listFabrics queries Supabase before the cloud row replicates.
      //
      // Return the MERGED local row, not the raw cloud row: local-only fields
      // (documents, and any column not yet present in the DB schema) survive
      // the round-trip. Returning raw `data` made dropped files vanish on
      // reopen because the cloud row never carried them.
      let result = data;
      try {
        const local = readLocal();
        const idx = local.findIndex(r => r.id === id);
        if (idx >= 0) {
          const localRow = local[idx];
          // Last-write-wins: if the local copy carries unsynced newer edits,
          // keep them — don't let a staler cloud row overwrite work that hasn't
          // round-tripped yet. Otherwise adopt the cloud row (merged so any
          // local-only fields like documents survive).
          if ((localRow.updated_at || '') > (data.updated_at || '')) {
            result = localRow;
          } else {
            local[idx] = { ...localRow, ...data };
            result = local[idx];
          }
        } else {
          local.push(data);
        }
        writeLocal(local);
      } catch (err) { console.error('getFabric mirror:', err); }
      return result;
    }
    if (error) console.error('getFabric:', error);
  }
  return readLocal().find(r => r.id === id) || null;
}

export async function createFabric({ weave = 'jersey', ...overrides } = {}) {
  const local = readLocal();
  const id = newId();
  const code = nextCodeFor(weave, local);
  const row = emptyFabric({ id, code, weave, ...overrides });

  local.push(row);
  writeLocal(local);

  await robustUpsertAtom('fabrics', toFabricCloudRow(row));
  return row;
}

export async function saveFabric(id, updates) {
  if (!id) return null;
  const now = new Date().toISOString();
  const local = readLocal();
  const idx = local.findIndex(r => r.id === id);
  let merged;
  if (idx >= 0) {
    merged = { ...local[idx], ...updates, updated_at: now };
    local[idx] = merged;
  } else {
    // Defend in depth: if no local row (e.g. cloud-only fabric, or this
    // device hasn't run getFabric yet) insert a new row instead of
    // silently skipping the local write.
    merged = { id, ...updates, updated_at: now };
    local.push(merged);
  }
  writeLocal(local);

  await robustUpsertAtom('fabrics', toFabricCloudRow({ ...merged, updated_at: now }));
  return merged;
}

export const updateFabric = saveFabric;

export async function archiveFabric(id) {
  return saveFabric(id, { status: 'archived' });
}

export async function restoreFabric(id) {
  return saveFabric(id, { status: 'draft' });
}

export async function duplicateFabric(id) {
  const source = await getFabric(id);
  if (!source) return null;
  const local = readLocal();
  const newCode = nextCodeFor(source.weave, local);
  const now = new Date().toISOString();
  const dupId = newId();
  // Copy the cover image to a fresh Storage path under the new fabric's id
  // so either fabric can be edited or have its cover replaced without
  // breaking the other (CoverImagePicker deletes the prior path on replace).
  const dupCover = await copyCoverImage(source.cover_image, { newOwnerId: dupId, newScope: 'fabrics' });
  const copy = {
    ...source,
    id: dupId,
    code: newCode,
    name: source.name ? `${source.name} (Copy)` : 'Copy',
    status: 'draft',
    version: 'v1.0',
    cover_image: dupCover,
    created_at: now,
    updated_at: now,
  };
  delete copy.user_id;
  delete copy.organization_id;
  local.push(copy);
  writeLocal(local);
  await robustUpsertAtom('fabrics', toFabricCloudRow(copy));
  return copy;
}

export async function seedFabricsIfEmpty() {
  if (localStorage.getItem('cashmodel_seeded')) return [];
  const local = readLocal();
  if (local.length > 0) return [];
  // Don't seed if cloud already has rows for this org — otherwise a fresh
  // device signing into an existing org pollutes the shared library with
  // duplicate defaults.
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { count, error } = await db
      .from('fabrics')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId);
    if (error) console.error('seedFabricsIfEmpty count:', error);
    if ((count || 0) > 0) {
      // Mark seeded so we don't keep hitting cloud on every page load.
      localStorage.setItem('cashmodel_seeded', '1');
      return [];
    }
  }
  const now = new Date().toISOString();
  const seeds = [
    {
      id: 'seed-fabric-french-terry-340',
      code: 'FB-FRT-001',
      name: 'FR French Terry 340',
      composition: '100% Cotton (combed)',
      weight_gsm: 340,
      weave: 'french_terry',
      hand: 'Soft, slightly brushed loop back',
      width_cm: 180,
      shrinkage_pct: 4.5,
      stretch_pct: 0,
      color_id: 'PFD',
      mill_id: 'Lien Hsing Knits (Taipei)',
      lead_time_days: 35,
      moq_meters: 732,
      price_per_meter_usd: 7.00,
      currency: 'USD',
      status: 'approved',
      version: 'v1.2',
      notes: 'House hoodie / sweat fabric. Run on cotton-only programs.',
      created_at: '2025-03-12T00:00:00.000Z',
      updated_at: '2026-01-22T00:00:00.000Z',
    },
    {
      id: 'seed-fabric-jersey-180',
      code: 'FB-JSY-001',
      name: 'FR Combed Jersey 180',
      composition: '100% Cotton (combed)',
      weight_gsm: 180,
      weave: 'jersey',
      hand: 'Smooth, dry hand',
      width_cm: 170,
      shrinkage_pct: 3.0,
      stretch_pct: 0,
      color_id: 'PFD',
      mill_id: 'Lien Hsing Knits (Taipei)',
      lead_time_days: 28,
      moq_meters: 549,
      price_per_meter_usd: 4.48,
      currency: 'USD',
      status: 'approved',
      version: 'v2.0',
      notes: 'House tee fabric. Compatible with Vintage Soft finish.',
      created_at: '2025-04-02T00:00:00.000Z',
      updated_at: '2025-12-15T00:00:00.000Z',
    },
    {
      id: 'seed-fabric-denim-13oz',
      code: 'FB-DNM-001',
      name: '13 oz Selvedge Denim',
      composition: '100% Cotton (rigid)',
      weight_gsm: 440,
      weave: 'denim',
      hand: 'Crisp, dry, slightly hairy face',
      width_cm: 81,
      shrinkage_pct: 9.0,
      stretch_pct: 0,
      color_id: 'Slate',
      mill_id: 'Kuroki Mills (Okayama)',
      lead_time_days: 56,
      moq_meters: 274,
      price_per_meter_usd: 24.06,
      currency: 'USD',
      status: 'testing',
      version: 'v1.0',
      notes: 'Selvedge ID red. Best paired with Stone Wash treatment.',
      created_at: '2025-09-04T00:00:00.000Z',
      updated_at: '2026-02-08T00:00:00.000Z',
    },
  ];
  const filled = seeds.map(s => ({ ...emptyFabric(s), updated_at: s.updated_at || now, created_at: s.created_at || now }));
  writeLocal(filled);
  await robustUpsertAtomBatch('fabrics', filled.map(r => toFabricCloudRow(r)));
  return filled;
}
