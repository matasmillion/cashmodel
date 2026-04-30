-- PLM Assets Storage bucket — replaces base64-in-JSONB for all PLM images.
--
-- What this migration does:
--   1. Creates the `plm-assets` Storage bucket (private; signed URLs only)
--   2. Adds org-scoped RLS policies on storage.objects so members of an org
--      can only read/write files under that org's path prefix.
--
-- Path layout (enforced by app code; first segment is checked by RLS):
--   {org_id}/{scope}/{owner_id}/{slot}-{uuid}.{ext}
--
--   scope ∈ component-packs | tech-packs | fabrics | patterns | treatments |
--           embellishments | colors | vendors | po
--
-- Prerequisites:
--   • 20260429000000_org_cloud_storage.sql must be applied first (creates
--     public.jwt_org_id() and the organizations table).
--
-- Apply via:
--   supabase db push
-- or paste into the Supabase SQL editor and run.

-- ─────────────────────────────────────────────────────────────────────
-- 1. Create the bucket. Private; clients fetch via createSignedUrl.
-- ─────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'plm-assets',
  'plm-assets',
  false,
  20971520, -- 20 MB hard cap; the app pre-compresses to ~300 KB before upload
  array['image/webp', 'image/jpeg', 'image/png', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─────────────────────────────────────────────────────────────────────
-- 2. RLS policies on storage.objects scoped by the first path segment.
--    storage.foldername(name) returns the path components as a text[],
--    so [1] is the org_id segment.
-- ─────────────────────────────────────────────────────────────────────

drop policy if exists "plm_assets_select" on storage.objects;
drop policy if exists "plm_assets_insert" on storage.objects;
drop policy if exists "plm_assets_update" on storage.objects;
drop policy if exists "plm_assets_delete" on storage.objects;

create policy "plm_assets_select" on storage.objects for select
  using (
    bucket_id = 'plm-assets'
    and (storage.foldername(name))[1] = public.jwt_org_id()
  );

create policy "plm_assets_insert" on storage.objects for insert
  with check (
    bucket_id = 'plm-assets'
    and (storage.foldername(name))[1] = public.jwt_org_id()
  );

create policy "plm_assets_update" on storage.objects for update
  using (
    bucket_id = 'plm-assets'
    and (storage.foldername(name))[1] = public.jwt_org_id()
  )
  with check (
    bucket_id = 'plm-assets'
    and (storage.foldername(name))[1] = public.jwt_org_id()
  );

create policy "plm_assets_delete" on storage.objects for delete
  using (
    bucket_id = 'plm-assets'
    and (storage.foldername(name))[1] = public.jwt_org_id()
  );
