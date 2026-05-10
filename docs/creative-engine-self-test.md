# Creative Engine — 10-minute self-test

Run this end-to-end after first deploy. Each step has the **exact thing to
click**, what you should see, and how to read the error if you don't.

Pre-reqs: 3 migrations applied, 15 edge functions deployed, `CRON_SECRET`
set, cron scheduled, integrations connected (at minimum **Anthropic + fal
+ Meta**), Knowledge files filled in (Avatar, Brand, ≥1 Hero SKU, Models
with a fal model id).

---

## 0 · Sanity check the DB

In Supabase SQL editor:

```sql
-- Tables exist?
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('sprints','briefs','renders','ads','metrics_daily','learnings','discussions','budget_config','creative_library','creative_knowledge','agent_interactions');
-- Expect 11 rows.

-- Cron jobs scheduled?
select jobname, schedule from cron.job;
-- Expect: creative-evaluate-daily, creative-synthesize-weekly, plus purge-plm-trash.

-- Budget config seeded?
select organization_id, weekly_cap, alert_threshold, writes_enabled from budget_config;
-- Expect 1 row per org with writes_enabled = true.
```

If any check fails, fix before continuing.

---

## 1 · Integrations — connect every required provider

Open Settings → Integrations. For each, click Connect and verify the green dot.

| Provider | Required? | Where to get the key |
|---|---|---|
| **Anthropic** | ✅ for brief gen | console.anthropic.com → API Keys |
| **fal** | ✅ for AI lane | fal.ai → Settings → API Keys |
| **Meta** | ✅ for publish | Business Manager System User token (see `creative-engine-runbook.md`) |
| **Higgsfield** | only if you'll use Creator/Founder/High Prod lanes | higgsfield.ai dashboard |
| **Transloadit** | ✅ for encoder-pass | transloadit.com → Credentials |
| **Slack** | optional | api.slack.com bot token |
| **Apify** | optional (competitor scrape) | apify.com → Settings → Integrations |

Then in SQL editor, verify the rows landed:

```sql
select provider, (token is not null) as has_token, metadata
from user_integrations
where organization_id = (select id from organizations limit 1);
```

You should see one row per provider you connected. **Meta** must have
`metadata.account_id` AND `metadata.page_id` populated — if `page_id` is
null, set it manually with the runbook snippet, otherwise upload-meta-ad
will 400.

---

## 2 · Knowledge files

Marketing → Creative Engine → Knowledge.

For each tab (Avatar / Brand / Product / Models), the dot in the tab
header should be **green**. Click into Models specifically:
- `lanes.ai_model_id` must contain the fal model path you'll use,
  e.g. `fal-ai/nano-banana-2/edit`
- if you'll use Higgsfield: `lanes.high_prod_workspace`,
  `lanes.high_prod_preset`, `lanes.creator_soul_id`, `lanes.founder_soul_id`

If you don't have these, dispatch-render will return a clean error
telling you exactly what's missing.

---

## 3 · Brief gen end-to-end (≤ 30s)

1. Sprints → **+ New Sprint**
2. Lane = **AI**, hypothesis_type = `social_proof`, constraint = `show
   the hoodie's side seam in the first second`. Save.
3. Sprint card lands in the **Drafting** column.
4. Click into the sprint → **Generate Brief**.
5. Within ~30s the brief renders with hypothesis / hook / payoff / shot
   list / caption / prompt blueprint.
6. **Past Learnings Consulted** block at the bottom. If you have no
   learnings yet, it shows nothing — that's fine.
7. Click **Approve** → sprint moves to **Brief Ready** in the kanban.

**If brief gen fails:**
- "Anthropic not connected" → reconnect in Integrations.
- "Anthropic error 401" → invalid API key.
- "Anthropic error 529" → overloaded; retry in a minute.
- "Claude returned non-JSON output" → click Re-generate. Rare but
  happens.

---

## 4 · Render dispatch (≤ 5 min for 4 fal variants)

1. With brief approved, click **Dispatch Render**.
2. The Approved card now says `4 renders dispatched · check Production /
   Render Queue`.
3. Sprint moves to **Rendering** in the kanban.
4. Production tab → expand the AI section. 4 cards appear with status
   `processing` and an amber progress bar.
5. Render Queue tab → 4 cards with the amber `Rendering` pill. The
   "polling" badge in the corner of each card flickers every 15s.
6. Within a few minutes, cards flip to `Ready` (teal pill) with a video
   preview. Approve / Reject buttons appear.

**If renders fail:**
- "fal not connected" → add fal API key.
- "AI lane needs a fal model id" → fill in Knowledge → Models.
- "fal 401 / 403" → key invalid or out of credits.
- All 4 cards stuck `processing` after 10 minutes → poll job status from
  fal dashboard directly to see if anything's running. If they ran but
  didn't return URLs, paste this in SQL to mark a stuck render rejected:
  ```sql
  update renders set status = 'rejected', updated_at = now()
  where id = '<render id from URL>';
  ```

---

## 5 · Approve render → encoder-pass (≤ 1 min)

1. Click **Approve** on one of the Ready render cards.
2. Card disappears from the queue.
3. Sprint moves from **Rendering** → **In Queue** in the kanban (this
   transition was missing pre-2026-05-10 — verify it works after the fix).
4. Production tab → the row now shows `Approved · Encoded`. Encoder runs
   in the background; if it failed, the badge stays at `Approved` only.

**If encoder doesn't flip to Encoded within 60s:**
- "Transloadit not connected" → add API key + auth secret.
- Browser console: look for `encoder-pass failed:` log.
- Check the render row directly:
  ```sql
  select id, status, encoder_passed, encoded_url
  from renders where id = '<id>';
  ```
  If `encoder_passed = false` and `encoded_url` is null, encoder choked.
  Fastest fix: re-fire from the browser console:
  ```js
  await callEncoderPass({ render_id: '<id>' })
  ```

---

## 6 · Publish to Meta (≤ 60s)

1. Production tab → the encoded render now has a **Publish to Meta**
   button.
2. Click it.
3. Within 60s the row shows `Published`.
4. Sprint moves from **In Queue** → **Live**.
5. LiveAds tab → new row appears with status `Paused`, spend/impressions
   all zero, and Resume button.
6. Open Meta Ads Manager directly and confirm the new campaign /
   adset / ad exist with name `S{n}_ai_{slug}_v1`, all PAUSED.

**If publish fails:**
- "Meta not connected" → reconnect.
- "Meta page_id missing" → run the page_id SQL snippet in the runbook.
- "Budget guardrail tripped" → spend ≥ cap × threshold OR
  writes_enabled=false. Fix in `budget_config`.
- "Meta 100: Tried accessing nonexistent field" → ad account ID format.
  Make sure it has `act_` prefix.
- "Meta 200: Permissions error" → System User doesn't have **Manage
  campaigns** on the ad account, or the Page isn't assigned to the
  System User.

---

## 7 · Resume the ad (Meta-side smoke test)

1. LiveAds → click **Resume** on the paused ad.
2. Status flips to `Active` in our table.
3. In Meta Ads Manager, refresh — ad should now be `Active`.

This proves write-back works. **Immediately Kill it again** if you
don't want it actually spending money.

---

## 8 · Daily evaluate (manual run, 24h+ after live)

After the ad has run for at least a day (or you have spend in Meta):

```js
// In the browser console, while signed in:
await callEvaluateDaily()
```

Or hit the function URL with the cron secret:

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/evaluate-daily \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: YOUR_CRON_SECRET" \
  -d '{}'
```

Verify:
- LiveAds row now shows real Spend / Impressions / CTR / CPA.
- `metrics_daily` has a row for that ad + yesterday's date.
- If CPA > target × 1.5, row turns red and recommendation = `kill`.
- If CPA < target × 0.7, CPA cell turns green and recommendation = `scale`.

---

## 9 · Weekly synthesize (manual)

For a sprint with at least one ad with metrics:

```sql
-- Force a sprint into closed so synthesis picks it up.
update sprints set status = 'closed', closed_at = now()
where id = '<sprint id>';
```

Then click **Run synthesis now** in Learning Archive (or hit the
synthesize-weekly URL with cron secret).

Verify:
- New entry under "Awaiting your discussion" (blue card).
- If Slack channel is configured, the bot posted to it with a `Discuss
  & finalize` button.
- Click the discussion → DiscussionView opens → edit final text →
  Finalize → learning lands in main archive list.

---

## What "everything works" looks like

- Brief generates in ≤ 30s with past-learnings block populated
- 4 renders processing → ready in ≤ 10 min
- One approval → encoder → publish → paused Meta ad in ≤ 5 min total
- Resume / Kill round-trip to Meta and back
- Daily eval populates LiveAds with real numbers
- Weekly synthesis writes a discussion you can finalize

**If any step fails, the error tells you exactly what's missing.** Don't
guess — read the message and fix that one thing.
