// Variant mapping store — explicit PLM style ↔ Shopify variant table.
//
// Replaces the fuzzy title substring match in poAllocations.js. That
// shortcut works until two styles share overlapping titles ("Heritage
// Tee" and "Heritage Tee Long Sleeve") at which point POs silently
// allocate to the wrong variant. This store is the explicit join key.
//
// Mirrors productionStore.js: localStorage primary, Supabase mirror
// behind IS_SUPABASE_ENABLED, organization-scoped, append-only audit
// log per CLAUDE.md (variant_mapping_audit collection — no update or
// delete exports).
//
// Natural key per organization is (style_id, options_key). Re-mapping
// archives the old row and creates a new one — never mutates the
// (style_id, options_key) → variant_gid edge in place. The audit log
// captures every transition for back-tracing.
//
// Shopify side stores three identifiers because variant GIDs are NOT
// permanent — when an out-of-stock size is deleted from a Shopify
// product the GID is destroyed; re-creating the size produces a new
// GID. inventory_item_id is more stable but also destroyable. SKU is
// the only identifier the operator fully controls. We cross-check all
// three on every sync to catch drift.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync, getCurrentUserIdSync } from '../lib/auth';

const MAPPING_KEY = 'cashmodel_variant_mappings';
const AUDIT_KEY   = 'cashmodel_variant_mapping_audit';

const SOURCES = new Set(['auto', 'manual', 'sync']);

// ── Storage primitives ─────────────────────────────────────────────────────

function readLocal(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function writeLocal(key, rows) {
  try { localStorage.setItem(key, JSON.stringify(rows)); }
  catch (err) { console.error('variantMappingStore write:', err); }
}
function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Canonicalize a variant_options object to a stable string so
// `{color:'Slate', size:'M'}` and `{size:'M', color:'Slate'}` collapse
// to the same key. Empty/null values are dropped so a missing axis
// doesn't create a phantom variant.
export function optionsKey(options) {
  if (!options || typeof options !== 'object') return '{}';
  const sorted = Object.keys(options).sort().reduce((acc, k) => {
    const v = options[k];
    if (v != null && v !== '') acc[k] = String(v).trim();
    return acc;
  }, {});
  return JSON.stringify(sorted);
}

// ── Append-only audit log ──────────────────────────────────────────────────
// Internal writer only. No update/delete exports — callers cannot mutate
// historical audit rows. Mirrors the pattern used by atom_usage in
// productionStore.js.

async function appendAudit({ mapping_id, action, before, after, reason }) {
  const orgId = getCurrentOrgIdSync();
  const userId = getCurrentUserIdSync();
  const row = {
    id: newId(),
    organization_id: orgId || '',
    mapping_id,
    action,
    before: before || null,
    after,
    reason: reason || '',
    actor: userId || 'system',
    created_at: new Date().toISOString(),
  };
  const rows = readLocal(AUDIT_KEY);
  rows.push(row);
  writeLocal(AUDIT_KEY, rows);
  if (IS_SUPABASE_ENABLED && orgId) {
    try {
      const db = await getAuthedSupabase();
      const { error } = await db.from('variant_mapping_audit').insert(row);
      if (error) console.error('appendAudit:', error);
    } catch (err) { console.error('appendAudit cloud:', err); }
  }
  return row;
}

export async function listAudit({ mapping_id = null, since = null } = {}) {
  const orgId = getCurrentOrgIdSync();
  let rows = readLocal(AUDIT_KEY);
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    let q = db.from('variant_mapping_audit').select('*').eq('organization_id', orgId);
    if (mapping_id) q = q.eq('mapping_id', mapping_id);
    if (since) q = q.gte('created_at', since);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (!error && Array.isArray(data)) rows = data;
    else if (error) console.error('listAudit:', error);
  }
  return rows
    .filter(r => (mapping_id ? r.mapping_id === mapping_id : true))
    .filter(r => (since ? (r.created_at || '') >= since : true))
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

// ── Mappings CRUD ──────────────────────────────────────────────────────────

export async function listMappings({ style_id = null, includeArchived = false } = {}) {
  const orgId = getCurrentOrgIdSync();
  let rows = readLocal(MAPPING_KEY);
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('variant_mappings')
      .select('*')
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false });
    if (!error && Array.isArray(data)) rows = data;
    else if (error) console.error('listMappings:', error);
  }
  return rows
    .filter(r => (style_id ? r.style_id === style_id : true))
    .filter(r => (includeArchived ? true : !r.archived_at))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

// Single active mapping for a (style_id, variant_options) pair, or null.
export async function getMapping({ style_id, variant_options }) {
  if (!style_id) return null;
  const key = optionsKey(variant_options);
  const all = await listMappings({ style_id });
  return all.find(r => optionsKey(r.variant_options) === key) || null;
}

// Reverse lookup: given a Shopify variant GID, what PLM style does it
// map to? Used by sell-through, on-hand reconciliation, and the
// "unmapped variant" alert in the daily sync.
export async function getMappingByVariantGid(shopify_variant_gid) {
  if (!shopify_variant_gid) return null;
  const all = await listMappings({});
  return all.find(r => r.shopify_variant_gid === shopify_variant_gid) || null;
}

export async function createMapping(input = {}) {
  if (!input.style_id) throw new Error('createMapping: style_id required');
  if (!input.shopify_variant_gid) throw new Error('createMapping: shopify_variant_gid required');
  if (input.source && !SOURCES.has(input.source)) {
    throw new Error(`createMapping: invalid source "${input.source}"`);
  }

  // Enforce one active mapping per (style_id, options_key). If one
  // exists we archive it first so the audit log shows the replacement.
  const existing = await getMapping({
    style_id: input.style_id,
    variant_options: input.variant_options || {},
  });
  if (existing) {
    await archiveMapping(existing.id, { reason: input.replace_reason || 'replaced by new mapping' });
  }

  const orgId = getCurrentOrgIdSync();
  const now = new Date().toISOString();
  const row = {
    id: newId(),
    organization_id: orgId || '',
    style_id: input.style_id,
    variant_options: input.variant_options || {},
    options_key: optionsKey(input.variant_options || {}),
    shopify_variant_gid: input.shopify_variant_gid,
    shopify_inventory_item_id: input.shopify_inventory_item_id || '',
    shopify_sku: input.shopify_sku || '',
    source: input.source || 'manual',
    confidence: typeof input.confidence === 'number' ? input.confidence : 1,
    verified_at: input.verified_at || null,
    archived_at: null,
    archive_reason: null,
    created_at: now,
    updated_at: now,
    created_by: getCurrentUserIdSync() || '',
  };

  const rows = readLocal(MAPPING_KEY);
  rows.push(row);
  writeLocal(MAPPING_KEY, rows);

  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db.from('variant_mappings').insert(row);
    if (error) console.error('createMapping:', error);
  }

  await appendAudit({
    mapping_id: row.id,
    action: 'created',
    before: null,
    after: row,
    reason: input.reason || `created via ${row.source}`,
  });

  return row;
}

// Edit Shopify-side identifiers in place (e.g., the variant GID was
// destroyed and re-created with a new GID but the same SKU). Use this
// when the LOGICAL mapping is unchanged. For an actual remap (different
// PLM style or different variant_options), call createMapping which
// auto-archives the old row.
export async function updateMapping(id, updates = {}, { reason = '' } = {}) {
  if (!id) return null;
  const rows = readLocal(MAPPING_KEY);
  const idx = rows.findIndex(r => r.id === id);
  if (idx < 0) return null;
  const before = rows[idx];

  const allowedKeys = new Set([
    'shopify_variant_gid',
    'shopify_inventory_item_id',
    'shopify_sku',
    'confidence',
    'source',
  ]);
  const cleanUpdates = {};
  for (const [k, v] of Object.entries(updates)) {
    if (allowedKeys.has(k)) cleanUpdates[k] = v;
  }
  if (cleanUpdates.source && !SOURCES.has(cleanUpdates.source)) {
    throw new Error(`updateMapping: invalid source "${cleanUpdates.source}"`);
  }

  const after = { ...before, ...cleanUpdates, updated_at: new Date().toISOString() };
  rows[idx] = after;
  writeLocal(MAPPING_KEY, rows);

  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db.from('variant_mappings')
      .update({ ...cleanUpdates, updated_at: after.updated_at })
      .eq('id', id)
      .eq('organization_id', orgId);
    if (error) console.error('updateMapping:', error);
  }

  await appendAudit({
    mapping_id: id,
    action: 'updated',
    before,
    after,
    reason: reason || 'fields updated',
  });

  return after;
}

export async function archiveMapping(id, { reason = '' } = {}) {
  if (!id) return null;
  const rows = readLocal(MAPPING_KEY);
  const idx = rows.findIndex(r => r.id === id);
  if (idx < 0) return null;
  const before = rows[idx];
  if (before.archived_at) return before;

  const after = { ...before, archived_at: new Date().toISOString(), archive_reason: reason, updated_at: new Date().toISOString() };
  rows[idx] = after;
  writeLocal(MAPPING_KEY, rows);

  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db.from('variant_mappings')
      .update({ archived_at: after.archived_at, archive_reason: after.archive_reason, updated_at: after.updated_at })
      .eq('id', id)
      .eq('organization_id', orgId);
    if (error) console.error('archiveMapping:', error);
  }

  await appendAudit({
    mapping_id: id,
    action: 'archived',
    before,
    after,
    reason,
  });

  return after;
}

// Bump verified_at on every successful sync where we re-saw this
// variant. Lets the daily sync surface "stale mappings" — ones that
// haven't been seen in N days because the underlying Shopify variant
// was deleted.
export async function markVerified(id, { synced_at = null } = {}) {
  if (!id) return null;
  const ts = synced_at || new Date().toISOString();
  const rows = readLocal(MAPPING_KEY);
  const idx = rows.findIndex(r => r.id === id);
  if (idx < 0) return null;
  const before = rows[idx];
  const after = { ...before, verified_at: ts, updated_at: ts };
  rows[idx] = after;
  writeLocal(MAPPING_KEY, rows);

  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    const { error } = await db.from('variant_mappings')
      .update({ verified_at: ts, updated_at: ts })
      .eq('id', id)
      .eq('organization_id', orgId);
    if (error) console.error('markVerified:', error);
  }

  await appendAudit({
    mapping_id: id,
    action: 'verified',
    before,
    after,
    reason: 'seen in sync',
  });

  return after;
}

// ── Backfill helpers (used by VariantMapper UI) ────────────────────────────

// Shopify variants that have no active mapping. Caller passes the full
// variant list from the most recent fetchShopifyVariantsWithInventory()
// pull; we filter by reverse-lookup against active mappings.
export async function findUnmappedShopifyVariants(shopifyVariants = []) {
  const all = await listMappings({});
  const mappedGids = new Set(all.map(r => r.shopify_variant_gid));
  return shopifyVariants.filter(v => v?.variantId && !mappedGids.has(v.variantId));
}

// PLM styles that have at least one variant_option triple with no
// mapping yet. Used to drive the "needs review" panel in the backfill UI.
export async function findStylesNeedingMapping(styles = []) {
  const all = await listMappings({});
  const mappedStyleIds = new Set(all.map(r => r.style_id));
  return styles.filter(s => s?.id && !mappedStyleIds.has(s.id));
}
