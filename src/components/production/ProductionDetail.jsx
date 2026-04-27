// PO detail — top half: breadcrumb, header, status stepper, BOM snapshot.
// Production-actuals card (chunk 16) sits below `{/* TODO: chunk 16 */}`.
//
// State transitions are wired to the productionStore state-machine — the
// button rendered on each step calls `transitionPO` with the next legal
// status. BOM snapshot rendering is read-only; the snapshot itself is taken
// in chunk 17 at PO placement.

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { FR } from '../techpack/techPackConstants';
import { getPO, transitionPO, listBOMSnapshots } from '../../utils/productionStore';
import { getTreatment } from '../../utils/treatmentStore';
import { setPLMHash } from '../../utils/plmRouting';

const STATUS_PILL = {
  draft:         { bg: 'rgba(58,58,58,0.08)',   fg: FR.slate, label: 'Draft' },
  placed:        { bg: FR.sand,                  fg: FR.slate, label: 'Placed' },
  in_production: { bg: 'rgba(154,129,107,0.22)', fg: '#5C4A38', label: 'In production' },
  received:      { bg: 'rgba(181,199,211,0.45)', fg: '#2F4A5C', label: 'Received' },
  closed:        { bg: 'rgba(99,153,34,0.12)',   fg: '#3B6D11', label: 'Closed' },
  cancelled:     { bg: 'rgba(58,58,58,0.06)',    fg: '#9A9A9A', label: 'Cancelled' },
};

const STEPPER_ORDER = ['draft', 'placed', 'in_production', 'received', 'closed'];

const NEXT_TRANSITION = {
  draft:         { to: 'placed',        label: 'Place PO' },
  placed:        { to: 'in_production', label: 'Mark in production' },
  in_production: { to: 'received',      label: 'Mark received' },
  received:      { to: 'closed',        label: 'Close PO' },
};

function fmtDate(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return null; }
}
function fmtMoney(n) {
  if (n == null || n === '') return '—';
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function ProductionDetail({ poId, onBack }) {
  const [po, setPo] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const refresh = useCallback(async () => {
    if (!poId) return;
    const fresh = await getPO(poId);
    setPo(fresh);
    const snaps = await listBOMSnapshots(poId);
    setSnapshot(snaps && snaps.length ? snaps[0] : null);
  }, [poId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refresh]);

  const advance = async () => {
    const next = NEXT_TRANSITION[po.status];
    if (!next) return;
    setActing(true);
    try {
      await transitionPO(po.id, next.to);
      await refresh();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Transition failed');
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, color: FR.stone, fontSize: 12 }}>Loading…</div>;
  }
  if (!po) {
    return (
      <div style={{ padding: 40, background: FR.salt, borderRadius: 8, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: FR.slate }}>Not found</div>
        <div style={{ fontSize: 12, color: FR.stone, marginTop: 8 }}>This purchase order doesn&rsquo;t exist or has been removed.</div>
        <button onClick={onBack || (() => setPLMHash({ layer: 'production' }))} style={{ marginTop: 16, padding: '6px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
          Back to production
        </button>
      </div>
    );
  }

  const pill = STATUS_PILL[po.status] || STATUS_PILL.draft;
  const totalActual = (Number(po.units) || 0) * (Number(po.unit_cost_usd) || 0);
  const meta = [
    po.style_id || null,
    po.vendor_id || null,
    po.units ? `${Number(po.units).toLocaleString()} units` : null,
    totalActual ? fmtMoney(totalActual) : null,
  ].filter(Boolean);

  const goBack = () => (onBack ? onBack() : setPLMHash({ layer: 'production' }));
  const nextAction = NEXT_TRANSITION[po.status];

  return (
    <div>
      <button onClick={goBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: FR.stone, fontSize: 11, cursor: 'pointer', padding: 0, marginBottom: 10 }}>
        <ArrowLeft size={12} /> Back
      </button>

      {/* Breadcrumb */}
      <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'rgba(58,58,58,0.5)', marginBottom: 14 }}>
        Production&nbsp;&nbsp;/&nbsp;&nbsp;{po.code}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '0.5px solid rgba(58,58,58,0.15)', paddingBottom: 22, marginBottom: 22 }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 38, lineHeight: 1, color: FR.slate, fontFamilyFallback: 'serif' }}>
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 32 }}>{po.code}</span>
          </div>
          {meta.length > 0 && (
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'rgba(58,58,58,0.6)', marginTop: 8, letterSpacing: '0.04em', flexWrap: 'wrap' }}>
              {meta.map((m, i) => (
                <span key={i} style={{ display: 'inline-flex', gap: 12 }}>
                  {i > 0 && <span style={{ color: 'rgba(58,58,58,0.3)' }}>·</span>}
                  <span>{m}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <span style={{ background: pill.bg, color: pill.fg, padding: '6px 12px', borderRadius: 4, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
          {pill.label}
        </span>
      </div>

      {/* Status stepper */}
      <Stepper currentStatus={po.status} />
      {nextAction && (
        <div style={{ marginTop: 14, marginBottom: 22 }}>
          <button
            onClick={advance}
            disabled={acting}
            style={{ padding: '10px 18px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: acting ? 'wait' : 'pointer', opacity: acting ? 0.6 : 1 }}
          >
            {acting ? 'Working…' : nextAction.label}
          </button>
        </div>
      )}

      {/* BOM snapshot */}
      <BOMSnapshot snapshot={snapshot} poStatus={po.status} />

      {/* TODO: chunk 16 */}
    </div>
  );
}

function Stepper({ currentStatus }) {
  // Cancelled is hidden unless that's the current state.
  const order = currentStatus === 'cancelled' ? ['cancelled'] : STEPPER_ORDER;
  const currentIdx = order.indexOf(currentStatus);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {order.map((step, i) => {
        const past = i < currentIdx;
        const current = i === currentIdx;
        const future = i > currentIdx;
        const bg = past ? FR.slate : current ? '#D4956A' : 'rgba(58,58,58,0.06)';
        const fg = past ? FR.salt : current ? FR.salt : 'rgba(58,58,58,0.45)';
        const label = STATUS_PILL[step]?.label || step;
        return (
          <span key={step} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <span style={{ background: bg, color: fg, padding: '5px 12px', borderRadius: 5, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
            {i < order.length - 1 && (
              <span style={{ width: 28, height: 0, borderTop: `0.5px solid ${past ? FR.slate : 'rgba(58,58,58,0.2)'}`, margin: '0 4px' }} />
            )}
          </span>
        );
      })}
    </div>
  );
}

function BOMSnapshot({ snapshot, poStatus }) {
  const headerHint = snapshot
    ? `Snapshotted ${fmtDate(snapshot.snapshot_at) || '—'} — immutable`
    : (poStatus === 'draft' ? 'Snapshot will be taken on PO placement.' : 'No snapshot found for this PO.');

  return (
    <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '20px 22px', marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, gap: 14, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, color: FR.slate }}>BOM snapshot</div>
        <div style={{ fontSize: 10, color: 'rgba(58,58,58,0.55)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{headerHint}</div>
      </div>

      {!snapshot ? (
        <div style={{ fontSize: 12, color: 'rgba(58,58,58,0.55)', padding: '14px 0' }}>
          {poStatus === 'draft'
            ? 'Once you place this PO, a frozen copy of the style&rsquo;s BOM will appear here.'
            : 'No BOM snapshot is associated with this PO.'}
        </div>
      ) : (
        <BOMTree bom={snapshot.bom || []} />
      )}
    </div>
  );
}

function BOMTree({ bom }) {
  const [treatmentMap, setTreatmentMap] = useState({});

  // Resolve any treatment_id references on fabric rows into the treatment
  // record so children can render `code · name · version`. Snapshot itself
  // stays untouched — this is just a display lookup.
  useEffect(() => {
    let cancelled = false;
    const ids = new Set();
    (bom || []).forEach(row => { if (row?.treatment_id) ids.add(row.treatment_id); });
    if (ids.size === 0) { setTreatmentMap({}); return; }
    Promise.all([...ids].map(id => getTreatment(id).then(t => [id, t]))).then(pairs => {
      if (cancelled) return;
      setTreatmentMap(Object.fromEntries(pairs.filter(([, t]) => t)));
    });
    return () => { cancelled = true; };
  }, [bom]);

  if (!bom.length) {
    return <div style={{ fontSize: 12, color: 'rgba(58,58,58,0.55)', padding: '6px 0' }}>Empty BOM.</div>;
  }
  return (
    <div>
      {bom.map((row, i) => {
        const code = row.code || row.component_code || row.fabricType || row.component || row.type || `Row ${i + 1}`;
        const name = row.name || row.composition || row.material || row.notes || '';
        const version = row.version || '';
        const tr = row.treatment_id ? treatmentMap[row.treatment_id] : null;
        return (
          <div key={i}>
            <Atom level={0} code={code} name={name} version={version} />
            {tr && (
              <Atom
                level={1}
                code={tr.code}
                name={tr.name}
                version={tr.version || ''}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Atom({ level, code, name, version }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '8px 0', paddingLeft: level * 12, borderTop: level === 0 ? '0.5px solid rgba(58,58,58,0.06)' : 'none' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', minWidth: 0 }}>
        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, color: FR.slate }}>{code || '—'}</span>
        {name && (
          <>
            <span style={{ color: 'rgba(58,58,58,0.3)' }}>·</span>
            <span style={{ fontSize: 12, color: FR.slate, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          </>
        )}
      </div>
      {version && (
        <span style={{ fontSize: 10, color: 'rgba(58,58,58,0.5)', letterSpacing: '0.04em', whiteSpace: 'nowrap', marginLeft: 12 }}>v{version}</span>
      )}
    </div>
  );
}
