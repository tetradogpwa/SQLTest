import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
//
// COOP/COEP cross-origin-isolation headers are NOT required for the chosen
// stack: `wa-sqlite` + `OPFSCoopSyncVFS` works without SharedArrayBuffer and
// can be deployed as plain static files on any host.
// If a future module requires SAB, add the following to the dev/preview server
// config (NOT to the prod build — the hosting platform must set the headers):
//
//   server: {
//     headers: {
//       'Cross-Origin-Opener-Policy': 'same-origin',
//       'Cross-Origin-Embedder-Policy': 'require-corp',
//     },
//   },
//   preview: {
//     headers: {
//       'Cross-Origin-Opener-Policy': 'same-origin',
//       'Cross-Origin-Embedder-Policy': 'require-corp',
//     },
//   },
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      // Custom service worker source — provided in a later POC; for the
      // scaffolding we use a no-op so vite-plugin-pwa does not error out.
      srcDir: 'src/workers',
      filename: 'sw.ts',
      injectRegister: false,
      manifest: {
        name: 'SQL Academy',
        short_name: 'SQL Academy',
        description:
          'Aprende SQL con ejercicios interactivos, ejecutados 100% en tu navegador.',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0ea5e9',
        background_color: '#0f172a',
        lang: 'es',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-256.png',
            sizes: '256x256',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-384.png',
            sizes: '384x384',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      includeAssets: ['favicon.svg', 'icons.svg', 'wa-sqlite.wasm'],
      // When using `injectManifest` strategy the `workbox.*` block is ignored —
      // the precache manifest is configured via `injectManifest.*` instead.
      // The `workbox-build` `injectManifest` helper reads the SW source
      // (src/workers/sw.ts), finds the `self.__WB_MANIFEST` placeholder and
      // replaces it with the URL list matched by `globPatterns` below.
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm,woff2}'],
        // Cap at 4 MiB — the wa-sqlite WASM is ~550 KB so we're well under.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],

  // wa-sqlite ships pre-bundled WASM and a COOP/COEP-isolated VFS; letting
  // Vite pre-bundle them corrupts the binary or breaks the Web Worker import.
  // See https://vite.dev/config/dep-optimization-options.html
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm', 'wa-sqlite'],
  },

  // Dedicated workers (sqlite.worker.ts) need ES module output for Comlink
  // and for native `import` inside the worker.
  worker: {
    format: 'es',
  },

  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
