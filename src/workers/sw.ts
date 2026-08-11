/// <reference lib="webworker" />

/**
 * Service Worker source for vite-plugin-pwa (`injectManifest` strategy).
 *
 * The precache manifest is injected at build time by workbox-build's
 * `injectManifest` helper. It replaces the placeholder string defined
 * below with the actual URL list — including the wa-sqlite WASM
 * (`/wa-sqlite.wasm`) and the wa-sqlite-async WASM
 * (`/wa-sqlite-async.wasm`) copied from `node_modules/wa-sqlite/dist/`
 * by the `scripts/sync-wa-sqlite.mjs` prebuild step.
 *
 * Strategy:
 *  - Precache every static asset matched by `globPatterns` (app shell,
 *    icons, WASM). This is the only cache strategy we need because the
 *    app is 100% offline after the first load.
 *  - `clientsClaim: true` so the SW takes control of all open tabs on
 *    first activation.
 *  - `skipWaiting` on install so updates apply without a reload prompt.
 *  - SPA navigation fallback: any `request.mode === 'navigate'` returns
 *    the precached `/index.html`.
 *
 * For the POC-3 verification we also listen for a custom message
 * (`GET_PRECACHE_LIST`) and respond with the precache URL list — the
 * page renders it in a table.
 */

import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope
interface PrecacheEntryWB {
  url: string
  revision?: string
  size?: number
}

// The placeholder below is what workbox-build's `injectManifest` looks
// for. After `vite build` it is replaced with the actual precache list
// of `{url, revision, size}` entries. We assign it to a local variable
// so the rest of the file can reference the captured list without
// re-matching the placeholder (workbox-build requires exactly one
// occurrence in the source).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const manifest: PrecacheEntryWB[] = (self as unknown as { __WB_MANIFEST: PrecacheEntryWB[] }).__WB_MANIFEST ?? []

// 1. Precache app shell + WASM.
precacheAndRoute(manifest as unknown as Parameters<typeof precacheAndRoute>[0])

// 2. SPA navigation fallback — unknown navigations return /index.html.
//    createHandlerBoundToURL returns a RouteHandlerCallback which expects
//    `{request, url}` — we adapt from the FetchEvent.
try {
  const navHandler = createHandlerBoundToURL('/index.html')
  self.addEventListener('fetch', (event) => {
    const fe = event as ExtendableEvent & { request: Request; respondWith(r: Promise<Response>): void }
    if (fe.request.mode === 'navigate') {
      fe.respondWith(navHandler({ event: fe, request: fe.request, url: new URL(fe.request.url) }))
    }
  })
} catch {
  // createHandlerBoundToURL requires the URL to be in the precache list.
  // Falls through to default browser behaviour if not.
}

self.addEventListener('install', () => {
  // Activate the new SW immediately on first install.
  void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

/**
 * Expose the precache list to the Main Thread on request.
 *
 * The captured `manifest` array is the result of workbox-build's
 * `injectManifest`. We post a redacted view (just `url` + `size`) to
 * any client that asks via postMessage.
 *
 * This is for the POC-3 verification step (show user which assets are
 * precached). It is harmless in production.
 */
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: string } | undefined
  if (data?.type === 'GET_PRECACHE_LIST') {
    const payload = manifest.map((entry) => ({
      url: entry.url,
      size: entry.size ?? 0,
    }))
    event.source?.postMessage({ type: 'PRECACHE_LIST', list: payload })
  }
})
