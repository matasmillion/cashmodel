-- Pre/post-shrink fabric specs + directional (warp/weft) shrinkage.
--
-- weight_gsm / width_cm stay the PRE-wash values (yield / consumption math
-- reads them and must not change meaning). Shrinkage is split into the two
-- yarn directions — warp = lengthwise (经向), weft = widthwise (纬向) — and
-- the finished GSM/width are derived in the app, persisted only when the
-- operator overrides the derived value or the mill prints a different one.
--
-- Additive only: the legacy single shrinkage_pct column is left in place so
-- existing rows keep their data and the app can read it as a fallback.
alter table public.fabrics
  add column if not exists shrinkage_warp_pct numeric,
  add column if not exists shrinkage_weft_pct numeric,
  add column if not exists weight_gsm_post     numeric,
  add column if not exists width_cm_post       numeric;
