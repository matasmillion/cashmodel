// Inventory read model — joins Shopify on-hand, PLM style data, variant
// mappings, and the tracked flag into a single per-SKU record.
//
// Data flow:
//   sellThroughStore snapshot  →  on_hand, salesByDay per Shopify variant
//   variantMappingStore        →  variantId → style_id join key
//   techPackStore              →  style metadata (name, cat, tier, color, size)
//   productionStore open POs   →  on_order units per style_id
//   tracking localStorage      →  tracked flag (default by tier)
//
// tracking_audit is append-only per CLAUDE.md. No update/delete exports.
//
// When the sell-through snapshot is empty (not yet synced), list() returns [].
// Operators sync via the existing liveDataSync pull before using inventory views.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync, getCurrentUserIdSync } from '../lib/auth';
import { readLocal as readSTSnapshot } from './sellThroughStore';
import { unitsInWindow } from './sellThroughStore';
import { listMappings } from './variantMappingStore';
import { listPOs } from './productionStore';

const TRACKING_KEY = 'cashmodel_inventory_tracking';
const AUDIT_KEY    = 'cashmodel_tracking_audit';

// Open PO statuses that contribute on_order units (received = already on hand).
const OPEN_PO_STATUSES = new Set(['placed', 'in_production']);

// ── Storage primitives ─────────────────────────────────────────────────────

function readTrackingMap() {
  try {
    const raw = localStorage.getItem(TRACKING_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writeTrackingMap(map) {
  try { localStorage.setItem(TRACKING_KEY, JSON.stringify(map)); }
  catch (err) { console.error('inventoryStore tracking write:', err); }
}

function readAudit() {
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeAudit(rows) {
  try { localStorage.setItem(AUDIT_KEY, JSON.stringify(rows)); }
  catch (err) { console.error('inventoryStore audit write:', err); }
}

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Default tracked flag ───────────────────────────────────────────────────
// Staples track by default; Drops are one-and-done so they default off.
// Operator overrides live in TRACKING_KEY and take precedence.

function defaultTracked(tier) {
  return tier !== 'Drop';
}

// ── On-order computation ───────────────────────────────────────────────────
// Sum open PO units per style_id. Returns Map<style_id, number>.
// Size-break-aware: if PO has size_break, sum its values; otherwise use units.

async function buildOnOrderByStyle() {
  const pos = await listPOs().catch(() => []);
  const byStyle = new Map();
  for (const po of pos) {
    if (!OPEN_PO_STATUSES.has(po.status)) continue;
    const styleId = po.style_id;
    if (!styleId) continue;
    let qty = 0;
    if (po.size_break && typeof po.size_break === 'object') {
      qty = Object.values(po.size_break).reduce((s, v) => s + (Number(v) || 0), 0);
    } else {
      qty = Number(po.units) || 0;
    }
    byStyle.set(styleId, (byStyle.get(styleId) || 0) + qty);
  }
  return byStyle;
}

// ── listTechPacks — lazy import to avoid circular deps ────────────────────

async function fetchTechPacks() {
  try {
    const { listTechPacks } = await import('./techPackStore');
    return await listTechPacks();
  } catch { return []; }
}

// ── Snapshot → InventorySku assembly ──────────────────────────────────────

/**
 * @typedef {Object} InventorySku
 * @property {string} sku
 * @property {string} style_id
 * @property {string} variant_id
 * @property {string} style_name
 * @property {string} color
 * @property {string} size
 * @property {string} cat
 * @property {'Staple'|'Drop'} tier
 * @property {number} on_hand               // clamped >= 0
 * @property {number} oversold               // |negative qty| when Shopify reports < 0
 * @property {{[loc: string]: number}} on_hand_by_location
 * @property {number} on_order
 * @property {number} allocated
 * @property {number|null} cost
 * @property {number|null} retail
 * @property {number} sold_4w
 * @property {number} sold_12w
 * @property {boolean} tracked
 * @property {string|null} first_received
 */

/**
 * Returns all InventorySku records by joining snapshot + mappings + PLM + POs.
 * Returns [] when the sell-through snapshot hasn't been synced yet.
 *
 * @returns {Promise<InventorySku[]>}
 */
export async function list() {
  const snapshot = readSTSnapshot();
  const snapshotVariants = snapshot?.variants;
  if (!Array.isArray(snapshotVariants) || snapshotVariants.length === 0) {
    return [];
  }

  const [mappings, techPacks, onOrderByStyle] = await Promise.all([
    listMappings({}).catch(() => []),
    fetchTechPacks(),
    buildOnOrderByStyle(),
  ]);

  const trackingMap   = readTrackingMap();
  const today         = new Date();

  // Index active mappings by shopify_variant_gid for O(1) lookup.
  const mappingByGid = new Map();
  for (const m of mappings) {
    if (!m.archived_at && m.shopify_variant_gid) {
      mappingByGid.set(m.shopify_variant_gid, m);
    }
  }

  // Index techpacks by id.
  const packById = new Map();
  for (const p of techPacks) {
    if (p?.id) packById.set(p.id, p);
  }

  // Count active mapped variants per style so we can split on_order evenly.
  const variantCountByStyle = new Map();
  for (const m of mappings) {
    if (!m.archived_at && m.style_id) {
      variantCountByStyle.set(m.style_id, (variantCountByStyle.get(m.style_id) || 0) + 1);
    }
  }

  const skus = [];
  for (const v of snapshotVariants) {
    const mapping = mappingByGid.get(v.variantId);
    const pack    = mapping ? packById.get(mapping.style_id) : null;

    // PLM-mapped path: use the linked tech pack as the source of truth, with
    //   Shopify as fallback for missing fields.
    // Unmapped path: synthesize a record straight from Shopify so every
    //   active variant shows up. style_id falls back to the Shopify productId
    //   so all variants of the same product group together; on_order still
    //   matches if the operator later creates a PO against a real style.
    const styleData = pack?.data || {};
    const styleId   = mapping?.style_id || v.productId || v.variantId;
    const styleName = styleData.styleName || styleData.styleNumber || pack?.style_name || v.productTitle || '';
    const { size: parsedSize, color: parsedColor } = parseVariantTitle(v.variantTitle);
    const color     = styleData.colorName || mapping?.variant_options?.color || parsedColor;
    const size      = mapping?.variant_options?.size || parsedSize;
    const cat       = styleData.productCategory || pack?.product_category || v.productType || '';
    const tier      = /** @type {'Staple'|'Drop'} */ (styleData.tier || 'Staple');
    const retail    = styleData.retailPrice != null ? Number(styleData.retailPrice)
                    : (v.price != null ? Number(v.price) : null);
    const cost      = v.unitCost != null ? Number(v.unitCost)
                    : (styleData.unitCostUSD != null ? Number(styleData.unitCostUSD) : null);

    // Split style on_order evenly across its mapped variants. Unmapped
    // variants don't get on_order even if a PO exists for the same product —
    // the operator needs an explicit mapping for that math to be safe.
    const styleOnOrder = mapping ? (onOrderByStyle.get(mapping.style_id) || 0) : 0;
    const variantCount = mapping ? (variantCountByStyle.get(mapping.style_id) || 1) : 1;
    const onOrder      = Math.round(styleOnOrder / variantCount);

    const salesByDay = v.salesByDay || {};
    const sold4w     = unitsInWindow(salesByDay, 28, today);
    const sold12w    = unitsInWindow(salesByDay, 84, today);

    const sku = v.sku || mapping?.shopify_sku || '';
    if (!sku) continue; // Shopify variants without a SKU can't be tracked.

    // tracked: stored override → tier default
    const tracked = sku in trackingMap ? Boolean(trackingMap[sku]) : defaultTracked(tier);

    // Shopify can report negative inventoryQuantity (oversold). Clamp to 0
    // for display math but expose the oversold flag separately.
    const rawOnHand = Number(v.inventoryQuantity) || 0;
    const onHand    = Math.max(0, rawOnHand);
    const oversold  = rawOnHand < 0 ? -rawOnHand : 0;

    skus.push({
      sku,
      style_id:            styleId,
      variant_id:          v.variantId,
      style_name:          styleName,
      color,
      size,
      cat,
      tier,
      on_hand:             onHand,
      oversold,
      on_hand_by_location: v.inventoryByLocation || {},
      on_order:            onOrder,
      allocated:           Number(v.allocated) || 0,
      cost,
      retail,
      sold_4w:             sold4w,
      sold_12w:            sold12w,
      salesByDay,
      tracked,
      first_received:      v.first_received || null,
    });
  }

  return skus;
}

// Best-effort split of a Shopify variant title into size + color. Real-world
// titles seen on FR: "W32 / Stone", "S", "Sand / M", "Erosion Pendant",
// "Default Title". Heuristic: a size token matches one of the known patterns
// (S/M/L/XL/XXL or Wnn); whichever side of " / " matches becomes size, the
// other becomes color. No match → whole title goes into size.
const SIZE_RE = /^(?:XS|S|M|L|XL|XXL|XXXL|W\d{2}|\d{2})$/i;
function parseVariantTitle(title) {
  const t = (title || '').trim();
  if (!t || t === 'Default Title') return { size: '', color: '' };
  if (!t.includes(' / ')) {
    return SIZE_RE.test(t) ? { size: t, color: '' } : { size: '', color: t };
  }
  const [a, b] = t.split(' / ').map(s => s.trim());
  if (SIZE_RE.test(a)) return { size: a, color: b };
  if (SIZE_RE.test(b)) return { size: b, color: a };
  return { size: t, color: '' };
}

/**
 * Single SKU lookup. Returns null when not found.
 *
 * @param {string} sku
 * @returns {Promise<InventorySku|null>}
 */
export async function get(sku) {
  if (!sku) return null;
  const all = await list();
  return all.find(s => s.sku === sku) || null;
}

/**
 * Returns only tracked SKUs.
 *
 * @returns {Promise<InventorySku[]>}
 */
export async function listTracked() {
  const all = await list();
  return all.filter(s => s.tracked);
}

/**
 * Returns only untracked SKUs.
 *
 * @returns {Promise<InventorySku[]>}
 */
export async function listUntracked() {
  const all = await list();
  return all.filter(s => !s.tracked);
}

// ── Tracking toggle ────────────────────────────────────────────────────────

/**
 * Toggle the tracked flag for a SKU. Appends to tracking_audit (append-only).
 * Syncs the new state to Supabase inventory_tracking (best-effort).
 *
 * @param {string} sku
 * @param {boolean} tracked
 * @returns {Promise<void>}
 */
export async function setTracked(sku, tracked) {
  if (!sku) return;
  const map  = readTrackingMap();
  const prev = sku in map ? Boolean(map[sku]) : null;
  map[sku]   = Boolean(tracked);
  writeTrackingMap(map);

  await appendTrackingAudit({ sku, prev, next: Boolean(tracked) });

  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    try {
      const db = await getAuthedSupabase();
      await db.from('inventory_tracking').upsert(
        { sku, tracked: Boolean(tracked), updated_at: new Date().toISOString() },
        { onConflict: 'sku' },
      );
    } catch (err) { console.error('inventoryStore setTracked cloud:', err); }
  }
}

// ── Append-only audit log ──────────────────────────────────────────────────
// Internal only. No update/delete exports.

async function appendTrackingAudit({ sku, prev, next }) {
  const actor = getCurrentUserIdSync() || 'system';
  const row = {
    id:  newId(),
    sku,
    prev: prev,
    next,
    actor,
    at: new Date().toISOString(),
  };

  const rows = readAudit();
  rows.push(row);
  writeAudit(rows);

  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    try {
      const db = await getAuthedSupabase();
      const { error } = await db.from('tracking_audit').insert({
        ...row,
        organization_id: orgId,
      });
      if (error) console.error('tracking_audit cloud insert:', error);
    } catch (err) { console.error('tracking_audit cloud:', err); }
  }

  return row;
}

/**
 * Read tracking audit log. Filtered by SKU and/or since date.
 * Never exposes update/delete — this log is append-only.
 *
 * @param {{ sku?: string, since?: string }} opts
 * @returns {Promise<Array>}
 */
export async function listTrackingAudit({ sku = null, since = null } = {}) {
  const orgId = getCurrentOrgIdSync();
  let rows = readAudit();

  if (IS_SUPABASE_ENABLED && orgId) {
    try {
      const db = await getAuthedSupabase();
      let q = db.from('tracking_audit').select('*').eq('organization_id', orgId);
      if (sku)   q = q.eq('sku', sku);
      if (since) q = q.gte('at', since);
      const { data, error } = await q.order('at', { ascending: false });
      if (!error && Array.isArray(data)) rows = data;
      else if (error) console.error('listTrackingAudit:', error);
    } catch (err) { console.error('listTrackingAudit cloud:', err); }
  }

  return rows
    .filter(r => (sku   ? r.sku >= sku && r.sku <= sku : true))
    .filter(r => (sku   ? r.sku === sku                : true))
    .filter(r => (since ? (r.at || '') >= since         : true))
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
}

// ── Bulk tracked sync from Supabase ───────────────────────────────────────
// Call on app init to hydrate localStorage with any cloud overrides made
// from another device/session. Best-effort; never blocks UI.

export async function hydratTrackingFromCloud() {
  const orgId = getCurrentOrgIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId) return;
  try {
    const db = await getAuthedSupabase();
    const { data, error } = await db
      .from('inventory_tracking')
      .select('sku, tracked');
    if (error || !Array.isArray(data)) return;
    const map = readTrackingMap();
    for (const row of data) {
      map[row.sku] = Boolean(row.tracked);
    }
    writeTrackingMap(map);
  } catch (err) { console.error('hydratTrackingFromCloud:', err); }
}
