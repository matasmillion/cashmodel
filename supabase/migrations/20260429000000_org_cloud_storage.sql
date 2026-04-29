-- Sitewide org-level cloud storage migration.
--
-- What this migration does:
--   1. Creates public.organizations + public.user_org_memberships
--   2. Creates new tables: colors, vendors, org_settings, app_state
--   3. Adds organization_id column to all PLM + production tables
--   4. Re-keys user_integrations and user_plaid_items from user_id → org_id
--   5. Enables Row Level Security on every app data table
--   6. Adds org-scoped RLS policies (derive org from Clerk JWT org_id claim)
--
-- Prerequisites:
--   • Clerk "supabase" JWT template must include { "org_id": "{{org.id}}" }
--   • Clerk Organizations must be enabled in the Clerk dashboard
--   • Webhook events: organization.created/deleted + organizationMembership.created/deleted
--
-- Apply via:
--   supabase db push
-- or paste into the Supabase SQL editor and run.

-- ─────────────────────────────────────────────────────────────────────
-- 1. JWT helper — extracts org_id from the Clerk-issued JWT
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.jwt_org_id() returns text as $$
  select nullif(auth.jwt() ->> 'org_id', '')
$$ language sql stable;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Core org tables (populated by the clerk-webhook Edge Function)
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.organizations (
  id          text        primary key,   -- Clerk org.id (e.g. "org_2abc…")
  name        text        not null default '',
  slug        text,
  created_at  timestamptz not null default now()
);

create table if not exists public.user_org_memberships (
  user_id    text        not null references public.users(clerk_user_id) on delete cascade,
  org_id     text        not null references public.organizations(id) on delete cascade,
  role       text        not null default 'member'
             check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);

-- ─────────────────────────────────────────────────────────────────────
-- 3. New tables for currently localStorage-only data
-- ─────────────────────────────────────────────────────────────────────

-- FR color library (was cashmodel_fr_colors)
create table if not exists public.colors (
  id              text        primary key default gen_random_uuid()::text,
  organization_id text        not null references public.organizations(id) on delete cascade,
  name            text        not null,
  hex             text        not null default '',
  rgb             text        not null default '',
  pantone_tcx     text        not null default '',
  pantone_tpg     text        not null default '',
  pantone_c       text        not null default '',
  card_image      text,
  usage_notes     text        not null default '',
  cost_per_unit   text        not null default '',
  currency        text        not null default 'USD',
  adobe_ase_url   text        not null default '',
  adobe_ace_url   text        not null default '',
  clo3d_color_url text        not null default '',
  is_seeded       boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);

-- Vendor library (was cashmodel_vendors)
create table if not exists public.vendors (
  id              text        primary key default gen_random_uuid()::text,
  organization_id text        not null references public.organizations(id) on delete cascade,
  name            text        not null,
  country         text        not null default '',
  city            text        not null default '',
  primary_contact text        not null default '',
  email           text        not null default '',
  phone           text        not null default '',
  website         text        not null default '',
  moq             text        not null default '',
  lead_time_days  integer     not null default 0,
  specialties     text        not null default '',
  notes           text        not null default '',
  logo_image      text,
  capabilities    jsonb       not null default '[]'::jsonb,
  payment_terms   text        not null default '',
  rating          numeric(3,1) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);

-- Org-level settings: Anthropic API key + rate card instructions
create table if not exists public.org_settings (
  org_id                 text primary key references public.organizations(id) on delete cascade,
  anthropic_api_key      text not null default '',
  rate_card_instructions text not null default '',
  updated_at             timestamptz not null default now()
);

-- App state: the financial heart (was cashmodel_state in localStorage)
create table if not exists public.app_state (
  org_id     text primary key references public.organizations(id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────
-- 4. Add organization_id to all existing PLM + production tables
-- ─────────────────────────────────────────────────────────────────────

alter table public.tech_packs      add column if not exists organization_id text references public.organizations(id);
alter table public.component_packs add column if not exists organization_id text references public.organizations(id);
alter table public.fabrics         add column if not exists organization_id text references public.organizations(id);
alter table public.patterns        add column if not exists organization_id text references public.organizations(id);
alter table public.treatments      add column if not exists organization_id text references public.organizations(id);
alter table public.embellishments  add column if not exists organization_id text references public.organizations(id);
alter table public.purchase_orders add column if not exists organization_id text references public.organizations(id);
alter table public.bom_snapshots   add column if not exists organization_id text references public.organizations(id);
alter table public.atom_usage      add column if not exists organization_id text references public.organizations(id);
alter table public.drift_logs      add column if not exists organization_id text references public.organizations(id);

-- ─────────────────────────────────────────────────────────────────────
-- 5. Migrate user_integrations: re-key from user_id → org_id
-- ─────────────────────────────────────────────────────────────────────

-- Add org_id column (nullable first so the ADD succeeds on a populated table)
alter table public.user_integrations
  add column if not exists org_id text references public.organizations(id) on delete cascade;

-- Drop old PK and user-scoped RLS policies
alter table public.user_integrations drop constraint if exists user_integrations_pkey;
drop policy if exists "select_own" on public.user_integrations;
drop policy if exists "insert_own" on public.user_integrations;
drop policy if exists "update_own" on public.user_integrations;
drop policy if exists "delete_own" on public.user_integrations;

-- New PK: (org_id, provider)
-- Note: existing rows have org_id = NULL; they'll be unreachable by RLS until
-- a user connects the integration again (first connection stamps org_id).
alter table public.user_integrations
  add constraint user_integrations_pkey primary key (org_id, provider);

-- ─────────────────────────────────────────────────────────────────────
-- 6. Migrate user_plaid_items: re-key from user_id → org_id
-- ─────────────────────────────────────────────────────────────────────

alter table public.user_plaid_items
  add column if not exists org_id text references public.organizations(id) on delete cascade;

alter table public.user_plaid_items drop constraint if exists user_plaid_items_pkey;
drop policy if exists "select_own" on public.user_plaid_items;
drop policy if exists "insert_own" on public.user_plaid_items;
drop policy if exists "update_own" on public.user_plaid_items;
drop policy if exists "delete_own" on public.user_plaid_items;

-- Derive the PK column name from what actually exists (may be `id` or `item_id`)
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_plaid_items' and column_name = 'item_id'
  ) then
    alter table public.user_plaid_items
      add constraint user_plaid_items_pkey primary key (org_id, item_id);
  else
    alter table public.user_plaid_items
      add constraint user_plaid_items_pkey primary key (org_id, id);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 7. Enable RLS + org-scoped policies on all PLM / production tables
-- ─────────────────────────────────────────────────────────────────────

do $$ declare tbl text; begin
  foreach tbl in array array[
    'tech_packs','component_packs','fabrics','patterns','treatments',
    'embellishments','purchase_orders','bom_snapshots','atom_usage',
    'drift_logs','colors','vendors'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists "org_select" on public.%I', tbl);
    execute format('drop policy if exists "org_insert" on public.%I', tbl);
    execute format('drop policy if exists "org_update" on public.%I', tbl);
    execute format('drop policy if exists "org_delete"  on public.%I', tbl);

    execute format(
      'create policy "org_select" on public.%I for select using (organization_id = public.jwt_org_id())',
      tbl);
    execute format(
      'create policy "org_insert" on public.%I for insert with check (organization_id = public.jwt_org_id())',
      tbl);
    execute format(
      'create policy "org_update" on public.%I for update using (organization_id = public.jwt_org_id()) with check (organization_id = public.jwt_org_id())',
      tbl);

    -- atom_usage and bom_snapshots are append-only — no delete policy.
    if tbl not in ('atom_usage', 'bom_snapshots') then
      execute format(
        'create policy "org_delete" on public.%I for delete using (organization_id = public.jwt_org_id())',
        tbl);
    end if;
  end loop;
end $$;

-- app_state
alter table public.app_state enable row level security;
drop policy if exists "app_state_select" on public.app_state;
drop policy if exists "app_state_insert" on public.app_state;
drop policy if exists "app_state_update" on public.app_state;
create policy "app_state_select" on public.app_state for select using (org_id = public.jwt_org_id());
create policy "app_state_insert" on public.app_state for insert with check (org_id = public.jwt_org_id());
create policy "app_state_update" on public.app_state for update using (org_id = public.jwt_org_id()) with check (org_id = public.jwt_org_id());

-- org_settings
alter table public.org_settings enable row level security;
drop policy if exists "org_settings_select" on public.org_settings;
drop policy if exists "org_settings_insert" on public.org_settings;
drop policy if exists "org_settings_update" on public.org_settings;
create policy "org_settings_select" on public.org_settings for select using (org_id = public.jwt_org_id());
create policy "org_settings_insert" on public.org_settings for insert with check (org_id = public.jwt_org_id());
create policy "org_settings_update" on public.org_settings for update using (org_id = public.jwt_org_id()) with check (org_id = public.jwt_org_id());

-- user_integrations (re-established org-scoped)
alter table public.user_integrations enable row level security;
drop policy if exists "select_own" on public.user_integrations;
drop policy if exists "insert_own" on public.user_integrations;
drop policy if exists "update_own" on public.user_integrations;
drop policy if exists "delete_own" on public.user_integrations;
create policy "select_own" on public.user_integrations for select using (org_id = public.jwt_org_id());
create policy "insert_own" on public.user_integrations for insert with check (org_id = public.jwt_org_id());
create policy "update_own" on public.user_integrations for update using (org_id = public.jwt_org_id()) with check (org_id = public.jwt_org_id());
create policy "delete_own" on public.user_integrations for delete using (org_id = public.jwt_org_id());

-- user_plaid_items (re-established org-scoped)
alter table public.user_plaid_items enable row level security;
drop policy if exists "select_own" on public.user_plaid_items;
drop policy if exists "insert_own" on public.user_plaid_items;
drop policy if exists "update_own" on public.user_plaid_items;
drop policy if exists "delete_own" on public.user_plaid_items;
create policy "select_own" on public.user_plaid_items for select using (org_id = public.jwt_org_id());
create policy "insert_own" on public.user_plaid_items for insert with check (org_id = public.jwt_org_id());
create policy "update_own" on public.user_plaid_items for update using (org_id = public.jwt_org_id()) with check (org_id = public.jwt_org_id());
create policy "delete_own" on public.user_plaid_items for delete using (org_id = public.jwt_org_id());

-- organizations: any member of the org can read it
alter table public.organizations enable row level security;
drop policy if exists "orgs_select" on public.organizations;
create policy "orgs_select" on public.organizations for select
  using (id in (
    select org_id from public.user_org_memberships
    where user_id = (auth.jwt() ->> 'sub')
  ));

-- user_org_memberships: users see their own memberships
alter table public.user_org_memberships enable row level security;
drop policy if exists "memberships_select" on public.user_org_memberships;
create policy "memberships_select" on public.user_org_memberships for select
  using (user_id = (auth.jwt() ->> 'sub'));
