// useRecordLock — acquire a single-writer check-out on a record for the life of
// an editor view. Hard lock, auto-expire only (no manual override):
//   • acquired      → you're the editor; we heartbeat every 30s to hold it.
//   • locked        → someone else holds it; you're read-only and we poll every
//                     15s so you auto-promote the moment they release / it
//                     expires (90s TTL backstops a crashed/closed tab).
//   • offline       → no cloud (solo/offline); editing is allowed, re-acquired
//                     for real on reconnect.
//
// Release happens on unmount and on pagehide (best-effort); the TTL covers
// anything the release misses. Returns { status, readOnly, holder }.

import { useEffect, useRef, useState } from 'react';
import { useCurrentUser } from '../lib/auth';
import { acquireLock, heartbeatLock, releaseLock } from '../utils/recordLockStore';

const HEARTBEAT_MS = 30000;
const POLL_MS = 15000;

export function useRecordLock(resourceType, resourceId, { enabled = true } = {}) {
  const user = useCurrentUser();
  const userId = user?.id || null;
  const userName = user?.name || user?.email || '';
  const [state, setState] = useState({ status: 'pending', readOnly: false, holder: null });
  const heldRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!enabled || !resourceType || !resourceId || !userId) {
      setState({ status: 'disabled', readOnly: false, holder: null });
      return;
    }
    let cancelled = false;
    heldRef.current = false;

    const clearTimer = () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };

    const startHeartbeat = () => {
      clearTimer();
      timerRef.current = setInterval(() => {
        heartbeatLock(resourceType, resourceId, userId).then((ok) => {
          if (!ok && !cancelled) tryAcquire(); // lost it (expired + stolen) — re-evaluate
        });
      }, HEARTBEAT_MS);
    };

    const startPolling = () => {
      clearTimer();
      timerRef.current = setInterval(() => { tryAcquire(); }, POLL_MS);
    };

    const tryAcquire = async () => {
      const res = await acquireLock(resourceType, resourceId, userId, userName);
      if (cancelled) return;
      if (res.acquired) {
        heldRef.current = !res.offline; // only a real cloud lock needs releasing
        setState({ status: res.offline ? 'offline' : 'acquired', readOnly: false, holder: null });
        startHeartbeat();
      } else {
        heldRef.current = false;
        setState({ status: 'locked', readOnly: true, holder: res.holder });
        startPolling();
      }
    };

    tryAcquire();

    const onPageHide = () => { if (heldRef.current) releaseLock(resourceType, resourceId, userId); };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      cancelled = true;
      clearTimer();
      window.removeEventListener('pagehide', onPageHide);
      if (heldRef.current) releaseLock(resourceType, resourceId, userId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceType, resourceId, userId, enabled]);

  return state;
}
