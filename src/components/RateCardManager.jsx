import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../utils/calculations';
import { Upload, FileText, Trash2, Plus, Sparkles, Check, AlertCircle, Edit3 } from 'lucide-react';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70', soil: '#9A816B', sea: '#B5C7D3', sage: '#ADBDA3', sienna: '#D4956A' };

const EMPTY_RATE_CARD = {
  provider: '',
  pickPack: 0,
  labelBase: 0,
  storagePerPallet: 0,
  returnsFlat: 0,
  packagingMaterials: 0,
  weightTiers: [
    { label: '0 - 1 lb', minLbs: 0, maxLbs: 1, rate: 0 },
    { label: '1 - 2 lbs', minLbs: 1, maxLbs: 2, rate: 0 },
    { label: '2 - 3 lbs', minLbs: 2, maxLbs: 3, rate: 0 },
    { label: '3 - 5 lbs', minLbs: 3, maxLbs: 5, rate: 0 },
    { label: '5 - 10 lbs', minLbs: 5, maxLbs: 10, rate: 0 },
    { label: '10+ lbs', minLbs: 10, maxLbs: 999, rate: 0 },
  ],
  surcharges: [],
};

export default function RateCardManager() {
  const { state, dispatch } = useApp();
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [editMode, setEditMode] = useState(!state.rateCard);
  const [draft, setDraft] = useState(state.rateCard || { ...EMPTY_RATE_CARD });
  const [showAddSurcharge, setShowAddSurcharge] = useState(false);
  const [newSurcharge, setNewSurcharge] = useState({ name: '', amount: 0, per: 'order' });

  const rateCard = state.rateCard;

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setParseError('');
    setParsing(true);

    try {
      const base64 = await fileToBase64(file);
      const mediaType = file.type || 'application/pdf';

      const apiKey = localStorage.getItem('anthropic_api_key');
      if (!apiKey) {
        setParseError('Add your Anthropic API key in the Integrations tab to use AI parsing. You can still enter rates manually below.');
        setParsing(false);
        setUploading(false);
        setEditMode(true);
        return;
      }

      const proxyUrl = localStorage.getItem('anthropic_proxy_url') || '/api/anthropic';

      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: [
              {
                type: mediaType.startsWith('image/') ? 'image' : 'document',
                source: { type: 'base64', media_type: mediaType, data: base64 },
              },
              {
                type: 'text',
                text: `Parse this 3PL/fulfillment rate card. Extract ALL fees into this exact JSON structure:
{
  "provider": "3PL company name",
  "pickPack": <number, per order pick & pack fee>,
  "labelBase": <number, base shipping label cost if listed>,
  "storagePerPallet": <number, monthly pallet storage fee>,
  "returnsFlat": <number, flat fee per return>,
  "packagingMaterials": <number, packaging materials per order>,
  "weightTiers": [
    {"label": "0 - 1 lb", "minLbs": 0, "maxLbs": 1, "rate": <number>},
    {"label": "1 - 2 lbs", "minLbs": 1, "maxLbs": 2, "rate": <number>},
    ...continue for all weight tiers listed
  ],
  "surcharges": [
    {"name": "description", "amount": <number>, "per": "order"|"unit"|"month"}
  ]
}
Return ONLY valid JSON. Use 0 for any fees not listed. Convert all values to USD numbers.`,
              },
            ],
          }],
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const result = await response.json();
      const text = result.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Could not parse response');

      const parsed = JSON.parse(jsonMatch[0]);
      setDraft(parsed);
      setEditMode(true);
      setParsing(false);
      setUploading(false);
    } catch (err) {
      console.error('Parse error:', err);
      setParseError('AI parsing failed. Enter your rates manually below.');
      setParsing(false);
      setUploading(false);
      setEditMode(true);
    }
  };

  const saveRateCard = () => {
    dispatch({ type: 'SET_RATE_CARD', payload: draft });
    setEditMode(false);
  };

  const clearRateCard = () => {
    dispatch({ type: 'SET_RATE_CARD', payload: null });
    setDraft({ ...EMPTY_RATE_CARD });
    setEditMode(true);
  };

  const addSurcharge = () => {
    if (!newSurcharge.name) return;
    setDraft({ ...draft, surcharges: [...(draft.surcharges || []), { ...newSurcharge, id: Date.now().toString() }] });
    setNewSurcharge({ name: '', amount: 0, per: 'order' });
    setShowAddSurcharge(false);
  };

  const removeSurcharge = (idx) => {
    setDraft({ ...draft, surcharges: draft.surcharges.filter((_, i) => i !== idx) });
  };

  const updateWeightTier = (idx, field, value) => {
    const tiers = [...draft.weightTiers];
    tiers[idx] = { ...tiers[idx], [field]: parseFloat(value) || 0 };
    setDraft({ ...draft, weightTiers: tiers });
  };

  const addWeightTier = () => {
    const last = draft.weightTiers[draft.weightTiers.length - 1];
    setDraft({
      ...draft,
      weightTiers: [...draft.weightTiers, { label: `${last?.maxLbs || 0}+ lbs`, minLbs: last?.maxLbs || 0, maxLbs: (last?.maxLbs || 0) + 5, rate: 0 }],
    });
  };

  const removeWeightTier = (idx) => {
    setDraft({ ...draft, weightTiers: draft.weightTiers.filter((_, i) => i !== idx) });
  };

  // Calculate estimated per-order cost for each product
  const getEstimatedCost = (product) => {
    const card = rateCard || draft;
    if (!card) return null;
    const weightLbs = (product.weight || 0) * 2.205; // kg to lbs
    const tier = card.weightTiers?.find(t => weightLbs >= t.minLbs && weightLbs < t.maxLbs);
    const shippingRate = tier?.rate || card.labelBase || 0;
    return {
      pickPack: card.pickPack || 0,
      shipping: shippingRate,
      packaging: card.packagingMaterials || 0,
      total: (card.pickPack || 0) + shippingRate + (card.packagingMaterials || 0),
    };
  };

  const inputStyle = { background: 'white', border: `1px solid ${FR.sand}`, borderRadius: 8, padding: '8px 12px', color: FR.slate, fontSize: 14, fontFamily: "'Inter', sans-serif", width: '100%' };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 24 }}>Fulfillment & 3PL Rate Card</h2>
          <p className="text-xs mt-1" style={{ color: FR.stone }}>Upload your 3PL rate card or enter rates manually. AI will parse PDF/images automatically.</p>
        </div>
        {rateCard && !editMode && (
          <div className="flex gap-2">
            <button onClick={() => setEditMode(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs" style={{ background: FR.sand, color: FR.slate }}>
              <Edit3 size={14} /> Edit
            </button>
            <button onClick={clearRateCard} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs" style={{ background: '#FEF2F2', color: '#991B1B' }}>
              <Trash2 size={14} /> Clear
            </button>
          </div>
        )}
      </div>

      {/* Upload Section */}
      {editMode && (
        <div className="rounded-xl p-5 border" style={{ background: 'white', borderColor: FR.sand }}>
          <div className="flex items-center gap-3 mb-4">
            <Sparkles size={18} style={{ color: FR.soil }} />
            <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 18 }}>AI Rate Card Parser</h3>
          </div>
          <p className="text-xs mb-3" style={{ color: FR.stone }}>Upload your 3PL's rate card (PDF, image, or screenshot). AI will extract all fees and populate the fields below.</p>

          <label className="flex items-center justify-center gap-2 py-8 rounded-lg border-2 border-dashed cursor-pointer transition-colors"
            style={{ borderColor: FR.sand, color: FR.stone }}
            onDragOver={e => e.preventDefault()}>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={handleFileUpload} className="hidden" />
            {parsing ? (
              <span className="text-sm">Parsing rate card with AI...</span>
            ) : (
              <>
                <Upload size={20} />
                <span className="text-sm">Drop rate card here or click to upload</span>
              </>
            )}
          </label>

          {parseError && (
            <div className="flex items-start gap-2 mt-3 p-3 rounded-lg text-xs" style={{ background: '#FEF3C7', color: '#92400E' }}>
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}
        </div>
      )}

      {/* Rate Card Form */}
      {editMode && (
        <div className="rounded-xl p-5 border" style={{ background: 'white', borderColor: FR.sand }}>
          <h3 className="mb-4" style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 18 }}>
            {rateCard ? 'Edit Rate Card' : 'Enter Rates'}
          </h3>

          {/* Provider & Base Fees */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <div>
              <label className="text-[10px] uppercase tracking-[0.1em] block mb-1" style={{ color: FR.stone }}>3PL Provider</label>
              <input value={draft.provider} onChange={e => setDraft({ ...draft, provider: e.target.value })} placeholder="e.g., ShipBob, Deliverr" style={inputStyle} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.1em] block mb-1" style={{ color: FR.stone }}>Pick & Pack (per order)</label>
              <input type="number" step="0.01" value={draft.pickPack} onChange={e => setDraft({ ...draft, pickPack: parseFloat(e.target.value) || 0 })} style={inputStyle} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.1em] block mb-1" style={{ color: FR.stone }}>Base Label Cost</label>
              <input type="number" step="0.01" value={draft.labelBase} onChange={e => setDraft({ ...draft, labelBase: parseFloat(e.target.value) || 0 })} style={inputStyle} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.1em] block mb-1" style={{ color: FR.stone }}>Storage (per pallet/mo)</label>
              <input type="number" step="0.01" value={draft.storagePerPallet} onChange={e => setDraft({ ...draft, storagePerPallet: parseFloat(e.target.value) || 0 })} style={inputStyle} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.1em] block mb-1" style={{ color: FR.stone }}>Returns (flat fee)</label>
              <input type="number" step="0.01" value={draft.returnsFlat} onChange={e => setDraft({ ...draft, returnsFlat: parseFloat(e.target.value) || 0 })} style={inputStyle} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.1em] block mb-1" style={{ color: FR.stone }}>Packaging Materials</label>
              <input type="number" step="0.01" value={draft.packagingMaterials} onChange={e => setDraft({ ...draft, packagingMaterials: parseFloat(e.target.value) || 0 })} style={inputStyle} />
            </div>
          </div>

          {/* Weight Tiers */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] uppercase tracking-[0.1em]" style={{ color: FR.stone }}>Shipping Rate by Weight</label>
              <button onClick={addWeightTier} className="text-[10px] flex items-center gap-1" style={{ color: FR.soil }}>
                <Plus size={12} /> Add Tier
              </button>
            </div>
            <div className="space-y-1.5">
              {draft.weightTiers?.map((tier, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-2 items-center">
                  <input value={tier.label} onChange={e => { const t = [...draft.weightTiers]; t[idx] = { ...t[idx], label: e.target.value }; setDraft({ ...draft, weightTiers: t }); }}
                    className="text-xs px-2 py-1.5 rounded" style={{ background: FR.salt, border: `1px solid ${FR.sand}`, color: FR.slate }} />
                  <input type="number" step="0.01" value={tier.minLbs} onChange={e => updateWeightTier(idx, 'minLbs', e.target.value)} placeholder="Min lbs"
                    className="text-xs px-2 py-1.5 rounded" style={{ background: FR.salt, border: `1px solid ${FR.sand}`, color: FR.slate }} />
                  <input type="number" step="0.01" value={tier.rate} onChange={e => updateWeightTier(idx, 'rate', e.target.value)} placeholder="Rate $"
                    className="text-xs px-2 py-1.5 rounded" style={{ background: FR.salt, border: `1px solid ${FR.sand}`, color: FR.slate }} />
                  <button onClick={() => removeWeightTier(idx)} className="p-1 justify-self-center" style={{ color: FR.stone }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Surcharges */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] uppercase tracking-[0.1em]" style={{ color: FR.stone }}>Surcharges & Add-ons</label>
              <button onClick={() => setShowAddSurcharge(true)} className="text-[10px] flex items-center gap-1" style={{ color: FR.soil }}>
                <Plus size={12} /> Add
              </button>
            </div>
            {showAddSurcharge && (
              <div className="flex gap-2 mb-2 items-end">
                <input value={newSurcharge.name} onChange={e => setNewSurcharge({ ...newSurcharge, name: e.target.value })} placeholder="Fee name"
                  className="text-xs px-2 py-1.5 rounded flex-1" style={{ background: FR.salt, border: `1px solid ${FR.sand}`, color: FR.slate }} />
                <input type="number" step="0.01" value={newSurcharge.amount} onChange={e => setNewSurcharge({ ...newSurcharge, amount: parseFloat(e.target.value) || 0 })} placeholder="$"
                  className="text-xs px-2 py-1.5 rounded w-20" style={{ background: FR.salt, border: `1px solid ${FR.sand}`, color: FR.slate }} />
                <select value={newSurcharge.per} onChange={e => setNewSurcharge({ ...newSurcharge, per: e.target.value })}
                  className="text-xs px-2 py-1.5 rounded" style={{ background: FR.salt, border: `1px solid ${FR.sand}`, color: FR.slate }}>
                  <option value="order">per order</option>
                  <option value="unit">per unit</option>
                  <option value="month">per month</option>
                </select>
                <button onClick={addSurcharge} className="px-2 py-1.5 rounded text-xs" style={{ background: FR.slate, color: FR.salt }}>Add</button>
              </div>
            )}
            {draft.surcharges?.map((s, idx) => (
              <div key={idx} className="flex items-center justify-between py-1.5 px-2 rounded text-xs" style={{ background: FR.salt }}>
                <span style={{ color: FR.slate }}>{s.name}</span>
                <div className="flex items-center gap-2">
                  <span style={{ color: FR.soil }}>{formatCurrency(s.amount)} / {s.per}</span>
                  <button onClick={() => removeSurcharge(idx)} style={{ color: FR.stone }}><Trash2 size={11} /></button>
                </div>
              </div>
            ))}
            {(!draft.surcharges || draft.surcharges.length === 0) && !showAddSurcharge && (
              <p className="text-xs py-2" style={{ color: FR.stone }}>No surcharges added</p>
            )}
          </div>

          <button onClick={saveRateCard} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm" style={{ background: FR.slate, color: FR.salt }}>
            <Check size={14} /> Save Rate Card
          </button>
        </div>
      )}

      {/* Saved Rate Card Summary */}
      {rateCard && !editMode && (
        <div className="rounded-xl p-5 border" style={{ background: 'white', borderColor: FR.sand }}>
          <div className="flex items-center gap-2 mb-4">
            <FileText size={16} style={{ color: FR.soil }} />
            <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 18 }}>
              {rateCard.provider || '3PL'} Rate Card
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#ECFDF5', color: '#065F46' }}>Active</span>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
            {[
              { label: 'Pick & Pack', value: rateCard.pickPack },
              { label: 'Label Base', value: rateCard.labelBase },
              { label: 'Storage/Pallet', value: rateCard.storagePerPallet },
              { label: 'Returns', value: rateCard.returnsFlat },
              { label: 'Packaging', value: rateCard.packagingMaterials },
              { label: 'Tiers', value: rateCard.weightTiers?.length, isCurrency: false },
            ].map((item, i) => (
              <div key={i} className="p-2 rounded-lg" style={{ background: FR.salt }}>
                <div className="text-[9px] uppercase tracking-[0.1em]" style={{ color: FR.stone }}>{item.label}</div>
                <div className="text-sm font-medium" style={{ color: FR.slate }}>
                  {item.isCurrency === false ? item.value : formatCurrency(item.value)}
                </div>
              </div>
            ))}
          </div>

          {/* Weight tier table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: `1px solid ${FR.sand}` }}>
                  <th className="text-left py-2 px-2" style={{ color: FR.stone }}>Weight Tier</th>
                  <th className="text-right py-2 px-2" style={{ color: FR.stone }}>Rate</th>
                </tr>
              </thead>
              <tbody>
                {rateCard.weightTiers?.map((t, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${FR.sand}` }}>
                    <td className="py-1.5 px-2" style={{ color: FR.slate }}>{t.label}</td>
                    <td className="py-1.5 px-2 text-right font-mono" style={{ color: FR.soil }}>{formatCurrency(t.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Product Cost Preview */}
      {(rateCard || draft.pickPack > 0) && (
        <div className="rounded-xl p-5 border" style={{ background: 'white', borderColor: FR.sand }}>
          <h3 className="mb-3" style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 18 }}>
            Estimated Fulfillment Cost by Product
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: `2px solid ${FR.sand}` }}>
                  <th className="text-left py-2 px-2" style={{ color: FR.stone }}>Product</th>
                  <th className="text-right py-2 px-2" style={{ color: FR.stone }}>Weight</th>
                  <th className="text-right py-2 px-2" style={{ color: FR.stone }}>Pick & Pack</th>
                  <th className="text-right py-2 px-2" style={{ color: FR.stone }}>Shipping</th>
                  <th className="text-right py-2 px-2" style={{ color: FR.stone }}>Packaging</th>
                  <th className="text-right py-2 px-2 font-medium" style={{ color: FR.slate }}>Total/Unit</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(state.products).flatMap(col =>
                  col.products.map(p => {
                    const est = getEstimatedCost(p);
                    if (!est) return null;
                    return (
                      <tr key={p.id} style={{ borderBottom: `1px solid ${FR.sand}` }}>
                        <td className="py-1.5 px-2" style={{ color: FR.slate }}>{p.name}</td>
                        <td className="py-1.5 px-2 text-right font-mono" style={{ color: FR.stone }}>{p.weight}kg</td>
                        <td className="py-1.5 px-2 text-right font-mono" style={{ color: FR.stone }}>{formatCurrency(est.pickPack)}</td>
                        <td className="py-1.5 px-2 text-right font-mono" style={{ color: FR.stone }}>{formatCurrency(est.shipping)}</td>
                        <td className="py-1.5 px-2 text-right font-mono" style={{ color: FR.stone }}>{formatCurrency(est.packaging)}</td>
                        <td className="py-1.5 px-2 text-right font-mono font-medium" style={{ color: FR.soil }}>{formatCurrency(est.total)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
