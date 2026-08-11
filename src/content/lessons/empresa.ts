/**
 * Nivel 4 — "Empresa Consultora" (`empresa`).
 *
 *  - L4.1 SELECT básico
 *  - L4.2 JOIN y agregaciones
 *  - L4.3 Subqueries y CTEs
 *  - L4.4 DML
 *
 * El dominio (departamentos, empleados con salario, proyectos y
 * asignaciones) permite enseñar cálculos de nóminas, presupuestos y
 * gestión de personal.
 */

import type { Exercise, Level, Lesson } from '../types'
import { empresaSeed } from '../databases/empresa'

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
 *  Lección L4.1 — SELECT básico                                        *
 * ──────────────────────────────────────────────────────────────────── */

const l41: Lesson = {
  id: 'L4.1',
  order: 1,
  title: 'SELECT básico',
  description:
    'Consulta el organigrama de la empresa: departamentos, empleados, proyectos. Filtros por salario, fechas y orden por antigüedad.',
  objectives: [
    'Consultar columnas de las tablas de la empresa',
    'Filtrar por rangos de salario y por fechas de alta',
    'Ordenar por nombre, salario o fecha',
    'Combinar varias condiciones con AND y OR',
  ],
  exercises: [
    ex({
      id: 'L4.1-e1',
      lessonId: 'L4.1',
      type: 'writeQuery',
      title: 'Empleados mejor pagados',
      prompt:
        'Lista el nombre, apellido y salario de los 5 empleados con mayor salario. Ordena de mayor a menor.',
      databaseId: empresaSeed.id,
      difficulty: 1,
      tags: ['select', 'order-by', 'limit', 'numeric'],
      starterCode: '-- ORDER BY salario DESC LIMIT 5\n',
      solution:
        'SELECT nombre, apellido, salario FROM empleados ORDER BY salario DESC LIMIT 5',
      solutionExplanation:
        'ORDER BY salario DESC lleva del más al menos pagado; LIMIT 5 corta el resultado.',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Para "los N mejor pagados" ordena por salario descendente y aplica LIMIT N.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`ORDER BY salario DESC` ordena de mayor a menor. `LIMIT 5` corta el resultado a las 5 primeras filas.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con `SELECT nombre, apellido, salario FROM empleados ORDER BY salario DESC LIMIT 5`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.1-e2',
      lessonId: 'L4.1',
      type: 'writeQuery',
      title: 'Empleados del departamento 1',
      prompt:
        'Muestra el nombre, apellido y fecha de alta de los empleados del departamento 1 dados de alta después del 2020-01-01. Ordena por fecha de alta ascendente.',
      databaseId: empresaSeed.id,
      difficulty: 2,
      tags: ['select', 'where', 'order-by', 'date', 'numeric'],
      starterCode: '-- WHERE con AND\n',
      solution:
        'SELECT nombre, apellido, fecha_alta FROM empleados WHERE departamento_id = 1 AND fecha_alta > \'2020-01-01\' ORDER BY fecha_alta ASC',
      solutionExplanation:
        'WHERE con AND para combinar las dos condiciones. La fecha en formato ISO se compara lexicográficamente, que coincide con el orden cronológico.',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Tienes dos condiciones a la vez: departamento concreto y fecha posterior a una referencia. Combínalas con un operador lógico.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`AND` une dos condiciones en el WHERE. Las fechas ISO se comparan lexicográficamente: `> \'2020-01-01\'` significa "posterior".',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con `SELECT nombre, apellido, fecha_alta FROM empleados WHERE departamento_id = 1 AND fecha_alta > \'2020-01-01\' ORDER BY fecha_alta ASC`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.1-e3',
      lessonId: 'L4.1',
      type: 'completeQuery',
      title: 'Completa: proyectos activos',
      prompt: 'Completa la consulta para listar nombre, cliente y presupuesto de los proyectos sin fecha de fin (fecha_fin IS NULL).',
      databaseId: empresaSeed.id,
      difficulty: 2,
      tags: ['select', 'where', 'null'],
      starterCode: '___ nombre, cliente, presupuesto FROM proyectos WHERE fecha_fin ___ ___',
      solution: 'SELECT nombre, cliente, presupuesto FROM proyectos WHERE fecha_fin IS NULL',
      solutionExplanation:
        'Faltan SELECT e IS NULL. Para filtrar por NULL se usa IS, no `= NULL`.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Tres huecos: la palabra inicial de la consulta, el operador de comparación y el literal NULL.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Toda consulta SELECT empieza por `SELECT`. Para filtrar por NULL se usa `IS NULL` (no `= NULL`).',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Completa con `SELECT`, `IS` y `NULL`. La forma final: `WHERE fecha_fin IS NULL`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.1-e4',
      lessonId: 'L4.1',
      type: 'predictResult',
      title: 'Predice: empleados con salario entre 40k y 60k',
      prompt:
        '¿Cuántos empleados tienen un salario entre 40000 y 60000 EUR?',
      databaseId: empresaSeed.id,
      difficulty: 2,
      tags: ['where', 'aggregate', 'numeric'],
      promptQuery: 'SELECT COUNT(*) FROM empleados WHERE salario BETWEEN 40000 AND 60000',
      expectedResult: { columns: ['COUNT(*)'], rows: [] },
      explanation:
        '`BETWEEN` es inclusivo: incluye los extremos. La consulta cuenta los empleados cuyo salario está entre 40000 y 60000 EUR.',
      solutionExplanation:
        'BETWEEN 40000 AND 60000 es equivalente a `salario >= 40000 AND salario <= 60000`.',
      solution: 'SELECT COUNT(*) FROM empleados WHERE salario BETWEEN 40000 AND 60000',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Para "entre A y B" piensa en una palabra clave que represente un rango cerrado por ambos extremos.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`BETWEEN x AND y` incluye los extremos. `COUNT(*)` con ese filtro da el total de filas que cumplen.',
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
      id: 'L4.1-e5',
      lessonId: 'L4.1',
      type: 'findError',
      title: 'Encuentra el error: BETWEEN invertido',
      prompt:
        'La siguiente consulta debería devolver los empleados con salario entre 40000 y 60000 EUR, pero devuelve 0 filas. ¿Por qué?',
      databaseId: empresaSeed.id,
      difficulty: 2,
      tags: ['where', 'numeric', 'string'],
      starterCode: '-- 0 filas, ¿por qué?\n',
      buggyCode: 'SELECT nombre FROM empleados WHERE salario BETWEEN 60000 AND 40000',
      errorToFind:
        'BETWEEN espera el límite inferior primero. Con BETWEEN 60000 AND 40000 el rango es vacío.',
      solution: 'SELECT nombre FROM empleados WHERE salario BETWEEN 40000 AND 60000',
      solutionExplanation:
        'BETWEEN x AND y requiere x ≤ y. Si los pones al revés, el rango es vacío y no devuelve filas.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Lee el orden de los números en `BETWEEN ... AND ...`. ¿Qué pasa si el primero es mayor que el segundo?',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`BETWEEN x AND y` requiere `x ≤ y`. Si el límite inferior es mayor que el superior, el rango es vacío y no devuelve filas.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Intercambia los dos números: `BETWEEN 40000 AND 60000`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.1-e6',
      lessonId: 'L4.1',
      type: 'modifyQuery',
      title: 'Modifica: añade un segundo criterio',
      prompt:
        'Modifica la siguiente consulta para que también filtre por empleados dados de alta antes de 2022-01-01.',
      databaseId: empresaSeed.id,
      difficulty: 2,
      tags: ['select', 'where', 'date'],
      baseQuery:
        'SELECT nombre, apellido, salario FROM empleados WHERE departamento_id = 1',
      modificationPrompt: 'Añade `AND fecha_alta < \'2022-01-01\'` al WHERE.',
      solution:
        'SELECT nombre, apellido, salario FROM empleados WHERE departamento_id = 1 AND fecha_alta < \'2022-01-01\'',
      solutionExplanation:
        'Encadenamos una nueva condición con AND. Las dos condiciones deben cumplirse (AND lógico).',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Para añadir una segunda condición a un WHERE existente, encadénala con un operador lógico.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`AND` une condiciones en el WHERE. Las fechas ISO se comparan lexicográficamente: `< \'2022-01-01\'` es estricto.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Añade ` AND fecha_alta < \'2022-01-01\'` al final del WHERE existente. Las dos condiciones se evaluarán en conjunto.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.1-e7',
      lessonId: 'L4.1',
      type: 'explore',
      title: 'Explora: organigrama de la empresa',
      prompt:
        'No hay una única respuesta: explora la empresa con tres consultas libres.',
      databaseId: empresaSeed.id,
      difficulty: 1,
      tags: ['select', 'aggregate', 'string'],
      objective:
        '1) ¿Cuántos empleados hay en total?  2) ¿Cuántos departamentos tienen un presupuesto superior a 500000?  3) ¿Cuál es el salario máximo?',
      explorationHints: [
        'La primera es COUNT(*) sobre empleados.',
        'La segunda es COUNT(*) sobre departamentos con WHERE presupuesto > 500000.',
        'La tercera es MAX(salario) sobre empleados.',
      ],
      solution: '-- Tres consultas separadas.\nSELECT COUNT(*) FROM empleados;\nSELECT COUNT(*) FROM departamentos WHERE presupuesto > 500000;\nSELECT MAX(salario) FROM empleados;',
      solutionExplanation:
        'Cada consulta es trivial. Lo importante es identificar la tabla y la columna correctas, y la función de agregación adecuada para cada pregunta.',
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
          text: '`COUNT(*)` cuenta filas. `MAX(salario)` da el mayor salario. `WHERE presupuesto > N` filtra los departamentos por presupuesto.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Tres consultas: `SELECT COUNT(*) FROM empleados`, `SELECT COUNT(*) FROM departamentos WHERE presupuesto > 500000` y `SELECT MAX(salario) FROM empleados`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
  ],
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Lección L4.2 — JOIN y agregaciones                                  *
 * ──────────────────────────────────────────────────────────────────── */

const l42: Lesson = {
  id: 'L4.2',
  order: 2,
  title: 'JOIN y agregaciones',
  description:
    'Cruza empleados con departamentos y proyectos: nóminas por departamento, empleados sin proyecto, presupuesto medio por cliente.',
  objectives: [
    'Hacer JOINs entre empleados, departamentos y proyectos',
    'Calcular nóminas agregadas con SUM y AVG',
    'Agrupar por departamento y por cliente',
    'Detectar empleados sin asignaciones con LEFT JOIN',
  ],
  exercises: [
    ex({
      id: 'L4.2-e1',
      lessonId: 'L4.2',
      type: 'writeQuery',
      title: 'Nómina por departamento',
      prompt:
        'Para cada departamento, muestra el nombre del departamento y la suma de los salarios de sus empleados. Ordena de mayor a menor nómina.',
      databaseId: empresaSeed.id,
      difficulty: 2,
      tags: ['select', 'join', 'group-by', 'aggregate'],
      starterCode: '-- JOIN + SUM + GROUP BY\n',
      solution:
        'SELECT d.nombre AS departamento, SUM(e.salario) AS nomina FROM departamentos d LEFT JOIN empleados e ON e.departamento_id = d.id GROUP BY d.id, d.nombre ORDER BY nomina DESC',
      solutionExplanation:
        'LEFT JOIN para incluir departamentos sin empleados. SUM(e.salario) suma los salarios, GROUP BY por departamento.',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Una fila por departamento con un agregado implica unir por FK, agrupar por departamento y sumar salarios.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`LEFT JOIN` mantiene todos los departamentos, incluso sin empleados. `SUM(e.salario)` suma los salarios.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con `SELECT d.nombre, SUM(e.salario) FROM departamentos d LEFT JOIN empleados e ON e.departamento_id = d.id GROUP BY d.id, d.nombre ORDER BY 2 DESC`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.2-e2',
      lessonId: 'L4.2',
      type: 'writeQuery',
      title: 'Empleados sin proyecto',
      prompt: 'Lista el nombre y apellido de los empleados que no están asignados a ningún proyecto.',
      databaseId: empresaSeed.id,
      difficulty: 3,
      tags: ['select', 'join', 'null'],
      starterCode: '-- LEFT JOIN con NULL\n',
      solution:
        'SELECT e.nombre, e.apellido FROM empleados e LEFT JOIN asignaciones a ON a.empleado_id = e.id WHERE a.id IS NULL',
      solutionExplanation:
        'LEFT JOIN mantiene a todos los empleados; los que no tienen match en `asignaciones` tienen NULL. WHERE a.id IS NULL filtra esos.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Para "empleados sin asignación" piensa en LEFT JOIN + filtro por NULL: el empleado está, pero su relación no.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`LEFT JOIN` mantiene todas las filas de la tabla izquierda. `WHERE columna IS NULL` filtra las filas sin coincidencia.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con `LEFT JOIN asignaciones a ON a.empleado_id = e.id` y añade `WHERE a.id IS NULL` para dejar solo los sin asignación.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.2-e3',
      lessonId: 'L4.2',
      type: 'completeQuery',
      title: 'Completa: horas por proyecto',
      prompt: 'Completa la consulta para sumar las horas semanales asignadas a cada proyecto.',
      databaseId: empresaSeed.id,
      difficulty: 2,
      tags: ['join', 'group-by', 'aggregate'],
      starterCode:
        'SELECT p.nombre, ___(a.horas_semana) AS total_horas\nFROM proyectos p\nLEFT ___ asignaciones a ON a.proyecto_id = p.id\nGROUP ___ p.id\nORDER BY total_horas ___',
      solution:
        'SELECT p.nombre, SUM(a.horas_semana) AS total_horas FROM proyectos p LEFT JOIN asignaciones a ON a.proyecto_id = p.id GROUP BY p.id ORDER BY total_horas DESC',
      solutionExplanation:
        'Faltan SUM, la palabra JOIN, el GROUP BY y el DESC para ordenar de más a menos horas.',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Cuatro huecos: la función de agregación, la palabra JOIN, el GROUP BY y la dirección del orden.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`SUM(col)` suma. `INNER/LEFT JOIN` se escribe con la palabra `JOIN`. `GROUP BY` agrupa. `DESC` ordena de mayor a menor.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Completa con `SUM`, `JOIN`, `BY` y `DESC`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.2-e4',
      lessonId: 'L4.2',
      type: 'predictResult',
      title: 'Predice: presupuesto medio por cliente',
      prompt: '¿Cuál es el presupuesto medio de los proyectos del cliente "BBVA"? (redondeado a 2 decimales)',
      databaseId: empresaSeed.id,
      difficulty: 2,
      tags: ['where', 'aggregate', 'numeric'],
      promptQuery: 'SELECT ROUND(AVG(presupuesto), 2) FROM proyectos WHERE cliente = \'BBVA\'',
      expectedResult: { columns: ['ROUND(AVG(presupuesto), 2)'], rows: [] },
      explanation:
        'AVG sobre el filtro WHERE cliente = \'BBVA\' devuelve la media aritmética del presupuesto de los proyectos de ese cliente.',
      solutionExplanation:
        'AVG es la media aritmética. Con un único proyecto, AVG devuelve el propio presupuesto.',
      solution: 'SELECT ROUND(AVG(presupuesto), 2) FROM proyectos WHERE cliente = \'BBVA\'',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Para predecir: cuenta cuántos proyectos tiene el cliente y suma sus presupuestos; luego divide.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`AVG(presupuesto)` da la media. `WHERE cliente = \'BBVA\'` filtra por cliente. `ROUND(valor, 2)` redondea a 2 decimales.',
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
      id: 'L4.2-e5',
      lessonId: 'L4.2',
      type: 'fixQuery',
      title: 'Arregla: JOIN con la FK equivocada',
      prompt:
        'La siguiente consulta debería devolver el nombre del departamento y el salario medio de sus empleados, pero la columna "salario_medio" es NULL. ¿Por qué?',
      databaseId: empresaSeed.id,
      difficulty: 3,
      tags: ['join', 'aggregate'],
      starterCode: '-- AVG da NULL\n',
      buggyCode:
        'SELECT d.nombre, AVG(e.salario) FROM departamentos d INNER JOIN empleados e ON e.id = d.id GROUP BY d.id',
      errorToFind:
        'La condición ON une por e.id = d.id; eso no tiene sentido (empleados.id no es la FK de departamento). La FK correcta es empleados.departamento_id = departamentos.id.',
      solution:
        'SELECT d.nombre, AVG(e.salario) FROM departamentos d INNER JOIN empleados e ON e.departamento_id = d.id GROUP BY d.id',
      solutionExplanation:
        'La FK es departamento_id en empleados; la ON correcta es `e.departamento_id = d.id`. Sin la condición correcta, no hay filas y AVG devuelve NULL.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Para cada JOIN pregúntate: ¿qué columna de la tabla izquierda es la FK y a qué columna de la derecha apunta?',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'En esta base `empleados.departamento_id` apunta a `departamentos.id`. La ON correcta es `e.departamento_id = d.id`.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Cambia `ON e.id = d.id` por `ON e.departamento_id = d.id`. El JOIN ahora emparejará empleados con su departamento real.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.2-e6',
      lessonId: 'L4.2',
      type: 'modifyQuery',
      title: 'Modifica: añade HAVING',
      prompt:
        'Modifica la consulta para mostrar solo los departamentos cuya nómina supera 200000 EUR.',
      databaseId: empresaSeed.id,
      difficulty: 3,
      tags: ['group-by', 'aggregate'],
      baseQuery:
        'SELECT d.nombre, SUM(e.salario) AS nomina FROM departamentos d LEFT JOIN empleados e ON e.departamento_id = d.id GROUP BY d.id',
      modificationPrompt: 'Añade HAVING SUM(e.salario) > 200000 al final.',
      solution:
        'SELECT d.nombre, SUM(e.salario) AS nomina FROM departamentos d LEFT JOIN empleados e ON e.departamento_id = d.id GROUP BY d.id HAVING SUM(e.salario) > 200000',
      solutionExplanation:
        'HAVING filtra los grupos resultantes del GROUP BY. WHERE no puede filtrar sobre SUM(e.salario).',
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
          text: 'Añade `HAVING SUM(e.salario) > 200000` al final. Esto deja solo los departamentos con nómina total mayor de 200k EUR.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.2-e7',
      lessonId: 'L4.2',
      type: 'explore',
      title: 'Explora: RR.HH. de la empresa',
      prompt:
        'Practica JOINs y agregaciones con tres consultas que respondan a preguntas de recursos humanos.',
      databaseId: empresaSeed.id,
      difficulty: 3,
      tags: ['join', 'aggregate', 'group-by'],
      objective:
        '1) ¿Cuántos empleados hay en cada departamento?  2) ¿Cuál es el salario medio por departamento?  3) ¿Cuántos proyectos tiene cada cliente?',
      explorationHints: [
        'La primera es un LEFT JOIN empleados × departamentos, GROUP BY departamento, COUNT(*).',
        'La segunda es similar, con AVG(salario) en lugar de COUNT.',
        'La tercera es GROUP BY cliente sobre la tabla proyectos.',
      ],
      solution: '-- Tres consultas separadas.\nSELECT d.nombre, COUNT(e.id) FROM departamentos d LEFT JOIN empleados e ON e.departamento_id = d.id GROUP BY d.id, d.nombre;\nSELECT d.nombre, ROUND(AVG(e.salario), 2) FROM departamentos d LEFT JOIN empleados e ON e.departamento_id = d.id GROUP BY d.id, d.nombre;\nSELECT cliente, COUNT(*) FROM proyectos GROUP BY cliente;',
      solutionExplanation:
        'LEFT JOIN para no perder departamentos sin empleados. ROUND a 2 decimales para los importes en euros.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Para "empleados por departamento" agrupa por departamento y cuenta. Para "salario medio" usa AVG. Para "proyectos por cliente" agrupa por cliente sobre la tabla proyectos.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`LEFT JOIN` + `GROUP BY` + `COUNT` cuenta. `AVG(salario)` da la media. `ROUND(valor, 2)` redondea a 2 decimales (útil para euros).',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Tres consultas: `LEFT JOIN` empleados × departamentos con COUNT, `LEFT JOIN` con AVG y ROUND, y `GROUP BY cliente` con COUNT sobre proyectos.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
  ],
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Lección L4.3 — Subqueries y CTEs                                    *
 * ──────────────────────────────────────────────────────────────────── */

const l43: Lesson = {
  id: 'L4.3',
  order: 3,
  title: 'Subqueries y CTEs',
  description:
    'Resuelve preguntas de gestión: empleados mejor pagados por departamento, proyectos infrautilizados, asignaciones que se solapan.',
  objectives: [
    'Escribir subqueries correlacionadas para rankings por grupo',
    'Usar IN / NOT IN para conjuntos derivados',
    'Encadenar varios CTEs en una sola consulta',
    'Detectar patrones de sobreasignación con subqueries',
  ],
  exercises: [
    ex({
      id: 'L4.3-e1',
      lessonId: 'L4.3',
      type: 'writeQuery',
      title: 'Empleado mejor pagado de cada departamento',
      prompt: 'Para cada departamento, muestra el nombre, apellido y salario del empleado con mayor salario.',
      databaseId: empresaSeed.id,
      difficulty: 3,
      tags: ['select', 'subquery', 'aggregate', 'correlated'],
      starterCode: '-- Subquery correlacionada\n',
      solution:
        'SELECT e.nombre, e.apellido, e.salario, e.departamento_id FROM empleados e WHERE e.salario = (SELECT MAX(salario) FROM empleados e2 WHERE e2.departamento_id = e.departamento_id)',
      solutionExplanation:
        'La subquery devuelve el salario máximo del mismo departamento que la fila externa. WHERE filtra las filas cuyo salario coincide con ese máximo.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Para cada departamento quieres el empleado con mayor salario. Una subquery correlacionada lo resuelve fila a fila.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Una subquery correlacionada referencia la fila externa (`e2.departamento_id = e.departamento_id`) y devuelve un valor por cada fila externa.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'WHERE salario = (SELECT MAX(salario) FROM empleados e2 WHERE e2.departamento_id = e.departamento_id) deja solo los empleados cuyo salario es el máximo de su departamento.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.3-e2',
      lessonId: 'L4.3',
      type: 'writeQuery',
      title: 'Proyectos sin empleados',
      prompt: 'Lista el nombre de los proyectos que no tienen empleados asignados.',
      databaseId: empresaSeed.id,
      difficulty: 3,
      tags: ['select', 'subquery', 'null'],
      starterCode: '-- NOT EXISTS\n',
      solution:
        'SELECT nombre FROM proyectos p WHERE NOT EXISTS (SELECT 1 FROM asignaciones a WHERE a.proyecto_id = p.id)',
      solutionExplanation:
        'NOT EXISTS devuelve los proyectos sin asignaciones. Es la forma más limpia cuando la subquery es correlacionada.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Para "proyectos sin empleados asignados" busca proyectos para los que NO exista ninguna asignación.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`NOT EXISTS (subquery)` devuelve true si la subquery no devuelve ninguna fila. Es la forma idiomática para "ausencia" cuando la subquery es correlacionada.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con `SELECT nombre FROM proyectos p WHERE NOT EXISTS (SELECT 1 FROM asignaciones a WHERE a.proyecto_id = p.id)`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.3-e3',
      lessonId: 'L4.3',
      type: 'completeQuery',
      title: 'Completa: horas totales por empleado con CTE',
      prompt: 'Completa la consulta con un CTE para obtener las horas semanales totales asignadas a cada empleado.',
      databaseId: empresaSeed.id,
      difficulty: 3,
      tags: ['cte', 'group-by', 'aggregate', 'join'],
      starterCode:
        'WITH horas_por_empleado AS (\n  SELECT empleado_id, ___(horas_semana) AS total_horas\n  FROM asignaciones\n  GROUP BY ___\n)\nSELECT e.nombre, h.total_horas\nFROM empleados e\nINNER JOIN ___ h ON h.empleado_id = e.id\nORDER BY h.total_horas ___',
      solution:
        'WITH horas_por_empleado AS (SELECT empleado_id, SUM(horas_semana) AS total_horas FROM asignaciones GROUP BY empleado_id) SELECT e.nombre, h.total_horas FROM empleados e INNER JOIN horas_por_empleado h ON h.empleado_id = e.id ORDER BY h.total_horas DESC',
      solutionExplanation:
        'Faltan SUM, el GROUP BY, el JOIN al CTE y el DESC para ordenar de más a menos horas.',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Un CTE (WITH ... AS (...)) define un resultado con nombre. Aquí quieres sumar horas por empleado dentro del CTE y luego unirlo con la tabla empleados.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`SUM(col)` suma. `GROUP BY empleado_id` agrupa por empleado. `INNER JOIN horas_por_empleado` une el CTE con empleados. `DESC` ordena de mayor a menor.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Completa con `SUM`, `empleado_id`, `horas_por_empleado` y `DESC`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.3-e4',
      lessonId: 'L4.3',
      type: 'predictResult',
      title: 'Predice: empleados sobreasignados',
      prompt: '¿Cuántos empleados tienen más de 40 horas semanales asignadas en total?',
      databaseId: empresaSeed.id,
      difficulty: 3,
      tags: ['subquery', 'aggregate', 'numeric'],
      promptQuery: 'SELECT COUNT(*) FROM (SELECT empleado_id FROM asignaciones GROUP BY empleado_id HAVING SUM(horas_semana) > 40)',
      expectedResult: { columns: ['COUNT(*)'], rows: [] },
      explanation:
        'La subquery agrupa las asignaciones por empleado y filtra los que suman más de 40 horas. El COUNT externo cuenta esos empleados.',
      solutionExplanation:
        'Subquery en FROM que agrupa por empleado y se queda con los que suman >40. El COUNT externo cuenta esos empleados.',
      solution: 'SELECT COUNT(*) FROM (SELECT empleado_id FROM asignaciones GROUP BY empleado_id HAVING SUM(horas_semana) > 40)',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Para "empleados con suma > N" agrupa por empleado y filtra con HAVING. Luego cuenta cuántos grupos pasan.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`GROUP BY empleado_id` agrupa las asignaciones por empleado. `HAVING SUM(horas_semana) > 40` filtra los grupos que superan 40 horas. El COUNT externo cuenta los grupos.',
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
      id: 'L4.3-e5',
      lessonId: 'L4.3',
      type: 'findError',
      title: 'Encuentra el error: subquery correlacionada mal',
      prompt:
        'La siguiente consulta debería devolver los empleados que ganan más que la media de su departamento, pero devuelve 0 filas. ¿Por qué?',
      databaseId: empresaSeed.id,
      difficulty: 3,
      tags: ['subquery', 'aggregate'],
      starterCode: '-- 0 filas, ¿por qué?\n',
      buggyCode:
        'SELECT e.nombre, e.salario FROM empleados e WHERE e.salario > (SELECT AVG(salario) FROM empleados WHERE departamento_id = 5)',
      errorToFind:
        'La subquery no está correlacionada: siempre devuelve la media del departamento 5, no la del departamento de cada empleado.',
      solution:
        'SELECT e.nombre, e.salario FROM empleados e WHERE e.salario > (SELECT AVG(salario) FROM empleados e2 WHERE e2.departamento_id = e.departamento_id)',
      solutionExplanation:
        'La subquery debe filtrar por `e2.departamento_id = e.departamento_id` para correlacionarse con la fila externa.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'La subquery actual calcula una media fija (la del departamento 5), no la del departamento de cada fila externa. ¿Cómo se "enlazan" las dos tablas?',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Una subquery correlacionada referencia la fila externa: `e2.departamento_id = e.departamento_id`. Sin esa correlación, la subquery es constante.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Cambia `WHERE departamento_id = 5` por `WHERE e2.departamento_id = e.departamento_id` y añade el alias `e2` a la subquery.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.3-e6',
      lessonId: 'L4.3',
      type: 'modifyQuery',
      title: 'Modifica: convierte subquery en CTE',
      prompt:
        'Reescribe la siguiente consulta usando un CTE bien nombrado para mejorar la legibilidad.',
      databaseId: empresaSeed.id,
      difficulty: 3,
      tags: ['cte', 'subquery'],
      baseQuery:
        'SELECT d.nombre FROM departamentos d WHERE d.presupuesto > (SELECT AVG(presupuesto) FROM departamentos)',
      modificationPrompt: 'Envuelve la subquery en un CTE llamado `media_presupuestos` y úsalo en el WHERE.',
      solution:
        'WITH media_presupuestos AS (SELECT AVG(presupuesto) AS media FROM departamentos) SELECT d.nombre FROM departamentos d, media_presupuestos m WHERE d.presupuesto > m.media',
      solutionExplanation:
        'CTE con la media calculado una vez. En la consulta principal un cross join (,) + WHERE para comparar.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Un CTE (WITH nombre AS (...)) es una subquery "promovida" a tabla temporal; luego puedes referenciarla en la consulta principal.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Sintaxis: `WITH nombre_cte AS (SELECT ...) SELECT ... FROM nombre_cte`. Si el CTE devuelve un único valor, basta con seleccionarlo con un alias claro.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con `WITH media_presupuestos AS (SELECT AVG(presupuesto) AS media FROM departamentos) SELECT d.nombre FROM departamentos d, media_presupuestos m WHERE d.presupuesto > m.media`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.3-e7',
      lessonId: 'L4.3',
      type: 'explore',
      title: 'Explora: subqueries y CTEs a fondo',
      prompt:
        'Responde a tres preguntas de la empresa con subqueries o CTEs.',
      databaseId: empresaSeed.id,
      difficulty: 3,
      tags: ['subquery', 'cte', 'aggregate'],
      objective:
        '1) ¿Qué empleado gana más que la media de la empresa?  2) ¿Cuántas horas semanales dedica cada empleado, en total?  3) ¿Qué proyecto ha consumido más horas?',
      explorationHints: [
        'La primera es un WHERE salario > (SELECT AVG(salario) FROM empleados).',
        'La segunda es GROUP BY empleado_id, SUM(horas_semana) sobre asignaciones.',
        'La tercera es GROUP BY proyecto_id, SUM(horas_semana), ORDER BY DESC LIMIT 1.',
      ],
      solution: '-- Tres consultas separadas.\nSELECT nombre, apellido, salario FROM empleados WHERE salario > (SELECT AVG(salario) FROM empleados);\nSELECT empleado_id, SUM(horas_semana) AS horas_totales FROM asignaciones GROUP BY empleado_id;\nSELECT proyecto_id, SUM(horas_semana) AS horas FROM asignaciones GROUP BY proyecto_id ORDER BY horas DESC LIMIT 1;',
      solutionExplanation:
        'Las subqueries escalares (en el WHERE) son la forma más limpia de comparar con una media. Para preguntas "top-N por grupo", GROUP BY + ORDER BY + LIMIT 1 es el patrón canónico.',
      validation: [{ type: 'result', orderMatters: false }],
      hints: [
        {
          level: 1,
          text: 'Para "X mayor que la media" usa WHERE con subquery escalar. Para "top-N" usa GROUP BY + ORDER BY + LIMIT N.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`AVG(salario)` da la media. `GROUP BY empleado_id` + `SUM(horas_semana)` da horas por empleado. `ORDER BY SUM(horas_semana) DESC LIMIT 1` da el proyecto con más horas.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Tres consultas: WHERE salario > subquery AVG; GROUP BY empleado_id SUM horas; GROUP BY proyecto_id SUM horas ORDER BY DESC LIMIT 1.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
  ],
}

/* ──────────────────────────────────────────────────────────────────── *
 *  Lección L4.4 — DML                                                  *
 * ──────────────────────────────────────────────────────────────────── */

const l44: Lesson = {
  id: 'L4.4',
  order: 4,
  title: 'DML: INSERT, UPDATE, DELETE',
  description:
    'Operaciones habituales de RR.HH.: subidas de sueldo, nuevos departamentos, reasignaciones y limpieza de proyectos cerrados.',
  objectives: [
    'Insertar empleados respetando las FK',
    'Aplicar subidas de sueldo porcentuales con UPDATE',
    'Eliminar asignaciones de proyectos cerrados con DELETE',
    'Validar invariantes tras las mutaciones',
  ],
  exercises: [
    ex({
      id: 'L4.4-e1',
      lessonId: 'L4.4',
      type: 'writeQuery',
      title: 'Inserta un nuevo empleado',
      prompt:
        'Da de alta al empleado "Lucía Romero", email "lucia.romero@example.com", en el departamento 1, con fecha de alta "2024-09-15" y salario 38000. Asígnale el id 31.',
      databaseId: empresaSeed.id,
      difficulty: 2,
      tags: ['insert', 'string', 'date', 'numeric'],
      starterCode: '-- INSERT INTO\n',
      solution:
        'INSERT INTO empleados (id, nombre, apellido, email, departamento_id, fecha_alta, salario) VALUES (31, \'Lucía\', \'Romero\', \'lucia.romero@example.com\', 1, \'2024-09-15\', 38000)',
      solutionExplanation:
        'Indicamos todas las columnas explícitamente, incluyendo la FK departamento_id. Sin ella el INSERT fallaría por la constraint.',
      validation: [{ type: 'rowCount', table: 'empleados', expected: 31 }],
      hints: [
        {
          level: 1,
          text: 'Un INSERT añade una fila. Piensa qué columnas tendrá y no olvides la FK si la tabla la exige.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Sintaxis: `INSERT INTO tabla (col1, col2, ...) VALUES (v1, v2, ...)`. El orden de columnas y valores debe coincidir.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Empieza con `INSERT INTO empleados (id, nombre, apellido, email, departamento_id, fecha_alta, salario) VALUES (31, ...)`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.4-e2',
      lessonId: 'L4.4',
      type: 'writeQuery',
      title: 'Sube el salario un 5% al departamento 3',
      prompt: 'Incrementa un 5% el salario de todos los empleados del departamento 3.',
      databaseId: empresaSeed.id,
      difficulty: 2,
      tags: ['update', 'where', 'numeric'],
      starterCode: '-- UPDATE con cálculo\n',
      solution: 'UPDATE empleados SET salario = salario * 1.05 WHERE departamento_id = 3',
      solutionExplanation:
        'Multiplicar por 1.05 equivale a subir un 5%. WHERE muy específico para no tocar otros departamentos.',
      validation: [
        {
          type: 'invariant',
          sql: 'SELECT COUNT(*) FROM empleados WHERE departamento_id = 3',
          expectedResult: { columns: ['COUNT(*)'], rows: [[7]] },
          description: 'el departamento 3 sigue teniendo 7 empleados tras el UPDATE',
        },
      ],
      hints: [
        {
          level: 1,
          text: 'Para subir un porcentaje multiplica por (1 + porcentaje/100). Aquí: 1.05.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`UPDATE tabla SET col = col * N WHERE condición` aplica el cambio solo a las filas que cumplan la condición.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Escribe `UPDATE empleados SET salario = salario * 1.05 WHERE departamento_id = 3`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.4-e3',
      lessonId: 'L4.4',
      type: 'completeQuery',
      title: 'Completa: borra asignaciones de proyectos cerrados',
      prompt: 'Completa la consulta para eliminar todas las asignaciones de proyectos con fecha_fin no nula.',
      databaseId: empresaSeed.id,
      difficulty: 2,
      tags: ['delete', 'where', 'null', 'subquery'],
      starterCode:
        'DELETE FROM asignaciones\nWHERE proyecto_id ___ (\n  SELECT id FROM proyectos WHERE fecha_fin IS NOT ___\n)',
      solution:
        'DELETE FROM asignaciones WHERE proyecto_id IN (SELECT id FROM proyectos WHERE fecha_fin IS NOT NULL)',
      solutionExplanation:
        'Subquery para identificar los proyectos cerrados; DELETE en `asignaciones` con WHERE proyecto_id IN (...) borra sus asignaciones.',
      validation: [
        {
          type: 'invariant',
          sql: 'SELECT COUNT(*) FROM asignaciones WHERE proyecto_id IN (SELECT id FROM proyectos WHERE fecha_fin IS NOT NULL)',
          expectedResult: { columns: ['COUNT(*)'], rows: [[0]] },
          description: 'no debe quedar ninguna asignación de proyectos cerrados',
        },
      ],
      hints: [
        {
          level: 1,
          text: 'Primero identifica los proyectos cerrados con una subquery; luego borra las asignaciones cuyo proyecto_id esté en ese conjunto.',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`WHERE proyecto_id IN (subquery)` filtra por pertenencia al conjunto resultado. `IS NOT NULL` es la negación de `IS NULL`.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Completa con `IN` y `NULL`. La forma final: `DELETE FROM asignaciones WHERE proyecto_id IN (SELECT id FROM proyectos WHERE fecha_fin IS NOT NULL)`.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.4-e4',
      lessonId: 'L4.4',
      type: 'predictResult',
      title: 'Predice: empleados en el departamento 1',
      prompt:
        'Si reasignamos a 3 empleados del departamento 2 al departamento 1, ¿cuántos empleados tendrá el departamento 1 después?',
      databaseId: empresaSeed.id,
      difficulty: 3,
      tags: ['update', 'aggregate', 'numeric'],
      promptQuery: 'SELECT COUNT(*) FROM empleados WHERE departamento_id = 1',
      expectedResult: { columns: ['COUNT(*)'], rows: [] },
      explanation:
        'El conteo base del departamento 1 + 3 (los empleados que llegan del departamento 2).',
      solutionExplanation:
        'Trasladar 3 empleados del dpto 2 al dpto 1 aumenta el conteo de dpto 1 en 3.',
      solution: 'SELECT COUNT(*) FROM empleados WHERE departamento_id = 1',
      validation: [{ type: 'result', orderMatters: true }],
      hints: [
        {
          level: 1,
          text: 'Para predecir el resultado final: cuenta los empleados actuales del departamento 1 y súmale 3 (los que llegan del 2).',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: '`COUNT(*)` con `WHERE departamento_id = 1` te da el conteo actual. Para el nuevo conteo, suma 3.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Ejecuta la consulta del prompt para ver el conteo base, súmale 3 y comprueba con tu predicción mental.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.4-e5',
      lessonId: 'L4.4',
      type: 'fixQuery',
      title: 'Arregla: UPDATE que cambia todas las filas',
      prompt:
        'La siguiente consulta pretendía subir el salario del empleado con id 5, pero actualizó a todos. Arregla el UPDATE.',
      databaseId: empresaSeed.id,
      difficulty: 2,
      tags: ['update', 'where', 'numeric'],
      starterCode: '-- Falta el WHERE\n',
      buggyCode: 'UPDATE empleados SET salario = 50000',
      errorToFind: 'Falta la cláusula WHERE: el UPDATE afecta a todas las filas.',
      solution: 'UPDATE empleados SET salario = 50000 WHERE id = 5',
      solutionExplanation:
        'Sin WHERE, SQLite actualiza todas las filas. Hay que limitar al empleado 5 con `WHERE id = 5`.',
      validation: [{ type: 'rowCount', table: 'empleados', expected: 30 }],
      hints: [
        {
          level: 1,
          text: 'Si un UPDATE cambia "a todos", casi siempre falta el WHERE. ¿Qué fila(s) quieres modificar exactamente?',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Sin WHERE, el UPDATE toca TODAS las filas. WHERE se coloca al final de la sentencia.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Añade `WHERE id = 5` al final. Esto limitará el cambio solo al empleado con id 5.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.4-e6',
      lessonId: 'L4.4',
      type: 'modifyQuery',
      title: 'Modifica: añade RETURNING',
      prompt: 'Añade RETURNING al INSERT para ver el id y el salario del empleado recién creado.',
      databaseId: empresaSeed.id,
      difficulty: 2,
      tags: ['insert', 'numeric'],
      baseQuery:
        'INSERT INTO empleados (id, nombre, apellido, email, departamento_id, fecha_alta, salario) VALUES (32, \'Mario\', \'Vega\', \'mario.vega@example.com\', 2, \'2024-10-01\', 41000)',
      modificationPrompt: 'Añade RETURNING id, salario al final del INSERT.',
      solution:
        'INSERT INTO empleados (id, nombre, apellido, email, departamento_id, fecha_alta, salario) VALUES (32, \'Mario\', \'Vega\', \'mario.vega@example.com\', 2, \'2024-10-01\', 41000) RETURNING id, salario',
      solutionExplanation:
        'RETURNING permite devolver columnas de la fila insertada. Útil cuando la PK es autoincrement.',
      validation: [{ type: 'rowCount', table: 'empleados', expected: 31 }],
      hints: [
        {
          level: 1,
          text: '`RETURNING` convierte un INSERT en una consulta que devuelve filas: las columnas que pidas de la fila afectada.',
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
          text: 'Añade `RETURNING id, salario` al final. El motor devolverá una fila con el id y el salario del empleado recién creado.',
          after: 'after-3-failures',
          type: 'semantic',
        },
      ],
    }),
    ex({
      id: 'L4.4-e7',
      lessonId: 'L4.4',
      type: 'explore',
      title: 'Explora: mantenimiento de la empresa',
      prompt:
        'Encadena INSERT, UPDATE y DELETE. Piensa en qué tablas se ven afectadas por cada cambio.',
      databaseId: empresaSeed.id,
      difficulty: 3,
      tags: ['insert', 'update', 'delete'],
      objective:
        '1) Inserta un nuevo departamento "Calidad" con presupuesto 250000.  2) Sube el salario un 3% a todos los empleados del nuevo departamento (asume id 6).  3) Elimina el departamento recién creado.',
      explorationHints: [
        'Para el INSERT, no te olvides de poner el id 6 y dejar responsable_id en NULL.',
        'El UPDATE debe limitarse a departamento_id = 6.',
        'El DELETE debe limitarse al id concreto, pero recuerda que la FK departamento_id en empleados impedirá borrar el departamento si tiene empleados asignados.',
      ],
      solution: '-- Tres mutaciones encadenadas.\nINSERT INTO departamentos (id, nombre, presupuesto) VALUES (6, \'Calidad\', 250000);\nUPDATE empleados SET salario = salario * 1.03 WHERE departamento_id = 6;\n-- El DELETE fallará si hay empleados en el dpto 6; con la FK habilitada, no se puede borrar.\n-- Si quisiéramos borrar en cascada, deberíamos reasignar antes a los empleados a otro departamento.',
      solutionExplanation:
        'La integridad referencial es tu aliada: el DELETE fallará si hay empleados en el departamento 6. En producción, la reasignación debería hacerse antes del DELETE.',
      validation: [{ type: 'rowCount', table: 'departamentos', expected: 5 }],
      hints: [
        {
          level: 1,
          text: 'Planifica el orden: insertar el departamento, subir salarios a sus empleados, y dejar el DELETE pendiente (la FK lo impedirá).',
          after: 'after-failure',
          type: 'conceptual',
        },
        {
          level: 2,
          text: 'Para el INSERT usa id 6 y deja responsable_id en NULL. Para el UPDATE limita a departamento_id = 6. El DELETE con id = 6 fallará si hay FK activas.',
          after: 'after-2-failures',
          type: 'syntactic',
        },
        {
          level: 3,
          text: 'Tres mutaciones: `INSERT INTO departamentos (id, nombre, presupuesto) VALUES (6, \'Calidad\', 250000)`, `UPDATE empleados SET salario = salario * 1.03 WHERE departamento_id = 6`. El DELETE del dpto 6 fallará.',
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

export const empresaLevels: Level[] = [
  {
    id: 'L4',
    order: 4,
    title: 'Empresa Consultora',
    description:
      'Una consultora con 5 departamentos, 30 empleados, 10 proyectos y 40 asignaciones. Nóminas, presupuestos y gestión de personal.',
    databaseId: empresaSeed.id,
    lessons: [l41, l42, l43, l44],
  },
]
