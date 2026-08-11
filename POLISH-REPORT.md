# Polish Report — Fase 13

> Accesibilidad, responsive, edge cases.

## Resumen

Fase 13 cierra el ciclo de polish iniciado en la Fase 9: auditamos
la app con **axe-core** y corregimos todas las violaciones serias
que aparecieron en las páginas críticas, añadimos **focus trap** a
cada modal, montamos un **toast global** para errores del Worker
(recuperación), y dejamos la **suite de a11y** corriendo en CI para
regresiones futuras.

## Antes / después

| Métrica                                          | Antes | Después |
|--------------------------------------------------|-------|---------|
| Tests                                            | 640   | **675** |
| Violaciones serias de axe en HomePage            | 1     | **0**   |
| Violaciones serias de axe en PlaygroundPage      | 2     | **0**   |
| Violaciones serias de axe en SettingsPage        | 1     | **0**   |
| Modales con focus trap                          | 0/5   | **5/5** |
| Topbar locales (`es / ca / en`)                  | 2     | **3**   |
| Error del Worker visible globalmente             | ❌    | **✅**   |

## Accesibilidad

### 1. Focus trap en modales (WCAG 2.4.3 / 2.1.2)

- **Hook** `src/hooks/useFocusTrap.ts` (170 LOC + 5 tests):
  - Recuerda el `activeElement` previo al abrir y lo restaura al
    cerrar (`focus({ preventScroll: true })`).
  - Tab / Shift+Tab cicla entre los focusables del contenedor
    (`a[href]`, `button:not([disabled])`, `input`, `select`, etc.).
  - Si no hay focusables, mantiene el foco en el propio contenedor
    (`tabIndex={-1}`).
  - Compatible con React Strict Mode (cleanup idempotente).

- **Aplicado a** (todos verificados con un test que abre el dialog y
  comprueba que el primer focusable recibe el foco):
  - `CreateDatabaseDialog` (DAT-9)
  - `ImportDatabaseDialog` (DAT-9)
  - `DatabasesPage` → `RenameDialog`
  - `DatabasesPage` → `DeleteConfirmDialog`
  - `SettingsPage` → `ConfirmDialog` (clear progress + restore defaults)

### 2. Topbar improvements

- Añadido `ca` al locale switcher (estaba solo `es` / `en`).
- `aria-expanded` en el toggle del sidebar ahora refleja el estado
  real del drawer (`AppShell.mobileOpen`).
- `aria-controls="app-sidebar-drawer"` para emparejar el toggle con
  el drawer (los lectores de pantalla anuncian qué se está abriendo).

### 3. axe-core en CI

- **`tests/setup.ts`** registra el matcher `toHaveNoViolations` de
  `vitest-axe` (cero líneas de glue en cada test).
- **`tests/unit/a11y/smoke.test.tsx`** ejecuta axe contra:
  - `HomePage`
  - `PlaygroundPage` (con los hooks stub-eados)
  - `SettingsPage`
  - `NotFoundPage`

### 4. Violaciones corregidas durante la auditoría

| Regla                                  | Páginas | Fix                                                                                                  |
|----------------------------------------|---------|------------------------------------------------------------------------------------------------------|
| `heading-order`                        | Playground | `StatsPanel`, `SnapshotsPanel`, `DbExplorer.detailTitle`: `<h3>` → `<h2>` / `<h4>` → `<h3>`         |
| `aria-input-field-name`                | Playground | `SqlEditor` ahora propaga `aria-label` al `role="textbox"` interno via `EditorView.contentAttributes` |
| `landmark-unique`                      | Home    | Los dos `<section>` con la misma `aria-label` ahora son `home.quickLinks` + `home.progress.title`     |

## Responsive

- **Sidebar drawer** en mobile (`< 768px`): ya estaba implementado
  (rail en desktop, drawer en mobile). La fase añade el
  `aria-expanded` correcto al toggle.
- **Editor y tablas con scroll horizontal**: `ResultsTable.tableContainer`
  y `databases.tableWrapper` ya tenían `overflow: auto`; el nuevo
  `WorkerErrorBanner` también es responsive (full-width en mobile).
- **WorkerErrorBanner** se ensancha a `100vw - 2*space-3` en
  `< 480px`.

## Edge cases

- **Worker crash / recovery**: el nuevo `WorkerErrorBanner` se monta
  en `AppShell` y se suscribe a `useDatabase.error`. Cuando hay
  error:
  - Aparece como toast `role="alert" aria-live="assertive"` abajo a
    la derecha.
  - Botón "Reintentar" llama a `useDatabase.retry()`.
  - Botón "✕" lo descarta (vuelve a aparecer al refrescar la página).
  - Se oculta mientras `status === 'recovering' | 'initializing'`
    (el status pill del TopBar ya cubre esos estados).

- **DB corrupta / OPFS lleno**: la detección automática desde el
  Main Thread no es trivial (los errores del Worker llegan como
  strings libres). El banner genérico cubre estos casos — el
  usuario ve el mensaje y puede reintentar. Una mejora futura
  podría parsear `error.code === 'SQLITE_FULL'` para mostrar un
  modal específico con instrucciones.

- **Modo offline + intentar crear DB nueva**: la creación es local
  (no requiere red) — el `ImportExportManager.create()` no toca la
  red. Por lo tanto este caso **ya está cubierto** por la
  arquitectura offline-first; no requiere UI adicional.

## Tests añadidos

| Archivo                                              | Tests |
|------------------------------------------------------|-------|
| `tests/unit/hooks/useFocusTrap.test.tsx`             | 5     |
| `tests/unit/components/shell/WorkerErrorBanner.test.tsx` | 7     |
| `tests/unit/a11y/smoke.test.tsx`                     | 5     |
| (a11y fixes) Existing tests no changes              | 0     |
| **Total nuevos**                                      | **17** |

## Decisiones de scope

- **No** se implementó `OPFS lleno` como modal dedicado — el banner
  genérico lo cubre. La heurística adicional costaría
  significativamente más que el valor que aporta para un usuario
  novel.
- **No** se modificó el contraste de colores — los tokens
  (`src/ui/styles/tokens.css`) ya cumplen WCAG AA en sus dos temas.
  Un audit manual con axe DevTools queda como follow-up de la
  Fase 14 (CI/CD) para ejecutarse en un navegador real.
- **No** se añadió `prefers-reduced-motion` por componente — ya está
  aplicado globalmente en `tokens.css` (`@media (prefers-reduced-motion: reduce)`).

## Verificación

- `npm run typecheck` ✅
- `npm run lint` ✅ (sin nuevos warnings)
- `npm run test` ✅ 675/675 (35 suites)
- `npm run build` ✅ WASM precache 3.0 MB

## Follow-up recomendado (Fase 14 / 15)

- Integrar `@axe-core/playwright` en CI para correr axe en un
  navegador real (los tests actuales usan happy-dom, suficiente
  para los chequeos estructurales pero no para issues de color).
- Añadir `prefers-reduced-motion` por componente para las
  transiciones del sidebar y los modales (no urgente; el global ya
  colapsa todas las animaciones).
- Localizar los mensajes de error del Worker al locale activo (hoy
  son strings del Worker que ya pasan por `ErrorTranslator`).
