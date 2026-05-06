import { useEffect, useState } from 'react';
import { listRenders, saveRender } from '../../../utils/renderStore';
import { RENDER_STATUSES } from '../../../types/creative';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };

export default function RenderQueue() {
  const [renders, setRenders] = useState(null);

  useEffect(() => {
    listRenders({ status: RENDER_STATUSES.DONE }).then(setRenders);
  }, []);

  const handleApprove = async (r) => {
    const updated = await saveRender(r.id, { status: RENDER_STATUSES.APPROVED, approved_at: new Date().toISOString() });
    setRenders(prev => prev.filter(x => x.id !== r.id));
  };

  const handleReject = async (r) => {
    await saveRender(r.id, { status: RENDER_STATUSES.REJECTED });
    setRenders(prev => prev.filter(x => x.id !== r.id));
  };

  return (
    <div>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.slate, marginBottom: 8 }}>
        Render Queue
      </h2>
      <p style={{ fontSize: 13, color: FR.stone, marginBottom: 24 }}>Renders awaiting approval before encoder-pass and Meta upload.</p>

      {renders === null
        ? <p style={{ fontSize: 13, color: FR.stone }}>Loading…</p>
        : renders.length === 0
        ? <p style={{ fontSize: 13, color: FR.stone }}>No renders awaiting approval.</p>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {renders.map(r => (
              <div key={r.id} style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, overflow: 'hidden' }}>
                {r.raw_url
                  ? <video src={r.raw_url} style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', display: 'block' }} controls muted playsInline />
                  : <div style={{ width: '100%', aspectRatio: '9/16', background: FR.sand, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 11, color: FR.stone }}>No preview</span>
                  </div>}
                <div style={{ padding: '10px 12px' }}>
                  <p style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 11, color: FR.stone, marginBottom: 8 }}>
                    variant {r.variant_index + 1}
                  </p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => handleApprove(r)} style={btnStyle('#3B6D11')}>Approve</button>
                    <button onClick={() => handleReject(r)} style={btnStyle('#A32D2D')}>Reject</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

function btnStyle(color) {
  return { fontSize: 11, padding: '4px 10px', borderRadius: 5, border: `0.5px solid ${color}`, color, background: 'transparent', cursor: 'pointer' };
}
