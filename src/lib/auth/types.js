// @ts-check
// Domain types for the auth abstraction. Provider-agnostic: no Clerk
// types leak across this boundary, so swapping providers later means
// changing only `index.js` — every consumer keeps importing these.

/** @typedef {'admin' | 'operator' | 'viewer'} Role */

/**
 * @typedef {'passkey' | 'totp' | 'sms' | 'backup_code' | 'password'} MFAFactorType
 */

/**
 * @typedef {Object} MFAFactor
 * @property {MFAFactorType} type
 * @property {string=} label   - device or app name (e.g. "MacBook Pro Touch ID")
 * @property {boolean=} phishingResistant  - true for passkey / WebAuthn
 */

/**
 * @typedef {Object} User
 * @property {string} id        - underlying provider id (Clerk's user.id today)
 * @property {string} email
 * @property {string} name      - best-effort display name
 * @property {Role} role
 * @property {boolean} mfaEnabled
 * @property {MFAFactor[]} mfaFactors
 */

export {};
