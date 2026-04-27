// Treatment detail — top sections (breadcrumb, header row, stat strip).
// Mounted by TreatmentList when a card is opened, or directly via the
// `#plm/library/treatments/:id` deep link. Loads the record on demand
// when only `treatmentId` is passed; if `treatment` is passed in (the
// list path) the prefetched row is used immediately.
//
// Twin-column spec, production log, drift, and used-in sections land in
// chunks 08-10.

import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { FR } from './techPackConstants';
import { getFRColor } from '../../utils/colorLibrary';
import { getTreatment, getTreatmentRollups } from '../../utils/treatmentStore';
import { TREATMENT_TYPE_LABEL } from '../../utils/treatmentLibrary';

const STATUS_PILL = {
  draft:    { bg: 'rgba(116,116,116,0.10)', fg: '#5A5A5A', label: 'Draft' },
  testing:  { bg: 'rgba(133,79,11,0.12)',   fg: '#854F0B', label: 'Testing' },
  approved: { bg: 'rgba(99,153,34,0.12)',   fg: '#3B6D11', label: 'Approved' },
  archived: { bg: 'rgba(58,58,58,0.06)',    fg: '#9A9A9A', label: 'Archived' },
};

function formatMonthYear(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch { return ''; }
}

function fmtPct(n, digits = 1) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return `${Number(n).toFixed(digits)}%`;
}

function deltaTone(n, { lowerIsBetter = true } = {}) {
  if (n == null || n === 0) return 'neutral';
  const better = lowerIsBetter ? n < 0 : n > 0;
  return better ? 'good' : 'bad';
}

function StatCard({ label, value, delta, deltaTone: tone = 'neutral' }) {
  const color = tone === 'good' ? '#3B6D11'
    : tone === 'warn' ? '#854F0B'
    : tone === 'bad' ? '#A32D2D'
    : 'rgba(58,58,58,0.5)';
  return (
    <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, color: 'rgba(58,58,58,0.55)', letterSpacing: '0.08em', marginBottom: 6, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, lineHeight: 1, color: FR.slate }}>{value}</div>
      {delta && <div style={{ fontSize: 11, marginTop: 5, color }}>{delta}</div>}
    </div>
  );
}

export default function TreatmentBuilder({ treatment: treatmentProp, treatmentId, onBack }) {
  const id = treatmentProp?.id || treatmentId;
  const [treatment, setTreatment] = useState(treatmentProp || null);
  const [rollups, setRollups] = useState(null);
  const [loading, setLoading] = useState(!treatmentProp && !!id);

  useEffect(() => {
    let cancelled = false;
    if (treatmentProp) {
      setTreatment(treatmentProp);
      setLoading(false);
    } else if (id) {
      setLoading(true);
      getTreatment(id).then(row => {
        if (cancelled) return;
        setTreatment(row);
        setLoading(false);
      });
    }
    return () => { cancelled = true; };
  }, [id, treatmentProp]);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    getTreatmentRollups(id).then(r => { if (!cancelled) setRollups(r); });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return <div style={{ padding: 40, color: FR.stone, fontSize: 12 }}>Loading…</div>;
  }
  if (!treatment) {
    return (
      <div style={{ padding: 40, background: FR.salt, borderRadius: 8, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: FR.slate }}>Not found</div>
        <div style={{ fontSize: 12, color: FR.stone, marginTop: 8 }}>This treatment doesn’t exist or has been removed.</div>
        {onBack && (
          <button onClick={onBack} style={{ marginTop: 16, padding: '6px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
            Back to library
          </button>
        )}
      </div>
    );
  }

  const status = treatment.status || 'draft';
  const pill = STATUS_PILL[status] || STATUS_PILL.draft;
  const swatchHex = (treatment.base_color_id ? getFRColor(treatment.base_color_id)?.hex : null) || FR.sand;

  // Stat strip values + deltas
  const units = rollups?.units_produced != null ? Number(rollups.units_produced).toLocaleString() : '—';
  const posCount = rollups?.pos_count;
  const since = formatMonthYear(rollups?.first_run_at || treatment.created_at);
  const unitsDelta = posCount != null && since
    ? `${posCount} ${posCount === 1 ? 'PO' : 'POs'} since ${since}`
    : null;

  const cost = rollups?.latest_cost_usd != null
    ? `$${Number(rollups.latest_cost_usd).toFixed(2)}`
    : (rollups?.latest_unit_cost != null ? `$${Number(rollups.latest_unit_cost).toFixed(2)}` : '—');
  const costDeltaPct = rollups?.latest_unit_cost_delta_pct;
  const costDelta = costDeltaPct != null
    ? `${costDeltaPct > 0 ? '↑' : '↓'} ${Math.abs(costDeltaPct).toFixed(1)}% from first run`
    : null;

  const lead = rollups?.latest_lead_days != null ? `${rollups.latest_lead_days} d` : '—';
  const leadDeltaDays = rollups?.latest_lead_delta_days;
  const leadDelta = leadDeltaDays != null && leadDeltaDays !== 0
    ? `${leadDeltaDays > 0 ? '↑' : '↓'} ${Math.abs(leadDeltaDays)}d from first run`
    : null;

  const defect = fmtPct(rollups?.defect_rate_pct) || '—';
  const defectDeltaPct = rollups?.defect_rate_delta_pct;
  const defectDelta = defectDeltaPct != null && defectDeltaPct !== 0
    ? `${defectDeltaPct > 0 ? '↑' : '↓'} ${Math.abs(defectDeltaPct).toFixed(0)}% from first run`
    : null;

  return (
    <div>
      {onBack && (
        <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: FR.stone, fontSize: 11, cursor: 'pointer', padding: 0, marginBottom: 10 }}>
          <ArrowLeft size={12} /> Back
        </button>
      )}

      {/* Breadcrumb */}
      <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'rgba(58,58,58,0.5)', marginBottom: 14 }}>
        Library&nbsp;&nbsp;/&nbsp;&nbsp;Treatments&nbsp;&nbsp;/&nbsp;&nbsp;{treatment.name || 'Untitled treatment'}
      </div>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '0.5px solid rgba(58,58,58,0.15)', paddingBottom: 22, marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 8, background: swatchHex, boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.1)' }} />
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 38, lineHeight: 1, color: FR.slate }}>
              {treatment.name || 'Untitled treatment'}
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'rgba(58,58,58,0.6)', marginTop: 8, letterSpacing: '0.04em' }}>
              <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{treatment.code}</span>
              <span style={{ color: 'rgba(58,58,58,0.3)' }}>·</span>
              <span>{TREATMENT_TYPE_LABEL[treatment.type] || treatment.type}</span>
              <span style={{ color: 'rgba(58,58,58,0.3)' }}>·</span>
              <span>Base: {treatment.base_color_id || '—'}</span>
              <span style={{ color: 'rgba(58,58,58,0.3)' }}>·</span>
              <span>{treatment.version || 'v1.0'}</span>
            </div>
          </div>
        </div>
        <span style={{ background: pill.bg, color: pill.fg, padding: '6px 12px', borderRadius: 4, fontSize: 11, letterSpacing: '0.06em' }}>
          {pill.label}
        </span>
      </div>

      {/* Stat strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 22 }}>
        <StatCard label="Units produced" value={units} delta={unitsDelta} deltaTone="neutral" />
        <StatCard label="Latest unit cost" value={cost} delta={costDelta} deltaTone={deltaTone(costDeltaPct, { lowerIsBetter: true })} />
        <StatCard label="Latest lead" value={lead} delta={leadDelta} deltaTone={deltaTone(leadDeltaDays, { lowerIsBetter: true })} />
        <StatCard label="Defect rate" value={defect} delta={defectDelta} deltaTone={deltaTone(defectDeltaPct, { lowerIsBetter: true })} />
      </div>

      {/* TODO: chunks 08-10 */}
    </div>
  );
}
