// Plaid proxy — multi-tenant, multi-institution.
//
// Each authenticated user can connect multiple Plaid items (e.g. Chase + AMEX).
// Access tokens live in user_plaid_items (RLS-scoped). This function handles:
//
//   1. action: "link-token/create"          → returns link_token for Plaid Link
//   2. action: "public-token/exchange"      → stores access_token + item metadata
//   3. action: "accounts/cached"            → cheap, reads Plaid's cached balances (free w/ Transactions product)
//   4. action: "accounts/balance"           → forced real-time refresh ($0.10/call — user-initiated only)
//   5. action: "accounts/all"               → returns cached balances across ALL items (auto-sync default)
//   6. action: "transactions/get"           → transactions for one item in a window
//   7. action: "item/remove"                → removes an item from Plaid + our DB
//
// Secrets (set in Supabase → Edge Functions → plaid-proxy → Secrets):
//   PLAID_CLIENT_ID      — same across envs
//   PLAID_SECRET         — env-specific (sandbox/development/production)
//   PLAID_ENV            — 'sandbox' | 'development' | 'production' (default sandbox)
//
// Deploy:
//   supabase functions deploy plaid-proxy

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID');
const PLAID_SECRET = Deno.env.get('PLAID_SECRET');
const PLAID_ENV = (Deno.env.get('PLAID_ENV') || 'sandbox').toLowerCase();

const PLAID_HOST = (() => {
  switch (PLAID_ENV) {
    case 'production': return 'https://production.plaid.com';
    case 'development': return 'https://development.plaid.com';
    default: return 'https://sandbox.plaid.com';
  }
})();

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

async function plaid(path: string, payload: Record<string, unknown>) {
  const res = await fetch(`${PLAID_HOST}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      ...payload,
    }),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { /* keep empty */ }
  return { ok: res.ok, status: res.status, data };
}

serve(async (req) => {
  const origin = req.headers.get('origin') || '*';

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: 'SUPABASE_URL / SUPABASE_ANON_KEY env missing' }, 500, origin);
  }
  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    return json({ error: 'PLAID_CLIENT_ID / PLAID_SECRET env missing — set them in the function Secrets tab.' }, 500, origin);
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

  // ── 2. Parse body ───────────────────────────────────────────────────────
  let body: {
    action?: string;
    public_token?: string;
    item_id?: string;
    start_date?: string;
    end_date?: string;
    metadata?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin);
  }
  const action = body.action;
  if (!action) return json({ error: 'Missing required field: action' }, 400, origin);

  // ── 3a. Create a link_token for Plaid Link ──────────────────────────────
  if (action === 'link-token/create') {
    const { ok, status, data } = await plaid('/link/token/create', {
      user: { client_user_id: userId },
      client_name: 'Cashmodel',
      language: 'en',
      country_codes: ['US'],
      products: ['auth', 'transactions'],
      // OAuth redirect for Chase etc. Must be added to Plaid dashboard → API → Allowed redirect URIs.
      redirect_uri: 'https://matasmillion.github.io/cashmodel/',
    });
    if (!ok) return json({ error: 'link_token creation failed', plaid: data }, status, origin);
    return json({ link_token: data.link_token, expiration: data.expiration }, 200, origin);
  }

  // ── 3b. Exchange public_token → access_token, store the item ────────────
  if (action === 'public-token/exchange') {
    if (!body.public_token) return json({ error: 'Missing public_token' }, 400, origin);

    const exch = await plaid('/item/public_token/exchange', { public_token: body.public_token });
    if (!exch.ok) return json({ error: 'public_token exchange failed', plaid: exch.data }, exch.status, origin);

    const accessToken = exch.data.access_token as string;
    const itemId = exch.data.item_id as string;

    // Fetch accounts + institution so we can show a useful label in the UI.
    const accts = await plaid('/accounts/get', { access_token: accessToken });
    const accountsList = (accts.data.accounts as Array<Record<string, unknown>>) || [];
    const institutionId = (accts.data.item as Record<string, unknown> | undefined)?.institution_id as string | undefined;

    let institutionName: string | undefined;
    if (institutionId) {
      const inst = await plaid('/institutions/get_by_id', {
        institution_id: institutionId,
        country_codes: ['US'],
      });
      institutionName = ((inst.data.institution as Record<string, unknown> | undefined)?.name as string) || undefined;
    }

    const { error: upErr } = await supabase
      .from('user_plaid_items')
      .upsert(
        {
          item_id: itemId,
          user_id: userId,
          access_token: accessToken,
          institution_id: institutionId || null,
          institution_name: institutionName || null,
          accounts: accountsList.map((a) => ({
            id: a.account_id,
            name: a.name,
            mask: a.mask,
            type: a.type,
            subtype: a.subtype,
          })),
        },
        { onConflict: 'item_id' },
      );
    if (upErr) return json({ error: `Save failed: ${upErr.message}` }, 500, origin);

    return json({
      item_id: itemId,
      institution_name: institutionName,
      account_count: accountsList.length,
    }, 200, origin);
  }

  // ── 3c. Force a real-time balance refresh ($0.10 per call — user-initiated) ─
  if (action === 'accounts/balance') {
    if (!body.item_id) return json({ error: 'Missing item_id' }, 400, origin);
    const { data: row, error: rowErr } = await supabase
      .from('user_plaid_items')
      .select('access_token, institution_name')
      .eq('item_id', body.item_id)
      .maybeSingle();
    if (rowErr || !row) return json({ error: 'Item not found' }, 404, origin);

    const bal = await plaid('/accounts/balance/get', { access_token: row.access_token });
    if (!bal.ok) return json({ error: 'balance fetch failed', plaid: bal.data }, bal.status, origin);

    return json({
      institution_name: row.institution_name,
      accounts: bal.data.accounts,
    }, 200, origin);
  }

  // ── 3d. Cheap cached balances for a single item (free w/ Transactions) ──
  if (action === 'accounts/cached') {
    if (!body.item_id) return json({ error: 'Missing item_id' }, 400, origin);
    const { data: row, error: rowErr } = await supabase
      .from('user_plaid_items')
      .select('access_token, institution_name')
      .eq('item_id', body.item_id)
      .maybeSingle();
    if (rowErr || !row) return json({ error: 'Item not found' }, 404, origin);

    const accts = await plaid('/accounts/get', { access_token: row.access_token });
    if (!accts.ok) return json({ error: 'accounts fetch failed', plaid: accts.data }, accts.status, origin);
    return json({
      institution_name: row.institution_name,
      accounts: accts.data.accounts,
    }, 200, origin);
  }

  // ── 3e. Fetch balances across ALL items (default = cached; free w/ Transactions) ─
  // Pass { real_time: true } to force a live refresh at $0.10/call per account.
  if (action === 'accounts/all') {
    const realTime = (body as { real_time?: boolean }).real_time === true;
    const endpoint = realTime ? '/accounts/balance/get' : '/accounts/get';

    const { data: rows, error: rowsErr } = await supabase
      .from('user_plaid_items')
      .select('item_id, access_token, institution_name, institution_id');
    if (rowsErr) return json({ error: rowsErr.message }, 500, origin);

    const results = await Promise.all((rows || []).map(async (row) => {
      const bal = await plaid(endpoint, { access_token: row.access_token });
      if (!bal.ok) {
        return {
          item_id: row.item_id,
          institution_name: row.institution_name,
          institution_id: row.institution_id,
          error: (bal.data as { error_message?: string }).error_message || `status ${bal.status}`,
          accounts: [],
        };
      }
      return {
        item_id: row.item_id,
        institution_name: row.institution_name,
        institution_id: row.institution_id,
        accounts: bal.data.accounts,
      };
    }));

    return json({ items: results, real_time: realTime }, 200, origin);
  }

  // ── 3e. Transactions for a single item ──────────────────────────────────
  if (action === 'transactions/get') {
    if (!body.item_id) return json({ error: 'Missing item_id' }, 400, origin);
    const { data: row, error: rowErr } = await supabase
      .from('user_plaid_items')
      .select('access_token')
      .eq('item_id', body.item_id)
      .maybeSingle();
    if (rowErr || !row) return json({ error: 'Item not found' }, 404, origin);

    const today = new Date();
    const defaultStart = new Date(today);
    defaultStart.setDate(today.getDate() - 90);
    const toISO = (d: Date) => d.toISOString().split('T')[0];

    const tx = await plaid('/transactions/get', {
      access_token: row.access_token,
      start_date: body.start_date || toISO(defaultStart),
      end_date: body.end_date || toISO(today),
      options: { count: 500, offset: 0 },
    });
    if (!tx.ok) return json({ error: 'transactions fetch failed', plaid: tx.data }, tx.status, origin);
    return json(tx.data, 200, origin);
  }

  // ── 3f. Remove an item ──────────────────────────────────────────────────
  if (action === 'item/remove') {
    if (!body.item_id) return json({ error: 'Missing item_id' }, 400, origin);
    const { data: row } = await supabase
      .from('user_plaid_items')
      .select('access_token')
      .eq('item_id', body.item_id)
      .maybeSingle();
    if (row) {
      await plaid('/item/remove', { access_token: row.access_token });
    }
    const { error: delErr } = await supabase
      .from('user_plaid_items')
      .delete()
      .eq('item_id', body.item_id);
    if (delErr) return json({ error: delErr.message }, 500, origin);
    return json({ removed: true }, 200, origin);
  }

  return json({ error: `Unknown action: ${action}` }, 400, origin);
});
