-- Variant mappings — explicit PLM style ↔ Shopify variant join.
--
-- Replaces the fuzzy title-substring match in poAllocations.js. Stores
-- both Shopify variant_gid and inventory_item_id because the Shopify
-- variant GID is destroyed when a sold-out size is deleted from a
-- product; we keep all three identifiers (gid, inventory_item_id, sku)
-- so the daily sync can detect drift and the operator can re-map
-- without losing history.
--
-- Mirrors the localStorage-primary pattern in `variantMappingStore.js`.
-- Cloud rows are scoped per-org via RLS using `public.jwt_org_id()`.
--
-- One active mapping per (organization_id, style_id, options_key)
-- enforced by partial unique index. Re-mapping archives the old row
-- and inserts a new one — never mutates the edge in place.

create table if not exists public.variant_mappings (
  id                          uuid        primary key default gen_random_uuid(),
  organization_id             text        not null,
  style_id                    text        not null,                 -- PLM techpack id
  variant_options             jsonb       not null default '{}'::jsonb,
  options_key                 text        not null,                 -- canonical JSON of variant_options
  shopify_variant_gid         text        not null,                 -- gid://shopify/ProductVariant/123
  shopify_inventory_item_id   text        not null default '',
  shopify_sku                 text        not null default '',
  source                      text        not null default 'manual'
                              check (source in ('auto', 'manual', 'sync')),
  confidence                  numeric     not null default 1,
  verified_at                 timestamptz null,
  archived_at                 timestamptz null,
  archive_reason              text        null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  created_by                  text        not null default ''
);

-- Only one active mapping per (org, style_id, options_key). Once a
-- mapping is archived (archived_at set) it falls out of the index so
-- a replacement can be inserted.
create unique index if not exists variant_mappings_active_unique
  on public.variant_mappings (organization_id, style_id, options_key)
  where archived_at is null;

-- Reverse lookup: Shopify variant → PLM style.
create index if not exists variant_mappings_by_variant_gid
  on public.variant_mappings (organization_id, shopify_variant_gid)
  where archived_at is null;

create index if not exists variant_mappings_by_style
  on public.variant_mappings (organization_id, style_id);

-- Stale-mapping detection: which mappings haven't been verified in N days.
create index if not exists variant_mappings_verified_at
  on public.variant_mappings (organization_id, verified_at)
  where archived_at is null;

drop trigger if exists variant_mappings_set_updated_at on public.variant_mappings;
create trigger variant_mappings_set_updated_at
  before update on public.variant_mappings
  for each row execute function public.set_updated_at();

alter table public.variant_mappings enable row level security;

drop policy if exists "org_select" on public.variant_mappings;
drop policy if exists "org_insert" on public.variant_mappings;
drop policy if exists "org_update" on public.variant_mappings;
drop policy if exists "org_delete" on public.variant_mappings;

create policy "org_select"
  on public.variant_mappings for select
  using (organization_id = public.jwt_org_id());

create policy "org_insert"
  on public.variant_mappings for insert
  with check (organization_id = public.jwt_org_id());

create policy "org_update"
  on public.variant_mappings for update
  using (organization_id = public.jwt_org_id())
  with check (organization_id = public.jwt_org_id());

create policy "org_delete"
  on public.variant_mappings for delete
  using (organization_id = public.jwt_org_id());


-- ── Audit log (append-only) ────────────────────────────────────────────────
--
-- Captures every state change on a mapping for back-tracing "why did
-- this PO allocate to that variant?" months later. Append-only is
-- enforced at THREE layers:
--   1. JS (variantMappingStore.js exports no update/delete)
--   2. RLS policies below — only select + insert, no update/delete
--   3. Future: a database trigger could also reject UPDATE/DELETE if we
--      ever stop trusting the application layer

create table if not exists public.variant_mapping_audit (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  text        not null,
  mapping_id       uuid        not null,
  action           text        not null
                   check (action in ('created', 'updated', 'archived', 'verified')),
  before           jsonb       null,
  after            jsonb       not null,
  reason           text        not null default '',
  actor            text        not null default 'system',
  created_at       timestamptz not null default now()
);

create index if not exists variant_mapping_audit_by_mapping
  on public.variant_mapping_audit (organization_id, mapping_id, created_at desc);

create index if not exists variant_mapping_audit_by_org_time
  on public.variant_mapping_audit (organization_id, created_at desc);

alter table public.variant_mapping_audit enable row level security;

drop policy if exists "org_select" on public.variant_mapping_audit;
drop policy if exists "org_insert" on public.variant_mapping_audit;

create policy "org_select"
  on public.variant_mapping_audit for select
  using (organization_id = public.jwt_org_id());

create policy "org_insert"
  on public.variant_mapping_audit for insert
  with check (organization_id = public.jwt_org_id());

-- Deliberately NO update/delete policies — append-only at the RLS layer.
