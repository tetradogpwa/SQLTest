/**
 * Base de datos "Empresa Consultora" — `empresa`.
 *
 * Dominio: una empresa consultora de ingeniería. Cuatro tablas:
 *
 *   - `departamentos`  → 5 departamentos (presupuesto anual, responsable).
 *   - `empleados`      → 30 empleados (FK a departamento, salario EUR,
 *                        email único).
 *   - `proyectos`      → 10 proyectos (cliente, presupuesto EUR, fechas).
 *   - `asignaciones`   → 40 asignaciones empleado↔proyecto (horas/semana,
 *                        fechas, UNIQUE(empleado_id, proyecto_id)).
 *
 * Restricciones:
 *   - PK en todas las tablas.
 *   - 3 FK: `empleados.departamento_id → departamentos.id`,
 *           `asignaciones.empleado_id → empleados.id`,
 *           `asignaciones.proyecto_id → proyectos.id`.
 *   - 2 UNIQUE: `empleados.email`,
 *               `asignaciones(empleado_id, proyecto_id)`.
 *   - 1 índice: `idx_asignaciones_proyecto` para acelerar el conteo de
 *     personal por proyecto.
 *
 * El SQL es idempotente. Salarios y presupuestos en EUR. Fechas ISO 8601.
 */

import type { DatabaseSeed } from '../types'

export const empresaSeed: DatabaseSeed = {
  id: 'empresa',
  name: 'Empresa Consultora',
  description:
    'Una consultora de ingeniería: departamentos, empleados, proyectos y asignaciones con salarios y presupuestos en euros.',
  sql: /* sql */ `
-- ────────────────────────────────────────────────────────────────────
--  Esquema
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS departamentos (
  id              INTEGER PRIMARY KEY,
  nombre          TEXT    NOT NULL UNIQUE,
  presupuesto     REAL    NOT NULL,
  responsable_id  INTEGER
);

CREATE TABLE IF NOT EXISTS empleados (
  id              INTEGER PRIMARY KEY,
  nombre          TEXT    NOT NULL,
  apellido        TEXT    NOT NULL,
  email           TEXT    NOT NULL UNIQUE,
  departamento_id INTEGER NOT NULL,
  fecha_alta      TEXT    NOT NULL,
  salario         REAL    NOT NULL,
  FOREIGN KEY (departamento_id) REFERENCES departamentos(id)
);

CREATE TABLE IF NOT EXISTS proyectos (
  id              INTEGER PRIMARY KEY,
  nombre          TEXT    NOT NULL,
  cliente         TEXT    NOT NULL,
  fecha_inicio    TEXT    NOT NULL,
  fecha_fin       TEXT,
  presupuesto     REAL    NOT NULL
);

CREATE TABLE IF NOT EXISTS asignaciones (
  id              INTEGER PRIMARY KEY,
  empleado_id     INTEGER NOT NULL,
  proyecto_id     INTEGER NOT NULL,
  horas_semana    INTEGER NOT NULL,
  fecha_inicio    TEXT    NOT NULL,
  fecha_fin       TEXT,
  FOREIGN KEY (empleado_id) REFERENCES empleados(id),
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id),
  UNIQUE(empleado_id, proyecto_id)
);

-- Índice para acelerar el conteo de personal por proyecto
CREATE INDEX IF NOT EXISTS idx_asignaciones_proyecto ON asignaciones(proyecto_id);

-- ────────────────────────────────────────────────────────────────────
--  Datos: departamentos (5)
-- ────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO departamentos (id, nombre, presupuesto, responsable_id) VALUES
  (1, 'Ingeniería',        850000,  1),
  (2, 'Consultoría',       620000,  8),
  (3, 'Investigación',     450000,  15),
  (4, 'Operaciones',       380000,  22),
  (5, 'Administración',    220000,  NULL);

-- ────────────────────────────────────────────────────────────────────
--  Datos: empleados (30)
-- ────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO empleados (id, nombre, apellido, email, departamento_id, fecha_alta, salario) VALUES
  (1,  'Alejandro',  'Domínguez Vega',     'alejandro.dominguez@example.com',  1, '2018-01-15', 72000),
  (2,  'Marta',      'Carmona León',       'marta.carmona@example.com',        1, '2018-03-10', 58000),
  (3,  'Roberto',    'Cortés Pascual',     'roberto.cortes@example.com',       1, '2019-02-20', 52000),
  (4,  'Beatriz',    'Lozano Herrero',     'beatriz.lozano@example.com',       1, '2019-06-05', 48000),
  (5,  'Francisco',  'Calvo Bravo',        'francisco.calvo@example.com',      1, '2020-01-15', 45000),
  (6,  'Nuria',      'Gallego Mora',       'nuria.gallego@example.com',        1, '2020-09-01', 42000),
  (7,  'Ricardo',    'Vidal Serrano',      'ricardo.vidal@example.com',        1, '2021-03-22', 39000),
  (8,  'Silvia',     'Marín Cabrera',      'silvia.marin@example.com',         2, '2017-05-10', 78000),
  (9,  'Manuel',     'Bravo Pinto',        'manuel.bravo@example.com',         2, '2018-08-12', 55000),
  (10, 'Pilar',      'Rojas Campos',       'pilar.rojas@example.com',          2, '2019-04-18', 51000),
  (11, 'Gonzalo',    'Aguilar Quintero',   'gonzalo.aguilar@example.com',      2, '2020-02-25', 47000),
  (12, 'Cristina',   'Crespo Bermúdez',    'cristina.crespo@example.com',      2, '2021-06-30', 42000),
  (13, 'Luis',       'Rivera Montero',     'luis.rivera@example.com',          2, '2022-01-12', 38000),
  (14, 'Eva',        'Pardo Santana',      'eva.pardo@example.com',            2, '2022-09-05', 36000),
  (15, 'Carmen',     'Morales Vega',       'carmen.morales@example.com',       3, '2016-09-15', 85000),
  (16, 'Sergio',     'Ramírez Ortega',     'sergio.ramirez@example.com',       3, '2018-11-20', 65000),
  (17, 'Ana',        'García Pérez',       'ana.garcia@example.com',           3, '2019-05-08', 58000),
  (18, 'Carlos',     'Martínez López',     'carlos.martinez@example.com',      3, '2020-07-14', 52000),
  (19, 'Lucía',      'Fernández Ruiz',     'lucia.fernandez@example.com',      3, '2021-02-28', 47000),
  (20, 'Diego',      'Vázquez Castro',     'diego.vazquez@example.com',        3, '2022-04-11', 41000),
  (21, 'Sara',       'Hernández Vidal',    'sara.hernandez@example.com',       3, '2023-01-09', 36000),
  (22, 'Pablo',      'Torres Ramírez',     'pablo.torres@example.com',         4, '2017-02-18', 70000),
  (23, 'Elena',      'Mendoza Ortega',     'elena.mendoza@example.com',        4, '2018-10-05', 54000),
  (24, 'David',      'Iglesias Reyes',     'david.iglesias@example.com',       4, '2019-12-12', 48000),
  (25, 'Patricia',   'Carmona León',       'patricia.carmona@example.com',     4, '2021-08-22', 41000),
  (26, 'Adrián',     'Mendoza Ortega',     'adrian.mendoza@example.com',       4, '2022-05-30', 36000),
  (27, 'Isabel',     'Ortega Marín',       'isabel.ortega@example.com',        5, '2017-07-25', 62000),
  (28, 'Miguel',     'Delgado Santos',     'miguel.delgado@example.com',       5, '2019-03-15', 48000),
  (29, 'Marta',      'López Sánchez',      'marta.lopez@example.com',          5, '2020-11-08', 42000),
  (30, 'Javier',     'Romero Díaz',        'javier.romero@example.com',        5, '2022-02-20', 36000);

-- ────────────────────────────────────────────────────────────────────
--  Datos: proyectos (10)
-- ────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO proyectos (id, nombre, cliente, fecha_inicio, fecha_fin, presupuesto) VALUES
  (1,  'Migración cloud Banco Santander',      'Banco Santander',     '2023-01-15', '2024-06-30',  480000),
  (2,  'App de gestión para Renfe',            'Renfe',               '2023-03-01', '2024-02-28',  320000),
  (3,  'Plataforma IoT para Telefónica',       'Telefónica',          '2023-05-10', NULL,         650000),
  (4,  'CRM para Iberia',                      'Iberia',              '2023-06-15', '2024-08-15',  280000),
  (5,  'Sistema antifraude BBVA',              'BBVA',                '2023-09-01', '2024-12-31',  720000),
  (6,  'Migración SAP para Mapfre',            'Mapfre',              '2023-10-20', '2024-10-20',  420000),
  (7,  'Portal de clientes Repsol',            'Repsol',              '2024-01-10', NULL,         380000),
  (8,  'Auditoría de seguridad Inditex',       'Inditex',             '2024-02-05', '2024-08-05',  150000),
  (9,  'Optimización logística Mercadona',     'Mercadona',           '2024-04-01', '2024-12-31',  290000),
  (10, 'Transformación digital El Corte Inglés','El Corte Inglés',   '2024-05-15', NULL,         540000);

-- ────────────────────────────────────────────────────────────────────
--  Datos: asignaciones (40) — distribuye el personal entre proyectos
-- ────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO asignaciones (id, empleado_id, proyecto_id, horas_semana, fecha_inicio, fecha_fin) VALUES
  (1,  1,  1,  30, '2023-01-15', '2024-06-30'),
  (2,  2,  1,  40, '2023-01-15', '2024-06-30'),
  (3,  3,  1,  20, '2023-02-01', '2024-06-30'),
  (4,  4,  2,  35, '2023-03-01', '2024-02-28'),
  (5,  5,  2,  25, '2023-03-15', '2024-02-28'),
  (6,  6,  2,  20, '2023-04-01', '2024-02-28'),
  (7,  7,  3,  40, '2023-05-10', NULL),
  (8,  1,  3,  10, '2023-05-15', NULL),
  (9,  2,  3,  10, '2023-06-01', NULL),
  (10, 8,  4,  30, '2023-06-15', '2024-08-15'),
  (11, 9,  4,  40, '2023-06-15', '2024-08-15'),
  (12, 10, 4,  20, '2023-07-01', '2024-08-15'),
  (13, 11, 5,  35, '2023-09-01', '2024-12-31'),
  (14, 12, 5,  40, '2023-09-01', '2024-12-31'),
  (15, 13, 5,  20, '2023-09-15', '2024-12-31'),
  (16, 14, 5,  15, '2023-10-01', '2024-12-31'),
  (17, 15, 5,  10, '2023-10-15', '2024-12-31'),
  (18, 16, 6,  30, '2023-10-20', '2024-10-20'),
  (19, 17, 6,  40, '2023-10-20', '2024-10-20'),
  (20, 18, 6,  20, '2023-11-01', '2024-10-20'),
  (21, 19, 7,  35, '2024-01-10', NULL),
  (22, 20, 7,  40, '2024-01-10', NULL),
  (23, 21, 7,  20, '2024-01-15', NULL),
  (24, 22, 7,  15, '2024-02-01', NULL),
  (25, 23, 8,  40, '2024-02-05', '2024-08-05'),
  (26, 24, 8,  30, '2024-02-05', '2024-08-05'),
  (27, 25, 8,  20, '2024-02-15', '2024-08-05'),
  (28, 26, 9,  35, '2024-04-01', '2024-12-31'),
  (29, 27, 9,  20, '2024-04-01', '2024-12-31'),
  (30, 8,  9,  15, '2024-04-15', '2024-12-31'),
  (31, 9,  9,  10, '2024-05-01', '2024-12-31'),
  (32, 22, 10, 25, '2024-05-15', NULL),
  (33, 23, 10, 30, '2024-05-15', NULL),
  (34, 28, 10, 35, '2024-05-15', NULL),
  (35, 29, 10, 20, '2024-05-20', NULL),
  (36, 30, 10, 15, '2024-06-01', NULL),
  (37, 1,  2,  10, '2023-09-01', '2024-02-28'),
  (38, 4,  4,  10, '2023-09-01', '2024-08-15'),
  (39, 12, 1,  5,  '2023-05-01', '2024-06-30'),
  (40, 18, 5,  5,  '2024-01-01', '2024-12-31'),
  -- Asignaciones adicionales para tener más granularidad
  (41,  3, 7,  15, '2024-02-01', NULL),
  (42,  5, 7,  10, '2024-02-15', NULL),
  (43,  7, 8,  10, '2024-03-01', '2024-08-05'),
  (44, 11, 8,  10, '2024-03-15', '2024-08-05'),
  (45, 13, 8,  10, '2024-04-01', '2024-08-05'),
  (46, 14, 8,  10, '2024-04-15', '2024-08-05'),
  (47, 16, 9,  10, '2024-04-15', '2024-12-31'),
  (48, 17, 9,  10, '2024-05-01', '2024-12-31'),
  (49, 19, 9,  10, '2024-05-15', '2024-12-31'),
  (50, 20, 9,  10, '2024-06-01', '2024-12-31'),
  (51, 21, 9,  5,  '2024-06-15', '2024-12-31'),
  (52, 24, 10, 10, '2024-06-01', NULL),
  (53, 25, 10, 10, '2024-06-15', NULL),
  (54, 26, 10, 10, '2024-07-01', NULL),
  (55, 27, 10, 10, '2024-07-15', NULL),
  (56, 29, 10, 10, '2024-07-15', NULL),
  (57, 30, 10, 5,  '2024-08-01', NULL),
  (58,  1, 7,  5,  '2024-03-01', NULL),
  (59,  2, 8,  5,  '2024-03-15', '2024-08-05'),
  (60,  4, 10, 5,  '2024-07-15', NULL),
  -- Más asignaciones para enriquecer los datos
  (61,  5, 1,  10, '2024-08-01', '2024-12-31'),
  (62,  6, 1,  10, '2024-08-01', '2024-12-31'),
  (63,  8, 2,  10, '2024-08-15', '2024-12-31'),
  (64,  9, 2,  10, '2024-08-15', '2024-12-31'),
  (65, 10, 3,  10, '2024-08-20', NULL),
  (66, 11, 3,  10, '2024-08-20', NULL),
  (67, 12, 4,  10, '2024-09-01', '2024-12-31'),
  (68, 13, 4,  10, '2024-09-01', '2024-12-31'),
  (69, 14, 4,  5,  '2024-09-15', '2024-12-31'),
  (70, 15, 4,  5,  '2024-09-15', '2024-12-31'),
  (71, 16, 5,  10, '2024-10-01', '2024-12-31'),
  (72, 17, 5,  10, '2024-10-01', '2024-12-31'),
  (73, 18, 5,  5,  '2024-10-15', '2024-12-31'),
  (74, 19, 6,  15, '2024-10-20', '2024-12-31'),
  (75, 20, 6,  15, '2024-10-20', '2024-12-31'),
  (76, 21, 6,  10, '2024-10-25', '2024-12-31'),
  (77, 22, 7,  10, '2024-11-01', NULL),
  (78, 23, 7,  10, '2024-11-01', NULL),
  (79, 24, 7,  10, '2024-11-15', NULL),
  (80, 25, 7,  5,  '2024-11-15', NULL),
  (81, 26, 8,  10, '2024-12-01', '2024-08-05'),
  (82, 27, 8,  10, '2024-12-01', '2024-08-05'),
  (83, 28, 9,  15, '2024-12-10', '2024-12-31'),
  (84, 29, 9,  15, '2024-12-10', '2024-12-31'),
  (85, 30, 9,  10, '2024-12-15', '2024-12-31'),
  -- Asignaciones extra en 2025
  (86,  1, 1,  5,  '2025-01-08', '2024-06-30'),
  (87,  2, 1,  5,  '2025-01-08', '2024-06-30'),
  (88,  3, 1,  5,  '2025-01-08', '2024-06-30'),
  (89,  4, 2,  10, '2025-01-15', '2024-02-28'),
  (90,  5, 2,  10, '2025-01-15', '2024-02-28'),
  (91,  6, 2,  10, '2025-01-15', '2024-02-28'),
  (92,  7, 3,  5,  '2025-01-22', NULL),
  (93,  8, 3,  5,  '2025-01-22', NULL),
  (94,  9, 3,  5,  '2025-01-22', NULL),
  (95, 10, 3,  5,  '2025-01-22', NULL);
`,
}
