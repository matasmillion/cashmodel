// @ts-check
// Vendor portal store. Lives in src/utils/ per CLAUDE.md ("one file per
// library"). Public surface is intentionally narrow: the only readers
// are components under src/components/vendor/, and every one of them
// goes through `scopedQuery(vendorId, ...)` so the redaction cannot be
// bypassed by a UI mistake.
//
// Hard rules from CLAUDE.md (vendor surfaces):
//   • NEVER expose unit_cost_usd, total_cost, cost_per_unit_usd, margin
//   • NEVER expose vendor rating or internal notes
//   • NEVER return rows belonging to other vendors
//
// Linkage: Clerk user → vendor record. The bridge lives in the
// `vendor_users` table (see migrations). The Clerk webhook stamps the
// vendor_id into publicMetadata so it's also synchronously available
// from `getCurrentVendorIdSync()`.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';

// ── Cost / internal-data redaction ─────────────────────────────────────────
//
// WHITELIST, not blacklist. Any column not listed here is hidden from
// the vendor by default — adding a `total_landed_cost` migration
// tomorrow won't accidentally leak margin. If a new field genuinely
// needs to be vendor-visible, add it here explicitly.

const VISIBLE_PO_FIELDS = new Set([
  'id', 'code', 'organization_id', 'vendor_id', 'style_id',
  'units', 'status', 'lead_days', 'size_break',
  'placed_at', 'received_at', 'closed_at', 'cancelled_at',
  'notes', 'created_at', 'updated_at',
]);

const VISIBLE_SAMPLE_FIELDS = new Set([
  'id', 'organization_id', 'vendor_id', 'style_id',
  'sample_type', 'verdict', 'courier', 'tracking_number',
  'notes', 'requested_at', 'received_at',
  'created_at', 'updated_at',
]);

function project(row, allowed) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const k of Object.keys(row)) {
    if (allowed.has(k)) out[k] = row[k];
  }
  return out;
}

// ── Vendor identity (Clerk user → vendor record) ───────────────────────────

// Synchronous read of the active vendor name. The vendor_id throughout
// the codebase (purchase_orders.vendor_id, treatments.primary_vendor_id,
// etc.) stores the vendor's NAME. The webhook writes the same name
// into Clerk publicMetadata under the key `vendor_id` when the admin
// invites a vendor user.
export function getCurrentVendorIdSync() {
  if (typeof window === 'undefined') return null;
  const clerk = /** @type {any} */ (window).Clerk;
  const meta = clerk?.user?.publicMetadata;
  return (meta && typeof meta.vendor_id === 'string' && meta.vendor_id) || null;
}

// Loads the vendor profile (contact info, country, etc.) for the
// active vendor user. Looks up by name since that's the join key the
// rest of the codebase uses.
export async function resolveCurrentVendor() {
  const orgId = getCurrentOrgIdSync();
  const vendorName = getCurrentVendorIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId || !vendorName) return null;
  const db = await getAuthedSupabase();
  if (!db) return null;
  const { data, error } = await db
    .from('vendors')
    .select('id, name, country, city, primary_contact, email, phone, website')
    .eq('organization_id', orgId)
    .eq('name', vendorName)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

// ── scopedQuery: every read MUST flow through this ────────────────────────

// Wraps a Supabase query builder with the vendor scope. Throws if the
// caller forgets to pass a vendorId — better to crash loudly than to
// silently leak another vendor's rows.
export function scopedQuery(vendorId, queryBuilder) {
  if (!vendorId) throw new Error('scopedQuery: vendorId is required.');
  return queryBuilder.eq('vendor_id', vendorId);
}

// ── Purchase orders (vendor-facing, redacted) ──────────────────────────────

const STATUSES_VISIBLE_TO_VENDOR = new Set([
  'placed', 'in_production', 'received', 'closed', 'cancelled',
]);

// Vendors only ever see POs that have been placed — drafts are internal.
export async function listVendorPOs() {
  const orgId = getCurrentOrgIdSync();
  const vendorId = getCurrentVendorIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId || !vendorId) return [];
  const db = await getAuthedSupabase();
  if (!db) return [];
  const { data, error } = await scopedQuery(
    vendorId,
    db.from('purchase_orders')
      .select('*')
      .eq('organization_id', orgId)
  ).order('updated_at', { ascending: false });
  if (error) {
    console.error('listVendorPOs:', error);
    return [];
  }
  return (data || [])
    .filter(r => STATUSES_VISIBLE_TO_VENDOR.has(r.status))
    .map(r => project(r, VISIBLE_PO_FIELDS));
}

export async function getVendorPO(id) {
  if (!id) return null;
  const orgId = getCurrentOrgIdSync();
  const vendorId = getCurrentVendorIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId || !vendorId) return null;
  const db = await getAuthedSupabase();
  if (!db) return null;
  const { data, error } = await scopedQuery(
    vendorId,
    db.from('purchase_orders')
      .select('*')
      .eq('id', id)
      .eq('organization_id', orgId)
  ).maybeSingle();
  if (error || !data) return null;
  if (!STATUSES_VISIBLE_TO_VENDOR.has(data.status)) return null;
  return project(data, VISIBLE_PO_FIELDS);
}

// Vendor acknowledges a PO — appends an audit row. We never let the
// vendor mutate the PO row itself; status transitions stay an
// admin-side concern.
export async function acknowledgeVendorPO(po_id) {
  const orgId = getCurrentOrgIdSync();
  const vendorId = getCurrentVendorIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId || !vendorId || !po_id) return null;
  const db = await getAuthedSupabase();
  if (!db) return null;
  const row = {
    organization_id: orgId,
    vendor_id: vendorId,
    po_id,
    acknowledged_at: new Date().toISOString(),
  };
  const { error } = await db.from('vendor_po_acknowledgements').insert(row);
  if (error) {
    console.error('acknowledgeVendorPO:', error);
    return null;
  }
  return row;
}

// ── Sample requests (vendor-facing, projected) ─────────────────────────────

export async function listVendorSamples() {
  const orgId = getCurrentOrgIdSync();
  const vendorId = getCurrentVendorIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId || !vendorId) return [];
  const db = await getAuthedSupabase();
  if (!db) return [];
  const { data, error } = await scopedQuery(
    vendorId,
    db.from('sample_requests')
      .select('*')
      .eq('organization_id', orgId)
  ).order('requested_at', { ascending: false });
  if (error) {
    console.error('listVendorSamples:', error);
    return [];
  }
  return (data || []).map(r => project(r, VISIBLE_SAMPLE_FIELDS));
}

export async function getVendorSample(id) {
  if (!id) return null;
  const orgId = getCurrentOrgIdSync();
  const vendorId = getCurrentVendorIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId || !vendorId) return null;
  const db = await getAuthedSupabase();
  if (!db) return null;
  const { data, error } = await scopedQuery(
    vendorId,
    db.from('sample_requests')
      .select('*')
      .eq('id', id)
      .eq('organization_id', orgId)
  ).maybeSingle();
  if (error || !data) return null;
  return project(data, VISIBLE_SAMPLE_FIELDS);
}

// ── Vendor preferences (locale, contact email) ─────────────────────────────

// Persists the vendor user's preferred locale. Read by the email edge
// function (vendor-notify) so notification copy is rendered in the
// vendor's chosen language. Written from the account page.
export async function setVendorPreferredLocale(locale) {
  const orgId = getCurrentOrgIdSync();
  const vendorId = getCurrentVendorIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId || !vendorId || !locale) return null;
  const db = await getAuthedSupabase();
  if (!db) return null;
  const { error } = await db.from('vendor_users')
    .update({ preferred_locale: locale })
    .eq('organization_id', orgId)
    .eq('vendor_id', vendorId);
  if (error) console.error('setVendorPreferredLocale:', error);
  return { locale };
}

// Internal-side helper, used by vendorNotificationStore to look up which
// emails to send to and in what language. Not exposed to the vendor UI.
export async function listVendorRecipientsForOrg(orgId, vendorId) {
  if (!IS_SUPABASE_ENABLED || !orgId || !vendorId) return [];
  const db = await getAuthedSupabase();
  if (!db) return [];
  const { data, error } = await db.from('vendor_users')
    .select('email, preferred_locale')
    .eq('organization_id', orgId)
    .eq('vendor_id', vendorId)
    .eq('status', 'active');
  if (error) {
    console.error('listVendorRecipientsForOrg:', error);
    return [];
  }
  return data || [];
}

// VENDOR PORTAL — DO NOT export anything that returns cost, rating, or
// internal-notes fields from this module. If a future caller needs raw
// data, add a separate internal-side store; never relax the redaction
// here.
