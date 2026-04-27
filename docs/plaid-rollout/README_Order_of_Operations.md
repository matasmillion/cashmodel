# Plaid Policy Rollout — Order of Operations

You have **6 files** to use:

## Three PDF Policies (drop these into the ERP repo and the Plaid questionnaire)

1. `Foreign_Resource_Information_Security_Policy.pdf`
2. `Foreign_Resource_Data_Retention_and_Deletion_Policy.pdf`
3. `Foreign_Resource_Access_Control_Policy.pdf`

## Three Claude Code Prompts (paste into Claude Code one at a time, in order)

1. `CLAUDE_CODE_PROMPT_1_InfoSec.md` — Sets up the entire `/legal` infrastructure + InfoSec page. **Run this first.**
2. `CLAUDE_CODE_PROMPT_2_DataRetention.md` — Adds Data Retention page on top of the existing infrastructure. **Run only after Prompt 1 PR is merged.**
3. `CLAUDE_CODE_PROMPT_3_AccessControl.md` — Adds Access Control page and finalizes the `/legal` section. **Run only after Prompt 2 PR is merged.**

## How to use a prompt

1. Open Claude Code in the `cashmodel` repo.
2. Paste the entire prompt file.
3. Have the corresponding PDF ready to share when Claude Code asks for it.
4. Claude Code will work in compartments. After each compartment it will summarize what it did and **wait for you to say "go"**.
5. Review carefully before approving each step.

## What to do AFTER all three PRs are merged

1. Confirm public URLs:
   - `https://[your-erp-domain]/legal`
   - `https://[your-erp-domain]/legal/information-security-policy`
   - `https://[your-erp-domain]/legal/data-retention-and-deletion-policy`
   - `https://[your-erp-domain]/legal/access-control-policy`
2. Go back to the Plaid questionnaire and update:
   - **Q2** → Change to "Yes - We have an operational information security program, but no documented policy" → and once page is live, upgrade to "Yes - We have a documented policy, procedures, and an operational information security program that is continuously matured." Reference URL: `/legal/information-security-policy`
   - **Q3** → Add: defined access control policy, periodic access reviews, automated de-provisioning, OAuth/TLS for non-human auth (after these are implemented per the Access Control Policy)
   - **Q5** → After Clerk/Auth0 integration with passkeys, change to "Yes - Phishing-resistant multi-factor authentication"
   - **Q8** → Add: patch SLA defined, EOL software monitoring (after Dependabot enabled and policy published)
   - **Q11** → Change to "Yes" and reference URL: `/legal/data-retention-and-deletion-policy`
3. The remaining technical changes (Clerk MFA, Dependabot, encrypted token storage) are separate from this rollout — handle those in their own Claude Code sessions before resubmitting to Plaid.
