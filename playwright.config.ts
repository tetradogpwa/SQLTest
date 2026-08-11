/**
 * Playwright config for the offline PWA suite.
 *
 * The e2e tests are gated on the build being available; the CI
 * workflow runs `npm run build` before the e2e step. In local
 * development, run `npm run build` once and then `npx playwright
 * test`.
 */
import { defineConfig, devices } from '@playwright/test'

const PORT = 4173 // `vite preview` default

export default defineConfig({
  testDir: './tests/e2e',
  // Single worker so the `setOffline` toggles don't race between
  // parallel tests.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Boot `vite preview` (serves the production build) and tear
  // it down after the suite. We use the bundled `dist/` that the
  // CI workflow produces before this job runs.
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
