-- Org-level vendor portal settings. Two additive columns on
-- org_settings — both safe to leave empty (defaults handled in code).
--
--   vendor_default_locale     Default `preferred_locale` stamped on
--                             new vendor invitations until the vendor
--                             changes it themselves on /vendor/account.
--                             ISO codes; today supports 'en' | 'zh-CN'.
--   vendor_portal_base_url    Public origin of the vendor portal,
--                             e.g. https://app.foreign-resource.com.
--                             Included as the CTA in invitation and
--                             notification emails. Read by both
--                             vendor-invite and vendor-notify edge
--                             functions, falling back to the secret
--                             VENDOR_PORTAL_BASE_URL when this column
--                             is empty.

alter table public.org_settings
  add column if not exists vendor_default_locale text not null default 'en';

alter table public.org_settings
  add column if not exists vendor_portal_base_url text not null default '';
