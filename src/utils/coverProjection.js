// Daily projected cover state for a SKU over N days.
//
// Pure function. No store reads, no side effects. Caller assembles the
// inputs and passes them in.
//
// Projection math:
//   remaining(d) = on_hand − Σ velocity·d (with lift) + Σ POs landed by d
//   state(d):
//     remaining(d) <= 0                          → 'stockout'
//     remaining(d) / velocity < lead + safety    → 'restock'
//     otherwise                                   → 'healthy'
//   PO arrival on day d sets `poArrival = true` (marker, not a state)
//
// Velocity is the trailing-12W blended weekly velocity divided by 7,
// so callers should pre-compute it as `sold_12w / 12 / 7` (or replace
// with whatever blend they prefer).

/**
 * @typedef {Object} CoverInput
 * @property {number} on_hand
 * @property {number} dailyVelocity      // units per day (lift NOT applied)
 * @property {number} liftMultiplier     // ad-projection lift, 1.0 = none
 * @property {number} leadDays           // chase-PO lead time, days
 * @property {number} safetyDays         // safety stock cushion, days
 * @property {Array<{ daysFromToday: number, units: number }>} arrivals
 *           // PO arrival schedule. daysFromToday is integer >= 1.
 * @property {number} days               // horizon, e.g. 364 for 52 weeks
 */

/**
 * @typedef {Object} DayState
 * @property {number} d            // 0-indexed day from today
 * @property {number} remaining    // projected on-hand at start of day d
 * @property {'healthy'|'restock'|'stockout'} state
 * @property {boolean} poArrival   // a PO landed at start of day d
 */

/**
 * Projects daily state over the horizon. Returns an array of length `days`.
 *
 * @param {CoverInput} input
 * @returns {DayState[]}
 */
export function projectDailyCover(input) {
  const {
    on_hand = 0,
    dailyVelocity = 0,
    liftMultiplier = 1,
    leadDays = 0,
    safetyDays = 0,
    arrivals = [],
    days = 364,
  } = input;

  // Bucket arrivals by day so we don't iterate the array each iteration.
  const arrivalsByDay = new Map();
  for (const a of arrivals) {
    const d = Math.max(1, Math.round(a.daysFromToday || 0));
    arrivalsByDay.set(d, (arrivalsByDay.get(d) || 0) + (a.units || 0));
  }

  const liftedDailyVel = (dailyVelocity || 0) * (liftMultiplier || 1);
  const restockThreshold = (leadDays + safetyDays) * (liftedDailyVel || 0);

  const out = new Array(days);
  let remaining = on_hand;

  for (let d = 0; d < days; d++) {
    // PO landings happen at the start of the day before consumption.
    const arr = arrivalsByDay.get(d) || 0;
    if (arr > 0) remaining += arr;

    let state;
    if (remaining <= 0) {
      state = 'stockout';
    } else if (liftedDailyVel > 0 && remaining < restockThreshold) {
      state = 'restock';
    } else {
      state = 'healthy';
    }

    out[d] = {
      d,
      remaining: Math.round(remaining),
      state,
      poArrival: arr > 0,
    };

    // Consume the day's velocity at end of day.
    remaining -= liftedDailyVel;
  }

  return out;
}

/**
 * Forward weeks of cover at projected (lifted) demand. Floors to 1 decimal.
 *
 * @param {number} on_hand
 * @param {number} weeklyVelocity
 * @param {number} liftMultiplier
 * @returns {number|null}
 */
export function forwardWOS(on_hand, weeklyVelocity, liftMultiplier = 1) {
  const v = (weeklyVelocity || 0) * (liftMultiplier || 1);
  if (v <= 0) return null;
  if (!on_hand || on_hand <= 0) return 0;
  return Math.round((on_hand / v) * 10) / 10;
}

/**
 * Blend variants into a single product-level projection. By-product mode.
 * Inputs is an array of CoverInput, one per variant. Output is one
 * CoverInput representing the blended product:
 *   on_hand     = Σ on_hand
 *   velocity    = Σ velocity     (sum, not avg — the product moves at
 *                                 the combined rate of all its variants)
 *   arrivals    = concat all arrivals
 *
 * Stockout-day-driven blending: a product is in 'stockout' state on day d
 * if ANY of its variants is in stockout on day d (the earliest-stockout
 * variant defines the product's stockout). For 'restock' / 'healthy', use
 * the worst variant state. Caller can compute this by mapping projectDailyCover
 * over each variant and taking max-severity per day.
 *
 * @param {CoverInput[]} variantInputs
 * @returns {CoverInput}
 */
export function blendVariantInputs(variantInputs = []) {
  const out = {
    on_hand: 0,
    dailyVelocity: 0,
    liftMultiplier: 1,
    leadDays: 0,
    safetyDays: 0,
    arrivals: [],
    days: 364,
  };
  if (!variantInputs.length) return out;

  let maxLead = 0;
  let maxSafety = 0;
  let lift = variantInputs[0].liftMultiplier || 1;
  let maxDays = 364;

  for (const v of variantInputs) {
    out.on_hand        += v.on_hand || 0;
    out.dailyVelocity  += v.dailyVelocity || 0;
    out.arrivals       = out.arrivals.concat(v.arrivals || []);
    if ((v.leadDays || 0)   > maxLead)   maxLead   = v.leadDays;
    if ((v.safetyDays || 0) > maxSafety) maxSafety = v.safetyDays;
    if (v.days && v.days > maxDays) maxDays = v.days;
  }

  out.leadDays       = maxLead;
  out.safetyDays     = maxSafety;
  out.liftMultiplier = lift;
  out.days           = maxDays;
  return out;
}
