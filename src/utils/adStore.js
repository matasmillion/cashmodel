// Ad store — dual-write localStorage + Supabase.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';

const LOCAL_KEY = 'cashmodel_creative_ads';

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeLocal(rows) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); }
  catch (err) { console.error('adStore write:', err); }
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

/** @returns {Promise<import('../types/creative').Ad[]>} */
export async function listAds({ sprintId = null, status = null } = {}) {
  const orgId = getCurrentOrgIdSync();
  let cloudRows = null;
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    let q = db.from('ads').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
    if (sprintId) q = q.eq('sprint_id', sprintId);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (!error && Array.isArray(data)) cloudRows = data;
    else if (error) console.error('listAds:', error);
  }
  let merged = unionByIdCloudFirst(cloudRows, readLocal());
  if (sprintId) merged = merged.filter(r => r.sprint_id === sprintId);
  if (status) merged = merged.filter(r => r.status === status);
  return merged.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

/** @returns {Promise<import('../types/creative').Ad|null>} */
export async function getAd(id) {
  if (!id) return null;
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db.from('ads').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle();
    if (!error && data) {
      const local = readLocal();
      const idx = local.findIndex(r => r.id === id);
      if (idx >= 0) local[idx] = { ...local[idx], ...data };
      else local.push(data);
      writeLocal(local);
      return data;
    }
    if (error) console.error('getAd:', error);
  }
  return readLocal().find(r => r.id === id) || null;
}

/** @returns {Promise<import('../types/creative').Ad>} */
export async function createAd(overrides = {}) {
  const orgId = getCurrentOrgIdSync();
  const now = new Date().toISOString();
  const row = {
    id: newId(),
    organization_id: orgId || '',
    render_id: '',
    sprint_id: '',
    ad_name: '',
    meta_campaign_id: null,
    meta_adset_id: null,
    meta_ad_id: null,
    status: 'paused',
    recommendation: null,
    spend_to_date: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    cpa: null,
    utm_params: '',
    idempotency_key: null,
    published_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  const local = readLocal();
  local.push(row);
  writeLocal(local);
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db.from('ads').insert(row);
    if (error) console.error('createAd:', error);
  }
  return row;
}

/** @returns {Promise<import('../types/creative').Ad|null>} */
export async function saveAd(id, updates) {
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
    const { error } = await db.from('ads').update({ ...updates, updated_at: now }).eq('id', id);
    if (error) console.error('saveAd:', error);
  }
  return merged;
}
