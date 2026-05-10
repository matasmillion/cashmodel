// Multi-tenant ShipHero proxy.
//
// Each authenticated user brings their own ShipHero refresh token, stored
// in the public.user_integrations table (RLS scopes each row to its owner).
// This function:
//   1. Validates the caller's Supabase JWT
//   2. Looks up that user's ShipHero refresh token + cached access token
//   3. Refreshes the access token if missing or near expiry
//   4. Forwards the GraphQL request to api.shiphero.com
//   5. Persists the refreshed access token + expiry back to user_integrations
//      so the next call doesn't need to re-refresh
//
// Mutations are allowed (this is the write path for PO sync). The set of
// allowed operation names is enumerated below — anything else is rejected.
//
// Deploy:
//   supabase functions deploy shiphero-proxy
//
// Request body: { query: string, variables?: Record<string, unknown> }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

const SHIPHERO_GRAPHQL  = 'https://public-api.shiphero.com/graphql';
const SHIPHERO_REFRESH  = 'https://public-api.shiphero.com/auth/refresh';

// ShipHero access tokens last ~28 days. Refresh when fewer than 24h remain.
const REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000;

// Whitelist of operations the proxy will forward. Read ops are open;
// mutations are listed explicitly so the surface stays controlled.
const ALLOWED_OPS = new Set([
  // Reads
  'shipHero',          // ping
  'account',
  'warehouses',
  'vendors',
  'purchase_order',
  'purchase_orders',
  'products',
  'product',
  // Writes (PO sync flow)
  'purchase_order_create',
  'purchase_order_update',
]);

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

// Pull the first operation name out of a GraphQL document. We use this to
// gate the allowed-ops whitelist.
function firstOpName(query: string): string | null {
  // Match `mutation Name {`, `query Name {`, or unnamed `{ field(...) {`
  const named = /^\s*(?:mutation|query|subscription)\s+(\w+)/i.exec(query);
  if (named) return named[1];
  const fieldMatch = /\{\s*(\w+)\s*[\(\{]/.exec(query);
  return fieldMatch ? fieldMatch[1] : null;
}

interface IntegrationMeta {
  access_token?: string;
  access_token_expires_at?: string; // ISO
  default_warehouse_id?: string;
  account_id?: string;
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(SHIPHERO_REFRESH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const text = await res.text();
  let data: { access_token?: string; expires_in?: number; error?: string };
  try { data = JSON.parse(text); } catch { data = { error: text }; }
  if (!res.ok || !data.access_token) {
    throw new Error(data.error || `ShipHero auth/refresh returned ${res.status}: ${text.slice(0, 200)}`);
  }
  return { access_token: data.access_token, expires_in: data.expires_in || 28 * 86400 };
}

serve(async (req) => {
  const origin = req.headers.get('origin') || '*';

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, origin);
  }
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

  // ── 2. Look up this user's ShipHero credentials ─────────────────────────
  const { data: integration, error: intErr } = await supabase
    .from('user_integrations')
    .select('id, token, metadata')
    .eq('provider', 'shiphero')
    .maybeSingle();

  if (intErr) return json({ error: `Credential lookup failed: ${intErr.message}` }, 500, origin);
  if (!integration) {
    return json({
      error: 'ShipHero not connected for this account. Save your refresh token on Settings → Integrations first.',
    }, 404, origin);
  }

  const refreshToken = integration.token as string;
  const meta: IntegrationMeta = (integration.metadata as IntegrationMeta) || {};

  if (!refreshToken) {
    return json({ error: 'Stored ShipHero credential is missing the refresh token.' }, 400, origin);
  }

  // ── 3. Validate request body ────────────────────────────────────────────
  let body: { query?: string; variables?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin);
  }
  if (!body.query) {
    return json({ error: 'Request must include { query, variables? }' }, 400, origin);
  }

  const opName = firstOpName(body.query) || '';
  if (!ALLOWED_OPS.has(opName)) {
    return json({
      error: `Operation "${opName}" not allowed. Allowed: ${[...ALLOWED_OPS].join(', ')}`,
    }, 403, origin);
  }

  // ── 4. Ensure we have a fresh access token ──────────────────────────────
  let accessToken = meta.access_token || '';
  let expiresAt   = meta.access_token_expires_at ? Date.parse(meta.access_token_expires_at) : 0;
  const now = Date.now();
  let refreshed = false;

  if (!accessToken || !expiresAt || expiresAt - now < REFRESH_BUFFER_MS) {
    try {
      const r = await refreshAccessToken(refreshToken);
      accessToken = r.access_token;
      expiresAt   = now + r.expires_in * 1000;
      refreshed = true;
    } catch (err) {
      return json({ error: `ShipHero refresh failed: ${(err as Error).message}` }, 502, origin);
    }
  }

  // ── 5. Forward to ShipHero ──────────────────────────────────────────────
  let upstream: Response;
  try {
    upstream = await fetch(SHIPHERO_GRAPHQL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query: body.query, variables: body.variables || {} }),
    });
  } catch (err) {
    return json({ error: `ShipHero fetch failed: ${(err as Error).message}` }, 502, origin);
  }

  const responseText = await upstream.text();

  // ── 6. Persist refreshed access token (best-effort) ─────────────────────
  if (refreshed) {
    const newMeta: IntegrationMeta = {
      ...meta,
      access_token: accessToken,
      access_token_expires_at: new Date(expiresAt).toISOString(),
    };
    await supabase
      .from('user_integrations')
      .update({ metadata: newMeta })
      .eq('id', integration.id);
  }

  return new Response(responseText, {
    status: upstream.status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
});
