/**
 * useBuildInfo — exposes the build-time constants declared in
 * `vite.config.ts` (`__APP_VERSION__`, `__APP_BUILD_ID__`).
 *
 * Both are simple string snapshots; the hook is just a stable import
 * surface for the rest of the app so a future migration (e.g. to a
 * `<Suspense>`-friendly async source) does not require touching the
 * consumers.
 */
export interface BuildInfo {
  version: string
  buildId: string
  /** Convenience: ISO-formatted build timestamp, derived from `buildId`. */
  builtAt: string
}

export function useBuildInfo(): BuildInfo {
  const version: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
  const buildId: string = typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : ''
  return {
    version,
    buildId,
    builtAt: buildId,
  }
}

export default useBuildInfo
