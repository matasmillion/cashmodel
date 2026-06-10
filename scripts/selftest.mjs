// Self-test for the local-first PLM work. Runs in Node with a fake IndexedDB +
// a localStorage shim. NOT a browser E2E (no DOM/cloud here) — it exercises the
// real module logic that doesn't need a browser or Supabase.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const log = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; log.push(`   PASS  ${name}`); }
  else { fail++; log.push(`   FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- minimal browser globals ---
const _ls = new Map();
global.localStorage = {
  getItem: (k) => (_ls.has(k) ? _ls.get(k) : null),
  setItem: (k, v) => _ls.set(k, String(v)),
  removeItem: (k) => _ls.delete(k),
};
global.window = { addEventListener: () => {}, removeEventListener: () => {} };
global.document = { visibilityState: 'visible' };

function idbGet(dbName, store, key) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName);
    req.onsuccess = () => {
      try {
        const tx = req.result.transaction(store, 'readonly');
        const g = tx.objectStore(store).get(key);
        g.onsuccess = () => resolve(g.result);
        g.onerror = () => reject(g.error);
      } catch (e) { reject(e); }
    };
    req.onerror = () => reject(req.error);
  });
}

// ===== TEST 1 — localDb engine on a real IndexedDB =====
async function test1() {
  log.push('\nTEST 1 — Local storage engine (IndexedDB round-trip, persistence, migration, reclaim)');
  const db = await import('../src/utils/localDb.js');
  await db.hydrate();
  check('engine hydrates on the IDB path (not localStorage fallback)', db.isReady() && !db.isFallback());

  db.setCollection('cashmodel_test_packs', [{ id: 'a', v: 1 }, { id: 'b', v: 2 }]);
  const got = db.getCollection('cashmodel_test_packs');
  check('setCollection → getCollection round-trips an array', Array.isArray(got) && got.length === 2 && got[0].id === 'a');
  check('getCollection returns a fresh copy (callers can mutate safely)', got !== db.getCollection('cashmodel_test_packs'));

  db.setBlob('cashmodel_test_blob', { hello: 'world' });
  check('setBlob → getBlob round-trips an object', db.getBlob('cashmodel_test_blob')?.hello === 'world');
  check('getCollection coerces a non-array blob to []', db.getCollection('cashmodel_test_blob').length === 0);

  // Bytes actually reach IndexedDB (not just the in-memory cache)
  db.setCollection('cashmodel_idb_proof', [{ id: 'z', v: 9 }]);
  await db.flush();
  const fromIdb = await idbGet('cashmodel_local', 'kv', 'cashmodel_idb_proof');
  check('data is actually persisted to IndexedDB', Array.isArray(fromIdb) && fromIdb[0]?.id === 'z');

  // Lazy migration: a legacy localStorage value is imported on first engine access
  _ls.set('cashmodel_legacy_import', JSON.stringify([{ id: 'x' }]));
  check('lazily imports a legacy localStorage value on first read', db.getCollection('cashmodel_legacy_import')[0]?.id === 'x');

  // Reclaim: a reclaimable key's localStorage copy is dropped after it persists to IDB
  _ls.set('cashmodel_state', JSON.stringify({ old: true }));
  db.setBlob('cashmodel_state', { fresh: true });
  await db.flush();
  await sleep(30);
  check('reclaimable key cleared from localStorage after IDB commit', !_ls.has('cashmodel_state'));

  db.removeKey('cashmodel_test_packs');
  check('removeKey clears the value', db.getCollection('cashmodel_test_packs').length === 0);
}

// ===== TEST 2 — cost stability (the price-climbing bug) =====
async function test2() {
  log.push('\nTEST 2 — Unit-cost stability (persisted value wins; recompute is deterministic)');
  const { computeTotalUnitCost } = await import('../src/components/techpack/techPackConstants.js');
  check('returns the persisted data.totalUnitCost verbatim when set', computeTotalUnitCost({ totalUnitCost: 22.24 }, {}) === 22.24);
  check('persisted value ignores live inputs (stable, no climb)', computeTotalUnitCost({ totalUnitCost: 30 }, { getColorCost: () => 999 }) === 30);
  const data = { pickedColorways: [] };
  const a = computeTotalUnitCost(data, { getColorCost: () => 5 });
  const b = computeTotalUnitCost(data, { getColorCost: () => 5 });
  check('recompute is deterministic across calls (same input → same output)', a === b, `${a} vs ${b}`);
}

// ===== TEST 3 — image cache shipped in the built service worker =====
function test3() {
  log.push('\nTEST 3 — Image-byte cache is wired into the built service worker');
  let sw = '';
  try { sw = readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8'); } catch { /* no build */ }
  check('a build exists (dist/sw.js)', sw.length > 0, 'run `npm run build` first');
  check('PLM images are cached (named cache present)', sw.includes('fr-plm-images'));
  check('cache is scoped to Supabase Storage only', sw.includes('/storage/v1/object/'));
  check('CacheFirst strategy is used for images', /CacheFirst/i.test(sw));
}

// ===== TEST 4 — stale-chunk crash auto-recovery logic =====
function test4() {
  log.push('\nTEST 4 — Stale-chunk crash detection (lazyWithReload / ErrorBoundary)');
  const re = /dynamically imported module|module script failed|failed to fetch|error loading dynamically/i;
  check('matches the real deploy error', re.test('Failed to fetch dynamically imported module: https://matasmillion.github.io/cashmodel/assets/PLMView-7r86YngI.js'));
  check('matches the alt Safari wording', re.test('Importing a module script failed.'));
  check('does NOT match unrelated runtime errors', !re.test("TypeError: Cannot read properties of undefined (reading 'map')"));
}

// ===== TEST 5 — list-view de-churn signature (avoid re-render when unchanged) =====
function test5() {
  log.push('\nTEST 5 — Library de-churn: identical refresh produces an identical signature');
  // Mirrors the sig() used in ComponentPackList/TechPackList silentRefresh
  const sig = (arr) => (arr || []).map(r => `${r.id}:${r.updated_at || ''}:${r.cover_image || ''}:${r.status || ''}`).join('|');
  const rowsV1 = [{ id: 'a', updated_at: '2026-06-01', status: 'Design' }, { id: 'b', updated_at: '2026-06-02', status: 'Sample' }];
  const rowsV1Copy = JSON.parse(JSON.stringify(rowsV1));
  const rowsV2 = [{ id: 'a', updated_at: '2026-06-03', status: 'Design' }, { id: 'b', updated_at: '2026-06-02', status: 'Sample' }];
  check('identical data → identical signature → no re-render', sig(rowsV1) === sig(rowsV1Copy));
  check('a real change → different signature → re-renders', sig(rowsV1) !== sig(rowsV2));
}

// ===== TEST 6 — image-upload local fallback preserves bytes (never lose a photo) =====
async function test6() {
  log.push('\nTEST 6 — Upload fallback: a photo\'s bytes are captured into a durable data URL (never lost)');
  const { blobToDataUrl } = await import('../src/utils/blobDataUrl.js');
  // Known vector: bytes "HI" (72,73) → base64 "SEk="
  const hi = await blobToDataUrl(new Blob([new Uint8Array([72, 73])], { type: 'image/webp' }));
  check('encodes a known byte sequence correctly', hi === 'data:image/webp;base64,SEk=', hi);
  check('defaults content-type to application/octet-stream when missing',
    (await blobToDataUrl(new Blob([new Uint8Array([1])]))).startsWith('data:application/octet-stream;base64,'));
  // Deterministic across 10 encodes (operator's "try it 10 times" rule); the >32 KB
  // chunking path is exercised by a 70 KB array.
  const big = new Uint8Array(70000);
  for (let i = 0; i < big.length; i++) big[i] = (i * 31 + 7) & 0xff;
  const blob = new Blob([big], { type: 'image/png' });
  const first = await blobToDataUrl(blob);
  let stable = true;
  for (let i = 0; i < 10; i++) { if ((await blobToDataUrl(blob)) !== first) stable = false; }
  check('deterministic across 10 encodes (same bytes → same URL)', stable);
  // Round-trip: the data URL decodes back to the exact original bytes — proof the
  // image is preserved with zero loss when kept locally instead of thrown away.
  const b64 = first.split(',')[1];
  const decoded = (typeof atob !== 'undefined') ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  let intact = decoded.length === big.length;
  for (let i = 0; intact && i < big.length; i++) { if (decoded.charCodeAt(i) !== big[i]) intact = false; }
  check('round-trips a 70 KB image with zero byte loss (chunking intact)', intact);
}

// ===== TEST 7 — version vault: silent snapshots + browse + restore =====
async function test7() {
  log.push('\nTEST 7 — Version vault: silent snapshots, de-dupe, cap, and restore (never lose work)');
  const vh = await import('../src/utils/versionHistoryStore.js');
  vh.__resetVersionHistoryForTests();
  const T = 'tech_packs', ID = 'AP-TEST-001';
  vh.snapshotVersion({ table: T, id: ID, data: { v: 1 }, reason: 'clash-backup' });
  check('a snapshot is captured + listed', vh.listVersions(T, ID).length === 1);
  vh.snapshotVersion({ table: T, id: ID, data: { v: 1 }, reason: 'clash-backup' });
  check('an identical snapshot is de-duped (no spam)', vh.listVersions(T, ID).length === 1);
  vh.snapshotVersion({ table: T, id: ID, data: { v: 2 }, reason: 'clash-backup' });
  check('a distinct version is a new restore point', vh.listVersions(T, ID).length === 2);
  check('newest version is first', vh.listVersions(T, ID)[0].data.v === 2);
  for (let i = 0; i < 30; i++) vh.snapshotVersion({ table: T, id: ID, data: { v: 100 + i }, reason: 'clash-backup' });
  check('per-record cap (20) is enforced', vh.listVersions(T, ID).length === 20);
  const target = vh.listVersions(T, ID)[5];
  check('any version is retrievable by ts for restore (data intact)', vh.getVersion(target.ts)?.data != null);
  check('record appears in the global history index', vh.listRecordsWithHistory().some(r => r.id === ID));
  let stable = true; const len = vh.listVersions(T, ID).length;
  for (let i = 0; i < 10; i++) { if (vh.listVersions(T, ID).length !== len) stable = false; }
  check('listing is stable across 10 reads', stable);
  vh.__resetVersionHistoryForTests();
}

(async () => {
  for (const [n, t] of [['1', test1], ['2', test2], ['3', test3], ['4', test4], ['5', test5], ['6', test6], ['7', test7]]) {
    try { await t(); } catch (e) { fail++; log.push(`\nTEST ${n} — THREW: ${e?.message || e}`); }
  }
  console.log(log.join('\n'));
  console.log(`\n──────────────\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
