// Discussion store — weekly synthesis session records.
// Dual-write localStorage + Supabase.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';

const LOCAL_KEY = 'cashmodel_creative_discussions';

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeLocal(rows) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); }
  catch (err) { console.error('discussionStore write:', err); }
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

/** @returns {Promise<import('../types/creative').Discussion[]>} */
export async function listDiscussions({ finalized = null } = {}) {
  const orgId = getCurrentOrgIdSync();
  let cloudRows = null;
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    let q = db.from('discussions').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
    if (finalized !== null) q = q.eq('finalized', finalized);
    const { data, error } = await q;
    if (!error && Array.isArray(data)) cloudRows = data;
    else if (error) console.error('listDiscussions:', error);
  }
  let merged = unionByIdCloudFirst(cloudRows, readLocal());
  if (finalized !== null) merged = merged.filter(r => r.finalized === finalized);
  return merged.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

/** @returns {Promise<import('../types/creative').Discussion|null>} */
export async function getDiscussion(id) {
  if (!id) return null;
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db.from('discussions').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle();
    if (!error && data) {
      const local = readLocal();
      const idx = local.findIndex(r => r.id === id);
      if (idx >= 0) local[idx] = { ...local[idx], ...data };
      else local.push(data);
      writeLocal(local);
      return data;
    }
    if (error) console.error('getDiscussion:', error);
  }
  return readLocal().find(r => r.id === id) || null;
}

/** @returns {Promise<import('../types/creative').Discussion>} */
export async function createDiscussion(overrides = {}) {
  const orgId = getCurrentOrgIdSync();
  const now = new Date().toISOString();
  const row = {
    id: newId(),
    organization_id: orgId || '',
    sprint_id: null,
    synthesis_draft: '',
    final_text: '',
    finalized: false,
    finalized_at: null,
    next_constraint_seed: null,
    messages: [],
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  const local = readLocal();
  local.push(row);
  writeLocal(local);
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db.from('discussions').insert(row);
    if (error) console.error('createDiscussion:', error);
  }
  return row;
}

/** @returns {Promise<import('../types/creative').Discussion|null>} */
export async function saveDiscussion(id, updates) {
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
    const { error } = await db.from('discussions').upsert({ ...merged, organization_id: orgId }).eq('id', id);
    if (error) console.error('saveDiscussion:', error);
  }
  return merged;
}

/**
 * Append a message to a discussion's message log.
 * @param {string} id  discussion id
 * @param {{ role: string, content: string }} message
 */
export async function appendDiscussionMessage(id, message) {
  const disc = await getDiscussion(id);
  if (!disc) return null;
  const messages = [...(disc.messages || []), { ...message, ts: new Date().toISOString() }];
  return saveDiscussion(id, { messages });
}
