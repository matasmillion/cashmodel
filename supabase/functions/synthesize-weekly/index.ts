// Weekly synthesis cron.
//
// Triggered Sunday 6pm ET by pg_cron. For each org with at least one
// sprint that closed in the last 7 days:
//   1. Aggregate metrics across the sprint's ads
//   2. Read last 10 finalized discussions for voice consistency
//   3. Call Anthropic to generate a synthesis_draft
//   4. Insert a discussions row with finalized=false
//   5. (Optional) Post Slack DM with [Discuss] button
//
// Auth model identical to evaluate-daily: cron path uses CRON_SECRET +
// service role; user-triggered path uses their JWT + RLS.
//
// Deploy:
//   supabase functions deploy synthesize-weekly

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CRON_SECRET = Deno.env.get('CRON_SECRET');
const APP_BASE_URL = Deno.env.get('APP_BASE_URL') || '';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const SLACK_API = 'https://slack.com/api/chat.postMessage';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2048;

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

async function getCredential(db: SupabaseClient, orgId: string, provider: string): Promise<string | null> {
  const { data } = await db
    .from('user_integrations')
    .select('token')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .maybeSingle();
  return (data?.token as string) || null;
}

async function getSlackTarget(db: SupabaseClient, orgId: string): Promise<{ token: string; channel: string } | null> {
  const { data } = await db
    .from('user_integrations')
    .select('token, metadata')
    .eq('org_id', orgId)
    .eq('provider', 'slack')
    .maybeSingle();
  const token = (data?.token as string) || '';
  const md = (data?.metadata as Record<string, unknown>) || {};
  const channel = (md.channel_id as string) || '';
  if (!token || !channel) return null;
  return { token, channel };
}

async function postDiscussionToSlack(target: { token: string; channel: string }, opts: {
  sprintNumber: string | number;
  discussionId: string;
  preview: string;
}): Promise<void> {
  const url = APP_BASE_URL ? `${APP_BASE_URL.replace(/\/+$/, '')}/#creative-engine/learnings/${opts.discussionId}` : null;
  const previewText = opts.preview.replace(/\s+/g, ' ').slice(0, 280);
  const blocks: Record<string, unknown>[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Sprint S${opts.sprintNumber} — weekly synthesis*\n\n_${previewText}${opts.preview.length > 280 ? '…' : ''}_` },
    },
  ];
  if (url) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Discuss & finalize' },
          url,
          style: 'primary',
        },
      ],
    });
  }
  try {
    const res = await fetch(SLACK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${target.token}`,
      },
      body: JSON.stringify({
        channel: target.channel,
        text: `Weekly synthesis ready for sprint S${opts.sprintNumber}`,
        blocks,
      }),
    });
    if (!res.ok) {
      console.warn('synthesize-weekly slack post failed:', res.status, await res.text());
    } else {
      const j = await res.json();
      if (!j.ok) console.warn('synthesize-weekly slack api error:', j.error);
    }
  } catch (err) {
    console.warn('synthesize-weekly slack post threw:', err);
  }
}

async function callAnthropic(apiKey: string, system: string, prompt: string): Promise<string> {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  return data?.content?.[0]?.text || '';
}

async function synthesizeForOrg(db: SupabaseClient, orgId: string): Promise<{ discussion_id?: string; sprint_id: string; error?: string }[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: closedSprints } = await db
    .from('sprints')
    .select('id, sprint_number, lane, hypothesis_type, constraint_text, closed_at')
    .eq('organization_id', orgId)
    .eq('status', 'closed')
    .gte('closed_at', since);

  if (!closedSprints?.length) return [];

  const apiKey = await getCredential(db, orgId, 'anthropic');
  if (!apiKey) return closedSprints.map(s => ({ sprint_id: s.id as string, error: 'Anthropic not connected' }));

  const slackTarget = await getSlackTarget(db, orgId);
  const results: { discussion_id?: string; sprint_id: string; error?: string }[] = [];

  // Voice-consistency context: last 10 finalized discussions
  const { data: priorDiscussions } = await db
    .from('discussions')
    .select('final_text')
    .eq('organization_id', orgId)
    .eq('finalized', true)
    .order('finalized_at', { ascending: false })
    .limit(10);

  const voiceContext = (priorDiscussions || [])
    .map(d => d.final_text)
    .filter(Boolean)
    .join('\n---\n')
    .slice(0, 8000);

  for (const sprint of closedSprints) {
    // Aggregate ad metrics for this sprint
    const { data: sprintAds } = await db
      .from('ads')
      .select('id, ad_name, spend_to_date, impressions, clicks, conversions, cpa, status')
      .eq('sprint_id', sprint.id);

    const adsSummary = (sprintAds || [])
      .map(a => `- ${a.ad_name}: $${a.spend_to_date} spend, ${a.impressions} impr, ${a.clicks} clicks, ${a.conversions} conv, CPA ${a.cpa ? '$' + a.cpa : '—'}, status ${a.status}`)
      .join('\n');

    const systemPrompt = `You are the FR creative learning agent. Each week you read closed sprint metrics and write a single concise paragraph capturing what worked, what didn't, and what to try next. Voice should match prior finalized learnings — direct, no fluff, brand-aware. Output a short paragraph (2-4 sentences), nothing else.`;

    const userPrompt = `## Sprint S${sprint.sprint_number}
Lane: ${sprint.lane}
Hypothesis type: ${sprint.hypothesis_type || 'open'}
Constraint: ${sprint.constraint_text || 'none'}

## Ad performance
${adsSummary || '(no ads)'}

## Prior finalized learnings (voice reference)
${voiceContext || '(none yet)'}

Write the synthesis paragraph now.`;

    let synthesis: string;
    try {
      synthesis = await callAnthropic(apiKey, systemPrompt, userPrompt);
    } catch (err) {
      results.push({ sprint_id: sprint.id as string, error: (err as Error).message });
      continue;
    }

    const now = new Date().toISOString();
    const newId = crypto.randomUUID();
    const { error: insErr } = await db
      .from('discussions')
      .insert({
        id: newId,
        organization_id: orgId,
        sprint_id: sprint.id,
        synthesis_draft: synthesis,
        final_text: synthesis,
        finalized: false,
        messages: [],
        created_at: now,
        updated_at: now,
      });

    if (insErr) {
      results.push({ sprint_id: sprint.id as string, error: insErr.message });
    } else {
      results.push({ discussion_id: newId, sprint_id: sprint.id as string });
      if (slackTarget) {
        await postDiscussionToSlack(slackTarget, {
          sprintNumber: sprint.sprint_number as string | number,
          discussionId: newId,
          preview: synthesis,
        });
      }
    }
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
    const { data: orgs } = await db.from('organizations').select('id');
    const summary: Record<string, unknown> = {};
    for (const org of orgs || []) {
      summary[org.id as string] = await synthesizeForOrg(db, org.id as string);
    }
    return json({ ok: true, summary }, 200, origin);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing Authorization header (or x-cron-secret)' }, 401, origin);
  }
  const jwt = authHeader.slice('Bearer '.length);
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: oneSprint } = await db.from('sprints').select('organization_id').limit(1).maybeSingle();
  const orgId = oneSprint?.organization_id as string | undefined;
  if (!orgId) return json({ ok: true, message: 'No sprints to synthesize' }, 200, origin);

  const results = await synthesizeForOrg(db, orgId);
  return json({ ok: true, results }, 200, origin);
});
