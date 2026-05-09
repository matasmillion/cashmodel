-- Tracked variants for sell-through alerts.
--
-- Mirrors the localStorage-only tracking in `sellThroughStore.js` so the
-- cron-triggered `sell-through-alert` edge function can read which
-- variants this org actively manages without a browser session.
--
-- Source of truth in the browser stays localStorage. The mirror is
-- best-effort, scoped per-org via RLS.

create table if not exists public.sell_through_tracked (
  organization_id  text        not null,
  variant_id       text        not null,           -- Shopify GID, e.g. gid://shopify/ProductVariant/123
  sku              text        not null default '',
  product_title    text        not null default '',
  variant_title    text        not null default '',
  lead_time_days   integer     not null default 70,  -- per-variant restock lead time
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (organization_id, variant_id)
);

-- Match the same auto-bump trigger every other org-scoped table uses.
drop trigger if exists sell_through_tracked_set_updated_at on public.sell_through_tracked;
create trigger sell_through_tracked_set_updated_at
  before update on public.sell_through_tracked
  for each row execute function public.set_updated_at();

alter table public.sell_through_tracked enable row level security;

drop policy if exists "org_select" on public.sell_through_tracked;
drop policy if exists "org_insert" on public.sell_through_tracked;
drop policy if exists "org_update" on public.sell_through_tracked;
drop policy if exists "org_delete" on public.sell_through_tracked;

create policy "org_select"
  on public.sell_through_tracked for select
  using (organization_id = public.jwt_org_id());

create policy "org_insert"
  on public.sell_through_tracked for insert
  with check (organization_id = public.jwt_org_id());

create policy "org_update"
  on public.sell_through_tracked for update
  using (organization_id = public.jwt_org_id())
  with check (organization_id = public.jwt_org_id());

create policy "org_delete"
  on public.sell_through_tracked for delete
  using (organization_id = public.jwt_org_id());
