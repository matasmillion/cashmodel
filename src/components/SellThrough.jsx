// Sell-Through — projects days of inventory remaining for every Shopify
// variant under five trailing windows (7 / 14 / 30 / 60 / 90 days).
//
// Shopify is the source of truth. The view fetches a fresh snapshot
// (variants + per-day sales) from the Admin API via the Supabase
// proxy, caches it in localStorage, and recomputes projections on
// every mode/sort/filter toggle.

import { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, Plug, Star } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  fetchShopifyVariantsWithInventory,
  fetchShopifyVariantSalesByDay,
} from '../utils/liveDataSync';
import {
  SELL_THROUGH_WINDOWS,
  computeDaysRemaining,
  unitsInWindow,
  readLocal,
  writeLocal,
  readTracked,
  toggleTracked,
} from '../utils/sellThroughStore';

const FR = {
  slate: '#3A3A3A',
  salt: '#F5F0E8',
  sand: '#EBE5D5',
  stone: '#716F70',
  good: '#3B6D11',
  warn: '#854F0B',
  bad: '#A32D2D',
};

const STOCK_FILTERS = ['all', 'in-stock', 'low', 'out'];
const STOCK_LABELS = { all: 'All', 'in-stock': 'In stock', low: 'Low (<14d)', out: 'Out of stock' };

const TRACKING_FILTERS = ['all', 'tracked'];
const TRACKING_LABELS = { all: 'All variants', tracked: 'Tracked only' };

export default function SellThrough() {
  const { dispatch } = useApp();

  const [snapshot, setSnapshot] = useState(() => readLocal());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('days'); // 'days' | 'units'
  const [stockFilter, setStockFilter] = useState('all');
  const [trackingFilter, setTrackingFilter] = useState('all'); // 'all' | 'tracked'
  const [tracked, setTracked] = useState(() => readTracked());
  const [sort, setSort] = useState({ key: 'window-7', dir: 'desc' });

  const onToggleTracked = (variantId) => {
    const next = toggleTracked(variantId);
    setTracked(new Set(next));
  };

  // Reset sort direction when mode flips, since "biggest" inverts meaning.
  useEffect(() => {
    setSort(s => ({ ...s, dir: 'desc' }));
  }, [mode]);

  async function syncFromShopify() {
    setLoading(true);
    setError(null);
    try {
      const [variants, salesByVariant] = await Promise.all([
        fetchShopifyVariantsWithInventory(),
        fetchShopifyVariantSalesByDay({ days: 90 }),
      ]);
      const merged = variants.map(v => ({
        ...v,
        salesByDay: salesByVariant[v.variantId] || {},
      }));
      const next = { syncedAt: new Date().toISOString(), variants: merged };
      writeLocal(next);
      setSnapshot(next);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  const rows = useMemo(() => {
    if (!snapshot?.variants) return [];

    const decorated = snapshot.variants.map(v => {
      const windows = {};
      for (const w of SELL_THROUGH_WINDOWS) {
        windows[w] = {
          units: unitsInWindow(v.salesByDay, w),
          days: computeDaysRemaining(v.salesByDay, v.inventoryQuantity, w),
        };
      }
      return { ...v, windows };
    });

    const q = search.trim().toLowerCase();
    const filtered = decorated.filter(v => {
      if (trackingFilter === 'tracked' && !tracked.has(v.variantId)) return false;
      if (q) {
        const hay = `${v.productTitle} ${v.variantTitle} ${v.sku}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (stockFilter === 'in-stock' && (v.inventoryQuantity || 0) <= 0) return false;
      if (stockFilter === 'out' && (v.inventoryQuantity || 0) > 0) return false;
      if (stockFilter === 'low') {
        const d7 = v.windows[7].days;
        if (d7 == null || d7 >= 14) return false;
      }
      return true;
    });

    const dir = sort.dir === 'asc' ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      const va = sortValue(a, sort.key, mode);
      const vb = sortValue(b, sort.key, mode);
      // null sinks to the bottom regardless of direction.
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string') return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });

    return sorted;
  }, [snapshot, search, stockFilter, trackingFilter, tracked, sort, mode]);

  const stats = useMemo(() => computeStats(snapshot, tracked), [snapshot, tracked]);

  const onSort = (key) => {
    setSort(prev => {
      if (prev.key !== key) return { key, dir: 'desc' };
      if (prev.dir === 'desc') return { key, dir: 'asc' };
      return { key: 'window-7', dir: 'desc' };
    });
  };

  return (
    <div className="space-y-6">
      <Header />

      <Stats stats={stats} syncedAt={snapshot?.syncedAt} />

      <Toolbar
        search={search}
        onSearch={setSearch}
        mode={mode}
        onMode={setMode}
        loading={loading}
        onSync={syncFromShopify}
      />

      <ChipRow
        label="Tracking"
        value={trackingFilter}
        onChange={setTrackingFilter}
        options={TRACKING_FILTERS}
        labels={TRACKING_LABELS}
      />

      <ChipRow
        label="Stock"
        value={stockFilter}
        onChange={setStockFilter}
        options={STOCK_FILTERS}
        labels={STOCK_LABELS}
      />

      {error && (
        <div
          className="rounded-xl p-4 text-xs"
          style={{ background: 'rgba(163,45,45,0.06)', border: `1px solid rgba(163,45,45,0.25)`, color: FR.bad, fontFamily: "'Inter', sans-serif" }}
        >
          Couldn’t reach Shopify: {error}
        </div>
      )}

      {!snapshot && !loading && !error && (
        <EmptyState onConnect={() => dispatch({ type: 'SET_TAB', payload: 'integrations' })} />
      )}

      {snapshot && (
        <Table
          rows={rows}
          mode={mode}
          sort={sort}
          onSort={onSort}
          tracked={tracked}
          onToggleTracked={onToggleTracked}
        />
      )}
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function Header() {
  return (
    <div>
      <h2 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 24 }}>
        Sell-Through
      </h2>
      <p className="text-xs mt-1" style={{ color: FR.stone, maxWidth: 640 }}>
        Days of inventory remaining for every variant, projected from trailing daily
        sell-through across five windows. Switch to <em>Units sold</em> to rank what moved.
      </p>
    </div>
  );
}

function Stats({ stats, syncedAt }) {
  const items = [
    { label: 'Total variants', value: stats.variantCount, sub: `${stats.productCount} products` },
    { label: 'Tracked', value: stats.trackedCount, sub: 'starred for restock' },
    { label: 'Low stock · <14d', value: stats.low, sub: 'on the 7-day window', tone: stats.low > 0 ? FR.bad : FR.slate },
    { label: 'Last synced', value: syncedAt ? formatRelative(syncedAt) : '—', sub: syncedAt ? new Date(syncedAt).toLocaleString() : 'never' },
  ];
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
      {items.map((it, i) => (
        <div key={i} className="rounded-xl p-4" style={{ background: 'white', border: `0.5px solid rgba(58,58,58,0.15)` }}>
          <div style={{ fontSize: 10, color: 'rgba(58,58,58,0.55)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{it.label}</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, lineHeight: 1, marginTop: 8, color: it.tone || FR.slate }}>
            {it.value}
          </div>
          <div style={{ fontSize: 11, color: FR.stone, marginTop: 6 }}>{it.sub}</div>
        </div>
      ))}
    </div>
  );
}

function Toolbar({ search, onSearch, mode, onMode, loading, onSync }) {
  return (
    <div
      className="rounded-xl"
      style={{
        background: 'white',
        border: `0.5px solid rgba(58,58,58,0.15)`,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 240,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: FR.salt,
          border: `0.5px solid rgba(58,58,58,0.1)`,
          borderRadius: 6,
          padding: '8px 12px',
        }}
      >
        <Search size={13} style={{ color: FR.stone }} />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search product, variant or SKU…"
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 12.5, color: FR.slate, fontFamily: "'Inter', sans-serif" }}
        />
      </div>

      <div
        role="tablist"
        aria-label="Display mode"
        style={{
          display: 'inline-flex',
          background: FR.salt,
          border: `0.5px solid rgba(58,58,58,0.1)`,
          borderRadius: 6,
          padding: 2,
        }}
      >
        {[['days', 'Days remaining'], ['units', 'Units sold']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => onMode(key)}
            style={{
              border: 'none',
              background: mode === key ? '#fff' : 'transparent',
              color: mode === key ? FR.slate : FR.stone,
              fontSize: 12,
              letterSpacing: '0.02em',
              padding: '6px 12px',
              borderRadius: 4,
              cursor: 'pointer',
              boxShadow: mode === key ? '0 0 0 0.5px rgba(58,58,58,0.1)' : 'none',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        onClick={onSync}
        disabled={loading}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: FR.slate,
          color: FR.salt,
          border: 'none',
          borderRadius: 6,
          padding: '8px 14px',
          fontSize: 12,
          letterSpacing: '0.02em',
          cursor: loading ? 'progress' : 'pointer',
          opacity: loading ? 0.7 : 1,
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Syncing…' : 'Sync Shopify'}
      </button>
    </div>
  );
}

function ChipRow({ label, value, onChange, options, labels }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: FR.stone, marginRight: 6, minWidth: 64 }}>{label}</span>
      {options.map(k => {
        const active = value === k;
        return (
          <button
            key={k}
            onClick={() => onChange(k)}
            style={{
              fontSize: 11,
              letterSpacing: '0.04em',
              padding: '5px 12px',
              borderRadius: 5,
              border: active ? 'none' : `0.5px solid rgba(58,58,58,0.15)`,
              background: active ? FR.sand : '#fff',
              color: active ? FR.slate : FR.stone,
              cursor: 'pointer',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {labels[k]}
          </button>
        );
      })}
    </div>
  );
}

function Table({ rows, mode, sort, onSort, tracked, onToggleTracked }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: `0.5px solid rgba(58,58,58,0.15)` }}>
      <div className="overflow-x-auto">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Inter', sans-serif" }}>
          <thead>
            <tr style={{ background: FR.sand }}>
              <Th label="" k="tracked" align="center" sort={sort} onSort={onSort} width={40} />
              <Th label="Product" k="product" sort={sort} onSort={onSort} />
              <Th label="Variant" k="variant" sort={sort} onSort={onSort} />
              <Th label="SKU" k="sku" sort={sort} onSort={onSort} />
              <Th label="On hand" k="onhand" align="right" sort={sort} onSort={onSort} />
              {SELL_THROUGH_WINDOWS.map(w => (
                <Th
                  key={w}
                  label={`${w}d`}
                  caption={mode === 'days' ? 'Days remaining' : 'Units sold'}
                  k={`window-${w}`}
                  align="right"
                  sort={sort}
                  onSort={onSort}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5 + SELL_THROUGH_WINDOWS.length} style={{ padding: '32px 14px', textAlign: 'center', color: FR.stone, fontSize: 12 }}>
                  No variants match.
                </td>
              </tr>
            )}
            {rows.map(v => {
              const isTracked = tracked.has(v.variantId);
              return (
                <tr key={v.variantId} style={{ borderTop: `0.5px solid rgba(58,58,58,0.07)` }}>
                  <td style={{ padding: '13px 0', textAlign: 'center', width: 40 }}>
                    <button
                      onClick={() => onToggleTracked(v.variantId)}
                      title={isTracked ? 'Untrack this variant' : 'Track this variant'}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        padding: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        color: isTracked ? FR.sienna : 'rgba(58,58,58,0.25)',
                      }}
                    >
                      <Star size={14} fill={isTracked ? FR.sienna : 'none'} strokeWidth={1.5} />
                    </button>
                  </td>
                  <td style={{ padding: '13px 14px', fontFamily: "'Cormorant Garamond', serif", fontSize: 15, color: FR.slate }}>{v.productTitle}</td>
                  <td style={{ padding: '13px 14px', color: FR.stone, fontSize: 12.5 }}>{v.variantTitle}</td>
                  <td style={{ padding: '13px 14px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, color: FR.stone, letterSpacing: '0.02em' }}>{v.sku || '—'}</td>
                  <td style={{ padding: '13px 14px', textAlign: 'right', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: FR.slate }}>{v.inventoryQuantity}</td>
                  {SELL_THROUGH_WINDOWS.map(w => (
                    <MetricCell key={w} window={v.windows[w]} mode={mode} />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ label, caption, k, align = 'left', sort, onSort, width }) {
  const active = sort.key === k;
  const sortable = k !== 'tracked';
  const caret = !sortable ? '' : active ? (sort.dir === 'desc' ? '▼' : '▲') : '▾';
  return (
    <th
      onClick={sortable ? () => onSort(k) : undefined}
      style={{
        textAlign: align,
        verticalAlign: 'bottom',
        padding: '12px 14px',
        color: FR.slate,
        fontWeight: 500,
        letterSpacing: '0.04em',
        fontSize: 11,
        textTransform: 'uppercase',
        borderBottom: `0.5px solid rgba(58,58,58,0.12)`,
        cursor: sortable ? 'pointer' : 'default',
        userSelect: 'none',
        background: active ? 'rgba(255,255,255,0.45)' : 'transparent',
        width: width || 'auto',
      }}
    >
      {label}
      {sortable && (
        <span style={{ marginLeft: 4, fontSize: 9, color: active ? FR.slate : 'rgba(58,58,58,0.35)' }}>{caret}</span>
      )}
      {caption && (
        <span style={{ display: 'block', fontSize: 9.5, fontWeight: 400, color: FR.stone, letterSpacing: '0.06em', marginTop: 3, textTransform: 'uppercase' }}>
          {caption}
        </span>
      )}
    </th>
  );
}

function MetricCell({ window, mode }) {
  if (mode === 'units') {
    return (
      <td style={{ padding: '13px 14px', textAlign: 'right', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: FR.slate }}>
        {window.units || 0}
      </td>
    );
  }
  const d = window.days;
  const tone = d == null ? FR.stone : d < 14 ? FR.bad : d <= 30 ? FR.warn : FR.good;
  return (
    <td style={{ padding: '13px 14px', textAlign: 'right', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: tone }}>
      {d == null ? '—' : d}
    </td>
  );
}

function EmptyState({ onConnect }) {
  return (
    <div
      className="rounded-xl"
      style={{
        background: 'white',
        border: `0.5px solid rgba(58,58,58,0.15)`,
        padding: '48px 32px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: FR.slate, marginBottom: 8 }}>
        Connect Shopify to see sell-through
      </div>
      <p style={{ fontSize: 13, color: FR.stone, maxWidth: 480, margin: '0 auto 20px' }}>
        Sell-through projections are computed from your live Shopify variant
        inventory and the trailing 90 days of orders.
      </p>
      <button
        onClick={onConnect}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: FR.slate, color: FR.salt,
          border: 'none', borderRadius: 6, padding: '10px 18px',
          fontSize: 12, letterSpacing: '0.02em', cursor: 'pointer',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <Plug size={12} /> Connect Shopify
      </button>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sortValue(v, key, mode) {
  if (key === 'product') return v.productTitle || '';
  if (key === 'variant') return v.variantTitle || '';
  if (key === 'sku') return v.sku || '';
  if (key === 'onhand') return v.inventoryQuantity || 0;
  if (key.startsWith('window-')) {
    const w = Number(key.slice(7));
    return mode === 'units' ? v.windows[w].units : v.windows[w].days;
  }
  return 0;
}

function computeStats(snapshot, tracked) {
  if (!snapshot?.variants?.length) {
    return { variantCount: 0, productCount: 0, low: 0, outOfStock: 0, trackedCount: 0 };
  }
  const products = new Set();
  let low = 0;
  let outOfStock = 0;
  let trackedCount = 0;
  for (const v of snapshot.variants) {
    products.add(v.productTitle);
    if (tracked?.has(v.variantId)) trackedCount += 1;
    if ((v.inventoryQuantity || 0) <= 0) {
      outOfStock += 1;
      continue;
    }
    const d7 = computeDaysRemaining(v.salesByDay, v.inventoryQuantity, 7);
    if (d7 != null && d7 < 14) low += 1;
  }
  return {
    variantCount: snapshot.variants.length,
    productCount: products.size,
    low,
    outOfStock,
    trackedCount,
  };
}

function formatRelative(iso) {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
