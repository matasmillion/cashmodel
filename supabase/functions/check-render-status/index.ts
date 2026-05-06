// Render status poller.
//
// Looks at a renders row in `processing` state, asks the upstream
// provider whether the job is done, and updates the row when it is.
//
// Called by the UI (RenderQueue / Production views) on a timer for any
// render still in `processing`. Idempotent — safe to call repeatedly.
//
// Request body:
//   { render_id: string }
//
// Response:
//   { render: <updated row> }
//
// Deploy:
//   supabase functions deploy check-render-status

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const FAL_BASE = 'https://queue.fal.run';
const HIGGSFIELD_BASE = 'https://api.higgsfield.ai';

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

async function getCredential(supabase: SupabaseClient, provider: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_integrations')
    .select('token')
    .eq('provider', provider)
    .maybeSingle();
  return (data?.token as string) || null;
}

// Walk a possibly-nested JSON object looking for the first string that
// looks like a video / image URL. Different fal models return result
// shapes that vary slightly (e.g. { video: { url } }, { videos: [{ url }] }),
// so a small recursive search is more robust than a per-model
// case statement.
function findFirstAssetUrl(value: unknown): string | null {
  if (typeof value === 'string' && /^https?:\/\//.test(value)) {
    if (/\.(mp4|webm|mov|jpg|jpeg|png|webp|gif)(\?|$)/i.test(value)) return value;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstAssetUrl(item);
      if (found) return found;
    }
  }
  if (value && typeof value === 'object') {
    // Prefer .url on a nested object before walking everything else
    const v = value as Record<string, unknown>;
    if (typeof v.url === 'string' && /^https?:\/\//.test(v.url)) return v.url;
    for (const key of Object.keys(v)) {
      const found = findFirstAssetUrl(v[key]);
      if (found) return found;
    }
  }
  return null;
}

type StatusUpdate = {
  status: 'processing' | 'done' | 'rejected';
  raw_url?: string | null;
  duration_sec?: number | null;
};

async function checkFalStatus(
  apiKey: string,
  modelPath: string | null,
  jobId: string,
): Promise<StatusUpdate> {
  // We don't reliably store the model path with the render row, so accept
  // the path as input when known and fall back to listing job by id.
  const statusUrl = modelPath
    ? `${FAL_BASE}/${modelPath.replace(/^\/+/, '')}/requests/${jobId}/status`
    : `${FAL_BASE}/requests/${jobId}/status`;

  const statusRes = await fetch(statusUrl, {
    headers: { 'Authorization': `Key ${apiKey}`, 'Accept': 'application/json' },
  });
  const statusText = await statusRes.text();
  if (!statusRes.ok) {
    return { status: 'rejected', raw_url: null };
  }
  let statusData: { status?: string };
  try {
    statusData = JSON.parse(statusText);
  } catch {
    return { status: 'rejected', raw_url: null };
  }

  const upstream = (statusData.status || '').toUpperCase();
  if (upstream === 'IN_QUEUE' || upstream === 'IN_PROGRESS') {
    return { status: 'processing' };
  }
  if (upstream !== 'COMPLETED') {
    return { status: 'rejected' };
  }

  // Pull the result body
  const resultUrl = modelPath
    ? `${FAL_BASE}/${modelPath.replace(/^\/+/, '')}/requests/${jobId}`
    : `${FAL_BASE}/requests/${jobId}`;
  const resultRes = await fetch(resultUrl, {
    headers: { 'Authorization': `Key ${apiKey}`, 'Accept': 'application/json' },
  });
  if (!resultRes.ok) return { status: 'done', raw_url: null };
  const resultText = await resultRes.text();
  let resultData: unknown;
  try {
    resultData = JSON.parse(resultText);
  } catch {
    return { status: 'done', raw_url: null };
  }

  return {
    status: 'done',
    raw_url: findFirstAssetUrl(resultData),
  };
}

async function checkHiggsfieldStatus(
  apiKey: string,
  jobId: string,
): Promise<StatusUpdate> {
  const url = `${HIGGSFIELD_BASE}/v1/jobs/${jobId}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
  });
  if (!res.ok) return { status: 'rejected' };
  const text = await res.text();
  let data: { status?: string };
  try {
    data = JSON.parse(text);
  } catch {
    return { status: 'rejected' };
  }

  const upstream = (data.status || '').toLowerCase();
  if (upstream === 'pending' || upstream === 'queued' || upstream === 'running' || upstream === 'processing') {
    return { status: 'processing' };
  }
  if (upstream === 'failed' || upstream === 'cancelled') {
    return { status: 'rejected' };
  }
  // succeeded / completed / done
  return {
    status: 'done',
    raw_url: findFirstAssetUrl(data),
  };
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

  let body: { render_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin);
  }
  const { render_id } = body;
  if (!render_id) return json({ error: 'render_id is required' }, 400, origin);

  // Read the render row + linked sprint (RLS scoped)
  const { data: render, error: rErr } = await supabase
    .from('renders')
    .select('*')
    .eq('id', render_id)
    .maybeSingle();

  if (rErr) return json({ error: `Render lookup failed: ${rErr.message}` }, 500, origin);
  if (!render) return json({ error: 'Render not found' }, 404, origin);

  // Already terminal — return as-is, no upstream call
  if (render.status !== 'processing') {
    return json({ render }, 200, origin);
  }
  if (!render.provider_job_id) {
    return json({ error: 'Render has no provider_job_id to poll' }, 400, origin);
  }

  // Look up model path for fal renders (lives in models knowledge)
  let modelPath: string | null = null;
  if (render.provider === 'fal') {
    const { data: kn } = await supabase
      .from('creative_knowledge')
      .select('fields')
      .eq('kind', 'models')
      .maybeSingle();
    const lanes = (kn?.fields?.lanes as Record<string, unknown>) || {};
    modelPath = (lanes.ai_model_id as string) || null;
  }

  let update: StatusUpdate;
  try {
    if (render.provider === 'fal') {
      const apiKey = await getCredential(supabase, 'fal');
      if (!apiKey) return json({ error: 'fal not connected' }, 404, origin);
      update = await checkFalStatus(apiKey, modelPath, render.provider_job_id);
    } else if (render.provider === 'higgsfield') {
      const apiKey = await getCredential(supabase, 'higgsfield');
      if (!apiKey) return json({ error: 'Higgsfield not connected' }, 404, origin);
      update = await checkHiggsfieldStatus(apiKey, render.provider_job_id);
    } else {
      return json({ error: `Unknown provider: ${render.provider}` }, 400, origin);
    }
  } catch (err) {
    return json({ error: `Status check failed: ${(err as Error).message}` }, 502, origin);
  }

  // No state change → return current row
  if (update.status === 'processing') {
    return json({ render }, 200, origin);
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: update.status,
    updated_at: now,
  };
  if (update.raw_url !== undefined) patch.raw_url = update.raw_url;
  if (update.duration_sec !== undefined) patch.duration_sec = update.duration_sec;

  const { data: updated, error: upErr } = await supabase
    .from('renders')
    .update(patch)
    .eq('id', render_id)
    .select()
    .maybeSingle();

  if (upErr) return json({ error: `Render update failed: ${upErr.message}` }, 500, origin);

  return json({ render: updated }, 200, origin);
});
