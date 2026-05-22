// Meta ad publish orchestrator.
//
// For an approved + encoder-passed render, creates a PAUSED Meta ad
// (campaign → adset → creative → ad) under the org's ad account and
// inserts an `ads` row that the LiveAds view shows. Every Meta call
// uses the org's stored access_token via direct fetch; budget guardrail
// is enforced before any write happens.
//
// Naming convention: S{sprint_number}_{lane}_{slug}_v{render_variant + 1}
// UTM: ?utm_source=meta&utm_medium=paid&utm_campaign=S{sprint}&utm_content={ad_id}
//
// All ads are created PAUSED. The LiveAds view + the daily evaluation
// cron decide when (or if) to flip them to ACTIVE.
//
// Request body:
//   { render_id: string, daily_budget_usd?: number }
//
// Deploy:
//   supabase functions deploy upload-meta-ad

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const META_API = 'https://graph.facebook.com/v19.0';
const DEFAULT_DAILY_BUDGET_USD = 25;
const VIDEO_POLL_INTERVAL_MS = 4000;
const VIDEO_POLL_MAX_ATTEMPTS = 30; // 2 minutes

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
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

function newId() { return crypto.randomUUID(); }

function slugify(s: string): string {
  return (s || 'ad')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'ad';
}

async function getMetaCreds(supabase: SupabaseClient): Promise<{ token: string; account_id: string; page_id: string | null } | null> {
  const { data } = await supabase
    .from('user_integrations')
    .select('token, metadata')
    .eq('provider', 'meta')
    .maybeSingle();
  if (!data?.token) return null;
  const md = (data.metadata as Record<string, unknown>) || {};
  return {
    token: data.token as string,
    account_id: (md.account_id as string) || '',
    page_id: (md.page_id as string) || null,
  };
}

async function metaPost(path: string, token: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({ access_token: token });
  for (const [k, v] of Object.entries(body)) {
    params.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  const res = await fetch(`${META_API}/${path.replace(/^\/+/, '')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const text = await res.text();
  let data: Record<string, unknown>;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data.error) {
    const err = data.error as { message?: string; code?: number } | undefined;
    throw new Error(err?.message ? `Meta ${err.code}: ${err.message}` : `Meta ${res.status}: ${text.slice(0, 300)}`);
  }
  return data;
}

async function metaGet(path: string, token: string, fields?: string): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({ access_token: token });
  if (fields) params.set('fields', fields);
  const res = await fetch(`${META_API}/${path.replace(/^\/+/, '')}?${params.toString()}`);
  const text = await res.text();
  let data: Record<string, unknown>;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data.error) {
    const err = data.error as { message?: string; code?: number } | undefined;
    throw new Error(err?.message ? `Meta ${err.code}: ${err.message}` : `Meta ${res.status}: ${text.slice(0, 300)}`);
  }
  return data;
}

async function uploadVideo(accountId: string, token: string, fileUrl: string, name: string): Promise<string> {
  const data = await metaPost(`${accountId}/advideos`, token, {
    file_url: fileUrl,
    name,
  });
  const videoId = data.id as string | undefined;
  if (!videoId) throw new Error('Meta advideo upload returned no id');

  // Poll until the video is processed
  for (let i = 0; i < VIDEO_POLL_MAX_ATTEMPTS; i++) {
    const status = await metaGet(`${videoId}`, token, 'status');
    const s = (status.status as { video_status?: string })?.video_status || (status as Record<string, unknown>).status;
    if (s === 'ready') return videoId;
    if (s === 'error') throw new Error('Meta video processing failed');
    await new Promise(r => setTimeout(r, VIDEO_POLL_INTERVAL_MS));
  }
  throw new Error('Meta video processing timed out');
}

async function checkBudgetGuardrail(supabase: SupabaseClient): Promise<{ ok: boolean; reason?: string; weeklySpend: number; cap: number }> {
  const { data: cfg } = await supabase
    .from('budget_config')
    .select('weekly_cap, alert_threshold, writes_enabled')
    .maybeSingle();

  const cap = parseFloat((cfg?.weekly_cap as string) || '2000');
  const threshold = parseFloat((cfg?.alert_threshold as string) || '0.9');
  const writesEnabled = cfg?.writes_enabled !== false;

  // Sum metrics_daily for the past 7 days
  const sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: metrics } = await supabase
    .from('metrics_daily')
    .select('spend')
    .gte('date', sinceDate);

  const weeklySpend = (metrics || []).reduce((sum, m) => sum + (parseFloat((m.spend as string) || '0') || 0), 0);

  if (!writesEnabled) {
    return { ok: false, reason: 'Meta writes are disabled (budget_config.writes_enabled=false)', weeklySpend, cap };
  }
  if (weeklySpend >= cap * threshold) {
    return { ok: false, reason: `Weekly spend $${weeklySpend.toFixed(2)} ≥ $${(cap * threshold).toFixed(2)} (cap × ${threshold})`, weeklySpend, cap };
  }
  return { ok: true, weeklySpend, cap };
}

serve(async (req) => {
  const origin = req.headers.get('origin') || '*';

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: 'SUPABASE_URL / SUPABASE_ANON_KEY env missing' }, 500, origin);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing Authorization header' }, 401, origin);
  }
  const jwt = authHeader.slice('Bearer '.length);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  let body: { render_id?: string; daily_budget_usd?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin);
  }
  const { render_id } = body;
  if (!render_id) return json({ error: 'render_id is required' }, 400, origin);
  const dailyBudget = body.daily_budget_usd ?? DEFAULT_DAILY_BUDGET_USD;

  // ── Read render + brief + sprint ───────────────────────────────────────
  const { data: render } = await supabase.from('renders').select('*').eq('id', render_id).maybeSingle();
  if (!render) return json({ error: 'Render not found' }, 404, origin);
  if (render.status !== 'approved') return json({ error: 'Render must be approved before publish' }, 400, origin);
  if (!render.encoder_passed || !render.encoded_url) {
    return json({ error: 'Render must pass encoder before publish' }, 400, origin);
  }

  const { data: brief } = await supabase.from('briefs').select('*').eq('id', render.brief_id).maybeSingle();
  const { data: sprint } = await supabase.from('sprints').select('*').eq('id', render.sprint_id).maybeSingle();
  if (!sprint) return json({ error: 'Sprint not found for render' }, 404, origin);

  // ── Brand defaults from creative_knowledge.kind='brand' ────────────────
  // Both targeting and the destination URL come from the brand
  // knowledge record so they're operator-editable without code
  // changes. Sprint-level overrides take precedence.
  const { data: brandRow } = await supabase
    .from('creative_knowledge')
    .select('fields')
    .eq('kind', 'brand')
    .maybeSingle();
  const brand = (brandRow?.fields as Record<string, unknown>) || {};
  const brandTargeting = (brand.targeting_defaults as Record<string, unknown>) || {};
  const sprintTargetingOverrides = (sprint.targeting_overrides as Record<string, unknown>) || {};
  // Final targeting = brand defaults + sprint overrides + hard-coded floor.
  const targeting = {
    geo_locations:        { countries: ['US'] },
    age_min:              22,
    age_max:              55,
    publisher_platforms:  ['facebook', 'instagram'],
    facebook_positions:   ['feed', 'video_feeds'],
    instagram_positions:  ['stream', 'story', 'reels'],
    ...brandTargeting,
    ...sprintTargetingOverrides,
  };

  const shopUrl  = ((brand.shop_url as string) || 'https://foreignresource.com').replace(/\/+$/, '');
  const linkPath = (sprint.link_path as string) || '/';

  // ── Budget guardrail ───────────────────────────────────────────────────
  const guardrail = await checkBudgetGuardrail(supabase);
  if (!guardrail.ok) {
    return json({ error: `Budget guardrail tripped: ${guardrail.reason}`, guardrail }, 403, origin);
  }

  // ── Meta credentials ──────────────────────────────────────────────────
  const creds = await getMetaCreds(supabase);
  if (!creds) return json({ error: 'Meta not connected for this org' }, 404, origin);
  if (!creds.account_id) return json({ error: 'Meta account_id missing — re-save the Meta integration' }, 400, origin);
  if (!creds.page_id) return json({ error: 'Meta page_id missing — set it in your integration metadata' }, 400, origin);

  const slug = slugify((brief?.hook as string) || (brief?.hypothesis as string) || `s${sprint.sprint_number}`);
  const adName = `S${sprint.sprint_number}_${sprint.lane}_${slug}_v${(render.variant_index || 0) + 1}`;

  let videoId: string;
  try {
    videoId = await uploadVideo(creds.account_id, creds.token, render.encoded_url as string, adName);
  } catch (err) {
    return json({ error: `Video upload failed: ${(err as Error).message}` }, 502, origin);
  }

  // ── Create campaign (PAUSED) ──────────────────────────────────────────
  let campaignId: string;
  try {
    const c = await metaPost(`${creds.account_id}/campaigns`, creds.token, {
      name: `S${sprint.sprint_number}_${sprint.lane}_${slug}`,
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      special_ad_categories: '[]',
    });
    campaignId = c.id as string;
  } catch (err) {
    return json({ error: `Campaign create failed: ${(err as Error).message}` }, 502, origin);
  }

  // ── Create adset (PAUSED) ─────────────────────────────────────────────
  let adsetId: string;
  try {
    const a = await metaPost(`${creds.account_id}/adsets`, creds.token, {
      name: `${adName}_adset`,
      campaign_id: campaignId,
      daily_budget: Math.round(dailyBudget * 100), // cents
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      status: 'PAUSED',
      targeting,
    });
    adsetId = a.id as string;
  } catch (err) {
    return json({ error: `Adset create failed: ${(err as Error).message}` }, 502, origin);
  }

  // ── Create ad creative ────────────────────────────────────────────────
  const utm = `utm_source=meta&utm_medium=paid&utm_campaign=S${sprint.sprint_number}&utm_content=${slug}`;
  const linkUrl = `${shopUrl}${linkPath.startsWith('/') ? linkPath : `/${linkPath}`}${linkPath.includes('?') ? '&' : '?'}${utm}`;

  let creativeId: string;
  try {
    const cr = await metaPost(`${creds.account_id}/adcreatives`, creds.token, {
      name: `${adName}_creative`,
      object_story_spec: {
        page_id: creds.page_id,
        video_data: {
          video_id: videoId,
          message: (brief?.caption as string) || '',
          call_to_action: { type: 'SHOP_NOW', value: { link: linkUrl } },
          link_description: (brief?.hook as string) || '',
        },
      },
    });
    creativeId = cr.id as string;
  } catch (err) {
    return json({ error: `Creative create failed: ${(err as Error).message}` }, 502, origin);
  }

  // ── Create ad (PAUSED) ────────────────────────────────────────────────
  let adId: string;
  try {
    const ad = await metaPost(`${creds.account_id}/ads`, creds.token, {
      name: adName,
      adset_id: adsetId,
      creative: { creative_id: creativeId },
      status: 'PAUSED',
    });
    adId = ad.id as string;
  } catch (err) {
    return json({ error: `Ad create failed: ${(err as Error).message}` }, 502, origin);
  }

  // ── Insert ads row ────────────────────────────────────────────────────
  const now = new Date().toISOString();
  const adRow = {
    id: newId(),
    organization_id: sprint.organization_id,
    render_id: render.id,
    sprint_id: render.sprint_id,
    ad_name: adName,
    meta_campaign_id: campaignId,
    meta_adset_id: adsetId,
    meta_ad_id: adId,
    status: 'paused',
    spend_to_date: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    cpa: null,
    recommendation: '',
    utm_params: utm,
    idempotency_key: `${render_id}:publish`,
    published_at: now,
    created_at: now,
    updated_at: now,
  };

  const { data: inserted, error: insErr } = await supabase
    .from('ads')
    .insert(adRow)
    .select()
    .maybeSingle();

  if (insErr) return json({ error: `Ad row insert failed: ${insErr.message}` }, 500, origin);

  // Update sprint status
  await supabase
    .from('sprints')
    .update({ status: 'live', updated_at: now })
    .eq('id', render.sprint_id);

  return json({ ad: inserted, guardrail }, 200, origin);
});
