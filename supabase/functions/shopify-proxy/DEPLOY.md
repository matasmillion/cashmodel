# Shopify Proxy (Supabase Edge Function)

Forwards authenticated browser requests to the Shopify Admin API. The access
token lives in Supabase secrets, never in the browser.

## One-time deploy

```sh
# 1. Install the Supabase CLI if you don't have it
#    macOS:   brew install supabase/tap/supabase
#    npm:     npm install -g supabase
#    other:   https://supabase.com/docs/guides/cli

# 2. Log in and link the function to your Supabase project
supabase login
supabase link --project-ref <your-project-ref>

# 3. Set the Shopify credentials as secrets (never committed)
supabase secrets set \
  SHOPIFY_DOMAIN=your-store.myshopify.com \
  SHOPIFY_TOKEN=shpat_xxxxxxxxxxxxxxxxxx

# 4. Deploy
supabase functions deploy shopify-proxy
```

## Rotating the token

```sh
supabase secrets set SHOPIFY_TOKEN=shpat_new_token_here
# No redeploy needed — secrets take effect immediately.
```

## Required Shopify scopes

- `read_orders`
- `read_products`
- `read_inventory`
- `read_shopify_payments_payouts`

## What the proxy does

- Accepts `POST` with JSON body `{ path, query? }`
- Validates `path` against an allowlist of read-only Shopify endpoints
- Forwards to `https://{SHOPIFY_DOMAIN}/admin/api/2024-01/{path}?{query}` with the
  `X-Shopify-Access-Token` header
- Returns the raw JSON response with CORS headers
- Supabase enforces JWT auth on the function by default, so only signed-in
  users of your app can call it

## Allowed paths

See `ALLOWED_PATHS` in `index.ts`. Currently: `shop.json`, `orders.json`,
`orders/count.json`, `products.json`, `products/count.json`,
`inventory_levels.json`, `locations.json`, `shopify_payments/payouts.json`,
`shopify_payments/balance.json`, `customers/count.json`.

Add new paths to the array and redeploy to extend.

## Local testing

```sh
supabase functions serve shopify-proxy --env-file ./supabase/.env.local
```

Where `.env.local` contains:

```
SHOPIFY_DOMAIN=your-store.myshopify.com
SHOPIFY_TOKEN=shpat_xxx
```
