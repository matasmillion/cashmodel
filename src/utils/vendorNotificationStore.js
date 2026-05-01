// @ts-check
// Notification dispatcher. Internal-side store called from createPO,
// transitionPO('placed'), and the (future) sample-submit hook in the
// PLM. Never imported from src/components/vendor/*.
//
// Two responsibilities:
//   1. Append an audit row to `vendor_notifications` (append-only — see
//      CLAUDE.md "Append-only data" list; this table is added there too).
//   2. Invoke the `vendor-notify` Supabase edge function which composes
//      the localized email and hands it to the configured email
//      provider.
//
// The function call is fire-and-forget — production code paths must
// never block on email delivery.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync, getCurrentUserIdSync, getClerkToken } from '../lib/auth';

const FUNCTIONS_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '') + '/functions/v1/vendor-notify';

const EVENT_TYPES = new Set(['po.placed', 'sample.requested']);

async function appendNotification(row) {
  if (!IS_SUPABASE_ENABLED) return null;
  const db = await getAuthedSupabase();
  if (!db) return null;
  const { error } = await db.from('vendor_notifications').insert(row);
  if (error) console.error('appendNotification:', error);
  return row;
}

async function invokeEdgeFunction(payload) {
  if (!FUNCTIONS_URL || !IS_SUPABASE_ENABLED) return;
  const token = await getClerkToken('supabase');
  if (!token) return;
  try {
    await fetch(FUNCTIONS_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      // No await on .json() — this is fire-and-forget. The edge
      // function persists its own delivery audit row.
      keepalive: true,
    });
  } catch (err) {
    // Email failures must never block a PO placement.
    console.error('vendor-notify dispatch:', err);
  }
}

// Public surface ────────────────────────────────────────────────────────────

// Dispatched from productionStore.transitionPO('placed').
export async function notifyNewPO({ vendor_id, po_id, po_code, style_id, units, due_date }) {
  if (!vendor_id || !po_id) return null;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return null;
  const row = {
    organization_id: orgId,
    vendor_id,
    event_type: 'po.placed',
    subject_id: po_id,
    payload: { po_code, style_id, units, due_date },
    actor_user_id: getCurrentUserIdSync(),
    created_at: new Date().toISOString(),
  };
  await appendNotification(row);
  invokeEdgeFunction({ event_type: 'po.placed', vendor_id, subject_id: po_id, payload: row.payload });
  return row;
}

// Dispatched from the PLM sample-submit path. Kept generic so the PLM
// can pass whatever sample shape it has (id + style + type are the only
// required fields).
export async function notifyNewSample({ vendor_id, sample_id, style_id, sample_type, requested_at }) {
  if (!vendor_id || !sample_id) return null;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return null;
  const row = {
    organization_id: orgId,
    vendor_id,
    event_type: 'sample.requested',
    subject_id: sample_id,
    payload: { style_id, sample_type, requested_at },
    actor_user_id: getCurrentUserIdSync(),
    created_at: new Date().toISOString(),
  };
  await appendNotification(row);
  invokeEdgeFunction({ event_type: 'sample.requested', vendor_id, subject_id: sample_id, payload: row.payload });
  return row;
}

// Read-side: list recent dispatches for a single vendor. Admin-only;
// RLS denies vendor JWTs on this table. Used by VendorNotificationLog
// inside the vendor editor.
export async function listVendorNotifications(vendor_name, { limit = 50 } = {}) {
  if (!vendor_name) return [];
  const orgId = getCurrentOrgIdSync();
  if (!IS_SUPABASE_ENABLED || !orgId) return [];
  const db = await getAuthedSupabase();
  if (!db) return [];
  const { data, error } = await db
    .from('vendor_notifications')
    .select('id, event_type, subject_id, payload, delivery_status, delivery_error, actor_user_id, created_at, delivered_at')
    .eq('organization_id', orgId)
    .eq('vendor_id', vendor_name)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('listVendorNotifications:', error);
    return [];
  }
  return data || [];
}

// vendor_notifications is append-only (see CLAUDE.md).
export function updateVendorNotification() {
  throw new Error('vendor_notifications is append-only. Inserts only.');
}
export function deleteVendorNotification() {
  throw new Error('vendor_notifications is append-only. Inserts only.');
}

export const NOTIFICATION_EVENT_TYPES = EVENT_TYPES;
