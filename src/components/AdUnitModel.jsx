import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate, generateWeekDates } from '../utils/calculations';
import { Plus, Trash2, Film, Sparkles, User, Video } from 'lucide-react';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70', soil: '#9A816B', sea: '#B5C7D3', sage: '#ADBDA3', sienna: '#D4956A' };

const iconMap = { 'creator': Film, 'high-production': Video, 'ai': Sparkles, 'founder': User };

export default function AdUnitModel() {
  const { state, dispatch, projections } = useApp();
  const [showSchedule, setShowSchedule] = useState(false);
  const [newUnit, setNewUnit] = useState({ typeId: 'creator', weekIndex: 0, quantity: 3 });

  const weekDates = generateWeekDates();

  const scheduleUnit = () => {
    const unitType = state.adUnitTypes.find(t => t.id === newUnit.typeId);
    if (!unitType) return;
    const qty = Math.max(newUnit.quantity, unitType.moq || 0);
    const totalCost = qty * unitType.costPerUnit;
    dispatch({
      type: 'ADD_AD_UNIT',
      payload: { id: Date.now().toString(), typeId: newUnit.typeId, weekIndex: newUnit.weekIndex, quantity: qty, totalCost, typeName: unitType.name },
    });
    setShowSchedule(false);
  };

  // Aggregate creative spend by week from scheduled units
  const weeklyCreativeSpend = {};
  state.scheduledAdUnits.forEach(au => {
    weeklyCreativeSpend[au.weekIndex] = (weeklyCreativeSpend[au.weekIndex] || 0) + au.totalCost;
  });

  const totalCreativeSpend = state.scheduledAdUnits.reduce((s, au) => s + au.totalCost, 0);
  const totalUnits = state.scheduledAdUnits.reduce((s, au) => s + au.quantity, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 24 }}>Ad Unit & Creator Model</h2>
          <p className="text-xs mt-1" style={{ color: FR.stone }}>Schedule creative production by type. Costs flow into weekly cashflow.</p>
        </div>
        <button onClick={() => setShowSchedule(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs" style={{ background: FR.slate, color: FR.salt }}>
          <Plus size={14} /> Schedule Units
        </button>
      </div>

      {/* Unit Type Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {state.adUnitTypes.map(type => {
          const Icon = iconMap[type.id] || Film;
          const scheduled = state.scheduledAdUnits.filter(au => au.typeId === type.id);
          const totalQty = scheduled.reduce((s, au) => s + au.quantity, 0);
          const totalCost = scheduled.reduce((s, au) => s + au.totalCost, 0);
          return (
            <div key={type.id} className="rounded-xl p-4 border" style={{ background: 'white', borderColor: FR.sand }}>
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} style={{ color: FR.soil }} />
                <span className="text-sm font-medium" style={{ color: FR.slate }}>{type.name}</span>
              </div>
              <div className="space-y-1 text-xs" style={{ color: FR.stone }}>
                <div className="flex justify-between"><span>Cost per unit</span><span style={{ color: FR.slate }}>{formatCurrency(type.costPerUnit)}</span></div>
                <div className="flex justify-between"><span>MOQ</span><span style={{ color: FR.slate }}>{type.moq || 'None'}</span></div>
                <div className="flex justify-between"><span>Variations</span><span style={{ color: FR.slate }}>{type.variationsPerUnit} per unit</span></div>
                <div className="flex justify-between"><span>Avg lifespan</span><span style={{ color: FR.slate }}>{type.avgLifespanWeeks} weeks</span></div>
              </div>
              <div className="mt-3 pt-2" style={{ borderTop: `1px solid ${FR.sand}` }}>
                <div className="flex justify-between text-xs">
                  <span style={{ color: FR.stone }}>Scheduled</span>
                  <span style={{ color: FR.slate, fontWeight: 600 }}>{totalQty} units | {formatCurrency(totalCost)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Schedule New */}
      {showSchedule && (
        <div className="rounded-xl p-5 border animate-fade-in" style={{ background: 'white', borderColor: FR.soil }}>
          <h3 className="mb-4" style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 18 }}>Schedule Creative Production</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-[0.1em] block mb-1" style={{ color: FR.stone }}>Unit Type</label>
              <select value={newUnit.typeId} onChange={e => setNewUnit({ ...newUnit, typeId: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: FR.salt, border: `1px solid ${FR.sand}`, color: FR.slate }}>
                {state.adUnitTypes.map(t => <option key={t.id} value={t.id}>{t.name} — {formatCurrency(t.costPerUnit)}/unit</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.1em] block mb-1" style={{ color: FR.stone }}>Week</label>
              <select value={newUnit.weekIndex} onChange={e => setNewUnit({ ...newUnit, weekIndex: parseInt(e.target.value) })}
                className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: FR.salt, border: `1px solid ${FR.sand}`, color: FR.slate }}>
                {weekDates.map((d, i) => <option key={i} value={i}>Wk {i} — {formatDate(d)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.1em] block mb-1" style={{ color: FR.stone }}>Quantity</label>
              <input type="number" value={newUnit.quantity} onChange={e => setNewUnit({ ...newUnit, quantity: parseInt(e.target.value) || 0 })}
                className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: FR.salt, border: `1px solid ${FR.sand}`, color: FR.slate }} />
              {(() => { const t = state.adUnitTypes.find(x => x.id === newUnit.typeId); return t?.moq ? <p className="text-[10px] mt-1" style={{ color: FR.sienna }}>MOQ: {t.moq} units</p> : null; })()}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={scheduleUnit} className="px-4 py-2 rounded-lg text-xs" style={{ background: FR.slate, color: FR.salt }}>Schedule</button>
            <button onClick={() => setShowSchedule(false)} className="px-4 py-2 rounded-lg text-xs" style={{ background: FR.sand, color: FR.slate }}>Cancel</button>
            <span className="text-xs ml-auto" style={{ color: FR.stone }}>
              Estimated cost: {formatCurrency(Math.max(newUnit.quantity, state.adUnitTypes.find(t => t.id === newUnit.typeId)?.moq || 0) * (state.adUnitTypes.find(t => t.id === newUnit.typeId)?.costPerUnit || 0))}
            </span>
          </div>
        </div>
      )}

      {/* Scheduled Units List */}
      {state.scheduledAdUnits.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ background: 'white', borderColor: FR.sand }}>
          <div className="p-3" style={{ background: FR.sand }}>
            <div className="flex justify-between">
              <span className="text-sm font-medium" style={{ color: FR.slate }}>Scheduled Creative</span>
              <span className="text-xs" style={{ color: FR.sage }}>{totalUnits} units | {formatCurrency(totalCreativeSpend)} total</span>
            </div>
          </div>
          {state.scheduledAdUnits.map(au => (
            <div key={au.id} className="flex items-center justify-between px-3 py-2" style={{ borderTop: `1px solid rgba(235,229,213,0.5)` }}>
              <div className="flex items-center gap-3">
                <span className="text-sm" style={{ color: FR.slate }}>{au.typeName}</span>
                <span className="text-xs" style={{ color: FR.stone }}>x{au.quantity} | Wk {au.weekIndex} ({formatDate(weekDates[au.weekIndex])})</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium" style={{ color: FR.slate }}>{formatCurrency(au.totalCost)}</span>
                <button onClick={() => dispatch({ type: 'REMOVE_AD_UNIT', payload: au.id })} className="p-1" style={{ color: FR.sienna }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
