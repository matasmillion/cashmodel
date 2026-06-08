// Inventory agent — daily morning briefing.
//
// Triggered by pg_cron at 9 AM America/New_York (see
// supabase/migrations/20260608000000_inventory_agent_cron.sql).
//
// For each org with a slack_inventory integration connected:
//   1. Load Anthropic + Shopify creds.
//   2. Pre-compute the daily context bundle (at-risk tracked variants,
//      top-10 sellers by 90d revenue, open POs landing in next 30d,
//      last 7d of inventory agent_interactions).
//   3. Seed the agent with the bundle and ask for the morning briefing
//      following the MORNING BRIEFING FORMAT in the system prompt.
//   4. Post the result to the org's inventory Slack channel.
//   5. Append an agent_interactions row with source='inventory-daily'.
//
// Auth modes:
//   - x-cron-secret header from pg_cron (service-role, all orgs).
//   - Authorization: Bearer <JWT> from a signed-in user → run for that
//     user's org only (smoke test / manual re-run).
//
// Env vars:
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//   CRON_SECRET
//   SHOPIFY_API_VERSION (optional, default '2024-01')
//
// Deploy:
//   supabase functions deploy inventory-agent-daily

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  runAgentTurn,
  getOrComputeSkus,
  loadAnthropicKey,
  loadShopifyCreds,
  loadInventorySlack,
  postToSlack,
  AgentDeps,
  SkuLive,
} from '../_shared/inventoryAgentCore.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CRON_SECRET = Deno.env.get('CRON_SECRET');

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

// ─── Bundle construction ────────────────────────────────────────────────────

type Bundle = {
  date: string;
  at_risk: Array<{ sku: string; product: string; on_hand: number; cover: number | null; lead_time: number; verdict: string }>;
  top_sellers: Array<{ sku: string; product: string; velocity: number; on_hand: number }>;
  pos_landing_30d: Array<{ code: string; style_id: string; units: number; expected_landing: string; status: string }>;
  recent_alerts: Array<{ date: string; source: string; value: string; summary: string }>;
};

function classifyAtRisk(sku: SkuLive): string {
  if (sku.on_hand === 0) return 'STOCKOUT — restock immediately';
  if ((sku.days_of_cover ?? Infinity) <= sku.lead_time_days) return 'URGENT — will stock out before reorder lands';
  return 'Order now to avoid stockout';
}

async function buildBundle(deps: AgentDeps): Promise<Bundle> {
  const all = await getOrComputeSkus(deps);
  const tracked = all.filter(s => s.tracked);

  const atRisk = tracked
    .map(s => {
      const threshold = s.lead_time_days + ALERT_BUFFER_DAYS;
      const cover = s.days_of_cover;
      const flag = cover != null && cover <= threshold;
      return flag ? {
        sku: s.sku,
        product: `${s.product_title}${s.variant_title && s.variant_title !== 'Default Title' ? ` · ${s.variant_title}` : ''}`,
        on_hand: s.on_hand,
        cover,
        lead_time: s.lead_time_days,
        verdict: classifyAtRisk(s),
      } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => (a.cover ?? 999) - (b.cover ?? 999));

  // Top 10 by ~90d revenue — we don't have retail price here so proxy by
  // velocity (units/day) × on_hand floor of 1. The morning briefing will
  // show top 3.
  const topSellers = [...all]
    .filter(s => (s.velocity || 0) > 0)
    .sort((a, b) => (b.velocity || 0) - (a.velocity || 0))
    .slice(0, 10)
    .map(s => ({
      sku: s.sku,
      product: `${s.product_title}${s.variant_title && s.variant_title !== 'Default Title' ? ` · ${s.variant_title}` : ''}`,
      velocity: Number((s.velocity || 0).toFixed(2)),
      on_hand: s.on_hand,
    }));

  // POs landing in next 30 days
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const horizon = new Date(today); horizon.setDate(horizon.getDate() + 30);
  const { data: posRaw } = await deps.db
    .from('purchase_orders')
    .select('code, style_id, units, lead_days, placed_at, status')
    .eq('organization_id', deps.orgId)
    .in('status', ['placed', 'in_production']);
  const posLanding = (posRaw || [])
    .map(po => {
      let landing: Date | null = null;
      if (po.placed_at && po.lead_days != null) {
        landing = new Date(po.placed_at as string);
        landing.setDate(landing.getDate() + Number(po.lead_days));
      }
      if (!landing) return null;
      if (landing < today || landing > horizon) return null;
      return {
        code: po.code as string,
        style_id: po.style_id as string,
        units: Number(po.units) || 0,
        expected_landing: landing.toISOString().slice(0, 10),
        status: po.status as string,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => a.expected_landing.localeCompare(b.expected_landing));

  // Recent inventory-agent alerts (last 7d)
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: alerts } = await deps.db
    .from('agent_interactions')
    .select('source, value, payload, created_at')
    .eq('action_id', deps.orgId)
    .like('source', 'inventory%')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);
  const recentAlerts = (alerts || []).map(a => ({
    date: (a.created_at as string).slice(0, 10),
    source: a.source as string,
    value: a.value as string,
    summary: summarizePayload(a.payload as Record<string, unknown> | null),
  }));

  return {
    date: today.toISOString().slice(0, 10),
    at_risk: atRisk,
    top_sellers: topSellers,
    pos_landing_30d: posLanding,
    recent_alerts: recentAlerts,
  };
}

function summarizePayload(p: Record<string, unknown> | null): string {
  if (!p) return '';
  const arc = p.at_risk_count;
  if (typeof arc === 'number') return `${arc} at-risk variants flagged`;
  if (typeof p.summary === 'string') return p.summary.slice(0, 200);
  return '';
}

// ─── Per-org evaluation ─────────────────────────────────────────────────────

async function runForOrg(adminDb: SupabaseClient, orgId: string): Promise<{ posted: boolean; error?: string; at_risk_count?: number; tokens_used?: number }> {
  const slack = await loadInventorySlack(adminDb, orgId);
  if (!slack) return { posted: false, error: 'slack_inventory not connected' };

  const anthropicKey = await loadAnthropicKey(adminDb, orgId);
  if (!anthropicKey) return { posted: false, error: 'anthropic not connected' };

  const shopify = await loadShopifyCreds(adminDb, orgId);
  if (!shopify) return { posted: false, error: 'shopify not connected' };

  const deps: AgentDeps = {
    db: adminDb,
    orgId,
    shopifyDomain: shopify.domain,
    shopifyToken: shopify.token,
  };

  let bundle: Bundle;
  try {
    bundle = await buildBundle(deps);
  } catch (err) {
    return { posted: false, error: `bundle: ${(err as Error).message}` };
  }

  const seed = [
    {
      role: 'user' as const,
      content: `## Morning briefing — ${bundle.date}

Here is your pre-loaded context bundle. Write the morning post for #inventory now, following the MORNING BRIEFING FORMAT in your system prompt.

Bundle (JSON):
\`\`\`
${JSON.stringify(bundle, null, 2)}
\`\`\`

Reminder: do not call query_skus_live; the bundle already contains the at-risk and top-seller data. Only call tools if the bundle is missing information you need.`,
    },
  ];

  let text: string;
  let toolCalls: unknown[];
  try {
    const result = await runAgentTurn(seed, anthropicKey, deps);
    text = result.text;
    toolCalls = result.toolCalls;
  } catch (err) {
    return { posted: false, error: `claude: ${(err as Error).message}` };
  }

  if (!text) return { posted: false, error: 'agent returned empty text' };

  const slackResp = await postToSlack(slack, text);
  const posted = Boolean(slackResp.ok);

  await adminDb.from('agent_interactions').insert({
    source: 'inventory-daily',
    action_id: orgId,
    value: posted ? 'posted' : 'slack_failed',
    payload: {
      date: bundle.date,
      at_risk_count: bundle.at_risk.length,
      top_seller_count: bundle.top_sellers.length,
      pos_landing_30d: bundle.pos_landing_30d.length,
      slack_ts: slackResp.ts,
      slack_error: slackResp.error,
      tool_calls: toolCalls,
      summary: text.slice(0, 300),
    },
  });

  return { posted, at_risk_count: bundle.at_risk.length };
}

// ─── Entry ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  const origin = req.headers.get('origin') || '*';
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: 'SUPABASE_URL / SUPABASE_ANON_KEY env missing' }, 500, origin);
  }

  const cronSecret = req.headers.get('x-cron-secret');
  const isCron = cronSecret && CRON_SECRET && cronSecret === CRON_SECRET;

  let orgIds: string[] = [];
  let adminDb: SupabaseClient;

  if (isCron) {
    if (!SERVICE_ROLE_KEY) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing' }, 500, origin);
    adminDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    // Every org that has the inventory bot connected gets a briefing.
    const { data } = await adminDb
      .from('user_integrations')
      .select('org_id')
      .eq('provider', 'slack_inventory');
    orgIds = [...new Set((data || []).map(r => r.org_id as string))];
  } else {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing Authorization header (or x-cron-secret)' }, 401, origin);
    }
    if (!SERVICE_ROLE_KEY) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing' }, 500, origin);
    const jwt = authHeader.slice('Bearer '.length);
    // RLS-scoped lookup just to find the caller's org.
    const rls = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data } = await rls.from('user_integrations').select('org_id').eq('provider', 'slack_inventory').maybeSingle();
    if (!data?.org_id) return json({ ok: true, message: 'No slack_inventory connected for caller' }, 200, origin);
    orgIds = [data.org_id as string];
    // Heavy reads still use service role (cross-table joins where RLS would be in the way).
    adminDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  }

  const summary: Record<string, unknown> = {};
  for (const orgId of orgIds) {
    try {
      summary[orgId] = await runForOrg(adminDb, orgId);
    } catch (err) {
      summary[orgId] = { posted: false, error: (err as Error).message };
    }
  }

  return json({ ok: true, summary }, 200, origin);
});
