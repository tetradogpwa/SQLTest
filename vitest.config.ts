import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Vitest configuration.
 *
 * Uses `happy-dom` for DOM emulation (smaller, faster than jsdom for our
 * needs) and re-uses the same React plugin as the production build so
 * JSX/TSX in tests is processed the same way.
 *
 * The setup file imports `@testing-library/jest-dom` matchers.
 *
 * `esbuild.jsx: 'automatic'` matches the `jsx: 'react-jsx'` setting in
 * `tsconfig.app.json` so the test pipeline uses the modern JSX
 * runtime (no need for `import React` in every .tsx file).
 */
export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsx: 'automatic',
  },
  define: {
    // Mirror the production build's `define` so the tests can resolve
    // build-time constants (see `vite.config.ts`). The values are
    // harmless placeholders; the tests only assert that *something*
    // is rendered.
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0-test'),
    __APP_BUILD_ID__: JSON.stringify(new Date('2025-01-01T00:00:00.000Z').toISOString()),
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'pocs/**/*.test.{ts,tsx}'],
    // Playwright e2e specs use the `.spec.ts` suffix — keep them
    // out of the vitest pipeline so a missing `playwright` install
    // does not break `npm test`.
    exclude: ['node_modules', 'dist', 'tests/e2e/**'],
    css: false,
    // The POCs take longer than the default 5s; some load a 558KB WASM file.
    testTimeout: 60_000,
    // wa-sqlite ESM uses dynamic imports and WebAssembly in the same
    // process. Use the threads pool so each test file gets a fresh
    // module graph and the WASM state is not shared.
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      // Match the production surface — exclude Worker, tests, POCs,
      // build artifacts and the dev-only `build-info.d.ts` constants
      // (which are inlined at build time and never executed at
      // runtime).
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/build-info.d.ts',
        'src/workers/sw.ts',
        'src/workers/sqlite.worker.ts',
        'src/workers/wa-sqlite.d.ts',
        // The public `dbapi.ts` is a thin orchestrator whose real
        // coverage comes from the Worker integration tests in
        // `pocs/engine/poc-1` and `poc-2` (the WASM-based
        // round-trip). Vitest's mocked `DBApi` doesn't exercise
        // the meaningful branches.
        'src/workers/dbapi.ts',
        // Type-only modules have no runtime to cover.
        'src/workers/types.ts',
        'src/workers/serialization-helper.ts',
      ],
      // Coverage thresholds (T7 of PROJECT_PLAN.md). The build /
      // CI fails when any metric falls below its target. The
      // targets match the project's current coverage floor
      // (89% lines, 79% branches, 83% functions) with a small
      // buffer so day-to-day work doesn't trip the gate. New
      // files are pulled in at their real coverage.
      thresholds: {
        lines: 88,
        branches: 78,
        functions: 80,
        statements: 88,
      },
      enabled: true,
      reportOnFailure: true,
    },
  },
})
