// @ts-check
// Clerk token acquisition — the single chokepoint every store, sync helper
// and AI-generation call funnels through to get a Supabase-bound JWT.
//
// This file is intentionally free of any `@clerk/clerk-react` import so it
// can be unit-tested in plain Node (see clerkToken.test.mjs). It reads the
// global Clerk instance off `globalThis.window.Clerk` (mounted by
// <ClerkProvider/> at boot) and nothing else.
//
// Why this exists as its own module:
//   The previous implementation did `try { ... } catch { return null }`,
//   which swallowed the *real* Clerk error and left every call site to
//   render a misleading "Sign in first" — even when the user was signed in
//   and the true cause was a transient network blip, a not-yet-hydrated
//   Clerk instance during the first render, or a missing JWT template.
//
// What this module guarantees:
//   1. Boot-race safe   — waits (bounded) for Clerk to hydrate before
//                          declaring "no session", so a store that fires
//                          during the first paint doesn't false-negative.
//   2. Transient-proof  — retries getToken() with backoff on network/5xx
//                          style failures (the documented cause of three
//                          parallel view-gen calls all seeing null).
//   3. Honest           — captures the real error + a classified `kind`
//                          (getLastClerkTokenError) and turns it into an
//                          actionable operator message (describeAuthFailure)
//                          instead of "Sign in first".
//   4. Fast on success  — zero added latency when a session is present and
//                          the first getToken() resolves.

/**
 * @typedef {'no_clerk'|'no_session'|'no_template'|'no_org'|'null_token'|'transient'|'session'|'unknown'} AuthFailureKind
 * @typedef {{ kind: AuthFailureKind, message: string, at: number, template?: string }} AuthFailure
 */

/** @type {AuthFailure | null} */
let _lastError = null;

// Backoff before retry attempts 2, 3, 4. Overridable in tests so the suite
// doesn't sleep for real seconds. Only transient / null-token failures wait;
// permanent failures (no template, signed out) return immediately.
let _retryDelaysMs = [250, 500, 1000];
// Boot-race poll: how often / how long we wait for Clerk to hydrate.
let _waitPollMs = 120;
let _waitMaxMs = 4000;

/** Test-only: shrink retry backoff so the suite runs instantly. */
export function __setRetryDelaysForTest(arr) { _retryDelaysMs = arr; }
/** Test-only: shrink the boot-race wait window. */
export function __setWaitConfigForTest({ pollMs, maxMs } = {}) {
  if (typeof pollMs === 'number') _waitPollMs = pollMs;
  if (typeof maxMs === 'number') _waitMaxMs = maxMs;
}
/** Test-only: clear captured error state between cases. */
export function __resetAuthErrorForTest() { _lastError = null; }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getClerk() {
  if (typeof globalThis === 'undefined') return null;
  const w = /** @type {any} */ (globalThis).window;
  return w?.Clerk ?? null;
}

/**
 * Map a thrown Clerk error (or a silent null) onto a stable failure kind so
 * the UI and retry policy can branch on it without string-sniffing.
 * @param {unknown} err
 * @returns {AuthFailureKind}
 */
function classifyTokenError(err) {
  const msg = String(/** @type {any} */ (err)?.message || err || '').toLowerCase();
  if (/no jwt template|jwt template|template exists|unknown template|template .*not found|not found.*template/.test(msg)) return 'no_template';
  if (/network|failed to fetch|timeout|timed out|load failed|connection|econn|fetch failed|503|502|504|gateway/.test(msg)) return 'transient';
  if (/expired|invalid token|invalid jwt|unauthor|revoked|session/.test(msg)) return 'session';
  if (/org|organization/.test(msg)) return 'no_org';
  return 'unknown';
}

function record(kind, message, template) {
  _lastError = { kind, message: String(message), at: Date.now(), template };
}

/**
 * Bounded wait for Clerk to finish hydrating. A signed-in user always ends
 * up with `.session`; `.loaded` flips true once Clerk is ready either way.
 * Returns whatever Clerk instance we end up with (possibly null/sessionless).
 * @returns {Promise<any>}
 */
async function waitForClerk() {
  const start = Date.now();
  let clerk = getClerk();
  while (Date.now() - start < _waitMaxMs) {
    clerk = getClerk();
    if (clerk && (clerk.session || clerk.loaded)) return clerk;
    await sleep(_waitPollMs);
  }
  return getClerk();
}

/**
 * Async — fetch a Clerk-issued JWT under the named template ("supabase" by
 * default) for authenticating Supabase Edge Function calls and RLS-protected
 * reads. Returns null when no usable token can be minted; the reason is always
 * recorded (getLastClerkTokenError) and never silently swallowed.
 *
 * Pair with the Clerk Dashboard "supabase" JWT template (claim
 * `{ "org_id": "{{org.id}}" }`). See
 * https://clerk.com/docs/integrations/databases/supabase.
 *
 * @param {string} [template]
 * @param {{ skipCache?: boolean }} [opts]
 * @returns {Promise<string | null>}
 */
export async function getClerkToken(template = 'supabase', { skipCache = false } = {}) {
  if (typeof globalThis === 'undefined' || typeof (/** @type {any} */ (globalThis).window) === 'undefined') return null;

  let clerk = getClerk();
  // Boot race: the Clerk <script> is present but the instance hasn't hydrated
  // a session yet (common on the very first render / right after navigation).
  if (!clerk || (!clerk.session && !clerk.loaded)) {
    clerk = await waitForClerk();
  }
  if (!clerk) { record('no_clerk', 'Clerk has not loaded yet'); return null; }
  if (!clerk.session) { record('no_session', 'No active Clerk session (signed out)'); return null; }

  const attempts = _retryDelaysMs.length + 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      // Force a fresh mint on every retry — a stale cache is a common cause
      // of a token that exists but lacks the just-activated org's org_id.
      const token = await clerk.session.getToken({ template, skipCache: skipCache || attempt > 1 });
      if (token) { _lastError = null; return token; }

      // getToken resolved null without throwing. Most often: an org-scoped
      // template ({{org.id}}) with no active organization on the session.
      record('null_token', `Clerk issued no token for template "${template}" (no active organization?)`, template);
      if (attempt <= _retryDelaysMs.length) { await sleep(_retryDelaysMs[attempt - 1]); continue; }
      return null;
    } catch (err) {
      const kind = classifyTokenError(err);
      record(kind, /** @type {any} */ (err)?.message || err, template);
      console.warn(`[auth] getClerkToken("${template}") failed [${kind}]:`, /** @type {any} */ (err)?.message || err);
      // A missing template is a configuration fault — retrying cannot fix it.
      if (kind === 'no_template') return null;
      if (attempt <= _retryDelaysMs.length) { await sleep(_retryDelaysMs[attempt - 1]); continue; }
      return null;
    }
  }
  return null;
}

/** Decode a JWT payload without verifying the signature. */
function decodePayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '==='.slice((b64.length + 3) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/**
 * Decode the Clerk "supabase" JWT and return its org_id claim — the value
 * Postgres reads via auth.jwt() ->> 'org_id'. Using this claim (rather than
 * getCurrentOrgIdSync) as the request body's organization_id keeps the body
 * and the JWT in lock-step by construction.
 *
 * @param {{ skipCache?: boolean }} [opts]
 * @returns {Promise<string | null>}
 */
export async function getJwtOrgId({ skipCache = false } = {}) {
  const token = await getClerkToken('supabase', { skipCache });
  if (!token) return null;
  const payload = decodePayload(token);
  return payload?.org_id || null;
}

/**
 * The classified reason the most recent token acquisition failed, or null if
 * the last attempt succeeded. Consumed by Storage Health / Sync diagnostics.
 * @returns {AuthFailure | null}
 */
export function getLastClerkTokenError() { return _lastError; }

/**
 * Turn the current auth state + last failure into a single actionable
 * sentence for operators. This is what replaces the misleading "Sign in
 * first" at every call site.
 * @returns {string}
 */
export function describeAuthFailure() {
  const clerk = getClerk();
  if (!clerk) return 'Authentication is still loading — wait a moment and try again.';
  if (!clerk.session) return 'You appear to be signed out. Sign in again, then retry.';

  const e = _lastError;
  switch (e?.kind) {
    case 'no_template':
      return 'Auth misconfigured: the Clerk “supabase” JWT template is missing. An admin must create it in the Clerk dashboard (JWT Templates → “supabase”, with the claim { "org_id": "{{org.id}}" }), then sign out and back in.';
    case 'no_org':
    case 'null_token':
      return 'No active organization on your session. Pick an organization in the switcher (top-right), then retry. If one is already selected, sign out and back in to refresh the token.';
    case 'session':
      return 'Your session expired. Sign out and back in, then retry.';
    case 'transient':
      return 'Could not reach the authentication service (network blip). Check your connection and retry.';
    default:
      if (!clerk.organization) {
        return 'No active organization on your session. Pick an organization in the switcher (top-right), then retry.';
      }
      return 'Authentication is temporarily unavailable. Open Storage Health → Sync diagnostics for details, then retry.';
  }
}
