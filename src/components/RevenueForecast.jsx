import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatPercent, formatDate, generateWeekDates } from '../utils/calculations';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Plus, Trash2, Calendar, Zap, Repeat, Star } from 'lucide-react';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70', soil: '#9A816B', sea: '#B5C7D3', sage: '#ADBDA3', sienna: '#D4956A' };

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: FR.slate, border: `1px solid ${FR.stone}`, borderRadius: 8, padding: 12 }}>
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

export default function RevenueForecast() {
  const { state, dispatch, projections } = useApp();
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ name: '', date: '', type: 'drop', estimatedRevenue: 0, estimatedCM: 0, notes: '' });

  const weekDates = generateWeekDates();

  const addEvent = () => {
    const weekIndex = weekDates.findIndex(d => d === newEvent.date) !== -1
      ? weekDates.findIndex(d => d === newEvent.date)
      : weekDates.findIndex(d => new Date(d) >= new Date(newEvent.date));
    dispatch({
      type: 'ADD_EVENT',
      payload: { ...newEvent, id: Date.now().toString(), weekIndex: Math.max(0, weekIndex) },
    });
    setNewEvent({ name: '', date: '', type: 'drop', estimatedRevenue: 0, estimatedCM: 0, notes: '' });
    setShowAddEvent(false);
  };

  const chartData = projections.map(w => ({
    name: formatDate(w.date),
    acquisition: Math.round(w.acquisitionRevenue),
    retention: Math.round(w.retentionRevenue),
    events: Math.round(w.eventRevenue),
    total: Math.round(w.revenue),
  }));

  const totalAcquisition = projections.reduce((s, w) => s + w.acquisitionRevenue, 0);
  const totalRetention = projections.reduce((s, w) => s + w.retentionRevenue, 0);
  const totalEvents = projections.reduce((s, w) => s + w.eventRevenue, 0);
  const totalRevenue = totalAcquisition + totalRetention + totalEvents;

  const eventTypes = [
    { value: 'drop', label: 'Product Drop', icon: Star },
    { value: 'promotion', label: 'Promotion / Sale', icon: Zap },
    { value: 'campaign', label: 'Campaign / PR', icon: Calendar },
  ];

  const inputStyle = { background: FR.salt, border: `1px solid ${FR.sand}`, borderRadius: 8, padding: '8px 12px', color: FR.slate, fontSize: 14, fontFamily: "'Inter', sans-serif", width: '100%' };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 24 }}>Revenue Forecast</h2>
          <p className="text-xs mt-1" style={{ color: FR.stone }}>3-Layer Model: Acquisition (spend-driven) + Retention (cohort LTV) + Events (manual)</p>
        </div>
      </div>

      {/* Revenue Layer Cake Chart */}
      <div className="rounded-xl p-5 border" style={{ background: 'white', borderColor: FR.sand }}>
        <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, marginBottom: 16 }}>Revenue Layer Cake</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={FR.sand} />
            <XAxis dataKey="name" tick={{ fill: FR.stone, fontSize: 10 }} axisLine={{ stroke: FR.sand }} />
            <YAxis tick={{ fill: FR.stone, fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} axisLine={{ stroke: FR.sand }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Area type="monotone" dataKey="acquisition" stackId="1" stroke={FR.sea} fill={FR.sea} fillOpacity={0.6} name="Acquisition" />
            <Area type="monotone" dataKey="retention" stackId="1" stroke={FR.sage} fill={FR.sage} fillOpacity={0.6} name="Retention" />
            <Area type="monotone" dataKey="events" stackId="1" stroke={FR.sienna} fill={FR.sienna} fillOpacity={0.6} name="Events" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Acquisition', value: totalAcquisition, pct: totalAcquisition / totalRevenue, color: FR.sea, desc: 'Ad spend driven' },
          { label: 'Retention', value: totalRetention, pct: totalRetention / totalRevenue, color: FR.sage, desc: 'Cohort LTV (connect Shopify)' },
          { label: 'Events', value: totalEvents, pct: totalEvents / totalRevenue, color: FR.sienna, desc: `${state.events.length} planned events` },
          { label: 'Total Projected', value: totalRevenue, pct: 1, color: FR.slate, desc: `${projections.length} weeks` },
        ].map((c, i) => (
          <div key={i} className="rounded-xl p-4 border" style={{ background: 'white', borderColor: FR.sand }}>
            <div className="text-[10px] uppercase tracking-[0.1em]" style={{ color: FR.stone }}>{c.label}</div>
            <div className="text-lg font-semibold mt-1" style={{ color: c.color, fontFamily: "'Cormorant Garamond', serif" }}>{formatCurrency(c.value)}</div>
            <div className="text-xs" style={{ color: FR.stone }}>{c.desc}</div>
          </div>
        ))}
      </div>

      {/* Event Calendar */}
      <div className="rounded-xl p-5 border" style={{ background: 'white', borderColor: FR.sand }}>
        <div className="flex justify-between items-center mb-4">
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20 }}>Marketing Calendar (Event Modeling)</h3>
          <button onClick={() => setShowAddEvent(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs" style={{ background: FR.slate, color: FR.salt }}>
            <Plus size={14} /> Add Event
          </button>
        </div>

        {showAddEvent && (
          <div className="rounded-lg p-4 mb-4 border animate-fade-in" style={{ background: FR.salt, borderColor: FR.soil }}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-[0.1em] block mb-1" style={{ color: FR.stone }}>Event Name</label>
                <input value={newEvent.name} onChange={e => setNewEvent({ ...newEvent, name: e.target.value })} placeholder="e.g., Summer Drop" style={inputStyle} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.1em] block mb-1" style={{ color: FR.stone }}>Date (Monday of week)</label>
                <input type="date" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.1em] block mb-1" style={{ color: FR.stone }}>Type</label>
                <select value={newEvent.type} onChange={e => setNewEvent({ ...newEvent, type: e.target.value })} style={inputStyle}>
                  {eventTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.1em] block mb-1" style={{ color: FR.stone }}>Estimated Revenue</label>
                <input type="number" value={newEvent.estimatedRevenue} onChange={e => setNewEvent({ ...newEvent, estimatedRevenue: parseFloat(e.target.value) || 0 })} style={inputStyle} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.1em] block mb-1" style={{ color: FR.stone }}>Estimated CM</label>
                <input type="number" value={newEvent.estimatedCM} onChange={e => setNewEvent({ ...newEvent, estimatedCM: parseFloat(e.target.value) || 0 })} style={inputStyle} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.1em] block mb-1" style={{ color: FR.stone }}>Notes</label>
                <input value={newEvent.notes} onChange={e => setNewEvent({ ...newEvent, notes: e.target.value })} style={inputStyle} />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={addEvent} disabled={!newEvent.name || !newEvent.date} className="px-4 py-2 rounded-lg text-xs disabled:opacity-50" style={{ background: FR.slate, color: FR.salt }}>Add Event</button>
              <button onClick={() => setShowAddEvent(false)} className="px-4 py-2 rounded-lg text-xs" style={{ background: FR.sand, color: FR.slate }}>Cancel</button>
            </div>
          </div>
        )}

        {state.events.length > 0 ? (
          <div className="space-y-2">
            {state.events.map(ev => {
              const Icon = eventTypes.find(t => t.value === ev.type)?.icon || Calendar;
              return (
                <div key={ev.id} className="flex items-center justify-between p-3 rounded-lg border" style={{ borderColor: FR.sand }}>
                  <div className="flex items-center gap-3">
                    <Icon size={16} style={{ color: FR.sienna }} />
                    <div>
                      <span className="text-sm font-medium" style={{ color: FR.slate }}>{ev.name}</span>
                      <span className="text-xs ml-2" style={{ color: FR.stone }}>{formatDate(ev.date)} (Wk {ev.weekIndex})</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs" style={{ color: FR.stone }}>Est. Revenue</div>
                      <div className="text-sm font-medium" style={{ color: '#166534' }}>{formatCurrency(ev.estimatedRevenue)}</div>
                    </div>
                    <button onClick={() => dispatch({ type: 'REMOVE_EVENT', payload: ev.id })} className="p-1" style={{ color: FR.sienna }}><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-center py-6" style={{ color: FR.stone }}>No events planned. Add product drops, promotions, or campaigns to model their revenue impact.</p>
        )}
      </div>
    </div>
  );
}
