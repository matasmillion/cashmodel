// Shopify Admin API proxy — forwards authenticated requests from the browser
// to Shopify, keeping the access token server-side.
//
// Configure secrets:
//   supabase secrets set SHOPIFY_DOMAIN=your-store.myshopify.com
//   supabase secrets set SHOPIFY_TOKEN=shpat_...
//   supabase secrets set ALLOWED_EMAILS=you@foreignresource.com  (comma-separated for multiple)
//
// Deploy:
//   supabase functions deploy shopify-proxy
//
// Request body: { path: "orders.json", query?: { key: value, ... } }
// Response: the raw JSON from Shopify, or { error } on failure.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SHOPIFY_DOMAIN = Deno.env.get('SHOPIFY_DOMAIN');
const SHOPIFY_TOKEN = Deno.env.get('SHOPIFY_TOKEN');
const API_VERSION = Deno.env.get('SHOPIFY_API_VERSION') || '2024-01';
const ALLOWED_EMAILS = (Deno.env.get('ALLOWED_EMAILS') || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

// Only allow GETs against read-only endpoints; block anything that could mutate data.
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

  if (!SHOPIFY_DOMAIN || !SHOPIFY_TOKEN) {
    return json(
      { error: 'Proxy not configured. Run: supabase secrets set SHOPIFY_DOMAIN=... SHOPIFY_TOKEN=...' },
      500,
      origin,
    );
  }

  // ── Auth check: verify the caller is an allowlisted user ────────────────
  if (ALLOWED_EMAILS.length === 0) {
    return json(
      { error: 'Proxy has no ALLOWED_EMAILS configured. Set supabase secrets set ALLOWED_EMAILS=you@example.com before exposing this endpoint.' },
      500,
      origin,
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return json({ error: 'Missing Authorization header' }, 401, origin);
  }
  const token = authHeader.slice('Bearer '.length);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: 'SUPABASE_URL / SUPABASE_ANON_KEY env not set (these are provided automatically by Supabase — redeploy the function).' }, 500, origin);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json({ error: 'Invalid session token' }, 401, origin);
  }

  const userEmail = (userData.user.email || '').toLowerCase();
  if (!ALLOWED_EMAILS.includes(userEmail)) {
    return json({ error: `User ${userEmail} is not allowed to call this proxy` }, 403, origin);
  }
  // ────────────────────────────────────────────────────────────────────────

  let body: { path?: string; query?: Record<string, string | number> };
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

  const qs = body.query
    ? '?' + new URLSearchParams(
        Object.entries(body.query).map(([k, v]) => [k, String(v)]),
      ).toString()
    : '';

  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/${rawPath}${qs}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
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
