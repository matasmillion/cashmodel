import { useEffect, useState } from 'react';
import { getDiscussion, saveDiscussion, appendDiscussionMessage } from '../../../utils/discussionStore';
import { appendLearning } from '../../../utils/learningStore';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };

export default function DiscussionView({ discussionId, onFinalize }) {
  const [disc, setDisc] = useState(null);
  const [draft, setDraft] = useState('');
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    if (!discussionId) return;
    getDiscussion(discussionId).then(setDisc);
  }, [discussionId]);

  const sendMessage = async () => {
    if (!draft.trim() || !disc) return;
    const updated = await appendDiscussionMessage(disc.id, { role: 'user', content: draft });
    setDisc(updated);
    setDraft('');
  };

  const finalize = async () => {
    if (!disc || !disc.final_text.trim()) return;
    setFinalizing(true);
    try {
      // Commit to append-only learnings
      await appendLearning({
        sprint_id: disc.sprint_id,
        summary: disc.final_text,
        outcome: 'inconclusive', // caller should update after finalize
        hypothesis_type: '',
        lane: '',
        seeded_from: disc.id,
      });
      await saveDiscussion(disc.id, { finalized: true, finalized_at: new Date().toISOString() });
      if (onFinalize) onFinalize(disc);
    } finally {
      setFinalizing(false);
    }
  };

  if (!discussionId) return <p style={{ fontSize: 13, color: FR.stone }}>No discussion selected.</p>;
  if (!disc) return <p style={{ fontSize: 13, color: FR.stone }}>Loading…</p>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, height: '70vh' }}>
      {/* Left — synthesis */}
      <div style={{ background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, padding: '16px 20px', overflowY: 'auto' }}>
        <p style={{ fontSize: 11, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', marginBottom: 12 }}>Synthesis Draft</p>
        <p style={{ fontSize: 13, color: FR.slate, whiteSpace: 'pre-wrap', marginBottom: 20 }}>{disc.synthesis_draft || 'No synthesis draft yet.'}</p>

        <p style={{ fontSize: 11, letterSpacing: '0.08em', color: FR.stone, textTransform: 'uppercase', marginBottom: 8 }}>Final Text</p>
        <textarea
          value={disc.final_text}
          onChange={e => { const updated = { ...disc, final_text: e.target.value }; setDisc(updated); saveDiscussion(disc.id, { final_text: e.target.value }); }}
          rows={6}
          disabled={disc.finalized}
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '8px 10px', borderRadius: 6, border: '0.5px solid rgba(58,58,58,0.2)', resize: 'vertical', fontFamily: 'inherit', color: FR.slate }}
        />

        {!disc.finalized && (
          <button
            onClick={finalize}
            disabled={finalizing || !disc.final_text.trim()}
            style={{ marginTop: 12, fontSize: 12, padding: '6px 16px', borderRadius: 6, background: FR.slate, color: FR.salt, border: 'none', cursor: 'pointer' }}
          >
            {finalizing ? 'Finalizing…' : 'Finalize Learning'}
          </button>
        )}
        {disc.finalized && (
          <p style={{ marginTop: 12, fontSize: 12, color: '#3B6D11' }}>Finalized — committed to Learning Archive.</p>
        )}
      </div>

      {/* Right — chat */}
      <div style={{ display: 'flex', flexDirection: 'column', background: '#fff', border: '0.5px solid rgba(58,58,58,0.15)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
          {(disc.messages || []).length === 0
            ? <p style={{ fontSize: 13, color: FR.stone }}>No messages yet.</p>
            : disc.messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 12, display: 'flex', flexDirection: m.role === 'user' ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-start' }}>
                <div style={{
                  maxWidth: '80%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
                  background: m.role === 'user' ? FR.sand : '#F0F0EE',
                  color: FR.slate,
                }}>
                  {m.content}
                </div>
              </div>
            ))}
        </div>
        <div style={{ padding: '8px 12px', borderTop: '0.5px solid rgba(58,58,58,0.08)', display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Message…"
            disabled={disc.finalized}
            style={{ flex: 1, fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '0.5px solid rgba(58,58,58,0.2)', fontFamily: 'inherit' }}
          />
          <button
            onClick={sendMessage}
            disabled={disc.finalized || !draft.trim()}
            style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, background: FR.slate, color: FR.salt, border: 'none', cursor: 'pointer' }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
