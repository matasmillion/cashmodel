-- Fix the org-scoped migration of public.user_integrations.
--
-- The 20260429000000_org_cloud_storage migration switched the table's
-- primary key from (user_id, provider) to (org_id, provider) and
-- dropped the user-scoped RLS policies, but it left two things broken:
--
--   1. user_id was still NOT NULL, so the new client-side upsert
--      payload (which only sends org_id + provider + token + metadata)
--      fails with `null value in column "user_id" violates not-null
--      constraint`.
--
--   2. No new RLS policies were added — every INSERT/UPDATE/SELECT
--      against the table was being blocked silently because RLS is
--      enabled with no allowed actions.
--
-- This migration fixes both. Idempotent — safe to run multiple times.

-- 1. Make user_id nullable. We don't drop it outright because the
-- shopify-proxy edge function still references the column and any
-- legacy rows from before the org migration carry a value there.
alter table public.user_integrations
  alter column user_id drop not null;

-- 2. Org-scoped RLS policies, mirroring every other PLM table in
-- 20260429000000_org_cloud_storage. Read/write is gated on
-- organization membership via public.jwt_org_id().
drop policy if exists "org_select" on public.user_integrations;
drop policy if exists "org_insert" on public.user_integrations;
drop policy if exists "org_update" on public.user_integrations;
drop policy if exists "org_delete" on public.user_integrations;

create policy "org_select"
  on public.user_integrations for select
  using (org_id = public.jwt_org_id());

create policy "org_insert"
  on public.user_integrations for insert
  with check (org_id = public.jwt_org_id());

create policy "org_update"
  on public.user_integrations for update
  using (org_id = public.jwt_org_id())
  with check (org_id = public.jwt_org_id());

create policy "org_delete"
  on public.user_integrations for delete
  using (org_id = public.jwt_org_id());

-- Same surgery for user_plaid_items so the Plaid integration doesn't
-- hit the identical pair of bugs the moment a user tries to connect.
alter table if exists public.user_plaid_items
  alter column user_id drop not null;

drop policy if exists "org_select" on public.user_plaid_items;
drop policy if exists "org_insert" on public.user_plaid_items;
drop policy if exists "org_update" on public.user_plaid_items;
drop policy if exists "org_delete" on public.user_plaid_items;

create policy "org_select"
  on public.user_plaid_items for select
  using (org_id = public.jwt_org_id());

create policy "org_insert"
  on public.user_plaid_items for insert
  with check (org_id = public.jwt_org_id());

create policy "org_update"
  on public.user_plaid_items for update
  using (org_id = public.jwt_org_id())
  with check (org_id = public.jwt_org_id());

create policy "org_delete"
  on public.user_plaid_items for delete
  using (org_id = public.jwt_org_id());
