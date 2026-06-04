// Captures the one-shot `beforeinstallprompt` event as early as possible.
// Chrome fires it once, and sometimes before React has mounted the Install
// button — if we only listened from inside the component we'd miss it and the
// one-click install would silently never work. Imported for side effects in
// main.jsx so the listener is live from app start.

let deferredPrompt = null;
const listeners = new Set();

function emit() {
  for (const fn of listeners) {
    try { fn(deferredPrompt); } catch (err) { console.error('pwaInstall listener:', err); }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emit();
  });
}

/** The captured install prompt event, or null if Chrome hasn't offered one. */
export function getInstallPrompt() { return deferredPrompt; }

/** Clear after use (the event can only be used once). */
export function clearInstallPrompt() { deferredPrompt = null; emit(); }

/** Subscribe to prompt availability changes. Returns an unsubscribe fn. */
export function onInstallPromptChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
