import React, { useState } from 'react';

export default function PurchaseOrderPage() {
  const [sizes, setSizes] = useState({ W30: 11, W32: 33, W34: 11 });
  const [activeCurve, setActiveCurve] = useState('denim_pants');
  const [curveDropdownOpen, setCurveDropdownOpen] = useState(false);
  
  // Saved size curves — FR's historical size distributions by category
  const sizeCurves = {
    denim_pants: {
      label: 'Denim Pants',
      sublabel: 'Waist sizes · based on 12mo rolling data',
      sizes: ['W26', 'W28', 'W30', 'W32', 'W34', 'W36', 'W38', 'W40'],
      distribution: { W26: 2, W28: 5, W30: 15, W32: 28, W34: 25, W36: 15, W38: 7, W40: 3 }
    },
    loungewear_tops: {
      label: 'Loungewear Tops',
      sublabel: 'XS–XXL · based on hoodie + crewneck data',
      sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
      distribution: { XS: 4, S: 15, M: 28, L: 30, XL: 18, XXL: 5 }
    },
    loungewear_bottoms: {
      label: 'Loungewear Bottoms',
      sublabel: 'XS–XXL · based on sweatpants data',
      sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
      distribution: { XS: 3, S: 14, M: 30, L: 28, XL: 20, XXL: 5 }
    }
  };
  
  const currentCurve = sizeCurves[activeCurve];
  
  const totalUnits = sizes.W30 + sizes.W32 + sizes.W34;
  const unitCost = 35;
  const totalCOGS = totalUnits * unitCost;
  
  // Current W32 Stone on-hand (primary SKU)
  const onHand = 27;
  
  // Moving averages — units per day across each window
  const movingAverages = [
    { window: '7-day MA', rate: 1.14, units_sold: 8 },
    { window: '14-day MA', rate: 1.00, units_sold: 14 },
    { window: '30-day MA', rate: 0.73, units_sold: 22 },
    { window: '60-day MA', rate: 0.80, units_sold: 48 },
    { window: '90-day MA', rate: 0.90, units_sold: 81 },
  ];
  
  // Calculate OOS date for each window
  const today = new Date('2026-04-21');
  const calcOOSDate = (rate) => {
    if (rate === 0) return null;
    const daysLeft = Math.floor(onHand / rate);
    const oosDate = new Date(today);
    oosDate.setDate(today.getDate() + daysLeft);
    return { date: oosDate, daysLeft };
  };
  
  // Find consensus — which windows agree within 20% of median rate
  const rates = movingAverages.map(m => m.rate);
  const median = [...rates].sort((a,b) => a-b)[Math.floor(rates.length/2)];
  const consensusWindows = movingAverages.filter(m => 
    Math.abs(m.rate - median) / median < 0.25
  );
  const consensusCount = consensusWindows.length;
  const canAutoApprove = consensusCount >= 3;
  
  const monthRemaining = 6800;
  const pctOfBudget = Math.round((totalCOGS / monthRemaining) * 100);
  const leftAfter = monthRemaining - totalCOGS;
  
  const update = (size, delta) => {
    setSizes(prev => ({ ...prev, [size]: Math.max(0, prev[size] + delta) }));
  };
  
  const formatDate = (d) => {
    if (!d) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div style={{
      background: '#F5F0E8',
      minHeight: '100vh',
      color: '#3A3A3A',
      fontFamily: '"General Sans", "Helvetica Neue", sans-serif',
      paddingBottom: '120px'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&display=swap');
        @import url('https://api.fontshare.com/v2/css?f[]=general-sans@300,400,500,600&display=swap');
        * { box-sizing: border-box; }
        .serif { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 400; letter-spacing: -0.02em; }
        .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.18em; color: #716F70; font-weight: 500; }
        .nav-item { 
          font-size: 12px; 
          color: #716F70; 
          padding: 6px 10px; 
          cursor: pointer; 
          display: flex;
          align-items: center;
          gap: 6px;
          border-radius: 4px;
          transition: all 0.15s;
        }
        .nav-item:hover { background: #EBE5D5; color: #3A3A3A; }
        .nav-item.active { background: #3A3A3A; color: #F5F0E8; }
        .nav-item.highlighted { background: #EBE5D5; color: #3A3A3A; font-weight: 500; }
        button {
          background: transparent;
          border: 1px solid #3A3A3A;
          color: #3A3A3A;
          padding: 14px 32px;
          font-family: 'General Sans', sans-serif;
          font-size: 10px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        button:hover { background: #3A3A3A; color: #F5F0E8; }
        button.primary { background: #3A3A3A; color: #F5F0E8; }
        button.primary:hover { background: #000; }
        button.caution { background: #9A816B; border-color: #9A816B; color: #F5F0E8; }
        button.caution:hover { background: #7A6554; border-color: #7A6554; }
        button.tiny {
          padding: 6px 14px;
          font-size: 16px;
          letter-spacing: 0;
          border-color: #D5D0C4;
          color: #716F70;
          font-weight: 300;
          min-width: 36px;
        }
        button.tiny:hover { border-color: #3A3A3A; background: #EBE5D5; color: #3A3A3A; }
        table { width: 100%; border-collapse: collapse; }
        thead th {
          font-family: 'General Sans', sans-serif;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          color: #716F70;
          font-weight: 500;
          padding: 18px 24px;
          text-align: left;
          border-bottom: 1px solid #D5D0C4;
          background: #EBE5D5;
        }
        thead th.num { text-align: right; }
        tbody td { padding: 24px; border-bottom: 1px solid #D5D0C4; }
        tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
        tbody tr:last-child td { border-bottom: 0; }
        tbody tr:hover { background: #EBE5D5; }
      `}</style>

      {/* ====== ERP TOP BAR (matches existing ERP layout) ====== */}
      <div style={{
        padding: '20px 40px',
        borderBottom: '1px solid #D5D0C4',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '24px'
      }}>
        {/* Left: brand block + sync status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div>
            <div style={{ 
              fontSize: '13px', 
              fontWeight: 600, 
              letterSpacing: '0.15em',
              lineHeight: '1'
            }}>
              FOREIGN RESOURCE
            </div>
            <div style={{ 
              fontSize: '8.5px', 
              color: '#716F70', 
              letterSpacing: '0.18em',
              marginTop: '4px'
            }}>
              GROWTH MODEL & OPERATING DASHBOARD
            </div>
          </div>
          <div style={{ 
            background: '#F5EDD8',
            border: '1px solid #EBD8A8',
            color: '#8B7340',
            fontSize: '11px',
            padding: '5px 12px',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span style={{ fontSize: '10px' }}>⚠</span>
            Partial sync just now
          </div>
          <div style={{ color: '#716F70', fontSize: '14px', cursor: 'pointer' }}>↗</div>
        </div>
        
        {/* Right: nav items */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {[
            { label: 'Dashboard', icon: '▦' },
            { label: 'Revenue', icon: '↗' },
            { label: 'P&L + Cash', icon: '▤' },
            { label: 'Creative', icon: '▣' },
            { label: 'Unit Econ', icon: '▤' },
            { label: 'PLM', icon: '◇', highlighted: true },
            { label: 'Fulfillment', icon: '⊡', highlighted: true },
            { label: 'PO Schedule', icon: '▦', active: true },
            { label: 'New PO', icon: '⊕' },
            { label: 'OPEX', icon: '▤' },
            { label: 'Scenarios', icon: '⊞' },
            { label: 'Integrations', icon: '⊕' },
          ].map(item => (
            <div 
              key={item.label} 
              className={`nav-item ${item.active ? 'active' : ''} ${item.highlighted ? 'highlighted' : ''}`}
            >
              <span style={{ fontSize: '10px', opacity: 0.7 }}>{item.icon}</span>
              {item.label}
            </div>
          ))}
        </div>
      </div>

      {/* ====== HERO SECTION ====== */}
      <div style={{
        padding: '140px 48px 80px',
        textAlign: 'center',
        maxWidth: '960px',
        margin: '0 auto'
      }}>
        <div className="label" style={{ marginBottom: '28px' }}>
          New PO · April 21, 2026
        </div>
        <h1 className="serif" style={{
          fontSize: 'clamp(48px, 9vw, 88px)',
          lineHeight: '1',
          margin: '0 0 28px',
          letterSpacing: '-0.03em'
        }}>
          Eroded Edges Cargos
        </h1>
        <div style={{ fontSize: '13px', color: '#716F70', marginBottom: '56px', letterSpacing: '0.02em' }}>
          {totalUnits} units &nbsp;·&nbsp; ${totalCOGS.toLocaleString()} &nbsp;·&nbsp; Arrives June 16 &nbsp;·&nbsp; Dongguan Shengde
        </div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button className={canAutoApprove ? 'primary' : 'caution'}>
            {canAutoApprove ? 'Approve' : 'Review & approve'}
          </button>
          <button>Edit details</button>
        </div>
      </div>

      {/* ====== MOVING AVERAGE TABLE ====== */}
      <div style={{ 
        maxWidth: '900px', 
        margin: '0 auto', 
        padding: '0 48px' 
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div className="label" style={{ marginBottom: '16px' }}>
            Stock projection
          </div>
          <div className="serif" style={{ 
            fontSize: '28px',
            lineHeight: '1.3',
            maxWidth: '640px',
            margin: '0 auto',
            color: '#3A3A3A',
            letterSpacing: '-0.01em'
          }}>
            Current W32 Stone on hand: <span style={{ fontWeight: 500 }}>{onHand} units</span>
          </div>
          <div style={{ fontSize: '12px', color: '#716F70', marginTop: '8px' }}>
            Here's when we run out based on each moving average.
          </div>
        </div>

        <div style={{
          background: '#F5F0E8',
          border: '1px solid #D5D0C4'
        }}>
          <table>
            <thead>
              <tr>
                <th style={{ background: '#EBE5D5' }}>Window</th>
                <th className="num" style={{ background: '#EBE5D5' }}>Units sold</th>
                <th className="num" style={{ background: '#EBE5D5' }}>Daily rate</th>
                <th className="num" style={{ background: '#EBE5D5' }}>Days until OOS</th>
                <th className="num" style={{ background: '#EBE5D5' }}>Out of stock on</th>
                <th style={{ background: '#EBE5D5' }}></th>
              </tr>
            </thead>
            <tbody>
              {movingAverages.map((m) => {
                const oos = calcOOSDate(m.rate);
                const agrees = Math.abs(m.rate - median) / median < 0.25;
                return (
                  <tr key={m.window}>
                    <td style={{ fontWeight: 500, fontSize: '13px' }}>{m.window}</td>
                    <td className="num" style={{ fontSize: '13px', color: '#716F70' }}>
                      {m.units_sold}
                    </td>
                    <td className="num" style={{ fontSize: '13px', color: '#716F70' }}>
                      {m.rate.toFixed(2)}/day
                    </td>
                    <td className="num serif" style={{ fontSize: '24px', lineHeight: '1' }}>
                      {oos?.daysLeft}
                    </td>
                    <td className="num" style={{ fontSize: '13px' }}>
                      {formatDate(oos?.date)}
                    </td>
                    <td style={{ width: '12px', padding: '0 16px' }}>
                      <span style={{
                        display: 'inline-block',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: agrees ? '#3A3A3A' : 'transparent',
                        border: agrees ? 'none' : '1px solid #D5D0C4'
                      }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* Consensus indicator */}
        <div style={{
          marginTop: '20px',
          padding: '14px 20px',
          fontSize: '11px',
          color: '#716F70',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#3A3A3A'
            }} />
            <span>Agrees with consensus (±25% of median)</span>
          </div>
          <div style={{ fontWeight: 500, color: '#3A3A3A' }}>
            {consensusCount} of {movingAverages.length} windows agree &nbsp;·&nbsp; {canAutoApprove ? 'auto-approve OK' : 'manual review'}
          </div>
        </div>
      </div>

      {/* ====== SIZE CURVE ====== */}
      <div style={{ 
        maxWidth: '900px', 
        margin: '100px auto 0', 
        padding: '0 48px'
      }}>
        {/* Header with dropdown */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '48px',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div>
            <div className="label" style={{ marginBottom: '6px' }}>
              Size Curve
            </div>
            <div style={{ fontSize: '11px', color: '#716F70' }}>
              {currentCurve.sublabel}
            </div>
          </div>
          
          {/* Dropdown */}
          <div style={{ position: 'relative' }}>
            <button 
              onClick={() => setCurveDropdownOpen(!curveDropdownOpen)}
              style={{
                background: '#F5F0E8',
                border: '1px solid #D5D0C4',
                color: '#3A3A3A',
                padding: '10px 18px',
                fontFamily: "'General Sans', sans-serif",
                fontSize: '11px',
                letterSpacing: '0.08em',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                textTransform: 'none',
                fontWeight: 400
              }}
            >
              <span>{currentCurve.label}</span>
              <span style={{ fontSize: '9px', color: '#716F70' }}>▼</span>
            </button>
            
            {curveDropdownOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                background: '#F5F0E8',
                border: '1px solid #D5D0C4',
                minWidth: '240px',
                zIndex: 10,
                boxShadow: '0 2px 12px rgba(58, 58, 58, 0.06)'
              }}>
                {Object.entries(sizeCurves).map(([key, curve]) => (
                  <div
                    key={key}
                    onClick={() => {
                      setActiveCurve(key);
                      setCurveDropdownOpen(false);
                      // Reset sizes to match new curve when switching
                      const newSizes = {};
                      curve.sizes.forEach(s => newSizes[s] = 0);
                      if (key === 'denim_pants') {
                        setSizes({ W30: 11, W32: 33, W34: 11 });
                      } else {
                        setSizes(newSizes);
                      }
                    }}
                    style={{
                      padding: '14px 18px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #D5D0C4',
                      background: activeCurve === key ? '#EBE5D5' : 'transparent',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => { if (activeCurve !== key) e.currentTarget.style.background = '#EBE5D5'; }}
                    onMouseLeave={(e) => { if (activeCurve !== key) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 500, color: '#3A3A3A' }}>
                      {curve.label}
                    </div>
                    <div style={{ fontSize: '10px', color: '#716F70', marginTop: '2px' }}>
                      {curve.sublabel}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Size distribution grid — shows ALL sizes in the active curve */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${currentCurve.sizes.length}, 1fr)`,
          borderTop: '1px solid #D5D0C4',
          borderBottom: '1px solid #D5D0C4'
        }}>
          {currentCurve.sizes.map((size, i) => {
            const target = currentCurve.distribution[size];
            const allocated = sizes[size] || 0;
            const actualPct = totalUnits > 0 ? (allocated / totalUnits) * 100 : 0;
            const variance = actualPct - target;
            const varColor = Math.abs(variance) < 3 ? '#3A3A3A' : Math.abs(variance) < 8 ? '#9A816B' : '#A67366';
            const isActive = allocated > 0;
            
            return (
              <div key={size} style={{
                padding: '40px 12px 32px',
                textAlign: 'center',
                borderRight: i < currentCurve.sizes.length - 1 ? '1px solid #D5D0C4' : 'none',
                opacity: isActive ? 1 : 0.45
              }}>
                <div className="label" style={{ marginBottom: '18px' }}>{size}</div>
                
                <div className="serif" style={{ 
                  fontSize: '56px', 
                  lineHeight: '1', 
                  marginBottom: '12px',
                  color: '#3A3A3A'
                }}>
                  {allocated}
                </div>
                
                <div style={{ fontSize: '10px', color: '#716F70', marginBottom: '4px' }}>
                  {actualPct.toFixed(0)}% / tgt {target}%
                </div>
                
                <div style={{ fontSize: '10px', color: varColor, fontWeight: 500, marginBottom: '16px' }}>
                  {variance > 0 ? '+' : ''}{variance.toFixed(1)}%
                </div>
                
                <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                  <button className="tiny" onClick={() => update(size, -1)}>−</button>
                  <button className="tiny" onClick={() => update(size, 1)}>+</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Curve overlay visualization */}
        <div style={{ marginTop: '32px', padding: '0 4px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            marginBottom: '10px',
            fontSize: '10px',
            color: '#716F70'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '10px', height: '10px', background: '#EBE5D5', border: '1px solid #D5D0C4', display: 'inline-block' }}></span>
              Category curve (target)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '10px', height: '10px', background: '#3A3A3A', display: 'inline-block' }}></span>
              This PO
            </div>
          </div>
          <div style={{ position: 'relative', height: '80px', display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
            {currentCurve.sizes.map(size => {
              const target = currentCurve.distribution[size];
              const actual = totalUnits > 0 ? (sizes[size] / totalUnits) * 100 : 0;
              const maxVal = 35;
              return (
                <div key={size} style={{ flex: 1, position: 'relative', height: '100%' }}>
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    height: `${(target / maxVal) * 100}%`,
                    background: '#EBE5D5',
                    borderTop: '1px solid #D5D0C4'
                  }} />
                  <div style={{
                    position: 'absolute', bottom: 0, left: '28%', right: '28%',
                    height: `${(actual / maxVal) * 100}%`,
                    background: '#3A3A3A'
                  }} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ====== BUDGET CHECK ====== */}
      <div style={{
        maxWidth: '640px',
        margin: '100px auto 0',
        padding: '0 48px'
      }}>
        <div style={{
          background: '#EBE5D5',
          padding: '48px 48px',
          textAlign: 'center',
          border: '1px solid #D5D0C4'
        }}>
          <div className="label" style={{ marginBottom: '20px' }}>OTB check</div>
          <div className="serif" style={{
            fontSize: '26px',
            lineHeight: '1.4',
            letterSpacing: '-0.01em'
          }}>
            This uses <span style={{ fontWeight: 500 }}>{pctOfBudget}%</span> of May's open-to-buy.
            <br/>
            You'll have <span style={{ fontWeight: 500 }}>${leftAfter.toLocaleString()}</span> left for surprises.
          </div>
        </div>
      </div>

      {/* ====== FOOTER ====== */}
      <div style={{
        maxWidth: '960px',
        margin: '140px auto 0',
        padding: '32px 48px 0',
        borderTop: '1px solid #D5D0C4',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '10px',
        color: '#716F70'
      }}>
        <div>Data: Shopify Admin API &nbsp;·&nbsp; Updated 9:41am EST</div>
        <div>© 2026 Foreign Resource Co.</div>
      </div>
    </div>
  );
}
