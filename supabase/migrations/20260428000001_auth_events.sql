-- public.auth_events — append-only audit log for auth lifecycle events.
--
-- Compartment 5 of the Clerk + passkey MFA rollout. Source of truth
-- for the /account/security/activity page, for the InfoSec Policy §10
-- "Authentication events … are logged" promise, and for any future
-- SOC 2 / SIEM export.
--
-- Append-only by design: no UPDATE or DELETE RLS policies, so the only
-- way to write rows is via the service role key (the clerk-webhook
-- and any future audit-log edge function). End users + admins read;
-- nobody mutates.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │  REVIEW BEFORE RUNNING                                          │
-- │  Depends on public.users existing — apply only after the prior  │
-- │  migration `20260428000000_users_clerk_jwt.sql` has run.        │
-- └─────────────────────────────────────────────────────────────────┘
--
-- Apply via:
--   supabase db push
-- or paste into the Supabase SQL editor.

create table if not exists public.auth_events (
  id          uuid        primary key default gen_random_uuid(),
  user_id     text        not null references public.users(clerk_user_id) on delete cascade,
  -- See src/lib/audit/log.js for the canonical event vocabulary.
  event       text        not null,
  metadata    jsonb       not null default '{}'::jsonb,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

-- "List my recent events" + "list events of a specific type" are the
-- two query shapes the activity page + admin views run.
create index if not exists auth_events_user_id_idx
  on public.auth_events (user_id, created_at desc);

create index if not exists auth_events_event_idx
  on public.auth_events (event, created_at desc);

-- ─────────────────────────────────────────────────────────────────────
-- RLS
-- Reads: own events, OR all events if the Clerk JWT's
-- public_metadata.role is 'admin'.
-- Writes: service role only (no INSERT / UPDATE / DELETE policies).
-- ─────────────────────────────────────────────────────────────────────

alter table public.auth_events enable row level security;

drop policy if exists "auth_events_select" on public.auth_events;
create policy "auth_events_select"
  on public.auth_events for select
  using (
    (auth.jwt() ->> 'sub') = user_id
    or (auth.jwt() #>> '{public_metadata,role}') = 'admin'
  );

-- No INSERT / UPDATE / DELETE policies on purpose. The clerk-webhook
-- function uses the service role key which bypasses RLS; users cannot
-- forge or rewrite their own audit history.
