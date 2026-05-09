// Floating inventory agent chat panel. Bottom-right toggle button → expand
// into a 400×600 chat surface. Operator types a question, agent answers
// using the read-only tools defined in utils/inventoryAgent.js.

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Wrench, Loader2 } from 'lucide-react';
import { runAgentTurn } from '../../utils/inventoryAgent';
import { INV, FADE, TYPE } from './inventoryTokens';

const SUGGESTED = [
  'Which 5 SKUs have the longest weeks-of-supply?',
  'Show me the open POs for the Borderless Basic Hoodie style.',
  'When was AP-PA-ECARGO-10-W34-1 last toggled tracked?',
  'How is Q3 OTB pacing against committed?',
];

export default function InventoryAgentChat() {
  const [open, setOpen]       = useState(false);
  const [history, setHistory] = useState([]); // raw Anthropic-shaped messages
  const [pretty, setPretty]   = useState([]); // {role, text, toolCalls?}[]
  const [input, setInput]     = useState('');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [pretty, busy]);

  async function send(text) {
    const trimmed = (text || '').trim();
    if (!trimmed || busy) return;

    const userPretty = { role: 'user', text: trimmed };
    setPretty(p => [...p, userPretty]);
    setInput('');
    setError(null);
    setBusy(true);

    const nextHistory = [...history, { role: 'user', content: trimmed }];
    try {
      const result = await runAgentTurn(nextHistory);
      setHistory(result.history);
      setPretty(p => [...p, {
        role: 'assistant',
        text: result.text,
        toolCalls: result.toolCalls,
      }]);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Inventory agent — ask questions about SKUs, POs, mappings, OTB."
        style={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          width: 48,
          height: 48,
          borderRadius: 24,
          background: INV.slate,
          color: INV.salt,
          border: 'none',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(58,58,58,0.20)',
          zIndex: 200,
        }}
      >
        <MessageCircle size={20} />
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      right: 24,
      bottom: 24,
      width: 400,
      height: 600,
      maxHeight: 'calc(100vh - 48px)',
      background: INV.card,
      border: `1px solid ${FADE.slate10}`,
      borderRadius: 6,
      boxShadow: '0 8px 32px rgba(58,58,58,0.20)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 200,
      fontFamily: TYPE.sans,
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: `1px solid ${FADE.slate10}`,
        display: 'flex',
        alignItems: 'center',
        background: INV.slate,
        color: INV.salt,
        borderTopLeftRadius: 5,
        borderTopRightRadius: 5,
      }}>
        <div>
          <div style={{
            fontFamily: TYPE.serif,
            fontSize: 16,
            lineHeight: 1.1,
          }}>
            Inventory agent
          </div>
          <div style={{
            fontSize: 9,
            opacity: 0.7,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            marginTop: 2,
          }}>
            Read-only · Claude Opus
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: 'none',
            color: INV.salt,
            cursor: 'pointer',
            display: 'inline-flex',
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1,
        overflowY: 'auto',
        padding: 14,
      }}>
        {pretty.length === 0 && (
          <Empty onSuggestion={send} />
        )}
        {pretty.map((m, i) => <Message key={i} m={m} />)}
        {busy && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: FADE.slate60,
            fontSize: 11,
            padding: '6px 0',
          }}>
            <Loader2 size={11} className="spin" />
            Thinking…
          </div>
        )}
        {error && (
          <div style={{
            background: 'rgba(168,84,60,0.08)',
            border: '1px solid rgba(168,84,60,0.25)',
            color: INV.bad,
            padding: 10,
            borderRadius: 4,
            fontSize: 11,
            marginTop: 8,
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{
        padding: 12,
        borderTop: `1px solid ${FADE.slate10}`,
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
      }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask about SKUs, POs, mappings, OTB…"
          rows={1}
          style={{
            flex: 1,
            border: `1px solid ${FADE.slate10}`,
            borderRadius: 4,
            padding: '8px 10px',
            fontFamily: TYPE.sans,
            fontSize: 12,
            color: INV.slate,
            resize: 'none',
            outline: 'none',
            background: '#FFF',
            maxHeight: 100,
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
          style={{
            background: busy || !input.trim() ? FADE.slate10 : INV.slate,
            color: INV.salt,
            border: 'none',
            borderRadius: 4,
            width: 36,
            height: 36,
            cursor: busy || !input.trim() ? 'default' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Message rendering ────────────────────────────────────────────────────

function Message({ m }) {
  const isUser = m.role === 'user';
  return (
    <div style={{
      marginBottom: 12,
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
    }}>
      <div style={{
        background: isUser ? INV.slate : INV.sand,
        color: isUser ? INV.salt : INV.slate,
        padding: '8px 12px',
        borderRadius: 8,
        maxWidth: '85%',
        fontSize: 12,
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: TYPE.sans,
      }}>
        {m.text || (isUser ? '' : '(no response)')}
      </div>
      {m.toolCalls && m.toolCalls.length > 0 && (
        <ToolCallsDisclosure calls={m.toolCalls} />
      )}
    </div>
  );
}

function ToolCallsDisclosure({ calls }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginTop: 4, maxWidth: '85%' }}>
      <button
        onClick={() => setShow(s => !s)}
        style={{
          background: 'transparent',
          border: 'none',
          color: FADE.slate60,
          fontSize: 9,
          fontFamily: TYPE.mono,
          letterSpacing: '0.04em',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: 0,
        }}
      >
        <Wrench size={9} />
        {calls.length} tool call{calls.length === 1 ? '' : 's'} {show ? '▾' : '▸'}
      </button>
      {show && (
        <div style={{
          marginTop: 4,
          background: 'rgba(58,58,58,0.04)',
          border: `1px solid ${FADE.slate06}`,
          borderRadius: 4,
          padding: 8,
          fontFamily: TYPE.mono,
          fontSize: 9.5,
          color: INV.stone,
          maxHeight: 220,
          overflowY: 'auto',
        }}>
          {calls.map((c, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <div style={{ color: INV.sienna }}>{c.name}({JSON.stringify(c.input)})</div>
              <div style={{ marginLeft: 12, color: FADE.slate60, whiteSpace: 'pre-wrap' }}>
                {summarizeResult(c.result)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function summarizeResult(r) {
  if (!r) return '(empty)';
  if (r.error) return `error: ${r.error}`;
  if (typeof r.count === 'number') return `→ ${r.count} row${r.count === 1 ? '' : 's'}`;
  if (r.sku) return `→ ${r.sku}`;
  return '→ ok';
}

function Empty({ onSuggestion }) {
  return (
    <div style={{ padding: '12px 4px' }}>
      <div style={{
        fontSize: 11,
        color: FADE.slate60,
        marginBottom: 12,
        fontFamily: TYPE.sans,
        lineHeight: 1.5,
      }}>
        Ask anything about your inventory data — SKUs, POs, mappings, OTB, or tracking history. The agent has read-only access to every store.
      </div>
      <div style={{
        fontSize: 9,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        color: FADE.slate60,
        marginBottom: 8,
        fontFamily: TYPE.sans,
      }}>
        Try asking
      </div>
      {SUGGESTED.map((s, i) => (
        <button
          key={i}
          onClick={() => onSuggestion(s)}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            background: 'transparent',
            border: `1px solid ${FADE.slate10}`,
            borderRadius: 4,
            padding: '8px 10px',
            marginBottom: 6,
            fontSize: 11,
            color: INV.slate,
            fontFamily: TYPE.sans,
            cursor: 'pointer',
            lineHeight: 1.4,
          }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
