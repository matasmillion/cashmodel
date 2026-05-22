import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Check, X } from 'lucide-react';
import { listRenders, saveRender } from '../../../utils/renderStore';
import { saveSprint } from '../../../utils/sprintStore';
import { callCheckRenderStatus, callEncoderPass } from '../../../utils/liveDataSync';
import { RENDER_STATUSES, SPRINT_STATUSES } from '../../../types/creative';
import { FR, RENDER_STATUS_TOKEN, DOT_COLOR, pillStyle, dotStyle } from '../palette';

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
    // First approval on a sprint moves it from `rendering` to `in_queue`
    // so the kanban / metric strip reflect the right state. Idempotent —
    // re-issuing the update is a no-op.
    if (r.sprint_id) {
      saveSprint(r.sprint_id, { status: SPRINT_STATUSES.IN_QUEUE }).catch(err => {
        console.warn('sprint status update on approve:', err);
      });
    }
    setRenders(prev => (prev || []).filter(x => x.id !== r.id));
    // Fire encoder-pass in the background — UI optimistically removes the
    // card from the queue. Failures are surfaced in Production view via
    // encoder_passed=false state.
    callEncoderPass({ render_id: r.id }).catch(err => {
      console.warn('encoder-pass failed:', err.message);
    });
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
        <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 400, color: FR.ink, margin: 0 }}>
          Render Queue
        </h2>
        <button
          onClick={handleRefresh}
          style={{
            fontSize: 11, padding: '5px 11px', borderRadius: 7,
            border: '1px solid rgba(0,0,0,0.12)', background: '#fff',
            color: FR.ink, cursor: 'pointer',
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

    </div>
  );
}

function RenderCard({ render: r, isPolling, onApprove, onReject }) {
  const isProcessing = r.status === 'processing';
  const isDone = r.status === 'done';
  const token = RENDER_STATUS_TOKEN[r.status] || RENDER_STATUS_TOKEN.pending;

  return (
    <div style={{
      background: '#fff', border: '1px solid rgba(0,0,0,0.07)',
      borderRadius: 12, overflow: 'hidden',
      boxShadow: isDone ? '0 2px 12px rgba(0,0,0,0.04)' : 'none',
    }}>
      <div style={{ position: 'relative' }}>
        {r.raw_url
          ? <video src={r.raw_url} style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', display: 'block', background: '#000' }} controls muted playsInline />
          : (
            <div style={{
              width: '100%', aspectRatio: '9/16',
              background: `linear-gradient(135deg, ${FR.sand} 0%, ${FR.sandLight} 100%)`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {isProcessing
                ? <>
                    <Loader2 size={22} color={FR.amber} style={{ animation: 'spin 1.2s linear infinite' }} />
                    <span style={{ fontSize: 11, color: FR.stone, letterSpacing: '0.04em' }}>Generating…</span>
                  </>
                : <span style={{ fontSize: 11, color: FR.stone }}>No preview</span>}
            </div>
          )}
        {/* Status pill overlay top-left */}
        <span style={{
          position: 'absolute', top: 10, left: 10,
          ...pillStyle(token),
          backdropFilter: 'blur(6px)',
          background: r.raw_url ? 'rgba(255,255,255,0.92)' : token.bg,
        }}>
          <span style={{ ...dotStyle(DOT_COLOR[token.dot] || FR.stone, isProcessing), marginRight: 5 }} />
          {token.label}
        </span>
        {isPolling && (
          <span style={{
            position: 'absolute', top: 10, right: 10,
            background: 'rgba(0,0,0,0.55)', color: 'white',
            fontSize: 10, padding: '3px 7px', borderRadius: 4,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <Loader2 size={9} style={{ animation: 'spin 0.7s linear infinite' }} /> polling
          </span>
        )}
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: isDone ? 10 : 0 }}>
          <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 11, color: FR.stone }}>
            {r.provider || '?'} <span style={{ color: 'rgba(0,0,0,0.2)' }}>·</span> v{(r.variant_index ?? 0) + 1}
          </span>
        </div>
        {isDone && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onApprove} style={btnApprove}>
              <Check size={12} strokeWidth={2.5} /> Approve
            </button>
            <button onClick={onReject} style={btnReject}>
              <X size={12} strokeWidth={2.5} /> Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const btnApprove = {
  flex: 1,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
  fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 7,
  border: '1px solid #A7F3D0',
  background: FR.greenLight, color: FR.green,
  cursor: 'pointer',
};

const btnReject = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
  fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 7,
  border: '1px solid #FECACA',
  background: FR.redLight, color: FR.red,
  cursor: 'pointer',
};
