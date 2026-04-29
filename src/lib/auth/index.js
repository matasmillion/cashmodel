// @ts-check
// Auth abstraction. Public surface — every consumer (UI components,
// stores, future consumer-app code) imports from here and never from
// `@clerk/clerk-react` directly. That isolation is what lets us swap
// providers later by editing only this file.
//
// Two consumer shapes:
//   • React components        → use the hooks (useCurrentUser,
//                                useCurrentRole, useSignOut).
//   • Plain modules (stores)  → use getCurrentUserIdSync() — reads
//                                Clerk's global instance synchronously
//                                so utility code doesn't need a hook
//                                context.

import { useUser, useClerk, useOrganization } from '@clerk/clerk-react';
import { normalizeRole, isAtLeast } from './roles';

/** @typedef {import('./types').User} User */
/** @typedef {import('./types').Role} Role */
/** @typedef {import('./types').MFAFactor} MFAFactor */

// Re-exports so consumers only import from src/lib/auth.
export { ROLES, DEFAULT_ROLE, isAtLeast, normalizeRole } from './roles';

/**
 * Map a Clerk `user` into our domain User shape.
 * @param {any} clerkUser
 * @returns {User}
 */
function adaptClerkUser(clerkUser) {
  const passkeys = Array.isArray(clerkUser.passkeys) ? clerkUser.passkeys : [];
  const totpEnabled = !!clerkUser.totpEnabled;
  const backupCodeEnabled = !!clerkUser.backupCodeEnabled;
  const phoneFactorEnabled = Array.isArray(clerkUser.phoneNumbers)
    && clerkUser.phoneNumbers.some(p => p.reservedForSecondFactor);

  /** @type {MFAFactor[]} */
  const factors = [];
  for (const pk of passkeys) {
    factors.push({ type: 'passkey', label: pk.name || 'Passkey', phishingResistant: true });
  }
  if (totpEnabled) factors.push({ type: 'totp', label: 'Authenticator app' });
  if (phoneFactorEnabled) factors.push({ type: 'sms', label: 'SMS (recovery only)' });
  if (backupCodeEnabled) factors.push({ type: 'backup_code', label: 'Backup codes' });

  return {
    id: clerkUser.id,
    email: clerkUser.primaryEmailAddress?.emailAddress
      || clerkUser.emailAddresses?.[0]?.emailAddress
      || '',
    name: clerkUser.fullName
      || [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ')
      || clerkUser.username
      || '',
    role: normalizeRole(clerkUser.publicMetadata?.role),
    mfaEnabled: factors.some(f => f.type !== 'password'),
    mfaFactors: factors,
  };
}

/**
 * React hook — returns the current signed-in user, or `null` while
 * Clerk is still loading or when no one is signed in.
 * @returns {User | null}
 */
export function useCurrentUser() {
  const { isLoaded, isSignedIn, user } = useUser();
  if (!isLoaded || !isSignedIn || !user) return null;
  return adaptClerkUser(user);
}

/**
 * React hook — convenience for callers that only need the role.
 * @returns {Role | null}
 */
export function useCurrentRole() {
  const u = useCurrentUser();
  return u ? u.role : null;
}

/**
 * React hook — returns a stable signOut function. Calling it logs the
 * user out and (by default) sends them back to /.
 * @returns {() => Promise<void>}
 */
export function useSignOut() {
  const { signOut } = useClerk();
  return async () => { await signOut(); };
}

/**
 * Synchronous reader for non-React consumers (stores, utilities). Reads
 * the user id off the global Clerk instance that ClerkProvider mounts
 * on `window.Clerk`. Returns null if Clerk hasn't finished loading or
 * no user is signed in.
 *
 * Use sparingly — prefer the React hooks where possible.
 * @returns {string | null}
 */
export function getCurrentUserIdSync() {
  if (typeof window === 'undefined') return null;
  // window.Clerk is mounted by <ClerkProvider /> at app boot.
  const clerk = /** @type {any} */ (window).Clerk;
  return clerk?.user?.id ?? null;
}

/**
 * Async — fetches a JWT issued by Clerk under the named template (the
 * "supabase" template if not specified) for authenticating calls to
 * Supabase Edge Functions or RLS-protected reads. Returns null if
 * Clerk hasn't loaded or no user is signed in.
 *
 * Pair with the Clerk Dashboard "Supabase" JWT template — see
 * https://clerk.com/docs/integrations/databases/supabase. Until that
 * template is configured every call returns null and Supabase rejects
 * the request as anon, which the call site should treat as
 * "not-yet-wired" rather than an error.
 *
 * @param {string} [template]
 * @returns {Promise<string | null>}
 */
export async function getClerkToken(template = 'supabase') {
  if (typeof window === 'undefined') return null;
  const clerk = /** @type {any} */ (window).Clerk;
  if (!clerk?.session) return null;
  try {
    return await clerk.session.getToken({ template });
  } catch {
    return null;
  }
}

/**
 * Throws when the current user's role is below the required level.
 * Use inside route handlers / page components that demand a specific
 * role; pair with an error boundary to render a "not authorized" page.
 * @param {Role} required
 * @param {Role | null} currentRole
 */
export function requireRole(required, currentRole) {
  if (!isAtLeast(currentRole, required)) {
    throw new Error(`Access denied — requires '${required}' role, have '${currentRole || 'none'}'`);
  }
}

/**
 * React hook — returns the current active organization, or null while
 * Clerk is still loading or when no org is active.
 * @returns {{ id: string, name: string, slug: string | null } | null}
 */
export function useCurrentOrg() {
  const { isLoaded, organization } = useOrganization();
  if (!isLoaded || !organization) return null;
  return { id: organization.id, name: organization.name, slug: organization.slug ?? null };
}

/**
 * Synchronous reader for non-React consumers (stores, utilities). Reads
 * the active org id off the global Clerk instance. Returns null if no
 * org is active or Clerk hasn't loaded.
 *
 * Use sparingly — prefer useCurrentOrg() in React components.
 * @returns {string | null}
 */
export function getCurrentOrgIdSync() {
  if (typeof window === 'undefined') return null;
  const clerk = /** @type {any} */ (window).Clerk;
  return clerk?.organization?.id ?? null;
}
