// @ts-check
// /legal/access-control-policy — full content sourced from
// /public/legal/access-control-policy-v1-1.pdf. Section titles,
// content, and ordering match the PDF verbatim.
//
// Section 4 (Roles & Permissions) is a 3-column × 5-row RBAC table
// rendered through <ResponsivePolicyTable />, mirroring how the Data
// Retention §4 schedule renders. Same desktop-table / ≤640px
// card-stack treatment, single shared component.

import { POLICY_META, PUBLIC_BASE_URL } from '../../../lib/legal/constants';
import { usePageMeta } from '../../../hooks/usePageMeta';
import PolicyHeader from '../PolicyHeader';
import PolicyTOC from '../PolicyTOC';
import PolicySection from '../PolicySection';
import PolicyFooter from '../PolicyFooter';
import RelatedPolicies from '../RelatedPolicies';
import ResponsivePolicyTable from '../ResponsivePolicyTable';

const PDF_HREF = `${import.meta.env.BASE_URL}legal/access-control-policy-v1-1.pdf`;
const CANONICAL = `${PUBLIC_BASE_URL}/legal/access-control-policy`;

const TITLE = 'Access Control Policy';
const META = POLICY_META.accessControl;

const ULIST = { paddingLeft: 22, margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 6 };
const PARA = { margin: '8px 0' };
const EMPH = { fontWeight: 600, color: '#3A3A3A' };

const RBAC_ROLES = [
  {
    key: 'admin-ciso',
    role: 'Admin (CISO)',
    description: 'Founder; full system administration; sole holder of break-glass credentials.',
    permissions: 'Manage users; rotate keys; configure integrations; access all data.',
  },
  {
    key: 'operator',
    role: 'Operator',
    description: 'Internal staff or trusted contractor performing day-to-day operations.',
    permissions: 'Read/write operational data; view dashboards; cannot manage users or secrets.',
  },
  {
    key: 'viewer',
    role: 'Viewer',
    description: 'Read-only role for advisors, auditors, or limited contractors.',
    permissions: 'View dashboards and reports; no write access; no Restricted data unless explicitly granted.',
  },
  {
    key: 'service-account',
    role: 'Service Account',
    description: 'Non-human identity for service-to-service authentication (e.g., Plaid, Mercury).',
    permissions: 'Scoped, short-lived credentials; no interactive login.',
  },
  {
    key: 'future-consumer',
    role: 'Future: Consumer',
    description: 'End user of a consumer-facing FR product (placeholder).',
    permissions: 'Access only their own data; subject to consent and consumer MFA on Plaid Link surfaces.',
  },
];

const RBAC_COLUMNS = [
  { label: 'Role', field: 'role', primary: true },
  { label: 'Description', field: 'description' },
  { label: 'Sample Permissions', field: 'permissions' },
];

const SECTIONS = [
  {
    id: 'purpose',
    title: 'Purpose',
    body: (
      <p style={PARA}>
        This Access Control Policy defines how Foreign Resource Co.
        (&lsquo;FR&rsquo;) grants, manages, and revokes access to
        production assets and sensitive data. It exists to enforce
        least-privilege, prevent unauthorized access, and ensure
        accountability across human and non-human identities.
      </p>
    ),
  },
  {
    id: 'scope',
    title: 'Scope',
    body: (
      <p style={PARA}>
        This policy applies to all FR systems handling Restricted or
        Confidential data, including the Internal ERP, GitHub
        repositories, cloud infrastructure (Vercel, Supabase), and
        integrated SaaS tools (Plaid, Mercury, Shopify, Klaviyo,
        Finaloop). It applies to all human users (employees, contractors,
        advisors) and non-human identities (service accounts, automation
        tokens, OAuth grants).
      </p>
    ),
  },
  {
    id: 'guiding-principles',
    title: 'Guiding Principles',
    body: (
      <ul style={ULIST}>
        <li><span style={EMPH}>Least Privilege:</span> Users receive the minimum access required to perform their duties.</li>
        <li><span style={EMPH}>Need to Know:</span> Access to Restricted data requires a documented business need.</li>
        <li><span style={EMPH}>Separation of Duties:</span> Where feasible, sensitive operations require dual control.</li>
        <li><span style={EMPH}>Default Deny:</span> Access is denied by default and granted explicitly.</li>
        <li><span style={EMPH}>Auditability:</span> All access decisions and privileged actions are logged.</li>
      </ul>
    ),
  },
  {
    id: 'roles-and-permissions',
    title: 'Roles & Permissions (RBAC)',
    body: (
      <>
        <p style={PARA}>
          Access is granted via Role-Based Access Control. Roles are
          defined as follows:
        </p>
        <ResponsivePolicyTable columns={RBAC_COLUMNS} rows={RBAC_ROLES} />
      </>
    ),
  },
  {
    id: 'multi-factor-authentication',
    title: 'Multi-Factor Authentication (MFA)',
    body: (
      <ul style={ULIST}>
        <li>
          <span style={EMPH}>Application-Layer MFA:</span> All human
          access to the ERP requires phishing-resistant MFA. Passkeys are
          the preferred factor; TOTP is acceptable; SMS is permitted only
          as a recovery fallback.
        </li>
        <li>
          <span style={EMPH}>Infrastructure MFA:</span> All access to
          GitHub, Vercel, Supabase, Mercury, Shopify, Plaid Dashboard,
          and other production tools requires MFA at the provider level.
        </li>
        <li>
          <span style={EMPH}>Future Consumer Surfaces:</span> Any
          consumer-facing product launched on this codebase will require
          MFA before Plaid Link is surfaced, in compliance with
          Plaid&rsquo;s developer requirements.
        </li>
      </ul>
    ),
  },
  {
    id: 'authentication-standards',
    title: 'Authentication Standards',
    body: (
      <ul style={ULIST}>
        <li>
          Passwords (where used as a secondary factor) follow NIST SP
          800-63B guidance: minimum 12 characters, breached-password
          screening, no forced periodic rotation absent indication of
          compromise.
        </li>
        <li>
          Sessions expire after 12 hours of inactivity or 7 days
          absolute, whichever comes first; logout terminates server-side
          session.
        </li>
        <li>
          Password reset flows require email confirmation and current
          MFA factor.
        </li>
      </ul>
    ),
  },
  {
    id: 'privileged-access-management',
    title: 'Privileged Access Management',
    body: (
      <ul style={ULIST}>
        <li>
          Admin (CISO) access is held by a single individual today; a
          documented break-glass procedure exists for emergency access.
        </li>
        <li>
          Privileged actions (user management, key rotation, schema
          changes, secret access) are logged and reviewed quarterly.
        </li>
        <li>
          Production database access via direct CLI is limited to the
          Admin role and used only for documented operational tasks.
        </li>
      </ul>
    ),
  },
  {
    id: 'non-human-authentication',
    title: 'Non-Human Authentication',
    body: (
      <ul style={ULIST}>
        <li>
          Service-to-service authentication uses OAuth tokens, signed
          JWTs, or short-lived TLS certificates.
        </li>
        <li>
          API keys and tokens are stored in Vercel environment variables
          / a managed secrets store; never in source code, logs, or
          client-side bundles.
        </li>
        <li>
          Plaid access tokens are stored encrypted at rest using envelope
          encryption.
        </li>
        <li>
          All non-human credentials are rotated annually or upon
          suspected compromise.
        </li>
      </ul>
    ),
  },
  {
    id: 'provisioning-and-de-provisioning',
    title: 'Provisioning & De-Provisioning',
    body: (
      <ul style={ULIST}>
        <li>
          <span style={EMPH}>Provisioning:</span> Access is provisioned
          by the CISO upon documented need, with role explicitly
          assigned. New users are required to enroll MFA at first login.
        </li>
        <li>
          <span style={EMPH}>Role Change:</span> Access is reviewed and
          adjusted within 7 days of a documented role change.
        </li>
        <li>
          <span style={EMPH}>De-Provisioning:</span> Access is disabled
          within 24 hours of separation; all sessions are terminated;
          all OAuth grants are revoked; the account is hard-deleted
          within 30 days. This applies to ERP accounts and all
          integrated SaaS tools.
        </li>
        <li>
          <span style={EMPH}>Automation:</span> Where supported by the
          identity provider (e.g., Clerk, Auth0, or chosen IAM),
          de-provisioning is automated via lifecycle hooks.
        </li>
      </ul>
    ),
  },
  {
    id: 'access-reviews',
    title: 'Access Reviews',
    body: (
      <ul style={ULIST}>
        <li>
          All user accounts and roles are reviewed quarterly by the
          CISO. Inactive accounts are disabled; over-privileged accounts
          are reduced.
        </li>
        <li>
          Service account inventory and scopes are reviewed quarterly.
        </li>
        <li>
          Review outcomes are recorded in a dated review log retained
          for at least 3 years.
        </li>
      </ul>
    ),
  },
  {
    id: 'logging-and-monitoring',
    title: 'Logging & Monitoring',
    body: (
      <ul style={ULIST}>
        <li>
          Authentication events (success, failure, MFA challenge,
          password reset) are logged with timestamp, user identifier,
          source IP, and outcome.
        </li>
        <li>
          Privileged actions (user/role changes, secret access, schema
          changes, deploys) are logged.
        </li>
        <li>
          Logs are retained for 90 days minimum; security-relevant
          events are retained for 1 year.
        </li>
        <li>
          Logs exclude Plaid access tokens, banking credentials, and
          consumer PII.
        </li>
      </ul>
    ),
  },
  {
    id: 'remote-access',
    title: 'Remote Access',
    body: (
      <ul style={ULIST}>
        <li>
          All access to production systems is remote-by-default and
          protected by TLS 1.2+ and MFA.
        </li>
        <li>
          Personnel devices used for production access must have
          full-disk encryption, an active screen-lock, and current OS
          security updates.
        </li>
      </ul>
    ),
  },
  {
    id: 'plaid-specific-controls',
    title: 'Plaid-Specific Controls',
    body: (
      <ul style={ULIST}>
        <li>
          Plaid access tokens are stored encrypted at rest; only the
          application backend may decrypt them, and only at request time
          to call the Plaid API.
        </li>
        <li>
          Plaid tokens are never exposed to the browser, never logged,
          and never sent to third parties.
        </li>
        <li>
          Plaid Dashboard access requires MFA.
        </li>
        <li>
          On Plaid Item disconnection or user removal, the corresponding
          token is revoked and deleted per the{' '}
          <em>Data Retention &amp; Deletion Policy</em>.
        </li>
      </ul>
    ),
  },
  {
    id: 'zero-trust-posture',
    title: 'Zero Trust Posture',
    body: (
      <p style={PARA}>
        FR operates with a zero-trust posture appropriate to its size:
        every request is authenticated and authorized; network location
        confers no implicit trust; access decisions are made per request
        based on identity, role, and context.
      </p>
    ),
  },
  {
    id: 'exceptions',
    title: 'Exceptions',
    body: (
      <p style={PARA}>
        Any deviation from this policy requires a written exception
        approved by the CISO, with a documented compensating control and
        an expiration date. Exceptions are reviewed quarterly.
      </p>
    ),
  },
  {
    id: 'review-and-maintenance',
    title: 'Review & Maintenance',
    body: (
      <p style={PARA}>
        This policy is reviewed at least annually, and upon: launch of a
        consumer-facing surface, material change in identity
        infrastructure, regulatory change, or material security
        incident. Version history is maintained in the policy footer and
        in the source repository.
      </p>
    ),
  },
];

export default function AccessControlPolicyPage() {
  usePageMeta({
    title: `${TITLE} — Foreign Resource`,
    description:
      'How Foreign Resource Co. grants, manages, and revokes access to production assets and sensitive data — RBAC roles, MFA enforcement, provisioning, access reviews, and Plaid-specific controls.',
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
        pdfFilename="foreign-resource-access-control-policy-v1-1.pdf"
      />
      <PolicyTOC entries={SECTIONS.map(s => ({ id: s.id, title: s.title }))} />
      {SECTIONS.map((s, i) => (
        <PolicySection key={s.id} id={s.id} title={s.title} number={i + 1}>
          {s.body}
        </PolicySection>
      ))}
      <RelatedPolicies currentPolicyId="accessControl" />
      <PolicyFooter
        title={TITLE}
        version={META.version}
        effective={META.effective}
        lastReviewed={META.lastReviewed}
      />
    </article>
  );
}
