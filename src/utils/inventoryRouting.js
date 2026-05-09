// Inventory routing — hash grammar `#inventory/<view>[/<id>]`.
//
// Mirrors plmRouting.js. Dispatches popstate on hash changes so router-
// aware effects pick up the change without a full reload.
//
// Views (mockup-locked):
//   #inventory/cockpit       — landing (daily view)
//   #inventory/inventory     — SKU master table
//   #inventory/sell-through  — velocity matrix
//   #inventory/otb           — quarterly Open-to-Buy
//   #inventory/pos           — PO list
//   #inventory/forecast      — forward 12 months
//   #inventory/sku/<sku>     — SKU drill-down

const INVENTORY_TAB = 'inventory';

export const INVENTORY_VIEWS = [
  'cockpit', 'inventory', 'sell-through', 'otb', 'pos', 'forecast',
];
const VIEW_SET = new Set(INVENTORY_VIEWS);
const DEFAULT_VIEW = 'cockpit';

/**
 * Parse the current hash into `{ view, sku }`.
 * - `#inventory/cockpit`         → { view: 'cockpit', sku: null }
 * - `#inventory/sku/AP-FOO-001`  → { view: 'sku', sku: 'AP-FOO-001' }
 * - bare `#inventory`            → { view: 'cockpit', sku: null }
 */
export function parseInventoryHash(hash = window.location.hash || '') {
  const stripped = hash.replace(/^#\/?/, '');
  const parts = stripped.split('/').filter(Boolean);
  if (parts[0] !== INVENTORY_TAB) {
    return { view: null, sku: null };
  }

  const second = parts[1];
  if (!second) return { view: DEFAULT_VIEW, sku: null };

  if (second === 'sku') {
    return { view: 'sku', sku: parts[2] || null };
  }

  if (VIEW_SET.has(second)) {
    return { view: second, sku: null };
  }

  return { view: DEFAULT_VIEW, sku: null };
}

/**
 * Build a hash string for the given view + optional SKU.
 *   buildInventoryHash({ view: 'cockpit' })          → '#inventory/cockpit'
 *   buildInventoryHash({ view: 'sku', sku: 'X' })    → '#inventory/sku/X'
 */
export function buildInventoryHash({ view = DEFAULT_VIEW, sku = null } = {}) {
  if (view === 'sku' && sku) {
    return `#${INVENTORY_TAB}/sku/${encodeURIComponent(sku)}`;
  }
  if (!VIEW_SET.has(view)) view = DEFAULT_VIEW;
  return `#${INVENTORY_TAB}/${view}`;
}

/**
 * Set the current hash and dispatch popstate so listeners react.
 */
export function setInventoryHash(parts) {
  const next = buildInventoryHash(parts);
  if (window.location.hash === next) return;
  window.location.hash = next;
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * Legacy redirects: old `#sell-through` and `#po-schedule` should land on
 * the new inventory views. Call once on app boot.
 */
export function migrateLegacyInventoryHash() {
  const h = window.location.hash || '';
  const stripped = h.replace(/^#\/?/, '');
  const first = stripped.split('/')[0];

  if (first === 'sell-through') {
    setInventoryHash({ view: 'sell-through' });
  } else if (first === 'po-schedule') {
    setInventoryHash({ view: 'pos' });
  }
}
