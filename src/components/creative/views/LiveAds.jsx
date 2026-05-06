import { useEffect, useState } from 'react';
import { listAds, saveAd } from '../../../utils/adStore';
import { checkBudgetGuardrail } from '../../../utils/budgetConfigStore';
import { callMetaProxy } from '../../../utils/liveDataSync';
import { AD_STATUSES } from '../../../types/creative';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };
const NAVY = '#1B2741';

export default function LiveAds() {
  const [ads, setAds] = useState(null);
  const [guardrail, setGuardrail] = useState(null);
  const [pending, setPending] = useState({}); // ad_id -> 'killing' | 'scaling' | 'resuming'
  const [errs, setErrs] = useState({});

  const refresh = () => Promise.all([
    listAds(),
    checkBudgetGuardrail(),
  ]).then(([a, g]) => {
    setAds(a);
    setGuardrail(g);
  });

  useEffect(() => { refresh(); }, []);

  const weeklyPct = guardrail ? Math.min(1, guardrail.weeklySpend / (guardrail.config?.weekly_cap || 2000)) : 0;
  const barColor = weeklyPct >= 0.9 ? '#A32D2D' : weeklyPct >= 0.7 ? '#854F0B' : NAVY;

  const handleKill = async (ad) => {
    if (!ad.meta_ad_id) return;
    setPending(p => ({ ...p, [ad.id]: 'killing' }));
    setErrs(e => ({ ...e, [ad.id]: null }));
    try {
      await callMetaProxy({ method: 'POST', path: ad.meta_ad_id, body: { status: 'PAUSED' } });
      await saveAd(ad.id, { status: AD_STATUSES.KILLED });
      refresh();
    } catch (err) {
      setErrs(e => ({ ...e, [ad.id]: err.message }));
    } finally {
      setPending(p => { const next = { ...p }; delete next[ad.id]; return next; });
    }
  };

  const handleScale = async (ad) => {
    if (!ad.meta_adset_id) return;
    // Bump daily budget by 30% of current spend (or 30% of $25 if we
    // don't have spend data yet).
    const baseDailyUsd = (ad.spend_to_date && ad.spend_to_date > 0) ? ad.spend_to_date : 25;
    const newDailyBudgetCents = Math.max(100, Math.round(baseDailyUsd * 100 * 1.3));
    setPending(p => ({ ...p, [ad.id]: 'scaling' }));
    setErrs(e => ({ ...e, [ad.id]: null }));
    try {
      await callMetaProxy({ method: 'POST', path: ad.meta_adset_id, body: { daily_budget: newDailyBudgetCents } });
      await saveAd(ad.id, { status: AD_STATUSES.SCALED });
      refresh();
    } catch (err) {
      setErrs(e => ({ ...e, [ad.id]: err.message }));
    } finally {
      setPending(p => { const next = { ...p }; delete next[ad.id]; return next; });
    }
  };

  const handleResume = async (ad) => {
    if (!ad.meta_ad_id) return;
    setPending(p => ({ ...p, [ad.id]: 'resuming' }));
    setErrs(e => ({ ...e, [ad.id]: null }));
    try {
      await callMetaProxy({ method: 'POST', path: ad.meta_ad_id, body: { status: 'ACTIVE' } });
      await saveAd(ad.id, { status: AD_STATUSES.ACTIVE });
      refresh();
    } catch (err) {
      setErrs(e => ({ ...e, [ad.id]: err.message }));
    } finally {
      setPending(p => { const next = { ...p }; delete next[ad.id]; return next; });
    }
  };

  return (
    <div>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.slate, marginBottom: 16 }}>
        Live Ads
      </h2>

      <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: FR.slate }}>
          <span>Weekly Spend</span>
          <span>${guardrail ? guardrail.weeklySpend.toFixed(2) : '—'} / ${guardrail?.config?.weekly_cap ?? '2,000.00'}</span>
        </div>
        <div style={{ height: 6, background: FR.sand, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${weeklyPct * 100}%`, background: barColor, borderRadius: 3, transition: 'width 400ms ease' }} />
        </div>
        {guardrail && !guardrail.config?.writes_enabled && (
          <p style={{ marginTop: 6, fontSize: 11, color: '#A32D2D' }}>Meta writes are disabled.</p>
        )}
      </div>

      {ads === null
        ? <p style={{ fontSize: 13, color: FR.stone }}>Loading…</p>
        : ads.length === 0
        ? <p style={{ fontSize: 13, color: FR.stone }}>No ads published yet.</p>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: NAVY }}>
                  {['Ad Name', 'Status', 'Spend', 'Impr.', 'Clicks', 'CPA', 'Rec.', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#fff', fontWeight: 400, fontSize: 11, letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ads.map((ad, i) => {
                  const cpaTarget = guardrail?.config?.cpa_target;
                  const isKillCandidate = ad.cpa && cpaTarget && ad.cpa > cpaTarget * 1.5;
                  const isScaleCandidate = ad.cpa && cpaTarget && ad.cpa < cpaTarget * 0.7;
                  const rowBg = isKillCandidate ? '#FDECEA' : i % 2 === 0 ? '#fff' : '#fafaf8';
                  const isPending = !!pending[ad.id];
                  return (
                    <tr key={ad.id} style={{ background: rowBg, borderBottom: '0.5px solid rgba(58,58,58,0.06)' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', color: FR.slate }}>{ad.ad_name}</td>
                      <td style={{ padding: '8px 12px', color: FR.stone, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em' }}>{ad.status}</td>
                      <td style={{ padding: '8px 12px', color: FR.slate }}>${(ad.spend_to_date || 0).toFixed(2)}</td>
                      <td style={{ padding: '8px 12px', color: FR.slate }}>{(ad.impressions || 0).toLocaleString()}</td>
                      <td style={{ padding: '8px 12px', color: FR.slate }}>{(ad.clicks || 0).toLocaleString()}</td>
                      <td style={{ padding: '8px 12px', color: isKillCandidate ? '#A32D2D' : isScaleCandidate ? '#3B6D11' : FR.slate }}>
                        {ad.cpa ? `$${ad.cpa.toFixed(2)}` : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', color: FR.stone }}>{ad.recommendation || '—'}</td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        {ad.status === 'paused' && (
                          <button onClick={() => handleResume(ad)} disabled={isPending} style={btn('#3B6D11')}>Resume</button>
                        )}
                        {(ad.status === 'active' || ad.status === 'scaled') && (
                          <>
                            <button onClick={() => handleKill(ad)} disabled={isPending} style={btn('#A32D2D')}>Kill</button>
                            <button onClick={() => handleScale(ad)} disabled={isPending} style={{ ...btn('#854F0B'), marginLeft: 4 }}>Scale +30%</button>
                          </>
                        )}
                        {errs[ad.id] && (
                          <p style={{ fontSize: 10, color: '#A32D2D', margin: '4px 0 0', maxWidth: 200, wordBreak: 'break-word' }}>{errs[ad.id]}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

function btn(color) {
  return {
    fontSize: 11, padding: '4px 10px', borderRadius: 5,
    border: `0.5px solid ${color}`, color, background: 'transparent',
    cursor: 'pointer',
  };
}
