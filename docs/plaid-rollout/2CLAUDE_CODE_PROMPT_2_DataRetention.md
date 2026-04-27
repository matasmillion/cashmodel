# Claude Code Prompt 2 — Data Retention & Deletion Policy

> **How to use:** Run only after Prompt 1 has been merged (or at minimum the `/legal` infrastructure is in place). This prompt is broken into 4 compartments separated by `═══ STOP — AWAIT CONFIRMATION ═══` markers.

---

## Context for Claude Code

The `/legal` section of the FR ERP already exists with an Information Security Policy page. You're now adding the **Data Retention & Deletion Policy** as the second page in that section. Reuse all existing components — do not redesign the layout, footer, or typography.

**Operational rules — do not violate:**
- Do **not** run `npm install` or add new dependencies without asking me first.
- Do **not** modify the `LegalLayout` or `PolicyHeader/TOC/Section/Footer` components — they're locked.
- Do **not** deploy to production.
- After each compartment, post a short summary and **wait for me to say "go" before proceeding**.

---

## ═══ COMPARTMENT 1 — Confirm Infrastructure & Plan ═══

1. Run `git status` and confirm we're on a clean main (or a new branch off main).
2. Verify the following exist from Prompt 1:
   - `/legal` index page
   - `LegalLayout`, `PolicyHeader`, `PolicyTOC`, `PolicySection`, `PolicyFooter` components
   - `/public/legal/` directory
   - `POLICY_LAST_REVIEWED` constants file
3. If any of the above is missing, **stop and tell me** — do not proceed.
4. Propose a plan:
   - Route: `/legal/data-retention-and-deletion-policy` (or shorter: `/legal/data-retention`)
   - PDF placement: `/public/legal/data-retention-and-deletion-policy-v1.pdf`
   - Any open questions about how the retention-schedule table should render in the web view (the PDF has a 4-column table; suggest how to handle this responsively — likely a styled `<table>` with a card-stack fallback on mobile)

Report back and wait.

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 2 — Build the Policy Page ═══

Once I confirm:

1. Place the supplied PDF in `/public/legal/data-retention-and-deletion-policy-v1.pdf`.
2. Create `/legal/data-retention-and-deletion-policy/page.tsx` (or equivalent for the router in use).
3. Use the exact same component pattern as the InfoSec page:
   - `<PolicyHeader>` with: title "Data Retention & Deletion Policy", version 1.0, effective date April 27 2026, owner "Founder / CISO", classification "Internal — publicly viewable", **Download PDF button** pointing to `/legal/data-retention-and-deletion-policy-v1.pdf`.
   - `<PolicyTOC>` listing all 11 sections.
   - One `<PolicySection>` per numbered section. Use the exact section titles and content from the supplied PDF (sections 1–11).
   - **Section 4 (Retention Schedule)** is a table — render as a clean styled `<table>` desktop, card-stack on mobile (≤640px), columns: Data Category | Examples | Retention | Disposal Method.
   - `<PolicyFooter>` with "End of Data Retention & Deletion Policy — v1.0 — Effective April 27, 2026".
4. Page metadata:
   - `<title>`: "Data Retention & Deletion Policy — Foreign Resource"
   - Description, OpenGraph, robots index/follow, canonical URL — match the InfoSec page pattern.
5. Add `POLICY_LAST_REVIEWED.dataRetention` to the constants file.

Report files changed and any rendering issues, especially around the table.

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 3 — Cross-Linking & Index Update ═══

1. Update `/legal` index: change Data Retention status from "Coming soon" to a live link.
2. Update the site footer's "Security & Privacy" section: Data Retention is now live.
3. Update `sitemap.xml` (or `app/sitemap.ts`) to include the new page.
4. Add a small "Related policies" section at the bottom of the InfoSec page **and** the Data Retention page, linking to each other and to the (still pending) Access Control page (with a `disabled` style for the latter).
5. Run the project locally and confirm:
   - `/legal/data-retention-and-deletion-policy` renders
   - All 11 sections present
   - Retention table renders cleanly on desktop and mobile
   - PDF download works
   - Cross-links work
   - No console errors

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 4 — Commit & PR ═══

1. Show me `git diff --stat`.
2. Commit on branch `legal/data-retention-policy-v1`:
   ```
   feat(legal): add Data Retention & Deletion Policy v1.0

   - Add /legal/data-retention-and-deletion-policy page
   - Add downloadable PDF
   - Update /legal index, footer, sitemap, related-policies cross-links
   ```
3. Push and open a PR. **Do not merge.** Wait for my review.

═══ END OF PROMPT 2 ═══
