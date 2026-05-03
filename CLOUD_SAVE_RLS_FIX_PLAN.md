# Cloud Save RLS Error — Fix Plan

**Branch:** `Cloud_File_Saving_Optimization`
**Audience:** Sonnet 4.6 (executor)
**Symptom:** Toast on TrimPack / ComponentPack save reads
`⚠︎ Cloud save failed (kept locally): new row violates row-level security policy for table "component_packs"`.
The local write succeeds; the cloud upsert is rejected with Postgres SQLSTATE `42501`.

---

## 1. Diagnosis

### 1.1 The RLS contract on `component_packs`

From `supabase/migrations/20260429000000_org_cloud_storage.sql` lines 24–26 and 193–207:

```sql
create or replace function public.jwt_org_id() returns text as $$
  select nullif(auth.jwt() ->> 'org_id', '')
$$ language sql stable;

create policy "org_insert" on public.component_packs
  for insert with check (organization_id = public.jwt_org_id());
create policy "org_update" on public.component_packs
  for update using (organization_id = public.jwt_org_id())
            with check (organization_id = public.jwt_org_id());
```

INSERT / UPDATE are accepted iff the row's `organization_id` literal equals `auth.jwt() ->> 'org_id'`.
The error means **the body's `organization_id` is not equal to the JWT's `org_id` claim** (either side can be wrong).

### 1.2 The save path

`src/utils/componentPackStore.js:281-303` builds the body as:

```js
const orgId = getCurrentOrgIdSync();                       // window.Clerk.organization.id
const db = await getAuthedSupabase();                      // adds Bearer <Clerk JWT>
const userId = getCurrentUserIdSync();
let patch = { id, organization_id: orgId, user_id: userId, ...corePatch };
await db.from('component_packs').upsert(patch, { onConflict: 'id' });
```

`getAuthedSupabase` (`src/lib/supabase.js:15-22`) calls
`getClerkToken('supabase')` (`src/lib/auth/index.js:122-131`) which is
`clerk.session.getToken({ template: 'supabase' })`. Clerk caches that
result for up to ~60 s.

### 1.3 The five plausible failure modes (ranked)

`StorageHealthPanel.jsx:540-604` already enumerates them in code; the `42501`
toast is exactly one of these:

| # | Failure mode | Symptom on the wire |
|---|---|---|
| **A** | JWT cache stale across org switch / fresh sign-in: token's `org_id` ≠ body's `orgId` | RLS denies (`42501`) |
| **B** | JWT template missing `"org_id": "{{org.id}}"` | `jwt_org_id()` is NULL → RLS denies |
| **C** | JWT signing key mismatch between Clerk template and Supabase JWT secret → Postgres can't verify the JWT and falls back to anon | `jwt_org_id()` is NULL → RLS denies (often paired with **401** in the network tab — which the screenshot also shows) |
| **D** | Top-level `role` claim ≠ `authenticated`/`anon`/`service_role` (Supabase rejects the JWT) | same as C |
| **E** | Pack id was created in a different org (multi-org user); existing cloud row has another org's `organization_id`; upsert UPDATE USING blocks → INSERT path retries and the WITH CHECK message bubbles up | RLS denies (`42501`) |

The console screenshot shows both:
- a **401** on `…/component_packs?on_conflict=id` (consistent with **C** or **D**)
- the **`42501`** RLS message (consistent with **A**, **B**, **C**, **D**, or **E**)

So the most defensible primary hypothesis is **A or C**: a stale token (most
likely) or a signing-key/role-claim configuration drift (less likely but
already flagged historically — see `1aecc4e docs(jwt): rename app-role JWT
claim to app_role to fix Storage 500s`).

### 1.4 Why this is reproducible *for this user, on this pack, right now*

- They opened the trim pack, edited it, hit Save — the auto-save debounce in
  `ComponentPackBuilder.jsx:344-354` plus the unmount flush at `:359-374`
  fire repeated upserts. Every one of them rebuilds a new Supabase client
  via `getAuthedSupabase()` → hence the **"Multiple GoTrueClient
  instances"** spam in the console (cosmetic, not the cause, but it confirms
  the path is hot).
- Local writes succeed (the toast says "kept locally"), so the user keeps
  editing, keeps triggering saves, keeps seeing the same toast.

---

## 2. Primary plan (highest confidence)

Goal: **Make the save self-heal against JWT staleness and surface
configuration drift loudly when the self-heal can't help.**

### 2.1 Singleton authed Supabase client (kills the GoTrueClient warning)

**File:** `src/lib/supabase.js`

Replace the per-call `createClient` with a memoization keyed on the bearer
token. Two clients max at any time: the bare anon `supabase` and one cached
`authed` client whose token matches the latest Clerk JWT.

```js
let cachedAuthed = { token: null, client: null };

export async function getAuthedSupabase() {
  if (!IS_SUPABASE_ENABLED) return null;
  const token = await getClerkToken('supabase');
  if (!token) return supabase;
  if (cachedAuthed.token === token && cachedAuthed.client) return cachedAuthed.client;
  cachedAuthed = {
    token,
    client: createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false }, // we control refresh
    }),
  };
  return cachedAuthed.client;
}

// New: force a fresh JWT and a new client. Used by the save retry path.
export async function refreshAuthedSupabase() {
  cachedAuthed = { token: null, client: null };
  return getAuthedSupabase();
}
```

Also extend `getClerkToken` (`src/lib/auth/index.js:122-131`) to accept an
options bag and forward `skipCache: true` to Clerk:

```js
export async function getClerkToken(template = 'supabase', { skipCache = false } = {}) {
  if (typeof window === 'undefined') return null;
  const clerk = window.Clerk;
  if (!clerk?.session) return null;
  try { return await clerk.session.getToken({ template, skipCache }); }
  catch { return null; }
}
```

When `refreshAuthedSupabase()` runs, internally call
`getClerkToken('supabase', { skipCache: true })` so the new client is built on a
freshly-minted token.

### 2.2 Use the JWT's `org_id` as the source of truth in the body

**File:** `src/utils/componentPackStore.js` (and mirror to `techPackStore.js`)

Before building the upsert body, decode the JWT once and **use its
`org_id` claim** (not `getCurrentOrgIdSync()`) to populate
`patch.organization_id`. The two-source design is what produces drift; one
source eliminates it by construction.

Add a tiny helper in `src/lib/auth/index.js`:

```js
export async function getJwtOrgId({ skipCache = false } = {}) {
  const token = await getClerkToken('supabase', { skipCache });
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '==='.slice((b64.length + 3) % 4);
    const payload = JSON.parse(atob(padded));
    return payload.org_id || null;
  } catch { return null; }
}
```

Then in `saveComponentPack` (`src/utils/componentPackStore.js:281-303`):

```js
const clientOrgId = getCurrentOrgIdSync();
if (!IS_SUPABASE_ENABLED || !clientOrgId) return { ok: true };

let jwtOrgId = await getJwtOrgId();
// If the JWT lags behind the UI org, force-refresh once before the first attempt.
if (!jwtOrgId || jwtOrgId !== clientOrgId) {
  jwtOrgId = await getJwtOrgId({ skipCache: true });
}
if (!jwtOrgId) {
  // Server can't verify — surface a deep-link error instead of attempting the upsert.
  return { ok: false, error: jwtMisconfiguredError() };
}

let db = await getAuthedSupabase();
const userId = getCurrentUserIdSync();
let patch = { id, organization_id: jwtOrgId, user_id: userId, ...corePatch };
```

Note: `corePatch` comes from `cleanedUpdates` whose caller in
`ComponentPackBuilder.jsx:261-269` does **not** pass `organization_id`, so
the spread can't clobber it. Keep an explicit `delete patch.organization_id`
guard above the rebuild if you want belt + suspenders.

### 2.3 Smart RLS retry inside the existing upsert loop

**File:** `src/utils/componentPackStore.js:300-362`

Add a branch in the same retry loop:

```js
const isRlsError = (err) => {
  const code = String(err?.code || '');
  const msg = String(err?.message || '').toLowerCase();
  return code === '42501' || /row-level security|row level security/.test(msg);
};

// ... inside for (let attempt = 0; attempt < 4; attempt++) {
if (isRlsError(error)) {
  // Force-refresh the JWT + client, re-derive org id from the fresh token,
  // and retry once. If org_id still differs from the row's, the row was
  // born under a different org — fall through to Backup B (id rotation).
  if (attempt === 0) {
    db = await refreshAuthedSupabase();
    const refreshed = await getJwtOrgId({ skipCache: true });
    if (refreshed) patch = { ...patch, organization_id: refreshed };
    continue;
  }
  break; // do not loop forever on persistent RLS denial
}
```

This handles failure mode **A** by definition. Stop retrying on the second
RLS error so we don't burn requests against a stuck state.

### 2.4 Make the toast actionable

**File:** `src/components/techpack/ComponentPackBuilder.jsx:270-273`

When `result.ok === false` and `result.error?.code === '42501'` (or the
message matches RLS), append a "Diagnose →" link to the toast that pushes
the hash route `#plm/storage-health` so the user lands directly in the
existing JWT diagnostics + live write test that
`StorageHealthPanel.jsx:540-660` already implements. No new diagnostic
work needed.

### 2.5 Verify

1. `git diff --stat` — touched files only:
   `src/lib/supabase.js`, `src/lib/auth/index.js`,
   `src/utils/componentPackStore.js`, `src/utils/techPackStore.js`,
   `src/components/techpack/ComponentPackBuilder.jsx`,
   `src/components/techpack/TechPackBuilder.jsx`.
2. `npm run lint && npm run build` — both must pass.
3. Manual repro: open a trim pack, edit a field, observe Save succeeds and
   the "Multiple GoTrueClient" warnings drop to one.
4. Open `#plm/storage-health` → JWT diagnostics + Run Cloud Write Test →
   both green. The same probe is the canonical proof that RLS will accept
   writes against this org going forward.

---

## 3. Backup plan A — JWT *configuration* is broken (not stale)

Trigger this plan if Primary 2.3 still fails with `42501` after a
`skipCache:true` refresh, or `getJwtOrgId()` returns null even when
Clerk reports an active org.

### 3.1 Fail-closed cloud writes with a banner

**File:** `src/utils/componentPackStore.js`

When `getJwtOrgId({ skipCache: true })` returns null, OR a server probe
`db.rpc('jwt_org_id')` returns null while the client-side decode shows a
non-null `org_id` claim, the JWT is structurally fine but Postgres can't
verify it. That's failure mode **C** (signing-key mismatch) or **D**
(wrong `role` claim). Both are dashboard-side fixes only.

Action:
- Stop attempting cloud upserts for the rest of the session — every retry
  is just noise. Set a module-level flag `cloudWritesFrozen = true`.
- Surface a single non-dismissable banner across the PLM shell (a new
  store helper `getCloudWritesFrozen()` that `PLMView.jsx` reads on
  mount and on every save error). Banner copy:
  > Cloud sync paused. Your edits are saved locally. The Clerk →
  > Supabase JWT template is misconfigured (`org_id` claim missing or
  > signing key mismatch). Open Storage Health for exact remediation
  > steps.
- Banner includes a button that hashes to `#plm/storage-health`.

### 3.2 Auto-detect the exact subcase

Reuse the existing decoder in `StorageHealthPanel.jsx:34-45` — lift it into
`src/lib/auth/index.js` so both the panel and the store share it. The
store can then distinguish:

| Decoded `org_id` | Decoded `role` | Server `jwt_org_id()` | Verdict |
|---|---|---|---|
| missing | any | NULL | "Add `org_id` to template" |
| present | not in {authenticated,anon,service_role} | NULL | "Rename top-level role to `app_role`" |
| present | authenticated | NULL | "Re-paste Supabase JWT secret into Clerk template signing key" |

Each verdict gets its own banner copy with the exact dashboard path.

### 3.3 Verify

- Toggle a *known-broken* template state (e.g., remove `org_id` from the
  Clerk JWT template in a staging Clerk app) and confirm the banner
  surfaces with the right verdict, no `42501` toasts spam, and the local
  edits still survive a refresh.

---

## 4. Backup plan B — pack id collides across orgs (multi-org user)

Trigger this plan if Primary 2.3 succeeds in producing a refreshed token
whose `org_id` matches the active org, but `42501` still fires. That
indicates the cloud row keyed by this `id` was inserted under a *different*
org and the current JWT cannot UPDATE it; the upsert's INSERT side then
fails the WITH CHECK because the conflicting PK forces it back to
UPDATE-mode where the existing org doesn't match.

### 4.1 Detect the collision

**File:** `src/utils/componentPackStore.js`

After two RLS retries fail:

```js
// Confirm the row is not visible to this org (RLS would hide it).
const { count } = await db.from('component_packs')
  .select('id', { count: 'exact', head: true })
  .eq('id', id);
const collisionLikely = (count === 0);
```

If `count` is `0` from this org's perspective but the upsert keeps failing
on RLS, we are looking at a cross-org PK collision (or a server-only row
this org cannot see).

### 4.2 Adopt-and-rotate id

When collision is confirmed:

1. Generate a new id: `const newId = crypto.randomUUID()`.
2. Insert the local row's `data + images` payload under `newId` with the
   correct `organization_id` and `user_id`. This is a fresh INSERT, not
   an upsert, so there is no PK conflict.
3. On success, mutate the localStorage entry's id to `newId` and remove
   the orphan entry under the old id.
4. Update any in-flight URL hash (`replacePLMHash({ packId: newId })` —
   already exposed at `ComponentPackBuilder.jsx:322-324`).
5. Show a quiet info toast: "Resolved: pack reassigned to a new id."

This is purely additive — Backup A's banner takes precedence if the JWT
itself is the problem, so we never silently rotate ids when the real bug
is template config.

### 4.3 Verify

- Manually pre-seed a cloud row in org B with id `X`, sign in as a user
  in org A whose localStorage carries id `X`, save → expect rotation
  to a fresh id and a clean upsert.
- Check `select id, organization_id from component_packs where id in (X, newId)`
  — both rows exist, no cross-talk.

---

## 5. Sequencing for Sonnet 4.6

1. **Primary 2.1 (singleton client)** — pure infra, low risk; lands first.
2. **Primary 2.2 (JWT-as-source-of-truth)** — depends on 2.1's `getClerkToken` extension.
3. **Primary 2.3 (smart RLS retry)** — depends on 2.2.
4. **Primary 2.4 (actionable toast)** — independent, can land in parallel.
5. Apply the same store changes to `techPackStore.js` (the comment at
   `:248` explicitly says it mirrors `saveComponentPack` — do not let
   them drift).
6. Manual smoke test against a real Clerk + Supabase pair before opening
   a PR. The `#plm/storage-health` write test is the gate.
7. If primary doesn't resolve the toast, **stop coding** and run the
   StorageHealth JWT diagnostic to disambiguate Backup A vs Backup B.
   Only the verdict from that panel should pick which backup to execute.

---

## 6. Out of scope (do not touch)

- `TechPackBuilder.jsx`, `ComponentPackBuilder.jsx`, `TreatmentBuilder.jsx`
  internal workflow — CLAUDE.md forbids non-additive changes here.
- Any append-only collections (`atom_usage`, `state_transition`,
  `agent_interaction`, `bom_snapshot`).
- Vendor-facing `/vendor/*` surfaces — distinct auth, distinct RLS,
  outside this bug's blast radius.
