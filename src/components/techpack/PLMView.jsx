// PLM container — three-layer architecture:
//   Library (seven atoms: Patterns, Fabrics, Colors, Trims, Treatments,
//            Embellishments, Vendors)
//   Styles  (tech packs)
//   Production (POs — empty state until Prompt 3)
//
// The Library nav surfaces a second row of pills under the top-level one.
// Deep state (active pack, active step) lives in the URL hash via
// plmRouting, so back/forward and reloads preserve exactly where the user
// was.

import { useEffect, useState } from 'react';
import { Library, Shirt, Package, Scissors, Palette, Layers, Sparkles, Building2, Boxes, PenTool } from 'lucide-react';
import { FR } from './techPackConstants';
import TechPackList from './TechPackList';
import ComponentPackList from './ComponentPackList';
import ColorPaletteManager from './ColorPaletteManager';
import VendorManager from './VendorManager';
import PatternList from './PatternList';
import FabricList from './FabricList';
import TreatmentList from './TreatmentList';
import EmbellishmentList from './EmbellishmentList';
import { parsePLMHash, setPLMHash, normalizeLegacyHash } from '../../utils/plmRouting';
import { seedTreatmentsIfEmpty } from '../../utils/treatmentStore';
import ProductionList from '../production/ProductionList';

const TOP_TABS = [
  { id: 'library', label: 'Library', icon: Library },
  { id: 'styles', label: 'Styles', icon: Shirt },
  { id: 'production', label: 'Production', icon: Package },
];

const LIBRARY_TABS = [
  { id: 'patterns', label: 'Patterns', icon: PenTool },
  { id: 'fabrics', label: 'Fabrics', icon: Layers },
  { id: 'colors', label: 'Colors', icon: Palette },
  { id: 'trims', label: 'Trims', icon: Boxes },
  { id: 'treatments', label: 'Treatments', icon: Scissors },
  { id: 'embellishments', label: 'Embellishments', icon: Sparkles },
  { id: 'vendors', label: 'Vendors', icon: Building2 },
];

export default function PLMView() {
  // Silently rewrite #product/... → #plm/... on first load so bookmarks and
  // share links upgrade to the canonical grammar without a reload.
  useEffect(() => {
    normalizeLegacyHash();
    // Seed treatment library + the two wash houses on first PLM mount.
    // Idempotent — safe to call repeatedly across navigations.
    seedTreatmentsIfEmpty();
  }, []);

  const [route, setRoute] = useState(() => {
    const parsed = parsePLMHash();
    return { layer: parsed.layer, atom: parsed.atom };
  });

  // Keep layer/atom in sync with the URL — back/forward, manual edits, deep links.
  useEffect(() => {
    const sync = () => {
      const { layer, atom } = parsePLMHash();
      setRoute(prev => (prev.layer === layer && prev.atom === atom ? prev : { layer, atom }));
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  const switchLayer = (layer) => {
    setRoute({ layer, atom: layer === 'library' ? (route.atom || 'patterns') : null });
    setPLMHash({ layer, atom: layer === 'library' ? (route.atom || 'patterns') : null });
  };

  const switchAtom = (atom) => {
    setRoute({ layer: 'library', atom });
    setPLMHash({ layer: 'library', atom });
  };

  const topTabStyle = (active) => ({
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

  const subTabStyle = (active) => ({
    padding: '4px 10px',
    background: 'transparent',
    color: active ? FR.soil : FR.stone,
    border: 'none',
    borderBottom: `2px solid ${active ? FR.soil : 'transparent'}`,
    borderRadius: 0,
    fontSize: 10,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    letterSpacing: 0.3,
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 24, margin: 0, marginRight: 16 }}>
          Product Lifecycle Management
        </h2>
        {TOP_TABS.map(t => {
          const Icon = t.icon;
          const active = route.layer === t.id;
          return (
            <button key={t.id} onClick={() => switchLayer(t.id)} style={topTabStyle(active)}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {route.layer === 'library' && (
        <div style={{ display: 'flex', gap: 2, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap', borderBottom: `1px solid ${FR.sand}`, paddingBottom: 4 }}>
          {LIBRARY_TABS.map(t => {
            const Icon = t.icon;
            const active = route.atom === t.id;
            return (
              <button key={t.id} onClick={() => switchAtom(t.id)} style={subTabStyle(active)}>
                <Icon size={11} /> {t.label}
              </button>
            );
          })}
        </div>
      )}

      {route.layer === 'library' && route.atom === 'patterns' && <PatternList />}
      {route.layer === 'library' && route.atom === 'fabrics' && <FabricList />}
      {route.layer === 'library' && route.atom === 'colors' && <ColorPaletteManager />}
      {route.layer === 'library' && route.atom === 'trims' && <ComponentPackList />}
      {route.layer === 'library' && route.atom === 'treatments' && <TreatmentList />}
      {route.layer === 'library' && route.atom === 'embellishments' && <EmbellishmentList />}
      {route.layer === 'library' && route.atom === 'vendors' && <VendorManager />}

      {route.layer === 'styles' && <TechPackList />}

      {route.layer === 'production' && <ProductionList />}
    </div>
  );
}
