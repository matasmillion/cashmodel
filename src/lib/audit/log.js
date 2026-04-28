// @ts-check
// Audit-event logger. Single entry point for emitting auth lifecycle
// events to public.auth_events.
//
// Two emission paths:
//
//   1. Server-side (preferred, lossless)
//      The clerk-webhook edge function writes auth_events rows on
//      every Clerk lifecycle event it handles (session.created /
//      removed / ended → sign_in_success / sign_out; user.updated
//      with changed mfa_factors → mfa_enrolled / mfa_removed). These
//      events fire even when the SPA isn't open, so they're the
//      authoritative log.
//
//   2. Client-side (best-effort, rich metadata)
//      logAuthEvent() below posts to a future `audit-log` edge
//      function. Use for events Clerk doesn't fire webhooks for —
//      MFA challenge result, sign-in failure detail, etc. Until the
//      edge function lands the helper is a no-op so call sites don't
//      need to be conditional.
//
// Vocabulary — keep these strings in sync with the migration / the
// activity page label map / the InfoSec Policy §10:
//
//   sign_in_success
//   sign_in_failure
//   mfa_challenge_success
//   mfa_challenge_failure
//   mfa_enrolled            (metadata.factor_type)
//   mfa_removed             (metadata.factor_type)
//   password_reset_requested
//   password_reset_completed
//   sign_out

/**
 * @typedef {(
 *   'sign_in_success' | 'sign_in_failure'
 *   | 'mfa_challenge_success' | 'mfa_challenge_failure'
 *   | 'mfa_enrolled' | 'mfa_removed'
 *   | 'password_reset_requested' | 'password_reset_completed'
 *   | 'sign_out'
 * )} AuthEvent
 */

/**
 * Fire-and-forget — never throws, returns void. Logging failures are
 * NOT user-visible; we don't want a flaky audit pipeline to break
 * sign-in flows.
 *
 * @param {Object} args
 * @param {string} args.userId
 * @param {AuthEvent} args.event
 * @param {Record<string, unknown>=} args.metadata
 */
export async function logAuthEvent({ userId, event, metadata }) {
  if (!userId || !event) return;
  try {
    // Reserved for the future `audit-log` edge function. The webhook
    // handles every server-observable event today; this function will
    // light up once we wire client-only events (sign-in failure
    // detail, MFA challenge result) post-launch.
    //
    // const { supabase } = await import('../supabase');
    // if (!supabase) return;
    // await supabase.functions.invoke('audit-log', {
    //   body: { user_id: userId, event, metadata: metadata || {} },
    // });

    // Until the edge function lands, log to the console only in dev so
    // engineers can confirm call sites are firing.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[audit]', event, { userId, metadata });
    }
  } catch (err) {
    // Logging is best-effort. Never re-raise.
    // eslint-disable-next-line no-console
    console.warn('logAuthEvent failed', err);
  }
}
