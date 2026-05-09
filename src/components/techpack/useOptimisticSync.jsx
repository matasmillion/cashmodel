// useOptimisticSync — shared hook that wraps every builder's interaction
// with the cloud OCC primitive.
//
// Responsibilities:
//   1. Track baseUpdatedAt for the row (the value at last successful read or
//      write). This is the precondition the next OCC update will check.
//   2. On a save returning { conflict: true, latest }, run the 3-way merge
//      against the user's current draft and the cloud's latest row:
//        - zero conflicts → silently advance baseUpdatedAt, call retrySave
//          with the merged patch, record auto-merge.
//        - real conflicts → mount <ConflictResolver />. On Apply, fold the
//          chosen values into the merged patch and call retrySave.
//   3. Subscribe to Realtime presence on the row and expose peers for
//      <PresencePill />.
//   4. Subscribe to postgres_changes on the row so when another device
//      commits an UPDATE, the builder can fold it into the draft via
//      applyRemote (called only when there's no in-flight local edit).
//
// Builders pass:
//   - table, id, entityLabel, initialUpdatedAt
//   - deepFields: keys whose value is a one-level-deep JSONB blob, e.g.
//     ['data'] for tech_packs/component_packs
//   - retrySave: (mergedPatch, newBase) => Promise<saveResult>
//     The builder's own debounced save function; the hook calls it with
//     the resolved merge plus the latest base updated_at.
//   - applyRemote: (newRow) => void
//     Lets the hook hand a remote-updated row back to the builder so the
//     visible draft refreshes when nothing local is pending.
//   - hasPendingEdits: () => boolean
//     The hook calls this before applying a remote change. If true, the
//     hook waits for the next save (auto-merge will pick up the diff).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ConflictResolver from './ConflictResolver';
import PresencePill from './PresencePill';
import { joinPresence, subscribeRowChanges } from '../../utils/presenceChannel';
import { threeWayMerge } from '../../utils/threeWayMerge';
import { recordAutoMerge } from '../../utils/atomCloudSync';
import { getCurrentUserIdSync } from '../../lib/auth';

export default function useOptimisticSync({
  table,
  id,
  entityLabel,
  initialUpdatedAt,
  deepFields = [],
  retrySave,
  applyRemote,
  hasPendingEdits,
  displayName = '',
}) {
  const [peers, setPeers] = useState([]);
  const [conflictState, setConflictState] = useState(null); // { conflicts, baseSnapshot, mineSnapshot, theirsSnapshot }
  const baseUpdatedAtRef = useRef(initialUpdatedAt || null);
  const baseSnapshotRef = useRef(null); // last-known full row at base time
  const userId = getCurrentUserIdSync();

  // Reset when row id changes (builder switched to a different record).
  useEffect(() => {
    baseUpdatedAtRef.current = initialUpdatedAt || null;
    baseSnapshotRef.current = null;
  }, [id, initialUpdatedAt]);

  // Realtime presence
  useEffect(() => {
    if (!table || !id || !userId) return undefined;
    const { peers$, leave } = joinPresence(`${table}:${id}`, {
      userId,
      displayName: displayName || userId,
    });
    const handler = (e) => setPeers(e.detail || []);
    peers$.addEventListener('change', handler);
    return () => {
      peers$.removeEventListener('change', handler);
      leave();
    };
  }, [table, id, userId, displayName]);

  // Realtime row changes — fold in cloud-side updates while idle.
  useEffect(() => {
    if (!table || !id || typeof applyRemote !== 'function') return undefined;
    const unsubscribe = subscribeRowChanges(table, id, (newRow) => {
      // If a save is mid-flight or the user is typing, leave the merge to
      // the next save round (auto-merge will pick the diff up).
      if (typeof hasPendingEdits === 'function' && hasPendingEdits()) return;
      baseUpdatedAtRef.current = newRow?.updated_at || baseUpdatedAtRef.current;
      baseSnapshotRef.current = newRow;
      try { applyRemote(newRow); } catch { /* defensive */ }
    });
    return unsubscribe;
  }, [table, id, applyRemote, hasPendingEdits]);

  // The builder calls this whenever it knows the cloud confirmed a write
  // or an initial load. It locks in the new "base" for the next OCC save.
  const setBase = useCallback((row) => {
    if (!row) return;
    if (row.updated_at) baseUpdatedAtRef.current = row.updated_at;
    baseSnapshotRef.current = row;
  }, []);

  // Builder calls this AFTER each save attempt, with:
  //   result: whatever the store's saveX returned ({ ok, row?, conflict?, latest?, error? })
  //   draft: the user's current in-memory draft (used for the merge)
  const handleSaveResult = useCallback(async (result, draft) => {
    if (!result) return result;
    if (result.ok && result.row) {
      setBase(result.row);
      return result;
    }
    if (result.conflict && result.latest) {
      const mergeResult = threeWayMerge(
        baseSnapshotRef.current || {},
        draft || {},
        result.latest,
        { deepFields },
      );
      if (mergeResult.conflicts.length === 0) {
        // Silent auto-merge: advance base to cloud's latest, retry save with
        // the merged patch. This is what makes "device A edited cost,
        // device B edited supplier" land both edits without prompting.
        baseSnapshotRef.current = result.latest;
        baseUpdatedAtRef.current = result.latest.updated_at;
        const retried = await retrySave(mergeResult.merged, result.latest.updated_at);
        if (retried?.ok && retried.row) setBase(retried.row);
        recordAutoMerge({
          table,
          id,
          fields: Object.keys(mergeResult.merged).slice(0, 20),
        });
        return retried || mergeResult;
      }
      // Real conflict: show the modal. Stash everything we need to retry.
      setConflictState({
        conflicts: mergeResult.conflicts,
        merged: mergeResult.merged,
        latest: result.latest,
      });
      return result;
    }
    return result;
  }, [deepFields, retrySave, setBase, table, id]);

  // Apply user resolution from the modal.
  const onApplyResolution = useCallback(async (resolutions) => {
    const state = conflictState;
    if (!state) return;
    // Fold the chosen values into the merged base.
    const finalPatch = { ...state.merged };
    for (const [key, value] of Object.entries(resolutions || {})) {
      // Resolution keys may be dotted (e.g. "data.colorway") for nested
      // fields. Apply by walking the path.
      if (key.includes('.')) {
        const [head, ...rest] = key.split('.');
        const sub = { ...(finalPatch[head] || {}) };
        let cursor = sub;
        for (let i = 0; i < rest.length - 1; i++) {
          cursor[rest[i]] = { ...(cursor[rest[i]] || {}) };
          cursor = cursor[rest[i]];
        }
        cursor[rest[rest.length - 1]] = value;
        finalPatch[head] = sub;
      } else {
        finalPatch[key] = value;
      }
    }
    setConflictState(null);
    baseSnapshotRef.current = state.latest;
    baseUpdatedAtRef.current = state.latest.updated_at;
    const retried = await retrySave(finalPatch, state.latest.updated_at);
    if (retried?.ok && retried.row) setBase(retried.row);
  }, [conflictState, retrySave, setBase]);

  const onCancelResolution = useCallback(() => setConflictState(null), []);

  const presencePill = useMemo(() => <PresencePill peers={peers} />, [peers]);

  const conflictUI = conflictState ? (
    <ConflictResolver
      entityLabel={entityLabel}
      conflicts={conflictState.conflicts}
      onApply={onApplyResolution}
      onCancel={onCancelResolution}
    />
  ) : null;

  const getBaseUpdatedAt = useCallback(() => baseUpdatedAtRef.current, []);

  return {
    presencePill,
    conflictUI,
    setBase,
    getBaseUpdatedAt,
    handleSaveResult,
  };
}
