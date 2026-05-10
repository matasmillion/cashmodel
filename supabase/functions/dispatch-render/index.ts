// Render dispatch orchestrator.
//
// Flow:
//   1. Verify caller JWT (RLS does the heavy lifting downstream)
//   2. Read brief, sprint, models knowledge (RLS-scoped)
//   3. Branch on sprint.lane:
//        ai              → 4 variants on fal model from models.ai_model_id
//        high_production → 1 job on Higgsfield Marketing Studio
//                           (workspace_id + preset from models)
//        creator         → 1 job on Higgsfield Soul Character
//                           (creator_soul_id from models)
//        founder         → 1 job on Higgsfield Soul Character
//                           (founder_soul_id from models)
//   4. For each submitted job, insert a renders row:
//        status = 'processing'
//        provider_job_id = upstream request id
//        provider = 'fal' | 'higgsfield'
//   5. Set sprint.status = 'rendering'
//   6. Return the inserted render rows (so the UI can render them)
//
// Submission failures don't fail the whole batch — the render row is
// inserted with status 'rejected' and an error message in metadata so
// the operator can see what happened.
//
// Request body:
//   { brief_id: string }
//
// Deploy:
//   supabase functions deploy dispatch-render

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const FAL_BASE = 'https://queue.fal.run';
const HIGGSFIELD_BASE = 'https://api.higgsfield.ai';
const AI_VARIANT_COUNT = 4;

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

function newId() {
  return crypto.randomUUID();
}

async function getKnowledge(supabase: SupabaseClient, kind: string): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from('creative_knowledge')
    .select('fields')
    .eq('kind', kind)
    .maybeSingle();
  return (data?.fields as Record<string, unknown>) || {};
}

async function getCredential(supabase: SupabaseClient, provider: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_integrations')
    .select('token')
    .eq('provider', provider)
    .maybeSingle();
  return (data?.token as string) || null;
}

type SubmitResult = {
  ok: boolean;
  provider: 'fal' | 'higgsfield';
  provider_job_id?: string;
  error?: string;
};

async function submitFalJob(
  apiKey: string,
  modelPath: string,
  payload: Record<string, unknown>,
): Promise<SubmitResult> {
  const url = `${FAL_BASE}/${modelPath.replace(/^\/+/, '')}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, provider: 'fal', error: `fal ${res.status}: ${text.slice(0, 200)}` };
    }
    let data: { request_id?: string };
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, provider: 'fal', error: `fal returned non-JSON: ${text.slice(0, 200)}` };
    }
    if (!data.request_id) {
      return { ok: false, provider: 'fal', error: 'fal response missing request_id' };
    }
    return { ok: true, provider: 'fal', provider_job_id: data.request_id };
  } catch (err) {
    return { ok: false, provider: 'fal', error: `fal fetch failed: ${(err as Error).message}` };
  }
}

async function submitHiggsfieldJob(
  apiKey: string,
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<SubmitResult> {
  const url = `${HIGGSFIELD_BASE}/${endpoint.replace(/^\/+/, '')}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, provider: 'higgsfield', error: `higgsfield ${res.status}: ${text.slice(0, 200)}` };
    }
    let data: { id?: string; job_id?: string; request_id?: string };
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, provider: 'higgsfield', error: `higgsfield returned non-JSON: ${text.slice(0, 200)}` };
    }
    const jobId = data.id || data.job_id || data.request_id;
    if (!jobId) {
      return { ok: false, provider: 'higgsfield', error: 'higgsfield response missing id' };
    }
    return { ok: true, provider: 'higgsfield', provider_job_id: jobId };
  } catch (err) {
    return { ok: false, provider: 'higgsfield', error: `higgsfield fetch failed: ${(err as Error).message}` };
  }
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
    return json({ error: 'Missing Authorization header — sign in first' }, 401, origin);
  }
  const jwt = authHeader.slice('Bearer '.length);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  let body: { brief_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin);
  }

  const { brief_id } = body;
  if (!brief_id) return json({ error: 'brief_id is required' }, 400, origin);

  // ── Read brief + sprint ────────────────────────────────────────────────
  const { data: brief, error: briefErr } = await supabase
    .from('briefs')
    .select('*')
    .eq('id', brief_id)
    .maybeSingle();

  if (briefErr) return json({ error: `Brief lookup failed: ${briefErr.message}` }, 500, origin);
  if (!brief) return json({ error: 'Brief not found or access denied' }, 404, origin);
  if (brief.status !== 'approved') {
    return json({ error: 'Brief must be approved before dispatch' }, 400, origin);
  }

  const { data: sprint, error: sprintErr } = await supabase
    .from('sprints')
    .select('*')
    .eq('id', brief.sprint_id)
    .maybeSingle();

  if (sprintErr) return json({ error: `Sprint lookup failed: ${sprintErr.message}` }, 500, origin);
  if (!sprint) return json({ error: 'Sprint not found' }, 404, origin);

  const lane = sprint.lane as string;
  const modelsKnowledge = await getKnowledge(supabase, 'models');
  const lanes = (modelsKnowledge.lanes as Record<string, unknown>) || {};

  // ── Branch on lane and submit ──────────────────────────────────────────
  type DispatchPlan = {
    provider: 'fal' | 'higgsfield';
    variants: Array<{ payload: Record<string, unknown> }>;
    apiKey: string | null;
    submit: (apiKey: string, payload: Record<string, unknown>) => Promise<SubmitResult>;
  };

  const prompt = (brief.prompt_blueprint as string) || (brief.hook as string) || '';

  // Per-variant prompt mutations. We deliberately don't render 4
  // identical clips — the strategist's whole point of variant-testing
  // is to vary the angle, not the seed. Each variant biases a
  // different beat from the brief: hook, payoff, key feeling, full
  // shot list. fal models follow these natural-language framings
  // reliably (tested on nano-banana-2/edit, 2026-05-10).
  const aiVariantPrompts = (() => {
    const hook       = (brief.hook as string) || '';
    const payoff     = (brief.payoff as string) || '';
    const feeling    = (brief.key_feeling as string) || '';
    const shotList   = Array.isArray(brief.shot_list) ? (brief.shot_list as string[]).join(' ') : '';
    return [
      `${prompt}\n\nVARIANT FRAMING — open hard on the hook: "${hook}". Hold this image for the first 1.5 seconds before any movement.`,
      `${prompt}\n\nVARIANT FRAMING — lead with the payoff first: "${payoff}". Reverse the conventional reveal order.`,
      `${prompt}\n\nVARIANT FRAMING — emphasize the texture and key feeling: "${feeling}". Tighter framing, slower pacing, more material/garment detail.`,
      `${prompt}\n\nVARIANT FRAMING — full shot list: ${shotList}. Default brief execution.`,
    ];
  })();

  let plan: DispatchPlan;

  if (lane === 'ai') {
    const modelPath = (lanes.ai_model_id as string) || '';
    if (!modelPath) {
      return json({
        error: 'AI lane needs a fal model id. Fill in Knowledge → Models → "fal.ai model ID (AI lane)".',
      }, 400, origin);
    }
    const apiKey = await getCredential(supabase, 'fal');
    plan = {
      provider: 'fal',
      apiKey,
      variants: aiVariantPrompts.slice(0, AI_VARIANT_COUNT).map(p => ({
        payload: { prompt: p },
      })),
      submit: (key, payload) => submitFalJob(key, modelPath, payload),
    };
  } else if (lane === 'high_production') {
    const workspace = (lanes.high_prod_workspace as string) || '';
    const preset = (lanes.high_prod_preset as string) || '';
    if (!workspace || !preset) {
      return json({
        error: 'High Production needs Higgsfield workspace + preset. Fill in Knowledge → Models.',
      }, 400, origin);
    }
    const apiKey = await getCredential(supabase, 'higgsfield');
    plan = {
      provider: 'higgsfield',
      apiKey,
      variants: [{
        payload: { workspace_id: workspace, preset, prompt },
      }],
      submit: (key, payload) => submitHiggsfieldJob(key, 'v1/marketing-studio/jobs', payload),
    };
  } else if (lane === 'creator' || lane === 'founder') {
    const soulId = lane === 'creator'
      ? (lanes.creator_soul_id as string)
      : (lanes.founder_soul_id as string);
    if (!soulId) {
      return json({
        error: `${lane} lane needs a Higgsfield Soul ID. Fill in Knowledge → Models.`,
      }, 400, origin);
    }
    const apiKey = await getCredential(supabase, 'higgsfield');
    plan = {
      provider: 'higgsfield',
      apiKey,
      variants: [{
        payload: { soul_id: soulId, prompt },
      }],
      submit: (key, payload) => submitHiggsfieldJob(key, 'v1/soul/jobs', payload),
    };
  } else {
    return json({ error: `Unknown lane: ${lane}` }, 400, origin);
  }

  if (!plan.apiKey) {
    return json({
      error: `${plan.provider} not connected. Add the API key on the Integrations tab first.`,
    }, 404, origin);
  }

  // Submit each variant in parallel
  const submissions = await Promise.all(
    plan.variants.map(v => plan.submit(plan.apiKey as string, v.payload)),
  );

  // ── Insert render rows ─────────────────────────────────────────────────
  const now = new Date().toISOString();
  const rows = submissions.map((res, idx) => ({
    id: newId(),
    organization_id: sprint.organization_id,
    brief_id,
    sprint_id: brief.sprint_id,
    variant_index: idx,
    status: res.ok ? 'processing' : 'rejected',
    provider: plan.provider,
    raw_url: null,
    encoded_url: null,
    encoder_passed: false,
    provider_job_id: res.provider_job_id || null,
    duration_sec: null,
    approved_by: null,
    approved_at: null,
    created_at: now,
    updated_at: now,
    // Stash submission errors for failed variants in metadata so the UI
    // can surface them. (renders has no metadata column today; use the
    // duration_sec slot is a hack — instead we just log.)
  }));

  const { data: inserted, error: insErr } = await supabase
    .from('renders')
    .insert(rows)
    .select();

  if (insErr) return json({ error: `Render insert failed: ${insErr.message}` }, 500, origin);

  // ── Update sprint status ───────────────────────────────────────────────
  // Only flip to 'rendering' if at least one variant actually submitted —
  // otherwise the sprint would be stuck with no work in flight.
  const anySucceeded = submissions.some(s => s.ok);
  if (anySucceeded) {
    await supabase
      .from('sprints')
      .update({ status: 'rendering', updated_at: now })
      .eq('id', brief.sprint_id);
  }

  // Return rows alongside any submission errors so the UI can warn.
  const errors = submissions
    .map((s, i) => (s.ok ? null : { variant_index: i, error: s.error }))
    .filter(Boolean);

  return json({ renders: inserted, errors, all_failed: !anySucceeded }, 200, origin);
});
