// Treatments atom — empty-state stub. The full Treatments surface
// (wash / dye / print / finish with LoRA checkpoints and CLO-SET twin)
// lands in Prompt 2.

// eslint-disable-next-line no-unused-vars
import * as _atomTypes from '../../types/atoms';
import { Plus } from 'lucide-react';
import { FR } from './techPackConstants';

export default function TreatmentList() {
  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
        <div>
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, margin: 0 }}>Treatments</h3>
          <p style={{ color: FR.stone, fontSize: 12, margin: '4px 0 0' }}>
            Washes, dyes, prints, finishes, distress — each with its own chemistry, vendor, and digital twin.
          </p>
        </div>
        <button disabled
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'transparent', color: FR.sand, border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'not-allowed', whiteSpace: 'nowrap' }}>
          <Plus size={12} /> Add treatment
        </button>
      </div>

      <div style={{ padding: '60px 24px', textAlign: 'center', background: FR.salt, border: `1px dashed ${FR.sand}`, borderRadius: 8 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: FR.slate }}>Coming soon</div>
        <div style={{ fontSize: 12, color: FR.stone, marginTop: 8, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
          The Treatments atom arrives in Phase 2 with a LoRA checkpoint, CLO-SET-ready render, and a pixel-level spec card.
        </div>
      </div>
    </div>
  );
}
