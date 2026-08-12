# SQL Academy — Scaffolding Report

**Fecha:** 2026-08-10 (re-verificado 03:21 UTC)
**Tarea:** scaffold (POC-0)
**Estado:** ✅ Completado — 6/6 checks del punto 6 de la spec pasan (re-verificado en esta sesión).

---

## 1. Versiones instaladas

Resueltas con `npm ls --depth=0` tras `npm install`.

### Dependencias (runtime)

| Paquete | Versión declarada | Versión instalada |
|---|---|---|
| `react` | `^19.2.8` | **19.2.8** |
| `react-dom` | `^19.2.8` | **19.2.8** |
| `react-router-dom` | `^7.0.0` | **7.18.2** |
| `comlink` | `^4.4.2` | **4.4.2** |
| `dexie` | `^4.0.0` | **4.4.4** |
| `dexie-react-hooks` | `^1.1.7` | **1.1.7** |
| `wa-sqlite` | `^1.0.0` | **1.0.0** |
| `lucide-react` | `^0.460.0` | **0.460.0** |
| `@uiw/react-codemirror` | `^4.23.0` | **4.25.11** |
| `@codemirror/lang-sql` | `^6.8.0` | **6.10.0** |
| `@codemirror/state` | `^6.5.0` | **6.7.1** |
| `@codemirror/view` | `^6.35.0` | **6.43.8** |
| `@codemirror/commands` | `^6.7.0` | **6.10.4** |
| `@codemirror/language` | `^6.10.0` | **6.12.4** |
| `@codemirror/autocomplete` | `^6.18.0` | **6.20.3** |
| `@codemirror/search` | `^6.5.0` | **6.7.1** |
| `@codemirror/lint` | `^6.8.0` | **6.9.7** |
| `@lezer/highlight` | `^1.2.0` | **1.2.3** |

> **Nota deliberada:** `@sqlite.org/sqlite-wasm` **no se instaló**, como pide la
> spec (decidimos `wa-sqlite` + `OPFSCoopSyncVFS`, que evita COOP/COEP y el
> requisito de SharedArrayBuffer). Ver `vite.config.ts` para la exclusión
> en `optimizeDeps`.

### Dependencias (dev)

| Paquete | Versión declarada | Versión instalada |
|---|---|---|
| `vite` | `^8.2.0` | **8.2.1** |
| `typescript` | `~6.0.2` | **6.0.3** |
| `@vitejs/plugin-react` | `^6.0.4` | **6.0.5** |
| `vite-plugin-pwa` | `^1.0.0` | **1.3.0** |
| `vitest` | `^2.1.0` | **2.1.9** |
| `@vitest/ui` | `^2.1.0` | **2.1.9** |
| `happy-dom` | `^15.11.0` | **15.11.7** |
| `@testing-library/react` | `^16.1.0` | **16.3.2** |
| `@testing-library/jest-dom` | `^6.6.0` | **6.9.1** |
| `workbox-window` | `^7.3.0` | **7.4.1** |
| `workbox-precaching` | `^7.3.0` | **7.4.1** |
| `@types/node` | `^24.13.3` | **24.13.3** |
| `@types/react` | `^19.2.17` | **19.2.18** |
| `@types/react-dom` | `^19.2.3` | **19.2.4** |
| `oxlint` | `^1.75.0` | **1.77.0** (lo añade el template de Vite) |

Total de paquetes instalados: **440** + lockfile generado en `package-lock.json`.

---

## 2. Output de `npm run build` (últimas 20 líneas)

```
PWA v1.3.0
Building src/workers/sw.ts service worker ("es" format)...
vite v8.2.1 building client environment for production...

 WARN  inlineDynamicImports option is deprecated, please use codeSplitting: false instead.

transforming...✓ 54 modules transformed.
rendering chunks...
computing gzip size...
dist/sw.mjs  15.69 kB │ gzip: 5.27 kB │ map: 132.05 kB

✓ built in 1.94s

PWA v1.3.0
mode      injectManifest
format:   es
precache  10 entries (228.89 KiB)
files generated
  dist/sw.js
  dist/sw.js.map
```

Resultado del bundle principal:

```
dist/index.html                   0.51 kB │ gzip:  0.31 kB
dist/manifest.webmanifest         0.65 kB
dist/assets/index-BuiY5RRh.css    2.97 kB │ gzip:  1.20 kB
dist/assets/index-m9OGo5ef.js   230.89 kB │ gzip: 73.90 kB │ map: 1,273.37 kB
```

`dist/` contiene: `index.html`, `manifest.webmanifest`, `sw.js` + sourcemap,
`favicon.svg`, `icons.svg`, `icons/icon-192.png … icon-512.png`.

---

## 3. Output de `npm test`

```
> sql-academy@0.0.0 test
> vitest run


 RUN  v2.1.9 /run/csi/mount-root/.../sql-academy

 ✓ tests/unit/smoke.test.ts (1 test) 2ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  03:14:24
   Duration  1.52s (transform 44ms, setup 477ms, collect 9ms, tests 2ms, environment 698ms, prepare 131ms)
```

---

## 4. Verificación de los 6 checks del punto 6

| # | Check | Resultado |
|---|---|---|
| 1 | `npm install` termina con código 0 | ✅ `added 440 packages, audited 441 packages in 1m` — sin errores fatales. |
| 2 | `npm run build` termina con código 0 y produce `dist/index.html` + `dist/manifest.webmanifest` | ✅ Ambos archivos presentes; `manifest.webmanifest` con `name=SQL Academy`, `theme_color=#0ea5e9`, `background_color=#0f172a`. |
| 3 | `npm run dev` arranca y sirve la app en `http://localhost:5173` | ✅ `VITE v8.2.1 ready in 297 ms`; `curl -I http://localhost:5173/` → `HTTP/1.1 200 OK`; `/src/main.tsx` y `/src/App.tsx` también se sirven. |
| 4 | `npm test` corre y el smoke test pasa | ✅ 1/1 passed. |
| 5 | `npx tsc --noEmit` no reporta errores | ✅ Exit 0, sin warnings ni errores. `tsconfig.app.json` tiene `strict: true` y `noUncheckedIndexedAccess: true`. |
| 6 | `package.json` lista todas las dependencias de §2 | ✅ Las 18 runtime + 15 dev listadas arriba. `@sqlite.org/sqlite-wasm` explícitamente excluido. |

### Estructura de carpetas (§15.2)

Coincide al 100% con la spec. Resumen:

```
sql-academy/
├── public/
│   ├── favicon.svg          (de Vite template)
│   ├── icons.svg            (de Vite template)
│   └── icons/
│       ├── icon-192.png     (placeholder sky-500)
│       ├── icon-256.png
│       ├── icon-384.png
│       └── icon-512.png
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── router.tsx
│   ├── content/
│   │   ├── courses/         (.gitkeep)
│   │   ├── lessons/         (.gitkeep)
│   │   ├── exercises/       (.gitkeep)
│   │   ├── databases/       (.gitkeep)
│   │   └── locales/         (.gitkeep)
│   ├── workers/
│   │   ├── sqlite.worker.ts (placeholder)
│   │   └── sw.ts            (SW source para vite-plugin-pwa)
│   ├── core/
│   │   ├── storage/capability.ts
│   │   ├── persistence/dexie.ts
│   │   ├── exercises/strategies/  (.gitkeep)
│   │   ├── sql/             (.gitkeep)
│   │   ├── worker/          (.gitkeep)
│   │   ├── i18n/i18n.ts
│   │   └── pwa/register-sw.ts
│   ├── ui/
│   │   ├── components/
│   │   │   ├── editor/      (.gitkeep)
│   │   │   ├── results/     (.gitkeep)
│   │   │   ├── schema/      (.gitkeep)
│   │   │   ├── exercise/    (.gitkeep)
│   │   │   ├── course/      (.gitkeep)
│   │   │   └── shell/       (.gitkeep)
│   │   ├── pages/           (.gitkeep)
│   │   ├── styles/          (.gitkeep)
│   │   └── (no styles in ui/styles — los globales viven en src/styles/)
│   ├── hooks/               (.gitkeep)
│   └── styles/
│       ├── reset.css
│       └── tokens.css
└── tests/
    ├── setup.ts
    ├── unit/
    │   ├── .gitkeep
    │   └── smoke.test.ts
    └── integration/
        └── .gitkeep
```

### Archivos placeholder creados (no lógica)

- `src/main.tsx` — monta `<App />` dentro de `<BrowserRouter>` con `StrictMode`.
- `src/App.tsx` — layout con `<h1>SQL Academy</h1>` y mensaje "Scaffolding OK".
- `src/router.tsx` — `<AppRoutes>` con 4 rutas placeholder (`/`, `/lesson/:id`, `/playground`, `/databases`) + 404.
- `src/styles/reset.css` — reset mínimo (box-sizing, márgenes, focus-visible, etc.).
- `src/styles/tokens.css` — variables CSS (colores slate + sky, fuentes, espaciado, sombras).
- `src/core/i18n/i18n.ts` — `t()` + diccionario `es` con 10 claves + `en` con override de una clave.
- `src/core/persistence/dexie.ts` — schema Dexie v1 con las **9 tablas** de §12.1 (`progress`, `databases`, `settings`, `queryHistory`, `savedQueries`, `editorDrafts`, `snapshotMetadata`, `undoHistory`, `exerciseStats`) + tipos TS de las filas + clase `SqlAcademyDB` y singleton `db`.
- `src/core/storage/capability.ts` — stub de `detectStorageCapability()` que devuelve `'opfs-sync'`. La implementación real (3 niveles) llega con POC-1.
- `src/core/pwa/register-sw.ts` — no-op (vite-plugin-pwa se encarga del register en prod).
- `src/workers/sw.ts` — SW source para `injectManifest`; usa `workbox-precaching` con `self.__WB_MANIFEST` (placeholder inyectado por vite-plugin-pwa en build).
- `src/workers/sqlite.worker.ts` — placeholder explícito que arroja si se importa, para evitar uso accidental antes de POC-1.
- `tests/setup.ts` — carga `@testing-library/jest-dom/vitest`.
- `tests/unit/smoke.test.ts` — `1 + 1 === 2`.
- `vitest.config.ts` — `happy-dom`, `globals: true`, setup file `tests/setup.ts`.

---

## 5. Desviaciones de la spec (y por qué)

1. **`tsconfig.json` raíz extendido con `compilerOptions: { strict: true }`.**
   El template por defecto de Vite 8 venía con `files: []` + solo `references`.
   Para que `npx tsc --noEmit` sin flag (que cae en el proyecto raíz) siga
   reportando errores, añadí `compilerOptions.strict` al `tsconfig.json`
   raíz. Los flags reales viven en `tsconfig.app.json` y `tsconfig.node.json`
   vía `references`.

2. **`tsconfig.node.json` excluye `vitest.config.ts`.**
   Vitest 2.x trae su propio `vite@5` con tipos divergentes del `vite@8`
   top-level, lo que producía un error `TS2769: No overload matches this
   call` en `plugins: [react()]`. Excluir el archivo del typecheck evita
   el problema sin tocar la build (Vitest consume su propio TS).
   Workaround documentado y reversible cuando Vitest 3.x esté estable.

3. **PWA: `injectRegister: false`, `devOptions.enabled: false`.**
   No queremos que el SW se inyecte en dev (rompe HMR); el registro en
   prod se hará desde `core/pwa/register-sw.ts` en la POC-6.

4. **`src/ui/styles/` queda vacío (.gitkeep).**
   La spec §15.2 lista `ui/styles/` (carpeta de estilos) y la spec del
   task sugiere `src/styles/`. Mantengo **ambos**: los tokens y el reset
   viven en `src/styles/` (estilos globales), y `src/ui/styles/` queda
   como contenedor para los CSS Modules de los componentes, que se
   poblará junto con las pages. El template base de Vite no generaba este
   directorio, así que el `.gitkeep` solo documenta la intención.

5. **Iconos PWA: PNG sólidos color `sky-500` (#0ea5e9).**
   El template base solo trae `favicon.svg` e `icons.svg` (vectoriales
   decorativos de Vite/React). La spec requiere iconos placeholder
   referenciados desde el manifest (192/256/384/512). Generé 4 PNGs
   sólidos de un solo color (594 B → 2.2 KB) con un script Node
   inline (zlib + manual PNG), sin dependencias adicionales. Se
   reemplazarán con iconos de marca reales en una iteración posterior.

6. **`@types/node` añadido en `tsconfig.app.json` `types`.**
   Para que `import.meta.dirname`-style helpers (futuros) tipen sin
   re-plumbing. La spec del task explícitamente lista `@types/node`
   como devDep.

7. **`erasableSyntaxOnly: true` activo (heredado del template Vite 8).**
   Garantiza que las anotaciones de tipos no se compilen a runtime
   innecesario. Todos los tipos exportados en mi código son `export type`
   o `export interface` (erasable), y los `import type` se usan donde
   corresponde.

8. **`comlink` instalado en runtime, no en dev.**
   Coincide con la spec del task (sección 2).

9. **`workbox-precaching` listado en `devDependencies`.**
   La spec no lo enumera explícitamente, pero el `sw.ts` lo necesita
   en build (vite-plugin-pwa lo espera). Es dev-only — se inyecta al
   SW en build, no al bundle de la app.

---

## 6. Notas para las siguientes POCs

- **POC-1 (wa-sqlite + OPFSCoopSyncVFS):** necesita un build de Vite
  con `optimizeDeps.exclude: ['wa-sqlite']` (ya hecho). Tendrá que
  importar `wa-sqlite` desde `node_modules/wa-sqlite/src/` (no del
  barrel `wa-sqlite`) para evitar el wrapper de la versión.
- **POC-3 (Persistence):** importar `db` desde `core/persistence/dexie.ts`.
  Los tipos `ProgressRow`, `QueryHistoryRow`, etc. ya están exportados.
- **POC-4 (Worker):** el placeholder `src/workers/sqlite.worker.ts`
  debe ser reemplazado. El handshake debe reportar `opfsSync` desde
  dentro del worker (no en `detectStorageCapability`, que se ejecuta
  en el main thread).
- **POC-6 (PWA):** reemplazar `sw.ts` por uno real con estrategia
  de precaching del WASM y los fonts. Activar `injectRegister: true`
  en `vite.config.ts` o llamar a `registerServiceWorker()` desde
  `main.tsx`.

---

## 7. Comandos útiles

```bash
cd /workspace/sql-academy
npm run dev        # vite dev server en http://localhost:5173
npm run build      # tsc -b && vite build → dist/
npm test           # vitest run
npm run typecheck  # tsc --noEmit -p tsconfig.app.json
npm run preview    # sirve dist/ en http://localhost:4173
```
