// Trim Library — a simple, categorised list of reusable BOM trims (fabrics,
// zippers, aglets, labels, etc.) that tech pack BOMs pull from. Not a PLM
// pipeline — there's no kanban / status flow on this side. Groups are
// collapsible rows by trim category; each group shows image cards for fast
// visual browsing.

import { useEffect, useMemo, useState } from 'react';
import { Plus, Boxes, Copy, Trash2, Search, ChevronDown, ChevronRight, Package } from 'lucide-react';
import { FR, DEFAULT_COMPONENT_DATA, BOM_COMPONENT_OPTIONS } from './componentPackConstants';
import ComponentPackBuilder from './ComponentPackBuilder';
import { listComponentPacks, createComponentPack, getComponentPack, deleteComponentPack, duplicateComponentPack } from '../../utils/componentPackStore';
import { parsePLMHash, setPLMHash } from '../../utils/plmRouting';
import { listAllSuppliers, listAllPeople } from '../../utils/plmDirectory';

function formatDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return ''; }
}

function Thumb({ pack }) {
  if (pack.cover_image) {
    return <img src={pack.cover_image} alt={pack.component_name || 'Trim'}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  }
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: FR.salt }}>
      <Package size={26} style={{ color: FR.sand }} />
    </div>
  );
}

function ComponentCard({ pack, onOpen, onDuplicate, onDelete }) {
  return (
    <div
      style={{ background: 'white', borderRadius: 8, border: `1px solid ${FR.sand}`, cursor: 'pointer', overflow: 'hidden', transition: 'box-shadow 0.15s, transform 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
    >
      <div onClick={() => onOpen(pack.id)} style={{ width: '100%', aspectRatio: '1 / 1', borderBottom: `1px solid ${FR.sand}` }}>
        <Thumb pack={pack} />
      </div>
      <div style={{ padding: 10 }}>
        <div onClick={() => onOpen(pack.id)}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 14, color: FR.slate, fontWeight: 500, lineHeight: 1.2, minHeight: 34, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {pack.component_name || 'Untitled'}
          </div>
          {pack.supplier && <div style={{ fontSize: 10, color: FR.stone, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🏭 {pack.supplier}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: FR.stone }}>
            {pack.cost_per_unit ? <span>{pack.currency || 'USD'} {pack.cost_per_unit}</span> : <span>—</span>}
            <span>{formatDate(pack.updated_at)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 6, borderTop: `1px solid ${FR.sand}`, paddingTop: 6 }}>
          <button onClick={e => { e.stopPropagation(); onDuplicate(pack.id); }} title="Duplicate"
            style={{ padding: 4, border: 'none', background: 'transparent', color: FR.stone, cursor: 'pointer' }}>
            <Copy size={11} />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(pack.id); }} title="Delete"
            style={{ padding: 4, border: 'none', background: 'transparent', color: FR.stone, cursor: 'pointer' }}>
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryRow({ category, packs, open, onToggle, onOpen, onDuplicate, onDelete }) {
  return (
    <div style={{ background: 'white', borderRadius: 8, border: `1px solid ${FR.sand}`, marginBottom: 10, overflow: 'hidden' }}>
      <button onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '12px 16px', background: FR.salt, border: 'none', cursor: 'pointer' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {open ? <ChevronDown size={14} style={{ color: FR.soil }} /> : <ChevronRight size={14} style={{ color: FR.soil }} />}
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, color: FR.slate }}>{category || 'Uncategorised'}</span>
          <span style={{ fontSize: 10, color: FR.stone, background: FR.sand, padding: '2px 8px', borderRadius: 10 }}>{packs.length}</span>
        </span>
      </button>
      {open && (
        <div style={{ padding: 14, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {packs.length === 0
            ? <div style={{ fontSize: 11, color: FR.stone, fontStyle: 'italic' }}>No components in this category yet.</div>
            : packs.map(p => (
                <ComponentCard key={p.id} pack={p}
                  onOpen={onOpen} onDuplicate={onDuplicate} onDelete={onDelete} />
              ))}
        </div>
      )}
    </div>
  );
}

export default function ComponentPackList() {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePack, setActivePack] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [openCategories, setOpenCategories] = useState({}); // { [name]: bool }

  const refresh = async () => {
    setLoading(true);
    const rows = await listComponentPacks();
    setPacks(rows || []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  // Open the pack referenced by the URL on mount + when the hash changes.
  useEffect(() => {
    let cancelled = false;
    const tryOpenFromHash = async () => {
      const { section, packId } = parsePLMHash();
      if (section !== 'components') return;
      if (packId && activePack?.id === packId) return;
      if (!packId && activePack) {
        setActivePack(null);
        return;
      }
      if (packId) {
        const full = await getComponentPack(packId);
        if (cancelled) return;
        if (full) setActivePack(full);
        else setPLMHash({ section: 'components' });
      }
    };
    tryOpenFromHash();
    const onHash = () => tryOpenFromHash();
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, [activePack?.id]);

  const openPack = async (id) => {
    const full = await getComponentPack(id);
    if (full) {
      setActivePack(full);
      setPLMHash({ section: 'components', packId: id });
    }
  };

  const createNew = async () => {
    const row = await createComponentPack(DEFAULT_COMPONENT_DATA);
    setActivePack(row);
    setPLMHash({ section: 'components', packId: row.id });
  };

  const onDuplicate = async (id) => { await duplicateComponentPack(id); refresh(); };
  const onDelete = async (id) => { if (!confirm('Delete this trim?')) return; await deleteComponentPack(id); refresh(); };
  const closeBuilder = async () => {
    setActivePack(null);
    setPLMHash({ section: 'components' });
    refresh();
  };

  // Filter by search (computed regardless of activePack so the hook below
  // is called in the same order on every render — React rules of hooks).
  const q = searchQuery.toLowerCase();
  const filtered = packs.filter(p => {
    if (!q) return true;
    return (p.component_name || '').toLowerCase().includes(q)
      || (p.component_category || '').toLowerCase().includes(q)
      || (p.supplier || '').toLowerCase().includes(q);
  });

  // Group by category. Present every known category (even empty) so the
  // library reads like a catalogue. Extra ad-hoc categories get listed too.
  const grouped = useMemo(() => {
    const byCat = {};
    BOM_COMPONENT_OPTIONS.forEach(c => { byCat[c] = []; });
    filtered.forEach(p => {
      const cat = p.component_category || 'Other';
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push(p);
    });
    return byCat;
  }, [filtered]);

  if (activePack) {
    const existingSuppliers = listAllSuppliers();
    const existingPeople = listAllPeople();
    return <ComponentPackBuilder pack={activePack} onBack={closeBuilder} existingSuppliers={existingSuppliers} existingPeople={existingPeople} />;
  }

  const toggleCategory = (name) =>
    setOpenCategories(prev => ({ ...prev, [name]: !(prev[name] ?? packsInCategoryDefaultOpen(grouped[name])) }));

  function packsInCategoryDefaultOpen(list) {
    return (list || []).length > 0;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, margin: 0 }}>Trim Library</h3>
          <p className="text-sm mt-1" style={{ color: FR.stone }}>Reusable fabrics, zippers, trims, and labels. Pull these into tech pack BOMs.</p>
        </div>
        <button onClick={createNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
          style={{ background: FR.slate, color: FR.salt, border: 'none', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
          <Plus size={14} /> New Trim
        </button>
      </div>

      {packs.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: 8, color: FR.stone }} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search trims, factories, categories…"
              style={{ width: '100%', padding: '6px 8px 6px 28px', border: `1px solid ${FR.sand}`, borderRadius: 6, fontSize: 12, color: FR.slate, background: 'white', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <span style={{ fontSize: 10, color: FR.stone }}>{filtered.length} of {packs.length}</span>
        </div>
      )}

      {loading && <p style={{ color: FR.stone, fontSize: 12 }}>Loading…</p>}

      {!loading && packs.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', background: 'white', border: `1px dashed ${FR.sand}`, borderRadius: 12 }}>
          <Boxes size={32} style={{ color: FR.stone, margin: '0 auto 12px', display: 'block' }} />
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, margin: 0, marginBottom: 8 }}>No trims yet</h3>
          <p style={{ color: FR.stone, fontSize: 13, marginBottom: 16 }}>Create spec sheets for fabrics, zippers, and trims you use across multiple products.</p>
          <button onClick={createNew} style={{ padding: '8px 20px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
            + New Trim
          </button>
        </div>
      )}

      {!loading && packs.length > 0 && (
        <div>
          {Object.entries(grouped).map(([cat, list]) => {
            // Hide empty categories when the user is searching — the list is
            // already noisy enough. Otherwise show them so the user sees the
            // full catalogue structure.
            if (q && list.length === 0) return null;
            const isOpen = openCategories[cat] ?? (list.length > 0);
            return (
              <CategoryRow key={cat} category={cat} packs={list}
                open={isOpen} onToggle={() => toggleCategory(cat)}
                onOpen={openPack} onDuplicate={onDuplicate} onDelete={onDelete} />
            );
          })}
        </div>
      )}
    </div>
  );
}
