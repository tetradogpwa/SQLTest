# SQL Academy PWA

Aplicación web progresiva (PWA) para aprender SQL en español, con SQLite ejecutándose 100% en el navegador vía WebAssembly.

**Stack:** Vite 8 + React 19 + TypeScript 6 + `wa-sqlite` 1.0 + CodeMirror 6 + Dexie 4 + Comlink 4 + `vite-plugin-pwa`.

[![CI](https://github.com/tetradogpwa/SQLTest/actions/workflows/ci.yml/badge.svg)](https://github.com/tetradogpwa/SQLTest/actions/workflows/ci.yml)
[![Coverage](https://github.com/tetradogpwa/SQLTest/actions/workflows/pr-coverage.yml/badge.svg)](https://github.com/tetradogpwa/SQLTest/actions/workflows/pr-coverage.yml)

> Reemplaza `<owner>` por el nombre del repo si haces fork. Los
> badges apuntan a `tetradogpwa/SQLTest` por defecto.

## Quick start

```bash
npm install
npm start          # → http://localhost:5173
```

Otros scripts:

```bash
npm run dev         # mismo que npm start, alias
npm run build       # build de producción a ./dist
npm run preview     # sirve el build localmente
npm run typecheck   # tsc --noEmit
npm run test        # vitest run (suite completa, ~30s)
npm run test:watch  # vitest en modo watch
npm run test:ui     # vitest --ui
npm run test:coverage # vitest run --coverage (HTML + lcov)
npm run lint        # oxlint
```

## Pipeline de CI

Cada push a `main` y cada PR ejecuta:

1. **lint** — `oxlint` (sin config, cero overhead).
2. **typecheck** — `tsc --noEmit -p tsconfig.app.json`.
3. **test** — `vitest run` con happy-dom + `pool: 'forks'`. 657 tests.
4. **coverage** — `vitest run --coverage` (v8) — sube `coverage/`
   como artefacto y postea un resumen en el PR.
5. **build** — `vite build` con el plugin PWA; sube `dist/` como
   artefacto para inspección.

Más detalles en [`docs/reports/`](./docs/reports/) y
[`.github/workflows/`](./.github/workflows/).

## Características

- **Offline-first PWA:** todo el motor SQLite corre en el navegador vía `wa-sqlite` + `OPFSCoopSyncVFS`. Una vez instalada, no necesita red.
- **Editor SQL profesional:** CodeMirror 6 con syntax highlighting, autocompletado consciente del esquema, buscar/reemplazar, undo/redo.
- **Explorador de base de datos:** introspección en vivo de tablas, vistas, índices, triggers. Vista de definición por tabla.
- **Curso completo en español:** 4 bases de datos semilla (biblioteca, tienda, red social, empresa consultora) con 1 098 filas de datos realistas, 16 lecciones, 112 ejercicios de 8 tipos distintos.
- **Motor de ejercicios pedagógico:** 11 estrategias de validación (resultado, dbState, schema, rowCount, rowExists, tableExists, constraint, usesKeyword, usesJoin, invariant, queryPlan), comparador de resultados, motor de pistas con 3 niveles (conceptual → sintáctica → semántica), detector de errores comunes con fixes en español.
- **Persistencia local:** Dexie guarda progreso del curso, borradores del editor (autosave), historial de queries, queries guardadas, snapshots manuales, undo.

## Estructura

```
src/
├── core/
│   ├── exercises/        # Motor: validator, strategies, runner, hint-engine, error-pattern-detector
│   ├── persistence/      # Dexie + PersistenceService (Main Thread único que escribe)
│   ├── storage/          # OPFS + capability detection
│   └── i18n/             # i18n (es completo, ca/en pendientes)
├── content/
│   ├── databases/        # 4 seeds: library, tienda, social, empresa
│   ├── lessons/          # 16 lecciones con 112 ejercicios
│   ├── glossary.ts
│   ├── loaders.ts
│   ├── stats.ts
│   └── study-guide.ts
├── workers/              # SQLite Worker (wa-sqlite, OPFS, VACUUM INTO snapshots, progress_handler)
├── ui/
│   ├── components/
│   │   ├── editor/       # SqlEditor + autocompletado
│   │   ├── results/      # ResultsTable + ErrorBanner
│   │   ├── schema/       # DbExplorer + TableDefinition
│   │   ├── course/       # CourseSidebar + LessonView + ExerciseView + HintPanel + SolutionPanel + FeedbackBanner + ProgressBar
│   │   └── shell/        # AppShell + TopBar + Sidebar + theme
│   └── pages/            # HomePage, CoursePage, LessonPage, ExercisePage, PlaygroundPage, DatabasesPage, SettingsPage
└── hooks/                # useDatabase, useQuery, useSchema, useDebounce, useProgress, useExercise

tests/                    # 578 unit tests
pocs/                     # Pruebas de concepto originales (POC-1 a POC-6)
```

## Reportes por fase

Todo el trabajo está documentado en `docs/reports/*.md`:

- `SCAFFOLD-REPORT.md`, `POC-ENGINE-REPORT.md`, `POC-UI-REPORT.md`
- `WORKER-EXEC-REPORT.md`, `WORKER-STORAGE-REPORT.md`
- `PERSISTENCE-REPORT.md`, `UI-SHELL-REPORT.md`
- `EDITOR-REPORT.md`, `EXERCISE-ENGINE-REPORT.md`
- `COURSE-CONTENT-REPORT.md`, `COURSE-UI-REPORT.md`
- `POLISH-REPORT.md`, `COVERAGE-REPORT.md`, `CI-CD-REPORT.md`,
  `OFFLINE-PWA-REPORT.md`, `REFACTOR-ROADMAP.md`,
  `AI-ASSISTANT-DESIGN.md` (diseño abandonado)

`roadmap.md` lista lo que queda por hacer (Fase 9 en adelante) o
revisa `PROJECT_PLAN.md` para el plan activo.

## Decisiones de arquitectura clave

- **Snapshot strategy:** `VACUUM INTO 'snapshot.db'` (wa-sqlite 1.0 no expone `sqlite3_serialize`). Round-trip verificado byte-idéntico.
- **Timeout strategy:** `sqlite3_progress_handler(db, 1000, callback)` (chequea elapsed cada 1000 VM opcodes). `sqlite3_interrupt` no existe en la build WASM.
- **Worker ownership:** un único Worker SQLite por sesión. Singleton global. Se recupera de crashes reabriendo DBs desde el bookkeeping map.
- **Dexie ownership:** solo el Main Thread escribe en Dexie. El Worker habla con Dexie a través de un bridge explícito (`PersistenceService`).
- **PWA:** desplegada como estática. No necesita COOP/COEP. WASM pre-cacheado en `/dist/wa-sqlite.wasm`.
- **Exercise Runner vs Playground:** ciclos de vida distintos. El Runner es temporal (working-copy en `OPFS/exercises/...`), el Playground es persistente (DBs en `OPFS/user/...`).

## Decisiones de testing

- vitest 2.x + happy-dom + `@testing-library/react`.
- 578 tests al cierre de Fase 8.
- Typecheck strict en `tsconfig.app.json`.
- Los hooks se mockean con `vi.fn()` para no levantar el Worker real.
