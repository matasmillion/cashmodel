// Embellishment storage — localStorage primary with optional Supabase
// mirror behind IS_SUPABASE_ENABLED, mirroring the treatmentStore pattern.
//
// Auto-code: EM-{type-code}-{seq} — EM-EMB-001, EM-SCR-007, …
//
// Archive vs delete: there is no hard delete. archiveEmbellishment flips
// status to 'archived'; the record stays so any tech pack that referenced
// it still resolves.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';
import { emptyEmbellishment, EMBELLISHMENT_TYPE_CODE } from './embellishmentLibrary';
import { copyCoverImage } from './plmAssets';
import { robustUpsertAtom, robustUpsertAtomBatch, robustUpdateAtomOptimistic } from './atomCloudSync';

const LOCAL_KEY = 'cashmodel_embellishments';

const EMBELLISHMENT_CLOUD_COLUMNS = new Set([
  'id', 'code', 'name', 'status', 'version', 'created_at', 'updated_at',
  'type', 'technique', 'artwork_file_url', 'placement', 'placement_image_url',
  'size_w_cm', 'size_h_cm', 'color_count', 'thread_color_ids',
  'primary_vendor_id', 'backup_vendor_id', 'cost_per_unit_usd', 'currency',
  'lead_time_days', 'moq_units', 'cover_image',
  'adobe_ai_url', 'adobe_psd_url', 'digitizing_file_url', 'notes',
  'organization_id', 'user_id',
]);

export function toEmbellishmentCloudRow(row) {
  const out = {};
  for (const k of Object.keys(row)) {
    if (EMBELLISHMENT_CLOUD_COLUMNS.has(k)) out[k] = row[k];
  }
  return out;
}

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocal(rows) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); }
  catch (err) { console.error('embellishmentStore write:', err); }
}

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
}

function nextCodeFor(type, rows) {
  const codePrefix = EMBELLISHMENT_TYPE_CODE[type] || 'GEN';
  const re = new RegExp(`^EM-${codePrefix}-(\\d+)$`);
  let max = 0;
  rows.forEach(r => {
    const m = re.exec(r.code || '');
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  });
  const next = String(max + 1).padStart(3, '0');
  return `EM-${codePrefix}-${next}`;
}

function filterRows(rows, { includeArchived = false, status = null, type = null } = {}) {
  let out = rows;
  if (status) out = out.filter(r => r.status === status);
  else if (!includeArchived) out = out.filter(r => r.status !== 'archived');
  if (type) out = out.filter(r => r.type === type);
  return out;
}

// Cloud + local always get unioned at read time so local-only rows never
// disappear from the list view (cloud insert failed silently, RLS rejected,
// network blip, JWT/org not loaded yet).
function unionByIdCloudFirst(cloudRows, localRows) {
  const seen = new Set();
  const out = [];
  (cloudRows || []).forEach(r => { if (r && r.id && !seen.has(r.id)) { seen.add(r.id); out.push(r); } });
  (localRows || []).forEach(r => { if (r && r.id && !seen.has(r.id)) { seen.add(r.id); out.push(r); } });
  return out;
}

async function healOrphanEmbellishments(localRows, cloudRows) {
  if (!Array.isArray(localRows) || localRows.length === 0) return;
  const cloudIds = new Set((cloudRows || []).map(r => r.id));
  const orphans = localRows.filter(r => r && r.id && !cloudIds.has(r.id));
  if (orphans.length === 0) return;
  await robustUpsertAtomBatch('embellishments', orphans.map(r => toEmbellishmentCloudRow(r)));
}

export async function listEmbellishments({ includeArchived = false, status = null, type = null } = {}) {
  const filterOpts = { includeArchived, status, type };
  const orgId = getCurrentOrgIdSync();
  let cloudRows = null;
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('embellishments')
      .select('*')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false });
    if (!error && Array.isArray(data)) cloudRows = data;
    else if (error) console.error('listEmbellishments:', error);
    try { await healOrphanEmbellishments(readLocal(), cloudRows); }
    catch (err) { console.error('healOrphanEmbellishments:', err); }
  }
  const merged = unionByIdCloudFirst(cloudRows, readLocal());
  return filterRows(merged, filterOpts)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function getEmbellishment(id) {
  if (!id) return null;
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('embellishments')
      .select('*')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!error && data) {
      try {
        const local = readLocal();
        const idx = local.findIndex(r => r.id === id);
        if (idx >= 0) local[idx] = { ...local[idx], ...data };
        else local.push(data);
        writeLocal(local);
      } catch (err) { console.error('getEmbellishment mirror:', err); }
      return data;
    }
    if (error) console.error('getEmbellishment:', error);
  }
  return readLocal().find(r => r.id === id) || null;
}

export async function createEmbellishment({ type = 'embroidery', ...overrides } = {}) {
  const local = readLocal();
  const id = newId();
  const code = nextCodeFor(type, local);
  const row = emptyEmbellishment({ id, code, type, ...overrides });

  local.push(row);
  writeLocal(local);

  await robustUpsertAtom('embellishments', toEmbellishmentCloudRow(row));
  return row;
}

// See fabricStore.saveFabric for the OCC return shape and contract.
export async function saveEmbellishment(id, updates, opts = {}) {
  if (!id) return { ok: false, error: new Error('saveEmbellishment: id required') };
  const now = new Date().toISOString();
  const local = readLocal();
  const idx = local.findIndex(r => r.id === id);
  const before = idx >= 0 ? local[idx] : null;
  let merged;
  if (idx >= 0) {
    merged = { ...local[idx], ...updates, updated_at: now };
    local[idx] = merged;
  } else {
    merged = { id, ...updates, updated_at: now };
    local.push(merged);
  }
  writeLocal(local);

  const base = opts.base_updated_at || before?.updated_at || null;
  if (!base) {
    await robustUpsertAtom('embellishments', toEmbellishmentCloudRow(merged));
    return { ok: true, row: merged };
  }
  const result = await robustUpdateAtomOptimistic('embellishments', id, base, toEmbellishmentCloudRow(merged));
  if (result.ok && result.row) {
    const refreshed = readLocal();
    const j = refreshed.findIndex(r => r.id === id);
    if (j >= 0) {
      refreshed[j] = { ...refreshed[j], updated_at: result.row.updated_at };
      writeLocal(refreshed);
    }
    return { ok: true, row: { ...merged, updated_at: result.row.updated_at } };
  }
  return result;
}

export const updateEmbellishment = saveEmbellishment;

async function saveEmbellishmentWithRetry(id, updates) {
  let result = await saveEmbellishment(id, updates);
  if (result?.ok || !result?.conflict) return result;
  const latest = result.latest;
  if (!latest) return result;
  const local = readLocal();
  const idx = local.findIndex(r => r.id === id);
  if (idx >= 0) {
    local[idx] = { ...local[idx], ...latest };
    writeLocal(local);
  }
  return saveEmbellishment(id, updates, { base_updated_at: latest.updated_at });
}

export async function archiveEmbellishment(id) {
  return saveEmbellishmentWithRetry(id, { status: 'archived' });
}

export async function restoreEmbellishment(id) {
  return saveEmbellishmentWithRetry(id, { status: 'draft' });
}

export async function duplicateEmbellishment(id) {
  const source = await getEmbellishment(id);
  if (!source) return null;
  const local = readLocal();
  const newCode = nextCodeFor(source.type, local);
  const now = new Date().toISOString();
  const dupId = newId();
  const dupCover = await copyCoverImage(source.cover_image, { newOwnerId: dupId, newScope: 'embellishments' });
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
  await robustUpsertAtom('embellishments', toEmbellishmentCloudRow(copy));
  return copy;
}

export async function seedEmbellishmentsIfEmpty() {
  if (localStorage.getItem('cashmodel_seeded')) return [];
  const local = readLocal();
  if (local.length > 0) return [];
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { count, error } = await db
      .from('embellishments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId);
    if (error) console.error('seedEmbellishmentsIfEmpty count:', error);
    if ((count || 0) > 0) {
      localStorage.setItem('cashmodel_seeded', '1');
      return [];
    }
  }
  const now = new Date().toISOString();
  const seeds = [
    {
      id: 'seed-emb-fr-monogram',
      code: 'EM-EMB-001',
      name: 'FR monogram embroidery',
      type: 'embroidery',
      status: 'approved',
      version: 'v1.1',
      technique: 'Flat satin stitch · 2 colors',
      placement: 'Left chest',
      size_w_cm: 4.5,
      size_h_cm: 1.8,
      color_count: 2,
      primary_vendor_id: 'Yiwu Embroidery Co.',
      cost_per_unit_usd: 0.45,
      lead_time_days: 7,
      moq_units: 200,
      notes: 'Standard left-chest placement: 8 cm down from HPS, 12 cm in from CF.',
      created_at: '2025-05-04T00:00:00.000Z',
      updated_at: '2026-01-30T00:00:00.000Z',
    },
    {
      id: 'seed-emb-back-art',
      code: 'EM-SCR-001',
      name: 'Mountain wave back art',
      type: 'screen_print',
      status: 'approved',
      version: 'v1.0',
      technique: 'Plastisol · 3 spot colors',
      placement: 'Back full',
      size_w_cm: 28,
      size_h_cm: 32,
      color_count: 3,
      primary_vendor_id: 'Foshan Print House',
      cost_per_unit_usd: 1.85,
      lead_time_days: 10,
      moq_units: 300,
      notes: 'Soft-hand additive, low-cure. Center 18 cm down from CB neck.',
      created_at: '2025-09-19T00:00:00.000Z',
      updated_at: '2025-12-22T00:00:00.000Z',
    },
  ];
  const filled = seeds.map(s => ({ ...emptyEmbellishment(s), updated_at: s.updated_at || now, created_at: s.created_at || now }));
  writeLocal(filled);
  await robustUpsertAtomBatch('embellishments', filled.map(r => toEmbellishmentCloudRow(r)));
  return filled;
}
