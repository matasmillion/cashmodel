-- pg_cron + pg_net setup for the creative engine's scheduled jobs.
--
-- This migration only enables the extensions. The actual cron.schedule()
-- calls live in a separate snippet documented in the runbook because
-- they need the project's specific Supabase URL + cron secret, which
-- aren't in version control.
--
-- After applying this migration, run the snippet in
-- docs/creative-engine-runbook.md → "Schedule the cron jobs" with
-- your project URL + secret pasted in.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Light audit trail for slack-actions (and other future agent calls).
-- Append-only at the JS layer, but no constraint here — keep schema
-- flexible so we can extend the payload shape without migrations.
create table if not exists public.agent_interactions (
  id              text        primary key default gen_random_uuid()::text,
  source          text        not null default '',
  action_id       text,
  value           text,
  slack_team_id   text,
  slack_user_id   text,
  payload         jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

alter table public.agent_interactions enable row level security;

drop policy if exists "service_role_only" on public.agent_interactions;
-- This table is written by edge functions running with service-role.
-- We don't expose it to clients — there's no SELECT policy, which
-- under RLS means clients see zero rows.
