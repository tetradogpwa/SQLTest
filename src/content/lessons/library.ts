/**
 * Nivel 1 — "Biblioteca Municipal" (`library`).
 *
 * Agrupa 4 lecciones que cubren el camino SQL básico → avanzado usando
 * la base de datos `library`:
 *
 *   - L1.1 SELECT básico       → columnas, WHERE, ORDER BY, LIMIT
 *   - L1.2 JOIN y agregaciones  → INNER/LEFT JOIN, GROUP BY, COUNT/SUM/AVG
 *   - L1.3 Subqueries y CTEs   → subqueries escalares, IN, WITH
 *   - L1.4 DML                 → INSERT, UPDATE, DELETE + invariantes
 *
 * Cada lección tiene 6 ejercicios. La distribución por tipo (writeQuery,
 * completeQuery, predictResult, findError/fixQuery, modifyQuery) sigue
 * el plan del proyecto. Los `solution` y `validation` están como
 * **stubs** en esta fase (7.1) — la fase 7.2 los rellenará.
 *
 * Convenciones:
 *
 *   - `hints[0]` se deja vacío intencionalmente (lo rellenará 7.2).
 *   - `solution` y `solutionExplanation` son placeholders razonables
 *     para que la UI muestre algo mientras se carga la validación real.
 *   - `validation: []` siempre — el runner no validará nada en esta
 *     fase. Si el validador recibe una lista vacía, no ejecuta ninguna
 *     comprobación.
 *   - `tags` en kebab-lowercase desde el vocabulario del proyecto.
 */

import type { Exercise, Level, Lesson } from '../types'
import { librarySeed } from '../databases/library'

/* ──────────────────────────────────────────────────────────────────── *
 *  Helpers locales (no exportados)                                     *
 * ──────────────────────────────────────────────────────────────────── */

/** Crea un `Exercise` con los campos comunes ya rellenos. */
function ex(
  partial: Omit<Exercise, 'hints' | 'validation'> & {
    hints?: Exercise['hints']
    validation?: Exercise['validation']
  },
): Exercise {
  // Fase 7.2: `hints` y `validation` ya no son placeholders; si no se
  // pasan, se usan los reales. Esto permite centralizar el contrato
  // pedagógico en un solo punto y evita repetir las 3 pistas en cada
  // llamada a `ex()`.
  const defaultHints: Exercise['hints'] = [
    { level: 1, text: 'Piensa primero qué columnas necesitas ver y de qué tabla salen.', after: 'after-failure', type: 'conceptual' },
    { level: 2, text: 'Empieza la consulta con `SELECT ... FROM ...` y añade las cláusulas que te pida el enunciado.', after: 'after-2-failures', type: 'syntactic' },
    { level: 3, text: 'Revisa el ejemplo de solución; la idea es que la consulta devuelva exactamente lo que pide el prompt.', after: 'after-3-failures', type: 'semantic' },
  ]
  const defaultValidation: Exercise['validation'] = [
    { type: 'result', orderMatters: false },
  ]
  return {
    hints: partial.hints ?? defaultHints,
    validation: partial.validation ?? defaultValidation,
    ...partial,
  }
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Lección L1.1 — SELECT básico                                        *
 * ──────────────────────────────────────────────────────────────────── */

const l11: Lesson = {
  id: 'L1.1',
  order: 1,
  title: 'SELECT básico',
  description:
    'Aprende a consultar columnas, filtrar filas con WHERE, ordenar resultados y limitar el número devuelto.',
  objectives: [
    'Escribir consultas SELECT con una o varias columnas',
    'Aplicar filtros con WHERE usando operadores de comparación y lógicos',
    'Ordenar resultados con ORDER BY (ASC/DESC) y limitar con LIMIT',
    'Diferenciar entre comillas simples, dobles e identificadores sin comillas',
  ],
  exercises: [
    ex({
      id: 'L1.1-e1',
      lessonId: 'L1.1',
      type: 'writeQuery',
      title: 'Lista todos los libros',
      prompt:
        'Muestra el id, el título y el año de publicación de todos los libros de la biblioteca, ordenados por id ascendente.',
      databaseId: librarySeed.id,
      difficulty: 1,
      tags: ['select', 'order-by'],
      starterCode: '-- Escribe aquí tu consulta\n',
      solution: 'SELECT id, titulo, anio_publicacion FROM libros ORDER BY id ASC',
      solutionExplanation:
        'SELECT directo a las tres columnas pedidas, sin WHERE porque queremos todos los libros, y ordenamos por id ascendente.',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Identifica las tres columnas que quieres ver y la tabla de la que salen antes de escribir nada.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'La estructura básica es `SELECT col1, col2, col3 FROM nombre_tabla`; añade después `ORDER BY` para ordenar.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con `SELECT id, titulo, anio_publicacion FROM libros ORDER BY id ASC` para ver la lista completa en orden.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.1-e2',
      lessonId: 'L1.1',
      type: 'writeQuery',
      title: 'Libros publicados después del 2000',
      prompt:
        'Devuelve el título y el año de publicación de los libros publicados a partir del año 2000, ordenados del más reciente al más antiguo.',
      databaseId: librarySeed.id,
      difficulty: 1,
      tags: ['select', 'where', 'order-by'],
      starterCode: '-- Filtra por año y ordena descendente\n',
      solution: 'SELECT titulo, anio_publicacion FROM libros WHERE anio_publicacion >= 2000 ORDER BY anio_publicacion DESC',
      solutionExplanation:
        'WHERE con `>=` para incluir el 2000 exacto, y ORDER BY DESC para que el más reciente salga primero.',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Piensa qué condición tiene que cumplir el año (incluye el 2000) y en qué orden quieres ver los resultados.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Para incluir un valor concreto en un rango usa `>=` (no `>`). Para ordenar del más reciente al más antiguo, `ORDER BY ... DESC`.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'La forma final es `SELECT titulo, anio_publicacion FROM libros WHERE anio_publicacion >= 2000 ORDER BY anio_publicacion DESC`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.1-e3',
      lessonId: 'L1.1',
      type: 'completeQuery',
      title: 'Completa: autores españoles',
      prompt: 'Completa la consulta para mostrar el nombre y apellido de los autores de nacionalidad "Española".',
      databaseId: librarySeed.id,
      difficulty: 1,
      tags: ['select', 'where', 'string'],
      starterCode:
        '___ nombre, apellido\nFROM autores\nWHERE ___ = ___',
      solution: 'SELECT nombre, apellido FROM autores WHERE nacionalidad = \'Española\'',
      solutionExplanation:
        'Falta el verbo SELECT, la columna a filtrar (nacionalidad) y el valor entre comillas simples.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'El hueco al principio necesita un verbo SQL que indique qué quieres hacer con los datos.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Para textos literales en SQL se usan comillas simples (`\'Española\'`). El operador `=` compara la columna con ese valor.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Completa con `SELECT`, luego `nacionalidad` y por último la cadena entre comillas simples: `\'Española\'`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.1-e4',
      lessonId: 'L1.1',
      type: 'predictResult',
      title: 'Predice: ¿cuántas filas?',
      prompt:
        '¿Cuántas filas devuelve la siguiente consulta? Razona antes de ejecutarla.\n\nSELECT * FROM libros WHERE stock > 3 ORDER BY paginas DESC LIMIT 5',
      databaseId: librarySeed.id,
      difficulty: 2,
      tags: ['where', 'order-by', 'limit'],
      promptQuery: 'SELECT * FROM libros WHERE stock > 3 ORDER BY paginas DESC LIMIT 5',
      expectedResult: {
        columns: ['id', 'titulo', 'autor_id', 'isbn', 'genero', 'anio_publicacion', 'paginas', 'stock'],
        rows: [],
      },
      explanation:
        'La consulta devuelve como máximo 5 filas (LIMIT 5) tras filtrar por stock > 3 y ordenar por páginas descendente. Son los cinco libros con más stock alto y más páginas.',
      solutionExplanation:
        'LIMIT acota el resultado a 5 filas, pero cuáles dependen del stock y del orden por páginas.',
      solution: 'SELECT * FROM libros WHERE stock > 3 ORDER BY paginas DESC LIMIT 5',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Recuerda que `LIMIT 5` corta el resultado: nunca devuelve más de cinco filas, aunque haya muchas que cumplan el filtro.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'La consulta primero filtra (`stock > 3`), luego ordena por `paginas` descendente y por último se queda con 5 filas con `LIMIT 5`.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Para validar tu predicción, ejecuta la consulta tal cual y compara el número de filas con tu respuesta mental.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.1-e5',
      lessonId: 'L1.1',
      type: 'findError',
      title: 'Encuentra el error: typo en FROM',
      prompt:
        'La siguiente consulta debería listar todos los títulos de los libros, pero falla. ¿Qué le pasa?',
      databaseId: librarySeed.id,
      difficulty: 2,
      tags: ['select', 'string'],
      starterCode: '-- ¿Qué error ves?\nSELECT titulo FORM libros;',
      buggyCode: 'SELECT titulo FORM libros;',
      errorToFind: 'Typo en la palabra clave FROM (aparece como FORM).',
      solution: 'SELECT titulo FROM libros;',
      solutionExplanation:
        'El identificador "FORM" no es una palabra reservada de SQL; SQLite espera "FROM" para indicar la tabla fuente.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Compara letra por letra cada palabra clave de la consulta con la que usa SQL de verdad.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'La cláusula que indica de qué tabla lees los datos es `FROM` (no `FORM`). Es una palabra reservada del lenguaje.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Cambia `FORM` por `FROM` y la consulta funcionará: `SELECT titulo FROM libros;`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.1-e6',
      lessonId: 'L1.1',
      type: 'modifyQuery',
      title: 'Modifica: añade un ORDER BY',
      prompt: 'Modifica la siguiente consulta para que el resultado se ordene por título en orden ascendente.',
      databaseId: librarySeed.id,
      difficulty: 2,
      tags: ['select', 'order-by'],
      baseQuery: 'SELECT titulo, anio_publicacion FROM libros WHERE genero = \'Novela\'',
      modificationPrompt: 'Añade ORDER BY titulo ASC al final.',
      solution: 'SELECT titulo, anio_publicacion FROM libros WHERE genero = \'Novela\' ORDER BY titulo ASC',
      solutionExplanation:
        'Solo añadimos la cláusula ORDER BY al final. Mantenemos el WHERE y la proyección intactos.',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Una "modificación" conserva todo lo anterior y añade una cláusula nueva; no sustituyas nada esencial.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`ORDER BY` se coloca al final de la consulta, después del `WHERE`. Para orden alfabético ascendente: `ORDER BY titulo ASC`.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Copia la consulta base y añade ` ORDER BY titulo ASC` justo al final, antes del `;`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.1-e7',
      lessonId: 'L1.1',
      type: 'explore',
      title: 'Explora: ¿qué libros hay?',
      prompt:
        'No hay una respuesta única: explora la tabla `libros` y responde a tres preguntas con consultas distintas. Usa el editor como un bloc de notas.',
      databaseId: librarySeed.id,
      difficulty: 1,
      tags: ['select', 'aggregate', 'string'],
      objective:
        '1) ¿Cuántos libros hay en total?  2) ¿Cuántos géneros distintos existen?  3) ¿Cuál es el año de publicación más antiguo?',
      explorationHints: [
        'Para el primer punto, un COUNT(*) sobre la tabla basta.',
        'Para el segundo, piensa en qué cláusula evita contar duplicados.',
        'Para el tercero, una función de agregación sobre la columna anio_publicacion.',
      ],
      solution: '-- Múltiples consultas; no hay una única solución.\nSELECT COUNT(*) FROM libros;\nSELECT COUNT(DISTINCT genero) FROM libros;\nSELECT MIN(anio_publicacion) FROM libros;',
      solutionExplanation:
        'Cada pregunta requiere una consulta simple. Lo importante es entender qué hace cada función de agregación y por qué DISTINCT evita contar duplicados.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'No hay una única SQL correcta: cada pregunta se responde con una consulta distinta y luego combinas los resultados mentalmente.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`COUNT(*)` cuenta filas; `COUNT(DISTINCT col)` cuenta valores distintos; `MIN(col)` da el extremo inferior de una columna numérica.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Tres consultas separadas: una con COUNT(*), otra con COUNT(DISTINCT genero) y otra con MIN(anio_publicacion).',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
  ],
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Lección L1.2 — JOIN y agregaciones                                  *
 * ──────────────────────────────────────────────────────────────────── */

const l12: Lesson = {
  id: 'L1.2',
  order: 2,
  title: 'JOIN y agregaciones',
  description:
    'Combina tablas con INNER/LEFT JOIN y aprende a agrupar resultados con GROUP BY y funciones de agregación (COUNT, SUM, AVG, MAX, MIN).',
  objectives: [
    'Combinar dos tablas con INNER JOIN usando la cláusula ON',
    'Usar LEFT JOIN para incluir filas sin coincidencia',
    'Aplicar funciones de agregación: COUNT, SUM, AVG, MAX, MIN',
    'Agrupar resultados con GROUP BY y filtrar grupos con HAVING',
  ],
  exercises: [
    ex({
      id: 'L1.2-e1',
      lessonId: 'L1.2',
      type: 'writeQuery',
      title: 'Libros con su autor',
      prompt:
        'Muestra el título del libro y el nombre completo del autor (nombre + apellido) de cada libro. Ordena por título.',
      databaseId: librarySeed.id,
      difficulty: 2,
      tags: ['select', 'join', 'order-by', 'alias'],
      starterCode: '-- JOIN entre libros y autores\n',
      solution:
        'SELECT l.titulo, a.nombre || \' \' || a.apellido AS autor FROM libros l INNER JOIN autores a ON l.autor_id = a.id ORDER BY l.titulo',
      solutionExplanation:
        'INNER JOIN une las filas de libros con su autor por la FK. La concatenación con || genera el nombre completo y le damos un alias legible.',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Para unir dos tablas necesitas una FK que las conecte: en esta base, `libros.autor_id` apunta a `autores.id`.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`INNER JOIN ... ON` une filas por la condición de igualdad. Para concatenar texto usa `||`.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con `SELECT l.titulo, a.nombre || \' \' || a.apellido AS autor FROM libros l INNER JOIN autores a ON l.autor_id = a.id ORDER BY l.titulo`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.2-e2',
      lessonId: 'L1.2',
      type: 'writeQuery',
      title: 'Libros por autor',
      prompt: 'Para cada autor, muestra su nombre completo y el número de libros que tiene en la biblioteca. Ordena de más a menos.',
      databaseId: librarySeed.id,
      difficulty: 3,
      tags: ['select', 'join', 'group-by', 'aggregate', 'alias'],
      starterCode: '-- COUNT y GROUP BY\n',
      solution:
        'SELECT a.nombre || \' \' || a.apellido AS autor, COUNT(l.id) AS num_libros FROM autores a LEFT JOIN libros l ON l.autor_id = a.id GROUP BY a.id, a.nombre, a.apellido ORDER BY num_libros DESC',
      solutionExplanation:
        'LEFT JOIN para que autores sin libros salgan con 0. COUNT(l.id) cuenta libros sin contar NULLs, y agrupamos por autor para tener una fila por autor.',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Una fila por autor implica agrupar por autor; para contar por grupo necesitas una función de agregación como COUNT.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`LEFT JOIN` mantiene todas las filas de la tabla izquierda aunque no tengan coincidencia. `GROUP BY` agrupa filas con el mismo valor.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Usa `LEFT JOIN` autores → libros, `GROUP BY a.id, a.nombre, a.apellido` y `COUNT(l.id)`; ordena por ese conteo descendente.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.2-e3',
      lessonId: 'L1.2',
      type: 'completeQuery',
      title: 'Completa: préstamos activos',
      prompt: 'Completa la consulta para listar el título del libro y el nombre del socio en cada préstamo activo (sin fecha de devolución).',
      databaseId: librarySeed.id,
      difficulty: 2,
      tags: ['select', 'join', 'where', 'null'],
      starterCode:
        'SELECT l.titulo, s.nombre\nFROM prestamos p\nINNER ___ libros l ON p.___ = l.id\nINNER JOIN socios s ON p.___ = s.id\nWHERE p.fecha_devolucion ___ ___',
      solution:
        'SELECT l.titulo, s.nombre FROM prestamos p INNER JOIN libros l ON p.libro_id = l.id INNER JOIN socios s ON p.socio_id = s.id WHERE p.fecha_devolucion IS NULL',
      solutionExplanation:
        'Faltan los JOIN, las columnas de unión (libro_id y socio_id) y la condición de IS NULL para préstamos activos.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Para unir las tres tablas necesitas escribir dos JOIN y las columnas por las que se enlazan (las FK de cada tabla).',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`INNER JOIN` exige la palabra `JOIN`. Para detectar NULL se usa `IS NULL` (no `= NULL`).',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Completa: `INNER JOIN` (no `INNER ___`), `libro_id` y `socio_id` como columnas de enlace, y al final `IS NULL` para la fecha de devolución.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.2-e4',
      lessonId: 'L1.2',
      type: 'predictResult',
      title: 'Predice: promedio de páginas',
      prompt:
        '¿Cuál es el promedio de páginas de los libros del género "Novela"?',
      databaseId: librarySeed.id,
      difficulty: 2,
      tags: ['select', 'where', 'aggregate'],
      promptQuery: 'SELECT AVG(paginas) AS promedio_paginas FROM libros WHERE genero = \'Novela\'',
      expectedResult: {
        columns: ['promedio_paginas'],
        rows: [],
      },
      explanation:
        'AVG devuelve un único valor (o NULL si no hay filas). Para los libros del género Novela devuelve la media aritmética de su columna `paginas`.',
      solutionExplanation:
        'AVG aplica la media aritmética sobre la columna paginas para los libros del género Novela.',
      solution: 'SELECT AVG(paginas) AS promedio_paginas FROM libros WHERE genero = \'Novela\'',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'AVG (average) es la función de agregación que calcula la media aritmética de los valores no nulos de una columna.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Para predecir el resultado piensa: cuenta cuántos libros del género Novela hay y suma sus páginas; luego divide.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Ejecuta la consulta del prompt para ver el valor exacto. La media de las páginas de las novelas está en torno a 400.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.2-e5',
      lessonId: 'L1.2',
      type: 'fixQuery',
      title: 'Arregla: JOIN con ON incorrecto',
      prompt:
        'La siguiente consulta debería devolver el título del libro y el email del socio, pero devuelve datos cruzados. Arregla el JOIN.',
      databaseId: librarySeed.id,
      difficulty: 3,
      tags: ['join'],
      starterCode: '-- Corrige el JOIN\n',
      buggyCode:
        'SELECT l.titulo, s.email FROM prestamos p INNER JOIN libros l ON p.socio_id = l.id INNER JOIN socios s ON p.libro_id = s.id',
      errorToFind:
        'Las condiciones ON están intercambiadas: prestamos.libro_id debe ir con libros.id y prestamos.socio_id con socios.id.',
      solution:
        'SELECT l.titulo, s.email FROM prestamos p INNER JOIN libros l ON p.libro_id = l.id INNER JOIN socios s ON p.socio_id = s.id',
      solutionExplanation:
        'La FK correcta es prestamos.libro_id → libros.id y prestamos.socio_id → socios.id. Teníamos las dos columnas cruzadas.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Para cada JOIN pregúntate: ¿qué columna de la tabla izquierda es la FK y a qué columna de la tabla derecha apunta?',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'En esta base `libros.autor_id` apunta a `autores.id`, `prestamos.libro_id` a `libros.id` y `prestamos.socio_id` a `socios.id`.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Cambia `p.socio_id = l.id` por `p.libro_id = l.id` y `p.libro_id = s.id` por `p.socio_id = s.id`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.2-e6',
      lessonId: 'L1.2',
      type: 'modifyQuery',
      title: 'Modifica: añade HAVING',
      prompt:
        'Modifica la siguiente consulta para que solo muestre autores con más de 2 libros.',
      databaseId: librarySeed.id,
      difficulty: 3,
      tags: ['select', 'group-by', 'aggregate'],
      baseQuery:
        'SELECT a.nombre, COUNT(l.id) AS total FROM autores a LEFT JOIN libros l ON l.autor_id = a.id GROUP BY a.id',
      modificationPrompt: 'Añade HAVING COUNT(l.id) > 2 después de GROUP BY.',
      solution:
        'SELECT a.nombre, COUNT(l.id) AS total FROM autores a LEFT JOIN libros l ON l.autor_id = a.id GROUP BY a.id HAVING COUNT(l.id) > 2',
      solutionExplanation:
        'HAVING filtra los grupos ya formados; no se puede usar WHERE sobre funciones de agregación.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Para filtrar los grupos resultantes de un GROUP BY no puedes usar WHERE; necesitas otra cláusula que actúe sobre los agregados.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`HAVING` se coloca justo después del `GROUP BY` y admite condiciones con funciones de agregación (COUNT, SUM, AVG…).',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Añade `HAVING COUNT(l.id) > 2` al final de la consulta, después del GROUP BY.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.2-e7',
      lessonId: 'L1.2',
      type: 'explore',
      title: 'Explora: estadísticas de la biblioteca',
      prompt:
        'Usa el editor para responder, con una consulta cada vez, a estas tres preguntas sobre la biblioteca:',
      databaseId: librarySeed.id,
      difficulty: 2,
      tags: ['aggregate', 'join', 'group-by'],
      objective:
        '1) ¿Cuántos socios no han tomado ningún libro?  2) ¿Cuántos préstamos tiene, de media, cada libro?  3) ¿Cuál es el libro con más páginas?',
      explorationHints: [
        'Para la primera, necesitas un LEFT JOIN y filtrar por NULL.',
        'Para la segunda, GROUP BY libro_id con AVG sobre el número de préstamos (que es 1 por fila).',
        'Para la tercera, ORDER BY paginas DESC LIMIT 1, o un MAX si solo quieres el número.',
      ],
      solution: '-- Varias consultas; no hay una única respuesta correcta.\nSELECT COUNT(*) FROM socios s LEFT JOIN prestamos p ON p.socio_id = s.id WHERE p.id IS NULL;\nSELECT libro_id, COUNT(*) AS num_prestamos FROM prestamos GROUP BY libro_id;\nSELECT titulo FROM libros ORDER BY paginas DESC LIMIT 1;',
      solutionExplanation:
        'Cada pregunta es una consulta independiente. La clave es identificar la tabla relevante y aplicar el JOIN / GROUP BY correcto.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Identifica para cada pregunta qué tabla es la "principal" y qué relación necesitas (LEFT JOIN + IS NULL, GROUP BY, ORDER BY + LIMIT 1).',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`LEFT JOIN ... WHERE otra.id IS NULL` detecta filas sin relación. `ORDER BY ... DESC LIMIT 1` da el máximo. `GROUP BY` con `COUNT` agrupa.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Para la primera usa `LEFT JOIN prestamos` y filtra `p.id IS NULL`. Para la tercera `ORDER BY paginas DESC LIMIT 1`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
  ],
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Lección L1.3 — Subqueries y CTEs                                    *
 * ──────────────────────────────────────────────────────────────────── */

const l13: Lesson = {
  id: 'L1.3',
  order: 3,
  title: 'Subqueries y CTEs',
  description:
    'Aprende a anidar consultas: subqueries escalares, subqueries con IN/EXISTS, y la cláusula WITH para estructurar consultas complejas.',
  objectives: [
    'Escribir subqueries escalares en SELECT y WHERE',
    'Usar IN (SELECT ...) y NOT IN (SELECT ...) para filtrar por conjunto',
    'Crear CTEs con la cláusula WITH para dividir problemas en pasos',
    'Decidir entre subquery, CTE o JOIN según la legibilidad',
  ],
  exercises: [
    ex({
      id: 'L1.3-e1',
      lessonId: 'L1.3',
      type: 'writeQuery',
      title: 'Libros del autor más prolífico',
      prompt:
        'Muestra el título de los libros escritos por el autor con mayor número de libros en la biblioteca.',
      databaseId: librarySeed.id,
      difficulty: 3,
      tags: ['select', 'subquery', 'aggregate'],
      starterCode: '-- Subquery escalar\n',
      solution:
        'SELECT titulo FROM libros WHERE autor_id = (SELECT autor_id FROM libros GROUP BY autor_id ORDER BY COUNT(*) DESC LIMIT 1)',
      solutionExplanation:
        'La subquery devuelve el id del autor con más libros; el WHERE externo filtra los libros de ese autor.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Divide el problema: primero encuentra el id del autor con más libros, luego filtra los libros que tengan ese id.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Una subquery escalar va entre paréntesis y devuelve un único valor. Combínala con `=` en el WHERE de la consulta externa.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'La subquery es `SELECT autor_id FROM libros GROUP BY autor_id ORDER BY COUNT(*) DESC LIMIT 1`. Úsala en el WHERE externo con `=`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.3-e2',
      lessonId: 'L1.3',
      type: 'writeQuery',
      title: 'Socios que nunca han pedido prestado',
      prompt: 'Lista el nombre y apellido de los socios que nunca han tomado un libro en préstamo.',
      databaseId: librarySeed.id,
      difficulty: 3,
      tags: ['select', 'subquery', 'null'],
      starterCode: '-- NOT IN o NOT EXISTS\n',
      solution:
        'SELECT nombre, apellido FROM socios WHERE id NOT IN (SELECT DISTINCT socio_id FROM prestamos WHERE socio_id IS NOT NULL)',
      solutionExplanation:
        'NOT IN sobre el conjunto de socio_id que sí han hecho préstamos. Añadimos el WHERE para descartar NULLs que harían fallar el NOT IN.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Los socios "sin préstamos" son los que NO aparecen en la tabla `prestamos`. Piénsalo como una exclusión.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`NOT IN` con una subquery devuelve las filas cuyo valor no esté en el conjunto resultado. Ojo con los NULL: mejor filtrarlos dentro.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Subquery: `SELECT DISTINCT socio_id FROM prestamos WHERE socio_id IS NOT NULL`. Externa: `SELECT nombre, apellido FROM socios WHERE id NOT IN (...)`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.3-e3',
      lessonId: 'L1.3',
      type: 'completeQuery',
      title: 'Completa: top 5 libros más prestados',
      prompt: 'Completa la consulta para obtener los 5 libros con más préstamos usando un CTE.',
      databaseId: librarySeed.id,
      difficulty: 3,
      tags: ['select', 'cte', 'join', 'group-by', 'limit'],
      starterCode:
        'WITH conteo AS (\n  SELECT libro_id, ___(*) AS total\n  FROM prestamos\n  GROUP BY libro_id\n)\nSELECT l.titulo, c.total\nFROM conteo c\nINNER ___ libros l ON l.id = c.libro_id\nORDER BY c.total ___\nLIMIT 5',
      solution:
        'WITH conteo AS (SELECT libro_id, COUNT(*) AS total FROM prestamos GROUP BY libro_id) SELECT l.titulo, c.total FROM conteo c INNER JOIN libros l ON l.id = c.libro_id ORDER BY c.total DESC LIMIT 5',
      solutionExplanation:
        'Falta COUNT(*) para contar préstamos, INNER JOIN para unir con la tabla de libros, y ORDER BY DESC para que el más prestado quede arriba.',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Un CTE (WITH ... AS (...)) define un "resultado con nombre" que luego puedes usar como si fuera una tabla más.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`COUNT(*)` cuenta filas; `INNER JOIN` une por igualdad; `ORDER BY ... DESC LIMIT 5` se queda con los 5 mayores.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Completa con `COUNT`, `JOIN` y `DESC` en los huecos. La idea es contar préstamos por libro, unir con libros y quedarte con el top 5.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.3-e4',
      lessonId: 'L1.3',
      type: 'predictResult',
      title: 'Predice: autores huérfanos',
      prompt:
        '¿Cuántas filas devuelve la siguiente consulta?\n\nSELECT * FROM autores WHERE id NOT IN (SELECT autor_id FROM libros)',
      databaseId: librarySeed.id,
      difficulty: 3,
      tags: ['subquery', 'null'],
      promptQuery: 'SELECT * FROM autores WHERE id NOT IN (SELECT autor_id FROM libros)',
      expectedResult: { columns: ['id', 'nombre', 'apellido', 'nacionalidad', 'fecha_nacimiento'], rows: [] },
      explanation:
        'Como la columna autor_id es NOT NULL en libros, no hay NULLs "trampa" en la subquery. La consulta devuelve los autores que no tienen ningún libro asociado.',
      solutionExplanation:
        'NOT IN devuelve los autores sin libros; en este dataset todos los autores tienen al menos un libro.',
      solution: 'SELECT * FROM autores WHERE id NOT IN (SELECT autor_id FROM libros)',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: '`NOT IN (subquery)` devuelve las filas cuyo valor no esté en el conjunto resultado de la subquery.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'La subquery es `SELECT autor_id FROM libros` y la externa mira los autores cuyo `id` no esté en esa lista.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Ejecuta la consulta del prompt para ver cuántos autores "huérfanos" hay en la base sembrada.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.3-e5',
      lessonId: 'L1.3',
      type: 'findError',
      title: 'Encuentra el error: subquery sin alias',
      prompt:
        'La siguiente consulta debería devolver los libros cuyo autor es "Cervantes", pero falla. ¿Qué le pasa?',
      databaseId: librarySeed.id,
      difficulty: 3,
      tags: ['subquery', 'string'],
      starterCode: '-- ¿Qué error ves?\n',
      buggyCode:
        'SELECT titulo FROM libros WHERE autor_id = (SELECT id, nombre FROM autores WHERE apellido = \'Cervantes\')',
      errorToFind:
        'La subquery devuelve 2 columnas pero la comparación `=` espera exactamente 1. Hay que seleccionar solo `id` o usar `IN`.',
      solution:
        'SELECT titulo FROM libros WHERE autor_id IN (SELECT id FROM autores WHERE apellido = \'Cervantes\')',
      solutionExplanation:
        'Con `=` la subquery debe devolver exactamente una columna y una fila. Devolver dos columnas no es válido; mejor usar IN con solo `id`.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Cuando comparas con `=`, la subquery debe devolver un único valor. ¿Cuántas columnas y filas devuelve la subquery actual?',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Si esperas una lista de valores, usa `IN` en lugar de `=`. Si la subquery devuelve dos columnas, no es válida con `=`.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Cambia el `=` por `IN` y la subquery a `SELECT id FROM autores WHERE apellido = \'Cervantes\'`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.3-e6',
      lessonId: 'L1.3',
      type: 'modifyQuery',
      title: 'Modifica: convierte subquery en CTE',
      prompt:
        'Reescribe la siguiente consulta usando un CTE bien nombrado para mejorar la legibilidad.',
      databaseId: librarySeed.id,
      difficulty: 3,
      tags: ['cte', 'subquery'],
      baseQuery:
        'SELECT l.titulo FROM libros l WHERE l.autor_id = (SELECT id FROM autores WHERE apellido = \'Borges\')',
      modificationPrompt: 'Envuelve la subquery en un CTE llamado `borges` y úsalo en el WHERE.',
      solution:
        'WITH borges AS (SELECT id FROM autores WHERE apellido = \'Borges\') SELECT l.titulo FROM libros l INNER JOIN borges b ON l.autor_id = b.id',
      solutionExplanation:
        'Un CTE no es solo “mover la subquery arriba”: lo convertimos en una fuente más y lo unimos por JOIN, que suele ser más eficiente y legible.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Un CTE (WITH nombre AS (...)) es una subquery "promovida" a tabla temporal; puedes unirla con JOIN.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'La sintaxis es `WITH nombre_cte AS (SELECT ...) SELECT ... FROM nombre_cte`. Luego puedes hacer JOIN con otras tablas.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Reescribe: `WITH borges AS (SELECT id FROM autores WHERE apellido = \'Borges\') SELECT l.titulo FROM libros l INNER JOIN borges b ON l.autor_id = b.id`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.3-e7',
      lessonId: 'L1.3',
      type: 'explore',
      title: 'Explora: autores y préstamos',
      prompt:
        'Practica libremente con subqueries y CTEs sobre la biblioteca. Responde a tres preguntas con consultas distintas.',
      databaseId: librarySeed.id,
      difficulty: 3,
      tags: ['subquery', 'cte', 'aggregate'],
      objective:
        '1) ¿Qué autor ha escrito más libros?  2) ¿Qué socio ha hecho más préstamos?  3) ¿Cuántos libros se prestaron en 2024 (al menos una vez)?',
      explorationHints: [
        'La primera y la segunda se resuelven con un GROUP BY y ORDER BY COUNT(*) DESC LIMIT 1.',
        'La tercera necesita un WHERE con un rango de fechas o un LIKE sobre el prefijo "2024".',
        'Si quieres practicar CTEs, encapsula cada GROUP BY en un WITH y luego haz JOIN con la tabla correspondiente.',
      ],
      solution: '-- Varias consultas; no hay una única respuesta correcta.\nSELECT a.nombre, COUNT(*) FROM autores a INNER JOIN libros l ON l.autor_id = a.id GROUP BY a.id ORDER BY 2 DESC LIMIT 1;\nSELECT s.nombre, COUNT(*) FROM socios s INNER JOIN prestamos p ON p.socio_id = s.id GROUP BY s.id ORDER BY 2 DESC LIMIT 1;\nSELECT COUNT(DISTINCT libro_id) FROM prestamos WHERE fecha_prestamo LIKE \'2024%\';',
      solutionExplanation:
        'GROUP BY + ORDER BY + LIMIT 1 es el patrón canónico de "top 1 por grupo". DISTINCT evita contar el mismo libro varias veces si se prestó más de una vez en 2024.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Para responder "quién tiene más" necesitas agrupar por la entidad y contar; "cuántos en 2024" es un filtro por fecha.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`GROUP BY` + `ORDER BY COUNT(*) DESC LIMIT 1` da el "ganador" por grupo. `WHERE fecha LIKE \'2024%\'` filtra por prefijo de año.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Las dos primeras se resuelven con un JOIN + GROUP BY + ORDER BY + LIMIT 1; la tercera con `WHERE fecha_prestamo LIKE \'2024%\'` y `COUNT(DISTINCT libro_id)`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
  ],
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Lección L1.4 — DML                                                  *
 * ──────────────────────────────────────────────────────────────────── */

const l14: Lesson = {
  id: 'L1.4',
  order: 4,
  title: 'DML: INSERT, UPDATE, DELETE',
  description:
    'Aprende a modificar datos: insertar filas, actualizar valores existentes y eliminar registros, comprobando siempre el estado final.',
  objectives: [
    'Insertar filas con INSERT INTO ... VALUES',
    'Actualizar columnas con UPDATE y aplicar el WHERE con cuidado',
    'Eliminar filas con DELETE entendiendo la diferencia con DROP',
    'Verificar el efecto de las mutaciones con consultas de control',
  ],
  exercises: [
    ex({
      id: 'L1.4-e1',
      lessonId: 'L1.4',
      type: 'writeQuery',
      title: 'Inserta un nuevo socio',
      prompt:
        'Da de alta al socio "Carmen Ruiz", con email "carmen.ruiz@example.com", teléfono "655123456" y fecha de alta "2024-09-15". Asígnale el id 26 (el siguiente libre).',
      databaseId: librarySeed.id,
      difficulty: 2,
      tags: ['insert', 'string', 'date'],
      starterCode: '-- INSERT INTO\n',
      solution:
        'INSERT INTO socios (id, nombre, apellido, email, telefono, fecha_alta) VALUES (26, \'Carmen\', \'Ruiz\', \'carmen.ruiz@example.com\', \'655123456\', \'2024-09-15\')',
      solutionExplanation:
        'Indicamos explícitamente las columnas y los valores en el mismo orden. Es más seguro que confiar en el orden de la tabla.',
      validation: [
        { type: 'rowCount', table: 'socios', expected: 26 },
      ],
      hints: [
        {
          level: 1,
          text: 'Un INSERT añade una fila. Piensa qué columnas va a tener la fila nueva y en qué orden vas a poner los valores.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Sintaxis: `INSERT INTO tabla (col1, col2, ...) VALUES (val1, val2, ...)`. Pon las columnas en el mismo orden que los valores.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con `INSERT INTO socios (id, nombre, apellido, email, telefono, fecha_alta) VALUES (26, ...)`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.4-e2',
      lessonId: 'L1.4',
      type: 'writeQuery',
      title: 'Actualiza el stock de un libro',
      prompt:
        'Suma 5 unidades al stock del libro con id = 1 ("Don Quijote de la Mancha").',
      databaseId: librarySeed.id,
      difficulty: 2,
      tags: ['update', 'where', 'numeric'],
      starterCode: '-- UPDATE con WHERE\n',
      solution: 'UPDATE libros SET stock = stock + 5 WHERE id = 1',
      solutionExplanation:
        'El SET reasigna la columna stock; usar `stock = stock + 5` (no `stock + 5`) es la forma correcta. El WHERE acota al libro 1.',
      validation: [
        {
          type: 'invariant',
          sql: 'SELECT stock FROM libros WHERE id = 1',
          expectedResult: { columns: ['stock'], rows: [[9]] },
          description: 'el stock del libro 1 debe ser 9 después del UPDATE',
        },
      ],
      hints: [
        {
          level: 1,
          text: 'Un UPDATE modifica columnas existentes. Para incrementar un valor, referencia la columna a ambos lados del `=` (`stock = stock + 5`).',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Sintaxis: `UPDATE tabla SET col = expresión WHERE condición`. Sin WHERE, el UPDATE afecta a TODAS las filas.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Escribe `UPDATE libros SET stock = stock + 5 WHERE id = 1`. Esto añade 5 al stock del libro 1.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.4-e3',
      lessonId: 'L1.4',
      type: 'completeQuery',
      title: 'Completa: elimina préstamos antiguos',
      prompt:
        'Completa la consulta para eliminar los préstamos devueltos antes del 2024-01-01.',
      databaseId: librarySeed.id,
      difficulty: 2,
      tags: ['delete', 'where', 'date'],
      starterCode: '___ FROM prestamos WHERE fecha_devolucion ___ \'2024-01-01\'',
      solution: 'DELETE FROM prestamos WHERE fecha_devolucion < \'2024-01-01\'',
      solutionExplanation:
        'DELETE FROM con la cláusula WHERE limitando a devoluciones anteriores a 2024. Sin WHERE, borraríamos toda la tabla.',
      validation: [
        { type: 'rowCount', table: 'prestamos', expected: 115 },
      ],
      hints: [
        {
          level: 1,
          text: 'Un DELETE elimina filas. La palabra clave que abre la sentencia es `DELETE` y le sigue `FROM` para indicar la tabla.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Para fechas en formato ISO, el orden lexicográfico coincide con el cronológico: `\'2024-01-01\'` es la frontera y `<` es estricto.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Completa con `DELETE`, `<` y la fecha entre comillas. La forma final es `DELETE FROM prestamos WHERE fecha_devolucion < \'2024-01-01\'`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.4-e4',
      lessonId: 'L1.4',
      type: 'predictResult',
      title: 'Predice: ¿cuántos préstamos activos?',
      prompt:
        'Si ejecutamos `UPDATE prestamos SET fecha_devolucion = \'2024-08-25\' WHERE id = 5`, ¿cuántos préstamos activos quedan en la tabla?',
      databaseId: librarySeed.id,
      difficulty: 3,
      tags: ['update', 'where', 'null', 'date'],
      promptQuery:
        'SELECT COUNT(*) FROM prestamos WHERE fecha_devolucion IS NULL',
      expectedResult: { columns: ['COUNT(*)'], rows: [] },
      explanation:
        'Los préstamos "activos" son los que tienen `fecha_devolucion` NULL. La consulta los cuenta y devuelve un único número.',
      solutionExplanation:
        'Para predecirlo mentalmente: cuenta las filas con `fecha_devolucion IS NULL` en el estado actual.',
      solution: 'SELECT COUNT(*) FROM prestamos WHERE fecha_devolucion IS NULL',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Un préstamo "activo" es aquel cuya `fecha_devolucion` es NULL; un préstamo cerrado tiene una fecha concreta.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Para contar NULLs se usa `WHERE columna IS NULL`. `COUNT(*)` con ese filtro te da el total de filas activas.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Ejecuta la consulta del prompt para ver el número exacto. Compáralo con tu predicción mental.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.4-e5',
      lessonId: 'L1.4',
      type: 'fixQuery',
      title: 'Arregla: UPDATE sin WHERE',
      prompt:
        'La siguiente consulta pretendía subir el salario de los empleados del departamento 1 a 50000, pero ha actualizado a todos. Arregla el UPDATE.',
      databaseId: librarySeed.id,
      difficulty: 2,
      tags: ['update', 'where', 'numeric'],
      starterCode: '-- Falta el WHERE\n',
      buggyCode: 'UPDATE empleados SET salario = 50000',
      errorToFind: 'Falta la cláusula WHERE, por lo que el UPDATE afecta a todas las filas.',
      solution: 'UPDATE empleados SET salario = 50000 WHERE departamento_id = 1',
      solutionExplanation:
        'Sin WHERE, SQLite actualiza todas las filas de la tabla. Hay que limitar al departamento 1.',
      validation: [
        { type: 'rowCount', table: 'empleados', expected: 30 },
      ],
      hints: [
        {
          level: 1,
          text: 'Si un UPDATE cambia "a todos", casi siempre falta el WHERE. Localiza qué fila(s) quieres modificar exactamente.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Sin WHERE, el UPDATE toca TODAS las filas de la tabla. El WHERE se coloca al final de la sentencia.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Añade `WHERE departamento_id = 1` al final del UPDATE. Esto limitará el cambio al departamento indicado.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.4-e6',
      lessonId: 'L1.4',
      type: 'modifyQuery',
      title: 'Modifica: añade RETURNING',
      prompt:
        'Añade la cláusula RETURNING al INSERT para que muestre el id del socio recién creado.',
      databaseId: librarySeed.id,
      difficulty: 3,
      tags: ['insert', 'string'],
      baseQuery:
        'INSERT INTO socios (id, nombre, apellido, email, fecha_alta) VALUES (27, \'Antonio\', \'Vega\', \'antonio.vega@example.com\', \'2024-10-01\')',
      modificationPrompt: 'Añade RETURNING id al final del INSERT.',
      solution:
        'INSERT INTO socios (id, nombre, apellido, email, fecha_alta) VALUES (27, \'Antonio\', \'Vega\', \'antonio.vega@example.com\', \'2024-10-01\') RETURNING id',
      solutionExplanation:
        'RETURNING hace que el INSERT devuelva el id insertado; es muy útil cuando la PK es autoincrement y no la hemos indicado nosotros.',
      validation: [
        { type: 'rowCount', table: 'socios', expected: 26 },
      ],
      hints: [
        {
          level: 1,
          text: '`RETURNING` convierte un INSERT/UPDATE/DELETE en una consulta que devuelve filas: las columnas que pidas de la fila afectada.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Sintaxis: al final del INSERT, antes del `;`, escribe `RETURNING columna1, columna2`.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Añade `RETURNING id` al final del INSERT. El motor devolverá una fila con el id del socio recién creado.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L1.4-e7',
      lessonId: 'L1.4',
      type: 'explore',
      title: 'Explora: mantenimiento de la biblioteca',
      prompt:
        'Practica las tres operaciones DML (INSERT, UPDATE, DELETE) en el editor. Cada operación debe ir en una consulta separada.',
      databaseId: librarySeed.id,
      difficulty: 3,
      tags: ['insert', 'update', 'delete'],
      objective:
        '1) Inserta un nuevo préstamo del socio 3 para el libro 7, con fecha "2024-10-15" y sin fecha de devolución.  2) Sube el stock del libro 7 en 3 unidades.  3) Elimina el préstamo recién creado (asume que su id es 41).',
      explorationHints: [
        'Para el INSERT, el NULL en fecha_devolucion se escribe sin comillas.',
        'Para el UPDATE, recuerda usar stock = stock + 3 para no perder el valor anterior.',
        'Para el DELETE, asegúrate de que el WHERE es muy específico: WHERE id = 41.',
      ],
      solution: '-- Tres consultas; ejecuta cada una en orden.\nINSERT INTO prestamos (id, libro_id, socio_id, fecha_prestamo, fecha_devolucion) VALUES (41, 7, 3, \'2024-10-15\', NULL);\nUPDATE libros SET stock = stock + 3 WHERE id = 7;\nDELETE FROM prestamos WHERE id = 41;',
      solutionExplanation:
        'Cada mutación es independiente. La gracia del ejercicio es encadenarlas mentalmente: insertar, actualizar el stock (porque "se ha prestado" implica que ya no está disponible) y borrar.',
      validation: [{ type: 'rowCount', table: 'prestamos', expected: 115 }],
      hints: [
        {
          level: 1,
          text: 'Planifica el orden: en producción las tres mutaciones irían en una transacción para que se deshagan si una falla.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Para NULL en VALUES no uses comillas. Para incrementar numéricamente, escribe `col = col + N`. Para borrar una sola fila, usa `WHERE id = N`.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'INSERT: `INSERT INTO prestamos (...) VALUES (41, 7, 3, \'2024-10-15\', NULL)`. UPDATE: `UPDATE libros SET stock = stock + 3 WHERE id = 7`. DELETE: `DELETE FROM prestamos WHERE id = 41`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
  ],
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Export del nivel                                                    *
 * ──────────────────────────────────────────────────────────────────── */

export const libraryLevels: Level[] = [
  {
    id: 'L1',
    order: 1,
    title: 'Biblioteca Municipal',
    description:
      'Una biblioteca de barrio con 30 libros, 15 autores, 25 socios y 40 préstamos. SELECT básico hasta DML completo.',
    databaseId: librarySeed.id,
    lessons: [l11, l12, l13, l14],
  },
]
