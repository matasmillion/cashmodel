// Embellishment detail — placeholder until the atom ships.
import { FR } from './techPackConstants';

export default function EmbellishmentBuilder() {
  return (
    <div style={{ padding: 40, background: FR.salt, borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: FR.slate }}>Not implemented yet</div>
      <div style={{ fontSize: 12, color: FR.stone, marginTop: 6 }}>Embellishment detail lands with the atom in a later prompt.</div>
    </div>
  );
}
