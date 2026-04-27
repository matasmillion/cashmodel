// Treatment detail — top sections (breadcrumb, header row, stat strip).
// Mounted by TreatmentList when a card is opened, or directly via the
// `#plm/library/treatments/:id` deep link. Loads the record on demand
// when only `treatmentId` is passed; if `treatment` is passed in (the
// list path) the prefetched row is used immediately.
//
// Twin-column spec, production log, drift, and used-in sections land in
// chunks 08-10.

import { useEffect, useState } from 'react';
import { ArrowLeft, Edit2, Check, X } from 'lucide-react';
import { FR } from './techPackConstants';
import { getFRColor } from '../../utils/colorLibrary';
import { resolveVendor } from '../../utils/vendorLibrary';
import { getTreatment, getTreatmentRollups, updateTreatment } from '../../utils/treatmentStore';
import { TREATMENT_TYPE_LABEL, LORA_BASE_MODELS } from '../../utils/treatmentLibrary';

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

function formatLongDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return null; }
}

function defectColor(pct) {
  if (pct == null) return 'rgba(58,58,58,0.5)';
  if (pct < 0.5) return '#3B6D11';
  if (pct <= 1.0) return '#854F0B';
  return '#A32D2D';
}

function driftColor(pct) {
  if (pct == null) return 'rgba(58,58,58,0.5)';
  if (pct < 5) return '#3B6D11';
  if (pct <= 10) return '#854F0B';
  return '#A32D2D';
}

const SPEC_LABEL_STYLE = { color: 'rgba(58,58,58,0.55)' };
const SPEC_VALUE_STYLE = { color: FR.slate, lineHeight: 1.5 };
const MONO_STYLE = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5 };
const INPUT_STYLE = {
  width: '100%', padding: '4px 6px', border: '0.5px solid rgba(58,58,58,0.2)',
  borderRadius: 3, fontSize: 12, color: FR.slate, background: '#fff',
  fontFamily: "'Inter', sans-serif", outline: 'none', boxSizing: 'border-box',
};

// One row of the Physical / Digital spec grid. In view mode renders label/value
// text; in edit mode renders the supplied editor (typically an Input) inline.
function Spec({ label, children }) {
  return (
    <>
      <div style={SPEC_LABEL_STYLE}>{label}</div>
      <div style={SPEC_VALUE_STYLE}>{children}</div>
    </>
  );
}

function TextInput({ value, onChange, placeholder, mono = false }) {
  return (
    <input
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={mono ? { ...INPUT_STYLE, ...MONO_STYLE } : INPUT_STYLE}
    />
  );
}

function NumberInput({ value, onChange, step = 1 }) {
  return (
    <input
      type="number"
      step={step}
      value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      style={INPUT_STYLE}
    />
  );
}

function SelectInput({ value, onChange, options }) {
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value)} style={INPUT_STYLE}>
      <option value="">—</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

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

  // Editable surface — mirrors `treatment` in view mode, holds in-flight edits
  // in edit mode. `setField`/`setDigitalField` write into the draft only.
  const view = editing ? draft : treatment;
  const setField = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  const setDigitalField = (key, value) => setDraft(d => ({ ...d, digital: { ...(d.digital || {}), [key]: value } }));

  const enterEdit = () => { setDraft({ ...treatment, digital: { ...(treatment.digital || {}) } }); setEditing(true); };
  const cancelEdit = () => { setDraft(null); setEditing(false); };
  const saveEdit = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const patch = {
        chemistry: draft.chemistry,
        duration_minutes: Number(draft.duration_minutes) || 0,
        temperature_c: Number(draft.temperature_c) || 0,
        compatible_fabric_ids: draft.compatible_fabric_ids || [],
        shrinkage_expected_pct: Number(draft.shrinkage_expected_pct) || 0,
        primary_vendor_id: draft.primary_vendor_id || '',
        backup_vendor_id: draft.backup_vendor_id || '',
        moq_units: Number(draft.moq_units) || 0,
        notes: draft.notes || '',
        digital: draft.digital || treatment.digital,
      };
      const updated = await updateTreatment(treatment.id, patch);
      if (updated) setTreatment(updated);
      setEditing(false);
      setDraft(null);
    } finally {
      setSaving(false);
    }
  };

  const primaryVendor = resolveVendor(view.primary_vendor_id);
  const backupVendor = view.backup_vendor_id ? resolveVendor(view.backup_vendor_id) : null;
  const substrate = (view.compatible_fabric_ids && view.compatible_fabric_ids.length)
    ? view.compatible_fabric_ids.join(', ')
    : '—';
  const moqTerms = (() => {
    const moq = view.moq_units ? `${Number(view.moq_units).toLocaleString()} units` : '—';
    const terms = primaryVendor?.payment_terms || '';
    return terms ? `${moq} · ${terms}` : moq;
  })();

  const dig = view.digital || {};
  const trainCount = Array.isArray(dig.lora_training_image_urls) ? dig.lora_training_image_urls.length : 0;
  const trainedDate = formatLongDate(dig.lora_trained_at);
  const trainingSet = trainCount
    ? `${trainCount} images${dig.lora_version ? ` · ${dig.lora_version}` : ''}${trainedDate ? ` retrained ${trainedDate}` : ''}`
    : '—';
  const lastRendered = formatLongDate(dig.last_digital_sync_at);
  const driftPct = rollups?.drift_30d_pct;
  const driftLine = driftPct != null
    ? `${Number(driftPct).toFixed(1)}% — ${driftPct < 8 ? 'within target' : 'retrain recommended'}`
    : '—';
  const driftColor = driftPct != null && driftPct >= 8 ? '#854F0B' : '#3B6D11';

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        {onBack ? (
          <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: FR.stone, fontSize: 11, cursor: 'pointer', padding: 0 }}>
            <ArrowLeft size={12} /> Back
          </button>
        ) : <span />}
        <div style={{ display: 'flex', gap: 8 }}>
          {!editing ? (
            <button onClick={enterEdit} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'transparent', color: FR.slate, border: '0.5px solid rgba(58,58,58,0.25)', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
              <Edit2 size={12} /> Edit
            </button>
          ) : (
            <>
              <button onClick={cancelEdit} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'transparent', color: FR.stone, border: '0.5px solid rgba(58,58,58,0.25)', borderRadius: 6, fontSize: 11, cursor: saving ? 'not-allowed' : 'pointer' }}>
                <X size={12} /> Cancel
              </button>
              <button onClick={saveEdit} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 11, cursor: saving ? 'wait' : 'pointer' }}>
                <Check size={12} /> {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>

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

      {/* Twin columns — Physical spec / Digital asset */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 22 }}>
        {/* Physical spec */}
        <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, color: FR.slate }}>Physical spec</div>
            <div style={{ fontSize: 10, color: 'rgba(58,58,58,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>What the vendor produces</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', rowGap: 10, fontSize: 12, lineHeight: 1.5 }}>
            <Spec label="Chemistry">
              {editing
                ? <TextInput value={view.chemistry} onChange={v => setField('chemistry', v)} />
                : (view.chemistry || '—')}
            </Spec>
            <Spec label="Duration">
              {editing
                ? <NumberInput value={view.duration_minutes} onChange={v => setField('duration_minutes', v)} />
                : (view.duration_minutes ? `${view.duration_minutes} minutes` : '—')}
            </Spec>
            <Spec label="Temperature">
              {editing
                ? <NumberInput value={view.temperature_c} onChange={v => setField('temperature_c', v)} />
                : (view.temperature_c ? `${view.temperature_c} °C` : '—')}
            </Spec>
            <Spec label="Substrate">
              {editing
                ? <TextInput
                    value={(view.compatible_fabric_ids || []).join(', ')}
                    onChange={v => setField('compatible_fabric_ids', v.split(',').map(s => s.trim()).filter(Boolean))}
                    placeholder="Comma-separated fabric ids" />
                : substrate}
            </Spec>
            <Spec label="Shrinkage">
              {editing
                ? <NumberInput step={0.1} value={view.shrinkage_expected_pct} onChange={v => setField('shrinkage_expected_pct', v)} />
                : (view.shrinkage_expected_pct ? `${view.shrinkage_expected_pct}% expected` : '—')}
            </Spec>
            <Spec label="Vendor">
              {editing
                ? <TextInput value={view.primary_vendor_id} onChange={v => setField('primary_vendor_id', v)} />
                : (primaryVendor?.name || view.primary_vendor_id || '—')}
            </Spec>
            <Spec label="Backup">
              {editing
                ? <TextInput value={view.backup_vendor_id} onChange={v => setField('backup_vendor_id', v)} />
                : (backupVendor?.name || view.backup_vendor_id || '—')}
            </Spec>
            <Spec label="MOQ · Terms">
              {editing
                ? <NumberInput value={view.moq_units} onChange={v => setField('moq_units', v)} />
                : moqTerms}
            </Spec>
          </div>
        </div>

        {/* Digital asset */}
        <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, color: FR.slate }}>Digital asset</div>
            <div style={{ fontSize: 10, color: 'rgba(58,58,58,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>What the designer renders</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', rowGap: 10, fontSize: 12, lineHeight: 1.5 }}>
            <Spec label="LoRA">
              {editing
                ? <TextInput mono value={dig.lora_checkpoint_url} onChange={v => setDigitalField('lora_checkpoint_url', v)} />
                : (dig.lora_checkpoint_url
                    ? <span style={MONO_STYLE}>{dig.lora_checkpoint_url}</span>
                    : <span style={{ color: 'rgba(58,58,58,0.5)' }}>—</span>)}
            </Spec>
            <Spec label="Base model">
              {editing
                ? <SelectInput value={dig.lora_base_model} onChange={v => setDigitalField('lora_base_model', v)} options={LORA_BASE_MODELS.map(m => ({ value: m.id, label: m.label }))} />
                : (LORA_BASE_MODELS.find(m => m.id === dig.lora_base_model)?.label || '—')}
            </Spec>
            <Spec label="Trigger">
              {editing
                ? <TextInput mono value={dig.lora_trigger_phrase} onChange={v => setDigitalField('lora_trigger_phrase', v)} />
                : (dig.lora_trigger_phrase
                    ? <span style={MONO_STYLE}>{dig.lora_trigger_phrase}</span>
                    : <span style={{ color: 'rgba(58,58,58,0.5)' }}>—</span>)}
            </Spec>
            <Spec label="Training set">{trainingSet}</Spec>
            <Spec label="CLO .ZFAB">
              {dig.clo_asset_url
                ? <span style={MONO_STYLE}>{dig.clo_asset_url}</span>
                : <span style={{ color: 'rgba(58,58,58,0.5)' }}>not synced — optional</span>}
            </Spec>
            <Spec label="Thumbnail">{lastRendered ? `Last rendered ${lastRendered}` : '—'}</Spec>
            <Spec label="Source">{dig.digital_source || '—'}</Spec>
            <Spec label="Drift (30d)">
              <span style={{ color: driftPct != null ? driftColor : 'rgba(58,58,58,0.5)' }}>{driftLine}</span>
            </Spec>
          </div>
        </div>
      </div>

      {/* Production log */}
      <ProductionLog rows={rollups?.log || []} />

      {/* TODO: chunk 10 */}
    </div>
  );
}

function ProductionLog({ rows }) {
  const muted = 'rgba(58,58,58,0.55)';
  const borderTop = '0.5px solid rgba(58,58,58,0.1)';
  const headerCell = {
    fontSize: 11, color: muted, textTransform: 'uppercase', letterSpacing: '0.04em',
    padding: '6px 8px 6px 0', fontWeight: 500, textAlign: 'left',
    borderBottom: '0.5px solid rgba(58,58,58,0.1)',
  };
  const headerCellRight = { ...headerCell, textAlign: 'right' };
  const dataCell = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5,
    padding: '9px 8px 9px 0', color: FR.slate, borderTop,
  };
  const dataCellRight = { ...dataCell, textAlign: 'right' };

  return (
    <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '20px 22px', marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, color: FR.slate }}>Production log</div>
        <div style={{ fontSize: 10, color: muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Append-only · every PO that used this atom</div>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: muted, padding: '14px 0' }}>
          No production runs yet. Once a PO that references this treatment closes, it appears here.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={headerCell}>PO</th>
              <th style={headerCell}>Date</th>
              <th style={headerCell}>Style</th>
              <th style={headerCellRight}>Units</th>
              <th style={headerCell}>Lot</th>
              <th style={headerCellRight}>Cost</th>
              <th style={headerCellRight}>Lead</th>
              <th style={headerCellRight}>Defect</th>
              <th style={headerCellRight}>Drift</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.po_code || i}>
                <td style={dataCell}>{r.po_code || '—'}</td>
                <td style={dataCell}>{r.date || '—'}</td>
                <td style={{ ...dataCell, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{r.style || '—'}</td>
                <td style={dataCellRight}>{r.units != null ? Number(r.units).toLocaleString() : '—'}</td>
                <td style={dataCell}>{r.lot || '—'}</td>
                <td style={dataCellRight}>{r.cost != null ? `$${Number(r.cost).toFixed(2)}` : '—'}</td>
                <td style={dataCellRight}>{r.lead != null ? `${r.lead}d` : '—'}</td>
                <td style={{ ...dataCellRight, color: defectColor(r.defect) }}>{r.defect != null ? `${Number(r.defect).toFixed(1)}%` : '—'}</td>
                <td style={{ ...dataCellRight, color: driftColor(r.drift) }}>{r.drift != null ? `${Number(r.drift).toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
