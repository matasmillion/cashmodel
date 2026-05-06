-- Creative Engine schema — sprints, briefs, renders, ads, metrics, learnings,
-- discussions, budget_config, creative_library.
--
-- All tables are org-scoped via organization_id with RLS enforced through
-- public.jwt_org_id() exactly as every other PLM table in this project.
--
-- updated_at triggers reuse the helper created in prior migrations.
-- Append-only enforcement for learnings + metrics_daily is handled at the
-- JS store layer, not here (matching the existing PLM convention).

-- ─────────────────────────────────────────────────────────────────────
-- Helper: updated_at trigger (idempotent re-create)
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 1. sprints
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.sprints (
  id                  text        primary key default gen_random_uuid()::text,
  organization_id     text        not null references public.organizations(id) on delete cascade,
  sprint_number       integer     not null,
  lane                text        not null check (lane in ('ai','high_production','creator','founder')),
  status              text        not null default 'drafting'
                      check (status in ('drafting','brief_ready','rendering','in_queue','live','closed')),
  hypothesis_type     text        not null default '',
  constraint_text     text        not null default '',
  next_constraint_seed text,
  cpa_target          numeric,
  kill_multiplier     numeric     not null default 1.5,
  scale_threshold     numeric     not null default 0.7,
  closed_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, sprint_number)
);

drop trigger if exists sprints_updated_at on public.sprints;
create trigger sprints_updated_at
  before update on public.sprints
  for each row execute function public.set_updated_at();

alter table public.sprints enable row level security;

drop policy if exists "org_select" on public.sprints;
drop policy if exists "org_insert" on public.sprints;
drop policy if exists "org_update" on public.sprints;
drop policy if exists "org_delete" on public.sprints;

create policy "org_select" on public.sprints for select using (organization_id = public.jwt_org_id());
create policy "org_insert" on public.sprints for insert with check (organization_id = public.jwt_org_id());
create policy "org_update" on public.sprints for update using (organization_id = public.jwt_org_id()) with check (organization_id = public.jwt_org_id());
create policy "org_delete" on public.sprints for delete using (organization_id = public.jwt_org_id());

-- ─────────────────────────────────────────────────────────────────────
-- 2. briefs
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.briefs (
  id                          text        primary key default gen_random_uuid()::text,
  organization_id             text        not null references public.organizations(id) on delete cascade,
  sprint_id                   text        not null references public.sprints(id) on delete cascade,
  version                     integer     not null default 1,
  status                      text        not null default 'draft'
                              check (status in ('draft','approved','revised','rejected')),
  hypothesis                  text        not null default '',
  key_feeling                 text        not null default '',
  hook                        text        not null default '',
  payoff                      text        not null default '',
  shot_list                   jsonb       not null default '[]'::jsonb,
  caption                     text        not null default '',
  prompt_blueprint            text        not null default '',
  past_learnings_consulted    jsonb       not null default '[]'::jsonb,
  agent_model                 text        not null default '',
  generated_at                timestamptz,
  approved_by                 text,
  approved_at                 timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

drop trigger if exists briefs_updated_at on public.briefs;
create trigger briefs_updated_at
  before update on public.briefs
  for each row execute function public.set_updated_at();

alter table public.briefs enable row level security;

drop policy if exists "org_select" on public.briefs;
drop policy if exists "org_insert" on public.briefs;
drop policy if exists "org_update" on public.briefs;
drop policy if exists "org_delete" on public.briefs;

create policy "org_select" on public.briefs for select using (organization_id = public.jwt_org_id());
create policy "org_insert" on public.briefs for insert with check (organization_id = public.jwt_org_id());
create policy "org_update" on public.briefs for update using (organization_id = public.jwt_org_id()) with check (organization_id = public.jwt_org_id());
create policy "org_delete" on public.briefs for delete using (organization_id = public.jwt_org_id());

-- ─────────────────────────────────────────────────────────────────────
-- 3. renders
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.renders (
  id              text        primary key default gen_random_uuid()::text,
  organization_id text        not null references public.organizations(id) on delete cascade,
  brief_id        text        not null references public.briefs(id) on delete cascade,
  sprint_id       text        not null references public.sprints(id) on delete cascade,
  variant_index   integer     not null default 0,
  status          text        not null default 'pending'
                  check (status in ('pending','processing','done','approved','rejected')),
  provider        text        not null default ''
                  check (provider in ('fal','higgsfield','')),
  raw_url         text,
  encoded_url     text,
  encoder_passed  boolean     not null default false,
  provider_job_id text,
  duration_sec    numeric,
  approved_by     text,
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists renders_updated_at on public.renders;
create trigger renders_updated_at
  before update on public.renders
  for each row execute function public.set_updated_at();

alter table public.renders enable row level security;

drop policy if exists "org_select" on public.renders;
drop policy if exists "org_insert" on public.renders;
drop policy if exists "org_update" on public.renders;
drop policy if exists "org_delete" on public.renders;

create policy "org_select" on public.renders for select using (organization_id = public.jwt_org_id());
create policy "org_insert" on public.renders for insert with check (organization_id = public.jwt_org_id());
create policy "org_update" on public.renders for update using (organization_id = public.jwt_org_id()) with check (organization_id = public.jwt_org_id());
create policy "org_delete" on public.renders for delete using (organization_id = public.jwt_org_id());

-- ─────────────────────────────────────────────────────────────────────
-- 4. ads
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.ads (
  id                  text        primary key default gen_random_uuid()::text,
  organization_id     text        not null references public.organizations(id) on delete cascade,
  render_id           text        not null references public.renders(id) on delete cascade,
  sprint_id           text        not null references public.sprints(id) on delete cascade,
  ad_name             text        not null default '',
  meta_campaign_id    text,
  meta_adset_id       text,
  meta_ad_id          text,
  status              text        not null default 'paused'
                      check (status in ('paused','active','killed','scaled')),
  recommendation      text,
  spend_to_date       numeric     not null default 0,
  impressions         integer     not null default 0,
  clicks              integer     not null default 0,
  conversions         integer     not null default 0,
  cpa                 numeric,
  utm_params          text        not null default '',
  idempotency_key     text        unique,
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists ads_updated_at on public.ads;
create trigger ads_updated_at
  before update on public.ads
  for each row execute function public.set_updated_at();

alter table public.ads enable row level security;

drop policy if exists "org_select" on public.ads;
drop policy if exists "org_insert" on public.ads;
drop policy if exists "org_update" on public.ads;
drop policy if exists "org_delete" on public.ads;

create policy "org_select" on public.ads for select using (organization_id = public.jwt_org_id());
create policy "org_insert" on public.ads for insert with check (organization_id = public.jwt_org_id());
create policy "org_update" on public.ads for update using (organization_id = public.jwt_org_id()) with check (organization_id = public.jwt_org_id());
create policy "org_delete" on public.ads for delete using (organization_id = public.jwt_org_id());

-- ─────────────────────────────────────────────────────────────────────
-- 5. metrics_daily (append-only at JS store layer)
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.metrics_daily (
  id              text        primary key default gen_random_uuid()::text,
  organization_id text        not null references public.organizations(id) on delete cascade,
  ad_id           text        not null references public.ads(id) on delete cascade,
  date            date        not null,
  spend           numeric     not null default 0,
  impressions     integer     not null default 0,
  clicks          integer     not null default 0,
  conversions     integer     not null default 0,
  cpa             numeric,
  ctr             numeric,
  created_at      timestamptz not null default now(),
  unique (ad_id, date)
);

alter table public.metrics_daily enable row level security;

drop policy if exists "org_select" on public.metrics_daily;
drop policy if exists "org_insert" on public.metrics_daily;

create policy "org_select" on public.metrics_daily for select using (organization_id = public.jwt_org_id());
create policy "org_insert" on public.metrics_daily for insert with check (organization_id = public.jwt_org_id());

-- ─────────────────────────────────────────────────────────────────────
-- 6. learnings (append-only at JS store layer)
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.learnings (
  id              text        primary key default gen_random_uuid()::text,
  organization_id text        not null references public.organizations(id) on delete cascade,
  sprint_id       text        references public.sprints(id) on delete set null,
  lane            text        not null check (lane in ('ai','high_production','creator','founder','')),
  hypothesis_type text        not null default '',
  outcome         text        not null default ''
                  check (outcome in ('winner','loser','inconclusive','')),
  summary         text        not null default '',
  tags            jsonb       not null default '[]'::jsonb,
  seeded_from     text,
  created_at      timestamptz not null default now()
);

alter table public.learnings enable row level security;

drop policy if exists "org_select" on public.learnings;
drop policy if exists "org_insert" on public.learnings;

create policy "org_select" on public.learnings for select using (organization_id = public.jwt_org_id());
create policy "org_insert" on public.learnings for insert with check (organization_id = public.jwt_org_id());

-- ─────────────────────────────────────────────────────────────────────
-- 7. discussions (weekly synthesis sessions)
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.discussions (
  id               text        primary key default gen_random_uuid()::text,
  organization_id  text        not null references public.organizations(id) on delete cascade,
  sprint_id        text        references public.sprints(id) on delete set null,
  synthesis_draft  text        not null default '',
  final_text       text        not null default '',
  finalized        boolean     not null default false,
  finalized_at     timestamptz,
  next_constraint_seed text,
  messages         jsonb       not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists discussions_updated_at on public.discussions;
create trigger discussions_updated_at
  before update on public.discussions
  for each row execute function public.set_updated_at();

alter table public.discussions enable row level security;

drop policy if exists "org_select" on public.discussions;
drop policy if exists "org_insert" on public.discussions;
drop policy if exists "org_update" on public.discussions;
drop policy if exists "org_delete" on public.discussions;

create policy "org_select" on public.discussions for select using (organization_id = public.jwt_org_id());
create policy "org_insert" on public.discussions for insert with check (organization_id = public.jwt_org_id());
create policy "org_update" on public.discussions for update using (organization_id = public.jwt_org_id()) with check (organization_id = public.jwt_org_id());
create policy "org_delete" on public.discussions for delete using (organization_id = public.jwt_org_id());

-- ─────────────────────────────────────────────────────────────────────
-- 8. budget_config (one row per org, seeded on first use)
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.budget_config (
  id                text        primary key default gen_random_uuid()::text,
  organization_id   text        not null unique references public.organizations(id) on delete cascade,
  weekly_cap        numeric     not null default 2000.00,
  alert_threshold   numeric     not null default 0.90,
  writes_enabled    boolean     not null default true,
  cpa_target        numeric,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists budget_config_updated_at on public.budget_config;
create trigger budget_config_updated_at
  before update on public.budget_config
  for each row execute function public.set_updated_at();

alter table public.budget_config enable row level security;

drop policy if exists "org_select" on public.budget_config;
drop policy if exists "org_insert" on public.budget_config;
drop policy if exists "org_update" on public.budget_config;

create policy "org_select" on public.budget_config for select using (organization_id = public.jwt_org_id());
create policy "org_insert" on public.budget_config for insert with check (organization_id = public.jwt_org_id());
create policy "org_update" on public.budget_config for update using (organization_id = public.jwt_org_id()) with check (organization_id = public.jwt_org_id());

-- ─────────────────────────────────────────────────────────────────────
-- 9. creative_library (inspiration + saved assets)
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.creative_library (
  id              text        primary key default gen_random_uuid()::text,
  organization_id text        not null references public.organizations(id) on delete cascade,
  kind            text        not null default 'inspiration'
                  check (kind in ('inspiration','competitor','render','brand_asset')),
  title           text        not null default '',
  url             text        not null default '',
  thumbnail_url   text,
  notes           text        not null default '',
  tags            jsonb       not null default '[]'::jsonb,
  source          text,
  archived        boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists creative_library_updated_at on public.creative_library;
create trigger creative_library_updated_at
  before update on public.creative_library
  for each row execute function public.set_updated_at();

alter table public.creative_library enable row level security;

drop policy if exists "org_select" on public.creative_library;
drop policy if exists "org_insert" on public.creative_library;
drop policy if exists "org_update" on public.creative_library;
drop policy if exists "org_delete" on public.creative_library;

create policy "org_select" on public.creative_library for select using (organization_id = public.jwt_org_id());
create policy "org_insert" on public.creative_library for insert with check (organization_id = public.jwt_org_id());
create policy "org_update" on public.creative_library for update using (organization_id = public.jwt_org_id()) with check (organization_id = public.jwt_org_id());
create policy "org_delete" on public.creative_library for delete using (organization_id = public.jwt_org_id());
