// @ts-check
// Brand-wide policy metadata. Single source of truth for version numbers,
// effective dates, and last-reviewed timestamps. Imported by every legal
// page so a version bump only happens here.
//
// `lastReviewed` is the human-readable string surfaced in <PolicyHeader />
// and the small "Last reviewed: …" timestamp on each policy page. ISO
// equivalents live alongside for sitemap / structured-data use.
//
// Effective date "April 27, 2026" is the v1 publication date for all
// three policies in this rollout.

/** @typedef {{ version: string; effective: string; lastReviewed: string; iso: string }} PolicyMeta */

/** Public domain prefix for canonical / OpenGraph URLs. */
export const PUBLIC_BASE_URL = 'https://matasmillion.github.io/cashmodel';

/** @type {Record<'infosec' | 'dataRetention' | 'accessControl', PolicyMeta>} */
export const POLICY_META = {
  infosec: {
    version: '1.0',
    effective: 'April 27, 2026',
    lastReviewed: 'April 27, 2026',
    iso: '2026-04-27',
  },
  dataRetention: {
    version: '1.1',
    effective: 'April 27, 2026',
    lastReviewed: 'April 27, 2026',
    iso: '2026-04-27',
  },
  accessControl: {
    version: '1.1',
    effective: 'April 27, 2026',
    lastReviewed: 'April 27, 2026',
    iso: '2026-04-27',
  },
};

/** Convenience shortcut — what most callers actually need. */
export const POLICY_LAST_REVIEWED = {
  infosec: POLICY_META.infosec.lastReviewed,
  dataRetention: POLICY_META.dataRetention.lastReviewed,
  accessControl: POLICY_META.accessControl.lastReviewed,
};

/** Policy index entries used by the /legal index page. `live: false`
 *  renders as a disabled "Coming soon" row. Flip to `true` as each
 *  policy lands. */
export const POLICY_INDEX = [
  {
    id: 'infosec',
    slug: 'information-security-policy',
    title: 'Information Security Policy',
    summary:
      'How Foreign Resource Co. protects banking, business, and (forthcoming) consumer data — governance, controls, vendors, incident response.',
    live: true,
  },
  {
    id: 'dataRetention',
    slug: 'data-retention-and-deletion-policy',
    title: 'Data Retention & Deletion Policy',
    summary:
      'How long we keep data, why, and how we dispose of it when the retention period ends.',
    live: true,
  },
  {
    id: 'accessControl',
    slug: 'access-control-policy',
    title: 'Access Control Policy',
    summary:
      'Who can access what, how access is granted and removed, and how we audit it.',
    live: false,
  },
];
