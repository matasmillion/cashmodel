// Component Pack Kanban — drag-and-drop component specs through lifecycle stages

import { useEffect, useState } from 'react';
import { Plus, Boxes, Copy, Trash2, GripVertical, Search } from 'lucide-react';
import { FR, STATUSES, DEFAULT_COMPONENT_DATA } from './componentPackConstants';
import ComponentPackBuilder from './ComponentPackBuilder';
import { listComponentPacks, createComponentPack, getComponentPack, deleteComponentPack, duplicateComponentPack, saveComponentPack } from '../../utils/componentPackStore';

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

function ComponentCard({ pack, onOpen, onDuplicate, onDelete, onDragStart, onDragEnd }) {
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', pack.id); onDragStart(pack.id); }}
      onDragEnd={onDragEnd}
      style={{ background: 'white', borderRadius: 8, padding: 12, marginBottom: 8, border: `1px solid ${FR.sand}`, cursor: 'grab', transition: 'box-shadow 0.15s, transform 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <GripVertical size={12} style={{ color: FR.sand, marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div onClick={() => onOpen(pack.id)} style={{ cursor: 'pointer' }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 15, color: FR.slate, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pack.component_name || 'Untitled'}
            </div>
            <div style={{ fontSize: 10, color: FR.stone, marginTop: 2 }}>{pack.component_category || '—'}</div>
            {pack.supplier && <div style={{ fontSize: 9, color: FR.stone, marginTop: 2 }}>🏭 {pack.supplier}</div>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 9, color: FR.stone }}>
            {pack.cost_per_unit ? <span>{pack.currency || 'USD'} {pack.cost_per_unit}</span> : <span>—</span>}
            <span>{formatDate(pack.updated_at)}</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 6 }}>
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
  );
}

function ComponentColumn({ status, packs, onOpen, onDuplicate, onDelete, onDragStart, onDragEnd, onDrop, dragOverStatus, setDragOverStatus }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.Design;
  const isOver = dragOverStatus === status;
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOverStatus(status); }}
      onDragLeave={() => setDragOverStatus(null)}
      onDrop={e => { e.preventDefault(); setDragOverStatus(null); const id = e.dataTransfer.getData('text/plain'); onDrop(id, status); }}
      style={{ flex: 1, minWidth: 180, maxWidth: 240, background: isOver ? colors.border : colors.bg, borderRadius: 10, padding: 10, border: `1px solid ${isOver ? FR.soil : colors.border}`, transition: 'background 0.15s, border-color 0.15s' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, padding: '0 4px' }}>
        <div style={{ width: 8, height: 8, borderRadius: 4, background: colors.dot }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: FR.slate, letterSpacing: 0.3 }}>{status}</span>
        <span style={{ fontSize: 10, color: FR.stone, marginLeft: 'auto' }}>{packs.length}</span>
      </div>
      <div style={{ minHeight: 60 }}>
        {packs.map(p => (
          <ComponentCard key={p.id} pack={p} onOpen={onOpen} onDuplicate={onDuplicate} onDelete={onDelete}
            onDragStart={onDragStart} onDragEnd={onDragEnd} />
        ))}
      </div>
    </div>
  );
}

export default function ComponentPackList() {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePack, setActivePack] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const refresh = async () => {
    setLoading(true);
    const rows = await listComponentPacks();
    setPacks(rows || []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const openPack = async (id) => {
    const full = await getComponentPack(id);
    if (full) setActivePack(full);
  };

  const createNew = async () => {
    const row = await createComponentPack(DEFAULT_COMPONENT_DATA);
    setActivePack(row);
  };

  const onDuplicate = async (id) => { await duplicateComponentPack(id); refresh(); };
  const onDelete = async (id) => { if (!confirm('Delete this component pack?')) return; await deleteComponentPack(id); refresh(); };

  const onDrop = async (id, newStatus) => {
    setDraggingId(null);
    const pack = packs.find(p => p.id === id);
    if (!pack || pack.status === newStatus) return;
    setPacks(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p));
    const full = await getComponentPack(id);
    if (full) {
      const updatedData = { ...(full.data || {}), status: newStatus };
      await saveComponentPack(id, { data: updatedData, status: newStatus });
    }
  };

  const closeBuilder = async () => { setActivePack(null); refresh(); };

  if (activePack) return <ComponentPackBuilder pack={activePack} onBack={closeBuilder} />;

  const q = searchQuery.toLowerCase();
  const allCats = [...new Set(packs.map(p => p.component_category).filter(Boolean))];
  const filtered = packs.filter(p => {
    if (q && !(p.component_name || '').toLowerCase().includes(q) && !(p.component_category || '').toLowerCase().includes(q) && !(p.supplier || '').toLowerCase().includes(q)) return false;
    if (filterCategory && p.component_category !== filterCategory) return false;
    return true;
  });

  const columns = {};
  STATUSES.forEach(s => { columns[s] = []; });
  filtered.forEach(p => {
    let st = p.status || 'Design';
    if (!columns[st]) st = 'Design';
    columns[st].push(p);
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, margin: 0 }}>Component Library</h3>
          <p className="text-sm mt-1" style={{ color: FR.stone }}>Spec sheets for fabrics, zippers, aglets, trims, and labels. Pull these into tech pack BOMs.</p>
        </div>
        <button onClick={createNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
          style={{ background: FR.slate, color: FR.salt, border: 'none', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
          <Plus size={14} /> New Component
        </button>
      </div>

      {packs.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 260 }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: 8, color: FR.stone }} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search components…"
              style={{ width: '100%', padding: '6px 8px 6px 28px', border: `1px solid ${FR.sand}`, borderRadius: 6, fontSize: 12, color: FR.slate, background: 'white', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {allCats.length > 1 && (
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              style={{ padding: '6px 8px', border: `1px solid ${FR.sand}`, borderRadius: 6, fontSize: 11, color: FR.slate, background: 'white' }}>
              <option value="">All types</option>
              {allCats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <span style={{ fontSize: 10, color: FR.stone }}>{filtered.length} of {packs.length}</span>
        </div>
      )}

      {loading && <p style={{ color: FR.stone, fontSize: 12 }}>Loading…</p>}

      {!loading && packs.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', background: 'white', border: `1px dashed ${FR.sand}`, borderRadius: 12 }}>
          <Boxes size={32} style={{ color: FR.stone, margin: '0 auto 12px', display: 'block' }} />
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, margin: 0, marginBottom: 8 }}>No components yet</h3>
          <p style={{ color: FR.stone, fontSize: 13, marginBottom: 16 }}>Create spec sheets for fabrics, zippers, and trims you use across multiple products.</p>
          <button onClick={createNew} style={{ padding: '8px 20px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
            + New Component
          </button>
        </div>
      )}

      {!loading && packs.length > 0 && (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
          {STATUSES.map(status => (
            <ComponentColumn key={status} status={status} packs={columns[status]}
              onOpen={openPack} onDuplicate={onDuplicate} onDelete={onDelete}
              onDragStart={setDraggingId} onDragEnd={() => setDraggingId(null)}
              onDrop={onDrop} dragOverStatus={dragOverStatus} setDragOverStatus={setDragOverStatus} />
          ))}
        </div>
      )}
    </div>
  );
}
