// "Install app" button for the top bar. Gives users a visible, obvious way to
// install the PWA instead of hunting through the browser's own menus.
//
// Behaviour by platform:
//   • Chrome / Edge → captures the `beforeinstallprompt` event and fires the
//     native install prompt on click. Only appears once the app actually meets
//     installability (valid manifest + PNG icons + service worker).
//   • iOS Safari / macOS Safari → no programmatic prompt exists, so the button
//     shows a short how-to popover (Share → Add to Home Screen / File → Add to
//     Dock) instead.
//   • Already installed (standalone) or unsupported (e.g. Firefox) → hidden.

import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';

const FR = { slate: '#3A3A3A', sand: '#EBE5D5' };

function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;
}

function detectPlatform() {
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
  return { iOS, macSafari: isSafari && /Macintosh/.test(ua) && !iOS };
}

export default function InstallAppButton() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [showHint, setShowHint] = useState(false);
  const wrapRef = useRef(null);
  const { iOS, macSafari } = detectPlatform();

  useEffect(() => {
    if (installed) return undefined; // already running as an installed app
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [installed]);

  useEffect(() => {
    if (!showHint) return undefined;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowHint(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showHint]);

  if (installed) return null;

  const canPrompt = !!deferred;
  // Only render when there's an actionable path. Otherwise stay hidden so we
  // never show a dead button (e.g. Firefox, or Chrome before it's installable).
  if (!canPrompt && !iOS && !macSafari) return null;

  const onClick = async () => {
    if (canPrompt) {
      deferred.prompt();
      try { await deferred.userChoice; } catch { /* user dismissed */ }
      setDeferred(null);
    } else {
      setShowHint((h) => !h);
    }
  };

  const hint = iOS
    ? 'In Safari, tap the Share button (box with an up-arrow), then “Add to Home Screen.”'
    : 'In Safari: open the File menu (or the Share button) and choose “Add to Dock.”';

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={onClick}
        title="Install this app on your computer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 6,
          fontSize: 12, fontWeight: 500, letterSpacing: '0.02em',
          fontFamily: "'Inter', sans-serif",
          color: FR.slate, background: FR.sand,
          border: '0.5px solid rgba(58,58,58,0.12)', cursor: 'pointer',
        }}
      >
        <Download size={13} strokeWidth={1.6} /> Install app
      </button>
      {showHint && (
        <div
          role="status"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 244,
            background: '#fff', border: '0.5px solid rgba(58,58,58,0.12)', borderRadius: 8,
            padding: '10px 12px', boxShadow: '0 8px 24px rgba(58,58,58,0.10)',
            fontSize: 12, lineHeight: 1.5, color: FR.slate, zIndex: 60,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
