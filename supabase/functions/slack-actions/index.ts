// Slack interactive-action webhook receiver.
//
// Verifies the request signature using SLACK_SIGNING_SECRET, parses
// the action payload, and dispatches based on action_id. Slack
// requires a 200 response within 3 seconds, so handler logic should
// be short — anything heavy is offloaded back to other functions.
//
// Env vars:
//   SLACK_SIGNING_SECRET   per-app secret from Slack (one per Slack app
//                          across all orgs; the multi-tenant routing
//                          happens via team_id in the payload)
//
// Wire the function URL into your Slack app's "Interactivity" config:
//   https://<project>.supabase.co/functions/v1/slack-actions
//
// Deploy:
//   supabase functions deploy slack-actions

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const SIGNING_SECRET = Deno.env.get('SLACK_SIGNING_SECRET');

async function verifySignature(req: Request, body: string): Promise<boolean> {
  if (!SIGNING_SECRET) return false;
  const ts = req.headers.get('x-slack-request-timestamp');
  const sig = req.headers.get('x-slack-signature');
  if (!ts || !sig) return false;
  // Reject anything older than 5 minutes (replay defense)
  if (Math.abs(Date.now() / 1000 - parseInt(ts, 10)) > 60 * 5) return false;

  const baseString = `v0:${ts}:${body}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(SIGNING_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const computed = await crypto.subtle.sign('HMAC', key, enc.encode(baseString));
  const computedHex = Array.from(new Uint8Array(computed))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const expected = `v0=${computedHex}`;
  // Constant-time-ish compare
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const body = await req.text();

  const sigOk = await verifySignature(req, body);
  if (!sigOk) return new Response('Invalid signature', { status: 401 });

  // Slack sends URL-encoded form with payload=<json>
  const params = new URLSearchParams(body);
  const payloadStr = params.get('payload');
  if (!payloadStr) return new Response('Missing payload', { status: 400 });

  let payload: {
    type?: string;
    actions?: Array<{ action_id: string; value?: string }>;
    team?: { id: string };
    user?: { id: string };
  };
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return new Response('Bad payload JSON', { status: 400 });
  }

  // Acknowledge immediately. Heavy work would go in a follow-up
  // (e.g. update the message via response_url). For now we just log
  // the action — handlers can be filled in as Slack flows are wired up.
  if (SUPABASE_URL && SERVICE_ROLE_KEY) {
    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const action = payload.actions?.[0];
    if (action) {
      // Persist the action so we can audit / debug later. Doesn't fail
      // the response if logging fails.
      db.from('agent_interactions')
        .insert({
          source: 'slack-actions',
          action_id: action.action_id,
          value: action.value || null,
          slack_team_id: payload.team?.id || null,
          slack_user_id: payload.user?.id || null,
          payload: payload as unknown as Record<string, unknown>,
        })
        .then(() => {})
        .catch(() => {});
    }
  }

  return new Response(JSON.stringify({ response_action: 'clear' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
