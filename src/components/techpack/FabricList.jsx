// Fabrics list — card grid of every base fabric in the library. Mirrors
// the Treatments grid: swatch header tinted by color_id, name, code +
// weave meta line, status pill, key spec rollups, per-card overflow
// menu for archive / restore / duplicate.
//
// Clicking a card routes to `#product/library/fabrics/<id>` and mounts
// FabricBuilder. Archived rows hide by default — "Archived" toggle
// reveals them.

// eslint-disable-next-line no-unused-vars
import * as _atomTypes from '../../types/atoms';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, MoreVertical, Copy, Archive, RotateCcw } from 'lucide-react';
import { FR } from './techPackConstants';
import { getFRColor } from '../../utils/colorLibrary';
import { parsePLMHash, setPLMHash } from '../../utils/plmRouting';
import {
  listFabrics, createFabric, getFabric,
  archiveFabric, restoreFabric, duplicateFabric,
  seedFabricsIfEmpty,
} from '../../utils/fabricStore';
import { FABRIC_WEAVES, FABRIC_WEAVE_LABEL } from '../../utils/fabricLibrary';
import FabricBuilder from './FabricBuilder';

const STATUS_PILL = {
  draft:    { bg: 'rgba(116,116,116,0.10)', fg: '#5A5A5A', label: 'Draft' },
  testing:  { bg: 'rgba(133,79,11,0.12)',   fg: '#854F0B', label: 'Testing' },
  approved: { bg: 'rgba(99,153,34,0.12)',   fg: '#3B6D11', label: 'Approved' },
  archived: { bg: 'rgba(58,58,58,0.06)',    fg: '#9A9A9A', label: 'Archived' },
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

function Card({ fabric, onOpen, onMenu, menuOpen, onMenuClose, onArchive, onRestore, onDuplicate }) {
  const status = fabric.status || 'draft';
  const swatchHex = (fabric.color_id ? getFRColor(fabric.color_id)?.hex : null) || FR.sand;
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
      <div style={{ height: 54, background: swatchHex }} />
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
          style={{ position: 'absolute', top: 60, right: 8, background: 'rgba(255,255,255,0.85)', border: 'none', color: FR.stone, cursor: 'pointer', padding: 4, borderRadius: 4 }}
        >
          <MoreVertical size={14} />
        </button>
      </div>

      {menuOpen && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: 'absolute', top: 86, right: 14, background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.08)', minWidth: 160, zIndex: 5 }}
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
  const pickerRef = useRef(null);

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

  if (active) {
    return <FabricBuilder fabric={active} onBack={closeBuilder} />;
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 26, margin: 0 }}>Fabric library</h3>
          <p style={{ color: FR.stone, fontSize: 12, margin: '4px 0 0' }}>
            Composition, weight, hand, mill, lead time — every base fabric the line uses.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }} ref={pickerRef}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: `1px solid ${FR.sand}`, borderRadius: 6, background: '#fff' }}>
            <Search size={12} style={{ color: FR.stone }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search…"
              style={{ border: 'none', outline: 'none', fontSize: 12, color: FR.slate, background: 'transparent', width: 160 }}
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: FR.stone, cursor: 'pointer' }}>
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
            Archived
          </label>
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
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {filtered.map(r => (
            <Card
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
      )}
    </div>
  );
}
