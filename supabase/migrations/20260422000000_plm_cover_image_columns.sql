-- Add a dedicated cover_image column on both PLM tables so the list views
-- can render thumbnails without pulling the full images JSONB payload
-- (which is base64 and easily multi-MB per row).

alter table if exists component_packs
  add column if not exists cover_image text;

alter table if exists tech_packs
  add column if not exists cover_image text;
