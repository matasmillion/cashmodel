# Claude Code Prompt 5 — Plaid Token Encryption & Logging Hardening

> **How to use:** Paste this entire prompt into Claude Code. It is broken into 6 compartments separated by `═══ STOP — AWAIT CONFIRMATION ═══` markers. Claude Code must complete each compartment, summarize what it did, and wait for your explicit "go" before moving on.
>
> **Why this matters:** Plaid Q7 requires "Yes - We encrypt ALL consumer data retrieved from the Plaid API at-rest." Supabase/Vercel Postgres encrypt at the storage layer by default — but Plaid reviewers want to see **application-layer** encryption on the access tokens themselves so a database leak doesn't expose them. This prompt also closes the "tokens never logged" promise made in the InfoSec Policy and Access Control Policy.

---

## Context for Claude Code

You are working on the Foreign Resource Co. internal ERP (`cashmodel` repo). This prompt does two things:

1. **Adds application-layer envelope encryption** for Plaid access tokens before they're stored in the database
2. **Hardens logging** so Plaid tokens, banking credentials, and API keys can never appear in logs (CloudWatch, Vercel logs, error trackers, etc.)

**Encryption design (envelope encryption):**
- A 32-byte master key (`PLAID_TOKEN_ENCRYPTION_KEY`) lives in Vercel environment variables (and locally in `.env.local`, gitignored)
- Each Plaid access token is encrypted with AES-256-GCM using that master key
- Ciphertext + IV + authTag are stored together as a single base64-encoded string in the database
- Decryption only happens at request time, in the backend, immediately before calling the Plaid API
- The plaintext token never touches the browser, never gets logged, never gets cached

**Forward-looking constraint:** This same encryption layer must work for consumer-facing tokens when we launch the consumer surface. Build it as a generic `lib/crypto/` module — Plaid is the first consumer of it, but it's not Plaid-specific.

**Operational rules — do not violate:**
- **Stop and ask before** running `npm install` for anything beyond Node's built-in `crypto` module. Native `crypto` should cover this — flag if you think otherwise.
- Do **not** deploy to production. PR preview deploys are fine.
- Do **not** commit `.env.local`, master keys, or any test tokens to the repo.
- Do **not** modify `/legal` pages or auth code from Prompt 4.
- After each compartment, post a short summary and **wait for me to say "go"** before proceeding.

---

## ═══ COMPARTMENT 1 — Discovery & Threat Model (NO CODE CHANGES) ═══

Before writing any code, do the following:

1. Run `git status` and `git log --oneline -10`.
2. Inspect the codebase and report:
   - Where is the Plaid SDK initialized? (`lib/plaid.ts`? `app/api/plaid/`?) Show me the file.
   - Where are Plaid access tokens currently stored? Show me the database schema (column name, type, any existing encryption).
   - How many places in the code currently read or write Plaid access tokens? List the files.
   - What logging/observability is in place? (Vercel native logs, Sentry, Logtail, custom? Any `console.log` statements near token handling?)
   - What environment variable management is in place? (`.env.local`, Vercel env vars)
3. Run a grep audit across the repo and report findings:
   - `grep -rn "access_token" --include="*.ts" --include="*.tsx" --include="*.js"`
   - `grep -rn "console.log" --include="*.ts" --include="*.tsx" | grep -i "plaid\|token\|secret\|key"`
   - `grep -rn "PLAID_SECRET\|CLERK_SECRET\|SUPABASE_SERVICE" --include="*.ts" --include="*.tsx"`
   - Anything that looks like a credential being logged or returned in an API response
4. Propose a plan:
   - Module structure: `lib/crypto/envelope.ts` (encrypt/decrypt primitives), `lib/crypto/plaid-tokens.ts` (Plaid-specific helpers), `lib/crypto/redactor.ts` (logging redaction)
   - Database migration approach: rename existing `access_token` column to `access_token_encrypted`, add a one-time migration script that encrypts existing plaintext tokens (if any exist), then drop the old column
   - Logger wrapper: a `lib/log.ts` that wraps `console` and runs every logged value through the redactor
   - Test strategy: unit tests for encrypt/decrypt round-trip, redactor pattern matching, integration test that confirms tokens aren't readable in DB
5. **Do not write any code yet.** Stop and wait for me to approve the plan.

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 2 — Encryption Module ═══

Once I approve the plan:

1. Create `lib/crypto/envelope.ts` with two functions using Node's native `crypto`:
   ```ts
   export function encrypt(plaintext: string): string
   export function decrypt(ciphertext: string): string
   ```
   - Algorithm: AES-256-GCM
   - Key: read from `PLAID_TOKEN_ENCRYPTION_KEY` env var (32 bytes, base64-encoded)
   - IV: 12 bytes, randomly generated per encryption
   - AuthTag: 16 bytes, included in output
   - Output format: base64(`iv || authTag || ciphertext`) — single string for easy DB storage
   - Throw a clear error if the key is missing or the wrong length
   - Throw a clear error if decryption fails (auth tag mismatch — possible tampering)

2. Create `lib/crypto/plaid-tokens.ts` with:
   ```ts
   export function encryptPlaidToken(plaintextToken: string): string
   export function decryptPlaidToken(encryptedToken: string): string
   export function isEncrypted(value: string): boolean  // sanity check
   ```
   These are thin wrappers around `envelope.ts` but exist so the call sites read intentionally.

3. Generate a fresh 32-byte master key for me:
   - Run `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and show me the output
   - **Do not save it anywhere.** Tell me to add it to `.env.local` as `PLAID_TOKEN_ENCRYPTION_KEY=...` and to Vercel env vars (Production, Preview, Development).
   - Add `PLAID_TOKEN_ENCRYPTION_KEY` to `.env.example` as a placeholder (no value).

4. Write unit tests in `lib/crypto/envelope.test.ts`:
   - Round-trip: encrypt then decrypt returns the original plaintext
   - Different ciphertexts for the same plaintext (IV randomness)
   - Decrypt fails on tampered ciphertext
   - Throws clear error if key is missing
   - Throws clear error if key is wrong length

5. Run the tests and show me the output. **Do not modify any application code yet** — just the crypto module and its tests.

Report files changed and test output. Wait for my confirmation that the master key is set in both `.env.local` and Vercel before proceeding.

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 3 — Database Migration ═══

1. Show me the current schema for the table holding Plaid access tokens.
2. Write a Supabase/Postgres migration (do not run it yet — show me the SQL first):
   - Add column `access_token_encrypted TEXT`
   - Backfill: if any existing plaintext tokens exist, encrypt them using the new module and write to the new column. **If the table is empty, skip the backfill and just add the column.**
   - Verify: every row that previously had `access_token IS NOT NULL` now has `access_token_encrypted IS NOT NULL`
   - Drop the old `access_token` column **only after** verification — keep it nullable in the meantime
3. Write a backfill script in `scripts/encrypt-existing-tokens.ts` that:
   - Reads each row with a plaintext `access_token`
   - Calls `encryptPlaidToken()`
   - Writes ciphertext to `access_token_encrypted`
   - Logs progress (count, not contents — never log the token itself)
   - Is idempotent (safe to re-run)
4. Show me:
   - The migration SQL
   - The backfill script
   - A dry-run output (count of rows affected, no token values)
5. **Wait for my approval before running the migration or the backfill.**

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 4 — Refactor Plaid Call Sites ═══

1. From the grep audit in Compartment 1, refactor every site that reads or writes Plaid access tokens:
   - **On write** (e.g., after `itemPublicTokenExchange`): call `encryptPlaidToken(token)` before storing.
   - **On read** (e.g., before `transactionsGet`, `accountsBalanceGet`): call `decryptPlaidToken(encrypted)` immediately before passing to the Plaid SDK. Hold the plaintext in a local variable, never assign to a logged object, never return it from the function.
   - Add a code comment at every call site: `// Plaid token decrypted in-memory only — never logged, never returned`
2. Add a TypeScript type alias to make misuse harder:
   ```ts
   type PlaidAccessTokenCiphertext = string & { __brand: 'PlaidCiphertext' }
   type PlaidAccessTokenPlaintext = string & { __brand: 'PlaidPlaintext' }
   ```
   The encrypt function returns `PlaidAccessTokenCiphertext`; decrypt returns `PlaidAccessTokenPlaintext`. The Plaid SDK call should require the plaintext branded type. This makes it a compile error to accidentally pass a ciphertext to Plaid (or worse, a plaintext to the database).
3. Verify the entire app still builds (`npm run build`).
4. Run an integration test (or manual test if no integration test framework is set up): connect a sandbox Plaid Item, confirm the encrypted token is stored, confirm a transactions fetch succeeds (proving decrypt works end-to-end).

Report files changed, build output, and test result.

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 5 — Log Redaction ═══

1. Create `lib/crypto/redactor.ts` with a function:
   ```ts
   export function redact(input: unknown): unknown
   ```
   It should:
   - Walk objects, arrays, and strings recursively
   - Replace the value of any key matching this case-insensitive list with `'[REDACTED]'`:
     `access_token, accessToken, plaid_token, plaidToken, public_token, publicToken, secret, password, api_key, apiKey, authorization, cookie, session, refresh_token, refreshToken, encryption_key, encryptionKey, mfa_secret, totp_secret`
   - Replace any string matching common token shapes (Plaid tokens are typically `access-sandbox-xxxxx` or `access-production-xxxxx` — match `/^access-[a-z]+-[a-zA-Z0-9-]{20,}/`)
   - Truncate any string over 200 chars that contains `eyJ` (likely JWT) to first 8 chars + `...[REDACTED]`
   - Be safe on circular references and non-serializable values

2. Create `lib/log.ts` — a thin wrapper around `console`:
   ```ts
   export const log = {
     info: (...args: unknown[]) => console.log(...args.map(redact)),
     warn: (...args: unknown[]) => console.warn(...args.map(redact)),
     error: (...args: unknown[]) => console.error(...args.map(redact)),
     debug: (...args: unknown[]) => console.debug(...args.map(redact)),
   }
   ```

3. Run a codemod / manual replacement: every `console.log/warn/error/debug` call in the codebase becomes `log.info/warn/error/debug`. Show me the diff before applying.

4. Add an ESLint rule that bans direct `console.*` usage in `app/`, `lib/`, and `pages/` (allow it only in `scripts/` and `*.test.ts`):
   ```json
   "no-restricted-syntax": ["error", {
     "selector": "MemberExpression[object.name='console']",
     "message": "Use lib/log instead — direct console calls are not redacted."
   }]
   ```
   Add this rule to `.eslintrc` and run `npm run lint` to confirm everything passes.

5. Write tests in `lib/crypto/redactor.test.ts`:
   - `redact({ access_token: 'access-sandbox-abc123...' })` → `{ access_token: '[REDACTED]' }`
   - `redact('access-production-xxxxxxxxxxxxxxxxxxxx')` → `'[REDACTED]'`
   - `redact({ user: 'matias', password: 'hunter2' })` → `{ user: 'matias', password: '[REDACTED]' }`
   - `redact({ user: { profile: { api_key: 'sk-xxx' } } })` → nested redaction works
   - Circular reference doesn't crash

6. Run the tests and show output.

Report files changed, lint output, test output.

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 6 — Verification, Documentation & PR ═══

1. Final grep audit — paste the output for each:
   ```bash
   grep -rn "console\." --include="*.ts" --include="*.tsx" app/ lib/ pages/ 2>/dev/null
   grep -rn "access_token" --include="*.ts" --include="*.tsx" app/ lib/ pages/ 2>/dev/null
   ```
   Expected: zero direct `console.` calls outside scripts/tests; every `access_token` reference is to the encrypted column or the typed wrappers.

2. Build a `/admin/security-status` page (Admin role only) that displays:
   - "Plaid token encryption: ✅ AES-256-GCM, application-layer envelope encryption"
   - "Master key location: Vercel environment variable (`PLAID_TOKEN_ENCRYPTION_KEY`)"
   - "Last key rotation: [date — pull from a `KEY_ROTATION_LOG` constant]"
   - "Tokens stored in plaintext: 0 (verified by query)"
   - "Log redaction: ✅ Active (`lib/log.ts`)"
   - This page is screenshot material for Plaid Q7 documentation.

3. Update `SECURITY.md` at the repo root to add an "Encryption" section:
   - Plaid access tokens are encrypted at the application layer using AES-256-GCM envelope encryption before storage
   - Master key is held in a managed secrets store (Vercel) and rotated annually or upon suspected compromise
   - Decryption occurs only in backend request handlers immediately before calling the Plaid API
   - All logging routes through a redactor that strips sensitive fields and known token shapes

4. Show me `git diff --stat`.

5. Commit on branch `security/plaid-token-encryption-and-log-redaction`:
   ```
   feat(security): app-layer encryption for Plaid tokens + log redaction

   - Add lib/crypto/envelope.ts (AES-256-GCM)
   - Add lib/crypto/plaid-tokens.ts with branded types preventing misuse
   - Migrate access_token column to access_token_encrypted
   - Add backfill script (idempotent)
   - Add lib/crypto/redactor.ts and lib/log.ts wrapper
   - Replace all console.* with log.* (ESLint rule enforces)
   - Add /admin/security-status page (admin role only)
   - Update SECURITY.md with encryption + redaction documentation
   ```

6. Push and open a PR. **Do not merge.** Wait for my review.

7. Output a **Plaid Q7 Submission Pack**:
   - Screenshot of `/admin/security-status` showing all green checks
   - One paragraph I can paste into Plaid's Q7 documentation field describing the implementation
   - PR URL as proof of code change

═══ END OF PROMPT 5 ═══
