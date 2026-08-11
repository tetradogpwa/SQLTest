/**
 * Base de datos "Biblioteca Municipal" — `library`.
 *
 * Dominio: una biblioteca pública española. Cuatro tablas:
 *
 *   - `autores`    → 15 escritores (con nombre, apellido, nacionalidad).
 *   - `libros`     → 30 obras (con ISBN único, FK al autor, género,
 *                    año, páginas, stock disponible).
 *   - `socios`     → 25 lectores dados de alta (con email único,
 *                    fecha de alta, teléfono).
 *   - `prestamos`  → 40 préstamos (FK a libro y socio, fechas de
 *                    préstamo y devolución; algunas devoluciones son
 *                    NULL porque el libro sigue en circulación).
 *
 * Restricciones:
 *   - PK en todas las tablas.
 *   - 2 FK: `libros.autor_id → autores.id`, `prestamos.libro_id → libros.id`,
 *           `prestamos.socio_id → socios.id`.
 *   - 2 UNIQUE: `libros.isbn`, `socios.email`.
 *   - 1 índice extra: `idx_prestamos_socio` sobre `prestamos.socio_id`
 *     para acelerar las búsquedas por socio.
 *
 * El SQL es idempotente (CREATE TABLE IF NOT EXISTS, INSERT OR IGNORE).
 * Las fechas son ISO 8601 (`YYYY-MM-DD`).
 */

import type { DatabaseSeed } from '../types'

export const librarySeed: DatabaseSeed = {
  id: 'library',
  name: 'Biblioteca Municipal',
  description:
    'Catálogo de una biblioteca pública: libros, autores, socios y préstamos activos e históricos.',
  sql: /* sql */ `
-- ────────────────────────────────────────────────────────────────────
--  Esquema
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS autores (
  id              INTEGER PRIMARY KEY,
  nombre          TEXT    NOT NULL,
  apellido        TEXT    NOT NULL,
  nacionalidad    TEXT    NOT NULL,
  fecha_nacimiento TEXT   NOT NULL
);

CREATE TABLE IF NOT EXISTS libros (
  id              INTEGER PRIMARY KEY,
  titulo          TEXT    NOT NULL,
  autor_id        INTEGER NOT NULL,
  isbn            TEXT    NOT NULL UNIQUE,
  genero          TEXT    NOT NULL,
  anio_publicacion INTEGER NOT NULL,
  paginas         INTEGER NOT NULL,
  stock           INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (autor_id) REFERENCES autores(id)
);

CREATE TABLE IF NOT EXISTS socios (
  id              INTEGER PRIMARY KEY,
  nombre          TEXT    NOT NULL,
  apellido        TEXT    NOT NULL,
  email           TEXT    NOT NULL UNIQUE,
  telefono        TEXT,
  fecha_alta      TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS prestamos (
  id                INTEGER PRIMARY KEY,
  libro_id          INTEGER NOT NULL,
  socio_id          INTEGER NOT NULL,
  fecha_prestamo    TEXT    NOT NULL,
  fecha_devolucion  TEXT,
  FOREIGN KEY (libro_id) REFERENCES libros(id),
  FOREIGN KEY (socio_id) REFERENCES socios(id)
);

-- Índice secundario para acelerar las búsquedas por socio
CREATE INDEX IF NOT EXISTS idx_prestamos_socio ON prestamos(socio_id);

-- ────────────────────────────────────────────────────────────────────
--  Datos: autores (15)
-- ────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO autores (id, nombre, apellido, nacionalidad, fecha_nacimiento) VALUES
  (1,  'Miguel',         'de Cervantes',     'Española', '1547-09-29'),
  (2,  'Federico',       'García Lorca',     'Española', '1898-06-05'),
  (3,  'Gabriel',        'García Márquez',   'Colombiana', '1927-03-06'),
  (4,  'Mario',          'Vargas Llosa',     'Peruana',   '1936-03-28'),
  (5,  'Isabel',         'Allende',          'Chilena',   '1942-08-02'),
  (6,  'Jorge Luis',     'Borges',           'Argentina', '1899-08-24'),
  (7,  'Pablo',          'Neruda',           'Chilena',   '1904-07-12'),
  (8,  'Octavio',        'Paz',              'Mexicana',  '1914-03-31'),
  (9,  'Arturo',         'Pérez-Reverte',    'Española',  '1951-11-25'),
  (10, 'Carlos',         'Ruiz Zafón',       'Española',  '1964-09-28'),
  (11, 'Laura',          'Esquivel',         'Mexicana',  '1950-09-30'),
  (12, 'Roberto',        'Bolaño',           'Chilena',   '1953-04-28'),
  (13, 'Manuel',         'Vázquez Montalbán','Española',  '1939-06-14'),
  (14, 'Eduardo',        'Galeano',          'Uruguaya',  '1940-09-03'),
  (15, 'Rosa',           'Montero',          'Española',  '1951-01-16');

-- ────────────────────────────────────────────────────────────────────
--  Datos: libros (30)
-- ────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO libros (id, titulo, autor_id, isbn, genero, anio_publicacion, paginas, stock) VALUES
  (1,  'Don Quijote de la Mancha',          1,  '978-84-376-0494-7',  'Novela',     1605, 863,  4),
  (2,  'La Galatea',                         1,  '978-84-206-3594-0',  'Novela',     1585, 312,  2),
  (3,  'Bodas de sangre',                    2,  '978-84-376-1145-7',  'Teatro',     1933, 96,   3),
  (4,  'Yerma',                              2,  '978-84-376-1146-4',  'Teatro',     1934, 112,  2),
  (5,  'Cien años de soledad',               3,  '978-84-376-0496-1',  'Realismo mágico', 1967, 471, 6),
  (6,  'El amor en los tiempos del cólera',  3,  '978-84-01-37928-3',  'Novela',     1985, 348, 4),
  (7,  'La ciudad y los perros',             4,  '978-84-397-1781-3',  'Novela',     1963, 408, 3),
  (8,  'La fiesta del chivo',                4,  '978-84-01-37929-0',  'Novela histórica', 2000, 528, 2),
  (9,  'La casa de los espíritus',           5,  '978-84-01-37930-6',  'Realismo mágico', 1982, 448, 5),
  (10, 'Eva Luna',                           5,  '978-84-01-37931-3',  'Novela',     1987, 320, 3),
  (11, 'Ficciones',                          6,  '978-84-376-0497-8',  'Cuentos',    1944, 224, 4),
  (12, 'El Aleph',                           6,  '978-84-376-0498-5',  'Cuentos',    1949, 240, 3),
  (13, 'Veinte poemas de amor',              7,  '978-84-376-1147-1',  'Poesía',     1924, 96,   6),
  (14, 'Canto general',                      7,  '978-84-376-1148-8',  'Poesía',     1950, 512, 2),
  (15, 'El laberinto de la soledad',         8,  '978-84-376-1149-5',  'Ensayo',     1950, 192, 3),
  (16, 'La tabla de Flandes',                9,  '978-84-01-37932-0',  'Novela histórica', 1990, 384, 4),
  (17, 'El club Dumas',                      9,  '978-84-01-37933-7',  'Novela',     1993, 416, 2),
  (18, 'La sombra del viento',               10, '978-84-08-05635-1',  'Novela',     2001, 480, 7),
  (19, 'El juego del ángel',                 10, '978-84-08-05636-8',  'Novela',     2008, 540, 3),
  (20, 'Como agua para chocolate',           11, '978-84-376-1150-1',  'Realismo mágico', 1989, 248, 4),
  (21, '2666',                               12, '978-84-397-1782-0',  'Novela',     2004, 1130, 2),
  (22, 'Los detectives salvajes',            12, '978-84-397-1783-7',  'Novela',     1998, 672, 3),
  (23, 'Tatuaje',                            13, '978-84-01-37934-4',  'Novela negra', 1974, 280, 1),
  (24, 'Los mares del sur',                  13, '978-84-01-37935-1',  'Novela negra', 1979, 320, 2),
  (25, 'Las venas abiertas de América Latina', 14, '978-84-376-1151-8', 'Ensayo',    1971, 416, 4),
  (26, 'El libro de Manuel',                 14, '978-84-376-1152-5',  'Novela',     1973, 384, 2),
  (27, 'Crónica del rey negro',              9,  '978-84-01-37936-8',  'Novela histórica', 2018, 360, 3),
  (28, 'Línea de fuego',                     9,  '978-84-01-37937-5',  'Novela histórica', 2020, 720, 5),
  (29, 'La hija del comunista',              10, '978-84-08-05637-5',  'Novela',     2017, 656, 2),
  (30, 'La buena suerte',                    15, '978-84-01-37938-2',  'Novela',     2020, 360, 4);

-- ────────────────────────────────────────────────────────────────────
--  Datos: socios (25)
-- ────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO socios (id, nombre, apellido, email, telefono, fecha_alta) VALUES
  (1,  'Lucía',       'Martín Gómez',     'lucia.martin@example.com',     '612345678', '2019-01-15'),
  (2,  'Pablo',       'Ruiz Hernández',   'pablo.ruiz@example.com',      '622345678', '2019-02-20'),
  (3,  'María',       'García López',     'maria.garcia@example.com',    '632345678', '2019-03-10'),
  (4,  'Javier',      'Fernández Díaz',   'javier.fernandez@example.com', '642345678', '2019-04-05'),
  (5,  'Carmen',      'Romero Sánchez',   'carmen.romero@example.com',    '652345678', '2019-05-12'),
  (6,  'David',       'Torres Vargas',    'david.torres@example.com',     '662345678', '2019-06-18'),
  (7,  'Ana',         'Vázquez Castro',   'ana.vazquez@example.com',      '672345678', '2019-07-22'),
  (8,  'Sergio',      'Ramírez Ortega',   'sergio.ramirez@example.com',   '682345678', '2019-08-30'),
  (9,  'Isabel',      'Morales Jiménez',  'isabel.morales@example.com',   '692345678', '2019-09-14'),
  (10, 'Daniel',      'Castro Reyes',     'daniel.castro@example.com',    '602345678', '2019-10-01'),
  (11, 'Elena',       'Ortega Marín',     'elena.ortega@example.com',     '612345679', '2020-01-20'),
  (12, 'Miguel',      'Delgado Santos',   'miguel.delgado@example.com',   '622345679', '2020-02-15'),
  (13, 'Sara',        'Hernández Vidal',  'sara.hernandez@example.com',   '632345679', '2020-03-22'),
  (14, 'Adrián',      'Mendoza Rubio',    'adrian.mendoza@example.com',   '642345679', '2020-04-10'),
  (15, 'Patricia',    'Iglesias Cortés',  'patricia.iglesias@example.com', '652345679', '2020-05-05'),
  (16, 'Jorge',       'Soler Marín',      'jorge.soler@example.com',      '662345679', '2020-06-18'),
  (17, 'Cristina',    'Núñez Aguilar',    'cristina.nunez@example.com',   '672345679', '2020-07-25'),
  (18, 'Alberto',     'Domínguez Vega',   'alberto.dominguez@example.com', '682345679', '2020-08-30'),
  (19, 'Marta',       'Carmona León',     'marta.carmona@example.com',    '692345679', '2020-09-12'),
  (20, 'Roberto',     'Cortés Pascual',   'roberto.cortes@example.com',   '602345679', '2020-10-20'),
  (21, 'Beatriz',     'Lozano Herrero',   'beatriz.lozano@example.com',   '612345680', '2021-01-15'),
  (22, 'Francisco',   'Calvo Bravo',      'francisco.calvo@example.com',  '622345680', '2021-02-28'),
  (23, 'Nuria',       'Gallego Mora',     'nuria.gallego@example.com',    '632345680', '2021-03-18'),
  (24, 'Ricardo',     'Vidal Serrano',    'ricardo.vidal@example.com',    '642345680', '2021-04-25'),
  (25, 'Silvia',      'Marín Cabrera',    'silvia.marin@example.com',     '652345680', '2021-05-30');

-- ────────────────────────────────────────────────────────────────────
--  Datos: préstamos (40)
-- ────────────────────────────────────────────────────────────────────
-- Una mezcla de préstamos ya devueltos y otros aún activos
-- (fecha_devolucion IS NULL).

INSERT OR IGNORE INTO prestamos (id, libro_id, socio_id, fecha_prestamo, fecha_devolucion) VALUES
  (1,  1,  1,  '2024-01-05', '2024-01-26'),
  (2,  5,  2,  '2024-01-08', '2024-02-02'),
  (3,  18, 3,  '2024-01-10', '2024-01-31'),
  (4,  11, 4,  '2024-01-15', '2024-02-09'),
  (5,  9,  5,  '2024-01-20', NULL),
  (6,  7,  6,  '2024-02-01', '2024-02-22'),
  (7,  13, 7,  '2024-02-05', '2024-02-26'),
  (8,  1,  8,  '2024-02-10', '2024-03-03'),
  (9,  23, 9,  '2024-02-15', NULL),
  (10, 25, 10, '2024-02-20', '2024-03-13'),
  (11, 16, 11, '2024-03-01', '2024-03-22'),
  (12, 5,  12, '2024-03-05', NULL),
  (13, 21, 13, '2024-03-10', '2024-04-02'),
  (14, 3,  14, '2024-03-15', '2024-04-06'),
  (15, 18, 15, '2024-03-20', NULL),
  (16, 11, 16, '2024-04-01', '2024-04-23'),
  (17, 14, 17, '2024-04-05', '2024-04-26'),
  (18, 19, 18, '2024-04-10', NULL),
  (19, 28, 19, '2024-04-15', '2024-05-07'),
  (20, 30, 20, '2024-04-20', '2024-05-11'),
  (21, 9,  21, '2024-05-01', NULL),
  (22, 22, 22, '2024-05-05', '2024-05-27'),
  (23, 17, 23, '2024-05-10', '2024-06-01'),
  (24, 1,  24, '2024-05-15', '2024-06-05'),
  (25, 6,  25, '2024-05-20', '2024-06-11'),
  (26, 18, 1,  '2024-06-01', '2024-06-22'),
  (27, 12, 2,  '2024-06-05', NULL),
  (28, 8,  3,  '2024-06-10', '2024-07-02'),
  (29, 27, 4,  '2024-06-15', '2024-07-07'),
  (30, 5,  5,  '2024-06-20', NULL),
  (31, 26, 6,  '2024-07-01', '2024-07-23'),
  (32, 19, 7,  '2024-07-05', '2024-07-26'),
  (33, 30, 8,  '2024-07-10', NULL),
  (34, 11, 9,  '2024-07-15', '2024-08-05'),
  (35, 18, 10, '2024-07-20', '2024-08-11'),
  (36, 21, 11, '2024-08-01', '2024-08-22'),
  (37, 9,  12, '2024-08-05', NULL),
  (38, 23, 13, '2024-08-10', '2024-08-31'),
  (39, 5,  14, '2024-08-15', '2024-09-05'),
  (40, 1,  15, '2024-08-20', NULL),
  -- Más préstamos para tener datos de cara a lecciones de JOIN
  (41, 2,  16, '2024-09-01', '2024-09-22'),
  (42, 4,  17, '2024-09-03', NULL),
  (43, 5,  18, '2024-09-05', '2024-09-26'),
  (44, 6,  19, '2024-09-08', '2024-09-29'),
  (45, 7,  20, '2024-09-10', NULL),
  (46, 8,  21, '2024-09-12', '2024-10-03'),
  (47, 10, 22, '2024-09-15', '2024-10-06'),
  (48, 13, 23, '2024-09-18', '2024-10-09'),
  (49, 14, 24, '2024-09-20', '2024-10-11'),
  (50, 15, 25, '2024-09-22', '2024-10-13'),
  (51, 16, 1,  '2024-09-25', '2024-10-16'),
  (52, 17, 2,  '2024-09-28', '2024-10-19'),
  (53, 20, 3,  '2024-09-30', '2024-10-21'),
  (54, 21, 4,  '2024-10-02', '2024-10-23'),
  (55, 24, 5,  '2024-10-05', '2024-10-26'),
  (56, 25, 6,  '2024-10-08', '2024-10-29'),
  (57, 26, 7,  '2024-10-10', '2024-10-31'),
  (58, 27, 8,  '2024-10-12', NULL),
  (59, 28, 9,  '2024-10-15', '2024-11-05'),
  (60, 29, 10, '2024-10-18', '2024-11-08'),
  (61, 30, 11, '2024-10-20', '2024-11-10'),
  (62, 2,  12, '2024-10-22', '2024-11-12'),
  (63, 3,  13, '2024-10-25', '2024-11-15'),
  (64, 4,  14, '2024-10-28', '2024-11-18'),
  (65, 5,  15, '2024-10-30', '2024-11-20'),
  (66, 6,  16, '2024-11-01', '2024-11-22'),
  (67, 7,  17, '2024-11-03', '2024-11-24'),
  (68, 8,  18, '2024-11-05', '2024-11-26'),
  (69, 9,  19, '2024-11-08', NULL),
  (70, 10, 20, '2024-11-10', '2024-12-01'),
  -- Más préstamos para enriquecer los datos
  (71, 11, 21, '2024-11-12', '2024-12-03'),
  (72, 12, 22, '2024-11-15', '2024-12-06'),
  (73, 13, 23, '2024-11-18', '2024-12-09'),
  (74, 14, 24, '2024-11-20', '2024-12-11'),
  (75, 15, 25, '2024-11-22', '2024-12-13'),
  (76, 16, 1,  '2024-11-25', '2024-12-16'),
  (77, 17, 2,  '2024-11-28', '2024-12-19'),
  (78, 18, 3,  '2024-11-30', '2024-12-21'),
  (79, 19, 4,  '2024-12-02', '2024-12-23'),
  (80, 20, 5,  '2024-12-05', '2024-12-26'),
  (81, 21, 6,  '2024-12-08', '2024-12-29'),
  (82, 22, 7,  '2024-12-10', NULL),
  (83, 23, 8,  '2024-12-12', NULL),
  (84, 24, 9,  '2024-12-15', NULL),
  (85, 25, 10, '2024-12-18', NULL),
  (86, 26, 11, '2024-12-20', NULL),
  (87, 27, 12, '2024-12-22', NULL),
  (88, 28, 13, '2024-12-26', NULL),
  (89, 29, 14, '2024-12-28', NULL),
  (90, 30, 15, '2024-12-30', NULL),
  -- Préstamos que empiezan en 2025 para tener "datos futuros"
  (91, 1,  16, '2025-01-05', '2025-01-26'),
  (92, 2,  17, '2025-01-08', '2025-01-29'),
  (93, 3,  18, '2025-01-12', NULL),
  (94, 4,  19, '2025-01-15', '2025-02-05'),
  (95, 5,  20, '2025-01-18', NULL),
  (96, 6,  21, '2025-01-22', '2025-02-12'),
  (97, 7,  22, '2025-01-25', '2025-02-15'),
  (98, 8,  23, '2025-01-28', NULL),
  (99, 9,  24, '2025-02-01', '2025-02-22'),
  (100, 10, 25, '2025-02-05', '2025-02-26'),
  -- Y más préstamos a lo largo de 2025
  (101, 11, 1,  '2025-02-08', '2025-03-01'),
  (102, 12, 2,  '2025-02-10', '2025-03-03'),
  (103, 13, 3,  '2025-02-12', '2025-03-05'),
  (104, 14, 4,  '2025-02-15', '2025-03-08'),
  (105, 15, 5,  '2025-02-18', '2025-03-11'),
  (106, 16, 6,  '2025-02-20', NULL),
  (107, 17, 7,  '2025-02-22', NULL),
  (108, 18, 8,  '2025-02-25', '2025-03-18'),
  (109, 19, 9,  '2025-02-28', '2025-03-21'),
  (110, 20, 10, '2025-03-02', '2025-03-23'),
  (111, 21, 11, '2025-03-05', NULL),
  (112, 22, 12, '2025-03-08', NULL),
  (113, 23, 13, '2025-03-10', '2025-03-31'),
  (114, 24, 14, '2025-03-12', '2025-04-02'),
  (115, 25, 15, '2025-03-15', '2025-04-05');
`,
}
