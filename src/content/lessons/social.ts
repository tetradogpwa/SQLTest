/**
 * Nivel 3 — "Red Social" (`social`).
 *
 *  - L3.1 SELECT básico
 *  - L3.2 JOIN y agregaciones
 *  - L3.3 Subqueries y CTEs
 *  - L3.4 DML
 *
 * El dominio (microblogging con usuarios, publicaciones, comentarios
 * y likes) permite enseñar agregaciones por usuario, manejo de fechas
 * con timestamp y deduplicación con DISTINCT.
 */

import type { Exercise, Level, Lesson } from '../types'
import { socialSeed } from '../databases/social'

/* ──────────────────────────────────────────────────────────────────── *
 *  Helpers                                                             *
 * ──────────────────────────────────────────────────────────────────── */

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
 *  Lección L3.1 — SELECT básico                                        *
 * ──────────────────────────────────────────────────────────────────── */

const l31: Lesson = {
  id: 'L3.1',
  order: 1,
  title: 'SELECT básico',
  description:
    'Recorre la tabla de usuarios y publicaciones: filtros por texto, orden por fecha, y paginación con LIMIT.',
  objectives: [
    'Consultar columnas de las tablas de la red social',
    'Filtrar por patrones de texto con LIKE',
    'Ordenar por fecha y limitar resultados',
    'Usar DISTINCT para deduplicar resultados',
  ],
  exercises: [
    ex({
      id: 'L3.1-e1',
      lessonId: 'L3.1',
      type: 'writeQuery',
      title: 'Usuarios más recientes',
      prompt:
        'Muestra handle, nombre y fecha de registro de los 5 usuarios más recientes, ordenados del más nuevo al más antiguo.',
      databaseId: socialSeed.id,
      difficulty: 1,
      tags: ['select', 'order-by', 'limit', 'date'],
      starterCode: '-- ORDER BY fecha_registro DESC LIMIT 5\n',
      solution:
        'SELECT handle, nombre, fecha_registro FROM usuarios ORDER BY fecha_registro DESC LIMIT 5',
      solutionExplanation:
        'ORDER BY fecha_registro DESC nos lleva del usuario más nuevo al más antiguo; LIMIT 5 corta el resultado.',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Para "los N más recientes" combina ORDER BY sobre la fecha con LIMIT 5.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`ORDER BY fecha_registro DESC` ordena del más reciente al más antiguo. `LIMIT 5` corta el resultado.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con `SELECT handle, nombre, fecha_registro FROM usuarios ORDER BY fecha_registro DESC LIMIT 5`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.1-e2',
      lessonId: 'L3.1',
      type: 'writeQuery',
      title: 'Publicaciones con un patrón',
      prompt:
        'Lista el contenido y la fecha de las publicaciones que contengan la palabra "música" (LIKE con wildcard).',
      databaseId: socialSeed.id,
      difficulty: 2,
      tags: ['select', 'where', 'string', 'date'],
      starterCode: '-- LIKE con %\n',
      solution:
        'SELECT contenido, fecha FROM publicaciones WHERE contenido LIKE \'%música%\'',
      solutionExplanation:
        'LIKE con % a ambos lados busca el patrón en cualquier posición. Importante: en SQLite LIKE es case-insensitive por defecto para ASCII.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Para buscar una palabra dentro de un texto piensa en un "comodín" que represente "cualquier carácter".',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`LIKE \'%música%\'` busca el patrón en cualquier posición de la columna. El símbolo `%` actúa como comodín.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con `SELECT contenido, fecha FROM publicaciones WHERE contenido LIKE \'%música%\'`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.1-e3',
      lessonId: 'L3.1',
      type: 'completeQuery',
      title: 'Completa: usuarios sin bio',
      prompt: 'Completa la consulta para listar handle y nombre de los usuarios sin biografía (bio IS NULL).',
      databaseId: socialSeed.id,
      difficulty: 2,
      tags: ['select', 'where', 'null'],
      starterCode: 'SELECT handle, nombre FROM ___ WHERE ___ IS ___',
      solution: 'SELECT handle, nombre FROM usuarios WHERE bio IS NULL',
      solutionExplanation:
        'Para comprobar NULL usamos IS NULL (no `= NULL`). La tabla correcta es usuarios.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Tres huecos: la tabla, la columna a filtrar y el operador de comparación con NULL.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'La tabla es `usuarios`, la columna es `bio` y para NULL se usa `IS NULL` (no `= NULL`).',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Completa con `usuarios`, `bio` y `NULL`. La forma final: `WHERE bio IS NULL`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.1-e4',
      lessonId: 'L3.1',
      type: 'predictResult',
      title: 'Predice: publicaciones del usuario 1',
      prompt:
        '¿Cuántas publicaciones ha hecho el usuario con id = 1?',
      databaseId: socialSeed.id,
      difficulty: 2,
      tags: ['where', 'aggregate', 'numeric'],
      promptQuery: 'SELECT COUNT(*) FROM publicaciones WHERE usuario_id = 1',
      expectedResult: { columns: ['COUNT(*)'], rows: [] },
      explanation:
        '`COUNT(*)` con `WHERE usuario_id = 1` cuenta las publicaciones del usuario 1 y devuelve un único número.',
      solutionExplanation:
        'COUNT(*) sobre el filtro WHERE usuario_id = 1 da el total de publicaciones del usuario.',
      solution: 'SELECT COUNT(*) FROM publicaciones WHERE usuario_id = 1',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Para "cuántas publicaciones del usuario N" usa un COUNT con WHERE sobre `usuario_id`.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`COUNT(*)` cuenta filas. `WHERE usuario_id = 1` filtra por el id del usuario.',
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
      id: 'L3.1-e5',
      lessonId: 'L3.1',
      type: 'findError',
      title: 'Encuentra el error: identificador sin comillas',
      prompt:
        'La siguiente consulta debería devolver los usuarios cuyo handle es exactamente "lucia_dev" pero devuelve 0 filas. ¿Qué le pasa?',
      databaseId: socialSeed.id,
      difficulty: 2,
      tags: ['select', 'where', 'string'],
      starterCode: '-- 0 filas, ¿por qué?\n',
      buggyCode: 'SELECT * FROM usuarios WHERE handle = lucia_dev',
      errorToFind:
        'Faltan las comillas alrededor del literal. Sin ellas, SQLite interpreta `lucia_dev` como un nombre de columna, no como una cadena.',
      solution: 'SELECT * FROM usuarios WHERE handle = \'lucia_dev\'',
      solutionExplanation:
        'Los literales de texto van entre comillas simples. Sin comillas, `lucia_dev` se trata como identificador de columna (que no existe).',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Compara el literal `lucia_dev` en la consulta con la forma de escribir cadenas en SQL.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Las cadenas en SQL van entre comillas simples (`\'...\'`). Sin comillas, el motor interpreta `lucia_dev` como un nombre de columna.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Cambia `lucia_dev` por `\'lucia_dev\'`. Con comillas, SQLite sabe que es un literal de texto y lo compara con la columna.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.1-e6',
      lessonId: 'L3.1',
      type: 'modifyQuery',
      title: 'Modifica: añade DISTINCT',
      prompt:
        'Modifica la siguiente consulta para que no repita handles aunque haya varios matches.',
      databaseId: socialSeed.id,
      difficulty: 2,
      tags: ['select', 'distinct'],
      baseQuery:
        'SELECT u.handle FROM usuarios u INNER JOIN publicaciones p ON p.usuario_id = u.id WHERE p.contenido LIKE \'%arte%\'',
      modificationPrompt: 'Añade DISTINCT justo después de SELECT.',
      solution:
        'SELECT DISTINCT u.handle FROM usuarios u INNER JOIN publicaciones p ON p.usuario_id = u.id WHERE p.contenido LIKE \'%arte%\'',
      solutionExplanation:
        'DISTINCT elimina filas duplicadas. Sin él, un usuario con 3 publicaciones sobre "arte" saldría 3 veces.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Para deduplicar filas piensa en una palabra clave que indique "filas únicas".',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`DISTINCT` se coloca justo después de `SELECT`. Hace que el resultado no tenga filas repetidas.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Cambia `SELECT u.handle` por `SELECT DISTINCT u.handle`. El resto de la consulta se queda igual.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.1-e7',
      lessonId: 'L3.1',
      type: 'explore',
      title: 'Explora: la red social',
      prompt:
        'No hay una única respuesta: explora la red social con tres consultas libres.',
      databaseId: socialSeed.id,
      difficulty: 1,
      tags: ['select', 'aggregate', 'string'],
      objective:
        '1) ¿Cuántos usuarios hay en total?  2) ¿Cuántas publicaciones contienen la palabra "música"?  3) ¿Cuál es la publicación más reciente?',
      explorationHints: [
        'La primera es COUNT(*) sobre la tabla usuarios.',
        'La segunda usa LIKE con % a ambos lados.',
        'La tercera es ORDER BY fecha DESC LIMIT 1 sobre publicaciones.',
      ],
      solution: '-- Tres consultas separadas.\nSELECT COUNT(*) FROM usuarios;\nSELECT COUNT(*) FROM publicaciones WHERE contenido LIKE \'%música%\';\nSELECT contenido, fecha FROM publicaciones ORDER BY fecha DESC LIMIT 1;',
      solutionExplanation:
        'Cada pregunta es una consulta trivial. Lo importante es identificar la columna y la cláusula correctas, no combinar operaciones todavía.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Cada pregunta tiene su consulta; no intentes hacer una sola megaquery.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`COUNT(*)` cuenta filas. `LIKE \'%patrón%\'` busca texto. `ORDER BY fecha DESC LIMIT 1` da la publicación más reciente.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Tres consultas: `SELECT COUNT(*) FROM usuarios`, `SELECT COUNT(*) FROM publicaciones WHERE contenido LIKE \'%música%\'` y `SELECT contenido, fecha FROM publicaciones ORDER BY fecha DESC LIMIT 1`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
  ],
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Lección L3.2 — JOIN y agregaciones                                  *
 * ──────────────────────────────────────────────────────────────────── */

const l32: Lesson = {
  id: 'L3.2',
  order: 2,
  title: 'JOIN y agregaciones',
  description:
    'Combina las cuatro tablas para responder preguntas como: ¿quién ha publicado más? ¿cuáles son las publicaciones con más likes?',
  objectives: [
    'Hacer JOINs encadenados entre 3 o 4 tablas',
    'Calcular promedios y totales con AVG y SUM',
    'Aplicar GROUP BY a varias columnas',
    'Usar HAVING para filtrar resultados agregados',
  ],
  exercises: [
    ex({
      id: 'L3.2-e1',
      lessonId: 'L3.2',
      type: 'writeQuery',
      title: 'Usuarios con más publicaciones',
      prompt:
        'Muestra el handle y el número de publicaciones de cada usuario. Ordena de más a menos publicaciones.',
      databaseId: socialSeed.id,
      difficulty: 2,
      tags: ['select', 'join', 'group-by', 'aggregate'],
      starterCode: '-- JOIN + GROUP BY\n',
      solution:
        'SELECT u.handle, COUNT(p.id) AS num_publicaciones FROM usuarios u LEFT JOIN publicaciones p ON p.usuario_id = u.id GROUP BY u.id, u.handle ORDER BY num_publicaciones DESC',
      solutionExplanation:
        'LEFT JOIN para incluir usuarios sin publicaciones (0). COUNT(p.id) cuenta las publicaciones reales (no cuenta NULLs).',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Una fila por usuario con un conteo implica agrupar por usuario y contar las publicaciones.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`LEFT JOIN` mantiene todos los usuarios, incluso sin publicaciones. `GROUP BY` agrupa y `COUNT(p.id)` cuenta.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con `SELECT u.handle, COUNT(p.id) FROM usuarios u LEFT JOIN publicaciones p ON p.usuario_id = u.id GROUP BY u.id, u.handle ORDER BY 2 DESC`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.2-e2',
      lessonId: 'L3.2',
      type: 'writeQuery',
      title: 'Publicaciones con más likes',
      prompt:
        'Lista el id y el contenido de las 5 publicaciones con más likes (de la tabla `likes`, no del campo desnormalizado).',
      databaseId: socialSeed.id,
      difficulty: 3,
      tags: ['select', 'join', 'group-by', 'aggregate', 'limit'],
      starterCode: '-- COUNT sobre la tabla de likes\n',
      solution:
        'SELECT p.id, p.contenido, COUNT(l.id) AS num_likes FROM publicaciones p LEFT JOIN likes l ON l.publicacion_id = p.id GROUP BY p.id, p.contenido ORDER BY num_likes DESC LIMIT 5',
      solutionExplanation:
        'LEFT JOIN a `likes` para contar incluso las publicaciones sin likes. GROUP BY por id de publicación y ordenamos descendente.',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Para contar likes por publicación, agrupa por publicación y cuenta filas de la tabla `likes`.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`LEFT JOIN likes` mantiene las publicaciones sin likes (conteo 0). `GROUP BY p.id, p.contenido` agrupa por publicación. `ORDER BY ... DESC LIMIT 5` da el top 5.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con `SELECT p.id, p.contenido, COUNT(l.id) AS num_likes FROM publicaciones p LEFT JOIN likes l ON l.publicacion_id = p.id GROUP BY p.id, p.contenido ORDER BY num_likes DESC LIMIT 5`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.2-e3',
      lessonId: 'L3.2',
      type: 'completeQuery',
      title: 'Completa: comentarios por publicación',
      prompt: 'Completa la consulta para contar los comentarios de cada publicación.',
      databaseId: socialSeed.id,
      difficulty: 2,
      tags: ['join', 'group-by', 'aggregate'],
      starterCode:
        'SELECT p.id, ___(c.id) AS num_comentarios\nFROM publicaciones p\nLEFT ___ comentarios c ON c.publicacion_id = p.id\nGROUP ___ p.id\nORDER BY num_comentarios ___',
      solution:
        'SELECT p.id, COUNT(c.id) AS num_comentarios FROM publicaciones p LEFT JOIN comentarios c ON c.publicacion_id = p.id GROUP BY p.id ORDER BY num_comentarios DESC',
      solutionExplanation:
        'Faltan COUNT(c.id), la palabra JOIN, el GROUP BY y el DESC para ordenar de más a menos comentarios.',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Para contar comentarios por publicación necesitas una función de agregación, un JOIN y un GROUP BY.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`COUNT(c.id)` cuenta filas no nulas; `INNER JOIN`/`LEFT JOIN` se escribe con la palabra `JOIN`; `GROUP BY` agrupa; `DESC` ordena de mayor a menor.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Completa con `COUNT`, `JOIN`, `BY` y `DESC`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.2-e4',
      lessonId: 'L3.2',
      type: 'predictResult',
      title: 'Predice: promedio de likes por publicación',
      prompt: '¿Cuál es el promedio de likes por publicación? (redondeado a 2 decimales)',
      databaseId: socialSeed.id,
      difficulty: 3,
      tags: ['aggregate', 'numeric'],
      promptQuery: 'SELECT ROUND(CAST(COUNT(*) AS REAL) / (SELECT COUNT(*) FROM publicaciones), 2) FROM likes',
      expectedResult: { columns: ['ROUND(CAST(COUNT(*) AS REAL) / (SELECT COUNT(*) FROM publicaciones), 2)'], rows: [] },
      explanation:
        'La consulta cuenta los likes y los divide entre el total de publicaciones; con CAST a REAL evitamos la división entera.',
      solutionExplanation:
        'Para que la división no sea entera (en SQLite se puede configurar, pero mejor explícito) hacemos CAST a REAL.',
      solution: 'SELECT ROUND(CAST(COUNT(*) AS REAL) / (SELECT COUNT(*) FROM publicaciones), 2) FROM likes',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Promedio = total de likes / número de publicaciones. Sin CAST a REAL la división sería entera.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`CAST(expr AS REAL)` convierte a número real. `ROUND(valor, 2)` redondea a 2 decimales.',
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
      id: 'L3.2-e5',
      lessonId: 'L3.2',
      type: 'fixQuery',
      title: 'Arregla: JOIN que multiplica filas',
      prompt:
        'La siguiente consulta debería devolver el número de likes por publicación, pero está inflada. ¿Por qué?',
      databaseId: socialSeed.id,
      difficulty: 3,
      tags: ['join', 'aggregate'],
      starterCode: '-- Cuenta inflada\n',
      buggyCode:
        'SELECT p.id, COUNT(*) FROM publicaciones p INNER JOIN likes l ON l.publicacion_id = p.id INNER JOIN comentarios c ON c.publicacion_id = p.id GROUP BY p.id',
      errorToFind:
        'El doble JOIN con `likes` y `comentarios` produce un producto cartesiano: cada fila se multiplica por (nº likes × nº comentarios). Hay que contar las tablas por separado o usar subqueries.',
      solution:
        'SELECT p.id, (SELECT COUNT(*) FROM likes l WHERE l.publicacion_id = p.id) AS num_likes FROM publicaciones p',
      solutionExplanation:
        'Una subquery escalar por publicación evita el producto cartesiano. Alternativa: dos consultas separadas.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Cuando juntas dos tablas que se multiplican fila a fila, el conteo se infla. Una forma de evitarlo: usar subqueries en lugar de multiplicar JOINs.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Una subquery escalar en el SELECT cuenta una sola cosa por fila externa, sin multiplicar con otras tablas.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Sustituye los dos JOINs por `SELECT p.id, (SELECT COUNT(*) FROM likes l WHERE l.publicacion_id = p.id) AS num_likes FROM publicaciones p`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.2-e6',
      lessonId: 'L3.2',
      type: 'modifyQuery',
      title: 'Modifica: añade HAVING',
      prompt:
        'Modifica la consulta para mostrar solo los usuarios con más de 2 publicaciones.',
      databaseId: socialSeed.id,
      difficulty: 3,
      tags: ['group-by', 'aggregate'],
      baseQuery:
        'SELECT u.handle, COUNT(p.id) AS total FROM usuarios u LEFT JOIN publicaciones p ON p.usuario_id = u.id GROUP BY u.id',
      modificationPrompt: 'Añade HAVING COUNT(p.id) > 2 al final.',
      solution:
        'SELECT u.handle, COUNT(p.id) AS total FROM usuarios u LEFT JOIN publicaciones p ON p.usuario_id = u.id GROUP BY u.id HAVING COUNT(p.id) > 2',
      solutionExplanation:
        'HAVING filtra los grupos resultantes. WHERE no puede filtrar sobre funciones de agregación.',
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
          text: '`HAVING` se coloca al final, después del `GROUP BY`, y admite condiciones con funciones de agregación.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Añade `HAVING COUNT(p.id) > 2` al final. Esto deja solo los usuarios con más de 2 publicaciones.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.2-e7',
      lessonId: 'L3.2',
      type: 'explore',
      title: 'Explora: influencers y engagement',
      prompt:
        'Practica JOINs y agregaciones con tres consultas que respondan a preguntas de engagement de la red social.',
      databaseId: socialSeed.id,
      difficulty: 3,
      tags: ['join', 'aggregate', 'group-by'],
      objective:
        '1) ¿Cuántos likes ha recibido cada usuario (sumando todas sus publicaciones)?  2) ¿Cuál es la publicación con más comentarios?  3) ¿Cuántos usuarios NO han hecho ninguna publicación?',
      explorationHints: [
        'La primera es un JOIN usuarios × publicaciones × likes, agrupando por usuario y sumando likes.',
        'La segunda es GROUP BY publicacion_id, COUNT(comentarios), ORDER BY DESC LIMIT 1.',
        'La tercera es LEFT JOIN usuarios × publicaciones con WHERE p.id IS NULL.',
      ],
      solution: '-- Tres consultas separadas.\nSELECT u.handle, SUM(p.likes_count) FROM usuarios u INNER JOIN publicaciones p ON p.usuario_id = u.id GROUP BY u.id, u.handle;\nSELECT p.id, p.contenido, COUNT(c.id) AS num_comentarios FROM publicaciones p LEFT JOIN comentarios c ON c.publicacion_id = p.id GROUP BY p.id ORDER BY num_comentarios DESC LIMIT 1;\nSELECT u.handle FROM usuarios u LEFT JOIN publicaciones p ON p.usuario_id = u.id WHERE p.id IS NULL;',
      solutionExplanation:
        'El truco está en identificar si la pregunta es sobre la tabla principal (GROUP BY allí) o si necesitas LEFT JOIN + IS NULL para detectar "ausencias".',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Para "cuántos likes por usuario" agrupa por usuario y suma. Para "top comentarios" usa ORDER BY DESC LIMIT 1. Para "usuarios sin publicación" usa LEFT JOIN + IS NULL.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`GROUP BY u.id` + `SUM(p.likes_count)` da likes por usuario. `ORDER BY ... DESC LIMIT 1` da el máximo. `LEFT JOIN ... WHERE p.id IS NULL` detecta ausencias.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Tres consultas: una con `JOIN usuarios × publicaciones GROUP BY u.id SUM(likes_count)`, otra con `JOIN comentarios ORDER BY num_comentarios DESC LIMIT 1`, y otra con `LEFT JOIN ... WHERE p.id IS NULL`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
  ],
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Lección L3.3 — Subqueries y CTEs                                    *
 * ──────────────────────────────────────────────────────────────────── */

const l33: Lesson = {
  id: 'L3.3',
  order: 3,
  title: 'Subqueries y CTEs',
  description:
    'Resuelve problemas reales de la red social: encontrar influencers, publicaciones sin comentarios, usuarios recíprocos.',
  objectives: [
    'Escribir subqueries escalares y correlacionadas',
    'Usar IN, NOT IN, EXISTS y NOT EXISTS',
    'Crear CTEs para consultas complejas paso a paso',
    'Comparar eficiencia y legibilidad entre subquery y CTE',
  ],
  exercises: [
    ex({
      id: 'L3.3-e1',
      lessonId: 'L3.3',
      type: 'writeQuery',
      title: 'Publicaciones sin comentarios',
      prompt: 'Lista el contenido de las publicaciones que no tienen ningún comentario.',
      databaseId: socialSeed.id,
      difficulty: 3,
      tags: ['select', 'subquery', 'null'],
      starterCode: '-- NOT IN / NOT EXISTS\n',
      solution:
        'SELECT contenido FROM publicaciones WHERE id NOT IN (SELECT DISTINCT publicacion_id FROM comentarios WHERE publicacion_id IS NOT NULL)',
      solutionExplanation:
        'Subquery con DISTINCT; NOT IN en el WHERE. Filtramos NULLs para que NOT IN no falle.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Las publicaciones "sin comentarios" son las que NO aparecen en la tabla `comentarios`. Piensa en una exclusión.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`NOT IN (subquery)` devuelve filas cuyo valor no esté en el conjunto resultado. Filtra NULLs en la subquery para evitar el bug clásico de NOT IN.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Subquery: `SELECT DISTINCT publicacion_id FROM comentarios WHERE publicacion_id IS NOT NULL`. Externa: `SELECT contenido FROM publicaciones WHERE id NOT IN (...)`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.3-e2',
      lessonId: 'L3.3',
      type: 'writeQuery',
      title: 'Usuarios más populares',
      prompt: 'Lista el handle de los usuarios cuyo número total de likes recibidos supera la media.',
      databaseId: socialSeed.id,
      difficulty: 3,
      tags: ['select', 'subquery', 'aggregate'],
      starterCode: '-- Subquery + JOIN\n',
      solution:
        'SELECT u.handle FROM usuarios u INNER JOIN publicaciones p ON p.usuario_id = u.id INNER JOIN likes l ON l.publicacion_id = p.id GROUP BY u.id, u.handle HAVING COUNT(l.id) > (SELECT COUNT(*) * 1.0 / COUNT(DISTINCT publicacion_id) FROM likes)',
      solutionExplanation:
        'HAVING con subquery que calcula la media de likes por publicación. Es un caso real de subquery en HAVING.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Para comparar con una media necesitas la subquery que la calcule y un HAVING con `> media`.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`HAVING` admite subqueries escalares. La subquery calcula la media con COUNT(*) / COUNT(DISTINCT ...).',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con un JOIN a likes, agrupa por usuario, y en HAVING compara con `(SELECT COUNT(*) * 1.0 / COUNT(DISTINCT publicacion_id) FROM likes)`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.3-e3',
      lessonId: 'L3.3',
      type: 'completeQuery',
      title: 'Completa: usuarios mutuos con CTE',
      prompt: 'Completa la consulta usando un CTE para encontrar usuarios que han dado like a una publicación y luego han comentado en ella.',
      databaseId: socialSeed.id,
      difficulty: 3,
      tags: ['cte', 'join', 'select'],
      starterCode:
        'WITH likers AS (\n  SELECT DISTINCT usuario_id FROM likes\n)\nSELECT u.handle\nFROM usuarios u\nINNER ___ likers l ON l.usuario_id = u.id\nINNER JOIN comentarios c ON c.usuario_id = u.id\nINNER ___ publicaciones p ON p.id = c.publicacion_id\nINNER JOIN likes l2 ON l2.publicacion_id = p.id AND l2.usuario_id = u.id\nGROUP BY u.id',
      solution:
        'WITH likers AS (SELECT DISTINCT usuario_id FROM likes) SELECT u.handle FROM usuarios u INNER JOIN likers l ON l.usuario_id = u.id INNER JOIN comentarios c ON c.usuario_id = u.id INNER JOIN publicaciones p ON p.id = c.publicacion_id INNER JOIN likes l2 ON l2.publicacion_id = p.id AND l2.usuario_id = u.id GROUP BY u.id',
      solutionExplanation:
        'Faltan los INNER JOIN y la palabra JOIN. La idea: usuarios que aparecen en `likes` y en `comentarios` sobre publicaciones que también han liked.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Para unir tablas en SQL siempre usamos `INNER JOIN` con la palabra completa. Aquí hay dos huecos que faltan.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Sintaxis: `INNER JOIN tabla ON condición`. Los dos huecos del esqueleto esperan esa misma palabra.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Completa ambos huecos con `INNER JOIN`. La consulta une usuarios con likers, comentarios y publicaciones para detectar actividad cruzada.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.3-e4',
      lessonId: 'L3.3',
      type: 'predictResult',
      title: 'Predice: pares únicos like+comentario',
      prompt: '¿Cuántos pares únicos (usuario, publicación) tienen tanto un like como un comentario del mismo usuario?',
      databaseId: socialSeed.id,
      difficulty: 3,
      tags: ['subquery', 'aggregate'],
      promptQuery: 'SELECT COUNT(*) FROM likes l WHERE EXISTS (SELECT 1 FROM comentarios c WHERE c.publicacion_id = l.publicacion_id AND c.usuario_id = l.usuario_id)',
      expectedResult: { columns: ['COUNT(*)'], rows: [] },
      explanation:
        'La subquery EXISTS devuelve true por cada like que tiene un comentario coincidente del mismo usuario sobre la misma publicación. El COUNT externo cuenta esos casos.',
      solutionExplanation:
        'EXISTS devuelve true/false por fila; la consulta cuenta cuántas filas de `likes` tienen un comentario coincidente.',
      solution: 'SELECT COUNT(*) FROM likes l WHERE EXISTS (SELECT 1 FROM comentarios c WHERE c.publicacion_id = l.publicacion_id AND c.usuario_id = l.usuario_id)',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Para "X también Y por el mismo usuario sobre la misma publicación" piensa en un EXISTS correlacionado.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`EXISTS (subquery)` devuelve true si la subquery devuelve al menos una fila. `SELECT 1` es una forma compacta de "existe".',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Ejecuta la consulta del prompt y compara con tu predicción mental.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.3-e5',
      lessonId: 'L3.3',
      type: 'findError',
      title: 'Encuentra el error: CTE con coma faltante',
      prompt:
        'La siguiente consulta con CTE falla al ejecutarse. ¿Por qué?',
      databaseId: socialSeed.id,
      difficulty: 3,
      tags: ['cte', 'string'],
      starterCode: '-- ¿Qué falla?\n',
      buggyCode:
        'WITH a AS (SELECT id FROM usuarios) SELECT * FROM a b AS (SELECT id FROM publicaciones)',
      errorToFind:
        'Falta la coma entre definiciones de CTEs. Varios CTEs en WITH se separan con comas.',
      solution:
        'WITH a AS (SELECT id FROM usuarios), b AS (SELECT id FROM publicaciones) SELECT * FROM a INNER JOIN b ON a.id = b.id',
      solutionExplanation:
        'Los CTEs se separan con coma. Además, el SELECT final debe tener una sintaxis válida (no se puede hacer `SELECT * FROM a, b` sin ON).',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'El problema está en la parte `WITH a AS (...) SELECT * FROM a b AS (...)`. ¿Qué significa realmente esa parte final?',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Varios CTEs en `WITH` se separan con comas: `WITH a AS (...), b AS (...)`. Y para unirlos, usa `INNER JOIN`, no `b AS (...)`.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Reescribe como `WITH a AS (SELECT id FROM usuarios), b AS (SELECT id FROM publicaciones) SELECT * FROM a INNER JOIN b ON a.id = b.id`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.3-e6',
      lessonId: 'L3.3',
      type: 'modifyQuery',
      title: 'Modifica: convierte EXISTS en IN',
      prompt:
        'Reescribe la siguiente consulta cambiando EXISTS por un IN con subquery.',
      databaseId: socialSeed.id,
      difficulty: 3,
      tags: ['subquery', 'select'],
      baseQuery:
        'SELECT u.handle FROM usuarios u WHERE EXISTS (SELECT 1 FROM likes l WHERE l.usuario_id = u.id)',
      modificationPrompt: 'Reemplaza el EXISTS por `u.id IN (SELECT usuario_id FROM likes)`.',
      solution:
        'SELECT u.handle FROM usuarios u WHERE u.id IN (SELECT usuario_id FROM likes)',
      solutionExplanation:
        'IN y EXISTS son intercambiables en muchos casos. IN es más legible cuando la subquery es pequeña y no se correlaciona.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'EXISTS y IN son intercambiables cuando la subquery no se correlaciona con la fila externa.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`WHERE u.id IN (subquery)` devuelve las filas externas cuyo `u.id` esté en el conjunto resultado de la subquery.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Cambia `WHERE EXISTS (SELECT 1 FROM likes l WHERE l.usuario_id = u.id)` por `WHERE u.id IN (SELECT usuario_id FROM likes)`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.3-e7',
      lessonId: 'L3.3',
      type: 'explore',
      title: 'Explora: subqueries y CTEs a fondo',
      prompt:
        'Responde a tres preguntas de la red social con subqueries o CTEs. Cada pregunta admite varias soluciones; elige la que te parezca más legible.',
      databaseId: socialSeed.id,
      difficulty: 3,
      tags: ['subquery', 'cte', 'aggregate'],
      objective:
        '1) ¿Qué publicación tiene más likes?  2) ¿Cuántos likes ha hecho cada uno de los 5 usuarios más activos?  3) ¿Cuántas publicaciones se han hecho cada mes?',
      explorationHints: [
        'La primera es un GROUP BY con COUNT y ORDER BY DESC LIMIT 1.',
        'La segunda necesita un JOIN likes × usuarios, agrupar por usuario, ordenar y limitar a 5.',
        'La tercera requiere SUBSTR(fecha, 1, 7) para quedarse con el año-mes, luego GROUP BY y COUNT.',
      ],
      solution: '-- Tres consultas separadas.\nSELECT publicacion_id, COUNT(*) AS num_likes FROM likes GROUP BY publicacion_id ORDER BY num_likes DESC LIMIT 1;\nSELECT u.handle, COUNT(l.id) AS likes_hechos FROM likes l INNER JOIN usuarios u ON u.id = l.usuario_id GROUP BY u.id, u.handle ORDER BY likes_hechos DESC LIMIT 5;\nSELECT SUBSTR(fecha, 1, 7) AS mes, COUNT(*) FROM publicaciones GROUP BY mes ORDER BY mes;',
      solutionExplanation:
        'SUBSTR(fecha, 1, 7) es la forma más limpia de extraer el año-mes de un timestamp ISO. Para otras preguntas, una subquery o un CTE mejora la legibilidad cuando hay varios pasos.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Para "qué publicación tiene más likes" agrupa por publicación. Para "top 5 usuarios activos" agrupa por usuario y suma likes. Para "publicaciones por mes" extrae el año-mes con SUBSTR.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`GROUP BY publicacion_id` + `ORDER BY COUNT(*) DESC LIMIT 1` da el máximo. `SUBSTR(fecha, 1, 7)` extrae el año-mes de un timestamp ISO.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Tres consultas: GROUP BY publicacion_id ORDER BY COUNT(*) DESC LIMIT 1; JOIN likes × usuarios GROUP BY u.id ORDER BY COUNT(l.id) DESC LIMIT 5; SUBSTR(fecha, 1, 7) GROUP BY mes.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
  ],
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Lección L3.4 — DML                                                  *
 * ──────────────────────────────────────────────────────────────────── */

const l34: Lesson = {
  id: 'L3.4',
  order: 4,
  title: 'DML: INSERT, UPDATE, DELETE',
  description:
    'Mutaciones típicas de una red social: registrar likes, dar de baja cuentas, moderar contenido.',
  objectives: [
    'Insertar likes respetando el UNIQUE(publicacion_id, usuario_id)',
    'Actualizar perfiles con UPDATE',
    'Borrar publicaciones y sus dependencias con DELETE',
    'Comprobar invariantes tras las mutaciones',
  ],
  exercises: [
    ex({
      id: 'L3.4-e1',
      lessonId: 'L3.4',
      type: 'writeQuery',
      title: 'Registra un nuevo like',
      prompt:
        'Registra un like del usuario 5 a la publicación 10 con fecha actual "2024-10-01 12:00:00".',
      databaseId: socialSeed.id,
      difficulty: 2,
      tags: ['insert', 'date'],
      starterCode: '-- INSERT INTO likes\n',
      solution:
        'INSERT INTO likes (publicacion_id, usuario_id, fecha) VALUES (10, 5, \'2024-10-01 12:00:00\')',
      solutionExplanation:
        'La tabla `likes` tiene UNIQUE(publicacion_id, usuario_id), así que un INSERT duplicado fallará. El runner lo gestiona con la validación de invariantes.',
      validation: [{ type: 'rowCount', table: 'likes', expected: 264 }],
      hints: [
        {
          level: 1,
          text: 'Un INSERT añade una fila a la tabla de likes. ¿Qué columnas necesita esa fila?',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Sintaxis: `INSERT INTO tabla (col1, col2, col3) VALUES (v1, v2, v3)`. Las fechas y horas van entre comillas simples en formato ISO.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con `INSERT INTO likes (publicacion_id, usuario_id, fecha) VALUES (10, 5, \'2024-10-01 12:00:00\')`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.4-e2',
      lessonId: 'L3.4',
      type: 'writeQuery',
      title: 'Actualiza la bio de un usuario',
      prompt: 'Cambia la bio del usuario con id = 1 a "Desarrolladora en @una_startup".',
      databaseId: socialSeed.id,
      difficulty: 1,
      tags: ['update', 'where', 'string'],
      starterCode: '-- UPDATE con WHERE id = 1\n',
      solution: 'UPDATE usuarios SET bio = \'Desarrolladora en @una_startup\' WHERE id = 1',
      solutionExplanation:
        'UPDATE con SET y WHERE muy específico. Olvidar el WHERE actualizaría todas las filas.',
      validation: [
        {
          type: 'invariant',
          sql: 'SELECT bio FROM usuarios WHERE id = 1',
          expectedResult: { columns: ['bio'], rows: [['Desarrolladora en @una_startup']] },
          description: 'la bio del usuario 1 debe ser "Desarrolladora en @una_startup"',
        },
      ],
      hints: [
        {
          level: 1,
          text: 'Para cambiar un valor de una fila concreta usa UPDATE con WHERE. Sin WHERE afectarías a todos los usuarios.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Sintaxis: `UPDATE tabla SET columna = valor WHERE id = N`. La cadena va entre comillas simples.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Escribe `UPDATE usuarios SET bio = \'Desarrolladora en @una_startup\' WHERE id = 1`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.4-e3',
      lessonId: 'L3.4',
      type: 'completeQuery',
      title: 'Completa: borra likes de un usuario',
      prompt: 'Completa la consulta para eliminar todos los likes del usuario 7.',
      databaseId: socialSeed.id,
      difficulty: 2,
      tags: ['delete', 'where', 'numeric'],
      starterCode: '___ FROM likes WHERE ___ = 7',
      solution: 'DELETE FROM likes WHERE usuario_id = 7',
      solutionExplanation:
        'DELETE FROM con WHERE usuario_id = 7. Sin WHERE borraríamos todos los likes.',
      validation: [{ type: 'rowCount', table: 'likes', expected: 263 }],
      hints: [
        {
          level: 1,
          text: 'Un DELETE elimina filas. La sentencia empieza por una palabra clave, seguida de `FROM` y la tabla.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`DELETE FROM tabla WHERE condición` borra solo las filas que cumplan. La columna a filtrar es `usuario_id`.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Completa con `DELETE` y `usuario_id`. La forma final: `DELETE FROM likes WHERE usuario_id = 7`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.4-e4',
      lessonId: 'L3.4',
      type: 'predictResult',
      title: 'Predice: likes totales tras un INSERT',
      prompt:
        'Si registramos un like del usuario 1 a la publicación 3, ¿cuántas filas tendrá la tabla `likes`?',
      databaseId: socialSeed.id,
      difficulty: 2,
      tags: ['insert', 'aggregate', 'numeric'],
      promptQuery: 'SELECT COUNT(*) + 1 FROM likes',
      expectedResult: { columns: ['COUNT(*) + 1'], rows: [] },
      explanation:
        'El nuevo INSERT añade una fila, así que el conteo de likes aumenta en 1 respecto al estado actual.',
      solutionExplanation:
        'El predicado es estructural: +1 fila. Lo único que cambia es el conteo base según el estado actual.',
      solution: 'SELECT COUNT(*) + 1 FROM likes',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Si añadimos 1 fila, el conteo total sube en 1. Mentalmente: `likes_actuales + 1`.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`COUNT(*)` cuenta filas. Sumar 1 predice el conteo tras el INSERT.',
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
      id: 'L3.4-e5',
      lessonId: 'L3.4',
      type: 'fixQuery',
      title: 'Arregla: UPDATE que borra la bio',
      prompt:
        'La siguiente consulta pretendía añadir " | Ingeniero" al final de la bio del usuario 1, pero la reemplaza por completo. Arregla el UPDATE.',
      databaseId: socialSeed.id,
      difficulty: 2,
      tags: ['update', 'where', 'string'],
      starterCode: '-- Falta concatenar la bio existente\n',
      buggyCode: 'UPDATE usuarios SET bio = \'Ingeniero\' WHERE id = 1',
      errorToFind:
        'SET bio = ... reemplaza el valor. Para añadir al final, hay que concatenar la columna con el nuevo texto.',
      solution:
        'UPDATE usuarios SET bio = bio || \' | Ingeniero\' WHERE id = 1',
      solutionExplanation:
        'Con `||` concatenamos la bio existente con el nuevo texto. Cuidado con NULL: si bio es NULL, la concatenación da NULL.',
      validation: [{ type: 'rowCount', table: 'usuarios', expected: 20 }],
      hints: [
        {
          level: 1,
          text: 'Para añadir texto al final del valor actual, concatena: `bio = bio || \' | Ingeniero\'`.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`||` es el operador de concatenación en SQLite. La columna a la izquierda aporta el valor actual; la derecha el nuevo.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Cambia `SET bio = \'Ingeniero\'` por `SET bio = bio || \' | Ingeniero\'`. Mantén el WHERE id = 1.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.4-e6',
      lessonId: 'L3.4',
      type: 'modifyQuery',
      title: 'Modifica: añade RETURNING',
      prompt: 'Añade RETURNING al INSERT para ver la fecha registrada.',
      databaseId: socialSeed.id,
      difficulty: 2,
      tags: ['insert', 'date'],
      baseQuery:
        'INSERT INTO likes (publicacion_id, usuario_id, fecha) VALUES (15, 8, \'2024-10-15 09:30:00\')',
      modificationPrompt: 'Añade RETURNING fecha al final.',
      solution:
        'INSERT INTO likes (publicacion_id, usuario_id, fecha) VALUES (15, 8, \'2024-10-15 09:30:00\') RETURNING fecha',
      solutionExplanation:
        'RETURNING hace que el INSERT devuelva columnas de la fila insertada. Útil para logging o para encadenar operaciones.',
      validation: [{ type: 'rowCount', table: 'likes', expected: 264 }],
      hints: [
        {
          level: 1,
          text: '`RETURNING` convierte un INSERT en una consulta que devuelve filas: las columnas que pidas de la fila insertada.',
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
          text: 'Añade `RETURNING fecha` al final del INSERT. El motor devolverá una fila con la fecha del like recién insertado.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L3.4-e7',
      lessonId: 'L3.4',
      type: 'explore',
      title: 'Explora: moderación de la red social',
      prompt:
        'Encadena INSERT, UPDATE y DELETE. Piensa en qué orden conviene hacer las cosas para no romper la integridad referencial.',
      databaseId: socialSeed.id,
      difficulty: 3,
      tags: ['insert', 'update', 'delete'],
      objective:
        '1) Inserta un nuevo like del usuario 12 a la publicación 20 con la fecha "2024-10-20 12:00:00".  2) Actualiza la bio del usuario 12 a "Cuenta personal".  3) Elimina el like recién creado (asume id 153).',
      explorationHints: [
        'Para el INSERT, recuerda que el UNIQUE(publicacion_id, usuario_id) impedirá duplicados.',
        'El UPDATE solo afecta a una fila si WHERE id = 12.',
        'El DELETE debe limitarse a WHERE id = 153 para no borrar otros likes.',
      ],
      solution: '-- Tres mutaciones encadenadas.\nINSERT INTO likes (publicacion_id, usuario_id, fecha) VALUES (20, 12, \'2024-10-20 12:00:00\');\nUPDATE usuarios SET bio = \'Cuenta personal\' WHERE id = 12;\nDELETE FROM likes WHERE id = 153;',
      solutionExplanation:
        'En la red social, los likes tienen integridad referencial: si publicas un INSERT duplicado, SQLite fallará. Por eso el orden importa y los WHERE bien afinados son obligatorios.',
      validation: [{ type: 'rowCount', table: 'likes', expected: 263 }],
      hints: [
        {
          level: 1,
          text: 'Planifica el orden: el INSERT del like, luego el UPDATE de la bio, y por último el DELETE del like creado.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Para el INSERT no olvides el UNIQUE(publicacion_id, usuario_id). El UPDATE debe limitarse al usuario 12. El DELETE debe usar WHERE id = 153.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Tres mutaciones: `INSERT INTO likes (..., 20, 12, ...)`, `UPDATE usuarios SET bio = \'Cuenta personal\' WHERE id = 12` y `DELETE FROM likes WHERE id = 153`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
  ],
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Export                                                              *
 * ──────────────────────────────────────────────────────────────────── */

export const socialLevels: Level[] = [
  {
    id: 'L3',
    order: 3,
    title: 'Red Social',
    description:
      'Una red social con 20 usuarios, 40 publicaciones, 80 comentarios y 150 likes. Likes recíprocos, usuarios influyentes y moderación.',
    databaseId: socialSeed.id,
    lessons: [l31, l32, l33, l34],
  },
]
