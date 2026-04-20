-- Plaid items (one row per connected institution per user).
--
-- Unlike user_integrations (one row per provider), Plaid needs a separate
-- table because a single user can connect multiple institutions — e.g.
-- Chase business + AMEX + personal Chase — each with its own access_token
-- and its own item_id. Keeping this as its own table also avoids cramming
-- an array of items into user_integrations.metadata.
--
-- RLS: each user can only see / modify rows where user_id = auth.uid().

create table if not exists public.user_plaid_items (
  item_id          text        primary key,            -- Plaid's opaque item id
  user_id          uuid        not null references auth.users(id) on delete cascade,
  access_token     text        not null,               -- long-lived Plaid token
  institution_id   text,                               -- e.g. 'ins_3' (Chase)
  institution_name text,                               -- e.g. 'Chase'
  accounts         jsonb       not null default '[]'::jsonb,  -- [{ id, name, mask, type, subtype }]
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists user_plaid_items_user_id_idx
  on public.user_plaid_items (user_id);

alter table public.user_plaid_items enable row level security;

drop policy if exists "plaid_select_own"  on public.user_plaid_items;
drop policy if exists "plaid_insert_own"  on public.user_plaid_items;
drop policy if exists "plaid_update_own"  on public.user_plaid_items;
drop policy if exists "plaid_delete_own"  on public.user_plaid_items;

create policy "plaid_select_own"
  on public.user_plaid_items for select
  using (auth.uid() = user_id);

create policy "plaid_insert_own"
  on public.user_plaid_items for insert
  with check (auth.uid() = user_id);

create policy "plaid_update_own"
  on public.user_plaid_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "plaid_delete_own"
  on public.user_plaid_items for delete
  using (auth.uid() = user_id);

-- Reuse the set_updated_at() trigger function defined in the user_integrations migration.
drop trigger if exists user_plaid_items_set_updated_at on public.user_plaid_items;
create trigger user_plaid_items_set_updated_at
  before update on public.user_plaid_items
  for each row execute function public.set_updated_at();
