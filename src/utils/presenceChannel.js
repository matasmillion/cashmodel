// Realtime presence + row-change subscription for builder views.
//
// Two surfaces:
//
//   joinPresence(rowKey, { userId, displayName })
//      → { peers$, leave }
//   Mounts a Supabase Realtime presence channel keyed on the row id.
//   `peers$` is an EventTarget that fires `change` events with detail =
//   array of { userId, displayName } for every OTHER editor currently
//   in the channel (the local user is filtered out). `leave()` untracks
//   and unsubscribes — call it on unmount.
//
//   subscribeRowChanges(table, id, onChange)
//      → unsubscribe
//   Subscribes to postgres_changes on a specific row. `onChange` is
//   invoked with the new row whenever another device commits an UPDATE.
//   Used by builders to silently merge in remote changes when there's
//   no in-flight local edit.
//
// Both helpers are no-ops when Supabase isn't enabled or the auth'd
// client isn't ready, so callers don't need to guard.

import { IS_SUPABASE_ENABLED, getAuthedSupabase } from '../lib/supabase';

function makeEmitter() {
  const target = new EventTarget();
  return {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
}

export function joinPresence(rowKey, { userId, displayName }) {
  const peers$ = makeEmitter();
  let channel = null;
  let cancelled = false;

  const setup = async () => {
    if (!IS_SUPABASE_ENABLED || !rowKey || !userId) return;
    const db = await getAuthedSupabase();
    if (!db || cancelled) return;

    channel = db.channel(`presence:${rowKey}`, {
      config: { presence: { key: userId } },
    });

    const emitChange = () => {
      const state = channel.presenceState() || {};
      const peers = [];
      for (const [key, entries] of Object.entries(state)) {
        if (key === userId) continue;
        const meta = Array.isArray(entries) ? entries[0] : entries;
        peers.push({
          userId: key,
          displayName: meta?.displayName || meta?.userId || key,
        });
      }
      peers$.dispatchEvent(new CustomEvent('change', { detail: peers }));
    };

    channel
      .on('presence', { event: 'sync' }, emitChange)
      .on('presence', { event: 'join' }, emitChange)
      .on('presence', { event: 'leave' }, emitChange)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && !cancelled) {
          await channel.track({ userId, displayName: displayName || userId });
        }
      });
  };

  setup();

  const leave = async () => {
    cancelled = true;
    if (channel) {
      try { await channel.untrack(); } catch { /* best-effort */ }
      try { await channel.unsubscribe(); } catch { /* best-effort */ }
      channel = null;
    }
  };

  return { peers$, leave };
}

export function subscribeRowChanges(table, id, onChange) {
  if (!IS_SUPABASE_ENABLED || !table || !id || typeof onChange !== 'function') {
    return () => {};
  }
  let channel = null;
  let cancelled = false;

  const setup = async () => {
    const db = await getAuthedSupabase();
    if (!db || cancelled) return;
    channel = db
      .channel(`row:${table}:${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table, filter: `id=eq.${id}` },
        (payload) => {
          if (cancelled) return;
          if (payload?.new) onChange(payload.new);
        },
      )
      .subscribe();
  };

  setup();

  return () => {
    cancelled = true;
    if (channel) {
      try { channel.unsubscribe(); } catch { /* best-effort */ }
      channel = null;
    }
  };
}
