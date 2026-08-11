/**
 * Vitest setup file.
 *
 * Runs once before the test suite. Currently:
 *
 *  - Loads the `jest-dom` matchers (`toBeInTheDocument`, etc.) so DOM-based
 *    tests have ergonomic assertions.
 *  - Registers the `vitest-axe` matcher (`toHaveNoViolations`) so the a11y
 *    smoke tests can assert on the axe-core results.
 *  - Installs the `fake-indexeddb` shim onto `globalThis` so that Dexie can
 *    run inside the happy-dom environment. Without this, opening a Dexie
 *    database would throw "IndexedDB API missing. Are you in a private
 *    browsing mode?" because happy-dom does not implement IDB.
 *
 * Each test that uses Dexie still needs to close / delete its own database
 * (or call `resetDb()` from `tests/helpers/dexie-helper.ts`) because the
 * fake IDB instance is shared across test files within the same worker.
 */
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import * as matchers from 'vitest-axe/matchers'
import 'vitest-axe/dist/extend-expect.d.ts'
import { expect } from 'vitest'

expect.extend(matchers)
