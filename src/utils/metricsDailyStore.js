// Metrics daily store — APPEND-ONLY. No update/delete at the store layer.
// Dual-write localStorage + Supabase.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';

const LOCAL_KEY = 'cashmodel_creative_metrics_daily';

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeLocal(rows) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); }
  catch (err) { console.error('metricsDailyStore write:', err); }
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

/** @returns {Promise<import('../types/creative').MetricsDaily[]>} */
export async function listMetricsDaily({ adId = null, since = null } = {}) {
  const orgId = getCurrentOrgIdSync();
  let cloudRows = null;
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    let q = db.from('metrics_daily').select('*').eq('organization_id', orgId).order('date', { ascending: false });
    if (adId) q = q.eq('ad_id', adId);
    if (since) q = q.gte('date', since);
    const { data, error } = await q;
    if (!error && Array.isArray(data)) cloudRows = data;
    else if (error) console.error('listMetricsDaily:', error);
  }
  let merged = unionByIdCloudFirst(cloudRows, readLocal());
  if (adId) merged = merged.filter(r => r.ad_id === adId);
  if (since) merged = merged.filter(r => r.date >= since);
  return merged.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Append a new daily metrics row. Idempotent by (ad_id, date) in localStorage;
 * DB has a UNIQUE constraint. Never updates existing rows.
 * @returns {Promise<import('../types/creative').MetricsDaily>}
 */
export async function appendMetrics(data) {
  const orgId = getCurrentOrgIdSync();
  const now = new Date().toISOString();
  const local = readLocal();
  const existing = local.find(r => r.ad_id === data.ad_id && r.date === data.date);
  if (existing) return existing;
  const row = {
    id: newId(),
    organization_id: orgId || '',
    ad_id: '',
    date: '',
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    cpa: null,
    ctr: null,
    created_at: now,
    ...data,
    organization_id: orgId || data.organization_id || '',
  };
  local.push(row);
  writeLocal(local);
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db.from('metrics_daily').insert(row);
    if (error && !error.message?.includes('unique')) console.error('appendMetrics:', error);
  }
  return row;
}

/**
 * Returns total spend for the current ISO week (Mon-Sun) across all ads.
 * @returns {Promise<number>}
 */
export async function getWeeklySpend() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  const since = monday.toISOString().slice(0, 10);
  const rows = await listMetricsDaily({ since });
  return rows.reduce((sum, r) => sum + (r.spend || 0), 0);
}
