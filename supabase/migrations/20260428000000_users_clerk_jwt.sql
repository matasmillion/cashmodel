-- public.users — Clerk-keyed user shadow table.
--
-- Compartment 4 of the Clerk + passkey MFA rollout. Stops keying our
-- application data off Supabase auth.users (which is going away) and
-- starts keying off Clerk via a `clerk_user_id` text PK. The webhook
-- function `clerk-webhook` upserts into this table on every Clerk
-- user lifecycle event.
--
-- ┌─────────────────────────────────────────────────────────────────┐
-- │  REVIEW BEFORE RUNNING                                          │
-- │  This migration is destructive: it drops auth.users-backed FKs  │
-- │  on user_integrations and user_plaid_items, deleting any rows   │
-- │  whose original auth.uid() doesn't have a known Clerk mapping.  │
-- │  The implementer is the only existing user; reconnecting Plaid  │
-- │  + Mercury + Shopify after the cutover is a one-time chore.     │
-- └─────────────────────────────────────────────────────────────────┘
--
-- Apply via:
--   supabase db push                          (deploys new migration)
-- or paste into the SQL editor and run.

-- ─────────────────────────────────────────────────────────────────────
-- 1. New users table — keyed by Clerk's user id (text, not uuid)
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.users (
  clerk_user_id  text        primary key,
  email          text        not null default '',
  name           text        not null default '',
  role           text        not null default 'viewer'
                            check (role in ('admin', 'operator', 'viewer')),
  mfa_enabled    boolean     not null default false,
  mfa_factors    jsonb       not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Indexed lookup by email for the webhook + admin views.
create index if not exists users_email_idx on public.users (lower(email));

-- ─────────────────────────────────────────────────────────────────────
-- 2. RLS — users see only their own row.
-- Clerk's Supabase JWT integration template puts the Clerk user id in
-- the `sub` claim of the JWT it issues for Supabase. We compare that
-- against clerk_user_id below. The webhook bypasses RLS by using the
-- service role key.
-- ─────────────────────────────────────────────────────────────────────

alter table public.users enable row level security;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
  on public.users for select
  using ((auth.jwt() ->> 'sub') = clerk_user_id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users for update
  using ((auth.jwt() ->> 'sub') = clerk_user_id)
  with check ((auth.jwt() ->> 'sub') = clerk_user_id);

-- No insert / delete policies on purpose — only the webhook (service
-- role) creates / removes rows. Users cannot self-create or self-delete.

-- ─────────────────────────────────────────────────────────────────────
-- 3. Migrate user_integrations (was keyed by auth.users(id) uuid).
-- Drop the FK + RLS that referenced auth.uid(); switch user_id to text
-- and FK to public.users(clerk_user_id). Existing rows become orphans
-- because no Clerk → Supabase user mapping exists yet — they will be
-- re-created when the user reconnects each provider.
-- ─────────────────────────────────────────────────────────────────────

-- Truncate first (no historical Plaid tokens / API keys we need to keep).
truncate table public.user_integrations;

-- Drop existing FK + policies + PK.
alter table public.user_integrations
  drop constraint if exists user_integrations_user_id_fkey;

drop policy if exists "select_own"  on public.user_integrations;
drop policy if exists "insert_own"  on public.user_integrations;
drop policy if exists "update_own"  on public.user_integrations;
drop policy if exists "delete_own"  on public.user_integrations;

alter table public.user_integrations
  drop constraint if exists user_integrations_pkey;

-- Switch column type and FK.
alter table public.user_integrations
  alter column user_id set data type text using user_id::text;

alter table public.user_integrations
  add constraint user_integrations_user_id_fkey
  foreign key (user_id) references public.users(clerk_user_id) on delete cascade;

alter table public.user_integrations
  add constraint user_integrations_pkey primary key (user_id, provider);

-- Re-establish RLS using Clerk JWT.
create policy "select_own"
  on public.user_integrations for select
  using ((auth.jwt() ->> 'sub') = user_id);

create policy "insert_own"
  on public.user_integrations for insert
  with check ((auth.jwt() ->> 'sub') = user_id);

create policy "update_own"
  on public.user_integrations for update
  using ((auth.jwt() ->> 'sub') = user_id)
  with check ((auth.jwt() ->> 'sub') = user_id);

create policy "delete_own"
  on public.user_integrations for delete
  using ((auth.jwt() ->> 'sub') = user_id);

-- ─────────────────────────────────────────────────────────────────────
-- 4. Migrate user_plaid_items (same pattern).
-- ─────────────────────────────────────────────────────────────────────

truncate table public.user_plaid_items;

alter table public.user_plaid_items
  drop constraint if exists user_plaid_items_user_id_fkey;

drop policy if exists "select_own"  on public.user_plaid_items;
drop policy if exists "insert_own"  on public.user_plaid_items;
drop policy if exists "update_own"  on public.user_plaid_items;
drop policy if exists "delete_own"  on public.user_plaid_items;

alter table public.user_plaid_items
  alter column user_id set data type text using user_id::text;

alter table public.user_plaid_items
  add constraint user_plaid_items_user_id_fkey
  foreign key (user_id) references public.users(clerk_user_id) on delete cascade;

create policy "select_own"
  on public.user_plaid_items for select
  using ((auth.jwt() ->> 'sub') = user_id);

create policy "insert_own"
  on public.user_plaid_items for insert
  with check ((auth.jwt() ->> 'sub') = user_id);

create policy "update_own"
  on public.user_plaid_items for update
  using ((auth.jwt() ->> 'sub') = user_id)
  with check ((auth.jwt() ->> 'sub') = user_id);

create policy "delete_own"
  on public.user_plaid_items for delete
  using ((auth.jwt() ->> 'sub') = user_id);

-- ─────────────────────────────────────────────────────────────────────
-- 5. Updated_at trigger so Clerk-side edits keep the timestamp current.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();
