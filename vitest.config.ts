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
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'pocs/**/*.test.{ts,tsx}'],
    css: false,
    // The POCs take longer than the default 5s; some load a 558KB WASM file.
    testTimeout: 60_000,
    // wa-sqlite ESM uses dynamic imports and WebAssembly in the same
    // process. Use the threads pool so each test file gets a fresh
    // module graph and the WASM state is not shared.
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } },
  },
})
