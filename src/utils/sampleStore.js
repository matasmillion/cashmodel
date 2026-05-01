// @ts-check
// Sample request store. Keeps a thin write path so internal-side code
// (the PLM sample panel, today embedded inside TechPackBuilder.jsx) can
// persist a sample request to the cloud and trigger the vendor email
// without dragging the rest of the techpack store along.
//
// CLAUDE.md forbids refactoring TechPackBuilder.jsx, so this store is
// the integration seam: a follow-up patch wires the existing in-pack
// SamplePanel to call createSampleRequest(), and the rest of this
// module already does the right thing.
//
// localStorage primary + Supabase mirror, matching every other store
// in this folder.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync, getCurrentUserIdSync } from '../lib/auth';
import { notifyNewSample } from './vendorNotificationStore';

const LS_KEY = 'cashmodel_sample_requests';

function readLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function writeLocal(rows) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(rows)); }
  catch (err) { console.error('sampleStore write:', err); }
}
function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const VERDICTS = new Set(['Pending', 'Approved', 'Rejected', 'Resubmit']);

// Internal-side list — admin views, not vendor-facing. The vendor
// portal uses listVendorSamples() in vendorPortalStore.js, which
// strips internal fields.
export async function listSampleRequests({ vendor_id = null, style_id = null } = {}) {
  let rows = readLocal();
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    if (db) {
      let q = db.from('sample_requests').select('*').eq('organization_id', orgId);
      if (vendor_id) q = q.eq('vendor_id', vendor_id);
      if (style_id) q = q.eq('style_id', style_id);
      const { data, error } = await q.order('requested_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        rows = data;
      } else if (error) {
        console.error('listSampleRequests:', error);
      }
    }
  }
  return rows
    .filter(r => (vendor_id ? r.vendor_id === vendor_id : true))
    .filter(r => (style_id ? r.style_id === style_id : true));
}

export async function createSampleRequest(input = {}) {
  if (!input.vendor_id) throw new Error('createSampleRequest: vendor_id required');
  const now = new Date().toISOString();
  const row = {
    id: newId(),
    vendor_id: input.vendor_id,
    style_id: input.style_id || '',
    sample_type: input.sample_type || 'Proto',
    verdict: VERDICTS.has(input.verdict) ? input.verdict : 'Pending',
    courier: input.courier || '',
    tracking_number: input.tracking_number || '',
    notes: input.notes || '',
    internal_notes: input.internal_notes || '',
    cost_per_unit_usd: input.cost_per_unit_usd != null ? Number(input.cost_per_unit_usd) : null,
    requested_at: input.requested_at || now,
    received_at: input.received_at || null,
    created_at: now,
    updated_at: now,
  };

  const rows = readLocal();
  rows.push(row);
  writeLocal(rows);

  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    if (db) {
      const { error } = await db.from('sample_requests').insert({
        ...row,
        organization_id: orgId,
        user_id: getCurrentUserIdSync(),
      });
      if (error) console.error('createSampleRequest insert:', error);
    }
  }

  // Fire-and-forget vendor email + audit row.
  try {
    notifyNewSample({
      vendor_id: row.vendor_id,
      sample_id: row.id,
      style_id: row.style_id,
      sample_type: row.sample_type,
      requested_at: row.requested_at,
    });
  } catch (err) { console.error('notifyNewSample:', err); }

  return row;
}

const EDITABLE_FIELDS = new Set([
  'verdict', 'courier', 'tracking_number', 'notes', 'internal_notes',
  'cost_per_unit_usd', 'received_at',
]);

export async function updateSampleRequest(id, patch = {}) {
  if (!id) return null;
  const allowed = {};
  for (const k of Object.keys(patch)) {
    if (EDITABLE_FIELDS.has(k)) allowed[k] = patch[k];
  }
  if (Object.keys(allowed).length === 0) return null;
  if (allowed.verdict && !VERDICTS.has(allowed.verdict)) {
    throw new Error(`Invalid verdict: ${allowed.verdict}`);
  }

  const now = new Date().toISOString();
  const rows = readLocal();
  const idx = rows.findIndex(r => r.id === id);
  let updated = null;
  if (idx >= 0) {
    updated = { ...rows[idx], ...allowed, updated_at: now };
    rows[idx] = updated;
    writeLocal(rows);
  }
  const orgId = getCurrentOrgIdSync();
  if (IS_SUPABASE_ENABLED && orgId) {
    const db = await getAuthedSupabase();
    if (db) {
      const { error } = await db
        .from('sample_requests')
        .update({ ...allowed, updated_at: now })
        .eq('id', id)
        .eq('organization_id', orgId);
      if (error) console.error('updateSampleRequest:', error);
    }
  }
  return updated;
}
