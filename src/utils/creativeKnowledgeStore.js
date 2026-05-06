// Creative knowledge store — one row per (org, kind).
// Dual-write localStorage + Supabase. Saves bump `version` to keep
// an audit trail of when knowledge changed.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';
import { KNOWLEDGE_KINDS } from '../types/creativeKnowledge';

const LOCAL_KEY = 'cashmodel_creative_knowledge';

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeLocal(rows) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); }
  catch (err) { console.error('creativeKnowledgeStore write:', err); }
}

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
}

/**
 * Returns all knowledge rows for the current org, keyed by kind.
 * Always returns an entry for every kind, falling back to an empty
 * `{ fields: {}, version: 0 }` shape when no row exists yet, so the
 * editor can render without null checks.
 *
 * @returns {Promise<Record<string, { id: string|null, kind: string, fields: object, version: number, updated_at: string|null }>>}
 */
export async function getAllKnowledge() {
  const orgId = getCurrentOrgIdSync();
  let rows = [];
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('creative_knowledge')
      .select('*')
      .eq('organization_id', orgId);
    if (!error && Array.isArray(data)) {
      rows = data;
      writeLocal(rows);
    } else if (error) {
      console.error('getAllKnowledge:', error);
      rows = readLocal();
    }
  } else {
    rows = readLocal();
  }

  const keyed = {};
  for (const kind of KNOWLEDGE_KINDS) {
    const row = rows.find(r => r.kind === kind);
    keyed[kind] = row || { id: null, kind, fields: {}, version: 0, updated_at: null };
  }
  return keyed;
}

/**
 * Save a knowledge row for the current org. Bumps version.
 * @param {string} kind
 * @param {object} fields
 */
export async function saveKnowledge(kind, fields) {
  if (!KNOWLEDGE_KINDS.includes(kind)) {
    throw new Error(`Unknown knowledge kind: ${kind}`);
  }
  const orgId = getCurrentOrgIdSync();
  const now = new Date().toISOString();
  const local = readLocal();
  const idx = local.findIndex(r => r.kind === kind && r.organization_id === orgId);
  const prev = idx >= 0 ? local[idx] : null;
  const row = {
    id: prev?.id || newId(),
    organization_id: orgId || '',
    kind,
    fields,
    version: (prev?.version || 0) + 1,
    created_at: prev?.created_at || now,
    updated_at: now,
  };
  if (idx >= 0) local[idx] = row; else local.push(row);
  writeLocal(local);

  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db
      .from('creative_knowledge')
      .upsert(row, { onConflict: 'organization_id,kind' });
    if (error) console.error('saveKnowledge:', error);
  }
  return row;
}
