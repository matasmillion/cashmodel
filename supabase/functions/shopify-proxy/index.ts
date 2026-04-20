// Shopify Admin API proxy — forwards authenticated requests from the browser
// to Shopify, keeping the access token server-side.
//
// Configure secrets:
//   supabase secrets set SHOPIFY_DOMAIN=your-store.myshopify.com
//   supabase secrets set SHOPIFY_TOKEN=shpat_...
//
// Deploy:
//   supabase functions deploy shopify-proxy
//
// Request body: { path: "orders.json", query?: { key: value, ... } }
// Response: the raw JSON from Shopify, or { error } on failure.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SHOPIFY_DOMAIN = Deno.env.get('SHOPIFY_DOMAIN');
const SHOPIFY_TOKEN = Deno.env.get('SHOPIFY_TOKEN');
const API_VERSION = Deno.env.get('SHOPIFY_API_VERSION') || '2024-01';

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
