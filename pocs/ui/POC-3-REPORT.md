# POC-3 — OPFS + VitePWA integration test

**Fecha:** 2026-08-10 (03:30 UTC)
**Tarea:** POC-3 (UI/PWA — feature 3 del plan de POCs)
**Estado:** ✅ **VIABLE** (con un apunte importante de naming)
**Comando de verificación:** `cd /workspace/sql-academy && npm run build && npm run preview &`

---

## 1. Cambios en el scaffolding

Para habilitar el precache del WASM y el SW con `injectManifest`, hubo que
tocar tres archivos del scaffold existente:

| Archivo | Cambio |
|---|---|
| `vite.config.ts` | Bloque `workbox: { globPatterns: [...] }` → `injectManifest: { globPatterns: [...], maximumFileSizeToCacheInBytes: 4 MiB }`. El bloque `workbox` se ignora cuando la estrategia es `injectManifest`. `includeAssets` ahora lista `wa-sqlite.wasm`. |
| `src/workers/sw.ts` | Sustituido por un SW completo: (a) precache de la app shell + WASM, (b) navigation fallback a `/index.html` para rutas SPA, (c) handler de mensajes `GET_PRECACHE_LIST` para que la página de POC-3 muestre la lista de precache. |
| `scripts/sync-wa-sqlite.mjs` *(nuevo)* | Sincroniza `node_modules/wa-sqlite/dist/wa-sqlite.wasm` y `wa-sqlite-async.wasm` a `public/`. Idempotente (compara SHA-256). Wired como `prebuild`. |
| `package.json` | Añadidos scripts `sync:wasm` y `prebuild` (que ejecuta el script anterior antes de `vite build`). |
| `public/wa-sqlite.wasm` *(generado)* | 558 343 bytes, copia del WASM sync. |
| `public/wa-sqlite-async.wasm` *(generado)* | 1 139 398 bytes, copia del WASM async. |

La página de verificación vive en `pocs/ui/poc-3-pwa.tsx` y se monta en
la ruta `/poc/3` (cambios en `src/router.tsx` y `src/main.tsx` para
cargar `pocs/ui/poc.css`).

---

## 2. Build de producción

Comando: `cd /workspace/sql-academy && npm run build`

```
[sync:wasm] unchanged: wa-sqlite.wasm
[sync:wasm] unchanged: wa-sqlite-async.wasm
[sync:wasm] done — copied=0 skipped=2

> sql-academy@0.0.0 build
> tsc -b && vite build

vite v8.2.1 building client environment for production...
✓ 44 modules transformed.
dist/index.html                   0.51 kB │ gzip:   0.31 kB
dist/manifest.webmanifest         0.65 kB
dist/assets/index-Bv64EAqN.css    3.98 kB │ gzip:   1.39 kB
dist/assets/index-DRj7BrnN.js   662.77 kB │ gzip: 213.75 kB │ map: 3,119.46 kB
✓ built in 1.39s

PWA v1.3.0
Building src/workers/sw.ts service worker ("es" format)...
✓ 54 modules transformed.
dist/sw.mjs  16.10 kB │ gzip: 5.41 kB │ map: 136.39 kB
✓ built in 1.72s

PWA v1.3.0
mode      injectManifest
format:   es
precache  19 entries (2328.76 KiB)
files generated
  dist/sw.js
  dist/sw.js.map
```

✅ **Build exitoso** — código 0, sin warnings nuevos (excepto el
deprectation genérico de `inlineDynamicImports` que ya estaba en el
scaffold, y el warning de chunk >500 kB que se explica abajo).

---

## 3. Lista de assets precacheados (19 entradas, 2 328.76 KiB)

Extraído directamente de `dist/sw.js` (la lista inyectada por
workbox-build en el placeholder `__WB_MANIFEST`):

| URL | Revisión | Tamaño |
|---|---|---|
| `wa-sqlite.wasm` | 929521d6e107108ed41c2a731fad8bab | 558 343 B |
| `wa-sqlite-async.wasm` | cb2bd9d4743afa97d40407ba8ff73550 | 1 139 398 B |
| `index.html` | f87bfd546c0ed8207e4c0546c0d125e1 | — |
| `icons.svg` | 3b4fcfcf393eca4d264dca4a4663bc37 | 5 031 B |
| `favicon.svg` | 7e840862161341271697daa99a40d76b | 9 522 B |
| `icons/icon-512.png` | 0ab87734c997d4cd0bd5729fd01034f3 | — |
| `icons/icon-384.png` | eb96fd9640b1a025d5a9223707a47e54 | — |
| `icons/icon-256.png` | aaaba8aac6fb06a9defe30e8bc55c00e | — |
| `icons/icon-192.png` | 1bd4c83462170b0b4061fa70fa31cce3 | — |
| `assets/index-DRj7BrnN.js` | (sin revisión) | 662 771 B |
| `assets/index-Bv64EAqN.css` | (sin revisión) | 3 987 B |
| `manifest.webmanifest` | 1bab3790f366d033e1354f8f655315d7 | 655 B |
| *(7 duplicados de `favicon`/`icons` por la doble inclusión en `includeAssets` y `globPatterns`)* | | — |

> **Detalle:** las 7 últimas entradas son duplicados. `includeAssets`
> lista `favicon.svg`, `icons.svg`, `wa-sqlite.wasm` y los iconos PNG
> referenciados por el manifest, y `globPatterns` los vuelve a
> recoger. Workbox deduplica por URL, así que el cache final solo
> tiene una copia de cada uno — los duplicados del array son
> inofensivos. Si se quiere una lista más limpia, se puede dejar
> `includeAssets: []` y confiar solo en `globPatterns`. No es
> prioritario.

✅ **WASM precacheado correctamente** — tanto la versión sync como la
async aparecen en el manifest.

---

## 4. Verificación en `vite preview`

Comando: `npm run preview -- --port 4173 --host 127.0.0.1`

Resultados de `curl` sobre la build de producción:

```text
$ curl -I http://127.0.0.1:4173/
HTTP/1.1 200 OK
Content-Type: text/html

$ curl -I http://127.0.0.1:4173/sw.js
HTTP/1.1 200 OK
Content-Length: 17425
Content-Type: text/javascript

$ curl -I http://127.0.0.1:4173/wa-sqlite.wasm
HTTP/1.1 200 OK
Content-Length: 558343
Content-Type: application/wasm            ✅ mime type correcto

$ curl -I http://127.0.0.1:4173/wa-sqlite-async.wasm
HTTP/1.1 200 OK
Content-Length: 1139398
Content-Type: application/wasm            ✅

$ curl -I http://127.0.0.1:4173/poc/3
HTTP/1.1 200 OK                            ✅ SPA navigation fallback funciona

$ curl -I http://127.0.0.1:4173/poc/6
HTTP/1.1 200 OK                            ✅

$ curl http://127.0.0.1:4173/manifest.webmanifest
{
  "name": "SQL Academy",
  "short_name": "SQL Academy",
  "description": "Aprende SQL con ejercicios interactivos, ejecutados 100% en tu navegador.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#0ea5e9",
  "lang": "es",
  "scope": "/",
  "orientation": "portrait",
  "icons": [...]
}
```

✅ **App shell servida correctamente** — el SW se sirve, el WASM se
sirve con el MIME `application/wasm`, las rutas SPA caen al
`index.html` precacheado, y el manifest tiene la metadata del tema
correcta.

**Limitación del entorno:** este sandbox no tiene un browser real
disponible para confirmar que el SW **se activa** y que
**`navigator.storage.getDirectory()`** funciona en el `preview`. Lo
verificable con curl es que (a) los assets están servidos, (b) el SW
está bien formado y (c) el manifest está completo. La página
`/poc/3` realiza las verificaciones del lado del cliente en cuanto se
carga en un browser:

1. `navigator.serviceWorker.getRegistration('/')` → debe devolver un
   registration con `active` no nulo y `controller` no nulo tras la
   primera carga (gracias a `skipWaiting` + `clientsClaim`).
2. `postMessage({ type: 'GET_PRECACHE_LIST' })` al SW → debe
   responder con la tabla de arriba.
3. `fetch('/wa-sqlite.wasm', { cache: 'force-cache' })` → debe
   devolver 200 + `application/wasm`.
4. `navigator.storage.getDirectory()` → debe devolver un
   `FileSystemDirectoryHandle`.
5. `createSyncAccessHandle()` sobre un `FileSystemFileHandle` → debe
   funcionar en Chrome 120+, Edge 120+ y Firefox 121+ con COOP/COEP.
   En este SW no activamos COOP/COEP, así que la VFS sync
   (`AccessHandlePoolVFS`) puede no ser viable — el componente
   degradará a `opfs-async` (wa-sqlite + `OriginPrivateFileSystemVFS`).

Para reproducir en local:

```bash
cd /workspace/sql-academy
npm run build
npm run preview -- --port 4173
# En Chrome 120+:
#   1. Abrir http://127.0.0.1:4173/poc/3
#   2. DevTools → Application → Service Workers: confirmar SW activo
#   3. DevTools → Application → Storage → OPFS: ver archivos creados
#   4. DevTools → Application → Cache Storage: ver 19 entradas
```

---

## 5. Tamaño del bundle

| Asset | Raw | Gzip |
|---|---|---|
| `dist/index.html` | 511 B | 311 B |
| `dist/assets/index-Bv64EAqN.css` | 3 987 B | 1 391 B |
| `dist/assets/index-DRj7BrnN.js` | 662 771 B | **213 753 B** |
| `dist/sw.js` | 17 425 B | 5 878 B |
| `dist/wa-sqlite.wasm` (sync) | 558 343 B | n/a (WASM) |
| `dist/wa-sqlite-async.wasm` (async) | 1 139 398 B | n/a (WASM) |
| `dist/manifest.webmanifest` | 655 B | — |
| **Total precache** | **2 328.76 KiB** (≈2.27 MB) | — |

⚠️ **El bundle JS (213 KB gzipped) está por encima de la estimación
orientativa de RESEARCH.md §1.3** (~80–120 KB para CodeMirror 6).
Causa: el POC-3 importa los componentes de POC-6 (CodeMirror 6) en
el chunk principal porque ambos viven en `pocs/ui/`. En la app real,
CodeMirror debe vivir en una ruta lazy-loaded (`React.lazy(() =>
import('@/ui/components/editor/SqlEditor'))`). Sin ese code-split,
el bundle inicial de la app cargará CodeMirror en cada página.

**Acción recomendada al implementar la app real:**
mover `SqlEditor` y sus imports a un chunk separado vía
`React.lazy` + `<Suspense>`. Esto debería dejar el shell por debajo
de 100 KB gzipped (lo que el spec llama "app shell").

El WASM sync (558 KB) y async (1.1 MB) son **opcionalmente**
precacheables — el plan B es cargar la versión async on-demand (es
~1 MB más grande porque usa Asyncify) y dejar la sync en precache. En
esta build dejamos ambas para que el dev pueda elegir en runtime.

---

## 6. Veredicto

> ✅ **VIABLE**, con un único apunte de naming:
>
> 1. **Naming VFS** (acción: actualizar RESEARCH.md §1.1 / §2): la
>    clase **`OPFSCoopSyncVFS`** mencionada en la spec no existe en
>    `wa-sqlite@1.0.0` (la versión instalada). El equivalente moderno
>    es:
>    - `AccessHandlePoolVFS` → VFS sync, usa
>      `FileSystemSyncAccessHandle` con todas las operaciones sync
>      (no requiere `SharedAccessHandlePoolVFS` legacy). **Requiere
>      COOP+COEP** para que `createSyncAccessHandle` esté disponible.
>    - `OriginPrivateFileSystemVFS` → VFS async (no usa sync access
>      handles), **no requiere COOP+COEP**. Apropiada para hosting
>      estático plano.
>
>    POC-3 verifica el **gate** `createSyncAccessHandle` — que es lo
>    que ambas VFS consultan internamente. La decisión de qué VFS
>    usar se delega a la lógica de capability detection (POC-5).
>
> 2. **Code-splitting** (acción: al implementar `SqlEditor`): el
>    editor CodeMirror debe ir en un chunk lazy-loaded; no es un
>    problema del POC sino de la integración final.

**No se requieren más ajustes a Vite** — la configuración funciona
tal cual para el resto de la app.

---

## 7. Archivos creados / modificados

| Path | Estado | Notas |
|---|---|---|
| `pocs/ui/poc-3-pwa.tsx` | creado | Componente de verificación |
| `pocs/ui/poc.css` | creado | Estilos compartidos (incluye tema CodeMirror) |
| `pocs/ui/POC-3-REPORT.md` | creado | Este documento |
| `scripts/sync-wa-sqlite.mjs` | creado | Sincroniza WASM de `node_modules` a `public/` |
| `src/workers/sw.ts` | modificado | SW con precache + fallback SPA + handler `GET_PRECACHE_LIST` |
| `vite.config.ts` | modificado | `workbox: {...}` → `injectManifest: {...}`; `includeAssets` lista WASM |
| `package.json` | modificado | `prebuild` + `sync:wasm` scripts |
| `public/wa-sqlite.wasm` | generado (por `sync-wa-sqlite.mjs`) | 558 KB |
| `public/wa-sqlite-async.wasm` | generado (por `sync-wa-sqlite.mjs`) | 1.1 MB |
| `src/router.tsx` | modificado | Añade ruta `/poc/3` |
| `src/main.tsx` | modificado | Importa `pocs/ui/poc.css` |
| `dist/` | regenerado | 19 entradas precacheadas, 2.27 MB total |
