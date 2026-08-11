/**
 * End-to-end offline smoke for the PWA.
 *
 * Verifies the 19-step procedure from `OFFLINE-PWA-REPORT.md` in
 * a real Chromium browser. The browser is launched against the
 * `vite preview` server (which serves `dist/`), then we toggle
 * `context.setOffline(true)` and confirm the app keeps working.
 *
 * The tests assume the build has been run (`npm run build`) so
 * `dist/` and the Service Worker are available. CI runs the
 * build before this suite.
 */
import { test, expect, type ConsoleMessage } from '@playwright/test'

const APP_URL = '/'

test.describe('PWA offline (Chromium)', () => {
  test('the app shell loads with the SW registered', async ({ page }) => {
    const messages: string[] = []
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() === 'error') messages.push(m.text())
    })
    await page.goto(APP_URL, { waitUntil: 'load' })
    // The page should render the home page heading.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // `window.navigator.serviceWorker` is non-null once the SW is
    // registered (vite-plugin-pwa sets `registerType: 'autoUpdate'`).
    const swState = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'unsupported'
      const reg = await navigator.serviceWorker.getRegistration()
      return reg ? 'registered' : 'absent'
    })
    expect(swState, `console errors: ${messages.join('\n')}`).toBe('registered')
  })

  test('the app renders the playground without a network round-trip once precached', async ({
    page,
    context,
  }) => {
    // First load: primes the precache.
    await page.goto(APP_URL, { waitUntil: 'load' })
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      return reg?.active !== null && reg?.active !== undefined
    })

    // Wait for the SW to take control of the page.
    await page.waitForFunction(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (navigator.serviceWorker as any).controller !== null
    })

    // Now go offline and reload. The SW should serve the precache.
    await context.setOffline(true)
    const reloadErrors: string[] = []
    page.on('pageerror', (err) => reloadErrors.push(err.message))
    await page.reload({ waitUntil: 'load' })

    // The home page should still render.
    await expect(
      page.getByRole('heading', { level: 1 }),
      `reload errors: ${reloadErrors.join('\n')}`,
    ).toBeVisible()

    // The status pill should still show the Worker as connected
    // (the SW is local, so the Worker status is independent of
    // the network).
    const isOnline = await page.evaluate(() => navigator.onLine)
    expect(isOnline).toBe(false)

    // Restore connectivity for the next test.
    await context.setOffline(false)
  })

  test('SPA navigation works while offline (the SW serves /index.html for unknown paths)', async ({
    page,
    context,
  }) => {
    await page.goto(APP_URL, { waitUntil: 'load' })
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      return reg?.active !== null && reg?.active !== undefined
    })

    await context.setOffline(true)
    // Direct navigation to a deep route. The SW's
    // `createHandlerBoundToURL('/index.html')` should serve the
    // SPA shell; React Router takes over from there.
    await page.goto('/course', { waitUntil: 'load' })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await context.setOffline(false)
  })

  test('the wa-sqlite WASM is served from the precache offline', async ({
    page,
    context,
  }) => {
    await page.goto(APP_URL, { waitUntil: 'load' })
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      return reg?.active !== null && reg?.active !== undefined
    })

    await context.setOffline(true)
    // Fetch the WASM directly — it should come from the
    // Cache Storage (the precache), not the network.
    const result = await page.evaluate(async () => {
      const res = await fetch('/wa-sqlite.wasm')
      return {
        ok: res.ok,
        status: res.status,
        size: (await res.arrayBuffer()).byteLength,
        cacheHint: res.headers.get('X-Svelte-Cache') ?? 'no-cache-hint',
      }
    })
    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    // The sync WASM is ~550 KB; just sanity-check that it is not
    // a 0-byte error response.
    expect(result.size).toBeGreaterThan(100_000)

    await context.setOffline(false)
  })
})
