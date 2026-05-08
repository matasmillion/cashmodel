-- Fix systemic schema drift between the JS atom schemas and the cloud
-- tables. Without these columns, every fabric / treatment / pattern /
-- embellishment INSERT was silently failing with "column not found",
-- so atom data created on one device never reached the cloud and
-- never appeared on a different laptop.
--
-- Trims (component_packs) was unaffected because its cloud table
-- already had cover_image plus a data jsonb catch-all from the
-- original tech_packs migration.

-- ─── fabrics ────────────────────────────────────────────────────────────
alter table public.fabrics
  add column if not exists category          text  default '',
  add column if not exists mill_fabric_no    text  default '',
  add column if not exists front_image_url   text  default '',
  add column if not exists back_image_url    text  default '',
  add column if not exists color_card_images jsonb default '[]'::jsonb,
  add column if not exists zfab_file_url     text  default '',
  add column if not exists cover_image       text;

-- ─── treatments ─────────────────────────────────────────────────────────
alter table public.treatments
  add column if not exists swatch_image_url text default '',
  add column if not exists cover_image      text;

-- ─── patterns ───────────────────────────────────────────────────────────
alter table public.patterns
  add column if not exists cover_image text;

-- ─── embellishments ─────────────────────────────────────────────────────
alter table public.embellishments
  add column if not exists artwork_file_url    text  default '',
  add column if not exists placement_image_url text  default '',
  add column if not exists thread_color_ids    jsonb default '[]'::jsonb,
  add column if not exists currency            text  default 'USD',
  add column if not exists adobe_ai_url        text  default '',
  add column if not exists adobe_psd_url       text  default '',
  add column if not exists digitizing_file_url text  default '',
  add column if not exists backup_vendor_id    text  default '',
  add column if not exists cover_image         text;
