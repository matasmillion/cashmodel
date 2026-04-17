// PLM Kanban board — drag-and-drop tech packs through lifecycle stages
import { useEffect, useState, useRef } from 'react';
import { Plus, Shirt, Copy, Trash2, GripVertical } from 'lucide-react';
import { FR, DEFAULT_DATA, DEFAULT_LIBRARY, STATUSES } from './techPackConstants';
import TechPackBuilder from './TechPackBuilder';
import { listTechPacks, createTechPack, getTechPack, deleteTechPack, duplicateTechPack, saveTechPack } from '../../utils/techPackStore';

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

function KanbanCard({ pack, onOpen, onDuplicate, onDelete, onDragStart, onDragEnd }) {
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', pack.id); onDragStart(pack.id); }}
      onDragEnd={onDragEnd}
      style={{
        background: 'white', borderRadius: 8, padding: 12, marginBottom: 8,
        border: `1px solid ${FR.sand}`, cursor: 'grab',
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
    >
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

function KanbanColumn({ status, packs, onOpen, onDuplicate, onDelete, onDragStart, onDragEnd, onDrop, dragOverStatus, setDragOverStatus }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.Design;
  const isOver = dragOverStatus === status;

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOverStatus(status); }}
      onDragLeave={() => setDragOverStatus(null)}
      onDrop={e => { e.preventDefault(); setDragOverStatus(null); const id = e.dataTransfer.getData('text/plain'); onDrop(id, status); }}
      style={{
        flex: 1, minWidth: 180, maxWidth: 240,
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
            onDragStart={onDragStart} onDragEnd={onDragEnd} />
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

  const refresh = async () => {
    setLoading(true);
    const rows = await listTechPacks();
    setPacks(rows || []);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const openPack = async (id) => {
    const full = await getTechPack(id);
    if (full) setActivePack(full);
  };

  const createNew = async () => {
    const row = await createTechPack(DEFAULT_DATA, DEFAULT_LIBRARY);
    setActivePack(row);
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
    refresh();
  };

  if (activePack) {
    return <TechPackBuilder pack={activePack} onBack={closeBuilder} />;
  }

  // Group packs by status into columns
  const columns = {};
  STATUSES.forEach(s => { columns[s] = []; });
  packs.forEach(p => {
    // Normalize old status names
    let st = p.status || 'Design';
    if (st === 'Development') st = 'Design';
    if (st === 'Completed') st = 'Released';
    if (!columns[st]) st = 'Design';
    columns[st].push(p);
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 24, margin: 0 }}>Product Lifecycle</h2>
          <p className="text-sm mt-1" style={{ color: FR.stone }}>Drag tech packs through stages. Click a card to open it.</p>
        </div>
        <button onClick={createNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
          style={{ background: FR.slate, color: FR.salt, border: 'none', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
          <Plus size={14} /> New Tech Pack
        </button>
      </div>

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
              onOpen={openPack} onDuplicate={onDuplicate} onDelete={onDelete}
              onDragStart={setDraggingId} onDragEnd={() => setDraggingId(null)}
              onDrop={onDrop} dragOverStatus={dragOverStatus} setDragOverStatus={setDragOverStatus} />
          ))}
        </div>
      )}
    </div>
  );
}
