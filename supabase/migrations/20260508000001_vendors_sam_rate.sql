-- Add the SAM (Standard Allowed Minute) billing rate column to vendors.
--
-- The JS vendor library has been writing sam_rate_usd_per_min to cloud
-- since PR #68, but the column never existed on the table. Every
-- upsert silently failed with "column not found in schema cache" —
-- so the SAM rate was localStorage-only on the device that set it
-- and never appeared on any other laptop.

alter table public.vendors
  add column if not exists sam_rate_usd_per_min numeric default 0;
