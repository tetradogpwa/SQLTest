# PERSISTENCE-REPORT — Fase 3 (persistencia Dexie + 9 stores)

**Fecha:** 2026-08-10
**Alcance:** Capa de persistencia local con Dexie para SQL Academy.
**Spec:** RESEARCH.md §12 (3 stores distintos) + §13 (ownership: solo Main Thread).
**Estado:** ✅ Implementación completa. Build verde, 82/82 tests de persistencia en verde, suite completa (198/198) también en verde.

---

## 1. Archivos producidos / modificados

### 1.1 Capa de producción (`src/core/persistence/`)

| Archivo | Líneas | Rol |
|---|---:|---|
| `dexie.ts` | 93 | Schema Dexie con las 9 tablas (fuente de verdad única). Refactor para reusar los tipos de `types.ts`. |
| `types.ts` | 201 | Interfaces públicas (`Progress`, `Database`, `Setting`, `Settings`, `QueryHistory`, `SavedQuery`, `EditorDraft`, `SnapshotMetadataEntry`, `UndoEntry`, `ExerciseStat` y auxiliares). |
| `settings.ts` | 171 | `SettingsStore` con defaults tipados, get/set/getAll/resetAll/subscribe. |
| `progress-store.ts` | 272 | `ProgressStore` (markLessonCompleted, markExerciseCompleted, markExerciseAttempted, getCourseProgress, etc.). |
| `editor-drafts.ts` | 139 | `EditorDraftStore` (upsert + debounce en hook + `getMostRecentDraft`, `pruneOlderThan`). |
| `query-history.ts` | 102 | `QueryHistoryStore` (LRU 100 por DB). |
| `saved-queries.ts` | 100 | `SavedQueriesStore` (CRUD + search). |
| `db-metadata.ts` | 93 | `DbMetadataStore` (metadata de DBs en OPFS). |
| `snapshot-metadata-store.ts` | 100 | `SnapshotMetadataStore` (metadata de snapshots, prune LRU 5/DB). |
| `undo-store.ts` | 82 | `UndoStore` (LRU 5/DB). |
| `persistence-service.ts` | 288 | `PersistenceService` (puente Worker → Main; `handleMessage` para los 7 tipos de mensaje; helpers de draft). |
| `index.ts` | 56 | Barrel de exportación pública. |
| **Subtotal src/** | **1 697** | |

### 1.2 Tests (`tests/unit/persistence/` + helpers)

| Archivo | Líneas | Tests |
|---|---:|---:|
| `settings.test.ts` | 123 | 9 |
| `progress-store.test.ts` | 156 | 11 |
| `editor-drafts.test.ts` | 114 | 10 |
| `query-history.test.ts` | 121 | 9 |
| `saved-queries.test.ts` | 120 | 10 |
| `db-metadata.test.ts` | 108 | 8 |
| `snapshot-metadata.test.ts` | 113 | 8 |
| `undo-store.test.ts` | 124 | 7 |
| `persistence-service.test.ts` | 195 | 10 |
| `tests/helpers/dexie-helper.ts` | 32 | helper compartido |
| `tests/setup.ts` (modificado) | 18 | instala `fake-indexeddb/auto` |
| **Subtotal tests/** | **1 224** | **82** |

**TOTAL**: **2 921 líneas** (producción + tests + helpers).

### 1.3 Modificaciones fuera del scope de persistencia

- `package.json` — añadido `fake-indexeddb@^6.2.5` a `devDependencies`.
- `tests/setup.ts` — añadido `import 'fake-indexeddb/auto'` para que Dexie pueda abrirse dentro del entorno `happy-dom` de Vitest.

---

## 2. Verificación

### 2.1 TypeScript estricto

```bash
$ npx tsc --noEmit -p tsconfig.app.json
# (sin output → 0 errores)
```

`tsconfig.app.json` activa `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`. Todas las firmas de stores están tipadas con generics; no se usa `any` (sólo `unknown` para casts defensivos).

### 2.2 Tests de persistencia (resumen)

```bash
$ npm test -- --run tests/unit/persistence

 RUN  v2.1.9 /run/csi/mount-root/.../sql-academy

 ✓ tests/unit/persistence/persistence-service.test.ts (10 tests) 57ms
 ✓ tests/unit/persistence/progress-store.test.ts (11 tests) 70ms
 ✓ tests/unit/persistence/undo-store.test.ts (7 tests) 54ms
 ✓ tests/unit/persistence/snapshot-metadata.test.ts (8 tests) 46ms
 ✓ tests/unit/persistence/saved-queries.test.ts (10 tests) 63ms
 ✓ tests/unit/persistence/editor-drafts.test.ts (10 tests) 74ms
 ✓ tests/unit/persistence/query-history.test.ts (9 tests) 170ms
 ✓ tests/unit/persistence/settings.test.ts (9 tests) 46ms
 ✓ tests/unit/persistence/db-metadata.test.ts (8 tests) 51ms

 Test Files  9 passed (9)
      Tests  82 passed (82)
   Duration  9.59s
```

### 2.3 Suite completa (Fase 2 ya existente + Fase 3)

```bash
$ npx vitest run
# ...
 Test Files  22 passed (22)
      Tests  198 passed (198)
   Duration  27.87s
```

Los 116 tests pre-existentes (Fase 2, code-mirror, statement analyzer, etc.) **siguen pasando** — la Fase 3 no ha tocado nada fuera de `src/core/persistence/`, `tests/setup.ts` y `tests/helpers/dexie-helper.ts`.

### 2.4 Build de producción

```bash
$ npm run build
# ...
dist/assets/index-Bv64EAqN.css    3.98 kB │ gzip:   1.39 kB
dist/assets/index-DRj7BrnN.js   662.77 kB │ gzip: 213.75 kB │ map: 3,119.46 kB

[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
# ...
✓ built in 1.37s

PWA v1.3.0
Building src/workers/sw.ts service worker ("es" format)...
# ...
transforming...✓ 54 modules transformed.
rendering chunks...
computing gzip size...
dist/sw.mjs  16.10 kB │ gzip:  5.41 kB │ map:   136.39 kB

✓ built in 1.18s

PWA v1.3.0
mode      injectManifest
format:   es
precache  19 entries (2328.76 KiB)
files generated
  dist/sw.js
  dist/sw.js.map
```

Build **código 0**. La advertencia de "chunks > 500 kB" ya existía antes de esta tarea y no es regresión introducida por la Fase 3.

---

## 3. Decisiones de diseño relevantes

### 3.1 Schema Dexie — fuente de verdad única

`src/core/persistence/dexie.ts` queda como el **único** lugar donde se declaran las 9 tablas con sus índices. La especificación lo exige ("mantén el schema en dexie.ts como fuente de verdad única"). Los *tipos fila* (`ProgressRow`, `DatabaseRow`, …) que el scaffold original tenía en ese archivo se **re-expresan** como alias de los tipos públicos de `types.ts`, para que cualquier cambio de forma se haga en un solo sitio.

`types.ts` no contiene lógica — solo interfaces. Esto evita ciclos de import entre `dexie.ts` y los stores.

### 3.2 Ownership: el Worker habla con Dexie solo vía `PersistenceService`

Per RESEARCH.md §13.1. El Worker **nunca** importa Dexie. En su lugar, emite mensajes de tipo `PersistenceMessage` (unión discriminada por `type`) y la Main Thread los aplica al store correspondiente. La firma concreta:

```ts
type PersistenceMessage =
  | { type: 'snapshot:created';   dbId: string; snapId: string; ... }
  | { type: 'snapshot:restored';  dbId: string; snapId: string; timestamp: number }
  | { type: 'undo:entry';        dbId: string; operation: string; ... }
  | { type: 'query:executed';    dbId: number; sql: string; ... }
  | { type: 'db:registered';     dbId: string; name: string; ... }
  | { type: 'db:deleted';        dbId: string; timestamp: number }
  | { type: 'db:sizeChanged';    dbId: string; sizeBytes: number; ... }
```

`PersistenceService.handleMessage()` despacha cada `type` al store apropiado y devuelve `Promise<void>`. Los errores se loguean y se absorben para no bloquear mensajes posteriores (un fallo de persistencia no debe colgar la app).

El service también expone `saveDraft`/`loadDraft`/`deleteDraft` — el camino que el hook `useEditorDraft` usará para el autosave debounced. Aquí **no** se debouncea: la spec lo deja en el componente.

### 3.3 `SettingsStore.subscribe` — implementación custom (no Dexie hooks)

Dexie 4 expone `table.hook('creating' | 'updating' | 'deleting', handler)` para escuchar cambios, **pero los hooks disparan *dentro* de la transacción IDB, antes de que el commit sea visible**. Si dentro del handler se intenta leer otra vez la tabla, se obtiene el valor *anterior*. Lo verifiqué con un experimento aislado antes de codificar.

La solución: el store mantiene un `Set<SettingsListener>` y `set()`/`resetAll()` llaman a un `notify()` privado *después* del `await` del write. El snapshot que el listener recibe se construye vía `getAll()` (que ya rellena defaults), garantizando consistencia. Si un mutador externo (poco probable, pero posible) escribe directamente en `db.settings`, los listeners no se enteran — el contrato es "mutar a través del store, escuchar a través de `subscribe`".

### 3.4 `EditorDraftStore.saveDraft` — upsert manual

El schema es `editorDrafts: '++id, [contextType+contextId], updatedAt'`. El PK es `id` (autoincrement) y `[contextType+contextId]` es un índice secundario — un `put({...})` *no* hace upsert por el índice secundario, generaría filas duplicadas. La solución es un lookup-then-update dentro de una transacción `rw`, exactamente lo que el spec del scaffold prefiguraba en `dexie.ts:127`. Esto está documentado en el cuerpo de la función.

### 3.5 `QueryHistoryStore.enforceLimit` — implementado como O(n) trim

El spec dice "101ª entrada evicta la 1ª". `enforceLimit(dbId, maxEntries=100)` cuenta el total, hace un `sortBy('executedAt')` (que toca el índice `[dbId+executedAt]` para ser eficiente), elimina las `overflow` más antiguas con `bulkDelete`. Es `O(n)` en el peor caso pero `n` está acotado por 100 por construcción — aceptable.

### 3.6 `ProgressStore.getRecentExerciseAttempts` — full scan explícito

El schema `exerciseStats: '++id, [exerciseId+timestamp], exerciseId, attemptType'` **no** indexa `timestamp` como columna independiente. Una consulta `orderBy('timestamp')` no usaría índice. La opción "ortodoxa" sería añadir `timestamp` al schema, pero **el spec exige mantener el schema como fuente de verdad única** y el de RESEARCH.md §12.1 no lo incluye. Hago un `toArray()` + sort en memoria, y lo documento en el cuerpo de la función. La tabla es pequeña en la práctica (una fila por interacción del usuario) y el dashboard solo muestra las últimas 5–10.

### 3.7 `ProgressStore` desacoplado del catálogo de contenido

`getCourseProgress()` necesita saber el total de lecciones y ejercicios para calcular el porcentaje. El catálogo vive en `src/content/lessons/`, que **no existe todavía** (Fase 6). El store recibe un `CourseCatalogProvider` por constructor (DI) y trae un default vacío — un instalador fresco reporta `0/0 = 0%`, que es coherente con "no hay curso todavía". La app real inyectará el provider cuando la Fase 6 aterrice.

### 3.8 `dbId: number` vs `dbId: string`

La spec del Worker (Fase 2) usa `dbId: number` para `QueryResult`, `SnapshotMetadata`, etc. La spec de la Fase 3 (este informe) usa `dbId: string` para `snapshotMetadata`/`undoHistory` y `dbId: number` para `queryHistory`/`savedQueries`. Esto se debe a que las primeras representan la DB "del usuario" (slug legible) y las segundas la DB "abierta en el Worker" (handle numérico). El `PersistenceService` traduce entre ambos en su `handleMessage` (`query:executed.dbId: number` se escribe tal cual en `queryHistory`; `snapshot:created.dbId: string` se escribe tal cual en `snapshotMetadata`). **No se modifica el schema** — Dexie indexa el campo independientemente de su tipo.

### 3.9 `useLiveQuery` no se importa aquí

El spec de la Fase 3 no lo menciona y la capa de persistencia debe quedar libre de dependencias de React. Los consumidores que quieran reactividad importan `useLiveQuery` de `dexie-react-hooks` directamente en sus hooks (`useSettings`, `useProgress`, …) y operan sobre el singleton `db` exportado de `dexie.ts`. La `SettingsStore.subscribe()` cubre los consumidores no-React.

---

## 4. Desviaciones del spec y por qué

| # | Desviación | Razón |
|---|---|---|
| 1 | `SettingsStore.subscribe` no usa `hook('creating' \| 'updating' \| 'deleting')` de Dexie | Verificado experimentalmente: esos hooks disparan *antes* del commit, así que un `getAll()` post-hook leería datos stale. Se usa un `Set<Listener>` interno y notify explícito post-`await`. |
| 2 | `ProgressStore.getRecentExerciseAttempts` hace full scan en vez de `orderBy('timestamp')` | El schema RESEARCH.md §12.1 no indexa `timestamp` como columna. Mantener el schema como fuente de verdad única fue prioritario. |
| 3 | `EditorDraftStore.saveDraft` hace lookup-then-update manual en vez de `put()` directo | El PK es `++id` (autoincrement) — `put({})` sin `id` siempre añade fila nueva, no upserta. Se documenta en el cuerpo. |
| 4 | `ProgressStore` recibe `CourseCatalogProvider` por DI con default vacío | El catálogo `src/content/lessons/` aún no existe (Fase 6). El default reporta `0%` en lugar de fallar. |
| 5 | `PersistenceService` añade un getter `isAttached()`/`getWorkerApi()` | La spec lista `attach()`/`detach()` pero el campo `workerApi` quedaba como "declared but never read" bajo `noUnusedLocals`. Los getters exponen el binding de forma útil para código Comlink-aware sin romper la API pedida. |
| 6 | `ProgressStore` ya no inyecta `settings` (campo eliminado) | El spec original del task lo listaba en opciones pero no tenía uso real; lo retiré para evitar `noUnusedLocals` y por YAGNI. |
| 7 | `queryHistory` se enforça el límite dentro de `handleMessage('query:executed')` (no solo en `addEntry`) | Defense-in-depth: cualquier llamada a `addEntry` (sea vía service o vía store) puede acabar con muchos registros si la app hace batching. |
| 8 | `index.ts` re-exporta también tipos auxiliares (`DatabaseOrigin`, `SettingsListener`, …) | Para que el barrel sea autosuficiente y `import type { ... } from '@/core/persistence'` cubra el 100% de los casos de uso del UI. |

---

## 5. Cómo se usan los stores desde la UI (preview)

```ts
import {
  settings, settings as defaultSettings,
  progressStore,
  editorDrafts,
  queryHistory,
  savedQueries,
  dbMetadata,
  snapshotMetadataStore,
  undoStore,
  persistence,
  type Database,
  type Settings,
} from '@/core/persistence'

// Reactivo
await settings.set('theme', 'dark')
const t = await settings.get('theme') // 'dark'

// No reactivo (lectura puntual)
const cp = await progressStore.getCourseProgress()

// Worker → UI (Main Thread recibe y persiste)
comlinkWorker.addEventListener('message', (e) => {
  if (e.data?.kind === 'persist') void persistence.handleMessage(e.data.payload)
})
```

---

## 6. Conclusión

- ✅ 12 archivos de producción (≈ 1 700 líneas), 9 archivos de tests + 1 helper (≈ 1 200 líneas, 82 tests).
- ✅ Build verde, TypeScript estricto verde, 198/198 tests en verde.
- ✅ Schema Dexie intacto (sigue siendo la fuente de verdad única).
- ✅ Worker no toca Dexie: `PersistenceService` es el único punto de entrada desde mensajes del Worker.
- ✅ Sin `any`. Documentación inline en cada decisión de diseño no trivial.

Listo para la Fase 4 (snapshots v2) y para que la UI empiece a consumir los stores con `useLiveQuery`.
