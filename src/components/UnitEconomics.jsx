import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatPercent, calculateUnitEconomics } from '../utils/calculations';
import { Plus, Trash2, ChevronDown, ChevronRight, Edit3, Check, X } from 'lucide-react';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70', soil: '#9A816B', sea: '#B5C7D3', sage: '#ADBDA3', sienna: '#D4956A' };

export default function UnitEconomics() {
  const { state, dispatch } = useApp();
  const [expandedCollection, setExpandedCollection] = useState(Object.keys(state.products)[0]);
  const [showAddCollection, setShowAddCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [showAddProduct, setShowAddProduct] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [newProduct, setNewProduct] = useState({
    name: '', price: 0, unitCost: 0, production: 0, packaging: 0.206,
    freightForwarding: 0, shipping: 10, shippingLabel: 5.53, pickPack: 2.72,
    stickersCard: 0.189, paymentProcessing: 0, weight: 0.5, freightPerKg: 4,
  });

  const addCollection = () => {
    if (!newCollectionName.trim()) return;
    const id = newCollectionName.toLowerCase().replace(/\s+/g, '-');
    dispatch({ type: 'ADD_COLLECTION', payload: { id, name: newCollectionName } });
    setNewCollectionName('');
    setShowAddCollection(false);
    setExpandedCollection(id);
  };

  const addProduct = (collectionId) => {
    const id = newProduct.name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
    const pp = newProduct.price * 0.04;
    dispatch({ type: 'ADD_PRODUCT', payload: { collectionId, product: { ...newProduct, id, paymentProcessing: pp, cogs: 0, grossProfit: 0, grossMargin: 0 } } });
    setShowAddProduct(null);
    setNewProduct({ name: '', price: 0, unitCost: 0, production: 0, packaging: 0.206, freightForwarding: 0, shipping: 10, shippingLabel: 5.53, pickPack: 2.72, stickersCard: 0.189, paymentProcessing: 0, weight: 0.5, freightPerKg: 4 });
  };

  const startEdit = (product) => { setEditingProduct(product.id); setEditValues({ ...product }); };
  const saveEdit = (collectionId) => { dispatch({ type: 'UPDATE_PRODUCT', payload: { collectionId, productId: editingProduct, updates: editValues } }); setEditingProduct(null); };

  // Base inputs the user can edit
  const inputFields = [
    { key: 'price', label: 'Price' },
    { key: 'unitCost', label: 'Unit Cost' },
    { key: 'production', label: 'Production' },
    { key: 'packaging', label: 'Packaging' },
    { key: 'shippingLabel', label: 'Ship Label' },
    { key: 'pickPack', label: 'Pick & Pack' },
    { key: 'stickersCard', label: 'Stickers+Card' },
    { key: 'weight', label: 'Weight (kg)', notCurrency: true },
    { key: 'freightPerKg', label: 'Freight/kg' },
  ];
  // Derived from formulas — read-only display
  const formulaFields = [
    { key: 'freightForwarding', label: 'Freight Total' },
    { key: 'shipping', label: 'Shipping Total' },
    { key: 'paymentProcessing', label: 'Payment Proc.' },
  ];

  const inputStyle = { background: FR.salt, border: `1px solid ${FR.sand}`, borderRadius: 4, padding: '2px 6px', color: '#2563eb', textAlign: 'right', fontSize: 11, width: 64 };
  const btnPrimary = { background: FR.slate, color: FR.salt, border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' };
  const btnSecondary = { background: FR.sand, color: FR.slate, border: `1px solid ${FR.sand}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 24 }}>Unit Economics</h2>
        <button onClick={() => setShowAddCollection(!showAddCollection)} className="flex items-center gap-1" style={btnPrimary}>
          <Plus size={14} /> New Collection
        </button>
      </div>

      {showAddCollection && (
        <div className="flex gap-2 p-4 rounded-xl animate-fade-in border" style={{ background: 'white', borderColor: FR.sand }}>
          <input value={newCollectionName} onChange={e => setNewCollectionName(e.target.value)}
            placeholder="Collection name..." className="flex-1 px-3 py-1.5 rounded text-sm" style={{ background: FR.salt, border: `1px solid ${FR.sand}`, color: FR.slate }} />
          <button onClick={addCollection} style={{ ...btnPrimary, background: FR.sage, color: FR.slate }}>Add</button>
          <button onClick={() => setShowAddCollection(false)} style={btnSecondary}>Cancel</button>
        </div>
      )}

      {Object.entries(state.products).map(([collectionId, collection]) => (
        <div key={collectionId} className="rounded-xl overflow-hidden border" style={{ background: 'white', borderColor: FR.sand }}>
          <button onClick={() => setExpandedCollection(expandedCollection === collectionId ? null : collectionId)}
            className="w-full flex items-center justify-between p-4" style={{ background: expandedCollection === collectionId ? 'rgba(235,229,213,0.3)' : 'white' }}>
            <div className="flex items-center gap-2">
              {expandedCollection === collectionId ? <ChevronDown size={16} style={{ color: FR.stone }} /> : <ChevronRight size={16} style={{ color: FR.stone }} />}
              <span style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 18 }}>{collection.collectionName}</span>
              <span className="text-xs" style={{ color: FR.stone }}>({collection.products.length} products)</span>
            </div>
          </button>

          {expandedCollection === collectionId && (
            <div style={{ borderTop: `1px solid ${FR.sand}` }}>
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-xs" style={{ fontFamily: "'Inter', sans-serif" }}>
                  <thead>
                    <tr style={{ background: FR.sand }}>
                      <th className="px-3 py-2 text-left font-medium w-32" style={{ color: FR.stone }}>Product</th>
                      {inputFields.map(f => <th key={f.key} className="px-2 py-2 text-right font-medium" style={{ color: '#2563eb', fontSize: 10 }}>{f.label}</th>)}
                      {formulaFields.map(f => <th key={f.key} className="px-2 py-2 text-right font-medium" style={{ color: FR.slate, fontSize: 10 }}>{f.label}</th>)}
                      <th className="px-2 py-2 text-right font-medium" style={{ color: FR.slate, fontSize: 10 }}>COGS</th>
                      <th className="px-2 py-2 text-right font-medium" style={{ color: '#166534', fontSize: 10 }}>Gross Profit</th>
                      <th className="px-2 py-2 text-right font-medium" style={{ color: '#166534', fontSize: 10 }}>GM %</th>
                      <th className="px-2 py-2 text-center font-medium" style={{ color: FR.stone }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collection.products.map(product => {
                      const calc = calculateUnitEconomics(editingProduct === product.id ? editValues : product, state.assumptions);
                      const editing = editingProduct === product.id;
                      return (
                        <tr key={product.id} style={{ borderTop: `1px solid rgba(235,229,213,0.5)` }}>
                          <td className="px-3 py-2 font-medium" style={{ color: FR.slate }}>{product.name}</td>
                          {inputFields.map(f => (
                            <td key={f.key} className="px-2 py-2 text-right">
                              {editing ? (
                                <input type="number" value={editValues[f.key] ?? 0}
                                  step={f.key === 'weight' ? 0.1 : f.key === 'freightPerKg' ? 0.5 : 1}
                                  onChange={e => setEditValues({ ...editValues, [f.key]: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                              ) : (
                                <span style={{ color: '#2563eb' }}>{f.notCurrency ? product[f.key] : formatCurrency(product[f.key])}</span>
                              )}
                            </td>
                          ))}
                          {formulaFields.map(f => (
                            <td key={f.key} className="px-2 py-2 text-right" style={{ color: FR.slate }}>{formatCurrency(calc[f.key])}</td>
                          ))}
                          <td className="px-2 py-2 text-right font-medium" style={{ color: FR.slate }}>{formatCurrency(calc.cogs)}</td>
                          <td className="px-2 py-2 text-right font-medium" style={{ color: '#166534' }}>{formatCurrency(calc.grossProfit)}</td>
                          <td className="px-2 py-2 text-right" style={{ color: '#166534' }}>{formatPercent(calc.grossMargin)}</td>
                          <td className="px-2 py-2 text-center">
                            {editing ? (
                              <div className="flex gap-1 justify-center">
                                <button onClick={() => saveEdit(collectionId)} className="p-1 rounded" style={{ color: FR.sage }}><Check size={14} /></button>
                                <button onClick={() => setEditingProduct(null)} className="p-1 rounded" style={{ color: FR.stone }}><X size={14} /></button>
                              </div>
                            ) : (
                              <div className="flex gap-1 justify-center">
                                <button onClick={() => startEdit(product)} className="p-1 rounded" style={{ color: FR.sea }}><Edit3 size={14} /></button>
                                <button onClick={() => dispatch({ type: 'DELETE_PRODUCT', payload: { collectionId, productId: product.id } })} className="p-1 rounded" style={{ color: FR.sienna }}><Trash2 size={14} /></button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {showAddProduct === collectionId ? (
                <div className="p-4 animate-fade-in" style={{ borderTop: `1px solid ${FR.sand}`, background: 'rgba(235,229,213,0.15)' }}>
                  <h4 className="text-sm font-medium mb-3" style={{ color: FR.slate }}>Add New Product</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs" style={{ color: FR.stone }}>Name</label>
                      <input value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
                        className="w-full rounded px-2 py-1 text-sm" style={{ background: FR.salt, border: `1px solid ${FR.sand}`, color: FR.slate }} />
                    </div>
                    {inputFields.map(f => (
                      <div key={f.key}>
                        <label className="text-xs" style={{ color: FR.stone }}>{f.label}</label>
                        <input type="number" value={newProduct[f.key]} onChange={e => setNewProduct({ ...newProduct, [f.key]: parseFloat(e.target.value) || 0 })}
                          className="w-full rounded px-2 py-1 text-sm" style={{ background: FR.salt, border: `1px solid ${FR.sand}`, color: FR.slate }} />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => addProduct(collectionId)} style={{ ...btnPrimary, background: FR.sage, color: FR.slate }}>Add Product</button>
                    <button onClick={() => setShowAddProduct(null)} style={btnSecondary}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="p-3" style={{ borderTop: `1px solid ${FR.sand}` }}>
                  <button onClick={() => setShowAddProduct(collectionId)} className="flex items-center gap-1 text-xs" style={{ color: FR.soil }}>
                    <Plus size={14} /> Add Product
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
