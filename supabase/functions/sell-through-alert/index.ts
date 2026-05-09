// Sell-through stockout alert.
//
// Triggered daily by pg_cron. For each org with at least one tracked
// variant in `sell_through_tracked`:
//
//   1. Pull the org's Shopify creds (provider='shopify').
//   2. For each tracked variant, fetch current inventoryQuantity and
//      the trailing 90 days of line-item sales from Shopify Admin
//      GraphQL (mirrors src/utils/liveDataSync.js).
//   3. Pull open POs from `purchase_orders` and tech-pack style names
//      to allocate inbound units velocity-weighted across the variant's
//      siblings (mirrors src/utils/poAllocations.js).
//   4. Compute blended velocity (0.5×v7 + 0.3×v30 + 0.2×v90) and
//      simulate days-of-cover with the PO arrivals.
//   5. For variants where days_of_cover ≤ lead_time + 14, post a
//      single Apple-simple message via slack-proxy with
//      provider='slack_inventory' and the channel from that row's
//      metadata.
//   6. Append an `agent_interactions` row with the summary so we have
//      an audit trail of what got flagged when.
//
// Auth modes:
//   - x-cron-secret header from pg_cron → service-role, all orgs.
//   - JWT (Authorization: Bearer …) → user-triggered manual run scoped
//     to that user's org via RLS.
//
// Env vars:
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//   CRON_SECRET
//   SHOPIFY_API_VERSION (optional, default '2024-01')
//
// Deploy:
//   supabase functions deploy sell-through-alert

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CRON_SECRET = Deno.env.get('CRON_SECRET');
const SHOPIFY_API_VERSION = Deno.env.get('SHOPIFY_API_VERSION') || '2024-01';

const BLEND_WEIGHTS: Record<number, number> = { 7: 0.5, 30: 0.3, 90: 0.2 };
const ALERT_BUFFER_DAYS = 14;

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey, x-cron-secret',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

// ─── Math (port of sellThroughStore.js) ──────────────────────────────────────

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function unitsInWindow(salesByDay: Record<string, number>, windowDays: number, today = new Date()): number {
  let total = 0;
  for (let i = 0; i <= windowDays; i++) {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    total += salesByDay[isoDate(d)] || 0;
  }
  return total;
}

function blendedVelocity(salesByDay: Record<string, number>, today = new Date()): number | null {
  let totalWeight = 0;
  let weighted = 0;
  for (const [w, weight] of Object.entries(BLEND_WEIGHTS)) {
    const sold = unitsInWindow(salesByDay, Number(w), today);
    if (sold <= 0) continue;
    const v = sold / Number(w);
    weighted += v * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return null;
  return weighted / totalWeight;
}

function daysOfCover(velocity: number | null, onHand: number, arrivals: { daysFromToday: number; units: number }[]): number | null {
  if (onHand <= 0) return 0;
  if (velocity == null || velocity <= 0) return arrivals.length ? 365 : null;
  const arrivalsByDay = new Map<number, number>();
  for (const a of arrivals) {
    const day = Math.max(1, Math.round(a.daysFromToday));
    arrivalsByDay.set(day, (arrivalsByDay.get(day) || 0) + (a.units || 0));
  }
  let remaining = onHand;
  for (let day = 1; day <= 365; day++) {
    remaining -= velocity;
    const inbound = arrivalsByDay.get(day);
    if (inbound) remaining += inbound;
    if (remaining <= 0) return day;
  }
  return 365;
}

// ─── Shopify pulls ───────────────────────────────────────────────────────────

type Variant = {
  variantId: string;
  sku: string;
  productTitle: string;
  variantTitle: string;
  inventoryQuantity: number;
  salesByDay: Record<string, number>;
};

async function shopifyGraphQL(domain: string, token: string, query: string, variables: Record<string, unknown>): Promise<{ data: unknown; errors?: { message: string }[] }> {
  const res = await fetch(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function fetchVariantsForOrg(domain: string, token: string): Promise<Variant[]> {
  const gql = `
    query FetchVariants($cursor: String) {
      productVariants(first: 250, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            sku
            title
            inventoryQuantity
            product { id title }
          }
        }
      }
    }
  `;
  const out: Variant[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 40; page++) {
    const data = await shopifyGraphQL(domain, token, gql, { cursor }) as {
      data?: { productVariants?: { pageInfo: { hasNextPage: boolean; endCursor: string }; edges: { node: { id: string; sku: string; title: string; inventoryQuantity: number; product: { title: string } } }[] } };
      errors?: { message: string }[];
    };
    if (data.errors?.length) throw new Error(`Shopify: ${data.errors.map(e => e.message).join('; ')}`);
    const conn = data.data?.productVariants;
    if (!conn) break;
    for (const e of conn.edges) {
      const n = e.node;
      out.push({
        variantId: n.id,
        sku: n.sku || '',
        productTitle: n.product?.title || '',
        variantTitle: n.title || '',
        inventoryQuantity: typeof n.inventoryQuantity === 'number' ? n.inventoryQuantity : 0,
        salesByDay: {},
      });
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return out;
}

async function fetchSalesByVariant(domain: string, token: string, days = 90): Promise<Record<string, Record<string, number>>> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);
  const gql = `
    query FetchSales($cursor: String, $q: String!) {
      orders(first: 250, after: $cursor, query: $q, sortKey: PROCESSED_AT) {
        pageInfo { hasNextPage endCursor }
        edges { node {
          processedAt cancelledAt test
          lineItems(first: 100) { edges { node { quantity variant { id } } } }
        } }
      }
    }
  `;
  const queryFilter = `processed_at:>=${sinceStr} NOT status:cancelled NOT test:true`;
  const out: Record<string, Record<string, number>> = {};
  let cursor: string | null = null;
  for (let page = 0; page < 40; page++) {
    const data = await shopifyGraphQL(domain, token, gql, { cursor, q: queryFilter }) as {
      data?: { orders?: { pageInfo: { hasNextPage: boolean; endCursor: string }; edges: { node: { processedAt: string; cancelledAt: string | null; test: boolean; lineItems: { edges: { node: { quantity: number; variant: { id: string } | null } }[] } } }[] } };
      errors?: { message: string }[];
    };
    if (data.errors?.length) throw new Error(`Shopify: ${data.errors.map(e => e.message).join('; ')}`);
    const orders = data.data?.orders;
    if (!orders) break;
    for (const e of orders.edges) {
      const o = e.node;
      if (o.cancelledAt || o.test) continue;
      const d = new Date(o.processedAt);
      const key = isoDate(d);
      for (const liEdge of o.lineItems?.edges || []) {
        const li = liEdge.node;
        const vid = li.variant?.id;
        if (!vid) continue;
        const qty = li.quantity || 0;
        if (qty <= 0) continue;
        if (!out[vid]) out[vid] = {};
        out[vid][key] = (out[vid][key] || 0) + qty;
      }
    }
    if (!orders.pageInfo.hasNextPage) break;
    cursor = orders.pageInfo.endCursor;
  }
  return out;
}

// ─── Per-org evaluation ──────────────────────────────────────────────────────

type AtRiskVariant = {
  variantId: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  onHand: number;
  daysOfCover: number | null;
  leadTime: number;
};

async function evaluateOrg(db: SupabaseClient, orgId: string): Promise<{ atRisk: AtRiskVariant[]; channelId: string | null; total: number }> {
  // Tracked variants
  const { data: tracked } = await db
    .from('sell_through_tracked')
    .select('variant_id, sku, product_title, variant_title, lead_time_days')
    .eq('organization_id', orgId);
  if (!tracked?.length) return { atRisk: [], channelId: null, total: 0 };

  // Inventory channel from the slack_inventory integration
  const { data: slackRow } = await db
    .from('user_integrations')
    .select('metadata')
    .eq('org_id', orgId)
    .eq('provider', 'slack_inventory')
    .maybeSingle();
  const channelId = (slackRow?.metadata as { channel_id?: string })?.channel_id || null;
  if (!channelId) return { atRisk: [], channelId: null, total: tracked.length };

  // Shopify creds
  const { data: shopRow } = await db
    .from('user_integrations')
    .select('token, metadata')
    .eq('org_id', orgId)
    .eq('provider', 'shopify')
    .maybeSingle();
  const shopifyToken = shopRow?.token as string | undefined;
  const shopifyDomain = (shopRow?.metadata as { domain?: string })?.domain;
  if (!shopifyToken || !shopifyDomain) return { atRisk: [], channelId, total: tracked.length };

  // Pull variants + sales
  const [variants, salesByVariant] = await Promise.all([
    fetchVariantsForOrg(shopifyDomain, shopifyToken),
    fetchSalesByVariant(shopifyDomain, shopifyToken, 90),
  ]);
  for (const v of variants) v.salesByDay = salesByVariant[v.variantId] || {};

  // Build sibling lookup by normalized productTitle
  const variantsByTitleKey = new Map<string, Variant[]>();
  for (const v of variants) {
    const key = v.productTitle.trim().toLowerCase();
    if (!variantsByTitleKey.has(key)) variantsByTitleKey.set(key, []);
    variantsByTitleKey.get(key)!.push(v);
  }

  // Open POs + tech pack style names for matching
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const { data: pos } = await db
    .from('purchase_orders')
    .select('id, code, style_id, units, lead_days, placed_at, status')
    .eq('organization_id', orgId)
    .in('status', ['placed', 'in_production']);
  const styleIds = [...new Set((pos || []).map(p => p.style_id).filter(Boolean))];
  const { data: packs } = styleIds.length
    ? await db.from('tech_packs').select('id, style_name, data').in('id', styleIds)
    : { data: [] };
  const packById = new Map<string, { style_name: string; data: unknown }>();
  for (const p of packs || []) packById.set(p.id, { style_name: p.style_name || '', data: p.data });

  // Per-variant blended velocity (used both for arrivals allocation and the cover sim)
  const velocityById = new Map<string, number>();
  for (const v of variants) velocityById.set(v.variantId, blendedVelocity(v.salesByDay) || 0);

  // PO → variant arrivals
  const arrivalsByVariant: Record<string, { daysFromToday: number; units: number }[]> = {};
  for (const po of pos || []) {
    if (!po.placed_at) continue;
    const units = Number(po.units) || 0;
    if (units <= 0) continue;
    const placed = new Date(po.placed_at as string); placed.setHours(0, 0, 0, 0);
    const lead = Number(po.lead_days) || 0;
    const landing = new Date(placed); landing.setDate(landing.getDate() + lead);
    const daysFromToday = Math.max(1, Math.round((landing.getTime() - today.getTime()) / 86_400_000));

    const pack = packById.get(po.style_id);
    const styleName = (pack?.style_name as string) || '';
    const siblings = matchSiblings(variantsByTitleKey, styleName);
    if (!siblings.length) continue;

    const totalV = siblings.reduce((s, v) => s + (velocityById.get(v.variantId) || 0), 0);
    let allocations: { v: Variant; units: number }[];
    if (totalV > 0) {
      allocations = siblings.map(v => ({ v, units: units * ((velocityById.get(v.variantId) || 0) / totalV) }));
    } else {
      const each = units / siblings.length;
      allocations = siblings.map(v => ({ v, units: each }));
    }
    for (const a of allocations) {
      const arr = arrivalsByVariant[a.v.variantId] || (arrivalsByVariant[a.v.variantId] = []);
      arr.push({ daysFromToday, units: a.units });
    }
  }

  // Evaluate each tracked variant
  const variantById = new Map<string, Variant>();
  for (const v of variants) variantById.set(v.variantId, v);

  const atRisk: AtRiskVariant[] = [];
  for (const t of tracked) {
    const v = variantById.get(t.variant_id);
    if (!v) continue; // tracked variant deleted in Shopify; skip
    const onHand = v.inventoryQuantity || 0;
    const velocity = velocityById.get(v.variantId) || null;
    const arrivals = arrivalsByVariant[v.variantId] || [];
    const cover = daysOfCover(velocity, onHand, arrivals);
    const leadTime = Number(t.lead_time_days) || 70;
    const threshold = leadTime + ALERT_BUFFER_DAYS;
    if (cover != null && cover <= threshold) {
      atRisk.push({
        variantId: v.variantId,
        productTitle: v.productTitle,
        variantTitle: v.variantTitle,
        sku: v.sku,
        onHand,
        daysOfCover: cover,
        leadTime,
      });
    }
  }

  return { atRisk, channelId, total: tracked.length };
}

function matchSiblings(byTitle: Map<string, Variant[]>, styleName: string): Variant[] {
  const key = styleName.trim().toLowerCase();
  if (!key) return [];
  const exact = byTitle.get(key);
  if (exact) return exact;
  for (const [k, vs] of byTitle) {
    if (k.includes(key) || key.includes(k)) return vs;
  }
  return [];
}

function buildSlackText(atRisk: AtRiskVariant[]): string {
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const header = `${atRisk.length} tracked ${atRisk.length === 1 ? 'variant' : 'variants'} at risk of stockout — ${today}`;
  const sections = atRisk.map(r => {
    const variantSuffix = r.variantTitle && r.variantTitle !== 'Default Title' ? ` · ${r.variantTitle}` : '';
    const cover = r.daysOfCover === 0 ? 'sold out' : `${r.daysOfCover} days of cover`;
    const verdict = r.onHand === 0
      ? 'STOCKOUT — restock immediately'
      : (r.daysOfCover ?? 0) <= r.leadTime
        ? 'URGENT — will stock out before reorder lands'
        : 'Order now to avoid stockout';
    return [
      `*${r.productTitle}${variantSuffix}*`,
      `   ${r.onHand} on hand · ${cover} · ${r.leadTime}d lead time`,
      `   ${verdict}`,
    ].join('\n');
  }).join('\n\n');
  return `${header}\n\n${sections}`;
}

async function postSlackMessage(db: SupabaseClient, orgId: string, channelId: string, text: string): Promise<unknown> {
  // Look up token directly (we're running as service-role).
  const { data: integration } = await db
    .from('user_integrations')
    .select('token')
    .eq('org_id', orgId)
    .eq('provider', 'slack_inventory')
    .maybeSingle();
  if (!integration?.token) throw new Error('slack_inventory not connected');
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${integration.token as string}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel: channelId, text, mrkdwn: true }),
  });
  return res.json();
}

// ─── Entry ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  const origin = req.headers.get('origin') || '*';
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: 'SUPABASE_URL / SUPABASE_ANON_KEY env missing' }, 500, origin);
  }

  const cronSecret = req.headers.get('x-cron-secret');
  const isCron = cronSecret && CRON_SECRET && cronSecret === CRON_SECRET;

  let dbForOrgScan: SupabaseClient;
  let orgIds: string[] = [];

  if (isCron) {
    if (!SERVICE_ROLE_KEY) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing' }, 500, origin);
    dbForOrgScan = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data } = await dbForOrgScan.from('sell_through_tracked').select('organization_id');
    orgIds = [...new Set((data || []).map(r => r.organization_id))];
  } else {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing Authorization header (or x-cron-secret)' }, 401, origin);
    }
    const jwt = authHeader.slice('Bearer '.length);
    dbForOrgScan = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    // RLS scopes this query to the caller's org.
    const { data } = await dbForOrgScan.from('sell_through_tracked').select('organization_id').limit(1);
    if (data?.[0]) orgIds = [data[0].organization_id as string];
  }

  // Per-org evaluation always uses service-role for the heavy reads
  // (purchase_orders / user_integrations / product_specifications)
  // — RLS-scoped clients can't cross-org during cron, but we already
  // restrict the org set above.
  const heavyDb = SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    : dbForOrgScan;

  const summary: Record<string, { tracked: number; at_risk: number; posted: boolean; error?: string }> = {};
  for (const orgId of orgIds) {
    try {
      const { atRisk, channelId, total } = await evaluateOrg(heavyDb, orgId);
      let posted = false;
      if (atRisk.length && channelId) {
        const text = buildSlackText(atRisk);
        await postSlackMessage(heavyDb, orgId, channelId, text);
        posted = true;
      }
      // Audit
      await heavyDb.from('agent_interactions').insert({
        source: 'sell-through-alert',
        action_id: orgId,
        value: posted ? 'posted' : 'skipped',
        payload: { tracked: total, at_risk_count: atRisk.length, at_risk: atRisk },
      });
      summary[orgId] = { tracked: total, at_risk: atRisk.length, posted };
    } catch (err) {
      summary[orgId] = { tracked: 0, at_risk: 0, posted: false, error: (err as Error).message };
    }
  }
  return json({ ok: true, summary }, 200, origin);
});
