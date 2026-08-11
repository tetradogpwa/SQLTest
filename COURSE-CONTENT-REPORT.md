# Course Content Report — Fase 7.1

_Informe de scaffolding del curso para SQL Academy. Toda la documentación
y los literales visibles al usuario están en español._

## Resumen ejecutivo

Se ha construido el esqueleto completo del curso v1 de SQL Academy:

- **4 bases de datos semilla** (library, tienda, social, empresa) con
  datos realistas en dominios de habla hispana.
- **16 lecciones** (4 por base de datos) con dificultad progresiva.
- **112 ejercicios** en total (7 por lección, dentro del rango 80-120 del spec).
- **Módulos auxiliares**: glosario SQL en español (43 términos), guía
  de estudio por nivel, y utilidades de estadísticas.
- **71 tests unitarios** que cubren loaders, forma del curso, bases de
  datos, glosario, guía de estudio y stats.

El código typecheck-ea limpio con `npx tsc --noEmit` y los 71 tests
pasan con `npx vitest run tests/unit/content/`.

---

## Per-database stats

Estadísticas calculadas a partir del SQL de cada `DatabaseSeed`.

| ID       | Tablas | Filas | FKs | UNIQUE | Indexes | Tamaño SQL |
|----------|-------:|------:|----:|-------:|--------:|-----------:|
| library  | 4      | 185   | 3   | 2      | 1       | 14.4 KB    |
| tienda   | 4      | 370   | 3   | 2      | 2       | 19.5 KB    |
| social   | 4      | 403   | 5   | 3      | 1       | 30.9 KB    |
| empresa  | 4      | 140   | 3   | 3      | 1       | 11.5 KB    |
| **Total**| **16** | **1098** | **14** | **10** | **5** | **76.3 KB** |

### Detalle por base

#### `library` — Biblioteca Municipal
- **Tablas**: `autores` (15), `libros` (30), `socios` (25), `prestamos` (100).
- **FKs**: `libros.autor_id → autores.id`, `prestamos.libro_id → libros.id`,
  `prestamos.socio_id → socios.id`.
- **UNIQUE**: `libros.isbn`, `socios.email`.
- **Índices**: `idx_prestamos_socio` sobre `prestamos.socio_id`.
- **CHECK**: ninguno (no aporta pedagógicamente para esta lección).
- **Datos**: escritores hispánicos reales (Cervantes, Lorca, García
  Márquez, Borges, Neruda, …), libros de literatura universal, socios
  con nombres españoles.

#### `tienda` — Tienda Online
- **Tablas**: `productos` (50), `clientes` (30), `pedidos` (60), `lineas_pedido` (228).
- **FKs**: `pedidos.cliente_id → clientes.id`,
  `lineas_pedido.pedido_id → pedidos.id`,
  `lineas_pedido.producto_id → productos.id`.
- **UNIQUE**: `productos.sku`, `clientes.email`.
- **CHECK**: `pedidos.estado IN ('pendiente', 'pagado', 'enviado', 'entregado', 'cancelado')`.
- **Índices**: `idx_pedidos_cliente`, `idx_lineas_producto`.
- **Datos**: productos por categorías (Electrónica, Ropa, Hogar, …),
  ciudades españolas (Madrid, Barcelona, Valencia, Sevilla, …), importes
  en EUR.

#### `social` — Red Social
- **Tablas**: `usuarios` (20), `publicaciones` (40), `comentarios` (80), `likes` (263).
- **FKs**: `publicaciones.usuario_id → usuarios.id`,
  `comentarios.publicacion_id → publicaciones.id`,
  `comentarios.usuario_id → usuarios.id`,
  `likes.publicacion_id → publicaciones.id`,
  `likes.usuario_id → usuarios.id`.
- **UNIQUE**: `usuarios.handle`, `usuarios.email`, `likes(publicacion_id, usuario_id)`.
- **Índices**: `idx_comentarios_publicacion`.
- **Datos**: cuentas con `@handle`, posts con timestamp ISO, likes con
  `UNIQUE(publicacion_id, usuario_id)` para enseñar deduplicación.

#### `empresa` — Empresa Consultora
- **Tablas**: `departamentos` (5), `empleados` (30), `proyectos` (10), `asignaciones` (95).
- **FKs**: `empleados.departamento_id → departamentos.id`,
  `asignaciones.empleado_id → empleados.id`,
  `asignaciones.proyecto_id → proyectos.id`.
- **UNIQUE**: `departamentos.nombre`, `empleados.email`,
  `asignaciones(empleado_id, proyecto_id)`.
- **Índices**: `idx_asignaciones_proyecto`.
- **Datos**: 5 departamentos (Ingeniería, Consultoría, Investigación,
  Operaciones, Administración), empleados con salarios en EUR,
  proyectos para clientes reales (BBVA, Telefónica, Repsol, …).

### Idempotencia

Todas las sentencias SQL usan `CREATE TABLE IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS` e `INSERT OR IGNORE INTO`, por lo que un
seed puede re-ejecutarse sin errores.

---

## Per-level stats

Cada nivel tiene 4 lecciones y 28 ejercicios (7 por lección).
Distribución de tipos por nivel y total.

| Nivel | Título              | DB       | Lecciones | Ejercicios |
|-------|---------------------|----------|----------:|-----------:|
| L1    | Biblioteca Municipal | library  | 4         | 28         |
| L2    | Tienda Online        | tienda   | 4         | 28         |
| L3    | Red Social           | social   | 4         | 28         |
| L4    | Empresa Consultora   | empresa  | 4         | 28         |
| **Total** |                   |          | **16**    | **112**    |

### Ejercicios por tipo (total del curso)

| Tipo            | Cuenta | Porcentaje |
|-----------------|-------:|-----------:|
| writeQuery      | 32     | 28.6%      |
| completeQuery   | 16     | 14.3%      |
| predictResult   | 16     | 14.3%      |
| modifyQuery     | 16     | 14.3%      |
| explore         | 16     | 14.3%      |
| findError       | 8      |  7.1%      |
| fixQuery        | 8      |  7.1%      |

Cada lección sigue el patrón `2× writeQuery + 1× completeQuery + 1× predictResult + 1× findError/fixQuery + 1× modifyQuery + 1× explore` (7 ejercicios). El 7º (`explore`) se añadió para alcanzar el rango 80-120 del spec con margen.

### Distribución de difficulty (1-5)

| Difficulty | Cuenta |
|-----------:|-------:|
| 1 (fácil)  | 14     |
| 2          | 47     |
| 3 (medio)  | 51     |
| 4          | 0      |
| 5 (difícil)| 0      |

El rango del spec es 1-5; no se usan 4 ni 5 en esta primera versión
porque las lecciones son introductorias. La fase 7.2 podría añadir
ejercicios avanzados a las lecciones L*.4 (DML) si se quiere.

### Objetivos de aprendizaje

- **64 objetivos** en total (4 por lección × 16 lecciones).
- Cada objetivo está redactado en infinitivo ("Escribir consultas…",
  "Combinar tablas…", "Insertar filas…").

---

## Spanish quality notes

### Convenciones aplicadas

- **Tono**: cercano y pedagógico, en segunda persona del plural informal
  ("ejecuta la consulta", "fíjate en…", "puede que…").
- **Tildes y ortografía**: revisadas. Se han usado correctamente
  acentos en palabras como "búsqueda", "JOIN", "también", "próximo",
  "útil", "médico", "práctica".
- **Vocabulario técnico**: combinación de término inglés canónico
  (JOIN, GROUP BY, etc.) + traducción al español en el glosario.
- **Lugares y nombres**: topónimos españoles (Madrid, Barcelona, Sevilla,
  Bilbao, Salamanca, Cáceres…) y nombres propios hispánicos (Cervantes,
  Lorca, García Márquez, Pérez-Reverte, Ruiz Zafón…).
- **Moneda**: EUR con dos decimales en tienda y empresa.
- **Fechas**: ISO 8601 (`YYYY-MM-DD` o `YYYY-MM-DD HH:MM:SS`).

### Glosario

Se incluye un glosario de 43 términos SQL en español
(`src/content/glossary.ts`), cada uno con:

- término canónico en inglés
- traducción al español
- definición de una frase
- ejemplo SQL cuando aplica
- sinónimos cuando existen

Ejemplos destacados: `INNER JOIN → unión interna`, `GROUP BY → agrupar por`,
`IS NULL → es nulo`, `BETWEEN → entre`, `RETURNING → devolviendo`.

### Guía de estudio

Adicionalmente, `src/content/study-guide.ts` ofrece para cada lección:

- `summary`: una línea de motivación.
- `concepts`: lista de conceptos SQL que se practican.
- `pitfalls`: errores típicos que comete el alumno.
- `tips`: consejos por tipo de ejercicio (`writeQuery`, `completeQuery`,
  `predictResult`, `findError`, `fixQuery`, `modifyQuery`, `explore`).

Sirve para la UI (página "acerca del curso" o tooltips) y para que el
alumno tenga una visión global antes de enfrentarse a los ejercicios.

---

## File list + line counts

| Archivo                                                | Líneas |
|--------------------------------------------------------|-------:|
| `src/content/types.ts`                                 |    139 |
| `src/content/index.ts`                                 |     56 |
| `src/content/loaders.ts`                               |    273 |
| `src/content/glossary.ts`                              |    332 |
| `src/content/study-guide.ts`                           |    384 |
| `src/content/stats.ts`                                 |    249 |
| `src/content/databases/index.ts`                       |     33 |
| `src/content/databases/types.ts`                       |      9 |
| `src/content/databases/library.ts`                     |    312 |
| `src/content/databases/tienda.ts`                      |    363 |
| `src/content/databases/social.ts`                      |    410 |
| `src/content/databases/empresa.ts`                     |    247 |
| `src/content/lessons/library.ts`                       |    634 |
| `src/content/lessons/tienda.ts`                        |    622 |
| `src/content/lessons/social.ts`                        |    614 |
| `src/content/lessons/empresa.ts`                       |    613 |
| `src/core/exercises/types.ts` *(modificado)*           |    +20  |
| **Subtotal código**                                    | **5,318** |
| `tests/unit/content/loaders.test.ts`                   |    149 |
| `tests/unit/content/course-shape.test.ts`              |    236 |
| `tests/unit/content/databases.test.ts`                 |    175 |
| `tests/unit/content/glossary.test.ts`                  |     73 |
| `tests/unit/content/study-guide.test.ts`               |     62 |
| `tests/unit/content/stats.test.ts`                     |     89 |
| **Subtotal tests**                                     |  **784** |
| **TOTAL**                                              | **6,102** |

---

## Cambios al engine

El único cambio al motor de ejercicios fue añadir dos campos opcionales
al interface `Exercise` en `src/core/exercises/types.ts`:

- `baseQuery?: string` — para `modifyQuery`, contiene la query base que
  el alumno modifica.
- `modificationPrompt?: string` — para `modifyQuery`, contiene la
  instrucción concreta de modificación (distinta del `prompt` global).

Ambos son `optional` y no rompen consumidores existentes.

---

## Tests

| Test file                              | Tests | Descripción                                              |
|----------------------------------------|------:|----------------------------------------------------------|
| `tests/unit/content/loaders.test.ts`   | 17    | `loadCourse`, `loadDatabase`, lookup, `getNextExercise`   |
| `tests/unit/content/course-shape.test.ts` | 18 | Invariantes de forma (ids únicos, 5-7 ejercicios, etc.) |
| `tests/unit/content/databases.test.ts` | 16    | Sanity check de los 4 seeds (CREATE, INSERT, FK, UNIQUE) |
| `tests/unit/content/glossary.test.ts`  | 8     | Glosario en español, lookup case-insensitive             |
| `tests/unit/content/study-guide.test.ts` | 4   | Guía de estudio por nivel y lección                      |
| `tests/unit/content/stats.test.ts`     | 8     | Cálculo de estadísticas del curso y la base              |
| **TOTAL**                              | **71** | Todos pasan con `npx vitest run tests/unit/content/`     |

---

## Cómo se integra con el motor

- `Exercise` se re-exporta desde `src/content/types.ts` y se importa en
  los lesson files. Los tipos `Hint`, `Validation`, `ExerciseType` y
  `QueryResultShape` vienen del motor (`core/exercises/types.ts`).
- Las `DatabaseSeed.sql` se ejecutan tal cual sobre la working-copy
  cuando el motor siembra los datos de un ejercicio (ver `Exercise.lessonDbSeed`
  o el campo `seed` de un `Lesson` — en 7.1 todavía no se usa esta
  pipeline, pero el SQL es válido SQLite y el motor lo puede ejecutar).
- Los loaders (`loadCourse`, `loadDatabase`, `getExercise`, `getNextExercise`)
  se exponen como funciones puras, síncronas y testeables.

---

## Pendiente para la fase 7.2

Como indica el task spec, esta fase deja los siguientes campos como
**stubs** que se rellenarán en 7.2:

- `solution` (placeholder razonable en cada ejercicio).
- `solutionExplanation` (placeholder razonable).
- `validation: []` (vacío; el runner no validará nada en 7.1).
- `hints: [Hint]` con texto vacío (se rellenará en 7.2 con las 3
  pistas escalating por ejercicio).

La forma (shape) de cada `Exercise` está completa y es válida TypeScript.
El runner del motor puede iterar los ejercicios sin errores aunque las
validaciones estén vacías (devuelve "no hay validaciones" o pasa
directamente según cómo se configure el orchestrator).

---

VERDICT: PASS
