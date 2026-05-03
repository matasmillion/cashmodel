-- Self-healing org bootstrap RPC.
--
-- Problem: component_packs.organization_id is a FK to public.organizations.
-- If the Clerk webhook (organization.created) hasn't fired, the org row
-- doesn't exist and every INSERT into PLM tables fails with a FK violation
-- that Postgres surfaces as an RLS error (misleadingly).
--
-- Fix: expose a SECURITY DEFINER function that authenticated users can call
-- to upsert their own org row. SECURITY DEFINER bypasses RLS on organizations
-- (which has no INSERT policy for regular users) while the function body
-- enforces that callers can only insert their OWN org (jwt_org_id() check).
--
-- Called automatically on the first save attempt from the PLM stores.

create or replace function public.ensure_org_exists(p_org_id text, p_org_name text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only allow inserting the org that matches the caller's JWT org_id.
  -- This prevents any authenticated user from creating arbitrary org rows.
  if p_org_id is distinct from public.jwt_org_id() then
    raise exception 'ensure_org_exists: p_org_id does not match jwt_org_id()';
  end if;

  insert into public.organizations (id, name)
  values (p_org_id, coalesce(nullif(p_org_name, ''), p_org_id))
  on conflict (id) do nothing;
end;
$$;

-- Grant execute to authenticated users (anon cannot call this).
grant execute on function public.ensure_org_exists(text, text) to authenticated;
