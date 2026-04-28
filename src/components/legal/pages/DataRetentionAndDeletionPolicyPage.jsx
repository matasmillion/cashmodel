// @ts-check
// /legal/data-retention-and-deletion-policy — full content sourced
// from /public/legal/data-retention-and-deletion-policy-v1-1.pdf.
// Section titles, content, and ordering match the PDF verbatim.
//
// Section 4 is the retention schedule: a 4-column × 11-row table on
// desktop, switching to a card-stack on viewports ≤640px so phone
// readers don't have to horizontally scroll. The card-stack uses a
// CSS class instead of a media-query hook because we'd otherwise have
// to wire ResizeObserver into a presentation-only concern; one inline
// <style> block keeps it self-contained.

import { POLICY_META, PUBLIC_BASE_URL } from '../../../lib/legal/constants';
import { usePageMeta } from '../../../hooks/usePageMeta';
import PolicyHeader from '../PolicyHeader';
import PolicyTOC from '../PolicyTOC';
import PolicySection from '../PolicySection';
import PolicyFooter from '../PolicyFooter';
import RelatedPolicies from '../RelatedPolicies';
import ResponsivePolicyTable from '../ResponsivePolicyTable';

const PDF_HREF = `${import.meta.env.BASE_URL}legal/data-retention-and-deletion-policy-v1-1.pdf`;
const CANONICAL = `${PUBLIC_BASE_URL}/legal/data-retention-and-deletion-policy`;

const TITLE = 'Data Retention & Deletion Policy';
const META = POLICY_META.dataRetention;

// Inline style helpers — kept here rather than in PolicySection so the
// policy markup stays self-contained.
const ULIST = { paddingLeft: 22, margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 6 };
const PARA = { margin: '8px 0' };
const EMPH = { fontWeight: 600, color: '#3A3A3A' };
const SUB_HEAD = { fontWeight: 600, color: '#3A3A3A', marginTop: 14 };

// Retention schedule — pulled out of the JSX so the desktop table and
// the mobile card-stack (rendered by <ResponsivePolicyTable />) both
// consume the same data. `key` is required for React + the card title.
const RETENTION_SCHEDULE = [
  {
    key: 'plaid-access-tokens',
    category: 'Plaid access tokens',
    examples: 'OAuth tokens, item IDs, account IDs',
    retention: 'Active connection only; deleted within 30 days of disconnect or account closure',
    disposal: 'Cryptographic erasure (key destruction) + DB row delete',
  },
  {
    key: 'plaid-derived-banking-data',
    category: 'Plaid-derived banking data',
    examples: 'Transactions, balances, account metadata cached for dashboard rendering',
    retention: 'Cached briefly (≤ 30 days rolling); refreshed on demand from Plaid API',
    disposal: 'Automatic cache expiry + DB row delete',
  },
  {
    key: 'source-of-truth-financial-records',
    category: 'Source-of-truth financial records',
    examples: 'Mercury / Shopify / Finaloop authoritative records (FR is consumer of these)',
    retention: 'Governed by upstream provider retention policy',
    disposal: 'Per upstream provider procedure',
  },
  {
    key: 'internal-erp-operational-metadata',
    category: 'Internal ERP operational metadata',
    examples: 'PO records, vendor info, internal notes',
    retention: 'Lifetime of the business; archived after 7 years if no longer in active use',
    disposal: 'Logical delete then secure DB purge',
  },
  {
    key: 'business-financial-records',
    category: 'Business financial records',
    examples: 'Books, ledgers, tax records',
    retention: '7 years (US tax / corporate recordkeeping)',
    disposal: 'Secure deletion after retention period',
  },
  {
    key: 'authentication-access-logs',
    category: 'Authentication & access logs',
    examples: 'Login events, MFA challenges, privileged actions',
    retention: '90 days (rolling)',
    disposal: 'Automatic log rotation',
  },
  {
    key: 'application-error-audit-logs',
    category: 'Application error / audit logs',
    examples: 'Stack traces, system events (PII/tokens excluded)',
    retention: '90 days (rolling)',
    disposal: 'Automatic log rotation',
  },
  {
    key: 'user-accounts-internal',
    category: 'User accounts (internal)',
    examples: 'Employee / contractor accounts in the ERP',
    retention: 'Active during engagement; disabled within 24h of separation; deleted within 30 days',
    disposal: 'DB row delete + revocation of all credentials',
  },
  {
    key: 'backups',
    category: 'Backups',
    examples: 'Database point-in-time recovery snapshots',
    retention: 'Per provider default (typically 7–30 days)',
    disposal: 'Provider-managed lifecycle',
  },
  {
    key: 'future-consumer-accounts',
    category: 'Future: Consumer accounts & PII',
    examples: '(N/A today — placeholder for future consumer launch)',
    retention: 'Active until account deletion request; deleted within 30 days of verified request',
    disposal: 'Hard delete; backup tombstone within next backup cycle',
  },
  {
    key: 'future-consumer-marketing-data',
    category: 'Future: Consumer marketing data',
    examples: '(N/A today — placeholder)',
    retention: 'Until unsubscribe or 24 months of inactivity',
    disposal: 'Hard delete from primary + ESP',
  },
];

const RETENTION_COLUMNS = [
  { label: 'Data Category', field: 'category', primary: true },
  { label: 'Examples', field: 'examples' },
  { label: 'Retention', field: 'retention' },
  { label: 'Disposal Method', field: 'disposal' },
];

function RetentionScheduleTable() {
  return <ResponsivePolicyTable columns={RETENTION_COLUMNS} rows={RETENTION_SCHEDULE} />;
}

const SECTIONS = [
  {
    id: 'purpose',
    title: 'Purpose',
    body: (
      <p style={PARA}>
        This policy defines how Foreign Resource Co. (&lsquo;FR&rsquo;)
        collects, retains, and disposes of data in compliance with
        applicable data privacy laws and contractual obligations —
        including obligations to Plaid, Mercury, Shopify, and end consumers
        (where applicable in the future).
      </p>
    ),
  },
  {
    id: 'scope',
    title: 'Scope',
    body: (
      <p style={PARA}>
        This policy applies to all data stored, processed, or transmitted
        by the FR Internal ERP and its supporting infrastructure. It
        governs retention timelines, deletion procedures, and rights of
        data subjects. The policy is forward-compatible: the same controls
        extend to consumer data if the ERP is repackaged into a
        consumer-facing product.
      </p>
    ),
  },
  {
    id: 'data-minimization-principle',
    title: 'Data Minimization Principle',
    body: (
      <p style={PARA}>
        FR collects only data necessary to operate its business.
        Plaid-derived banking data is not persisted long-term in the
        application database; it is fetched on demand and cached briefly
        for dashboard rendering. Source-of-truth financial data remains
        with the upstream providers. Consumer PII is not collected by the
        ERP today and would only be collected with explicit consent and
        notice if consumer-facing functionality is launched.
      </p>
    ),
  },
  {
    id: 'retention-schedule',
    title: 'Retention Schedule',
    body: (
      <>
        <p style={PARA}>
          The following schedule is binding on all FR systems. Where
          conflicts exist between this policy and a legal/contractual
          obligation, the longer required retention applies.
        </p>
        <RetentionScheduleTable />
      </>
    ),
  },
  {
    id: 'deletion-procedures',
    title: 'Deletion Procedures',
    body: (
      <ul style={ULIST}>
        <li>
          <span style={EMPH}>Plaid disconnect:</span> When a user
          disconnects a Plaid Item, the corresponding access token is
          revoked via the Plaid API and the encrypted token is deleted
          from the database within 30 days.
        </li>
        <li>
          <span style={EMPH}>Account separation:</span> User accounts are
          disabled within 24 hours of separation and hard-deleted within
          30 days, including all session tokens and OAuth grants.
        </li>
        <li>
          <span style={EMPH}>Cryptographic erasure:</span> For at-rest
          encrypted data, key destruction is treated as equivalent to
          physical deletion; the key reference is removed and the
          ciphertext is purged on the next maintenance cycle.
        </li>
        <li>
          <span style={EMPH}>Backups:</span> Deleted records persist in
          backups only for the standard backup retention window and are
          tombstoned on restore.
        </li>
      </ul>
    ),
  },
  {
    id: 'data-subject-rights',
    title: 'Data Subject Rights (Consumer Surface)',
    body: (
      <>
        <p style={PARA}>
          <span style={EMPH}>Today (Internal-Only).</span> The ERP does
          not collect consumer data; the only data subjects are FR
          personnel, who may request access to and deletion of their own
          account data at any time.
        </p>
        <p style={PARA}>
          <span style={EMPH}>Future (Consumer-Facing).</span> If FR
          launches a consumer-facing product, the following rights are
          honored consistent with applicable laws (CCPA/CPRA,
          GDPR-equivalent frameworks, and other state privacy regimes):
        </p>
        <ul style={ULIST}>
          <li>
            <span style={EMPH}>Right to Access:</span> Consumers may
            request a copy of their data; FR responds within 45 days.
          </li>
          <li>
            <span style={EMPH}>Right to Delete:</span> Consumers may
            request deletion of their data; FR completes deletion within
            30 days of verified request, except where legally required to
            retain (e.g., transaction records for tax).
          </li>
          <li>
            <span style={EMPH}>Right to Correct:</span> Consumers may
            correct inaccurate personal data.
          </li>
          <li>
            <span style={EMPH}>Right to Opt Out:</span> Consumers may opt
            out of marketing communications and (where applicable) the
            sale or sharing of personal information.
          </li>
          <li>
            <span style={EMPH}>Request channel:</span> privacy@foreignresource.com
            or via in-product privacy controls.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'plaid-specific-provisions',
    title: 'Plaid-Specific Provisions',
    body: (
      <ul style={ULIST}>
        <li>
          FR honors all Plaid end-user data rights as required by
          Plaid&rsquo;s End User Privacy Policy and applicable law,
          including end-user requests to disconnect, port, or delete data.
        </li>
        <li>
          Plaid access tokens, account/routing numbers, and credentials
          are never shared with third parties, never logged in plaintext,
          and never used for purposes outside the disclosed use case.
        </li>
        <li>
          Upon termination of the Plaid relationship, all Plaid-derived
          data is deleted within 30 days unless retention is required by
          law.
        </li>
      </ul>
    ),
  },
  {
    id: 'legal-holds',
    title: 'Legal Holds',
    body: (
      <p style={PARA}>
        Where FR receives a valid legal hold (subpoena, litigation hold,
        regulatory investigation), the standard retention schedule is
        suspended for affected records until the hold is lifted in
        writing. Legal holds are tracked in a dedicated register.
      </p>
    ),
  },
  {
    id: 'secure-disposal',
    title: 'Secure Disposal',
    body: (
      <ul style={ULIST}>
        <li>
          <span style={EMPH}>Electronic data:</span> cryptographic erasure
          or secure database deletion.
        </li>
        <li>
          <span style={EMPH}>Physical media (if any):</span> physically
          destroyed (shredded or degaussed) before disposal.
        </li>
        <li>
          <span style={EMPH}>Paper records (if any):</span> cross-cut
          shredded.
        </li>
      </ul>
    ),
  },
  {
    id: 'roles-and-accountability',
    title: 'Roles & Accountability',
    body: (
      <ul style={ULIST}>
        <li>
          <span style={EMPH}>CISO:</span> Owns this policy; approves any
          deviations in writing.
        </li>
        <li>
          <span style={EMPH}>Engineering:</span> Implements automated
          retention and deletion controls; verifies on a quarterly basis.
        </li>
        <li>
          <span style={EMPH}>All Personnel:</span> Comply with the
          schedule; do not retain copies of Restricted data on personal
          devices.
        </li>
      </ul>
    ),
  },
  {
    id: 'review-and-maintenance',
    title: 'Review & Maintenance',
    body: (
      <p style={PARA}>
        This policy is reviewed at least annually, and upon: launch of a
        consumer-facing surface, material change in data flows, regulatory
        change, or material security incident. Version history is
        maintained in the policy footer and in the source repository.
      </p>
    ),
  },
];

export default function DataRetentionAndDeletionPolicyPage() {
  usePageMeta({
    title: `${TITLE} — Foreign Resource`,
    description:
      'How long Foreign Resource Co. retains data, why, and how it is disposed of when the retention period ends — including Plaid token handling, business-record retention, and forward-looking consumer rights.',
    canonical: CANONICAL,
    ogTitle: TITLE,
    ogType: 'article',
  });

  return (
    <article>
      <PolicyHeader
        title={TITLE}
        version={META.version}
        effective={META.effective}
        lastReviewed={META.lastReviewed}
        owner="Founder / CISO"
        classification="Internal — publicly viewable"
        pdfHref={PDF_HREF}
        pdfFilename="foreign-resource-data-retention-and-deletion-policy-v1-1.pdf"
      />
      <PolicyTOC entries={SECTIONS.map(s => ({ id: s.id, title: s.title }))} />
      {SECTIONS.map((s, i) => (
        <PolicySection key={s.id} id={s.id} title={s.title} number={i + 1}>
          {s.body}
        </PolicySection>
      ))}
      <RelatedPolicies currentPolicyId="dataRetention" />
      <PolicyFooter
        title={TITLE}
        version={META.version}
        effective={META.effective}
        lastReviewed={META.lastReviewed}
      />
    </article>
  );
}
