import { useEffect, useState } from 'react';
import { listLibraryItems, createLibraryItem, archiveLibraryItem } from '../../../utils/creativeLibraryStore';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };

const KINDS = [
  { key: null, label: 'All' },
  { key: 'inspiration', label: 'Inspiration' },
  { key: 'competitor', label: 'Competitor' },
  { key: 'render', label: 'Renders' },
  { key: 'brand_asset', label: 'Brand Assets' },
];

export default function CreativeLibrary() {
  const [items, setItems] = useState(null);
  const [activeKind, setActiveKind] = useState(null);

  const load = () => listLibraryItems({ kind: activeKind || undefined }).then(setItems);

  useEffect(() => { load(); }, [activeKind]);

  return (
    <div>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.slate, marginBottom: 16 }}>
        Creative Library
      </h2>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {KINDS.map(k => (
          <button
            key={String(k.key)}
            onClick={() => setActiveKind(k.key)}
            style={{
              fontSize: 11, padding: '4px 12px', borderRadius: 5,
              background: activeKind === k.key ? FR.slate : 'transparent',
              color: activeKind === k.key ? FR.salt : FR.stone,
              border: `0.5px solid ${activeKind === k.key ? FR.slate : 'rgba(58,58,58,0.15)'}`,
              cursor: 'pointer',
            }}
          >
            {k.label}
          </button>
        ))}
      </div>

      {items === null
        ? <p style={{ fontSize: 13, color: FR.stone }}>Loading…</p>
        : items.length === 0
        ? <p style={{ fontSize: 13, color: FR.stone }}>No items yet. Competitor ads tab and Apify integration coming in Phase 6.</p>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {items.map(item => (
              <div key={item.id} style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, overflow: 'hidden' }}>
                {item.thumbnail_url
                  ? <img src={item.thumbnail_url} alt={item.title} style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', display: 'block' }} />
                  : <div style={{ width: '100%', aspectRatio: '9/16', background: FR.sand }} />}
                <div style={{ padding: '8px 10px' }}>
                  <p style={{ fontSize: 12, color: FR.slate, marginBottom: 4 }}>{item.title}</p>
                  <p style={{ fontSize: 11, color: FR.stone }}>{item.notes}</p>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
