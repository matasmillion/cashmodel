// PLM container — sub-tabs for Styles (tech packs) and Components (component packs)

import { useEffect, useState } from 'react';
import { Shirt, Boxes } from 'lucide-react';
import { FR } from './techPackConstants';
import TechPackList from './TechPackList';
import ComponentPackList from './ComponentPackList';
import { parsePLMHash, setPLMHash } from '../../utils/plmRouting';

export default function PLMView() {
  const [view, setView] = useState(() => parsePLMHash().section || 'styles');

  // Keep section in sync with the URL — back/forward, manual edits, deep links
  useEffect(() => {
    const sync = () => {
      const { section } = parsePLMHash();
      if (section && section !== view) setView(section);
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, [view]);

  const switchView = (next) => {
    setView(next);
    setPLMHash({ section: next });
  };

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
        <button onClick={() => switchView('styles')} style={tabStyle(view === 'styles')}>
          <Shirt size={13} /> Styles
        </button>
        <button onClick={() => switchView('components')} style={tabStyle(view === 'components')}>
          <Boxes size={13} /> Components
        </button>
      </div>

      {view === 'styles' && <TechPackList />}
      {view === 'components' && <ComponentPackList />}
    </div>
  );
}
