# Creative Engine — end-to-end test checklist

Run this against a **fresh DB** to verify the full pipeline. Each step
references the UI surface you'd use to verify.

## Prereqs

- All 15 edge functions deployed.
- All 3 migrations applied (`creative_schema`, `creative_knowledge`,
  `creative_pg_cron`).
- Cron jobs scheduled per the runbook.
- Anthropic, fal, and Meta integrations connected at minimum.
- Knowledge files filled in (Avatar, Brand, at least one Hero SKU,
  Models with a fal model id).

---

## 1 — Knowledge

- [ ] Marketing → Creative Engine → Knowledge.
- [ ] Brand tab: drag a brand kit PDF into Reference Files. Click
      Analyze with AI. Form fields populate (voice adjectives, we say,
      we never say, etc.).
- [ ] Product tab: click "Add another SKU". Drop 3+ photos. Click
      "Analyze photos with AI". Material / construction / fit /
      who_its_for fields populate.
- [ ] Save each kind. Tab dot turns green.

## 2 — Sprint creation

- [ ] Sprints tab → + New Sprint.
- [ ] Pick lane = AI, hypothesis_type = "social proof", constraint =
      "show the hoodie's side seam in the first second."
- [ ] Sprint appears in the Drafting column.

## 3 — Brief generation

- [ ] Open the new sprint → Generate Brief.
- [ ] Within ~30s, brief appears with hypothesis / hook / payoff /
      shot list / caption / prompt blueprint.
- [ ] Past Learnings Consulted block lists items if any seed data
      exists, else shows "None yet."
- [ ] Click Approve. Sprint moves to Brief Ready.

## 4 — Render dispatch

- [ ] Approved brief shows Dispatch Render button.
- [ ] Click it. 4 render cards appear in Render Queue with status
      `processing`.
- [ ] Sprint moves to Rendering column.
- [ ] Wait. Render Queue auto-polls every 15s. Within a few minutes,
      cards flip to `done` with video previews.

## 5 — Render approval

- [ ] Click Approve on one render. It disappears from the queue.
- [ ] In Production tab, the row shows `approved · encoded · ready`
      within ~1 minute (encoder-pass runs in background).

## 6 — Meta publish

- [ ] In Production, click "Publish to Meta" on the encoded render.
- [ ] Within 60s the row shows `published`.
- [ ] In LiveAds tab, the new ad row appears with status `paused`.
- [ ] Spend / Impressions all show 0 (it's just been created).
- [ ] Click Resume → status flips to `active`. Verify in Meta Ads
      Manager that the ad is now active.

## 7 — Daily evaluation (manual)

- [ ] Wait until Meta has at least 24h of data, OR set the ad to live
      and run the eval the next day.
- [ ] Run `callEvaluateDaily()` from browser console (or hit the
      function URL with the cron secret).
- [ ] LiveAds: Spend / Impressions / Clicks / CPA populate.
- [ ] If CPA > target × 1.5, the row turns red.
- [ ] Recommendation column shows `kill` or `scale` based on the
      thresholds.

## 8 — Weekly synthesis

- [ ] In a sprint that has at least one ad with metrics, set
      `sprints.status = 'closed'` (run from SQL editor for testing).
- [ ] Learning Archive → "Run synthesis now".
- [ ] Pending Discussions section shows a new draft.
- [ ] Click it → DiscussionView opens with the synthesis on the left.
- [ ] Edit Final Text → Finalize Learning.
- [ ] Learning appears in the main archive list with the correct lane
      tag.

## 9 — Seed next sprint

- [ ] On a finalized learning, click "Seed new sprint".
- [ ] Sprints tab opens; the new sprint dialog (or next + click) has
      the constraint pre-filled.

## 10 — Competitor library

- [ ] Library → Competitor Ads tab. Type "everlane, lululemon" → Scrape.
- [ ] Cards populate with results.
- [ ] Click "Save to library" on one. Switch to Library tab; it shows
      under the Competitor filter.

## 11 — Budget guardrail

- [ ] In SQL editor, set `budget_config.writes_enabled = false`.
- [ ] Try Publish to Meta on a fresh render → should error with
      "Budget guardrail tripped".
- [ ] Flip back to true → publish succeeds.

## 12 — Cron verification

- [ ] After scheduling: `select * from cron.job;` shows 2 jobs.
- [ ] After a daily tick: `select * from cron.job_run_details order by
      start_time desc limit 5;` shows successful 200 responses.
- [ ] Tomorrow morning: `metrics_daily` has fresh rows for any active
      ads.
