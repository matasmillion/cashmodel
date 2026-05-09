// Forecast assumptions — operator inputs that drive the inventory forecast:
//
//   plannedDailyAdSpend  — $/day the operator intends to spend
//   plannedMER           — revenue / ad-spend ratio they're targeting (3.0× form)
//
// Derived values (computed, not stored):
//   plannedDailyRevenue  = plannedDailyAdSpend × plannedMER
//   liftMultiplier       = plannedDailyRevenue / trailing7dDailyRevenue
//
// The lift multiplier propagates into state.assumptions.liftMultiplier (via
// AppContext dispatch) so existing consumers — cockpit FWOS, urgent reorders
// sizing, chase qty, OTB consumption, bridge chart, calendar projections —
// pick it up automatically.
//
// localStorage primary. No Supabase mirror yet (one-operator surface).

const KEY = 'cashmodel_forecast_assumptions';

const DEFAULTS = {
  plannedDailyAdSpend: 11500,
  plannedMER: 3.0,
};

export function readForecastAssumptions() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch { return { ...DEFAULTS }; }
}

export function writeForecastAssumptions(patch) {
  const next = { ...readForecastAssumptions(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); }
  catch (err) { console.error('forecastAssumptionsStore write:', err); }
  return next;
}

/**
 * Pure derivation. Returns { plannedDailyRevenue, liftMultiplier }.
 *
 * @param {number} plannedDailyAdSpend
 * @param {number} plannedMER
 * @param {number} trailing7dDailyRevenue   used to compute lift; falls back
 *                                          to a baseline if zero/missing.
 */
export function deriveForecast({ plannedDailyAdSpend, plannedMER, trailing7dDailyRevenue }) {
  const plannedDailyRevenue = (Number(plannedDailyAdSpend) || 0) * (Number(plannedMER) || 0);
  let liftMultiplier = 1.10;
  if (trailing7dDailyRevenue > 0 && plannedDailyRevenue > 0) {
    liftMultiplier = plannedDailyRevenue / trailing7dDailyRevenue;
  }
  // Cap the lift so a tiny baseline doesn't produce absurd projections.
  if (liftMultiplier < 0.5)  liftMultiplier = 0.5;
  if (liftMultiplier > 5.0)  liftMultiplier = 5.0;
  return { plannedDailyRevenue, liftMultiplier };
}
