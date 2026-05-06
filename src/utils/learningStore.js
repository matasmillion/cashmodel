// Learning store — APPEND-ONLY. No update/delete at the store layer.
// Dual-write localStorage + Supabase.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';

const LOCAL_KEY = 'cashmodel_creative_learnings';

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeLocal(rows) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); }
  catch (err) { console.error('learningStore write:', err); }
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

/** @returns {Promise<import('../types/creative').Learning[]>} */
export async function listLearnings({ lane = null, outcome = null, hypothesisType = null } = {}) {
  const orgId = getCurrentOrgIdSync();
  let cloudRows = null;
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    let q = db.from('learnings').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
    if (lane) q = q.eq('lane', lane);
    if (outcome) q = q.eq('outcome', outcome);
    if (hypothesisType) q = q.eq('hypothesis_type', hypothesisType);
    const { data, error } = await q;
    if (!error && Array.isArray(data)) cloudRows = data;
    else if (error) console.error('listLearnings:', error);
  }
  let merged = unionByIdCloudFirst(cloudRows, readLocal());
  if (lane) merged = merged.filter(r => r.lane === lane);
  if (outcome) merged = merged.filter(r => r.outcome === outcome);
  if (hypothesisType) merged = merged.filter(r => r.hypothesis_type === hypothesisType);
  return merged.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

/**
 * Returns structured learning context for the brief generation prompt.
 * Pulls recent winners for the lane (max 8) + recent losers for hypothesis type (max 4).
 * @param {string} lane
 * @param {string} hypothesisType
 */
export async function getLearningsForBrief(lane, hypothesisType) {
  const [winners, losers] = await Promise.all([
    listLearnings({ lane, outcome: 'winner' }),
    listLearnings({ hypothesisType, outcome: 'loser' }),
  ]);
  return {
    winners: winners.slice(0, 8),
    losers: losers.slice(0, 4),
  };
}

/**
 * Append a new learning. Never updates existing rows.
 * @returns {Promise<import('../types/creative').Learning>}
 */
export async function appendLearning(data) {
  const orgId = getCurrentOrgIdSync();
  const now = new Date().toISOString();
  const row = {
    id: newId(),
    organization_id: orgId || '',
    sprint_id: null,
    lane: '',
    hypothesis_type: '',
    outcome: '',
    summary: '',
    tags: [],
    seeded_from: null,
    created_at: now,
    ...data,
    organization_id: orgId || data.organization_id || '',
  };
  const local = readLocal();
  local.push(row);
  writeLocal(local);
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db.from('learnings').insert(row);
    if (error) console.error('appendLearning:', error);
  }
  return row;
}
