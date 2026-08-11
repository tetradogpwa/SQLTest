/**
 * Tests for `SettingsStore` — the typed facade over the `settings`
 * Dexie table. Covers the basic CRUD plus the pub/sub contract and
 * the default-fallback behaviour.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS, SettingsStore } from '../../../src/core/persistence/settings'
import type { SqlAcademyDB } from '../../../src/core/persistence/dexie'
import { createTestDb, resetTestDb } from '../../helpers/dexie-helper'

describe('SettingsStore', () => {
  let db: SqlAcademyDB
  let store: SettingsStore

  beforeEach(async () => {
    db = createTestDb()
    store = new SettingsStore(db)
  })

  afterEach(async () => {
    await resetTestDb(db)
  })

  /* ------------------------------------------------------------------ *
   *  get / set / getAll                                                 *
   * ------------------------------------------------------------------ */

  describe('get / set / getAll', () => {
    it('returns the default value for a key that was never set', async () => {
      const theme = await store.get('theme')
      expect(theme).toBe(DEFAULT_SETTINGS.theme)
    })

    it('round-trips a single key', async () => {
      await store.set('theme', 'dark')
      expect(await store.get('theme')).toBe('dark')
    })

    it('does not clobber unrelated keys when one is updated', async () => {
      await store.set('theme', 'dark')
      await store.set('fontSize', 'lg')
      expect(await store.get('theme')).toBe('dark')
      expect(await store.get('fontSize')).toBe('lg')
    })

    it('getAll returns a complete Settings object filled from defaults', async () => {
      const all = await store.getAll()
      expect(all).toEqual(DEFAULT_SETTINGS)
    })

    it('getAll reflects the latest writes', async () => {
      await store.set('theme', 'light')
      await store.set('autoSaveDrafts', false)
      const all = await store.getAll()
      expect(all.theme).toBe('light')
      expect(all.autoSaveDrafts).toBe(false)
      // Untouched keys still come from the defaults.
      expect(all.fontSize).toBe(DEFAULT_SETTINGS.fontSize)
    })

    it('accepts a null defaultDatabase', async () => {
      // Explicitly write null — Dexie indexes keys by string but the
      // value is `null`, which the type system must accept.
      await store.set('defaultDatabase', null)
      expect(await store.get('defaultDatabase')).toBeNull()
    })
  })

  /* ------------------------------------------------------------------ *
   *  resetAll                                                            *
   * ------------------------------------------------------------------ */

  describe('resetAll', () => {
    it('clears every row and re-inserts the defaults', async () => {
      await store.set('theme', 'dark')
      await store.set('fontSize', 'lg')
      await store.resetAll()
      const all = await store.getAll()
      expect(all).toEqual(DEFAULT_SETTINGS)
      // And the value of an individual key is the default again.
      expect(await store.get('theme')).toBe(DEFAULT_SETTINGS.theme)
    })
  })

  /* ------------------------------------------------------------------ *
   *  subscribe                                                            *
   * ------------------------------------------------------------------ */

  describe('subscribe', () => {
    it('fires after a write commits', async () => {
      const seen: Array<{ theme: string }> = []
      const unsub = store.subscribe((snapshot) => seen.push({ theme: snapshot.theme }))
      await store.set('theme', 'dark')
      // Dexie hooks fire synchronously after the commit, but the
      // callback re-reads via `getAll()` so we need a microtask to
      // resolve the read.
      await new Promise((r) => setTimeout(r, 0))
      expect(seen.length).toBeGreaterThan(0)
      expect(seen.at(-1)?.theme).toBe('dark')
      unsub()
    })

    it('stops firing once the unsubscribe is called', async () => {
      let count = 0
      const unsub = store.subscribe(() => {
        count += 1
      })
      await store.set('theme', 'light')
      await new Promise((r) => setTimeout(r, 0))
      const afterFirst = count
      unsub()
      await store.set('theme', 'dark')
      await new Promise((r) => setTimeout(r, 0))
      expect(count).toBe(afterFirst)
    })
  })
})

// Local import to keep `afterEach` scoped to vitest (avoid a top-level
// dependency on the testing API in the source file).
import { afterEach } from 'vitest'
