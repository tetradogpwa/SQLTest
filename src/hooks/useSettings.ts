/**
 * useSettings — reactive view on top of the `settings` store.
 *
 * The hook subscribes to the `SettingsStore.subscribe` callback so
 * every change made through `settings.set(...)` (or via
 * `resetAll()`) propagates to the React tree without manual
 * notifications.
 *
 * Usage
 * -----
 * ```tsx
 * const { fontSize, setFontSize, resetAll } = useSettings()
 * ```
 *
 * The returned `set` is **partial**: pass only the keys you want to
 * update; the rest of the snapshot is preserved on disk. Internally
 * it issues a single `settings.set` per key, which keeps the
 * notification fan-out cheap.
 *
 * `loading` is `true` while the initial snapshot is being read from
 * Dexie. We use it to render a skeleton / disable controls until the
 * first real values arrive.
 */
import { useCallback, useEffect, useState } from 'react'

import { settings, DEFAULT_SETTINGS } from '../core/persistence/settings'
import type { Settings } from '../core/persistence'

export interface UseSettingsResult {
  /** Current snapshot. Defaults to `DEFAULT_SETTINGS` until hydrated. */
  values: Settings
  /** `true` while the initial snapshot is being read from Dexie. */
  loading: boolean
  /** Update one or more keys. Each key is persisted individually. */
  set: <K extends keyof Settings>(patch: Partial<Pick<Settings, K>>) => Promise<void>
  /** Drop every row + re-insert the defaults. */
  resetAll: () => Promise<void>
}

/**
 * Re-implementation of the generic `Pick` helper that keeps the
 * keys distinct. The standard `Partial<Pick<Settings, K>>` does not
 * help TypeScript narrow the values, so we define our own.
 */
type SettingsPatch<K extends keyof Settings> = { [P in K]?: Settings[P] }

export function useSettings(): UseSettingsResult {
  const [values, setValues] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | null = null

    void (async () => {
      try {
        const snapshot = await settings.getAll()
        if (cancelled) return
        setValues(snapshot)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[useSettings] failed to read snapshot:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }

      unsubscribe = settings.subscribe((snapshot) => {
        if (cancelled) return
        setValues(snapshot)
      })
    })()

    return () => {
      cancelled = true
      if (unsubscribe) unsubscribe()
    }
  }, [])

  const set = useCallback(
    async <K extends keyof Settings>(patch: SettingsPatch<K>): Promise<void> => {
      const entries = Object.entries(patch) as Array<[K, Settings[K]]>
      for (const [key, value] of entries) {
        await settings.set(key, value)
      }
    },
    [],
  )

  const resetAll = useCallback(async (): Promise<void> => {
    await settings.resetAll()
  }, [])

  return { values, loading, set, resetAll }
}

export default useSettings
