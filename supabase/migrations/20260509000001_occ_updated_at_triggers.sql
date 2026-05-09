-- Optimistic concurrency control: server-authoritative updated_at on every
-- editable PLM and Creative table. Saves are conditional UPDATEs guarded by
-- WHERE id = ? AND updated_at = :base — for that ETag to be trustworthy the
-- server (not the client) must decide what updated_at becomes after a write.
--
-- Reuses the public.set_updated_at() trigger function defined in
-- 20260420000000_user_integrations.sql.
--
-- Also enrols every editable table into the supabase_realtime publication so
-- presence-aware builders can subscribe to postgres_changes for live merges.

-- ─── BEFORE UPDATE triggers ──────────────────────────────────────────────────

-- PLM atoms
drop trigger if exists fabrics_set_updated_at on public.fabrics;
create trigger fabrics_set_updated_at
  before update on public.fabrics
  for each row execute function public.set_updated_at();

drop trigger if exists patterns_set_updated_at on public.patterns;
create trigger patterns_set_updated_at
  before update on public.patterns
  for each row execute function public.set_updated_at();

drop trigger if exists treatments_set_updated_at on public.treatments;
create trigger treatments_set_updated_at
  before update on public.treatments
  for each row execute function public.set_updated_at();

drop trigger if exists embellishments_set_updated_at on public.embellishments;
create trigger embellishments_set_updated_at
  before update on public.embellishments
  for each row execute function public.set_updated_at();

drop trigger if exists colors_set_updated_at on public.colors;
create trigger colors_set_updated_at
  before update on public.colors
  for each row execute function public.set_updated_at();

drop trigger if exists vendors_set_updated_at on public.vendors;
create trigger vendors_set_updated_at
  before update on public.vendors
  for each row execute function public.set_updated_at();

-- PLM packs
drop trigger if exists tech_packs_set_updated_at on public.tech_packs;
create trigger tech_packs_set_updated_at
  before update on public.tech_packs
  for each row execute function public.set_updated_at();

drop trigger if exists component_packs_set_updated_at on public.component_packs;
create trigger component_packs_set_updated_at
  before update on public.component_packs
  for each row execute function public.set_updated_at();

-- Creative module
drop trigger if exists sprints_set_updated_at on public.sprints;
create trigger sprints_set_updated_at
  before update on public.sprints
  for each row execute function public.set_updated_at();

drop trigger if exists briefs_set_updated_at on public.briefs;
create trigger briefs_set_updated_at
  before update on public.briefs
  for each row execute function public.set_updated_at();

drop trigger if exists renders_set_updated_at on public.renders;
create trigger renders_set_updated_at
  before update on public.renders
  for each row execute function public.set_updated_at();

drop trigger if exists ads_set_updated_at on public.ads;
create trigger ads_set_updated_at
  before update on public.ads
  for each row execute function public.set_updated_at();

drop trigger if exists discussions_set_updated_at on public.discussions;
create trigger discussions_set_updated_at
  before update on public.discussions
  for each row execute function public.set_updated_at();

drop trigger if exists budget_config_set_updated_at on public.budget_config;
create trigger budget_config_set_updated_at
  before update on public.budget_config
  for each row execute function public.set_updated_at();

drop trigger if exists creative_library_set_updated_at on public.creative_library;
create trigger creative_library_set_updated_at
  before update on public.creative_library
  for each row execute function public.set_updated_at();

-- creative_knowledge already has a trigger from 20260506000002, but redefine
-- idempotently so this migration is the single source of truth going forward.
drop trigger if exists creative_knowledge_updated_at on public.creative_knowledge;
drop trigger if exists creative_knowledge_set_updated_at on public.creative_knowledge;
create trigger creative_knowledge_set_updated_at
  before update on public.creative_knowledge
  for each row execute function public.set_updated_at();

-- ─── Realtime publication ────────────────────────────────────────────────────
-- ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS form; wrap each add in
-- a DO block that swallows duplicate_object so the migration is replayable.

do $$
declare
  t text;
  tables text[] := array[
    'public.fabrics',
    'public.patterns',
    'public.treatments',
    'public.embellishments',
    'public.colors',
    'public.vendors',
    'public.tech_packs',
    'public.component_packs',
    'public.sprints',
    'public.briefs',
    'public.renders',
    'public.ads',
    'public.discussions',
    'public.budget_config',
    'public.creative_library',
    'public.creative_knowledge'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array tables loop
    begin
      execute format('alter publication supabase_realtime add table %s', t);
    exception
      when duplicate_object then null;
      when undefined_table then null;
    end;
  end loop;
end $$;

-- Tell PostgREST the schema cache needs reloading so robustUpdateAtomOptimistic
-- on the client side sees the new trigger behaviour right away.
notify pgrst, 'reload schema';
