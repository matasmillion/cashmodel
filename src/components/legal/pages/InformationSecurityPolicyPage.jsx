// @ts-check
// /legal/information-security-policy — full content of the policy
// rendered as web HTML, sourced from
// /public/legal/information-security-policy-v1.pdf (the canonical
// archive). Section titles, content, and ordering match the PDF
// verbatim so a Plaid reviewer reading either form sees the same
// document.
//
// Structure stays "content-as-data": SECTIONS is a single array of
// `{ id, title, body }`. The body is JSX so we can render bullets,
// tables, and emphasis cleanly without an MDX dependency.

import { POLICY_META, PUBLIC_BASE_URL } from '../../../lib/legal/constants';
import { usePageMeta } from '../../../hooks/usePageMeta';
import PolicyHeader from '../PolicyHeader';
import PolicyTOC from '../PolicyTOC';
import PolicySection from '../PolicySection';
import PolicyFooter from '../PolicyFooter';
import RelatedPolicies from '../RelatedPolicies';

const PDF_HREF = `${import.meta.env.BASE_URL}legal/information-security-policy-v1.pdf`;
const CANONICAL = `${PUBLIC_BASE_URL}/legal/information-security-policy`;

const TITLE = 'Information Security Policy';
const META = POLICY_META.infosec;

// Inline list / paragraph style helpers — kept here rather than in
// PolicySection so the policy markup stays self-contained.
const ULIST = { paddingLeft: 22, margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 6 };
const PARA = { margin: '8px 0' };
const EMPH = { fontWeight: 600, color: '#3A3A3A' };
const TABLE_WRAP = { overflowX: 'auto', margin: '14px 0' };
const TABLE = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
  fontFamily: "'Inter', sans-serif",
  border: '0.5px solid rgba(58,58,58,0.15)',
};
const TH = {
  textAlign: 'left',
  padding: '10px 12px',
  background: '#3A3A3A',
  color: '#F5F0E8',
  fontWeight: 600,
  letterSpacing: '0.04em',
  fontSize: 11,
  textTransform: 'uppercase',
  borderBottom: '0.5px solid rgba(58,58,58,0.15)',
};
const TD = {
  padding: '10px 12px',
  borderBottom: '0.5px solid rgba(58,58,58,0.08)',
  verticalAlign: 'top',
};

const SECTIONS = [
  {
    id: 'purpose-and-scope',
    title: 'Purpose & Scope',
    body: (
      <>
        <p style={PARA}>
          This Information Security Policy defines how Foreign Resource Co.
          (&lsquo;Foreign Resource&rsquo;, &lsquo;FR&rsquo;, or &lsquo;the
          Company&rsquo;) protects the confidentiality, integrity, and
          availability of information assets — including financial data,
          banking data accessed via Plaid, operational data, and any future
          consumer data — across all systems operated by FR.
        </p>
        <p style={PARA}>
          <span style={EMPH}>Scope.</span> This policy applies to: (a) the
          FR Internal ERP application, including its frontend, backend,
          database, and integrations; (b) all employees, contractors, and
          authorized third parties with access to FR systems; (c) all
          production assets including cloud infrastructure (Vercel,
          Supabase), source code repositories (GitHub), and SaaS tools
          handling business data (Mercury, Shopify, Klaviyo, Plaid,
          Finaloop).
        </p>
        <p style={PARA}>
          <span style={EMPH}>Forward-Looking Scope.</span> If FR launches a
          consumer-facing product based on the ERP, this policy
          automatically extends to consumer data, with additional controls
          layered in via the <em>Consumer Data Addendum</em> (to be ratified
          prior to consumer launch).
        </p>
      </>
    ),
  },
  {
    id: 'roles-and-responsibilities',
    title: 'Roles & Responsibilities',
    body: (
      <ul style={ULIST}>
        <li>
          <span style={EMPH}>Founder / CISO (Matias Millan):</span> Owns and
          approves this policy, oversees risk management, incident response,
          vendor security review, and annual policy review.
        </li>
        <li>
          <span style={EMPH}>Engineering / Contractors:</span> Implement and
          follow security controls; report incidents within 24 hours of
          discovery.
        </li>
        <li>
          <span style={EMPH}>All Personnel:</span> Comply with this policy;
          complete security awareness training annually; report suspected
          incidents immediately.
        </li>
      </ul>
    ),
  },
  {
    id: 'risk-management',
    title: 'Risk Management',
    body: (
      <p style={PARA}>
        FR maintains an internal risk register reviewed quarterly. New
        systems, integrations, or material architectural changes trigger a
        lightweight risk assessment covering: data sensitivity, attack
        surface, vendor posture, and rollback plan. Identified risks are
        tracked through to remediation, acceptance, or transfer.
      </p>
    ),
  },
  {
    id: 'data-classification',
    title: 'Data Classification',
    body: (
      <>
        <ul style={ULIST}>
          <li>
            <span style={EMPH}>Restricted:</span> Plaid access tokens,
            Plaid-derived banking data, banking credentials, payment card
            data, future consumer PII.
          </li>
          <li>
            <span style={EMPH}>Confidential:</span> Internal financial
            reports, vendor contracts, employee records, source code, and
            API keys.
          </li>
          <li>
            <span style={EMPH}>Internal:</span> Operational data including
            PO records, vendor contact info, internal notes.
          </li>
          <li>
            <span style={EMPH}>Public:</span> Marketing content, published
            policies, brand assets.
          </li>
        </ul>
        <p style={PARA}>
          Restricted and Confidential data must be encrypted at-rest and
          in-transit, access-controlled, and excluded from logs, error
          messages, and analytics tooling.
        </p>
      </>
    ),
  },
  {
    id: 'access-control',
    title: 'Access Control',
    body: (
      <p style={PARA}>
        Access is granted on a least-privilege basis using Role-Based Access
        Control (RBAC). All human access to the ERP and to systems handling
        Restricted or Confidential data requires phishing-resistant
        Multi-Factor Authentication (MFA) — passkeys preferred, TOTP
        acceptable, SMS only as fallback. Service-to-service authentication
        uses OAuth tokens or short-lived TLS certificates. See the{' '}
        <em>Access Control Policy</em> for full detail.
      </p>
    ),
  },
  {
    id: 'encryption',
    title: 'Encryption',
    body: (
      <ul style={ULIST}>
        <li>
          <span style={EMPH}>In-Transit:</span> All client-server
          communication uses TLS 1.2 or higher. HTTPS is enforced via Vercel
          and HSTS is enabled.
        </li>
        <li>
          <span style={EMPH}>At-Rest:</span> Database storage is encrypted
          with AES-256 via the cloud provider (Supabase / Vercel Postgres).
          Plaid access tokens are stored encrypted at the application layer
          using envelope encryption with a key managed in the platform
          secrets store.
        </li>
        <li>
          <span style={EMPH}>Key Management:</span> Secrets are stored in
          Vercel environment variables / a dedicated secrets manager. Keys
          are rotated annually or upon suspected compromise.
        </li>
      </ul>
    ),
  },
  {
    id: 'network-and-infrastructure-security',
    title: 'Network & Infrastructure Security',
    body: (
      <ul style={ULIST}>
        <li>
          Production infrastructure is hosted on managed providers (Vercel,
          Supabase) with provider-managed network isolation, DDoS
          protection, and WAF capabilities.
        </li>
        <li>
          Public endpoints are limited to those required for application
          function. Admin endpoints are protected by authentication and
          IP-allowlist where supported.
        </li>
        <li>
          All inbound and outbound traffic to Plaid uses Plaid&rsquo;s
          documented endpoints over TLS.
        </li>
      </ul>
    ),
  },
  {
    id: 'vulnerability-and-patch-management',
    title: 'Vulnerability & Patch Management',
    body: (
      <>
        <ul style={ULIST}>
          <li>
            GitHub Dependabot is enabled on all production repositories with
            automated alerts and security updates.
          </li>
          <li>
            Vulnerability scans are performed against employee/contractor
            machines via OS-native tooling (macOS XProtect, automatic
            security updates) and against production assets via
            provider-managed scanning.
          </li>
          <li>
            End-of-life software is actively monitored; only supported LTS
            versions of Node.js, Next.js, and database engines are used in
            production.
          </li>
        </ul>
        <p style={{ ...PARA, marginTop: 14 }}>
          Patching SLAs (from disclosure or detection):
        </p>
        <div style={TABLE_WRAP}>
          <table style={TABLE}>
            <thead>
              <tr>
                <th style={TH}>Severity</th>
                <th style={TH}>Definition</th>
                <th style={TH}>Patch SLA</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={TD}><span style={EMPH}>Critical</span></td>
                <td style={TD}>Active exploitation, RCE, auth bypass, data exposure</td>
                <td style={TD}>7 days</td>
              </tr>
              <tr>
                <td style={TD}><span style={EMPH}>High</span></td>
                <td style={TD}>Privilege escalation, significant data risk</td>
                <td style={TD}>30 days</td>
              </tr>
              <tr>
                <td style={TD}><span style={EMPH}>Medium</span></td>
                <td style={TD}>Limited exposure, requires user interaction</td>
                <td style={TD}>90 days</td>
              </tr>
              <tr>
                <td style={TD}><span style={EMPH}>Low</span></td>
                <td style={TD}>Minimal real-world risk</td>
                <td style={TD}>Next release cycle</td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: 'secure-software-development',
    title: 'Secure Software Development',
    body: (
      <ul style={ULIST}>
        <li>
          Source code is hosted in GitHub with branch protection on{' '}
          <em>main</em>: required PR review, status checks, and signed
          commits where feasible.
        </li>
        <li>
          Secrets are never committed to source control; pre-commit and
          GitHub secret scanning are enabled.
        </li>
        <li>
          Production deploys are gated through Vercel; staging environments
          are used for material changes.
        </li>
        <li>
          Code follows OWASP Top 10 mitigation patterns: parameterized
          queries, output encoding, CSRF protection, secure session
          handling, input validation.
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
          Application and access logs are retained for a minimum of 90 days.
        </li>
        <li>
          Authentication events (login, MFA challenge, failure, password
          reset) and privileged actions are logged.
        </li>
        <li>
          Logs explicitly exclude Plaid access tokens, banking credentials,
          full account numbers, and consumer PII.
        </li>
      </ul>
    ),
  },
  {
    id: 'incident-response',
    title: 'Incident Response',
    body: (
      <>
        <p style={PARA}>
          FR maintains a documented Incident Response procedure with the
          following lifecycle:{' '}
          <span style={EMPH}>
            Detect → Triage → Contain → Eradicate → Recover → Notify →
            Post-Mortem.
          </span>
        </p>
        <ul style={ULIST}>
          <li>
            Suspected incidents are reported to the CISO within 24 hours of
            discovery.
          </li>
          <li>
            Incidents involving Plaid data, suspected unauthorized access to
            banking data, or any breach affecting consumer data are reported
            to <span style={EMPH}>Plaid within 72 hours</span> at
            security@plaid.com (or via current Plaid notification channel)
            and to affected parties as required by applicable law.
          </li>
          <li>
            Each material incident produces a written post-mortem with root
            cause and corrective actions, retained for at least 3 years.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'vendor-and-third-party-risk-management',
    title: 'Vendor & Third-Party Risk Management',
    body: (
      <p style={PARA}>
        Critical vendors handling Restricted or Confidential data are
        reviewed annually. Current critical vendors include Plaid, Mercury,
        Shopify, Vercel, Supabase, Klaviyo, Finaloop, and GitHub. Review
        confirms: (a) current SOC 2 / ISO 27001 attestation where
        applicable; (b) Data Processing Agreement in place; (c) breach
        notification obligations; (d) data residency suitability.
      </p>
    ),
  },
  {
    id: 'personnel-and-contractor-security',
    title: 'Personnel & Contractor Security',
    body: (
      <ul style={ULIST}>
        <li>
          All personnel acknowledge this policy in writing prior to
          receiving access to production systems.
        </li>
        <li>
          Access is provisioned on the day of need-to-know and revoked
          within 24 hours of role change or separation.
        </li>
        <li>
          Annual security awareness review covers phishing, credential
          hygiene, device security, and incident reporting.
        </li>
      </ul>
    ),
  },
  {
    id: 'physical-and-endpoint-security',
    title: 'Physical & Endpoint Security',
    body: (
      <ul style={ULIST}>
        <li>
          Workforce is remote. Production infrastructure is physically
          secured by upstream cloud providers with SOC 2 / ISO 27001
          attestations.
        </li>
        <li>
          Personnel devices used to access FR systems must have full-disk
          encryption enabled, an active screen-lock policy, and current OS
          security updates.
        </li>
      </ul>
    ),
  },
  {
    id: 'backup-and-business-continuity',
    title: 'Backup & Business Continuity',
    body: (
      <ul style={ULIST}>
        <li>
          Database backups are managed by the database provider with
          point-in-time recovery enabled.
        </li>
        <li>
          Source code is preserved across GitHub and local clones.
        </li>
        <li>
          Recovery objectives:{' '}
          <span style={EMPH}>RPO ≤ 24h</span>,{' '}
          <span style={EMPH}>RTO ≤ 72h</span> for the ERP.
        </li>
      </ul>
    ),
  },
  {
    id: 'compliance-and-audit',
    title: 'Compliance & Audit',
    body: (
      <p style={PARA}>
        FR aligns its security program with industry-standard frameworks
        (NIST CSF, SOC 2 Common Criteria) at a level proportionate to its
        size and risk. FR will obtain formal attestation (SOC 2 Type I, then
        Type II) prior to launching any consumer-facing product that
        processes Restricted data at scale.
      </p>
    ),
  },
  {
    id: 'policy-review-and-maintenance',
    title: 'Policy Review & Maintenance',
    body: (
      <p style={PARA}>
        This policy is reviewed and updated at least annually, or upon: a
        material change in the ERP architecture, the addition of
        consumer-facing surfaces, a significant security incident, or a
        regulatory change. The review date and version history are
        maintained in the policy footer and in the source repository commit
        history.
      </p>
    ),
  },
  {
    id: 'acknowledgement',
    title: 'Acknowledgement',
    body: (
      <p style={PARA}>
        By accessing FR systems, personnel acknowledge that they have read,
        understood, and agree to abide by this policy. Violations may result
        in revocation of access and, where applicable, contract termination
        or legal action.
      </p>
    ),
  },
];

export default function InformationSecurityPolicyPage() {
  usePageMeta({
    title: `${TITLE} — Foreign Resource`,
    description:
      'How Foreign Resource Co. protects the confidentiality, integrity, and availability of financial, banking, operational, and (forthcoming) consumer data across all systems it operates.',
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
        pdfFilename="foreign-resource-information-security-policy-v1.pdf"
      />
      <PolicyTOC entries={SECTIONS.map(s => ({ id: s.id, title: s.title }))} />
      {SECTIONS.map((s, i) => (
        <PolicySection key={s.id} id={s.id} title={s.title} number={i + 1}>
          {s.body}
        </PolicySection>
      ))}
      <RelatedPolicies currentPolicyId="infosec" />
      <PolicyFooter
        title={TITLE}
        version={META.version}
        effective={META.effective}
        lastReviewed={META.lastReviewed}
      />
    </article>
  );
}
