# Changelog

All notable changes to SQL Academy PWA are documented here. The
format is loosely based on [Keep a Changelog](https://keepachangelog.com)
and the project adheres to [Semantic Versioning](https://semver.org/)
once the API is published (the 0.x range signals "anything may
change").

## [Unreleased]

### Added

- **Fase 9 — Databases page + Playground enhancements**
  - `useUserDatabases` hook (create / import / export / rename / delete).
  - `CreateDatabaseDialog` and `ImportDatabaseDialog` (drag & drop + validation).
  - `RowActions` kebab menu.
  - `DatabasesPage` rewritten with table, search, origin badges, delete confirm.
  - Playground enhancements: `DbSelector`, `SnapshotsPanel` with auto-snapshot
    on destructive statements, `UndoButton` over `undoStore`, `StatsPanel`.
  - Worker: new `createUserDatabase(name)` exposed via the DBAPI.

- **Fase 12 — Settings + i18n**
  - `useSettings` hook + `useBuildInfo` (build-time version + id).
  - Settings page rewritten with five sections: Apariencia, Editor (font
    size, tab size, word wrap, auto-save), Idioma, Datos, Acerca de.
  - Locale `ca` (Catalan) added. `i18n` now persists the chosen locale
    via the settings store and hydrates on app boot.
  - `SqlEditor` accepts `tabSize` and `wordWrap` and threads them through
    the CodeMirror configuration.
  - Vite + vitest `define` inject `__APP_VERSION__` and `__APP_BUILD_ID__`.

- **Fase 13 — Polish (a11y + responsive + edge cases)**
  - `useFocusTrap` hook applied to every modal (5 modals: create, import,
    rename, delete, settings confirm).
  - `WorkerErrorBanner` global toast with retry / dismiss.
  - Topbar locale switcher now offers `es / ca / en`. Sidebar toggle
    exposes correct `aria-expanded` and `aria-controls`.
  - `vitest-axe` smoke tests for Home / Playground / Settings / NotFound.
  - Fixed axe violations: heading-order, aria-input-field-name,
    landmark-unique. SqlEditor now propagates `aria-label` to the
    inner `role="textbox"` element.

- **Fase 14 — CI/CD**
  - `.github/workflows/ci.yml` — typecheck + lint + test + coverage +
    build on every push to `main` and every PR.
  - `.github/workflows/release.yml` — tag-based release (push `v*`
    to attach `dist/` to a GitHub Release with auto-generated notes).
  - `.github/dependabot.yml` — weekly grouped PRs for npm + GitHub Actions.
  - `.github/CODEOWNERS` — required review for worker / persistence / CI.
  - Coverage: `@vitest/coverage-v8` configured. Current numbers:
    lines **87.4%** / branches **75.4%** / functions **83.4%**.

### Changed

- `Settings` interface extended with `tabSize`, `wordWrap`, `locale`.
  Defaults live in `DEFAULT_SETTINGS`. The migration is automatic —
  Dexie is forward-compatible with the new keys.
- The `settings` singleton's `subscribe` is now consumed by every
  settings UI consumer (theme, locale, editor) so changes propagate
  without a page reload.

### Notes for contributors

- The `git diff public/wa-sqlite*.wasm` should stay empty in PRs. The
  `prebuild` hook syncs the binary from `node_modules`; if the diff
  is non-empty, re-run `npm install` and `npm run sync:wasm`.
- All new components live in `src/ui/components/<feature>/` and follow
  the same `*.tsx` + `*.module.css` convention.
