// Multi-tenant Mercury API proxy.
//
// Mirrors shopify-proxy: each signed-in user saves their Mercury API key into
// user_integrations (RLS-scoped), and this function verifies the caller's JWT,
// looks up their key, and forwards the request to Mercury. The key never
// reaches the browser.
//
// Deploy:
//   supabase functions deploy mercury-proxy
//
// Request body: { path: "accounts" | "account/:id" | "account/:id/transactions", query?: {...} }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

// Read-only Mercury endpoints
const ALLOWED_PATH_PATTERNS = [
  /^accounts\/?$/,
  /^account\/[a-f0-9-]+\/?$/,
  /^account\/[a-f0-9-]+\/transactions\/?$/,
  /^statements\/?$/,
];

function pathAllowed(path: string) {
  return ALLOWED_PATH_PATTERNS.some((re) => re.test(path));
}

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

  // Decode Clerk JWT directly — supabase.auth.getUser would reject Clerk tokens.
  let userId: string | null = null;
  let orgId: string | null = null;
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1]));
    userId = payload.sub || null;
    orgId = payload.org_id || null;
  } catch {
    return json({ error: 'Invalid session token' }, 401, origin);
  }
  if (!userId) return json({ error: 'Invalid session token' }, 401, origin);
  if (!orgId) return json({ error: 'No active organization — create one first' }, 403, origin);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  // ── 2. Look up this org's Mercury credentials ─────────────────────────
  const { data: integration, error: intErr } = await supabase
    .from('user_integrations')
    .select('token, metadata')
    .eq('org_id', orgId)
    .eq('provider', 'mercury')
    .maybeSingle();

  if (intErr) return json({ error: `Credential lookup failed: ${intErr.message}` }, 500, origin);
  if (!integration) {
    return json({ error: 'Mercury not connected for this account. Add your API key on the Integrations tab first.' }, 404, origin);
  }

  const apiKey = integration.token as string;
  if (!apiKey) return json({ error: 'Stored Mercury credentials are missing an API key.' }, 400, origin);

  // ── 3. Validate request ────────────────────────────────────────────────
  let body: { path?: string; query?: Record<string, string | number> };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin);
  }

  const rawPath = (body.path || '').replace(/^\/+/, '').split('?')[0];
  if (!rawPath) return json({ error: 'Missing required field: path' }, 400, origin);
  if (!pathAllowed(rawPath)) {
    return json({ error: `Path not allowed: ${rawPath}` }, 403, origin);
  }

  const qs = body.query
    ? '?' + new URLSearchParams(
        Object.entries(body.query).map(([k, v]) => [k, String(v)]),
      ).toString()
    : '';

  const url = `https://api.mercury.com/api/v1/${rawPath}${qs}`;

  // ── 4. Forward to Mercury ──────────────────────────────────────────────
  try {
    const upstream = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
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
    return json({ error: `Mercury fetch failed: ${(err as Error).message}` }, 502, origin);
  }
});
