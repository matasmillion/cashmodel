# Security

This document is the operational summary of how Foreign Resource Co. (FR)
secures the internal ERP and the Plaid integration that runs on it. It
sits alongside the published policies under `/legal/*` — those are the
source of truth; this file is the engineer-facing pointer to where each
control lives in the codebase.

## Authentication

- **Phishing-resistant MFA (passkeys) is enforced** via Clerk on all
  human access to the ERP. Passkeys are the primary first factor;
  TOTP is acceptable; SMS is permitted only as a recovery fallback.
  See: [Access Control Policy §5](https://matasmillion.github.io/cashmodel/legal/access-control-policy)
  and `src/lib/auth/`.
- **Sign-up is invitation-only.** Clerk runs in Restricted mode; new
  accounts can only be created via an admin invitation. See:
  Compartment 2 of `docs/plaid-rollout/4CLAUDE_CODE_PROMPT_4_MFA_Build.md`.
- **Sessions** expire after 12 hours of inactivity or 7 days absolute,
  whichever comes first. Logout terminates the server-side session.
  See: Access Control Policy §6.
- **Authentication abstraction** lives in `src/lib/auth/`. UI components
  and stores import from there, never from `@clerk/clerk-react`
  directly, so a future provider swap touches one file.

## Audit log

- **All authentication events are logged** to `public.auth_events`
  (append-only). The `clerk-webhook` Supabase Edge Function writes
  rows on every `session.created`, `session.ended`, `session.removed`,
  `session.revoked`, and on `user.updated` events that change the MFA
  factor set.
- Event vocabulary (canonical strings): `sign_in_success`,
  `sign_in_failure`, `mfa_challenge_success`, `mfa_challenge_failure`,
  `mfa_enrolled`, `mfa_removed`, `password_reset_requested`,
  `password_reset_completed`, `sign_out`. See `src/lib/audit/log.js`.
- Users see their own log at `/account/security/activity`. Admins see
  every user's events.
- Retention: 90 days rolling per InfoSec Policy §10. Append-only by
  RLS construction (no UPDATE / DELETE policies; service role only
  inserts).

## Encryption

- **In transit**: TLS 1.2+ enforced by hosting providers; HSTS on.
- **At rest**: Supabase / Vercel-managed AES-256 on the storage layer.
- **Plaid access tokens**: application-layer envelope encryption is
  planned for Prompt 5 of the rollout (`docs/plaid-rollout/5CLAUDE_CODE_PROMPT_5_TokenEncryption.md`).
  Until that lands, tokens are protected by the storage-layer
  encryption + RLS scoping. The webhook + edge functions are the only
  components that ever read tokens; the SPA bundle never receives one.

## Provider-level MFA — required

The Access Control Policy §5 ("Infrastructure MFA") requires
provider-level MFA on every external system that holds FR data or
infrastructure. The list:

- GitHub
- Vercel _(if the deploy target shifts off GitHub Pages)_
- Supabase
- Mercury
- Shopify
- Plaid Dashboard
- Clerk
- Klaviyo
- Finaloop
- Google Workspace _(IdP for Clerk OAuth)_

Each account's MFA settings are reviewed in the quarterly access
review per AC Policy §10. The review log is kept in
`compliance/access-review-template.md` (added in Prompt 6).

## Reporting a vulnerability

Email **security@foreignresource.com**. We acknowledge within 72 hours
and provide status updates every 7 days until the issue is closed.
Good-faith research is welcomed; please don't access data beyond what
proves the report and don't run automated scans against production.

A formal `.github/SECURITY.md` (GitHub-recognized vulnerability
disclosure file) is added in Prompt 6 of the rollout. Until that lands,
this section is the canonical disclosure address.

## References

- [`/legal/information-security-policy`](https://matasmillion.github.io/cashmodel/legal/information-security-policy)
- [`/legal/data-retention-and-deletion-policy`](https://matasmillion.github.io/cashmodel/legal/data-retention-and-deletion-policy)
- [`/legal/access-control-policy`](https://matasmillion.github.io/cashmodel/legal/access-control-policy)
- `compliance/auth-stack-decision.md` — why Clerk on a Vite SPA, not Next.js
- `docs/plaid-rollout/` — the prompt set this implementation came from
