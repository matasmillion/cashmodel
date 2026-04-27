// Patterns list — card grid + kanban pipeline of every sloper / DXF
// block in the library. Default view is the grid; the user can flip to
// kanban (grouped by status) to see what's still in draft vs. testing
// vs. approved. Choice is persisted in localStorage.
//
// Each card carries a 2:3 portrait hero image (uploaded via CropModal
// in PatternBuilder). When no cover_image is set the hero falls back
// to a category-tinted placeholder so cards stay visually consistent.
//
// Clicking a card routes to `#product/library/patterns/<id>` and mounts
// PatternBuilder. Archived patterns are hidden by default — toggle the
// "Archived" checkbox to reveal them.

// eslint-disable-next-line no-unused-vars
import * as _atomTypes from '../../types/atoms';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, MoreVertical, Copy, Archive, RotateCcw, PenTool, LayoutGrid, Columns3 } from 'lucide-react';
import { FR } from './techPackConstants';
import { parsePLMHash, setPLMHash } from '../../utils/plmRouting';
import {
  listPatterns, createPattern, getPattern,
  archivePattern, restorePattern, duplicatePattern,
  seedPatternsIfEmpty, savePattern,
} from '../../utils/patternStore';
import { PATTERN_CATEGORIES, PATTERN_CATEGORY_LABEL, PATTERN_STATUSES } from '../../utils/patternLibrary';
import PatternBuilder from './PatternBuilder';

const VIEW_STORAGE_KEY = 'cashmodel_patterns_view';

const STATUS_PILL = {
  draft:    { bg: 'rgba(116,116,116,0.10)', fg: '#5A5A5A', label: 'Draft' },
  testing:  { bg: 'rgba(133,79,11,0.12)',   fg: '#854F0B', label: 'Testing' },
  approved: { bg: 'rgba(99,153,34,0.12)',   fg: '#3B6D11', label: 'Approved' },
  archived: { bg: 'rgba(58,58,58,0.06)',    fg: '#9A9A9A', label: 'Archived' },
};

// Pipeline columns shown in the kanban view. Archived rows are filtered
// out at the list level so the kanban only ever shows active work.
const PIPELINE_STATUSES = ['draft', 'testing', 'approved'];

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

// 2:3 portrait hero. Uses cover_image when set, otherwise a soft Salt
// background with the PenTool icon — keeps card sizing consistent.
function Hero({ src, height = 'auto' }) {
  if (src) {
    return (
      <div style={{ width: '100%', aspectRatio: '2 / 3', overflow: 'hidden' }}>
        <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    );
  }
  return (
    <div style={{
      width: '100%', aspectRatio: '2 / 3',
      background: FR.salt,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderBottom: `0.5px solid ${FR.sand}`,
    }}>
      <PenTool size={36} style={{ color: FR.sand }} />
    </div>
  );
}

function GridCard({ pattern, onOpen, onMenu, menuOpen, onMenuClose, onArchive, onRestore, onDuplicate }) {
  const status = pattern.status || 'draft';
  const sizes = (pattern.sizes || []).join(' · ') || '—';
  const ease = pattern.ease_chest_cm ? `${pattern.ease_chest_cm} cm` : '—';

  return (
    <div
      onClick={() => onOpen(pattern.id)}
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
      <Hero src={pattern.cover_image} />
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: FR.slate, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pattern.name || 'Untitled pattern'}
          </div>
          <StatusPill status={status} />
        </div>
        <div style={{ fontSize: 10, color: FR.stone, marginTop: 4, marginBottom: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
          {pattern.code} · {PATTERN_CATEGORY_LABEL[pattern.category] || pattern.category} · {pattern.version}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', columnGap: 8, rowGap: 4, fontSize: 11, lineHeight: 1.3 }}>
          <StatRow label="Block" value={pattern.base_block || '—'} />
          <StatRow label="Sizes" value={sizes} />
          <StatRow label="Ease"  value={ease} />
          <StatRow label="Since" value={formatSince(pattern.created_at)} />
        </div>
        <button
          aria-label="Card menu"
          onClick={e => { e.stopPropagation(); onMenu(pattern.id); }}
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
          <MenuItem icon={Copy} label="Duplicate" onClick={() => { onMenuClose(); onDuplicate(pattern.id); }} />
          {status === 'archived'
            ? <MenuItem icon={RotateCcw} label="Restore" onClick={() => { onMenuClose(); onRestore(pattern.id); }} />
            : <MenuItem icon={Archive}   label="Archive" onClick={() => { onMenuClose(); onArchive(pattern.id); }} />
          }
        </div>
      )}
    </div>
  );
}

// Compact kanban card — small 2:3 thumbnail on the left + meta on the right.
function KanbanCard({ pattern, onOpen, onDragStart, onDragEnd }) {
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', pattern.id); onDragStart?.(pattern.id); }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(pattern.id)}
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
        <div style={{ width: 44, height: 66, flexShrink: 0, background: FR.salt, borderRadius: 4, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `0.5px solid ${FR.sand}` }}>
          {pattern.cover_image
            ? <img src={pattern.cover_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <PenTool size={18} style={{ color: FR.sand }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 14, color: FR.slate, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pattern.name || 'Untitled pattern'}
          </div>
          <div style={{ fontSize: 10, color: FR.stone, marginTop: 2, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pattern.code} · {PATTERN_CATEGORY_LABEL[pattern.category] || pattern.category}
          </div>
          <div style={{ fontSize: 10, color: FR.stone, marginTop: 2 }}>
            {(pattern.sizes || []).join('·') || '—'} · {pattern.version || ''}
          </div>
        </div>
      </div>
    </div>
  );
}

const PIPELINE_COLORS = {
  draft:    { bg: '#F5F0E8', border: '#EBE5D5', dot: '#9A816B' },
  testing:  { bg: '#FAF1E0', border: '#EFD9B7', dot: '#C58A2D' },
  approved: { bg: '#EDEFED', border: '#D0D6CE', dot: '#4CAF7D' },
};

function KanbanColumn({ status, patterns, onOpen, onDragStart, onDragEnd, onDrop, dragOverStatus, setDragOverStatus }) {
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
        <span style={{ fontSize: 10, color: FR.stone, marginLeft: 'auto' }}>{patterns.length}</span>
      </div>
      <div style={{ minHeight: 60 }}>
        {patterns.map(p => (
          <KanbanCard key={p.id} pattern={p}
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

export default function PatternList() {
  const [rows, setRows] = useState([]);
  const [active, setActive] = useState(null);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
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
    await seedPatternsIfEmpty();
    const list = await listPatterns({ includeArchived: true });
    setRows(list);
  };

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const { layer, atom, packId } = parsePLMHash();
      if (layer !== 'library' || atom !== 'patterns') return;
      if (packId && active?.id === packId) return;
      if (!packId && active) { setActive(null); return; }
      if (packId) {
        const full = await getPattern(packId);
        if (cancelled) return;
        if (full) setActive(full);
        else setPLMHash({ layer: 'library', atom: 'patterns' });
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
    const full = await getPattern(id);
    if (full) {
      setActive(full);
      setPLMHash({ layer: 'library', atom: 'patterns', packId: id });
    }
  };

  const closeBuilder = async () => {
    setActive(null);
    setPLMHash({ layer: 'library', atom: 'patterns' });
    refresh();
  };

  const newPattern = async (category) => {
    setPicker(false);
    setCreating(true);
    try {
      const row = await createPattern({ category, status: 'draft' });
      setActive(row);
      setPLMHash({ layer: 'library', atom: 'patterns', packId: row.id });
    } finally {
      setCreating(false);
    }
  };

  const onArchive   = async (id) => { await archivePattern(id); refresh(); };
  const onRestore   = async (id) => { await restorePattern(id); refresh(); };
  const onDuplicate = async (id) => { const c = await duplicatePattern(id); if (c) refresh(); };

  const onKanbanDrop = async (id, newStatus) => {
    const row = rows.find(r => r.id === id);
    if (!row || row.status === newStatus) return;
    setRows(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    await savePattern(id, { status: newStatus });
  };

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (!showArchived && r.status === 'archived') return false;
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        const hit = (r.name || '').toLowerCase().includes(q)
          || (r.code || '').toLowerCase().includes(q)
          || (r.base_block || '').toLowerCase().includes(q)
          || (r.notes || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [rows, query, categoryFilter, showArchived]);

  const columns = useMemo(() => {
    const out = {};
    PIPELINE_STATUSES.forEach(s => { out[s] = []; });
    filtered.forEach(r => {
      let st = r.status || 'draft';
      if (!PIPELINE_STATUSES.includes(st)) return; // archived hidden from kanban
      out[st].push(r);
    });
    return out;
  }, [filtered]);

  if (active) {
    return <PatternBuilder pattern={active} onBack={closeBuilder} />;
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
            {view === 'grid' ? 'Pattern library' : 'Pattern pipeline'}
          </h3>
          <p style={{ color: FR.stone, fontSize: 12, margin: '4px 0 0' }}>
            {view === 'grid'
              ? 'DXF blocks, slopers, grading rules — the geometric skeleton every Style inherits from.'
              : 'Drag patterns through stages. Click a card to open it.'}
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
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{ padding: '6px 10px', border: `1px solid ${FR.sand}`, borderRadius: 6, fontSize: 12, color: FR.slate, background: '#fff' }}
          >
            <option value="all">All categories</option>
            {PATTERN_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
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
            <Plus size={13} /> Add pattern
          </button>
          {picker && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.08)', minWidth: 180, zIndex: 10, maxHeight: 320, overflowY: 'auto' }}>
              {PATTERN_CATEGORIES.map(c => (
                <button
                  key={c.id}
                  onClick={() => newPattern(c.id)}
                  style={{ display: 'block', width: '100%', padding: '8px 14px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '0.5px solid rgba(58,58,58,0.06)', fontSize: 12, color: FR.slate, cursor: 'pointer' }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: '60px 24px', textAlign: 'center', background: FR.salt, border: `1px dashed ${FR.sand}`, borderRadius: 8 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: FR.slate }}>No patterns yet</div>
          <div style={{ fontSize: 12, color: FR.stone, marginTop: 8, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
            Every block, sloper, and grading rule you create becomes a permanent library asset.
          </div>
          <button
            disabled={creating}
            onClick={() => setPicker(p => !p)}
            style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.6 : 1 }}
          >
            <Plus size={13} /> Add pattern
          </button>
        </div>
      ) : view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {filtered.map(r => (
            <GridCard
              key={r.id}
              pattern={r}
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
              patterns={columns[status]}
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
