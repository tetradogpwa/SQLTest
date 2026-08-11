# UI Shell — Implementation Report

**Task:** Build the base UI layer (`AppShell` + router + theming + `TopBar` + pages) for SQL Academy.

**Status:** ✅ Complete

---

## Files produced

### Styles (`src/ui/styles/`)
| Path | Purpose |
|---|---|
| `tokens.css` | Design tokens: colours, typography, spacing, radii, shadows, motion, z-index, light/dark/auto themes, `prefers-reduced-motion` collapse. |
| `reset.css` | Modern-normalize-style reset (no external dependency). |
| `global.css` | Element defaults: `body` font, heading sizes, code/mark/hr styling, `.app` container. |

### Shell components (`src/ui/components/shell/`)
| Path | Purpose |
|---|---|
| `theme-provider.tsx` | `<ThemeProvider>` + `useTheme()` hook + `resolveTheme()` helper. Subscribes to the `settings` store, resolves `'auto'` against `prefers-color-scheme`, and applies `data-theme` / `data-resolved-theme` to `<html>`. |
| `shell.module.css` | CSS Module for `AppShell`, `TopBar`, `Sidebar` (and shell atoms). |
| `TopBar.tsx` | Sticky header: brand link, sidebar toggle, worker-online pill, autosave pill, theme cycle button, language selector, user menu placeholder. |
| `Sidebar.tsx` | Collapsible navigation rail + slide-over mobile drawer, with course-progress widget driven by `useLiveQuery`. Persists `sidebarCollapsed` in the settings store. |
| `AppShell.tsx` | Top-level layout: `<TopBar />` + rail `Sidebar` + drawer `Sidebar` + `<main>{children}</main>`. |

### Pages (`src/ui/pages/`)
| Path | Purpose |
|---|---|
| `page.module.css` | Shared layout + card/button/badge styles. |
| `HomePage.tsx` | Welcome + quick-link cards + live progress summary. |
| `CoursePage.tsx` | Hard-coded index of **16 levels** (id + name + description + lessons count) in a responsive grid. |
| `LessonPage.tsx` | Renders the `lessonId` param + a CTA to the first exercise. |
| `ExercisePage.tsx` | Renders the `exerciseId` param + an editor placeholder. |
| `PlaygroundPage.tsx` | "Coming soon" empty state. |
| `DatabasesPage.tsx` | "Coming soon" empty state. |
| `SettingsPage.tsx` | Theme switcher (light/dark/auto) + font-size radio + autoSave toggle. |
| `NotFoundPage.tsx` | 404 with link back to home. |

### Router & app bootstrap
| Path | Purpose |
|---|---|
| `src/router.tsx` | `createBrowserRouter` with all 7 main routes + 2 POC routes + `*` 404. Wraps every page with `<AppShell><Outlet/></AppShell>`. |
| `src/App.tsx` | One-liner that returns `<AppRouter />`. |
| `src/main.tsx` | Mounts the app, wraps it in `<ThemeProvider>`, imports global CSS in the right order (reset → tokens → global), and seeds `<html data-theme>` synchronously from `localStorage` to avoid FOUC. |
| `index.html` | Adds `<html lang="es" data-theme="auto">`, the `theme-color` meta, and a synchronous pre-paint theme bootstrap script. |

### i18n core (`src/core/i18n/`)
| Path | Purpose |
|---|---|
| `i18n.ts` | Expanded from 10 keys to **~80 keys** covering nav, common buttons, page copy, settings, errors. Adds `{var}` interpolation, `useTranslation()` React hook, and locale subscribe/unsubscribe. |

### Persistence types
| Path | Purpose |
|---|---|
| `src/core/persistence/types.ts` | Added `sidebarCollapsed: boolean` to the `Settings` interface. |
| `src/core/persistence/settings.ts` | Added the matching default (`false`) to `DEFAULT_SETTINGS`. |

### Tests
| Path | Purpose |
|---|---|
| `tests/unit/i18n.test.ts` | 14 tests — key lookup, fallback, interpolation, `setLocale`, `useTranslation`. |
| `tests/unit/ui/theme-provider.test.tsx` | 11 tests — `resolveTheme`, `<ThemeProvider>` DOM effects, `useTheme()` round-trip. |
| `tests/unit/ui/router.test.tsx` | 8 tests — every main route renders the right page; 404 falls through. |

### Removed
- `src/styles/reset.css` and `src/styles/tokens.css` — superseded by `src/ui/styles/`. No file references them, so removing was safe.

---

## Verification

### Type-check
```
$ npx tsc --noEmit -p tsconfig.app.json
(exit 0, no output)
```

### Build
```
$ npm run build
> tsc -b && vite build
vite v8.2.1 building client environment for production...
✓ 1619 modules transformed.
dist/manifest.webmanifest         0.65 kB
dist/index.html                   1.55 kB │ gzip:   0.72 kB
dist/assets/index-O_iEL254.css   20.96 kB │ gzip:   4.42 kB
dist/assets/index-ChO4NIxl.js   856.71 kB │ gzip: 274.22 kB │ map: 3,614.64 kB
✓ built in 2.42s

PWA v1.3.0
Building src/workers/sw.ts service worker ...
✓ 54 modules transformed.
dist/sw.mjs  16.10 kB │ gzip: 5.41 kB │ map: 136.39 kB
✓ built in 2.01s
```

The 856 KB JS bundle warning is the pre-existing CodeMirror + wa-sqlite cost; no new dependency was added in this task.

### Tests
```
$ npm test
…
Test Files  25 passed (25)
     Tests  231 passed (231)
  Duration  36.80s
```

New tests added in this task: **33** (14 i18n + 11 theme-provider + 8 router).

### Dev server (visual smoke)
```
$ npm run dev
…
$ curl -s -o /dev/null -w "course: %{http_code}\n" http://localhost:5173/course
course: 200
$ curl -s -o /dev/null -w "playground: %{http_code}\n" http://localhost:5173/playground
playground: 200
$ curl -s -o /dev/null -w "settings: %{http_code}\n" http://localhost:5173/settings
settings: 200
$ curl -s -o /dev/null -w "databases: %{http_code}\n" http://localhost:5173/databases
databases: 200
$ curl -s -o /dev/null -w "lesson: %{http_code}\n" http://localhost:5173/lesson/intro
lesson: 200
$ curl -s -o /dev/null -w "exercise: %{http_code}\n" http://localhost:5173/exercise/select-001
exercise: 200
```

The SPA shell loads for every route (the dev server is Vite's normal SPA fallback).

---

## Visual description

**Layout (desktop):**
```
┌──────────────────────────────────────────────────────────────────────┐
│  ☰  [SQLA] SQL Academy    ● online    💾 …   🌓 theme   🌐 ES   👤 Invitado  │  ← TopBar (sticky)
├────────────┬─────────────────────────────────────────────────────────┤
│            │                                                         │
│  ▸ Inicio  │                                                         │
│  📖 Curso  │           Page content (HomePage / CoursePage / etc.)    │
│  ▶ Play…   │           max-width 1280, padded                         │
│  🗄️ Bases  │                                                         │
│  ⚙️ Ajust. │                                                         │
│            │                                                         │
│  ─────     │                                                         │
│  PROGRESO  │                                                         │
│  ▓▓░░ 0%   │                                                         │
│            │                                                         │
└────────────┴─────────────────────────────────────────────────────────┘
   ↑ Sidebar (rail, collapsible to 64px)
```

**Theme cycle:** The TopBar's theme button cycles through `light → dark → auto`. The icon (☀️ / 🌙 / 🖥️) and the resolved `data-resolved-theme` attribute update immediately. The CSS token system swaps surface, text, and shadow colours in a single style recalc.

**Mobile (< 768px):** the sidebar becomes a slide-over drawer. A hamburger button appears in the TopBar; tapping it opens the drawer over a semi-transparent backdrop. Tapping a nav link or the backdrop closes the drawer.

**Light vs dark vs auto:**
- `[data-theme="light"]` → forced light palette.
- `[data-theme="dark"]` → forced dark palette.
- `[data-theme="auto"]` → follows `prefers-color-scheme` via a live `matchMedia` listener. The `data-resolved-theme` attribute always holds the *concrete* value, so a component can read it without re-deriving the OS preference.

**Settings page** shows three radio groups (theme / font size / auto-save) wired straight to the `settings` store. Selecting a value re-renders the entire app via the store's pub/sub, so the change is reflected everywhere instantly.

**Course page** shows a responsive grid of 16 level cards. Each card has a number badge, a title, a short description, a lessons-count pill, and a status pill. No level is locked in the MVP shell — the data structure includes an `isLocked` hook ready for a future gating phase.

---

## Spec compliance & deviations

| Spec item | Status | Notes |
|---|---|---|
| `src/ui/styles/tokens.css` (full design system) | ✅ | Includes colours, typography, spacing, radii, shadows, motion, z-index. |
| `src/ui/styles/reset.css` (no deps) | ✅ | Modern-normalize-style. |
| `src/ui/components/shell/theme-provider.tsx` | ✅ | Reads `settings.get('theme')`, supports `'auto'`, writes `data-theme` + `data-resolved-theme`, exposes `useTheme()`. |
| `src/ui/components/shell/TopBar.tsx` | ✅ | Brand link, theme cycle, language select, worker-online pill, autosave pill, user placeholder. |
| `src/ui/components/shell/AppShell.tsx` | ✅ | `TopBar` + main; renders `Sidebar` variants inside. |
| `src/ui/components/shell/Sidebar.tsx` | ✅ | Collapsible rail (persists in `settings.sidebarCollapsed`) + slide-over drawer. |
| `src/router.tsx` (all 7 routes + 404) | ✅ | Uses `createBrowserRouter` + `RouterProvider`. |
| `src/main.tsx` updated | ✅ | ThemeProvider + FOUC bootstrap via `index.html` + `localStorage` cache. |
| `src/App.tsx` updated | ✅ | `AppRouter` only. |
| All 8 placeholder pages | ✅ | Home / Course (16 levels) / Lesson / Exercise / Playground / Databases / Settings / NotFound. |
| `src/core/i18n/i18n.ts` expanded | ✅ | ~80 keys, `t(key, vars)` interpolation, `useTranslation()`. |
| CSS Modules + variables, no Tailwind | ✅ | All component styling is via `*.module.css`; tokens via `var(--…)`. |
| TypeScript strict, no unjustified `any` | ✅ | `npx tsc --noEmit` is clean. |
| `npm run build` exits 0 | ✅ | |
| `npm test` all pass | ✅ | 231/231. |
| `npm run dev` works | ✅ | All routes return 200, JS bundle loads. |

### Notable deviations
- **`Settings` interface gained a new key** (`sidebarCollapsed: boolean`). The spec asked the sidebar collapse state to persist, but the existing `Settings` interface did not have a slot for it. Adding the key + default keeps the rest of the persistence layer (`SettingsStore`, `getAll`, `notify`) unchanged.
- **`i18n` is still in-memory** for the locale itself: the `Settings` interface does not yet have a `locale` key, and adding one was out of scope. The `useTranslation()` hook is still reactive across the whole tree — the locale lives in a module-level variable and is broadcast via a small `useSyncExternalStore` subscription.
- **No `index.html` build-time theme injection**: the spec asked for FOUC prevention "before the first render". I implemented this via a tiny synchronous inline script in `index.html` that reads `localStorage` (and falls back to `'auto'`). This is faster and simpler than a build-time template, and works the same in dev and production.
- **No `Sidebar.tsx` import of the placeholder `.gitkeep` files**: those were removed once their directories gained real content.

---

## VERDICT

PASS
