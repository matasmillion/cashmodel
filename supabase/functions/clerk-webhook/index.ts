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
  | { type: 'user.deleted'; data: { id: string; deleted: boolean } }
  | { type: 'session.created' | 'session.ended' | 'session.removed' | 'session.revoked'; data: ClerkSession };

type ClerkSession = {
  id: string;
  user_id: string;
  client_id?: string;
  status?: string;
  created_at?: number;
  updated_at?: number;
  last_active_at?: number;
};

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

// ─────────────────────────────────────────────────────────────────────
// auth_events — append-only audit log writes. Service role bypasses
// RLS so these inserts always succeed regardless of who's signed in.
// ─────────────────────────────────────────────────────────────────────

type AuthEventName =
  | 'sign_in_success' | 'sign_out'
  | 'mfa_enrolled' | 'mfa_removed'
  | 'session_revoked' | 'password_reset_completed';

async function writeAuthEvent(
  userId: string,
  eventName: AuthEventName,
  metadata: Record<string, unknown>,
) {
  if (!userId) return;
  const { error } = await supabase
    .from('auth_events')
    .insert({ user_id: userId, event: eventName, metadata });
  if (error) {
    // Don't fail the webhook over an audit-log miss; log + continue.
    console.warn('clerk-webhook: auth_events insert failed', error);
  }
}

// Set-diff helper for detecting MFA factor changes between an old and
// new Clerk user payload. Returns { enrolled, removed } string arrays
// of factor types that changed.
function diffMfaFactors(prev: ClerkUser | null, next: ClerkUser): {
  enrolled: string[]; removed: string[];
} {
  const prevTypes = new Set<string>();
  const nextTypes = new Set<string>();
  if (prev) {
    for (const pk of prev.passkeys ?? []) prevTypes.add(`passkey:${pk.name || ''}`);
    if (prev.totp_enabled) prevTypes.add('totp');
    if (prev.backup_code_enabled) prevTypes.add('backup_code');
  }
  for (const pk of next.passkeys ?? []) nextTypes.add(`passkey:${pk.name || ''}`);
  if (next.totp_enabled) nextTypes.add('totp');
  if (next.backup_code_enabled) nextTypes.add('backup_code');
  const enrolled: string[] = [];
  const removed: string[] = [];
  for (const t of nextTypes) if (!prevTypes.has(t)) enrolled.push(t);
  for (const t of prevTypes) if (!nextTypes.has(t)) removed.push(t);
  return { enrolled, removed };
}

// Pull the existing public.users row so we can diff MFA factors on
// user.updated and emit mfa_enrolled / mfa_removed events as needed.
async function readUserMfaSnapshot(clerkUserId: string): Promise<ClerkUser | null> {
  const { data, error } = await supabase
    .from('users')
    .select('mfa_factors')
    .eq('clerk_user_id', clerkUserId)
    .maybeSingle();
  if (error || !data) return null;
  // Reconstruct enough of a ClerkUser shape that diffMfaFactors can
  // compare — we only need passkeys + totp + backup_code flags.
  const factors: Array<{ type: string; label?: string }> = data.mfa_factors || [];
  const passkeys: Array<{ name?: string }> = factors
    .filter(f => f.type === 'passkey')
    .map(f => ({ name: f.label }));
  return {
    id: clerkUserId,
    passkeys,
    totp_enabled: factors.some(f => f.type === 'totp'),
    backup_code_enabled: factors.some(f => f.type === 'backup_code'),
  };
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
      // For user.updated, snapshot the prior MFA state so we can diff
      // and emit mfa_enrolled / mfa_removed audit events.
      const prevSnapshot = event.type === 'user.updated'
        ? await readUserMfaSnapshot(u.id)
        : null;

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

      if (event.type === 'user.updated') {
        const { enrolled, removed } = diffMfaFactors(prevSnapshot, u);
        for (const factorKey of enrolled) {
          const [factor_type, label] = factorKey.split(':');
          await writeAuthEvent(u.id, 'mfa_enrolled', { factor_type, label });
        }
        for (const factorKey of removed) {
          const [factor_type, label] = factorKey.split(':');
          await writeAuthEvent(u.id, 'mfa_removed', { factor_type, label });
        }
      }
    } else if (event.type === 'user.deleted') {
      const id = event.data.id;
      // FK on auth_events cascades — deleting the user removes their
      // event history. That matches the published Data Retention
      // Policy §4 "User accounts (internal)" row.
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('clerk_user_id', id);
      if (error) {
        console.error('clerk-webhook: delete failed', error);
        return new Response('db delete failed', { status: 500 });
      }
    } else if (event.type === 'session.created') {
      await writeAuthEvent(event.data.user_id, 'sign_in_success', {
        session_id: event.data.id,
        client_id: event.data.client_id,
      });
    } else if (event.type === 'session.ended' || event.type === 'session.removed') {
      await writeAuthEvent(event.data.user_id, 'sign_out', {
        session_id: event.data.id,
        end_reason: event.type,
      });
    } else if (event.type === 'session.revoked') {
      await writeAuthEvent(event.data.user_id, 'session_revoked' as never, {
        session_id: event.data.id,
      });
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
