import { useState } from 'react';
import { createSprint } from '../../../utils/sprintStore';
import { LANE_VALUES, LANES } from '../../../types/creative';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };

const LANE_LABEL = { ai: 'AI', high_production: 'High Production', creator: 'Creator', founder: 'Founder' };

export default function NewSprintDialog({ onClose, onCreate, seedConstraint = '' }) {
  const [lane, setLane] = useState(LANES.AI);
  const [hypothesisType, setHypothesisType] = useState('');
  const [constraintText, setConstraintText] = useState(seedConstraint);
  const [cpaTarget, setCpaTarget] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const sprint = await createSprint({
        lane,
        hypothesis_type: hypothesisType,
        constraint_text: constraintText,
        cpa_target: cpaTarget ? parseFloat(cpaTarget) : null,
      });
      onCreate(sprint);
    } catch (err) {
      console.error('NewSprintDialog:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(58,58,58,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: FR.salt, border: '0.5px solid rgba(58,58,58,0.12)',
        borderRadius: 12, padding: 28, width: 440, maxWidth: '90vw',
        boxShadow: '0 12px 36px rgba(58,58,58,0.12)',
      }}>
        <h3 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 20, fontWeight: 400, color: FR.slate, marginBottom: 20 }}>
          New Sprint
        </h3>

        <Field label="Lane">
          <select value={lane} onChange={e => setLane(e.target.value)} style={inputStyle}>
            {LANE_VALUES.map(l => <option key={l} value={l}>{LANE_LABEL[l]}</option>)}
          </select>
        </Field>

        <Field label="Hypothesis Type">
          <input
            type="text"
            value={hypothesisType}
            onChange={e => setHypothesisType(e.target.value)}
            placeholder="e.g. hook_format, product_angle, talent_style"
            style={inputStyle}
          />
        </Field>

        <Field label="Constraint / Starting Point">
          <textarea
            value={constraintText}
            onChange={e => setConstraintText(e.target.value)}
            rows={3}
            placeholder="What constraint are we testing in this sprint?"
            style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
          />
        </Field>

        <Field label="CPA Target ($)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={cpaTarget}
            onChange={e => setCpaTarget(e.target.value)}
            placeholder="Leave blank to inherit from budget config"
            style={inputStyle}
          />
        </Field>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
          <button onClick={onClose} style={{ ...btnBase, color: FR.stone, border: '0.5px solid rgba(58,58,58,0.2)' }}>
            Cancel
          </button>
          <button onClick={handleCreate} disabled={saving} style={{ ...btnBase, background: FR.slate, color: FR.salt, border: 'none' }}>
            {saving ? 'Creating…' : 'Create Sprint'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 11, letterSpacing: '0.06em', color: '#716F70', textTransform: 'uppercase', marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  fontSize: 13, padding: '7px 10px', borderRadius: 6,
  border: '0.5px solid rgba(58,58,58,0.2)', background: '#fff', color: '#3A3A3A',
  fontFamily: 'inherit',
};

const btnBase = {
  fontSize: 12, padding: '7px 16px', borderRadius: 6, cursor: 'pointer', background: 'transparent',
};
