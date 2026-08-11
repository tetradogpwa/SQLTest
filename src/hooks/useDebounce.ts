/**
 * Generic debounce hook.
 *
 * Returns a value that only updates after `delayMs` milliseconds of
 * inactivity. Useful for backing autocomplete / search inputs without
 * recomputing on every keystroke.
 *
 * The hook is purely client-side: it does not run on the server. If
 * `value` becomes stable again before the timer fires, the pending
 * update is dropped.
 *
 * Example
 * -------
 * ```ts
 * const debouncedQuery = useDebounce(query, 200)
 * useEffect(() => { fetchSuggestions(debouncedQuery) }, [debouncedQuery])
 * ```
 */
import { useEffect, useState } from 'react'

export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value)

  useEffect(() => {
    if (delayMs <= 0) {
      setDebounced(value)
      return undefined
    }
    const handle = setTimeout(() => {
      setDebounced(value)
    }, delayMs)
    return () => {
      clearTimeout(handle)
    }
  }, [value, delayMs])

  return debounced
}
