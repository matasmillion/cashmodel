// Multi-tenant Meta Graph API proxy.
//
// Forwards a request to https://graph.facebook.com/v19.0/{path} with
// the org's stored access_token attached as a query parameter. Used for
// ad write operations (campaign / adset / ad CRUD, kill / scale,
// video upload). The existing read-side flow in syncMetaActuals still
// calls Graph directly from the browser and is untouched — see
// upload-meta-ad and the LiveAds Kill/Scale handlers for users.
//
// user_integrations row shape:
//   provider = 'meta'
//   token    = access_token
//   metadata = { account_id: 'act_xxx', page_id?: '...', pixel_id?: '...' }
//
// Request body:
//   {
//     method: 'GET' | 'POST' | 'DELETE',
//     path: string,             // 'act_123/campaigns' or '12345/insights'
//     body?: object,            // form-encoded as application/x-www-form-urlencoded
//     api_version?: string,     // defaults to 'v19.0'
//   }
//
// Deploy:
//   supabase functions deploy meta-proxy

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const DEFAULT_API_VERSION = 'v19.0';

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
    return json({ error: 'Missing Authorization header — sign in first' }, 401, origin);
  }
  const jwt = authHeader.slice('Bearer '.length);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: integration, error: intErr } = await supabase
    .from('user_integrations')
    .select('token, metadata')
    .eq('provider', 'meta')
    .maybeSingle();

  if (intErr) return json({ error: `Credential lookup failed: ${intErr.message}` }, 500, origin);
  if (!integration?.token) {
    return json({ error: 'Meta not connected for this org. Add your access token on the Integrations tab first.' }, 404, origin);
  }

  let body: { method?: string; path?: string; body?: Record<string, unknown>; api_version?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin);
  }

  const cleanPath = (body.path || '').replace(/^\/+/, '');
  if (!cleanPath) return json({ error: 'path is required' }, 400, origin);

  const apiVersion = body.api_version || DEFAULT_API_VERSION;
  const method = (body.method || 'GET').toUpperCase();
  const baseUrl = `https://graph.facebook.com/${apiVersion}/${cleanPath}`;

  const init: RequestInit = {
    method,
    headers: { 'Accept': 'application/json' },
  };

  if (method === 'GET' || method === 'DELETE') {
    const params = new URLSearchParams({ access_token: integration.token as string });
    if (body.body) {
      for (const [k, v] of Object.entries(body.body)) {
        params.set(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
    }
    const url = `${baseUrl}?${params.toString()}`;
    try {
      const upstream = await fetch(url, init);
      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { ...corsHeaders(origin), 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
      });
    } catch (err) {
      return json({ error: `Meta fetch failed: ${(err as Error).message}` }, 502, origin);
    }
  }

  // POST: send body as form-encoded with access_token included
  const params = new URLSearchParams({ access_token: integration.token as string });
  if (body.body) {
    for (const [k, v] of Object.entries(body.body)) {
      params.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
  }
  init.headers = { ...init.headers, 'Content-Type': 'application/x-www-form-urlencoded' };
  init.body = params.toString();

  try {
    const upstream = await fetch(baseUrl, init);
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...corsHeaders(origin), 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
    });
  } catch (err) {
    return json({ error: `Meta fetch failed: ${(err as Error).message}` }, 502, origin);
  }
});
