-- Multi-currency, multi-unit fabric pricing.
--
-- Mills in China typically quote in RMB (CNY) and often by the kilogram
-- rather than per linear meter, while our books / margin math run in
-- USD per meter. Storing all four — price_per_meter_usd / _cny and
-- price_per_kg_usd / _cny — lets the FabricBuilder mirror the value the
-- mill actually quoted alongside the converted USD figure without
-- losing precision to repeated conversion.
--
-- USD ↔ CNY conversion happens client-side using a daily-cached rate
-- from open.er-api.com (see src/utils/fxRates.js). Meters and kilograms
-- are NOT auto-converted — they're independent units the user enters
-- based on how the mill quoted that specific fabric.

alter table public.fabrics
  add column if not exists price_per_meter_cny numeric,
  add column if not exists price_per_kg_usd    numeric,
  add column if not exists price_per_kg_cny    numeric;
