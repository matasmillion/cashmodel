-- Vendor portal — schema, RLS, and the JWT helper that ties a Clerk
-- user to a single vendor record.
--
-- Tables added:
--   vendor_users                  — links a Clerk user to one vendor
--                                   (organization_id, vendor_id) and
--                                   stores their preferred locale.
--   sample_requests               — vendor-facing sample queue.
--   vendor_po_acknowledgements    — append-only: vendors confirm POs.
--   vendor_notifications          — append-only: every email dispatch.
--
-- RLS model:
--   • Internal users (no vendor_id JWT claim) keep full org-scoped
--     access via the existing public.jwt_org_id() helper.
--   • Vendor users (have a `vendor_id` JWT claim, returned by
--     public.jwt_vendor_id()) are restricted to rows where
--     vendor_id = jwt_vendor_id(). They never see other vendors'
--     POs / samples / acknowledgements / notifications.
--
-- The Clerk "supabase" JWT template must include:
--   {
--     "org_id":    "{{org.id}}",
--     "vendor_id": "{{user.public_metadata.vendor_id}}",
--     "app_role":  "{{user.public_metadata.role}}"
--   }
-- ⚠ DO NOT name the app-role claim "role" at the top level — Supabase
-- PostgREST treats the JWT's top-level `role` claim as the Postgres
-- role to SET LOCAL ROLE into. A claim like `role: "admin"` will then
-- error out as `role "admin" does not exist` on every authenticated
-- request (Storage uploads included). Use `app_role` (or any other
-- name) and let PostgREST default the Postgres role to "authenticated".
-- All RLS policies in this codebase read the app role via
-- `auth.jwt() #>> '{public_metadata,role}'`, which works regardless of
-- whether `app_role` is also present at the top level.
-- The clerk-webhook Edge Function stamps publicMetadata.vendor_id when
-- the admin invites a vendor user; the webhook also upserts a row into
-- vendor_users for the same purpose, since the JWT alone isn't enough
-- for a server-side email lookup.

-- ─────────────────────────────────────────────────────────────────────
-- 1. JWT helpers
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.jwt_vendor_id() returns text as $$
  select nullif(auth.jwt() ->> 'vendor_id', '')
$$ language sql stable;

-- ─────────────────────────────────────────────────────────────────────
-- 2. vendor_users — Clerk user ↔ vendor mapping
-- ─────────────────────────────────────────────────────────────────────

-- vendor_id stores the vendor's NAME (matching purchase_orders.vendor_id
-- and treatments.primary_vendor_id throughout the codebase). Vendor
-- names are unique per (organization_id, name) on public.vendors. We
-- intentionally don't FK to vendors(id) because the rest of the
-- codebase doesn't use vendors.id as the join key.
create table if not exists public.vendor_users (
  organization_id  text not null references public.organizations(id) on delete cascade,
  vendor_id        text not null,
  clerk_user_id    text not null,
  email            text not null,
  preferred_locale text not null default 'en',
  status           text not null default 'active'
                   check (status in ('active', 'invited', 'revoked')),
  invited_at       timestamptz not null default now(),
  joined_at        timestamptz,
  primary key (organization_id, clerk_user_id)
);

create index if not exists vendor_users_vendor_idx
  on public.vendor_users (organization_id, vendor_id);

-- ─────────────────────────────────────────────────────────────────────
-- 3. sample_requests — internal-side creates, vendor-side reads
-- ─────────────────────────────────────────────────────────────────────

-- vendor_id below stores the vendor's name; see vendor_users comment.
create table if not exists public.sample_requests (
  id                text primary key default gen_random_uuid()::text,
  organization_id   text not null references public.organizations(id) on delete cascade,
  vendor_id         text not null,
  style_id          text not null default '',
  sample_type       text not null default 'Proto',
  verdict           text not null default 'Pending'
                    check (verdict in ('Pending', 'Approved', 'Rejected', 'Resubmit')),
  courier           text not null default '',
  tracking_number   text not null default '',
  notes             text not null default '',
  internal_notes    text not null default '',
  cost_per_unit_usd numeric,
  requested_at      timestamptz not null default now(),
  received_at       timestamptz,
  user_id           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists sample_requests_vendor_idx
  on public.sample_requests (organization_id, vendor_id);

-- ─────────────────────────────────────────────────────────────────────
-- 4. vendor_po_acknowledgements — append-only
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.vendor_po_acknowledgements (
  id              text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  vendor_id       text not null,
  po_id           text not null references public.purchase_orders(id) on delete cascade,
  acknowledged_at timestamptz not null default now()
);

create index if not exists vendor_po_ack_po_idx
  on public.vendor_po_acknowledgements (po_id);

-- ─────────────────────────────────────────────────────────────────────
-- 5. vendor_notifications — append-only audit of every dispatch
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.vendor_notifications (
  id              text primary key default gen_random_uuid()::text,
  organization_id text not null references public.organizations(id) on delete cascade,
  vendor_id       text not null,
  event_type      text not null
                  check (event_type in ('po.placed', 'sample.requested')),
  subject_id      text not null,
  payload         jsonb not null default '{}'::jsonb,
  delivery_status text not null default 'pending'
                  check (delivery_status in ('pending', 'sent', 'failed')),
  delivery_error  text,
  actor_user_id   text,
  created_at      timestamptz not null default now(),
  delivered_at    timestamptz
);

create index if not exists vendor_notifications_vendor_idx
  on public.vendor_notifications (organization_id, vendor_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────
-- 6. Row Level Security
-- ─────────────────────────────────────────────────────────────────────

alter table public.vendor_users               enable row level security;
alter table public.sample_requests            enable row level security;
alter table public.vendor_po_acknowledgements enable row level security;
alter table public.vendor_notifications       enable row level security;

-- Internal users (no vendor_id claim) → full org access.
-- Vendor users (vendor_id claim set)  → only their own vendor's rows.

-- vendor_users: a vendor user can only see their own row; internal
-- admins see every row in their org.
drop policy if exists "vendor_users_select" on public.vendor_users;
create policy "vendor_users_select" on public.vendor_users
  for select using (
    organization_id = public.jwt_org_id()
    and (
      public.jwt_vendor_id() is null              -- internal user: full org scope
      or vendor_id = public.jwt_vendor_id()       -- vendor user: only their vendor
    )
  );

drop policy if exists "vendor_users_insert" on public.vendor_users;
create policy "vendor_users_insert" on public.vendor_users
  for insert with check (
    organization_id = public.jwt_org_id()
    and public.jwt_vendor_id() is null            -- only internal users invite
  );

drop policy if exists "vendor_users_update" on public.vendor_users;
create policy "vendor_users_update" on public.vendor_users
  for update using (
    organization_id = public.jwt_org_id()
    and (
      public.jwt_vendor_id() is null
      or vendor_id = public.jwt_vendor_id()       -- vendor edits only their own row (preferred_locale)
    )
  ) with check (
    organization_id = public.jwt_org_id()
  );

-- sample_requests
drop policy if exists "sample_requests_select" on public.sample_requests;
create policy "sample_requests_select" on public.sample_requests
  for select using (
    organization_id = public.jwt_org_id()
    and (
      public.jwt_vendor_id() is null
      or vendor_id = public.jwt_vendor_id()
    )
  );

drop policy if exists "sample_requests_insert" on public.sample_requests;
create policy "sample_requests_insert" on public.sample_requests
  for insert with check (
    organization_id = public.jwt_org_id()
    and public.jwt_vendor_id() is null            -- vendors never create samples
  );

drop policy if exists "sample_requests_update" on public.sample_requests;
create policy "sample_requests_update" on public.sample_requests
  for update using (
    organization_id = public.jwt_org_id()
    and public.jwt_vendor_id() is null
  );

-- vendor_po_acknowledgements (append-only — insert + select only)
drop policy if exists "vendor_po_ack_select" on public.vendor_po_acknowledgements;
create policy "vendor_po_ack_select" on public.vendor_po_acknowledgements
  for select using (
    organization_id = public.jwt_org_id()
    and (
      public.jwt_vendor_id() is null
      or vendor_id = public.jwt_vendor_id()
    )
  );

drop policy if exists "vendor_po_ack_insert" on public.vendor_po_acknowledgements;
create policy "vendor_po_ack_insert" on public.vendor_po_acknowledgements
  for insert with check (
    organization_id = public.jwt_org_id()
    and (
      public.jwt_vendor_id() is null
      or vendor_id = public.jwt_vendor_id()
    )
  );

-- vendor_notifications (append-only)
drop policy if exists "vendor_notifications_select" on public.vendor_notifications;
create policy "vendor_notifications_select" on public.vendor_notifications
  for select using (
    organization_id = public.jwt_org_id()
    and public.jwt_vendor_id() is null            -- vendors don't read this audit
  );

drop policy if exists "vendor_notifications_insert" on public.vendor_notifications;
create policy "vendor_notifications_insert" on public.vendor_notifications
  for insert with check (
    organization_id = public.jwt_org_id()
    and public.jwt_vendor_id() is null            -- only internal flows / service role insert
  );

-- ─────────────────────────────────────────────────────────────────────
-- 7. Tighten existing tables for vendor users
-- ─────────────────────────────────────────────────────────────────────
-- The existing org_select on purchase_orders + bom_snapshots etc. would
-- expose every vendor's POs to a vendor user logged into the same Clerk
-- org. Replace with a vendor-aware variant. Internal users keep
-- unchanged access (jwt_vendor_id() is null branch).

drop policy if exists "org_select" on public.purchase_orders;
create policy "org_select" on public.purchase_orders
  for select using (
    organization_id = public.jwt_org_id()
    and (
      public.jwt_vendor_id() is null
      or vendor_id = public.jwt_vendor_id()
    )
  );

drop policy if exists "org_insert" on public.purchase_orders;
create policy "org_insert" on public.purchase_orders
  for insert with check (
    organization_id = public.jwt_org_id()
    and public.jwt_vendor_id() is null            -- vendors never create POs
  );

drop policy if exists "org_update" on public.purchase_orders;
create policy "org_update" on public.purchase_orders
  for update using (
    organization_id = public.jwt_org_id()
    and public.jwt_vendor_id() is null
  ) with check (
    organization_id = public.jwt_org_id()
  );

drop policy if exists "org_delete" on public.purchase_orders;
create policy "org_delete" on public.purchase_orders
  for delete using (
    organization_id = public.jwt_org_id()
    and public.jwt_vendor_id() is null
  );

-- bom_snapshots — vendors can read snapshots tied to their POs only.
-- Snapshots don't have vendor_id directly, so we exists-join through
-- purchase_orders.
drop policy if exists "org_select" on public.bom_snapshots;
create policy "org_select" on public.bom_snapshots
  for select using (
    organization_id = public.jwt_org_id()
    and (
      public.jwt_vendor_id() is null
      or exists (
        select 1 from public.purchase_orders po
        where po.id = bom_snapshots.po_id
          and po.vendor_id = public.jwt_vendor_id()
      )
    )
  );

-- atom_usage and drift_logs are internal-only — vendor users get nothing.
drop policy if exists "org_select" on public.atom_usage;
create policy "org_select" on public.atom_usage
  for select using (
    organization_id = public.jwt_org_id()
    and public.jwt_vendor_id() is null
  );

drop policy if exists "org_select" on public.drift_logs;
create policy "org_select" on public.drift_logs
  for select using (
    organization_id = public.jwt_org_id()
    and public.jwt_vendor_id() is null
  );
