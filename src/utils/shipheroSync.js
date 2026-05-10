// ShipHero integration — client + sync helpers.
//
// Multi-tenant: each org saves their own refresh token in user_integrations
// with provider='shiphero'. The shiphero-proxy Edge Function reads it,
// exchanges it for a short-lived access token, and forwards GraphQL ops.
//
// Behavior:
//   - When a PO transitions to status='placed', we fire-and-forget a push
//     to ShipHero (auto-create PO with line items + cost + landing date).
//   - On success, the PO is annotated with shiphero_po_id and shiphero_synced_at.
//   - On failure, shiphero_sync_error is recorded; the local transition still
//     succeeds — ShipHero downtime never blocks ops.
//   - The operator can manually re-push from the PO row (overwrites status).
//   - When the operator enters tracking + carrier on the PO, a separate
//     update mutation pushes those to ShipHero.

import { supabase, IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync, getClerkToken } from '../lib/auth';
import { listMappings } from './variantMappingStore';

const SHIPHERO_PROVIDER = 'shiphero';

// ── Credential CRUD ──────────────────────────────────────────────────────

/**
 * Save the org's ShipHero refresh token + optional default warehouse + account.
 *
 * @param {Object} opts
 * @param {string} opts.refreshToken          — long-lived ShipHero refresh token
 * @param {string} [opts.defaultWarehouseId]  — ShipHero warehouse_id used on every PO
 * @param {string} [opts.accountId]           — ShipHero account_id (for 3PL multi-account setups)
 */
export async function saveShipHeroCredentials({ refreshToken, defaultWarehouseId, accountId }) {
  if (!IS_SUPABASE_ENABLED) throw new Error('Supabase not configured');
  const orgId = getCurrentOrgIdSync();
  if (!orgId) throw new Error('No active organization');
  if (!refreshToken) throw new Error('Refresh token is required');

  const db = await getAuthedSupabase();
  const { error } = await db
    .from('user_integrations')
    .upsert(
      {
        org_id: orgId,
        provider: SHIPHERO_PROVIDER,
        token: refreshToken,
        metadata: {
          default_warehouse_id: defaultWarehouseId || null,
          account_id: accountId || null,
        },
      },
      { onConflict: 'org_id,provider' },
    );
  if (error) throw new Error(`Failed to save ShipHero credentials: ${error.message}`);
}

/**
 * Returns { defaultWarehouseId, accountId, updatedAt } for the active org,
 * or null if not connected.
 */
export async function loadShipHeroIntegration() {
  if (!IS_SUPABASE_ENABLED) return null;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return null;
  const db = await getAuthedSupabase();
  const { data, error } = await db
    .from('user_integrations')
    .select('metadata, updated_at')
    .eq('org_id', orgId)
    .eq('provider', SHIPHERO_PROVIDER)
    .maybeSingle();
  if (error || !data) return null;
  return {
    defaultWarehouseId: data.metadata?.default_warehouse_id || null,
    accountId:          data.metadata?.account_id || null,
    updatedAt:          data.updated_at,
  };
}

export async function deleteShipHeroCredentials() {
  if (!IS_SUPABASE_ENABLED) return;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return;
  const db = await getAuthedSupabase();
  await db.from('user_integrations').delete()
    .eq('org_id', orgId)
    .eq('provider', SHIPHERO_PROVIDER);
}

/**
 * Returns true if the active org has saved ShipHero credentials.
 * Cheap check used to gate the auto-push hook.
 */
export async function isShipHeroConnected() {
  return Boolean(await loadShipHeroIntegration());
}

// ── Proxy gateway ────────────────────────────────────────────────────────

/**
 * Call the shiphero-proxy Edge Function with a GraphQL operation. The
 * proxy whitelists a fixed set of operation names (see supabase/functions/
 * shiphero-proxy/index.ts).
 */
export async function callShipHeroProxy(query, variables = {}) {
  if (!IS_SUPABASE_ENABLED || !supabase) {
    throw new Error('Supabase not configured — cannot reach the ShipHero proxy');
  }
  const token = await getClerkToken();
  if (!token) throw new Error('Sign in to use ShipHero');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/shiphero-proxy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    const msg = data?.error || `${res.status} ${res.statusText}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  if (data?.errors?.length) {
    const msg = data.errors.map(e => e.message || JSON.stringify(e)).join('; ');
    throw new Error(`ShipHero: ${msg}`);
  }
  return data?.data || data;
}

/**
 * Pings ShipHero with a small read query — used to verify saved credentials
 * resolve to a valid account.
 */
export async function testShipHeroConnection() {
  const result = await callShipHeroProxy(`
    query account {
      account { data { id email } }
    }
  `);
  return result?.account?.data || null;
}

// ── Line item builder ────────────────────────────────────────────────────

/**
 * Convert one of our PO records into ShipHero PurchaseOrderLineItemInput[].
 *
 * Strategy in order of preference:
 *   1. po.size_break — one ShipHero line per (style-variant-with-this-size,
 *      qty) using variant mappings to resolve the SKU.
 *   2. po.line_items — one ShipHero line per line item, using variant mappings
 *      to expand each PLM product_id into its SKUs (split evenly).
 *   3. Fallback — one ShipHero line with style_id as placeholder SKU + total
 *      units. Operator must reconcile in ShipHero.
 *
 * @param {Object} po                   productionStore PO record
 * @param {Array} mappings              variantMappingStore.listMappings() result
 * @returns {Array<{ sku, quantity, price, vendor_sku? }>}
 */
export function buildShipHeroLineItems(po, mappings) {
  const price = String(Number(po.unit_cost_usd) || 0);

  // Index mappings by style_id for quick lookup.
  const byStyle = new Map();
  for (const m of mappings || []) {
    if (m.archived_at) continue;
    if (!byStyle.has(m.style_id)) byStyle.set(m.style_id, []);
    byStyle.get(m.style_id).push(m);
  }
  const styleMappings = byStyle.get(po.style_id) || [];

  // 1. size_break path — one ShipHero line per (sku, qty)
  if (po.size_break && Object.keys(po.size_break).length > 0) {
    const out = [];
    for (const [size, qty] of Object.entries(po.size_break)) {
      const q = Number(qty) || 0;
      if (q <= 0) continue;
      const m = styleMappings.find(x => x.variant_options?.size === size);
      const sku = m?.shopify_sku || `${po.style_id}-${size}`;
      out.push({ sku, quantity: q, price });
    }
    if (out.length) return out;
  }

  // 2. line_items path — one ShipHero line per item
  if (Array.isArray(po.line_items) && po.line_items.length > 0) {
    return po.line_items
      .filter(li => Number(li.quantity) > 0)
      .map(li => ({
        sku: li.shopify_sku || li.product_id || `${po.style_id}-${li.product_name || ''}`.trim(),
        quantity: Number(li.quantity) || 0,
        price: String(Number(li.landed_cpu) || price),
      }));
  }

  // 3. Fallback — one line with style_id placeholder
  return [{ sku: po.style_id || po.code || 'UNKNOWN-SKU', quantity: Number(po.units) || 0, price }];
}

// ── PO push + tracking update ────────────────────────────────────────────

const PO_CREATE_MUTATION = `
  mutation purchase_order_create($data: CreatePurchaseOrderInput!) {
    purchase_order_create(data: $data) {
      request_id
      purchase_order {
        id
        po_number
        fulfillment_status
      }
    }
  }
`;

const PO_UPDATE_MUTATION = `
  mutation purchase_order_update($data: UpdatePurchaseOrderInput!) {
    purchase_order_update(data: $data) {
      request_id
      purchase_order {
        id
        po_number
        tracking_number
        shipping_carrier
        fulfillment_status
      }
    }
  }
`;

/**
 * Create a ShipHero PO from one of our productionStore POs. Returns
 * { shipheroPoId, shipheroPoNumber }.
 *
 * Caller is responsible for persisting the resulting IDs back onto the PO
 * (see productionStore.transitionPO auto-hook).
 */
export async function pushPOToShipHero(po) {
  if (!po) throw new Error('PO is required');
  const integration = await loadShipHeroIntegration();
  if (!integration) throw new Error('ShipHero is not connected for this org');
  if (!integration.defaultWarehouseId) {
    throw new Error('Set a default warehouse in Settings → Integrations → ShipHero before syncing POs.');
  }

  const mappings = await listMappings({}).catch(() => []);
  const lineItems = buildShipHeroLineItems(po, mappings);

  const data = {
    po_number:    po.code,
    warehouse_id: integration.defaultWarehouseId,
    account_id:   integration.accountId || undefined,
    po_date:      po.placed_at || new Date().toISOString().slice(0, 10),
    po_note:      po.notes || `Auto-synced from cashmodel · ${po.collection_name || ''}`.trim(),
    fulfillment_status: 'pending',
    line_items: lineItems,
  };

  const result = await callShipHeroProxy(PO_CREATE_MUTATION, { data });
  const created = result?.purchase_order_create?.purchase_order;
  if (!created?.id) throw new Error('ShipHero returned no purchase_order — check the proxy logs.');

  return { shipheroPoId: created.id, shipheroPoNumber: created.po_number };
}

/**
 * Push tracking number + carrier to an already-created ShipHero PO.
 */
export async function updateShipHeroTracking(po, { trackingNumber, carrier }) {
  if (!po?.shiphero_po_id) {
    throw new Error('This PO has not been pushed to ShipHero yet. Push it first, then add tracking.');
  }
  if (!trackingNumber) throw new Error('Tracking number is required');

  const data = {
    po_id:            po.shiphero_po_id,
    tracking_number:  trackingNumber,
    shipping_carrier: carrier || null,
  };
  const result = await callShipHeroProxy(PO_UPDATE_MUTATION, { data });
  return result?.purchase_order_update?.purchase_order || null;
}
