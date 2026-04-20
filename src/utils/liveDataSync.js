// Live data sync utilities — Shopify, Meta Ads, Mercury

import { supabase, IS_SUPABASE_ENABLED } from '../lib/supabase';

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
  if (!IS_SUPABASE_ENABLED || !supabase) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in first');

  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const { error } = await supabase
    .from('user_integrations')
    .upsert(
      {
        user_id: user.id,
        provider: 'shopify',
        token,
        metadata: { domain: cleanDomain },
      },
      { onConflict: 'user_id,provider' },
    );
  if (error) throw new Error(`Failed to save credentials: ${error.message}`);
}

/**
 * Returns the Shopify integration row for the signed-in user, or null.
 */
export async function loadShopifyIntegration() {
  if (!IS_SUPABASE_ENABLED || !supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('user_integrations')
    .select('metadata, updated_at')
    .eq('provider', 'shopify')
    .maybeSingle();
  if (error || !data) return null;
  return { domain: data.metadata?.domain, updatedAt: data.updated_at };
}

/**
 * Remove the signed-in user's Shopify credentials.
 */
export async function deleteShopifyCredentials() {
  if (!IS_SUPABASE_ENABLED || !supabase) return;
  await supabase.from('user_integrations').delete().eq('provider', 'shopify');
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
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in to use the Shopify proxy');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/shopify-proxy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
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
 * Pulls weekly Total sales + order count by querying Shopify's Admin GraphQL
 * orders endpoint. Uses `processedAt` (same timestamp Shopify Analytics uses
 * for bucketing) and sums `currentTotalPriceSet` (net of refunds/returns,
 * same value that feeds Shopify's Total sales report). Paginates automatically.
 *
 * Requires `read_orders` scope.
 * Returns an array of { startDate, endDate, label, revenue, orders, isCurrent }.
 */
export async function syncShopifyActuals(/* creds unused — proxy holds creds */) {
  const weeks = getPast13Weeks();
  const since = weeks[0].startDate; // YYYY-MM-DD

  const gqlQuery = `
    query FetchOrders($cursor: String, $q: String!) {
      orders(first: 250, after: $cursor, query: $q, sortKey: PROCESSED_AT) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            processedAt
            cancelledAt
            test
            currentTotalPriceSet { shopMoney { amount } }
          }
        }
      }
    }
  `;
  const queryFilter = `processed_at:>=${since}`;

  // Fetch all pages (safety cap at 10 pages = 2500 orders over 13 weeks)
  const all = [];
  let cursor = null;
  for (let page = 0; page < 10; page++) {
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

  // Drop cancelled + test orders — same filter Shopify Analytics applies
  const valid = all.filter(o => !o.cancelledAt && !o.test);

  return weeks.map(week => {
    const weekOrders = valid.filter(o => {
      const d = new Date(o.processedAt);
      return d >= new Date(week.startISO) && d <= new Date(week.endISO);
    });
    const revenue = weekOrders.reduce((s, o) => {
      const raw = o.currentTotalPriceSet?.shopMoney?.amount;
      const v = parseFloat(raw);
      return s + (Number.isFinite(v) ? v : 0);
    }, 0);
    return {
      startDate: week.startDate,
      endDate: week.endDate,
      label: week.label,
      isCurrent: week.isCurrent,
      revenue: Math.round(revenue * 100) / 100,
      orders: weekOrders.length,
    };
  });
}

// ─── Meta Ads ─────────────────────────────────────────────────────────────────
/**
 * Fetches weekly ad spend from the Meta Graph API for the past 13 weeks.
 * Returns an array of { startDate, endDate, label, adSpend, impressions, clicks }.
 */
export async function syncMetaActuals(creds) {
  if (!creds?.connected || !creds.accountId || !creds.token) {
    throw new Error('Meta Ads not connected');
  }

  const weeks = getPast13Weeks();
  const accountId = creds.accountId.startsWith('act_') ? creds.accountId : `act_${creds.accountId}`;
  const token = creds.token;

  const since = weeks[0].startDate;
  const until = weeks[12].endDate;

  const url = `https://graph.facebook.com/v19.0/${accountId}/insights?fields=spend,impressions,clicks&time_increment=7&time_range[since]=${since}&time_range[until]=${until}&access_token=${token}`;

  let data = [];
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    data = json.data || [];
  } catch (err) {
    throw new Error(err.message);
  }

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

// ─── Mercury ──────────────────────────────────────────────────────────────────
/**
 * Fetches account balances and recent transactions from the Mercury API.
 * Returns { accounts, transactions, primaryBalance }.
 */
export async function syncMercuryActuals(creds) {
  if (!creds?.connected || !creds.apiKey) {
    throw new Error('Mercury not connected');
  }

  const headers = {
    Authorization: `Bearer ${creds.apiKey}`,
    'Content-Type': 'application/json',
  };

  let accounts = [];
  try {
    const res = await fetch('https://app.mercury.com/api/treasury/v1/accounts', { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Mercury ${res.status}: ${text.slice(0, 120)}`);
    }
    const json = await res.json();
    accounts = json.accounts || [];
  } catch (err) {
    const msg = err.message.includes('Failed to fetch')
      ? 'CORS blocked — Mercury API requires server-side access. Enter balance manually.'
      : err.message;
    throw new Error(msg);
  }

  // Sum all checking/savings balances
  const primaryBalance = accounts
    .filter(a => a.status === 'active' && ['checking', 'savings'].includes(a.kind))
    .reduce((sum, a) => sum + (a.currentBalance || 0), 0);

  // Try to get transactions for the primary account (last 90 days)
  let transactions = [];
  if (accounts.length > 0) {
    const primaryId = accounts[0].id;
    const since = getPast13Weeks()[0].startDate;
    try {
      const res = await fetch(
        `https://app.mercury.com/api/treasury/v1/account/${primaryId}/transactions?limit=500&start=${since}`,
        { headers },
      );
      if (res.ok) {
        const json = await res.json();
        transactions = json.transactions || [];
      }
    } catch {
      // Transactions optional — balance is the important part
    }
  }

  return { accounts, transactions, primaryBalance };
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
