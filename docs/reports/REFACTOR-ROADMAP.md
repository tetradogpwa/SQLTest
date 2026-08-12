# Refactor Roadmap — separación UI / lógica + tests exhaustivos

> **Status: draft v0.1** — esperando OK del mantenedor para
> implementar. La meta es "no haya caso por probar y sea todo
> correcto".

## 0. Diagnóstico

Hoy la app tiene tres tipos de código:

1. **Lógica pura** (sin DOM, sin React): `validator`, `runner`,
   `statement-analyzer`, `import-export-manager`, `vfs-io`, etc.
   Bien testeada.
2. **Hooks** que combinan `useState` + llamadas a la API + lógica
   de presentación embebida (`useUserDatabases`, `useQuery`,
   `useExercise`, etc.). Parcialmente testeados.
3. **Componentes** que renderizan + manejan eventos + calculan
   estado derivado + a veces validan input. Casi sin tests unitarios.

**Las fugas más dolorosas** (que nos han mordido):

- `useUserDatabases.importFile` mete lógica de negocio: lee
  bytes, sanitiza nombre, decide ID, mapea errores. Imposible
  testear sin Dexie + Comlink.
- `useUserDatabases.exportFile` crea un Blob con mime type
  hardcoded.
- `useUserDatabases.create` aplica `isValidName` + slugifica.
- `PlaygroundPage.handleExecute` mezcla análisis de statements,
  captura de auto-snapshot, y dispatch del query.
- Modales (`CreateDatabaseDialog`, `ImportDatabaseDialog`,
  `RenameDialog`, `DeleteConfirmDialog`) tienen validación +
  submit logic inline.

**El patrón que aplicaremos**:

```
┌──────────────────────────────────────────────────────────┐
│  Componentes (React puro, presentacional)                │
│  - reciben state + callbacks                            │
│  - sin lógica de negocio                                │
│  - testeables con @testing-library/react                 │
└──────────┬───────────────────────────────────────────────┘
           │ llama
           ▼
┌──────────────────────────────────────────────────────────┐
│  Hooks (React adapter)                                  │
│  - useState + useEffect + useLiveQuery                   │
│  - delegan al service                                   │
│  - mapean errores tipados a UI state                    │
│  - testeables con mocks del service                     │
└──────────┬───────────────────────────────────────────────┘
           │ llama
           ▼
┌──────────────────────────────────────────────────────────┐
│  Services (pure TypeScript, sin React)                  │
│  - funciones puras o async (con DI para I/O)            │
│  - todas las decisiones de negocio                      │
│  - todos los throw con errores tipados                  │
│  - testeables con vitest puro (no DOM)                  │
└──────────────────────────────────────────────────────────┘
```

## 1. Criterio de "correcto"

Para cada servicio extraído:

- ✅ **100% lines + 100% branches** en el archivo del servicio.
- ✅ Cada función pública tiene tests para:
  - happy path
  - cada branch del input (vacío, límite, caracteres especiales)
  - cada branch del output (éxito, error tipado)
  - invariantes del state (e.g. el ID assignment es monotónico)
- ✅ Cada error class tiene un test que verifica constructor + `name` + `cause`.
- ✅ Cada validador tiene fixtures válidos + inválidos.
- ✅ Ninguna función toca `Date.now()`, `Math.random()`, `fetch`,
  `localStorage` directamente — recibe todo por DI.

Para cada hook que use el service:

- ✅ El hook tiene una versión "stateless" / "service-only" testeable.
- ✅ El test del hook mockea el service y verifica la traducción
  state ↔ service.
- ✅ Los errores del service se mapean a `error: string | null` en
  el state del hook.

Para cada componente:

- ✅ Smoke test con el state inicial (default props).
- ✅ Test por cada handler (click, change, submit).
- ✅ Test del "empty state" + "loading" + "error" cuando aplique.
- ✅ A11y: aria-labels, roles, focus management.

## 2. Fases

### Phase A — `userDatabasesService` (la fuga más grande)

**Mover de `useUserDatabases.ts` a `src/core/services/userDatabasesService.ts`**:

- `sanitizeName(name: string): string` — ya existe en `import-export-manager.ts` pero vive en el worker. La movemos al Main Thread y la compartimos.
- `isValidName(name: string): { ok: boolean; errorKey?: string }` — la validación con mensaje de error.
- `fileToId(name: string, randomId: () => string): string` — el slug del nombre + random suffix.
- `toErrorMessage(err: unknown): string` — mapea los errores del worker / API a mensajes user-facing.
- `createDatabaseRow(args): Database` — la transformación de `(dbId, name, sizeBytes)` a fila de Dexie.
- `toExportBlob(bytes: Uint8Array, name: string): { blob: Blob; filename: string }` — la conversión bytes → Blob.

**Tests (`tests/unit/services/userDatabasesService.test.ts`)**:

- `sanitizeName`: vacíos, con espacios, con mayúsculas, con unicode,
  con caracteres prohibidos, con extensión `.db`, con path
  traversal (`../etc/passwd`), con longitudes límite (1, 64, 65).
- `isValidName`: 6+ fixtures inválidos + 4+ válidos.
- `fileToId`: casos con/sin extensión, con caracteres especiales,
  con random determinístico.
- `toErrorMessage`: cada error class del worker + `Error` genérico
  + string + null + undefined.
- `createDatabaseRow`: timestamps, defaults, edge cases de sizeBytes.
- `toExportBlob`: bytes vacíos, bytes con mime, mime override.

**Refactor del hook**:

- `useUserDatabases` queda como un thin wrapper: state + delegates
  al service + la llamada `api.*` (que no se puede mockear en puro
  vitest, pero la lógica que envuelve sí).

### Phase B — `playgroundController`

**Mover de `PlaygroundPage.tsx` a `src/core/services/playgroundController.ts`**:

- `shouldAutoSnapshot(statements: AnalyzedStatement[], dbId: number, defaultDbId: number): boolean`
  — encapsula la regla "captura snapshot si es destructivo y no es
  el playground default".
- `isDdl(statements: AnalyzedStatement[]): boolean` — extrae la
  regla que decide cuándo re-introspectar el schema.
- `makeExecuteHandler(deps): (sql: string) => Promise<void>` —
  inyectar deps (api, run, refresh, invalidate, setError) y
  devolver el handler ya cableado. Esto permite testear la pipeline
  completa sin React.

**Tests**:

- `shouldAutoSnapshot`: SELECT → false, DELETE → true (y no es
  default), DELETE sobre default → false, DROP TABLE → true,
  multi-statement mixto.
- `isDdl`: cualquier CREATE/DROP/ALTER → true, lo demás → false.
- `makeExecuteHandler`: cada rama del pipeline se testea con
  mocks de las deps. El test verifica que ante un SELECT simple:
  1. NO captura snapshot.
  2. Llama `run(sql)`.
  3. NO llama `invalidate` ni `refreshSchema`.
- Para un DELETE: invierte las expectativas.
- Para un fallo de `snapshot` (no fatal): el run sigue.
- Para un fallo de `run`: el `refreshSchema` no se llama.

### Phase C — modal logic

**Mover la lógica de submit de los modales a funciones puras**:

- `validateCreateName(name: string, t: (k: string) => string): string | null` — el `validateName` que ya existe pero vive en `CreateDatabaseDialog`.
- `validateImportFile(file: File, t): { ok: true; sanitized: string } | { ok: false; errorKey: string }` — el bloque inline del dialog.
- `deriveDisplayName(file: File, override: string): string` — la regla `override || file.name sin extensión`.
- `validateRename(name: string, currentName: string, t): string | null` — la validación inline del rename.
- `validateDelete(name: string, t): string | null` — la validación inline del delete (mínima pero queremos tests).

**Tests**: mismos criterios. Cada función con al menos 6 fixtures.

### Phase D — limpieza de hooks

`useSettings` ya es bastante puro. Verifico que `set` + `resetAll` cubran todos los casos.

`useQuery` mezcla la lógica de "cancel in-flight + persist history" con el wrapper de Dexie. Extraigo un `queryRunnerService.ts` con:
- `enforceTimeout(startedAt: number, timeoutMs: number): { timedOut: boolean; ms: number }`
- `buildHistoryEntry(...)` — la fila de `queryHistory`.

`useExercise` es el más complejo (Fase 6). Lo dejo fuera de este roadmap a menos que la cobertura de `core/exercises` ya esté al 80% — la lógica vive en `runner.ts` y `validator.ts` que ya están testeados. Verifico.

`useDatabase` es thin wrapper sobre Comlink. Solo testeo el `__resetDatabaseSession` helper.

## 3. Estructura de archivos

```
src/core/services/
  userDatabasesService.ts
  playgroundController.ts
  queryRunnerService.ts
  modalLogic.ts
  errors.ts                 # tipos de error compartidos

tests/unit/services/
  userDatabasesService.test.ts
  playgroundController.test.ts
  queryRunnerService.test.ts
  modalLogic.test.ts
```

## 4. Estimación

Cada fase es ~1 día de trabajo + 1 día de tests, asumiendo foco total:

| Fase | Horas | Tests nuevos | Coverage delta |
|------|-------|--------------|----------------|
| A — userDatabases | 4h | ~25 | +3% lines |
| B — playground | 3h | ~15 | +2% lines |
| C — modal logic | 3h | ~20 | +2% lines |
| D — settings/query/useDatabase | 2h | ~10 | +1% lines |
| **Total** | **12h** | **~70** | **+8% lines** |

Después de las 4 fases, la expectativa es **≥ 90% lines / ≥ 85% branches** global.

## 5. Riesgos + mitigaciones

| Riesgo                                                | Mitigación |
|--------------------------------------------------------|------------|
| Refactor introduce bugs en la UI                       | Snapshot tests existentes + tests de los hooks antes de tocar |
| Service con too many parameters                        | Agrupar en `deps: ServiceDeps` interface; tests instancian `deps: {}` literal |
| Comlink + Dexie no se pueden testear en vitest puro    | Service solo se ocupa de pure logic; I/O se inyecta |
| "Exhaustive testing" se vuelve infinito                | Criterio de salida: 100% branch coverage + cada error class cubierta + cada branch del input |

## 6. Definition of Done

- ✅ Todos los archivos en `src/core/services/` tienen 100% line + 100% branch coverage.
- ✅ `useUserDatabases` queda con < 50 LOC (solo wiring).
- ✅ `PlaygroundPage.handleExecute` queda con < 5 LOC.
- ✅ Los modales no contienen `if (validationError) setError(...)` inline — eso vive en el service.
- ✅ CI sigue verde (`npm run typecheck && npm run lint && npm run test && npm run build`).
- ✅ No hay nuevos warnings de lint.
- ✅ El coverage global sube al menos 6 puntos (88 → ≥ 94 lines).

## 7. Lo que NO está en scope

- Reemplazar Comlink (overkill).
- Migrar a un state management library (Zustand, etc.). El
  useState + useLiveQuery es suficiente.
- Refactor de `core/exercises/` — ya está al 84% lines y tiene
  11 estrategias testeadas. Tocar sin motivo es ruido.
- Refactor de `core/i18n/` — ya está testeado.
- Tests visuales (Playwright `toHaveScreenshot`) — siguen siendo
  manuales / e2e.

## 8. Orden de implementación

1. **A** (userDatabasesService) — la fuga más grande, ya tenemos
   contexto de los bugs recientes. Empezamos aquí.
2. **C** (modal logic) — corto y de bajo riesgo. Gana momentum.
3. **B** (playgroundController) — más complejo, mejor hacerlo
   cuando A y C estén validados.
4. **D** (limpieza) — el último, cuando el resto esté estable.

Si apruebas el plan arranco con A. Si quieres ajustar scope
(decirme qué fases saltarte) o agregar una fase, lo hacemos
antes de tocar código.
