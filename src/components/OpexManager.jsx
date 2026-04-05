import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../utils/calculations';
import { Plus, ToggleLeft, ToggleRight } from 'lucide-react';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70', soil: '#9A816B', sea: '#B5C7D3', sage: '#ADBDA3', sienna: '#D4956A' };

export default function OpexManager() {
  const { state, dispatch, totalMonthlyOpex } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [newSub, setNewSub] = useState({ name: '', cost: 0, category: 'Mandatory', billingDate: 1 });

  const categories = ['Mandatory', 'Revenue/Cost', 'Luxury'];
  const grouped = categories.map(cat => ({
    category: cat, items: state.subscriptions.filter(s => s.category === cat),
    total: state.subscriptions.filter(s => s.category === cat && s.active).reduce((sum, s) => sum + s.cost, 0),
  }));

  const warehouseItems = [
    { key: 'adminTech', label: 'Admin & Tech', value: state.warehouse.adminTech },
    { key: 'bins', label: 'Bins (31 units)', value: state.warehouse.bins },
    { key: 'pallets', label: 'Pallets', value: state.warehouse.pallets },
    { key: 'returns', label: 'Returns', value: state.warehouse.returns },
    { key: 'nathanBelete', label: 'Nathan Belete', value: state.warehouse.nathanBelete },
  ];
  const warehouseTotal = warehouseItems.reduce((sum, item) => sum + item.value, 0);

  const inputStyle = { background: FR.salt, border: `1px solid ${FR.sand}`, borderRadius: 4, padding: '2px 8px', color: '#2563eb', textAlign: 'right', fontSize: 12, width: 80 };

  return (
    <div className="space-y-6">
      <div>
        <h2 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 24 }}>Operating Expenses</h2>
        <p className="text-xs" style={{ color: FR.stone }}>Total Monthly: {formatCurrency(totalMonthlyOpex)}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 18 }}>Software Subscriptions</h3>
          {grouped.map(group => (
            <div key={group.category} className="rounded-xl overflow-hidden border" style={{ background: 'white', borderColor: FR.sand }}>
              <div className="flex justify-between items-center p-3" style={{ background: FR.sand }}>
                <span className="text-sm font-medium" style={{ color: FR.slate }}>{group.category}</span>
                <span className="text-xs font-medium" style={{ color: FR.sage }}>{formatCurrency(group.total)}/mo</span>
              </div>
              <div>
                {group.items.map(sub => (
                  <div key={sub.id} className="flex items-center justify-between px-3 py-2" style={{ borderTop: `1px solid rgba(235,229,213,0.5)` }}>
                    <div className="flex items-center gap-3">
                      <button onClick={() => dispatch({ type: 'UPDATE_SUBSCRIPTION', payload: { id: sub.id, updates: { active: !sub.active } } })}>
                        {sub.active ? <ToggleRight size={20} style={{ color: FR.sage }} /> : <ToggleLeft size={20} style={{ color: FR.stone }} />}
                      </button>
                      <span className="text-sm" style={{ color: sub.active ? FR.slate : FR.stone, textDecoration: sub.active ? 'none' : 'line-through' }}>{sub.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input type="number" value={sub.cost}
                        onChange={e => dispatch({ type: 'UPDATE_SUBSCRIPTION', payload: { id: sub.id, updates: { cost: parseFloat(e.target.value) || 0 } } })}
                        style={inputStyle} />
                      <span className="text-xs w-12" style={{ color: FR.stone }}>{sub.billingDate ? `${sub.billingDate}th` : '-'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1 text-xs" style={{ color: FR.soil }}>
            <Plus size={14} /> Add Subscription
          </button>

          {showAdd && (
            <div className="rounded-lg p-3 space-y-2 animate-fade-in border" style={{ background: 'white', borderColor: FR.sand }}>
              <div className="grid grid-cols-2 gap-2">
                <input value={newSub.name} onChange={e => setNewSub({ ...newSub, name: e.target.value })}
                  placeholder="Name" className="rounded px-2 py-1 text-sm" style={{ background: FR.salt, border: `1px solid ${FR.sand}`, color: FR.slate }} />
                <input type="number" value={newSub.cost} onChange={e => setNewSub({ ...newSub, cost: parseFloat(e.target.value) || 0 })}
                  placeholder="Cost/mo" className="rounded px-2 py-1 text-sm" style={{ background: FR.salt, border: `1px solid ${FR.sand}`, color: FR.slate }} />
              </div>
              <select value={newSub.category} onChange={e => setNewSub({ ...newSub, category: e.target.value })}
                className="w-full rounded px-2 py-1 text-sm" style={{ background: FR.salt, border: `1px solid ${FR.sand}`, color: FR.slate }}>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="flex gap-2">
                <button onClick={() => {
                  dispatch({ type: 'ADD_SUBSCRIPTION', payload: { ...newSub, id: newSub.name.toLowerCase().replace(/\s+/g, '-'), active: true } });
                  setShowAdd(false); setNewSub({ name: '', cost: 0, category: 'Mandatory', billingDate: 1 });
                }} className="px-3 py-1 rounded text-xs" style={{ background: FR.slate, color: FR.salt }}>Add</button>
                <button onClick={() => setShowAdd(false)} className="px-3 py-1 rounded text-xs" style={{ background: FR.sand, color: FR.slate }}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 18 }}>Warehouse & Fulfillment</h3>
          <div className="rounded-xl overflow-hidden border" style={{ background: 'white', borderColor: FR.sand }}>
            <div className="flex justify-between items-center p-3" style={{ background: FR.sand }}>
              <span className="text-sm font-medium" style={{ color: FR.slate }}>Monthly Warehouse</span>
              <span className="text-xs font-medium" style={{ color: FR.sage }}>{formatCurrency(warehouseTotal)}/mo</span>
            </div>
            {warehouseItems.map(item => (
              <div key={item.key} className="flex items-center justify-between px-3 py-2" style={{ borderTop: `1px solid rgba(235,229,213,0.5)` }}>
                <span className="text-sm" style={{ color: FR.slate }}>{item.label}</span>
                <input type="number" value={item.value}
                  onChange={e => dispatch({ type: 'UPDATE_WAREHOUSE', payload: { [item.key]: parseFloat(e.target.value) || 0 } })}
                  style={{ ...inputStyle, width: 96 }} />
              </div>
            ))}
          </div>

          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 18 }}>Interest & Debt</h3>
          <div className="rounded-xl p-4 space-y-3 border" style={{ background: 'white', borderColor: FR.sand }}>
            {[
              ['Long-term Loan Balance', formatCurrency(state.loans.longTermLoan.balance)],
              ['Interest Payment (every 4 wks)', formatCurrency(state.loans.longTermLoan.interestPayment)],
              ['Shopify Capital Balance', formatCurrency(state.loans.shopifyCapital.balance)],
              ['Shopify Capital Rate', (state.loans.shopifyCapital.repaymentRate * 100).toFixed(0) + '% of revenue'],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between text-sm">
                <span style={{ color: FR.stone }}>{label}</span>
                <span style={{ color: FR.slate }}>{val}</span>
              </div>
            ))}
          </div>

          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 18 }}>Credit Cards</h3>
          <div className="rounded-xl overflow-hidden border" style={{ background: 'white', borderColor: FR.sand }}>
            {state.creditCards.map(card => (
              <div key={card.id} className="flex items-center justify-between px-3 py-2" style={{ borderTop: `1px solid rgba(235,229,213,0.5)` }}>
                <div>
                  <span className="text-sm" style={{ color: FR.slate }}>{card.name}</span>
                  <span className="text-xs ml-2" style={{ color: FR.stone }}>Min: {formatCurrency(card.minPayment)}</span>
                </div>
                <span className="text-sm font-medium" style={{ color: FR.sienna }}>{formatCurrency(card.balance)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
