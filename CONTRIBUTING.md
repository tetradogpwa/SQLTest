# Contributing

> Bienvenido a SQL Academy PWA. Este documento describe cómo empezar,
> qué convenciones seguir y cómo pasar el checklist de PR.
>
> Para el estado actual del proyecto ver [`PROJECT_PLAN.md`](./PROJECT_PLAN.md).
> Para la arquitectura de un módulo ver `docs/reports/<phase>-REPORT.md`.

## Requisitos

- **Node.js** ≥ 20.x
- **npm** ≥ 9.x
- Editor con TypeScript (recomendado: VSCode con `tsc --watch`)

## Setup local

```bash
git clone <repo>
cd SQLTest
npm install                # instala todo (wa-sqlite WASM incluido)
npm start                  # http://localhost:5173
```

Otros comandos útiles:

```bash
npm run typecheck   # tsc --noEmit -p tsconfig.app.json
npm run lint        # oxlint (sin config, rápido)
npm run test        # vitest run (suite completa, ~60s)
npm run test:coverage # vitest con cobertura (HTML + lcov en ./coverage)
npm run test:watch  # vitest en modo watch
npm run test:ui     # vitest --ui (interfaz web)
npm run test:e2e    # playwright (requiere Chromium)
npm run build       # sync-wa-sqlite.mjs + tsc -b + vite build
npm run preview     # sirve ./dist en local
```

## Pre-PR checklist (obligatorio)

```bash
npm run typecheck   # 0 errores
npm run lint        # 0 errores
npm run test        # todos pasan
npm run build       # produce dist/ verde
```

El CI ejecuta los mismos pasos + coverage gate (líneas ≥ 88%,
branches ≥ 78%, funciones ≥ 80%).

## Estructura de carpetas

```
src/
├── core/
│   ├── exercises/      # Motor pedagógico (runner, validator, 11 strategies, hint-engine)
│   ├── persistence/    # Dexie + PersistenceService (Main Thread único que escribe)
│   ├── services/       # PURE TS logic (testable sin DOM)
│   ├── storage/        # OPFS + capability detection
│   ├── i18n/           # es (completo), ca/en (stubs)
│   ├── sql/, worker/, pwa/  # placeholders
├── content/
│   ├── databases/      # 4 seeds (library, tienda, social, empresa)
│   ├── lessons/        # 16 lecciones (4 archivos)
│   ├── locales/        # i18n JSONs
│   ├── glossary.ts, loaders.ts, stats.ts, study-guide.ts
├── workers/            # SQLite Worker + 9 managers
├── ui/
│   ├── components/     # 8 carpetas por feature
│   ├── pages/          # 7 páginas
│   └── styles/         # reset, tokens, global
└── hooks/              # 10 hooks (useDatabase, useQuery, useSchema, useExercise, ...)

tests/
├── unit/
│   ├── services/       # tests puros de los servicios
│   ├── components/     # tests de componentes (DOM + RTL)
│   ├── hooks/          # tests de hooks
│   ├── core/           # tests de core (exercises, persistence, etc.)
│   ├── pages/          # tests de páginas
│   └── workers/        # tests de managers del worker
├── helpers/             # dbapi-mock, dexie-helper, wa-sqlite-harness
└── e2e/                # playwright (CI only)

pocs/                   # POC-1 a POC-6 (origen del scaffold, mantener tests)
```

## Convenciones

### Naming

- **Archivos**: kebab-case (`user-databases-service.ts`)
- **Clases / tipos**: PascalCase (`UserDatabasesService`)
- **Funciones / variables**: camelCase (`createDatabase`)
- **Constantes**: UPPER_SNAKE (`MAX_IMPORT_BYTES`)
- **Tipos de un solo uso**: prefijo `T` (`TInput`, `TResult`)

### Imports

- **type-only explícito** (`verbatimModuleSyntax` en `tsconfig.app.json`):
  ```ts
  import type { Database } from '../core/persistence'
  ```
- Sin barrel files nuevos (preferir imports explícitos).
- **No path aliases** — usar paths relativos (`../foo`).

### Estructura de carpetas al añadir

| Quiero añadir... | Dónde va |
|---|---|
| Una nueva estrategia de validación | `src/core/exercises/strategies/<name>.strategy.ts` + registro en `index.ts` |
| Una nueva lección | `src/content/lessons/<db>.ts` + import en `index.ts` + run `npm run test:unit content/` |
| Un nuevo idioma | `src/core/i18n/i18n.ts` (extender `SUPPORTED_LOCALES` + el dictionary) |
| Un nuevo service | `src/core/services/<name>Service.ts` + tests en `tests/unit/services/` |
| Un nuevo hook | `src/hooks/use<X>.ts` + tests en `tests/unit/hooks/` |
| Una nueva página | `src/ui/pages/<Name>Page.tsx` + tests en `tests/unit/pages/` + entrada en `src/router.tsx` |
| Un nuevo manager del worker | `src/workers/<name>-manager.ts` + tests + wiring en `sqlite.worker.ts` |
| Un nuevo icono o asset | `public/` (PWA lo pre-cachea) |

### Estilo de código

- **Funciones puras** en `src/core/services/` con DI explícito. No
  tocar `Date.now()`, `Math.random()`, `fetch` directamente.
- **Hooks como thin wrappers** sobre services + Dexie. No poner
  lógica de negocio en el hook.
- **Componentes presentacionales** en `src/ui/components/<feature>/`.
  Cero estado propio. Recibir datos y callbacks, emitir eventos.
- **Comentarios en español** para el usuario, en inglés para devs.
- **Textos de UI en i18n** — usar `useT('domain.subject')`. **Nunca**
  hardcodear strings en componentes.
- **CSS Modules** (`*.module.css` junto a `*.tsx`); tokens globales
  en `src/ui/styles/`.

### TypeScript

`tsconfig.app.json` es estricto. Lo importante:
- `noUncheckedIndexedAccess`: cada `arr[i]` es `T | undefined`.
  Guard con `if (arr[i])` o usar `.at()`.
- `verbatimModuleSyntax`: separar type-only imports.
- `erasableSyntaxOnly`: sin enums, sin namespaces, sin parameter
  properties en classes. Usar:
  - `const Foo = { BAR: 'bar' } as const` en vez de `enum Foo`
  - `type Foo = { ... }` en vez de `namespace Foo`
  - Constructores explícitos en vez de `constructor(public x: number)`

### Tests

- **Servicios puros** con `vitest` puro. Sin DOM.
- **Hooks** con `vi.mock` o `createTestDb` (ver `tests/helpers/`).
- **Componentes** con `render` + `screen` + `fireEvent` o
  `@testing-library/user-event`.
- **Worker** con `tests/helpers/wa-sqlite-harness.ts` para los
  tests de integración real (VACUUM INTO, snapshots).
- **Cobertura mínima** (enforced en CI): 88% lines / 78% branches /
  80% functions. Si añades código que baja la cobertura, añade
  los tests en el mismo PR.

### Commits y PRs

- **Commits en inglés** (Conventional Commits encouraged):
  - `feat(useExercise): add studyDbId option`
  - `fix(queryExecutor): handle undefined rc gracefully`
  - `refactor(services): extract studyDbService from hook`
  - `test(useStudyDb): add coverage for select/clear paths`
  - `docs(roadmap): update with new study mode task`
- **PR title**: Conventional Commits, ≤ 72 chars.
- **PR body**: usar la plantilla `.github/PULL_REQUEST_TEMPLATE.md`.
- **Un commit por tarea** (o squash al final).
- **No mezclar refactor + feature** en el mismo PR.

## Checklist de PR

Antes de pedir review, verifica:

- [ ] `npm run typecheck` pasa
- [ ] `npm run lint` pasa
- [ ] `npm run test` pasa (suite completa)
- [ ] `npm run test:coverage` ≥ 88% lines / 78% branches / 80% functions
- [ ] `npm run build` produce `dist/` verde
- [ ] Si el cambio toca un módulo nuevo, hay tests en `tests/unit/<area>/`
- [ ] Si el cambio añade texto de UI, hay entradas en los 3 locales
  (`es` completo + stubs `ca`/`en`)
- [ ] Si el cambio toca `PROJECT_PLAN.md`, la tarea está marcada
  como completada en el historial
- [ ] Si el cambio descubrió deuda técnica nueva, hay una tarea en
  el plan

## Cómo añadir una nueva estrategia de validación

Ejemplo: `MyStrategy` para validar queries que usen `LIMIT`.

1. Crear `src/core/exercises/strategies/limit.strategy.ts`:
   ```ts
   import type { ValidationContext, ValidationResult, ValidationStrategy } from '../types'
   
   const myStrategy: ValidationStrategy = {
     type: 'limit',
     label: 'Uso de LIMIT',
     check(ctx: ValidationContext): ValidationResult {
       // ... tu lógica ...
       return { passed: true, strategyType: 'limit' }
     },
   }
   
   export default myStrategy
   ```

2. Registrar en `src/core/exercises/strategies/index.ts`:
   ```ts
   import myStrategy from './limit.strategy'
   
   export const defaultStrategies: ValidationStrategy[] = [
     // ... existentes ...
     myStrategy,
   ]
   ```

3. Tests en `tests/unit/exercises/strategies/limit.test.ts`.

4. Uso en un exercise: en `src/content/lessons/<db>.ts`:
   ```ts
   validation: [{ type: 'limit', orderMatters: true }]
   ```

## Cómo añadir una nueva lección

1. Identifica a qué base de datos pertenece (library / tienda / etc.)
2. Editar `src/content/lessons/<db>.ts`
3. Añadir un objeto `Lesson` al array exportado
4. Verificar el schema: el loader de `course-shape.test.ts` lo valida
5. Tests: `npm run test:unit content/`

## Cómo debuggear un test que falla

```bash
# 1. Reproducir localmente
npx vitest run tests/unit/<file>.test.tsx

# 2. Sólo el test específico (por nombre)
npx vitest run tests/unit/<file>.test.tsx -t "test name"

# 3. Ver el output completo con stack
npx vitest run --reporter=verbose

# 4. Si es un test e2e (Playwright)
npx playwright test tests/e2e/<file>.spec.ts --headed
```

## Cómo reportar un bug

1. Buscar en `github.com/tetradogpwa/SQLTest/issues`
2. Si no existe, abrir uno nuevo usando `.github/ISSUE_TEMPLATE/bug.md`
3. Incluir:
   - Versión (Settings → Acerca de → Versión + Build)
   - Capacidad del worker (Settings → Acerca de → Almacenamiento)
   - Output de la consola del browser
   - Output de `console` del Service Worker (DevTools → Application → Service Workers → Inspect)
   - Pasos para reproducir

## Recursos adicionales

- [`AGENTS.md`](./AGENTS.md) — Información compacta sobre el proyecto
- [`README.md`](./README.md) — Quickstart + features
- [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) — Estado y roadmap
- [`docs/reports/`](./docs/reports/) — Reportes por fase
- [`.github/workflows/`](./.github/workflows/) — Pipeline de CI
- [`.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md) — Plantilla de PR
