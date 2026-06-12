// ImageAnnotator — draw RED boxes + RED text on one Cut & Sew call-out photo.
//
// A focused modal over a single image. Marks are normalized 0..1 of the photo so
// they line up in the editor, the live preview and the PDF at any size. The box
// move/resize math mirrors SwatchBoxEditor; the red is the call-out red #A32D2D.
//
// Controlled-on-commit: it keeps a local working copy and calls onChange only at
// gesture boundaries (add / move-end / resize-end / text edit / delete) — never on
// every pointer move — so the linked-block save path is not hammered mid-drag.

import { useRef, useState, useCallback, useEffect } from 'react';
import { FR } from './techPackConstants';
import { AssetImage } from './TechPackPrimitives';
import { newBox, newText } from '../../utils/cutSewAnnotations';

const RED = '#A32D2D';
const clamp01 = v => Math.max(0, Math.min(1, v));
const MIN = 0.04; // smallest box edge, as a fraction of the photo

const CORNERS = [
  { id: 'nw', cx: 0, cy: 0, cursor: 'nwse-resize' },
  { id: 'ne', cx: 1, cy: 0, cursor: 'nesw-resize' },
  { id: 'sw', cx: 0, cy: 1, cursor: 'nesw-resize' },
  { id: 'se', cx: 1, cy: 1, cursor: 'nwse-resize' },
];

const BTN = { fontFamily: "'Helvetica Neue', sans-serif", fontSize: 11, fontWeight: 600, padding: '7px 12px', borderRadius: 6, border: `1px solid ${FR.slate}`, background: 'transparent', color: FR.slate, cursor: 'pointer' };
const DEL = { position: 'absolute', top: -11, right: -11, width: 20, height: 20, borderRadius: 10, background: FR.slate, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 13, lineHeight: 1, zIndex: 3 };

// ── Read-only HTML overlay — for editor thumbnails / card previews ──
export function AnnotationOverlay({ annos, style }) {
  if (!annos || !annos.length) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...style }}>
      {annos.map(a => a.type === 'box' ? (
        <div key={a.id} style={{ position: 'absolute', left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${a.w * 100}%`, height: `${a.h * 100}%`, border: `2px solid ${RED}`, borderRadius: 2, boxSizing: 'border-box' }} />
      ) : (
        <div key={a.id} style={{ position: 'absolute', left: `${a.x * 100}%`, top: `${a.y * 100}%`, transform: 'translateY(-50%)', color: RED, fontWeight: 600, fontSize: 12, lineHeight: 1.1, fontFamily: "'Helvetica Neue', sans-serif", textShadow: '0 1px 2px rgba(255,255,255,0.75)', whiteSpace: 'nowrap', maxWidth: '96%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.text}</div>
      ))}
    </div>
  );
}

// ── Read-only SVG overlay — for the live preview / PDF, drawn over a slot rect ──
export function AnnotationSvg({ annos, x, y, w, h, keyPrefix = 'an' }) {
  if (!annos || !annos.length) return null;
  return (
    <>
      {annos.map((a, i) => a.type === 'box' ? (
        <rect key={`${keyPrefix}-${a.id || i}`} x={x + a.x * w} y={y + a.y * h} width={a.w * w} height={a.h * h}
          fill="none" stroke={RED} strokeWidth={2} rx={2} />
      ) : (
        <text key={`${keyPrefix}-${a.id || i}`} x={x + a.x * w} y={y + a.y * h} fill={RED} fontSize={11} fontWeight={600}
          fontFamily="'Helvetica Neue', sans-serif" dominantBaseline="middle">{a.text}</text>
      ))}
    </>
  );
}

// ── The interactive editor modal ──
export default function ImageAnnotator({ image, annos, onChange, onClose, title = 'Image', aspect = 1, fit = 'cover' }) {
  const wrapRef = useRef(null);
  const dragRef = useRef(null);
  const [items, setItems] = useState(() => (annos || []).map(a => ({ ...a })));
  const [selected, setSelected] = useState(null);
  const [editingId, setEditingId] = useState(null);

  // Local undo / redo. committedRef holds the last saved marks; itemsRef tracks
  // the live (possibly mid-drag) marks so gesture-ends can commit them.
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const committedRef = useRef(items);
  const histRef = useRef({ past: [], future: [] });

  // One funnel for every committed change — records history (unless nothing
  // actually changed) and saves.
  const commitItems = useCallback((next) => {
    if (JSON.stringify(next) === JSON.stringify(committedRef.current)) { itemsRef.current = next; setItems(next); return; }
    histRef.current.past.push(committedRef.current);
    histRef.current.future = [];
    committedRef.current = next;
    itemsRef.current = next;
    setItems(next);
    onChange(next);
  }, [onChange]);

  const undo = useCallback(() => {
    const h = histRef.current; if (!h.past.length) return;
    const prev = h.past.pop(); h.future.push(committedRef.current);
    committedRef.current = prev; itemsRef.current = prev;
    setItems(prev.map(a => ({ ...a }))); setSelected(null); setEditingId(null); onChange(prev);
  }, [onChange]);
  const redo = useCallback(() => {
    const h = histRef.current; if (!h.future.length) return;
    const next = h.future.pop(); h.past.push(committedRef.current);
    committedRef.current = next; itemsRef.current = next;
    setItems(next.map(a => ({ ...a }))); setSelected(null); setEditingId(null); onChange(next);
  }, [onChange]);

  const point = useCallback((e) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return null;
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  }, []);

  // Live drag — local state only (no onChange), committed on pointer-up.
  const onMove = useCallback((e) => {
    const d = dragRef.current; if (!d) return;
    const p = point(e); if (!p) return;
    setItems(prev => {
      const idx = prev.findIndex(it => it.id === d.id); if (idx < 0) return prev;
      const next = prev.slice();
      const b = d.box;
      if (d.mode === 'move') {
        if (b.type === 'box') {
          next[idx] = { ...b, x: clamp01(Math.min(Math.max(0, p.x - d.grab.x), 1 - b.w)), y: clamp01(Math.min(Math.max(0, p.y - d.grab.y), 1 - b.h)) };
        } else {
          next[idx] = { ...b, x: clamp01(p.x - d.grab.x), y: clamp01(p.y - d.grab.y) };
        }
      } else {
        let { x, y, w, h } = b; const right = x + w, bottom = y + h;
        if (d.mode.includes('w')) { x = clamp01(Math.min(p.x, right - MIN)); w = right - x; }
        if (d.mode.includes('e')) { w = clamp01(Math.max(p.x, x + MIN)) - x; }
        if (d.mode.includes('n')) { y = clamp01(Math.min(p.y, bottom - MIN)); h = bottom - y; }
        if (d.mode.includes('s')) { h = clamp01(Math.max(p.y, y + MIN)) - y; }
        next[idx] = { ...b, x, y, w, h };
      }
      itemsRef.current = next;
      return next;
    });
  }, [point]);

  const endDrag = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    commitItems(itemsRef.current); // commit the finished gesture (records history)
  }, [commitItems]);

  useEffect(() => {
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', endDrag); };
  }, [onMove, endDrag]);

  const startMove = (it) => (e) => {
    if (editingId) return;
    e.preventDefault(); e.stopPropagation();
    setSelected(it.id);
    const p = point(e); if (!p) return;
    dragRef.current = { mode: 'move', id: it.id, box: { ...it }, grab: { x: p.x - it.x, y: p.y - it.y } };
  };
  const startResize = (it, cid) => (e) => {
    e.preventDefault(); e.stopPropagation();
    setSelected(it.id);
    dragRef.current = { mode: cid, id: it.id, box: { ...it } };
  };

  const addBox  = () => { const b = newBox();  commitItems([...itemsRef.current, b]); setSelected(b.id); setEditingId(null); };
  const addText = () => { const t = newText(); commitItems([...itemsRef.current, t]); setSelected(t.id); setEditingId(t.id); };
  const removeItem = (id) => { commitItems(itemsRef.current.filter(it => it.id !== id)); if (selected === id) setSelected(null); if (editingId === id) setEditingId(null); };
  const editText = (id, text) => setItems(prev => { const next = prev.map(it => it.id === id ? { ...it, text } : it); itemsRef.current = next; return next; });
  const commitText = () => { setEditingId(null); commitItems(itemsRef.current); };

  // Keyboard: Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z (or Ctrl+Y) redo, Delete/
  // Backspace removes the selected mark. While editing text, leave the keys to
  // the input (native text undo / character delete).
  useEffect(() => {
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      const tag = (e.target?.tagName || '').toLowerCase();
      const inText = editingId != null || tag === 'input' || tag === 'textarea';
      const k = e.key.toLowerCase();
      if (meta && k === 'z' && !inText) { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) redo(); else undo(); return; }
      if (meta && k === 'y' && !inText) { e.preventDefault(); e.stopPropagation(); redo(); return; }
      if (!inText && (e.key === 'Delete' || e.key === 'Backspace') && selected != null) { e.preventDefault(); removeItem(selected); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, editingId, undo, redo]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div onPointerDown={onClose} data-annotator="open"
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(58,58,58,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onPointerDown={e => e.stopPropagation()}
        style={{ background: FR.salt, borderRadius: 10, padding: 18, width: 'min(92vw, 720px)', maxHeight: '92vh', overflow: 'auto', boxShadow: '0 18px 60px rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 19, color: FR.slate, marginRight: 'auto' }}>{title}</span>
          <button onClick={addBox} style={BTN}><span style={{ color: RED, fontWeight: 700 }}>+</span> Box</button>
          <button onClick={addText} style={BTN}><span style={{ color: RED, fontWeight: 700 }}>+</span> Text</button>
          <button onClick={onClose} style={{ ...BTN, background: FR.slate, color: FR.salt, borderColor: FR.slate }}>Done</button>
        </div>

        <div ref={wrapRef} onPointerDown={() => { setSelected(null); if (editingId) commitText(); }}
          style={{ position: 'relative', width: '100%', aspectRatio: `${aspect}`, background: '#1c1c1c', borderRadius: 6, overflow: 'hidden', userSelect: 'none', touchAction: 'none' }}>
          {image
            ? <AssetImage image={image} alt={title} style={{ width: '100%', height: '100%', objectFit: fit, display: 'block', pointerEvents: 'none' }} />
            : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: FR.stone, fontSize: 12 }}>No image to annotate</div>}

          {items.map(it => it.type === 'box' ? (
            <div key={it.id} onPointerDown={startMove(it)}
              style={{ position: 'absolute', left: `${it.x * 100}%`, top: `${it.y * 100}%`, width: `${it.w * 100}%`, height: `${it.h * 100}%`, border: `2px solid ${RED}`, background: selected === it.id ? 'rgba(163,45,45,0.10)' : 'transparent', boxSizing: 'border-box', cursor: 'move', borderRadius: 2 }}>
              {selected === it.id && (
                <>
                  <div onPointerDown={e => { e.stopPropagation(); removeItem(it.id); }} title="Delete box" style={DEL}>×</div>
                  {CORNERS.map(c => (
                    <div key={c.id} onPointerDown={startResize(it, c.id)}
                      style={{ position: 'absolute', left: `${c.cx * 100}%`, top: `${c.cy * 100}%`, width: 13, height: 13, transform: 'translate(-50%,-50%)', background: FR.salt, border: `2px solid ${RED}`, borderRadius: 3, cursor: c.cursor }} />
                  ))}
                </>
              )}
            </div>
          ) : (
            <div key={it.id} onPointerDown={startMove(it)} onDoubleClick={() => setEditingId(it.id)}
              style={{ position: 'absolute', left: `${it.x * 100}%`, top: `${it.y * 100}%`, transform: 'translateY(-50%)', cursor: 'move' }}>
              {editingId === it.id ? (
                <input autoFocus value={it.text}
                  onChange={e => editText(it.id, e.target.value)}
                  onBlur={commitText}
                  onKeyDown={e => { if (e.key === 'Enter') commitText(); }}
                  onPointerDown={e => e.stopPropagation()}
                  style={{ font: "600 13px 'Helvetica Neue', sans-serif", color: RED, background: 'rgba(255,255,255,0.88)', border: `1px dashed ${RED}`, borderRadius: 3, padding: '1px 3px', outline: 'none', minWidth: 60 }} />
              ) : (
                <span onClick={e => { e.stopPropagation(); setSelected(it.id); }}
                  style={{ position: 'relative', display: 'inline-block', color: RED, fontWeight: 600, fontSize: 13, fontFamily: "'Helvetica Neue', sans-serif", textShadow: '0 1px 2px rgba(255,255,255,0.75)', whiteSpace: 'nowrap', outline: selected === it.id ? `1px dashed ${RED}` : 'none', outlineOffset: 2 }}>
                  {it.text || 'text'}
                  {selected === it.id && (
                    <span onPointerDown={e => { e.stopPropagation(); removeItem(it.id); }} title="Delete text" style={{ ...DEL, top: -9, right: -16, width: 16, height: 16, fontSize: 11 }}>×</span>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>

        <p style={{ fontSize: 10.5, color: FR.stone, marginTop: 8, fontStyle: 'italic' }}>
          <b style={{ color: RED }}>+ Box</b> draws a red rectangle — drag it to move, drag a corner to resize.&nbsp;
          <b style={{ color: RED }}>+ Text</b> adds red writing — drag to move, double-click to edit.&nbsp;
          Select something, then <b>×</b> or <b>Delete</b> removes it. <b>⌘Z</b> undo · <b>⌘⇧Z</b> redo. <b>Done</b> closes and saves.
        </p>
      </div>
    </div>
  );
}
