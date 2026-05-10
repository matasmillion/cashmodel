// Brief store — dual-write localStorage + Supabase.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';

const LOCAL_KEY = 'cashmodel_creative_briefs';

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeLocal(rows) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); }
  catch (err) { console.error('briefStore write:', err); }
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

/** @returns {Promise<import('../types/creative').Brief[]>} */
export async function listBriefs({ sprintId = null } = {}) {
  const orgId = getCurrentOrgIdSync();
  let cloudRows = null;
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    let q = db.from('briefs').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
    if (sprintId) q = q.eq('sprint_id', sprintId);
    const { data, error } = await q;
    if (!error && Array.isArray(data)) cloudRows = data;
    else if (error) console.error('listBriefs:', error);
  }
  let merged = unionByIdCloudFirst(cloudRows, readLocal());
  if (sprintId) merged = merged.filter(r => r.sprint_id === sprintId);
  return merged.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

/** @returns {Promise<import('../types/creative').Brief|null>} */
export async function getBrief(id) {
  if (!id) return null;
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db.from('briefs').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle();
    if (!error && data) {
      const local = readLocal();
      const idx = local.findIndex(r => r.id === id);
      if (idx >= 0) local[idx] = { ...local[idx], ...data };
      else local.push(data);
      writeLocal(local);
      return data;
    }
    if (error) console.error('getBrief:', error);
  }
  return readLocal().find(r => r.id === id) || null;
}

/** @returns {Promise<import('../types/creative').Brief>} */
export async function createBrief(overrides = {}) {
  const orgId = getCurrentOrgIdSync();
  const now = new Date().toISOString();
  const existing = readLocal().filter(r => r.sprint_id === overrides.sprint_id);
  const version = existing.length + 1;
  const row = {
    id: newId(),
    organization_id: orgId || '',
    sprint_id: '',
    version,
    status: 'draft',
    hypothesis: '',
    key_feeling: '',
    hook: '',
    payoff: '',
    shot_list: [],
    caption: '',
    prompt_blueprint: '',
    past_learnings_consulted: [],
    agent_model: '',
    generated_at: null,
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
    const { error } = await db.from('briefs').insert(row);
    if (error) console.error('createBrief:', error);
  }
  return row;
}

/** @returns {Promise<import('../types/creative').Brief|null>} */
export async function saveBrief(id, updates) {
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
    const { error } = await db.from('briefs').update({ ...updates, updated_at: now }).eq('id', id);
    if (error) console.error('saveBrief:', error);
  }
  return merged;
}

/**
 * Returns the most recent approved brief for a sprint, or null.
 * @param {string} sprintId
 * @returns {Promise<import('../types/creative').Brief|null>}
 */
export async function getLatestApprovedBrief(sprintId) {
  const briefs = await listBriefs({ sprintId });
  return briefs.find(b => b.status === 'approved') || null;
}
