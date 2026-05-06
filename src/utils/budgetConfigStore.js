// Budget config store — one row per org, auto-seeded on first read.
// Dual-write localStorage + Supabase.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';
import { getWeeklySpend } from './metricsDailyStore';

const LOCAL_KEY = 'cashmodel_creative_budget_config';

const DEFAULTS = {
  weekly_cap: 2000.00,
  alert_threshold: 0.90,
  writes_enabled: true,
  cpa_target: null,
};

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeLocal(row) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(row)); }
  catch (err) { console.error('budgetConfigStore write:', err); }
}

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
}

/** @returns {Promise<import('../types/creative').BudgetConfig>} */
export async function getBudgetConfig() {
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db.from('budget_config').select('*').eq('organization_id', orgId).maybeSingle();
    if (!error && data) {
      writeLocal(data);
      return data;
    }
    if (error) console.error('getBudgetConfig:', error);
  }
  const local = readLocal();
  if (local) return local;
  // First-time seed
  return saveBudgetConfig(DEFAULTS);
}

/** @returns {Promise<import('../types/creative').BudgetConfig>} */
export async function saveBudgetConfig(updates) {
  const orgId = getCurrentOrgIdSync();
  const now = new Date().toISOString();
  const existing = readLocal();
  const merged = {
    id: existing?.id || newId(),
    organization_id: orgId || existing?.organization_id || '',
    ...DEFAULTS,
    ...(existing || {}),
    ...updates,
    updated_at: now,
    created_at: existing?.created_at || now,
  };
  writeLocal(merged);
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db.from('budget_config').upsert(merged);
    if (error) console.error('saveBudgetConfig:', error);
  }
  return merged;
}

/**
 * Returns true if it is safe to write a new ad to Meta.
 * Blocks when writes_enabled=false OR weekly spend >= cap × alert_threshold.
 * @returns {Promise<{ allowed: boolean, reason: string|null, weeklySpend: number, config: import('../types/creative').BudgetConfig }>}
 */
export async function checkBudgetGuardrail() {
  const [config, weeklySpend] = await Promise.all([getBudgetConfig(), getWeeklySpend()]);
  if (!config.writes_enabled) {
    return { allowed: false, reason: 'writes_disabled', weeklySpend, config };
  }
  const cap = config.weekly_cap * config.alert_threshold;
  if (weeklySpend >= cap) {
    return { allowed: false, reason: 'cap_reached', weeklySpend, config };
  }
  return { allowed: true, reason: null, weeklySpend, config };
}
