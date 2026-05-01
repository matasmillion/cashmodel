// @ts-check
// Admin-side store for vendor_users — the table that pairs Clerk users
// with vendor records. Used by the "Portal Access" section in
// VendorManager and any future admin tooling.
//
// Vendor-facing code MUST NOT import this module. Vendors have their
// own narrow surface in vendorPortalStore.js. RLS prevents a vendor
// JWT from inserting/listing other vendors' users anyway, but keeping
// the module boundary stops accidents.
//
// Per CLAUDE.md: one file per library; vendor_id throughout this
// codebase stores the vendor's NAME, not vendors.id (UUID).

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync, getClerkToken } from '../lib/auth';

const FUNCTIONS_BASE = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '') + '/functions/v1';

// List vendor_users rows for a single vendor. Admin-only; RLS lets a
// vendor user read only their own row, so we never accidentally leak.
export async function listVendorUsers(vendorName) {
  if (!vendorName) return [];
  const orgId = getCurrentOrgIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId) return [];
  const db = await getAuthedSupabase();
  if (!db) return [];
  const { data, error } = await db
    .from('vendor_users')
    .select('clerk_user_id, email, status, preferred_locale, invited_at, joined_at')
    .eq('organization_id', orgId)
    .eq('vendor_id', vendorName)
    .order('invited_at', { ascending: false });
  if (error) {
    console.error('listVendorUsers:', error);
    return [];
  }
  return data || [];
}

// Invite a new vendor user. Calls the vendor-invite Edge Function which
// (a) creates a Clerk invitation with the right publicMetadata so the
// JWT will carry vendor_id, and (b) inserts the vendor_users row with
// status='invited'. The clerk-webhook flips status→active when the
// vendor completes sign-up.
export async function inviteVendorUser({ vendor_name, email, preferred_locale = 'en' }) {
  if (!vendor_name || !email) {
    return { ok: false, error: 'vendor_name and email are required' };
  }
  const orgId = getCurrentOrgIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId) {
    return { ok: false, error: 'Cloud sync is not enabled.' };
  }
  const token = await getClerkToken('supabase');
  if (!token) return { ok: false, error: 'No Clerk session.' };
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/vendor-invite`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ vendor_name, email, preferred_locale }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body?.error || `HTTP ${res.status}` };
    return { ok: true, ...body };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// Soft-revoke a vendor user. Marks the row revoked; the edge function
// also revokes their Clerk session so they're booted from the portal.
export async function revokeVendorUser({ vendor_name, clerk_user_id }) {
  if (!vendor_name || !clerk_user_id) {
    return { ok: false, error: 'vendor_name and clerk_user_id are required' };
  }
  const orgId = getCurrentOrgIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId) {
    return { ok: false, error: 'Cloud sync is not enabled.' };
  }
  const token = await getClerkToken('supabase');
  if (!token) return { ok: false, error: 'No Clerk session.' };
  try {
    const res = await fetch(`${FUNCTIONS_BASE}/vendor-invite`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'revoke', vendor_name, clerk_user_id }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body?.error || `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
