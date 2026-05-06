import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { listRenders, saveRender } from '../../../utils/renderStore';
import { callCheckRenderStatus } from '../../../utils/liveDataSync';
import { RENDER_STATUSES } from '../../../types/creative';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };
const POLL_INTERVAL_MS = 15_000;

export default function RenderQueue() {
  const [renders, setRenders] = useState(null);
  const [polling, setPolling] = useState(new Set());
  const pollTimer = useRef(null);

  // Initial load — show both processing and done renders so the user
  // can see what's still cooking and what's ready to approve.
  useEffect(() => {
    listRenders().then(rs => {
      setRenders((rs || []).filter(r =>
        r.status === RENDER_STATUSES.PROCESSING || r.status === RENDER_STATUSES.DONE
      ));
    });
  }, []);

  // Auto-poll any processing render every 15s. Skips a poll if the
  // previous one for that render is still in flight.
  useEffect(() => {
    if (!renders) return;
    const processing = renders.filter(r => r.status === RENDER_STATUSES.PROCESSING);
    if (processing.length === 0) {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }

    const tick = async () => {
      for (const r of processing) {
        if (polling.has(r.id)) continue;
        setPolling(prev => new Set(prev).add(r.id));
        try {
          const { render: updated } = await callCheckRenderStatus({ render_id: r.id });
          if (updated && updated.status !== r.status) {
            await saveRender(r.id, updated);
            setRenders(prev =>
              (prev || []).map(x => x.id === r.id ? { ...x, ...updated } : x)
            );
          }
        } catch (err) {
          console.warn('check-render-status:', err.message);
        } finally {
          setPolling(prev => {
            const next = new Set(prev);
            next.delete(r.id);
            return next;
          });
        }
      }
    };

    tick(); // immediate first run
    pollTimer.current = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renders?.length, renders?.map(r => r.status).join(',')]);

  const handleApprove = async (r) => {
    await saveRender(r.id, { status: RENDER_STATUSES.APPROVED, approved_at: new Date().toISOString() });
    setRenders(prev => (prev || []).filter(x => x.id !== r.id));
  };

  const handleReject = async (r) => {
    await saveRender(r.id, { status: RENDER_STATUSES.REJECTED });
    setRenders(prev => (prev || []).filter(x => x.id !== r.id));
  };

  const handleRefresh = async () => {
    const rs = await listRenders();
    setRenders((rs || []).filter(r =>
      r.status === RENDER_STATUSES.PROCESSING || r.status === RENDER_STATUSES.DONE
    ));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.slate, margin: 0 }}>
          Render Queue
        </h2>
        <button
          onClick={handleRefresh}
          style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 6,
            border: '0.5px solid rgba(58,58,58,0.2)', background: 'transparent',
            color: FR.stone, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>
      <p style={{ fontSize: 13, color: FR.stone, marginBottom: 24 }}>
        Renders awaiting approval before encoder-pass and Meta upload. Processing variants poll every 15s.
      </p>

      {renders === null
        ? <p style={{ fontSize: 13, color: FR.stone }}>Loading…</p>
        : renders.length === 0
        ? <p style={{ fontSize: 13, color: FR.stone }}>No renders in flight or awaiting approval.</p>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {renders.map(r => (
              <RenderCard
                key={r.id}
                render={r}
                isPolling={polling.has(r.id)}
                onApprove={() => handleApprove(r)}
                onReject={() => handleReject(r)}
              />
            ))}
          </div>
        )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function RenderCard({ render: r, isPolling, onApprove, onReject }) {
  const isProcessing = r.status === 'processing';
  const isDone = r.status === 'done';

  return (
    <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ position: 'relative' }}>
        {r.raw_url
          ? <video src={r.raw_url} style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', display: 'block' }} controls muted playsInline />
          : (
            <div style={{ width: '100%', aspectRatio: '9/16', background: FR.sand, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {isProcessing
                ? <>
                    <Loader2 size={20} color={FR.stone} style={{ animation: 'spin 1.2s linear infinite' }} />
                    <span style={{ fontSize: 11, color: FR.stone }}>Generating…</span>
                  </>
                : <span style={{ fontSize: 11, color: FR.stone }}>No preview</span>}
            </div>
          )}
        {isPolling && (
          <span style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(0,0,0,0.55)', color: 'white',
            fontSize: 10, padding: '2px 6px', borderRadius: 4,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <Loader2 size={9} style={{ animation: 'spin 0.7s linear infinite' }} /> polling
          </span>
        )}
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 11, color: FR.stone }}>
            {r.provider || '?'} · v{r.variant_index + 1}
          </span>
          <span style={{ fontSize: 10, color: FR.stone, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {r.status}
          </span>
        </div>
        {isDone && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onApprove} style={btnStyle('#3B6D11')}>Approve</button>
            <button onClick={onReject} style={btnStyle('#A32D2D')}>Reject</button>
          </div>
        )}
      </div>
    </div>
  );
}

function btnStyle(color) {
  return { fontSize: 11, padding: '4px 10px', borderRadius: 5, border: `0.5px solid ${color}`, color, background: 'transparent', cursor: 'pointer' };
}
