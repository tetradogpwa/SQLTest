/**
 * Settings store.
 *
 * The `settings` table is a generic key-value bag; this class is the
 * *typed* facade on top of it. It is the only place in the app that
 * knows about the `Settings` interface — everywhere else reads/writes
 * via the `settings` singleton.
 *
 * Design notes:
 *
 *  - `getAll()` always returns a full `Settings` object. Missing rows
 *    are silently filled from `DEFAULT_SETTINGS`, so a fresh install
 *    (where the `settings` table is empty) behaves as if the defaults
 *    had been seeded.
 *
 *  - `set(key, value)` writes a single row. Other readers that use
 *    Dexie's live queries (`useLiveQuery`) re-render automatically —
 *    no manual `subscribe` plumbing needed for React.
 *
 *  - `subscribe(callback)` is provided for non-React consumers (the
 *    `PersistenceService`, a future `pub/sub` bridge, etc.).
 *
 *  - The `db` is injectable so unit tests can pass their own
 *    `SqlAcademyDB` instance (see `tests/helpers/dexie-helper.ts`).
 *
 * Notification semantics
 * ----------------------
 *
 * We **do not** use Dexie's `hook('creating' | 'updating' | 'deleting')`
 * events for the pub/sub. Those hooks fire *inside* the IDB
 * transaction (before the write is committed), so any subsequent
 * `getAll()` would read stale data. Instead, every public mutator
 * (`set`, `resetAll`) explicitly calls `this.notify()` *after* the
 * `await` resolves. This guarantees the snapshot the listener
 * receives reflects the just-committed state.
 *
 * The trade-off is that mutations that bypass the store (e.g. another
 * module doing `db.settings.put(...)` directly) will *not* trigger
 * the subscribers. That is acceptable: the public contract is
 * "mutate via the store, listen via `subscribe()`".
 */

import type { SqlAcademyDB } from './dexie'
import { db as defaultDb } from './dexie'
import type { Settings } from './types'

/** Hard-coded defaults — single source of truth for first-run UX. */
export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  fontSize: 'md',
  sqlDialect: 'sqlite',
  reducedMotion: false,
  autoSaveDrafts: true,
  defaultDatabase: null,
  firstRunCompleted: false,
  sidebarCollapsed: false,
}

export type SettingsListener = (snapshot: Settings) => void
export type Unsubscribe = () => void

export class SettingsStore {
  private readonly db: SqlAcademyDB
  private readonly listeners: Set<SettingsListener> = new Set()

  constructor(dbInstance: SqlAcademyDB = defaultDb) {
    this.db = dbInstance
  }

  /**
   * Read a single key. Falls back to the default if the row was never
   * written — this makes the function safe to call before any
   * `set()` ever happens.
   */
  async get<K extends keyof Settings>(key: K): Promise<Settings[K]> {
    const row = await this.db.settings.get(key)
    if (row) {
      // The primary key matches the requested setting key by design
      // (`settings: 'key'`). The row was written by `set()` which is
      // generic over `K extends keyof Settings`, so the value's type
      // is what the caller asked for.
      return row.value as Settings[K]
    }
    return DEFAULT_SETTINGS[key]
  }

  /**
   * Persist a single key. The write is awaited so callers can
   * `await settings.set('theme', 'dark')` and be sure the row
   * committed before the next line runs. Every successful `set`
   * also notifies the subscribers.
   */
  async set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    await this.db.settings.put({ key, value })
    await this.notify()
  }

  /**
   * Read the full settings object, materialising missing keys from the
   * defaults. Always returns a complete `Settings` — never `Partial`.
   */
  async getAll(): Promise<Settings> {
    const rows = await this.db.settings.toArray()
    const out: Settings = { ...DEFAULT_SETTINGS }
    for (const row of rows) {
      // We accept only keys known to the Settings interface; this
      // defends against stale rows from an older schema version that
      // we no longer recognise.
      if (row.key in DEFAULT_SETTINGS) {
        // The cast is safe because the row was written by `set()`
        // which is generic over `K extends keyof Settings`. The
        // double cast through `unknown` is required because `Settings`
        // is a strict interface without an index signature.
        ;(out as unknown as Record<string, unknown>)[row.key] = row.value
      }
    }
    return out
  }

  /**
   * Remove every row and re-insert the defaults atomically. Used by
   * the "Restore defaults" button in the settings page.
   */
  async resetAll(): Promise<void> {
    await this.db.transaction('rw', this.db.settings, async () => {
      await this.db.settings.clear()
      const rows = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({
        key,
        value,
      }))
      await this.db.settings.bulkAdd(rows)
    })
    await this.notify()
  }

  /**
   * Subscribe to *all* changes in the `settings` table. The callback
   * receives a freshly-read `Settings` snapshot so consumers do not
   * have to recompute the defaults themselves.
   *
   * Returns an `Unsubscribe` function — call it to detach the listener.
   * Multiple subscribers are supported; the underlying `Set` keeps
   * the iteration order deterministic.
   */
  subscribe(callback: SettingsListener): Unsubscribe {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }

  /**
   * Fan-out a snapshot to every listener. Called by `set` and
   * `resetAll` after the underlying write commits. Errors thrown by a
   * listener are caught and reported via `console.error` so a single
   * buggy subscriber cannot break the others.
   */
  private async notify(): Promise<void> {
    if (this.listeners.size === 0) return
    const snapshot = await this.getAll()
    for (const listener of this.listeners) {
      try {
        listener(snapshot)
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[settings] listener threw:', e)
      }
    }
  }
}

export const settings = new SettingsStore()
