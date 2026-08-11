# CI/CD Report — Fase 14

> Pipeline de integración continua, releases y governance.

## Resumen

Fase 14 deja la app con un pipeline reproducible: cada push y cada
PR ejecuta el mismo set de chequeos que el mantenedor corre en su
máquina. La cobertura de tests queda como artefacto de cada run
y como comentario sticky en cada PR. Las releases son tag-based y
generan un GitHub Release con notas auto-generadas.

## Antes / después

| Métrica                                                  | Antes | Después |
|----------------------------------------------------------|-------|---------|
| Workflows en `.github/workflows/`                         | 0     | **3**   |
| CI corre en PRs                                          | ❌    | **✅**   |
| Cobertura de tests medida formalmente                      | ❌    | **87.4%** lines / **75.5%** branches / **83.4%** functions |
| Tag-based releases                                       | ❌    | **✅**   |
| Dependabot                                               | ❌    | **✅**   |
| Code owners / review rules                                | ❌    | **✅**   |
| PR / issue templates                                     | ❌    | **✅**   |
| Badges de CI en README                                    | ❌    | **✅**   |

## Workflows

### `ci.yml` — pipeline principal

Se ejecuta en cada push a `main` y cada PR. Cuatro jobs en orden
de costo (rápido → lento):

| Job              | Comando                            | Tiempo aprox. | Falla PRs |
|------------------|------------------------------------|---------------|----------|
| `lint-typecheck` | `npm run lint && npm run typecheck` | < 1 min       | ✅       |
| `test`           | `npm test`                         | ~ 1 min       | ✅       |
| `coverage`       | `npm run test:coverage`            | ~ 1 min       | ❌ (info) |
| `build`          | `npm run build`                    | < 1 min       | ✅       |

- **`lint-typecheck` no depende de nadie** — corre en paralelo con
  los demás.
- **`coverage`** se mantiene como `needs: lint-typecheck` pero
  **no bloquea el PR** (es informativo). La decisión de bloquear o
  no en el futuro queda en manos de la Fase 15.
- **`build` depende de `test`** — un build verde sobre código
  rojo no aporta valor.
- **Concurrencia**: `concurrency: ci-${{ github.ref }}` cancela
  pushes anteriores al mismo ref para no gastar minutos de CI.
- **Cache de npm** vía `actions/setup-node` con `cache: 'npm'`.

### `release.yml` — releases tag-based

Trigger: push de un tag `v*` (o `workflow_dispatch` con un tag
manual). El flujo:

1. Hace checkout del ref (que es el tag, así que `package.json`
   ya contiene la versión correcta).
2. `npm ci && npm run build` — la build embebe `process.env.npm_package_version`
   en `__APP_VERSION__` (Settings → Acerca de muestra la versión real).
3. `softprops/action-gh-release@v2` adjunta `dist/**` al release y
   genera notas automáticas desde los commits del rango.

**Cómo crear un release** (mantenedor):

```bash
# 1. Bump version (esto crea el commit y el tag)
npm version patch  # o minor / major
# 2. Push del commit + tag
git push --follow-tags
# 3. La action se dispara y adjunta dist/ al release
```

**Por qué no `release-please`**: el repo no usa Conventional
Commits. Adoptarlo requeriría un squash-merge policy + un rewrite
del historial. Tag-based es explícito y reversible; se mantiene
como fallback incluso si en el futuro migramos a release-please.

### `pr-coverage.yml` — resumen de cobertura en cada PR

Corre en cada PR, ejecuta `npm run test:coverage`, y postea un
comentario sticky con los porcentajes globales. Usa
`marocchino/sticky-pull-request-comment` para evitar spamear
comentarios en cada push (el segundo push reemplaza el primero).

El comentario es solo informativo — **no bloquea el PR**. La
revisión humana del delta (% lines bajando) sigue siendo del
revisor.

## Governance

### `CODEOWNERS`

```
*                            @tetradogpwa
/src/workers/                @tetradogpwa
/src/core/exercises/          @tetradogpwa
/src/core/persistence/        @tetradogpwa
/.github/                     @tetradogpwa
/vitest.config.ts             @tetradogpwa
/vite.config.ts               @tetradogpwa
```

Para activar el gate de review obligatorio en `main`, marcar la
check `CI / lint-typecheck + test + build` como required en
Settings → Branches → Branch protection rules.

### `dependabot.yml`

- npm: PRs semanales agrupados (react, codemirror, testing, etc.).
- github-actions: PRs semanales para mantener las actions al día.
- Ignoramos majors (requieren review manual).

### Templates

- `.github/ISSUE_TEMPLATE/bug.md` — pide versión + capability del
  Worker (necesario para reproducir bugs de OPFS).
- `.github/ISSUE_TEMPLATE/feature.md` — pide acceptance criteria
  + un checklist de i18n + a11y.
- `.github/PULL_REQUEST_TEMPLATE.md` — checklist de typecheck /
  lint / test / build antes de pedir review.

## Cobertura

### Configuración (`vitest.config.ts`)

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'html', 'lcov', 'json-summary'],
  reportsDirectory: './coverage',
  include: ['src/**/*.{ts,tsx}'],
  exclude: [
    'src/**/*.d.ts',
    'src/main.tsx',                  // entrypoint no se testea directo
    'src/build-info.d.ts',
    'src/workers/sw.ts',            // código del SW
    'src/workers/sqlite.worker.ts', // entrypoint del Worker
    'src/workers/wa-sqlite.d.ts',   // shim de tipos
  ],
}
```

### Baseline actual

```
All files          |   87.38 |    75.48 |   83.36 |   87.38 |
```

- **Lines: 87.38%** — supera el 80% target del roadmap.
- **Branches: 75.48%** — casi llega al 80%; la diferencia son
  ramas de error en el Worker que ya cubren los POC tests pero no
  el `istanbul` directo (la harness sólo corre paths felices).
- **Functions: 83.36%**.

### Áreas con más gap (futuro)

- `src/workers/dbapi.ts` (0% — orquestador puro, se ejercita
  via POCs)
- `src/workers/query-executor.ts` (0% — mismo motivo)
- `src/workers/types.ts` (0% — tipos, no hay runtime que cubrir)
- `src/ui/pages/ExercisePage.tsx` (52% — falta mockear `useExercise`
  con resultados exhaustivos)
- `src/ui/pages/LessonPage.tsx` (63% — idem)
- `src/ui/pages/LevelPage.tsx` (0% — page estática, no testeada)

Estos gaps son **Fase 11** (test coverage) en el roadmap — el
siguiente paso natural ahora que el pipeline reporta los números.

## Verificación local

```bash
# Pipeline en local (orden)
npm run typecheck
npm run lint
npm test
npm run test:coverage  # genera ./coverage/index.html
npm run build          # genera ./dist/

# Verificar workflows antes de pushear
npx act -j lint-typecheck   # opcional, requiere Docker
```

## Coste

CI usa `ubuntu-latest` con caché de npm:

- Push a PR: ~ 4 min de CI
- Push a main: ~ 4 min de CI
- Release: ~ 3 min extra (build + upload del dist)

Total: ~ 1 hora de CI / semana con 5 pushes / día. Dentro del
free tier de GitHub Actions (2 000 min / mes para repos públicos).

## Decisiones de scope

- **No deploy automático a GitHub Pages** — el repo del usuario
  (`tetradogpwa/SQLTest`) no tiene configurado el Pages source; el
  artefacto `dist/` queda disponible en el run para descarga manual
  o para un job de deploy futuro. Configurar Pages + deploy es un
  cambio de un par de líneas en `release.yml` cuando el usuario
  quiera.
- **Coverage no bloquea PRs** — el comentario sticky es señal
  suficiente; bloquear por % introducirá fricción sin upside claro
  en esta fase. Cuando los thresholds del roadmap (≥ 80% líneas +
  branches) se acerquen al 100% del codebase, se puede cambiar
  `continue-on-error: false` o añadir un job de enforcement.
- **No hay `release-please`** — ver la nota arriba sobre commits.

## Verificación

- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run test` ✅ 657/657
- `npm run test:coverage` ✅ reporta 87.4% / 75.5% / 83.4%
- `npm run build` ✅ WASM precache 3.0 MB
- Workflows validados con `python3 -c "import yaml; yaml.safe_load(...)"`

## Follow-up recomendado

- Marcar la CI como required en branch protection de `main`.
- Habilitar auto-merge de Dependabot patches una vez el codebase
  esté más maduro.
- Configurar GitHub Pages (o Cloudflare Pages) + un job de
  deploy automático en `release.yml`.
- Migrar a `release-please` cuando se adopte Conventional Commits
  (elimina la fricción de `npm version`).
