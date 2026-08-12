# AGENTS.md

> Compact instructions for OpenCode sessions. High-signal only. If something is obvious from filenames or framework defaults, it is omitted.

## Project in one paragraph

SQL Academy PWA. Spanish-language SQL course running 100% in the browser via `wa-sqlite` (WASM). Stack: **Vite 8 + React 19 + TypeScript 6 + wa-sqlite 1.0 + CodeMirror 6 + Dexie 4 + Comlink 4 + vite-plugin-pwa**. SQLite lives in a single dedicated Web Worker (`src/workers/sqlite.worker.ts`) exposed to the Main Thread as a typed `DBAPI` via Comlink. The Main Thread owns all Dexie writes — the Worker never touches Dexie directly. Drafts, progress, query history, and snapshots are persisted in Dexie.

## Commands

```bash
npm install
npm start               # vite dev server at http://localhost:5173
npm run typecheck       # tsc --noEmit -p tsconfig.app.json   (NOT the root tsconfig)
npm run test            # vitest run (full suite, ~60s budget)
npm run test:watch      # vitest watch
npm run test:ui         # vitest --ui
npm run lint            # oxlint (no ESLint, no Prettier)
npm run build           # runs `prebuild` (sync-wa-sqlite.mjs) → `tsc -b` → `vite build`
npm run preview         # serve dist/ locally
npm run sync:wasm       # copy wa-sqlite*.wasm from node_modules into public/
```

**Pre-PR order:** `npm run typecheck && npm run lint && npm run test && npm run build`.

## Layout (entry points)

- `src/main.tsx` — React bootstrap. Runs a synchronous FOUC-blocking theme read from `localStorage` before mounting. **Do not bypass this** — the app flashes light/dark otherwise.
- `src/router.tsx` — `react-router-dom` v7 `createBrowserRouter`. Course sub-routes are nested under `/course` so the sidebar stays mounted.
- `src/workers/sqlite.worker.ts` — Worker entry. Boots wa-sqlite, picks the best VFS, constructs `DBAPI`, exposes via Comlink.
- `src/workers/dbapi.ts` — Public façade. Sub-managers (`SnapshotManager`, `SchemaManager`, `ImportExportManager`) are wired in `sqlite.worker.ts`; missing ones throw `NotImplemented*` here.
- `src/core/exercises/` — Exercise engine: `validator`, `runner`, `hint-engine`, `error-pattern-detector`, `strategies/*` (11 strategies). Barrel is `src/core/exercises/index.ts`.
- `src/core/persistence/` — Dexie stores + `PersistenceService` singleton (the Worker→Main bridge). Barrel is `src/core/persistence/index.ts`.
- `src/hooks/useDatabase.ts` — Singleton Comlink wrapper + active-`dbId` state + crash recovery. **All UI calls to the Worker go through this hook** (or its siblings `useQuery`, `useSchema`, `useExercise`).
- `src/content/` — Course content: 4 seed DBs (`databases/`), 16 lessons across 4 files (`lessons/`), `loaders.ts`, `glossary.ts`, `study-guide.ts`, `stats.ts`, `i18n` dictionaries.
- `src/ui/` — React tree (pages + components per feature folder).
- `pocs/` — Original proof-of-concept pages. Still mounted at `/poc/3` and `/poc/6` via `src/router.tsx`. Tests in `pocs/**/*.test.ts` are also picked up by vitest.
- `docs/reports/*.md` — Per-phase architecture notes. Read these before touching the matching module instead of guessing. (Moved from `*-REPORT.md` in the root; same content, new path.)
- `PROJECT_PLAN.md` — Estado activo del proyecto + roadmap. Source of truth para "qué falta".
- `roadmap.md` — Pending work (Fases 9–14). Current scope ends at Fase 8.

## wa-sqlite 1.0 quirks (these will bite you)

- **`OPFSCoopSyncVFS` does not exist** in wa-sqlite 1.0.0. The actual names are `AccessHandlePoolVFS` (sync OPFS), `OriginPrivateFileSystemVFS` (async OPFS), `IDBBatchAtomicVFS`, `MemoryVFS`. The Worker tries them in that order (`sqlite.worker.ts:155-185`).
- **`sqlite3_serialize` is not exported** — snapshots use `VACUUM INTO '<temp-path>'` (see `src/workers/snapshot-manager.ts`).
- **`sqlite3_interrupt` is not in the WASM build** — `TimeoutController` uses `sqlite3_progress_handler(db, 1000, callback)` and checks elapsed time on each tick (`src/workers/timeout-controller.ts`).
- **WASM must be excluded from `optimizeDeps`** — already done in `vite.config.ts` (`exclude: ['@sqlite.org/sqlite-wasm', 'wa-sqlite']`). Do not undo this; pre-bundling corrupts the binary and breaks the Worker import.
- **WASM resolution uses `?url` + `import.meta.url`** — production assets come from `public/wa-sqlite.wasm`, copied by `scripts/sync-wa-sqlite.mjs` (wired as `prebuild`).
- **No upstream `.d.ts`** for wa-sqlite — imports use `@ts-expect-error`. Don't "fix" these.
- **VFS choice is reflected in `InitResult.capability`** (`'opfs-sync' | 'opfs-async' | 'idb' | 'memory'`) — surface this in UI; the `idb` and `memory` paths degrade byte access.

## Worker ↔ Main Thread contract

- **DBAPI is the only public surface.** See `src/workers/types.ts` and `src/workers/dbapi.ts:96`.
- **Only the Main Thread writes Dexie.** The Worker emits `PersistenceMessage`s (`src/core/persistence/persistence-service.ts:65`) via Comlink; `PersistenceService.handleMessage` applies them to the right store. Never reach into Dexie from a Worker module.
- **One Worker per session** — singleton inside `useDatabase`. On crash it is recreated and previously opened DBs are re-opened from the bookkeeping map (`MAX_RECOVERY_ATTEMPTS = 3`).
- **Exercise working-copies live in `OPFS/exercises/{exerciseId}/{sessionId}-{kind}.sqlite3`**, user DBs in `OPFS/user/...`, snapshots in `.snapshots/<dbId>/<snapId>.db`. The Runner is ephemeral; the Playground is persistent.
- **The Runner never writes Dexie.** UI is responsible for `progressStore` / `exerciseStats` after `check()`.

## Tests

- vitest 2.x + happy-dom + `@testing-library/react`. Config at `vitest.config.ts`.
- `tests/setup.ts` installs `@testing-library/jest-dom/vitest` and `fake-indexeddb/auto`. Without the fake IDB shim, Dexie throws inside happy-dom.
- `pool: 'forks'` — each test file gets a fresh module graph so wa-sqlite WASM state is not shared across files.
- `testTimeout: 60_000` — POC tests load a 558 KB WASM. Don't lower this; the WASM-harness tests need it.
- **Use `tests/helpers/dexie-helper.ts`** (`createTestDb`, `resetTestDb`) — the fake IDB is shared across the worker and accumulates rows otherwise.
- **Use `tests/helpers/dbapi-mock.ts`** (`mkApiMock`) for component/hook tests — the real `DBApi` types are too strict for `vi.fn(async () => ...)` inference.
- **Use `tests/helpers/wa-sqlite-harness.ts`** (`loadHarness`) for storage-manager tests that need a real `VACUUM INTO` round-trip. The harness caches across tests; call `harness.reset()` between tests.
- Run a single file: `npx vitest run tests/unit/exercises/runner.test.ts`.
- Run a single test by name: `npx vitest run -t "captures snapshot"`.
- Test discovery includes `pocs/**/*.test.{ts,tsx}` — keep POC tests green.

## TypeScript / lint gotchas

- `tsconfig.app.json` is strict: `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`, `noUnusedParameters`. **`verbatimModuleSyntax` means type-only imports must be explicit** (`import type { ... }`).
- `npm run typecheck` only runs `tsconfig.app.json` (not the composite root). `npm run build` runs the full `tsc -b` (composite).
- `noUncheckedIndexedAccess` makes every `arr[i]` `T | undefined` — guard or use `.at()` deliberately.
- `erasableSyntaxOnly` means no enums, no namespaces, no parameter properties on classes.
- oxlint rules in `.oxlintrc.json`: `react/rules-of-hooks` (error), `react/only-export-components` (warn, `allowConstantExport: true`). No auto-fix; run `npm run lint` and resolve manually.

## Conventions

- **All UI text is in Spanish.** Add new strings via `src/core/i18n/i18n.ts` (only `es` is complete; `en` is partial). Use `useT('domain.subject')` from the i18n module.
- **Components are React function components**. Hooks-only files are allowed but `react/only-export-components` warns on mixed exports (constants OK).
- **CSS Modules** for component styles (`*.module.css` next to `*.tsx`); global tokens in `src/ui/styles/{reset,tokens,global}.css`.
- **No `any` without a `// @ts-expect-error` + reason** — we have many of these on wa-sqlite imports; don't refactor them away.
- **Path aliases**: none. Use relative paths (`../foo`).
- **New code under `src/core/exercises/strategies/`** must register itself in `src/core/exercises/strategies/index.ts` (the `defaultStrategies` registry).
- **Adding a lesson**: append to the matching `src/content/lessons/<db>.ts` and import from `src/content/index.ts`. Run `npm run test:unit content/` to validate. The `course-shape.test.ts` enforces the schema.

## Things to verify before committing

- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm run test` passes (full suite, ~60s).
- `npm run build` produces a green build and `git diff public/wa-sqlite*.wasm` is empty (or only idempotent on a fresh `node_modules`).
- New worker calls flow through `useDatabase`/`useQuery`/`useExercise` — no direct `new Worker(...)` from UI code.
- New Dexie writes only from Main Thread.
</content>
</invoke>