import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate } from '../utils/calculations';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ComposedChart, Line } from 'recharts';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70', soil: '#9A816B', sea: '#B5C7D3', sage: '#ADBDA3', sienna: '#D4956A' };

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#3A3A3A', border: `1px solid ${FR.stone}`, borderRadius: 8, padding: 12, boxShadow: '0 4px 12px rgba(58,58,58,0.15)' }}>
      <p style={{ color: FR.sand, fontSize: 11, marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 11 }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ color: FR.salt, fontWeight: 500 }}>{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function CashflowChart() {
  const { projections } = useApp();

  const chartData = projections.map(w => ({
    name: formatDate(w.date),
    freeCash: Math.round(w.freeCash || 0),
    cash: Math.round(w.totalCash),
    revenue: Math.round(w.revenue),
    adSpend: Math.round(w.weeklyAdSpend),
    inflows: Math.round(w.totalInflows),
    outflows: Math.round(w.totalOutflows),
  }));

  return (
    <div className="space-y-6">
      <div className="rounded-xl p-5 border" style={{ background: 'white', borderColor: FR.sand }}>
        <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, marginBottom: 16 }}>Free Cash Position</h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="freeCashGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={FR.soil} stopOpacity={0.4}/>
                <stop offset="95%" stopColor={FR.soil} stopOpacity={0.05}/>
              </linearGradient>
              <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={FR.sage} stopOpacity={0.2}/>
                <stop offset="95%" stopColor={FR.sage} stopOpacity={0.02}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={FR.sand} />
            <XAxis dataKey="name" tick={{ fill: FR.stone, fontSize: 11 }} axisLine={{ stroke: FR.sand }} tickLine={{ stroke: FR.sand }} />
            <YAxis tick={{ fill: FR.stone, fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} axisLine={{ stroke: FR.sand }} tickLine={{ stroke: FR.sand }} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="cash" stroke={FR.sage} fill="url(#cashGrad)" strokeWidth={1.5} strokeDasharray="4 4" name="Total Cash" />
            <Area type="monotone" dataKey="freeCash" stroke={FR.soil} fill="url(#freeCashGrad)" strokeWidth={2.5} name="Free Cash" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl p-5 border" style={{ background: 'white', borderColor: FR.sand }}>
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, marginBottom: 16 }}>Revenue vs Ad Spend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={FR.sand} />
              <XAxis dataKey="name" tick={{ fill: FR.stone, fontSize: 10 }} axisLine={{ stroke: FR.sand }} tickLine={{ stroke: FR.sand }} />
              <YAxis tick={{ fill: FR.stone, fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} axisLine={{ stroke: FR.sand }} tickLine={{ stroke: FR.sand }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" fill={FR.sea} name="Revenue" radius={[3, 3, 0, 0]} />
              <Line type="monotone" dataKey="adSpend" stroke={FR.sienna} strokeWidth={2} name="Ad Spend" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl p-5 border" style={{ background: 'white', borderColor: FR.sand }}>
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, marginBottom: 16 }}>Inflows vs Outflows</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={FR.sand} />
              <XAxis dataKey="name" tick={{ fill: FR.stone, fontSize: 10 }} axisLine={{ stroke: FR.sand }} tickLine={{ stroke: FR.sand }} />
              <YAxis tick={{ fill: FR.stone, fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} axisLine={{ stroke: FR.sand }} tickLine={{ stroke: FR.sand }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="inflows" fill={FR.sage} name="Inflows" radius={[3, 3, 0, 0]} />
              <Bar dataKey="outflows" fill={FR.soil} name="Outflows" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
