// PO → Shopify-variant arrival schedule.
//
// POs in `productionStore` reference an internal PLM `style_id` and don't
// know about Shopify variant IDs. To answer "how many units of variant X
// land on day Y" we have to:
//
//   1. Walk every open PO (placed | in_production) and compute its
//      expected landing day as `placed_at + lead_days` (received POs are
//      already on hand so they don't count as inbound).
//   2. Match the PO's style to a set of Shopify product variants. The
//      only join key we have today is title — the techPack's `style_name`
//      vs. Shopify's `productTitle` (case-insensitive substring match).
//   3. Allocate the PO's `units` across that style's variants weighted
//      by each variant's blended velocity. Fast movers get more inbound;
//      siblings with zero recent velocity fall back to equal split.
//
// Output shape:
//   { [variantId]: [ { daysFromToday: number, units: number, poId, poCode } ] }
//
// The cron / browser caller passes this map to `computeDaysOfCover`
// for each variant.

import { listPOs } from './productionStore';
import { listTechPacks } from './techPackStore';
import { computeBlendedVelocity } from './sellThroughStore';

const OPEN_STATUSES = new Set(['placed', 'in_production']);

/**
 * Build a `{ variantId: [arrivals] }` map from open POs and a sell-through
 * snapshot.
 *
 * @param {Array} variants  Snapshot variants with `salesByDay` joined.
 * @returns {Promise<Record<string, Array<{ daysFromToday: number, units: number, poId: string, poCode: string }>>>}
 */
export async function buildPOArrivalsByVariant(variants) {
  const [pos, packs] = await Promise.all([
    listPOs(),
    listTechPacks().catch(() => []),
  ]);

  const today = startOfDay(new Date());

  // Index techpacks by style_id (some PO rows store the techpack id) and by
  // normalized style_name so we can find the title to match against Shopify.
  const packById = new Map();
  for (const p of packs) {
    if (p?.id) packById.set(p.id, p);
  }

  // Pre-compute per-variant blended velocity once. Ignoring weight when zero
  // happens inside computeBlendedVelocity itself.
  const velocityById = new Map();
  for (const v of variants) {
    velocityById.set(v.variantId, computeBlendedVelocity(v.salesByDay) || 0);
  }

  // Group variants by normalized productTitle so the matcher can find
  // siblings cheaply.
  const variantsByTitleKey = new Map();
  for (const v of variants) {
    const key = titleKey(v.productTitle);
    if (!variantsByTitleKey.has(key)) variantsByTitleKey.set(key, []);
    variantsByTitleKey.get(key).push(v);
  }

  const out = {};

  for (const po of pos) {
    if (!OPEN_STATUSES.has(po.status)) continue;
    if (!po.placed_at) continue;
    const units = Number(po.units) || 0;
    if (units <= 0) continue;
    const lead = Number(po.lead_days) || 0;
    const placed = startOfDay(new Date(po.placed_at));
    const landingDate = new Date(placed);
    landingDate.setDate(landingDate.getDate() + lead);
    const daysFromToday = Math.round((landingDate - today) / 86_400_000);

    // Already-landed open POs (operator hasn't transitioned yet) project as
    // "lands tomorrow" so we don't pull cover backwards.
    const landIn = Math.max(1, daysFromToday);

    // Resolve siblings: prefer matching the PO's techpack title; if that
    // fails, try direct style_id-as-title; if that also fails, skip.
    const pack = packById.get(po.style_id);
    const styleTitle = pack?.style_name || pack?.data?.styleName || '';
    const siblings = findSiblings(variantsByTitleKey, styleTitle);
    if (!siblings.length) continue;

    // Velocity-weighted allocation. If everyone is zero-velocity, fall
    // back to equal split.
    const totalVelocity = siblings.reduce((s, v) => s + (velocityById.get(v.variantId) || 0), 0);
    let allocations;
    if (totalVelocity > 0) {
      allocations = siblings.map(v => ({
        variant: v,
        units: units * ((velocityById.get(v.variantId) || 0) / totalVelocity),
      }));
    } else {
      const each = units / siblings.length;
      allocations = siblings.map(v => ({ variant: v, units: each }));
    }

    for (const a of allocations) {
      const arr = out[a.variant.variantId] || (out[a.variant.variantId] = []);
      arr.push({
        daysFromToday: landIn,
        units: a.units,
        poId: po.id,
        poCode: po.code || '',
      });
    }
  }

  return out;
}

function titleKey(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Title match is case-insensitive bidirectional substring. Either the
// PLM style_name is contained in the Shopify productTitle or vice-versa.
// Good enough until the user asks to add an explicit mapping table.
function findSiblings(variantsByTitleKey, styleTitle) {
  const key = titleKey(styleTitle);
  if (!key) return [];
  const exact = variantsByTitleKey.get(key);
  if (exact) return exact;
  for (const [k, vs] of variantsByTitleKey) {
    if (k.includes(key) || key.includes(k)) return vs;
  }
  return [];
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
