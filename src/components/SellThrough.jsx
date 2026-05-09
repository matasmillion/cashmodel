// Sell-Through — sales velocity by trailing window plus a single
// PO-aware "Days of Cover" prediction per variant.
//
// Each window cell shows three lines: bold velocity (units/day), the
// raw math that produced it (X sold / Nd), and the naïve days of cover
// at that velocity ignoring inbound POs. The leftmost "Days of Cover"
// column is the consolidated number — blended velocity simulated
// against the PO arrival schedule.

import { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, Plug, Star, ChevronDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  fetchShopifyVariantsWithInventory,
  fetchShopifyVariantSalesByDay,
} from '../utils/liveDataSync';
import {
  SELL_THROUGH_WINDOWS,
  DEFAULT_LEAD_TIME_DAYS,
  unitsInWindow,
  velocityForWindow,
  naiveDaysCover,
  computeBlendedVelocity,
  computeDaysOfCover,
  statusForRow,
  getLeadTime,
  setLeadTime,
  readLocal,
  writeLocal,
  readTracked,
  toggleTracked,
} from '../utils/sellThroughStore';
import { buildPOArrivalsByVariant } from '../utils/poAllocations';

const FR = {
  slate: '#3A3A3A',
  salt: '#F5F0E8',
  sand: '#EBE5D5',
  stone: '#716F70',
  good: '#3B6D11',
  warn: '#854F0B',
  bad: '#A32D2D',
  sienna: '#A04A2C',
};

const STATUS_META = {
  sold_out:              { label: 'Sold Out',              fg: '#fff',     bg: FR.slate },
  restock_now:           { label: 'Restock Now',           fg: FR.warn,    bg: 'rgba(133,79,11,0.10)' },
  severely_overstocked:  { label: 'Severely Overstocked',  fg: FR.bad,     bg: 'rgba(163,45,45,0.10)' },
  healthy:               { label: 'Healthy',               fg: FR.good,    bg: 'rgba(59,109,17,0.10)' },
  unknown:               { label: '—',                     fg: FR.stone,   bg: 'transparent' },
};

const STOCK_FILTERS = ['all', 'in-stock', 'restock', 'out'];
const STOCK_LABELS = { all: 'All', 'in-stock': 'In stock', restock: 'Needs restock', out: 'Out of stock' };

const TRACKING_FILTERS = ['all', 'tracked'];
const TRACKING_LABELS = { all: 'All variants', tracked: 'Tracked only' };

// Default visible column set — Apple-simple. Everything else lives behind
// the "Columns ▾" dropdown.
const DEFAULT_COLUMNS = new Set([
  'tracked', 'variant', 'sku', 'onhand', 'cover', 'status',
  'window-7', 'window-14', 'window-30', 'window-90',
]);
const OPTIONAL_COLUMNS = [
  { key: 'brand',     label: 'Brand' },
  { key: 'cost',      label: 'Cost value' },
  { key: 'leadtime',  label: 'Lead time' },
];

export default function SellThrough() {
  const { dispatch } = useApp();

  const [snapshot, setSnapshot] = useState(() => readLocal());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [trackingFilter, setTrackingFilter] = useState('all');
  const [tracked, setTracked] = useState(() => readTracked());
  const [sort, setSort] = useState({ key: 'cover', dir: 'asc' });
  const [columns, setColumns] = useState(() => new Set(DEFAULT_COLUMNS));
  const [poArrivals, setPOArrivals] = useState({});
  const [leadTimeBump, setLeadTimeBump] = useState(0); // forces re-render after lead time edits

  const onToggleTracked = (v) => {
    const next = toggleTracked(v.variantId, {
      sku: v.sku,
      productTitle: v.productTitle,
      variantTitle: v.variantTitle,
    });
    setTracked(new Set(next));
  };

  // Recompute PO arrivals whenever the snapshot's variants change. POs
  // come from `productionStore` and the PLM techpack list, so this read
  // is async.
  useEffect(() => {
    let cancelled = false;
    if (!snapshot?.variants) {
      setPOArrivals({});
      return;
    }
    buildPOArrivalsByVariant(snapshot.variants)
      .then(map => { if (!cancelled) setPOArrivals(map); })
      .catch(err => { console.error('buildPOArrivalsByVariant:', err); if (!cancelled) setPOArrivals({}); });
    return () => { cancelled = true; };
  }, [snapshot]);

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
          velocity: velocityForWindow(v.salesByDay, w),
          naiveDays: naiveDaysCover(v.salesByDay, v.inventoryQuantity, w),
        };
      }
      const blendedVelocity = computeBlendedVelocity(v.salesByDay);
      const arrivals = poArrivals[v.variantId] || [];
      const onHand = v.inventoryQuantity || 0;
      const lead = getLeadTime(v.variantId);
      const cover = computeDaysOfCover(blendedVelocity, onHand, arrivals);
      const status = statusForRow({ onHand, daysOfCover: cover, leadTime: lead });
      return {
        ...v,
        windows,
        blendedVelocity,
        arrivals,
        leadTime: lead,
        daysOfCover: cover,
        status,
      };
    });

    const q = search.trim().toLowerCase();
    const filtered = decorated.filter(v => {
      if (trackingFilter === 'tracked' && !tracked.has(v.variantId)) return false;
      if (q) {
        const hay = `${v.productTitle} ${v.variantTitle} ${v.sku} ${v.productVendor || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (stockFilter === 'in-stock' && (v.inventoryQuantity || 0) <= 0) return false;
      if (stockFilter === 'out' && (v.inventoryQuantity || 0) > 0) return false;
      if (stockFilter === 'restock' && v.status !== 'restock_now' && v.status !== 'sold_out') return false;
      return true;
    });

    const dir = sort.dir === 'asc' ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string') return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });

    return sorted;
    // leadTimeBump is the recompute key for per-row lead-time edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, search, stockFilter, trackingFilter, tracked, sort, poArrivals, leadTimeBump]);

  const stats = useMemo(() => computeStats(rows, tracked), [rows, tracked]);

  const onSort = (key) => {
    setSort(prev => {
      if (prev.key !== key) return { key, dir: key === 'cover' ? 'asc' : 'desc' };
      return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
    });
  };

  const onLeadTimeChange = (variantId, value) => {
    setLeadTime(variantId, value);
    setLeadTimeBump(b => b + 1);
  };

  return (
    <div className="space-y-6">
      <Header />

      <Stats stats={stats} syncedAt={snapshot?.syncedAt} />

      <Toolbar
        search={search}
        onSearch={setSearch}
        loading={loading}
        onSync={syncFromShopify}
        columns={columns}
        onToggleColumn={(k) => {
          setColumns(prev => {
            const n = new Set(prev);
            if (n.has(k)) n.delete(k); else n.add(k);
            return n;
          });
        }}
      />

      <div className="flex flex-wrap gap-6">
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
      </div>

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
          sort={sort}
          onSort={onSort}
          tracked={tracked}
          onToggleTracked={onToggleTracked}
          onLeadTimeChange={onLeadTimeChange}
          columns={columns}
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
        Sales velocity per trailing window, with a single PO-aware days of cover prediction.
        Track variants you actively manage to get a daily Slack heads-up before they run out.
      </p>
    </div>
  );
}

function Stats({ stats, syncedAt }) {
  const items = [
    { label: 'Total variants', value: stats.variantCount, sub: `${stats.productCount} products` },
    { label: 'Tracked', value: stats.trackedCount, sub: 'starred for restock' },
    { label: 'At risk', value: stats.atRisk, sub: 'restock now / sold out', tone: stats.atRisk > 0 ? FR.warn : FR.slate },
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

function Toolbar({ search, onSearch, loading, onSync, columns, onToggleColumn }) {
  const [colsOpen, setColsOpen] = useState(false);
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
          placeholder="Search product, variant, SKU or brand…"
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 12.5, color: FR.slate, fontFamily: "'Inter', sans-serif" }}
        />
      </div>

      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setColsOpen(o => !o)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: FR.salt, color: FR.slate,
            border: `0.5px solid rgba(58,58,58,0.1)`, borderRadius: 6,
            padding: '7px 12px', fontSize: 12, letterSpacing: '0.02em',
            cursor: 'pointer', fontFamily: "'Inter', sans-serif",
          }}
        >
          Columns <ChevronDown size={11} />
        </button>
        {colsOpen && (
          <div
            onMouseLeave={() => setColsOpen(false)}
            style={{
              position: 'absolute', right: 0, top: 'calc(100% + 6px)',
              minWidth: 180, background: 'white',
              border: `0.5px solid rgba(58,58,58,0.15)`, borderRadius: 8,
              padding: 8, zIndex: 20, fontFamily: "'Inter', sans-serif",
              boxShadow: '0 6px 18px rgba(58,58,58,0.08)',
            }}
          >
            {OPTIONAL_COLUMNS.map(opt => {
              const checked = columns.has(opt.key);
              return (
                <label
                  key={opt.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', cursor: 'pointer',
                    fontSize: 12, color: FR.slate, borderRadius: 4,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleColumn(opt.key)}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        )}
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

function Table({ rows, sort, onSort, tracked, onToggleTracked, onLeadTimeChange, columns }) {
  const visible = (k) => columns.has(k);
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: `0.5px solid rgba(58,58,58,0.15)` }}>
      <div className="overflow-x-auto">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Inter', sans-serif" }}>
          <thead>
            <tr style={{ background: FR.sand }}>
              {visible('tracked') && <Th label="" k="tracked" align="center" sort={sort} onSort={onSort} width={40} />}
              {visible('variant') && <Th label="Variant" k="variant" sort={sort} onSort={onSort} />}
              {visible('sku') && <Th label="SKU" k="sku" sort={sort} onSort={onSort} />}
              {visible('brand') && <Th label="Brand" k="brand" sort={sort} onSort={onSort} />}
              {visible('onhand') && <Th label="On hand" k="onhand" align="right" sort={sort} onSort={onSort} />}
              {visible('cost') && <Th label="Cost value" k="cost" align="right" sort={sort} onSort={onSort} />}
              {visible('cover') && <Th label="Days of cover" caption="PO-aware" k="cover" align="right" sort={sort} onSort={onSort} />}
              {visible('leadtime') && <Th label="Lead time" k="leadtime" align="right" sort={sort} onSort={onSort} />}
              {visible('status') && <Th label="Status" k="status" sort={sort} onSort={onSort} />}
              {SELL_THROUGH_WINDOWS.map(w => visible(`window-${w}`) && (
                <Th
                  key={w}
                  label={`${w}D MA`}
                  caption="velocity"
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
                <td colSpan={20} style={{ padding: '32px 14px', textAlign: 'center', color: FR.stone, fontSize: 12 }}>
                  No variants match.
                </td>
              </tr>
            )}
            {rows.map(v => {
              const isTracked = tracked.has(v.variantId);
              const status = STATUS_META[v.status] || STATUS_META.unknown;
              return (
                <tr key={v.variantId} style={{ borderTop: `0.5px solid rgba(58,58,58,0.07)` }}>
                  {visible('tracked') && (
                    <td style={{ padding: '13px 0', textAlign: 'center', width: 40 }}>
                      <button
                        onClick={() => onToggleTracked(v)}
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
                  )}
                  {visible('variant') && (
                    <td style={{ padding: '13px 14px' }}>
                      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 15, color: FR.slate, lineHeight: 1.15 }}>{v.productTitle}</div>
                      <div style={{ fontSize: 11, color: FR.stone, marginTop: 2 }}>{v.variantTitle || '—'}</div>
                    </td>
                  )}
                  {visible('sku') && (
                    <td style={{ padding: '13px 14px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, color: FR.stone, letterSpacing: '0.02em' }}>
                      {v.sku || '—'}
                    </td>
                  )}
                  {visible('brand') && (
                    <td style={{ padding: '13px 14px', fontSize: 12, color: FR.stone }}>{v.productVendor || '—'}</td>
                  )}
                  {visible('onhand') && (
                    <td style={{ padding: '13px 14px', textAlign: 'right', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: FR.slate }}>
                      {v.inventoryQuantity}
                    </td>
                  )}
                  {visible('cost') && (
                    <td style={{ padding: '13px 14px', textAlign: 'right', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: FR.stone }}>
                      {v.unitCost != null ? `$${(v.unitCost * (v.inventoryQuantity || 0)).toFixed(0)}` : '—'}
                    </td>
                  )}
                  {visible('cover') && <CoverCell value={v.daysOfCover} status={v.status} />}
                  {visible('leadtime') && (
                    <td style={{ padding: '13px 14px', textAlign: 'right' }}>
                      <input
                        type="number"
                        defaultValue={v.leadTime || DEFAULT_LEAD_TIME_DAYS}
                        onBlur={(e) => onLeadTimeChange(v.variantId, e.target.value)}
                        style={{
                          width: 56, textAlign: 'right',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          fontSize: 12, color: FR.slate,
                          background: FR.salt, border: `0.5px solid rgba(58,58,58,0.1)`,
                          borderRadius: 4, padding: '3px 6px',
                        }}
                      />
                      <span style={{ marginLeft: 4, fontSize: 10, color: FR.stone }}>d</span>
                    </td>
                  )}
                  {visible('status') && (
                    <td style={{ padding: '13px 14px' }}>
                      <span style={{
                        display: 'inline-block', fontSize: 10.5, letterSpacing: '0.06em',
                        padding: '4px 10px', borderRadius: 5, color: status.fg, background: status.bg,
                        textTransform: 'uppercase',
                      }}>{status.label}</span>
                    </td>
                  )}
                  {SELL_THROUGH_WINDOWS.map(w => visible(`window-${w}`) && (
                    <WindowCell key={w} window={v.windows[w]} windowDays={w} />
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

function CoverCell({ value, status }) {
  const fg = status === 'restock_now' ? FR.warn
           : status === 'sold_out' ? FR.bad
           : status === 'severely_overstocked' ? FR.bad
           : status === 'healthy' ? FR.good
           : FR.stone;
  const display = value == null ? '—' : value >= 365 ? '365+' : `${value}d`;
  return (
    <td style={{ padding: '13px 14px', textAlign: 'right' }}>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: fg, lineHeight: 1 }}>
        {display}
      </div>
    </td>
  );
}

function WindowCell({ window, windowDays }) {
  const v = window.velocity;
  const naive = window.naiveDays;
  const naiveTone = naive == null ? FR.stone
                  : naive < 14 ? FR.bad
                  : naive <= 30 ? FR.warn
                  : FR.good;
  return (
    <td style={{ padding: '11px 14px', textAlign: 'right', verticalAlign: 'top' }}>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: FR.slate, lineHeight: 1 }}>
        {v == null ? '—' : `${v.toFixed(2)}`}
        {v != null && <span style={{ fontSize: 10, color: FR.stone, marginLeft: 3, fontFamily: "'Inter', sans-serif" }}> /d</span>}
      </div>
      <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10, color: FR.stone, marginTop: 3 }}>
        {window.units} sold / {windowDays}d
      </div>
      <div style={{ fontSize: 10, color: naiveTone, marginTop: 3, letterSpacing: '0.04em' }}>
        {naive == null ? '—' : `${naive}d cover`}
      </div>
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

function sortValue(v, key) {
  if (key === 'variant') return v.productTitle || '';
  if (key === 'sku') return v.sku || '';
  if (key === 'brand') return v.productVendor || '';
  if (key === 'onhand') return v.inventoryQuantity || 0;
  if (key === 'cost') return v.unitCost != null ? v.unitCost * (v.inventoryQuantity || 0) : null;
  if (key === 'cover') return v.daysOfCover;
  if (key === 'leadtime') return v.leadTime || 0;
  if (key === 'status') {
    // Group similar statuses for sorting: at-risk first, then healthy, then overstock.
    const order = { sold_out: 0, restock_now: 1, unknown: 2, healthy: 3, severely_overstocked: 4 };
    return order[v.status] ?? 2;
  }
  if (key.startsWith('window-')) {
    const w = Number(key.slice(7));
    return v.windows[w].velocity;
  }
  return 0;
}

function computeStats(rows, tracked) {
  if (!rows?.length) {
    return { variantCount: 0, productCount: 0, atRisk: 0, trackedCount: 0 };
  }
  const products = new Set();
  let atRisk = 0;
  let trackedCount = 0;
  for (const v of rows) {
    products.add(v.productTitle);
    if (tracked?.has(v.variantId)) trackedCount += 1;
    if (v.status === 'restock_now' || v.status === 'sold_out') atRisk += 1;
  }
  return {
    variantCount: rows.length,
    productCount: products.size,
    atRisk,
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
