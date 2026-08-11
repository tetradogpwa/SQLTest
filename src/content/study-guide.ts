/**
 * Guía de estudio del curso.
 *
 * Consejos pedagógicos y técnicos para cada nivel, en español. La idea
 * es que un alumno que se queda atascado en una lección pueda venir
 * aquí a leer un consejo global antes de buscar la respuesta concreta
 * en una pista del ejercicio.
 *
 * La estructura es `Record<levelId, LevelGuide>`, donde `LevelGuide`
 * contiene tips por lección y un resumen de los conceptos SQL clave
 * que se practican en el nivel.
 *
 * No es contenido obligatorio del alumno; es material de apoyo que la
 * UI puede mostrar opcionalmente.
 */

export interface ExerciseTip {
  /** Resumen en una línea (lo que verá el alumno como tooltip). */
  short: string
  /** Consejo largo (1-2 frases), mostrado al expandir. */
  long: string
  /** Patrones de error comunes en este tipo de ejercicio. */
  commonErrors?: string[]
}

export interface LessonGuide {
  /** Resumen pedagógico de la lección. */
  summary: string
  /** Conceptos SQL que se ponen en práctica. */
  concepts: string[]
  /** Errores típicos que comete el alumno en esta lección. */
  pitfalls: string[]
  /** Tips por tipo de ejercicio. */
  tips: {
    writeQuery?: ExerciseTip
    completeQuery?: ExerciseTip
    predictResult?: ExerciseTip
    findError?: ExerciseTip
    fixQuery?: ExerciseTip
    modifyQuery?: ExerciseTip
    explore?: ExerciseTip
  }
}

export interface LevelGuide {
  /** Resumen del nivel (1 frase). */
  summary: string
  /** Motivación: por qué este nivel importa. */
  motivation: string
  /** Guía por lección (lessonId → LessonGuide). */
  lessons: Record<string, LessonGuide>
}

/** Guía de estudio completa, indexada por levelId. */
export const studyGuide: Readonly<Record<string, LevelGuide>> = {
  L1: {
    summary:
      'Empezamos con una biblioteca municipal: consultas simples, JOINs, subqueries y mutaciones.',
    motivation:
      'La biblioteca es un dominio con el que todo el mundo está familiarizado (libros, autores, socios, préstamos), así que podemos centrarnos en aprender SQL sin distracciones.',
    lessons: {
      'L1.1': {
        summary: 'Lo mínimo para leer datos: SELECT, WHERE, ORDER BY, LIMIT.',
        concepts: ['SELECT', 'FROM', 'WHERE', 'ORDER BY', 'LIMIT', 'DISTINCT', 'AS'],
        pitfalls: [
          'Confundir `= NULL` con `IS NULL` (el primero nunca es true).',
          'Olvidar comillas en los literales de texto (WHERE nombre = ana en vez de = \'ana\').',
          'Usar LIMIT 1 sin ORDER BY: el resultado es indeterminado.',
        ],
        tips: {
          writeQuery: {
            short: 'Piensa primero qué columnas y qué filas necesitas.',
            long:
              'Antes de escribir, contesta dos preguntas: ¿qué columnas quieres ver? y ¿qué condición debe cumplir cada fila? Eso te lleva a la SELECT y al WHERE casi sin pensar.',
          },
          completeQuery: {
            short: 'Los huecos suelen ser palabras clave obvias.',
            long:
              'En completeQuery los huecos `___` están pensados para que rellenes SELECT, FROM, WHERE u ORDER BY. Mira el resto de la frase para deducir la palabra.',
            commonErrors: ['Confundir `WHERE` con `ORDER BY` (uno filtra, el otro ordena).'],
          },
          predictResult: {
            short: 'Ejecuta la query mentalmente, paso a paso.',
            long:
              'Para predecir, recorre las filas una a una y aplica el WHERE. Si ORDER BY + LIMIT, ten en cuenta que LIMIT corta el resultado después de ordenar.',
          },
          findError: {
            short: 'Lee el error literalmente; SQLite suele ser claro.',
            long:
              'El mensaje de error apunta a la palabra o símbolo problemático. Busca justo antes de esa posición.',
          },
          modifyQuery: {
            short: 'Modifica solo lo que pide el enunciado.',
            long:
              'Añadir un ORDER BY no requiere tocar el WHERE. Un cambio de alias no requiere tocar el FROM. Mantén el resto intacto.',
          },
        },
      },
      'L1.2': {
        summary: 'Cruzar tablas y agregar filas con JOIN, GROUP BY y funciones.',
        concepts: ['INNER JOIN', 'LEFT JOIN', 'ON', 'GROUP BY', 'COUNT', 'SUM', 'AVG', 'HAVING'],
        pitfalls: [
          'JOIN sin ON (producto cartesiano, devastador para el rendimiento).',
          'Usar WHERE en lugar de HAVING para filtrar agregaciones.',
          'Olvidar que COUNT(col) cuenta NULLs como 0 (mejor que COUNT(*)).',
        ],
        tips: {
          writeQuery: {
            short: 'Identifica primero las tablas y la columna de unión.',
            long:
              'En un JOIN con dos tablas, pregúntate: ¿qué columna conecta las dos? Esa es la condición ON.',
          },
          fixQuery: {
            short: 'Un JOIN que devuelve "demasiadas filas" casi siempre es un producto cartesiano.',
            long:
              'Si esperas 5 filas y recibes 5000, falta un ON o las columnas del ON están intercambiadas.',
          },
        },
      },
      'L1.3': {
        summary: 'Anidar consultas y dividir problemas con CTEs.',
        concepts: ['Subquery escalar', 'IN / NOT IN', 'EXISTS / NOT EXISTS', 'WITH', 'CTE'],
        pitfalls: [
          'NOT IN con NULLs en la subquery → no devuelve nada.',
          'Subquery en SELECT que devuelve varias filas (debe ser escalar).',
          'Olvidar la coma entre CTEs en el WITH.',
        ],
        tips: {
          writeQuery: {
            short: 'Subqueries: o son escalares (devuelven 1 valor) o son IN/EXISTS.',
            long:
              'En el WHERE con `=`, la subquery DEBE devolver una sola fila y una sola columna. Si puede devolver varias, usa IN o EXISTS.',
          },
          findError: {
            short: 'El error típico de subquery es "more than one row".',
            long:
              'Si ves ese error, casi siempre significa que tu subquery devuelve varias filas y el operador espera una sola (con `=`).',
          },
        },
      },
      'L1.4': {
        summary: 'INSERT, UPDATE, DELETE y verificación de invariantes.',
        concepts: ['INSERT INTO', 'UPDATE', 'SET', 'DELETE', 'WHERE', 'RETURNING'],
        pitfalls: [
          'UPDATE/DELETE sin WHERE (afecta a todas las filas).',
          'INSERT con UNIQUE duplicado (rechazado por la constraint).',
          'Olvidar el NOT NULL: el INSERT falla con un error de constraint.',
        ],
        tips: {
          writeQuery: {
            short: 'Antes de UPDATE/DELETE, piensa qué WHERE usarías.',
            long:
              'Un buen WHERE es el que no te deja dudas: o un id concreto, o una combinación de columnas que identifica unívocamente la fila.',
          },
          fixQuery: {
            short: 'Si un UPDATE/DELETE hace "demasiado", casi siempre falta el WHERE.',
            long:
              'Comprueba el WHERE antes de ejecutar. Si no lo ves, hay que ponerlo. Y si está, mira si es lo bastante específico.',
          },
        },
      },
    },
  },

  L2: {
    summary:
      'Una tienda online: productos, clientes, pedidos y líneas de pedido con importes en euros.',
    motivation:
      'Aquí los conceptos de la L1 se aplican a un dominio transaccional: importes, fechas, estados de pedido. Es donde SQL se vuelve "útil de verdad".',
    lessons: {
      'L2.1': {
        summary: 'SELECT básico aplicado al catálogo: precios, categorías, stock.',
        concepts: ['SELECT', 'WHERE', 'ORDER BY', 'LIMIT', 'DISTINCT', 'AS'],
        pitfalls: [
          'Olvidar las comillas en literales de texto (categoría = Hogar en vez de = \'Hogar\').',
          'Confundir `precio = 0` con `precio IS NULL` (uno es 0, otro es ausencia de valor).',
        ],
        tips: {
          writeQuery: {
            short: 'Una vez que dominas la L1.1, esta lección es solo aplicar.',
            long:
              'Las mismas reglas: SELECT columnas FROM tabla WHERE filtros ORDER BY criterio LIMIT n.',
          },
        },
      },
      'L2.2': {
        summary: 'JOINs múltiples y agregaciones: cuánto ha gastado cada cliente, qué producto se vende más.',
        concepts: ['INNER JOIN', 'LEFT JOIN', 'GROUP BY', 'SUM', 'AVG', 'HAVING'],
        pitfalls: [
          'JOIN con la FK al revés (pedidos.cliente_id = clientes.id ✓; clientes.id = pedidos.cliente_id también funciona pero no une lo que queremos).',
          'WHERE después de GROUP BY: debe ser HAVING.',
        ],
        tips: {
          writeQuery: {
            short: 'Pregúntate: "¿qué cuenta o suma por grupo?"',
            long:
              'GROUP BY es la respuesta a "por cliente / por producto / por mes". Combínalo con COUNT/SUM/AVG para sacar el número.',
          },
        },
      },
      'L2.3': {
        summary: 'CTEs para consultas de negocio: top-N, productos no vendidos, comparativas con la media.',
        concepts: ['Subquery', 'IN', 'NOT IN', 'WITH', 'CTE'],
        pitfalls: [
          'Subquery correlacionada mal escrita (WHERE del subquery no referencia la fila externa).',
          'CTE sin coma entre varios CTEs.',
        ],
        tips: {
          writeQuery: {
            short: 'Si vas a reutilizar el resultado de un SELECT dentro de la misma consulta, CTE.',
            long:
              'WITH cte AS (SELECT ...) SELECT ... FROM cte ... — más legible que una subquery en el WHERE.',
          },
        },
      },
      'L2.4': {
        summary: 'DML aplicado: actualizar precios por categoría, descontar stock, limpiar cancelados.',
        concepts: ['INSERT INTO', 'UPDATE', 'SET', 'DELETE', 'WHERE', 'RETURNING'],
        pitfalls: [
          'Subir un 10% con `precio = precio + 0.10` en vez de `precio = precio * 1.10` (es un 0.10 EUR, no un 10%).',
          'Borrar pedidos con líneas huérfanas — en una DB real, primero borra las líneas.',
        ],
        tips: {
          writeQuery: {
            short: 'Para UPDATE porcentuales, multiplica por 1+X (1.10 = +10%).',
            long:
              'Regla mnemotécnica: `precio = precio * 1.10` siempre es un 10% de subida. `precio + precio * 0.10` también, pero es más fácil equivocarse.',
          },
        },
      },
    },
  },

  L3: {
    summary:
      'Una red social tipo microblogging: usuarios, publicaciones, comentarios y likes.',
    motivation:
      'Los likes y comentarios tienen UNIQUE constraints que enseñan la diferencia entre "INSERT nuevo" y "ON CONFLICT". Las publicaciones desnormalizadas enseñan a discrepar entre el campo y la tabla.',
    lessons: {
      'L3.1': {
        summary: 'Filtrar por patrones de texto (LIKE), ordenar por fecha, deduplicar (DISTINCT).',
        concepts: ['LIKE', 'ORDER BY', 'LIMIT', 'DISTINCT', 'IS NULL', 'BETWEEN'],
        pitfalls: [
          'LIKE con la cadena en vez de con patrón (LIKE "música" en vez de LIKE "%música%").',
          'Comparar fechas como strings sin orden cronológico (en formato ISO funciona por casualidad).',
        ],
        tips: {
          writeQuery: {
            short: 'LIKE usa % como comodín de 0+ caracteres.',
            long:
              '%música% busca "música" en cualquier posición. música% solo al principio. %música solo al final.',
          },
        },
      },
      'L3.2': {
        summary: 'JOINs múltiples, conteos por usuario, promedios.',
        concepts: ['INNER JOIN', 'LEFT JOIN', 'GROUP BY', 'COUNT', 'AVG', 'HAVING'],
        pitfalls: [
          'Doble JOIN con `likes` y `comentarios` produce un producto cartesiano.',
          'Olvidar LEFT JOIN y dejar fuera a los usuarios sin publicaciones.',
        ],
        tips: {
          fixQuery: {
            short: 'Si COUNT(*) es demasiado grande, casi siempre es un producto cartesiano.',
            long:
              'Cuando JOINeas `likes` y `comentarios` sobre la misma publicación, multiplicas filas. Mejor: contar cada tabla por separado.',
          },
        },
      },
      'L3.3': {
        summary: 'CTEs y subqueries: influencers, publicaciones sin comentarios, usuarios recíprocos.',
        concepts: ['EXISTS', 'NOT EXISTS', 'IN', 'WITH', 'CTE'],
        pitfalls: [
          'CTE con coma faltante entre varios CTEs.',
          'Confundir EXISTS con IN cuando hay NULLs en juego.',
        ],
        tips: {
          writeQuery: {
            short: 'EXISTS para "¿existe al menos una fila que cumple X?"',
            long:
              'EXISTS es más eficiente que IN cuando la subquery puede ser grande, porque corta en cuanto encuentra la primera fila.',
          },
        },
      },
      'L3.4': {
        summary: 'DML con UNIQUE constraints: registrar likes sin duplicar.',
        concepts: ['INSERT INTO', 'UPDATE', 'DELETE', 'RETURNING', 'UNIQUE'],
        pitfalls: [
          'INSERT duplicado en likes (UNIQUE(publicacion_id, usuario_id) lo rechaza).',
          'UPDATE que reemplaza la bio en vez de añadir (`bio = ...` vs `bio = bio || ...`).',
        ],
        tips: {
          fixQuery: {
            short: 'Si quieres "añadir" texto a una columna, concatena con ||.',
            long:
              'SET bio = \'texto\' reemplaza. SET bio = bio || \' | texto\' añade. Cuidado con NULL: NULL || texto = NULL.',
          },
        },
      },
    },
  },

  L4: {
    summary:
      'Una consultora de ingeniería: nóminas, presupuestos, asignaciones de personal a proyectos.',
    motivation:
      'Es el dominio más "empresarial" del curso. Aquí se aprende a pensar en términos de tablas maestras (departamentos, proyectos) y tablas de relación (asignaciones, nóminas).',
    lessons: {
      'L4.1': {
        summary: 'Filtrar por rangos de salario y fechas, ordenar por antigüedad.',
        concepts: ['WHERE', 'BETWEEN', 'ORDER BY', 'AND', 'OR'],
        pitfalls: [
          'BETWEEN con los límites al revés (BETWEEN 60000 AND 40000 da 0 filas).',
          'Confundir la fecha como string (funciona en ISO, pero no en formatos ambiguos como DD/MM/YYYY).',
        ],
        tips: {
          writeQuery: {
            short: 'BETWEEN es inclusivo: BETWEEN 40000 AND 60000 incluye 40000 y 60000.',
            long:
              'Equivale a `salario >= 40000 AND salario <= 60000`. Si inviertes el rango, el resultado es vacío.',
          },
        },
      },
      'L4.2': {
        summary: 'Cruzar empleados con proyectos y calcular nóminas agregadas.',
        concepts: ['INNER JOIN', 'LEFT JOIN', 'GROUP BY', 'SUM', 'AVG', 'HAVING'],
        pitfalls: [
          'JOIN con la FK al revés (empleados.id = departamentos.id no une nada útil).',
          'Usar INNER JOIN cuando quieres incluir departamentos sin empleados.',
        ],
        tips: {
          fixQuery: {
            short: 'Si AVG() da NULL, casi siempre es un JOIN mal.',
            long:
              'Cuando AVG() devuelve NULL, lo más probable es que el JOIN no esté produciendo filas. Revisa la condición ON.',
          },
        },
      },
      'L4.3': {
        summary: 'CTEs y subqueries correlacionadas: ranking por grupo, empleados sin proyecto.',
        concepts: ['Subquery correlacionada', 'EXISTS', 'NOT EXISTS', 'WITH', 'CTE'],
        pitfalls: [
          'Subquery "correlacionada" sin correlacionar (WHERE que no referencia la fila externa).',
          'Olvidar que la subquery devuelve una sola fila (debe ser escalar).',
        ],
        tips: {
          writeQuery: {
            short: 'Subquery correlacionada: la subquery referencia columnas de la consulta externa.',
            long:
              'WHERE e2.departamento_id = e.departamento_id es la clave. Sin ese enlace, no es correlacionada.',
          },
        },
      },
      'L4.4': {
        summary: 'DML respetando FKs: insertar empleados, subir sueldos, reasignar y limpiar.',
        concepts: ['INSERT INTO', 'UPDATE', 'SET', 'DELETE', 'WHERE', 'RETURNING', 'FOREIGN KEY'],
        pitfalls: [
          'UPDATE/DELETE sin WHERE (toda la tabla).',
          'Borrar un departamento con empleados asignados (la FK lo impide).',
        ],
        tips: {
          explore: {
            short: 'Pensar en el orden: INSERT antes de UPDATE; UPDATE antes de DELETE.',
            long:
              'En una transacción real, las mutaciones se hacen en orden para no violar FKs: primero las filas nuevas, luego las actualizaciones, y al final los borrados.',
          },
        },
      },
    },
  },
}

/** Devuelve la guía de un nivel. */
export function getLevelGuide(levelId: string): LevelGuide | undefined {
  return studyGuide[levelId]
}

/** Devuelve la guía de una lección concreta. */
export function getLessonGuide(
  levelId: string,
  lessonId: string,
): LessonGuide | undefined {
  return studyGuide[levelId]?.lessons[lessonId]
}
