// PLM container — sub-tabs for Styles (tech packs) and Components (component packs)

import { useState } from 'react';
import { Shirt, Boxes } from 'lucide-react';
import { FR } from './techPackConstants';
import TechPackList from './TechPackList';
import ComponentPackList from './ComponentPackList';

export default function PLMView() {
  const [view, setView] = useState('styles');

  const tabStyle = (active) => ({
    padding: '8px 16px',
    background: active ? FR.slate : 'transparent',
    color: active ? FR.salt : FR.stone,
    border: `1px solid ${active ? FR.slate : FR.sand}`,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <h2 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 24, margin: 0, marginRight: 16 }}>
          Product Lifecycle Management
        </h2>
        <button onClick={() => setView('styles')} style={tabStyle(view === 'styles')}>
          <Shirt size={13} /> Styles
        </button>
        <button onClick={() => setView('components')} style={tabStyle(view === 'components')}>
          <Boxes size={13} /> Components
        </button>
      </div>

      {view === 'styles' && <TechPackList />}
      {view === 'components' && <ComponentPackList />}
    </div>
  );
}
