-- Add an archived_at column to vendors so users can hide a vendor from
-- the Vendors directory without deleting the record. Mirrors the
-- archive pattern on fabrics / treatments / patterns / embellishments
-- (those use status='archived'; vendors get a dedicated timestamp so we
-- can track *when* they were archived without overloading another
-- field — the vendor library has no status enum today).
--
-- NULL = active, non-NULL = archived at that timestamp.
-- Restore = SET archived_at = NULL. Delete = DELETE the row.

alter table public.vendors
  add column if not exists archived_at timestamptz;
