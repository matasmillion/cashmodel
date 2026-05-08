# Sell-Through Alert — runbook

Operational steps for the daily Slack stockout alert.

---

## One-time Slack setup

The inventory bot is intentionally **separate** from the creative-engine bot
so internal channels don't conflict. Steps:

1. Go to <https://api.slack.com/apps> → **Create New App** → "From scratch".
2. Name: `FR Inventory Bot`. Workspace: your workspace.
3. **OAuth & Permissions** → add scopes:
   - `chat:write`
   - `chat:write.public`
4. **Install to Workspace**, copy the **Bot User OAuth Token** (`xoxb-…`).
5. Decide where alerts post (e.g. `#inventory`). Right-click the channel in
   Slack → **Copy Link** — the channel ID is the trailing string
   (`C0XXXXXXXX`).
6. Invite the bot to that channel: `/invite @FR Inventory Bot` in Slack.
7. In the Cash Model app, go to **Integrations → Slack — Inventory Alerts**
   and paste the token + channel ID.

---

## Schedule the cron job

Migration `20260508000003_sell_through_cron.sql` auto-registers the schedule
when `app.settings.project_url` and `app.settings.cron_secret` are set on
the database. If you haven't set those (or you're re-bootstrapping a
project), paste the snippet below into the Supabase SQL editor with your
values filled in:

```sql
select cron.schedule(
  'sell-through-alert-daily',
  '0 14 * * *',  -- 14:00 UTC = 10am ET (winter) / 9am ET (DST)
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sell-through-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

`CRON_SECRET` is shared with the existing creative crons — set it once in
**Supabase dashboard → Edge Functions → Secrets** and reuse the value here.

---

## Verify

Manual invocation (skips the schedule, runs the same code path):

```bash
supabase functions invoke sell-through-alert \
  --no-verify-jwt \
  -H "x-cron-secret: $CRON_SECRET"
```

Expected response:

```json
{ "ok": true, "summary": { "<org_id>": { "tracked": 4, "at_risk": 1, "posted": true } } }
```

If `posted: false`:
- `tracked: 0` → no variants starred yet on the Sell-Through page.
- `channelId: null` → Slack inventory bot not connected for that org.
- `at_risk: 0` → all tracked variants have enough cover; nothing to alert on.

Audit trail rows live in `public.agent_interactions` with
`source = 'sell-through-alert'`.

---

## Disable

```sql
select cron.unschedule('sell-through-alert-daily');
```
