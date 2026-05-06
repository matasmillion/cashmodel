// Multi-tenant Apify API proxy.
//
// Apify is the scraping platform we use for the competitor-ad library
// — specifically the apify/meta-ads-library-scraper actor.
// Token comes from user_integrations (provider='apify').
//
// Request body:
//   {
//     method: 'GET' | 'POST',
//     path: string,            // e.g. 'v2/acts/apify~meta-ads-library-scraper/run-sync-get-dataset-items'
//     body?: object,
//     query?: object,
//   }
//
// Deploy:
//   supabase functions deploy apify-proxy

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const APIFY_API = 'https://api.apify.com';

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

  const { data: integration, error: intErr } = await supabase
    .from('user_integrations')
    .select('token')
    .eq('provider', 'apify')
    .maybeSingle();

  if (intErr) return json({ error: `Credential lookup failed: ${intErr.message}` }, 500, origin);
  if (!integration?.token) {
    return json({ error: 'Apify not connected for this org' }, 404, origin);
  }

  let body: { method?: string; path?: string; body?: Record<string, unknown>; query?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin);
  }

  const cleanPath = (body.path || '').replace(/^\/+/, '');
  if (!cleanPath) return json({ error: 'path is required' }, 400, origin);

  const method = (body.method || 'GET').toUpperCase();
  const params = new URLSearchParams({ token: integration.token as string });
  if (body.query) {
    for (const [k, v] of Object.entries(body.query as Record<string, string>)) {
      params.set(k, v);
    }
  }
  const url = `${APIFY_API}/${cleanPath}?${params.toString()}`;

  const init: RequestInit = {
    method,
    headers: { 'Accept': 'application/json' },
  };
  if (method === 'POST' && body.body) {
    init.headers = { ...init.headers, 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body.body);
  }

  try {
    const upstream = await fetch(url, init);
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...corsHeaders(origin), 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
    });
  } catch (err) {
    return json({ error: `Apify fetch failed: ${(err as Error).message}` }, 502, origin);
  }
});
