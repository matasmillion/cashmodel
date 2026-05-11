// Live data sync utilities — Shopify, Meta Ads, Mercury

import { supabase, IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentUserIdSync, getCurrentOrgIdSync, getClerkToken } from '../lib/auth';

// ─── Week helpers ─────────────────────────────────────────────────────────────

/** Returns array of 13 week objects, oldest first (week -12 through week 0 = current). */
export function getPast13Weeks() {
  const today = new Date();
  const day = today.getDay();
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  currentMonday.setHours(0, 0, 0, 0);

  const weeks = [];
  for (let i = 12; i >= 0; i--) {
    const start = new Date(currentMonday);
    start.setDate(currentMonday.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    weeks.push({
      index: 12 - i,
      weekOffset: -i,
      isCurrent: i === 0,
      startDate: toISO(start),
      endDate: toISO(end),
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    });
  }
  return weeks;
}

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Shopify (via Supabase Edge Function proxy) ──────────────────────────────

/**
 * Save the signed-in user's Shopify credentials to the user_integrations table.
 * RLS ensures the row is scoped to the caller; each user only ever writes their own.
 */
export async function saveShopifyCredentials({ domain, token }) {
  if (!IS_SUPABASE_ENABLED) throw new Error('Supabase not configured');
  const orgId = getCurrentOrgIdSync();
  if (!orgId) throw new Error('No active organization');

  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const db = await getAuthedSupabase();
  const { error } = await db
    .from('user_integrations')
    .upsert(
      {
        org_id: orgId,
        provider: 'shopify',
        token,
        metadata: { domain: cleanDomain },
      },
      { onConflict: 'org_id,provider' },
    );
  if (error) throw new Error(`Failed to save credentials: ${error.message}`);
}

/**
 * Returns the Shopify integration row for the signed-in user, or null.
 */
export async function loadShopifyIntegration() {
  if (!IS_SUPABASE_ENABLED) return null;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return null;
  const db = await getAuthedSupabase();
  const { data, error } = await db
    .from('user_integrations')
    .select('metadata, updated_at')
    .eq('org_id', orgId)
    .eq('provider', 'shopify')
    .maybeSingle();
  if (error || !data) return null;
  return { domain: data.metadata?.domain, updatedAt: data.updated_at };
}

/**
 * Remove the org's Shopify credentials.
 */
export async function deleteShopifyCredentials() {
  if (!IS_SUPABASE_ENABLED) return;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return;
  const db = await getAuthedSupabase();
  await db.from('user_integrations').delete().eq('org_id', orgId).eq('provider', 'shopify');
}

/**
 * Calls the Supabase `shopify-proxy` Edge Function. The function verifies the
 * caller's JWT, looks up their Shopify credentials from user_integrations,
 * and forwards the request to their store — avoiding browser CORS on the
 * Shopify Admin API.
 *
 * For REST: pass `path` and optional `query` (URL params).
 * For GraphQL: pass `path='graphql.json'` and `graphql={ query, variables? }`.
 */
export async function callShopifyProxy(path, query = null, graphql = null) {
  if (!IS_SUPABASE_ENABLED || !supabase) {
    throw new Error('Supabase not configured — cannot reach the Shopify proxy');
  }
  const token = await getClerkToken();
  if (!token) throw new Error('Sign in to use the Shopify proxy');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/shopify-proxy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path, query, graphql }),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    const msg = data?.error || data?.errors || `${res.status} ${res.statusText}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

/**
 * Tests the proxy by fetching shop.json. Returns shop metadata on success.
 */
export async function testShopifyProxy() {
  const data = await callShopifyProxy('shop.json');
  return {
    name: data.shop?.name,
    currency: data.shop?.currency,
    domain: data.shop?.myshopify_domain,
  };
}

/**
 * Pulls weekly Total sales + order count matching Shopify Analytics → Total sales.
 *
 * Methodology (mirrors Shopify's own report):
 *   revenue(week) = Σ order.totalPrice  (orders processed in this week)
 *                 − Σ refund.amount      (refunds created in this week, even if on older orders)
 *
 * Uses the Admin GraphQL orders endpoint. Query window is widened to 26 weeks
 * so refunds created in our 13-week window are captured even when the parent
 * order was placed earlier. `NOT status:cancelled NOT test:true` excludes the
 * same orders Shopify's report excludes. Paginates on 250-per-page.
 *
 * Requires `read_orders` scope.
 */
export async function syncShopifyActuals(/* creds unused — proxy holds creds */) {
  const weeks = getPast13Weeks();
  const windowStartISO = weeks[0].startISO;
  const windowEndISO = weeks[12].endISO;

  // Pull orders from 26 weeks ago so refunds created in our 13-week window
  // but attached to older orders are still included.
  const wideSince = new Date(weeks[0].startISO);
  wideSince.setDate(wideSince.getDate() - 13 * 7);
  const wideSinceStr = wideSince.toISOString().split('T')[0];

  const gqlQuery = `
    query FetchOrders($cursor: String, $q: String!) {
      orders(first: 250, after: $cursor, query: $q, sortKey: PROCESSED_AT) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            processedAt
            cancelledAt
            test
            totalPriceSet { shopMoney { amount } }
            refunds {
              createdAt
              totalRefundedSet { shopMoney { amount } }
            }
          }
        }
      }
    }
  `;
  // Stricter filter: exclude cancelled, exclude tests. Matches Shopify's Total sales filter.
  const queryFilter = `processed_at:>=${wideSinceStr} NOT status:cancelled NOT test:true`;

  const all = [];
  let cursor = null;
  for (let page = 0; page < 20; page++) {  // 20 * 250 = 5000 orders over 26 weeks
    const data = await callShopifyProxy('graphql.json', null, {
      query: gqlQuery,
      variables: { cursor, q: queryFilter },
    });

    if (data.errors?.length) {
      throw new Error(`Shopify: ${data.errors.map(e => e.message).join('; ')}`);
    }

    const orders = data.data?.orders;
    if (!orders) break;

    for (const edge of orders.edges) {
      all.push(edge.node);
    }
    if (!orders.pageInfo.hasNextPage) break;
    cursor = orders.pageInfo.endCursor;
  }

  // Defensive: also drop any test/cancelled that slipped through the query filter.
  const valid = all.filter(o => !o.cancelledAt && !o.test);

  // Bucket helper: given a Date, return the week index (0-12) it falls into, or -1.
  const weekIndexOf = (date) => {
    for (let i = 0; i < weeks.length; i++) {
      const start = new Date(weeks[i].startISO);
      const end = new Date(weeks[i].endISO);
      if (date >= start && date <= end) return i;
    }
    return -1;
  };

  const buckets = weeks.map(() => ({ gross: 0, refunds: 0, orderCount: 0 }));

  for (const o of valid) {
    const processed = new Date(o.processedAt);
    // Gross sales + order count: attributed to order's processedAt week (if inside 13w window).
    const idx = weekIndexOf(processed);
    if (idx >= 0) {
      const gross = parseFloat(o.totalPriceSet?.shopMoney?.amount || 0);
      if (Number.isFinite(gross)) {
        buckets[idx].gross += gross;
        buckets[idx].orderCount += 1;
      }
    }
    // Refunds: attributed to refund's createdAt week — independent of order date.
    for (const r of (o.refunds || [])) {
      const refundDate = new Date(r.createdAt);
      const rIdx = weekIndexOf(refundDate);
      if (rIdx >= 0) {
        const amt = parseFloat(r.totalRefundedSet?.shopMoney?.amount || 0);
        if (Number.isFinite(amt)) buckets[rIdx].refunds += amt;
      }
    }
  }

  return weeks.map((week, i) => {
    const net = buckets[i].gross - buckets[i].refunds;
    return {
      startDate: week.startDate,
      endDate: week.endDate,
      label: week.label,
      isCurrent: week.isCurrent,
      revenue: Math.round(net * 100) / 100,
      orders: buckets[i].orderCount,
      gross: Math.round(buckets[i].gross * 100) / 100,
      returns: Math.round(buckets[i].refunds * 100) / 100,
    };
  });
}

/**
 * Returns deposit transactions (money entering the account) for the
 * Mercury depository sub-account with the given mask, over the trailing
 * `days` window. Pulled via Plaid /transactions/get on every connected
 * Plaid item.
 *
 * Plaid amount sign convention: positive = money OUT of the account,
 * negative = money IN. So a deposit / credit has amount < 0.
 *
 * Returns null if the mask isn't visible in any connected Plaid item
 * (so callers can distinguish "no deposits" from "account not linked").
 *
 * @param {{ mask: string, days?: number }} opts
 * @returns {Promise<null | Array<{date: string, amount: number, name: string, pending: boolean}>>}
 */
export async function syncMercuryDeposits({ mask, days = 7 }) {
  const items = await listPlaidItems().catch(() => []);
  if (!items?.length) return null;

  const since = new Date();
  since.setDate(since.getDate() - days);
  const toISODate = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const sinceStr = toISODate(since);
  const todayStr = toISODate(new Date());

  let foundMask = false;
  const deposits = [];
  for (const item of items) {
    let txData;
    try {
      txData = await callPlaidProxy('transactions/get', {
        item_id: item.item_id,
        start_date: sinceStr,
        end_date: todayStr,
      });
    } catch (err) {
      console.warn('[mercury deposits] transactions/get failed:', err.message);
      continue;
    }
    const targetAccountId = (txData.accounts || []).find(a => a.mask === mask)?.account_id;
    if (!targetAccountId) continue;
    foundMask = true;
    for (const tx of (txData.transactions || [])) {
      if (tx.account_id !== targetAccountId) continue;
      // Plaid: positive amount = money out, negative = money in.
      if (tx.amount >= 0) continue;
      deposits.push({
        date: tx.date,
        amount: Math.round(Math.abs(tx.amount) * 100) / 100,
        name: tx.name || '',
        pending: !!tx.pending,
      });
    }
  }
  return foundMask ? deposits : null;
}

/**
 * Match Shopify-reported "paid" payouts against actual Mercury deposits.
 * Match rule: same amount (±$0.01) within ±3 days of the payout date.
 *
 * Returns the SUM (and detail) of Shopify payouts that ARE reported as
 * paid by Shopify but DON'T yet show up as a deposit in Mercury — money
 * the operator hasn't received yet, even though Shopify thinks it's
 * settled.
 *
 * @param {Array<{id, date, amount}>} paidPayouts — Shopify paid payouts in the window
 * @param {Array<{date, amount}>} deposits — Mercury credits in the window
 * @returns {{ unmatchedTotal: number, unmatched: Array<{id, date, amount}> }}
 */
function reconcileShopifyPaidWithMercury(paidPayouts, deposits) {
  const unmatched = [];
  const usedDeposits = new Set();
  for (const p of paidPayouts) {
    const pAmt = Math.abs(parseFloat(p.amount));
    if (!Number.isFinite(pAmt)) continue;
    const pDate = new Date(p.date);
    const matchIdx = deposits.findIndex((d, i) => {
      if (usedDeposits.has(i)) return false;
      if (Math.abs(d.amount - pAmt) > 0.01) return false;
      const dDate = new Date(d.date);
      const diffDays = Math.abs((dDate - pDate) / 86400000);
      return diffDays <= 3;
    });
    if (matchIdx === -1) {
      unmatched.push({ id: p.id, date: p.date, amount: pAmt });
    } else {
      usedDeposits.add(matchIdx);
    }
  }
  const unmatchedTotal = Math.round(unmatched.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  return { unmatchedTotal, unmatched };
}

/**
 * Pulls Shopify Payments payouts that haven't yet settled to Mercury
 * Operating Cash. Two components:
 *
 *   1. Shopify-reported pending: status in {scheduled, in_transit}.
 *   2. Shopify-reported paid in the last `days` window that haven't
 *      yet appeared as a deposit in the Mercury account with the
 *      `reconcileMercuryMask` mask (default '6848' = Operating Cash).
 *      This catches the gap where Shopify marks a payout as paid but
 *      the ACH hasn't actually landed in Mercury yet.
 *
 * Status meanings (per Shopify Admin API docs):
 *   `scheduled`   → settlement date set, not yet sent
 *   `in_transit`  → ACH sent, not yet credited at the bank
 *   `paid`        → Shopify says cleared (we still verify against Mercury)
 *   `failed` / `cancelled` → excluded
 *
 * If the Mercury mask isn't linked through Plaid yet, the reconciliation
 * step is skipped (we only return Shopify-reported pending) — we'd rather
 * under-count than mark every paid payout as missing.
 *
 * Requires `read_shopify_payments_payouts` Admin scope.
 *
 * @param {{ reconcileMercuryMask?: string, days?: number }} opts
 * @returns {Promise<{
 *   pendingTotal: number,
 *   payouts: Array<{date, amount, status, id}>,
 *   reportedPendingTotal: number,
 *   unmatchedPaidTotal: number,
 *   unmatchedPaidPayouts: Array<{id, date, amount}>,
 *   reconciliationSkipped: boolean,
 * }>}
 */
export async function syncShopifyPayoutsPending({
  reconcileMercuryMask = '6848',
  days = 7,
} = {}) {
  const reported = [];
  // 1. Shopify-reported pending (scheduled + in_transit).
  for (const status of ['scheduled', 'in_transit']) {
    let data;
    try {
      data = await callShopifyProxy('shopify_payments/payouts.json', { status, limit: 250 });
    } catch (err) {
      // 403 = scope missing, 404 = store doesn't have Shopify Payments enabled.
      console.warn(`[shopify payouts] ${status} fetch failed:`, err.message);
      continue;
    }
    for (const p of (data?.payouts || [])) {
      const amt = parseFloat(p.amount);
      if (!Number.isFinite(amt)) continue;
      reported.push({ id: p.id, date: p.date, amount: amt, status: p.status });
    }
  }
  const reportedPendingTotal = Math.round(reported.reduce((s, p) => s + p.amount, 0) * 100) / 100;

  // 2. Shopify-paid-but-not-in-Mercury reconciliation.
  let unmatchedPaidTotal = 0;
  let unmatchedPaidPayouts = [];
  let reconciliationSkipped = false;

  if (reconcileMercuryMask) {
    try {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days);
      const sinceStr =
        `${sinceDate.getFullYear()}-${String(sinceDate.getMonth() + 1).padStart(2, '0')}-${String(sinceDate.getDate()).padStart(2, '0')}`;

      const paidData = await callShopifyProxy('shopify_payments/payouts.json', {
        status: 'paid',
        date_min: sinceStr,
        limit: 250,
      });
      const paidPayouts = (paidData?.payouts || [])
        .map(p => ({ id: p.id, date: p.date, amount: parseFloat(p.amount) }))
        .filter(p => Number.isFinite(p.amount) && p.amount > 0);

      const deposits = await syncMercuryDeposits({ mask: reconcileMercuryMask, days });
      if (deposits == null) {
        // Mercury 6848 not visible through Plaid — skip reconciliation
        // so we don't falsely flag every paid payout as missing.
        reconciliationSkipped = true;
        console.warn(
          `[shopify payouts] Mercury mask ${reconcileMercuryMask} not found in any linked Plaid item — ` +
          `skipping paid-vs-Mercury reconciliation. Operating Cash row reflects Shopify-reported pending only.`,
        );
      } else {
        const recon = reconcileShopifyPaidWithMercury(paidPayouts, deposits);
        unmatchedPaidTotal = recon.unmatchedTotal;
        unmatchedPaidPayouts = recon.unmatched;
      }
    } catch (err) {
      console.warn('[shopify payouts] paid reconciliation failed:', err.message);
      reconciliationSkipped = true;
    }
  }

  const pendingTotal = Math.round((reportedPendingTotal + unmatchedPaidTotal) * 100) / 100;
  return {
    pendingTotal,
    payouts: reported,
    reportedPendingTotal,
    unmatchedPaidTotal,
    unmatchedPaidPayouts,
    reconciliationSkipped,
  };
}

/**
 * Pulls pending Shopify Capital repayments from the Shopify Payments
 * balance transactions endpoint. The operator described these as
 * transactions where:
 *   - status / state is pending (the deduction hasn't yet been applied
 *     to a paid payout)
 *   - source_type / type indicates a Capital repayment
 *   - description references "repayment" and the account is "Capital"
 *
 * Shopify's REST balance/transactions endpoint exposes these as
 * `source_type === 'shopify_capital_payment'` (or `type` on older API
 * versions). Pending status is inferred from `payout_status` not being
 * `paid` (i.e. null / pending / scheduled / in_transit).
 *
 * Returns: { pendingTotal: number, repayments: Array<{id, amount, date, status, source_type}> }
 *
 * Requires the `read_shopify_payments_payouts` scope (same as payouts).
 */
export async function syncShopifyCapitalRepayment() {
  let data;
  try {
    data = await callShopifyProxy('shopify_payments/balance/transactions.json', { limit: 250 });
  } catch (err) {
    console.warn('[shopify capital] balance/transactions fetch failed:', err.message);
    return { pendingTotal: 0, repayments: [] };
  }

  const txs = data?.transactions || [];
  const repayments = [];
  for (const t of txs) {
    const sourceType = (t.source_type || t.type || '').toLowerCase();
    const isCapital = sourceType.includes('capital');
    if (!isCapital) continue;

    // Pending = not yet associated with a paid payout. Shopify marks
    // settled deductions with payout_status === 'paid'.
    const payoutStatus = (t.payout_status || '').toLowerCase();
    const isPending = payoutStatus !== 'paid';
    if (!isPending) continue;

    // amount is a negative string for repayments (money leaving the
    // Shopify Balance). Use the absolute value for the "amount owed
    // this week" display.
    const amt = Math.abs(parseFloat(t.amount));
    if (!Number.isFinite(amt)) continue;

    repayments.push({
      id: t.id,
      amount: amt,
      date: t.processed_at || t.created_at,
      status: payoutStatus || 'pending',
      source_type: t.source_type || t.type,
    });
  }

  const pendingTotal = Math.round(repayments.reduce((s, r) => s + r.amount, 0) * 100) / 100;
  return { pendingTotal, repayments };
}

// ─── Shopify variants + per-day sales (Sell-Through page) ────────────────────

/**
 * High-level wrapper used by the inventory module's auto-sync. Pulls active
 * variants + their on-hand + last-90-day sales, joins them, and writes the
 * sell-through snapshot that inventoryStore reads from.
 *
 * Logs a parity report (variantCount, totalOnHand, soldL90) so the operator
 * can sanity-check against Shopify Admin → Products at the same time.
 *
 * @returns {Promise<{ variantCount, totalOnHand, soldL90, oversold, syncedAt }>}
 */
export async function syncShopifyInventory({ days = 90 } = {}) {
  const stStore = await import('./sellThroughStore');

  const [variants, salesByVariant] = await Promise.all([
    fetchShopifyVariantsWithInventory({ activeOnly: true }),
    fetchShopifyVariantSalesByDay({ days }),
  ]);

  const merged = variants.map(v => ({
    ...v,
    salesByDay: salesByVariant[v.variantId] || {},
  }));

  const syncedAt = new Date().toISOString();
  stStore.writeLocal({ syncedAt, variants: merged });

  // Parity report — compare against Shopify Admin counts.
  const totalOnHand = merged.reduce((s, v) => s + Math.max(0, v.inventoryQuantity || 0), 0);
  const oversold   = merged.filter(v => (v.inventoryQuantity || 0) < 0).length;
  const soldL90    = merged.reduce((s, v) => {
    let n = 0;
    for (const k in v.salesByDay) n += v.salesByDay[k];
    return s + n;
  }, 0);

  console.info(
    `[shopify-sync] ${merged.length} active variants · ` +
    `${totalOnHand.toLocaleString()} on-hand · ` +
    `${soldL90.toLocaleString()} units sold L${days}d · ` +
    `${oversold} oversold`,
  );

  return {
    variantCount: merged.length,
    totalOnHand,
    soldL90,
    oversold,
    syncedAt,
  };
}

/**
 * Pulls every product variant with its current on-hand inventory.
 * Paginates 250-per-page via cursor.
 *
 * Requires `read_products` (and `read_inventory` if you later want to split
 * by location — `inventoryQuantity` is already total on-hand across locations).
 *
 * @param {{ activeOnly?: boolean }} opts
 *   activeOnly (default true): filter to product_status:active so deprecated
 *   / archived products don't bloat the inventory model. Pass false to pull
 *   everything (used by the variant mapper backfill UI).
 *
 * Returns: [{ variantId, sku, productTitle, variantTitle, inventoryQuantity, productStatus }]
 */
export async function fetchShopifyVariantsWithInventory({ activeOnly = true } = {}) {
  const gqlQuery = `
    query FetchVariants($cursor: String, $q: String) {
      productVariants(first: 250, after: $cursor, query: $q) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            sku
            title
            price
            inventoryQuantity
            inventoryItem { id unitCost { amount } }
            product { id title vendor status productType }
          }
        }
      }
    }
  `;
  const queryFilter = activeOnly ? 'product_status:active' : null;

  const out = [];
  let cursor = null;
  for (let page = 0; page < 40; page++) {  // 40 * 250 = 10k variants
    const data = await callShopifyProxy('graphql.json', null, {
      query: gqlQuery,
      variables: { cursor, q: queryFilter },
    });

    if (data.errors?.length) {
      throw new Error(`Shopify: ${data.errors.map(e => e.message).join('; ')}`);
    }

    const conn = data.data?.productVariants;
    if (!conn) break;

    for (const edge of conn.edges) {
      const n = edge.node;
      const unitCostAmount = n.inventoryItem?.unitCost?.amount;
      out.push({
        variantId: n.id,
        inventoryItemId: n.inventoryItem?.id || '',
        sku: n.sku || '',
        productId: n.product?.id || '',
        productTitle: n.product?.title || '',
        productVendor: n.product?.vendor || '',
        productStatus: n.product?.status || '',
        productType: n.product?.productType || '',
        variantTitle: n.title || '',
        price: n.price != null ? Number(n.price) : null,
        inventoryQuantity: typeof n.inventoryQuantity === 'number' ? n.inventoryQuantity : 0,
        unitCost: unitCostAmount != null ? Number(unitCostAmount) : null,
      });
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return out;
}

/**
 * Pulls orders over the trailing `days` window (max 90) and aggregates
 * line-item quantities per variant per calendar day (UTC date of processedAt).
 *
 * Returns: { 'gid://shopify/ProductVariant/123': { 'YYYY-MM-DD': units } }
 *
 * Excludes cancelled / test orders, mirroring `syncShopifyActuals`.
 * Requires `read_orders`.
 */
export async function fetchShopifyVariantSalesByDay({ days = 90 } = {}) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  const gqlQuery = `
    query FetchSales($cursor: String, $q: String!) {
      orders(first: 250, after: $cursor, query: $q, sortKey: PROCESSED_AT) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            processedAt
            cancelledAt
            test
            lineItems(first: 100) {
              edges {
                node {
                  quantity
                  variant { id }
                }
              }
            }
          }
        }
      }
    }
  `;
  const queryFilter = `processed_at:>=${sinceStr} NOT status:cancelled NOT test:true`;

  const salesByVariant = {};
  let cursor = null;
  for (let page = 0; page < 40; page++) {
    const data = await callShopifyProxy('graphql.json', null, {
      query: gqlQuery,
      variables: { cursor, q: queryFilter },
    });

    if (data.errors?.length) {
      throw new Error(`Shopify: ${data.errors.map(e => e.message).join('; ')}`);
    }

    const orders = data.data?.orders;
    if (!orders) break;

    for (const edge of orders.edges) {
      const o = edge.node;
      if (o.cancelledAt || o.test) continue;
      const d = new Date(o.processedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      for (const liEdge of (o.lineItems?.edges || [])) {
        const li = liEdge.node;
        const vid = li.variant?.id;
        if (!vid) continue;
        const qty = typeof li.quantity === 'number' ? li.quantity : 0;
        if (qty <= 0) continue;
        if (!salesByVariant[vid]) salesByVariant[vid] = {};
        salesByVariant[vid][key] = (salesByVariant[vid][key] || 0) + qty;
      }
    }
    if (!orders.pageInfo.hasNextPage) break;
    cursor = orders.pageInfo.endCursor;
  }
  return salesByVariant;
}

// ─── Meta Ads ─────────────────────────────────────────────────────────────────
/**
 * Fetches weekly ad spend from the Meta Graph API for the past 13 weeks.
 * Returns an array of { startDate, endDate, label, adSpend, impressions, clicks }.
 */
export async function syncMetaActuals(creds) {
  if (!creds?.connected || !creds.accountId) {
    throw new Error('Meta Ads not connected');
  }

  const weeks = getPast13Weeks();
  const accountId = creds.accountId.startsWith('act_') ? creds.accountId : `act_${creds.accountId}`;

  const since = weeks[0].startDate;
  const until = weeks[12].endDate;

  // Route the call through the meta-proxy Edge Function so the access_token
  // stays server-side (in user_integrations.token, RLS-protected). The proxy
  // already supports arbitrary GET paths, so we just hand it the insights
  // endpoint + the same query params we used to inline in the URL.
  let response;
  try {
    response = await callMetaProxy({
      method: 'GET',
      path: `${accountId}/insights`,
      body: {
        fields: 'spend,impressions,clicks',
        time_increment: 7,
        time_range: JSON.stringify({ since, until }),
      },
    });
  } catch (err) {
    // Fall back to the legacy direct call only if the proxy isn't reachable
    // (sign-in not configured locally) AND the legacy token is still in
    // creds. Surfaces a console warning so this doesn't get missed in dev.
    if (creds.token) {
      console.warn('[meta] proxy unreachable, falling back to direct fetch (token exposed):', err.message);
      const url = `https://graph.facebook.com/v19.0/${accountId}/insights?fields=spend,impressions,clicks&time_increment=7&time_range[since]=${since}&time_range[until]=${until}&access_token=${creds.token}`;
      const res = await fetch(url);
      response = await res.json();
      if (response.error) throw new Error(response.error.message);
    } else {
      throw err;
    }
  }

  if (response?.error) throw new Error(response.error.message || 'Meta Insights API error');
  const data = response?.data || [];

  return weeks.map(week => {
    const match = data.find(d => d.date_start >= week.startDate && d.date_start <= week.endDate);
    return {
      startDate: week.startDate,
      endDate: week.endDate,
      label: week.label,
      isCurrent: week.isCurrent,
      adSpend: match ? Math.round(parseFloat(match.spend || 0) * 100) / 100 : 0,
      impressions: match ? parseInt(match.impressions || 0) : 0,
      clicks: match ? parseInt(match.clicks || 0) : 0,
    };
  });
}

/**
 * Pulls today's daily_budget from the Meta CBO campaign named "Acquisition"
 * (case-insensitive). This is the FORWARD-LOOKING daily ad spend the user
 * has set in Ads Manager — the cashflow projection uses it to anchor the
 * current and future weeks' ad spend, rather than backing into it from
 * historical insights (which lag behind plan changes).
 *
 * Meta returns daily_budget in the account's MINOR currency unit (cents
 * for USD), so we divide by 100. Returns null if no matching campaign is
 * found or the call fails — caller falls back to insights-based spend.
 */
export async function syncMetaDailyBudget(creds, campaignName = 'Acquisition') {
  if (!creds?.connected || !creds.accountId) return null;
  const accountId = creds.accountId.startsWith('act_') ? creds.accountId : `act_${creds.accountId}`;
  let response;
  try {
    response = await callMetaProxy({
      method: 'GET',
      path: `${accountId}/campaigns`,
      body: {
        fields: 'id,name,daily_budget,status,effective_status',
        limit: 200,
      },
    });
  } catch (err) {
    // Legacy fallback (token client-side) if proxy unavailable.
    if (creds.token) {
      const url = `https://graph.facebook.com/v19.0/${accountId}/campaigns?fields=id,name,daily_budget,status,effective_status&limit=200&access_token=${creds.token}`;
      const res = await fetch(url);
      response = await res.json();
    } else {
      throw err;
    }
  }
  if (response?.error) throw new Error(response.error.message || 'Meta campaigns API error');

  // Substring match (case-insensitive) — most operators name their CBOs
  // with date suffixes or brand prefixes ("Acquisition - May 2026",
  // "[FR] Acquisition"). Filter to active campaigns with a daily_budget;
  // if more than one matches, sum them — the operator may be running
  // multiple acquisition CBOs in parallel.
  const target = campaignName.toLowerCase();
  const all = response?.data || [];
  const matches = all.filter(c => {
    const nameOk = (c.name || '').toLowerCase().includes(target);
    const hasBudget = c.daily_budget != null && c.daily_budget !== '0';
    const isActive = !c.effective_status
      || c.effective_status === 'ACTIVE'
      || c.effective_status === 'IN_PROCESS'
      || c.effective_status === 'CAMPAIGN_PAUSED';   // include paused so user can plan ahead
    return nameOk && hasBudget && isActive;
  });

  if (!matches.length) {
    // Log every campaign name we did see, so the operator can fix
    // either the campaign name or the configured `campaignName` arg.
    const seen = all.map(c => `${c.name || '(unnamed)'} [${c.effective_status || c.status || '?'}, budget=${c.daily_budget ?? 'null'}]`);
    console.warn(
      `[meta CBO] No campaign matched "${campaignName}". Campaigns visible to this token (${seen.length}):`,
      seen,
    );
    return null;
  }

  // Meta returns budget as a string in minor units (cents).
  const totalCents = matches.reduce((sum, c) => {
    const cents = parseInt(c.daily_budget, 10);
    return Number.isFinite(cents) ? sum + cents : sum;
  }, 0);

  if (matches.length > 1) {
    console.info(
      `[meta CBO] Matched ${matches.length} campaigns containing "${campaignName}"; summing daily budgets:`,
      matches.map(c => `${c.name} = $${parseInt(c.daily_budget, 10) / 100}`),
    );
  }

  return {
    dailyBudget: totalCents / 100,
    campaignCount: matches.length,
    campaignId: matches[0].id,
    campaignName: matches.map(c => c.name).join(' + '),
    status: matches[0].effective_status || matches[0].status,
  };
}

// ─── Mercury (credentials in Supabase, calls via edge function proxy) ───────

/**
 * Save Mercury API key for the signed-in user to user_integrations (RLS-scoped).
 */
export async function saveMercuryCredentials({ token }) {
  if (!IS_SUPABASE_ENABLED) throw new Error('Supabase not configured');
  const orgId = getCurrentOrgIdSync();
  if (!orgId) throw new Error('No active organization');

  const db = await getAuthedSupabase();
  const { error } = await db
    .from('user_integrations')
    .upsert(
      { org_id: orgId, provider: 'mercury', token, metadata: {} },
      { onConflict: 'org_id,provider' },
    );
  if (error) throw new Error(`Failed to save credentials: ${error.message}`);
}

export async function loadMercuryIntegration() {
  if (!IS_SUPABASE_ENABLED) return null;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return null;
  const db = await getAuthedSupabase();
  const { data, error } = await db
    .from('user_integrations')
    .select('metadata, updated_at')
    .eq('org_id', orgId)
    .eq('provider', 'mercury')
    .maybeSingle();
  if (error || !data) return null;
  return { updatedAt: data.updated_at };
}

export async function deleteMercuryCredentials() {
  if (!IS_SUPABASE_ENABLED) return;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return;
  const db = await getAuthedSupabase();
  await db.from('user_integrations').delete().eq('org_id', orgId).eq('provider', 'mercury');
}

/**
 * Calls the Supabase `mercury-proxy` Edge Function. The function verifies the
 * caller's JWT, looks up their Mercury API key from user_integrations, and
 * forwards the request to Mercury. CORS is handled in the function.
 */
export async function callMercuryProxy(path, query = null) {
  if (!IS_SUPABASE_ENABLED || !supabase) {
    throw new Error('Supabase not configured — cannot reach the Mercury proxy');
  }
  const token = await getClerkToken();
  if (!token) throw new Error('Sign in to use the Mercury proxy');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/mercury-proxy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path, query }),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error || data?.errors || `${res.status} ${res.statusText}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

/**
 * Test the proxy + credentials by listing accounts. Returns a summary.
 *
 * We use `availableBalance` (what you can actually spend right now) rather
 * than `currentBalance` (ledger balance including pending deposits).
 * Pending items shouldn't count as cash on hand for the cash model — they
 * haven't cleared yet.
 */
export async function testMercuryProxy() {
  const data = await callMercuryProxy('accounts');
  const accounts = data.accounts || [];
  const active = accounts.filter(a => a.status === 'active');
  const totalBalance = active
    .filter(a => ['checking', 'savings'].includes(a.kind))
    .reduce((s, a) => s + (a.availableBalance ?? a.currentBalance ?? 0), 0);
  return {
    accountCount: active.length,
    totalBalance: Math.round(totalBalance * 100) / 100,
    accountNames: active.map(a => a.name).filter(Boolean),
  };
}

/**
 * Pulls account balances from Mercury via the proxy.
 * Returns { accounts, primaryBalance } — primaryBalance is the sum of active
 * checking + savings *available* balances. Uses availableBalance (spendable)
 * not currentBalance (ledger) so pending deposits don't inflate cash-on-hand.
 */
export async function syncMercuryActuals(/* creds unused — proxy holds creds */) {
  const data = await callMercuryProxy('accounts');
  const accounts = data.accounts || [];
  const primaryBalance = accounts
    .filter(a => a.status === 'active' && ['checking', 'savings'].includes(a.kind))
    .reduce((sum, a) => sum + (a.availableBalance ?? a.currentBalance ?? 0), 0);
  return { accounts, primaryBalance };
}

// ─── Plaid (multi-institution, via Supabase Edge Function proxy) ────────────

/**
 * Shared helper for every Plaid proxy action.
 */
export async function callPlaidProxy(action, payload = {}) {
  if (!IS_SUPABASE_ENABLED || !supabase) {
    const err = new Error('Supabase not configured — cannot reach the Plaid proxy');
    err.diagnostic = { stage: 'config', action };
    throw err;
  }
  const token = await getClerkToken();
  if (!token) {
    const err = new Error('Sign in to use the Plaid proxy');
    err.diagnostic = { stage: 'auth', action };
    throw err;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const url = `${supabaseUrl}/functions/v1/plaid-proxy`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch (netErr) {
    // fetch() itself failed — network, CORS, DNS, or the edge function
    // didn't return (e.g. timeout). The browser shows this as "Failed to
    // fetch" with no further detail. Attach what we know so the UI can
    // render something useful.
    const err = new Error(`Network error reaching plaid-proxy: ${netErr.message}`);
    err.diagnostic = {
      stage: 'network',
      action,
      url,
      cause: netErr.message,
      hint: 'Edge function unreachable. Likely causes: supabase function not deployed, CORS preflight failure, function timeout (60s), or local network block.',
    };
    throw err;
  }

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error || data?.errors || `${res.status} ${res.statusText}`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.diagnostic = {
      stage: 'http',
      action,
      url,
      status: res.status,
      statusText: res.statusText,
      body: data,
    };
    throw err;
  }
  return data;
}

/**
 * End-to-end probe of the plaid-proxy edge function so the operator
 * can see WHICH layer is failing without DevTools. Tests:
 *
 *   1. Project root      — does the Supabase project URL respond at
 *                          all? If 404/000 here, the project is paused
 *                          (free tier auto-pauses after 7d idle) or
 *                          the project URL is wrong.
 *   2. CORS preflight    — OPTIONS to plaid-proxy. Should return 204
 *                          + Access-Control-Allow-Origin. If "Failed
 *                          to fetch" here, the function isn't deployed
 *                          or CORS is misconfigured.
 *   3. Unauth POST       — POST with no body. Function should respond
 *                          with 400/401/JSON-with-error and CORS
 *                          headers. Proves the function is alive.
 *   4. Authed POST       — POST with action='link-token/create'.
 *                          Full round-trip including Clerk JWT auth +
 *                          credential lookup + Plaid call.
 *
 * Each step captures status, response body, and any thrown error.
 * Returns the full result for verbatim rendering.
 */
export async function probePlaidEdgeFunction() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const results = {
    supabaseUrl,
    steps: [],
  };

  async function step(name, hint, fn) {
    const started = Date.now();
    try {
      const out = await fn();
      results.steps.push({
        name,
        hint,
        ok: out.ok !== false,
        ...out,
        elapsedMs: Date.now() - started,
      });
    } catch (err) {
      results.steps.push({
        name,
        hint,
        ok: false,
        error: err.message,
        elapsedMs: Date.now() - started,
      });
    }
  }

  await step(
    '1. Project root reachable',
    'Confirms the Supabase project is alive. If this fails, the project is most likely paused — free-tier Supabase projects auto-pause after 7 days of inactivity. Restore it in the Supabase dashboard.',
    async () => {
      const res = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'GET',
        headers: { apikey: anonKey },
      });
      return { status: res.status, statusText: res.statusText };
    },
  );

  await step(
    '2. plaid-proxy CORS preflight',
    'OPTIONS request to the function. Should return 200/204 with Access-Control-Allow-Origin. If this fails or the header is missing, the function is not deployed or its CORS handling is broken.',
    async () => {
      const res = await fetch(`${supabaseUrl}/functions/v1/plaid-proxy`, {
        method: 'OPTIONS',
        headers: {
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,apikey,content-type',
        },
      });
      return {
        status: res.status,
        statusText: res.statusText,
        accessControlAllowOrigin: res.headers.get('access-control-allow-origin'),
        accessControlAllowMethods: res.headers.get('access-control-allow-methods'),
      };
    },
  );

  await step(
    '3. plaid-proxy unauth POST',
    'POST with the anon key but no Clerk JWT — the function should respond 401 with a JSON body. If "Failed to fetch", the function is crashing on startup or not deployed. If 401 JSON, the function is alive.',
    async () => {
      const res = await fetch(`${supabaseUrl}/functions/v1/plaid-proxy`, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'link-token/create' }),
      });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
      return { status: res.status, statusText: res.statusText, body };
    },
  );

  await step(
    '4. plaid-proxy authed POST (link-token/create)',
    'Full round-trip with the user\'s Clerk JWT. If this succeeds, sync should work too. If it errors with a Plaid error code, that error is on the Plaid item itself (e.g. ITEM_LOGIN_REQUIRED).',
    async () => {
      const token = await getClerkToken();
      if (!token) return { ok: false, status: null, error: 'No Clerk JWT — not signed in' };
      const res = await fetch(`${supabaseUrl}/functions/v1/plaid-proxy`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'link-token/create' }),
      });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
      return { status: res.status, statusText: res.statusText, body };
    },
  );

  return results;
}

/** Returns a short-lived link_token that Plaid Link needs to open. */
export async function createPlaidLinkToken() {
  const data = await callPlaidProxy('link-token/create');
  return data.link_token;
}

/**
 * After the user finishes Plaid Link, swap the public_token for a long-lived
 * access_token (stored server-side) and persist the item.
 */
export async function exchangePlaidPublicToken(publicToken) {
  return callPlaidProxy('public-token/exchange', { public_token: publicToken });
}

/** List every Plaid item the signed-in user has connected. */
export async function listPlaidItems() {
  if (!IS_SUPABASE_ENABLED) return [];
  const db = await getAuthedSupabase();
  if (!db) return [];
  const { data, error } = await db
    .from('user_plaid_items')
    .select('item_id, institution_id, institution_name, accounts, updated_at')
    .order('created_at', { ascending: true });
  if (error) return [];
  return data || [];
}

/** Remove a connected item (revokes the access_token at Plaid and deletes the row). */
export async function removePlaidItem(itemId) {
  return callPlaidProxy('item/remove', { item_id: itemId });
}

/**
 * Refreshes balances across all of this user's Plaid items.
 *
 * Default mode (`realTime = false`) hits Plaid's /accounts/get which returns
 * cached balances — free when you have the Transactions product. Use this for
 * auto-sync on page load so we don't rack up $0.10/call fees.
 *
 * Force a live pull (`realTime = true`) only on explicit user action; that
 * hits /accounts/balance/get which is $0.10/call per account.
 *
 * Returns { items: [{ institution_name, accounts: [...] }], totals }
 * totals = { depository: sum of checking+savings, credit: sum of credit card balances }
 */
export async function syncPlaidActuals({ realTime = false } = {}) {
  const data = await callPlaidProxy('accounts/all', { real_time: realTime });
  const items = data.items || [];

  let depositoryTotal = 0;
  let creditTotal = 0;
  const creditAccounts = [];
  const depositoryAccounts = [];
  // Per-item errors from Plaid (e.g. ITEM_LOGIN_REQUIRED, INVALID_ACCESS_TOKEN).
  // Plaid-proxy returns 200 with each item's accounts OR error inline so one
  // bad item doesn't take down the whole sync. Surfacing them here so the UI
  // can display "Mercury needs to be re-linked" rather than silently dropping
  // every Mercury account.
  const itemErrors = [];

  for (const item of items) {
    if (item.error) {
      itemErrors.push({
        institution: item.institution_name || item.institution_id || item.item_id,
        item_id: item.item_id,
        error: item.error,
      });
      continue;
    }
    for (const a of (item.accounts || [])) {
      const current = a.balances?.current ?? 0;
      const available = a.balances?.available ?? null;
      const limit = a.balances?.limit ?? null;

      if (a.type === 'depository') {
        // Depository accounts use AVAILABLE balance, not current. Plaid's
        // `available` is current minus pending outflows + pending inflows
        // — i.e. the actual spendable cash. The Mercury "Available" field
        // in the dashboard matches this. Using `current` over-counts by
        // including money already on its way out (e.g. the $1,283 wire
        // that's pending on the 7301 fulfillment account).
        const balance = available ?? current;
        depositoryTotal += balance;
        depositoryAccounts.push({
          institution: item.institution_name,
          name: a.name,
          mask: a.mask,
          subtype: a.subtype,
          balance,
          // Raw values still surfaced for diagnostics — the cashflow
          // engine uses `balance` (= available), but the integrations
          // panel can show both if needed.
          current,
          available,
        });
      } else if (a.type === 'credit') {
        // Credit cards use `current` — the amount currently owed. We
        // DO NOT use `available` here (available = limit - current,
        // confusingly different semantic). Pending CHARGES (purchases
        // not yet posted) are added separately via syncPlaidPendingCharges
        // and summed into the cashflow's Ads Payable row, since `current`
        // typically EXCLUDES pending purchases. Pending PAYMENTS (money
        // moving from a depository account to the card) are ignored —
        // the payment hasn't actually left yet, so we still owe the
        // full balance.
        creditTotal += current;
        creditAccounts.push({
          institution: item.institution_name,
          name: a.name,
          mask: a.mask,
          subtype: a.subtype,
          balance: current,  // amount currently owed
          available,
          limit,
        });
      }
    }
  }

  return {
    items,
    itemErrors,
    totals: {
      depository: Math.round(depositoryTotal * 100) / 100,
      credit: Math.round(creditTotal * 100) / 100,
    },
    depositoryAccounts,
    creditAccounts,
  };
}

/**
 * Pulls the past 90 days of credit-card transactions for every connected
 * Plaid item, filters to payments (transactions that REDUCE the card
 * balance), and groups them by Monday-of-week per card.
 *
 * Returns: { 'YYYY-MM-DD': { chase5718?: number, amexBlue?: number, ... } }
 *
 * Used by the cashflow engine as the highest-precedence source for the
 * card-payment outflow rows. Anything not covered by a real transaction
 * falls through to the static schedule, then the rule-based generator.
 */
export async function syncPlaidCardPayments() {
  const items = await listPlaidItems().catch(() => []);
  if (!items?.length) return {};

  // Map a Plaid credit account → cashflow card key by mask first, then by
  // name pattern (catches AMEX Plum which Plaid surfaces without a mask).
  // Inlined to avoid a dependency on bankAccountMap from this file.
  const MASKS = { '5718': 'chase5718', '1005': 'amexBlue' };
  const classify = (acc) => {
    if (acc.mask && MASKS[acc.mask]) return MASKS[acc.mask];
    const lc = (acc.name || '').toLowerCase();
    if (lc.includes('plum')) return 'amexPlum';
    if (lc.includes('blue')) return 'amexBlue';
    if (lc.includes('chase')) return 'chase5718';
    return null;
  };

  const mondayOf = (iso) => {
    // Local-midnight parse — `new Date('YYYY-MM-DDT00:00:00')` is UTC in
    // some browsers, which shifts the date by 1 day in negative timezones.
    const [yy, mm, dd0] = iso.split('-').map(Number);
    const d = new Date(yy, mm - 1, dd0);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    // LOCAL ISO so the date matches getPast13Weeks / cashflow engine keys.
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  const out = {};
  for (const item of items) {
    let txData;
    try {
      txData = await callPlaidProxy('transactions/get', { item_id: item.item_id });
    } catch (err) {
      console.warn('[plaid] transactions/get failed for item', item.item_id, err.message);
      continue;
    }

    // account_id → card key
    const cardByAccountId = {};
    for (const acc of (txData.accounts || [])) {
      if (acc.type !== 'credit') continue;
      const key = classify(acc);
      if (key) cardByAccountId[acc.account_id] = key;
    }
    if (!Object.keys(cardByAccountId).length) continue;

    for (const tx of (txData.transactions || [])) {
      const cardKey = cardByAccountId[tx.account_id];
      if (!cardKey) continue;
      // A payment to a credit card lands on the card account as a NEGATIVE
      // amount (credit reduces balance). Filter on amount sign + payment
      // category / name pattern so we don't pick up refunds or chargebacks.
      const isPayment = tx.amount < 0 && (
        tx.category?.includes('Payment') ||
        tx.payment_meta?.payee != null ||
        /payment\s*(received|thank\s*you)/i.test(tx.name || '') ||
        /autopay/i.test(tx.name || '')
      );
      if (!isPayment) continue;

      const monday = mondayOf(tx.date);
      if (!out[monday]) out[monday] = {};
      out[monday][cardKey] = Math.round(((out[monday][cardKey] || 0) + Math.abs(tx.amount)) * 100) / 100;
    }
  }
  return out;
}

/**
 * Aggregates UNPOSTED (pending=true) transactions per credit-card account
 * via Plaid's /transactions/get. Used by the Ads Payable row: today's row
 * = chase7248 statement balance + chase7248 pending charges + Meta owed.
 *
 * Returns: { chase7248?: number, chase5718?: number, amexBlue?: number, amexPlum?: number }
 *
 * `tx.amount` for credit cards is POSITIVE for purchases (charges that
 * increase the balance) and NEGATIVE for payments. We only sum positives
 * here — pending refunds are intentionally excluded so the operator never
 * underestimates what they owe.
 */
export async function syncPlaidPendingCharges() {
  const { classifyCreditAccount } = await import('./bankAccountMap');
  const items = await listPlaidItems().catch(() => []);
  if (!items?.length) return {};

  const out = {};
  for (const item of items) {
    let txData;
    try {
      txData = await callPlaidProxy('transactions/get', { item_id: item.item_id });
    } catch (err) {
      console.warn('[plaid pending] transactions/get failed for item', item.item_id, err.message);
      continue;
    }

    const cardByAccountId = {};
    for (const acc of (txData.accounts || [])) {
      if (acc.type !== 'credit') continue;
      const key = classifyCreditAccount(acc);
      if (key) cardByAccountId[acc.account_id] = key;
    }
    if (!Object.keys(cardByAccountId).length) continue;

    for (const tx of (txData.transactions || [])) {
      if (!tx.pending) continue;
      const cardKey = cardByAccountId[tx.account_id];
      if (!cardKey) continue;
      // Positive amount = purchase / charge on a credit card.
      if (tx.amount > 0) {
        out[cardKey] = Math.round(((out[cardKey] || 0) + tx.amount) * 100) / 100;
      }
    }
  }
  return out;
}

/**
 * Pulls the current outstanding amount owed to Meta from the ad account
 * details endpoint. `balance` is the unpaid balance in MINOR currency units
 * (cents for USD). `amount_spent` is cumulative lifetime spend — we don't
 * use it directly here, but it's returned for visibility.
 *
 * Returns null if the account doesn't expose `balance` (some accounts
 * don't surface it via the v19 Graph API) or if the call fails — caller
 * defaults to 0 in that case.
 */
export async function syncMetaBalanceOwed(creds) {
  if (!creds?.connected || !creds.accountId) return null;
  const accountId = creds.accountId.startsWith('act_') ? creds.accountId : `act_${creds.accountId}`;
  let response;
  try {
    response = await callMetaProxy({
      method: 'GET',
      path: accountId,
      body: { fields: 'balance,amount_spent,currency' },
    });
  } catch (err) {
    if (creds.token) {
      const url = `https://graph.facebook.com/v19.0/${accountId}?fields=balance,amount_spent,currency&access_token=${creds.token}`;
      const res = await fetch(url);
      response = await res.json();
    } else {
      throw err;
    }
  }
  if (response?.error) throw new Error(response.error.message || 'Meta ad account API error');

  const balanceMinor = response?.balance;
  if (balanceMinor == null) return null;

  const cents = typeof balanceMinor === 'string' ? parseInt(balanceMinor, 10) : balanceMinor;
  if (!Number.isFinite(cents)) return null;

  return {
    balanceOwed: Math.round((cents / 100) * 100) / 100,
    currency: response.currency || 'USD',
    amountSpentLifetime: response.amount_spent != null ? parseFloat(response.amount_spent) / 100 : null,
  };
}

// ─── Merge into seed update ───────────────────────────────────────────────────
/**
 * Builds a seed data update object from synced API data.
 * Pass null for any source that wasn't synced.
 */
export function buildSeedUpdate(shopifyWeeks, metaWeeks, mercuryData) {
  const update = {};

  // Mercury → current cash
  if (mercuryData?.primaryBalance != null) {
    update.totalCash = Math.round(mercuryData.primaryBalance * 100) / 100;
    update.sbMain = Math.round(mercuryData.primaryBalance * 100) / 100;
  }

  // Shopify current week → revenue + orders
  if (shopifyWeeks) {
    const currentWeek = shopifyWeeks.find(w => w.isCurrent);
    if (currentWeek) {
      update.revenue = currentWeek.revenue;
    }
  }

  // Meta current week → ad spend
  if (metaWeeks) {
    const currentWeek = metaWeeks.find(w => w.isCurrent);
    if (currentWeek) {
      update.adSpend = currentWeek.adSpend;
    }
  }

  return update;
}

// ─── Merge historical actuals ─────────────────────────────────────────────────
/**
 * Merges Shopify + Meta weekly arrays into a unified actualWeeks array.
 * Each entry: { startDate, endDate, label, isCurrent, revenue, adSpend, orders }
 */
export function mergeActualWeeks(shopifyWeeks, metaWeeks) {
  const weeks = getPast13Weeks();

  return weeks.map(week => {
    const sh = shopifyWeeks?.find(w => w.startDate === week.startDate);
    const me = metaWeeks?.find(w => w.startDate === week.startDate);

    return {
      startDate: week.startDate,
      endDate: week.endDate,
      label: week.label,
      isCurrent: week.isCurrent,
      revenue: sh?.revenue ?? null,
      orders: sh?.orders ?? null,
      adSpend: me?.adSpend ?? null,
      impressions: me?.impressions ?? null,
      clicks: me?.clicks ?? null,
    };
  });
}

// ─── Anthropic (API key stored in Supabase, calls via edge function proxy) ───

export async function saveAnthropicCredentials({ token }) {
  if (!IS_SUPABASE_ENABLED) throw new Error('Supabase not configured');
  const orgId = getCurrentOrgIdSync();
  if (!orgId) throw new Error('No active organization');
  const db = await getAuthedSupabase();
  const { error } = await db
    .from('user_integrations')
    .upsert(
      { org_id: orgId, provider: 'anthropic', token, metadata: {} },
      { onConflict: 'org_id,provider' },
    );
  if (error) throw new Error(`Failed to save credentials: ${error.message}`);
}

export async function loadAnthropicIntegration() {
  if (!IS_SUPABASE_ENABLED) return null;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return null;
  const db = await getAuthedSupabase();
  const { data, error } = await db
    .from('user_integrations')
    .select('metadata, updated_at')
    .eq('org_id', orgId)
    .eq('provider', 'anthropic')
    .maybeSingle();
  if (error || !data) return null;
  return { updatedAt: data.updated_at };
}

export async function deleteAnthropicCredentials() {
  if (!IS_SUPABASE_ENABLED) return;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return;
  const db = await getAuthedSupabase();
  await db.from('user_integrations').delete().eq('org_id', orgId).eq('provider', 'anthropic');
}

/**
 * Calls the `generate-brief` edge function to generate a brief for a sprint.
 * Knowledge is read from the creative_knowledge DB table by the function
 * itself — no client-side payload needed.
 *
 * @param {{ sprint_id: string }} params
 * @returns {Promise<import('../types/creative').Brief>}
 */
export async function callGenerateBrief({ sprint_id }) {
  if (!IS_SUPABASE_ENABLED || !supabase) {
    throw new Error('Supabase not configured — cannot reach generate-brief');
  }
  const token = await getClerkToken();
  if (!token) throw new Error('Sign in to generate a brief');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/generate-brief`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sprint_id }),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error || `${res.status} ${res.statusText}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data.brief;
}

/**
 * Ask Claude to read uploaded files and suggest values for a knowledge
 * kind. Used by the Knowledge editor's "Analyze with AI" buttons.
 *
 * @param {{
 *   kind: string,                       // 'avatar' | 'brand' | 'product' | 'models'
 *   scope?: 'kind' | 'sku_item',        // defaults to 'kind'
 *   attachment_paths: string[],         // Storage paths inside plm-assets
 *   existing_fields?: object,           // current form state, optional
 * }} params
 * @returns {Promise<object>}            // suggestions object matching the schema
 */
export async function callAnalyzeKnowledgeUpload({ kind, scope = 'kind', attachment_paths, existing_fields }) {
  if (!IS_SUPABASE_ENABLED || !supabase) {
    throw new Error('Supabase not configured — cannot reach analyze-knowledge-upload');
  }
  const token = await getClerkToken();
  if (!token) throw new Error('Sign in to analyze files');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/analyze-knowledge-upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ kind, scope, attachment_paths, existing_fields }),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error || `${res.status} ${res.statusText}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data.suggestions;
}

/**
 * Test the anthropic-proxy by sending a minimal ping message.
 * Returns { model, usage } on success.
 */
export async function testAnthropicProxy() {
  if (!IS_SUPABASE_ENABLED || !supabase) {
    throw new Error('Supabase not configured');
  }
  const token = await getClerkToken();
  if (!token) throw new Error('Sign in first');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/anthropic-proxy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with just the word "ok".' }],
    }),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error || `${res.status} ${res.statusText}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return { model: data.model, usage: data.usage };
}

// ─── fal.ai (image / video generation) ───────────────────────────────

export async function saveFalCredentials({ token }) {
  if (!IS_SUPABASE_ENABLED) throw new Error('Supabase not configured');
  const orgId = getCurrentOrgIdSync();
  if (!orgId) throw new Error('No active organization');
  const db = await getAuthedSupabase();
  const { error } = await db
    .from('user_integrations')
    .upsert(
      { org_id: orgId, provider: 'fal', token, metadata: {} },
      { onConflict: 'org_id,provider' },
    );
  if (error) throw new Error(`Failed to save credentials: ${error.message}`);
}

export async function loadFalIntegration() {
  if (!IS_SUPABASE_ENABLED) return null;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return null;
  const db = await getAuthedSupabase();
  const { data, error } = await db
    .from('user_integrations')
    .select('updated_at')
    .eq('org_id', orgId)
    .eq('provider', 'fal')
    .maybeSingle();
  if (error || !data) return null;
  return { updatedAt: data.updated_at };
}

export async function deleteFalCredentials() {
  if (!IS_SUPABASE_ENABLED) return;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return;
  const db = await getAuthedSupabase();
  await db.from('user_integrations').delete().eq('org_id', orgId).eq('provider', 'fal');
}

/** Ping fal-proxy with a no-op endpoint to verify the saved key. */
export async function testFalProxy() {
  return await callProxyEndpoint('fal-proxy', {
    endpoint: 'health',
    method: 'GET',
  }, { allowAnyStatus: true });
}

// ─── Higgsfield (Marketing Studio + Soul) ────────────────────────────

export async function saveHiggsfieldCredentials({ token }) {
  if (!IS_SUPABASE_ENABLED) throw new Error('Supabase not configured');
  const orgId = getCurrentOrgIdSync();
  if (!orgId) throw new Error('No active organization');
  const db = await getAuthedSupabase();
  const { error } = await db
    .from('user_integrations')
    .upsert(
      { org_id: orgId, provider: 'higgsfield', token, metadata: {} },
      { onConflict: 'org_id,provider' },
    );
  if (error) throw new Error(`Failed to save credentials: ${error.message}`);
}

export async function loadHiggsfieldIntegration() {
  if (!IS_SUPABASE_ENABLED) return null;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return null;
  const db = await getAuthedSupabase();
  const { data, error } = await db
    .from('user_integrations')
    .select('updated_at')
    .eq('org_id', orgId)
    .eq('provider', 'higgsfield')
    .maybeSingle();
  if (error || !data) return null;
  return { updatedAt: data.updated_at };
}

export async function deleteHiggsfieldCredentials() {
  if (!IS_SUPABASE_ENABLED) return;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return;
  const db = await getAuthedSupabase();
  await db.from('user_integrations').delete().eq('org_id', orgId).eq('provider', 'higgsfield');
}

export async function testHiggsfieldProxy() {
  return await callProxyEndpoint('higgsfield-proxy', {
    endpoint: 'health',
    method: 'GET',
  }, { allowAnyStatus: true });
}

// ─── Apify (competitor ad scraping) ─────────────────────────────────

export async function saveApifyCredentials({ token }) {
  if (!IS_SUPABASE_ENABLED) throw new Error('Supabase not configured');
  const orgId = getCurrentOrgIdSync();
  if (!orgId) throw new Error('No active organization');
  const db = await getAuthedSupabase();
  const { error } = await db
    .from('user_integrations')
    .upsert(
      { org_id: orgId, provider: 'apify', token, metadata: {} },
      { onConflict: 'org_id,provider' },
    );
  if (error) throw new Error(`Failed to save credentials: ${error.message}`);
}

export async function deleteApifyCredentials() {
  if (!IS_SUPABASE_ENABLED) return;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return;
  const db = await getAuthedSupabase();
  await db.from('user_integrations').delete().eq('org_id', orgId).eq('provider', 'apify');
}

/**
 * Fire the Meta Ad Library scraper and return the dataset items.
 *
 * @param {{ search_terms: string[], country?: string, ad_active_status?: string }} input
 * @returns {Promise<any[]>} array of ads as returned by the actor
 */
export async function callApifyMetaAdsScrape(input) {
  const result = await callEdgeFunction('apify-proxy', {
    method: 'POST',
    path: 'v2/acts/apify~meta-ads-library-scraper/run-sync-get-dataset-items',
    body: { search_terms: input.search_terms || [], country: input.country || 'US', ad_active_status: input.ad_active_status || 'active' },
  });
  return Array.isArray(result) ? result : (result?.items || []);
}

// ─── Slack (notifications + interactivity) ──────────────────────────

export async function saveSlackCredentials({ token }) {
  if (!IS_SUPABASE_ENABLED) throw new Error('Supabase not configured');
  const orgId = getCurrentOrgIdSync();
  if (!orgId) throw new Error('No active organization');
  const db = await getAuthedSupabase();
  const { error } = await db
    .from('user_integrations')
    .upsert(
      { org_id: orgId, provider: 'slack', token, metadata: {} },
      { onConflict: 'org_id,provider' },
    );
  if (error) throw new Error(`Failed to save credentials: ${error.message}`);
}

export async function deleteSlackCredentials() {
  if (!IS_SUPABASE_ENABLED) return;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return;
  const db = await getAuthedSupabase();
  await db.from('user_integrations').delete().eq('org_id', orgId).eq('provider', 'slack');
}

export async function callSlackProxy({ method = 'POST', path, body, query, provider }) {
  return await callEdgeFunction('slack-proxy', { method, path, body, query, provider });
}

// ─── Slack inventory bot (separate app for sell-through alerts) ───────────────

export async function saveSlackInventoryCredentials({ token, channelId }) {
  if (!IS_SUPABASE_ENABLED) throw new Error('Supabase not configured');
  const orgId = getCurrentOrgIdSync();
  if (!orgId) throw new Error('No active organization');
  const db = await getAuthedSupabase();
  const { error } = await db
    .from('user_integrations')
    .upsert(
      {
        org_id: orgId,
        provider: 'slack_inventory',
        token,
        metadata: { channel_id: channelId },
      },
      { onConflict: 'org_id,provider' },
    );
  if (error) throw new Error(`Failed to save credentials: ${error.message}`);
}

export async function deleteSlackInventoryCredentials() {
  if (!IS_SUPABASE_ENABLED) return;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return;
  const db = await getAuthedSupabase();
  await db.from('user_integrations').delete().eq('org_id', orgId).eq('provider', 'slack_inventory');
}

/** Manually trigger sell-through-alert for the current org. */
export async function callSellThroughAlert() {
  return await callEdgeFunction('sell-through-alert', {});
}

/** Manually trigger evaluate-daily for the current org (cron also runs nightly). */
export async function callEvaluateDaily() {
  return await callEdgeFunction('evaluate-daily', {});
}

/** Manually trigger synthesize-weekly for the current org. */
export async function callSynthesizeWeekly() {
  return await callEdgeFunction('synthesize-weekly', {});
}

// ─── Transloadit (video encoder pass) ────────────────────────────────

export async function saveTransloaditCredentials({ authKey, authSecret }) {
  if (!IS_SUPABASE_ENABLED) throw new Error('Supabase not configured');
  const orgId = getCurrentOrgIdSync();
  if (!orgId) throw new Error('No active organization');
  const db = await getAuthedSupabase();
  const { error } = await db
    .from('user_integrations')
    .upsert(
      { org_id: orgId, provider: 'transloadit', token: authSecret, metadata: { auth_key: authKey } },
      { onConflict: 'org_id,provider' },
    );
  if (error) throw new Error(`Failed to save credentials: ${error.message}`);
}

export async function deleteTransloaditCredentials() {
  if (!IS_SUPABASE_ENABLED) return;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return;
  const db = await getAuthedSupabase();
  await db.from('user_integrations').delete().eq('org_id', orgId).eq('provider', 'transloadit');
}

/**
 * Run encoder-pass on a single render. Re-encodes raw_url to Meta-spec
 * 9:16 H.264 + AAC and stores the result URL on the render row.
 *
 * @param {{ render_id: string }} params
 * @returns {Promise<{ render: any, assembly_id: string }>}
 */
export async function callEncoderPass({ render_id }) {
  return await callEdgeFunction('encoder-pass', { render_id });
}

// ─── Meta ad publishing (writes — read flow stays direct from browser) ───

/**
 * Save Meta credentials into user_integrations for the publish flow.
 * The existing MetaAdsCard read path keeps its localStorage cache too —
 * this is purely additive so server-side functions can pick up the
 * creds.
 */
export async function saveMetaCredentialsServer({ token, accountId, pageId }) {
  if (!IS_SUPABASE_ENABLED) return;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return;
  const db = await getAuthedSupabase();
  const metadata = { account_id: accountId };
  if (pageId) metadata.page_id = pageId;
  const { error } = await db
    .from('user_integrations')
    .upsert(
      { org_id: orgId, provider: 'meta', token, metadata },
      { onConflict: 'org_id,provider' },
    );
  if (error) console.error('saveMetaCredentialsServer:', error);
}

export async function deleteMetaCredentialsServer() {
  if (!IS_SUPABASE_ENABLED) return;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return;
  const db = await getAuthedSupabase();
  await db.from('user_integrations').delete().eq('org_id', orgId).eq('provider', 'meta');
}

/**
 * Publish an approved + encoded render as a PAUSED Meta ad.
 *
 * @param {{ render_id: string, daily_budget_usd?: number }} params
 * @returns {Promise<{ ad: any, guardrail: any }>}
 */
export async function callUploadMetaAd({ render_id, daily_budget_usd }) {
  return await callEdgeFunction('upload-meta-ad', { render_id, daily_budget_usd });
}

/**
 * Generic Meta proxy call. Used for Kill (status=PAUSED) and Scale
 * (daily_budget=...).
 */
export async function callMetaProxy({ method, path, body }) {
  return await callEdgeFunction('meta-proxy', { method, path, body });
}

// ─── Render dispatch + polling ───────────────────────────────────────

/**
 * Submit an approved brief for rendering. Creates one or more
 * `renders` rows depending on the sprint's lane.
 *
 * @param {{ brief_id: string }} params
 * @returns {Promise<{ renders: any[], errors: any[] }>}
 */
export async function callDispatchRender({ brief_id }) {
  return await callEdgeFunction('dispatch-render', { brief_id });
}

/**
 * Poll the upstream provider for a single render's status. Idempotent.
 *
 * @param {{ render_id: string }} params
 * @returns {Promise<{ render: any }>}
 */
export async function callCheckRenderStatus({ render_id }) {
  return await callEdgeFunction('check-render-status', { render_id });
}

// ─── Internal: shared edge-function caller ───────────────────────────

async function callEdgeFunction(name, body) {
  if (!IS_SUPABASE_ENABLED || !supabase) {
    throw new Error(`Supabase not configured — cannot reach ${name}`);
  }
  const token = await getClerkToken();
  if (!token) throw new Error('Sign in first');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error || `${res.status} ${res.statusText}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

// Like callEdgeFunction but for proxy endpoints that may legitimately
// return non-2xx (e.g. fal returning 404 for a stub /health path) —
// we treat reaching the proxy at all as success for the purpose of
// the connection test.
async function callProxyEndpoint(name, body, opts = {}) {
  if (!IS_SUPABASE_ENABLED || !supabase) {
    throw new Error(`Supabase not configured — cannot reach ${name}`);
  }
  const token = await getClerkToken();
  if (!token) throw new Error('Sign in first');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  // 401/404 from the proxy itself = real failure. Anything past the
  // proxy (e.g. 4xx/5xx returned by fal/higgsfield because /health
  // isn't a real path) means the proxy + key combo is wired up. Both
  // upstream and proxy share status codes, so we sniff the error
  // message to distinguish — proxy errors include phrases like
  // "not connected", "Sign in", or "Credential lookup".
  if (res.status === 401 || res.status === 404) {
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    const errorStr = typeof data?.error === 'string'
      ? data.error
      : (data?.error?.message || '');
    const isProxyFailure = res.status === 401
      || /not connected|sign in|credential lookup/i.test(errorStr);
    if (isProxyFailure) {
      const msg = errorStr || `${res.status} ${res.statusText}`;
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    // Otherwise: upstream returned 404 (e.g. /health) — proxy + key works.
    if (opts.allowAnyStatus) return { ok: true, status: res.status };
  }

  if (!opts.allowAnyStatus && !res.ok) {
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    const msg = data?.error || `${res.status} ${res.statusText}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return { ok: true, status: res.status };
}
