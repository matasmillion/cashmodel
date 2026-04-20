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

# 3. Set the Shopify credentials + email allowlist as secrets (never committed)
supabase secrets set \
  SHOPIFY_DOMAIN=your-store.myshopify.com \
  SHOPIFY_TOKEN=shpat_xxxxxxxxxxxxxxxxxx \
  ALLOWED_EMAILS=you@example.com

# 4. Deploy
supabase functions deploy shopify-proxy
```

## Security model

- **Token is server-only.** `SHOPIFY_TOKEN` lives in Supabase secrets
  (encrypted at rest, never in the repo, never in the browser).
- **Only allowlisted emails can call the proxy.** The function verifies the
  caller's Supabase JWT, resolves it to a user, and returns 403 if the user's
  email isn't in `ALLOWED_EMAILS`. Even if someone signs up to your Supabase
  project, they can't pull data unless you explicitly add their email.
- **Read-only endpoint allowlist.** Only paths in `ALLOWED_PATHS` are
  forwarded — all are read-only. The proxy cannot mutate your store.

## Adding/removing users

```sh
# Single user
supabase secrets set ALLOWED_EMAILS=you@example.com

# Multiple users (comma-separated, no spaces)
supabase secrets set ALLOWED_EMAILS=you@example.com,partner@example.com
```

## Rotating the Shopify token

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
- Verifies the Authorization JWT and resolves it to an allowlisted user
- Validates `path` against an allowlist of read-only Shopify endpoints
- Forwards to `https://{SHOPIFY_DOMAIN}/admin/api/2024-01/{path}?{query}` with the
  `X-Shopify-Access-Token` header
- Returns the raw JSON response with CORS headers

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
