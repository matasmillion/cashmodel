// Multi-tenant Higgsfield API proxy.
//
// Generic forwarder for Higgsfield endpoints (Marketing Studio, Soul
// Character, etc.). The org's API key is looked up from
// user_integrations and added as the Authorization header. The key
// never reaches the browser.
//
// Used by:
//   - dispatch-render for high_production / creator / founder lanes
//   - check-render-status to poll job status
//   - testHiggsfieldProxy in liveDataSync.js
//
// Request body:
//   {
//     endpoint: string,    // path under https://api.higgsfield.ai/ OR full URL
//     method?: 'GET' | 'POST',
//     payload?: object,
//   }
//
// Deploy:
//   supabase functions deploy higgsfield-proxy

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
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

function resolveUrl(endpoint: string): string | null {
  if (!endpoint) return null;
  if (/^https?:\/\//i.test(endpoint)) {
    try {
      const u = new URL(endpoint);
      if (!u.hostname.endsWith('higgsfield.ai')) return null;
      return endpoint;
    } catch {
      return null;
    }
  }
  const clean = endpoint.replace(/^\/+/, '');
  return `${HIGGSFIELD_BASE}/${clean}`;
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

  const { data: integration, error: intErr } = await supabase
    .from('user_integrations')
    .select('token')
    .eq('provider', 'higgsfield')
    .maybeSingle();

  if (intErr) return json({ error: `Credential lookup failed: ${intErr.message}` }, 500, origin);
  if (!integration?.token) {
    return json({ error: 'Higgsfield not connected for this org. Add your API key on the Integrations tab first.' }, 404, origin);
  }

  let body: { endpoint?: string; method?: string; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin);
  }

  const url = resolveUrl(body.endpoint || '');
  if (!url) return json({ error: 'Missing or invalid endpoint' }, 400, origin);

  const method = (body.method || (body.payload ? 'POST' : 'GET')).toUpperCase();
  const init: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${integration.token}`,
      'Accept': 'application/json',
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
  };
  if (method === 'POST' && body.payload !== undefined) {
    init.body = JSON.stringify(body.payload);
  }

  try {
    const upstream = await fetch(url, init);
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...corsHeaders(origin),
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (err) {
    return json({ error: `Higgsfield fetch failed: ${(err as Error).message}` }, 502, origin);
  }
});
