# Fase 5 — Editor SQL + DBExplorer + ResultsTable

**Status**: ✅ SHIPPED
**Date**: 2026-08-10
**Author**: Coder (Coder track) + Mavis (verification + integration)

## Goal

Build the SQL editor stack: a CodeMirror 6 editor wired to the live SQLite
Worker, an interactive DB explorer, a result table with virtualisation and
sort, and an error banner with "did-you-mean" suggestions. Everything is
bootstrapped through React hooks that talk to the Worker via Comlink.

## What landed

### Hooks (4 files, ~970 lines)

| File | Purpose |
|---|---|
| `src/hooks/useDatabase.ts` | Singleton Worker wrapper (485 LOC). Boots the dedicated Worker, exposes a `DBApi` façade, recovers from Worker crashes by re-opening databases from the bookkeeping map. Exports a `__resetDatabaseSession()` helper for tests. |
| `src/hooks/useQuery.ts` | `run(sql)` / `result` / `error` / `history` (313 LOC). Persists the last 200 queries to Dexie, dedupes the history, caps entries to `MAX_HISTORY_ENTRIES`, and surfaces `SerializedError` to the UI. |
| `src/hooks/useSchema.ts` | Reactive schema (141 LOC). 5-minute TTL cache, de-duplicated inflight fetches, manual `refresh()` and `invalidate()` paths. |
| `src/hooks/useDebounce.ts` | Generic debounce (38 LOC). Used to back the schema-fed autocomplete. |

### Editor (2 files, ~430 lines)

| File | Purpose |
|---|---|
| `src/ui/components/editor/SqlEditor.tsx` | CodeMirror 6 host (283 LOC). Loaded with the SQL language pack, the `oneDark` theme, a custom keymap (`Ctrl/Cmd+Enter` to run), an editor ref handle for parent-driven actions, and an `onReady` hook for tests. |
| `src/ui/components/editor/sql-completions.ts` | `makeSqlCompletions(schema)` autocompletion source (290 LOC). Emits keyword + table + column + sub-field completions from the live schema. The first-frame latency is well under the 50 ms budget (see latency test below). |

### Results (2 files, ~540 lines)

| File | Purpose |
|---|---|
| `src/ui/components/results/ResultsTable.tsx` | Virtualised result grid (375 LOC). NULLs rendered as italic `NULL` badges; cells truncated to 200 chars with a `title` tooltip for the full value; sort by column header (asc → desc → unsorted); hand-rolled windowing for >100 rows; "Resultado truncado" banner when `truncated === true`. |
| `src/ui/components/results/ErrorBanner.tsx` | Pedagogical error display (170 LOC). Title + offending token + hints + Levenshtein-≤2 "did-you-mean" suggestions (table or column pool). Toggles the raw `error.message` for bug reports. |

### Schema (3 files, ~580 lines)

| File | Purpose |
|---|---|
| `src/ui/components/schema/DbExplorer.tsx` | Tree view of tables + views (316 LOC). Search box, loading / empty / error states, per-item test-ids, re-introspect button. |
| `src/ui/components/schema/TableDefinition.tsx` | Full table definition (210 LOC). Columns (PK-first), foreign keys, unique + check constraints, collapsible DDL block, optional `onInsertColumn` callback to push a column name into the editor. |
| `src/ui/components/schema/schema.module.css` | Styles. |

### Playground integration (`src/ui/pages/PlaygroundPage.tsx`, 391 LOC)

Wires the editor + explorer + results + history sidebars into a single
page. Boots the Worker through `useDatabase`, auto-opens a `playground`
seed (with `users` + `orders` tables) on first mount, re-introspects
the schema after any DDL run, and surfaces `Ctrl+Enter` to execute
whatever the editor has.

## Verification

### Unit + integration tests (added in this phase)

| Test file | Tests | Status |
|---|---|---|
| `tests/unit/hooks/useDatabase.test.tsx` | 5 | ✅ |
| `tests/unit/hooks/useQuery.test.tsx` | 6 | ✅ |
| `tests/unit/hooks/useSchema.test.tsx` | 6 | ✅ |
| `tests/unit/hooks/useDebounce.test.tsx` | 5 | ✅ |
| `tests/unit/components/editor/SqlEditor.test.tsx` | 6 | ✅ |
| `tests/unit/components/schema/DbExplorer.test.tsx` | 7 | ✅ |
| `tests/unit/components/schema/TableDefinition.test.tsx` | 7 | ✅ |
| `tests/unit/components/results/ResultsTable.test.tsx` | 7 | ✅ |
| `tests/unit/components/results/ErrorBanner.test.tsx` | 6 | ✅ |
| `tests/unit/pages/PlaygroundPage.test.tsx` | 3 | ✅ |
| `tests/unit/codemirror-completions.test.ts` | 13 | ✅ |
| `tests/unit/codemirror-component.test.tsx` | 4 | ✅ |

**Total in this phase: 75 new tests.**

### Full suite

```
 Test Files  37 passed (37)
      Tests  323 passed (323)
   Duration  53.65s
```

### Typecheck

```
$ npx tsc --noEmit
$ echo $?
0
```

### Production build

```
$ npx vite build
✓ built in 3.12s
precache  19 entries (2617.13 KiB)
files generated
  dist/sw.js
  dist/wa-sqlite.wasm            (546 KiB)
  dist/wa-sqlite-async.wasm      (1.1 MiB)
  dist/assets/index-*.js         (900 KiB)
  dist/assets/index-*.css        (40 KiB)
```

The whole `dist/` directory weighs 6.5 MB. The PWA precache is 2.6 MB,
well within the bundle-size budget from RESEARCH §16.

### Latency measurements

```
[latency] 1000 calls in 9.00 ms → 0.0090 ms/call      (sql-completions)
[latency:10×10] 1000 calls in 32.62 ms → 0.0326 ms/call (sql-completions, big schema)
```

Both are far below the 50 ms/call budget. The autocompletion source is
called on every keystroke; even a 10-table × 10-column schema runs in
under 33 µs per call.

## Architecture notes

### Singleton Worker

`useDatabase` is a **singleton per JavaScript realm**, not a per-component
hook. All `useDatabase()` calls return the same Worker / API handle,
which is the right shape for a React tree where the editor, the explorer,
and the top bar all need to talk to the same database. The handle lives
in a module-level `session` ref so re-renders don't tear it down.

### Worker recovery

When the Worker's `'error'` event fires, `useDatabase`:
1. Sets `state.status = 'dead'`.
2. Broadcasts to all React subscribers.
3. After a debounce, calls `bootWorker()` again.
4. The new Worker re-opens every database in `state.handle.openDbs` from
   the OPFS file. No data is lost.

The recovery path was exercised in POC-4 and the unit tests cover the
singleton and re-render behaviour.

### Schema cache + invalidation

`useSchema` caches the schema for 5 minutes by default. Two ways to bust
the cache:
- `invalidate()` — call after a DDL statement. The next render fetches.
- `refresh()` — explicit user action; bypasses the TTL.

The Playground page calls `invalidate()` automatically when the result
kind is `create` / `drop` / `alter` so the explorer stays in sync.

### Error display

`ErrorBanner` ranks the suggestions by Levenshtein distance (≤ 2) and
shows the top 3. The pool of candidate names comes from the live
schema, not a static dictionary — so the suggestions stay in sync with
the user's actual database.

### Virtualisation

The result table uses a hand-rolled windowing renderer (no
`react-window` — we don't want the bundle cost). The strategy is
"absolute positioning with translateY" over the scroll container, with
a 6-row overscan. Scales to tens of thousands of rows in O(1) per
scroll event.

## Open follow-ups (next phases)

- **Fase 6** — Exercise engine: validator with the 10 strategies, hint
  engine, error pattern detector.
- **Fase 7** — Course content: 4 seed DBs (library / tienda / social /
  empresa), 16 levels, ~80–120 exercises in Spanish.
- **Fase 8** — Course UI: `CourseSidebar`, `LessonView`, `ExerciseView`,
  `HintPanel`, `SolutionPanel`, `FeedbackBanner`, `ProgressBar`.
- **Fase 9** — Playground + Databases page: import/export UI, snapshot
  UI, undo UI.
- **Fase 10** — PWA offline verification (the 19-step procedure from
  §16.1).

## Files written this phase

```
src/hooks/useDatabase.ts          (485 LOC)
src/hooks/useQuery.ts             (313 LOC)
src/hooks/useSchema.ts            (141 LOC)
src/hooks/useDebounce.ts           (38 LOC)
src/ui/components/editor/SqlEditor.tsx          (283 LOC)
src/ui/components/editor/sql-completions.ts     (290 LOC)
src/ui/components/editor/editor.module.css
src/ui/components/results/ResultsTable.tsx      (375 LOC)
src/ui/components/results/ErrorBanner.tsx       (170 LOC)
src/ui/components/results/results.module.css
src/ui/components/schema/DbExplorer.tsx         (316 LOC)
src/ui/components/schema/TableDefinition.tsx    (210 LOC)
src/ui/components/schema/schema.module.css
src/ui/pages/PlaygroundPage.tsx                 (391 LOC)
src/ui/pages/playground.module.css
tests/unit/hooks/useDatabase.test.tsx
tests/unit/hooks/useQuery.test.tsx
tests/unit/hooks/useSchema.test.tsx
tests/unit/hooks/useDebounce.test.tsx
tests/unit/components/editor/SqlEditor.test.tsx
tests/unit/components/schema/DbExplorer.test.tsx
tests/unit/components/schema/TableDefinition.test.tsx
tests/unit/components/results/ResultsTable.test.tsx
tests/unit/components/results/ErrorBanner.test.tsx
tests/unit/pages/PlaygroundPage.test.tsx
tests/unit/codemirror-completions.test.ts
tests/unit/codemirror-component.test.tsx
```

Total: ~3 100 LOC of implementation + ~75 new tests.

## VERDICT: PASS
