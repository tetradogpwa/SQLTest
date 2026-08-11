# POC-5 — Feature detection cross-browser

**Fecha:** 2026-08-10 (03:32 UTC)
**Tarea:** POC-5 (UI/PWA — feature 5 del plan de POCs)
**Estado:** ✅ **VIABLE**
**Comando de verificación:** `cd /workspace/sql-academy && npm test`

---

## 1. Resumen

Implementa `detectStorageCapability()` con el patrón de 3 niveles
descrito en RESEARCH.md §2.1, y una función pura `decideCapability()`
para que la decisión sea 100 % testeable sin browser.

**Diseño:** la decisión final es una función pura sobre un objeto
`StorageProbe` con tres flags booleanos (`hasGetDirectory`,
`hasCreateSyncAccessHandle`, `hasIndexedDB`). El handshake con un Web
Worker es la única vía **fiable** para detectar
`createSyncAccessHandle` — en algunos browsers ese método solo
existe en contexto de Worker, así que detectarlo desde el main
thread puede dar lugar a falsos positivos. La función de
producción `detectStorageCapability()` crea un Worker inline (Blob
URL), le pide el probe y combina su respuesta con la del main
thread (el main thread es la fuente autoritativa para
`hasIndexedDB` y como backup para `hasGetDirectory`).

**Testabilidad:** la función acepta un callback `spawn` opcional
que permite inyectar un Worker simulado. Los tests cubren los 4
niveles (opfs-sync, opfs-async, idb, memory) + 3 edge cases
(timeout, error de Worker, modo `skipWorkerHandshake`).

---

## 2. Decisión de capability (función pura)

```typescript
export function decideCapability(probe: StorageProbe): StorageCapability {
  if (probe.hasGetDirectory && probe.hasCreateSyncAccessHandle) return 'opfs-sync'
  if (probe.hasGetDirectory) return 'opfs-async'
  if (probe.hasIndexedDB) return 'idb'
  return 'memory'
}
```

Tabla de verdad verificada por los tests:

| `hasGetDirectory` | `hasCreateSyncAccessHandle` | `hasIndexedDB` | Resultado |
|---|---|---|---|
| true | true | true | **opfs-sync** |
| true | false | true | **opfs-async** |
| false | false | true | **idb** |
| false | false | false | **memory** |
| false | true | true | idb *(paradox guard)* |

---

## 3. Handshake Main → Worker → Main

El Worker de probe es un script inline (~700 B sin minificar) que
corre en un `Worker({ type: 'classic' })`. No importa nada externo
(no necesita bundling); se sirve vía Blob URL en runtime. Su
cuerpo:

```js
self.onmessage = async (event) => {
  const { id } = event.data || {}
  try {
    const probe = {
      hasGetDirectory: typeof self.navigator?.storage?.getDirectory === 'function',
      hasCreateSyncAccessHandle: await (async () => {
        if (!self.navigator?.storage?.getDirectory) return false
        try {
          const root = await self.navigator.storage.getDirectory()
          const fh = await root.getFileHandle('__cap_probe__', { create: true })
          return typeof fh.createSyncAccessHandle === 'function'
        } catch { return false }
      })(),
      hasIndexedDB: typeof self.indexedDB !== 'undefined',
    }
    self.postMessage({ id, ok: true, probe })
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || String(err) })
  }
}
```

**Por qué Worker y no main thread:** la documentación de
`createSyncAccessHandle` indica que en algunos navegadores
(especialmente Safari pre-17.4) la API solo está disponible en
contexto de Worker; desde el main thread puede no existir aunque
sí funcione en el Worker que abra la DB. El probe desde el main
thread siempre reporta `hasCreateSyncAccessHandle: false` (es la
decisión correcta, conservadora). Solo el Worker puede afirmar
"true".

**Timeout:** 1 500 ms por defecto. Si el Worker no responde (CSP
lo bloquea, red bloqueada, etc.), se cae al probe del main thread
y de ahí a la decisión.

---

## 4. Tests

Comando: `cd /workspace/sql-academy && npm test`

```
 RUN  v2.1.9 /run/csi/mount-root/.../sql-academy

 ✓ tests/unit/feature-detect.test.ts (14 tests) 57ms
   ✓ decideCapability — pure decision over StorageProbe (5)
       ✓ Level 1: returns opfs-sync when getDirectory + createSyncAccessHandle are both true
       ✓ Level 2: returns opfs-async when getDirectory is true but sync handle is not
       ✓ Level 3: returns idb when only indexedDB is present
       ✓ Level 4: returns memory when nothing is present
       ✓ sync handle is ignored without getDirectory (defensive — should not happen in practice)
   ✓ probeMainThread — best-effort main-thread capability check (1)
       ✓ reports hasCreateSyncAccessHandle=false even if navigator.storage.getDirectory exists
   ✓ detectStorageCapability — full handshake (7)
       ✓ Level 1: returns opfs-sync when the Worker reports both OPFS APIs
       ✓ Level 2: returns opfs-async when Worker reports getDirectory but no sync handle
       ✓ Level 3: returns idb when Worker reports only indexedDB
       ✓ Level 4: returns memory when Worker reports nothing
       ✓ falls back to memory when the Worker times out (e.g. CSP blocks Worker creation)
       ✓ falls back to idb on Worker error when main thread has indexedDB
       ✓ skipWorkerHandshake mode defers to main-thread probe and never returns opfs-sync
   ✓ PROBE_WORKER_SOURCE (1)
       ✓ is a non-empty string containing the expected handler
 ✓ tests/unit/smoke.test.ts (1 test) 2ms

 Test Files  2 passed (2)
      Tests  15 passed (15)
   Duration  2.55s
```

✅ **Los 3 niveles del spec + 4 cubren el flujo completo
Main → Worker → Main, más 3 edge cases y 1 sanity check sobre el
código fuente del Worker.**

---

## 5. Uso esperado en la app

```typescript
import { detectStorageCapability } from '@/pocs/ui/poc-5-feature-detect'

// En main.tsx, antes de montar la app:
const capability = await detectStorageCapability()
console.log('Storage capability:', capability)
// → 'opfs-sync' (Chrome 120+, Edge 120+, Firefox 121+ con COOP/COEP)
// → 'opfs-async' (Safari 17.4+, navegadores sin COOP/COEP)
// → 'idb' (navegadores antiguos)
// → 'memory' (modo privado estricto, navegadores muy antiguos)
```

Cuando la lógica de la app esté implementada, este valor debería
moverse a `core/storage/capability.ts` (reemplazando el stub) y
leerse vía `useCapability()` o un context.

---

## 6. Decisiones y desviaciones del spec

1. **Worker inline vs. archivo `.ts` separado.** RESEARCH.md §15.2
   lista `src/core/worker/worker-manager.ts` como el módulo
   responsable del handshake. La spec no detalla cómo se hace el
   probe de capability. Elegí un Worker inline (Blob URL) porque
   (a) evita acoplar el test del capability a la pipeline de
   bundling de Vite, (b) el código del Worker cabe en una pantalla
   y es trivial de revisar, (c) en producción es 1 round-trip HTTP
   evitable. Migrar a un `.ts` separado es trivial cuando la
   app real lo necesite.

2. **`probeMainThread()` separado.** En lugar de hacer la decisión
   solo en el Worker, el main thread reporta su propio probe y
   combinamos ambos. Esto cubre el caso "Worker bloqueado por CSP
   + main thread tiene IDB" → caemos a `idb` en lugar de
   `memory`.

3. **Timeout de 1 500 ms.** No estaba en el spec. Lo añadí para
   evitar que la app se quede colgada en la carga inicial si el
   Worker no responde (CSP estricto, red filtrada, etc.). Es
   ajustable vía `DetectOptions.timeoutMs`.

4. **`skipWorkerHandshake` como opt-in.** Útil para tests
   rápidos y para diagnosticar problemas — pero la app de
   producción siempre debería usar el handshake (default).

---

## 7. Veredicto

> ✅ **VIABLE.** La detección de 3 niveles funciona como se
> esperaba, está cubierta por 14 tests (incluyendo el flujo
> Main → Worker → Main con mocks) y degrada con gracia ante
> timeouts, errores de Worker y navegadores sin OPFS.
>
> No se requieren ajustes. Cuando se integre en la app, mover
> este código a `src/core/storage/capability.ts` y exponer un
> `useCapability()` hook.

---

## 8. Archivos creados / modificados

| Path | Estado | Notas |
|---|---|---|
| `pocs/ui/poc-5-feature-detect.ts` | creado | Implementación + tipos + Worker inline |
| `pocs/ui/POC-5-REPORT.md` | creado | Este documento |
| `tests/unit/feature-detect.test.ts` | creado | 14 tests cubriendo 3 niveles + edge cases |
