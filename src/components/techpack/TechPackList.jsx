// PLM Kanban board — drag-and-drop tech packs through lifecycle stages
import { useEffect, useState, useRef } from 'react';
import { Plus, Shirt, Copy, Trash2, GripVertical, GitBranch, Search } from 'lucide-react';
import { FR, DEFAULT_DATA, DEFAULT_LIBRARY, STATUSES } from './techPackConstants';
import TechPackBuilder from './TechPackBuilder';
import { listTechPacks, createTechPack, getTechPack, deleteTechPack, duplicateTechPack, saveTechPack } from '../../utils/techPackStore';
import { listComponentPacks } from '../../utils/componentPackStore';
import { parsePLMHash, setPLMHash } from '../../utils/plmRouting';

function formatDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return ''; }
}

const STATUS_COLORS = {
  Design:           { bg: '#F5F0E8', border: '#EBE5D5', dot: '#9A816B' },
  Sampling:         { bg: '#F0F4F7', border: '#D4E1EA', dot: '#B5C7D3' },
  Testing:          { bg: '#F5F2EC', border: '#E6DDD2', dot: '#D4956A' },
  'Pre-Production': { bg: '#F0F3EF', border: '#D6DDD2', dot: '#ADBDA3' },
  Production:       { bg: '#EDEFED', border: '#D0D6CE', dot: '#4CAF7D' },
  Released:         { bg: '#F2F2F2', border: '#E0E0E0', dot: '#3A3A3A' },
};

function KanbanCard({ pack, onOpen, onDuplicate, onDelete, onCreateVariant, onDragStart, onDragEnd }) {
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', pack.id); onDragStart(pack.id); }}
      onDragEnd={onDragEnd}
      style={{
        background: 'white', borderRadius: 8, marginBottom: 8,
        border: `1px solid ${FR.sand}`, cursor: 'grab',
        transition: 'box-shadow 0.15s, transform 0.15s', overflow: 'hidden',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
    >
      <div onClick={() => onOpen(pack.id)} style={{ cursor: 'pointer', width: '100%', aspectRatio: '4 / 3', background: FR.salt, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderBottom: `1px solid ${FR.sand}` }}>
        {pack.cover_image
          ? <img src={pack.cover_image} alt={pack.style_name || 'Cover'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <Shirt size={28} style={{ color: FR.sand }} />}
      </div>
      <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <GripVertical size={12} style={{ color: FR.sand, marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div onClick={() => onOpen(pack.id)} style={{ cursor: 'pointer' }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 15, color: FR.slate, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pack.style_name || 'Untitled'}
            </div>
            <div style={{ fontSize: 10, color: FR.stone, marginTop: 2 }}>{pack.product_category || '—'}</div>
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: FR.stone, marginBottom: 2 }}>
              <span>{pack.completion_pct || 0}%</span>
              <span>{formatDate(pack.updated_at)}</span>
            </div>
            <div style={{ width: '100%', height: 3, background: FR.sand, borderRadius: 2 }}>
              <div style={{ width: `${pack.completion_pct || 0}%`, height: '100%', background: FR.soil, borderRadius: 2 }} />
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 6 }}>
        {pack.style_name && (
          <button onClick={e => { e.stopPropagation(); onCreateVariant(pack.id); }} title="Create Variant"
            style={{ padding: 4, border: 'none', background: 'transparent', color: FR.soil, cursor: 'pointer' }}>
            <GitBranch size={11} />
          </button>
        )}
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

function KanbanColumn({ status, packs, onOpen, onDuplicate, onDelete, onCreateVariant, onDragStart, onDragEnd, onDrop, dragOverStatus, setDragOverStatus }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.Design;
  const isOver = dragOverStatus === status;

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOverStatus(status); }}
      onDragLeave={() => setDragOverStatus(null)}
      onDrop={e => { e.preventDefault(); setDragOverStatus(null); const id = e.dataTransfer.getData('text/plain'); onDrop(id, status); }}
      style={{
        flex: 1, minWidth: 220, maxWidth: 320,
        background: isOver ? colors.border : colors.bg,
        borderRadius: 10, padding: 10,
        border: `1px solid ${isOver ? FR.soil : colors.border}`,
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, padding: '0 4px' }}>
        <div style={{ width: 8, height: 8, borderRadius: 4, background: colors.dot }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: FR.slate, letterSpacing: 0.3 }}>{status}</span>
        <span style={{ fontSize: 10, color: FR.stone, marginLeft: 'auto' }}>{packs.length}</span>
      </div>
      <div style={{ minHeight: 60 }}>
        {packs.map(p => (
          <KanbanCard key={p.id} pack={p} onOpen={onOpen} onDuplicate={onDuplicate} onDelete={onDelete}
            onCreateVariant={onCreateVariant} onDragStart={onDragStart} onDragEnd={onDragEnd} />
        ))}
      </div>
    </div>
  );
}

export default function TechPackList() {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePack, setActivePack] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [existingSuppliers, setExistingSuppliers] = useState([]);

  const refresh = async () => {
    setLoading(true);
    const [rows, comps] = await Promise.all([listTechPacks(), listComponentPacks()]);
    setPacks(rows || []);
    setExistingSuppliers([...new Set((comps || []).map(c => (c.supplier || '').trim()).filter(Boolean))].sort());
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  // If the URL points to a specific pack on mount or hashchange, open it.
  useEffect(() => {
    let cancelled = false;
    const tryOpenFromHash = async () => {
      const { section, packId } = parsePLMHash();
      if (section !== 'styles') return;
      // Already showing this pack? Skip.
      if (packId && activePack?.id === packId) return;
      if (!packId && activePack) {
        setActivePack(null);
        return;
      }
      if (packId) {
        const full = await getTechPack(packId);
        if (cancelled) return;
        if (full) setActivePack(full);
        else {
          // Pack disappeared (deleted) — clean up the URL
          setPLMHash({ section: 'styles' });
        }
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
    const full = await getTechPack(id);
    if (full) {
      setActivePack(full);
      setPLMHash({ section: 'styles', packId: id });
    }
  };

  const createNew = async () => {
    const row = await createTechPack(DEFAULT_DATA, DEFAULT_LIBRARY);
    setActivePack(row);
    setPLMHash({ section: 'styles', packId: row.id });
  };

  const onDuplicate = async (id) => {
    await duplicateTechPack(id);
    refresh();
  };

  const onDelete = async (id) => {
    if (!confirm('Delete this tech pack?')) return;
    await deleteTechPack(id);
    refresh();
  };

  const onCreateVariant = async (parentId) => {
    const parent = await getTechPack(parentId);
    if (!parent) return;
    const variantData = {
      ...(parent.data || DEFAULT_DATA),
      styleName: (parent.data?.styleName || '') + ' — Variant',
      parentStyleId: parentId,
      parentStyleName: parent.data?.styleName || parent.style_name || '',
      styleNumber: '',
      skuPrefix: '',
      status: 'Design',
      revisions: [],
      samples: [],
      colorways: [{ name: '', frColor: '', pantone: '', hex: '' }],
      quantities: [{ colorway: '', s: '', m: '', l: '', xl: '', unitCost: '' }],
      cartons: [{ cartonNum: '', colorway: '', sizeBreakdown: '', qtyPerCarton: '', dims: '', grossWeight: '', netWeight: '' }],
    };
    const row = await createTechPack(variantData, parent.library || DEFAULT_LIBRARY);
    setActivePack(row);
    setPLMHash({ section: 'styles', packId: row.id });
  };

  const onDrop = async (id, newStatus) => {
    setDraggingId(null);
    // Normalize — map old status names if needed
    const statusMap = { Development: 'Design', Completed: 'Released' };
    const pack = packs.find(p => p.id === id);
    if (!pack) return;
    const currentStatus = statusMap[pack.status] || pack.status;
    if (currentStatus === newStatus) return;

    // Optimistic update
    setPacks(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p));

    // Persist — need to fetch full pack, update status in data, and save
    const full = await getTechPack(id);
    if (full) {
      const updatedData = { ...(full.data || {}), status: newStatus };
      await saveTechPack(id, { data: updatedData, status: newStatus });
    }
  };

  const closeBuilder = async () => {
    setActivePack(null);
    setPLMHash({ section: 'styles' });
    refresh();
  };

  if (activePack) {
    return <TechPackBuilder pack={activePack} onBack={closeBuilder} existingSuppliers={existingSuppliers} />;
  }

  // Filter packs
  const q = searchQuery.toLowerCase();
  const allCategories = [...new Set(packs.map(p => p.product_category).filter(Boolean))];
  const filtered = packs.filter(p => {
    if (q && !(p.style_name || '').toLowerCase().includes(q) && !(p.product_category || '').toLowerCase().includes(q)) return false;
    if (filterCategory && p.product_category !== filterCategory) return false;
    return true;
  });

  // Group filtered packs by status into columns
  const columns = {};
  STATUSES.forEach(s => { columns[s] = []; });
  filtered.forEach(p => {
    let st = p.status || 'Design';
    if (st === 'Development') st = 'Design';
    if (st === 'Completed') st = 'Released';
    if (!columns[st]) st = 'Design';
    columns[st].push(p);
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, margin: 0 }}>Product Pipeline</h3>
          <p className="text-sm mt-1" style={{ color: FR.stone }}>Drag tech packs through stages. Click a card to open it.</p>
        </div>
        <button onClick={createNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
          style={{ background: FR.slate, color: FR.salt, border: 'none', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
          <Plus size={14} /> New Tech Pack
        </button>
      </div>

      {/* Search + Filter bar */}
      {packs.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 260 }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: 8, color: FR.stone }} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search styles…"
              style={{ width: '100%', padding: '6px 8px 6px 28px', border: `1px solid ${FR.sand}`, borderRadius: 6, fontSize: 12, color: FR.slate, background: 'white', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {allCategories.length > 1 && (
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              style={{ padding: '6px 8px', border: `1px solid ${FR.sand}`, borderRadius: 6, fontSize: 11, color: FR.slate, background: 'white' }}>
              <option value="">All categories</option>
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <span style={{ fontSize: 10, color: FR.stone }}>{filtered.length} of {packs.length}</span>
        </div>
      )}

      {loading && <p style={{ color: FR.stone, fontSize: 12 }}>Loading…</p>}

      {!loading && packs.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', background: 'white', border: `1px dashed ${FR.sand}`, borderRadius: 12 }}>
          <Shirt size={32} style={{ color: FR.stone, margin: '0 auto 12px', display: 'block' }} />
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, margin: 0, marginBottom: 8 }}>No tech packs yet</h3>
          <p style={{ color: FR.stone, fontSize: 13, marginBottom: 16 }}>Create your first one to start building your product pipeline.</p>
          <button onClick={createNew} style={{ padding: '8px 20px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
            + New Tech Pack
          </button>
        </div>
      )}

      {!loading && packs.length > 0 && (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
          {STATUSES.map(status => (
            <KanbanColumn key={status} status={status} packs={columns[status]}
              onOpen={openPack} onDuplicate={onDuplicate} onDelete={onDelete} onCreateVariant={onCreateVariant}
              onDragStart={setDraggingId} onDragEnd={() => setDraggingId(null)}
              onDrop={onDrop} dragOverStatus={dragOverStatus} setDragOverStatus={setDragOverStatus} />
          ))}
        </div>
      )}
    </div>
  );
}
