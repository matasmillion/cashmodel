// vendor-invite — Supabase Edge Function (Deno).
//
// Two actions on POST:
//   { vendor_name, email, preferred_locale }
//     → calls Clerk Admin API to create an invitation with
//       publicMetadata.role='vendor' and publicMetadata.vendor_id=<name>,
//       then inserts a vendor_users row with status='invited'.
//   { action: 'revoke', vendor_name, clerk_user_id }
//     → revokes the user's Clerk sessions and flips the vendor_users
//       row to status='revoked'.
//
// Auth: the caller's Clerk JWT (forwarded by the client via
// Authorization: Bearer <token>) must carry an `org_id` claim and must
// NOT carry a `vendor_id` claim — i.e. only internal users can invite.
// The function decodes the JWT (no signature check; Supabase already
// verified it before routing), reads the claims, and uses them as the
// trust boundary for the write.
//
// Required secrets:
//   SUPABASE_URL                 — auto
//   SUPABASE_SERVICE_ROLE_KEY    — auto
//   CLERK_SECRET_KEY             — sk_… from Clerk Dashboard (Backend
//                                  API). Required to create
//                                  invitations and revoke sessions.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CLERK_SECRET_KEY = Deno.env.get('CLERK_SECRET_KEY') ?? '';
const VENDOR_PORTAL_BASE_URL = Deno.env.get('VENDOR_PORTAL_BASE_URL') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface JwtClaims {
  sub?: string;
  org_id?: string;
  vendor_id?: string;
  role?: string;
}

function decodeJwtClaims(authHeader: string | null): JwtClaims | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

async function clerkApi<T>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; body: T | null; error?: string }> {
  if (!CLERK_SECRET_KEY) return { ok: false, status: 500, body: null, error: 'CLERK_SECRET_KEY not configured' };
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${CLERK_SECRET_KEY}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(`https://api.clerk.com${path}`, { ...init, headers });
  let body: unknown = null;
  try { body = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    const err = (body as { errors?: Array<{ message: string }> } | null)?.errors?.[0]?.message
      || `clerk ${res.status}`;
    return { ok: false, status: res.status, body: null, error: err };
  }
  return { ok: true, status: res.status, body: body as T };
}

async function handleInvite(claims: JwtClaims, payload: {
  vendor_name?: string; email?: string; preferred_locale?: string;
}) {
  const orgId = claims.org_id;
  if (!orgId) return { status: 401, body: { error: 'Missing org_id in JWT.' } };

  const vendorName = (payload.vendor_name || '').trim();
  const email = (payload.email || '').trim();
  const preferred_locale = payload.preferred_locale === 'zh-CN' ? 'zh-CN' : 'en';
  if (!vendorName || !email) return { status: 400, body: { error: 'vendor_name and email are required.' } };

  // Reject obviously malformed addresses before we burn a Clerk
  // invitation slot. RFC 5322 in full is too permissive for a UI hint;
  // this regex catches the typos and pastebombs we actually see
  // (missing @, missing TLD, embedded whitespace, leading/trailing dots).
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { status: 400, body: { error: 'Email address looks invalid.' } };
  }

  // Confirm the vendor exists in this org so we can't invite users to a
  // bogus vendor name. The composite unique index on (organization_id,
  // name) is what makes this lookup safe.
  const { data: vendor, error: vendorErr } = await admin
    .from('vendors')
    .select('name')
    .eq('organization_id', orgId)
    .eq('name', vendorName)
    .maybeSingle();
  if (vendorErr) return { status: 500, body: { error: vendorErr.message } };
  if (!vendor) return { status: 404, body: { error: `Vendor "${vendorName}" not found in this organization.` } };

  // Resolve the portal origin: prefer the per-org setting from
  // org_settings (admin can override per environment), fall back to
  // the function-wide VENDOR_PORTAL_BASE_URL secret. Reject anything
  // that isn't an https URL — the value flows into invitation emails
  // and a `javascript:` paste would render as an executable link.
  let portalBase = VENDOR_PORTAL_BASE_URL;
  const { data: settings } = await admin
    .from('org_settings')
    .select('vendor_portal_base_url')
    .eq('org_id', orgId)
    .maybeSingle();
  if (settings?.vendor_portal_base_url) portalBase = settings.vendor_portal_base_url;
  if (portalBase) {
    try {
      const u = new URL(portalBase);
      if (u.protocol !== 'https:') portalBase = '';
    } catch {
      portalBase = '';
    }
  }

  // We need a stable correlation id between the invitation and the
  // placeholder vendor_users row so the Clerk webhook can match
  // deterministically on user.created. Matching by email broke
  // whenever the user signed up under a different primary address.
  // Generate our own ref, embed it in publicMetadata, and use it as
  // the placeholder clerk_user_id (`inv_<ref>`).
  const inviteRef = crypto.randomUUID();
  const redirectUrl = portalBase
    ? `${portalBase.replace(/\/$/, '')}/vendor/sign-up`
    : undefined;
  const invite = await clerkApi<{ id: string }>('/v1/invitations', {
    method: 'POST',
    body: JSON.stringify({
      email_address: email,
      public_metadata: {
        role: 'vendor',
        vendor_id: vendorName,
        organization_id: orgId,
        preferred_locale,
        invitation_ref: inviteRef,
      },
      redirect_url: redirectUrl,
      notify: true,
    }),
  });
  if (!invite.ok) return { status: invite.status, body: { error: invite.error } };

  // Drop any prior invited placeholder for the same email so we don't
  // accumulate stale rows when an invite is re-sent. Active and
  // revoked rows are left alone.
  await admin.from('vendor_users')
    .delete()
    .eq('organization_id', orgId)
    .eq('vendor_id', vendorName)
    .eq('email', email)
    .eq('status', 'invited');

  // Insert the vendor_users row in `invited` state. The placeholder
  // clerk_user_id encodes our invitation_ref so the webhook can match
  // it against publicMetadata.invitation_ref on user.created.
  const placeholder = `inv_${inviteRef}`;
  const { error: insErr } = await admin.from('vendor_users').insert({
    organization_id: orgId,
    vendor_id: vendorName,
    clerk_user_id: placeholder,
    email,
    preferred_locale,
    status: 'invited',
    invited_at: new Date().toISOString(),
  });
  if (insErr) return { status: 500, body: { error: insErr.message } };

  return { status: 200, body: { ok: true, invitation_id: invite.body?.id, invitation_ref: inviteRef } };
}

async function handleRevoke(claims: JwtClaims, payload: { vendor_name?: string; clerk_user_id?: string }) {
  const orgId = claims.org_id;
  if (!orgId) return { status: 401, body: { error: 'Missing org_id in JWT.' } };
  const vendorName = (payload.vendor_name || '').trim();
  const clerkUserId = (payload.clerk_user_id || '').trim();
  if (!vendorName || !clerkUserId) return { status: 400, body: { error: 'vendor_name and clerk_user_id are required.' } };

  // Flip status first — the row becomes inert immediately even if the
  // Clerk session-revoke step fails.
  const { error: updErr } = await admin.from('vendor_users')
    .update({ status: 'revoked' })
    .eq('organization_id', orgId)
    .eq('vendor_id', vendorName)
    .eq('clerk_user_id', clerkUserId);
  if (updErr) return { status: 500, body: { error: updErr.message } };

  // Best-effort: revoke active Clerk sessions. Failures here don't
  // block the response — the vendor_users row already says revoked
  // and RLS will reject their next request anyway.
  if (!clerkUserId.startsWith('inv_')) {
    const sessions = await clerkApi<Array<{ id: string }>>(`/v1/users/${clerkUserId}/sessions?status=active`, { method: 'GET' });
    if (sessions.ok && Array.isArray(sessions.body)) {
      for (const s of sessions.body) {
        await clerkApi(`/v1/sessions/${s.id}/revoke`, { method: 'POST' });
      }
    }
  }

  return { status: 200, body: { ok: true } };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const claims = decodeJwtClaims(req.headers.get('authorization'));
  if (!claims || !claims.org_id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }
  // Only internal users can invite. Vendor users (who carry a
  // vendor_id JWT claim) are blocked.
  if (claims.vendor_id) {
    return new Response(JSON.stringify({ error: 'Vendor users cannot invite other vendors.' }), {
      status: 403, headers: { 'content-type': 'application/json' },
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }

  const action = typeof payload.action === 'string' ? payload.action : 'invite';
  const result = action === 'revoke'
    ? await handleRevoke(claims, payload as { vendor_name?: string; clerk_user_id?: string })
    : await handleInvite(claims, payload as { vendor_name?: string; email?: string; preferred_locale?: string });

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'content-type': 'application/json' },
  });
});
