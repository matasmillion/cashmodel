// Tech Pack list view — grid of past tech packs, + a "New" button
import { useEffect, useState } from 'react';
import { Plus, Shirt, Copy, Trash2, FileText } from 'lucide-react';
import { FR, DEFAULT_DATA, DEFAULT_LIBRARY } from './techPackConstants';
import TechPackBuilder from './TechPackBuilder';
import { listTechPacks, createTechPack, getTechPack, deleteTechPack, duplicateTechPack } from '../../utils/techPackStore';

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso.slice(0, 10); }
}

function statusColor(status) {
  switch ((status || '').toLowerCase()) {
    case 'completed': return FR.sage;
    case 'production': return FR.sea;
    case 'sampling': return FR.sienna;
    default: return FR.soil;
  }
}

export default function TechPackList() {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePack, setActivePack] = useState(null);

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

  const onDuplicate = async (id, e) => {
    e.stopPropagation();
    await duplicateTechPack(id);
    refresh();
  };

  const onDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this tech pack? This cannot be undone.')) return;
    await deleteTechPack(id);
    refresh();
  };

  const closeBuilder = async () => {
    setActivePack(null);
    refresh();
  };

  if (activePack) {
    return <TechPackBuilder pack={activePack} onBack={closeBuilder} />;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 24, margin: 0 }}>Tech Packs</h2>
          <p className="text-sm mt-1" style={{ color: FR.stone }}>Create, edit, and export factory-ready specs for every Foreign Resource product.</p>
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
          <p style={{ color: FR.stone, fontSize: 13, marginBottom: 16 }}>Start your first one to send specs to the factory.</p>
          <button onClick={createNew} style={{ padding: '8px 20px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>
            + New Tech Pack
          </button>
        </div>
      )}

      {!loading && packs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {packs.map(p => (
            <div key={p.id} onClick={() => openPack(p.id)}
              className="rounded-xl border p-4 cursor-pointer transition-all"
              style={{ background: 'white', borderColor: FR.sand }}
              onMouseEnter={e => e.currentTarget.style.borderColor = FR.soil}
              onMouseLeave={e => e.currentTarget.style.borderColor = FR.sand}>
              <div className="flex items-start justify-between mb-3">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: FR.slate, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.style_name || 'Untitled'}
                  </h3>
                  <p className="text-xs mt-1" style={{ color: FR.stone }}>{p.product_category || '—'}</p>
                </div>
                <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full"
                  style={{ background: statusColor(p.status), color: FR.salt }}>
                  {p.status || 'Development'}
                </span>
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: FR.stone, marginBottom: 3 }}>
                  <span>Completion</span><span>{p.completion_pct || 0}%</span>
                </div>
                <div style={{ width: '100%', height: 4, background: FR.sand, borderRadius: 2 }}>
                  <div style={{ width: `${p.completion_pct || 0}%`, height: '100%', background: FR.soil, borderRadius: 2 }} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: FR.stone }}>
                  Updated {formatDate(p.updated_at)}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={e => onDuplicate(p.id, e)} title="Duplicate"
                    style={{ padding: 5, border: 'none', background: 'transparent', color: FR.stone, cursor: 'pointer' }}>
                    <Copy size={13} />
                  </button>
                  <button onClick={e => onDelete(p.id, e)} title="Delete"
                    style={{ padding: 5, border: 'none', background: 'transparent', color: FR.stone, cursor: 'pointer' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl p-4 mt-6" style={{ background: FR.salt, border: `1px solid ${FR.sand}` }}>
        <div className="flex items-start gap-3">
          <FileText size={16} style={{ color: FR.soil, marginTop: 2 }} />
          <div className="text-xs" style={{ color: FR.stone, lineHeight: 1.6 }}>
            <strong style={{ color: FR.slate }}>Generate & Download</strong> on the final step (Review & Export) produces a PDF and SVG.
            Tech packs auto-save to your account as you fill them in — open them on any device.
          </div>
        </div>
      </div>
    </div>
  );
}
