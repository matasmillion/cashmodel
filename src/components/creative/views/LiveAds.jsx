import { useEffect, useState } from 'react';
import { listAds } from '../../../utils/adStore';
import { checkBudgetGuardrail } from '../../../utils/budgetConfigStore';
import { AD_STATUSES } from '../../../types/creative';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };
const NAVY = '#1B2741'; // accent only — thead + budget bar per design spec

export default function LiveAds() {
  const [ads, setAds] = useState(null);
  const [guardrail, setGuardrail] = useState(null);

  useEffect(() => {
    Promise.all([
      listAds({ status: AD_STATUSES.ACTIVE }),
      checkBudgetGuardrail(),
    ]).then(([a, g]) => { setAds(a); setGuardrail(g); });
  }, []);

  const weeklyPct = guardrail ? Math.min(1, guardrail.weeklySpend / (guardrail.config?.weekly_cap || 2000)) : 0;
  const barColor = weeklyPct >= 0.9 ? '#A32D2D' : weeklyPct >= 0.7 ? '#854F0B' : NAVY;

  return (
    <div>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.slate, marginBottom: 16 }}>
        Live Ads
      </h2>

      {/* Budget guardrail bar — navy accent per design spec */}
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
        ? <p style={{ fontSize: 13, color: FR.stone }}>No active ads.</p>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: NAVY }}>
                  {['Ad Name', 'Spend', 'Impressions', 'Clicks', 'CPA', 'Rec.', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#fff', fontWeight: 400, fontSize: 11, letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ads.map((ad, i) => {
                  const isKillCandidate = ad.cpa && guardrail?.config?.cpa_target
                    && ad.cpa > guardrail.config.cpa_target * 1.5;
                  return (
                    <tr key={ad.id} style={{ background: isKillCandidate ? '#FDECEA' : i % 2 === 0 ? '#fff' : '#fafaf8', borderBottom: '0.5px solid rgba(58,58,58,0.06)' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', color: FR.slate }}>{ad.ad_name}</td>
                      <td style={{ padding: '8px 12px', color: FR.slate }}>${(ad.spend_to_date || 0).toFixed(2)}</td>
                      <td style={{ padding: '8px 12px', color: FR.slate }}>{ad.impressions.toLocaleString()}</td>
                      <td style={{ padding: '8px 12px', color: FR.slate }}>{ad.clicks.toLocaleString()}</td>
                      <td style={{ padding: '8px 12px', color: isKillCandidate ? '#A32D2D' : FR.slate }}>{ad.cpa ? `$${ad.cpa.toFixed(2)}` : '—'}</td>
                      <td style={{ padding: '8px 12px', color: FR.stone }}>{ad.recommendation || '—'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ fontSize: 11, color: FR.stone }}>Actions in Phase 4</span>
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
