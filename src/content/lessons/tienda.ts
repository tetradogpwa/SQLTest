/**
 * Nivel 2 — "Tienda Online" (`tienda`).
 *
 * Cuatro lecciones centradas en una tienda online con productos,
 * clientes, pedidos y líneas de pedido. La mecánica es la misma que
 * en `library.ts` (4 lecciones × 6 ejercicios), pero el dominio
 * cambia: aquí se introducen cálculos en euros, agregaciones de
 * ventas y la diferencia entre contar pedidos y contar líneas.
 *
 *  - L2.1 SELECT básico
 *  - L2.2 JOIN y agregaciones
 *  - L2.3 Subqueries y CTEs
 *  - L2.4 DML
 *
 * Mismas convenciones que en `library.ts`:
 *   - `hints[0]` vacío (se rellenará en 7.2).
 *   - `solution` / `solutionExplanation` como placeholders razonables.
 *   - `validation: []` siempre.
 */

import type { Exercise, Level, Lesson } from '../types'
import { tiendaSeed } from '../databases/tienda'

/* ──────────────────────────────────────────────────────────────────── *
 *  Helpers locales                                                     *
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
 *  Lección L2.1 — SELECT básico                                        *
 * ──────────────────────────────────────────────────────────────────── */

const l21: Lesson = {
  id: 'L2.1',
  order: 1,
  title: 'SELECT básico',
  description:
    'Filtra el catálogo de productos, ordénalos por precio o por stock y limita el número de resultados con LIMIT.',
  objectives: [
    'Listar columnas de productos con SELECT',
    'Aplicar WHERE con comparaciones numéricas y de texto',
    'Ordenar resultados con ORDER BY y LIMIT',
    'Trabajar con alias de columna para mejorar la legibilidad',
  ],
  exercises: [
    ex({
      id: 'L2.1-e1',
      lessonId: 'L2.1',
      type: 'writeQuery',
      title: 'Productos más baratos',
      prompt:
        'Muestra el nombre y el precio de los 10 productos más baratos de la tienda. Ordena de menor a mayor precio.',
      databaseId: tiendaSeed.id,
      difficulty: 1,
      tags: ['select', 'order-by', 'limit'],
      starterCode: '-- ORDER BY precio ASC LIMIT 10\n',
      solution: 'SELECT nombre, precio FROM productos ORDER BY precio ASC LIMIT 10',
      solutionExplanation:
        'ORDER BY precio ASC nos lleva del más barato al más caro; LIMIT 10 corta el resultado.',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Para "los N más X" necesitas ordenar por la columna relevante y cortar con LIMIT.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`ORDER BY precio ASC` ordena de menor a mayor; `LIMIT 10` deja solo las 10 primeras filas.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con `SELECT nombre, precio FROM productos ORDER BY precio ASC LIMIT 10`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.1-e2',
      lessonId: 'L2.1',
      type: 'writeQuery',
      title: 'Productos sin stock',
      prompt:
        'Lista el nombre, la categoría y el stock de los productos con stock menor que 20, ordenados por stock ascendente.',
      databaseId: tiendaSeed.id,
      difficulty: 1,
      tags: ['select', 'where', 'order-by', 'numeric'],
      starterCode: '-- Filtra por stock y ordena\n',
      solution:
        'SELECT nombre, categoria, stock FROM productos WHERE stock < 20 ORDER BY stock ASC',
      solutionExplanation:
        'WHERE stock < 20 selecciona los productos con poco stock; el ORDER BY los lleva de menor a mayor.',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Combina un filtro numérico con un orden explícito: primero el WHERE, después el ORDER BY.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`WHERE stock < 20` es estricto (no incluye el 20). `ORDER BY stock ASC` ordena de menor a mayor.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con `SELECT nombre, categoria, stock FROM productos WHERE stock < 20 ORDER BY stock ASC`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.1-e3',
      lessonId: 'L2.1',
      type: 'completeQuery',
      title: 'Completa: clientes de Madrid',
      prompt: 'Completa la consulta para listar nombre, apellido y email de los clientes de Madrid.',
      databaseId: tiendaSeed.id,
      difficulty: 1,
      tags: ['select', 'where', 'string'],
      starterCode: '___ nombre, apellido, email FROM clientes WHERE ciudad ___ \'Madrid\'',
      solution: 'SELECT nombre, apellido, email FROM clientes WHERE ciudad = \'Madrid\'',
      solutionExplanation:
        'Falta el SELECT y el operador de comparación. Para cadenas en SQL se usan comillas simples.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Identifica qué huecos faltan para que la consulta esté completa: una palabra clave de inicio y un operador.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Toda consulta SELECT empieza por la palabra `SELECT`. Para comparar igualdad entre una columna y un literal, usa `=`.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Completa el primer hueco con `SELECT` y el segundo con `=`. La cadena `\'Madrid\'` ya está bien escrita.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.1-e4',
      lessonId: 'L2.1',
      type: 'predictResult',
      title: 'Predice: pedidos pendientes',
      prompt:
        '¿Cuántos pedidos en estado "pendiente" hay actualmente?',
      databaseId: tiendaSeed.id,
      difficulty: 2,
      tags: ['where', 'aggregate', 'string'],
      promptQuery: 'SELECT COUNT(*) FROM pedidos WHERE estado = \'pendiente\'',
      expectedResult: { columns: ['COUNT(*)'], rows: [] },
      explanation:
        'COUNT(*) sobre el filtro WHERE estado = \'pendiente\' devuelve un único número: el total de pedidos pendientes en la base.',
      solutionExplanation:
        'COUNT(*) cuenta todas las filas que cumplen la condición WHERE, sin importar qué columnas tengan.',
      solution: 'SELECT COUNT(*) FROM pedidos WHERE estado = \'pendiente\'',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Para "cuántos pedidos en estado X" necesitas un COUNT con WHERE sobre la columna de estado.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`COUNT(*)` cuenta filas. `WHERE estado = \'pendiente\'` filtra por el valor exacto, con comillas simples.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Ejecuta la consulta del prompt y compara el resultado con tu predicción mental.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.1-e5',
      lessonId: 'L2.1',
      type: 'findError',
      title: 'Encuentra el error: comillas dobles',
      prompt:
        'La siguiente consulta debería devolver los productos de la categoría "Electrónica" pero falla. ¿Qué le pasa?',
      databaseId: tiendaSeed.id,
      difficulty: 2,
      tags: ['select', 'where', 'string'],
      starterCode: '-- ¿Qué falla?\n',
      buggyCode: 'SELECT nombre FROM productos WHERE categoria = "Electrónica"',
      errorToFind:
        'En SQL estándar las cadenas se delimitan con comillas simples; las dobles se usan para identificadores y SQLite las interpreta como un identificador de columna.',
      solution: 'SELECT nombre FROM productos WHERE categoria = \'Electrónica\'',
      solutionExplanation:
        'SQLite es permisivo y acepta dobles comillas como alias de comillas simples, pero en otros motores (PostgreSQL, MySQL) esto puede dar error. Mejor ceñirse a la convención.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Revisa qué tipo de comillas delimitan el literal "Electrónica" en la consulta problemática.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'En SQL estándar los literales de texto se delimitan con comillas simples (`\'...\'`); las dobles (`"..."`) se reservan para identificadores.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Cambia las comillas dobles por simples: `WHERE categoria = \'Electrónica\'`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.1-e6',
      lessonId: 'L2.1',
      type: 'modifyQuery',
      title: 'Modifica: añade un alias',
      prompt:
        'Añade el alias `precio_eur` a la columna precio en la siguiente consulta.',
      databaseId: tiendaSeed.id,
      difficulty: 1,
      tags: ['select', 'alias'],
      baseQuery: 'SELECT nombre, precio FROM productos WHERE categoria = \'Hogar\'',
      modificationPrompt: 'Cambia `precio` por `precio AS precio_eur` (o `precio precio_eur`).',
      solution: 'SELECT nombre, precio AS precio_eur FROM productos WHERE categoria = \'Hogar\'',
      solutionExplanation:
        'El alias renombra la columna en el resultado. La palabra AS es opcional pero ayuda a leer la consulta.',
      validation: [{ type: 'result', orderMatters: false, columnAliases: { precio: 'precio_eur' } }],
      hints: [
        {
          level: 1,
          text: 'Un alias es un "renombre" de la columna en el resultado. No cambia el dato, solo cómo se llama en la salida.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Sintaxis: `columna AS alias`. La palabra `AS` es opcional: `columna alias` también funciona.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Cambia `precio` por `precio AS precio_eur` en la proyección. La cláusula WHERE se queda igual.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.1-e7',
      lessonId: 'L2.1',
      type: 'explore',
      title: 'Explora: catálogo de la tienda',
      prompt:
        'No hay una única respuesta: explora el catálogo y responde a tres preguntas con consultas distintas.',
      databaseId: tiendaSeed.id,
      difficulty: 1,
      tags: ['select', 'aggregate', 'string'],
      objective:
        '1) ¿Cuántas categorías distintas hay?  2) ¿Cuántos productos cuestan más de 50 EUR?  3) ¿Cuál es el producto más caro?',
      explorationHints: [
        'La primera se resuelve con COUNT(DISTINCT categoria).',
        'La segunda es un WHERE precio > 50 y un COUNT(*).',
        'La tercera es ORDER BY precio DESC LIMIT 1.',
      ],
      solution: '-- Tres consultas; ejecuta cada una por separado.\nSELECT COUNT(DISTINCT categoria) FROM productos;\nSELECT COUNT(*) FROM productos WHERE precio > 50;\nSELECT nombre, precio FROM productos ORDER BY precio DESC LIMIT 1;',
      solutionExplanation:
        'Cada consulta es independiente. Lo importante es entender qué hace cada función (COUNT, DISTINCT, ORDER BY) sin tener que combinarlas todavía.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Cada pregunta tiene su consulta; no intentes hacer una sola megaquery que responda a las tres.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`COUNT(DISTINCT col)` cuenta valores distintos; `COUNT(*)` con WHERE filtra; `ORDER BY ... DESC LIMIT 1` da el máximo.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Tres consultas: `SELECT COUNT(DISTINCT categoria) FROM productos`, `SELECT COUNT(*) FROM productos WHERE precio > 50` y `SELECT nombre, precio FROM productos ORDER BY precio DESC LIMIT 1`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
  ],
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Lección L2.2 — JOIN y agregaciones                                  *
 * ──────────────────────────────────────────────────────────────────── */

const l22: Lesson = {
  id: 'L2.2',
  order: 2,
  title: 'JOIN y agregaciones',
  description:
    'Cruza productos con clientes, pedidos y líneas para responder preguntas de negocio: cuánto se ha gastado cada cliente, cuál es el producto más vendido, etc.',
  objectives: [
    'Combinar pedidos con clientes y líneas con productos',
    'Calcular importes totales con SUM y precios medios con AVG',
    'Agrupar por cliente o producto con GROUP BY',
    'Filtrar grupos con HAVING',
  ],
  exercises: [
    ex({
      id: 'L2.2-e1',
      lessonId: 'L2.2',
      type: 'writeQuery',
      title: 'Pedidos por cliente',
      prompt:
        'Muestra el nombre completo del cliente y el número de pedidos que ha realizado. Ordena de más a menos pedidos.',
      databaseId: tiendaSeed.id,
      difficulty: 2,
      tags: ['select', 'join', 'group-by', 'aggregate', 'alias'],
      starterCode: '-- JOIN + COUNT\n',
      solution:
        'SELECT c.nombre || \' \' || c.apellido AS cliente, COUNT(p.id) AS num_pedidos FROM clientes c LEFT JOIN pedidos p ON p.cliente_id = c.id GROUP BY c.id, c.nombre, c.apellido ORDER BY num_pedidos DESC',
      solutionExplanation:
        'LEFT JOIN para incluir clientes sin pedidos (que aparecerán con 0). Agrupamos por cliente y contamos los pedidos.',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Para contar pedidos por cliente necesitas unir las dos tablas por la FK `cliente_id` y agrupar por cliente.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`LEFT JOIN` mantiene a todos los clientes, incluso sin pedidos. `GROUP BY` + `COUNT(p.id)` da el total por grupo.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con `SELECT c.nombre || \' \' || c.apellido AS cliente, COUNT(p.id) FROM clientes c LEFT JOIN pedidos p ON p.cliente_id = c.id GROUP BY c.id, c.nombre, c.apellido ORDER BY 2 DESC`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.2-e2',
      lessonId: 'L2.2',
      type: 'writeQuery',
      title: 'Producto más caro por categoría',
      prompt:
        'Para cada categoría, muestra el nombre y el precio del producto más caro.',
      databaseId: tiendaSeed.id,
      difficulty: 3,
      tags: ['select', 'group-by', 'aggregate', 'subquery'],
      starterCode: '-- MAX(precio) por categoría\n',
      solution:
        'SELECT categoria, nombre, precio FROM productos p WHERE precio = (SELECT MAX(precio) FROM productos p2 WHERE p2.categoria = p.categoria) ORDER BY categoria',
      solutionExplanation:
        'Subquery correlacionada: para cada fila de productos busca el precio máximo de su misma categoría. Si solo quisiéramos el máximo por categoría, usaríamos GROUP BY.',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Para cada categoría queremos el producto con el precio máximo. Una subquery correlacionada lo resuelve fila a fila.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Una subquery correlacionada referencia la fila externa (`p.categoria = p2.categoria`) y devuelve un valor por cada fila externa.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'WHERE precio = (SELECT MAX(precio) FROM productos p2 WHERE p2.categoria = p.categoria) deja solo los productos que son el máximo de su categoría.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.2-e3',
      lessonId: 'L2.2',
      type: 'completeQuery',
      title: 'Completa: total facturado por cliente',
      prompt: 'Completa la consulta para obtener el total facturado (suma de `total` de pedidos) por cliente.',
      databaseId: tiendaSeed.id,
      difficulty: 2,
      tags: ['select', 'join', 'group-by', 'aggregate'],
      starterCode:
        'SELECT c.nombre, ___(p.total) AS total_facturado\nFROM clientes c\nINNER ___ pedidos p ON p.cliente_id = c.id\nGROUP ___ c.id\nORDER BY total_facturado ___',
      solution:
        'SELECT c.nombre, SUM(p.total) AS total_facturado FROM clientes c INNER JOIN pedidos p ON p.cliente_id = c.id GROUP BY c.id ORDER BY total_facturado DESC',
      solutionExplanation:
        'Falta SUM, la palabra JOIN, el GROUP BY y el DESC para ordenar de mayor a menor facturación.',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Para sumar importes por cliente necesitas una función de agregación sobre la columna `total` y un GROUP BY.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`SUM(col)` suma; `INNER JOIN` se escribe con la palabra `JOIN`; `GROUP BY` agrupa filas; `DESC` ordena de mayor a menor.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Completa los cuatro huecos con: `SUM`, `JOIN`, `BY`, `DESC`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.2-e4',
      lessonId: 'L2.2',
      type: 'predictResult',
      title: 'Predice: ingreso medio por pedido',
      prompt: '¿Cuál es el ingreso medio por pedido en euros? (redondeado a 2 decimales)',
      databaseId: tiendaSeed.id,
      difficulty: 2,
      tags: ['aggregate'],
      promptQuery: 'SELECT ROUND(AVG(total), 2) FROM pedidos',
      expectedResult: { columns: ['ROUND(AVG(total), 2)'], rows: [] },
      explanation:
        'AVG devuelve la media aritmética de la columna total; ROUND redondea a 2 decimales.',
      solutionExplanation:
        'AVG se aplica sobre todos los pedidos sin filtrar; en este dataset todos los pedidos son válidos.',
      solution: 'SELECT ROUND(AVG(total), 2) FROM pedidos',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Para predecir un promedio piensa: suma los totales de todos los pedidos y divide entre el número de pedidos.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`AVG(col)` calcula la media. `ROUND(valor, 2)` redondea a 2 decimales. Sin WHERE se aplica a toda la tabla.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Ejecuta la consulta del prompt para ver el valor exacto. Compáralo con tu predicción mental.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.2-e5',
      lessonId: 'L2.2',
      type: 'fixQuery',
      title: 'Arregla: JOIN sin ON',
      prompt:
        'La siguiente consulta debería devolver el nombre del cliente y la fecha de cada pedido, pero produce un producto cartesiano. Arregla el JOIN.',
      databaseId: tiendaSeed.id,
      difficulty: 3,
      tags: ['join', 'numeric'],
      starterCode: '-- Falta el ON\n',
      buggyCode:
        'SELECT c.nombre, p.fecha FROM clientes c INNER JOIN pedidos p',
      errorToFind:
        'Falta la cláusula ON. Sin ella, INNER JOIN hace un producto cartesiano (clientes × pedidos).',
      solution:
        'SELECT c.nombre, p.fecha FROM clientes c INNER JOIN pedidos p ON p.cliente_id = c.id',
      solutionExplanation:
        'ON es obligatorio en un INNER JOIN para indicar cómo se emparejan las filas. Sin ON se cruzan todas con todas.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Si un JOIN devuelve "demasiadas filas" (producto cartesiano), lo más probable es que falte la condición de emparejamiento.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`ON` es obligatorio en cualquier INNER JOIN: indica por qué columna se emparejan las filas de cada tabla.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Añade `ON p.cliente_id = c.id` al final del JOIN. Esto empareja cada pedido con su cliente correspondiente.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.2-e6',
      lessonId: 'L2.2',
      type: 'modifyQuery',
      title: 'Modifica: añade HAVING',
      prompt:
        'Modifica la consulta para mostrar solo los clientes que han facturado más de 100 EUR en total.',
      databaseId: tiendaSeed.id,
      difficulty: 3,
      tags: ['group-by', 'aggregate'],
      baseQuery:
        'SELECT c.nombre, SUM(p.total) AS total FROM clientes c INNER JOIN pedidos p ON p.cliente_id = c.id GROUP BY c.id',
      modificationPrompt: 'Añade HAVING SUM(p.total) > 100 al final.',
      solution:
        'SELECT c.nombre, SUM(p.total) AS total FROM clientes c INNER JOIN pedidos p ON p.cliente_id = c.id GROUP BY c.id HAVING SUM(p.total) > 100',
      solutionExplanation:
        'HAVING filtra los grupos resultantes del GROUP BY. No se puede usar WHERE para filtrar sobre una agregación.',
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
          text: '`HAVING` se coloca al final, después del `GROUP BY`, y acepta condiciones con funciones de agregación (SUM, COUNT, AVG…).',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Añade `HAVING SUM(p.total) > 100` al final. Esto deja solo los clientes cuya suma de pedidos supera 100 EUR.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.2-e7',
      lessonId: 'L2.2',
      type: 'explore',
      title: 'Explora: ventas de la tienda',
      prompt:
        'Practica JOINs y agregaciones con tres consultas independientes sobre la tienda.',
      databaseId: tiendaSeed.id,
      difficulty: 3,
      tags: ['join', 'aggregate', 'group-by'],
      objective:
        '1) ¿Cuántos pedidos se han hecho en cada estado?  2) ¿Cuál es el precio medio por categoría?  3) ¿Cuántas unidades se han vendido del producto con id 1?',
      explorationHints: [
        'La primera es un GROUP BY estado con COUNT(*).',
        'La segunda es GROUP BY categoria con AVG(precio).',
        'La tercera necesita un JOIN entre lineas_pedido y productos, filtrando por producto_id = 1, y sumando la columna cantidad.',
      ],
      solution: '-- Tres consultas separadas.\nSELECT estado, COUNT(*) FROM pedidos GROUP BY estado;\nSELECT categoria, ROUND(AVG(precio), 2) FROM productos GROUP BY categoria;\nSELECT SUM(cantidad) FROM lineas_pedido WHERE producto_id = 1;',
      solutionExplanation:
        'GROUP BY es la herramienta para responder "cuántos por categoría / estado / producto". SUM sobre cantidad da el total de unidades vendidas, no de pedidos.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Para "cuántos por X" usa GROUP BY X. Para "media de precio por categoría" usa AVG con GROUP BY. Para "unidades vendidas" suma `cantidad` en `lineas_pedido`.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`GROUP BY col` agrupa filas con el mismo valor. `COUNT(*)` cuenta filas por grupo. `SUM(cantidad)` suma las unidades.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Tres consultas: una con `GROUP BY estado`, otra con `GROUP BY categoria` y `AVG(precio)`, y otra con `SUM(cantidad) WHERE producto_id = 1`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
  ],
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Lección L2.3 — Subqueries y CTEs                                    *
 * ──────────────────────────────────────────────────────────────────── */

const l23: Lesson = {
  id: 'L2.3',
  order: 3,
  title: 'Subqueries y CTEs',
  description:
    'Divide problemas de negocio en subconsultas y CTEs: top-N por categoría, clientes VIP, productos no vendidos.',
  objectives: [
    'Escribir subqueries en FROM (tablas derivadas) y en WHERE',
    'Usar IN / NOT IN con subqueries',
    'Crear CTEs anidados y reutilizarlos en la misma consulta',
    'Comparar el resultado de un CTE con el equivalente en subquery',
  ],
  exercises: [
    ex({
      id: 'L2.3-e1',
      lessonId: 'L2.3',
      type: 'writeQuery',
      title: 'Productos nunca pedidos',
      prompt:
        'Lista el nombre de los productos que no aparecen en ninguna línea de pedido.',
      databaseId: tiendaSeed.id,
      difficulty: 3,
      tags: ['select', 'subquery', 'null'],
      starterCode: '-- NOT IN sobre producto_id\n',
      solution:
        'SELECT nombre FROM productos WHERE id NOT IN (SELECT DISTINCT producto_id FROM lineas_pedido WHERE producto_id IS NOT NULL)',
      solutionExplanation:
        'Subquery con DISTINCT sobre producto_id, NOT IN en el WHERE. Filtramos los NULLs para que NOT IN no se "intoxique" (regla clásica).',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Los productos "nunca pedidos" son los que NO están en `lineas_pedido`. Piensa en una exclusión.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`NOT IN (subquery)` devuelve filas cuyo valor no aparezca en el conjunto resultado. Cuidado con NULLs: filtrarlos en la subquery.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Subquery: `SELECT DISTINCT producto_id FROM lineas_pedido WHERE producto_id IS NOT NULL`. Externa: `SELECT nombre FROM productos WHERE id NOT IN (...)`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.3-e2',
      lessonId: 'L2.3',
      type: 'writeQuery',
      title: 'Pedidos por encima de la media',
      prompt: 'Muestra el id, la fecha y el total de los pedidos cuyo total supera la media de todos los pedidos.',
      databaseId: tiendaSeed.id,
      difficulty: 3,
      tags: ['select', 'subquery', 'aggregate'],
      starterCode: '-- Subquery escalar en WHERE\n',
      solution:
        'SELECT id, fecha, total FROM pedidos WHERE total > (SELECT AVG(total) FROM pedidos)',
      solutionExplanation:
        'La subquery devuelve un único valor (la media) y el WHERE filtra los pedidos que lo superan.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Divide en dos pasos: (1) calcula la media de los totales; (2) filtra los pedidos cuyo total supera esa media.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Una subquery escalar entre paréntesis y un operador de comparación (`>`, `<`, `=`, `>=`, `<=`) en el WHERE.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con `SELECT id, fecha, total FROM pedidos WHERE total > (SELECT AVG(total) FROM pedidos)`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.3-e3',
      lessonId: 'L2.3',
      type: 'completeQuery',
      title: 'Completa: top 3 clientes con CTE',
      prompt: 'Completa la consulta para devolver los 3 clientes con más pedidos usando un CTE.',
      databaseId: tiendaSeed.id,
      difficulty: 3,
      tags: ['cte', 'join', 'group-by', 'limit'],
      starterCode:
        'WITH pedidos_por_cliente AS (\n  SELECT cliente_id, ___(id) AS total\n  FROM pedidos\n  GROUP ___ cliente_id\n)\nSELECT c.nombre, p.total\nFROM pedidos_por_cliente p\nINNER JOIN clientes c ON c.___ = p.cliente_id\nORDER BY p.total ___\nLIMIT 3',
      solution:
        'WITH pedidos_por_cliente AS (SELECT cliente_id, COUNT(id) AS total FROM pedidos GROUP BY cliente_id) SELECT c.nombre, p.total FROM pedidos_por_cliente p INNER JOIN clientes c ON c.id = p.cliente_id ORDER BY p.total DESC LIMIT 3',
      solutionExplanation:
        'Falta COUNT(id) y el GROUP BY, el JOIN por la PK, y el ORDER BY DESC.',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Un CTE (WITH ... AS (...)) define un resultado con nombre que después puedes unir con JOIN y ordenar.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`COUNT(id)` cuenta pedidos. `GROUP BY cliente_id` agrupa. `INNER JOIN` une por la PK (`c.id = p.cliente_id`). `ORDER BY ... DESC LIMIT 3` da el top 3.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Completa los cuatro huecos con: `COUNT`, `BY`, `id`, `DESC`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.3-e4',
      lessonId: 'L2.3',
      type: 'predictResult',
      title: 'Predice: clientes con un solo pedido',
      prompt:
        '¿Cuántos clientes tienen exactamente un pedido registrado?',
      databaseId: tiendaSeed.id,
      difficulty: 3,
      tags: ['subquery', 'group-by', 'aggregate'],
      promptQuery: 'SELECT COUNT(*) FROM (SELECT cliente_id FROM pedidos GROUP BY cliente_id HAVING COUNT(*) = 1)',
      expectedResult: { columns: ['COUNT(*)'], rows: [] },
      explanation:
        'La subquery agrupa los pedidos por cliente y filtra los que tienen exactamente uno (HAVING COUNT(*) = 1). El COUNT externo cuenta cuántos clientes cumplen esa condición.',
      solutionExplanation:
        'Un cliente con un solo pedido es aquel cuyo GROUP BY HAVING COUNT(*) = 1.',
      solution: 'SELECT COUNT(*) FROM (SELECT cliente_id FROM pedidos GROUP BY cliente_id HAVING COUNT(*) = 1)',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Para "clientes con exactamente N pedidos" agrupa por cliente y filtra con HAVING COUNT(*) = N.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`GROUP BY cliente_id` agrupa los pedidos por cliente. `HAVING COUNT(*) = 1` deja solo los grupos con un único pedido. El COUNT externo los cuenta.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Ejecuta la consulta del prompt y compara el resultado con tu predicción mental.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.3-e5',
      lessonId: 'L2.3',
      type: 'findError',
      title: 'Encuentra el error: subquery devuelve varias filas',
      prompt:
        'La siguiente consulta debería devolver los productos cuyo precio está por encima del precio medio de su categoría, pero falla. ¿Qué le pasa?',
      databaseId: tiendaSeed.id,
      difficulty: 3,
      tags: ['subquery', 'aggregate'],
      starterCode: '-- ¿Qué falla?\n',
      buggyCode:
        'SELECT nombre, precio FROM productos WHERE precio > (SELECT AVG(precio) FROM productos GROUP BY categoria)',
      errorToFind:
        'La subquery devuelve una fila por categoría, no una sola. El operador `>` no puede compararse con varias filas; hay que usar una subquery correlacionada o reescribirla.',
      solution:
        'SELECT nombre, precio FROM productos p WHERE precio > (SELECT AVG(precio) FROM productos p2 WHERE p2.categoria = p.categoria)',
      solutionExplanation:
        'La subquery debe correlacionarse con la fila externa para devolver una sola media por categoría.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'El error es que la subquery devuelve más de un valor y `>` no admite listas. Piensa cómo "pasarle" la fila externa.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Una subquery correlacionada referencia la fila externa (`p2.categoria = p.categoria`) para devolver un valor por cada fila externa.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Cambia la subquery a `SELECT AVG(precio) FROM productos p2 WHERE p2.categoria = p.categoria` y añade el alias `p` a la tabla externa.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.3-e6',
      lessonId: 'L2.3',
      type: 'modifyQuery',
      title: 'Modifica: convierte subquery en CTE',
      prompt:
        'Reescribe la siguiente consulta usando un CTE bien nombrado para mejorar la legibilidad.',
      databaseId: tiendaSeed.id,
      difficulty: 3,
      tags: ['cte', 'subquery'],
      baseQuery:
        'SELECT nombre FROM productos WHERE id IN (SELECT producto_id FROM lineas_pedido WHERE cantidad > 5)',
      modificationPrompt: 'Envuelve la subquery en un CTE llamado `mas_vendidos` y úsalo en el WHERE.',
      solution:
        'WITH mas_vendidos AS (SELECT producto_id FROM lineas_pedido WHERE cantidad > 5) SELECT p.nombre FROM productos p INNER JOIN mas_vendidos m ON p.id = m.producto_id',
      solutionExplanation:
        'Reescribir la subquery como CTE + JOIN suele ser más eficiente y permite reutilizar el conjunto.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Un CTE (WITH nombre AS (...)) es una subquery "promovida" a tabla temporal; luego la puedes unir con JOIN.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Sintaxis: `WITH nombre_cte AS (SELECT ...) SELECT ... FROM nombre_cte`. Después puedes hacer JOIN con otras tablas.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Reescribe como `WITH mas_vendidos AS (SELECT producto_id FROM lineas_pedido WHERE cantidad > 5) SELECT p.nombre FROM productos p INNER JOIN mas_vendidos m ON p.id = m.producto_id`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.3-e7',
      lessonId: 'L2.3',
      type: 'explore',
      title: 'Explora: clientes y productos',
      prompt:
        'Practica subqueries y CTEs con tres consultas libres. Cada consulta debe responder a una pregunta distinta.',
      databaseId: tiendaSeed.id,
      difficulty: 3,
      tags: ['subquery', 'cte', 'aggregate'],
      objective:
        '1) ¿Qué cliente ha hecho el pedido más caro?  2) ¿Cuántos productos distintos se han vendido?  3) ¿Cuál es la categoría con más unidades vendidas?',
      explorationHints: [
        'La primera se resuelve con un ORDER BY total DESC LIMIT 1, JOIN con clientes.',
        'La segunda es COUNT(DISTINCT producto_id) sobre lineas_pedido.',
        'La tercera requiere un JOIN productos × lineas_pedido, agrupar por categoría, sumar cantidad y ordenar.',
      ],
      solution: '-- Tres consultas separadas.\nSELECT c.nombre, p.total FROM pedidos p INNER JOIN clientes c ON c.id = p.cliente_id ORDER BY p.total DESC LIMIT 1;\nSELECT COUNT(DISTINCT producto_id) FROM lineas_pedido;\nSELECT pr.categoria, SUM(lp.cantidad) AS unidades FROM lineas_pedido lp INNER JOIN productos pr ON pr.id = lp.producto_id GROUP BY pr.categoria ORDER BY unidades DESC LIMIT 1;',
      solutionExplanation:
        'CTEs y subqueries sirven para lo mismo: descomponer un problema en partes. Para una sola pregunta, una subquery basta; si vas a reutilizar, mejor un CTE.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Para "el más caro" usa ORDER BY DESC LIMIT 1; para "cuántos distintos" usa COUNT(DISTINCT); para "categoría top" agrupa por categoría y suma.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`ORDER BY total DESC LIMIT 1` da el máximo. `COUNT(DISTINCT producto_id)` cuenta productos distintos. `SUM(cantidad)` con `GROUP BY categoria` agrega por categoría.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Tres consultas: una con JOIN a clientes y ORDER BY total DESC LIMIT 1; otra con COUNT(DISTINCT producto_id); otra con JOIN a productos, GROUP BY categoria y SUM(cantidad) ordenado.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
  ],
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Lección L2.4 — DML                                                  *
 * ──────────────────────────────────────────────────────────────────── */

const l24: Lesson = {
  id: 'L2.4',
  order: 4,
  title: 'DML: INSERT, UPDATE, DELETE',
  description:
    'Modifica los datos de la tienda: sube precios por categoría, descuenta stock al registrar un pedido, y limpia pedidos cancelados.',
  objectives: [
    'Insertar pedidos completos con sus líneas en una transacción lógica',
    'Actualizar precios y stocks con UPDATE',
    'Eliminar pedidos cancelados con DELETE',
    'Verificar invariantes tras las mutaciones',
  ],
  exercises: [
    ex({
      id: 'L2.4-e1',
      lessonId: 'L2.4',
      type: 'writeQuery',
      title: 'Inserta un nuevo producto',
      prompt:
        'Da de alta el producto "Mochila escolar" con sku "ESC-001", categoría "Ropa", precio 25.50, stock 200 y fecha de alta "2024-10-01". Asígnale el id 51.',
      databaseId: tiendaSeed.id,
      difficulty: 2,
      tags: ['insert', 'string', 'date', 'numeric'],
      starterCode: '-- INSERT INTO\n',
      solution:
        'INSERT INTO productos (id, sku, nombre, categoria, precio, stock, fecha_alta) VALUES (51, \'ESC-001\', \'Mochila escolar\', \'Ropa\', 25.50, 200, \'2024-10-01\')',
      solutionExplanation:
        'Indicamos explícitamente las columnas en el mismo orden que los valores. Es la forma más robusta de hacer INSERT.',
      validation: [{ type: 'rowCount', table: 'productos', expected: 51 }],
      hints: [
        {
          level: 1,
          text: 'Un INSERT añade una fila. Piensa qué columnas tendrá la fila y en qué orden vas a poner los valores.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Sintaxis: `INSERT INTO tabla (col1, col2, ...) VALUES (val1, val2, ...)`. Las columnas y los valores deben ir en el mismo orden.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con `INSERT INTO productos (id, sku, nombre, categoria, precio, stock, fecha_alta) VALUES (51, \'ESC-001\', \'Mochila escolar\', \'Ropa\', 25.50, 200, \'2024-10-01\')`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.4-e2',
      lessonId: 'L2.4',
      type: 'writeQuery',
      title: 'Sube precios de Electrónica un 10%',
      prompt:
        'Incrementa un 10% el precio de todos los productos de la categoría "Electrónica".',
      databaseId: tiendaSeed.id,
      difficulty: 2,
      tags: ['update', 'where', 'numeric'],
      starterCode: '-- UPDATE con cálculo\n',
      solution: 'UPDATE productos SET precio = precio * 1.10 WHERE categoria = \'Electrónica\'',
      solutionExplanation:
        'Multiplicar por 1.10 equivale a subir un 10%. Importante: usar `precio * 1.10`, no `precio + precio * 0.10` (más claro y evita errores de redondeo encadenados).',
      validation: [
        {
          type: 'invariant',
          sql: 'SELECT id, precio FROM productos WHERE categoria = \'Electrónica\' ORDER BY id',
          expectedResult: {
            columns: ['id', 'precio'],
            rows: [
              [1, 54.89],
              [2, 32.945],
              [3, 42.9],
              [4, 21.45],
              [5, 86.9],
              [6, 361.9],
              [7, 98.945],
              [8, 64.9],
              [9, 49.5],
              [10, 108.9],
            ],
          },
          description: 'los precios de Electrónica deben quedar multiplicados por 1.10',
        },
      ],
      hints: [
        {
          level: 1,
          text: 'Para subir un porcentaje, multiplica por (1 + porcentaje/100). Aquí: 1.10.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Sintaxis: `UPDATE tabla SET col = col * N WHERE condición`. Sin WHERE, el UPDATE afecta a TODAS las filas.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Escribe `UPDATE productos SET precio = precio * 1.10 WHERE categoria = \'Electrónica\'`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.4-e3',
      lessonId: 'L2.4',
      type: 'completeQuery',
      title: 'Completa: borra pedidos cancelados',
      prompt:
        'Completa la consulta para eliminar todos los pedidos en estado "cancelado".',
      databaseId: tiendaSeed.id,
      difficulty: 2,
      tags: ['delete', 'where', 'string'],
      starterCode: '___ FROM pedidos WHERE ___ = \'cancelado\'',
      solution: 'DELETE FROM pedidos WHERE estado = \'cancelado\'',
      solutionExplanation:
        'DELETE FROM con el WHERE que filtra por estado. Cuidado: sin WHERE borraríamos toda la tabla.',
      validation: [{ type: 'rowCount', table: 'pedidos', expected: 59 }],
      hints: [
        {
          level: 1,
          text: 'Un DELETE elimina filas. La sentencia empieza por una palabra clave concreta, seguida de `FROM` y la tabla.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`DELETE FROM tabla WHERE condición` borra solo las filas que cumplan la condición. Sin WHERE, borra toda la tabla.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Completa con `DELETE` y `estado`. La forma final: `DELETE FROM pedidos WHERE estado = \'cancelado\'`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.4-e4',
      lessonId: 'L2.4',
      type: 'predictResult',
      title: 'Predice: stock tras un pedido',
      prompt:
        'Si un cliente pide 3 unidades del producto 1, ¿cuál será su stock después? (Stock actual = 120)',
      databaseId: tiendaSeed.id,
      difficulty: 2,
      tags: ['update', 'numeric'],
      promptQuery: 'SELECT stock - 3 FROM productos WHERE id = 1',
      expectedResult: { columns: ['stock - 3'], rows: [] },
      explanation:
        'El cálculo es directo: 120 - 3 = 117. La operación SELECT es de lectura; la mutación la haría un UPDATE explícito.',
      solutionExplanation:
        'Restar la cantidad pedida al stock actual. Lo razonable en producción sería UPDATE con WHERE y proteger la operación en una transacción.',
      solution: 'SELECT stock - 3 FROM productos WHERE id = 1',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Predice el resultado sin ejecutar: resta 3 al stock actual del producto 1.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`stock - 3` con `WHERE id = 1` devuelve el stock tras descontar 3 unidades. Mira el dato inicial (120) y haz la resta.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Ejecuta la consulta del prompt para ver el valor exacto. Compara con tu predicción mental (debería ser 117).',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.4-e5',
      lessonId: 'L2.4',
      type: 'fixQuery',
      title: 'Arregla: UPDATE que cambia NULL a 0',
      prompt:
        'La siguiente consulta pretendía poner `stock = 0` solo a los productos sin stock (los NULL), pero también ha puesto a 0 los productos con stock bajo. Arregla la condición.',
      databaseId: tiendaSeed.id,
      difficulty: 2,
      tags: ['update', 'where', 'null'],
      starterCode: '-- Filtra NULL específicamente\n',
      buggyCode: 'UPDATE productos SET stock = 0 WHERE stock < 5',
      errorToFind:
        'WHERE stock < 5 incluye productos con stock 0, 1, 2, 3 y 4; solo queremos afectar a los NULL.',
      solution: 'UPDATE productos SET stock = 0 WHERE stock IS NULL',
      solutionExplanation:
        'Para comparar con NULL hay que usar IS NULL, nunca `= NULL` (que en SQL siempre es UNKNOWN).',
      validation: [{ type: 'rowCount', table: 'productos', expected: 50 }],
      hints: [
        {
          level: 1,
          text: 'Recuerda: para filtrar por NULL en SQL se usa `IS NULL`, no `= NULL` ni `< 5`.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`IS NULL` detecta valores nulos; cualquier comparación con `= NULL` da UNKNOWN y nunca es verdadera.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Cambia `WHERE stock < 5` por `WHERE stock IS NULL`. Eso limitará el UPDATE solo a las filas con stock nulo.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.4-e6',
      lessonId: 'L2.4',
      type: 'modifyQuery',
      title: 'Modifica: añade una columna al INSERT',
      prompt:
        'Añade la columna `categoria = "Juguetes"` al INSERT.',
      databaseId: tiendaSeed.id,
      difficulty: 2,
      tags: ['insert', 'string'],
      baseQuery:
        'INSERT INTO productos (id, sku, nombre, precio, stock, fecha_alta) VALUES (52, \'JUG-006\', \'Puzzle 3D catedral\', 29.95, 50, \'2024-10-15\')',
      modificationPrompt: 'Añade la columna `categoria` en la lista de columnas y el valor \'Juguetes\' en VALUES.',
      solution:
        'INSERT INTO productos (id, sku, nombre, categoria, precio, stock, fecha_alta) VALUES (52, \'JUG-006\', \'Puzzle 3D catedral\', \'Juguetes\', 29.95, 50, \'2024-10-15\')',
      solutionExplanation:
        'El orden de columnas y valores debe coincidir. Añadir una nueva columna en medio exige ajustar el orden de los valores siguientes.',
      validation: [{ type: 'rowCount', table: 'productos', expected: 51 }],
      hints: [
        {
          level: 1,
          text: 'En un INSERT con lista explícita de columnas, cada columna de la lista debe corresponderse con un valor en el mismo orden.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Sintaxis: `INSERT INTO tabla (col1, col2, ...) VALUES (v1, v2, ...)`. El orden de los valores sigue al de las columnas.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Inserta `categoria` en la lista de columnas (después de `nombre`) y `\'Juguetes\'` en la posición correspondiente de VALUES.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L2.4-e7',
      lessonId: 'L2.4',
      type: 'explore',
      title: 'Explora: mantenimiento de la tienda',
      prompt:
        'Encadena tres mutaciones: un INSERT, un UPDATE y un DELETE. Piensa en qué tablas se ve cada cambio.',
      databaseId: tiendaSeed.id,
      difficulty: 3,
      tags: ['insert', 'update', 'delete'],
      objective:
        '1) Inserta un nuevo producto en la categoría "Hogar" con stock 100.  2) Sube el stock de todos los productos de "Hogar" un 10%.  3) Elimina el producto recién insertado (asume id 53).',
      explorationHints: [
        'Para el INSERT, no te olvides del id (53) y de la fecha_alta en formato ISO.',
        'El UPDATE puede usar `stock = stock * 1.10` para sumar el 10%.',
        'El DELETE debe limitar al id concreto con WHERE id = 53.',
      ],
      solution: '-- Tres mutaciones encadenadas.\nINSERT INTO productos (id, sku, nombre, categoria, precio, stock, fecha_alta) VALUES (53, \'HOG-007\', \'Set de manteles\', \'Hogar\', 24.95, 100, \'2024-10-20\');\nUPDATE productos SET stock = stock * 1.10 WHERE categoria = \'Hogar\';\nDELETE FROM productos WHERE id = 53;',
      solutionExplanation:
        'En una app real estas tres operaciones se harían dentro de una transacción para que, si una falla, se deshagan las anteriores.',
      validation: [{ type: 'rowCount', table: 'productos', expected: 50 }],
      hints: [
        {
          level: 1,
          text: 'Planifica el orden: insertar primero, modificar después, borrar al final para no dejar inconsistencia.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Para el INSERT usa id 53 y `fecha_alta` ISO. Para el UPDATE, `stock = stock * 1.10 WHERE categoria = \'Hogar\'`. Para el DELETE, `WHERE id = 53`.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Tres mutaciones: `INSERT INTO productos (..., 53, ...)`, `UPDATE productos SET stock = stock * 1.10 WHERE categoria = \'Hogar\'` y `DELETE FROM productos WHERE id = 53`.',
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

export const tiendaLevels: Level[] = [
  {
    id: 'L2',
    order: 2,
    title: 'Tienda Online',
    description:
      'Catálogo de 50 productos, 30 clientes, 60 pedidos y 150 líneas de pedido. Cálculos en euros, JOINs múltiples y DML aplicado.',
    databaseId: tiendaSeed.id,
    lessons: [l21, l22, l23, l24],
  },
]
