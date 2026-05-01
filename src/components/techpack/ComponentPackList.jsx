// PLM Trims view — two displays, one default.
//   • Grid: flat card layout, mirrors the Styles / Colors tabs.
//   • Kanban: drag trims through the 3-stage lifecycle (Design /
//     Sample / Production-Ready).
// The grid is the default; the choice is persisted in localStorage so the
// tab remembers which view the user prefers.

import { useEffect, useState } from 'react';
import { Plus, Boxes, Copy, Trash2, Search, Package, LayoutGrid, Columns3 } from 'lucide-react';
import PackTrashView from './PackTrashView';
import { FR, DEFAULT_COMPONENT_DATA, STATUSES, LEGACY_STATUS_MIGRATION } from './componentPackConstants';
import ComponentPackBuilder from './ComponentPackBuilder';
import { CostPill } from './TechPackPrimitives';
import SendToVendorButton from './SendToVendorButton';
import { listComponentPacks, createComponentPack, getComponentPack, deleteComponentPack, duplicateComponentPack, saveComponentPack, listDeletedComponentPacks, restoreComponentPack, purgeComponentPack } from '../../utils/componentPackStore';
import { parsePLMHash, setPLMHash } from '../../utils/plmRouting';
import { listAllSuppliers, listAllPeople, listAllTrimTypes } from '../../utils/plmDirectory';
import { resolveCoverImage } from '../../utils/plmAssets';

const VIEW_STORAGE_KEY = 'cashmodel_trims_view';

// Kanban stage palette. Keeps the visual rhythm of the Styles pipeline
// (earth tones for early stages, green for the shipped end).
const STATUS_COLORS = {
  Design:             { bg: '#F5F0E8', border: '#EBE5D5', dot: '#9A816B' },
  Sample:             { bg: '#F0F4F7', border: '#D4E1EA', dot: '#B5C7D3' },
  'Production-Ready': { bg: '#EDEFED', border: '#D0D6CE', dot: '#4CAF7D' },
};

function formatDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return ''; }
}

// cover_image column may hold a legacy data: URL (renders directly) or a
// Storage path (resolves to a signed URL on demand). resolveCoverImage
// handles both; the resolved URL is cached at the helper level so revisits
// in the same session don't re-sign.
function Thumb({ pack }) {
  const cover = pack.cover_image;
  // Inline values (data: URLs and absolute URLs) are renderable directly —
  // only Storage paths need the async signed-URL resolution below.
  const inlineSrc = (typeof cover === 'string' && (cover.startsWith('data:') || /^https?:\/\//i.test(cover))) ? cover : '';
  const [resolvedSrc, setResolvedSrc] = useState('');
  useEffect(() => {
    if (!cover || inlineSrc) return undefined;
    let cancelled = false;
    resolveCoverImage(cover).then(url => { if (!cancelled && url) setResolvedSrc(url); });
    return () => { cancelled = true; };
  }, [cover, inlineSrc]);
  const src = inlineSrc || resolvedSrc;

  if (src) {
    return <img src={src} alt={pack.component_name || 'Trim'}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  }
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: FR.salt }}>
      <Package size={26} style={{ color: FR.sand }} />
    </div>
  );
}

// Grid-view card — a trim shown as a standalone card with thumbnail,
// name, supplier, status dot, cost pill, and the usual actions.
function GridCard({ pack, onOpen, onDuplicate, onDelete, duplicating }) {
  const normalizedStatus = (() => {
    let st = pack.status || 'Design';
    if (LEGACY_STATUS_MIGRATION[st]) st = LEGACY_STATUS_MIGRATION[st];
    return STATUSES.includes(st) ? st : 'Design';
  })();
  const statusColor = STATUS_COLORS[normalizedStatus] || STATUS_COLORS.Design;

  return (
    <div
      style={{ background: 'white', borderRadius: 8, border: `1px solid ${FR.sand}`, overflow: 'hidden', position: 'relative', transition: 'box-shadow 0.15s, transform 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
        <CostPill amount={pack.cost_per_unit} currency={pack.currency || 'USD'} title="Unit cost at MOQ" />
      </div>
      <div onClick={() => onOpen(pack.id)} style={{ cursor: 'pointer', width: '100%', aspectRatio: '1 / 1', borderBottom: `1px solid ${FR.sand}` }}>
        <Thumb pack={pack} />
      </div>
      <div style={{ padding: 10 }}>
        <div onClick={() => onOpen(pack.id)} style={{ cursor: 'pointer' }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 14, color: FR.slate, fontWeight: 500, lineHeight: 1.2, minHeight: 34, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {pack.component_name || 'Untitled'}
          </div>
          {pack.supplier && <div style={{ fontSize: 10, color: FR.stone, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🏭 {pack.supplier}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: statusColor.dot, flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: FR.slate, fontWeight: 600, letterSpacing: 0.3 }}>{normalizedStatus}</span>
          <span style={{ fontSize: 9, color: FR.stone, marginLeft: 'auto' }}>{formatDate(pack.updated_at)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 8, borderTop: `1px solid ${FR.sand}`, paddingTop: 6 }}>
          <SendToVendorButton vendorName={pack.supplier} styleId={pack.id} variant="card" />
          <button onClick={e => { e.stopPropagation(); onDuplicate(pack.id); }} disabled={duplicating}
            title={duplicating ? 'Duplicating…' : 'Duplicate'}
            style={{ padding: 4, border: 'none', background: 'transparent', color: FR.stone, cursor: duplicating ? 'wait' : 'pointer', opacity: duplicating ? 0.5 : 1 }}>
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

// Compact Kanban card — horizontal layout so a typical desktop column
// comfortably fits 5+ cards. Same info as the grid card, denser.
function KanbanCard({ pack, onOpen, onDuplicate, onDelete, onDragStart, onDragEnd, duplicating }) {
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
          <Thumb pack={pack} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <div style={{ flex: 1, minWidth: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 13, color: FR.slate, fontWeight: 500, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pack.component_name || 'Untitled'}
            </div>
            <CostPill amount={pack.cost_per_unit} currency={pack.currency || 'USD'} title="Unit cost at MOQ" />
          </div>
          <div style={{ fontSize: 9, color: FR.stone, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pack.supplier ? `🏭 ${pack.supplier}` : '—'} · {formatDate(pack.updated_at)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
            <button onClick={e => { e.stopPropagation(); onDuplicate(pack.id); }} disabled={duplicating}
              title={duplicating ? 'Duplicating…' : 'Duplicate'}
              style={{ padding: 2, border: 'none', background: 'transparent', color: FR.stone, cursor: duplicating ? 'wait' : 'pointer', display: 'flex', opacity: duplicating ? 0.5 : 1 }}>
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

function KanbanColumn({ status, packs, onOpen, onDuplicate, onDelete, onDragStart, onDragEnd, onDrop, dragOverStatus, setDragOverStatus, duplicatingId }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.Design;
  const isOver = dragOverStatus === status;
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOverStatus(status); }}
      onDragLeave={() => setDragOverStatus(null)}
      onDrop={e => { e.preventDefault(); setDragOverStatus(null); const id = e.dataTransfer.getData('text/plain'); onDrop(id, status); }}
      style={{
        flex: 1, minWidth: 240, maxWidth: 380,
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
          <KanbanCard key={p.id} pack={p}
            onOpen={onOpen} onDuplicate={onDuplicate} onDelete={onDelete}
            onDragStart={onDragStart} onDragEnd={onDragEnd}
            duplicating={duplicatingId === p.id} />
        ))}
      </div>
    </div>
  );
}

export default function ComponentPackList() {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePack, setActivePack] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [existingSuppliers, setExistingSuppliers] = useState([]);
  const [existingPeople, setExistingPeople] = useState([]);
  const [existingTrimTypes, setExistingTrimTypes] = useState([]);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [duplicatingId, setDuplicatingId] = useState(null);
  const [showTrash, setShowTrash] = useState(false);

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
    const [rows, suppliers, people] = await Promise.all([
      listComponentPacks(),
      listAllSuppliers(),
      listAllPeople(),
    ]);
    setPacks(rows || []);
    setExistingSuppliers(suppliers);
    setExistingPeople(people);
    setExistingTrimTypes(listAllTrimTypes());
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

  // Optimistic duplicate: project the freshly written local row into the
  // visible list immediately. The cloud insert continues in the background;
  // a subsequent refresh (or next mount) will reconcile with the canonical
  // Supabase view if anything diverges. Guarded against double-clicks.
  const onDuplicate = async (id) => {
    if (duplicatingId) return;
    setDuplicatingId(id);
    try {
      const copy = await duplicateComponentPack(id);
      if (!copy) { refresh(); return; }
      const projected = {
        id: copy.id,
        component_name: copy.component_name || copy.data?.componentName || '',
        component_category: copy.data?.componentCategory || '',
        status: copy.data?.status || 'Design',
        supplier: copy.data?.supplier || '',
        cost_per_unit: copy.cost_per_unit || copy.data?.costTiers?.[0]?.unitCost || copy.data?.targetUnitCost || copy.data?.costPerUnit || '',
        currency: copy.data?.currency || 'USD',
        cover_image: copy.cover_image,
        updated_at: copy.updated_at,
        created_at: copy.created_at,
      };
      setPacks(prev => [projected, ...prev]);
    } finally {
      setDuplicatingId(null);
    }
  };
  const onDelete = async (id) => { if (!confirm('Delete this trim?')) return; await deleteComponentPack(id); refresh(); };
  const closeBuilder = async () => {
    setActivePack(null);
    setPLMHash({ section: 'components' });
    refresh();
  };

  // Drag-to-update: optimistic local patch, then persist through the
  // shared save path so the status change survives a reload / cloud sync.
  const onDrop = async (id, newStatus) => {
    setDraggingId(null);
    const pack = packs.find(p => p.id === id);
    if (!pack) return;
    const currentStatus = LEGACY_STATUS_MIGRATION[pack.status] || pack.status || 'Design';
    if (currentStatus === newStatus) return;

    setPacks(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p));

    const full = await getComponentPack(id);
    if (full) {
      const updatedData = { ...(full.data || {}), status: newStatus };
      await saveComponentPack(id, { data: updatedData, status: newStatus });
    }
  };

  if (activePack) {
    return <ComponentPackBuilder pack={activePack} onBack={closeBuilder} existingSuppliers={existingSuppliers} existingPeople={existingPeople} existingTrimTypes={existingTrimTypes} />;
  }

  // Filter by search.
  const q = searchQuery.toLowerCase();
  const filtered = packs.filter(p => {
    if (!q) return true;
    return (p.component_name || '').toLowerCase().includes(q)
      || (p.component_category || '').toLowerCase().includes(q)
      || (p.supplier || '').toLowerCase().includes(q);
  });

  // Group by status for the Kanban view.
  const columns = {};
  STATUSES.forEach(s => { columns[s] = []; });
  filtered.forEach(p => {
    let st = p.status || 'Design';
    if (LEGACY_STATUS_MIGRATION[st]) st = LEGACY_STATUS_MIGRATION[st];
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
            {view === 'grid' ? 'Trim Library' : 'Trim Pipeline'}
          </h3>
          <p style={{ fontSize: 12, marginTop: 2, color: FR.stone }}>
            {view === 'grid'
              ? 'Reusable fabrics, zippers, trims, and labels. Click a card to open it.'
              : 'Drag trims through stages. Click a card to open it.'}
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
          <button onClick={() => setShowTrash(true)}
            title="Recently deleted trims"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 6, fontSize: 11, background: 'transparent', color: FR.stone, border: `0.5px solid ${FR.sand}`, cursor: 'pointer' }}>
            <Trash2 size={12} /> Trash
          </button>
          <button onClick={createNew}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, fontSize: 11, background: FR.slate, color: FR.salt, border: 'none', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
            <Plus size={14} /> New Trim
          </button>
        </div>
      </div>

      {packs.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: 8, color: FR.stone }} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search trims, vendors, categories…"
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

      {!loading && packs.length > 0 && view === 'grid' && (
        filtered.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', background: FR.salt, border: `1px dashed ${FR.sand}`, borderRadius: 8, color: FR.stone, fontSize: 12 }}>
            No trims match the current search.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {filtered.map(p => (
              <GridCard key={p.id} pack={p}
                onOpen={openPack} onDuplicate={onDuplicate} onDelete={onDelete}
                duplicating={duplicatingId === p.id} />
            ))}
          </div>
        )
      )}

      {!loading && packs.length > 0 && view === 'kanban' && (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
          {STATUSES.map(status => (
            <KanbanColumn key={status} status={status} packs={columns[status]}
              onOpen={openPack} onDuplicate={onDuplicate} onDelete={onDelete}
              onDragStart={setDraggingId} onDragEnd={() => setDraggingId(null)}
              onDrop={onDrop} dragOverStatus={dragOverStatus} setDragOverStatus={setDragOverStatus}
              duplicatingId={duplicatingId} />
          ))}
        </div>
      )}
      {showTrash && (
        <PackTrashView
          title="Trash · Recently deleted trims"
          emptyHint="No trims in the trash. Anything you delete will land here."
          list={listDeletedComponentPacks}
          restore={restoreComponentPack}
          purge={purgeComponentPack}
          nameOf={r => r.component_name}
          onClose={() => { setShowTrash(false); refresh(); }}
        />
      )}
    </div>
  );
}
