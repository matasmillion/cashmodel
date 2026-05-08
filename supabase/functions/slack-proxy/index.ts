// Multi-tenant Slack API proxy.
//
// Posts messages, opens views, etc. on behalf of an org's connected
// Slack bot. Token comes from user_integrations.
//
// We support multiple Slack apps per org via the `provider` field on
// user_integrations:
//   - 'slack'           — creative-engine bot (default for back-compat)
//   - 'slack_inventory' — inventory-alerts bot (separate channel/app)
//
// Request body:
//   {
//     provider?: 'slack' | 'slack_inventory',  // default 'slack'
//     method: 'GET' | 'POST',
//     path: string,            // e.g. 'chat.postMessage'
//     body?: object,           // JSON body for POST
//     query?: object,          // query string for GET
//   }
//
// Auth modes:
//   - JWT in Authorization header (interactive caller, RLS-scoped)
//   - x-cron-secret header from pg_cron (service-role, all orgs)
//     When called via cron, also pass `org_id` in the body to scope
//     the credential lookup.
//
// Deploy:
//   supabase functions deploy slack-proxy

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CRON_SECRET = Deno.env.get('CRON_SECRET');
const SLACK_API = 'https://slack.com/api';
const ALLOWED_PROVIDERS = new Set(['slack', 'slack_inventory']);

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

serve(async (req) => {
  const origin = req.headers.get('origin') || '*';

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: 'SUPABASE_URL / SUPABASE_ANON_KEY env missing' }, 500, origin);
  }

  let body: {
    provider?: string;
    method?: string;
    path?: string;
    body?: Record<string, unknown>;
    query?: Record<string, string>;
    org_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin);
  }

  const provider = body.provider && ALLOWED_PROVIDERS.has(body.provider) ? body.provider : 'slack';

  // Two auth modes — JWT (interactive) or x-cron-secret (cron).
  const cronSecret = req.headers.get('x-cron-secret');
  const isCron = cronSecret && CRON_SECRET && cronSecret === CRON_SECRET;

  let supabase;
  if (isCron) {
    if (!SERVICE_ROLE_KEY) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing' }, 500, origin);
    if (!body.org_id) return json({ error: 'org_id required for cron callers' }, 400, origin);
    supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  } else {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing Authorization header (or x-cron-secret)' }, 401, origin);
    }
    const jwt = authHeader.slice('Bearer '.length);
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
  }

  const credQuery = supabase
    .from('user_integrations')
    .select('token, metadata')
    .eq('provider', provider);
  if (isCron) credQuery.eq('org_id', body.org_id);
  const { data: integration, error: intErr } = await credQuery.maybeSingle();

  if (intErr) return json({ error: `Credential lookup failed: ${intErr.message}` }, 500, origin);
  if (!integration?.token) {
    return json({ error: `${provider} not connected for this org` }, 404, origin);
  }

  const cleanPath = (body.path || '').replace(/^\/+/, '');
  if (!cleanPath) return json({ error: 'path is required' }, 400, origin);

  const method = (body.method || 'POST').toUpperCase();
  let url = `${SLACK_API}/${cleanPath}`;
  const init: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${integration.token}`,
      'Accept': 'application/json',
    },
  };

  if (method === 'GET') {
    if (body.query) {
      const qs = new URLSearchParams(body.query as Record<string, string>).toString();
      url += `?${qs}`;
    }
  } else {
    init.headers = { ...init.headers, 'Content-Type': 'application/json; charset=utf-8' };
    init.body = JSON.stringify(body.body || {});
  }

  try {
    const upstream = await fetch(url, init);
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...corsHeaders(origin), 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
    });
  } catch (err) {
    return json({ error: `Slack fetch failed: ${(err as Error).message}` }, 502, origin);
  }
});
