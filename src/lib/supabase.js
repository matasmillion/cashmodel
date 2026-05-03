import { createClient } from '@supabase/supabase-js';
import { getClerkToken } from './auth';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Only create the client when both values are present — avoids crashes during local dev
export const supabase = (url && key) ? createClient(url, key) : null;
export const IS_SUPABASE_ENABLED = !!(url && key);

// Memoize the authed client keyed on the bearer token so we don't spin up a
// new GoTrueClient on every store call (which produces "Multiple GoTrueClient
// instances" warnings and wastes memory). Two clients exist at most: the bare
// anon `supabase` singleton and one authed client per live token.
let _authedCache = { token: null, client: null };

// Returns a Supabase client that forwards the current Clerk JWT so that
// RLS policies using auth.jwt() ->> 'org_id' can enforce org isolation.
// Falls back to the bare anon client if no token is available (unauthed
// calls will be blocked by RLS, which is the correct behavior).
export async function getAuthedSupabase() {
  if (!IS_SUPABASE_ENABLED) return null;
  const token = await getClerkToken('supabase');
  if (!token) return supabase;
  if (_authedCache.token === token && _authedCache.client) return _authedCache.client;
  _authedCache = {
    token,
    client: createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
  return _authedCache.client;
}

// Force a fresh JWT from Clerk (bypass the Clerk token cache) and replace the
// cached authed client. Call this in the RLS-retry path so a stale token that
// was minted before the active org was set gets replaced with one that carries
// the correct org_id claim.
export async function refreshAuthedSupabase() {
  if (!IS_SUPABASE_ENABLED) return null;
  _authedCache = { token: null, client: null };
  const token = await getClerkToken('supabase', { skipCache: true });
  if (!token) return supabase;
  _authedCache = {
    token,
    client: createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
  return _authedCache.client;
}
