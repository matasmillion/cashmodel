# Claude Code Prompt 3 — Access Control Policy

> **How to use:** Run only after Prompts 1 and 2 are merged (or their pages are live). 4 compartments, separated by `═══ STOP — AWAIT CONFIRMATION ═══` markers.

---

## Context for Claude Code

The `/legal` section of the FR ERP already has Information Security Policy and Data Retention & Deletion Policy pages live. You're adding the **Access Control Policy** as the third and final policy in this batch. Reuse all existing components.

**Operational rules — do not violate:**
- Do **not** run `npm install` or add new dependencies without asking me first.
- Do **not** modify locked components (`LegalLayout`, `PolicyHeader/TOC/Section/Footer`).
- Do **not** deploy to production.
- After each compartment, post a short summary and **wait for me to say "go"**.

---

## ═══ COMPARTMENT 1 — Confirm Infrastructure & Plan ═══

1. Run `git status` and confirm clean working tree.
2. Verify InfoSec and Data Retention pages are live and the components from Prompt 1 are still in place.
3. Propose a plan:
   - Route: `/legal/access-control-policy`
   - PDF placement: `/public/legal/access-control-policy-v1.pdf`
   - Note: this policy contains an RBAC roles table (Section 4) — propose responsive rendering similar to the Data Retention table.

Wait for go-ahead.

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 2 — Build the Policy Page ═══

1. Place the supplied PDF in `/public/legal/access-control-policy-v1.pdf`.
2. Create `/legal/access-control-policy/page.tsx`.
3. Use the same component pattern:
   - `<PolicyHeader>` with: title "Access Control Policy", version 1.0, effective date April 27 2026, owner "Founder / CISO", classification "Internal — publicly viewable", Download PDF button.
   - `<PolicyTOC>` with all 16 sections.
   - One `<PolicySection>` per numbered section (1–16) with the exact content from the supplied PDF.
   - **Section 4 (Roles & Permissions)** renders as a 3-column responsive table: Role | Description | Sample Permissions.
   - `<PolicyFooter>` with "End of Access Control Policy — v1.0 — Effective April 27, 2026".
4. Page metadata: title, description, OpenGraph, robots index/follow, canonical — match siblings.
5. Add `POLICY_LAST_REVIEWED.accessControl` to the constants file.

Report files changed.

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 3 — Finalize the Legal Section ═══

1. Update `/legal` index: change Access Control from "Coming soon" to live link. All three policies should now be active.
2. Footer "Security & Privacy" section: all three policies live.
3. Update `sitemap.xml` / `app/sitemap.ts` with the new page.
4. Update "Related policies" sections on InfoSec and Data Retention pages to make the Access Control link active (no longer disabled).
5. Add a brief paragraph to the `/legal` index page (1–2 sentences) explaining what this section is and why it's published — something like: "These policies govern how Foreign Resource Co. operates its internal ERP and protects banking, business, and (forthcoming) consumer data. They are published publicly for transparency and to support Plaid's developer review process."
6. Run locally and confirm all three policy pages render, all PDFs download, all cross-links work, mobile responsive, no console errors.

═══ STOP — AWAIT CONFIRMATION ═══

---

## ═══ COMPARTMENT 4 — Commit, PR & Final Verification ═══

1. Show me `git diff --stat`.
2. Commit on branch `legal/access-control-policy-v1`:
   ```
   feat(legal): add Access Control Policy v1.0 and complete /legal section

   - Add /legal/access-control-policy page
   - Add downloadable PDF
   - Update /legal index, footer, sitemap, related-policies cross-links
   - Add /legal section description
   ```
3. Push and open a PR. **Do not merge.** Wait for my review.
4. After I confirm the merge of all three PRs, run a final pass:
   - Crawl `/legal` and report each policy URL
   - Confirm every PDF is downloadable from its public URL
   - Confirm `sitemap.xml` lists all three URLs
   - Confirm `robots.txt` does not block `/legal`
5. Output a final summary I can paste into the Plaid questionnaire as proof of policies, including:
   - Live URL for each policy
   - PDF download URL for each
   - Effective date and version

═══ END OF PROMPT 3 ═══
