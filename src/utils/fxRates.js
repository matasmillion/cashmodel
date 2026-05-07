// USD ↔ CNY exchange rate. Pulls a daily-fresh quote from the public
// open.er-api.com endpoint (no key required, CORS-friendly) and caches
// the result for 24 h in localStorage. Every fabric pricing input pair
// in the FabricBuilder uses this to mirror the value in the other
// currency as the user types.
//
// Why an external API at all: most of our fabric is bought in RMB, but
// our books / margin math live in USD. Hard-coding a stale rate makes
// every quoted price look wrong by 5–10%. The fallback is only used if
// the network call fails — in that case the user sees "FX rate
// unavailable" and the conversion still works at the cached rate.

const CACHE_KEY = 'cashmodel_fx_usd_cny';
const TTL_MS = 24 * 60 * 60 * 1000;
// Conservative spot rate as of early 2026. Only used if the user is
// fully offline and has never fetched a real rate before.
const FALLBACK_USD_PER_CNY = 0.14;

let inflight = null;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (typeof obj?.usdPerCny !== 'number' || !obj.fetchedAt) return null;
    return obj;
  } catch { return null; }
}

function writeCache(obj) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); }
  catch (err) { console.error('fxRates write:', err); }
}

/**
 * Returns { usdPerCny: number, fetchedAt: number, stale: boolean }.
 * Uses the cached value if it's <24 h old; otherwise fetches a fresh
 * quote and updates the cache. Resolves to the fallback (with `stale:
 * true`) if both cache miss and network fail.
 */
export async function getUsdCnyRate() {
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return { ...cached, stale: false };
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/CNY');
      const data = await res.json();
      const usdPerCny = Number(data?.rates?.USD);
      if (!Number.isFinite(usdPerCny) || usdPerCny <= 0) throw new Error('Bad FX payload');
      const next = { usdPerCny, fetchedAt: Date.now() };
      writeCache(next);
      return { ...next, stale: false };
    } catch (err) {
      console.error('fxRates fetch:', err);
      if (cached) return { ...cached, stale: true };
      return { usdPerCny: FALLBACK_USD_PER_CNY, fetchedAt: 0, stale: true };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function cnyToUsd(cny, usdPerCny) {
  const v = Number(cny);
  if (!Number.isFinite(v) || !Number.isFinite(usdPerCny) || usdPerCny <= 0) return null;
  return Number((v * usdPerCny).toFixed(2));
}

export function usdToCny(usd, usdPerCny) {
  const v = Number(usd);
  if (!Number.isFinite(v) || !Number.isFinite(usdPerCny) || usdPerCny <= 0) return null;
  return Number((v / usdPerCny).toFixed(2));
}
