// Three-way merge for optimistic-concurrency conflict resolution.
//
// Inputs:
//   base    — the row as it was when the user started editing
//   mine    — the user's draft (local, including unsaved keystrokes)
//   theirs  — the row as it currently exists in the cloud (after another
//             device beat us to the punch)
//
// Per-field rule:
//   - if mine === base and theirs === base   → no change            (skip)
//   - if mine !== base and theirs === base   → mine wins             (silent)
//   - if mine === base and theirs !== base   → theirs wins           (silent)
//   - if mine !== base and theirs !== base
//        and mine === theirs                  → both made the same change (silent)
//        else                                  → real conflict       (report)
//
// "===" here means deep equality, not reference equality.
//
// Returns { merged, conflicts }.
//   merged    — a new object with auto-applied non-conflicting changes.
//               For conflicting fields, `merged` contains `mine` (so the
//               draft surface still reflects what the user typed) — the
//               caller is expected to swap in the resolution before saving.
//   conflicts — [{ field, base, mine, theirs }] for fields that need user
//               attention. Empty array means it's safe to save `merged`
//               with the latest base updated_at.
//
// For tech_packs / component_packs, pass { deepFields: ['data'] } to
// merge one level into the JSONB body. Inside a deep field, each key is
// treated as a sub-field — its conflict label is `${field}.${subKey}`.

const DEFAULT_IGNORE = new Set([
  'id',
  'organization_id',
  'user_id',
  'created_at',
  'updated_at',
]);

function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

function mergeScalar(field, base, mine, theirs, conflicts) {
  const mineChanged = !deepEqual(mine, base);
  const theirsChanged = !deepEqual(theirs, base);
  if (!mineChanged && !theirsChanged) return base;
  if (mineChanged && !theirsChanged) return mine;
  if (!mineChanged && theirsChanged) return theirs;
  if (deepEqual(mine, theirs)) return mine;
  conflicts.push({ field, base, mine, theirs });
  return mine;
}

function mergeOneLevel(prefix, base, mine, theirs, conflicts) {
  const out = {};
  const keys = new Set([
    ...Object.keys(base || {}),
    ...Object.keys(mine || {}),
    ...Object.keys(theirs || {}),
  ]);
  for (const k of keys) {
    const sub = mergeScalar(
      `${prefix}.${k}`,
      base ? base[k] : undefined,
      mine ? mine[k] : undefined,
      theirs ? theirs[k] : undefined,
      conflicts,
    );
    if (sub !== undefined) out[k] = sub;
  }
  return out;
}

export function threeWayMerge(base, mine, theirs, opts = {}) {
  const ignore = new Set([...DEFAULT_IGNORE, ...(opts.ignoreFields || [])]);
  const deepFields = new Set(opts.deepFields || []);
  const conflicts = [];
  const merged = { ...mine };

  const allKeys = new Set([
    ...Object.keys(base || {}),
    ...Object.keys(mine || {}),
    ...Object.keys(theirs || {}),
  ]);

  for (const k of allKeys) {
    if (ignore.has(k)) {
      if (theirs && k in theirs) merged[k] = theirs[k];
      continue;
    }
    if (deepFields.has(k)) {
      const baseSub = base?.[k];
      const mineSub = mine?.[k];
      const theirsSub = theirs?.[k];
      const allObjects = (
        (!baseSub || (typeof baseSub === 'object' && !Array.isArray(baseSub))) &&
        (!mineSub || (typeof mineSub === 'object' && !Array.isArray(mineSub))) &&
        (!theirsSub || (typeof theirsSub === 'object' && !Array.isArray(theirsSub)))
      );
      if (allObjects) {
        merged[k] = mergeOneLevel(k, baseSub || {}, mineSub || {}, theirsSub || {}, conflicts);
        continue;
      }
      // fall through to scalar comparison if shapes don't align
    }
    merged[k] = mergeScalar(k, base?.[k], mine?.[k], theirs?.[k], conflicts);
  }

  return { merged, conflicts };
}

// Convenience: detect whether a result needs the conflict-resolver modal.
export function hasRealConflicts(result) {
  return Array.isArray(result?.conflicts) && result.conflicts.length > 0;
}
