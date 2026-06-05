// Hermetic unit tests for the Clerk token chokepoint. No network, no React,
// no Clerk SDK — we install a fake `globalThis.window.Clerk` and assert that
// every failure mode that used to surface a misleading "Sign in first" now:
//   • boot-race waits for hydration,
//   • retries transient failures,
//   • never retries permanent config faults,
//   • never swallows the real reason,
//   • produces an actionable operator message.
//
// Run: node --test src/lib/auth/clerkToken.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getClerkToken,
  getJwtOrgId,
  getLastClerkTokenError,
  describeAuthFailure,
  __setRetryDelaysForTest,
  __setWaitConfigForTest,
  __resetAuthErrorForTest,
} from './clerkToken.js';

// ── helpers ────────────────────────────────────────────────────────────────

function spy(impl) {
  const fn = async (...args) => { fn.calls += 1; return impl(...args); };
  fn.calls = 0;
  return fn;
}

function installClerk({ session = null, loaded = true, organization = { id: 'org_1' } } = {}) {
  globalThis.window = globalThis.window || {};
  globalThis.window.Clerk = { loaded, session, organization };
  return globalThis.window.Clerk;
}

function uninstallClerk() {
  if (globalThis.window) delete globalThis.window.Clerk;
}

// Build a real (unsigned) JWT string so getJwtOrgId can decode it.
function makeJwt(payload) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`;
}

// Keep test output clean — the catch path intentionally console.warns.
let _origWarn;
test.beforeEach(() => {
  _origWarn = console.warn;
  console.warn = () => {};
  __resetAuthErrorForTest();
  __setRetryDelaysForTest([1, 1, 1]); // ~instant backoff
  __setWaitConfigForTest({ pollMs: 5, maxMs: 500 });
  uninstallClerk();
});
test.afterEach(() => { console.warn = _origWarn; uninstallClerk(); });

// ── happy path ───────────────────────────────────────────────────────────--

test('returns the token on the first try when signed in', async () => {
  const getToken = spy(async () => 'tok_ok');
  installClerk({ session: { getToken } });
  const t = await getClerkToken('supabase');
  assert.equal(t, 'tok_ok');
  assert.equal(getToken.calls, 1, 'no needless retries on success');
  assert.equal(getLastClerkTokenError(), null, 'success clears last error');
});

// ── transient blip (the documented "three parallel calls all see null") ─────

test('retries a transient failure and recovers', async () => {
  let n = 0;
  const getToken = spy(async () => {
    n += 1;
    if (n === 1) throw new Error('Failed to fetch');
    return 'tok_after_retry';
  });
  installClerk({ session: { getToken } });
  const t = await getClerkToken('supabase');
  assert.equal(t, 'tok_after_retry');
  assert.ok(getToken.calls >= 2, 'should have retried at least once');
  assert.equal(getLastClerkTokenError(), null);
});

// ── permanent config fault: missing template — must NOT retry ───────────────

test('does not retry a missing JWT template and reports it', async () => {
  const getToken = spy(async () => { throw new Error('No JWT template exists with name: supabase'); });
  installClerk({ session: { getToken } });
  const t = await getClerkToken('supabase');
  assert.equal(t, null);
  assert.equal(getToken.calls, 1, 'permanent fault must not be retried');
  assert.equal(getLastClerkTokenError().kind, 'no_template');
  const msg = describeAuthFailure();
  assert.match(msg, /template/i);
  assert.match(msg, /supabase/i);
});

// ── token issued but null (no active org) ───────────────────────────────────

test('classifies a persistently-null token as a no-org problem', async () => {
  const getToken = spy(async () => null);
  installClerk({ session: { getToken }, organization: null });
  const t = await getClerkToken('supabase');
  assert.equal(t, null);
  assert.equal(getLastClerkTokenError().kind, 'null_token');
  assert.match(describeAuthFailure(), /organization/i);
});

// ── signed out ──────────────────────────────────────────────────────────────

test('reports signed-out without hammering getToken', async () => {
  installClerk({ session: null, loaded: true });
  const t = await getClerkToken('supabase');
  assert.equal(t, null);
  assert.equal(getLastClerkTokenError().kind, 'no_session');
  assert.match(describeAuthFailure(), /signed out/i);
});

// ── boot race: Clerk hydrates a moment after the first call ──────────────────

test('waits for Clerk to hydrate instead of false-negating', async () => {
  const getToken = spy(async () => 'tok_late');
  const clerk = installClerk({ session: null, loaded: false });
  // Hydrate shortly after the call begins.
  setTimeout(() => { clerk.session = { getToken }; clerk.loaded = true; }, 25);
  const t = await getClerkToken('supabase');
  assert.equal(t, 'tok_late', 'should resolve once the session appears');
});

// ── getJwtOrgId decode ───────────────────────────────────────────────────────

test('getJwtOrgId extracts org_id from the JWT', async () => {
  const jwt = makeJwt({ sub: 'user_1', org_id: 'org_xyz', exp: Math.floor(Date.now() / 1000) + 3600 });
  installClerk({ session: { getToken: spy(async () => jwt) } });
  assert.equal(await getJwtOrgId(), 'org_xyz');
});

test('getJwtOrgId returns null when the claim is absent', async () => {
  const jwt = makeJwt({ sub: 'user_1', exp: Math.floor(Date.now() / 1000) + 3600 });
  installClerk({ session: { getToken: spy(async () => jwt) } });
  assert.equal(await getJwtOrgId(), null);
});

test('getJwtOrgId returns null when no token can be minted', async () => {
  installClerk({ session: { getToken: spy(async () => null) } });
  assert.equal(await getJwtOrgId(), null);
});

// ── transient mapping for the operator message ──────────────────────────────

test('describeAuthFailure maps a transient failure to a network hint', async () => {
  const getToken = spy(async () => { throw new Error('NetworkError when attempting to fetch resource'); });
  installClerk({ session: { getToken } });
  await getClerkToken('supabase');
  assert.equal(getLastClerkTokenError().kind, 'transient');
  assert.match(describeAuthFailure(), /network|connection/i);
});

// ── no window at all (SSR / pre-mount) ──────────────────────────────────────

test('returns null safely when there is no window', async () => {
  uninstallClerk();
  const savedWindow = globalThis.window;
  delete globalThis.window;
  try {
    assert.equal(await getClerkToken('supabase'), null);
  } finally {
    globalThis.window = savedWindow;
  }
});
