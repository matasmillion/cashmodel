import { createClient } from '@supabase/supabase-js';
import { getClerkToken } from './auth';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Only create the client when both values are present — avoids crashes during local dev
export const supabase = (url && key) ? createClient(url, key) : null;
export const IS_SUPABASE_ENABLED = !!(url && key);

// Returns a Supabase client that forwards the current Clerk JWT so that
// RLS policies using auth.jwt() ->> 'org_id' can enforce org isolation.
// Falls back to the bare anon client if no token is available (unauthed
// calls will be blocked by RLS, which is the correct behavior).
export async function getAuthedSupabase() {
  if (!IS_SUPABASE_ENABLED) return null;
  const token = await getClerkToken('supabase');
  if (!token) return supabase;
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
