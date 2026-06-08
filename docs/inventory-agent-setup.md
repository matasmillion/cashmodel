# Inventory agent — Slack setup & runbook

The inventory agent lives in your `#inventory` Slack channel. Each weekday at 9 AM ET it posts a morning briefing, and throughout the day it replies to messages and @mentions in that channel.

This doc covers the one-time setup, the smoke test, and what to do when it goes sideways.

## Pieces

| Piece | Where | Purpose |
| --- | --- | --- |
| `supabase/functions/_shared/inventoryAgentCore.ts` | Edge function shared module | System prompt, tool defs, tool-use loop, Shopify+velocity math |
| `supabase/functions/inventory-agent-daily/index.ts` | Edge function | Cron entry point — builds context bundle, calls Claude, posts to Slack |
| `supabase/functions/inventory-agent-slack-events/index.ts` | Edge function | Slack Events webhook — replies to @mentions and thread replies |
| `supabase/migrations/20260608000000_inventory_agent_cron.sql` | Migration | pg_cron schedule, 13:00 UTC (= 9 AM ET in EDT) |

## Prerequisites (must already be true)

- `user_integrations` row for `provider = 'anthropic'` with the org's API key.
- `user_integrations` row for `provider = 'shopify'` with `token` + `metadata.domain`.
- `user_integrations` row for `provider = 'slack_inventory'` with:
  - `token` — the bot user OAuth token for the inventory Slack app (`xoxb-…`).
  - `metadata.channel_id` — the channel ID of `#inventory` (e.g. `C0XXXXX`).
  - `metadata.team_id` — the workspace ID (e.g. `T0XXXXX`). **Required for the events handler to map incoming events to your org.**
- `sell_through_tracked` populated for the variants you want flagged as at-risk. (You already do this from the in-app sell-through tab.)

## Slack app config (one-time)

In api.slack.com → your inventory app:

1. **OAuth & Permissions → Bot Token Scopes**:
   - `chat:write` (post messages)
   - `channels:history` (read thread history for context)
   - `app_mentions:read`
   - `channels:read` (resolve channel IDs)
2. **Event Subscriptions**:
   - Enable Events.
   - **Request URL**: `https://<project>.supabase.co/functions/v1/inventory-agent-slack-events`
   - Slack will hit this URL with a `url_verification` challenge — the function handles it automatically. You should see a green checkmark.
   - **Subscribe to bot events**:
     - `app_mention`
     - `message.channels`
3. Reinstall the app to the workspace if you added scopes.
4. Add the bot to `#inventory`: `/invite @<botname>` in the channel.

## Edge function deploy

```sh
supabase functions deploy inventory-agent-daily
supabase functions deploy inventory-agent-slack-events --no-verify-jwt
```

`--no-verify-jwt` is required for the Slack events function — Slack does not send Supabase JWTs; the function verifies the Slack signing secret instead.

## Edge function secrets

```sh
supabase secrets set SLACK_INVENTORY_SIGNING_SECRET=<from Slack app Basic Information>
# These should already be set from prior functions:
#   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
```

## Cron schedule

The migration registers a pg_cron job at `0 13 * * *` UTC (= 9 AM ET during EDT). If `app.settings.project_url` or `app.settings.cron_secret` is not set on your database, the migration logs a notice and skips — register manually with:

```sql
select cron.schedule(
  'inventory-agent-daily',
  '0 13 * * *',
  $cmd$
  select net.http_post(
    url := 'https://<project>.supabase.co/functions/v1/inventory-agent-daily',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $cmd$
);
```

**DST drift**: pg_cron uses UTC, so during EST (Nov–Mar) the briefing arrives at 8 AM ET instead of 9 AM. To shift, change the cron expression to `0 14 * * *` for winter, or once for the year — your call.

## Smoke test

1. **Daily function**: hit it manually with your Supabase JWT:
   ```sh
   curl -X POST https://<project>.supabase.co/functions/v1/inventory-agent-daily \
     -H "Authorization: Bearer <YOUR_JWT>" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```
   You should get a 200 with a `summary` object, and a message should appear in `#inventory` within ~20 seconds.

2. **Events handler**: in `#inventory`, type `@<bot> what's at risk today?`. The bot should reply in-thread within ~15 seconds. Check `agent_interactions` for a row with `source='inventory-slack-events'`.

3. **Cron**: tail the pg_cron run table to confirm the schedule registered:
   ```sql
   select * from cron.job where jobname = 'inventory-agent-daily';
   ```

## What's NOT in v1

- **Weekly reflection loop**: the agent does not yet read its own past `agent_interactions` and write a `learnings` row that gets injected into the next morning's system prompt. That's the next iteration — wait until you've lived with the briefing for a week and have opinions about where it's wrong.
- **OTB / forecast / star-history tools server-side**: those stores are localStorage-only. If the operator asks about them in Slack, the agent will say "open the in-app chat for that."
- **Cross-agent coordination**: the inventory agent does not yet talk to a CFO/CPO/COO agent. That's the multi-agent #leadership channel pattern — comes once you have at least 2 role agents shipping.

## Failure modes & debugging

- **No post lands at 9 AM** → check `cron.job_run_details` for the latest `inventory-agent-daily` run. If the function returned non-200, view its logs in the Supabase dashboard. If it returned 200 but no Slack message, check `agent_interactions` for a row with `value='slack_failed'` — `payload.slack_error` will tell you why.
- **Slack events 401** → signing secret mismatch. Re-copy from Slack app Basic Information and re-set the secret.
- **Bot replies "anthropic not connected"** → add the org's Anthropic key in Settings → Integrations.
- **Bot replies with hallucinated SKUs** → almost always a stale Shopify pull. Confirm the Shopify token in `user_integrations` is still valid by hitting the in-app inventory tab and watching for the live-data sync error banner.
- **Bot answers questions in random channels** → `app_mention` is global to the workspace. If you only want it to respond in `#inventory`, remove the bot from other channels.

## Auditing

Every briefing and reply writes a row to `agent_interactions`:

- `source = 'inventory-daily'` — morning briefings, one per org per day. `payload.at_risk_count`, `payload.summary`, `payload.tool_calls`.
- `source = 'inventory-slack-events'` — in-channel replies. `payload.question`, `payload.reply`, `payload.tool_calls`.

Read these regularly. They are the substrate for the future learning loop and your single best signal on whether the agent is drifting.
