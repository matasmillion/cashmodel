// Sell-through snapshot cache + projection math.
//
// Pure cache of the most recent Shopify pull (variant inventory + per-day
// units sold over the trailing 90 days) plus the math that turns those
// facts into sales velocity and days of cover.
//
// Tracked variants are mirrored to Supabase (best-effort) so the cron job
// `sell-through-alert` can read which variants this org actively manages.
// localStorage stays the source of truth in the browser; the mirror is
// fire-and-forget and never blocks UI writes.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';
import { getCurrentOrgIdSync } from '../lib/auth';

const STORAGE_KEY = 'cashmodel_sell_through_snapshot';
const TRACKED_KEY = 'cashmodel_sell_through_tracked';
const LEAD_TIME_KEY = 'cashmodel_sell_through_lead_time';

export const SELL_THROUGH_WINDOWS = [7, 14, 30, 90];
export const DEFAULT_LEAD_TIME_DAYS = 70;

// Blended-velocity weights. 7d catches recent acceleration, 30d is the
// stable signal most reorder decisions are made on, 90d is the long-term
// floor. Sum to 1.
const BLEND_WEIGHTS = { 7: 0.5, 30: 0.3, 90: 0.2 };

// ─── Snapshot cache ──────────────────────────────────────────────────────────

export function readLocal() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeLocal(snapshot) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota exceeded — silently drop. The view will refetch on next sync.
  }
}

export function clearLocal() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

// ─── Velocity & cover math ───────────────────────────────────────────────────

// Sum units sold across the trailing `windowDays` calendar days, ending today.
// Inclusive of today AND `windowDays` prior — i.e. a 7d window spans 8
// calendar buckets. Matches the convention every inventory dashboard we've
// looked at: "L7" of a sale today + 7 days ago is 2, not 1.
export function unitsInWindow(salesByDay, windowDays, today = new Date()) {
  if (!salesByDay) return 0;
  let total = 0;
  for (let i = 0; i <= windowDays; i++) {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    total += salesByDay[isoDate(d)] || 0;
  }
  return total;
}

// Daily velocity for a single trailing window (units / day). Returns null
// when the window is empty so callers can render "—" instead of zero.
export function velocityForWindow(salesByDay, windowDays, today = new Date()) {
  const sold = unitsInWindow(salesByDay, windowDays, today);
  if (sold <= 0) return null;
  return sold / windowDays;
}

// Naïve days of cover for a window — on-hand divided by that window's
// velocity, ignoring incoming POs. This is the per-cell number shown in
// each window column so the user can see how runway varies by which
// timeframe they trust.
export function naiveDaysCover(salesByDay, inventoryQty, windowDays, today = new Date()) {
  if (inventoryQty == null) return null;
  if (inventoryQty <= 0) return 0;
  const v = velocityForWindow(salesByDay, windowDays, today);
  if (v == null || v <= 0) return null;
  return Math.floor(inventoryQty / v);
}

// Blended velocity — half recent, third mid-term, fifth long-term. Drops
// any window with zero activity and renormalizes weights so we don't
// mis-blend when a brand new variant only has 7d of data.
export function computeBlendedVelocity(salesByDay, today = new Date()) {
  let totalWeight = 0;
  let weighted = 0;
  for (const [w, weight] of Object.entries(BLEND_WEIGHTS)) {
    const v = velocityForWindow(salesByDay, Number(w), today);
    if (v == null || v <= 0) continue;
    weighted += v * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return null;
  return weighted / totalWeight;
}

// PO-aware days of cover. Simulates day-by-day: subtract velocity each
// day, add allocated PO units the day they land. Returns the day index
// when remaining first crosses zero. `poArrivals` is an array of
// `{ daysFromToday: number, units: number }` already allocated to this
// variant. Capped at 365 days.
export function computeDaysOfCover(velocity, onHand, poArrivals = [], horizon = 365) {
  if (onHand == null) return null;
  if (onHand <= 0) return 0;
  if (velocity == null || velocity <= 0) {
    // No observed sell-through. If POs are en route they extend cover
    // arbitrarily; otherwise return null so the UI shows "—".
    return poArrivals.length ? horizon : null;
  }
  const arrivalsByDay = new Map();
  for (const a of poArrivals) {
    const d = Math.max(1, Math.round(a.daysFromToday));
    arrivalsByDay.set(d, (arrivalsByDay.get(d) || 0) + (a.units || 0));
  }
  let remaining = onHand;
  for (let day = 1; day <= horizon; day++) {
    remaining -= velocity;
    const inbound = arrivalsByDay.get(day);
    if (inbound) remaining += inbound;
    if (remaining <= 0) return day;
  }
  return horizon;
}

// ─── Status pill ─────────────────────────────────────────────────────────────

// Inventory health bucket the row should render. Mirrors the spec in
// the plan file: Sold Out > Severely Overstocked > Restock Now > Healthy.
export function statusForRow({ onHand, daysOfCover, leadTime }) {
  if ((onHand || 0) <= 0) return 'sold_out';
  if (daysOfCover == null) return 'unknown';
  if (daysOfCover > 200) return 'severely_overstocked';
  if (daysOfCover <= (leadTime || DEFAULT_LEAD_TIME_DAYS) + 14) return 'restock_now';
  return 'healthy';
}

// ─── Lead time (per-variant override) ────────────────────────────────────────

export function readLeadTimes() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LEAD_TIME_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getLeadTime(variantId, fallback = DEFAULT_LEAD_TIME_DAYS) {
  const map = readLeadTimes();
  const v = map[variantId];
  return typeof v === 'number' && v > 0 ? v : fallback;
}

export function setLeadTime(variantId, days) {
  if (typeof window === 'undefined') return;
  const map = readLeadTimes();
  if (!days || days <= 0) delete map[variantId];
  else map[variantId] = Math.round(Number(days));
  try { window.localStorage.setItem(LEAD_TIME_KEY, JSON.stringify(map)); } catch { /* ignore */ }
  // If the variant is tracked, push the override to the cloud row so the
  // alert cron uses the same lead time the operator sees in the UI.
  if (readTracked().has(variantId)) {
    mirrorLeadTimeToCloud(variantId, map[variantId] || DEFAULT_LEAD_TIME_DAYS).catch(err => {
      console.error('mirrorLeadTimeToCloud:', err);
    });
  }
}

async function mirrorLeadTimeToCloud(variantId, leadDays) {
  if (!IS_SUPABASE_ENABLED) return;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return;
  const db = await getAuthedSupabase();
  await db.from('sell_through_tracked')
    .update({ lead_time_days: leadDays })
    .eq('organization_id', orgId)
    .eq('variant_id', variantId);
}

// ─── Tracked variants ────────────────────────────────────────────────────────
//
// User-curated set of variant IDs they actively manage. Stored in
// localStorage for instant UI response, mirrored to the Supabase table
// `sell_through_tracked` so the daily Slack cron can read it without a
// browser session.

export function readTracked() {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(TRACKED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function writeTracked(set) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TRACKED_KEY, JSON.stringify([...set]));
  } catch {
    // Quota exceeded — silently drop.
  }
}

// Toggle tracking, mirror to Supabase. Returns the updated Set
// synchronously; the cloud write is fire-and-forget.
export function toggleTracked(variantId, meta = {}) {
  const set = readTracked();
  const wasTracked = set.has(variantId);
  if (wasTracked) set.delete(variantId);
  else set.add(variantId);
  writeTracked(set);
  mirrorTrackedToCloud(variantId, !wasTracked, meta).catch(err => {
    console.error('mirrorTrackedToCloud:', err);
  });
  return set;
}

async function mirrorTrackedToCloud(variantId, isTracked, meta) {
  if (!IS_SUPABASE_ENABLED) return;
  const orgId = getCurrentOrgIdSync();
  if (!orgId) return;
  const db = await getAuthedSupabase();
  if (isTracked) {
    await db.from('sell_through_tracked').upsert(
      {
        organization_id: orgId,
        variant_id: variantId,
        sku: meta.sku || '',
        product_title: meta.productTitle || '',
        variant_title: meta.variantTitle || '',
        lead_time_days: getLeadTime(variantId),
      },
      { onConflict: 'organization_id,variant_id' },
    );
  } else {
    await db.from('sell_through_tracked')
      .delete()
      .eq('organization_id', orgId)
      .eq('variant_id', variantId);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Back-compat shim: kept so existing consumers don't break mid-rollout.
// Will be removed once SellThrough.jsx no longer references it.
export function computeDaysRemaining(salesByDay, inventoryQty, windowDays) {
  return naiveDaysCover(salesByDay, inventoryQty, windowDays);
}
