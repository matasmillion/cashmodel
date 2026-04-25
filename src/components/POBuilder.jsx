import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { schedulePO } from '../utils/poScheduler';
import { formatCurrency, formatDate } from '../utils/calculations';
import { Plus, Trash2, Ship, Plane, Package, AlertCircle } from 'lucide-react';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70', soil: '#9A816B', sea: '#B5C7D3', sage: '#ADBDA3', sienna: '#D4956A' };

export default function POBuilder() {
  const { state, dispatch } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [freightMethod, setFreightMethod] = useState('sea');
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [step, setStep] = useState(1);

  const allProducts = Object.entries(state.products).flatMap(([colId, col]) =>
    col.products.map(p => ({ ...p, collectionId: colId, collectionName: col.collectionName }))
  );

  const toggleProduct = (productId) => {
    if (selectedProducts.includes(productId)) {
      setSelectedProducts(selectedProducts.filter(id => id !== productId));
      const newQ = { ...quantities }; delete newQ[productId]; setQuantities(newQ);
    } else {
      setSelectedProducts([...selectedProducts, productId]);
      setQuantities({ ...quantities, [productId]: 100 });
    }
  };

  const createPO = () => {
    const products = selectedProducts.map(id => allProducts.find(p => p.id === id)).filter(Boolean);
    const qtys = products.map(p => quantities[p.id] || 0);
    const po = schedulePO({ collectionName, products, quantities: qtys, deliveryDate, freightMethod });
    dispatch({ type: 'ADD_PO', payload: po });
    resetForm();
  };

  const resetForm = () => { setShowForm(false); setStep(1); setCollectionName(''); setDeliveryDate(''); setFreightMethod('sea'); setSelectedProducts([]); setQuantities({}); };

  const selectedProductDetails = selectedProducts.map(id => allProducts.find(p => p.id === id)).filter(Boolean);
  const totalPOCost = selectedProductDetails.reduce((sum, p) => {
    const qty = quantities[p.id] || 0;
    return sum + ((p.unitCost + p.weight * p.freightPerKg) * qty);
  }, 0);

  let preview = null;
  if (deliveryDate && selectedProducts.length > 0) {
    try {
      preview = schedulePO({ collectionName: collectionName || 'Preview', products: selectedProductDetails, quantities: selectedProductDetails.map(p => quantities[p.id] || 0), deliveryDate, freightMethod });
    } catch (e) {}
  }

  const inputStyle = { background: FR.salt, border: `1px solid ${FR.sand}`, borderRadius: 8, padding: '8px 12px', color: FR.slate, fontSize: 14, fontFamily: "'Inter', sans-serif" };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 24 }}>Purchase Orders</h2>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs" style={{ background: FR.slate, color: FR.salt }}>
          <Plus size={14} /> New PO
        </button>
      </div>

      {state.manualPOs.length > 0 && state.manualPOs.map(po => (
        <div key={po.id} className="rounded-xl p-4 border" style={{ background: 'white', borderColor: FR.sand }}>
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 18 }}>{po.collectionName}</h3>
              <p className="text-xs" style={{ color: FR.stone }}>{po.freightMethod === 'air' ? 'Air' : 'Sea'} Freight | Delivery: {formatDate(po.deliveryDate)}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold" style={{ color: FR.sage, fontFamily: "'Cormorant Garamond', serif", fontSize: 18 }}>{formatCurrency(po.totalCost)}</span>
              <button onClick={() => dispatch({ type: 'REMOVE_PO', payload: po.id })} className="p-1 rounded" style={{ color: FR.sienna }}><Trash2 size={14} /></button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {po.lineItems.map((li, i) => (
              <div key={i} className="rounded px-2 py-1.5" style={{ background: FR.salt }}>
                <div className="text-xs" style={{ color: FR.stone }}>{li.product.name}</div>
                <div className="text-sm" style={{ color: FR.slate }}>{li.quantity} units @ {formatCurrency(li.landedCPU)}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 text-xs">
            {po.payments.map((pmt, i) => (
              <div key={i} className="flex-1 rounded-lg p-2 border" style={{
                background: i === 0 ? 'rgba(181,199,211,0.1)' : i === 1 ? 'rgba(212,149,106,0.1)' : 'rgba(173,189,163,0.1)',
                borderColor: i === 0 ? 'rgba(181,199,211,0.3)' : i === 1 ? 'rgba(212,149,106,0.3)' : 'rgba(173,189,163,0.3)',
              }}>
                <div style={{ color: FR.stone }}>{pmt.label}</div>
                <div className="font-medium" style={{ color: FR.slate }}>{formatCurrency(pmt.amount)}</div>
                <div style={{ color: FR.stone }}>Wk {pmt.weekIndex} | {formatDate(pmt.date)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {showForm && (
        <div className="rounded-xl p-5 animate-fade-in border" style={{ background: 'white', borderColor: FR.soil }}>
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, marginBottom: 16 }}>Create New Purchase Order</h3>

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs block mb-1" style={{ color: FR.stone, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Collection Name</label>
                <input value={collectionName} onChange={e => setCollectionName(e.target.value)} placeholder="e.g., Summer 2026 Collection" style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs block mb-1" style={{ color: FR.stone, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Delivery Date</label>
                  <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: FR.stone, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Freight Method</label>
                  <div className="flex gap-2">
                    <button onClick={() => setFreightMethod('sea')}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm border"
                      style={{ background: freightMethod === 'sea' ? FR.slate : FR.salt, color: freightMethod === 'sea' ? FR.salt : FR.stone, borderColor: freightMethod === 'sea' ? FR.slate : FR.sand }}>
                      <Ship size={16} /> Sea (35d)
                    </button>
                    <button onClick={() => setFreightMethod('air')}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm border"
                      style={{ background: freightMethod === 'air' ? FR.sienna : FR.salt, color: freightMethod === 'air' ? 'white' : FR.stone, borderColor: freightMethod === 'air' ? FR.sienna : FR.sand }}>
                      <Plane size={16} /> Air (9d)
                    </button>
                  </div>
                </div>
              </div>
              <button onClick={() => setStep(2)} disabled={!collectionName || !deliveryDate}
                className="px-4 py-2 rounded-lg text-sm disabled:opacity-50" style={{ background: FR.slate, color: FR.salt }}>
                Next: Select Products
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs rounded-lg p-3" style={{ background: 'rgba(212,149,106,0.1)', border: `1px solid rgba(212,149,106,0.2)`, color: FR.soil }}>
                <AlertCircle size={14} /> Select the products in this PO and set quantities for each.
              </div>

              {Object.entries(state.products).map(([colId, col]) => (
                <div key={colId}>
                  <h4 className="text-[10px] uppercase tracking-[0.12em] mb-2" style={{ color: FR.stone }}>{col.collectionName}</h4>
                  <div className="space-y-1">
                    {col.products.map(p => {
                      const isSelected = selectedProducts.includes(p.id);
                      const landedCPU = p.unitCost + (p.weight * p.freightPerKg);
                      return (
                        <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg border cursor-pointer"
                          style={{ background: isSelected ? 'rgba(181,199,211,0.1)' : FR.salt, borderColor: isSelected ? FR.sea : FR.sand }}
                          onClick={() => toggleProduct(p.id)}>
                          <input type="checkbox" checked={isSelected} readOnly className="rounded" />
                          <div className="flex-1">
                            <span className="text-sm" style={{ color: FR.slate }}>{p.name}</span>
                            <span className="text-xs ml-2" style={{ color: FR.stone }}>Landed CPU: {formatCurrency(landedCPU)}</span>
                          </div>
                          {isSelected && (
                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              <label className="text-xs" style={{ color: FR.stone }}>Qty:</label>
                              <input type="number" value={quantities[p.id] || 0}
                                onChange={e => setQuantities({ ...quantities, [p.id]: parseInt(e.target.value) || 0 })}
                                className="w-20 rounded px-2 py-1 text-right text-sm" style={{ background: 'white', border: `1px solid ${FR.sea}`, color: '#2563eb' }} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {selectedProducts.length > 0 && (
                <div className="rounded-lg p-4 border" style={{ background: FR.salt, borderColor: FR.sand }}>
                  <div className="flex justify-between text-sm mb-2">
                    <span style={{ color: FR.stone }}>Total PO Cost:</span>
                    <span className="text-lg font-semibold" style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif" }}>{formatCurrency(totalPOCost)}</span>
                  </div>
                  {preview && (
                    <div className="space-y-1 mt-3 pt-3" style={{ borderTop: `1px solid ${FR.sand}` }}>
                      <h4 className="text-[10px] uppercase tracking-[0.12em] mb-2" style={{ color: FR.stone }}>Payment Schedule Preview</h4>
                      {preview.payments.map((pmt, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span style={{ color: FR.stone }}>{pmt.label}</span>
                          <span style={{ color: FR.slate }}>{formatCurrency(pmt.amount)} — {formatDate(pmt.date)} (Wk {pmt.weekIndex})</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs pt-2 mt-2" style={{ borderTop: `1px solid ${FR.sand}` }}>
                        <span style={{ color: FR.stone }}>Production starts</span>
                        <span style={{ color: FR.slate }}>{formatDate(preview.productionStartDate)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span style={{ color: FR.stone }}>Ships from vendor</span>
                        <span style={{ color: FR.slate }}>{formatDate(preview.shipmentDate)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span style={{ color: FR.stone }}>Arrives at warehouse</span>
                        <span style={{ color: FR.slate }}>{formatDate(preview.deliveryDate)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="px-4 py-2 rounded-lg text-sm" style={{ background: FR.sand, color: FR.slate }}>Back</button>
                <button onClick={createPO} disabled={selectedProducts.length === 0} className="px-4 py-2 rounded-lg text-sm disabled:opacity-50" style={{ background: FR.slate, color: FR.salt }}>Create PO</button>
                <button onClick={resetForm} className="px-4 py-2 rounded-lg text-sm" style={{ background: FR.salt, color: FR.stone, border: `1px solid ${FR.sand}` }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {state.manualPOs.length === 0 && !showForm && (
        <div className="rounded-xl p-8 text-center border border-dashed" style={{ borderColor: FR.sand }}>
          <Package size={32} className="mx-auto mb-3" style={{ color: FR.sand }} />
          <p className="text-sm" style={{ color: FR.stone }}>No purchase orders yet. Create one to see its impact on your cashflow.</p>
        </div>
      )}
    </div>
  );
}
