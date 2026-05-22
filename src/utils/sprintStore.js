// Sprint store — dual-write localStorage + Supabase.
// Mirrors treatmentStore.js pattern exactly.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';

const LOCAL_KEY = 'cashmodel_creative_sprints';

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeLocal(rows) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); }
  catch (err) { console.error('sprintStore write:', err); }
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

function nextSprintNumber(rows, orgId) {
  const orgRows = rows.filter(r => r.organization_id === orgId || !r.organization_id);
  let max = 0;
  orgRows.forEach(r => { if (r.sprint_number > max) max = r.sprint_number; });
  return max + 1;
}

/** @returns {Promise<import('../types/creative').Sprint[]>} */
export async function listSprints({ status = null } = {}) {
  const orgId = getCurrentOrgIdSync();
  let cloudRows = null;
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    let q = db.from('sprints').select('*').eq('organization_id', orgId).order('sprint_number', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (!error && Array.isArray(data)) cloudRows = data;
    else if (error) console.error('listSprints:', error);
  }
  let merged = unionByIdCloudFirst(cloudRows, readLocal());
  if (status) merged = merged.filter(r => r.status === status);
  return merged.sort((a, b) => (b.sprint_number || 0) - (a.sprint_number || 0));
}

/** @returns {Promise<import('../types/creative').Sprint|null>} */
export async function getSprint(id) {
  if (!id) return null;
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db.from('sprints').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle();
    if (!error && data) {
      const local = readLocal();
      const idx = local.findIndex(r => r.id === id);
      if (idx >= 0) local[idx] = { ...local[idx], ...data };
      else local.push(data);
      writeLocal(local);
      return data;
    }
    if (error) console.error('getSprint:', error);
  }
  return readLocal().find(r => r.id === id) || null;
}

/** @returns {Promise<import('../types/creative').Sprint>} */
export async function createSprint(overrides = {}) {
  const orgId = getCurrentOrgIdSync();
  const local = readLocal();
  const sprintNumber = nextSprintNumber(local, orgId);
  const now = new Date().toISOString();
  const row = {
    id: newId(),
    organization_id: orgId || '',
    sprint_number: sprintNumber,
    lane: 'ai',
    status: 'drafting',
    hypothesis_type: '',
    constraint_text: '',
    next_constraint_seed: null,
    cpa_target: null,
    kill_multiplier: 1.5,
    scale_threshold: 0.7,
    closed_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  local.push(row);
  writeLocal(local);
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db.from('sprints').insert(row);
    if (error) console.error('createSprint:', error);
  }
  return row;
}

/** @returns {Promise<import('../types/creative').Sprint|null>} */
export async function saveSprint(id, updates) {
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
    const { error } = await db.from('sprints').update({ ...updates, updated_at: now }).eq('id', id);
    if (error) console.error('saveSprint:', error);
  }
  return merged;
}
