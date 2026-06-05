// Debounced subscription to the global 'plm-store-updated' event.
//
// The PLM list views (Styles, Trims, Fabrics, Treatments, Embellishments,
// Cut & Sew) each re-fetch and re-render their whole grid whenever this event
// fires. The background cloud sync dispatches it in bursts — especially against
// a slow Supabase project — so without debouncing the grids thrash: constant
// re-fetches, re-renders, and thumbnail re-resolves that never settle (the
// "Library is super laggy / images won't load" symptom).
//
// This coalesces a burst of events into a single refresh.

import { useEffect, useRef } from 'react';

export function usePlmStoreRefresh(onRefresh, { delay = 600 } = {}) {
  const cb = useRef(onRefresh);
  useEffect(() => { cb.current = onRefresh; });
  useEffect(() => {
    let timer = null;
    const handler = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (cb.current) cb.current(); }, delay);
    };
    window.addEventListener('plm-store-updated', handler);
    return () => { clearTimeout(timer); window.removeEventListener('plm-store-updated', handler); };
  }, [delay]);
}
