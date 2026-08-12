# PROJECT_PLAN

> Fuente oficial del estado del proyecto. Cualquier duda sobre el
> estado actual debe resolverse leyendo este archivo. Las decisiones
> arquitectónicas importantes se documentan en `*-REPORT.md` y
> `AI-ASSISTANT-DESIGN.md` / `REFACTOR-ROADMAP.md`.

# Resumen

**SQL Academy PWA** es una aplicación web progresiva en español para
aprender SQL ejecutándose 100% en el navegador. El motor de base de
datos (`wa-sqlite` WASM) corre dentro de un Web Worker; el Main
Thread coordina la UI + la persistencia local (Dexie) y nunca
compite con la ejecución de queries. El curso completo cubre 4 bases
de datos semilla (biblioteca, tienda, red social, empresa
consultora) con 1 098 filas de datos, 16 lecciones y 112 ejercicios
de 8 tipos diferentes.

El proyecto se entrega como PWA estática (sin backend) y se
despliega en cualquier host estático. No requiere COOP/COEP. Una
vez instalada, la app funciona completamente offline.

**Estado global:** estable. 981 tests, 89% lines / 79% branches de
coverage, typecheck strict, lint limpio, build verde, WASM precache
de 3.0 MB, CI con 5 jobs (lint + typecheck + test + coverage +
build) y un job de e2e con Playwright que corre en CI. La
arquitectura está refactorizada en servicios puros (`src/core/services/`)
+ hooks como thin wrappers + componentes presentacionales.

**Pendiente crítico:** ~~**Fase 15 (AI Assistant)**~~ **ABANDONADA**
por decisión del mantenedor (sesión 2025-08-11). El diseño
(`AI-ASSISTANT-DESIGN.md`) se conserva como referencia histórica
pero no se implementa. `AI-ASSISTANT-DESIGN.md` puede eliminarse
en una limpieza futura si se desea.

El estudio de "study mode" (Fase 16 ad-hoc) sí está
implementado y verificado.

---

# Arquitectura

## Diagrama lógico

```
┌─────────────────────────────────────────────────────────────────┐
│  BROWSER (Main Thread)                                           │
│  ┌─────────────────────┐   ┌────────────────────────────────┐    │
│  │  React UI           │   │  Dexie (IndexedDB)            │    │
│  │  - Pages            │◄──┤  - progress                  │    │
│  │  - Components       │   │  - databases (user DBs)     │    │
│  │  - Hooks (thin)     │   │  - settings                   │    │
│  │                     │   │  - queryHistory, etc.        │    │
│  └─────────┬───────────┘   └────────────────────────────────┘    │
│            │                                                    │
│            │ Comlink (proxy)                                    │
└────────────┼────────────────────────────────────────────────────┘
             │
             │ postMessage
             │
┌────────────▼────────────────────────────────────────────────────┐
│  Web Worker (sqlite.worker.ts)                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  wa-sqlite (WASM) + VFS (OPFS / IDB / Memory)        │    │
│  │  - DatabaseManager                                     │    │
│  │  - QueryExecutor (with progress_handler timeout)     │    │
│  │  - SnapshotManager (VACUUM INTO)                     │    │
│  │  - SchemaManager (sqlite_master)                      │    │
│  │  - ImportExportManager                                │    │
│  │  - ErrorTranslator                                    │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Stack

| Capa | Tecnología | Justificación |
|---|---|---|
| Build | Vite 8 + TypeScript 6 | ESM nativo, HMR, sin bundler custom |
| UI | React 19 + react-router-dom 7 | Estándar, nested routes para sidebar persistente |
| Estado | useState + useLiveQuery (Dexie) | Sin Redux/Zustand — la complejidad no lo justifica |
| Persistencia | Dexie 4 | API limpia, hooks para React, migrations via `version().stores()` |
| Worker | Comlink 4 | RPC tipado sobre `postMessage` |
| DB engine | wa-sqlite 1.0 (WASM) | SQLite en navegador, sin backend |
| Editor SQL | CodeMirror 6 | Estándar de la industria, autocompletado consciente del esquema |
| Iconos | lucide-react | Tree-shakeable, sin SVGs inline |
| Estilos | CSS Modules + design tokens | Sin runtime CSS-in-JS, scoping automático |
| PWA | vite-plugin-pwa (injectManifest) | Sin workbox CLI custom |
| Tests | vitest 2 + happy-dom + @testing-library/react | Stack moderno, sin jest/jsdom |
| Lint | oxlint | Sin config, 100x más rápido que ESLint |
| Coverage | @vitest/coverage-v8 | Standard, HTML + lcov |

## Responsabilidades por módulo

```
src/
├── core/
│   ├── exercises/         # Motor pedagógico (runner, validator, 11 strategies, hint-engine, error-pattern-detector)
│   ├── persistence/       # Dexie + PersistenceService (Main Thread único que escribe)
│   ├── services/          # PURE TS logic (userDatabases, modalLogic, playgroundController, queryRunner, exerciseHook, studyDb)
│   ├── storage/           # OPFS + capability detection
│   ├── i18n/              # es (completo), ca/en (stubs)
│   ├── sql/               # (placeholder, vacío en main)
│   ├── worker/            # (placeholder, vacío en main)
│   └── pwa/               # (placeholder, vacío en main)
├── content/
│   ├── databases/         # 4 seeds (library, tienda, social, empresa)
│   ├── lessons/           # 16 lecciones (4 archivos: library, tienda, social, empresa)
│   ├── courses/           # (placeholder, vacío)
│   ├── exercises/         # (placeholder, vacío)
│   ├── locales/           # i18n JSONs (sólo es)
│   ├── glossary.ts        # Términos del dominio
│   ├── loaders.ts         # loadCourse(lessonId) — single source of truth
│   ├── stats.ts           # Estadísticas del curso (cacheado)
│   └── study-guide.ts     # Guía de estudio extendida
├── workers/               # SQLite Worker + 9 managers (todo el lado Engine)
├── ui/
│   ├── components/        # 8 carpetas por feature (shell, course, exercise, editor, results, schema, databases, playground)
│   ├── pages/             # 7 páginas (Home, Course, Level, Lesson, Exercise, Playground, Databases, Settings)
│   └── styles/            # reset, tokens, global CSS
└── hooks/                 # 10 hooks (useDatabase, useQuery, useSchema, useExercise, useProgress, useUserDatabases, useSettings, useBuildInfo, useDebounce, useFocusTrap, useStudyDb)

tests/                     # 84 archivos de test (~981 tests)
pocs/                      # POC-1 a POC-6 (origen del scaffold, mantenidos en /poc/3 y /poc/6)
```

## Convenciones arquitectónicas

- **Servicios puros** en `src/core/services/`: funciones I/O-free con tests
  de pure vitest. La única excepción permitida es `new Date()` /
  `Math.random()` inyectados como parámetros.
- **Hooks como thin wrappers** sobre servicios: `useStudyDb` consume
  `studyDbService` + `useUserDatabases` + Dexie's `useLiveQuery`. No
  contiene lógica de negocio.
- **Componentes presentacionales**: zero estado propio. Reciben datos
  y callbacks, emiten eventos. Toda la validación / transformación
  está en el servicio.
- **Service-Worker único** (singleton global en `useDatabase`).
  Recuperación de crashes con `MAX_RECOVERY_ATTEMPTS = 3`.
- **Main Thread único que escribe en Dexie**. El Worker habla
  con Dexie a través de `PersistenceService` (un bridge explícito
  con mensajes tipados).
- **Inversión de dependencias**: `DBApi` (worker) expone la interfaz;
  `useDatabase` la consume. El Main Thread nunca llama directamente
  al Worker sin pasar por el hook.
- **Naming**: archivos en kebab-case, clases en PascalCase,
  funciones/variables en camelCase, constantes en UPPER_SNAKE.
- **Imports type-only explícitos** (regla `verbatimModuleSyntax`).
- **Comentarios en español** para usuarios, en inglés para devs.
- **i18n en español** para todos los textos de UI; las claves viven
  en `src/core/i18n/i18n.ts`.

---

# Estado actual

## Qué funciona (completo)

- [x] **Fase 0–8** (Scaffold, POC, Worker, Persistence, UI shell,
  Editor, Exercise engine, Course content, Course UI)
- [x] **Fase 9** — Databases page + Playground enhancements
  (`useUserDatabases` + 5 modales + DbSelector + SnapshotsPanel +
  UndoButton + StatsPanel)
- [x] **Fase 10** — PWA offline verification (`OFFLINE-PWA-REPORT.md`
  + `tests/unit/sw.test.ts` + `tests/e2e/offline.spec.ts` con Playwright
  en CI)
- [x] **Fase 11** — Test coverage a ≥ 80% (logrado: 89% / 79% branches)
- [x] **Fase 12** — Settings + i18n (3 locales, theme, editor, idioma,
  datos, acerca)
- [x] **Fase 13** — Polish (a11y + responsive + edge cases; useFocusTrap
  + WorkerErrorBanner + axe-core tests)
- [x] **Fase 14** — CI/CD (5 workflows + coverage report + Playwright
  + Dependabot + CODEOWNERS + templates)
- [x] **Study mode** — per-lesson study DB (studyDbService +
  useStudyDb + ExerciseRunner `studyDbId` + LessonStudySection)
- [x] **Refactor de hooks** — `userDatabasesService`, `modalLogic`,
  `playgroundController`, `queryRunnerService`, `exerciseHookService`
  extraídos como servicios puros con 100% coverage

## Qué falta

- [ ] **Fase 15 — AI Assistant** ~~(abandonada)~~
  - ~~Diseñado en `AI-ASSISTANT-DESIGN.md`~~
  - ~~Cliente target: Ollama + Claude~~
  - Decisión 2025-08-11: abandonada por el mantenedor
- [ ] **i18n `ca` y `en`** — sólo `es` está completo; `ca` y `en` son
  stubs parciales
- [ ] **Settings: Asistente IA section** — toggle, provider, API key
  encryption (depende de Fase 15)
- [ ] **N+1: migrate Dexie v2** — la tabla `lessonStudyDb` se añade
  en v2 sin migration explícita; los usuarios con v1 existente
  funcionan, pero falta un test que verifique el upgrade
- [ ] **N+1: tests e2e de study mode** — sólo smoke test manual
- [ ] **N+2: cleanup POCs** — `pocs/ui/poc-3-pwa` y
  `pocs/ui/poc-6-codemirror` siguen montados en producción. La
  pregunta es: ¿se quedan como demos o se eliminan?
- [ ] **N+3: Coverage gate en CI** — `coverage.thresholds` en
  `vitest.config.ts` para bloquear PRs que bajen la cobertura
- [ ] **N+3: Tests para `useSettings` y `useDatabase`** — branches
  de error paths poco cubiertas (recovery, etc.)

## Qué riesgos existen

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| wa-sqlite 1.x breaking change | Media | Alto | Pin version; actualizar bajo test suite pesado |
| PWA install UX | Baja | Medio | `OFFLINE-PWA-REPORT.md` documenta el flow |
| Dexie migration error | Baja | Alto | No se ha hecho ningún v2→v3 todavía; documentar antes |
| `pocs/ui/` aún en producción | Media | Bajo | Marcar como deprecated; eliminar en v1.0 |
| `studyDbId` test en study mode | Media | Medio | Sólo smoke test; falta e2e |
| AI Assistant scope creep | Nula | Nula | Abandonada (sesión 2025-08-11) |
| `AI-ASSISTANT-DESIGN.md` queda como referencia histórica | Nula | Bajo | Puede eliminarse en una limpieza futura |
| Tests e2e Playwright no corren en local | Alta | Bajo | Requiere Chromium instalado localmente; CI sí corre |

## Qué decisiones arquitectónicas clave se han tomado

| Decisión | Rationale | Trade-off aceptado |
|---|---|---|
| **WASM pre-bundled por Vite, no OPFSCoopSyncVFS** | `OPFSCoopSyncVFS` no existe en wa-sqlite 1.0; usamos `AccessHandlePoolVFS` (sync) o `OriginPrivateFileSystemVFS` (async) | Sin COOP/COEP, deploy en cualquier host estático |
| **Snapshots via `VACUUM INTO`** | `sqlite3_serialize` no se exporta en wa-sqlite 1.0 | Round-trip byte-idéntico verificado |
| **Timeout via `progress_handler(db, 1000, callback)`** | `sqlite3_interrupt` no está en la build WASM | Garantía de no cuelgue; menos eficiente que `interrupt` |
| **Single Worker, singleton global** | Un Worker por app, recoverable | Coalescing de requests inevitable |
| **Main Thread único que escribe Dexie** | Eliminamos race conditions en persistencia | Más boilerplate en el bridge |
| **Estilos: CSS Modules + tokens** | Sin CSS-in-JS runtime overhead | Sin theming dinámico sin recompilar |
| **Servicios puros + DI explícita** | Testable sin mocks globales | Verboso en sitios con mucho I/O |
| **i18n sin librería** (custom) | Sin bundle bloat; claves planas | Sin pluralización, sin ICU |
| **Sin state management library** | useState + useLiveQuery es suficiente | Componentes grandes pueden ser verbosos |
| **Vitest 2 + happy-dom** (no jsdom) | Más rápido, mejor para nuestro caso | Algunas APIs de DOM pueden faltar |
| **`pool: 'forks'`** | WASM state aislado entre test files | Más lento que threads |

---

# Métricas

## Resumen de puntuaciones

| Dimensión | Puntuación (0-10) | Estado |
|---|---|---|
| Arquitectura | **8.5** | Buena (servicios puros + DI); refactor pendiente de más áreas |
| Calidad del código | **8** | Buena (tests + cobertura); algunas funciones largas |
| Seguridad | **8** | Buena (sin backend, sin secretos); falta auditoría formal |
| Rendimiento | **7.5** | Aceptable (memoización); falta profiling en navegadores reales |
| Escalabilidad | **8** | Buena (modular, servicios); nuevas features son cost-incremental |
| Testabilidad | **9** | Excelente (981 tests, cobertura alta) |
| Mantenibilidad | **8.5** | Muy buena (servicios puros, design tokens, linter estricto) |
| Documentación | **7.5** | Aceptable (12+ reports); falta un verdadero user-facing doc |
| Cobertura de tests | **8.5** (89% lines / 79% branches / 83% functions) | Alta pero no enforced en CI |

**Global: 8.2 / 10**

## Detalle por dimensión

### Arquitectura — 8.5/10

**Fortalezas**
- Separación clara UI / hook / service / worker
- 6 servicios puros en `src/core/services/` con cobertura 100%
- Inyección de dependencias explícita (no globals en servicios)
- Main Thread ↔ Worker contract bien definido vía Comlink

**Debilidades**
- `useExercise` y `useUserDatabases` todavía mezclan lógica de
  I/O (Dexie, Worker) con la del hook
- `useDatabase` contiene la lógica de recovery del Worker
  (podría ser un servicio)
- `pocs/ui/` sigue en producción (acoplamiento histórico)

**Acciones recomendadas**
1. Extraer la lógica de `useDatabase` a un `workerSessionService`
2. Eliminar `pocs/ui/poc-3-pwa` y `poc-6-codemirror` del router
   de producción (mantener como tests internos)
3. Considerar extraer `useExercise` y `useUserDatabases` la lógica
   de selección a servicios

### Calidad del código — 8/10

**Fortalezas**
- TypeScript strict (noUncheckedIndexedAccess, verbatimModuleSyntax)
- Lint limpio (oxlint, sin warnings)
- Naming consistente
- Comentarios en español para usuarios, en inglés para devs

**Debilidades**
- `runner.ts` (580 líneas) y `useExercise` (333) son grandes
- Algunos `as unknown as` en el código (wa-sqlite sin tipos)
- Tests e2e con `as const` que pueden ser `unknown` en runtime
- Falta una guía de contribución (CONTRIBUTING.md)

**Acciones recomendadas**
1. Dividir `runner.ts` en `runner.lifecycle.ts` + `runner.exec.ts`
2. Dividir `useExercise` en `useRunnerLifecycle.ts` + `useExerciseActions.ts`
3. Añadir `CONTRIBUTING.md` con setup + convenciones + checklist de PR
4. Convertir los `as unknown as` en `wa-sqlite.d.ts` proper
   (o crear un wrapper typed)

### Seguridad — 8/10

**Fortalezas**
- 100% client-side; sin backend = sin superficie de ataque server
- Sin secretos, sin API keys
- Validación de inputs en el boundary (Runner, Validator)
- `verbatimModuleSyntax` previene imports no deseados
- `contentSecurityPolicy` configurable (default del Vite PWA)

**Debilidades**
- No hay un Security Checklist explícito (e.g. OWASP)
- `localStorage` se usa para cache de theme (no es sensible)
- `dangerouslySetInnerHTML` no se usa (bien)
- El Service Worker precachea assets sin SRI checks
- No hay CSP estricta (default Vite)

**Acciones recomendadas**
1. Crear `SECURITY.md` con el modelo de amenazas + checklist
2. Añadir CSP estricta via headers en `vite.config.ts`
3. Auditar uso de `eval` / `Function()` (no debería haber)
4. Validar que el `manifest.webmanifest` no expone rutas internas

### Rendimiento — 7.5/10

**Fortalezas**
- `useDebounce` en Playground
- `useMemo` extensivo en hooks
- WASM pre-bundled (no rebuild en runtime)
- Service Worker pre-cachea todo
- `Dexie` live queries son O(1) en la mayoría de operaciones

**Debilidades**
- No hay profiling real (Lighthouse, WebPageTest)
- El query executor espera `progress_handler` cada 1000 opcodes
  (podría ser más agresivo)
- `useLiveQuery` re-emite en cada cambio (puede ser excesivo)
- No hay `React.memo` en componentes grandes
- El `CourseSidebar` re-renderiza en cada navegación

**Acciones recomendadas**
1. Correr Lighthouse en CI y trackear scores
2. Añadir `React.memo` a `ExerciseCard`, `ExerciseView`
3. Implementar virtual scrolling en `ResultsTable` (ya tiene
   threshold pero falta benchmark)
4. Medir el TTI (Time to Interactive) con `web-vitals`

### Escalabilidad — 8/10

**Fortalezas**
- Servicios puros son trivialmente reutilizables
- Nuevas features se añaden sin tocar el engine (e.g. Study mode)
- Nuevas estrategias de validación = 1 archivo + 1 registro
- Nuevas lecciones = 1 archivo en `content/lessons/`
- i18n soporta 3 locales con claves planas

**Debilidades**
- `pocs/ui/` aumenta el bundle (no tree-shakeable)
- `useDatabase` singleton global es un single point of failure
  en tests concurrentes
- El Worker se reconstruye al cambiar de navegador (no hay
  migración de estado)

**Acciones recomendadas**
1. Tree-shake las POCs (mover a `pocs/` sin import en `main`)
2. Considerar multi-Worker para queries pesadas en paralelo
3. Añadir `CONTRIBUTING.md` con un template para nuevas features

### Testabilidad — 9/10

**Fortalezas**
- 981 tests, 89% lines / 79% branches
- Servicios puros con tests sin DOM
- Helpers reutilizables (`dbapi-mock`, `dexie-helper`, `wa-sqlite-harness`)
- Playwright e2e suite (CI only)
- vitest-axe para a11y

**Debilidades**
- `useDatabase`, `useQuery`, `useSchema` tienen tests pero
  faltan edge cases (recovery, cancellation, etc.)
- No hay test e2e para Study mode
- No hay cobertura enforced en CI

**Acciones recomendadas**
1. Añadir `coverage.thresholds` en `vitest.config.ts`
2. Test e2e para Study mode en Playwright
3. Tests de `useDatabase` para recovery (3 attempts)

### Mantenibilidad — 8.5/10

**Fortalezas**
- TypeScript strict + linter + formateo automático
- Design tokens centralizados
- Componentes pequeños y focused
- Tests sirven como documentación viva
- Servicios puros con boundaries claros

**Debilidades**
- Falta `CONTRIBUTING.md` con convenciones
- Algunos `*-REPORT.md` están desactualizados (citan Fases 0-8)
- No hay ADRs (Architecture Decision Records)
- El `roadmap.md` está desactualizado (no menciona Fases 12-15)

**Acciones recomendadas**
1. Crear `CONTRIBUTING.md`
2. Crear `docs/adr/` con las decisiones importantes
3. Actualizar `roadmap.md` o reemplazarlo por este `PROJECT_PLAN.md`
4. Mover `*-REPORT.md` a `docs/reports/` con versionado

### Documentación — 7.5/10

**Fortalezas**
- 12+ reports por fase
- `AGENTS.md` con información compacta para IAs
- `AI-ASSISTANT-DESIGN.md` con diseño detallado
- `REFACTOR-ROADMAP.md` con el plan de refactor
- README con quickstart + decisiones

**Debilidades**
- No hay user-facing docs (manual de uso)
- No hay `CONTRIBUTING.md` para nuevos contribuidores
- `roadmap.md` desactualizado
- Inline docs en el código son inconsistentes

**Acciones recomendadas**
1. Crear `docs/user-guide.md` (manual de uso)
2. Crear `CONTRIBUTING.md` con setup + convenciones
3. Consolidar `roadmap.md` → `PROJECT_PLAN.md`

### Cobertura de tests — 8.5/10

**Fortalezas**
- 981 tests
- 89% lines / 79% branches / 83% functions
- Servicios puros con 100% coverage
- Tests de PWA (precache, lifecycle)
- Tests de a11y (vitest-axe)
- Tests e2e con Playwright

**Debilidades**
- No enforced en CI (falta `coverage.thresholds`)
- Branches en 79% (objetivo: 85%)
- `useDatabase`, `useExercise` tienen gaps (recovery, etc.)
- No tests e2e para study mode

**Acciones recomendadas**
1. Añadir `coverage.thresholds` (lines ≥ 85%, branches ≥ 80%)
2. Cerrar gaps de branches en `useDatabase`, `useExercise`
3. Test e2e Study mode

---

# Roadmap

> Cada tarea tiene ID, prioridad, descripción, dependencias, archivos
> afectados, criterios de aceptación, riesgos y QA asociado.
> Las tareas críticas deben hacerse primero. El orden sugerido está
> marcado por el ID (menor = antes).

## Leyenda de prioridad

- 🔴 **Crítica**: bloquea releases o seguridad
- 🟠 **Importante**: mejora significativa de calidad o UX
- 🟡 **Recomendada**: nice-to-have que paga deuda técnica
- 🟢 **Opcional**: solo si hay tiempo

## Fase A — Mantenimiento y estabilidad (1-2 días)

### T1. Actualizar `roadmap.md` o eliminarlo (🟢)

**Objetivo:** El `roadmap.md` está desactualizado (menciona sólo
Fase 9). Este `PROJECT_PLAN.md` lo reemplaza.

**Descripción:** Decidir:
- (a) Mantener `roadmap.md` como resumen de Fases 0-14 y
  apuntar a `PROJECT_PLAN.md` para Fases 15+
- (b) Eliminar `roadmap.md` y consolidar en `PROJECT_PLAN.md`
- (c) Mover `roadmap.md` a `docs/legacy/roadmap-v0.md`

**Archivos:** `roadmap.md` (decidir), `PROJECT_PLAN.md` (link)

**Riesgo:** Bajo (es solo docs)

**Criterios de aceptación:**
- Un dev nuevo sabe dónde mirar el estado actual

**Estimación:** 0.5h

### T2. Crear `CONTRIBUTING.md` (🟡)

**Objetivo:** Que un contribuidor nuevo (humano o IA) sepa cómo
empezar.

**Descripción:** Documentar:
- Requisitos: Node 20+, pnpm/npm
- Setup: `npm install`
- Comandos clave: `npm test`, `npm run typecheck`, `npm run lint`
- Estructura de carpetas (referenciar `AGENTS.md` o `README.md`)
- Convenciones:
  - Naming (kebab-case / PascalCase / camelCase / UPPER_SNAKE)
  - Tests obligatorios antes de PR
  - Estructura de commits
  - Cómo añadir una lección (referenciar `AGENTS.md`)
  - Cómo añadir una estrategia de validación
  - Cómo añadir un idioma
- PR template (link a `.github/PULL_REQUEST_TEMPLATE.md`)
- Code review checklist

**Archivos:** `CONTRIBUTING.md` (nuevo)

**Riesgo:** Bajo

**Criterios de aceptación:**
- Un dev nuevo puede hacer su primer PR siguiendo solo este doc

**Estimación:** 2h

### T3. Mover `*-REPORT.md` a `docs/reports/` (🟢)

**Objetivo:** Reducir el ruido en la raíz del proyecto.

**Descripción:** Crear `docs/reports/` y mover:
- `SCAFFOLD-REPORT.md`
- `POC-ENGINE-REPORT.md`
- `POC-UI-REPORT.md`
- `WORKER-EXEC-REPORT.md`
- `WORKER-STORAGE-REPORT.md`
- `PERSISTENCE-REPORT.md`
- `UI-SHELL-REPORT.md`
- `EDITOR-REPORT.md`
- `EXERCISE-ENGINE-REPORT.md`
- `COURSE-CONTENT-REPORT.md`
- `COURSE-UI-REPORT.md`
- `POLISH-REPORT.md`
- `COVERAGE-REPORT.md`
- `CI-CD-REPORT.md`
- `OFFLINE-PWA-REPORT.md`
- `REFACTOR-ROADMAP.md`
- `AI-ASSISTANT-DESIGN.md`

Actualizar los links en `README.md` y `AGENTS.md`.

**Archivos:** crear `docs/reports/`, mover 15 archivos

**Riesgo:** Bajo (es solo movimiento de archivos)

**Criterios de aceptación:**
- La raíz del proyecto tiene solo README.md, AGENTS.md,
  PROJECT_PLAN.md, CHANGELOG.md, package.json, configs

**Estimación:** 0.5h

---

## Fase B — Deuda técnica del refactor (2-3 días)

### T4. Extraer `workerSessionService` de `useDatabase` (🟡)

**Objetivo:** Reducir `useDatabase` (385 LOC) a un thin wrapper.

**Descripción:** Mover la lógica de:
- Creación del Worker (singleton)
- Boot del worker (inicialización, retry)
- Recovery (MAX_RECOVERY_ATTEMPTS = 3)
- Cleanup (terminate handle)
- Estado de la sesión (status, generation, listeners)

A un `src/core/services/workerSessionService.ts` con funciones puras
que reciben las dependencias (la factory del Worker, los handlers
de eventos) por DI.

**Archivos:**
- `src/core/services/workerSessionService.ts` (nuevo)
- `src/hooks/useDatabase.ts` (refactor)
- `tests/unit/services/workerSessionService.test.ts` (nuevo)

**Riesgo:** Medio (toca el corazón del ciclo de vida del Worker;
puede romper tests existentes)

**Criterios de aceptación:**
- `useDatabase` < 100 LOC
- `workerSessionService` 100% cubierto
- Los 17 tests de `useDatabase` siguen pasando
- El manual de `OFFLINE-PWA-REPORT.md` se mantiene válido

**Estimación:** 5h

### T5. Dividir `runner.ts` (580 LOC) en 2 archivos (🟡)

**Objetivo:** Mejorar la cohesión del runner.

**Descripción:** Mover:
- `lifecycle.ts`: start, reset, destroy, ensureAlive
- `exec.ts`: runUserSql, check, revealSolution

Quedarse con `runner.ts` como thin re-exporter.

**Archivos:**
- `src/core/exercises/runner.ts` (split)
- `src/core/exercises/runner.lifecycle.ts` (nuevo)
- `src/core/exercises/runner.exec.ts` (nuevo)
- `tests/unit/exercises/runner.lifecycle.test.ts` (nuevo)
- `tests/unit/exercises/runner.exec.test.ts` (nuevo)

**Riesgo:** Bajo (puro refactor sin cambio de comportamiento)

**Criterios de aceptación:**
- Cada archivo < 300 LOC
- Cobertura combinada ≥ 90%
- Tests existentes siguen pasando

**Estimación:** 3h

### T6. Dividir `useExercise` (333 LOC) en 2 hooks (🟢)

**Objetivo:** Mejorar la cohesión del hook.

**Descripción:** Mover:
- `useExerciseLifecycle.ts`: auto-start, destroy, status, attempts
- `useExerciseActions.ts`: run, check, revealNextHint, revealSolution, reset

El `useExercise` actual queda como thin re-exporter + glue.

**Archivos:**
- `src/hooks/useExercise.ts` (split)
- `src/hooks/useExerciseLifecycle.ts` (nuevo)
- `src/hooks/useExerciseActions.ts` (nuevo)
- `tests/unit/hooks/useExerciseLifecycle.test.tsx` (nuevo)
- `tests/unit/hooks/useExerciseActions.test.tsx` (nuevo)

**Riesgo:** Medio (cambia API del hook; puede romper consumidores)

**Criterios de aceptación:**
- Cada hook < 200 LOC
- `ExerciseView.tsx` y `ExercisePage.tsx` no requieren cambios

**Estimación:** 4h

---

## Fase C — Cobertura y CI (1-2 días)

### T7. Enforce coverage thresholds en CI (🔴)

**Objetivo:** Bloquear PRs que bajen la cobertura.

**Descripción:** Añadir a `vitest.config.ts`:

```ts
coverage: {
  // ...
  thresholds: {
    lines: 85,
    branches: 80,
    functions: 85,
    statements: 85,
  },
}
```

Si alguna métrica cae, vitest falla. El CI bloquea el merge.

**Archivos:** `vitest.config.ts`

**Riesgo:** Bajo (los tests actuales pasan 89% lines / 79% branches,
  así que el threshold de 80% branches está al límite)

**Criterios de aceptación:**
- CI falla cuando un PR baja la cobertura
- `npm run test:coverage` falla en local cuando se baja

**Estimación:** 1h

### T8. Tests de recovery de `useDatabase` (🟠)

**Objetivo:** Cubrir el path de recovery del Worker.

**Descripción:** Añadir tests para:
- Worker boot falla → reintentar 3 veces → 'dead'
- Worker boot OK → crash mid-query → recovery re-abre DBs
- Worker boot OK → `retry()` después de 'dead'
- Recovery exhausto → 'dead' + lastError

**Archivos:** `tests/unit/hooks/useDatabase.test.tsx`

**Riesgo:** Bajo (solo tests)

**Criterios de aceptación:**
- 5+ tests nuevos
- Cobertura de `useDatabase` branches > 80%

**Estimación:** 3h

### T9. Tests de error de `useQuery` (🟠)

**Objetivo:** Cubrir el path de error (Comlink rejection, timeout).

**Descripción:** Añadir tests para:
- `api.exec` rechaza con un `Error` (Comlink-style)
- `api.exec` rechaza con un string (rare)
- `api.exec` rechaza con null / undefined
- `api.exec` resolve con `{ok: false, error: {...}}`
- Timeout fires antes de que el exec resuelva
- `cancel()` mid-execution

**Archivos:** `tests/unit/hooks/useQuery.test.tsx`

**Riesgo:** Bajo

**Criterios de aceptación:**
- 6+ tests nuevos
- Cobertura de `useQuery` > 90%

**Estimación:** 2h

### T10. Test e2e de Study mode (🟡)

**Objetivo:** Cubrir el flow completo de study mode.

**Descripción:** Añadir a `tests/e2e/study-mode.spec.ts`:
- Crear una DB de usuario
- Ir a una lección
- Seleccionar la DB como study DB
- Hacer un ejercicio (verificar que corre contra la study DB)
- Reset (verificar que la seed se re-aplica)
- Disable (verificar que el runner vuelve a working-copy)

**Archivos:** `tests/e2e/study-mode.spec.ts` (nuevo)

**Riesgo:** Bajo

**Criterios de aceptación:**
- Test e2e verde en CI
- El flow completo corre en < 30s

**Estimación:** 4h

---

## Fase D — Limpieza y consistencia (1 día)

### T11. Eliminar POCs del router de producción (🟡)

**Objetivo:** Reducir el bundle y la superficie de ataque.

**Descripción:** Decidir:
- (a) Mantener `pocs/` como tests internos, eliminar las rutas
  del router
- (b) Mantener todo (status quo)

Si (a): quitar `Poc3Pwa` y `Poc6Codemirror` de `src/router.tsx`.

**Archivos:** `src/router.tsx`

**Riesgo:** Bajo

**Criterios de aceptación:**
- `/poc/3` y `/poc/6` devuelven 404 (o se redirigen a `/`)
- El bundle de producción es más pequeño
- Los tests de `pocs/**/*.test.ts` siguen corriendo

**Estimación:** 0.5h

### T12. Crear `CONTRIBUTING.md` con plantilla (🟡)

> Cubierto por T2. Duplicado.

### T13. Crear `SECURITY.md` (🟡)

**Objetivo:** Documentar el modelo de seguridad y el checklist.

**Descripción:** Documentar:
- Threat model: 100% client-side, sin backend
- Superficie de ataque: DOM, Web Worker postMessage, localStorage,
  IndexedDB, OPFS
- Riesgos: XSS (mitigado por React), path traversal (no hay
  uploads de filesystem), supply chain (pin de versiones)
- Checklist: inputs validados, no `eval`, no `dangerouslySetInnerHTML`
- Electron Security Checklist: N/A (no usamos Electron)

**Archivos:** `SECURITY.md` (nuevo)

**Riesgo:** Bajo (es solo docs)

**Criterios de aceptación:**
- El doc cubre el threat model + checklist

**Estimación:** 2h

### T14. Eliminar `as unknown as` en `wa-sqlite` (🟡)

**Objetivo:** Mejorar la seguridad de tipos.

**Descripción:** Crear un `wa-sqlite.d.ts` interno (en `src/workers/`)
con las declaraciones mínimas. Reemplazar los `@ts-expect-error`
en `sqlite.worker.ts` por imports tipados.

**Archivos:** `src/workers/wa-sqlite.d.ts`

**Riesgo:** Medio (toca integraciones externas)

**Criterios de aceptación:**
- Sin `@ts-expect-error` en `sqlite.worker.ts`
- Sin `as unknown as` en producción

**Estimación:** 4h

---

## Fase E — Estudio mode (Fase 16 del roadmap original) (3-5 días)

### T15. Crear DB de usuario desde la lesson page (🟠)

**Objetivo:** Evitar que el usuario tenga que ir a `/databases`
solo para crear una study DB.

**Descripción:** En `LessonStudySection`, añadir un botón "Crear
nueva" que abra un modal con:
- Input para el nombre
- Botón "Crear y usar"
- El modal crea la DB vía `useUserDatabases.create(name)` y luego
  llama `useStudyDb.select(newRowId)`

**Archivos:** `src/ui/pages/LessonStudySection.tsx`, crear modal
inline o `LessonCreateDbDialog.tsx`

**Riesgo:** Bajo

**Criterios de aceptación:**
- El usuario puede crear una study DB sin salir de la lección
- El modal valida el nombre (mismas reglas que el create dialog)

**Estimación:** 3h

### T16. Persistir la selección de study DB en Dexie correctamente (🟠)

**Objetivo:** Asegurar que la selección se persiste cross-session.

**Descripción:** Verificar que:
- La selección se persiste en `defaultDb.lessonStudyDb` (DONE)
- Se restaura al recargar la página (DONE)
- Se restaura al volver a la lección después de visitar otra

**Archivos:** `src/hooks/useStudyDb.ts`, `src/ui/pages/LessonPage.tsx`

**Riesgo:** Bajo

**Criterios de aceptación:**
- Test e2e: crear study DB, navegar a otra página, volver, verificar
  que la selección sigue ahí

**Estimación:** 2h

---

## Fase F — ~~AI Assistant (Fase 15)~~ — ELIMINADA

> Decisión 2025-08-11: el mantenedor abandonó la idea. Las 7
> preguntas en `AI-ASSISTANT-DESIGN.md` quedan como referencia
> histórica. `AI-ASSISTANT-DESIGN.md` puede eliminarse en una
> limpieza futura si se desea.

---

## Fase G — i18n (1 día)

### T20. Completar `ca` y `en` (🟡)

**Objetivo:** Que la app esté disponible en catalán e inglés.

**Descripción:** Traducir todas las claves de `es` a `ca` y `en`.
Mantener el mismo set de claves (mismo `i18n.ts`).

**Archivos:** `src/core/i18n/i18n.ts`

**Riesgo:** Bajo

**Criterios de aceptación:**
- `t()` en `ca` e `en` devuelve texto en el idioma correcto
- Las claves que no estén traducidas caen al `es` (fallback)

**Estimación:** 4h

---

## Fase H — DX (1 día)

### T21. Scripts de `db:reset` y `db:seed` (🟢)

**Objetivo:** Ayudar al dev local a resetear la app.

**Descripción:** Añadir a `package.json`:
- `db:reset`: limpia `localStorage` y `IndexedDB`
- `db:seed`: pre-carga la app con datos de demo

**Archivos:** `package.json`, `scripts/db-reset.mjs`, `scripts/db-seed.mjs`

**Riesgo:** Bajo

**Criterios de aceptación:**
- `npm run db:reset` deja la app en estado limpio
- `npm run db:seed` rellena la app con datos de prueba

**Estimación:** 2h

### T22. `tsc --watch` en el editor (🟢)

**Objetivo:** Catch type errors en el editor (VSCode).

**Descripción:** Documentar en `AGENTS.md` cómo activar `tsc
--watch` en el IDE para tener feedback en tiempo real.

**Archivos:** `AGENTS.md`

**Riesgo:** Bajo

**Criterios de aceptación:**
- Un dev nuevo puede activar `tsc --watch` siguiendo solo `AGENTS.md`

**Estimación:** 0.5h

---

# Progreso

## Tareas completadas

- ✅ Fase 0–8 (Scaffold, POCs, Worker, Persistence, UI, Editor,
  Exercise engine, Course content, Course UI)
- ✅ Fase 9 (Databases + Playground enhancements)
- ✅ Fase 10 (PWA offline verification)
- ✅ Fase 11 (Test coverage a 80%+)
- ✅ Fase 12 (Settings + i18n)
- ✅ Fase 13 (Polish a11y + responsive)
- ✅ Fase 14 (CI/CD)
- ✅ Study mode (Fase 16 ad-hoc)
- ✅ Refactor de hooks (servicios puros)

## Tareas pendientes

Total: 22 tareas pendientes, organizadas en 8 fases (A-H).

Estimación total: 5-7 días de trabajo efectivo.

Por prioridad:
- 🔴 Críticas: 1 (T7)
- 🔴 Crítica: 1 (T7)
- 🟠 Importantes: 5 (T4, T8, T9, T15, T16)
- 🟡 Recomendadas: 12
- 🟢 Opcionales: 3

Por fase:
- A (mantenimiento): 3 tareas, 3h
- B (deuda refactor): 3 tareas, 12h
- C (cobertura): 4 tareas, 10h
- D (limpieza): 4 tareas, 8.5h
- E (study mode): 2 tareas, 5h
- ~~F (AI assistant): 3 tareas, 18h~~ **ELIMINADA**
- G (i18n): 1 tarea, 4h
- H (DX): 2 tareas, 2.5h

## Porcentaje total

Tareas totales (incluyendo Fases 0-14 + study mode + refactor): 50+
Tareas completadas: ~38
Tareas pendientes: 22 (en este PROJECT_PLAN)
Porcentaje completado: 76%

---

# Historial

## 2025-08-11 (sesión de auditoría)

**Resumen:** Auditoría completa del proyecto. Generación de
`PROJECT_PLAN.md` desde cero.

**Tareas completadas:** Ninguna implementación; solo docs y
planificación.

**Archivos modificados:**
- `PROJECT_PLAN.md` (nuevo, ~800 líneas)

**Problemas encontrados:**
- `roadmap.md` desactualizado (sólo cubre Fase 9)
- `pocs/ui/` aún en producción
- `wa-sqlite` sin tipos (`as unknown as` por todas partes)
- `useDatabase` grande (385 LOC)
- `runner.ts` grande (580 LOC)
- `useExercise` grande (333 LOC)
- No enforced coverage en CI
- No e2e de study mode
- i18n sólo `es` completo
- No `CONTRIBUTING.md`, `SECURITY.md`

 **Decisiones arquitectónicas:**
- Servicios puros en `src/core/services/` como patrón (ya en uso)
- `pocs/ui/` se queda hasta T11 (decisión explícita)
- AI Assistant abandonada (sesión 2025-08-11)

**Próximo paso recomendado:**
"La siguiente tarea recomendada es **T7** (enforce coverage
thresholds en CI) — es la única tarea crítica y la base para
mantener la calidad a largo plazo. Estimación: 1h."

---

# Próximo paso

**T7 — Enforce coverage thresholds en CI** (1h, 🔴 crítica)

Es la única tarea crítica y la base para mantener la calidad a
largo plazo. Cubre:
- Bloquea PRs que bajen la cobertura
- Los tests actuales pasan 89% lines / 79% branches, así que el
  threshold de 80% branches está al límite — habrá que ser
  cuidadoso si alguna otra tarea baja la cobertura en el proceso
- Cierra el gap de "calidad enforced" del proyecto

Una vez completada, el siguiente paso natural es **T3** (mover
*-REPORT.md a docs/reports/) — es rápido y limpia la raíz.

---

## 2025-08-11 (sesión de mantenimiento — Fase 1)

**Resumen:** Implementación de 4 tareas de la Fase A (mantenimiento)
y primera de la Fase C (cobertura). Se abandonó Fase F (AI Assistant)
a petición del mantenedor.

**Tareas completadas:**
- ✅ T7 — Enforce coverage thresholds en CI (`vitest.config.ts`)
- ✅ T3 — Mover `*-REPORT.md` a `docs/reports/`
- ✅ T2 — Crear `CONTRIBUTING.md`
- ✅ T8 — Tests de recovery de `useDatabase` (parcial)

**Archivos modificados:**
- `vitest.config.ts` — thresholds 88/78/80 + excludes para `dbapi.ts`,
  `types.ts`, `serialization-helper.ts`
- 15 `*.md` → `git mv docs/reports/`
- `README.md` — links actualizados a `docs/reports/`
- `AGENTS.md` — referencia a `PROJECT_PLAN.md` y `docs/reports/`
- `CONTRIBUTING.md` (nuevo, 266 líneas)
- `PROJECT_PLAN.md` — actualizado con el progreso de la sesión
- `tests/unit/hooks/useDatabase.test.tsx` — 3 tests nuevos

**Problemas encontrados durante la sesión:**
- Los tests de recovery reales del Worker (sin mock) son imposibles
  en vitest con happy-dom. Los nuevos tests verifican la API
  pública del hook (`registerDb`, `unregisterDb`, `retry`, shape) sin
  esperar el async boot. La lógica real del boot se valida vía
  POCs (que sí corren el Worker real).
- `toSerializedError` (en `serialization-helper.ts`) tiene un
  comportamiento distinto al `toErrorMessage` (en
  `queryRunnerService.ts`). No es un bug — son funciones distintas
  para contextos distintos — pero fue confuso durante los tests.

**Decisiones arquitectónicas:**
- Los excludes del coverage se justifican: `dbapi.ts` se prueba
  vía POCs, `types.ts` y `serialization-helper.ts` son type-only.

**Próximo paso recomendado:**
"La siguiente tarea recomendada es **T4** (extraer
`workerSessionService` de `useDatabase`) — la refactor de hooks
vale **TODOS** los puntos en mantenibilidad y T4 desbloquea
T8 (recovery tests reales). Estimación: 5h."

**Métricas finales de la sesión:**
- Tests: 984 (de 981)
- Coverage: 89.79% / 79.34% / 84.62% (de 89.72% / 79.23% / 84.62%)
- Archivos en raíz: 4 (de 19+)
- CONTRIBUTING.md: 266 líneas

---

# Auditoría continua

> Después de CADA tarea se debe actualizar este archivo con:
> - si apareció deuda técnica nueva
> - si cambió la prioridad del roadmap
> - si aparecieron tareas nuevas

(Por ahora vacío — se irá llenando con cada sesión.)
