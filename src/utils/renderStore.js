// Render store — dual-write localStorage + Supabase.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';

const LOCAL_KEY = 'cashmodel_creative_renders';

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeLocal(rows) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); }
  catch (err) { console.error('renderStore write:', err); }
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

/** @returns {Promise<import('../types/creative').Render[]>} */
export async function listRenders({ sprintId = null, briefId = null, status = null } = {}) {
  const orgId = getCurrentOrgIdSync();
  let cloudRows = null;
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    let q = db.from('renders').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
    if (sprintId) q = q.eq('sprint_id', sprintId);
    if (briefId) q = q.eq('brief_id', briefId);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (!error && Array.isArray(data)) cloudRows = data;
    else if (error) console.error('listRenders:', error);
  }
  let merged = unionByIdCloudFirst(cloudRows, readLocal());
  if (sprintId) merged = merged.filter(r => r.sprint_id === sprintId);
  if (briefId) merged = merged.filter(r => r.brief_id === briefId);
  if (status) merged = merged.filter(r => r.status === status);
  return merged.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

/** @returns {Promise<import('../types/creative').Render|null>} */
export async function getRender(id) {
  if (!id) return null;
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db.from('renders').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle();
    if (!error && data) {
      const local = readLocal();
      const idx = local.findIndex(r => r.id === id);
      if (idx >= 0) local[idx] = { ...local[idx], ...data };
      else local.push(data);
      writeLocal(local);
      return data;
    }
    if (error) console.error('getRender:', error);
  }
  return readLocal().find(r => r.id === id) || null;
}

/** @returns {Promise<import('../types/creative').Render>} */
export async function createRender(overrides = {}) {
  const orgId = getCurrentOrgIdSync();
  const now = new Date().toISOString();
  const row = {
    id: newId(),
    organization_id: orgId || '',
    brief_id: '',
    sprint_id: '',
    variant_index: 0,
    status: 'pending',
    provider: '',
    raw_url: null,
    encoded_url: null,
    encoder_passed: false,
    provider_job_id: null,
    duration_sec: null,
    approved_by: null,
    approved_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  const local = readLocal();
  local.push(row);
  writeLocal(local);
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db.from('renders').insert(row);
    if (error) console.error('createRender:', error);
  }
  return row;
}

/** @returns {Promise<import('../types/creative').Render|null>} */
export async function saveRender(id, updates) {
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
    const { error } = await db.from('renders').update({ ...updates, updated_at: now }).eq('id', id);
    if (error) console.error('saveRender:', error);
  }
  return merged;
}
