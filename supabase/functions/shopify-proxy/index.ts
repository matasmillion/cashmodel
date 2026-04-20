// Multi-tenant Shopify Admin API proxy.
//
// Each authenticated user brings their own Shopify store + access token,
// stored in the public.user_integrations table (Row Level Security restricts
// each row to its owner). This function:
//   1. Validates the caller's Supabase JWT
//   2. Looks up that user's Shopify credentials from user_integrations
//   3. Forwards the request to their store's Admin API
//   4. Returns the response with CORS headers so the browser can read it
//
// No tenant-specific secrets in Supabase — the only env vars used are
// SUPABASE_URL and SUPABASE_ANON_KEY, both provided automatically.
//
// Deploy:
//   supabase functions deploy shopify-proxy
//
// Request body: { path: "orders.json", query?: { key: value, ... } }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const API_VERSION = Deno.env.get('SHOPIFY_API_VERSION') || '2024-01';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

// Only read-only endpoints — the proxy cannot mutate a store.
// graphql.json is allowed because ShopifyQL (read-only analytics queries)
// runs through it; mutation GraphQL ops are impossible without a write scope
// on the token, which we don't request.
const ALLOWED_PATHS = [
  'shop.json',
  'orders.json',
  'orders/count.json',
  'products.json',
  'products/count.json',
  'inventory_levels.json',
  'locations.json',
  'shopify_payments/payouts.json',
  'shopify_payments/balance.json',
  'customers/count.json',
  'graphql.json',
];

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

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, origin);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: 'SUPABASE_URL / SUPABASE_ANON_KEY env missing (provided automatically by Supabase — redeploy the function).' }, 500, origin);
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
  const userId = userData.user.id;

  // ── 2. Look up this user's Shopify credentials ──────────────────────────
  // RLS ensures the query only returns rows owned by userId.
  const { data: integration, error: intErr } = await supabase
    .from('user_integrations')
    .select('token, metadata')
    .eq('provider', 'shopify')
    .maybeSingle();

  if (intErr) {
    return json({ error: `Credential lookup failed: ${intErr.message}` }, 500, origin);
  }
  if (!integration) {
    return json({ error: 'Shopify not connected for this account. Save your Shopify domain + token on the Integrations tab first.' }, 404, origin);
  }

  const token = integration.token as string;
  const domain = (integration.metadata as { domain?: string })?.domain;
  if (!token || !domain) {
    return json({ error: 'Stored Shopify credentials are incomplete (missing domain or token).' }, 400, origin);
  }

  // ── 3. Validate request body ────────────────────────────────────────────
  let body: {
    path?: string;
    query?: Record<string, string | number>;
    // For graphql.json: full GraphQL request payload { query, variables? }
    graphql?: { query: string; variables?: Record<string, unknown> };
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin);
  }

  const rawPath = (body.path || '').replace(/^\/+/, '').split('?')[0];
  if (!rawPath) return json({ error: 'Missing required field: path' }, 400, origin);
  if (!ALLOWED_PATHS.includes(rawPath)) {
    return json({ error: `Path not allowed: ${rawPath}. Allowed: ${ALLOWED_PATHS.join(', ')}` }, 403, origin);
  }

  // ── 4a. GraphQL POST branch ─────────────────────────────────────────────
  if (rawPath === 'graphql.json') {
    if (!body.graphql?.query) {
      return json({ error: 'GraphQL requests require { graphql: { query, variables? } }' }, 400, origin);
    }
    // Crude mutation guard — we only want read queries. ShopifyQL runs inside `query`.
    const firstKeyword = body.graphql.query.trimStart().slice(0, 10).toLowerCase();
    if (firstKeyword.startsWith('mutation')) {
      return json({ error: 'Mutations are blocked by this proxy' }, 403, origin);
    }

    try {
      const upstream = await fetch(
        `https://${domain}/admin/api/${API_VERSION}/graphql.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(body.graphql),
        },
      );
      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return json({ error: `GraphQL fetch failed: ${(err as Error).message}` }, 502, origin);
    }
  }

  // ── 4b. REST GET branch ─────────────────────────────────────────────────
  const qs = body.query
    ? '?' + new URLSearchParams(
        Object.entries(body.query).map(([k, v]) => [k, String(v)]),
      ).toString()
    : '';

  const url = `https://${domain}/admin/api/${API_VERSION}/${rawPath}${qs}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': token,
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
    return json({ error: `Upstream fetch failed: ${(err as Error).message}` }, 502, origin);
  }
});
