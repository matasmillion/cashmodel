// ConflictResolver — opens when an OCC save returned a conflict and the
// auto-merge surfaced fields where both this device and another device
// changed the same value to different things.
//
// Per conflict, the user picks "Keep mine" or "Keep theirs" (or edits
// inline). One Apply button at the bottom calls `onApply(resolutions)`
// with `{ field: <chosen-value> }`. The builder folds those into the
// auto-merged base and re-saves with the latest base updated_at.
//
// Brand-conformant per CLAUDE.md: Salt/Slate/Sand, Cormorant headings,
// 0.5px borders, no emojis.

import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { FR } from './techPackConstants';

function formatValue(v) {
  if (v === null || v === undefined) return <em style={{ color: FR.stone, fontStyle: 'italic', fontSize: 11 }}>(empty)</em>;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v.length > 200 ? v.slice(0, 200) + '…' : v;
  try {
    const json = JSON.stringify(v, null, 2);
    return <pre style={{ margin: 0, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 120, overflow: 'auto' }}>{json}</pre>;
  } catch {
    return String(v);
  }
}

export default function ConflictResolver({ entityLabel, conflicts, onApply, onCancel }) {
  // choices[field] = 'mine' | 'theirs'   (defaults to 'mine')
  const [choices, setChoices] = useState(() =>
    Object.fromEntries((conflicts || []).map(c => [c.field, 'mine']))
  );

  const apply = () => {
    const resolutions = {};
    for (const c of conflicts) {
      resolutions[c.field] = choices[c.field] === 'theirs' ? c.theirs : c.mine;
    }
    onApply(resolutions);
  };

  return (
    <div role="dialog"
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#FFF', borderRadius: 10, width: '100%', maxWidth: 720, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: FR.slate, color: FR.salt, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '10px 10px 0 0' }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 3, fontWeight: 600, opacity: 0.8 }}>SYNC CONFLICT</div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 20, marginTop: 2 }}>
              Another device edited {entityLabel || 'this record'}
            </div>
          </div>
          <button type="button" onClick={onCancel} aria-label="Cancel"
            style={{ padding: 6, background: 'rgba(255,255,255,0.1)', color: FR.salt, border: 'none', borderRadius: 3, cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: '14px 18px', borderBottom: `0.5px solid rgba(58,58,58,0.15)`, background: FR.salt, fontSize: 11, color: FR.stone, lineHeight: 1.5 }}>
          Non-overlapping changes from the other device were already merged in.
          The {conflicts.length} field{conflicts.length === 1 ? '' : 's'} below
          {conflicts.length === 1 ? ' was' : ' were'} edited on both sides — pick which version to keep.
        </div>

        <div style={{ overflow: 'auto', padding: '8px 18px 14px', flex: 1 }}>
          {conflicts.map(c => (
            <div key={c.field} style={{ padding: '12px 0', borderBottom: '0.5px solid rgba(58,58,58,0.1)' }}>
              <div style={{ fontSize: 10, letterSpacing: 2, fontWeight: 600, color: FR.stone, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', marginBottom: 8, textTransform: 'uppercase' }}>
                {c.field}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button type="button"
                  onClick={() => setChoices(prev => ({ ...prev, [c.field]: 'mine' }))}
                  style={{
                    textAlign: 'left',
                    padding: 10,
                    background: choices[c.field] === 'mine' ? FR.sand : '#FFF',
                    border: `0.5px solid ${choices[c.field] === 'mine' ? FR.slate : 'rgba(58,58,58,0.15)'}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 9, letterSpacing: 2, fontWeight: 600, color: FR.slate }}>YOURS</span>
                    {choices[c.field] === 'mine' && <Check size={12} color={FR.slate} />}
                  </div>
                  <div style={{ fontSize: 12, color: FR.slate, wordBreak: 'break-word' }}>{formatValue(c.mine)}</div>
                </button>
                <button type="button"
                  onClick={() => setChoices(prev => ({ ...prev, [c.field]: 'theirs' }))}
                  style={{
                    textAlign: 'left',
                    padding: 10,
                    background: choices[c.field] === 'theirs' ? FR.sand : '#FFF',
                    border: `0.5px solid ${choices[c.field] === 'theirs' ? FR.slate : 'rgba(58,58,58,0.15)'}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 9, letterSpacing: 2, fontWeight: 600, color: FR.slate }}>THEIRS</span>
                    {choices[c.field] === 'theirs' && <Check size={12} color={FR.slate} />}
                  </div>
                  <div style={{ fontSize: 12, color: FR.slate, wordBreak: 'break-word' }}>{formatValue(c.theirs)}</div>
                </button>
              </div>
              <div style={{ marginTop: 6, fontSize: 10, color: FR.stone, fontStyle: 'italic' }}>
                Was: {formatValue(c.base)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: `0.5px solid rgba(58,58,58,0.15)` }}>
          <button type="button" onClick={onCancel}
            style={{ padding: '6px 14px', background: 'transparent', color: FR.stone, border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 11, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="button" onClick={apply}
            style={{ padding: '6px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            Apply resolution
          </button>
        </div>
      </div>
    </div>
  );
}
