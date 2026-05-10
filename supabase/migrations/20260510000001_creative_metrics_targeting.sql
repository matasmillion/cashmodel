-- Creative Engine: deeper Meta metrics + per-sprint configurable knobs.
--
-- 1. metrics_daily picks up ROAS, frequency, thruplay_rate so the
--    learnings can attribute outcomes to engagement signals, not just
--    CPA. ROAS = action_values:purchase / spend.
-- 2. ads gets a small mirror so the LiveAds row can show the same.
-- 3. sprints gets `targeting_overrides JSONB` + `link_path` so a sprint
--    can override the org-default targeting and the destination URL
--    without code changes. Default to NULL → upload-meta-ad falls back
--    to the brand-knowledge defaults.
--
-- All additions use IF NOT EXISTS so reruns are safe.

alter table public.metrics_daily
  add column if not exists roas           numeric,
  add column if not exists frequency      numeric,
  add column if not exists thruplay_rate  numeric;

comment on column public.metrics_daily.roas is
  'Return on ad spend. action_values:purchase / spend. Null when no purchase events.';
comment on column public.metrics_daily.frequency is
  'Average impressions per unique reached account. >2.5 = burning out.';
comment on column public.metrics_daily.thruplay_rate is
  '15-second video completion rate. video_p100_watched_actions / impressions.';

alter table public.ads
  add column if not exists roas           numeric,
  add column if not exists frequency      numeric,
  add column if not exists thruplay_rate  numeric;

alter table public.sprints
  add column if not exists targeting_overrides jsonb,
  add column if not exists link_path           text;

comment on column public.sprints.targeting_overrides is
  'Per-sprint Meta targeting overrides. Merged on top of brand defaults.
   Schema: { age_min, age_max, geo_locations, publisher_platforms,
   facebook_positions, instagram_positions, custom_audiences[] }.';
comment on column public.sprints.link_path is
  'Path appended to brand shop_url for the ad link. e.g. "/products/hoodie".
   If null, uses brand default link.';
