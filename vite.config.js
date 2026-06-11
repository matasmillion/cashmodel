import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/cashmodel/',
  plugins: [
    react(),
    tailwindcss(),
    // Installable, offline-capable app shell. The local-first IndexedDB store
    // (src/utils/localDb.js) holds the data; the service worker precaches the
    // build so the app launches from the dock/taskbar and runs without network.
    // autoUpdate + Vite's hashed filenames mean each deploy refreshes the cache
    // cleanly (no stale-asset lock-in). Supabase/Clerk DB + auth calls are never
    // cached — only PLM image bytes (Storage) are, via the runtimeCaching rule.
    VitePWA({
      registerType: 'autoUpdate',
      // base is '/cashmodel/' so the SW scope and start_url stay under it.
      manifest: {
        name: 'Foreign Resource — Cash Model',
        short_name: 'FR Cash Model',
        description: 'Foreign Resource — Growth Model & Operating Dashboard',
        theme_color: '#3A3A3A',
        background_color: '#F5F0E8',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // Precache the app shell. Source maps (huge) are excluded.
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2}'],
        // SPA navigations resolve to the app shell so deep links work offline.
        navigateFallback: 'index.html',
        // Don't intercept legal pages (served standalone) or the SPA 404 helper.
        navigateFallbackDenylist: [/^\/cashmodel\/legal\//, /404\.html$/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // PLM image bytes live in Supabase Storage. Cache them locally so a
            // photo loads instantly after the first view and never re-downloads
            // — the signed URL's ?token changes on every re-sign, so we match
            // ignoring the query string (the object path is what's stable).
            // This is the image half of local-first: kills the placeholder /
            // slow-thumbnail / broken-image churn. Scoped to /storage/ only, so
            // DB / auth / RPC calls are untouched and always hit the network.
            urlPattern: ({ url }) => url.pathname.includes('/storage/v1/object/'),
            handler: 'CacheFirst',
            options: {
              // v2: the v1 cache ('fr-plm-images') accepted opaque (status 0)
              // responses, which <img> tags (no-cors) seeded on first render.
              // Serving an opaque entry to a cors-mode fetch() is a network
              // error per the fetch spec ("Failed to fetch") — it broke AI
              // garment views, PDF export, and every byte-level image read in
              // the installed PWA. v2 never caches opaque responses and
              // normalizes every cache-fill request to CORS, so one cached
              // response legally serves both <img> and fetch() consumers.
              // (main.jsx purges the orphaned v1 cache at boot.)
              cacheName: 'fr-plm-images-v2',
              matchOptions: { ignoreSearch: true },
              fetchOptions: { mode: 'cors', credentials: 'omit' },
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    // Emit source maps so production stack traces point at real files.
    sourcemap: true,
  },
})
