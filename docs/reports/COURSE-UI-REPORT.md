# Course UI Report — Phase 8.1

> Sidebar + lesson + exercise views, `useProgress` / `useExercise`
> hooks, and the new course sub-routes.

## File list + line counts

### Source (new or rewritten)

| File | Lines | Purpose |
| ---- | ----- | ------- |
| `src/hooks/useProgress.ts` | 255 | Reactive view on `progressStore` with completion maps |
| `src/hooks/useExercise.ts` | 387 | Wraps an `ExerciseRunner` for a single exercise |
| `src/ui/components/course/CourseSidebar.tsx` | 170 | Left-rail nav (4 levels, 16 lessons, 96 exercises) |
| `src/ui/components/course/CourseSidebar.module.css` | 201 | Sticky-header + independent scroll layout |
| `src/ui/components/course/LessonView.tsx` | 153 | Lesson header + objective list + exercise cards |
| `src/ui/components/course/LessonView.module.css` | 192 | Card-grid layout |
| `src/ui/components/course/ExerciseView.tsx` | 389 | The "play" page (editor + run/check/reset) |
| `src/ui/components/course/ExerciseView.module.css` | 321 | Toolbar, prompt callout, validation report |
| `src/ui/pages/CoursePage.tsx` | 57 | Rewritten: sidebar + Outlet |
| `src/ui/pages/course-page.module.css` | 32 | Two-column grid for the course shell |
| `src/ui/pages/LessonPage.tsx` | 81 | Rewritten: looks up lesson, renders LessonView |
| `src/ui/pages/ExercisePage.tsx` | 101 | Rewritten: looks up exercise + DB, renders ExerciseView |
| `src/ui/pages/LevelPage.tsx` | 84 | New tiny level overview page |
| `src/router.tsx` | 130 | Updated with the `/course/*` sub-routes |
| **Source total** | **2,553** | (under the 3 000 LOC cap) |

### Tests (new)

| File | Tests | Lines |
| ---- | ----- | ----- |
| `tests/unit/hooks/useProgress.test.tsx` | 8 | 181 |
| `tests/unit/hooks/useExercise.test.tsx` | 9 | 309 |
| `tests/unit/components/course/CourseSidebar.test.tsx` | 5 | 151 |
| `tests/unit/components/course/LessonView.test.tsx` | 4 | 120 |
| `tests/unit/components/course/ExerciseView.test.tsx` | 4 | 197 |
| **Tests total** | **30** | **958** |

**30 tests** (≥ 21 required), all passing under `npx vitest run tests/unit/`.

## Module summaries

### `useProgress` (`src/hooks/useProgress.ts`)

A reactive view on top of `progressStore` powered by `useLiveQuery`
from `dexie-react-hooks`. Returns the completed / attempted exercise
sets, the set of fully-completed lessons, and a per-level
`{done, total, pct}` map. The course is loaded once via
`loadCourse('es')` (memoised inside the loader, so the call is free
on subsequent renders) and exposed on the result so consumers don't
have to re-import the loader. `markCompleted` re-reads the
`progress` table to decide whether the lesson is now complete (it
can't rely on the React state, which is one render behind) and stamps
the lesson via `markLessonCompleted` when the last exercise is done.
`reset` wipes both tables.

### `useExercise` (`src/hooks/useExercise.ts`)

Wraps an `ExerciseRunner` for a single exercise and exposes a
`UseExerciseResult` that the view can render directly. Auto-`start()`s
on mount and `destroy()`s on unmount. Generates a fresh `sessionId`
per mount so OPFS files are isolated. The actions are: `run(sql)`,
`check()`, `revealNextHint()`, `revealSolution()`, `reset()`,
`destroy()`. `check()` writes a completion row on full pass and a
failed-attempt stat row otherwise. The hook keeps refs alongside state
for the values that change frequently (`attempts`, `lastError`,
`lastResult`, `hintsRevealed`) so the callbacks always see the latest
snapshot without forcing an extra render.

### `CourseSidebar` (`src/ui/components/course/CourseSidebar.tsx`)

Left-rail navigation. Renders 4 levels × 4 lessons × 6-7 exercises as
a vertically scrolling list. Completed exercises get a green `Check`
icon (lucide). The active exercise is highlighted with the
primary-soft background. The header (course title) is sticky; the
rest of the sidebar scrolls. Per-level progress is shown as `X / Y
ejercicios` plus a thin progress bar with the percentage as its
width. The component is **presentational** — it takes a `Course`,
`onSelectExercise`, the completed-id set, and an optional
pre-computed `completionByLevel` map. The latter lets `useProgress`
own the math (via Dexie live-query) while the sidebar stays trivially
testable with a static fixture.

### `LessonView` (`src/ui/components/course/LessonView.tsx`)

Single-lesson page. Header: breadcrumb (level + lesson order), title,
description, and a bullet list of 3-4 objectives (Spanish). Below: a
grid of `ExerciseCard`s. Each card shows the title, a type badge
(`Escribir consulta` / `Predecir resultado` / etc.), a difficulty star
row, the prompt (truncated to 2 lines), a "Completado" pill when
applicable, and a start / repeat button. The component is
presentational; the parent (`LessonPage`) supplies the navigation.

### `ExerciseView` (`src/ui/components/course/ExerciseView.tsx`)

The "play" page. Header: breadcrumb (course / lesson / exercise),
title + status badge + type badge + difficulty stars + tag pills.
Prompt: in a callout box. Toolbar: `Ejecutar` (calls `run(sql)`),
`Comprobar` (calls `check()`), and `Reiniciar ejercicio` (calls
`reset()`). Editor: the existing `SqlEditor` component. Below: an
`ErrorBanner` if the run failed, a `ResultsTable` if the run
succeeded, and a `validation-report` block listing each
`ValidationResult` with its `strategyType` (when `checkReport` is
set). A `Volver a la lección` link at the bottom. Hint / solution /
feedback panels land in 8.2.

The view owns the editor's local text and pulls `useDatabase` for
`api` / `capability` and `useExercise` for the runner lifecycle. The
type bridge (`bridge()`) casts the `Remote<DBApi>` returned by
`useDatabase` to the `core/exercises/DBApi` interface that
`useExercise` consumes — the latter is a structural subset of the
former, so the cast is safe.

### `CoursePage` (rewrite)

Renders a 2-column grid: a fixed-width `<CourseSidebar>` on the left
and a scrolling `<Outlet />` on the right. The active exercise is
read from the URL via `useParams` so the sidebar highlights whichever
exercise page is currently mounted. Clicking an exercise row
navigates to `/course/exercise/:id`.

### `LessonPage` (rewrite)

Resolves the `:lessonId` URL param against the loaded course, looks
up the lesson + level, and renders `<LessonView>`. Shows a 404
section (still inside `data-testid="lesson-page"`) when the id is
unknown. Card clicks navigate to `/course/exercise/:id`.

### `ExercisePage` (rewrite)

Resolves the `:exerciseId` URL param, finds the exercise + its
parent lesson + level, loads the database seed (`loadDatabase`),
and renders `<ExerciseView>`. The view handles the "worker not
ready" loading shell. 404 view also has `data-testid="exercise-page"`.

### `LevelPage` (new)

Tiny level overview. Lists the 4 lessons of the level as cards
linking to `/course/lesson/:id`. Rendered at `/course/level/:levelId`.

### `router.tsx` (update)

The `course` route is now a layout route with children:
`/course`, `/course/level/:levelId`, `/course/lesson/:lessonId`,
`/course/exercise/:exerciseId`. The legacy `/lesson/:id` and
`/exercise/:id` routes are gone — every test in
`tests/unit/ui/router.test.tsx` was updated to use the new
`/course/...` paths.

## Verification

```text
$ npx tsc --noEmit -p tsconfig.app.json
```

The only errors reported are **pre-existing** in
`tests/unit/components/schema/TableDefinition.test.tsx`,
`tests/unit/content/exercise-validations.test.ts`,
`tests/unit/hooks/useDebounce.test.tsx`, and
`tests/unit/pages/PlaygroundPage.test.tsx`. **No new TypeScript
errors** in the 8.1 code.

```text
$ npx vitest run tests/unit/
Test Files  52 passed (52)
Tests       554 passed (554)
```

All 554 unit tests pass, including the 30 new ones in this phase.

## Constraints

- All UI strings in Spanish.
- No new runtime dependencies (`useLiveQuery` is already a dep via
  `dexie-react-hooks`).
- Total new code (source) = 2 553 lines (≤ 3 000 cap).
- Total new tests = 30 (≥ 21 minimum).

## Verdict

VERDICT: PASS

## Fase 8.2 — Panels

> Hint / Solution / Feedback / ProgressBar components and the
> integration into `ExerciseView` and `CourseSidebar`. The new
> panels turn the exercise page into a complete pedagogical loop:
> the user runs → checks → reads a high-level banner → asks for a
> hint → asks for the solution.

### File list + line counts

#### Source (new)

| File | Lines | Purpose |
| ---- | ----- | ------- |
| `src/ui/components/course/HintPanel.tsx` | 173 | Collapsible hint list with icon-per-type cards |
| `src/ui/components/course/HintPanel.module.css` | 201 | Card list, header chevron, reveal button |
| `src/ui/components/course/SolutionPanel.tsx` | 110 | "¿Atascado? Ver solución" → SQL + explanation |
| `src/ui/components/course/SolutionPanel.module.css` | 92 | Code-block styling + ghost reveal button |
| `src/ui/components/course/FeedbackBanner.tsx` | 194 | Top-of-editor green/red summary after a check |
| `src/ui/components/course/FeedbackBanner.module.css` | 162 | Banner shape + sub-card list + dismiss button |
| `src/ui/components/course/ProgressBar.tsx` | 83 | Compact `done / total` bar with gradient fill |
| `src/ui/components/course/ProgressBar.module.css` | 53 | 6px-tall bar + right-aligned label |
| **New source total** | **1 068** | (under the 1 500 cap) |

#### Source (updated)

| File | Δ lines | Purpose |
| ---- | ------- | ------- |
| `src/ui/components/course/ExerciseView.tsx` | +73 | Adds `<FeedbackBanner>`, `<HintPanel>`, `<SolutionPanel>`, moves reset button to footer |
| `src/ui/components/course/ExerciseView.module.css` | +10 | New `.footerActions` style |
| `src/ui/components/course/CourseSidebar.tsx` | −5 | Replaces inline text/bar with `<ProgressBar>` |
| `src/ui/components/course/CourseSidebar.module.css` | −10 | Removes inline `.progressBar`/`.progressFill` rules |
| **Δ source total** | **+68** | |

Net new source code (sum of new + delta) = **1 136 LOC** (under
the 1 500 cap).

#### Tests (new)

| File | Tests | Lines |
| ---- | ----- | ----- |
| `tests/unit/components/course/HintPanel.test.tsx` | 7 | 94 |
| `tests/unit/components/course/SolutionPanel.test.tsx` | 5 | 91 |
| `tests/unit/components/course/FeedbackBanner.test.tsx` | 6 | 191 |
| `tests/unit/components/course/ProgressBar.test.tsx` | 6 | 57 |
| **Tests total** | **24** | **433** |

24 new tests (≥ 14 required). One pre-existing test in
`CourseSidebar.test.tsx` was updated (the new `ProgressBar` exposes
`data-testid="progress-fill"` globally; the per-level test now scopes
the lookup to the level wrapper).

### Module summaries

#### `HintPanel` (`src/ui/components/course/HintPanel.tsx`)

A collapsible list of pedagogical hints. The header is always
visible (it owns the `reveladas / total` count); the body collapses
with a chevron. Each revealed hint is a card with a type-specific
icon (`Lightbulb` for `conceptual`, `Code` for `syntactic`,
`Compass` for `semantic`, `Book` for `reference`). The "Mostrar
siguiente pista" button is replaced by a muted "Has visto todas las
pistas" line when `revealedCount === hints.length`. The component
is purely presentational — it doesn't call `pickNextHint`; the
parent owns the engine integration via `useExercise`. The hint text
is best-effort stripped of a leading markdown header (the
`> **Pista ... · nivel X**` prelude produced by `formatHint`) so the
card body is clean.

#### `SolutionPanel` (`src/ui/components/course/SolutionPanel.tsx`)

A two-state reveal. `revealed === false` renders a single
"¿Atascado? Ver solución" button. `revealed === true` renders the
solution SQL in a `<pre><code>` block and the explanation below; if
the exercise has no solution we render a muted "Este ejercicio no
tiene una solución de referencia" line instead. The component is
presentational; the parent owns the `solution` object (populated by
`useExercise().revealSolution()`).

#### `FeedbackBanner` (`src/ui/components/course/FeedbackBanner.tsx`)

Top-of-editor summary that appears after a `check()`. Three states:
`success === null` → renders nothing; `success === true` → minimal
green banner with the pass count; `success === false` → red banner
with one sub-card per failed `ValidationResult` (showing the
message + any `suggestions`) and, if `patterns` is non-empty, a
"Sugerencias automáticas" section listing the top 3 patterns'
`fix` text. The dismiss × clears the banner without touching the
persistent validation report that always sits below the editor.

The banner receives `report`, `patterns`, `success`, and
`onDismiss` from the parent; it never reads from the engine
directly. The parent snapshots the latest `checkReport` and
`lastPatterns` from `useExercise()` into local state so the banner
can be dismissed and re-shown across re-renders.

#### `ProgressBar` (`src/ui/components/course/ProgressBar.tsx`)

A 6px-tall horizontal bar with a right-aligned label above it. The
fill is a `linear-gradient(90deg, var(--color-accent),
var(--color-secondary))`. `done` and `total` come from the parent
(no global state); the percentage is computed locally and rounded
to an integer width. The component exposes `data-pct` and the
standard `role="progressbar"` ARIA attributes for a11y.

Used in `CourseSidebar` (per-level) and reusable anywhere a compact
"done / total" indicator is needed. The label is optional — when
omitted we render a default "X / Y".

#### `ExerciseView` (`src/ui/components/course/ExerciseView.tsx`) — update

New layout (top to bottom):

1. Breadcrumb → header → prompt
2. **`<FeedbackBanner>`** (after a `check()`; idle when no check yet)
3. SqlEditor + Run / Check toolbar (the **Reset** button is moved out)
4. ErrorBanner → ResultsTable → ValidationReport (unchanged from 8.1)
5. **`<HintPanel>`** (sequential hints from the exercise)
6. **`<SolutionPanel>`** (collapsed by default)
7. Footer: **Reset** button + "Volver a la lección" link

The view now consumes the new `hintsRevealed`, `lastPatterns`,
`solution`, `revealNextHint`, and `revealSolution` fields from
`useExercise`. Local state holds the banner's snapshot
(`feedbackReport`, `feedbackPatterns`, `feedbackSuccess`) so the
banner can be dismissed and re-shown independently of the
persistent validation report.

#### `CourseSidebar` (`src/ui/components/course/CourseSidebar.tsx`) — update

The inline "X / Y ejercicios" text + the custom CSS-only bar are
replaced by a single `<ProgressBar done={...} total={...}
label="X / Y ejercicios" />` per level. The two unused CSS rules
(`.progressBar` and `.progressFill`) are removed; a new
`.levelProgressBar` rule owns the per-level wrapper. The
`completionByLevel` map is still computed in-place when the parent
doesn't pass one (preserving the test path that exercises the
fallback).

### Verification

```text
$ npx tsc --noEmit -p tsconfig.app.json
```

Only the **pre-existing** errors reported in 8.1 (in
`TableDefinition.test.tsx`, `exercise-validations.test.ts`,
`useDebounce.test.tsx`, `PlaygroundPage.test.tsx`) remain. No new
TypeScript errors in the 8.2 code.

```text
$ npx vitest run tests/unit/
Test Files  56 passed (56)
Tests       578 passed (578)
```

All 578 unit tests pass, including the 24 new ones in this phase
(7 in `HintPanel`, 5 in `SolutionPanel`, 6 in `FeedbackBanner`,
6 in `ProgressBar`). The pre-existing `CourseSidebar` test was
updated to query the new global `progress-fill` test id inside the
per-level wrapper.

```text
$ npx oxlint src/ui/components/course/{HintPanel,SolutionPanel,FeedbackBanner,ProgressBar,ExerciseView,CourseSidebar}.tsx
Found 0 warnings and 0 errors.
```

### Constraints

- All UI strings in Spanish.
- No new runtime dependencies (all icons come from the existing
  `lucide-react` dep).
- Total new source code = 1 136 LOC (≤ 1 500 cap).
- Total new tests = 24 (≥ 14 minimum).
- One pre-existing test in `CourseSidebar.test.tsx` was updated to
  track the new `ProgressBar` test ids.

### Verdict

VERDICT: PASS

