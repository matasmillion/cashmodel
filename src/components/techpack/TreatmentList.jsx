// Treatments list — card grid of every wash / dye / print / finish /
// distress in the library. Mirrors the visual rhythm of the Styles and
// Trims grids: small thumbnail (color swatch tinted by base_color_id),
// name, code + type meta line, status pill, rollups (units, latest cost,
// drift), and a per-card overflow menu for archive / restore / duplicate.
//
// Clicking a card routes to `#product/library/treatments/<id>` which
// mounts TreatmentBuilder full-bleed. Archived treatments are hidden from
// the default list — toggle "Show archived" reveals them.

// eslint-disable-next-line no-unused-vars
import * as _atomTypes from '../../types/atoms';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, MoreVertical, Copy, Archive, RotateCcw } from 'lucide-react';
import { FR } from './techPackConstants';
import { getFRColor } from '../../utils/colorLibrary';
import { parsePLMHash, setPLMHash } from '../../utils/plmRouting';
import {
  listTreatments, createTreatment, getTreatment,
  archiveTreatment, restoreTreatment, duplicateTreatment,
  getTreatmentRollups, seedTreatmentsIfEmpty,
} from '../../utils/treatmentStore';
import { TREATMENT_TYPES, TREATMENT_TYPE_LABEL } from '../../utils/treatmentLibrary';
import TreatmentBuilder from './TreatmentBuilder';

const STATUS_PILL = {
  draft:    { bg: 'rgba(116,116,116,0.10)', fg: '#5A5A5A', label: 'Draft' },
  testing:  { bg: 'rgba(133,79,11,0.12)',   fg: '#854F0B', label: 'Testing' },
  approved: { bg: 'rgba(99,153,34,0.12)',   fg: '#3B6D11', label: 'Approved' },
  archived: { bg: 'rgba(58,58,58,0.06)',    fg: '#9A9A9A', label: 'Archived' },
};

function StatusPill({ status }) {
  const s = STATUS_PILL[status] || STATUS_PILL.draft;
  return (
    <span style={{ background: s.bg, color: s.fg, padding: '4px 9px', borderRadius: 4, fontSize: 10, letterSpacing: 0.06 * 16 / 16, textTransform: 'uppercase', fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

function Swatch({ colorName }) {
  const entry = colorName ? getFRColor(colorName) : null;
  const hex = entry?.hex || FR.sand;
  return (
    <div style={{ width: 44, height: 44, borderRadius: 6, background: hex, boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.1)' }} />
  );
}

function Card({ treatment, rollups, onOpen, onMenu, menuOpen, onMenuClose, onArchive, onRestore, onDuplicate }) {
  const status = treatment.status || 'draft';
  return (
    <div
      onClick={() => onOpen(treatment.id)}
      style={{
        background: '#fff',
        border: `0.5px solid rgba(58,58,58,0.15)`,
        borderRadius: 8,
        padding: '18px 20px',
        cursor: 'pointer',
        position: 'relative',
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <Swatch colorName={treatment.base_color_id} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: FR.slate, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {treatment.name || 'Untitled treatment'}
            </div>
            <StatusPill status={status} />
          </div>
          <div style={{ fontSize: 11, color: FR.stone, marginTop: 4, letterSpacing: 0.04 * 16 / 16, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {treatment.code} · {TREATMENT_TYPE_LABEL[treatment.type] || treatment.type} · {treatment.base_color_id || '—'} · {treatment.version}
          </div>
        </div>
        <button
          aria-label="Card menu"
          onClick={e => { e.stopPropagation(); onMenu(treatment.id); }}
          style={{ background: 'none', border: 'none', color: FR.stone, cursor: 'pointer', padding: 4, marginRight: -4, marginTop: -4 }}
        >
          <MoreVertical size={14} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14, paddingTop: 12, borderTop: `0.5px solid rgba(58,58,58,0.08)` }}>
        <Stat label="Units" value={rollups?.units_produced != null ? Number(rollups.units_produced).toLocaleString() : '—'} />
        <Stat label="Cost" value={rollups?.latest_unit_cost != null ? `$${Number(rollups.latest_unit_cost).toFixed(2)}` : '—'} />
        <Stat label="Drift 30d" value={rollups?.drift_30d_pct != null ? `${Number(rollups.drift_30d_pct).toFixed(1)}%` : '—'} tone={rollups?.drift_30d_pct > 8 ? 'warn' : 'ok'} />
      </div>

      {menuOpen && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: 'absolute', top: 38, right: 14, background: '#fff', border: `0.5px solid rgba(58,58,58,0.15)`, borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.08)', minWidth: 160, zIndex: 5 }}
        >
          <MenuItem icon={Copy}    label="Duplicate"          onClick={() => { onMenuClose(); onDuplicate(treatment.id); }} />
          {status === 'archived'
            ? <MenuItem icon={RotateCcw} label="Restore"      onClick={() => { onMenuClose(); onRestore(treatment.id); }} />
            : <MenuItem icon={Archive}   label="Archive"      onClick={() => { onMenuClose(); onArchive(treatment.id); }} />
          }
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  const color = tone === 'warn' ? '#854F0B' : tone === 'bad' ? '#A32D2D' : FR.slate;
  return (
    <div>
      <div style={{ fontSize: 9, letterSpacing: 0.08 * 16 / 16, color: 'rgba(58,58,58,0.55)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', borderBottom: `0.5px solid rgba(58,58,58,0.06)`, fontSize: 12, color: FR.slate, cursor: 'pointer', textAlign: 'left' }}
    >
      <Icon size={13} /> {label}
    </button>
  );
}

export default function TreatmentList() {
  const [rows, setRows] = useState([]);
  const [rollupsById, setRollupsById] = useState({});
  const [active, setActive] = useState(null);   // full treatment row
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [menuFor, setMenuFor] = useState(null);
  const [creating, setCreating] = useState(false);
  const [picker, setPicker] = useState(false);
  const pickerRef = useRef(null);

  const refresh = async () => {
    await seedTreatmentsIfEmpty();
    const list = await listTreatments({ includeArchived: true });
    setRows(list);
    // Pull rollups in parallel.
    const entries = await Promise.all(list.map(async r => [r.id, await getTreatmentRollups(r.id)]));
    setRollupsById(Object.fromEntries(entries));
  };

  useEffect(() => { refresh(); }, []);

  // Hash-driven open/close — a deep link to /library/treatments/<id>
  // mounts the builder; backing out of the builder clears the id.
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const { layer, atom, packId } = parsePLMHash();
      if (layer !== 'library' || atom !== 'treatments') return;
      if (packId && active?.id === packId) return;
      if (!packId && active) { setActive(null); return; }
      if (packId) {
        const full = await getTreatment(packId);
        if (cancelled) return;
        if (full) setActive(full);
        else setPLMHash({ layer: 'library', atom: 'treatments' });
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

  // Close the new-treatment type picker when clicking outside.
  useEffect(() => {
    if (!picker) return;
    const onDoc = (e) => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setPicker(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [picker]);

  const open = async (id) => {
    const full = await getTreatment(id);
    if (full) {
      setActive(full);
      setPLMHash({ layer: 'library', atom: 'treatments', packId: id });
    }
  };

  const closeBuilder = async () => {
    setActive(null);
    setPLMHash({ layer: 'library', atom: 'treatments' });
    refresh();
  };

  const newTreatment = async (type) => {
    setPicker(false);
    setCreating(true);
    try {
      const row = await createTreatment({ type, status: 'draft' });
      setActive(row);
      setPLMHash({ layer: 'library', atom: 'treatments', packId: row.id });
    } finally {
      setCreating(false);
    }
  };

  const onArchive   = async (id) => { await archiveTreatment(id); refresh(); };
  const onRestore   = async (id) => { await restoreTreatment(id); refresh(); };
  const onDuplicate = async (id) => { const c = await duplicateTreatment(id); if (c) refresh(); };

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (!showArchived && r.status === 'archived') return false;
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        const hit = (r.name || '').toLowerCase().includes(q)
          || (r.code || '').toLowerCase().includes(q)
          || (r.base_color_id || '').toLowerCase().includes(q)
          || (r.primary_vendor_id || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [rows, query, typeFilter, showArchived]);

  if (active) {
    return <TreatmentBuilder treatment={active} onBack={closeBuilder} />;
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 22, margin: 0 }}>Treatments</h3>
          <p style={{ color: FR.stone, fontSize: 12, margin: '4px 0 0' }}>
            Washes, dyes, prints, finishes, distress — each with its own chemistry, vendor, and digital twin.
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
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            style={{ padding: '6px 10px', border: `1px solid ${FR.sand}`, borderRadius: 6, fontSize: 12, color: FR.slate, background: '#fff' }}
          >
            <option value="all">All types</option>
            {TREATMENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
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
            <Plus size={13} /> Add treatment
          </button>
          {picker && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: '#fff', border: `0.5px solid rgba(58,58,58,0.15)`, borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.08)', minWidth: 180, zIndex: 10 }}>
              {TREATMENT_TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => newTreatment(t.id)}
                  style={{ display: 'block', width: '100%', padding: '8px 14px', textAlign: 'left', background: 'none', border: 'none', borderBottom: `0.5px solid rgba(58,58,58,0.06)`, fontSize: 12, color: FR.slate, cursor: 'pointer' }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: '60px 24px', textAlign: 'center', background: FR.salt, border: `1px dashed ${FR.sand}`, borderRadius: 8 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: FR.slate }}>No treatments yet</div>
          <div style={{ fontSize: 12, color: FR.stone, marginTop: 8, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
            Add a wash, dye, print, finish, or distress technique to start building the digital + physical twin.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {filtered.map(r => (
            <Card
              key={r.id}
              treatment={r}
              rollups={rollupsById[r.id]}
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
