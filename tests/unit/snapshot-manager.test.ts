/**
 * SnapshotManager tests — verify capture + restore round-trip and the
 * LRU + global-size policies. The test backend is a real wa-sqlite
 * instance with a `MemoryVFS` (loaded via `tests/helpers/wa-sqlite-harness`).
 *
 * Each test resets the VFS so the snapshot directories start empty.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'

import { SnapshotManager, SnapshotNotFoundError } from '../../src/workers/snapshot-manager'
import { MemoryVfsIO } from '../../src/workers/vfs-io'
import { DatabaseManager } from '../../src/workers/database-manager'
import { loadHarness, makeDb, type Harness } from '../helpers/wa-sqlite-harness'

const DB_FILENAME = 'main.db'
const DB_ID = 42

describe('SnapshotManager — round-trip and policies', () => {
  let harness: Harness
  let dbs: DatabaseManager
  let snapshots: SnapshotManager

  beforeAll(async () => {
    harness = await loadHarness()
  }, 60_000)

  beforeEach(async () => {
    harness.reset()
    // Use a fresh DatabaseManager for each test so the openMap is empty.
    dbs = new DatabaseManager(harness.sqlite3)
    dbs.configure({ vfsName: harness.vfs.name, capability: 'memory' })
    snapshots = new SnapshotManager({
      dbs,
      sqlite3: harness.sqlite3,
      io: new MemoryVfsIO(harness.vfs),
      policy: { maxPerDatabase: 3, maxGlobalBytes: 1024 * 1024, autoPrune: true },
    })
  })

  /* ------------------------------------------------------------------ *
   *  Round-trip                                                         *
   * ------------------------------------------------------------------ */

  it('captures a snapshot and restores it back to identical data', async () => {
    // 1. Create DB + 10 rows.
    const db = await makeDb(
      harness,
      DB_FILENAME,
      `CREATE TABLE t(x INTEGER PRIMARY KEY, label TEXT);
       INSERT INTO t(x,label) VALUES
         (1,'a'),(2,'b'),(3,'c'),(4,'d'),(5,'e'),
         (6,'f'),(7,'g'),(8,'h'),(9,'i'),(10,'j');`,
    )
    await dbs.open(DB_ID, DB_FILENAME, 'readwrite')
    dbs.refreshSize(DB_ID) // best-effort, no await

    // 2. Capture.
    const meta = await snapshots.capture(DB_ID, 'baseline', 'auto')
    expect(meta.dbId).toBe(DB_ID)
    expect(meta.label).toBe('baseline')
    expect(meta.reason).toBe('auto')
    expect(meta.sizeBytes).toBeGreaterThan(0)
    expect(meta.id).toMatch(/^snap-\d+-/)

    // 3. Mutate the DB.
    await harness.sqlite3.exec(db, `INSERT INTO t(x,label) VALUES (11,'k'),(12,'l');`)
    let count = (await harness.sqlite3.execWithParams(db, 'SELECT COUNT(*) FROM t;')).rows[0]?.[0]
    expect(count).toBe(12)

    // 4. Restore.
    await snapshots.restore(DB_ID, meta.id)
    const restoredDb = dbs.get(DB_ID).db
    count = (await harness.sqlite3.execWithParams(restoredDb, 'SELECT COUNT(*) FROM t;')).rows[0]?.[0]
    expect(count).toBe(10)

    // 5. Spot-check a row to confirm the data, not just the count.
    const rows = await harness.sqlite3.execWithParams(
      restoredDb,
      'SELECT x, label FROM t ORDER BY x;',
    )
    expect(rows.rows).toEqual([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
      [4, 'd'],
      [5, 'e'],
      [6, 'f'],
      [7, 'g'],
      [8, 'h'],
      [9, 'i'],
      [10, 'j'],
    ])

    await harness.close(db)
  }, 30_000)

  it('lists snapshots in chronological order and includes the correct metadata', async () => {
    const db = await makeDb(
      harness,
      DB_FILENAME,
      `CREATE TABLE t(x INTEGER); INSERT INTO t(x) VALUES (1);`,
    )
    await dbs.open(DB_ID, DB_FILENAME, 'readwrite')

    const a = await snapshots.capture(DB_ID, 'A', 'auto')
    await new Promise((r) => setTimeout(r, 5))
    const b = await snapshots.capture(DB_ID, 'B', 'manual')
    await new Promise((r) => setTimeout(r, 5))
    const c = await snapshots.capture(DB_ID, 'C', 'pre-destructive')

    const list = await snapshots.list(DB_ID)
    expect(list).toHaveLength(3)
    expect(list.map((m) => m.id)).toEqual([a.id, b.id, c.id])
    expect(list.map((m) => m.label)).toEqual(['A', 'B', 'C'])
    expect(list.map((m) => m.reason)).toEqual(['auto', 'manual', 'pre-destructive'])
    // createdAt strictly increasing
    expect(list[1]!.createdAt).toBeGreaterThan(list[0]!.createdAt)
    expect(list[2]!.createdAt).toBeGreaterThan(list[1]!.createdAt)

    await harness.close(db)
  }, 30_000)

  it('deletes a snapshot and removes the file from the VFS', async () => {
    const db = await makeDb(
      harness,
      DB_FILENAME,
      `CREATE TABLE t(x INTEGER); INSERT INTO t(x) VALUES (1);`,
    )
    await dbs.open(DB_ID, DB_FILENAME, 'readwrite')
    const meta = await snapshots.capture(DB_ID, 'to-delete', 'manual')
    const expectedPath = `.snapshots/${DB_ID}/${meta.id}.db`
    expect(harness.vfs.mapNameToFile.has(expectedPath)).toBe(true)

    await snapshots.delete(DB_ID, meta.id)
    expect(harness.vfs.mapNameToFile.has(expectedPath)).toBe(false)
    expect(await snapshots.list(DB_ID)).toHaveLength(0)

    await harness.close(db)
  }, 30_000)

  it('delete() is a no-op when the snapshot does not exist', async () => {
    const db = await makeDb(
      harness,
      DB_FILENAME,
      `CREATE TABLE t(x INTEGER);`,
    )
    await dbs.open(DB_ID, DB_FILENAME, 'readwrite')
    await expect(snapshots.delete(DB_ID, 'snap-does-not-exist')).resolves.toBeUndefined()

    await harness.close(db)
  }, 30_000)

  it('restore() throws SnapshotNotFoundError for unknown snapshots', async () => {
    const db = await makeDb(
      harness,
      DB_FILENAME,
      `CREATE TABLE t(x INTEGER);`,
    )
    await dbs.open(DB_ID, DB_FILENAME, 'readwrite')
    await expect(snapshots.restore(DB_ID, 'snap-missing')).rejects.toBeInstanceOf(SnapshotNotFoundError)

    await harness.close(db)
  }, 30_000)

  /* ------------------------------------------------------------------ *
   *  LRU + global policies                                              *
   * ------------------------------------------------------------------ */

  it('enforces the per-database LRU cap (oldest first)', async () => {
    const db = await makeDb(
      harness,
      DB_FILENAME,
      `CREATE TABLE t(x INTEGER); INSERT INTO t(x) VALUES (1);`,
    )
    await dbs.open(DB_ID, DB_FILENAME, 'readwrite')

    // Capture 4 snapshots — maxPerDatabase is 3, so the oldest one
    // must be evicted.
    const a = await snapshots.capture(DB_ID, 'A', 'auto')
    await new Promise((r) => setTimeout(r, 5))
    const b = await snapshots.capture(DB_ID, 'B', 'auto')
    await new Promise((r) => setTimeout(r, 5))
    const c = await snapshots.capture(DB_ID, 'C', 'auto')
    await new Promise((r) => setTimeout(r, 5))
    const d = await snapshots.capture(DB_ID, 'D', 'auto')

    const list = await snapshots.list(DB_ID)
    expect(list.map((m) => m.id)).toEqual([b.id, c.id, d.id])
    expect(list.map((m) => m.id)).not.toContain(a.id)
    // And the file was actually deleted from the VFS.
    expect(harness.vfs.mapNameToFile.has(`.snapshots/${DB_ID}/${a.id}.db`)).toBe(false)

    await harness.close(db)
  }, 30_000)

  it('enforces the global byte cap across databases', async () => {
    // Use a tighter cap so the test is fast.
    snapshots = new SnapshotManager({
      dbs,
      sqlite3: harness.sqlite3,
      io: new MemoryVfsIO(harness.vfs),
      policy: { maxPerDatabase: 100, maxGlobalBytes: 2_000, autoPrune: true },
    })

    const db1 = await makeDb(
      harness,
      'db1.db',
      `CREATE TABLE t(x INTEGER); INSERT INTO t(x) VALUES (1);`,
    )
    const db2 = await makeDb(
      harness,
      'db2.db',
      `CREATE TABLE t(x INTEGER); INSERT INTO t(x) VALUES (2);`,
    )
    await dbs.open(1, 'db1.db', 'readwrite')
    await dbs.open(2, 'db2.db', 'readwrite')

    // Each capture generates a 4 KB-page database, well over the 2 KB cap.
    await snapshots.capture(1, 'A', 'auto')
    const firstBytes = harness.totalBytes()
    expect(firstBytes).toBeGreaterThan(2_000)

    // Second capture triggers global prune; expect at least one eviction.
    const r = await snapshots.capture(2, 'B', 'auto')
    void r
    expect(snapshots.totalBytes()).toBeLessThanOrEqual(2_000)

    await harness.close(db1)
    await harness.close(db2)
  }, 30_000)

  it('prune(dbId) returns the evicted entries for telemetry', async () => {
    // Disable autoPrune so the captures below do not trigger eviction;
    // we want the manual `prune()` call to do the work.
    snapshots = new SnapshotManager({
      dbs,
      sqlite3: harness.sqlite3,
      io: new MemoryVfsIO(harness.vfs),
      policy: { maxPerDatabase: 3, maxGlobalBytes: 1024 * 1024, autoPrune: false },
    })

    const db = await makeDb(
      harness,
      DB_FILENAME,
      `CREATE TABLE t(x INTEGER);`,
    )
    await dbs.open(DB_ID, DB_FILENAME, 'readwrite')

    for (let i = 0; i < 5; i += 1) {
      await snapshots.capture(DB_ID, `S${i}`, 'auto')
      // tiny delay so createdAt is unique even with low-resolution clocks
      await new Promise((r) => setTimeout(r, 2))
    }
    expect((await snapshots.list(DB_ID)).length).toBe(5)
    const { evicted, bytesReclaimed } = await snapshots.prune(DB_ID)
    expect(evicted.length).toBe(2) // 5 - 3 = 2 evicted
    expect(bytesReclaimed).toBeGreaterThan(0)
    expect((await snapshots.list(DB_ID)).length).toBe(3)

    await harness.close(db)
  }, 30_000)

  /* ------------------------------------------------------------------ *
   *  Lazy VFS priming                                                   *
   * ------------------------------------------------------------------ */

  it('lazy-primes metadata from the VFS for snapshots taken by a previous session', async () => {
    const db = await makeDb(
      harness,
      DB_FILENAME,
      `CREATE TABLE t(x INTEGER); INSERT INTO t(x) VALUES (1);`,
    )
    await dbs.open(DB_ID, DB_FILENAME, 'readwrite')
    const meta = await snapshots.capture(DB_ID, 'persisted', 'auto')
    const expectedPath = `.snapshots/${DB_ID}/${meta.id}.db`

    // Build a fresh SnapshotManager and confirm the metadata is
    // re-discovered from the VFS (simulating a worker restart).
    const fresh = new SnapshotManager({
      dbs,
      sqlite3: harness.sqlite3,
      io: new MemoryVfsIO(harness.vfs),
    })
    const list = await fresh.list(DB_ID)
    expect(list).toHaveLength(1)
    expect(list[0]!.id).toBe(meta.id)
    expect(list[0]!.sizeBytes).toBeGreaterThan(0)
    expect(harness.vfs.mapNameToFile.has(expectedPath)).toBe(true)

    await harness.close(db)
  }, 30_000)
})
