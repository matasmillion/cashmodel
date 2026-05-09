// Slack interactive-action webhook receiver.
//
// Verifies the request signature using SLACK_SIGNING_SECRET, parses
// the action payload, and dispatches based on action_id. Slack
// requires a 200 response within 3 seconds, so we acknowledge
// immediately and do the DB work + message update in the background.
//
// Supported action_ids:
//   approve_brief    value=<brief_id>      → brief.status='approved', sprint.status='brief_ready'
//   reject_brief     value=<brief_id>      → brief.status='rejected'
//   approve_render   value=<render_id>     → render.status='approved', encoder-pass kicked off out-of-band
//   reject_render    value=<render_id>     → render.status='rejected'
//   open_discussion  value=<discussion_id> → ack only (the deep-link in the message handles open)
//
// Env vars:
//   SLACK_SIGNING_SECRET   per-app secret from Slack
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  for cross-org writes
//
// Wire the function URL into your Slack app's "Interactivity" config:
//   https://<project>.supabase.co/functions/v1/slack-actions
//
// Deploy:
//   supabase functions deploy slack-actions

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const SIGNING_SECRET = Deno.env.get('SLACK_SIGNING_SECRET');

type SlackAction = { action_id: string; value?: string };
type SlackPayload = {
  type?: string;
  actions?: SlackAction[];
  team?: { id: string };
  user?: { id: string; name?: string };
  response_url?: string;
};

async function verifySignature(req: Request, body: string): Promise<boolean> {
  if (!SIGNING_SECRET) return false;
  const ts = req.headers.get('x-slack-request-timestamp');
  const sig = req.headers.get('x-slack-signature');
  if (!ts || !sig) return false;
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
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function postResponse(responseUrl: string, body: Record<string, unknown>): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('slack-actions response_url post failed:', err);
  }
}

async function logInteraction(db: SupabaseClient, payload: SlackPayload, action: SlackAction, result: 'ok' | 'error', detail?: string): Promise<void> {
  try {
    await db.from('agent_interactions').insert({
      source: 'slack-actions',
      action_id: action.action_id,
      value: action.value || null,
      slack_team_id: payload.team?.id || null,
      slack_user_id: payload.user?.id || null,
      payload: { ...(payload as unknown as Record<string, unknown>), _result: result, _detail: detail || null },
    });
  } catch (err) {
    console.error('agent_interactions log failed:', err);
  }
}

async function handleApproveBrief(db: SupabaseClient, briefId: string, userName: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const { data: brief, error } = await db
    .from('briefs')
    .select('id, sprint_id, organization_id, version')
    .eq('id', briefId)
    .maybeSingle();
  if (error || !brief) return { ok: false, error: 'Brief not found' };
  const now = new Date().toISOString();

  const { error: bErr } = await db
    .from('briefs')
    .update({ status: 'approved', approved_at: now, updated_at: now })
    .eq('id', briefId);
  if (bErr) return { ok: false, error: bErr.message };

  const { error: sErr } = await db
    .from('sprints')
    .update({ status: 'brief_ready', updated_at: now })
    .eq('id', brief.sprint_id);
  if (sErr) return { ok: false, error: sErr.message };

  return { ok: true, text: `✓ Brief v${brief.version || 1} approved by ${userName}. Sprint moved to Brief Ready.` };
}

async function handleRejectBrief(db: SupabaseClient, briefId: string, userName: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { data: brief } = await db.from('briefs').select('version').eq('id', briefId).maybeSingle();
  const { error } = await db
    .from('briefs')
    .update({ status: 'rejected', updated_at: now })
    .eq('id', briefId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, text: `✗ Brief v${brief?.version || 1} rejected by ${userName}.` };
}

async function handleApproveRender(db: SupabaseClient, renderId: string, userName: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { error } = await db
    .from('renders')
    .update({ status: 'approved', approved_at: now, updated_at: now })
    .eq('id', renderId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, text: `✓ Render approved by ${userName}. Encoder will pick it up next.` };
}

async function handleRejectRender(db: SupabaseClient, renderId: string, userName: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { error } = await db
    .from('renders')
    .update({ status: 'rejected', updated_at: now })
    .eq('id', renderId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, text: `✗ Render rejected by ${userName}.` };
}

async function dispatchAction(db: SupabaseClient, action: SlackAction, userName: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const value = action.value || '';
  switch (action.action_id) {
    case 'approve_brief':  return handleApproveBrief(db, value, userName);
    case 'reject_brief':   return handleRejectBrief(db, value, userName);
    case 'approve_render': return handleApproveRender(db, value, userName);
    case 'reject_render':  return handleRejectRender(db, value, userName);
    case 'open_discussion':
      return { ok: true, text: `${userName} opened the discussion in the app.` };
    default:
      return { ok: false, error: `Unknown action_id: ${action.action_id}` };
  }
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const body = await req.text();

  const sigOk = await verifySignature(req, body);
  if (!sigOk) return new Response('Invalid signature', { status: 401 });

  const params = new URLSearchParams(body);
  const payloadStr = params.get('payload');
  if (!payloadStr) return new Response('Missing payload', { status: 400 });

  let payload: SlackPayload;
  try {
    payload = JSON.parse(payloadStr);
  } catch {
    return new Response('Bad payload JSON', { status: 400 });
  }

  const action = payload.actions?.[0];
  const responseUrl = payload.response_url;
  const userName = payload.user?.name || payload.user?.id || 'someone';

  // Fire-and-forget: do all the work in the background so we can return
  // 200 within Slack's 3-second window.
  if (action && SUPABASE_URL && SERVICE_ROLE_KEY) {
    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    (async () => {
      const result = await dispatchAction(db, action, userName);
      const detail = result.ok ? undefined : result.error;
      await logInteraction(db, payload, action, result.ok ? 'ok' : 'error', detail);
      if (responseUrl) {
        const text = result.ok ? result.text : `⚠️ ${result.error}`;
        await postResponse(responseUrl, { replace_original: true, text });
      }
    })().catch(err => console.error('slack-actions background:', err));
  }

  return new Response('', { status: 200 });
});
