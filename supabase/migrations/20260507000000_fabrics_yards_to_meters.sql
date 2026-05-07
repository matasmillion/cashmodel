-- Convert fabric sourcing units from yards to meters.
--
-- Every mill we work with (Jufeng, Lien Hsing, Kuroki, …) quotes in metric.
-- Storing yards forces a unit conversion every time the AI extractor or the
-- BOM PDF runs. Switch to meters at the source so the data matches what
-- the user actually receives from the mill.
--
-- Conversion: 1 yard = 0.9144 meters.
--   moq_meters         = moq_yards * 0.9144
--   price_per_meter_usd = price_per_yard_usd / 0.9144

alter table public.fabrics
  rename column moq_yards to moq_meters;

alter table public.fabrics
  rename column price_per_yard_usd to price_per_meter_usd;

update public.fabrics
   set moq_meters = round(moq_meters * 0.9144)
 where moq_meters is not null;

update public.fabrics
   set price_per_meter_usd = round((price_per_meter_usd / 0.9144)::numeric, 2)
 where price_per_meter_usd is not null;
