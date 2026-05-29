// Connectivity tracker — single source of truth for "are we online?"
//
// Why this exists: the PLM stores are offline-first (localStorage primary,
// Supabase mirror). When the network drops, cloud writes are queued in the
// sync outbox (syncQueue.js) and flushed when connectivity returns. This
// module owns the online/offline signal and lets the queue + any UI chip
// subscribe to changes.
//
// navigator.onLine is the cheap baseline. It's not perfectly reliable (a
// laptop on wifi with no real internet still reports online), so the queue
// flush itself is the ultimate arbiter — a failed flush re-queues. This
// module just decides *when to try*.

const listeners = new Set();

/** @returns {boolean} */
export function isOnline() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

function emit() {
  const online = isOnline();
  for (const fn of listeners) {
    try { fn(online); } catch (err) { console.error('connectivity listener:', err); }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', emit);
  window.addEventListener('offline', emit);
}

/**
 * Subscribe to connectivity changes. Returns an unsubscribe function.
 * @param {(online: boolean) => void} fn
 */
export function onConnectivityChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
