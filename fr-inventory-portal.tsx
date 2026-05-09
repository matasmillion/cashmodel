import React, { useState, useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, ReferenceLine, Cell, ComposedChart } from 'recharts';
import { Search, Bell, ArrowUpRight, ArrowDownRight, Plus, AlertCircle, Package, TrendingUp, DollarSign, Layers, Truck, Sparkles, MoreHorizontal, Check, Clock, X } from 'lucide-react';

const BRAND = {
  slate: '#3A3A3A',
  salt: '#F5F0E8',
  sand: '#EBE5D5',
  stone: '#716F70',
  soil: '#9A816B',
  sea: '#B5C7D3',
  sage: '#ADBDA3',
  sienna: '#D4956A',
  fadedSlate: '#3A3A3A99',
  line: '#3A3A3A1A',
  lineSoft: '#3A3A3A0F',
  bg: '#F5F0E8',
  card: '#FBF7EE',
  good: '#6B8E6B',
  warn: '#C8924A',
  bad: '#A8543C',
};

const serif = { fontFamily: '"Cormorant Garamond", "Garamond", "Times New Roman", serif' };
const sans = { fontFamily: '"Inter", "Helvetica Neue", system-ui, sans-serif' };
const mono = { fontFamily: '"SF Mono", "JetBrains Mono", "Menlo", monospace', fontVariantNumeric: 'tabular-nums' };

const SEP = '\u00B7'; // middle dot, used only in JSX text via {SEP}
const ARROW = '\u2192';
const INF = '\u221E';

const SKUS = [
  { sku: 'AP-HD-BBHOOD-25-1-SLATE-S', style: 'Borderless Basic Hoodie', cat: 'Hoodies', tier: 'Staple', color: 'Slate', size: 'S', cost: 32, retail: 117, onHand: 142, onOrder: 200, allocated: 18, sold4w: 32, sold12w: 86, firstRcvd: '2025-08-12', img: '#3A3A3A' },
  { sku: 'AP-HD-BBHOOD-25-1-SLATE-M', style: 'Borderless Basic Hoodie', cat: 'Hoodies', tier: 'Staple', color: 'Slate', size: 'M', cost: 32, retail: 117, onHand: 88, onOrder: 250, allocated: 22, sold4w: 54, sold12w: 156, firstRcvd: '2025-08-12', img: '#3A3A3A' },
  { sku: 'AP-HD-BBHOOD-25-1-SLATE-L', style: 'Borderless Basic Hoodie', cat: 'Hoodies', tier: 'Staple', color: 'Slate', size: 'L', cost: 32, retail: 117, onHand: 31, onOrder: 200, allocated: 14, sold4w: 48, sold12w: 142, firstRcvd: '2025-08-12', img: '#3A3A3A' },
  { sku: 'AP-HD-BBHOOD-25-1-SAND-S', style: 'Borderless Basic Hoodie', cat: 'Hoodies', tier: 'Staple', color: 'Sand', size: 'S', cost: 32, retail: 117, onHand: 218, onOrder: 0, allocated: 8, sold4w: 14, sold12w: 52, firstRcvd: '2025-08-12', img: '#EBE5D5' },
  { sku: 'AP-HD-BBHOOD-25-1-SAND-M', style: 'Borderless Basic Hoodie', cat: 'Hoodies', tier: 'Staple', color: 'Sand', size: 'M', cost: 32, retail: 117, onHand: 196, onOrder: 0, allocated: 12, sold4w: 22, sold12w: 78, firstRcvd: '2025-08-12', img: '#EBE5D5' },
  { sku: 'AP-PA-BBSWEAT-25-1-SLATE-S', style: 'Borderless Basic Sweatpants', cat: 'Sweatpants', tier: 'Staple', color: 'Slate', size: 'S', cost: 28, retail: 117, onHand: 64, onOrder: 150, allocated: 10, sold4w: 28, sold12w: 82, firstRcvd: '2025-09-04', img: '#3A3A3A' },
  { sku: 'AP-PA-BBSWEAT-25-1-SLATE-M', style: 'Borderless Basic Sweatpants', cat: 'Sweatpants', tier: 'Staple', color: 'Slate', size: 'M', cost: 28, retail: 117, onHand: 22, onOrder: 200, allocated: 16, sold4w: 46, sold12w: 134, firstRcvd: '2025-09-04', img: '#3A3A3A' },
  { sku: 'AP-PA-BBSWEAT-25-1-SLATE-L', style: 'Borderless Basic Sweatpants', cat: 'Sweatpants', tier: 'Staple', color: 'Slate', size: 'L', cost: 28, retail: 117, onHand: 38, onOrder: 200, allocated: 12, sold4w: 41, sold12w: 118, firstRcvd: '2025-09-04', img: '#3A3A3A' },
  { sku: 'AP-PA-ECARGO-10-W30-1-SAND', style: 'Eroded Edges Cargo', cat: 'Cargos', tier: 'Drop', color: 'Sand', size: 'W30', cost: 48, retail: 198, onHand: 18, onOrder: 0, allocated: 4, sold4w: 11, sold12w: 38, firstRcvd: '2025-10-15', img: '#EBE5D5' },
  { sku: 'AP-PA-ECARGO-10-W32-1-SAND', style: 'Eroded Edges Cargo', cat: 'Cargos', tier: 'Drop', color: 'Sand', size: 'W32', cost: 48, retail: 198, onHand: 6, onOrder: 0, allocated: 2, sold4w: 14, sold12w: 46, firstRcvd: '2025-10-15', img: '#EBE5D5' },
  { sku: 'AP-PA-ECARGO-10-W34-1-SAND', style: 'Eroded Edges Cargo', cat: 'Cargos', tier: 'Drop', color: 'Sand', size: 'W34', cost: 48, retail: 198, onHand: 0, onOrder: 0, allocated: 0, sold4w: 18, sold12w: 52, firstRcvd: '2025-10-15', img: '#EBE5D5' },
  { sku: 'AP-PA-ECARGO-10-W36-1-SAND', style: 'Eroded Edges Cargo', cat: 'Cargos', tier: 'Drop', color: 'Sand', size: 'W36', cost: 48, retail: 198, onHand: 4, onOrder: 0, allocated: 1, sold4w: 12, sold12w: 38, firstRcvd: '2025-10-15', img: '#EBE5D5' },
  { sku: 'AP-TS-BBTEE-25-1-SALT-S', style: 'Borderless Basic Tee', cat: 'Tees', tier: 'Staple', color: 'Salt', size: 'S', cost: 11, retail: 37, onHand: 184, onOrder: 0, allocated: 14, sold4w: 38, sold12w: 112, firstRcvd: '2025-07-22', img: '#F5F0E8' },
  { sku: 'AP-TS-BBTEE-25-1-SALT-M', style: 'Borderless Basic Tee', cat: 'Tees', tier: 'Staple', color: 'Salt', size: 'M', cost: 11, retail: 37, onHand: 96, onOrder: 300, allocated: 28, sold4w: 64, sold12w: 188, firstRcvd: '2025-07-22', img: '#F5F0E8' },
  { sku: 'AP-TS-BBTEE-25-1-SLATE-M', style: 'Borderless Basic Tee', cat: 'Tees', tier: 'Staple', color: 'Slate', size: 'M', cost: 11, retail: 37, onHand: 252, onOrder: 0, allocated: 6, sold4w: 18, sold12w: 64, firstRcvd: '2025-07-22', img: '#3A3A3A' },
  { sku: 'AC-BG-SLING-25-2-SLATE', style: 'Nomad Sling Bag', cat: 'Accessories', tier: 'Drop', color: 'Slate', size: 'OS', cost: 22, retail: 88, onHand: 76, onOrder: 100, allocated: 8, sold4w: 24, sold12w: 68, firstRcvd: '2025-11-01', img: '#3A3A3A' },
  { sku: 'AC-BG-PASS-25-2-SOIL', style: 'Passport Holder', cat: 'Accessories', tier: 'Drop', color: 'Soil', size: 'OS', cost: 8, retail: 42, onHand: 124, onOrder: 0, allocated: 3, sold4w: 9, sold12w: 28, firstRcvd: '2025-11-01', img: '#9A816B' },
  { sku: 'AP-OW-DDCOAT-26-1-STONE-M', style: 'Destination Trench', cat: 'Outerwear', tier: 'Drop', color: 'Stone', size: 'M', cost: 92, retail: 348, onHand: 12, onOrder: 0, allocated: 2, sold4w: 4, sold12w: 14, firstRcvd: '2026-02-10', img: '#716F70' },
  { sku: 'AP-OW-DDCOAT-26-1-STONE-L', style: 'Destination Trench', cat: 'Outerwear', tier: 'Drop', color: 'Stone', size: 'L', cost: 92, retail: 348, onHand: 8, onOrder: 0, allocated: 1, sold4w: 5, sold12w: 16, firstRcvd: '2026-02-10', img: '#716F70' },
];

const LEAD_TIME_WEEKS = 10;

const enrichedSkus = SKUS.map(s => {
  const velocity = s.sold4w / 4;
  const available = s.onHand - s.allocated;
  const wos = velocity > 0 ? available / velocity : (available > 0 ? 999 : 0);
  const inventoryValue = s.onHand * s.cost;
  const retailValue = s.onHand * s.retail;
  const sold12wRev = s.sold12w * s.retail;
  const totalReceived = s.onHand + s.sold12w + s.allocated;
  const sellThrough = totalReceived > 0 ? (s.sold12w / totalReceived) * 100 : 0;
  const grossMargin = (s.retail - s.cost) / s.retail * 100;
  const gmroi = inventoryValue > 0 ? (sold12wRev * (grossMargin / 100)) / inventoryValue : 0;
  const today = new Date();
  const firstRcvd = new Date(s.firstRcvd);
  const ageWeeks = Math.round((today - firstRcvd) / (1000 * 60 * 60 * 24 * 7));

  let status = 'healthy';
  let statusLabel = 'Healthy';
  if (s.onHand === 0) { status = 'stockout'; statusLabel = 'Stockout'; }
  else if (wos < LEAD_TIME_WEEKS - 4) { status = 'critical'; statusLabel = 'Critical'; }
  else if (wos < LEAD_TIME_WEEKS) { status = 'reorder'; statusLabel = 'Reorder Now'; }
  else if (wos < LEAD_TIME_WEEKS + 4) { status = 'soon'; statusLabel = 'Reorder Soon'; }
  else if (wos > 26) { status = 'overstock'; statusLabel = 'Overstock'; }

  return { ...s, velocity, available, wos, inventoryValue, retailValue, sellThrough, gmroi, ageWeeks, status, statusLabel, grossMargin };
});

const STATUS_COLORS = {
  stockout: BRAND.bad,
  critical: BRAND.bad,
  reorder: BRAND.warn,
  soon: BRAND.sienna,
  healthy: BRAND.good,
  overstock: BRAND.sea,
};

const fmt$k = (n) => '$' + (n >= 1000 ? (n/1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : Math.round(n).toLocaleString());
const fmtN = (n) => Math.round(n).toLocaleString();
const fmtPct = (n) => n.toFixed(1) + '%';
const fmt1 = (n) => n.toFixed(1);

const Pill = ({ status, children, size }) => {
  const color = STATUS_COLORS[status] || BRAND.stone;
  const padX = size === 'xs' ? '6px' : '8px';
  const fontSize = size === 'xs' ? '9px' : '10px';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px ' + padX, fontWeight: 500,
      backgroundColor: color + '18', color: color, fontSize,
      letterSpacing: '0.06em', textTransform: 'uppercase',
      borderRadius: '2px', ...sans
    }}>
      {children}
    </span>
  );
};

const KpiCard = ({ label, value, delta, sublabel, accent, sparkData }) => (
  <div style={{ backgroundColor: BRAND.card, border: '1px solid ' + BRAND.line, borderRadius: '4px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
    <div>
      <div style={{ ...sans, color: BRAND.fadedSlate, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500, marginBottom: '12px' }}>
        {label}
      </div>
      <div style={{ ...serif, color: BRAND.slate, fontSize: '32px', lineHeight: '1', fontWeight: 400 }}>
        {value}
      </div>
      {sublabel && (
        <div style={{ ...sans, color: BRAND.stone, fontSize: '11px', marginTop: '4px' }}>
          {sublabel}
        </div>
      )}
    </div>
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: '12px' }}>
      {delta !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: delta >= 0 ? BRAND.good : BRAND.bad, ...sans, fontSize: '11px' }}>
          {delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {Math.abs(delta).toFixed(1)}% vs prior
        </div>
      )}
      {sparkData && (
        <div style={{ width: '60px', height: '24px' }}>
          <ResponsiveContainer>
            <LineChart data={sparkData}>
              <Line type="monotone" dataKey="v" stroke={accent || BRAND.slate} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  </div>
);

const SectionHeader = ({ eyebrow, title, action }) => (
  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '16px' }}>
    <div>
      {eyebrow && (
        <div style={{ ...sans, color: BRAND.fadedSlate, fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 500, marginBottom: '6px' }}>
          {eyebrow}
        </div>
      )}
      <h2 style={{ ...serif, color: BRAND.slate, fontSize: '24px', lineHeight: '1.1', fontWeight: 400, margin: 0 }}>
        {title}
      </h2>
    </div>
    {action}
  </div>
);

function Cockpit({ skus }) {
  const totalInvValue = skus.reduce((s, x) => s + x.inventoryValue, 0);
  const totalRetailValue = skus.reduce((s, x) => s + x.retailValue, 0);
  const totalRev12w = skus.reduce((s, x) => s + x.sold12w * x.retail, 0);
  const avgWos = skus.filter(x => x.onHand > 0).reduce((s, x, _, arr) => s + x.wos / arr.length, 0);
  const sellThru = skus.reduce((s, x) => s + x.sold12w * x.retail, 0) /
                   skus.reduce((s, x) => s + (x.sold12w + x.onHand) * x.retail, 0) * 100;
  const totalGmroi = totalInvValue > 0 ? (totalRev12w * 0.7) / totalInvValue : 0;

  const urgent = skus.filter(s => s.status === 'critical' || s.status === 'reorder' || s.status === 'stockout').sort((a, b) => a.wos - b.wos);

  const trend12w = Array.from({ length: 12 }, (_, i) => ({
    week: 'W' + (i+1),
    revenue: 18000 + Math.sin(i / 2) * 4000 + i * 800 + (Math.random() * 2000),
    units: 180 + Math.sin(i / 2) * 30 + i * 8 + (Math.random() * 20),
  }));

  const catBreakdown = ['Hoodies', 'Sweatpants', 'Tees', 'Cargos', 'Accessories', 'Outerwear'].map(cat => {
    const items = skus.filter(s => s.cat === cat);
    return {
      cat,
      revenue: items.reduce((s, x) => s + x.sold12w * x.retail, 0),
      inventory: items.reduce((s, x) => s + x.inventoryValue, 0),
      sellThrough: items.length ? items.reduce((s, x) => s + x.sellThrough, 0) / items.length : 0,
    };
  }).filter(c => c.revenue > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <KpiCard label="Inventory at Cost" value={fmt$k(totalInvValue)} sublabel={fmt$k(totalRetailValue) + ' at retail'} delta={4.2} sparkData={trend12w.map(t => ({ v: t.revenue }))} accent={BRAND.slate} />
        <KpiCard label="Sell-Through (12W)" value={fmtPct(sellThru)} sublabel={fmt$k(totalRev12w) + ' sold-thru'} delta={2.8} sparkData={trend12w.map(t => ({ v: t.units }))} accent={BRAND.good} />
        <KpiCard label="Avg Weeks of Supply" value={fmt1(avgWos)} sublabel={'Lead time: ' + LEAD_TIME_WEEKS + 'w'} delta={-1.4} sparkData={trend12w.map(t => ({ v: t.units }))} accent={BRAND.sienna} />
        <KpiCard label="GMROI (Annualized)" value={fmt1(totalGmroi * (52/12)) + 'x'} sublabel="Target: 3.5x+" delta={0.6} sparkData={trend12w.map(t => ({ v: t.revenue }))} accent={BRAND.soil} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
        <div style={{ backgroundColor: BRAND.card, border: '1px solid ' + BRAND.line, borderRadius: '4px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <div style={{ ...sans, color: BRAND.fadedSlate, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500, marginBottom: '4px' }}>
                Revenue and Velocity
              </div>
              <div style={{ ...serif, color: BRAND.slate, fontSize: '20px', fontWeight: 400 }}>12-week trend</div>
            </div>
            <div style={{ display: 'flex', gap: '12px', ...sans, fontSize: '11px', color: BRAND.stone }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '8px', height: '8px', backgroundColor: BRAND.slate, borderRadius: '50%' }}></span>Revenue</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '8px', height: '8px', backgroundColor: BRAND.sienna, borderRadius: '50%' }}></span>Units</span>
            </div>
          </div>
          <div style={{ height: '220px' }}>
            <ResponsiveContainer>
              <ComposedChart data={trend12w}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND.slate} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={BRAND.slate} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="week" stroke={BRAND.fadedSlate} style={{ fontSize: '10px', ...sans }} tickLine={false} axisLine={{ stroke: BRAND.line }} />
                <YAxis yAxisId="left" stroke={BRAND.fadedSlate} style={{ fontSize: '10px', ...sans }} tickLine={false} axisLine={false} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'} />
                <YAxis yAxisId="right" orientation="right" hide />
                <Tooltip contentStyle={{ backgroundColor: BRAND.salt, border: '1px solid ' + BRAND.slate, borderRadius: '2px', ...sans, fontSize: '11px' }} />
                <Area yAxisId="left" type="monotone" dataKey="revenue" stroke={BRAND.slate} strokeWidth={1.5} fill="url(#rev)" />
                <Line yAxisId="right" type="monotone" dataKey="units" stroke={BRAND.sienna} strokeWidth={1.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ backgroundColor: BRAND.card, border: '1px solid ' + BRAND.line, borderRadius: '4px', padding: '20px' }}>
          <div style={{ ...sans, color: BRAND.fadedSlate, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500, marginBottom: '16px' }}>
            Inventory Health
          </div>
          {[
            { label: 'Stockout', count: skus.filter(s => s.status === 'stockout').length, color: STATUS_COLORS.stockout },
            { label: 'Critical', count: skus.filter(s => s.status === 'critical').length, color: STATUS_COLORS.critical },
            { label: 'Reorder Now', count: skus.filter(s => s.status === 'reorder').length, color: STATUS_COLORS.reorder },
            { label: 'Reorder Soon', count: skus.filter(s => s.status === 'soon').length, color: STATUS_COLORS.soon },
            { label: 'Healthy', count: skus.filter(s => s.status === 'healthy').length, color: STATUS_COLORS.healthy },
            { label: 'Overstock', count: skus.filter(s => s.status === 'overstock').length, color: STATUS_COLORS.overstock },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid ' + BRAND.lineSoft }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ width: '6px', height: '6px', backgroundColor: row.color, borderRadius: '50%' }}></span>
                <span style={{ ...sans, fontSize: '12px', color: BRAND.slate }}>{row.label}</span>
              </div>
              <span style={{ ...mono, fontSize: '13px', color: BRAND.slate }}>{row.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
        <div style={{ backgroundColor: BRAND.card, border: '1px solid ' + BRAND.line, borderRadius: '4px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <div style={{ ...sans, color: BRAND.fadedSlate, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500, marginBottom: '4px' }}>
                Action Required
              </div>
              <div style={{ ...serif, color: BRAND.slate, fontSize: '20px', fontWeight: 400 }}>Urgent reorders ({urgent.length})</div>
            </div>
            <button style={{ ...sans, fontSize: '11px', color: BRAND.slate, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid ' + BRAND.slate, paddingBottom: '2px', background: 'none', border: 'none', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: BRAND.slate, cursor: 'pointer' }}>
              Generate POs {ARROW}
            </button>
          </div>
          <div>
            {urgent.slice(0, 6).map(s => (
              <div key={s.sku} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid ' + BRAND.lineSoft }}>
                <div style={{ width: '32px', height: '40px', backgroundColor: s.img, border: '1px solid ' + BRAND.line }}></div>
                <div style={{ flex: 1 }}>
                  <div style={{ ...sans, fontSize: '12px', color: BRAND.slate, fontWeight: 500 }}>{s.style}</div>
                  <div style={{ ...mono, fontSize: '10px', color: BRAND.fadedSlate }}>{s.sku}</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: '60px' }}>
                  <div style={{ ...mono, fontSize: '13px', color: BRAND.slate }}>{s.onHand}</div>
                  <div style={{ ...sans, fontSize: '9px', color: BRAND.fadedSlate, letterSpacing: '0.1em', textTransform: 'uppercase' }}>on hand</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: '60px' }}>
                  <div style={{ ...mono, fontSize: '13px', color: BRAND.slate }}>{s.wos < 99 ? fmt1(s.wos) : INF}</div>
                  <div style={{ ...sans, fontSize: '9px', color: BRAND.fadedSlate, letterSpacing: '0.1em', textTransform: 'uppercase' }}>weeks</div>
                </div>
                <Pill status={s.status} size="xs">{s.statusLabel}</Pill>
              </div>
            ))}
          </div>
        </div>

        <div style={{ backgroundColor: BRAND.card, border: '1px solid ' + BRAND.line, borderRadius: '4px', padding: '20px' }}>
          <div style={{ ...sans, color: BRAND.fadedSlate, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500, marginBottom: '16px' }}>
            Category Performance
          </div>
          {catBreakdown.sort((a, b) => b.revenue - a.revenue).map(c => (
            <div key={c.cat} style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <span style={{ ...sans, fontSize: '12px', color: BRAND.slate }}>{c.cat}</span>
                <span style={{ ...mono, fontSize: '11px', color: BRAND.slate }}>{fmt$k(c.revenue)}</span>
              </div>
              <div style={{ height: '4px', backgroundColor: BRAND.lineSoft, borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: Math.min(c.sellThrough, 100) + '%', height: '100%', backgroundColor: BRAND.slate }}></div>
              </div>
              <div style={{ ...sans, fontSize: '10px', color: BRAND.fadedSlate, marginTop: '2px' }}>
                {fmtPct(c.sellThrough)} sell-thru
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Inventory({ skus }) {
  const [sortBy, setSortBy] = useState('wos');
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('table');

  const filtered = useMemo(() => {
    let f = skus;
    if (filter !== 'all') f = skus.filter(s => s.status === filter);
    return [...f].sort((a, b) => {
      if (sortBy === 'wos') return a.wos - b.wos;
      if (sortBy === 'velocity') return b.velocity - a.velocity;
      if (sortBy === 'sellThrough') return b.sellThrough - a.sellThrough;
      if (sortBy === 'gmroi') return b.gmroi - a.gmroi;
      return 0;
    });
  }, [skus, sortBy, filter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <SectionHeader eyebrow="Inventory" title="SKU master ledger" action={
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={() => setView('table')} style={{ ...sans, fontSize: '11px', padding: '6px 12px', backgroundColor: view === 'table' ? BRAND.slate : 'transparent', color: view === 'table' ? BRAND.salt : BRAND.slate, border: '1px solid ' + BRAND.slate, letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: '2px', cursor: 'pointer' }}>Table</button>
          <button onClick={() => setView('gallery')} style={{ ...sans, fontSize: '11px', padding: '6px 12px', backgroundColor: view === 'gallery' ? BRAND.slate : 'transparent', color: view === 'gallery' ? BRAND.salt : BRAND.slate, border: '1px solid ' + BRAND.slate, letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: '2px', cursor: 'pointer' }}>Gallery</button>
        </div>
      } />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {[
          { id: 'all', label: 'All', count: skus.length },
          { id: 'critical', label: 'Critical', count: skus.filter(s => s.status === 'critical').length },
          { id: 'stockout', label: 'Stockout', count: skus.filter(s => s.status === 'stockout').length },
          { id: 'reorder', label: 'Reorder', count: skus.filter(s => s.status === 'reorder').length },
          { id: 'healthy', label: 'Healthy', count: skus.filter(s => s.status === 'healthy').length },
          { id: 'overstock', label: 'Overstock', count: skus.filter(s => s.status === 'overstock').length },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            ...sans, fontSize: '11px', padding: '5px 10px',
            backgroundColor: filter === f.id ? BRAND.slate : BRAND.card,
            color: filter === f.id ? BRAND.salt : BRAND.slate,
            border: '1px solid ' + (filter === f.id ? BRAND.slate : BRAND.line),
            letterSpacing: '0.04em', borderRadius: '2px', cursor: 'pointer',
          }}>
            {f.label} <span style={{ opacity: 0.6, marginLeft: '4px' }}>{f.count}</span>
          </button>
        ))}
        <div style={{ flex: 1 }}></div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...sans, fontSize: '11px', padding: '6px 10px', backgroundColor: BRAND.card, color: BRAND.slate, border: '1px solid ' + BRAND.line, borderRadius: '2px' }}>
          <option value="wos">Sort: Weeks of Supply (asc)</option>
          <option value="velocity">Sort: Velocity (desc)</option>
          <option value="sellThrough">Sort: Sell-Through (desc)</option>
          <option value="gmroi">Sort: GMROI (desc)</option>
        </select>
      </div>

      {view === 'table' && (
        <div style={{ backgroundColor: BRAND.card, border: '1px solid ' + BRAND.line, borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', ...sans, fontSize: '11px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid ' + BRAND.line, backgroundColor: BRAND.sand + '40' }}>
                  {['', 'Style / SKU', 'Tier', 'Color / Size', 'On Hand', 'On Order', 'Avail', 'Vel/wk', 'WOS', 'Sell-Thru', 'Inv Value', 'GMROI', 'Status', ''].map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '12px', ...sans, fontSize: '9px', color: BRAND.fadedSlate, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.sku} style={{ borderBottom: '1px solid ' + BRAND.lineSoft }}>
                    <td style={{ padding: '10px 12px' }}><div style={{ width: '22px', height: '28px', backgroundColor: s.img, border: '1px solid ' + BRAND.line }}></div></td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ color: BRAND.slate, fontWeight: 500, fontSize: '12px' }}>{s.style}</div>
                      <div style={{ ...mono, fontSize: '9px', color: BRAND.fadedSlate, marginTop: '2px' }}>{s.sku}</div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ ...sans, fontSize: '9px', color: s.tier === 'Staple' ? BRAND.slate : BRAND.soil, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{s.tier}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: BRAND.slate }}>{s.color} / {s.size}</td>
                    <td style={{ padding: '10px 12px', ...mono, color: BRAND.slate }}>{s.onHand}</td>
                    <td style={{ padding: '10px 12px', ...mono, color: s.onOrder > 0 ? BRAND.slate : BRAND.fadedSlate }}>{s.onOrder || '-'}</td>
                    <td style={{ padding: '10px 12px', ...mono, color: BRAND.slate }}>{s.available}</td>
                    <td style={{ padding: '10px 12px', ...mono, color: BRAND.slate }}>{fmt1(s.velocity)}</td>
                    <td style={{ padding: '10px 12px', ...mono, color: s.wos < LEAD_TIME_WEEKS ? BRAND.bad : BRAND.slate, fontWeight: s.wos < LEAD_TIME_WEEKS ? 600 : 400 }}>
                      {s.wos < 99 ? fmt1(s.wos) : INF}
                    </td>
                    <td style={{ padding: '10px 12px', ...mono, color: BRAND.slate }}>{fmtPct(s.sellThrough)}</td>
                    <td style={{ padding: '10px 12px', ...mono, color: BRAND.slate }}>{fmt$k(s.inventoryValue)}</td>
                    <td style={{ padding: '10px 12px', ...mono, color: BRAND.slate }}>{fmt1(s.gmroi * (52/12))}x</td>
                    <td style={{ padding: '10px 12px' }}><Pill status={s.status} size="xs">{s.statusLabel}</Pill></td>
                    <td style={{ padding: '10px 12px' }}><MoreHorizontal size={14} style={{ color: BRAND.fadedSlate }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'gallery' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          {filtered.map(s => (
            <div key={s.sku} style={{ backgroundColor: BRAND.card, border: '1px solid ' + BRAND.line, borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ aspectRatio: '4/5', backgroundColor: s.img, position: 'relative' }}>
                <div style={{ position: 'absolute', top: '8px', right: '8px' }}><Pill status={s.status} size="xs">{s.statusLabel}</Pill></div>
              </div>
              <div style={{ padding: '12px' }}>
                <div style={{ ...sans, fontSize: '12px', color: BRAND.slate, fontWeight: 500 }}>{s.style}</div>
                <div style={{ ...mono, fontSize: '9px', color: BRAND.fadedSlate, marginTop: '2px' }}>{s.color} / {s.size}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid ' + BRAND.lineSoft }}>
                  <div>
                    <div style={{ ...sans, fontSize: '8px', color: BRAND.fadedSlate, letterSpacing: '0.1em', textTransform: 'uppercase' }}>On Hand</div>
                    <div style={{ ...mono, fontSize: '13px', color: BRAND.slate }}>{s.onHand}</div>
                  </div>
                  <div>
                    <div style={{ ...sans, fontSize: '8px', color: BRAND.fadedSlate, letterSpacing: '0.1em', textTransform: 'uppercase' }}>WOS</div>
                    <div style={{ ...mono, fontSize: '13px', color: s.wos < LEAD_TIME_WEEKS ? BRAND.bad : BRAND.slate }}>{s.wos < 99 ? fmt1(s.wos) : INF}</div>
                  </div>
                  <div>
                    <div style={{ ...sans, fontSize: '8px', color: BRAND.fadedSlate, letterSpacing: '0.1em', textTransform: 'uppercase' }}>S/T</div>
                    <div style={{ ...mono, fontSize: '13px', color: BRAND.slate }}>{fmtPct(s.sellThrough)}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SellThrough({ skus }) {
  const styleData = useMemo(() => {
    const map = {};
    skus.forEach(s => {
      if (!map[s.style]) map[s.style] = { style: s.style, cat: s.cat, tier: s.tier, retail: s.retail, sold12w: 0, onHand: 0, allocated: 0, inventoryValue: 0, color: s.img };
      map[s.style].sold12w += s.sold12w;
      map[s.style].onHand += s.onHand;
      map[s.style].allocated += s.allocated;
      map[s.style].inventoryValue += s.inventoryValue;
    });
    return Object.values(map).map(m => {
      const total = m.sold12w + m.onHand + m.allocated;
      return {
        ...m,
        sellThrough: total > 0 ? (m.sold12w / total) * 100 : 0,
        revenue: m.sold12w * m.retail,
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [skus]);

  const totalRev = styleData.reduce((s, x) => s + x.revenue, 0);
  let cumRev = 0;
  const abcStyles = styleData.map(s => {
    cumRev += s.revenue;
    const pct = (cumRev / totalRev) * 100;
    return { ...s, cumPct: pct, abc: pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C' };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <SectionHeader eyebrow="Sell-Through" title="Performance and ABC analysis" action={
        <select style={{ ...sans, fontSize: '11px', padding: '6px 10px', backgroundColor: BRAND.card, color: BRAND.slate, border: '1px solid ' + BRAND.line, borderRadius: '2px' }}>
          <option>Last 12 weeks</option>
          <option>Last 4 weeks</option>
          <option>Season-to-date</option>
          <option>YTD</option>
        </select>
      } />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        <div style={{ backgroundColor: BRAND.card, border: '1px solid ' + BRAND.line, borderRadius: '4px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Sparkles size={14} style={{ color: BRAND.good }} />
            <div style={{ ...sans, color: BRAND.fadedSlate, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500 }}>
              Bestsellers / Class A
            </div>
          </div>
          {abcStyles.filter(s => s.abc === 'A').slice(0, 5).map((s, i) => (
            <div key={s.style} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid ' + BRAND.lineSoft }}>
              <div style={{ ...mono, fontSize: '11px', color: BRAND.fadedSlate, width: '18px' }}>{(i+1).toString().padStart(2, '0')}</div>
              <div style={{ width: '24px', height: '30px', backgroundColor: s.color, border: '1px solid ' + BRAND.line }}></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...sans, fontSize: '12px', color: BRAND.slate, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.style}</div>
                <div style={{ ...sans, fontSize: '10px', color: BRAND.fadedSlate }}>{s.cat}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...mono, fontSize: '12px', color: BRAND.slate }}>{fmt$k(s.revenue)}</div>
                <div style={{ ...sans, fontSize: '10px', color: BRAND.good }}>{fmtPct(s.sellThrough)} S/T</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ backgroundColor: BRAND.card, border: '1px solid ' + BRAND.line, borderRadius: '4px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <AlertCircle size={14} style={{ color: BRAND.bad }} />
            <div style={{ ...sans, color: BRAND.fadedSlate, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500 }}>
              Slow Movers / Class C
            </div>
          </div>
          {abcStyles.filter(s => s.abc === 'C').concat(abcStyles.filter(s => s.sellThrough < 30)).slice(0, 5).map((s, i) => (
            <div key={s.style + i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid ' + BRAND.lineSoft }}>
              <div style={{ ...mono, fontSize: '11px', color: BRAND.fadedSlate, width: '18px' }}>{(i+1).toString().padStart(2, '0')}</div>
              <div style={{ width: '24px', height: '30px', backgroundColor: s.color, border: '1px solid ' + BRAND.line }}></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...sans, fontSize: '12px', color: BRAND.slate, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.style}</div>
                <div style={{ ...sans, fontSize: '10px', color: BRAND.fadedSlate }}>Markdown candidate</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...mono, fontSize: '12px', color: BRAND.slate }}>{fmt$k(s.inventoryValue)}</div>
                <div style={{ ...sans, fontSize: '10px', color: BRAND.bad }}>{fmtPct(s.sellThrough)} S/T</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ backgroundColor: BRAND.card, border: '1px solid ' + BRAND.line, borderRadius: '4px', padding: '20px' }}>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ ...sans, color: BRAND.fadedSlate, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500, marginBottom: '4px' }}>
            Style Performance Matrix
          </div>
          <div style={{ ...serif, color: BRAND.slate, fontSize: '20px', fontWeight: 400 }}>Sell-through % by style, last 12 weeks</div>
        </div>
        <div style={{ height: '280px' }}>
          <ResponsiveContainer>
            <BarChart data={styleData} layout="vertical" margin={{ left: 120 }}>
              <XAxis type="number" stroke={BRAND.fadedSlate} style={{ fontSize: '10px', ...sans }} tickLine={false} axisLine={{ stroke: BRAND.line }} domain={[0, 100]} tickFormatter={v => v + '%'} />
              <YAxis type="category" dataKey="style" stroke={BRAND.fadedSlate} style={{ fontSize: '10px', ...sans }} tickLine={false} axisLine={false} width={120} />
              <Tooltip contentStyle={{ backgroundColor: BRAND.salt, border: '1px solid ' + BRAND.slate, borderRadius: '2px', ...sans, fontSize: '11px' }} />
              <ReferenceLine x={70} stroke={BRAND.slate} strokeDasharray="3 3" />
              <Bar dataKey="sellThrough" radius={[0, 2, 2, 0]}>
                {styleData.map((s, i) => (
                  <Cell key={i} fill={s.sellThrough >= 70 ? BRAND.good : s.sellThrough >= 40 ? BRAND.sienna : BRAND.bad} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ ...sans, fontSize: '10px', color: BRAND.fadedSlate, marginTop: '8px' }}>
          Dashed line = healthy threshold (70%). Green &gt;=70%, Sienna 40-70%, Red &lt;40%.
        </div>
      </div>
    </div>
  );
}

function OpenToBuy() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const otbData = months.map((m, i) => {
    const plannedSales = 145000 + i * 8000 + Math.sin(i) * 12000;
    const plannedMarkdowns = plannedSales * 0.06;
    const eomTarget = plannedSales * 2.2;
    return { month: m, plannedSales, plannedMarkdowns, eomTarget, bom: 0, onOrder: 0, otb: 0 };
  });

  let runningBom = 320000;
  otbData.forEach((row, i) => {
    row.bom = runningBom;
    const onOrder = i === 0 ? 88000 : i === 1 ? 145000 : i === 2 ? 60000 : 0;
    row.onOrder = onOrder;
    row.otb = row.plannedSales + row.plannedMarkdowns + row.eomTarget - row.bom - row.onOrder;
    runningBom = row.eomTarget;
  });

  const totalOtb = otbData.reduce((s, x) => s + Math.max(x.otb, 0), 0);
  const totalCommitted = otbData.reduce((s, x) => s + x.onOrder, 0);

  const catOtb = [
    { cat: 'Hoodies', alloc: 32, spent: 18, color: BRAND.slate },
    { cat: 'Sweatpants', alloc: 28, spent: 22, color: BRAND.soil },
    { cat: 'Tees', alloc: 14, spent: 6, color: BRAND.sienna },
    { cat: 'Cargos (Drop)', alloc: 12, spent: 4, color: BRAND.sea },
    { cat: 'Accessories', alloc: 8, spent: 2, color: BRAND.sage },
    { cat: 'Outerwear', alloc: 6, spent: 1, color: BRAND.stone },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <SectionHeader eyebrow="Open-to-Buy / Spring/Summer 26" title="Merchandise financial plan" action={
        <button style={{ ...sans, fontSize: '11px', padding: '8px 14px', backgroundColor: BRAND.slate, color: BRAND.salt, letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: '2px', border: 'none', cursor: 'pointer' }}>
          Edit Plan
        </button>
      } />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <KpiCard label="OTB Available, 6mo" value={fmt$k(totalOtb)} sublabel="Cost dollars" />
        <KpiCard label="Already Committed" value={fmt$k(totalCommitted)} sublabel={fmtPct((totalCommitted / (totalCommitted + totalOtb)) * 100) + ' of plan'} />
        <KpiCard label="Planned Sales, 6mo" value={fmt$k(otbData.reduce((s, x) => s + x.plannedSales, 0))} sublabel="Retail dollars" />
        <KpiCard label="Stock-to-Sales Target" value="2.2x" sublabel="Industry: 2.0-2.5x" />
      </div>

      <div style={{ backgroundColor: BRAND.card, border: '1px solid ' + BRAND.line, borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ padding: '20px 20px 12px' }}>
          <div style={{ ...sans, color: BRAND.fadedSlate, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500, marginBottom: '4px' }}>
            WSSI / Monthly OTB Grid
          </div>
          <div style={{ ...serif, color: BRAND.slate, fontSize: '20px', fontWeight: 400 }}>Open = Planned Sales + Markdowns + EOM - BOM - On Order</div>
        </div>
        <table style={{ width: '100%', ...sans, fontSize: '11px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderTop: '1px solid ' + BRAND.line, borderBottom: '1px solid ' + BRAND.line, backgroundColor: BRAND.sand + '40' }}>
              <th style={{ textAlign: 'left', padding: '12px 16px', ...sans, fontSize: '9px', color: BRAND.fadedSlate, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Component</th>
              {otbData.map(r => (
                <th key={r.month} style={{ textAlign: 'right', padding: '12px 16px', ...sans, fontSize: '9px', color: BRAND.fadedSlate, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{r.month} 26</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'BOM Inventory', key: 'bom' },
              { label: '+ Planned Sales', key: 'plannedSales' },
              { label: '+ Planned Markdowns', key: 'plannedMarkdowns' },
              { label: '+ EOM Target', key: 'eomTarget' },
              { label: '- On Order', key: 'onOrder', neg: true },
            ].map(row => (
              <tr key={row.key} style={{ borderBottom: '1px solid ' + BRAND.lineSoft }}>
                <td style={{ padding: '10px 16px', color: BRAND.slate }}>{row.label}</td>
                {otbData.map(r => (
                  <td key={r.month} style={{ textAlign: 'right', padding: '10px 16px', ...mono, color: row.neg ? BRAND.bad : BRAND.slate }}>
                    {fmt$k(r[row.key])}
                  </td>
                ))}
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid ' + BRAND.slate, backgroundColor: BRAND.sand + '60' }}>
              <td style={{ padding: '12px 16px', ...sans, color: BRAND.slate, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }}>= Open-to-Buy</td>
              {otbData.map(r => (
                <td key={r.month} style={{ textAlign: 'right', padding: '12px 16px', ...mono, color: r.otb > 0 ? BRAND.good : BRAND.bad, fontWeight: 600, fontSize: '13px' }}>
                  {fmt$k(r.otb)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
        <div style={{ backgroundColor: BRAND.card, border: '1px solid ' + BRAND.line, borderRadius: '4px', padding: '20px' }}>
          <div style={{ ...sans, color: BRAND.fadedSlate, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500, marginBottom: '16px' }}>
            Category Allocation, 6mo
          </div>
          {catOtb.map(c => (
            <div key={c.cat} style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                <span style={{ ...sans, fontSize: '12px', color: BRAND.slate }}>{c.cat}</span>
                <span style={{ ...mono, fontSize: '11px', color: BRAND.slate }}>
                  <span style={{ color: BRAND.fadedSlate }}>{fmt$k(c.spent * 1000)} spent</span> / {fmt$k(c.alloc * 1000)}
                </span>
              </div>
              <div style={{ height: '6px', backgroundColor: BRAND.lineSoft, borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: (c.spent / c.alloc * 100) + '%', height: '100%', backgroundColor: c.color }}></div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ backgroundColor: BRAND.card, border: '1px solid ' + BRAND.line, borderRadius: '4px', padding: '20px' }}>
          <div style={{ ...sans, color: BRAND.fadedSlate, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500, marginBottom: '16px' }}>
            Plan Mix
          </div>
          <div style={{ height: '160px' }}>
            <ResponsiveContainer>
              <BarChart data={catOtb}>
                <XAxis dataKey="cat" hide />
                <YAxis hide />
                <Tooltip contentStyle={{ backgroundColor: BRAND.salt, border: '1px solid ' + BRAND.slate, borderRadius: '2px', ...sans, fontSize: '10px' }} />
                <Bar dataKey="alloc" radius={[2, 2, 0, 0]}>
                  {catOtb.map((c, i) => <Cell key={i} fill={c.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '12px' }}>
            {catOtb.slice(0, 6).map(c => (
              <div key={c.cat} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', backgroundColor: c.color, display: 'inline-block' }}></span>
                <span style={{ ...sans, fontSize: '10px', color: BRAND.slate }}>{c.cat}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const PO_DATA = [
  { id: 'PO-2026-0418', vendor: 'Hangzhou Knit Co.', cat: 'Hoodies', styles: ['Borderless Basic Hoodie'], units: 650, cost: 20800, status: 'In Production', placed: '2026-03-12', etaWeeks: 4, progress: 60 },
  { id: 'PO-2026-0419', vendor: 'Hangzhou Knit Co.', cat: 'Sweatpants', styles: ['Borderless Basic Sweatpants'], units: 550, cost: 15400, status: 'In Production', placed: '2026-03-12', etaWeeks: 4, progress: 55 },
  { id: 'PO-2026-0421', vendor: 'Porto Atelier', cat: 'Cargos', styles: ['Eroded Edges Cargo'], units: 280, cost: 13440, status: 'Sampling', placed: '2026-04-02', etaWeeks: 9, progress: 15 },
  { id: 'PO-2026-0422', vendor: 'Lisbon Tailors', cat: 'Tees', styles: ['Borderless Basic Tee'], units: 1200, cost: 13200, status: 'In Transit', placed: '2026-02-18', etaWeeks: 1, progress: 90 },
  { id: 'PO-2026-0423', vendor: 'Bangalore Goods', cat: 'Accessories', styles: ['Nomad Sling Bag'], units: 200, cost: 4400, status: 'Approved', placed: '2026-04-22', etaWeeks: 10, progress: 5 },
  { id: 'PO-2026-0424', vendor: 'Hangzhou Knit Co.', cat: 'Hoodies', styles: ['Borderless Basic Hoodie F/W'], units: 800, cost: 25600, status: 'Draft', placed: '2026-05-01', etaWeeks: 12, progress: 0 },
];

const PO_STATUS_MAP = {
  'Draft': { color: BRAND.stone, icon: Clock },
  'Approved': { color: BRAND.sea, icon: Check },
  'Sampling': { color: BRAND.sienna, icon: Package },
  'In Production': { color: BRAND.soil, icon: Package },
  'In Transit': { color: BRAND.warn, icon: Truck },
  'Received': { color: BRAND.good, icon: Check },
  'Cancelled': { color: BRAND.bad, icon: X },
};

function PurchaseOrders() {
  const totalOpen = PO_DATA.reduce((s, x) => s + x.cost, 0);
  const totalUnits = PO_DATA.reduce((s, x) => s + x.units, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <SectionHeader eyebrow="Purchase Orders" title="Production and receipt pipeline" action={
        <button style={{ ...sans, fontSize: '11px', padding: '8px 14px', backgroundColor: BRAND.slate, color: BRAND.salt, letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: '2px', display: 'flex', alignItems: 'center', gap: '6px', border: 'none', cursor: 'pointer' }}>
          <Plus size={12} /> New PO
        </button>
      } />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <KpiCard label="Open POs" value={PO_DATA.length} sublabel="Across 4 vendors" />
        <KpiCard label="Units on Order" value={fmtN(totalUnits)} sublabel="Receiving in 1-12w" />
        <KpiCard label="Committed Capital" value={fmt$k(totalOpen)} sublabel="At cost" />
        <KpiCard label="Avg Lead Time" value={LEAD_TIME_WEEKS + 'w'} sublabel="Production + transit" />
      </div>

      <div style={{ backgroundColor: BRAND.card, border: '1px solid ' + BRAND.line, borderRadius: '4px', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <div style={{ ...sans, color: BRAND.fadedSlate, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500, marginBottom: '4px' }}>Receipt Calendar</div>
            <div style={{ ...serif, color: BRAND.slate, fontSize: '20px', fontWeight: 400 }}>Next 12 weeks</div>
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', borderBottom: '1px solid ' + BRAND.line, marginBottom: '12px' }}>
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} style={{ flex: 1, padding: '0 4px 8px', ...sans, fontSize: '9px', color: BRAND.fadedSlate, letterSpacing: '0.1em', textAlign: 'center' }}>W{i+1}</div>
            ))}
          </div>
          {PO_DATA.map((po) => {
            const status = PO_STATUS_MAP[po.status];
            const start = Math.max(0, 12 - po.etaWeeks - Math.floor(po.progress / 12));
            const len = Math.max(2, Math.min(12 - start, po.etaWeeks));
            return (
              <div key={po.id} style={{ position: 'relative', marginBottom: '8px', height: '32px' }}>
                <div style={{ display: 'flex', height: '100%' }}>
                  {Array.from({ length: 12 }, (_, i) => {
                    const inRange = i >= start && i < start + len;
                    const isEta = i === start + len - 1;
                    return (
                      <div key={i} style={{
                        flex: 1, margin: '0 2px',
                        backgroundColor: inRange ? status.color + (isEta ? 'FF' : '50') : 'transparent',
                        borderRadius: '2px',
                        position: 'relative',
                      }}>
                        {i === start && (
                          <span style={{ position: 'absolute', left: '4px', top: '6px', ...sans, fontSize: '9px', color: BRAND.salt, fontWeight: 500, whiteSpace: 'nowrap' }}>
                            {po.id} / {po.units}u
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ backgroundColor: BRAND.card, border: '1px solid ' + BRAND.line, borderRadius: '4px', overflow: 'hidden' }}>
        <table style={{ width: '100%', ...sans, fontSize: '11px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid ' + BRAND.line, backgroundColor: BRAND.sand + '40' }}>
              {['PO #', 'Vendor', 'Style', 'Units', 'Cost', 'Status', 'Progress', 'ETA', ''].map((h, i) => (
                <th key={i} style={{ textAlign: 'left', padding: '12px', ...sans, fontSize: '9px', color: BRAND.fadedSlate, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PO_DATA.map(po => {
              const status = PO_STATUS_MAP[po.status];
              const Icon = status.icon;
              return (
                <tr key={po.id} style={{ borderBottom: '1px solid ' + BRAND.lineSoft }}>
                  <td style={{ padding: '12px', ...mono, fontSize: '11px', color: BRAND.slate }}>{po.id}</td>
                  <td style={{ padding: '12px', color: BRAND.slate }}>{po.vendor}</td>
                  <td style={{ padding: '12px', color: BRAND.slate }}>{po.styles[0]}</td>
                  <td style={{ padding: '12px', ...mono, color: BRAND.slate }}>{po.units}</td>
                  <td style={{ padding: '12px', ...mono, color: BRAND.slate }}>{fmt$k(po.cost)}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: status.color, ...sans, fontSize: '11px' }}>
                      <Icon size={11} /> {po.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '60px', height: '4px', backgroundColor: BRAND.lineSoft, borderRadius: '2px' }}>
                        <div style={{ width: po.progress + '%', height: '100%', backgroundColor: status.color, borderRadius: '2px' }}></div>
                      </div>
                      <span style={{ ...mono, fontSize: '10px', color: BRAND.fadedSlate }}>{po.progress}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px', color: BRAND.slate }}>{po.etaWeeks}w</td>
                  <td style={{ padding: '12px' }}><MoreHorizontal size={14} style={{ color: BRAND.fadedSlate }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Forecast({ skus }) {
  const recommendations = skus
    .filter(s => s.velocity > 0)
    .map(s => {
      const targetWos = LEAD_TIME_WEEKS + 8;
      const reorderQty = Math.max(0, Math.round((targetWos - s.wos) * s.velocity));
      const reorderCost = reorderQty * s.cost;
      const projectedRev = reorderQty * s.retail;
      const urgency = s.wos < LEAD_TIME_WEEKS ? 'urgent' : s.wos < LEAD_TIME_WEEKS + 4 ? 'soon' : 'planned';
      return { ...s, reorderQty, reorderCost, projectedRev, urgency };
    })
    .filter(s => s.reorderQty > 0)
    .sort((a, b) => a.wos - b.wos);

  const urgentTotal = recommendations.filter(s => s.urgency === 'urgent').reduce((s, x) => s + x.reorderCost, 0);
  const allTotal = recommendations.reduce((s, x) => s + x.reorderCost, 0);

  const forecastData = Array.from({ length: 16 }, (_, i) => {
    const isActual = i < 12;
    const isForecast = i >= 11;
    const base = 220 + Math.sin(i / 2) * 40 + i * 4;
    const fcBase = 260 + Math.sin(i / 2) * 50 + i * 6;
    return {
      week: i + 1,
      actual: isActual ? base : null,
      forecast: isForecast ? fcBase : null,
      band: isForecast ? [fcBase - 60, fcBase + 60] : null,
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <SectionHeader eyebrow="Demand Forecast and Reorder" title="Reorder recommendations" action={
        <button style={{ ...sans, fontSize: '11px', padding: '8px 14px', backgroundColor: BRAND.slate, color: BRAND.salt, letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: '2px', border: 'none', cursor: 'pointer' }}>
          Push to PO Draft
        </button>
      } />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <KpiCard label="Reorder Cost: Urgent" value={fmt$k(urgentTotal)} sublabel={recommendations.filter(s => s.urgency === 'urgent').length + ' SKUs past lead-time'} />
        <KpiCard label="Reorder Cost: All" value={fmt$k(allTotal)} sublabel={recommendations.length + ' SKUs total'} />
        <KpiCard label="Projected Revenue" value={fmt$k(recommendations.reduce((s, x) => s + x.projectedRev, 0))} sublabel="If fully sold-thru at retail" />
      </div>

      <div style={{ backgroundColor: BRAND.card, border: '1px solid ' + BRAND.line, borderRadius: '4px', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ ...sans, color: BRAND.fadedSlate, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500, marginBottom: '4px' }}>Demand Forecast</div>
            <div style={{ ...serif, color: BRAND.slate, fontSize: '20px', fontWeight: 400 }}>Total unit velocity, 12wk actual + 4wk forecast</div>
          </div>
          <div style={{ display: 'flex', gap: '12px', ...sans, fontSize: '11px', color: BRAND.stone }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '12px', height: '2px', backgroundColor: BRAND.slate, display: 'inline-block' }}></span>Actual</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '12px', height: '2px', backgroundColor: BRAND.sienna, display: 'inline-block' }}></span>Forecast</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '12px', height: '8px', backgroundColor: BRAND.sand, display: 'inline-block' }}></span>80% interval</span>
          </div>
        </div>
        <div style={{ height: '240px' }}>
          <ResponsiveContainer>
            <ComposedChart data={forecastData}>
              <defs>
                <linearGradient id="forecastBand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND.sienna} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={BRAND.sienna} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis dataKey="week" stroke={BRAND.fadedSlate} style={{ fontSize: '10px', ...sans }} tickLine={false} axisLine={{ stroke: BRAND.line }} tickFormatter={v => 'W' + v} />
              <YAxis stroke={BRAND.fadedSlate} style={{ fontSize: '10px', ...sans }} tickLine={false} axisLine={false} domain={[0, 'auto']} />
              <Tooltip contentStyle={{ backgroundColor: BRAND.salt, border: '1px solid ' + BRAND.slate, borderRadius: '2px', ...sans, fontSize: '11px' }} />
              <ReferenceLine x={11} stroke={BRAND.slate} strokeDasharray="2 2" />
              <Area type="monotone" dataKey="band" stroke="none" fill="url(#forecastBand)" connectNulls={false} />
              <Line type="monotone" dataKey="actual" stroke={BRAND.slate} strokeWidth={1.8} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="forecast" stroke={BRAND.sienna} strokeWidth={1.8} strokeDasharray="4 3" dot={false} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ backgroundColor: BRAND.card, border: '1px solid ' + BRAND.line, borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ padding: '20px 20px 12px' }}>
          <div style={{ ...sans, color: BRAND.fadedSlate, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500, marginBottom: '4px' }}>AI Reorder Engine</div>
          <div style={{ ...serif, color: BRAND.slate, fontSize: '20px', fontWeight: 400 }}>Recommended buys: {LEAD_TIME_WEEKS}w lead + 8w safety</div>
        </div>
        <table style={{ width: '100%', ...sans, fontSize: '11px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderTop: '1px solid ' + BRAND.line, borderBottom: '1px solid ' + BRAND.line, backgroundColor: BRAND.sand + '40' }}>
              {['', 'SKU', 'Current WOS', 'Velocity/wk', 'Reorder Qty', 'Cost', 'Proj. Revenue', 'Urgency', ''].map((h, i) => (
                <th key={i} style={{ textAlign: 'left', padding: '12px', ...sans, fontSize: '9px', color: BRAND.fadedSlate, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recommendations.map(s => (
              <tr key={s.sku} style={{ borderBottom: '1px solid ' + BRAND.lineSoft }}>
                <td style={{ padding: '10px 12px' }}><input type="checkbox" defaultChecked={s.urgency === 'urgent'} style={{ accentColor: BRAND.slate }} /></td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ ...sans, fontSize: '12px', color: BRAND.slate, fontWeight: 500 }}>{s.style}</div>
                  <div style={{ ...mono, fontSize: '9px', color: BRAND.fadedSlate, marginTop: '2px' }}>{s.sku}</div>
                </td>
                <td style={{ padding: '10px 12px', ...mono, color: s.wos < LEAD_TIME_WEEKS ? BRAND.bad : BRAND.slate, fontWeight: s.wos < LEAD_TIME_WEEKS ? 600 : 400 }}>
                  {fmt1(s.wos)}w
                </td>
                <td style={{ padding: '10px 12px', ...mono, color: BRAND.slate }}>{fmt1(s.velocity)}</td>
                <td style={{ padding: '10px 12px', ...mono, color: BRAND.slate, fontWeight: 600 }}>{s.reorderQty}</td>
                <td style={{ padding: '10px 12px', ...mono, color: BRAND.slate }}>{fmt$k(s.reorderCost)}</td>
                <td style={{ padding: '10px 12px', ...mono, color: BRAND.good }}>{fmt$k(s.projectedRev)}</td>
                <td style={{ padding: '10px 12px' }}>
                  <Pill status={s.urgency === 'urgent' ? 'critical' : s.urgency === 'soon' ? 'reorder' : 'healthy'} size="xs">
                    {s.urgency}
                  </Pill>
                </td>
                <td style={{ padding: '10px 12px' }}><MoreHorizontal size={14} style={{ color: BRAND.fadedSlate }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('cockpit');

  const tabs = [
    { id: 'cockpit', label: 'Cockpit', icon: Layers },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'sellthrough', label: 'Sell-Through', icon: TrendingUp },
    { id: 'otb', label: 'Open-to-Buy', icon: DollarSign },
    { id: 'pos', label: 'Purchase Orders', icon: Truck },
    { id: 'forecast', label: 'Forecast', icon: Sparkles },
  ];

  return (
    <div style={{ backgroundColor: BRAND.bg, minHeight: '100vh', color: BRAND.slate }}>
      <header style={{ borderBottom: '1px solid ' + BRAND.line, backgroundColor: BRAND.bg, position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <svg width="22" height="22" viewBox="0 0 100 100" fill={BRAND.slate}>
                <path d="M50 5 L55 25 L75 15 L65 35 L85 50 L65 65 L75 85 L55 75 L50 95 L45 75 L25 85 L35 65 L15 50 L35 35 L25 15 L45 25 Z" />
              </svg>
              <div>
                <div style={{ ...sans, fontSize: '11px', color: BRAND.slate, letterSpacing: '0.18em', fontWeight: 600 }}>FOREIGN RESOURCE</div>
                <div style={{ ...sans, fontSize: '9px', color: BRAND.fadedSlate, letterSpacing: '0.1em', marginTop: '1px' }}>MERCHANDISE OPS / v1</div>
              </div>
            </div>
            <nav style={{ display: 'flex', gap: '4px' }}>
              {tabs.map(t => {
                const Icon = t.icon;
                return (
                  <button key={t.id} onClick={() => setTab(t.id)} style={{
                    ...sans, fontSize: '12px', padding: '8px 14px',
                    color: tab === t.id ? BRAND.slate : BRAND.fadedSlate,
                    borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                    borderBottom: tab === t.id ? '2px solid ' + BRAND.slate : '2px solid transparent',
                    letterSpacing: '0.04em',
                    backgroundColor: 'transparent', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <Icon size={13} /> {t.label}
                  </button>
                );
              })}
            </nav>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', border: '1px solid ' + BRAND.line, borderRadius: '2px', backgroundColor: BRAND.card }}>
              <Search size={12} style={{ color: BRAND.fadedSlate }} />
              <input placeholder="Search SKU, style, PO" style={{ ...sans, fontSize: '11px', backgroundColor: 'transparent', border: 'none', outline: 'none', width: '180px', color: BRAND.slate }} />
            </div>
            <button style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer' }}>
              <Bell size={14} style={{ color: BRAND.slate }} />
              <span style={{ position: 'absolute', top: '-2px', right: '-2px', width: '6px', height: '6px', backgroundColor: BRAND.bad, borderRadius: '50%' }}></span>
            </button>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: BRAND.slate, color: BRAND.salt, display: 'flex', alignItems: 'center', justifyContent: 'center', ...sans, fontSize: '11px', fontWeight: 600 }}>M</div>
          </div>
        </div>
      </header>

      <main style={{ padding: '32px', maxWidth: '1600px', margin: '0 auto' }}>
        {tab === 'cockpit' && <Cockpit skus={enrichedSkus} />}
        {tab === 'inventory' && <Inventory skus={enrichedSkus} />}
        {tab === 'sellthrough' && <SellThrough skus={enrichedSkus} />}
        {tab === 'otb' && <OpenToBuy />}
        {tab === 'pos' && <PurchaseOrders />}
        {tab === 'forecast' && <Forecast skus={enrichedSkus} />}

        <footer style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid ' + BRAND.line }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...sans, fontSize: '10px', color: BRAND.fadedSlate, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            <span>Foreign Resource Co. / Merchandise Operations</span>
            <span>Lead time: {LEAD_TIME_WEEKS}w / Safety stock: 8w / Last sync: just now</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
