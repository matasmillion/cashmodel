// Patterns atom — empty-state stub. Full Pattern library (DXF upload,
// block library, grading rules) lands in a later prompt. Imports the
// shared atom typedefs so the shape stays consistent across stubs.

// eslint-disable-next-line no-unused-vars
import * as _atomTypes from '../../types/atoms';
import { Plus } from 'lucide-react';
import { FR } from './techPackConstants';

export default function PatternList() {
  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
        <div>
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, margin: 0 }}>Patterns</h3>
          <p style={{ color: FR.stone, fontSize: 12, margin: '4px 0 0' }}>
            DXF blocks, sloper library, grading rules — the skeleton every Style inherits from.
          </p>
        </div>
        <button disabled
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'transparent', color: FR.sand, border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'not-allowed', whiteSpace: 'nowrap' }}>
          <Plus size={12} /> Add pattern
        </button>
      </div>

      <div style={{ padding: '60px 24px', textAlign: 'center', background: FR.salt, border: `1px dashed ${FR.sand}`, borderRadius: 8 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: FR.slate }}>Coming soon</div>
        <div style={{ fontSize: 12, color: FR.stone, marginTop: 8, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
          Patterns become a first-class atom in a later phase. Each Style will reference one pattern at a specific version, and edits there will ripple into every open PO snapshot log.
        </div>
      </div>
    </div>
  );
}
