/**
 * Glosario de términos SQL en español.
 *
 * Una referencia compacta con los términos y conceptos SQL que el alumno
 * va encontrando a lo largo del curso. Cada entrada incluye:
 *
 *   - `term`: término en inglés (canónico).
 *   - `translation`: traducción al español (lo que verás en la UI).
 *   - `definition`: definición corta en una frase.
 *   - `example`: snippet SQL opcional que ilustra el concepto.
 *   - `aliases`: otras formas válidas (sinónimos).
 *
 * Esta lista no es exhaustiva: es el vocabulario mínimo que un alumno
 * debe reconocer tras terminar el curso. Se incluye como contenido del
 * paquete porque la UI lo consume directamente (página de glosario,
 * tooltips en el editor, etc.).
 */

export interface GlossaryEntry {
  /** Término canónico en inglés (clave única). */
  term: string
  /** Traducción recomendada al español. */
  translation: string
  /** Definición corta (1 frase). */
  definition: string
  /** Snippet SQL ilustrativo (opcional). */
  example?: string
  /** Sinónimos o traducciones alternativas. */
  aliases?: string[]
}

/** Glosario principal del curso v1. */
export const glossary: readonly GlossaryEntry[] = [
  {
    term: 'SELECT',
    translation: 'seleccionar',
    definition: 'Palabra clave que recupera columnas de una o varias tablas.',
    example: 'SELECT nombre, apellido FROM clientes;',
  },
  {
    term: 'FROM',
    translation: 'desde',
    definition: 'Indica la tabla (o tablas) de la que se leen los datos.',
    example: 'SELECT * FROM libros;',
  },
  {
    term: 'WHERE',
    translation: 'donde',
    definition: 'Filtra las filas según una condición lógica.',
    example: 'SELECT * FROM libros WHERE anio_publicacion > 2000;',
    aliases: ['filtro'],
  },
  {
    term: 'ORDER BY',
    translation: 'ordenar por',
    definition: 'Ordena el resultado por una o varias columnas (ASC o DESC).',
    example: 'SELECT * FROM socios ORDER BY fecha_alta DESC;',
  },
  {
    term: 'LIMIT',
    translation: 'límite',
    definition: 'Restringe el número de filas devueltas.',
    example: 'SELECT * FROM productos ORDER BY precio ASC LIMIT 10;',
  },
  {
    term: 'DISTINCT',
    translation: 'distinto',
    definition: 'Elimina filas duplicadas del resultado.',
    example: 'SELECT DISTINCT categoria FROM productos;',
  },
  {
    term: 'AS',
    translation: 'como',
    definition: 'Asigna un alias a una columna o tabla en el resultado.',
    example: 'SELECT precio AS precio_eur FROM productos;',
    aliases: ['alias'],
  },
  {
    term: 'INNER JOIN',
    translation: 'unión interna',
    definition: 'Combina filas de dos tablas cuando la condición ON se cumple.',
    example: 'SELECT l.titulo, a.nombre FROM libros l INNER JOIN autores a ON l.autor_id = a.id;',
  },
  {
    term: 'LEFT JOIN',
    translation: 'unión izquierda',
    definition: 'Mantiene todas las filas de la tabla izquierda aunque no tengan match.',
    example: 'SELECT c.nombre, COUNT(p.id) FROM clientes c LEFT JOIN pedidos p ON p.cliente_id = c.id GROUP BY c.id;',
  },
  {
    term: 'JOIN',
    translation: 'unión',
    definition: 'Término genérico para combinar filas de varias tablas.',
    example: 'SELECT * FROM libros l JOIN prestamos p ON p.libro_id = l.id;',
  },
  {
    term: 'ON',
    translation: 'sobre',
    definition: 'Condición que indica cómo se emparejan las filas en un JOIN.',
    example: 'SELECT * FROM libros l JOIN autores a ON l.autor_id = a.id;',
  },
  {
    term: 'GROUP BY',
    translation: 'agrupar por',
    definition: 'Agrupa filas que comparten el mismo valor en una o varias columnas.',
    example: 'SELECT categoria, COUNT(*) FROM productos GROUP BY categoria;',
  },
  {
    term: 'HAVING',
    translation: 'habiendo',
    definition: 'Filtra los grupos resultantes de un GROUP BY (no filas individuales).',
    example: 'SELECT cliente_id, COUNT(*) FROM pedidos GROUP BY cliente_id HAVING COUNT(*) > 1;',
  },
  {
    term: 'COUNT',
    translation: 'contar',
    definition: 'Cuenta el número de filas (COUNT(*)) o valores no nulos (COUNT(columna)).',
    example: 'SELECT COUNT(*) FROM socios;',
    aliases: ['CONTAR'],
  },
  {
    term: 'SUM',
    translation: 'sumar',
    definition: 'Suma los valores numéricos de una columna.',
    example: 'SELECT SUM(total) FROM pedidos;',
  },
  {
    term: 'AVG',
    translation: 'media',
    definition: 'Calcula la media aritmética de una columna numérica.',
    example: 'SELECT AVG(salario) FROM empleados;',
    aliases: ['promedio'],
  },
  {
    term: 'MIN',
    translation: 'mínimo',
    definition: 'Devuelve el valor mínimo de una columna.',
    example: 'SELECT MIN(precio) FROM productos;',
  },
  {
    term: 'MAX',
    translation: 'máximo',
    definition: 'Devuelve el valor máximo de una columna.',
    example: 'SELECT MAX(fecha_alta) FROM socios;',
  },
  {
    term: 'ROUND',
    translation: 'redondear',
    definition: 'Redondea un número a un número de decimales dado.',
    example: 'SELECT ROUND(AVG(salario), 2) FROM empleados;',
  },
  {
    term: 'COALESCE',
    translation: 'coalesce',
    definition: 'Devuelve el primer valor no nulo de una lista de expresiones.',
    example: 'SELECT COALESCE(telefono, \'sin teléfono\') FROM socios;',
  },
  {
    term: 'IS NULL',
    translation: 'es nulo',
    definition: 'Comprueba si una columna vale NULL (no usar = NULL).',
    example: 'SELECT * FROM prestamos WHERE fecha_devolucion IS NULL;',
  },
  {
    term: 'IS NOT NULL',
    translation: 'no es nulo',
    definition: 'Comprueba que una columna tiene un valor distinto de NULL.',
    example: 'SELECT * FROM socios WHERE email IS NOT NULL;',
  },
  {
    term: 'LIKE',
    translation: 'como',
    definition: 'Compara una cadena con un patrón; % comodín para 0+ caracteres, _ para 1.',
    example: "SELECT * FROM usuarios WHERE handle LIKE '@%';",
  },
  {
    term: 'BETWEEN',
    translation: 'entre',
    definition: 'Comprueba si un valor está en un rango inclusivo.',
    example: 'SELECT * FROM productos WHERE precio BETWEEN 10 AND 50;',
  },
  {
    term: 'IN',
    translation: 'en',
    definition: 'Comprueba si un valor está en una lista o en el resultado de una subquery.',
    example: 'SELECT * FROM libros WHERE genero IN (\'Novela\', \'Poesía\');',
  },
  {
    term: 'NOT IN',
    translation: 'no en',
    definition: 'Negación de IN; cuidado con NULLs en la subquery.',
    example: 'SELECT * FROM productos WHERE id NOT IN (SELECT producto_id FROM lineas_pedido);',
  },
  {
    term: 'EXISTS',
    translation: 'existe',
    definition: 'Verdadero si la subquery devuelve al menos una fila.',
    example: 'SELECT u.* FROM usuarios u WHERE EXISTS (SELECT 1 FROM likes l WHERE l.usuario_id = u.id);',
  },
  {
    term: 'Subquery',
    translation: 'subconsulta',
    definition: 'Una consulta SQL anidada dentro de otra.',
    example: 'SELECT nombre FROM productos WHERE precio > (SELECT AVG(precio) FROM productos);',
    aliases: ['subconsulta', 'consulta anidada'],
  },
  {
    term: 'CTE',
    translation: 'expresión de tabla común',
    definition: 'Conjunto de resultados temporal definido con WITH, reutilizable en la misma consulta.',
    example: 'WITH activos AS (SELECT * FROM socios WHERE activo = 1) SELECT * FROM activos;',
    aliases: ['WITH', 'Common Table Expression'],
  },
  {
    term: 'WITH',
    translation: 'con',
    definition: 'Introduce uno o varios CTEs antes de la consulta principal.',
    example: 'WITH a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM a, b;',
  },
  {
    term: 'INSERT INTO',
    translation: 'insertar en',
    definition: 'Añade una o varias filas a una tabla.',
    example: "INSERT INTO socios (id, nombre, apellido) VALUES (1, 'Ana', 'García');",
  },
  {
    term: 'UPDATE',
    translation: 'actualizar',
    definition: 'Modifica los valores de columnas en filas existentes.',
    example: 'UPDATE productos SET precio = precio * 1.10 WHERE categoria = \'Electrónica\';',
  },
  {
    term: 'DELETE',
    translation: 'borrar',
    definition: 'Elimina filas de una tabla según una condición WHERE.',
    example: 'DELETE FROM pedidos WHERE estado = \'cancelado\';',
  },
  {
    term: 'RETURNING',
    translation: 'devolviendo',
    definition: 'Cláusula que devuelve columnas de las filas afectadas por INSERT/UPDATE/DELETE.',
    example: 'INSERT INTO socios (nombre) VALUES (\'Ana\') RETURNING id;',
  },
  {
    term: 'FOREIGN KEY',
    translation: 'clave ajena',
    definition: 'Columna que referencia la clave primaria de otra tabla.',
    example: 'libros.autor_id REFERENCES autores(id)',
    aliases: ['FK', 'clave foránea'],
  },
  {
    term: 'PRIMARY KEY',
    translation: 'clave primaria',
    definition: 'Columna (o columnas) que identifica unívocamente cada fila.',
    example: 'id INTEGER PRIMARY KEY',
    aliases: ['PK'],
  },
  {
    term: 'UNIQUE',
    translation: 'único',
    definition: 'Restricción que prohíbe valores duplicados en una columna.',
    example: 'email TEXT UNIQUE',
  },
  {
    term: 'CHECK',
    translation: 'comprobar',
    definition: 'Restricción que valida una expresión lógica sobre los valores.',
    example: "CHECK(estado IN ('pendiente','pagado','enviado','entregado','cancelado'))",
  },
  {
    term: 'INDEX',
    translation: 'índice',
    definition: 'Estructura auxiliar que acelera búsquedas a costa de más espacio y coste de escritura.',
    example: 'CREATE INDEX idx_pedidos_cliente ON pedidos(cliente_id);',
  },
  {
    term: 'CHECK CONSTRAINT',
    translation: 'restricción de comprobación',
    definition: 'Igual que CHECK; garantiza que los valores de una columna cumplen una condición.',
    example: 'CHECK(salario > 0)',
  },
  {
    term: 'INNER',
    translation: 'interna',
    definition: 'Calificativo de JOIN; conserva solo las filas con match en ambas tablas.',
    example: 'INNER JOIN autores a ON l.autor_id = a.id',
  },
  {
    term: 'OUTER',
    translation: 'externa',
    definition: 'Calificativo opcional de LEFT/RIGHT/FULL JOIN; indica que se conservan filas sin match.',
    example: 'LEFT OUTER JOIN clientes c ON c.id = p.cliente_id',
  },
  {
    term: 'NULL',
    translation: 'nulo',
    definition: 'Valor especial que representa "ausencia de valor"; no es lo mismo que 0 ni que ""',
    example: 'SELECT * FROM prestamos WHERE fecha_devolucion IS NULL;',
  },
  {
    term: 'CASE WHEN',
    translation: 'caso cuando',
    definition: 'Expresión condicional que permite devolver un valor u otro según una condición.',
    example: "SELECT CASE WHEN stock > 0 THEN 'disponible' ELSE 'agotado' END FROM productos;",
  },
  {
    term: 'CAST',
    translation: 'convertir',
    definition: 'Convierte un valor de un tipo a otro.',
    example: 'SELECT CAST(precio AS INTEGER) FROM productos;',
  },
  {
    term: 'CORRELATED SUBQUERY',
    translation: 'subconsulta correlacionada',
    definition: 'Subconsulta que referencia columnas de la consulta externa.',
    example: 'SELECT e.nombre FROM empleados e WHERE e.salario > (SELECT AVG(salario) FROM empleados e2 WHERE e2.departamento_id = e.departamento_id);',
    aliases: ['subconsulta correlacionada'],
  },
]

/** Devuelve el glosario indexado por término (lowercase) para lookups O(1). */
export const glossaryByTerm: Readonly<Record<string, GlossaryEntry>> = Object.freeze(
  glossary.reduce<Record<string, GlossaryEntry>>((acc, entry) => {
    acc[entry.term.toLowerCase()] = entry
    return acc
  }, {}),
)

/** Busca una entrada del glosario por término (case-insensitive). */
export function lookupGlossary(term: string): GlossaryEntry | undefined {
  return glossaryByTerm[term.toLowerCase()]
}
