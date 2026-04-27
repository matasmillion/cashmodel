# Claude Code Prompt 6 — Repository & Compliance Hardening

> **How to use:** Paste this entire prompt into Claude Code. It is broken into 5 compartments separated by `═══ STOP — AWAIT CONFIRMATION ═══` markers. Claude Code must complete each compartment, summarize what it did, and wait for your explicit "go" before moving on.
>
> **Why this matters:** The three policies make several promises that aren't reflected in the actual repository configuration. Plaid Q3 (access controls) and Q8 (vulnerability management) require honest answers backed by evidence. This prompt closes the gap so the codebase actually does what the policies say.

---

## Context for Claude Code

You are working on the Foreign Resource Co. internal ERP (`cashmodel` repo). This prompt configures the GitHub repository, sets up vulnerability management, and creates a `compliance/` directory in the repo with the operational artifacts our policies promise (vendor inventory, access review template, IR runbook, calendar of recurring reviews).

This is mostly **configuration and documentation** — minimal application code. Many steps require GitHub web UI changes that you cannot execute yourself; you'll guide me through them step by step.

**Operational rules — do not violate:**
- Do **not** install any new dependencies without asking first.
- Do **not** deploy to production.
- Do **not** modify `/legal` pages, auth code, or the encryption module from earlier prompts.
- Many steps require me to click in GitHub or Vercel — clearly mark those as "Manual Step (Matias)" with explicit instructions.
- After each compartment, post a short summary and **wait for me to say "go"** before proceeding.

---

## ═══ COMPARTMENT 1 — Discovery & Plan (NO CODE CHANGES) ═══

1. Run `git status` and `git log --oneline -10`.
2. Inspect and report:
   - Current GitHub repo URL and default branch name
   - Whether a `.github/` directory exists, and what's in it
   - Whether `dependabot.yml`, `CODEOWNERS`, PR template, or issue template exist
   - Whether any GitHub Actions workflows exist
   - What package manager is in use (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`)
   - Node version specified anywhere (`engines` in `package.json`, `.nvmrc`, `.node-version`)
3. Propose a plan covering:
   - **GitHub repository configuration** (manual steps for me): branch protection on `main`, required PR review, required status checks, signed commits requirement, secret scanning, push protection, Dependabot alerts + security updates
   - **Repository files to add**: `.github/dependabot.yml`, `.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/SECURITY.md` (separate from repo-root `SECURITY.md` — this one is the GitHub-recognized vulnerability disclosure file), `.github/workflows/ci.yml`
   - **Compliance directory**: `compliance/vendor-inventory.md`, `compliance/access-review-template.md`, `compliance/incident-response-runbook.md`, `compliance/review-calendar.md`, `compliance/policy-acknowledgements.md`
   - **Vercel configuration** (manual steps for me): preview-deploy environment variables, production branch protection, deploy notifications
4. **Do not write any code yet.** Stop and wait for my approval.

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 2 — Dependabot, Secret Scanning, CI ═══

### Files to create

1. **`.github/dependabot.yml`** — weekly checks across all ecosystems in use:
   ```yaml
   version: 2
   updates:
     - package-ecosystem: "npm"
       directory: "/"
       schedule:
         interval: "weekly"
         day: "monday"
       open-pull-requests-limit: 10
       labels: ["dependencies", "security"]
       commit-message:
         prefix: "chore(deps)"
         include: "scope"
     - package-ecosystem: "github-actions"
       directory: "/"
       schedule:
         interval: "weekly"
   ```
   Adjust `package-ecosystem` if the project uses pnpm/yarn/bun (Dependabot supports `npm` for all of these).

2. **`.github/workflows/ci.yml`** — minimum CI to gate PRs:
   ```yaml
   name: CI
   on:
     pull_request:
       branches: [main]
     push:
       branches: [main]
   jobs:
     lint-typecheck-test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version-file: '.nvmrc'
             cache: 'npm'
         - run: npm ci
         - run: npm run lint
         - run: npm run typecheck
         - run: npm test --if-present
         - run: npm run build
   ```
   - Add `.nvmrc` with the Node LTS version we're using (verify with me first — likely `20` or `22`)
   - Add `typecheck` script to `package.json` if missing: `"typecheck": "tsc --noEmit"`

3. **`.github/SECURITY.md`** — GitHub's vulnerability disclosure file:
   - Where to report: `security@foreignresource.com` (this address must exist before submission — flag this for me)
   - What's in scope: foreignresource.com, the internal ERP, all Plaid integrations
   - Response SLA: acknowledge within 72 hours, status updates every 7 days
   - Safe harbor language for good-faith research

4. **`.github/PULL_REQUEST_TEMPLATE.md`** — checklist:
   - What changed
   - Why
   - Security review checklist (touches auth? touches Plaid tokens? touches secrets? touches data retention?)
   - Test plan
   - Rollback plan

5. **`.github/CODEOWNERS`** — `* @matasmillion` for now (single founder), so every PR auto-requests his review.

### Manual Steps (Matias) — list them clearly for me

Tell me to do the following in the GitHub web UI, with the exact navigation path for each:

1. **Settings → Code security and analysis**:
   - Enable: Dependabot alerts
   - Enable: Dependabot security updates
   - Enable: Secret scanning
   - Enable: Push protection (blocks pushes containing secrets)
   - Enable: Code scanning (CodeQL — pick the default config)

2. **Settings → Branches → Add rule for `main`**:
   - Require a pull request before merging
   - Require approvals: 1 (this is okay even as a solo founder — your future self benefits from the diff review)
   - Dismiss stale reviews when new commits are pushed
   - Require status checks: `lint-typecheck-test` (the workflow above)
   - Require branches to be up to date before merging
   - Require conversation resolution
   - Require signed commits (set up GPG/SSH commit signing first — I'll help with that in a sub-step if needed)
   - Restrict deletions
   - Block force pushes

3. **Settings → General → Pull Requests**:
   - Allow squash merging only (cleaner history)
   - Always suggest updating PR branches
   - Automatically delete head branches

After I confirm those manual steps are done, run `git push` and verify the protection rules are active by trying a push directly to `main` (it should be rejected).

Report:
- Files created
- The exact list of manual GitHub steps for me
- Whether you need help generating GPG/SSH signing keys

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 3 — Compliance Directory ═══

Create a `compliance/` directory at the repo root with these files. **All content must align with what the three policies promise** — do not invent obligations the policies don't have, and do not omit obligations they do.

### `compliance/vendor-inventory.md`

A living register of every vendor processing FR data. Format as a table with columns:

| Vendor | Service | Data Categories | Provider Tier (Critical/Important/Standard) | SOC 2 / ISO 27001 | DPA Signed | Last Reviewed | Next Review |

Pre-populate with these vendors mentioned in the InfoSec Policy:
- **Plaid** — Banking data API — Restricted (banking data, tokens) — Critical
- **Mercury** — Business banking — Restricted (account data) — Critical
- **Shopify** — E-commerce platform — Confidential (order data, customer email/name) — Critical
- **Vercel** — Hosting + edge runtime — Confidential (app data in transit, logs) — Critical
- **Supabase** — Database + auth — Restricted (encrypted Plaid tokens, user data) — Critical
- **Clerk** — Identity provider + MFA — Restricted (user credentials, MFA factors) — Critical
- **Klaviyo** — Marketing email + SMS — Confidential (customer email, behavior data) — Important
- **Finaloop** — Financial reporting — Confidential (P&L data) — Important
- **GitHub** — Source code + CI — Confidential (source code, secrets via Actions) — Critical
- **Trybe** — Creator commission management — Confidential (creator PII, payout data) — Important
- **Apify** — Instagram scraping — Internal (public IG data) — Standard
- **Make.com** — Automation — Confidential (depending on flows) — Important
- **Portless / Ops Engine** — Fulfillment — Confidential (customer shipping addresses) — Critical

For each, leave SOC 2 / DPA columns blank for me to fill in; pre-fill "Last Reviewed" as today's date and "Next Review" as one year from today.

Add a header noting: "This register is reviewed annually per the Information Security Policy §12. Critical vendors trigger a compensating-control review if SOC 2 attestation lapses."

### `compliance/access-review-template.md`

A markdown template for the quarterly access review promised in the Access Control Policy §10. Includes:
- Review date
- Reviewer (CISO)
- Scope (ERP, GitHub, Vercel, Supabase, Clerk, Mercury, Shopify, Plaid Dashboard, Klaviyo)
- Per-system checklist:
  - Active users list
  - Roles still appropriate? (Y/N per user)
  - Inactive >90 days? (action: disable)
  - Service accounts inventory + scope review
  - Anomalies / actions taken
- Sign-off line

### `compliance/incident-response-runbook.md`

The InfoSec Policy §11 describes the lifecycle but no runbook exists. Create one with sections:
- **Roles**: Incident Commander (CISO), Communications Lead, Engineering Lead — solo founder occupies all three today; structure exists for future delegation
- **Severity definitions** (P0/P1/P2/P3) with examples
- **Lifecycle phases** with concrete actions per phase:
  - Detect (sources: monitoring alerts, customer reports, internal discovery)
  - Triage (severity assignment within 1 hour)
  - Contain (isolate affected systems, rotate credentials if compromised)
  - Eradicate (remove root cause)
  - Recover (verify systems, restore from backup if needed)
  - Notify (Plaid within 72 hours if Plaid data affected, customers per applicable law, regulators per applicable law)
  - Post-mortem (blameless write-up within 14 days, retained 3 years)
- **Plaid-specific notification template** (subject, recipients: security@plaid.com, content checklist)
- **Communication templates** for: customers, Plaid, regulators, internal team
- **Decision log table** for the active incident

### `compliance/review-calendar.md`

A calendar of recurring obligations from the three policies. Format as a table:

| Cadence | Activity | Source Policy | Owner | Next Due |

Include:
- Quarterly: access reviews (Access Control §10)
- Quarterly: privileged action log review (Access Control §7)
- Quarterly: service account inventory review (Access Control §10)
- Quarterly: exceptions register review (Access Control §15)
- Annually: vendor inventory review (InfoSec §12)
- Annually: policy review for all three policies (each policy §17/§11/§16)
- Annually: encryption key rotation (InfoSec §6)
- Annually: security awareness review (InfoSec §13)
- On separation: account de-provisioning within 24h (Access Control §9)
- On material change: risk assessment (InfoSec §3)
- On incident: 72-hour Plaid notification + post-mortem within 14 days (InfoSec §11)

Pre-fill "Next Due" with concrete dates from today.

### `compliance/policy-acknowledgements.md`

The InfoSec Policy §13 promises "All personnel acknowledge this policy in writing prior to receiving access." Today this is just you, but the file institutionalizes it.

Format:

| Name | Role | Date of Hire/Engagement | Policies Acknowledged | Acknowledgement Method | Date Acknowledged |

Pre-fill with: Matias Millan, Founder/CISO, [start date], all three policies, "Self-acknowledged via signed git commit on this file", today's date.

When you commit this file, sign the commit (`git commit -S`) so the acknowledgement is cryptographically tied to your identity. If signing isn't set up, flag it and stop — Compartment 2 should have set this up already.

Report files created and any inconsistencies you found between the policies and what you've drafted.

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 4 — Cross-Linking & Repository Documentation ═══

1. Update the repo-root `README.md` to include a "Security & Compliance" section linking to:
   - The three published policies at `/legal/*` (live URLs)
   - The repo-root `SECURITY.md`
   - The `compliance/` directory
   - The `.github/SECURITY.md` vulnerability disclosure file

2. Update the repo-root `SECURITY.md` (which exists from Prompt 4) to add:
   - Link to `compliance/incident-response-runbook.md`
   - Link to `compliance/vendor-inventory.md`
   - Link to `.github/SECURITY.md` for vulnerability disclosure

3. Add a `compliance/README.md` index that explains:
   - What's in this directory
   - Cadence of updates
   - Who owns each file (CISO for everything today)
   - That this directory is the operational implementation of the published policies at `/legal/*`

4. Ensure `compliance/` is **not** excluded by `.gitignore` and **is** indexed by Next.js's tooling without breaking anything (it shouldn't, since these are markdown files outside `app/` and `pages/`).

5. Verify locally:
   - `npm run build` still succeeds
   - `npm run lint` passes (the new `console.*` ESLint rule from Prompt 5 should pass since `compliance/` is markdown only)
   - `npm test --if-present` passes

Report files changed.

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 5 — Commit, PR & Plaid Submission Pack ═══

1. Show me `git diff --stat`.

2. Commit on branch `compliance/repo-hardening-and-operational-artifacts`. Use a signed commit (`git commit -S`):
   ```
   feat(compliance): repo hardening + operational compliance artifacts

   - Add Dependabot config (npm + github-actions, weekly)
   - Add GitHub Actions CI workflow (lint, typecheck, test, build)
   - Add .github/SECURITY.md, PULL_REQUEST_TEMPLATE.md, CODEOWNERS
   - Add compliance/ directory:
     - vendor-inventory.md
     - access-review-template.md
     - incident-response-runbook.md
     - review-calendar.md
     - policy-acknowledgements.md (signed commit = acknowledgement)
   - Update README.md and SECURITY.md with cross-links
   ```

3. Push and open a PR. **Do not merge.** Wait for my review.

4. Output a **Plaid Submission Pack** combining all the gaps this prompt closes:
   - Q3 (Access Controls) supporting documentation:
     - Link to `/legal/access-control-policy`
     - Screenshot of GitHub branch protection settings (you'll guide me to capture this)
     - Screenshot of `compliance/access-review-template.md` and the calendar entry showing next quarterly review date
   - Q8 (Vulnerability Management) supporting documentation:
     - Screenshot of GitHub Security tab showing Dependabot alerts enabled, secret scanning enabled
     - Screenshot of `.github/dependabot.yml` in the repo
     - Reference to InfoSec Policy §8 patching SLA table
   - One paragraph I can paste into Plaid's documentation field summarizing the access control + vulnerability management posture

5. Final verification — paste the output:
   ```bash
   ls -la .github/
   ls -la compliance/
   cat .github/dependabot.yml
   gh repo view --json defaultBranchRef,securityAndAnalysis,branchProtectionRules 2>/dev/null || echo "gh CLI not available — verify manually in GitHub UI"
   ```

═══ END OF PROMPT 6 ═══
