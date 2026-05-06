-- Creative knowledge — structured org-scoped brand knowledge that powers
-- brief generation. Replaces the markdown files in the bundle.
--
-- One row per (organization_id, kind). New saves overwrite in place but
-- bump `version` so we keep an audit trail of when knowledge changed
-- (useful for tying brief performance to knowledge-state shifts later).
--
-- `fields` is jsonb because each kind has its own questionnaire schema
-- defined in src/types/creativeKnowledge.js. The DB doesn't enforce the
-- shape — the JS layer does — so we can iterate on the schemas without
-- migrations.

-- Idempotent helper definition so this migration can run standalone
-- (i.e. before or independently of 20260506000001_creative_schema.sql).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.creative_knowledge (
  id              text        primary key default gen_random_uuid()::text,
  organization_id text        not null references public.organizations(id) on delete cascade,
  kind            text        not null check (kind in ('avatar','brand','product','models')),
  fields          jsonb       not null default '{}'::jsonb,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, kind)
);

drop trigger if exists creative_knowledge_updated_at on public.creative_knowledge;
create trigger creative_knowledge_updated_at
  before update on public.creative_knowledge
  for each row execute function public.set_updated_at();

alter table public.creative_knowledge enable row level security;

drop policy if exists "org_select" on public.creative_knowledge;
drop policy if exists "org_insert" on public.creative_knowledge;
drop policy if exists "org_update" on public.creative_knowledge;
drop policy if exists "org_delete" on public.creative_knowledge;

create policy "org_select" on public.creative_knowledge for select using (organization_id = public.jwt_org_id());
create policy "org_insert" on public.creative_knowledge for insert with check (organization_id = public.jwt_org_id());
create policy "org_update" on public.creative_knowledge for update using (organization_id = public.jwt_org_id()) with check (organization_id = public.jwt_org_id());
create policy "org_delete" on public.creative_knowledge for delete using (organization_id = public.jwt_org_id());
