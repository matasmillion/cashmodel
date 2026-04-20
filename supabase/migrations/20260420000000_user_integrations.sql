-- Per-user integration credentials (Path A: BYO-token multi-tenant).
-- Each row stores one provider's credentials for one user; RLS ensures nobody
-- else can read or modify them. The shopify-proxy edge function uses the
-- caller's JWT to look up their row, so users can only ever pull data from
-- the store they themselves connected.

create table if not exists public.user_integrations (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  provider    text        not null,           -- 'shopify' | 'meta' | 'mercury' | ...
  token       text        not null,           -- access token / API key
  metadata    jsonb       not null default '{}'::jsonb,  -- { domain, account_id, shop_name, ... }
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, provider)
);

-- Row Level Security: user can only see/modify their own row
alter table public.user_integrations enable row level security;

-- Drop old policies if re-running
drop policy if exists "select_own"  on public.user_integrations;
drop policy if exists "insert_own"  on public.user_integrations;
drop policy if exists "update_own"  on public.user_integrations;
drop policy if exists "delete_own"  on public.user_integrations;

create policy "select_own"
  on public.user_integrations for select
  using (auth.uid() = user_id);

create policy "insert_own"
  on public.user_integrations for insert
  with check (auth.uid() = user_id);

create policy "update_own"
  on public.user_integrations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete_own"
  on public.user_integrations for delete
  using (auth.uid() = user_id);

-- Auto-bump updated_at on every write
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_integrations_set_updated_at on public.user_integrations;
create trigger user_integrations_set_updated_at
  before update on public.user_integrations
  for each row execute function public.set_updated_at();
