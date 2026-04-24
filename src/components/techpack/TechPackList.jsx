// PLM Styles view — two displays, one default.
//   • Grid: flat card layout, mirrors the visual rhythm of the Colors tab.
//   • Kanban: drag tech packs through lifecycle stages.
// The grid is the default; the choice is persisted in localStorage so the
// user lands on their preferred view next time.
import { useEffect, useState, useRef } from 'react';
import { Plus, Shirt, Copy, Trash2, GitBranch, Search, LayoutGrid, Columns3 } from 'lucide-react';
import { FR, DEFAULT_DATA, DEFAULT_LIBRARY, STATUSES } from './techPackConstants';
import { CostPill } from './TechPackPrimitives';
import TechPackBuilder from './TechPackBuilder';
import { listTechPacks, createTechPack, getTechPack, deleteTechPack, duplicateTechPack, saveTechPack } from '../../utils/techPackStore';
import { listComponentPacks } from '../../utils/componentPackStore';
import { parsePLMHash, setPLMHash } from '../../utils/plmRouting';
import { listAllSuppliers } from '../../utils/plmDirectory';

const VIEW_STORAGE_KEY = 'cashmodel_styles_view';

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

// Compact Kanban card — horizontal layout so a typical desktop column
// comfortably fits 5+ cards without scrolling inside the column. The
// same info fits (thumb, name, category, status, completion, cost,
// actions), just denser.
function KanbanCard({ pack, onOpen, onDuplicate, onDelete, onCreateVariant, onDragStart, onDragEnd }) {
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', pack.id); onDragStart(pack.id); }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(pack.id)}
      style={{
        background: 'white', borderRadius: 6, marginBottom: 6,
        border: `1px solid ${FR.sand}`, cursor: 'grab', position: 'relative',
        transition: 'box-shadow 0.15s, transform 0.15s', overflow: 'hidden',
        padding: 8,
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ width: 48, height: 48, flexShrink: 0, background: FR.salt, borderRadius: 4, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${FR.sand}` }}>
          {pack.cover_image
            ? <img src={pack.cover_image} alt={pack.style_name || 'Cover'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Shirt size={18} style={{ color: FR.sand }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <div style={{ flex: 1, minWidth: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 13, color: FR.slate, fontWeight: 500, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pack.style_name || 'Untitled'}
            </div>
            <CostPill amount={pack.total_unit_cost} currency={pack.currency || 'USD'} title="Total unit cost — BOM + colorways" />
          </div>
          <div style={{ fontSize: 9, color: FR.stone, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pack.product_category || '—'} · {formatDate(pack.updated_at)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <div style={{ flex: 1, height: 3, background: FR.sand, borderRadius: 2 }}>
              <div style={{ width: `${pack.completion_pct || 0}%`, height: '100%', background: FR.soil, borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 9, color: FR.stone, minWidth: 22, textAlign: 'right' }}>{pack.completion_pct || 0}%</span>
            {pack.style_name && (
              <button onClick={e => { e.stopPropagation(); onCreateVariant(pack.id); }} title="Create Variant"
                style={{ padding: 2, border: 'none', background: 'transparent', color: FR.soil, cursor: 'pointer', display: 'flex' }}>
                <GitBranch size={10} />
              </button>
            )}
            <button onClick={e => { e.stopPropagation(); onDuplicate(pack.id); }} title="Duplicate"
              style={{ padding: 2, border: 'none', background: 'transparent', color: FR.stone, cursor: 'pointer', display: 'flex' }}>
              <Copy size={10} />
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete(pack.id); }} title="Delete"
              style={{ padding: 2, border: 'none', background: 'transparent', color: FR.stone, cursor: 'pointer', display: 'flex' }}>
              <Trash2 size={10} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Grid view card — same information as KanbanCard minus the drag affordance.
// Status shows as a colored dot + label since the grid has no columns to
// communicate lifecycle. Click anywhere on the card body opens the builder.
function GridCard({ pack, onOpen, onDuplicate, onDelete, onCreateVariant }) {
  const normalizedStatus = (() => {
    let st = pack.status || 'Design';
    if (st === 'Development') st = 'Design';
    if (st === 'Completed') st = 'Released';
    return STATUSES.includes(st) ? st : 'Design';
  })();
  const statusColor = STATUS_COLORS[normalizedStatus] || STATUS_COLORS.Design;

  return (
    <div
      style={{
        background: 'white', borderRadius: 8,
        border: `1px solid ${FR.sand}`, position: 'relative',
        transition: 'box-shadow 0.15s, transform 0.15s', overflow: 'hidden',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
        <CostPill amount={pack.total_unit_cost} currency={pack.currency || 'USD'} title="Total unit cost — BOM + colorways" />
      </div>
      <div onClick={() => onOpen(pack.id)} style={{ cursor: 'pointer', width: '100%', aspectRatio: '4 / 3', background: FR.salt, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderBottom: `1px solid ${FR.sand}` }}>
        {pack.cover_image
          ? <img src={pack.cover_image} alt={pack.style_name || 'Cover'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <Shirt size={32} style={{ color: FR.sand }} />}
      </div>
      <div style={{ padding: 12 }}>
        <div onClick={() => onOpen(pack.id)} style={{ cursor: 'pointer' }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: FR.slate, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pack.style_name || 'Untitled'}
          </div>
          <div style={{ fontSize: 10, color: FR.stone, marginTop: 2 }}>{pack.product_category || '—'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: statusColor.dot, flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: FR.slate, fontWeight: 600, letterSpacing: 0.3 }}>{normalizedStatus}</span>
          <span style={{ fontSize: 9, color: FR.stone, marginLeft: 'auto' }}>{formatDate(pack.updated_at)}</span>
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: FR.stone, marginBottom: 2 }}>
            <span>{pack.completion_pct || 0}% complete</span>
          </div>
          <div style={{ width: '100%', height: 3, background: FR.sand, borderRadius: 2 }}>
            <div style={{ width: `${pack.completion_pct || 0}%`, height: '100%', background: FR.soil, borderRadius: 2 }} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 10, borderTop: `1px solid ${FR.sand}`, paddingTop: 8 }}>
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
  // Default view = grid. Persist the user's choice so the tab remembers it.
  const [view, setView] = useState(() => {
    try { return localStorage.getItem(VIEW_STORAGE_KEY) === 'kanban' ? 'kanban' : 'grid'; }
    catch { return 'grid'; }
  });
  const switchView = (next) => {
    setView(next);
    try { localStorage.setItem(VIEW_STORAGE_KEY, next); } catch { /* ignore */ }
  };

  const refresh = async () => {
    setLoading(true);
    // listComponentPacks still runs so the dual-write mirrors are warm, but
    // the supplier dropdown pulls from the unified PLM directory that merges
    // tech packs + trim packs + Supabase projections + manually-added entries.
    const [rows, , suppliers] = await Promise.all([
      listTechPacks(),
      listComponentPacks(),
      listAllSuppliers(),
    ]);
    setPacks(rows || []);
    setExistingSuppliers(suppliers);
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

  const viewPill = (active) => ({
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '6px 10px',
    background: active ? FR.slate : 'transparent',
    color: active ? FR.salt : FR.stone,
    border: `1px solid ${active ? FR.slate : FR.sand}`,
    borderRadius: 6, fontSize: 11, fontWeight: active ? 600 : 400,
    cursor: 'pointer', fontFamily: "'Inter', sans-serif",
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, margin: 0 }}>
            {view === 'grid' ? 'Styles' : 'Product Pipeline'}
          </h3>
          <p style={{ fontSize: 12, marginTop: 2, color: FR.stone }}>
            {view === 'grid'
              ? 'Every tech pack as a card. Click to open.'
              : 'Drag tech packs through stages. Click a card to open it.'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', gap: 4, marginRight: 6 }}>
            <button onClick={() => switchView('grid')} style={viewPill(view === 'grid')} title="Grid view">
              <LayoutGrid size={12} /> Grid
            </button>
            <button onClick={() => switchView('kanban')} style={viewPill(view === 'kanban')} title="Kanban pipeline">
              <Columns3 size={12} /> Kanban
            </button>
          </div>
          <button onClick={createNew}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, fontSize: 11, background: FR.slate, color: FR.salt, border: 'none', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
            <Plus size={14} /> New Tech Pack
          </button>
        </div>
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

      {!loading && packs.length > 0 && view === 'grid' && (
        filtered.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', background: FR.salt, border: `1px dashed ${FR.sand}`, borderRadius: 8, color: FR.stone, fontSize: 12 }}>
            No styles match the current search / filter.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {filtered.map(p => (
              <GridCard key={p.id} pack={p}
                onOpen={openPack} onDuplicate={onDuplicate} onDelete={onDelete} onCreateVariant={onCreateVariant} />
            ))}
          </div>
        )
      )}

      {!loading && packs.length > 0 && view === 'kanban' && (
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
