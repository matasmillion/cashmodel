// Fabrics list — card grid + kanban pipeline of every base fabric in
// the library. Default view is the grid; the user can flip to kanban
// (grouped by status) to see what's still in draft vs. testing vs.
// approved. Choice is persisted in localStorage.
//
// Each card carries a 2:3 portrait hero image (uploaded via CropModal
// in FabricBuilder). When no cover_image is set the hero falls back to
// a soft swatch tinted by the fabric's base color.

// eslint-disable-next-line no-unused-vars
import * as _atomTypes from '../../types/atoms';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, MoreVertical, Copy, Archive, RotateCcw, Layers, LayoutGrid, Columns3 } from 'lucide-react';
import { FR } from './techPackConstants';
import { getFRColor } from '../../utils/colorLibrary';
import { parsePLMHash, setPLMHash } from '../../utils/plmRouting';
import {
  listFabrics, createFabric, getFabric,
  archiveFabric, restoreFabric, duplicateFabric,
  seedFabricsIfEmpty, saveFabric,
} from '../../utils/fabricStore';
import { FABRIC_WEAVES, FABRIC_WEAVE_LABEL } from '../../utils/fabricLibrary';
import FabricBuilder from './FabricBuilder';

const VIEW_STORAGE_KEY = 'cashmodel_fabrics_view';

const STATUS_PILL = {
  draft:    { bg: 'rgba(116,116,116,0.10)', fg: '#5A5A5A', label: 'Draft' },
  testing:  { bg: 'rgba(133,79,11,0.12)',   fg: '#854F0B', label: 'Testing' },
  approved: { bg: 'rgba(99,153,34,0.12)',   fg: '#3B6D11', label: 'Approved' },
  archived: { bg: 'rgba(58,58,58,0.06)',    fg: '#9A9A9A', label: 'Archived' },
};

const PIPELINE_STATUSES = ['draft', 'testing', 'approved'];

const PIPELINE_COLORS = {
  draft:    { bg: '#F5F0E8', border: '#EBE5D5', dot: '#9A816B' },
  testing:  { bg: '#FAF1E0', border: '#EFD9B7', dot: '#C58A2D' },
  approved: { bg: '#EDEFED', border: '#D0D6CE', dot: '#4CAF7D' },
};

function StatusPill({ status }) {
  const s = STATUS_PILL[status] || STATUS_PILL.draft;
  return (
    <span style={{ background: s.bg, color: s.fg, padding: '4px 9px', borderRadius: 5, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

function StatRow({ label, value }) {
  return (
    <>
      <span style={{ color: FR.stone }}>{label}</span>
      <span style={{ color: FR.slate, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </>
  );
}

function formatSince(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); }
  catch { return '—'; }
}

function Hero({ fabric }) {
  const swatchHex = (fabric.color_id ? getFRColor(fabric.color_id)?.hex : null) || FR.salt;
  if (fabric.cover_image) {
    return (
      <div style={{ width: '100%', aspectRatio: '2 / 3', overflow: 'hidden' }}>
        <img src={fabric.cover_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    );
  }
  return (
    <div style={{
      width: '100%', aspectRatio: '2 / 3',
      background: swatchHex,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderBottom: `0.5px solid ${FR.sand}`,
    }}>
      <Layers size={36} style={{ color: 'rgba(58,58,58,0.25)' }} />
    </div>
  );
}

function GridCard({ fabric, onOpen, onMenu, menuOpen, onMenuClose, onArchive, onRestore, onDuplicate }) {
  const status = fabric.status || 'draft';
  const weight = fabric.weight_gsm ? `${fabric.weight_gsm} gsm` : '—';
  const price = fabric.price_per_yard_usd
    ? `$${Number(fabric.price_per_yard_usd).toFixed(2)} / yd`
    : '—';
  const lead = fabric.lead_time_days ? `${fabric.lead_time_days} days` : '—';
  const mill = fabric.mill_id || '—';
  const composition = fabric.composition
    ? (fabric.composition.length > 30 ? `${fabric.composition.slice(0, 30)}…` : fabric.composition)
    : '—';

  return (
    <div
      onClick={() => onOpen(fabric.id)}
      style={{
        background: '#fff',
        border: '0.5px solid rgba(58,58,58,0.15)',
        borderRadius: 8,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
    >
      <Hero fabric={fabric} />
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: FR.slate, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fabric.name || 'Untitled fabric'}
          </div>
          <StatusPill status={status} />
        </div>
        <div style={{ fontSize: 10, color: FR.stone, marginTop: 4, marginBottom: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
          {fabric.code} · {FABRIC_WEAVE_LABEL[fabric.weave] || fabric.weave}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', columnGap: 8, rowGap: 4, fontSize: 11, lineHeight: 1.3 }}>
          <StatRow label="Comp"   value={composition} />
          <StatRow label="Weight" value={weight} />
          <StatRow label="Mill"   value={mill} />
          <StatRow label="Price"  value={price} />
          <StatRow label="Lead"   value={lead} />
          <StatRow label="Since"  value={formatSince(fabric.created_at)} />
        </div>
        <button
          aria-label="Card menu"
          onClick={e => { e.stopPropagation(); onMenu(fabric.id); }}
          style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,0.85)', border: 'none', color: FR.stone, cursor: 'pointer', padding: 4, borderRadius: 4 }}
        >
          <MoreVertical size={14} />
        </button>
      </div>

      {menuOpen && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: 'absolute', top: 36, right: 14, background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.08)', minWidth: 160, zIndex: 5 }}
        >
          <MenuItem icon={Copy} label="Duplicate" onClick={() => { onMenuClose(); onDuplicate(fabric.id); }} />
          {status === 'archived'
            ? <MenuItem icon={RotateCcw} label="Restore" onClick={() => { onMenuClose(); onRestore(fabric.id); }} />
            : <MenuItem icon={Archive}   label="Archive" onClick={() => { onMenuClose(); onArchive(fabric.id); }} />
          }
        </div>
      )}
    </div>
  );
}

function KanbanCard({ fabric, onOpen, onDragStart, onDragEnd }) {
  const swatchHex = (fabric.color_id ? getFRColor(fabric.color_id)?.hex : null) || FR.salt;
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', fabric.id); onDragStart?.(fabric.id); }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(fabric.id)}
      style={{
        background: '#fff',
        border: '0.5px solid rgba(58,58,58,0.15)',
        borderRadius: 6,
        marginBottom: 6,
        padding: 8,
        cursor: 'grab',
        position: 'relative',
        overflow: 'hidden',
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ width: 44, height: 66, flexShrink: 0, background: swatchHex, borderRadius: 4, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `0.5px solid ${FR.sand}` }}>
          {fabric.cover_image && <img src={fabric.cover_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 14, color: FR.slate, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fabric.name || 'Untitled fabric'}
          </div>
          <div style={{ fontSize: 10, color: FR.stone, marginTop: 2, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fabric.code} · {FABRIC_WEAVE_LABEL[fabric.weave] || fabric.weave}
          </div>
          <div style={{ fontSize: 10, color: FR.stone, marginTop: 2 }}>
            {fabric.weight_gsm ? `${fabric.weight_gsm} gsm` : '—'} · {fabric.mill_id || '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({ status, fabrics, onOpen, onDrop, dragOverStatus, setDragOverStatus, onDragStart, onDragEnd }) {
  const colors = PIPELINE_COLORS[status] || PIPELINE_COLORS.draft;
  const isOver = dragOverStatus === status;
  const label = (STATUS_PILL[status] || STATUS_PILL.draft).label;
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
        <span style={{ fontSize: 11, fontWeight: 600, color: FR.slate, letterSpacing: 0.3 }}>{label}</span>
        <span style={{ fontSize: 10, color: FR.stone, marginLeft: 'auto' }}>{fabrics.length}</span>
      </div>
      <div style={{ minHeight: 60 }}>
        {fabrics.map(p => (
          <KanbanCard key={p.id} fabric={p}
            onOpen={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} />
        ))}
      </div>
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', borderBottom: '0.5px solid rgba(58,58,58,0.06)', fontSize: 12, color: FR.slate, cursor: 'pointer', textAlign: 'left' }}
    >
      <Icon size={13} /> {label}
    </button>
  );
}

export default function FabricList() {
  const [rows, setRows] = useState([]);
  const [active, setActive] = useState(null);
  const [query, setQuery] = useState('');
  const [weaveFilter, setWeaveFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [menuFor, setMenuFor] = useState(null);
  const [creating, setCreating] = useState(false);
  const [picker, setPicker] = useState(false);
  const [view, setView] = useState(() => {
    try { return localStorage.getItem(VIEW_STORAGE_KEY) === 'kanban' ? 'kanban' : 'grid'; }
    catch { return 'grid'; }
  });
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const pickerRef = useRef(null);

  const switchView = (next) => {
    setView(next);
    try { localStorage.setItem(VIEW_STORAGE_KEY, next); } catch { /* ignore */ }
  };

  const refresh = async () => {
    await seedFabricsIfEmpty();
    const list = await listFabrics({ includeArchived: true });
    setRows(list);
  };

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const { layer, atom, packId } = parsePLMHash();
      if (layer !== 'library' || atom !== 'fabrics') return;
      if (packId && active?.id === packId) return;
      if (!packId && active) { setActive(null); return; }
      if (packId) {
        const full = await getFabric(packId);
        if (cancelled) return;
        if (full) setActive(full);
        else setPLMHash({ layer: 'library', atom: 'fabrics' });
      }
    };
    sync();
    const onHash = () => sync();
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, [active?.id]);

  useEffect(() => {
    if (!picker) return;
    const onDoc = (e) => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setPicker(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [picker]);

  const open = async (id) => {
    const full = await getFabric(id);
    if (full) {
      setActive(full);
      setPLMHash({ layer: 'library', atom: 'fabrics', packId: id });
    }
  };

  const closeBuilder = async () => {
    setActive(null);
    setPLMHash({ layer: 'library', atom: 'fabrics' });
    refresh();
  };

  const newFabric = async (weave) => {
    setPicker(false);
    setCreating(true);
    try {
      const row = await createFabric({ weave, status: 'draft' });
      setActive(row);
      setPLMHash({ layer: 'library', atom: 'fabrics', packId: row.id });
    } finally {
      setCreating(false);
    }
  };

  const onArchive   = async (id) => { await archiveFabric(id); refresh(); };
  const onRestore   = async (id) => { await restoreFabric(id); refresh(); };
  const onDuplicate = async (id) => { const c = await duplicateFabric(id); if (c) refresh(); };

  const onKanbanDrop = async (id, newStatus) => {
    const row = rows.find(r => r.id === id);
    if (!row || row.status === newStatus) return;
    setRows(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    await saveFabric(id, { status: newStatus });
  };

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (!showArchived && r.status === 'archived') return false;
      if (weaveFilter !== 'all' && r.weave !== weaveFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        const hit = (r.name || '').toLowerCase().includes(q)
          || (r.code || '').toLowerCase().includes(q)
          || (r.composition || '').toLowerCase().includes(q)
          || (r.mill_id || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [rows, query, weaveFilter, showArchived]);

  const columns = useMemo(() => {
    const out = {};
    PIPELINE_STATUSES.forEach(s => { out[s] = []; });
    filtered.forEach(r => {
      let st = r.status || 'draft';
      if (!PIPELINE_STATUSES.includes(st)) return;
      out[st].push(r);
    });
    return out;
  }, [filtered]);

  if (active) {
    return <FabricBuilder fabric={active} onBack={closeBuilder} />;
  }

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
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 26, margin: 0 }}>
            {view === 'grid' ? 'Fabric library' : 'Fabric pipeline'}
          </h3>
          <p style={{ color: FR.stone, fontSize: 12, margin: '4px 0 0' }}>
            {view === 'grid'
              ? 'Composition, weight, hand, mill, lead time — every base fabric the line uses.'
              : 'Drag fabrics through stages. Click a card to open it.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative', flexWrap: 'wrap' }} ref={pickerRef}>
          <div style={{ display: 'flex', gap: 4, marginRight: 4 }}>
            <button onClick={() => switchView('grid')} style={viewPill(view === 'grid')} title="Grid view">
              <LayoutGrid size={12} /> Grid
            </button>
            <button onClick={() => switchView('kanban')} style={viewPill(view === 'kanban')} title="Kanban pipeline">
              <Columns3 size={12} /> Kanban
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: `1px solid ${FR.sand}`, borderRadius: 6, background: '#fff' }}>
            <Search size={12} style={{ color: FR.stone }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search…"
              style={{ border: 'none', outline: 'none', fontSize: 12, color: FR.slate, background: 'transparent', width: 140 }}
            />
          </div>
          <select
            value={weaveFilter}
            onChange={e => setWeaveFilter(e.target.value)}
            style={{ padding: '6px 10px', border: `1px solid ${FR.sand}`, borderRadius: 6, fontSize: 12, color: FR.slate, background: '#fff' }}
          >
            <option value="all">All weaves</option>
            {FABRIC_WEAVES.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
          {view === 'grid' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: FR.stone, cursor: 'pointer' }}>
              <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
              Archived
            </label>
          )}
          <button
            disabled={creating}
            onClick={() => setPicker(p => !p)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.6 : 1, whiteSpace: 'nowrap' }}
          >
            <Plus size={13} /> Add fabric
          </button>
          {picker && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.08)', minWidth: 200, zIndex: 10, maxHeight: 320, overflowY: 'auto' }}>
              {FABRIC_WEAVES.map(w => (
                <button
                  key={w.id}
                  onClick={() => newFabric(w.id)}
                  style={{ display: 'block', width: '100%', padding: '8px 14px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '0.5px solid rgba(58,58,58,0.06)', fontSize: 12, color: FR.slate, cursor: 'pointer' }}
                >
                  {w.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: '60px 24px', textAlign: 'center', background: FR.salt, border: `1px dashed ${FR.sand}`, borderRadius: 8 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: FR.slate }}>No fabrics yet</div>
          <div style={{ fontSize: 12, color: FR.stone, marginTop: 8, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
            Every base fabric you qualify becomes a permanent library asset.
          </div>
          <button
            disabled={creating}
            onClick={() => setPicker(p => !p)}
            style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.6 : 1 }}
          >
            <Plus size={13} /> Add fabric
          </button>
        </div>
      ) : view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {filtered.map(r => (
            <GridCard
              key={r.id}
              fabric={r}
              onOpen={open}
              onMenu={(id) => setMenuFor(menuFor === id ? null : id)}
              menuOpen={menuFor === r.id}
              onMenuClose={() => setMenuFor(null)}
              onArchive={onArchive}
              onRestore={onRestore}
              onDuplicate={onDuplicate}
            />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
          {PIPELINE_STATUSES.map(status => (
            <KanbanColumn
              key={status}
              status={status}
              fabrics={columns[status]}
              onOpen={open}
              onDrop={onKanbanDrop}
              dragOverStatus={dragOverStatus}
              setDragOverStatus={setDragOverStatus}
            />
          ))}
        </div>
      )}
    </div>
  );
}
