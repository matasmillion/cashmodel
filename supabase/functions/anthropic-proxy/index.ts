// Multi-tenant Anthropic API proxy.
//
// Mirrors mercury-proxy: the caller's JWT is verified, the org's Anthropic
// API key is looked up from user_integrations (RLS-filtered, no manual
// .eq('org_id',...) needed), and the request is forwarded to the Anthropic
// Messages API. The key never reaches the browser.
//
// Request body:
//   { model?, system?, messages, max_tokens? }
//   model defaults to claude-sonnet-4-6
//   max_tokens defaults to 4096
//
// Deploy:
//   supabase functions deploy anthropic-proxy

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4096;

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

  // ── 1. Verify caller session ────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing Authorization header — sign in first' }, 401, origin);
  }
  const jwt = authHeader.slice('Bearer '.length);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return json({ error: 'Invalid session token' }, 401, origin);
  }

  // ── 2. Look up this org's Anthropic API key ────────────────────────────
  const { data: integration, error: intErr } = await supabase
    .from('user_integrations')
    .select('token')
    .eq('provider', 'anthropic')
    .maybeSingle();

  if (intErr) return json({ error: `Credential lookup failed: ${intErr.message}` }, 500, origin);
  if (!integration?.token) {
    return json({ error: 'Anthropic not connected for this org. Add your API key on the Integrations tab first.' }, 404, origin);
  }

  // ── 3. Parse and validate request body ────────────────────────────────
  let body: { model?: string; system?: string; messages: unknown[]; max_tokens?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: 'messages array is required and must not be empty' }, 400, origin);
  }

  const payload = {
    model: body.model || DEFAULT_MODEL,
    max_tokens: body.max_tokens || DEFAULT_MAX_TOKENS,
    messages: body.messages,
    ...(body.system ? { system: body.system } : {}),
  };

  // ── 4. Forward to Anthropic ────────────────────────────────────────────
  try {
    const upstream = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': integration.token as string,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...corsHeaders(origin),
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (err) {
    return json({ error: `Anthropic fetch failed: ${(err as Error).message}` }, 502, origin);
  }
});
