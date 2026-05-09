# Creative Engine — runbook

Operational tasks, paste-ready snippets, and disable steps.

---

## Schedule the cron jobs

After running migration `20260506000003_creative_pg_cron.sql`, paste
this into the **Supabase SQL editor** with the placeholders filled in.
You only need to do it once.

```sql
-- Daily at 13:00 UTC = 9am ET (adjust for DST manually if you care
-- about the exact hour during summer)
select cron.schedule(
  'creative-evaluate-daily',
  '0 13 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/evaluate-daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'YOUR_RANDOM_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Sunday 22:00 UTC = 6pm ET
select cron.schedule(
  'creative-synthesize-weekly',
  '0 22 * * 0',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/synthesize-weekly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'YOUR_RANDOM_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

The same `CRON_SECRET` value also needs to be set in the edge function
environment (Supabase dashboard → Edge Functions → Secrets):

```
CRON_SECRET=<the same random string used above>
```

---

## Disable the cron schedules

```sql
select cron.unschedule('creative-evaluate-daily');
select cron.unschedule('creative-synthesize-weekly');
```

To inspect what's currently scheduled:

```sql
select * from cron.job;
```

---

## Rotate the Meta access token

Tokens generated from Graph API Explorer expire ~60 days. To rotate:

1. Generate a new long-lived token at
   https://developers.facebook.com/tools/explorer/ with scopes
   `ads_read, ads_management, pages_show_list`.
2. Open **Integrations → Meta Ads** in the app.
3. Click Disconnect, then reconnect with the new token + ad account id.
   The card auto-mirrors the token to `user_integrations` server-side.

For long-term stability, generate a **system user token** in Meta
Business Manager — those don't expire.

---

## Add a `page_id` for ad publishing

The publish flow needs a Facebook Page id (the page that will own the
ad creative). To set it:

```sql
update public.user_integrations
set metadata = jsonb_set(
  coalesce(metadata, '{}'::jsonb),
  '{page_id}',
  to_jsonb('YOUR_PAGE_ID'::text)
)
where provider = 'meta'
  and organization_id = 'YOUR_ORG_ID';
```

---

## Change kill / scale thresholds for a sprint

Defaults: `kill_multiplier = 1.5`, `scale_threshold = 0.7`. Per-sprint:

```sql
update public.sprints
set kill_multiplier = 1.6,
    scale_threshold = 0.65,
    cpa_target = 32.00
where id = 'YOUR_SPRINT_ID';
```

---

## Disable all Meta writes (kill switch)

```sql
update public.budget_config
set writes_enabled = false
where organization_id = 'YOUR_ORG_ID';
```

`upload-meta-ad` and the LiveAds Kill/Scale buttons will all refuse
until you flip it back to `true`.

---

## Adjust the weekly cap

```sql
update public.budget_config
set weekly_cap = 5000.00,
    alert_threshold = 0.85
where organization_id = 'YOUR_ORG_ID';
```

---

## Manually trigger evaluate-daily / synthesize-weekly

From inside the app (signed-in user, scoped to your org):

- Learning Archive → "Run synthesis now" button (synthesize-weekly)
- evaluate-daily can be triggered by `callEvaluateDaily()` from the
  browser console; or run from SQL editor:

```sql
select net.http_post(
  url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/evaluate-daily',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', 'YOUR_RANDOM_CRON_SECRET'
  ),
  body := '{}'::jsonb
);
```

---

## Recover a stuck sprint

If a render gets stuck in `processing` because the upstream job died:

```sql
update public.renders
set status = 'rejected', updated_at = now()
where id = 'STUCK_RENDER_ID';
```

If a brief is stuck waiting for renders:

```sql
update public.sprints
set status = 'brief_ready', updated_at = now()
where id = 'STUCK_SPRINT_ID';
```

Then re-dispatch from BriefDetail.

---

## Recreate a knowledge file from scratch

If a knowledge row gets corrupted, delete it from the dashboard:

```sql
delete from public.creative_knowledge
where organization_id = 'YOUR_ORG_ID' and kind = 'brand';
```

Next time you open the editor, the form starts empty (version 0). Fill
it in or upload a new brand kit + click Analyze with AI.

---

## Slack app setup

Slack requires a custom app for interactivity (button clicks). Create
it once, point its endpoints at your Supabase functions, then save the
bot token in **Integrations → Slack**.

1. https://api.slack.com/apps → Create New App → From scratch.
2. **OAuth & Permissions** → add bot scopes:
   `chat:write, chat:write.public, im:write, channels:read`.
3. **Interactivity & Shortcuts** → toggle on. Request URL:
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/slack-actions`.
4. **Basic Information** → copy the **Signing Secret** and set it as
   `SLACK_SIGNING_SECRET` in the Supabase Edge Functions environment.
5. Install the app to your workspace, copy the **Bot User OAuth Token**
   (`xoxb-…`), paste into the app's Slack integration card.
6. **Set the destination channel** so weekly synthesis posts know where
   to land. Invite the bot to the channel first (`/invite @yourapp` in
   Slack), then run:

   ```sql
   update public.user_integrations
   set metadata = jsonb_set(
     coalesce(metadata, '{}'::jsonb),
     '{channel_id}',
     to_jsonb('CXXXXXXXX'::text)  -- channel id, not name; right-click channel → Copy link, the suffix is the id
   )
   where provider = 'slack'
     and organization_id = 'YOUR_ORG_ID';
   ```
7. **Set `APP_BASE_URL`** in Edge Functions → Secrets so the [Discuss]
   button in the synthesis Slack post links back to the app:

   ```
   APP_BASE_URL=https://app.foreignresource.com
   ```

   Without this the Slack post still goes out, just without the button.

---

## Transloadit template (optional)

By default the encoder-pass function inlines the assembly steps. If
you prefer a saved template:

1. Transloadit dashboard → Templates → New Template.
2. Paste the JSON from `supabase/functions/encoder-pass/index.ts`'s
   `buildAssemblyParams()` (just the `steps` block).
3. Copy the template_id, store in `user_integrations.metadata.template_id`.
4. Modify `encoder-pass` to send `template_id` instead of `params`.

Not required for v0.

---

## Re-deploying every edge function

Order doesn't matter functionally, but easiest order to verify:

1. `anthropic-proxy`
2. `generate-brief`
3. `analyze-knowledge-upload`
4. `fal-proxy`
5. `higgsfield-proxy`
6. `dispatch-render`
7. `check-render-status`
8. `encoder-pass`
9. `meta-proxy`
10. `upload-meta-ad`
11. `slack-proxy`
12. `slack-actions`
13. `evaluate-daily`
14. `synthesize-weekly`
15. `apify-proxy`

For each: open in Supabase Edge Functions UI → paste contents from
`supabase/functions/{name}/index.ts` → Deploy.
