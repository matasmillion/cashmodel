// Sell-through snapshot cache + projection math.
//
// This is a pure cache of the most recent Shopify pull (variant inventory +
// per-day units sold over the trailing 90 days) plus the math that turns
// those facts into "days of inventory remaining" under five different
// trailing windows.
//
// No Supabase mirror in v1 — the data is fully reconstructible from
// Shopify on demand. Writes overwrite the previous snapshot.

const STORAGE_KEY = 'cashmodel_sell_through_snapshot';

export const SELL_THROUGH_WINDOWS = [7, 14, 30, 60, 90];

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

// Sum units sold across the trailing `windowDays` days, ending today.
// `salesByDay` is `{ 'YYYY-MM-DD': units }`. Missing days count as 0.
export function unitsInWindow(salesByDay, windowDays, today = new Date()) {
  if (!salesByDay) return 0;
  let total = 0;
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = isoDate(d);
    total += salesByDay[key] || 0;
  }
  return total;
}

// Days of inventory remaining at the trailing average daily pace.
// Returns null when there's no observed sell-through (we cannot project off
// zero velocity). Returns 0 when on-hand is zero.
export function computeDaysRemaining(salesByDay, inventoryQty, windowDays) {
  if (inventoryQty == null) return null;
  if (inventoryQty <= 0) return 0;
  const sold = unitsInWindow(salesByDay, windowDays);
  if (sold <= 0) return null;
  const avgDaily = sold / windowDays;
  return Math.floor(inventoryQty / avgDaily);
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
