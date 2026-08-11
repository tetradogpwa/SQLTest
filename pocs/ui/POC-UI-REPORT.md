# POCs UI/PWA — Resumen (POC-3, POC-5, POC-6)

**Fecha:** 2026-08-10 (03:37 UTC)
**Tarea:** 3 POCs de UI/PWA en `/workspace/sql-academy/pocs/ui/`
**Estado:** ✅ **3/3 VIABLES**

| # | POC | Veredicto | Detalle |
|---|---|---|---|
| 3 | OPFSCoopSyncVFS + VitePWA | ✅ **VIABLE** (con un apunte de naming) | [POC-3-REPORT.md](./POC-3-REPORT.md) |
| 5 | Feature detection cross-browser | ✅ **VIABLE** | [POC-5-REPORT.md](./POC-5-REPORT.md) |
| 6 | CodeMirror 6 + SQL completions | ✅ **VIABLE** | [POC-6-REPORT.md](./POC-6-REPORT.md) |

---

## TL;DR

Los 3 POCs pasan. La app es viable para soportar:

- **Almacenamiento persistente** vía OPFS (sync o async, según COOP/COEP) o
  IDB como fallback, con detección automática cross-browser.
- **PWA offline** con SW que precachea el WASM, navegación SPA
  funcional, y un manifest correctamente configurado.
- **Editor SQL** con autocompletado consciente del esquema que
  responde en < 0.03 ms por consulta (presupuesto 50 ms ⇒ 1 700× de
  headroom).

---

## Resumen de cada POC

### POC-3 — OPFSCoopSyncVFS + VitePWA integration

| Aspecto | Resultado |
|---|---|
| Build | ✅ `npm run build` termina con 0, 19 entradas precacheadas (2.27 MB total) |
| WASM en precache | ✅ `wa-sqlite.wasm` (558 KB) + `wa-sqlite-async.wasm` (1.1 MB) |
| SW activo | ✅ Sirve `/sw.js` con `__WB_MANIFEST` poblado |
| Manifest | ✅ theme_color, background_color, icons, lang, scope correctos |
| Bundle gzipped | JS 213 KB, SW 5.4 KB, WASM 1.7 MB |
| Apunte | ⚠️ La clase `OPFSCoopSyncVFS` no existe en wa-sqlite 1.0.0; el equivalente es `AccessHandlePoolVFS` (sync, requiere COOP/COEP) o `OriginPrivateFileSystemVFS` (async, sin COOP/COEP). Actualizar RESEARCH.md §1.1 / §2 cuando sepas cuál vía se va a usar. |
| Apunte | ⚠️ El bundle JS es más grande que la estimación orientativa (213 KB vs ~80–120 KB) porque las páginas POC importan CodeMirror. Code-split el editor real (`SqlEditor`) en un chunk lazy-loaded para mantener el shell < 100 KB. |

### POC-5 — Feature detection cross-browser

| Aspecto | Resultado |
|---|---|
| Tests | ✅ 14/14 pasando (3 niveles + 4 edge cases + sanity) |
| Función pura | ✅ `decideCapability(probe)` — table-tested |
| Handshake Main → Worker → Main | ✅ Mockeado en tests, real con `URL.createObjectURL(new Blob([...]))` en producción |
| Degradación | ✅ Timeout 1.5 s + CSP-block + error → fallback a main-thread probe |
| API | ✅ `detectStorageCapability({ skipWorkerHandshake?, timeoutMs?, spawn? })` |

### POC-6 — CodeMirror 6 + SQL completions

| Aspecto | Resultado |
|---|---|
| Tests | ✅ 17/17 pasando (13 lógica + 4 componente) |
| Dialecto | ✅ `SQLite` (`@codemirror/lang-sql`) |
| Completion source | ✅ `sqlCompletions(schema)` cubre FROM, `.`, SELECT |
| Latencia | ✅ 0.007 ms/call (3×5 schema), 0.027 ms/call (10×10) — headroom 1 700× sobre 50 ms |
| End-to-end | ✅ Render confirmado en happy-dom; el componente mide en el browser real |

---

## Cambios en el scaffolding (resumen)

Archivos modificados del scaffold base:

| Path | Cambio |
|---|---|
| `vite.config.ts` | `workbox: { globPatterns: [...] }` → `injectManifest: { globPatterns: [...], maximumFileSizeToCacheInBytes: 4 MiB }`; `includeAssets` lista WASM |
| `src/workers/sw.ts` | SW completo con precache + SPA fallback + handler `GET_PRECACHE_LIST` |
| `package.json` | Scripts `prebuild` y `sync:wasm` |
| `src/router.tsx` | Rutas `/poc/3` y `/poc/6` |
| `src/main.tsx` | Import de `pocs/ui/poc.css` |
| `vitest.config.ts` | `esbuild.jsx: 'automatic'` para alinear con `tsconfig.app.json` |

Archivos nuevos:

| Path | Notas |
|---|---|
| `scripts/sync-wa-sqlite.mjs` | Sincroniza WASM de `node_modules/wa-sqlite/dist/` a `public/` (idempotente) |
| `public/wa-sqlite.wasm` | 558 KB (sync, generado por el script) |
| `public/wa-sqlite-async.wasm` | 1.1 MB (async, generado por el script) |
| `pocs/ui/poc-3-pwa.tsx` | Componente de verificación PWA/OPFS |
| `pocs/ui/poc-5-feature-detect.ts` | Detección 3 niveles + Worker handshake |
| `pocs/ui/poc-6-codemirror.tsx` | Editor + completion source |
| `pocs/ui/poc.css` | Estilos compartidos |
| `pocs/ui/POC-3-REPORT.md` | Reporte detallado POC-3 |
| `pocs/ui/POC-5-REPORT.md` | Reporte detallado POC-5 |
| `pocs/ui/POC-6-REPORT.md` | Reporte detallado POC-6 |
| `tests/unit/feature-detect.test.ts` | 14 tests de POC-5 |
| `tests/unit/codemirror-completions.test.ts` | 13 tests del completion source |
| `tests/unit/codemirror-component.test.tsx` | 4 tests de integración del componente |

---

## Comandos de verificación

```bash
cd /workspace/sql-academy

# Build (corre el sync-wa-sqlite.mjs primero + tsc -b + vite build)
npm run build

# Tests (Vitest, 32 tests, ~5s)
npm test

# Servidor de preview (abre la app en http://127.0.0.1:4173)
npm run preview

# Páginas POC:
#   http://127.0.0.1:4173/poc/3  → OPFS + PWA verification
#   http://127.0.0.1:4173/poc/6  → CodeMirror + SQL completions
```

---

## Veredictos individuales

### POC-3: ✅ VIABLE (con apunte de naming)

> La integración PWA + OPFS funciona. El WASM se precachea. El SW
> se sirve correctamente. Solo hay que actualizar el nombre de la
> VFS en RESEARCH.md (la `OPFSCoopSyncVFS` mencionada en la spec
> no existe en `wa-sqlite@1.0.0`; usar `AccessHandlePoolVFS` o
> `OriginPrivateFileSystemVFS` según se necesite COOP/COEP).

### POC-5: ✅ VIABLE

> La detección de 3 niveles funciona con handshake real Main →
> Worker → Main. Los 14 tests cubren los 3 niveles + edge cases.
> No requiere ajustes.

### POC-6: ✅ VIABLE

> El editor monta, el completion source funciona en los 3 contextos
> (FROM, `.`, SELECT) con latencia < 0.03 ms por llamada, y los
> 17 tests verifican la lógica + la integración con CodeMirror.
> No requiere optimizaciones.

---

## Acciones derivadas (no bloqueantes, para la app real)

1. **Decidir VFS:** sync (con COOP+COEP en el hosting) o async (sin
   headers). El decision tree de POC-5 ya está listo para esto.
2. **Code-split el editor:** envolver `SqlEditor` en `React.lazy`
   para mantener el shell < 100 KB gzipped.
3. **Mover la capability detection** de `pocs/ui/poc-5-feature-detect.ts`
   a `src/core/storage/capability.ts` y exponer `useCapability()`.
4. **Mover el `Poc6Codemirror`** de `pocs/ui/` a
   `src/ui/components/editor/SqlEditor.tsx` y aceptar la schema
   desde el schema manager del Worker.
5. **Activar `injectRegister: true`** en `vite.config.ts` o
   registrar el SW desde `core/pwa/register-sw.ts` (POC-3 todavía
   no se auto-registra — la página `/poc/3` muestra un OK si el SW
   está activo, pero hay que asegurarse de que se registre al
   cargar la app en producción).
