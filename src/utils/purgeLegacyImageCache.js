// Purges the orphaned v1 runtime image cache ('fr-plm-images') once at boot.
//
// WHY: The v1 SW rule accepted opaque (status 0) responses — seeded by
// no-cors <img> tag loads — and stored them in 'fr-plm-images'. When a
// cors-mode fetch() hit that cache later (AI garment views, PDF export),
// the SW returned an opaque entry, which the fetch spec treats as a
// network error ("Failed to fetch"). Fixing the SW rule (v2, statuses:[200])
// means new installs never re-poison the cache, but already-installed clients
// still have the poisoned 'fr-plm-images' entries. Workbox's
// cleanupOutdatedCaches only removes '-precache-' caches, so we must delete
// the old runtime cache explicitly. Running this at every boot is idempotent —
// caches.delete() is a no-op once the cache is gone.

/**
 * Delete the poisoned v1 image cache ('fr-plm-images') if it exists.
 * Fire-and-forget — never throws to the caller.
 */
export function purgeLegacyImageCache() {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    window.caches.delete('fr-plm-images').catch(() => {});
  } catch (_) {}
}
