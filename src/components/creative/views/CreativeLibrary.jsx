import { useEffect, useState } from 'react';
import { Plus, Trash2, Search } from 'lucide-react';
import { listLibraryItems, createLibraryItem, archiveLibraryItem } from '../../../utils/creativeLibraryStore';
import { callApifyMetaAdsScrape } from '../../../utils/liveDataSync';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };

const SECTIONS = [
  { key: 'library', label: 'Library' },
  { key: 'inspiration', label: 'Inspiration' },
  { key: 'competitor', label: 'Competitor Ads' },
];

const KIND_FILTERS = [
  { key: null, label: 'All' },
  { key: 'inspiration', label: 'Inspiration' },
  { key: 'competitor', label: 'Competitor' },
  { key: 'render', label: 'Renders' },
  { key: 'brand_asset', label: 'Brand Assets' },
];

export default function CreativeLibrary() {
  const [section, setSection] = useState('library');

  return (
    <div>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.slate, marginBottom: 16 }}>
        Creative Library
      </h2>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '0.5px solid rgba(58,58,58,0.08)', paddingBottom: 8 }}>
        {SECTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            style={{
              fontSize: 12, padding: '5px 12px', borderRadius: 6,
              background: section === s.key ? FR.slate : 'transparent',
              color: section === s.key ? FR.salt : FR.stone,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'library' && <LibraryPane />}
      {section === 'inspiration' && <InspirationPane />}
      {section === 'competitor' && <CompetitorPane />}
    </div>
  );
}

function LibraryPane() {
  const [items, setItems] = useState(null);
  const [activeKind, setActiveKind] = useState(null);

  const load = () => listLibraryItems({ kind: activeKind || undefined }).then(setItems);
  useEffect(() => { load(); }, [activeKind]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {KIND_FILTERS.map(k => (
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
        ? <p style={{ fontSize: 13, color: FR.stone }}>Nothing saved here yet. Use the Inspiration or Competitor tabs to add some.</p>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {items.map(item => (
              <LibraryCard key={item.id} item={item} onArchive={() => archiveLibraryItem(item.id).then(load)} />
            ))}
          </div>
        )}
    </div>
  );
}

function LibraryCard({ item, onArchive }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
      {item.thumbnail_url
        ? <img src={item.thumbnail_url} alt={item.title || ''} style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', display: 'block' }} />
        : <div style={{ width: '100%', aspectRatio: '9/16', background: FR.sand }} />}
      <div style={{ padding: '8px 10px' }}>
        <p style={{ fontSize: 12, color: FR.slate, marginBottom: 4 }}>{item.title || 'Untitled'}</p>
        {item.notes && <p style={{ fontSize: 11, color: FR.stone, marginTop: 0, marginBottom: 0 }}>{item.notes}</p>}
      </div>
      <button
        onClick={onArchive}
        style={{
          position: 'absolute', top: 6, right: 6, padding: 4,
          background: 'rgba(0,0,0,0.55)', color: 'white', border: 'none', borderRadius: '50%',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="Archive"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

function InspirationPane() {
  const [items, setItems] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ title: '', thumbnail_url: '', notes: '', source_url: '' });
  const [saving, setSaving] = useState(false);

  const load = () => listLibraryItems({ kind: 'inspiration' }).then(setItems);
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!draft.title) return;
    setSaving(true);
    try {
      await createLibraryItem({ ...draft, kind: 'inspiration' });
      setDraft({ title: '', thumbnail_url: '', notes: '', source_url: '' });
      setShowAdd(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p style={{ fontSize: 13, color: FR.stone, margin: 0 }}>Manually saved inspiration cards.</p>
        <button
          onClick={() => setShowAdd(s => !s)}
          style={{
            fontSize: 12, padding: '5px 12px', borderRadius: 6,
            border: '0.5px solid rgba(58,58,58,0.2)', background: 'transparent',
            color: FR.slate, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <Plus size={12} /> Add
        </button>
      </div>

      {showAdd && (
        <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
          <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder="Title" style={inp} />
          <input value={draft.thumbnail_url} onChange={e => setDraft(d => ({ ...d, thumbnail_url: e.target.value }))} placeholder="Thumbnail URL" style={inp} />
          <input value={draft.source_url} onChange={e => setDraft(d => ({ ...d, source_url: e.target.value }))} placeholder="Source URL" style={inp} />
          <textarea value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} placeholder="Notes" rows={2} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
          <button onClick={handleSave} disabled={saving || !draft.title} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, background: FR.slate, color: FR.salt, border: 'none', cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {items === null
        ? <p style={{ fontSize: 13, color: FR.stone }}>Loading…</p>
        : items.length === 0
        ? <p style={{ fontSize: 13, color: FR.stone }}>No inspiration saved yet.</p>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {items.map(item => <LibraryCard key={item.id} item={item} onArchive={() => archiveLibraryItem(item.id).then(load)} />)}
          </div>
        )}
    </div>
  );
}

function CompetitorPane() {
  const [searchTerms, setSearchTerms] = useState('');
  const [scraping, setScraping] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const handleScrape = async (e) => {
    e.preventDefault();
    if (!searchTerms.trim()) return;
    setScraping(true);
    setError(null);
    try {
      const items = await callApifyMetaAdsScrape({
        search_terms: searchTerms.split(',').map(s => s.trim()).filter(Boolean),
        country: 'US',
      });
      setResults(items);
    } catch (err) {
      setError(err.message);
    } finally {
      setScraping(false);
    }
  };

  const handleSave = async (item, key) => {
    setSavingId(key);
    try {
      await createLibraryItem({
        kind: 'competitor',
        title: item.pageName || item.advertiser_name || item.title || 'Competitor ad',
        notes: item.body || item.adCreativeText || item.summary || '',
        thumbnail_url: item.imageUrls?.[0] || item.image_url || item.thumbnail || '',
        source_url: item.url || item.adArchiveUrl || '',
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: FR.stone, marginBottom: 12 }}>
        Pulls competitor ads from Meta Ad Library via Apify. Comma-separate multiple brands.
      </p>
      <form onSubmit={handleScrape} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={searchTerms}
          onChange={e => setSearchTerms(e.target.value)}
          placeholder="brand 1, brand 2, …"
          style={{ ...inp, marginBottom: 0 }}
        />
        <button
          type="submit"
          disabled={scraping || !searchTerms.trim()}
          style={{
            fontSize: 12, padding: '7px 14px', borderRadius: 6,
            background: scraping ? FR.sand : FR.slate, color: scraping ? FR.stone : FR.salt,
            border: 'none', cursor: scraping ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
          }}
        >
          <Search size={12} /> {scraping ? 'Scraping…' : 'Scrape'}
        </button>
      </form>
      {error && <p style={{ fontSize: 11, color: '#A32D2D', marginBottom: 12 }}>{error}</p>}

      {results && (
        results.length === 0
          ? <p style={{ fontSize: 13, color: FR.stone }}>No ads found.</p>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {results.slice(0, 50).map((item, i) => {
                const key = item.id || item.adArchiveId || item.url || `i${i}`;
                const thumb = item.imageUrls?.[0] || item.image_url || item.thumbnail || '';
                return (
                  <div key={key} style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, overflow: 'hidden' }}>
                    {thumb
                      ? <img src={thumb} alt="" style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', display: 'block' }} />
                      : <div style={{ width: '100%', aspectRatio: '9/16', background: FR.sand }} />}
                    <div style={{ padding: '8px 10px' }}>
                      <p style={{ fontSize: 12, color: FR.slate, marginBottom: 4 }}>{item.pageName || item.advertiser_name || 'Unknown'}</p>
                      {item.body && <p style={{ fontSize: 10, color: FR.stone, marginTop: 0, marginBottom: 6, maxHeight: 40, overflow: 'hidden' }}>{item.body.slice(0, 80)}{item.body.length > 80 ? '…' : ''}</p>}
                      <button
                        onClick={() => handleSave(item, key)}
                        disabled={savingId === key}
                        style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '0.5px solid rgba(58,58,58,0.2)', background: 'transparent', color: FR.stone, cursor: 'pointer' }}
                      >
                        {savingId === key ? 'Saving…' : 'Save to library'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
      )}
    </div>
  );
}

const inp = {
  width: '100%', boxSizing: 'border-box',
  fontSize: 13, padding: '7px 10px', borderRadius: 6,
  border: '0.5px solid rgba(58,58,58,0.2)', background: '#fff', color: FR.slate,
  marginBottom: 8,
};
