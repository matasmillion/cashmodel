// @ts-check
// Role hierarchy + helpers. Provider-agnostic.
//
// Three-tier RBAC matches the published Access Control Policy §4:
//   admin    > operator > viewer
//   (CISO)     (staff)    (read-only)
//
// `isAtLeast` is a pure helper — given a user's current role and a
// required role, return whether they're authorized. No I/O, no React.

/** @typedef {import('./types').Role} Role */

/** @type {Role[]} */
export const ROLES = ['admin', 'operator', 'viewer'];

/** @type {Record<Role, number>} */
const RANK = {
  admin: 3,
  operator: 2,
  viewer: 1,
};

/**
 * Default role assigned to users whose `publicMetadata.role` hasn't been
 * set yet — most permissive read-only level. The webhook + admin
 * dashboard are the two paths that bump someone above this.
 * @type {Role}
 */
export const DEFAULT_ROLE = 'viewer';

/**
 * @param {Role | undefined | null} role
 * @param {Role} required
 * @returns {boolean}
 */
export function isAtLeast(role, required) {
  if (!role) return false;
  return (RANK[role] || 0) >= (RANK[required] || 0);
}

/**
 * Sanity-check a value pulled out of Clerk's publicMetadata. Anything
 * that isn't one of the three roles falls back to viewer rather than
 * crashing the consumer.
 * @param {unknown} candidate
 * @returns {Role}
 */
export function normalizeRole(candidate) {
  if (typeof candidate === 'string' && /** @type {Role[]} */ (ROLES).includes(/** @type {Role} */ (candidate))) {
    return /** @type {Role} */ (candidate);
  }
  return DEFAULT_ROLE;
}
