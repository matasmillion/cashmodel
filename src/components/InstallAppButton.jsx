// "Install app" button for the top bar. Always visible (until the app is
// actually installed) so it can't hide from the user. Behaviour:
//   • If Chrome/Edge handed us a one-click install prompt → fire it.
//   • Otherwise → show a short, browser-specific how-to (Chrome's own Install
//     menu, Safari's Add to Dock, iOS Add to Home Screen, etc.). This is the
//     reliable path: Chrome's prompt is flaky (needs page engagement, fires
//     once, can be missed), but its menu install always works.

import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { getInstallPrompt, onInstallPromptChange, clearInstallPrompt } from '../utils/pwaInstall';

const FR = { slate: '#3A3A3A', sand: '#EBE5D5' };

function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;
}

function detectBrowser() {
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isFirefox = /firefox|fxios/i.test(ua);
  const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
  const macSafari = isSafari && /Macintosh/.test(ua) && !iOS;
  return { iOS, isFirefox, macSafari };
}

function instructionsFor(b) {
  if (b.iOS) return 'In Safari, tap the Share button (the box with an up-arrow), then “Add to Home Screen.”';
  if (b.macSafari) return 'In Safari, open the File menu (or the Share button) and choose “Add to Dock.”';
  if (b.isFirefox) return 'Firefox can’t install web apps. Open this page in Chrome, Edge, or Safari, then use their Install option.';
  // Chrome / Edge / other Chromium.
  return 'Open the browser menu (the ⋮ at the top-right of Chrome). Choose “Cast, save, and share” → “Install page as app.” If you only see “Create shortcut,” click it and tick “Open as window.” Then confirm Install.';
}

export default function InstallAppButton() {
  const [prompt, setPrompt] = useState(() => getInstallPrompt());
  const [installed, setInstalled] = useState(() => isStandalone());
  const [hint, setHint] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => onInstallPromptChange((p) => setPrompt(p)), []);
  useEffect(() => {
    const onInstalled = () => setInstalled(true);
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);
  useEffect(() => {
    if (!hint) return undefined;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setHint(null); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [hint]);

  if (installed) return null;

  const onClick = async () => {
    if (prompt) {
      prompt.prompt();
      try { await prompt.userChoice; } catch { /* user dismissed */ }
      clearInstallPrompt();
      return;
    }
    setHint((h) => (h ? null : instructionsFor(detectBrowser())));
  };

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
      {hint && (
        <div
          role="status"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 280,
            background: '#fff', border: '0.5px solid rgba(58,58,58,0.12)', borderRadius: 8,
            padding: '11px 13px', boxShadow: '0 8px 24px rgba(58,58,58,0.10)',
            fontSize: 12, lineHeight: 1.55, color: FR.slate, zIndex: 60,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
