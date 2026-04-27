# Claude Code Prompt 4 — Phishing-Resistant MFA on the ERP

> **How to use:** Paste this entire prompt into Claude Code. It is broken into 6 compartments separated by `═══ STOP — AWAIT CONFIRMATION ═══` markers. Claude Code must complete each compartment, summarize what it did, and wait for your explicit "go" before moving on.
>
> **Why this matters:** Plaid's questionnaire requires Q5 to be answered "Yes - Phishing-resistant MFA" AND requires a **screenshot of the MFA implementation** as supporting documentation. This prompt produces a working passkey-based MFA system on the ERP and gives you the exact screenshots to upload to Plaid.

---

## Context for Claude Code

You are working on the Foreign Resource Co. internal ERP (`cashmodel` repo). The ERP currently has minimal authentication. We need to implement **phishing-resistant MFA** before submitting the Plaid application. The chosen solution is **Clerk** with passkeys as the required MFA factor.

**Why Clerk over alternatives:**
- Free tier covers our internal user count (single-digit users)
- Native passkey support (WebAuthn / FIDO2 = phishing-resistant)
- Built-in session management, lifecycle hooks, user/role management
- Drop-in Next.js middleware
- TOTP fallback supported out of the box
- Simple migration path if we move to Auth0 / Supabase Auth later

**Forward-looking constraint:** This auth system must be reusable when we launch the consumer-facing version of the codebase. Build it as a clean abstraction layer — the ERP today, consumers tomorrow, with role flags as the only meaningful difference.

**Operational rules — do not violate:**
- **Stop and ask before** running `npm install` for anything other than `@clerk/nextjs` and its peer dependencies. If Clerk's docs require additional packages, list them and ask first.
- Do **not** deploy to production. PR preview deploys via Vercel are fine.
- Do **not** commit any Clerk API keys, secrets, or `.env` files to the repo.
- Do **not** modify the existing `/legal` pages — those are locked.
- After each compartment, post a short summary and **wait for me to say "go"** before proceeding.

---

## ═══ COMPARTMENT 1 — Discovery & Plan (NO CODE CHANGES) ═══

Before writing any code, do the following and report back:

1. Run `git status` and `git log --oneline -10`.
2. Inspect the repo and tell me:
   - Next.js version and router (App Router vs Pages Router)
   - Existing auth setup, if any (NextAuth, Supabase Auth, custom JWT, none?)
   - Current `middleware.ts` contents (if it exists)
   - Where protected routes live (do we have a `dashboard` route group? `/app/(dashboard)/`?)
   - What environment variable management is in place (`.env.local`, Vercel env vars, both?)
   - Any existing user model in the database (Supabase / Postgres) — what columns exist?
3. Confirm the official Clerk Next.js install steps you'd follow by referencing `https://clerk.com/docs/quickstarts/nextjs`. Cite the exact steps you'll execute. **Do not execute them yet.**
4. Propose a plan covering:
   - Clerk integration scope: sign-in, sign-up (admin-invitation only — no public sign-up), passkey enrollment required, TOTP as recovery factor
   - Route protection: which routes become protected, which (if any) stay public (`/`, `/legal/*`, `/sign-in`)
   - Database integration: how Clerk user IDs map to the existing user table — propose a `clerk_user_id` foreign key column and a webhook listener for user lifecycle events (created, updated, deleted) that syncs Clerk → DB
   - Role model: define `Admin`, `Operator`, `Viewer` as Clerk public metadata fields, with type-safe helpers in `lib/auth/roles.ts`
   - Forward-compatible structure: an abstraction in `lib/auth/` so swapping providers later requires changing one file
   - "Demo route" for screenshot purposes: a route that displays the user's name, role, and active MFA factor — this is what we screenshot for Plaid
5. **Do not write any code yet.** Stop and wait for me to approve the plan.

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 2 — Clerk Installation & Environment Setup ═══

1. Tell me which environment variables Clerk requires (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, plus any webhook-signing secret) so I can create them in the Clerk dashboard and add them to Vercel + `.env.local`.
2. Walk me through the Clerk dashboard configuration I need to do **manually** before code goes live:
   - Create a new Clerk application
   - Enable passkeys as a required first/second factor
   - Disable public sign-up (admin invitation only)
   - Configure session length: 12 hours of inactivity, 7 days absolute (per the Access Control Policy)
   - Configure password policy: minimum 12 characters, breached-password screening enabled
   - Disable SMS as a primary MFA factor (allow only as recovery)
   - Set up webhook endpoint URL (placeholder — we'll wire it up in Compartment 4)
3. Once I confirm the keys are in place, install only `@clerk/nextjs` and any required peers. List them first and ask before running install.
4. Add `.env.local` to `.gitignore` if it isn't already.
5. Verify `npm run build` still succeeds after install (no auth wiring yet).

Report back with: dashboard configuration steps for me to take, confirmation that install completed, and any Clerk version pinning notes.

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 3 — Auth Wiring & Route Protection ═══

1. Add the Clerk provider wrapper to the root layout.
2. Create or update `middleware.ts` to:
   - Make all routes protected by default
   - Explicitly mark public routes: `/`, `/legal`, `/legal/*`, `/sign-in`, `/sign-up`, Clerk webhook endpoints, Next.js internals
   - Redirect unauthenticated users to `/sign-in`
3. Create `/sign-in` and `/sign-up` pages using Clerk's prebuilt components. Style them to match the brand (Salt `#F7F7F5` background, Slate `#0F1419` text, Cormorant Garamond for the heading "Foreign Resource — Sign In", General Sans for body — use the same fonts as the `/legal` section).
4. Build the auth abstraction in `lib/auth/`:
   - `lib/auth/index.ts` — exports `getCurrentUser()`, `getCurrentRole()`, `requireRole(role)`, `signOut()` — all internally call Clerk but the API doesn't expose Clerk types
   - `lib/auth/roles.ts` — defines `Role` type ("admin" | "operator" | "viewer"), role hierarchy helpers (`isAtLeast(role, required)`)
   - `lib/auth/types.ts` — domain user type (id, email, name, role, mfaEnabled, mfaFactors)
5. Add a `<Header />` component with: user email, role badge, "Sign out" button. Render it on every protected page.
6. Verify locally:
   - Visiting `/` works without sign-in (still public)
   - Visiting `/legal/*` works without sign-in
   - Visiting any protected route redirects to `/sign-in`
   - Signing in with a test account redirects back to the originally requested route
   - The header renders with email + role + sign-out

Report files changed and any issues with role propagation from Clerk → app.

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 4 — MFA Enforcement & Account Settings Page ═══

This is the compartment that produces the Plaid screenshot.

1. Configure Clerk to **require MFA enrollment on first login** — the user cannot reach the dashboard without enrolling at least one MFA factor (passkey preferred, TOTP acceptable). Use Clerk's `<UserProfile />` mounted at `/account/security` for ongoing management.
2. Create `/account/security` page that:
   - Shows the user's email, name, role
   - Lists currently enrolled MFA factors with status badges:
     - 🛡️ **Passkey** — shows device name + "Phishing-resistant" badge in green
     - 🔐 **TOTP (Authenticator App)** — shows "Enrolled" or "Not enrolled"
     - ❌ **SMS** — explicitly labeled "Not used as primary factor (recovery only)"
   - Has a clear "Add a passkey" button if none enrolled
   - Has a clear "Add an authenticator app" button if TOTP not enrolled
   - At the top, displays a hero banner: "**Multi-Factor Authentication is required.** Phishing-resistant MFA (passkeys) is enforced for all access to systems processing financial data, in compliance with our Access Control Policy."
   - Links to `/legal/access-control-policy` from "Access Control Policy" text
3. Verify the enforcement flow:
   - Create a fresh test user via Clerk dashboard invitation
   - Sign in — Clerk should immediately prompt for MFA enrollment
   - Enroll a passkey — verify the user can now reach the dashboard
   - Sign out and sign in again — verify the passkey is requested
4. Build a webhook listener at `/api/webhooks/clerk` that:
   - Verifies the Svix signature header
   - Handles `user.created`, `user.updated`, `user.deleted` events
   - Syncs the user record into the database (Supabase / Postgres) with `clerk_user_id`, email, name, role, `mfa_enabled` flag, `mfa_factors` array, `created_at`, `updated_at`
5. Add a database migration (do not run it yet — show me the SQL first) for the `users` table changes if needed.

**Final screenshot capture for Plaid:** After enrollment, navigate to `/account/security` and capture a screenshot showing the enrolled passkey with the "Phishing-resistant" badge. This is the file you'll upload to Plaid Q5.

Report:
- Files changed
- Confirmation MFA enrollment is enforced (a fresh test user cannot reach the dashboard without enrolling)
- The migration SQL for me to review before running
- Path to the screenshot of `/account/security` showing enrolled passkey

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 5 — Audit Logging & Polish ═══

1. Create `lib/audit/log.ts` with a single function `logAuthEvent({ userId, event, metadata })`. Events to log:
   - `sign_in_success`
   - `sign_in_failure`
   - `mfa_challenge_success`
   - `mfa_challenge_failure`
   - `mfa_enrolled` (factor type)
   - `mfa_removed` (factor type)
   - `password_reset_requested`
   - `password_reset_completed`
   - `sign_out`
2. Wire `logAuthEvent` to the Clerk webhook handler so all auth lifecycle events are persisted in an `auth_events` table with: `id`, `user_id`, `event`, `metadata` (JSONB), `ip_address`, `user_agent`, `created_at`.
3. Add database migration for the `auth_events` table (show SQL before running).
4. Add a `/account/security/activity` page that displays the last 30 days of auth events for the signed-in user (their own events only — Admin can view all users' events).
5. Verify by signing in/out a few times and confirming events appear in the activity log.
6. Add `POLICY_LAST_REVIEWED.accessControl` is being honored — the `/account/security` page should display the policy version and effective date pulled from the same constant used in `/legal`.

Report files changed and a sample of the audit log content.

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 6 — Documentation, Commit & Plaid Submission Pack ═══

1. Update the Information Security Policy reference in the codebase (a `SECURITY.md` at the repo root) so it explicitly states:
   - Phishing-resistant MFA (passkeys) is enforced via Clerk on all human access to the ERP
   - All authentication events are logged
   - Provider-level MFA is required on GitHub, Vercel, Supabase, Mercury, Shopify, Plaid Dashboard, Clerk
2. Show me `git diff --stat` so I can review scope.
3. Stage and commit on a new branch `auth/clerk-passkey-mfa` with this message:
   ```
   feat(auth): implement Clerk + phishing-resistant MFA (passkeys)

   - Add Clerk Next.js integration with required MFA enrollment
   - Public routes: /, /legal/*; all others protected
   - Build lib/auth abstraction (provider-agnostic API)
   - Add /account/security page with MFA factor management
   - Add /account/security/activity audit log view
   - Add Clerk webhook listener for user lifecycle sync
   - Add auth_events table for compliance audit trail
   - Add SECURITY.md
   ```
4. Push the branch and open a PR. **Do not merge.** Wait for my review.
5. Output a **Plaid Submission Pack** I can upload directly:
   - Screenshot 1: `/account/security` showing enrolled passkey (Phishing-resistant badge visible)
   - Screenshot 2: `/account/security` showing the policy version + effective date + "MFA is required" hero banner
   - Screenshot 3: Clerk dashboard showing passkeys enabled as required factor + SMS disabled as primary (you'll capture this from the Clerk admin UI)
   - Screenshot 4: A `git log` excerpt showing the auth commit (proof of implementation date)
   - One-paragraph summary I can paste into Plaid's Q5 documentation field describing the implementation
6. Final sanity checks:
   - Sign-in flow works end-to-end with passkey
   - Sign-out clears session
   - Protected route returns 401/redirect when token is invalidated
   - No Clerk keys in commit history (`git log -p | grep -i clerk_secret` should return nothing)
   - `/legal/*` still accessible without auth

═══ END OF PROMPT 4 ═══
