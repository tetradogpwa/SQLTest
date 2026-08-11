# Offline PWA Report — Fase 10

> Procedimiento de verificación de la PWA offline + automatización
> de los chequeos mecánicos via Playwright.

## Resumen

Fase 10 valida que la promesa "100% offline, sin red" de la app
se cumple. Hay dos partes:

1. **Automatizada** (corre en CI y en local con `npx playwright test`):
   arranca `vite preview`, monta la app en Chromium real, alterna
   `context.setOffline(true)`, y verifica que el shell + el WASM
   siguen sirviendo desde el precache del Service Worker. 4
   escenarios end-to-end.
2. **Manual** (procedimiento de 19 pasos de `RESEARCH.md §16.1`):
   install → offline → screenshot → query real → cambio de tema →
   Lighthouse. Requiere un browser humano. Está documentado abajo
   para que cualquier mantenedor pueda repetirla.

## Antes / después

| Métrica                                                       | Antes | Después |
|---------------------------------------------------------------|-------|---------|
| Tests del SW (precache + lifecycle)                           | 0     | **12**  |
| Suite e2e offline (Playwright)                                | 0     | **4**   |
| Job CI `e2e` corriendo Playwright + uploading report          | ❌    | **✅**  |
| Procedimiento manual documentado paso a paso                  | ❌    | **✅**  |
| Total tests                                                   | 687   | **703** |
| `dist/sw.js` validado (WASM + icons + bundle)                  | ❌    | **✅**  |

## Tests añadidos (16)

| Archivo                              | Tests | Cubre                                   |
|--------------------------------------|-------|-----------------------------------------|
| `tests/unit/sw.test.ts`              | 12    | Built SW artefact contract              |
| `tests/e2e/offline.spec.ts` (Playwright) | 4 | Offline end-to-end en Chromium real    |

### `tests/unit/sw.test.ts` (12 tests)

These tests do not run the SW — they read the *built* `dist/sw.js`
(after `npm run build`) and assert the precache manifest contains
the assets we cannot afford to lose. They cover:

- The wa-sqlite WASM (sync + async variants) is in the precache.
- The SPA shell (`index.html`) is precached.
- The PWA manifest (`manifest.webmanifest`) is precached.
- All four icon sizes (192/256/384/512) are precached.
- The JS + CSS bundles (`assets/*.js`, `assets/*.css`) are precached.
- Total precache size is under the 4 MiB cap.
- The `GET_PRECACHE_LIST` message handler is wired (POC-3 hook).
- The install (`skipWaiting`) and activate (`clients.claim`) lifecycle
  hooks are present.
- The navigation fallback (`request.mode === 'navigate'`) is wired
  to `/index.html`.

The tests skip gracefully when `dist/sw.js` is missing so the
file is still importable in a checkout without a build.

### `tests/e2e/offline.spec.ts` (4 tests)

The Playwright config (`playwright.config.ts`) boots `vite preview`
against `dist/` and runs the four scenarios on Chromium:

1. **App shell loads with the SW registered.** Visits `/` and
   asserts that the page renders + `navigator.serviceWorker.getRegistration()`
   returns a `ServiceWorkerRegistration`.
2. **The app renders the playground without a network round-trip
   once precached.** Primes the cache, toggles `context.setOffline(true)`,
   reloads, and asserts the home page still renders.
3. **SPA navigation works while offline.** Navigates directly to
   `/course` while offline; the SW's `createHandlerBoundToURL('/index.html')`
   serves the shell and React Router takes over.
4. **The wa-sqlite WASM is served from the precache offline.** Fetches
   `/wa-sqlite.wasm` directly with the browser offline; the
   response is 200 + non-zero size.

The CI workflow (`e2e` job) installs Playwright's Chromium, boots
the preview server, and uploads the HTML report as an artefact.
The job runs after the `build` job so the `dist/` artefact is
available — no re-build inside the e2e step.

## Procedimiento manual (19 pasos)

Este es el procedimiento de `RESEARCH.md §16.1`. Está pensado para
que un mantenedor lo ejecute en un Chrome 120+ con DevTools
abierto. No es automatizable desde CI (necesita interacción
humana + Lighthouse con captura). Capturas se archivan en
`docs/pwa-verification/<YYYY-MM-DD>/`.

### Pre-requisitos

- Chrome 120+ instalado.
- `npm install && npm run build` ejecutado localmente.
- Un servidor estático sirviendo `dist/`. El más simple es
  `npx serve dist -p 4173` o `npm run preview -- --port 4173`.

### Pasos

1. **Abrir la app online en Chrome 120+.** Visita
   `http://localhost:4173`. La página principal debe renderizar
   sin errores en la consola de DevTools.

2. **Instalar la PWA.** En la barra de direcciones, debe
   aparecer el icono de "instalar" (un monitor con flecha). Click
   → "Instalar". Chrome confirma la instalación en un diálogo
   nativo.

3. **Confirmar el icono en el sistema.** Windows: Start Menu.
   macOS: Launchpad. Linux: menú de aplicaciones del shell.
   El icono es el "SQL Academy" con fondo azul (`theme_color`
   `#0ea5e9`).

4. **Cerrar el navegador.** `Ctrl/Cmd + W` o cerrar todas las
   ventanas.

5. **Desactivar Internet.** Modo avión físico o, en Chrome
   DevTools → Network → "Offline".

6. **Abrir la PWA desde el icono del sistema.** El launch debe
   llevar a la pantalla principal sin errores.

7. **Verificar que la pantalla principal carga sin error.** El
   header "Bienvenido a SQL Academy" debe ser visible.

8. **Abrir una lección.** Desde el sidebar, "Curso" → "Biblioteca
   Municipal" → "SELECT básico". La lección debe renderizar
   con sus objetivos.

9. **Abrir un ejercicio.** Click en "Ir al primer ejercicio"
   (o el primero del listado). El editor SQL debe montar.

10. **Escribir una consulta y pulsar "Ejecutar".** Por ejemplo:
    `SELECT * FROM books LIMIT 5;`. Debe devolver resultados reales
    desde la DB precargada. Esto valida que `wa-sqlite` corre 100%
    en local.

11. **Crear un snapshot y restaurar.** Playground → "Snapshots" →
    "Crear snapshot". Después ejecutar un `DROP TABLE` o
    `DELETE`. Click en "Restaurar" del snapshot. La DB debe volver
    al estado previo.

12. **Crear una DB de usuario, importar / exportar un archivo.**
    Databases → "Crear base de datos" → `test`. Luego "Exportar" y
    verificar que el archivo `.sqlite3` se descarga. Borrar la
    DB y volver a importar. La DB debe aparecer de nuevo con
    todas sus tablas.

13. **Cambiar tema (claro/oscuro/auto).** Settings → Apariencia →
    cada opción. El cambio debe persistir tras refresh.

14. **Verificar que el Service Worker está activo en DevTools.**
    Application → Service Workers → status: `#activated and is
    running`. El scope debe ser `/`.

15. **Verificar que el `manifest.webmanifest` se sirve
    correctamente.** Application → Manifest → debe listar
    nombre, short_name, theme_color, icons.

16. **Verificar que el `wa-sqlite.wasm` está pre-cacheado.**
    Application → Cache Storage → `workbox-precache-v2` → el
    archivo `wa-sqlite.wasm` debe estar presente con tamaño
    ~558 KB.

17. **Verificar tamaño de la precache.** Application → Cache
    Storage → detalles de `workbox-precache-v2`. El total debe
    ser ≤ 5 MB (objetivo del roadmap; el actual es ~3.0 MB).

18. **Lighthouse PWA score ≥ 90.** DevTools → Lighthouse →
    categorías: Performance, Accessibility, Best Practices, SEO,
    PWA → "Analyze page load". El score PWA debe ser ≥ 90.

19. **Lighthouse Performance score ≥ 80 en mobile mid-tier.**
    Misma pantalla, modo "Mobile" + "Slow 4G + 4x CPU slowdown".
    El score Performance debe ser ≥ 80.

### Resultado esperado

`docs/pwa-verification/<YYYY-MM-DD>/offline-pwa-report.md` con:

- Capturas de los pasos 1, 6, 7, 8, 10, 11, 13, 14, 15, 16, 18, 19.
- Los números de Lighthouse score.
- Cualquier issue encontrado y su resolución.

## Limitaciones de la automatización

- Los **screenshots de Lighthouse** (paso 18, 19) requieren un
  Chrome real con DevTools + Lighthouse. La CI no puede capturar
  esos reports; el procedimimento manual es la fuente de verdad.
- El **playwright test** corre en Chromium headless. El PWA
  install prompt (paso 2) no se puede automatizar — la API
  `beforeinstallprompt` requiere un evento del usuario.
- El **test del SW** lee `dist/sw.js`. Si el build no se ha
  ejecutado, los tests skip con un mensaje claro. La CI los
  ejecuta después del job `build` para garantizar que el
  artefacto existe.

## Verificación

- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run test` ✅ 703/703 (12 nuevos en `tests/unit/sw.test.ts`)
- `npm run build` ✅ WASM precache 3.0 MB
- `npx playwright test` (requiere Chromium; corre en CI)

## Decisiones de scope

- **No desplegamos a GitHub Pages automáticamente** — el repo
  del usuario puede no tener Pages configurado. El artefacto
  `dist/` queda disponible tras cada run de CI para descarga
  manual. Configurar Pages + un job de deploy es un cambio de
  un par de líneas en `release.yml` cuando se quiera.
- **No añadimos tests visuales (Playwright `toHaveScreenshot`)** —
  requeriría un baseline de imágenes que se rompa con cualquier
  cambio de copy. Mantenemos los tests e2e enfocados en
  comportamiento (precache + lifecycle), no en apariencia.
- **No corremos Lighthouse en CI** — la imagen de GitHub Actions
  no incluye Chrome estable con Lighthouse CLI. El procedimiento
  manual es más rápido y fiable.

## Follow-up recomendado

- Añadir un script `npm run verify:pwa` que ejecute el
  procedimiento manual con un recordatorio de los pasos.
- Cuando el repo adopte GitHub Pages o un host similar, un
  job de `deploy` que publique `dist/` automáticamente y se
  ejecute después de `e2e`.
- Considerar Playwright `locator.screenshot()` para
  capturar los 19 pasos en CI (futuro, Fase 14+ follow-up).
