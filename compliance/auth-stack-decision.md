# Auth Stack Decision Record

**Status**: Decided · awaiting `/legal/*` scaffolding before implementation
**Decided on**: 2026-04-27
**Decision owner**: matias@foreignresource.com
**Implementer**: Claude Code (cashmodel session, branch `claude/fix-plm-tabs-Z5VDv`)
**Driver**: Plaid production-access submission requires phishing-resistant MFA on systems processing financial data.

---

## TL;DR
Replace the existing Supabase Auth integration with **Clerk + passkey-required MFA**, wired into this **Vite + React SPA** via `@clerk/clerk-react`. Webhook lives in a **Supabase Edge Function**. Stay on **GitHub Pages** (no Vercel migration). Keep the codebase in **JSX** with JSDoc + `// @ts-check`. Build a thin **provider-agnostic abstraction** in `src/lib/auth/` so the same module can be reused by the upcoming consumer-facing build.

---

## Stack discovery (what's actually in this repo)

| Aspect | Reality |
|---|---|
| Framework | Vite 8 + React 19 SPA |
| Routing | Custom hash router (`src/utils/plmRouting.js`) |
| Deploy target | GitHub Pages (`.github/workflows/deploy-pages.yml`, base `/cashmodel/`) |
| Existing auth | Supabase Auth (`src/auth/AuthGate.jsx` — magic link + password + Google OAuth) |
| User identity in DB | Supabase `auth.users` referenced by FK in `user_integrations`, `user_plaid_items`; RLS uses `auth.uid()` |
| `currentUserId()` source | Six stores read `sb-*-auth-token` from `localStorage` |
| Backend | Supabase + three edge functions already in use (`plaid-proxy`, `mercury-proxy`, `shopify-proxy`) |
| Type system | JSX only, no `tsconfig.json` |
| Env management | `.env.local` ignored, `.env.example` published, `VITE_CLERK_PUBLISHABLE_KEY` placeholder already present |
| `/legal/*` route | Does not exist yet |
| `middleware.ts` | Does not exist (and won't — this isn't Next.js) |

---

## The five forks and chosen paths

### 1. Stack approach → **(b) Keep Vite, adapt for SPA**
- Use `@clerk/clerk-react` (NOT `@clerk/nextjs`).
- Client-side `<RequireAuth>` wrapping the existing top-level tabs in `App.jsx`.
- The Clerk Next.js quickstart referenced in the original spec **does not apply**; the matching guide is https://clerk.com/docs/quickstarts/react.

**Why**: A Next.js migration is multi-day work, breaks the GitHub Pages deploy, and forces a Vercel migration whose only justification would be Clerk's middleware. None of that buys us anything Plaid will see in a screenshot.

### 2. Coexistence with Supabase Auth → **(a) Replace Supabase Auth with Clerk**
- Clerk becomes the sole identity provider.
- RLS policies migrate to read a **Clerk-issued JWT** via Clerk's Supabase integration template (https://clerk.com/docs/integrations/databases/supabase).
- `currentUserId()` helpers across the six stores get replaced with a Clerk-derived ID exposed by the new `src/lib/auth/` abstraction.

**Why**: One identity system is dramatically simpler than running two. Two-system shadowing creates a permanent class of "user exists in Clerk but not Supabase" bugs and an audit trail we'd have to defend to Plaid.

**Trade-off**: Existing Supabase Auth sessions are invalidated on cutover. The current single user is the implementer; not a real migration risk.

### 3. `/legal/*` pages → **STOPPED — handled by separate prompts first**
- Decision: pause this implementation. The `/legal/*` route group, the policy version constants (e.g. `POLICY_LAST_REVIEWED.accessControl`), and the Information Security / Access Control Policy text will be created by **Prompts 1, 2, and 3** of a different track.
- This auth work resumes after those land.

**Why**: Compartments 3–5 of the auth spec reference `/legal/access-control-policy` and `POLICY_LAST_REVIEWED.accessControl`. Building auth on top of placeholders that change later wastes work and creates a stale link surface that would need re-validation before Plaid submission.

### 4. TypeScript → **Stay JSX with JSDoc + `// @ts-check`**
- `src/lib/auth/index.js`, `src/lib/auth/roles.js`, `src/lib/auth/types.js` use JSDoc typedefs.
- Optional `// @ts-check` directive at the top of each file gives editor-level type checking without adopting a TS toolchain.
- Migration to TS deferred to **post-launch**, after the Plaid submission ships.

**Why**: Introducing TS now means tsconfig, build pipeline changes, eslint-plugin-typescript, type-checking CI, and migrating every existing `.jsx` (50+ files). That work is not on the Plaid critical path.

### 5. Webhook home → **Supabase Edge Function**
- New function: `supabase/functions/clerk-webhook/index.ts` (TS is fine here since edge functions already are).
- Verifies the Svix signature header, handles `user.created` / `user.updated` / `user.deleted`, upserts the local `public.users` table.
- Wired to the same Supabase project that already runs `plaid-proxy`, `mercury-proxy`, `shopify-proxy`.

**Why**: We're already on Supabase. Spinning up Vercel just to host one webhook adds a deploy target and a billing surface for no benefit.

---

## What this implementation will look like (pre-implementation sketch)

```
cashmodel/
├── src/
│   ├── lib/
│   │   └── auth/
│   │       ├── index.js          // getCurrentUser, getCurrentRole, requireRole, signOut
│   │       ├── roles.js          // Role enum + isAtLeast(role, required)
│   │       └── types.js          // JSDoc typedefs (User, Role, MFAFactor)
│   ├── lib/
│   │   └── audit/
│   │       └── log.js            // logAuthEvent({ userId, event, metadata })
│   ├── components/
│   │   └── auth/
│   │       ├── RequireAuth.jsx   // Client-side route gate
│   │       └── Header.jsx        // Email · role badge · sign-out
│   ├── pages/
│   │   └── account/
│   │       ├── SecurityPage.jsx  // <UserProfile /> + factor list + hero banner
│   │       └── ActivityPage.jsx  // Last 30 days of auth_events
│   └── App.jsx                   // <ClerkProvider> + <RequireAuth> wrapping tabs
├── supabase/
│   ├── functions/
│   │   └── clerk-webhook/
│   │       └── index.ts          // Svix verify + upsert public.users
│   └── migrations/
│       ├── 20260428_users.sql       // public.users with clerk_user_id
│       ├── 20260428_auth_events.sql // append-only audit table
│       └── 20260428_rls_clerk_jwt.sql // migrate RLS to Clerk JWT
├── compliance/
│   └── auth-stack-decision.md   // this file
└── SECURITY.md                  // top-level security posture statement
```

---

## What does NOT change
- The PLM data model (Patterns, Fabrics, Treatments, Embellishments, Vendors, POs).
- The hash router or any of the existing PLM routes.
- The brand styling or component library.
- The GitHub Pages deploy.
- The existing Supabase Edge Functions (`plaid-proxy`, `mercury-proxy`, `shopify-proxy`).

## What gets removed in cutover
- `src/auth/AuthGate.jsx` (Supabase Auth UI).
- `supabase.auth.signOut()` callsite in `src/App.jsx`.
- The `currentUserId()` helper in each of the six stores (replaced with a single import from the new auth abstraction).
- Supabase Auth session listeners and `sb-*-auth-token` localStorage reads.

---

## Resumption checklist (when /legal/* lands)
When the `/legal/*` track is done and we restart this implementation, verify these prerequisites exist before proceeding past Compartment 1:

- [ ] `/legal/access-control-policy` route reachable (and locked from edits per spec).
- [ ] `POLICY_LAST_REVIEWED.accessControl` (or equivalent) exported from a shared constants module.
- [ ] Information Security Policy reference text is finalized so `SECURITY.md` can quote it accurately.
- [ ] User confirms the Clerk dashboard configuration is done (passkeys required, public sign-up disabled, session policy set, SMS not primary, webhook endpoint placeholder created).
- [ ] User confirms `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (or `VITE_CLERK_PUBLISHABLE_KEY`), `CLERK_SECRET_KEY`, and `CLERK_WEBHOOK_SIGNING_SECRET` are present in `.env.local` and in Supabase function secrets.

After those land, resume at **Compartment 2** of the original spec, adapted as follows:
- Install `@clerk/clerk-react` (NOT `@clerk/nextjs`) — single dependency, no peers required beyond what's already in the tree.
- Skip the `middleware.ts` work; instead build `<RequireAuth>` per the sketch above.
- Webhook handler lands in `supabase/functions/clerk-webhook/`, not `/api/webhooks/clerk`.
- All `.ts` files in the spec become `.js` with `// @ts-check` and JSDoc.

---

## Operational notes carried over from the spec
- No `npm install` without explicit approval at the time it's needed.
- No production deploys.
- No Clerk keys in commit history (verify with `git log -p | grep -i clerk_secret` before final push).
- No edits to `/legal/*` once it lands.
- Branch this lands on: `auth/clerk-passkey-mfa` (per Compartment 6 of the original spec).

---

## Open items deferred to a later session
- Confirm Clerk's exact React-19 compatibility (their docs sometimes lag the React release cadence by a few weeks). Pin to whatever version the team explicitly supports.
- Decide whether `auth_events` should retain forever (compliance) or roll off (privacy). Likely "retain forever, append-only" for SOC2-adjacent posture, but worth a deliberate call before writing the migration.
- Decide the `<Header />` placement and whether it replaces the existing top nav or sits alongside it.
- Confirm the demo route URL: spec says `/account/security`, but our hash router would render that as `#account/security`. Either accept the hash form or rework the router for `/account/*` paths.

---

## Audit trail
This document was produced before any code changes. No `npm install`, no file edits beyond this record. Resume from this file when the `/legal/*` work is complete.
