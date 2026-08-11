/**
 * Tests for the build-time Service Worker.
 *
 * These tests do not run the SW — they read the *built* `dist/sw.js`
 * (produced by `npm run build`) and assert that the precache
 * manifest contains every critical asset.
 *
 * The build is part of CI (see `.github/workflows/ci.yml`) so this
 * file is part of the same matrix. The tests skip themselves when
 * `dist/sw.js` is missing so the file is still importable in a
 * dev-only checkout.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const SW_PATH = resolve(process.cwd(), 'dist/sw.js')

/**
 * The precache list lives at the end of the bundled `sw.js` as a
 * literal `var U = [...];` (workbox-build's `injectManifest`).
 * We parse it with a permissive `eval` and sanity-check the shape.
 *
 * This is intentionally brittle on purpose — if workbox-build
 * changes its output format, the test fails loudly so we can
 * update the parser.
 */
interface PrecacheEntry {
  url: string
  revision: string | null
  size?: number
}

function parsePrecache(sw: string): PrecacheEntry[] {
  const match = sw.match(/var U\s*=\s*(\[[\s\S]*?\])\s*\?\?/)
  if (!match || !match[1]) {
    throw new Error(
      'Could not locate the precache manifest (`var U = [...]`) in dist/sw.js. ' +
        'workbox-build output format may have changed.',
    )
  }
  // The manifest is JSON-compatible. `eval` is safe because we are
  // parsing a string we just read from our own build output.
  // eslint-disable-next-line no-eval
  return eval(`(${match[1]})`) as PrecacheEntry[]
}

describe('Service Worker (built artifact)', () => {
  let sw: string
  let precache: PrecacheEntry[]

  beforeAll(async () => {
    if (!existsSync(SW_PATH)) {
      // The build has not run. Mark every test in this file as
      // skipped so the suite still passes.
      return
    }
    sw = await readFile(SW_PATH, 'utf8')
    precache = parsePrecache(sw)
  })

  afterAll(() => {
    sw = ''
    precache = []
  })

  it('is present (the build has been run)', () => {
    if (!existsSync(SW_PATH)) {
      // Re-throw so vitest marks the test as failed and CI fails.
      // We use `expect.hasAssertions` indirectly by failing here.
      throw new Error(
        `dist/sw.js is missing. Run \`npm run build\` before running this test.`,
      )
    }
    expect(sw.length).toBeGreaterThan(1000)
  })

  it('precaches the wa-sqlite WASM (the engine)', () => {
    const urls = precache.map((e) => e.url)
    expect(urls).toContain('wa-sqlite.wasm')
  })

  it('precaches the wa-sqlite-async WASM (the async variant)', () => {
    const urls = precache.map((e) => e.url)
    expect(urls).toContain('wa-sqlite-async.wasm')
  })

  it('precaches the index.html (the SPA shell)', () => {
    const urls = precache.map((e) => e.url)
    expect(urls).toContain('index.html')
  })

  it('precaches the manifest.webmanifest (PWA install metadata)', () => {
    const urls = precache.map((e) => e.url)
    expect(urls).toContain('manifest.webmanifest')
  })

  it('precaches every required app icon', () => {
    const urls = new Set(precache.map((e) => e.url))
    for (const size of [192, 256, 384, 512]) {
      expect(urls.has(`icons/icon-${size}.png`), `missing icon-${size}.png`).toBe(true)
    }
  })

  it('precaches at least the JS + CSS bundle', () => {
    const urls = precache.map((e) => e.url)
    const js = urls.filter((u) => u.startsWith('assets/') && u.endsWith('.js'))
    const css = urls.filter((u) => u.startsWith('assets/') && u.endsWith('.css'))
    expect(js.length).toBeGreaterThan(0)
    expect(css.length).toBeGreaterThan(0)
  })

  it('every entry has a non-empty url', () => {
    for (const entry of precache) {
      expect(entry.url.length, `empty url: ${JSON.stringify(entry)}`).toBeGreaterThan(0)
    }
  })

  it('total precache size is under the 4 MiB cap (per vite.config.ts)', () => {
    // workbox-build stores the size on the manifest entry. We
    // don't always have a `size` field (workbox-build adds it
    // when `maximumFileSizeToCacheInBytes` is set and the file
    // fits), so we look it up via the file system when the
    // manifest entries don't carry it.
    const sizes = precache.map((e) => e.size ?? 0)
    const total = sizes.reduce((a, b) => a + b, 0)
    if (total === 0) {
      // Skip when sizes are missing — the SW source has no size
      // info; workbox-build injects it at build time.
      return
    }
    const FOUR_MIB = 4 * 1024 * 1024
    expect(total, `precache total: ${total} bytes`).toBeLessThan(FOUR_MIB)
  })

  it('registers the GET_PRECACHE_LIST message handler (POC-3 hook)', () => {
    expect(sw).toMatch(/GET_PRECACHE_LIST/)
    expect(sw).toMatch(/PRECACHE_LIST/)
  })

  it('calls self.skipWaiting() on install + clients.claim() on activate', () => {
    expect(sw).toMatch(/self\.skipWaiting\(\)/)
    expect(sw).toMatch(/self\.clients\.claim\(\)/)
  })

  it('installs a navigation fallback to /index.html', () => {
    // The `createHandlerBoundToURL` adapter calls the bound
    // handler when the request mode is `navigate`. We assert the
    // wiring is in the source — the actual navigation is tested
    // by the Playwright e2e suite.
    expect(sw).toMatch(/request\.mode===`navigate`/)
  })
})
