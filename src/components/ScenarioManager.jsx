import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatPercent } from '../utils/calculations';
import { Plus, Trash2, Check, Sliders } from 'lucide-react';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70', soil: '#9A816B', sea: '#B5C7D3', sage: '#ADBDA3', sienna: '#D4956A' };

export default function ScenarioManager() {
  const { state, dispatch } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');

  const assumptionFields = [
    { key: 'weeklyGrowthH1', label: 'Weekly Growth (H1)', type: 'growth', step: 0.01 },
    { key: 'weeklyGrowthH2', label: 'Weekly Growth (H2)', type: 'growth', step: 0.01 },
    { key: 'mer', label: 'MER (Ad Spend / Rev)', type: 'percent', step: 0.01 },
    { key: 'cogsPercent', label: 'COGS %', type: 'percent', step: 0.01 },
    { key: 'profitPercent', label: 'Profit %', type: 'percent', step: 0.01 },
    { key: 'paymentProcessingPercent', label: 'Payment Processing %', type: 'percent', step: 0.005 },
    { key: 'fulfillmentPercent', label: 'Fulfillment %', type: 'percent', step: 0.01 },
    { key: 'shopifyCapitalRate', label: 'Shopify Capital Rate', type: 'percent', step: 0.01 },
    { key: 'creativePercent', label: 'Creative % of Rev', type: 'percent', step: 0.01 },
  ];

  const createScenario = () => {
    if (!newName.trim()) return;
    dispatch({ type: 'ADD_SCENARIO', payload: { id: newName.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(), name: newName } });
    setNewName(''); setShowAdd(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 24 }}>Scenarios & Assumptions</h2>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs" style={{ background: FR.slate, color: FR.salt }}>
          <Plus size={14} /> New Scenario
        </button>
      </div>

      {showAdd && (
        <div className="flex gap-2 p-4 rounded-xl animate-fade-in border" style={{ background: 'white', borderColor: FR.sand }}>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Scenario name (e.g., Conservative)" className="flex-1 px-3 py-1.5 rounded text-sm" style={{ background: FR.salt, border: `1px solid ${FR.sand}`, color: FR.slate }} />
          <button onClick={createScenario} className="px-3 py-1.5 rounded text-sm" style={{ background: FR.slate, color: FR.salt }}>Create</button>
          <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded text-sm" style={{ background: FR.sand, color: FR.slate }}>Cancel</button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {state.scenarios.map(s => (
          <div key={s.id} className="flex items-center gap-2">
            <button onClick={() => dispatch({ type: 'SWITCH_SCENARIO', payload: s.id })}
              className="px-3 py-1.5 rounded-lg text-sm border"
              style={{ background: s.isActive ? FR.slate : 'white', color: s.isActive ? FR.salt : FR.stone, borderColor: s.isActive ? FR.slate : FR.sand }}>
              {s.isActive && <Check size={12} className="inline mr-1" />}{s.name}
            </button>
            {state.scenarios.length > 1 && (
              <button onClick={() => dispatch({ type: 'DELETE_SCENARIO', payload: s.id })} className="p-1" style={{ color: FR.stone }}><Trash2 size={12} /></button>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl p-5 border" style={{ background: 'white', borderColor: FR.sand }}>
        <div className="flex items-center gap-2 mb-4">
          <Sliders size={16} style={{ color: FR.soil }} />
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 18 }}>Assumptions</h3>
          <span className="text-xs" style={{ color: FR.stone }}>({state.scenarios.find(s => s.id === state.activeScenarioId)?.name})</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {assumptionFields.map(field => {
            const value = state.assumptions[field.key];
            return (
              <div key={field.key} className="space-y-1">
                <div className="flex justify-between">
                  <label className="text-xs" style={{ color: FR.stone }}>{field.label}</label>
                  <span className="text-xs font-mono font-medium" style={{ color: FR.soil }}>
                    {field.type === 'growth' ? `${value}x` : formatPercent(value)}
                  </span>
                </div>
                <input type="range"
                  min={field.type === 'growth' ? 0.9 : 0}
                  max={field.type === 'growth' ? 1.2 : 0.5}
                  step={field.step}
                  value={value}
                  onChange={e => dispatch({ type: 'UPDATE_ASSUMPTIONS', payload: { [field.key]: parseFloat(e.target.value) } })}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{ background: FR.sand,
                    WebkitAppearance: 'none',
                  }} />
                <style>{`
                  input[type="range"]::-webkit-slider-thumb {
                    -webkit-appearance: none; width: 12px; height: 12px;
                    border-radius: 50%; background: ${FR.soil}; cursor: pointer;
                  }
                `}</style>
                <div className="flex justify-between text-[10px]" style={{ color: FR.stone }}>
                  <span>{field.type === 'growth' ? '0.9x' : '0%'}</span>
                  <span>{field.type === 'growth' ? '1.2x' : '50%'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
