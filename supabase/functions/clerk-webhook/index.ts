// clerk-webhook — Supabase Edge Function (Deno).
//
// Receives Clerk lifecycle events (user.created / user.updated /
// user.deleted) and upserts a row in public.users keyed by
// clerk_user_id. Verifies the Svix signature on every request — any
// payload that fails verification is dropped with 401.
//
// Required secrets (set via `supabase secrets set`):
//   CLERK_WEBHOOK_SIGNING_SECRET  — whsec_… from Clerk Dashboard
//   SUPABASE_URL                  — auto-provided by Supabase runtime
//   SUPABASE_SERVICE_ROLE_KEY     — auto-provided; bypasses RLS to upsert
//
// Optional:
//   CLERK_SECRET_KEY              — only needed if we ever call back
//                                    into the Clerk admin API (we don't
//                                    today; reserved for future use).
//
// This function is the Vite-stack analogue of the spec's Next.js API
// route at /api/webhooks/clerk. URL pattern:
//   https://<project-ref>.supabase.co/functions/v1/clerk-webhook
//
// Local dev:
//   supabase functions serve clerk-webhook --no-verify-jwt
// Deploy:
//   supabase functions deploy clerk-webhook --no-verify-jwt
//   supabase secrets set CLERK_WEBHOOK_SIGNING_SECRET=whsec_...
// (--no-verify-jwt is required because Clerk does not send a Supabase
//  JWT — it sends Svix headers. We verify those ourselves below.)

// @deno-types="https://esm.sh/v135/svix@1.42.0/index.d.ts"
import { Webhook } from 'https://esm.sh/svix@1.42.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.0';

type ClerkUser = {
  id: string;
  email_addresses?: Array<{ id: string; email_address: string }>;
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  public_metadata?: Record<string, unknown>;
  passkeys?: Array<{ name?: string }>;
  totp_enabled?: boolean;
  backup_code_enabled?: boolean;
  created_at?: number;
  updated_at?: number;
};

type ClerkEvent =
  | { type: 'user.created' | 'user.updated'; data: ClerkUser }
  | { type: 'user.deleted'; data: { id: string; deleted: boolean } };

const SIGNING_SECRET = Deno.env.get('CLERK_WEBHOOK_SIGNING_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

if (!SIGNING_SECRET) {
  console.error('clerk-webhook: missing CLERK_WEBHOOK_SIGNING_SECRET — every request will fail verification');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function primaryEmail(u: ClerkUser): string {
  if (!u.email_addresses?.length) return '';
  const primary = u.email_addresses.find(e => e.id === u.primary_email_address_id);
  return (primary || u.email_addresses[0]).email_address || '';
}

function displayName(u: ClerkUser): string {
  return [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
    || u.username
    || '';
}

function normalizeRole(candidate: unknown): 'admin' | 'operator' | 'viewer' {
  if (candidate === 'admin' || candidate === 'operator' || candidate === 'viewer') {
    return candidate;
  }
  return 'viewer';
}

function enumerateMfaFactors(u: ClerkUser) {
  const factors: Array<{ type: string; label?: string; phishing_resistant?: boolean }> = [];
  for (const pk of u.passkeys ?? []) {
    factors.push({ type: 'passkey', label: pk.name || 'Passkey', phishing_resistant: true });
  }
  if (u.totp_enabled) factors.push({ type: 'totp', label: 'Authenticator app' });
  if (u.backup_code_enabled) factors.push({ type: 'backup_code', label: 'Backup codes' });
  return factors;
}

function mfaEnabled(u: ClerkUser): boolean {
  return (u.passkeys?.length ?? 0) > 0 || !!u.totp_enabled;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const svix_id = req.headers.get('svix-id');
  const svix_timestamp = req.headers.get('svix-timestamp');
  const svix_signature = req.headers.get('svix-signature');

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('missing Svix headers', { status: 400 });
  }

  const body = await req.text();

  // Verify the signature — protects against forged events.
  let event: ClerkEvent;
  try {
    const wh = new Webhook(SIGNING_SECRET);
    event = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as ClerkEvent;
  } catch (err) {
    console.error('clerk-webhook: signature verification failed', err);
    return new Response('signature verification failed', { status: 401 });
  }

  try {
    if (event.type === 'user.created' || event.type === 'user.updated') {
      const u = event.data;
      const { error } = await supabase
        .from('users')
        .upsert(
          {
            clerk_user_id: u.id,
            email: primaryEmail(u),
            name: displayName(u),
            role: normalizeRole((u.public_metadata ?? {}).role),
            mfa_enabled: mfaEnabled(u),
            mfa_factors: enumerateMfaFactors(u),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'clerk_user_id' }
        );
      if (error) {
        console.error('clerk-webhook: upsert failed', error);
        return new Response('db write failed', { status: 500 });
      }
    } else if (event.type === 'user.deleted') {
      const id = event.data.id;
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('clerk_user_id', id);
      if (error) {
        console.error('clerk-webhook: delete failed', error);
        return new Response('db delete failed', { status: 500 });
      }
    } else {
      // Unhandled event type — ack so Clerk doesn't retry forever.
      return new Response('ok (unhandled event)', { status: 200 });
    }
  } catch (err) {
    console.error('clerk-webhook: unexpected error', err);
    return new Response('internal error', { status: 500 });
  }

  return new Response('ok', { status: 200 });
});
