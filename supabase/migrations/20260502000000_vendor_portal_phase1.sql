-- Vendor portal — Phase 1 hardening.
--
-- Three changes, all motivated by getting the portal safe to onboard
-- a real vendor:
--
--   1. jwt_org_id() coalesces a new `vendor_org_id` claim. Vendor users
--      never hold a Clerk Organization membership — `{{org.id}}` in
--      their JWT is empty, so the existing helper returned null and
--      RLS denied every read. Vendors arrive carrying
--      publicMetadata.organization_id (set by the vendor-invite Edge
--      Function on the original invitation). The Clerk JWT template
--      must surface that as a top-level claim so this helper can read
--      it. See "JWT TEMPLATE" comment block below.
--
--   2. Explicit deny policies on UPDATE/DELETE for append-only tables.
--      Today they were denied by absence (RLS-enabled tables with no
--      matching policy reject the operation), which works but reads
--      as "we forgot to add policies" rather than "we deny on purpose."
--      Add explicit `using (false)` policies so the audit trail is
--      tamper-resistant by intent, not omission. Service role still
--      bypasses RLS — protect that key like a crown jewel.
--
--   3. Drop stale `invited` placeholder rows that have been sitting
--      for >30 days. Cleanup runs on migrate; a future pg_cron job
--      can keep it scheduled.
--
-- ─────────────────────────────────────────────────────────────────────
-- JWT TEMPLATE — REQUIRED MANUAL STEP
-- ─────────────────────────────────────────────────────────────────────
-- The Clerk "supabase" JWT template must be updated to include a
-- `vendor_org_id` claim sourced from publicMetadata.organization_id.
-- Without this update, vendor users will continue to see an empty
-- portal because RLS will reject every query.
--
--   {
--     "org_id":         "{{org.id}}",
--     "vendor_id":      "{{user.public_metadata.vendor_id}}",
--     "vendor_org_id":  "{{user.public_metadata.organization_id}}",
--     "role":           "{{user.public_metadata.role}}"
--   }
--
-- After updating, every signed-in user's NEXT JWT (refreshed on
-- session.touch() or page reload) carries the new claim. Existing
-- short-lived tokens expire within 60s by default.
-- ─────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────
-- 1. jwt_org_id() — fall back to vendor_org_id for vendor users
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.jwt_org_id() returns text as $$
  select coalesce(
    nullif(auth.jwt() ->> 'org_id', ''),
    nullif(auth.jwt() ->> 'vendor_org_id', '')
  )
$$ language sql stable;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Explicit deny on append-only tables
-- ─────────────────────────────────────────────────────────────────────
-- vendor_notifications: only insert + select are allowed; writes come
-- from the internal admin path (notifyNewPO / notifyNewSample) and the
-- vendor-notify edge function via service role.

drop policy if exists "vendor_notifications_no_update" on public.vendor_notifications;
create policy "vendor_notifications_no_update" on public.vendor_notifications
  for update using (false);

drop policy if exists "vendor_notifications_no_delete" on public.vendor_notifications;
create policy "vendor_notifications_no_delete" on public.vendor_notifications
  for delete using (false);

-- vendor_po_acknowledgements: vendors confirm receipt of a PO; the
-- audit row is never edited or removed.

drop policy if exists "vendor_po_ack_no_update" on public.vendor_po_acknowledgements;
create policy "vendor_po_ack_no_update" on public.vendor_po_acknowledgements
  for update using (false);

drop policy if exists "vendor_po_ack_no_delete" on public.vendor_po_acknowledgements;
create policy "vendor_po_ack_no_delete" on public.vendor_po_acknowledgements
  for delete using (false);

-- atom_usage and bom_snapshots are listed as append-only in CLAUDE.md
-- but inherit only the org_select policy from earlier migrations. Add
-- explicit deny policies so the intent is documented in SQL too.

drop policy if exists "atom_usage_no_update" on public.atom_usage;
create policy "atom_usage_no_update" on public.atom_usage
  for update using (false);

drop policy if exists "atom_usage_no_delete" on public.atom_usage;
create policy "atom_usage_no_delete" on public.atom_usage
  for delete using (false);

drop policy if exists "bom_snapshots_no_update" on public.bom_snapshots;
create policy "bom_snapshots_no_update" on public.bom_snapshots
  for update using (false);

drop policy if exists "bom_snapshots_no_delete" on public.bom_snapshots;
create policy "bom_snapshots_no_delete" on public.bom_snapshots
  for delete using (false);

-- ─────────────────────────────────────────────────────────────────────
-- 3. One-shot cleanup of stale invited placeholders
-- ─────────────────────────────────────────────────────────────────────
-- Rows with status='invited' and clerk_user_id starting 'inv_' that
-- haven't been activated within 30 days are abandoned invitations.
-- Drop them so re-invites of the same email don't conflict.

delete from public.vendor_users
where status = 'invited'
  and clerk_user_id like 'inv_%'
  and invited_at < now() - interval '30 days';
