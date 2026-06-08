// Shared inventory-agent core.
//
// Used by:
//   - inventory-agent-daily         (cron-driven morning briefing in #inventory)
//   - inventory-agent-slack-events  (replies to messages / @mentions in #inventory)
//
// Mirrors the system prompt + tool contract of `src/utils/inventoryAgent.js`
// (the in-browser chat panel) so the operator sees consistent behavior across
// surfaces. Differences from the in-browser version:
//
//   1. Anthropic calls go DIRECT to api.anthropic.com using the org's
//      `anthropic` credential from user_integrations (same pattern as
//      synthesize-weekly). The browser-side `anthropic-proxy` is for
//      authenticated user sessions, not cron / Slack webhooks.
//
//   2. Tools that read from localStorage-only stores in the browser
//      (`get_otb_plan`, `get_forecast_assumptions`, `get_tracking_audit`)
//      are NOT available server-side. The system prompt instructs the
//      agent to defer those questions to the in-app chat panel.
//
//   3. Server-side tools that DO work pull from Supabase tables
//      (`purchase_orders`, `variant_mappings`, `agent_interactions`)
//      and from Shopify Admin GraphQL Live (`query_skus_live`,
//      `get_sku_live`) — using the same blended-velocity math as
//      sell-through-alert.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-4-7';
const MAX_TURNS = 6;
const SHOPIFY_API_VERSION = Deno.env.get('SHOPIFY_API_VERSION') || '2024-01';

// ─── System prompt ──────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are the inventory agent for Foreign Resource — a streetwear brand with apparel and accessories. You live in the company's #inventory Slack channel. Each morning you post a briefing; throughout the day you answer the operator's questions in-channel.

BRAND OPERATING PRINCIPLES (absolute):
- **Never discount.** Foreign Resource never marks down, never runs sales, never offers promotional codes that reduce price. Do not propose markdown actions, sale-price changes, or discount codes. The only overstock levers are: pause reorder, hold for review, archive / repurpose at full price, creator seeding, or sample sale at cost.
- **Tracked vs untracked SKUs.** Tracked variants are the staples the team actively manages. Untracked variants are intentional drops that should sell out without restock. When the operator asks about urgency, exclude untracked unless they explicitly ask about them.

WHERE YOU LIVE:
- You post to #inventory once each morning (9 AM ET) with the briefing.
- The operator replies in-channel or @-mentions you with follow-ups.
- For the morning briefing, the daily context bundle (at-risk variants, top sellers, open POs, recent alerts) is pre-loaded into your first user message — DO NOT call query_skus_live unless the operator asks a question the bundle can't answer.

DATA AVAILABLE THROUGH TOOLS (server-side):
- query_pos               — purchase orders by status / style / vendor
- get_mappings            — Shopify variant ↔ PLM style mappings
- query_skus_live         — Shopify variants + blended velocity + days-of-cover (EXPENSIVE; ~5-20s per call; uses pre-loaded data in the bundle when possible)
- get_sku_live            — single variant with full sales-by-day
- get_recent_alerts       — last 7 days of inventory agent activity (for continuity / learning)

DATA *NOT* AVAILABLE server-side (browser-only stores):
- Open-to-Buy plan, forecast assumptions, tracked-toggle audit history.
- If the operator asks about these, say: "I can't read OTB / forecast / star-history from Slack — open the inventory chat in the app for that."

ANSWERING STYLE:
- Concise. Operators are scanning quickly between trades.
- Lead with the answer. Show the math only if it sharpens the answer.
- Use mono-formatted SKU codes and dates (YYYY-MM-DD).
- When you don't have enough data, say so plainly. Don't speculate.
- If the question implies an action ("should I reorder X?"), recommend a course but call out the constraints — never propose a discount.

MORNING BRIEFING FORMAT (when given the daily bundle):
1. One-line headline: the single most important thing the operator should know.
2. **At risk** — list each at-risk variant with on-hand, days-of-cover, and a one-line verdict.
3. **Moving fast** — top 3 sellers from the bundle's top-10 by 90d revenue.
4. **POs landing this month** — any open POs with expected_landing in the next 30 days.
5. **Notes from yesterday** — if the recent-alerts bundle shows yesterday's flags, note which resolved and which are still open.
Keep the whole post under 25 Slack lines. Use Slack mrkdwn (*bold*, _italic_, \`code\`).`;

// ─── Tool definitions ───────────────────────────────────────────────────────

export const TOOLS = [
  {
    name: 'query_pos',
    description: 'List purchase orders with optional filters.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'placed', 'in_production', 'received', 'closed', 'cancelled'] },
        style_id: { type: 'string' },
        vendor_id: { type: 'string' },
        limit: { type: 'integer', description: 'Max rows. Default 25.' },
      },
    },
  },
  {
    name: 'get_mappings',
    description: 'List variant ↔ style mappings. Filter by style_id to see all variants of one style.',
    input_schema: {
      type: 'object',
      properties: { style_id: { type: 'string' } },
    },
  },
  {
    name: 'query_skus_live',
    description: 'Pull live Shopify variants with on-hand, blended velocity (0.5×v7 + 0.3×v30 + 0.2×v90), and days-of-cover including open-PO arrivals. EXPENSIVE (~5-20s). For the morning briefing, prefer the pre-loaded bundle in the user message. Use only when the operator asks something the bundle does not answer.',
    input_schema: {
      type: 'object',
      properties: {
        tracked_only: { type: 'boolean' },
        sku_substring: { type: 'string', description: 'Case-insensitive substring match on sku / product title / variant title.' },
        limit: { type: 'integer', description: 'Max rows. Default 25, hard cap 100.' },
      },
    },
  },
  {
    name: 'get_sku_live',
    description: 'Pull a single variant with full salesByDay (last 90 days). Use when the operator asks about one specific SKU or variant.',
    input_schema: {
      type: 'object',
      properties: {
        variant_id: { type: 'string', description: 'Shopify variant GID, e.g. "gid://shopify/ProductVariant/123".' },
        sku: { type: 'string', description: 'Or the SKU code if variant_id is unknown.' },
      },
    },
  },
  {
    name: 'get_recent_alerts',
    description: 'Read the inventory agent\'s recent activity (last 7 days of agent_interactions where source starts with "inventory"). Useful for continuity ("what did I flag yesterday?", "did the chase PO land?").',
    input_schema: {
      type: 'object',
      properties: { days: { type: 'integer', description: 'How many days back to look. Default 7, max 30.' } },
    },
  },
];

// ─── Tool dispatch ──────────────────────────────────────────────────────────

export type AgentDeps = {
  db: SupabaseClient;        // service-role client (cron) or RLS-scoped client
  orgId: string;             // org being reasoned about
  shopifyDomain?: string;    // optional; required for *_live tools
  shopifyToken?: string;     // optional; required for *_live tools
  // Cache the heavy Shopify pull within a single agent turn so the model can
  // iterate without paying for repeat pulls.
  cache?: { skus?: SkuLive[] };
};

export type SkuLive = {
  variant_id: string;
  sku: string;
  product_title: string;
  variant_title: string;
  on_hand: number;
  velocity: number | null;       // units/day
  days_of_cover: number | null;
  open_po_units: number;
  tracked: boolean;
  lead_time_days: number;
  salesByDay?: Record<string, number>;
};

export async function dispatchTool(name: string, input: Record<string, unknown>, deps: AgentDeps): Promise<unknown> {
  switch (name) {
    case 'query_pos': {
      const limit = Math.min(Number(input?.limit) || 25, 100);
      let q = deps.db
        .from('purchase_orders')
        .select('id, code, status, vendor_id, style_id, units, unit_cost_usd, lead_days, placed_at, received_at')
        .eq('organization_id', deps.orgId)
        .order('placed_at', { ascending: false })
        .limit(limit);
      if (input?.status)    q = q.eq('status', input.status);
      if (input?.style_id)  q = q.eq('style_id', input.style_id);
      if (input?.vendor_id) q = q.eq('vendor_id', input.vendor_id);
      const { data, error } = await q;
      if (error) return { error: error.message };
      // Derive expected_landing for the agent so it doesn't have to do the math.
      const rows = (data || []).map(p => {
        let expected_landing: string | null = null;
        if (p.placed_at && p.lead_days != null) {
          const d = new Date(p.placed_at as string);
          d.setDate(d.getDate() + Number(p.lead_days));
          expected_landing = d.toISOString().slice(0, 10);
        }
        return { ...p, expected_landing };
      });
      return { count: rows.length, rows };
    }

    case 'get_mappings': {
      let q = deps.db
        .from('variant_mappings')
        .select('id, style_id, shopify_variant_gid, shopify_sku, variant_options, archived_at')
        .eq('organization_id', deps.orgId)
        .is('archived_at', null)
        .limit(200);
      if (input?.style_id) q = q.eq('style_id', input.style_id);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length || 0, rows: data || [] };
    }

    case 'query_skus_live': {
      if (!deps.shopifyDomain || !deps.shopifyToken) {
        return { error: 'Shopify not connected for this org — cannot query live SKUs.' };
      }
      const all = await getOrComputeSkus(deps);
      const q = String(input?.sku_substring || '').toLowerCase();
      const trackedSkus = await loadTrackedVariantIds(deps);
      let rows = all.map(r => ({ ...r, tracked: trackedSkus.has(r.variant_id) }));
      if (input?.tracked_only) rows = rows.filter(r => r.tracked);
      if (q) rows = rows.filter(r =>
        `${r.sku} ${r.product_title} ${r.variant_title}`.toLowerCase().includes(q));
      rows.sort((a, b) => (b.velocity || 0) - (a.velocity || 0));
      const limit = Math.min(Number(input?.limit) || 25, 100);
      // Drop salesByDay from list view to keep tool result compact.
      const slim = rows.slice(0, limit).map(r => ({ ...r, salesByDay: undefined }));
      return { count: rows.length, rows: slim };
    }

    case 'get_sku_live': {
      if (!deps.shopifyDomain || !deps.shopifyToken) {
        return { error: 'Shopify not connected for this org — cannot query live SKUs.' };
      }
      const all = await getOrComputeSkus(deps);
      const vid = String(input?.variant_id || '').trim();
      const sku = String(input?.sku || '').trim().toLowerCase();
      const hit = all.find(r =>
        (vid && r.variant_id === vid) ||
        (sku && r.sku.toLowerCase() === sku));
      if (!hit) return { found: false };
      return { found: true, ...hit };
    }

    case 'get_recent_alerts': {
      const days = Math.min(Number(input?.days) || 7, 30);
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data, error } = await deps.db
        .from('agent_interactions')
        .select('source, action_id, value, payload, created_at')
        .like('source', 'inventory%')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) return { error: error.message };
      return { count: data?.length || 0, rows: data || [] };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Shopify Live + blended velocity (mirror of sell-through-alert math) ────

const BLEND_WEIGHTS: Record<number, number> = { 7: 0.5, 30: 0.3, 90: 0.2 };

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

export function blendedVelocity(salesByDay: Record<string, number>, today = new Date()): number | null {
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

export function daysOfCover(velocity: number | null, onHand: number, arrivals: { daysFromToday: number; units: number }[]): number | null {
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

async function shopifyGraphQL(domain: string, token: string, query: string, variables: Record<string, unknown>): Promise<{ data?: unknown; errors?: { message: string }[] }> {
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

async function fetchVariantsForOrg(domain: string, token: string): Promise<Array<{ variantId: string; sku: string; productTitle: string; variantTitle: string; inventoryQuantity: number }>> {
  const gql = `
    query FetchVariants($cursor: String) {
      productVariants(first: 250, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges { node { id sku title inventoryQuantity product { title } } }
      }
    }`;
  const out: Array<{ variantId: string; sku: string; productTitle: string; variantTitle: string; inventoryQuantity: number }> = [];
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
    }`;
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
      const key = isoDate(new Date(o.processedAt));
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

async function loadTrackedVariantIds(deps: AgentDeps): Promise<Set<string>> {
  const { data } = await deps.db
    .from('sell_through_tracked')
    .select('variant_id, lead_time_days')
    .eq('organization_id', deps.orgId);
  return new Set((data || []).map(r => r.variant_id as string));
}

async function loadTrackedLeadTimes(deps: AgentDeps): Promise<Map<string, number>> {
  const { data } = await deps.db
    .from('sell_through_tracked')
    .select('variant_id, lead_time_days')
    .eq('organization_id', deps.orgId);
  const out = new Map<string, number>();
  for (const r of data || []) out.set(r.variant_id as string, Number(r.lead_time_days) || 70);
  return out;
}

/**
 * Build the joined live-SKU view used by query_skus_live, get_sku_live, and
 * by the daily-briefing context bundle.
 *
 * Cached per AgentDeps so multi-turn conversations don't re-pull Shopify.
 */
export async function getOrComputeSkus(deps: AgentDeps): Promise<SkuLive[]> {
  if (deps.cache?.skus) return deps.cache.skus;
  if (!deps.shopifyDomain || !deps.shopifyToken) return [];

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [variants, salesByVariant, leadTimes] = await Promise.all([
    fetchVariantsForOrg(deps.shopifyDomain, deps.shopifyToken),
    fetchSalesByVariant(deps.shopifyDomain, deps.shopifyToken, 90),
    loadTrackedLeadTimes(deps),
  ]);

  // Open POs → variant arrivals (velocity-weighted across same-style siblings).
  const { data: pos } = await deps.db
    .from('purchase_orders')
    .select('id, style_id, units, lead_days, placed_at, status')
    .eq('organization_id', deps.orgId)
    .in('status', ['placed', 'in_production']);
  const styleIds = [...new Set((pos || []).map(p => p.style_id).filter(Boolean))];
  const { data: packs } = styleIds.length
    ? await deps.db.from('tech_packs').select('id, style_name').in('id', styleIds)
    : { data: [] };
  const styleNameById = new Map<string, string>();
  for (const p of packs || []) styleNameById.set(p.id as string, (p.style_name as string) || '');

  const variantsByTitleKey = new Map<string, Array<{ variantId: string; productTitle: string }>>();
  for (const v of variants) {
    const key = v.productTitle.trim().toLowerCase();
    if (!variantsByTitleKey.has(key)) variantsByTitleKey.set(key, []);
    variantsByTitleKey.get(key)!.push({ variantId: v.variantId, productTitle: v.productTitle });
  }

  const velocityById = new Map<string, number>();
  for (const v of variants) velocityById.set(v.variantId, blendedVelocity(salesByVariant[v.variantId] || {}) || 0);

  const arrivalsByVariant: Record<string, { daysFromToday: number; units: number }[]> = {};
  const openPoUnitsByVariant: Record<string, number> = {};
  for (const po of pos || []) {
    if (!po.placed_at) continue;
    const units = Number(po.units) || 0;
    if (units <= 0) continue;
    const placed = new Date(po.placed_at as string); placed.setHours(0, 0, 0, 0);
    const lead = Number(po.lead_days) || 0;
    const landing = new Date(placed); landing.setDate(landing.getDate() + lead);
    const daysFromToday = Math.max(1, Math.round((landing.getTime() - today.getTime()) / 86_400_000));

    const styleName = styleNameById.get(po.style_id as string) || '';
    const key = styleName.trim().toLowerCase();
    let siblings: Array<{ variantId: string }> = [];
    if (key) {
      siblings = variantsByTitleKey.get(key) || [];
      if (!siblings.length) {
        for (const [k, vs] of variantsByTitleKey) {
          if (k.includes(key) || key.includes(k)) { siblings = vs; break; }
        }
      }
    }
    if (!siblings.length) continue;

    const totalV = siblings.reduce((s, sv) => s + (velocityById.get(sv.variantId) || 0), 0);
    const allocations = totalV > 0
      ? siblings.map(sv => ({ vid: sv.variantId, units: units * ((velocityById.get(sv.variantId) || 0) / totalV) }))
      : siblings.map(sv => ({ vid: sv.variantId, units: units / siblings.length }));
    for (const a of allocations) {
      (arrivalsByVariant[a.vid] ??= []).push({ daysFromToday, units: a.units });
      openPoUnitsByVariant[a.vid] = (openPoUnitsByVariant[a.vid] || 0) + a.units;
    }
  }

  const skus: SkuLive[] = variants.map(v => {
    const velocity = velocityById.get(v.variantId) || 0;
    const arrivals = arrivalsByVariant[v.variantId] || [];
    const cover = daysOfCover(velocity || null, v.inventoryQuantity, arrivals);
    return {
      variant_id: v.variantId,
      sku: v.sku,
      product_title: v.productTitle,
      variant_title: v.variantTitle,
      on_hand: v.inventoryQuantity,
      velocity: velocity || null,
      days_of_cover: cover,
      open_po_units: Math.round(openPoUnitsByVariant[v.variantId] || 0),
      tracked: leadTimes.has(v.variantId),
      lead_time_days: leadTimes.get(v.variantId) || 70,
      salesByDay: salesByVariant[v.variantId] || {},
    };
  });

  if (!deps.cache) deps.cache = {};
  deps.cache.skus = skus;
  return skus;
}

// ─── Anthropic call + tool-use loop ─────────────────────────────────────────

type Message = { role: 'user' | 'assistant'; content: unknown };

async function callAnthropic(apiKey: string, body: Record<string, unknown>): Promise<{ content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }> }> {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

/**
 * Run the tool-use loop until Claude returns a text-only response.
 *
 * @param history Prior messages (e.g. Slack thread history converted to
 *                Anthropic message shape, or the daily-briefing seed).
 * @param apiKey  The org's Anthropic API key.
 * @param deps    Database + Shopify creds for tool dispatch.
 */
export async function runAgentTurn(history: Message[], apiKey: string, deps: AgentDeps): Promise<{ text: string; toolCalls: Array<{ name: string; input: unknown; result: unknown }> }> {
  const messages: Message[] = [...history];
  const toolCalls: Array<{ name: string; input: unknown; result: unknown }> = [];

  const system = [{
    type: 'text',
    text: SYSTEM_PROMPT,
    cache_control: { type: 'ephemeral' },
  }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await callAnthropic(apiKey, {
      model: MODEL,
      max_tokens: 1536,
      system,
      tools: TOOLS,
      messages,
    });

    const blocks = Array.isArray(response?.content) ? response.content : [];
    messages.push({ role: 'assistant', content: blocks });

    const toolUses = blocks.filter(b => b.type === 'tool_use');
    if (toolUses.length === 0) {
      const text = blocks.filter(b => b.type === 'text').map(b => b.text || '').join('\n').trim();
      return { text, toolCalls };
    }

    const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];
    for (const t of toolUses) {
      let result: unknown;
      try {
        result = await dispatchTool(t.name as string, (t.input || {}) as Record<string, unknown>, deps);
      } catch (err) {
        result = { error: (err as Error).message };
      }
      toolCalls.push({ name: t.name as string, input: t.input, result });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: t.id as string,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return { text: 'Agent hit the tool-use loop cap. Ask a more specific question.', toolCalls };
}

// ─── Helper: load org credentials ───────────────────────────────────────────

export async function loadAnthropicKey(db: SupabaseClient, orgId: string): Promise<string | null> {
  const { data } = await db
    .from('user_integrations')
    .select('token')
    .eq('org_id', orgId)
    .eq('provider', 'anthropic')
    .maybeSingle();
  return (data?.token as string) || null;
}

export async function loadShopifyCreds(db: SupabaseClient, orgId: string): Promise<{ domain: string; token: string } | null> {
  const { data } = await db
    .from('user_integrations')
    .select('token, metadata')
    .eq('org_id', orgId)
    .eq('provider', 'shopify')
    .maybeSingle();
  const token = (data?.token as string) || '';
  const domain = ((data?.metadata as { domain?: string })?.domain) || '';
  if (!token || !domain) return null;
  return { domain, token };
}

export async function loadInventorySlack(db: SupabaseClient, orgId: string): Promise<{ token: string; channelId: string; teamId?: string } | null> {
  const { data } = await db
    .from('user_integrations')
    .select('token, metadata')
    .eq('org_id', orgId)
    .eq('provider', 'slack_inventory')
    .maybeSingle();
  const token = (data?.token as string) || '';
  const md = (data?.metadata as { channel_id?: string; team_id?: string }) || {};
  if (!token || !md.channel_id) return null;
  return { token, channelId: md.channel_id, teamId: md.team_id };
}

export async function postToSlack(target: { token: string; channelId: string }, text: string, threadTs?: string): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${target.token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel: target.channelId,
      text,
      mrkdwn: true,
      ...(threadTs ? { thread_ts: threadTs } : {}),
    }),
  });
  const j = await res.json();
  return j;
}
