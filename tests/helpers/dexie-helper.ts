/**
 * Dexie test helper.
 *
 * Two responsibilities:
 *
 * 1. `createTestDb(name)` — returns a fresh `SqlAcademyDB` instance with a
 *    unique name, so multiple test files (and even multiple `describe`s
 *    within one file) cannot collide on the shared `fake-indexeddb`
 *    instance.
 *
 * 2. `resetTestDb(db)` — closes and deletes the database so the test
 *    teardown is hermetic. Vitest forks each test file, but a single file
 *    that re-uses the same Dexie singleton would accumulate rows across
 *    tests; the helper provides a one-liner to clear state.
 */
import { SqlAcademyDB } from '../../src/core/persistence/dexie'

let counter = 0

export function createTestDb(): SqlAcademyDB {
  counter += 1
  // Random suffix guarantees uniqueness even when vitest re-uses a worker.
  const suffix = `${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 8)}`
  return new SqlAcademyDB(`sql-academy-test-${suffix}`)
}

export async function resetTestDb(db: SqlAcademyDB): Promise<void> {
  if (db.isOpen()) {
    db.close()
  }
  await db.delete()
}
