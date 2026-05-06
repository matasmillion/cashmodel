// Creative Library store — dual-write localStorage + Supabase.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';

const LOCAL_KEY = 'cashmodel_creative_library';

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeLocal(rows) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); }
  catch (err) { console.error('creativeLibraryStore write:', err); }
}

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
}

function unionByIdCloudFirst(cloudRows, localRows) {
  const seen = new Set();
  const out = [];
  (cloudRows || []).forEach(r => { if (r?.id && !seen.has(r.id)) { seen.add(r.id); out.push(r); } });
  (localRows || []).forEach(r => { if (r?.id && !seen.has(r.id)) { seen.add(r.id); out.push(r); } });
  return out;
}

/** @returns {Promise<import('../types/creative').CreativeLibraryItem[]>} */
export async function listLibraryItems({ kind = null, includeArchived = false } = {}) {
  const orgId = getCurrentOrgIdSync();
  let cloudRows = null;
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    let q = db.from('creative_library').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
    if (kind) q = q.eq('kind', kind);
    if (!includeArchived) q = q.eq('archived', false);
    const { data, error } = await q;
    if (!error && Array.isArray(data)) cloudRows = data;
    else if (error) console.error('listLibraryItems:', error);
  }
  let merged = unionByIdCloudFirst(cloudRows, readLocal());
  if (kind) merged = merged.filter(r => r.kind === kind);
  if (!includeArchived) merged = merged.filter(r => !r.archived);
  return merged.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

/** @returns {Promise<import('../types/creative').CreativeLibraryItem>} */
export async function createLibraryItem(overrides = {}) {
  const orgId = getCurrentOrgIdSync();
  const now = new Date().toISOString();
  const row = {
    id: newId(),
    organization_id: orgId || '',
    kind: 'inspiration',
    title: '',
    url: '',
    thumbnail_url: null,
    notes: '',
    tags: [],
    source: null,
    archived: false,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  const local = readLocal();
  local.push(row);
  writeLocal(local);
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db.from('creative_library').insert(row);
    if (error) console.error('createLibraryItem:', error);
  }
  return row;
}

/** @returns {Promise<import('../types/creative').CreativeLibraryItem|null>} */
export async function saveLibraryItem(id, updates) {
  if (!id) return null;
  const now = new Date().toISOString();
  const local = readLocal();
  const idx = local.findIndex(r => r.id === id);
  let merged;
  if (idx >= 0) {
    merged = { ...local[idx], ...updates, updated_at: now };
    local[idx] = merged;
  } else {
    merged = { id, ...updates, updated_at: now };
    local.push(merged);
  }
  writeLocal(local);
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db.from('creative_library').upsert({ ...merged, organization_id: orgId }).eq('id', id);
    if (error) console.error('saveLibraryItem:', error);
  }
  return merged;
}

export async function archiveLibraryItem(id) {
  return saveLibraryItem(id, { archived: true });
}
