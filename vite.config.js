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
    // cleanly (no stale-asset lock-in). Supabase/Clerk API calls are never
    // cached — there's no runtimeCaching, so they always hit the network.
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
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
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
      },
    }),
  ],
  build: {
    // Emit source maps so production stack traces point at real files.
    sourcemap: true,
  },
})
