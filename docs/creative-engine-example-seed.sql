-- ─────────────────────────────────────────────────────────────────────
-- Creative Engine — example sprint + brief seed
-- ─────────────────────────────────────────────────────────────────────
--
-- Run this in the Supabase SQL editor while signed in as the user whose
-- org you want it to land in. RLS uses jwt_org_id() to scope.
-- This seeds ONE end-to-end-ready sprint + draft brief so you can:
--   1. See the kanban populate with a Drafting sprint (FR Hoodie test)
--   2. Approve the brief → it'll flip to brief_ready
--   3. Click Dispatch Render → the AI lane will fire 4 fal jobs with
--      *different* per-variant prompts (see the new variant mutation)
--   4. Approve one render → sprint flips to in_queue (the dead-status
--      fix from PR #113)
--   5. Click Publish to Meta → uses brand.shop_url + sprint.link_path
--      (the configurable-link fix in this PR)
--
-- The brief content below is real-strategist quality, written for the
-- Foreign Resource brand. Copy is fictional but on-vibe.
--
-- WARNING: THIS SETS sprint.status='brief_ready' SO YOU CAN SKIP
-- BRIEF GENERATION. If you want to test brief gen too, change the
-- INSERT to status='drafting' and the briefs INSERT to status='draft',
-- then click "Re-generate Brief" — it'll write its own brief.

-- ─────────────────────────────────────────────────────────────────────
-- 0. Brand knowledge — must exist for upload-meta-ad to read shop_url
--    and targeting_defaults. Skip if you've already filled in Knowledge
--    via the UI.
-- ─────────────────────────────────────────────────────────────────────

-- Brand knowledge (creates or merges fields)
insert into public.creative_knowledge (organization_id, kind, fields)
values (
  public.jwt_org_id(),
  'brand',
  jsonb_build_object(
    'shop_url', 'https://foreignresource.com',
    'voice', 'understated, confident, no exclamation points, present tense',
    'targeting_defaults', jsonb_build_object(
      'geo_locations', jsonb_build_object('countries', jsonb_build_array('US','CA')),
      'age_min', 25,
      'age_max', 50,
      'publisher_platforms', jsonb_build_array('facebook','instagram'),
      'instagram_positions', jsonb_build_array('stream','reels','story'),
      'facebook_positions', jsonb_build_array('feed','video_feeds')
    )
  )
)
on conflict (organization_id, kind) do update
  set fields = public.creative_knowledge.fields || excluded.fields,
      updated_at = now();

-- Models knowledge (need ai_model_id for fal dispatch to work)
insert into public.creative_knowledge (organization_id, kind, fields)
values (
  public.jwt_org_id(),
  'models',
  jsonb_build_object(
    'lanes', jsonb_build_object(
      'ai_model_id', 'fal-ai/nano-banana-2/edit'
      -- High-prod / creator / founder lanes need Higgsfield IDs;
      -- leave them blank to skip those lanes for now.
    )
  )
)
on conflict (organization_id, kind) do update
  set fields = public.creative_knowledge.fields || excluded.fields,
      updated_at = now();

-- ─────────────────────────────────────────────────────────────────────
-- 1. Sprint — "Side Seam Sprint", AI lane
-- ─────────────────────────────────────────────────────────────────────

with next_n as (
  select coalesce(max(sprint_number), 0) + 1 as n
  from public.sprints
  where organization_id = public.jwt_org_id()
),
new_sprint as (
  insert into public.sprints (
    organization_id, sprint_number, lane, status,
    hypothesis_type, constraint_text,
    cpa_target, kill_multiplier, scale_threshold,
    targeting_overrides, link_path
  )
  select
    public.jwt_org_id(),
    n,
    'ai',
    'brief_ready',
    'social_proof',
    'Lead with the side-seam construction in the first 1.5s — most viewers scroll past hoodie ads in 0.8s, so the hook has to land before they decide.',
    35,    -- $35 target CPA
    1.5,   -- kill at 1.5x target
    0.7,   -- scale at 0.7x target
    null,  -- no per-sprint targeting overrides — uses brand defaults
    '/products/japanese-cotton-hoodie'
  from next_n
  returning id, sprint_number
)
-- ─────────────────────────────────────────────────────────────────────
-- 2. Draft brief — 4 angles for the AI lane to mutate per variant
-- ─────────────────────────────────────────────────────────────────────
insert into public.briefs (
  organization_id, sprint_id, version, status,
  hypothesis, key_feeling, hook, payoff, shot_list,
  caption, prompt_blueprint,
  past_learnings_consulted, agent_model, generated_at
)
select
  public.jwt_org_id(),
  new_sprint.id,
  1,
  'draft',
  -- hypothesis
  'Foregrounding garment construction (side seam, 1.2cm cover stitch) as the opening frame stops scroll faster than a model shot. Construction = trust, trust = click.',
  -- key_feeling
  'Quiet authority. Like watching someone work in a tailor shop — no music, no hype, just material.',
  -- hook (first 1.5s)
  'Tight macro on the side seam. Indigo dye crease catches a 45° rim light. Hands enter frame, push the seam against itself — it doesn''t buckle.',
  -- payoff
  'Cut to model walking, hands in pockets. The same seam holds shape under motion. Cut to product card with price.',
  -- shot list
  jsonb_build_array(
    'Macro 0–1.5s: side seam, raking light, fingers test stitch density',
    'Wide 1.5–4s: model walks toward camera, hood up, hands in pockets',
    'Detail 4–6s: tag flash showing cotton % and origin',
    'Close 6–8s: model turns, hood drops to shoulders, half-smile',
    'End card 8–10s: hoodie on plain salt background, price + link'
  ),
  -- caption
  'Side seam tested at 1.2cm cover stitch. Doesn''t buckle. Available now.',
  -- prompt blueprint (this is the seed; dispatch-render will mutate
  -- it 4 ways per variant — hook-led / payoff-led / feeling-led /
  -- shot-list-led)
  E'Cinematic 9:16 fashion ad for a heavyweight cotton hoodie. Color palette: salt cream (#F5F0E8), slate (#3A3A3A), indigo dye. Soft window light, raking 45° rim. Camera moves slowly. Subject is a Japanese cotton hoodie with visible side-seam construction and a 1.2cm cover stitch.\n\nNo text overlays. No music cues. No quick cuts under 1.5s. Color grade: warm shadows, neutral mids, cool highlights. Film grain subtle. Aspect 9:16 vertical, 10 seconds total.',
  '[]'::jsonb,
  'manual_seed_v1',
  now()
from new_sprint;

-- ─────────────────────────────────────────────────────────────────────
-- Verify
-- ─────────────────────────────────────────────────────────────────────
select
  s.sprint_number,
  s.lane,
  s.status         as sprint_status,
  s.cpa_target,
  s.link_path,
  b.version        as brief_version,
  b.status         as brief_status,
  left(b.hook, 60) as hook_preview
from public.sprints s
left join public.briefs b on b.sprint_id = s.id
where s.organization_id = public.jwt_org_id()
order by s.sprint_number desc
limit 3;
