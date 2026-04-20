# Shopify Proxy (Multi-tenant Edge Function)

Each signed-in user connects their own Shopify store through the Integrations
tab. Credentials are stored per-user in `public.user_integrations` with Row
Level Security. The proxy validates the caller's session, looks up *their*
token, and forwards requests to *their* store.

## One-time setup (app owner)

You — the person deploying cashmodel — only have to do this once. Your users
never touch the terminal.

```sh
# 1. Install the Supabase CLI (if you don't have it)
#    macOS:   brew install supabase/tap/supabase
#    npm:     npm install -g supabase

# 2. Log in and link to your Supabase project
supabase login
supabase link --project-ref <your-project-ref>

# 3. Apply the migration (creates the user_integrations table with RLS)
supabase db push

# 4. Deploy the proxy function
supabase functions deploy shopify-proxy
```

That's it. No per-tenant secrets to manage.

## User flow (everyone else)

1. Sign into the cashmodel web app
2. Go to **Integrations** → **Shopify**
3. Paste their Shopify store domain and Admin API access token
4. Click **Connect Shopify**

The browser writes their credentials to the `user_integrations` table
(scoped by RLS to their row only) and then hits the proxy to confirm the
connection works.

## Security model

- **No token ever enters this repo.** User tokens are written directly from
  the browser to the Supabase database over HTTPS.
- **Row Level Security.** Each row in `user_integrations` is tagged with
  `user_id` and policies restrict SELECT / INSERT / UPDATE / DELETE to
  `auth.uid() = user_id`. User A can never read User B's credentials.
- **Proxy uses the caller's JWT.** The edge function authenticates with
  the user's own session token, so its database reads are filtered by RLS
  too — it literally can only see the calling user's row.
- **Read-only path allowlist.** The proxy forwards only to paths in
  `ALLOWED_PATHS` (orders, products, payouts, etc.). Mutations are blocked
  before Shopify is ever called.

## Adding paths

Edit `ALLOWED_PATHS` in `index.ts` and redeploy:

```sh
supabase functions deploy shopify-proxy
```

## Path B (later) — upgrade to OAuth

When you want one-click Shopify connections for users (no token hunting),
build a Shopify Public App and add an OAuth callback function that writes
the resulting access token into `user_integrations` for the caller. The
schema and proxy don't need to change — only the on-boarding flow.

## Local testing

```sh
supabase functions serve shopify-proxy
```

The function reads `SUPABASE_URL` / `SUPABASE_ANON_KEY` automatically.
Point the local client at `http://localhost:54321/functions/v1/shopify-proxy`.
