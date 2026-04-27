# Claude Code Prompt 1 — Information Security Policy + /legal Infrastructure

> **How to use:** Paste this entire prompt into Claude Code. It is broken into 5 compartments separated by `═══ STOP — AWAIT CONFIRMATION ═══` markers. Claude Code must complete each compartment, summarize what it did, and wait for your explicit "go" before moving on.

---

## Context for Claude Code

You are working on the Foreign Resource Co. internal ERP (`cashmodel` repo). This is a Next.js application that will eventually be submitted to Plaid for production access. I need you to:

1. Build out a `/legal` section on the ERP itself so Plaid reviewers can verify our policies exist at a public URL.
2. Implement the **Information Security Policy** as the first page in that section.
3. Set up the shared infrastructure (layout, index, footer link, PDF download support) that the next two policies will reuse.

**Forward-looking constraint:** Although the ERP is internal-only today, we may launch a consumer-facing version of this codebase in the future. Build the `/legal` section as if it will eventually be customer-facing — clean typography, brand-aligned, mobile-responsive, indexable.

**Brand tokens (use these):**
- Colors: Salt `#F7F7F5`, Slate `#0F1419`, Sand `#E5E5E0`, Soil `#5C6770`
- Display font: Cormorant Garamond (headings, doc titles)
- Body font: General Sans (everything else)
- If these aren't already wired up in the project, fall back to system serif / system sans and flag it for me.

**Operational rules — do not violate:**
- Do **not** run `npm install` or add new dependencies without asking me first.
- Do **not** deploy to production. Vercel preview deploys via PR are fine.
- Do **not** modify any existing file outside the `/legal` scope without flagging it first.
- After each compartment, post a short summary (what changed, what files, any open questions) and **wait for me to say "go" before proceeding to the next compartment**.

---

## ═══ COMPARTMENT 1 — Discovery & Plan (NO CODE CHANGES) ═══

Before writing any code, do the following and report back:

1. Run `git status` and `git log --oneline -10` so we know the current state.
2. Inspect the repo and tell me:
   - Is this Next.js App Router or Pages Router? Which version?
   - What styling system is in use (Tailwind, CSS modules, vanilla CSS, shadcn/ui)?
   - Where do shared layouts live? (`app/layout.tsx`? `pages/_app.tsx`? a `components/Layout` directory?)
   - Is there an existing `/public` directory? Any existing `/legal` or `/policies` pages?
   - Are the brand fonts (Cormorant Garamond, General Sans) loaded anywhere? Where?
   - Is there an existing footer component? Where is it defined and rendered?
3. Propose a plan for `/legal` covering:
   - Route structure (`/legal`, `/legal/information-security-policy`, future `/legal/data-retention`, `/legal/access-control`)
   - Where the shared `LegalLayout` component will live
   - Where the InfoSec PDF will live in `/public` (suggested: `/public/legal/information-security-policy-v1.pdf`)
   - How the page will render: long-form MDX vs. structured TSX with content-as-data — recommend the simpler path given the existing stack
   - SEO/metadata strategy (Next.js `metadata` export with title, description, robots: `index, follow`)
4. **Do not write any code yet.** Stop and wait for me to approve the plan.

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 2 — /legal Shared Infrastructure ═══

Once I approve the plan, build only the shared infrastructure — no policy content yet.

1. Create the `/legal` route with:
   - A shared `LegalLayout` component (sticky header with "Foreign Resource — Legal" + back-to-app link, max-width readable column ~720px, generous whitespace, branded typography).
   - A `/legal` index page that lists the three policies (only InfoSec will be live initially; the other two should be listed as "Coming soon" placeholders with `disabled` styling — do not link them yet).
   - Reusable sub-components: `<PolicyHeader />` (title, version, effective date, last reviewed, owner, download-PDF button), `<PolicyTOC />` (table of contents with anchor scroll), `<PolicySection id="..." title="...">` (h2 + content slot), `<PolicyFooter />` (version + "End of policy" line + last-updated timestamp).
2. Create `/public/legal/` directory and place the InfoSec PDF I'm providing into it as `information-security-policy-v1.pdf`. (I will supply the file separately — confirm placement.)
3. Add a `Legal` link to the existing site footer (or create a footer if none exists). Link target: `/legal`.
4. Make sure the `/legal` index renders correctly at `localhost:3000/legal` with the right typography and that the `<PolicyHeader />` and other components are exported and ready to use.
5. Do **not** add the InfoSec page content yet.

After completing, report:
- Files created / modified
- A screenshot description (what `/legal` looks like)
- Anything unclear about the brand tokens or component API

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 3 — Information Security Policy Page ═══

Now build `/legal/information-security-policy` using the components from Compartment 2.

1. Create the page route. Use the content from the PDF I supplied — I'll paste the full text into the chat or you can extract it from the PDF in `/public/legal/`. Render it as web content (do not iframe the PDF).
2. Page structure:
   - `<PolicyHeader>` with: title "Information Security Policy", version 1.0, effective date April 27 2026, owner "Founder / CISO", classification "Internal — publicly viewable", **and a "Download PDF" button linking to `/legal/information-security-policy-v1.pdf`**.
   - `<PolicyTOC>` listing all 18 sections with anchor links.
   - One `<PolicySection>` per numbered section in the policy (1 through 18). Use the exact section titles and content from the PDF.
   - `<PolicyFooter>` with version + "End of Information Security Policy — v1.0 — Effective April 27, 2026".
3. Page metadata:
   - `<title>`: "Information Security Policy — Foreign Resource"
   - `<meta name="description">`: a one-sentence summary
   - OpenGraph + Twitter Card with brand-appropriate fallback image
   - `robots: index, follow` (Plaid reviewers and search engines should be able to find this)
   - Add a `<link rel="canonical">` to the live URL once we know the deploy domain
4. Update `/legal` index: change "Coming soon" for InfoSec to a live link.
5. Verify mobile responsiveness — the readable column should reflow cleanly on phone widths.

Report back:
- Files created / modified
- Lighthouse / accessibility flags if any obvious ones
- Confirmation that the "Download PDF" button works locally

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 4 — Polish & Cross-Linking ═══

1. Add a small "Last reviewed: [date]" timestamp component that pulls from a constant (`POLICY_LAST_REVIEWED.infosec`) — single source of truth so we don't have to hunt down dates across files.
2. Add a `/legal/version-history` placeholder page (returns "Version history will be published on next material update") so we can fill it in later when v2 ships.
3. Ensure `sitemap.xml` and `robots.txt` include `/legal` and `/legal/information-security-policy`. If Next.js generates these automatically via `app/sitemap.ts`, update accordingly. Do not block these from indexing.
4. Add a "Security & Privacy" section to the existing site footer that lists InfoSec (live), Data Retention (coming), Access Control (coming) — no live links for the latter two yet.
5. Run the project locally and confirm:
   - `/legal` renders
   - `/legal/information-security-policy` renders, all 18 sections present, anchors work, PDF download works
   - Footer link works from any page
   - Mobile layout looks clean
   - No console errors

Report back with confirmation and any issues.

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 5 — Commit & Push ═══

1. Show me the full `git diff --stat` so I can review scope.
2. Stage and commit on a new branch named `legal/information-security-policy-v1` with a clean commit message:
   ```
   feat(legal): add /legal scaffold and Information Security Policy v1.0

   - Add /legal index, LegalLayout, PolicyHeader/TOC/Section/Footer components
   - Add /legal/information-security-policy page
   - Add downloadable PDF at /public/legal/information-security-policy-v1.pdf
   - Add footer link, sitemap entry, robots configuration
   ```
3. Push the branch to GitHub and open a PR with a description summarizing what's in it and noting that Data Retention and Access Control policies will follow in subsequent PRs.
4. **Do not merge.** Wait for my review.

Report the PR URL and any push errors.

═══ END OF PROMPT 1 ═══
