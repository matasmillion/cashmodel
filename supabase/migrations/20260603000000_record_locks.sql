-- Record locks — single-writer check-out for editable PLM / production records.
--
-- The brand rule: only one person edits a given "file" (a fabric, a style, a
-- PO, a treatment, a component pack) at a time. Concurrent edits were silent
-- last-write-wins; this makes editing a hard check-out.
--
-- One row per (resource_type, resource_id) — the primary key IS the
-- single-writer guarantee. Locks AUTO-EXPIRE (no manual override): a lock whose
-- heartbeat is older than the TTL is treated as abandoned (closed tab / crash)
-- and can be stolen by the next editor. The client heartbeats while editing and
-- releases on close; the TTL is the backstop.
--
-- All writes go through the SECURITY DEFINER RPCs below so acquire / steal is
-- atomic (race-free) in Postgres. Clients get SELECT only (to show the holder
-- and poll for release). Org isolation is enforced inside every RPC via
-- public.jwt_org_id(), mirroring the rest of the schema.

create table if not exists public.record_locks (
  resource_type    text        not null,
  resource_id      text        not null,
  organization_id  text        not null,
  user_id          text        not null,
  user_name        text        not null default '',
  acquired_at      timestamptz not null default now(),
  heartbeat_at     timestamptz not null default now(),
  primary key (resource_type, resource_id)
);

create index if not exists record_locks_by_org
  on public.record_locks (organization_id);

alter table public.record_locks enable row level security;

-- Org-scoped reads only. No insert/update/delete policies — every mutation is
-- routed through the RPCs (which are SECURITY DEFINER and bypass RLS safely).
drop policy if exists "org_select" on public.record_locks;
create policy "org_select"
  on public.record_locks for select
  using (organization_id = public.jwt_org_id());

-- ── Acquire (or steal-if-abandoned, or refresh-if-mine) ─────────────────────
-- Returns acquired=true when the caller now holds the lock. When false, the
-- returned holder_* fields describe who currently holds it so the UI can say
-- "Matías is editing this." TTL default 90s pairs with a 30s client heartbeat.
create or replace function public.acquire_record_lock(
  p_resource_type text,
  p_resource_id   text,
  p_user_id       text,
  p_user_name     text default '',
  p_ttl_seconds   integer default 90
) returns table (
  acquired         boolean,
  holder_user_id   text,
  holder_user_name text,
  acquired_at      timestamptz,
  heartbeat_at     timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text := public.jwt_org_id();
  v_row public.record_locks%rowtype;
begin
  if v_org is null then
    return query select false, null::text, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  -- Atomic: insert if free; on conflict take it ONLY if it's already ours or
  -- the existing holder's heartbeat has gone stale (abandoned). If a fresh
  -- lock is held by someone else, the WHERE is false → no row → not acquired.
  insert into public.record_locks as rl
    (resource_type, resource_id, organization_id, user_id, user_name, acquired_at, heartbeat_at)
  values (p_resource_type, p_resource_id, v_org, p_user_id, coalesce(p_user_name, ''), now(), now())
  on conflict (resource_type, resource_id) do update
    set user_id     = excluded.user_id,
        user_name   = excluded.user_name,
        acquired_at = now(),
        heartbeat_at = now()
    where rl.organization_id = v_org
      and (rl.user_id = excluded.user_id
           or rl.heartbeat_at < now() - make_interval(secs => p_ttl_seconds))
  returning * into v_row;

  if found then
    return query select true, v_row.user_id, v_row.user_name, v_row.acquired_at, v_row.heartbeat_at;
  else
    -- Held by another user and still fresh. Report the holder (same org only,
    -- so a different org's holder is never leaked).
    select * into v_row from public.record_locks
      where resource_type = p_resource_type
        and resource_id = p_resource_id
        and organization_id = v_org;
    if found then
      return query select false, v_row.user_id, v_row.user_name, v_row.acquired_at, v_row.heartbeat_at;
    else
      return query select false, null::text, null::text, null::timestamptz, null::timestamptz;
    end if;
  end if;
end;
$$;

-- ── Heartbeat — keep my lock alive while I'm editing ────────────────────────
create or replace function public.heartbeat_record_lock(
  p_resource_type text,
  p_resource_id   text,
  p_user_id       text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text := public.jwt_org_id();
  v_n   integer;
begin
  if v_org is null then return false; end if;
  update public.record_locks
    set heartbeat_at = now()
    where resource_type = p_resource_type
      and resource_id = p_resource_id
      and organization_id = v_org
      and user_id = p_user_id;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

-- ── Release — drop my lock on close / navigate-away ─────────────────────────
create or replace function public.release_record_lock(
  p_resource_type text,
  p_resource_id   text,
  p_user_id       text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org text := public.jwt_org_id();
  v_n   integer;
begin
  if v_org is null then return false; end if;
  delete from public.record_locks
    where resource_type = p_resource_type
      and resource_id = p_resource_id
      and organization_id = v_org
      and user_id = p_user_id;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

grant execute on function public.acquire_record_lock(text, text, text, text, integer) to authenticated;
grant execute on function public.heartbeat_record_lock(text, text, text) to authenticated;
grant execute on function public.release_record_lock(text, text, text) to authenticated;
