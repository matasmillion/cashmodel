// Cut & Sew cost — conversational refinement panel.
// Sits below the AI Estimate block on the Stitching step. Lets the operator
// argue with the AI's estimate, paste factory quotes for sanity-checking,
// and converge on a final CMT number — all grounded in the pack's actual
// spec (stitch ops, pattern pieces, vendor SAM rate) so the AI can't
// hand-wave with a generic benchmark.
//
// Scope is locked at the system prompt layer (see aiLaborCostChat.js):
// the assistant is told explicitly NOT to fold fabric / trim / treatment /
// embellishment / vendor-markup cost into its number, because those are
// already counted on their own tech-pack steps. Doing so would double-count.

import { useState, useEffect, useRef } from 'react';
import { Send, RotateCcw } from 'lucide-react';
import { FR } from './techPackConstants';
import { getVendor } from '../../utils/vendorLibrary';
import {
  sendCostChatMessage,
  buildSpecContext,
  stripSuggestionMarker,
} from '../../utils/aiLaborCostChat';

export default function CutSewCostChat({ data, set, sectionLabel }) {
  const chat = data.cutSewLaborCostChat || [];
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat.length, busy]);

  const vendorName = data.vendor || '';
  const vendor = vendorName ? getVendor(vendorName) : null;
  const meta = data.cutSewLaborCostMeta || null;
  const currentEstimate = {
    value: parseFloat(data.cutSewLaborCost) || null,
    low: meta?.low ?? null,
    high: meta?.high ?? null,
    mode: meta?.mode || 'manual',
    reasoning: meta?.reasoning || '',
  };

  // Build the spec block fresh each turn so any pack edits the operator
  // made between messages flow into the next AI reply.
  const buildSpecBlock = () => buildSpecContext({
    vendor: {
      name: vendor?.name || vendorName,
      country: vendor?.country || '',
      city: vendor?.city || '',
      samRateUsdPerMin: vendor?.samRateUsdPerMin || '',
      markupPct: vendor?.markupPct || '',
    },
    garment: {
      styleName: data.styleName,
      styleNumber: data.styleNumber,
      productType: data.productType,
      designNotes: data.designNotes,
      keyFeatures: data.keyFeatures,
      fit: data.fit,
      fabricsCount: (data.pickedFabrics || []).length,
      fabricsList: (data.pickedFabrics || []).map(f => f.role || f.component).filter(Boolean).join(', '),
      fabricFinishes: (data.pickedFabrics || []).flatMap(f => (f.chosenFinishes || f.finishes || [])),
      trimsCount: (data.pickedTrims || []).length,
      stitchOperations: data.seams || [],
      patternPieces: data.patternPieces || [],
      embellishments: data.artworkPlacements || [],
      treatmentsCount:
        (data.treatmentWashTypes || []).filter(t => t.name).length +
        (data.treatments || []).filter(t => t.treatment).length +
        (data.distressing || []).filter(d => d.technique).length,
    },
    currentEstimate,
  });

  const send = async () => {
    const userText = draft.trim();
    if (!userText || busy) return;
    setBusy(true);
    setError(null);
    try {
      // First turn: prepend the spec context so the model is grounded.
      // Subsequent turns rely on conversation history; the spec doesn't
      // need to be re-sent every time because it's in the model's context.
      const isFirst = chat.length === 0;
      const firstContent = isFirst ? `${buildSpecBlock()}\n\n# OPERATOR MESSAGE\n${userText}` : userText;
      const userMessage = { role: 'user', content: firstContent, displayContent: userText };
      const apiMessages = [...chat, userMessage].map(m => ({ role: m.role, content: m.content }));
      const reply = await sendCostChatMessage({ messages: apiMessages });
      const assistantMessage = {
        role: 'assistant',
        content: reply.text,
        suggestedValue: reply.suggestedValue,
        suggestedRange: reply.suggestedRange,
      };
      set('cutSewLaborCostChat', [...chat, userMessage, assistantMessage]);
      setDraft('');
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    set('cutSewLaborCostChat', []);
    setError(null);
    setDraft('');
  };

  const applySuggestion = (value) => {
    if (!Number.isFinite(value) || value <= 0) return;
    set('cutSewLaborCost', String(value.toFixed(2)));
    set('cutSewLaborCostMeta', {
      ...(meta || {}),
      value,
      reasoning: `Refined via Cut & Sew chat (${new Date().toLocaleString()}).`,
      mode: 'chat_refined',
      generatedAt: new Date().toISOString(),
    });
  };

  const seamCount = (data.seams || []).filter(s => s.operation).length;
  const pieceCount = (data.patternPieces || []).filter(p => p.pieceName).length;

  return (
    <div style={{ marginTop: 14, padding: '14px 16px', background: FR.white, border: `1px solid ${FR.sand}`, borderRadius: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <label style={sectionLabel}>Cost Chat · Refine the estimate</label>
        {chat.length > 0 && (
          <button
            onClick={reset}
            title="Clear chat history"
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'transparent', color: FR.stone, border: `1px solid ${FR.sand}`, borderRadius: 3, fontSize: 10, cursor: 'pointer' }}>
            <RotateCcw size={10} /> Reset
          </button>
        )}
      </div>

      <p style={{ fontSize: 11, color: FR.stone, marginTop: -2, marginBottom: 10, lineHeight: 1.5 }}>
        Argue with the estimate, paste a factory quote for sanity-check, or ask the AI to break down the SAM math. Grounded in your {seamCount} stitch operation{seamCount === 1 ? '' : 's'} and {pieceCount} pattern piece{pieceCount === 1 ? '' : 's'}{vendor?.samRateUsdPerMin ? `, at vendor's $${vendor.samRateUsdPerMin}/SAM-min` : ', at regional CMT benchmark'}. Fabric, trim, embellishment, treatment, and vendor markup costs are <strong>excluded</strong> — those live on their own tech-pack steps.
      </p>

      <div
        ref={scrollRef}
        style={{
          maxHeight: 320, minHeight: chat.length === 0 ? 0 : 120,
          overflowY: 'auto',
          marginBottom: 10,
          padding: chat.length === 0 ? 0 : '8px 0',
          borderTop: chat.length === 0 ? 'none' : `1px solid ${FR.sand}`,
          borderBottom: chat.length === 0 ? 'none' : `1px solid ${FR.sand}`,
        }}>
        {chat.map((msg, i) => (
          <ChatBubble
            key={i}
            role={msg.role}
            text={msg.role === 'assistant' ? stripSuggestionMarker(msg.content) : (msg.displayContent || msg.content)}
            suggestedValue={msg.suggestedValue}
            suggestedRange={msg.suggestedRange}
            onApply={applySuggestion}
            currentValue={parseFloat(data.cutSewLaborCost) || 0}
          />
        ))}
        {busy && (
          <div style={{ padding: '8px 12px', fontSize: 11, color: FR.stone, fontStyle: 'italic' }}>
            Thinking…
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginBottom: 8, padding: '6px 10px', background: '#fbeaea', border: '1px solid #e7c5c5', borderRadius: 4, fontSize: 11, color: '#A32D2D' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={chat.length === 0
            ? 'e.g. "My vendor quoted $4.20 — is that fair for this spec?" or "Break down the SAM minutes for this hoodie."'
            : 'Reply…'}
          rows={2}
          disabled={busy}
          style={{
            flex: 1, padding: '8px 10px',
            border: `1px solid ${FR.sand}`, borderRadius: 4,
            fontSize: 12, color: FR.slate, background: FR.salt,
            fontFamily: "'Helvetica Neue',sans-serif",
            outline: 'none', resize: 'vertical', minHeight: 36, maxHeight: 200,
          }}
        />
        <button
          onClick={send}
          disabled={busy || !draft.trim()}
          title="Send (⌘/Ctrl + Enter)"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '8px 14px',
            background: busy || !draft.trim() ? FR.sand : FR.slate,
            color: busy || !draft.trim() ? FR.stone : FR.salt,
            border: 'none', borderRadius: 4,
            fontSize: 11, fontWeight: 600,
            cursor: busy || !draft.trim() ? 'not-allowed' : 'pointer',
          }}>
          <Send size={12} /> Send
        </button>
      </div>
    </div>
  );
}

function ChatBubble({ role, text, suggestedValue, suggestedRange, onApply, currentValue }) {
  const isUser = role === 'user';
  const applyValue = suggestedRange ? suggestedRange[0] : suggestedValue;
  const showApply = applyValue != null && Number.isFinite(applyValue) && applyValue > 0
                    && Math.abs(applyValue - currentValue) > 0.005;
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 8,
    }}>
      <div style={{
        maxWidth: '88%',
        padding: '8px 12px',
        background: isUser ? FR.salt : FR.white,
        border: `1px solid ${FR.sand}`,
        borderRadius: 8,
        fontSize: 12,
        color: FR.slate,
        lineHeight: 1.55,
        fontFamily: "'Helvetica Neue',sans-serif",
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {text}
        {showApply && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${FR.sand}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 10, color: FR.stone }}>
              Suggested CMT: <strong style={{ color: FR.slate, fontFamily: "ui-monospace, Menlo, monospace" }}>${applyValue.toFixed(2)}</strong>
              {suggestedRange && (
                <span style={{ color: FR.stone, marginLeft: 4 }}>
                  (range ${suggestedRange[0].toFixed(2)}–${suggestedRange[1].toFixed(2)})
                </span>
              )}
            </span>
            <button
              onClick={() => onApply(applyValue)}
              style={{ padding: '4px 10px', background: FR.slate, color: FR.salt, border: 'none', borderRadius: 3, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Apply ${applyValue.toFixed(2)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
