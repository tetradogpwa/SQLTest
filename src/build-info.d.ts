/**
 * Build-time constants injected by `vite.config.ts` via `define`.
 *
 * These are replaced at build time with the literal JSON string the
 * `define` option set, so the runtime cost is zero and the values are
 * always available in dev (`Vite` substitutes them with the matching
 * `process.env` value at request time).
 */
declare const __APP_VERSION__: string
declare const __APP_BUILD_ID__: string
