-- PLM core tables — tech packs, component packs, and all atom libraries.
-- Must run before 20260429000000_org_cloud_storage.sql which adds
-- organization_id to these tables.

create table if not exists public.tech_packs (
  id            text        primary key,
  style_name    text        not null default '',
  product_category text     not null default '',
  status        text        not null default 'Development',
  completion_pct integer    not null default 0,
  data          jsonb       not null default '{}'::jsonb,
  images        jsonb       not null default '[]'::jsonb,
  library       jsonb,
  cover_image   text,
  user_id       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.component_packs (
  id                 text        primary key,
  component_name     text        not null default '',
  component_category text        not null default '',
  status             text        not null default 'Design',
  supplier           text        not null default '',
  cost_per_unit      text        not null default '',
  currency           text        not null default 'USD',
  data               jsonb       not null default '{}'::jsonb,
  images             jsonb       not null default '[]'::jsonb,
  cover_image        text,
  user_id            text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.fabrics (
  id               text        primary key,
  code             text        not null default '',
  name             text        not null default '',
  composition      text        not null default '',
  weight_gsm       numeric,
  weave            text        not null default '',
  hand             text        not null default '',
  width_cm         numeric,
  shrinkage_pct    numeric,
  stretch_pct      numeric,
  color_id         text        not null default '',
  mill_id          text        not null default '',
  lead_time_days   integer     not null default 0,
  moq_yards        numeric,
  price_per_yard_usd numeric,
  currency         text        not null default 'USD',
  status           text        not null default 'draft',
  version          text        not null default 'v1.0',
  notes            text        not null default '',
  user_id          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.patterns (
  id                  text        primary key,
  code                text        not null default '',
  name                text        not null default '',
  category            text        not null default '',
  status              text        not null default 'draft',
  version             text        not null default 'v1.0',
  base_block          text        not null default '',
  sizes               jsonb       not null default '[]'::jsonb,
  grade_rule          text        not null default '',
  ease_chest_cm       numeric,
  drop_cm             numeric,
  seam_allowance_cm   numeric,
  cad_file_url        text        not null default '',
  thumbnail_url       text        not null default '',
  notes               text        not null default '',
  user_id             text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.treatments (
  id                          text        primary key,
  code                        text        not null default '',
  name                        text        not null default '',
  type                        text        not null default 'wash',
  status                      text        not null default 'draft',
  version                     text        not null default 'v1.0',
  base_color_id               text        not null default '',
  chemistry                   text        not null default '',
  duration_minutes            integer,
  temperature_c               numeric,
  compatible_fabric_ids       jsonb       not null default '[]'::jsonb,
  compatible_pattern_categories jsonb     not null default '[]'::jsonb,
  shrinkage_expected_pct      numeric,
  primary_vendor_id           text        not null default '',
  backup_vendor_id            text        not null default '',
  cost_per_unit_usd           numeric,
  lead_time_days              integer,
  moq_units                   integer,
  notes                       text        not null default '',
  digital                     jsonb       not null default '{}'::jsonb,
  units_produced_total        integer     not null default 0,
  defect_rate_pct             numeric,
  user_id                     text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create table if not exists public.embellishments (
  id                 text        primary key,
  code               text        not null default '',
  name               text        not null default '',
  type               text        not null default 'embroidery',
  status             text        not null default 'draft',
  version            text        not null default 'v1.0',
  technique          text        not null default '',
  placement          text        not null default '',
  size_w_cm          numeric,
  size_h_cm          numeric,
  color_count        integer,
  primary_vendor_id  text        not null default '',
  cost_per_unit_usd  numeric,
  lead_time_days     integer,
  moq_units          integer,
  notes              text        not null default '',
  user_id            text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id               text        primary key,
  code             text        not null default '',
  status           text        not null default 'draft',
  vendor_id        text        not null default '',
  style_id         text        not null default '',
  units            integer     not null default 0,
  unit_cost_usd    numeric     not null default 0,
  lead_days        integer     not null default 0,
  size_break       jsonb       not null default '{}'::jsonb,
  placed_at        timestamptz,
  received_at      timestamptz,
  closed_at        timestamptz,
  cancelled_at     timestamptz,
  total_cost_actual numeric,
  notes            text        not null default '',
  user_id          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.bom_snapshots (
  id          text        primary key,
  po_id       text        not null references public.purchase_orders(id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  bom         jsonb       not null default '[]'::jsonb,
  pack        jsonb,
  user_id     text,
  created_at  timestamptz not null default now()
);

create table if not exists public.atom_usage (
  id            text        primary key,
  po_id         text        not null references public.purchase_orders(id) on delete cascade,
  atom_type     text        not null,
  atom_id       text        not null,
  atom_name     text,
  atom_code     text,
  atom_version  text,
  lot           text,
  notes         text,
  qc_photo_urls jsonb       not null default '[]'::jsonb,
  units         numeric,
  unit_cost_usd numeric,
  lead_days     numeric,
  defect_pct    numeric,
  recorded_at   timestamptz not null default now(),
  user_id       text
);

create table if not exists public.drift_logs (
  id             text        primary key,
  treatment_id   text        not null,
  po_id          text        not null references public.purchase_orders(id) on delete cascade,
  score_pct      numeric     not null default 0,
  retrained      boolean     not null default false,
  predicted_grad jsonb,
  actual_grad    jsonb,
  recorded_at    timestamptz not null default now(),
  user_id        text
);
