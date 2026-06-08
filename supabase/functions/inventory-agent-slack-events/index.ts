// Inventory agent — Slack Events API webhook.
//
// Receives events from the slack_inventory app and replies to:
//   - app_mention events in any channel the bot is in
//   - message.channels events in the configured inventory channel (when the
//     thread root mentions the bot or is started by the bot)
//
// Slack requires acknowledgement within 3 seconds; Claude tool-use loops
// typically take 5–20s. We respond 200 immediately and process the event
// asynchronously via Deno's `EdgeRuntime.waitUntil`.
//
// Auth model:
//   - Slack signs every request with x-slack-signature and a timestamp;
//     we verify with SLACK_INVENTORY_SIGNING_SECRET before handling.
//   - The signing secret is per-Slack-app and per-environment; set it as
//     an edge function secret (NOT in user_integrations — that table is
//     for OAuth bot tokens).
//   - team_id in the event payload is mapped to an org_id by looking up
//     user_integrations where provider='slack_inventory' and
//     metadata->>'team_id' = <team_id>.
//
// Env vars:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   SLACK_INVENTORY_SIGNING_SECRET
//   SHOPIFY_API_VERSION (optional, default '2024-01')
//
// Deploy:
//   supabase functions deploy inventory-agent-slack-events --no-verify-jwt
//
// In Slack → your inventory app → Event Subscriptions → Request URL:
//   https://<project>.supabase.co/functions/v1/inventory-agent-slack-events
// Subscribe to bot events: app_mention, message.channels.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  runAgentTurn,
  loadAnthropicKey,
  loadShopifyCreds,
  postToSlack,
  AgentDeps,
} from '../_shared/inventoryAgentCore.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const SIGNING_SECRET = Deno.env.get('SLACK_INVENTORY_SIGNING_SECRET');

// EdgeRuntime is provided by Supabase's edge runtime — we declare it so
// TypeScript stops complaining. waitUntil keeps the worker alive after we
// send the 200 OK so Claude can finish thinking.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

// ─── Slack signature verification ───────────────────────────────────────────

async function verifySlackSignature(rawBody: string, timestamp: string | null, signature: string | null): Promise<boolean> {
  if (!SIGNING_SECRET) return false;
  if (!timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  // Replay window — Slack docs say 5 minutes.
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const keyBytes = new TextEncoder().encode(SIGNING_SECRET);
  const baseBytes = new TextEncoder().encode(baseString);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, baseBytes);
  const hex = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const expected = `v0=${hex}`;
  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

// ─── Event payload types ────────────────────────────────────────────────────

type SlackEventEnvelope =
  | { type: 'url_verification'; challenge: string }
  | {
      type: 'event_callback';
      team_id: string;
      event_id: string;
      event: SlackEvent;
    };

type SlackEvent =
  | { type: 'app_mention'; user: string; text: string; channel: string; ts: string; thread_ts?: string; bot_id?: string }
  | { type: 'message'; user?: string; text?: string; channel: string; ts: string; thread_ts?: string; bot_id?: string; subtype?: string; channel_type?: string }
  | { type: string; [k: string]: unknown };

// ─── Org resolution + thread history ────────────────────────────────────────

async function resolveOrgIdForTeam(db: SupabaseClient, teamId: string): Promise<{ orgId: string; channelId: string; token: string } | null> {
  // Use service role — incoming webhook is unauthenticated to Supabase.
  const { data } = await db
    .from('user_integrations')
    .select('org_id, token, metadata')
    .eq('provider', 'slack_inventory');
  for (const row of data || []) {
    const md = (row.metadata as { team_id?: string; channel_id?: string }) || {};
    if (md.team_id === teamId && md.channel_id) {
      return { orgId: row.org_id as string, channelId: md.channel_id, token: row.token as string };
    }
  }
  return null;
}

async function fetchThreadHistory(token: string, channel: string, threadTs: string): Promise<Array<{ user: string; bot: boolean; text: string; ts: string }>> {
  const url = `https://slack.com/api/conversations.replies?channel=${encodeURIComponent(channel)}&ts=${encodeURIComponent(threadTs)}&limit=20`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json();
  if (!j.ok) return [];
  return (j.messages || []).map((m: { user?: string; bot_id?: string; text?: string; ts: string }) => ({
    user: m.user || '',
    bot: Boolean(m.bot_id),
    text: m.text || '',
    ts: m.ts,
  }));
}

function stripBotMention(text: string): string {
  // Strip leading <@UBOTID> mention and any whitespace after it.
  return text.replace(/^\s*<@[A-Z0-9]+>\s*/i, '').trim();
}

function buildMessagesFromThread(thread: Array<{ user: string; bot: boolean; text: string; ts: string }>, latestText: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  // The latest message is what we're replying to — drop it from history and
  // pass as the final user turn (cleaned of bot mentions).
  const history = thread.slice(0, -1);
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of history) {
    const clean = stripBotMention(m.text);
    if (!clean) continue;
    messages.push({ role: m.bot ? 'assistant' : 'user', content: clean });
  }
  messages.push({ role: 'user', content: stripBotMention(latestText) || latestText });
  return messages;
}

// ─── Event handling ─────────────────────────────────────────────────────────

async function handleEvent(rawEnvelope: { team_id: string; event_id: string; event: SlackEvent }): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const ev = rawEnvelope.event;
  // Ignore bot's own messages and message edits/deletes.
  if ('bot_id' in ev && ev.bot_id) return;
  if (ev.type === 'message' && (ev as { subtype?: string }).subtype) return;

  const channel = (ev as { channel?: string }).channel;
  const text = (ev as { text?: string }).text || '';
  const ts = (ev as { ts?: string }).ts || '';
  const threadTs = (ev as { thread_ts?: string }).thread_ts || ts;
  if (!channel || !text || !ts) return;

  const target = await resolveOrgIdForTeam(db, rawEnvelope.team_id);
  if (!target) return;

  // For message.channels events, only respond if it's the inventory channel
  // AND the bot was mentioned somewhere in the message OR the thread root
  // was authored by the bot (i.e. someone is replying to a briefing).
  if (ev.type === 'message') {
    if (channel !== target.channelId) return;
    const mentionsBot = /<@[A-Z0-9]+>/.test(text);
    if (!mentionsBot) {
      // Could still be a thread reply to the briefing — check thread root.
      const thread = await fetchThreadHistory(target.token, channel, threadTs);
      const root = thread[0];
      if (!root?.bot) return;
    }
  }

  // Dedup: have we already responded to this event_id? agent_interactions
  // append-only is the source of truth.
  const { data: existing } = await db
    .from('agent_interactions')
    .select('id')
    .eq('source', 'inventory-slack-events')
    .eq('action_id', rawEnvelope.event_id)
    .maybeSingle();
  if (existing) return;

  const anthropicKey = await loadAnthropicKey(db, target.orgId);
  if (!anthropicKey) {
    await postToSlack(target, 'I\'m connected but the Anthropic credential is missing for this org. Add it in Settings → Integrations.', threadTs);
    return;
  }
  const shopify = await loadShopifyCreds(db, target.orgId);

  const thread = await fetchThreadHistory(target.token, channel, threadTs);
  const messages = buildMessagesFromThread(thread, text);

  const deps: AgentDeps = {
    db,
    orgId: target.orgId,
    shopifyDomain: shopify?.domain,
    shopifyToken: shopify?.token,
  };

  let reply: string;
  let toolCalls: unknown[];
  try {
    const result = await runAgentTurn(messages, anthropicKey, deps);
    reply = result.text;
    toolCalls = result.toolCalls;
  } catch (err) {
    reply = `Something went wrong on my end: ${(err as Error).message}`;
    toolCalls = [];
  }

  if (!reply) reply = '(no response)';

  const slackResp = await postToSlack(target, reply, threadTs);

  await db.from('agent_interactions').insert({
    source: 'inventory-slack-events',
    action_id: rawEnvelope.event_id,
    value: slackResp.ok ? 'replied' : 'slack_failed',
    payload: {
      org_id: target.orgId,
      channel,
      thread_ts: threadTs,
      event_type: ev.type,
      question: stripBotMention(text).slice(0, 500),
      reply: reply.slice(0, 1000),
      tool_calls: toolCalls,
      slack_error: slackResp.error,
    },
  });
}

// ─── Entry ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const rawBody = await req.text();
  const ok = await verifySlackSignature(
    rawBody,
    req.headers.get('x-slack-request-timestamp'),
    req.headers.get('x-slack-signature'),
  );
  if (!ok) return new Response('Invalid signature', { status: 401 });

  let envelope: SlackEventEnvelope;
  try {
    envelope = JSON.parse(rawBody) as SlackEventEnvelope;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Slack URL verification handshake.
  if (envelope.type === 'url_verification') {
    return new Response(envelope.challenge, { headers: { 'Content-Type': 'text/plain' } });
  }

  if (envelope.type === 'event_callback') {
    // Ack within Slack's 3s window; do the work in the background.
    const work = handleEvent(envelope).catch(err => console.error('inventory-agent-slack-events handler error:', err));
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(work);
    } else {
      // Local dev fallback — await it so we see errors.
      await work;
    }
    return new Response('', { status: 200 });
  }

  return new Response('', { status: 200 });
});
