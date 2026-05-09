// PO → Shopify-variant arrival schedule.
//
// POs in `productionStore` reference an internal PLM `style_id` and don't
// know about Shopify variant IDs. To answer "how many units of variant X
// land on day Y" we have to:
//
//   1. Walk every open PO (placed | in_production) and compute its
//      expected landing day as `placed_at + lead_days` (received POs are
//      already on hand so they don't count as inbound).
//   2. Match the PO's style to Shopify variants. Lookup order:
//      a. Explicit mapping via variantMappingStore (source='manual' or
//         source='sync', confidence=1.0) — zero ambiguity.
//      b. Fuzzy title match (legacy fallback). When used, writes an
//         auto-fuzzy record to variantMappingStore for operator review
//         via VariantMapper at #product/library/variant-mapping.
//   3. Allocate the PO's `units` across sibling variants weighted by
//      blended velocity. Fast movers get more inbound; zero-velocity
//      siblings fall back to equal split.
//
// Output shape:
//   { [variantId]: [ { daysFromToday: number, units: number, poId, poCode } ] }

import { listPOs } from './productionStore';
import { listTechPacks } from './techPackStore';
import { computeBlendedVelocity } from './sellThroughStore';
import { listMappings, createMapping } from './variantMappingStore';

const OPEN_STATUSES = new Set(['placed', 'in_production']);

/**
 * Build a `{ variantId: [arrivals] }` map from open POs and a sell-through
 * snapshot.
 *
 * @param {Array} variants  Snapshot variants with `salesByDay` joined.
 * @returns {Promise<Record<string, Array<{ daysFromToday: number, units: number, poId: string, poCode: string }>>>}
 */
export async function buildPOArrivalsByVariant(variants) {
  const [pos, packs, allMappings] = await Promise.all([
    listPOs(),
    listTechPacks().catch(() => []),
    listMappings({}).catch(() => []),
  ]);

  const today = startOfDay(new Date());

  // Index techpacks by id.
  const packById = new Map();
  for (const p of packs) {
    if (p?.id) packById.set(p.id, p);
  }

  // Index active confirmed mappings by style_id → variant GIDs.
  // "Confirmed" = source is manual or sync (not auto-fuzzy pending review).
  const confirmedByStyle = new Map();
  for (const m of allMappings) {
    if (m.archived_at) continue;
    if (!m.style_id || !m.shopify_variant_gid) continue;
    if (!confirmedByStyle.has(m.style_id)) confirmedByStyle.set(m.style_id, []);
    confirmedByStyle.get(m.style_id).push(m);
  }

  // Track which (style_id, variantId) pairs already have auto-fuzzy records
  // so we don't create duplicates on repeated calls.
  const existingFuzzyKeys = new Set();
  for (const m of allMappings) {
    if (m.source === 'auto-fuzzy' && !m.archived_at) {
      existingFuzzyKeys.add(`${m.style_id}::${m.shopify_variant_gid}`);
    }
  }

  // Pre-compute per-variant blended velocity once.
  const velocityById = new Map();
  for (const v of variants) {
    velocityById.set(v.variantId, computeBlendedVelocity(v.salesByDay) || 0);
  }

  // Index variants by GID for explicit-mapping lookup.
  const variantByGid = new Map();
  for (const v of variants) {
    if (v.variantId) variantByGid.set(v.variantId, v);
  }

  // Group variants by normalized productTitle for fuzzy fallback.
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
    const landIn = Math.max(1, daysFromToday);

    // ── Step 1: explicit confirmed mapping ────────────────────────────────
    const confirmed = confirmedByStyle.get(po.style_id);
    let siblings;

    if (confirmed && confirmed.length > 0) {
      siblings = confirmed
        .map(m => variantByGid.get(m.shopify_variant_gid))
        .filter(Boolean);
    }

    // ── Step 2: fuzzy title fallback ──────────────────────────────────────
    if (!siblings || siblings.length === 0) {
      const pack = packById.get(po.style_id);
      const styleTitle = pack?.style_name || pack?.data?.styleName || '';
      const { matches, confidence } = findSiblingsWithConfidence(variantsByTitleKey, styleTitle);
      siblings = matches;

      if (siblings.length > 0 && po.style_id) {
        console.warn(
          `[poAllocations] fuzzy fallback for PO ${po.code || po.id}: style "${styleTitle}" → ` +
          `${siblings.length} variant(s) at ${Math.round(confidence * 100)}% confidence. ` +
          `Review at #product/library/variant-mapping.`,
        );
        // Register fuzzy mappings for operator review — fire-and-forget.
        for (const v of siblings) {
          const fuzzyKey = `${po.style_id}::${v.variantId}`;
          if (!existingFuzzyKeys.has(fuzzyKey)) {
            existingFuzzyKeys.add(fuzzyKey);
            createMapping({
              style_id: po.style_id,
              shopify_variant_gid: v.variantId,
              shopify_sku: v.sku || '',
              source: 'auto-fuzzy',
              confidence,
              reason: `auto-fuzzy from poAllocations for PO ${po.code || po.id}`,
            }).catch(err => console.error('poAllocations createMapping:', err));
          }
        }
      }
    }

    if (!siblings || siblings.length === 0) continue;

    // ── Velocity-weighted allocation ──────────────────────────────────────
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

// Returns `{ matches: variant[], confidence: 0–1 }`.
// Confidence is the length-ratio of the shorter title to the longer —
// a perfect exact match scores 1.0; a short PLM name matching a long
// Shopify title scores proportionally lower.
function findSiblingsWithConfidence(variantsByTitleKey, styleTitle) {
  const key = titleKey(styleTitle);
  if (!key) return { matches: [], confidence: 0 };

  const exact = variantsByTitleKey.get(key);
  if (exact) return { matches: exact, confidence: 1.0 };

  for (const [k, vs] of variantsByTitleKey) {
    if (k.includes(key) || key.includes(k)) {
      const confidence = Math.min(key.length, k.length) / Math.max(key.length, k.length);
      return { matches: vs, confidence: Math.round(confidence * 100) / 100 };
    }
  }
  return { matches: [], confidence: 0 };
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
