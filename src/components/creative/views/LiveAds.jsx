import { useEffect, useState } from 'react';
import { listAds, saveAd } from '../../../utils/adStore';
import { checkBudgetGuardrail } from '../../../utils/budgetConfigStore';
import { callMetaProxy } from '../../../utils/liveDataSync';
import { AD_STATUSES } from '../../../types/creative';
import { FR, AD_STATUS_TOKEN, pillStyle } from '../palette';

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
  const barColor = weeklyPct >= 0.9 ? FR.red : weeklyPct >= 0.7 ? FR.amber : FR.navy;

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
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.ink, marginBottom: 16 }}>
        Live Ads
      </h2>

      <div style={{
        background: FR.navy, color: '#fff',
        borderRadius: 12, padding: '14px 18px', marginBottom: 20,
        boxShadow: '0 1px 0 rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12, opacity: 0.92 }}>
          <span style={{ letterSpacing: '0.04em' }}>WEEKLY SPEND · BUDGET GUARDRAIL</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            ${guardrail ? guardrail.weeklySpend.toFixed(2) : '—'} / ${guardrail?.config?.weekly_cap?.toFixed?.(2) ?? '2,000.00'}
          </span>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.14)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${weeklyPct * 100}%`, background: barColor, borderRadius: 3, transition: 'width 400ms ease' }} />
        </div>
        {guardrail && !guardrail.config?.writes_enabled && (
          <p style={{ marginTop: 8, fontSize: 11, color: FR.redLight, margin: '8px 0 0' }}>
            ⚠ Meta writes are disabled. Set <code>budget_config.writes_enabled = true</code> to re-enable.
          </p>
        )}
      </div>

      {ads === null
        ? <p style={{ fontSize: 13, color: FR.stone }}>Loading…</p>
        : ads.length === 0
        ? <p style={{ fontSize: 13, color: FR.stone }}>No ads published yet.</p>
        : (
          <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: FR.navy }}>
                  {['Ad Name', 'Status', 'Spend', 'Impr.', 'CTR', 'CPA', 'ROAS', 'Freq.', 'Rec.', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#fff', fontWeight: 500, fontSize: 11, letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ads.map((ad, i) => {
                  const cpaTarget = guardrail?.config?.cpa_target;
                  const isKillCandidate = ad.cpa && cpaTarget && ad.cpa > cpaTarget * 1.5;
                  const isScaleCandidate = ad.cpa && cpaTarget && ad.cpa < cpaTarget * 0.7;
                  const rowBg = isKillCandidate ? FR.redLight : isScaleCandidate ? FR.greenLight : (i % 2 === 0 ? '#fff' : FR.saltLight);
                  const isPending = !!pending[ad.id];
                  const ctr = ad.impressions ? ((ad.clicks || 0) / ad.impressions) * 100 : null;
                  const statusToken = AD_STATUS_TOKEN[ad.status] || AD_STATUS_TOKEN.paused;
                  return (
                    <tr key={ad.id} style={{ background: rowBg, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                      <td style={{ padding: '10px 14px', fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', color: FR.ink, fontSize: 11.5 }}>
                        {ad.ad_name}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={pillStyle(statusToken)}>{statusToken.label}</span>
                      </td>
                      <td style={{ padding: '10px 14px', color: FR.ink, fontVariantNumeric: 'tabular-nums' }}>${(ad.spend_to_date || 0).toFixed(2)}</td>
                      <td style={{ padding: '10px 14px', color: FR.ink, fontVariantNumeric: 'tabular-nums' }}>
                        {(ad.impressions || 0).toLocaleString()}
                        {ad.impressions != null && ad.impressions < 3000 && (
                          <span title="Below statistical floor — recommendations are noise" style={{ fontSize: 10, color: FR.amber, marginLeft: 4 }}>·</span>
                        )}
                      </td>
                      <td style={{
                        padding: '10px 14px',
                        color: ctr != null && ctr < 0.5 ? FR.red : FR.stone,
                        fontWeight: ctr != null && ctr < 0.5 ? 600 : 400,
                        fontVariantNumeric: 'tabular-nums',
                      }}>{ctr != null ? `${ctr.toFixed(2)}%` : '—'}</td>
                      <td style={{
                        padding: '10px 14px',
                        color: isKillCandidate ? FR.red : isScaleCandidate ? FR.green : FR.ink,
                        fontWeight: (isKillCandidate || isScaleCandidate) ? 600 : 400,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {ad.cpa ? `$${ad.cpa.toFixed(2)}` : '—'}
                        {cpaTarget && ad.cpa ? <span style={{ fontSize: 10, color: FR.stone, marginLeft: 4 }}>/ ${cpaTarget}</span> : null}
                      </td>
                      <td style={{
                        padding: '10px 14px',
                        color: ad.roas != null && ad.roas >= 2 ? FR.green : ad.roas != null && ad.roas < 1 ? FR.red : FR.ink,
                        fontWeight: ad.roas != null && (ad.roas >= 2 || ad.roas < 1) ? 600 : 400,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {ad.roas != null ? `${ad.roas.toFixed(2)}x` : '—'}
                      </td>
                      <td style={{
                        padding: '10px 14px',
                        color: ad.frequency != null && ad.frequency > 2.5 ? FR.amber : FR.stone,
                        fontWeight: ad.frequency != null && ad.frequency > 2.5 ? 600 : 400,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {ad.frequency != null ? ad.frequency.toFixed(2) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: FR.stone, fontSize: 11 }}>
                        {recommendationLabel(ad.recommendation)}
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        {ad.status === 'paused' && (
                          <button onClick={() => handleResume(ad)} disabled={isPending} style={btnScale}>Resume</button>
                        )}
                        {(ad.status === 'active' || ad.status === 'scaled') && (
                          <>
                            <button onClick={() => handleKill(ad)} disabled={isPending} style={btnKill}>Kill</button>
                            <button onClick={() => handleScale(ad)} disabled={isPending} style={{ ...btnScale, marginLeft: 6 }}>Scale +30%</button>
                          </>
                        )}
                        {errs[ad.id] && (
                          <p style={{ fontSize: 10, color: FR.red, margin: '4px 0 0', maxWidth: 200, wordBreak: 'break-word' }}>{errs[ad.id]}</p>
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

function recommendationLabel(rec) {
  if (!rec) return '—';
  switch (rec) {
    case 'kill':                return 'Kill (CPA over)';
    case 'scale':               return 'Scale (CPA under)';
    case 'kill_dead_creative':  return 'Kill (CTR < 0.5%)';
    case 'pause_fatigued':      return 'Pause (freq > 2.5)';
    default:                    return rec.replace(/_/g, ' ');
  }
}

const btnKill = {
  fontSize: 11, fontWeight: 500, padding: '4px 11px', borderRadius: 6,
  border: '1px solid #FECACA', background: FR.redLight, color: FR.red,
  cursor: 'pointer',
};

const btnScale = {
  fontSize: 11, fontWeight: 500, padding: '4px 11px', borderRadius: 6,
  border: '1px solid #A7F3D0', background: FR.greenLight, color: FR.green,
  cursor: 'pointer',
};
