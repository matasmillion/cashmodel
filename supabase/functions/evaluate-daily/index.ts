// Daily evaluation cron.
//
// Triggered by pg_cron at 9am ET (set up in the pg_cron migration).
// For each org with active ads:
//   1. Pull yesterday's Meta insights (spend, impressions, clicks, conversions)
//   2. Insert metrics_daily rows (idempotent via UNIQUE(ad_id, date))
//   3. Apply kill / scale thresholds → update ads.recommendation
//   4. Optionally post Slack digest (if Slack connected)
//
// Auth: this function is callable two ways:
//   • From the cron job with header `x-cron-secret: <CRON_SECRET>`
//     (uses service-role client to operate across all orgs)
//   • From a signed-in user with `Authorization: Bearer <JWT>` to
//     manually trigger a re-evaluate (uses RLS on their org only)
//
// Env vars:
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY  (for cron path)
//   CRON_SECRET               (shared with pg_cron — set in dashboard)
//
// Deploy:
//   supabase functions deploy evaluate-daily

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CRON_SECRET = Deno.env.get('CRON_SECRET');
const META_API = 'https://graph.facebook.com/v19.0';

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

function yesterdayDate(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

type MetricsRow = {
  spend: string;
  impressions: string;
  clicks: string;
  actions?: Array<{ action_type: string; value: string }>;
};

async function fetchAdInsights(token: string, adMetaId: string, date: string): Promise<MetricsRow | null> {
  const params = new URLSearchParams({
    access_token: token,
    fields: 'spend,impressions,clicks,actions',
    time_range: JSON.stringify({ since: date, until: date }),
  });
  const url = `${META_API}/${adMetaId}/insights?${params.toString()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.data?.[0] as MetricsRow) || null;
  } catch {
    return null;
  }
}

function computeRecommendation(
  cpa: number | null,
  cpaTarget: number | null,
  killMult: number,
  scaleThresh: number,
  impressions: number,
): string {
  if (cpa == null || cpaTarget == null) return '';
  if (impressions >= 100 && cpa > cpaTarget * killMult) return 'kill';
  if (impressions >= 200 && cpa < cpaTarget * scaleThresh) return 'scale';
  return '';
}

async function evaluateForOrg(
  db: SupabaseClient,
  orgId: string,
): Promise<{ ad_id: string; date: string; updated: boolean; recommendation: string }[]> {
  // Get Meta token for this org
  const { data: integration } = await db
    .from('user_integrations')
    .select('token')
    .eq('org_id', orgId)
    .eq('provider', 'meta')
    .maybeSingle();
  if (!integration?.token) return [];

  // Get active or paused ads (we still pull insights for paused — they
  // may have spent for a few hours before kill)
  const { data: ads } = await db
    .from('ads')
    .select('id, meta_ad_id, sprint_id, organization_id')
    .eq('organization_id', orgId)
    .in('status', ['active', 'scaled', 'paused', 'killed']);
  if (!ads?.length) return [];

  // Sprint-level kill_multiplier + cpa_target
  const sprintIds = [...new Set(ads.map(a => a.sprint_id))];
  const { data: sprints } = await db
    .from('sprints')
    .select('id, kill_multiplier, scale_threshold, cpa_target')
    .in('id', sprintIds);
  const sprintMap: Record<string, { kill_multiplier: number; scale_threshold: number; cpa_target: number | null }> = {};
  (sprints || []).forEach(s => { sprintMap[s.id] = s as never; });

  const date = yesterdayDate();
  const results: { ad_id: string; date: string; updated: boolean; recommendation: string }[] = [];

  for (const ad of ads) {
    if (!ad.meta_ad_id) continue;
    const insight = await fetchAdInsights(integration.token as string, ad.meta_ad_id as string, date);
    if (!insight) continue;

    const spend = parseFloat(insight.spend || '0');
    const impressions = parseInt(insight.impressions || '0', 10);
    const clicks = parseInt(insight.clicks || '0', 10);
    const conversions = (insight.actions || [])
      .filter(a => /purchase|complete_registration|lead/i.test(a.action_type))
      .reduce((sum, a) => sum + parseInt(a.value, 10), 0);
    const cpa = conversions > 0 ? spend / conversions : null;
    const ctr = impressions > 0 ? clicks / impressions : null;

    // Insert metrics_daily (idempotent via UNIQUE constraint)
    await db
      .from('metrics_daily')
      .upsert({
        organization_id: ad.organization_id,
        ad_id: ad.id,
        date,
        spend,
        impressions,
        clicks,
        conversions,
        cpa,
        ctr,
      }, { onConflict: 'ad_id,date' });

    // Apply thresholds + write recommendation
    const sprint = sprintMap[ad.sprint_id] || { kill_multiplier: 1.5, scale_threshold: 0.7, cpa_target: null };
    const recommendation = computeRecommendation(
      cpa,
      sprint.cpa_target,
      sprint.kill_multiplier || 1.5,
      sprint.scale_threshold || 0.7,
      impressions,
    );

    await db
      .from('ads')
      .update({
        spend_to_date: spend,
        impressions,
        clicks,
        conversions,
        cpa,
        recommendation,
      })
      .eq('id', ad.id);

    results.push({ ad_id: ad.id, date, updated: true, recommendation });
  }

  return results;
}

serve(async (req) => {
  const origin = req.headers.get('origin') || '*';

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: 'SUPABASE_URL / SUPABASE_ANON_KEY env missing' }, 500, origin);
  }

  const cronSecret = req.headers.get('x-cron-secret');
  const isCron = cronSecret && CRON_SECRET && cronSecret === CRON_SECRET;

  if (isCron) {
    if (!SERVICE_ROLE_KEY) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing' }, 500, origin);
    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    // List all orgs with at least one ads row
    const { data: orgs } = await db.from('ads').select('organization_id');
    const uniqueOrgs = [...new Set((orgs || []).map(r => r.organization_id))];
    const summary: Record<string, { ads_evaluated: number }> = {};
    for (const orgId of uniqueOrgs) {
      const r = await evaluateForOrg(db, orgId);
      summary[orgId] = { ads_evaluated: r.length };
    }
    return json({ ok: true, summary }, 200, origin);
  }

  // User-triggered manual run — use their JWT, RLS scopes to their org
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing Authorization header (or x-cron-secret)' }, 401, origin);
  }
  const jwt = authHeader.slice('Bearer '.length);
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  // For user trigger, find their org via RLS-scoped query
  const { data: oneAd } = await db.from('ads').select('organization_id').limit(1).maybeSingle();
  const orgId = oneAd?.organization_id as string | undefined;
  if (!orgId) return json({ ok: true, message: 'No ads to evaluate' }, 200, origin);

  // For user trigger, call the same eval but pass the user-scoped client
  const results = await evaluateForOrg(db, orgId);
  return json({ ok: true, ads_evaluated: results.length, results }, 200, origin);
});
