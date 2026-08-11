# SQL Academy PWA — Roadmap

> Documento vivo. Lo que ya está hecho, lo que falta, y el orden propuesto para terminarlo.

## Estado actual (al cerrar Fase 8)

**Lo que ya está en el repo y funciona:**

| Fase | Módulo | Reporte |
|---|---|---|
| 0 | Scaffolding Vite + React 19 + TS + PWA + 6 POCs | `SCAFFOLD-REPORT.md`, `POC-ENGINE-REPORT.md`, `POC-UI-REPORT.md` |
| 2 | Worker SQLite + DBAPI (opfs-sync, VACUUM INTO snapshots, progress_handler + interrupt) | `WORKER-EXEC-REPORT.md`, `WORKER-STORAGE-REPORT.md` |
| 3 | Persistencia Dexie (8 stores + PersistenceService bridge) | `PERSISTENCE-REPORT.md` |
| 4 | UI shell + tema (light/dark/auto) + 8 páginas + routing | `UI-SHELL-REPORT.md` |
| 5 | Editor SQL (CodeMirror 6 + autocompletado), DBExplorer, ResultsTable, ErrorBanner, PlaygroundPage | `EDITOR-REPORT.md` |
| 6 | Motor de ejercicios: 11 estrategias + comparador + validador + runner + hint engine + error pattern detector (122 tests) | `EXERCISE-ENGINE-REPORT.md` |
| 7 | Contenido del curso: 4 DBs semilla (1 098 filas) + 16 lecciones + 112 ejercicios en español (527 tests) | `COURSE-CONTENT-REPORT.md` |
| 8 | UI del curso: CourseSidebar + LessonView + ExerciseView + HintPanel + SolutionPanel + FeedbackBanner + ProgressBar (578 tests, build verde) | `COURSE-UI-REPORT.md` |

**Métricas globales:**

- 578 tests pasando, typecheck limpio, build de producción verde.
- ~28 000 LOC de TypeScript.
- 19 entries pre-cached (2.9 MB de precache con WASM incluido).
- Stack: Vite 8 + React 19 + TS 6 + wa-sqlite 1.0 + CodeMirror 6 + Dexie 4 + Comlink 4.

---

## Lo que falta (Fase 9 → 13)

### Fase 9 — Página de Bases de Datos + Playground enhancements

**Goal:** el usuario gestiona sus DBs persistentes (no de ejercicios) desde la UI.

**Componentes a producir:**

- `src/ui/pages/DatabasesPage.tsx` (rewrite) — lista de DBs del usuario con:
  - Crear nueva DB (modal con nombre, tamaño máximo opcional).
  - Importar DB desde archivo `.sqlite3` / `.db` (drag & drop + file picker).
  - Exportar DB a archivo (botón por fila → descarga).
  - Renombrar / borrar / duplicar.
  - Badge de "última modificación", "tamaño", "tipo de almacenamiento".
- `src/ui/components/databases/CreateDatabaseDialog.tsx` — modal.
- `src/ui/components/databases/ImportDatabaseDialog.tsx` — modal con file picker + preview.
- `src/ui/components/databases/RowActions.tsx` — kebab menu por fila.
- `src/hooks/useUserDatabases.ts` — sobre `listUserDatabases` / `createUserDatabase` / `importUserDatabase` / `exportUserDatabase` / `deleteUserDatabase` del DBAPI.
- Actualizar `PlaygroundPage`:
  - Selector de DB en la top bar.
  - Panel "Snapshots" (auto-snapshots + manuales, con label + botón restaurar).
  - Botón "↶ Deshace" cuando hay undo disponible (Fase 5 dejó la infraestructura, falta el UI).
  - Stats: tamaño DB, número de queries ejecutadas en esta sesión, último error.

**Snapshots UI:** siguiendo RESEARCH §6.4, auto-snapshot antes de `DELETE`/`UPDATE`/`DROP`/`ALTER` con un `requiresCheckpoint`. El `ExerciseRunner` ya lo hace para ejercicios; extender al playground.

**Undo UI:** en `PlaygroundPage`, cuando `useUndo` expone entries disponibles, mostrar botón "↶ Deshace último cambio" que llama a `restore(snapshotId)`.

**Tests:**

- `tests/unit/components/databases/DatabasesPage.test.tsx` (smoke, mock del hook).
- `tests/unit/components/databases/CreateDatabaseDialog.test.tsx` (5+ tests).
- `tests/unit/hooks/useUserDatabases.test.ts` (5+ tests, mock del DBAPI).
- `tests/unit/components/playground/SnapshotsPanel.test.tsx` (4+ tests).
- `tests/unit/components/playground/UndoButton.test.tsx` (3+ tests).

**Estimación:** 2 días, 1 500–2 000 LOC + 20 tests.

---

### Fase 10 — Verificación PWA offline

**Goal:** ejecutar el procedimiento de 19 pasos de RESEARCH §16.1 y dejar evidencia.

**Procedimiento (RESEARCH §16.1):**

1. Abrir la app online en Chrome 120+.
2. Instalarla como PWA.
3. Confirmar icono en el sistema.
4. Cerrar el navegador.
5. Desactivar Internet (modo avión físico o `chrome://flags`).
6. Abrir la PWA desde el icono del sistema.
7. Verificar que la pantalla principal carga sin error.
8. Abrir una lección.
9. Abrir un ejercicio.
10. Escribir una consulta y pulsar "Ejecutar" → debe devolver resultados correctos.
11. Crear un snapshot y restaurar.
12. Crear una DB de usuario, importar / exportar un archivo.
13. Cambiar tema (claro/oscuro/auto) — debe persistir.
14. Verificar que `Service Worker` está activo en DevTools.
15. Verificar que el `manifest.webmanifest` se sirve correctamente.
16. Verificar que el `wa-sqlite.wasm` está pre-cacheado.
17. Verificar tamaño de la precache (objetivo ≤ 5 MB).
18. Lighthouse PWA score ≥ 90.
19. Lighthouse Performance score ≥ 80 en mobile mid-tier.

**Output esperado:** un `OFFLINE-PWA-REPORT.md` con capturas de pantalla de cada paso + los resultados de Lighthouse.

**Tests adicionales:**

- E2E con Playwright: `tests/e2e/offline.spec.ts` que use `serviceWorker.unregister()` + `context.setOffline(true)` para validar el flujo end-to-end sin red.
- Test del SW: `tests/unit/sw.test.ts` que verifique que el precache incluye los assets críticos.

**Estimación:** 1.5 días (incluyendo tiempo de QA manual).

---

### Fase 11 — Cobertura de tests

**Goal:** subir la cobertura a ≥ 80% en líneas y branches.

**Estado actual:** 578 tests, pero no hay medición de coverage oficial (no hay `vitest --coverage` configurado).

**Trabajo:**

- Configurar `vitest --coverage` con `@vitest/coverage-v8` (cubre 0 líneas adicionales de runtime).
- Añadir badge de coverage en el README.
- Identificar los archivos con coverage < 70% y escribir tests para ellos:
  - `src/workers/snapshot-manager.ts` (rutas de error, ya cubierto parcialmente).
  - `src/workers/import-export-manager.ts` (edge cases de import: archivo corrupto, schema mismatch, large file).
  - `src/workers/schema-manager.ts` (cache TTL boundary, concurrent introspection).
  - `src/hooks/useDatabase.ts` (recovery path tras crash, multiple re-opens).
  - `src/ui/components/shell/` (theme provider, sidebar collapse).

**Output:** `COVERAGE-REPORT.md` con tabla por archivo + threshold enforcement en CI (futuro).

**Estimación:** 1 día.

---

### Fase 12 — Settings page + i18n

**Goal:** la página de Settings ya existe como placeholder, hay que dotarla.

**Trabajo:**

- `src/ui/pages/SettingsPage.tsx` (rewrite):
  - Sección "Apariencia": selector de tema (claro/oscuro/auto).
  - Sección "Editor": tamaño de fuente (sm/md/lg), tab size, word wrap.
  - Sección "Idioma": selector `es` / `ca` / `en` (los `ca` y `en` son stubs por ahora).
  - Sección "Datos": botón "Borrar todo el progreso", "Exportar configuración".
  - Sección "Acerca de": versión, build hash, links a docs.
- `src/content/locales/{es,ca,en}.json` — diccionarios i18n completos.
- `src/core/i18n/` — ya existe `i18n.ts`; ampliar con los 3 locales.
- `src/hooks/useSettings.ts` — sobre `settings` store, reactivo.
- Tests: `tests/unit/components/settings/SettingsPage.test.tsx` (5+ tests), `tests/unit/content/locales.test.ts` (3+ tests para verificar claves obligatorias presentes en cada locale).

**Estimación:** 1 día.

---

### Fase 13 — Polish (accesibilidad, responsive, edge cases)

**Goal:** la app cumple WCAG 2.1 AA, funciona bien en mobile, y no se rompe con edge cases.

**Accesibilidad:**

- Audit con `axe-core` (integrar `@axe-core/react` en dev + un test e2e que verifique 0 violations en home, course, exercise, playground).
- Keyboard navigation completa: tab order lógico, focus visible, Esc cierra modales, Enter/Espacio activa botones.
- Screen reader: cada `data-testid` reemplazado por `aria-label` semántico. Icon-only buttons con `aria-label`. Imágenes con `alt`.
- Color contrast ≥ 4.5:1 (auditar con axe + corregir).

**Responsive:**

- Breakpoints: 480 / 768 / 1024 / 1280.
- Sidebar colapsa a drawer en mobile (< 768).
- Editor con scroll horizontal en pantallas pequeñas.
- Tablas de resultados con scroll horizontal.

**Edge cases:**

- DB corrupta → recovery screen con "Crear nueva DB desde cero" + "Importar backup".
- Worker crash durante un query largo → toast "Recuperando sesión..." + retry transparente.
- OPFS lleno → modal explicativo + instrucciones para borrar DBs grandes.
- Modo offline + intento de crear DB nueva → mensaje claro "esto requiere conexión la primera vez".

**Output:** `POLISH-REPORT.md` con antes/después de axe scores, screenshots mobile vs desktop, lista de edge cases manejados.

**Estimación:** 2–3 días.

---

### Fase 14 — (opcional) CI/CD + release

**Goal:** que `git push` ejecute tests + build + deploy a un host estático.

- GitHub Actions workflow: install → typecheck → lint → test → build.
- Deploy a Cloudflare Pages / Vercel / GitHub Pages (el bundle es estático).
- Versioning con `release-please` o manual.
- CHANGELOG.md auto-generado.

**Estimación:** 0.5–1 día.

---

### Fase 15 — Asistente IA + generación de ejercicios

**Goal:** un agente IA externo puede (a) inspeccionar el estado actual del usuario en la webapp para asistirle en tiempo real, y (b) generar nuevos ejercicios que se persisten en el almacenamiento local del navegador.

La app sigue siendo 100% offline por defecto; esta fase añade un **modo IA opt-in** que requiere red, claramente indicado al usuario. La IA nunca escribe en Dexie directamente — todo pasa por un *puente* Main Thread controlado.

#### 15.1 — Puente de observación (IA → estado del usuario)

**Caso de uso:** el usuario tiene un problema con un ejercicio (no entiende el feedback, lleva N intentos fallidos, la pista no le aclara). Pide ayuda a la IA. La IA necesita ver:

- Ejercicio activo (id, enunciado, solución, estrategias aplicadas, hints ya reveladas).
- Historial de intentos del usuario en ese ejercicio: SQL enviada, resultado (`ok`, columnas, filas, error traducido, `executionMs`, `statementKind`).
- Progreso del curso: lecciones completadas, ejercicios completados, % por nivel.
- DB activa del playground + esquema en vivo (tablas, columnas, índices, triggers).
- Errores recurrentes del `error-pattern-detector` en las últimas N ejecuciones.
- Versión de la app + capability del Worker (`'opfs-sync' | 'opfs-async' | 'idb' | 'memory'`).

**Diseño:**

- Nuevo módulo `src/core/ai/` con:
  - `ai-observer.ts` — serializa un *snapshot pedagógico* (no volcar Dexie entera; solo lo que la IA necesita para entender el contexto del usuario).
  - `ai-bridge.ts` — cliente del protocolo de transporte (ver 15.3).
- Nuevo `Dexie` store `aiSessions` (`src/core/persistence/ai-sessions.ts`) — registro de las sesiones IA iniciadas (timestamp, motivo, summary, opt-in).
- Nuevo hook `useAIAssistant()` (`src/hooks/useAIAssistant.ts`) — toggle ON/OFF, muestra estado del bridge, expone `requestAssistance(reason)`.
- Nuevo componente `src/ui/components/ai/AssistantPanel.tsx` — drawer lateral con:
  - Botón "Pedir ayuda a la IA" (cuando está activo el modo IA).
  - Lista de las últimas N sesiones con resumen.
  - Configuración: provider (Anthropic / OpenAI / local), nivel de detalle del contexto, opt-in explícito.
- Settings (Fase 12) gana sección "Asistente IA": toggle maestro, provider, API key (guardada en `settings` store, encriptada en reposo vía Subtle Crypto con device salt), modelo por defecto.

**Privacy gates (durezas):**

- El toggle maestro en Settings está **OFF por defecto**.
- Cada `requestAssistance()` pide confirmación modal con preview del snapshot que se va a enviar. Botones "Cancelar" / "Enviar".
- El usuario puede marcar ejercicios / categorías de datos como "nunca enviar a la IA" (lista negra persistente).
- Logs en `aiSessions` para auditoría: qué se envió, cuándo, respuesta recibida.
- Si el provider falla o no hay red, el modo IA se desactiva y la app sigue funcionando normal (degradación limpia).

**Tests:**

- `tests/unit/ai/ai-observer.test.ts` — snapshot pedagógico determinista, omite campos sensibles por defecto, respeta la lista negra.
- `tests/unit/persistence/ai-sessions.test.ts` — CRUD + auditoría.
- `tests/unit/hooks/useAIAssistant.test.tsx` — toggle, error path, opt-in flow.
- `tests/unit/components/ai/AssistantPanel.test.tsx` — render con / sin opt-in, modal de confirmación.

**Estimación:** 3–4 días.

#### 15.2 — Generación de ejercicios (IA → localStorage)

**Caso de uso:** el usuario termina todos los ejercicios de un nivel y quiere más práctica sobre el mismo concepto. La IA genera N ejercicios nuevos a medida, basados en el nivel / concepto / DB actual.

**Diseño:**

- Nuevo `Dexie` store `userExercises` (`src/core/persistence/user-exercises.ts`) — ejercicios generados, con metadata:
    ```
    {
      id: 'user-<uuid>',
      createdAt: number,
      source: 'ai' | 'import',
      basedOn: { lessonId?, concept?, dbId? },
      exercise: Exercise,                 // mismo schema que src/content/lessons/*
      validationReport: ValidationReport, // resultado del validator al admitirlo
      status: 'draft' | 'published' | 'rejected',
    }
    ```
- Nuevo módulo `src/core/ai/exercise-generator.ts`:
  - `generateExercise(spec: ExerciseSpec)` — llama al provider IA con un prompt que incluye el schema `Exercise` (Zod o validador existente) y devuelve un `Exercise` validado.
  - `validateGeneratedExercise(ex)` — pasa el ejercicio por el mismo `Validator` + `defaultStrategies` que el curso estático (mismas 11 estrategias). Si falla, marca `status: 'rejected'` y guarda el `ValidationReport` con el motivo.
  - `dryRunOnWorkingCopy(ex)` — siembra la DB del ejercicio en un scratch VFS, ejecuta la solución del IA y comprueba que devuelve filas esperadas antes de admitirlo.
- Nuevo componente `src/ui/components/ai/GenerateExercisesDialog.tsx`:
  - Inputs: tema / concepto / DB / dificultad / nº de ejercicios a generar.
  - Progress por ejercicio: generando → validando → admitiendo.
  - Lista final con preview del enunciado + botón "Añadir al curso".
- Nueva ruta `/course/user` (opcional) o integración en `CourseSidebar` como sección "Mis ejercicios" debajo de los niveles oficiales.
- `course-shape.test.ts` se amplía para validar también que los `userExercises` cumplen el schema (no rompe los tests existentes).

**Límites:**

- Tope configurable (default 50) de `userExercises` por usuario — LRU eviction con confirmación.
- Cada ejercicio generado pasa por el motor de validación existente antes de guardarse. Si la IA alucina una SQL inválida, el validator la rechaza y no llega a `userExercises`.
- El schema de la DB usada por el ejercicio se congela en `userExercises.basedOn.dbId` — si esa DB se borra, los ejercicios quedan huérfanos (mostrados en gris en la UI con tooltip explicativo).

**Tests:**

- `tests/unit/ai/exercise-generator.test.ts` — mock del provider IA, validación, dry-run, rechazo de ejercicios inválidos.
- `tests/unit/persistence/user-exercises.test.ts` — CRUD, LRU eviction, schema validation.
- `tests/unit/content/user-exercises-schema.test.ts` — los `userExercises` admitidos cumplen el mismo schema que el curso oficial.

**Estimación:** 3–4 días.

#### 15.3 — Transporte (provider-agnóstico)

**Caso de uso:** el código de la app no debe acoplarse a un vendor concreto (Anthropic / OpenAI / Ollama local). El transporte es un *plugin*.

**Diseño:**

- Interface `AIProvider` en `src/core/ai/provider.ts`:
  ```
  interface AIProvider {
    id: 'anthropic' | 'openai' | 'ollama' | 'mock'
    sendMessage(req: AIRequest): Promise<AIResponse>
    cancel(): void
  }
  ```
- Implementaciones:
  - `anthropic-provider.ts` — HTTP fetch directo a `/v1/messages` (CORS permitido por Anthropic).
  - `openai-provider.ts` — idem para OpenAI.
  - `ollama-provider.ts` — para LLMs locales (privacidad total, sin red).
  - `mock-provider.ts` — devuelve respuestas deterministas para tests.
- `AIRequest` incluye:
  - `systemPrompt`: pedagogía + instrucciones de schema `Exercise`.
  - `context`: el snapshot pedagógico (15.1).
  - `messages`: historial de la conversación.
- Streaming opcional (SSE) para la UI del chat — no requerido para MVP.

**Selección de provider:**

- En Settings, dropdown con los 4 providers. Default: `mock` (la IA no hace nada hasta que el usuario configure uno).
- API keys en `settings` store, encriptadas con Subtle Crypto + device-derived salt. Nunca se loguean.

**Tests:**

- `tests/unit/ai/provider.test.ts` — mock provider, contrato del interface.
- `tests/unit/ai/anthropic-provider.test.ts` — fetch mockeado, parseo de respuesta, error path.
- `tests/unit/ai/openai-provider.test.ts` — idem.

**Estimación:** 1–2 días.

#### 15.4 — UI de chat + affordances

**Goal:** la conversación con la IA es visible y reversible.

- Nuevo componente `src/ui/components/ai/ChatPanel.tsx`:
  - Burbujas user / assistant, markdown renderizado, code blocks con syntax highlight (reusar CodeMirror o `react-syntax-highlighter`).
  - Botón "Copiar SQL" en cada bloque.
  - "Aplicar al editor" — escribe la SQL sugerida por la IA en el SqlEditor del ejercicio activo.
  - "Marcar como resuelto" — si la IA confirma que la solución del usuario es correcta, llama al flujo de validación existente.
- Atajos de teclado: `Cmd/Ctrl+.` abre el panel, `Esc` lo cierra.
- Indicador de typing + cancel button durante generaciones largas.
- Persistencia del historial de chat en `aiSessions.messages`.

**Tests:**

- `tests/unit/components/ai/ChatPanel.test.tsx` — render, apply-to-editor, keyboard shortcuts.
- E2E (Playwright, si ya hay setup): flujo "ejercicio → pedir ayuda → IA sugiere → aplicar → completar".

**Estimación:** 2 días.

#### Resumen Fase 15

| Subfase | Scope | Tiempo |
|---|---|---|
| 15.1 | Puente de observación + opt-in | 3–4 días |
| 15.2 | Generación de ejercicios persistidos | 3–4 días |
| 15.3 | Transporte provider-agnóstico | 1–2 días |
| 15.4 | UI de chat | 2 días |
| **Total** | | **9–12 días** |

**Output esperado:** `AI-ASSISTANT-REPORT.md` con:

- Decisión de provider por defecto (recomendación: `mock` hasta que el usuario configure).
- Protocolo de snapshot pedagógico (qué se envía, qué no, formato JSON).
- Privacy gates implementados (modal de confirmación, lista negra, opt-in explícito, encriptación de API keys).
- Esquema validado de `userExercises` y ejemplos de prompts para generación.
- Limitaciones conocidas (latencia, coste de tokens, alucinaciones del validator).

**Riesgos:**

- Coste de tokens si el usuario hace muchas preguntas — el snapshot pedagógico debe ser acotado (top N intentos, no todo el historial).
- Privacidad — el envío de SQL a un provider externo es un vector legal (RGPD). Requiere aviso legal y botón "olvidar mis datos IA".
- Alucinaciones del modelo — el `Validator` + `dryRunOnWorkingCopy` mitigan, pero no eliminan. Un ejercicio con SQL que pasa el validator pero es conceptualmente erróneo puede colarse.

---

## Resumen de tiempos

| Fase | Scope | Tiempo estimado |
|---|---|---|
| 9 | Databases page + Playground enhancements | 2 días |
| 10 | PWA offline verification | 1.5 días |
| 11 | Test coverage | 1 día |
| 12 | Settings + i18n | 1 día |
| 13 | Polish (a11y, responsive, edge cases) | 2–3 días |
| 14 | CI/CD (opcional) | 0.5–1 día |
| 15 | Asistente IA + generación de ejercicios | 9–12 días |
| **Total** | | **17–22 días de trabajo** |

## Orden propuesto

1. **Fase 9** (más funcional, completa el flujo de DBs).
2. **Fase 12** (settings — desbloquea i18n para que la 13 pruebe localización y define el opt-in del IA).
3. **Fase 13** (a11y + responsive — depende de i18n).
4. **Fase 11** (tests).
5. **Fase 10** (PWA verification — manual, puede ir al final).
6. **Fase 14** (CI/CD — cuando todo lo anterior esté estable).
7. **Fase 15** (asistente IA — al final; presupone settings, persistencia, validación y chat UI estables).

## Cómo retomar

```bash
# 1. Instalar dependencias
npm install

# 2. Arrancar en dev
npm start
# → http://localhost:5173

# 3. Verificar que todo está bien
npm run typecheck
npm run test
npm run build
npm run preview
```

Las decisiones de arquitectura clave (wa-sqlite con VACUUM INTO, OPFSCoopSyncVFS sin COOP/COEP, Main Thread único que escribe en Dexie, etc.) están documentadas en `/workspace/RESEARCH.md`.

Las decisiones de implementación específicas (cómo encaja cada módulo) están en los `*-REPORT.md` de cada fase:

- `SCAFFOLD-REPORT.md` — base del proyecto + POCs.
- `POC-ENGINE-REPORT.md` — verificación de que wa-sqlite sirve.
- `POC-UI-REPORT.md` — verificación de que la UI stack funciona.
- `WORKER-EXEC-REPORT.md` — el Worker + DBAPI.
- `WORKER-STORAGE-REPORT.md` — snapshots + import/export.
- `PERSISTENCE-REPORT.md` — Dexie + bridge.
- `UI-SHELL-REPORT.md` — tema + páginas placeholder.
- `EDITOR-REPORT.md` — editor + explorer + results.
- `EXERCISE-ENGINE-REPORT.md` — motor de ejercicios.
- `COURSE-CONTENT-REPORT.md` — contenido del curso.
- `COURSE-UI-REPORT.md` — UI del curso.

Todos están en el repo.

## Estado de los deliverables al empaquetar

- 578 tests passing.
- Typecheck limpio.
- Build de producción verde (2.9 MB precache).
- Service Worker activo, manifest correcto.
- WASM pre-cacheado.
- 4 DBs seed + 16 lecciones + 112 ejercicios listos.
- UI completa para el flujo del curso (sidebar → lección → ejercicio → pista → solución → check → feedback).
- Playground con seed `playground` listo para experimentar.

Lo que NO está:

- Gestión de DBs de usuario (import/export UI, multi-DB switcher) → Fase 9.
- Página de Settings funcional → Fase 12.
- i18n en `ca` y `en` (solo `es` completo) → Fase 12.
- Procedimiento de PWA offline documentado paso a paso → Fase 10.
- Cobertura de tests medida formalmente → Fase 11.
- A11y WCAG 2.1 AA verificada → Fase 13.
- Responsive en mobile afinado → Fase 13.
- CI/CD → Fase 14.
- Asistente IA con observación del estado + generación de ejercicios persistidos → Fase 15.
