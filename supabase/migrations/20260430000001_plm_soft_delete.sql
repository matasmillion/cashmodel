-- Soft-delete columns for tech packs + component packs.
--
-- Rationale: hard DELETE was the single highest-risk lost-work surface in
-- the PLM tool. One mis-click and a pack vanished from cloud + local with
-- no path back. Soft delete + a Trash view + a 30-day retention window
-- means delete is recoverable for a month.
--
-- Apply via:
--   supabase db push
-- or paste into the Supabase SQL editor and run.

alter table public.tech_packs       add column if not exists deleted_at timestamptz;
alter table public.component_packs  add column if not exists deleted_at timestamptz;

-- Index for the Trash query (find rows with deleted_at set, ordered by
-- recency). Partial index keeps the live-list query unaffected.
create index if not exists tech_packs_deleted_at_idx
  on public.tech_packs(organization_id, deleted_at desc) where deleted_at is not null;
create index if not exists component_packs_deleted_at_idx
  on public.component_packs(organization_id, deleted_at desc) where deleted_at is not null;
