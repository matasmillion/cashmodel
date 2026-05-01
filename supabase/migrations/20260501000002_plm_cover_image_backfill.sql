-- Backfill cover_image on tech_packs and component_packs from each row's
-- images JSONB. Existing rows that pre-date the cover_image column (or
-- whose cover_image writes failed silently before the schema-resilient
-- save hotfix) currently render placeholders instead of thumbnails on
-- the list views. This migration walks every row and pulls the first
-- entry from images that matches the cover slot, preferring a Storage
-- path over a legacy data: URL when both exist.
--
-- Idempotent — safe to run multiple times. Only updates rows where
-- cover_image is currently null AND the images JSONB has a usable cover.

-- Component packs (cover slot is 'component-cover')
update public.component_packs
set cover_image = (
  select coalesce(img->>'path', img->>'data')
  from jsonb_array_elements(public.component_packs.images) as img
  where img->>'slot' = 'component-cover'
    and (img ? 'path' or img ? 'data')
  limit 1
)
where cover_image is null
  and jsonb_typeof(images) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(public.component_packs.images) as img
    where img->>'slot' = 'component-cover'
      and (img ? 'path' or img ? 'data')
  );

-- Tech packs (cover slot is 'cover')
update public.tech_packs
set cover_image = (
  select coalesce(img->>'path', img->>'data')
  from jsonb_array_elements(public.tech_packs.images) as img
  where img->>'slot' = 'cover'
    and (img ? 'path' or img ? 'data')
  limit 1
)
where cover_image is null
  and jsonb_typeof(images) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(public.tech_packs.images) as img
    where img->>'slot' = 'cover'
      and (img ? 'path' or img ? 'data')
  );

-- Sanity check: how many rows now have a cover_image set vs total.
-- Run this manually in the SQL editor to confirm the backfill landed.
--
--   select count(*) filter (where cover_image is not null) as with_cover,
--          count(*) as total
--   from public.component_packs;
--
--   select count(*) filter (where cover_image is not null) as with_cover,
--          count(*) as total
--   from public.tech_packs;
