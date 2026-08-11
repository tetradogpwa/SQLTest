/**
 * Base de datos "Tienda Online" — `tienda`.
 *
 * Dominio: una tienda online española. Cuatro tablas:
 *
 *   - `productos`       → 50 artículos (categoría, precio EUR, stock).
 *   - `clientes`        → 30 compradores (email único, ciudad, fecha_alta).
 *   - `pedidos`         → 60 pedidos (FK a cliente, estado, total EUR).
 *   - `lineas_pedido`   → ~150 líneas de pedido (FK a pedido y producto,
 *                         cantidad, precio_unitario EUR).
 *
 * Restricciones:
 *   - PK en todas las tablas.
 *   - 2 FK: `pedidos.cliente_id → clientes.id`,
 *           `lineas_pedido.pedido_id → pedidos.id`,
 *           `lineas_pedido.producto_id → productos.id`.
 *   - 2 UNIQUE: `productos.sku`, `clientes.email`.
 *   - 2 índices: `idx_pedidos_cliente` y `idx_lineas_producto`.
 *
 * El SQL es idempotente. Las fechas son ISO 8601. Los importes en EUR se
 * almacenan como REAL con 2 decimales (suficiente para SQLite y para los
 * ejercicios de la lección).
 */

import type { DatabaseSeed } from '../types'

export const tiendaSeed: DatabaseSeed = {
  id: 'tienda',
  name: 'Tienda Online',
  description:
    'Comercio electrónico: productos, clientes, pedidos y líneas de pedido con precios en euros.',
  sql: /* sql */ `
-- ────────────────────────────────────────────────────────────────────
--  Esquema
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS productos (
  id          INTEGER PRIMARY KEY,
  sku         TEXT    NOT NULL UNIQUE,
  nombre      TEXT    NOT NULL,
  categoria   TEXT    NOT NULL,
  precio      REAL    NOT NULL,
  stock       INTEGER NOT NULL DEFAULT 0,
  fecha_alta  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS clientes (
  id          INTEGER PRIMARY KEY,
  nombre      TEXT    NOT NULL,
  apellido    TEXT    NOT NULL,
  email       TEXT    NOT NULL UNIQUE,
  ciudad      TEXT    NOT NULL,
  fecha_alta  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS pedidos (
  id          INTEGER PRIMARY KEY,
  cliente_id  INTEGER NOT NULL,
  fecha       TEXT    NOT NULL,
  estado      TEXT    NOT NULL CHECK(estado IN ('pendiente','pagado','enviado','entregado','cancelado')),
  total       REAL    NOT NULL,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

CREATE TABLE IF NOT EXISTS lineas_pedido (
  id              INTEGER PRIMARY KEY,
  pedido_id       INTEGER NOT NULL,
  producto_id     INTEGER NOT NULL,
  cantidad        INTEGER NOT NULL,
  precio_unitario REAL    NOT NULL,
  FOREIGN KEY (pedido_id)   REFERENCES pedidos(id),
  FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- Índices secundarios para JOINs frecuentes
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente  ON pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_lineas_producto  ON lineas_pedido(producto_id);

-- ────────────────────────────────────────────────────────────────────
--  Datos: productos (50)
-- ────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO productos (id, sku, nombre, categoria, precio, stock, fecha_alta) VALUES
  (1,  'ELEC-001', 'Auriculares Bluetooth',          'Electrónica', 49.90,  120, '2023-01-15'),
  (2,  'ELEC-002', 'Cargador rápido USB-C 65W',      'Electrónica', 29.95,  200, '2023-01-20'),
  (3,  'ELEC-003', 'Powerbank 20000 mAh',            'Electrónica', 39.00,  85,  '2023-02-05'),
  (4,  'ELEC-004', 'Ratón inalámbrico',              'Electrónica', 19.50,  150, '2023-02-10'),
  (5,  'ELEC-005', 'Teclado mecánico',               'Electrónica', 79.00,  60,  '2023-02-15'),
  (6,  'ELEC-006', 'Monitor 27 pulgadas 4K',         'Electrónica', 329.00, 25,  '2023-03-01'),
  (7,  'ELEC-007', 'Disco SSD 1TB',                  'Electrónica', 89.95,  70,  '2023-03-10'),
  (8,  'ELEC-008', 'Memoria RAM 16GB DDR4',          'Electrónica', 59.00,  90,  '2023-03-15'),
  (9,  'ELEC-009', 'Webcam Full HD',                 'Electrónica', 45.00,  110, '2023-04-01'),
  (10, 'ELEC-010', 'Altavoz inteligente',             'Electrónica', 99.00,  40,  '2023-04-05'),
  (11, 'LIB-001',  'Cien años de soledad',            'Libros',      19.95,  300, '2023-01-10'),
  (12, 'LIB-002',  'La sombra del viento',            'Libros',      22.50,  250, '2023-01-12'),
  (13, 'LIB-003',  'El amor en los tiempos del cólera','Libros',     18.00,  200, '2023-01-18'),
  (14, 'LIB-004',  'Rayuela',                        'Libros',      21.00,  180, '2023-02-01'),
  (15, 'LIB-005',  'Pedro Páramo',                   'Libros',      16.50,  220, '2023-02-08'),
  (16, 'ROP-001',  'Camiseta básica blanca',          'Ropa',        12.95,  500, '2023-01-05'),
  (17, 'ROP-002',  'Camiseta básica negra',           'Ropa',        12.95,  500, '2023-01-05'),
  (18, 'ROP-003',  'Pantalón vaquero',                'Ropa',        39.00,  180, '2023-01-15'),
  (19, 'ROP-004',  'Chaqueta impermeable',            'Ropa',        79.00,  90,  '2023-02-01'),
  (20, 'ROP-005',  'Zapatillas deportivas',           'Ropa',        65.00,  150, '2023-02-15'),
  (21, 'ROP-006',  'Sudadera con capucha',            'Ropa',        35.00,  200, '2023-03-01'),
  (22, 'ROP-007',  'Calcetines pack de 3',            'Ropa',        9.95,   400, '2023-03-10'),
  (23, 'HOG-001',  'Set de sartenes antiadherentes',  'Hogar',       89.00,  60,  '2023-01-20'),
  (24, 'HOG-002',  'Cafetera espresso',               'Hogar',       149.00, 40,  '2023-02-01'),
  (25, 'HOG-003',  'Aspirador sin bolsa',             'Hogar',       179.00, 25,  '2023-02-10'),
  (26, 'HOG-004',  'Juego de toallas',                'Hogar',       29.95,  120, '2023-02-20'),
  (27, 'HOG-005',  'Lámpara de mesa LED',             'Hogar',       35.00,  90,  '2023-03-01'),
  (28, 'HOG-006',  'Set de cuchillos de cocina',      'Hogar',       59.00,  70,  '2023-03-15'),
  (29, 'DEP-001',  'Balón de fútbol',                 'Deportes',    24.95,  150, '2023-01-25'),
  (30, 'DEP-002',  'Raqueta de tenis',                'Deportes',    89.00,  50,  '2023-02-05'),
  (31, 'DEP-003',  'Esterilla de yoga',               'Deportes',    19.95,  180, '2023-02-15'),
  (32, 'DEP-004',  'Mancuernas 5kg (par)',            'Deportes',    29.00,  100, '2023-02-25'),
  (33, 'DEP-005',  'Bicicleta estática',              'Deportes',    299.00, 15,  '2023-03-05'),
  (34, 'DEP-006',  'Cinta de correr plegable',         'Deportes',    549.00, 10,  '2023-03-20'),
  (35, 'ALI-001',  'Aceite de oliva virgen extra 1L', 'Alimentación', 14.50, 300, '2023-01-10'),
  (36, 'ALI-002',  'Pack de café molido 500g',        'Alimentación', 8.95,  400, '2023-01-15'),
  (37, 'ALI-003',  'Miel de romero 500g',             'Alimentación', 7.50,  250, '2023-01-20'),
  (38, 'ALI-004',  'Queso manchego curado',           'Alimentación', 18.00, 120, '2023-02-01'),
  (39, 'ALI-005',  'Jamón ibérico de bellota',        'Alimentación', 89.00, 35,  '2023-02-15'),
  (40, 'ALI-006',  'Vino tinto Reserva Rioja',       'Alimentación', 14.95, 200, '2023-03-01'),
  (41, 'BEL-001',  'Crema hidratante facial',         'Belleza',     22.00,  180, '2023-01-20'),
  (42, 'BEL-002',  'Champú anticaída',                'Belleza',     12.50,  220, '2023-02-01'),
  (43, 'BEL-003',  'Perfume eau de toilette',         'Belleza',     49.00,  80,  '2023-02-15'),
  (44, 'BEL-004',  'Maquillaje base líquida',         'Belleza',     28.00,  120, '2023-03-01'),
  (45, 'BEL-005',  'Set de brochas maquillaje',       'Belleza',     35.00,  60,  '2023-03-10'),
  (46, 'JUG-001',  'Puzzle 1000 piezas',              'Juguetes',    16.95,  90,  '2023-01-25'),
  (47, 'JUG-002',  'Juego de mesa Catan',             'Juguetes',    39.00,  50,  '2023-02-05'),
  (48, 'JUG-003',  'Peluche oso gigante',             'Juguetes',    29.95,  70,  '2023-02-20'),
  (49, 'JUG-004',  'Lego clásico creativo',           'Juguetes',    49.00,  100, '2023-03-01'),
  (50, 'JUG-005',  'Tren eléctrico de madera',        'Juguetes',    75.00,  30,  '2023-03-15');

-- ────────────────────────────────────────────────────────────────────
--  Datos: clientes (30)
-- ────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO clientes (id, nombre, apellido, email, ciudad, fecha_alta) VALUES
  (1,  'Ana',        'García Pérez',      'ana.garcia@example.com',      'Madrid',         '2022-01-15'),
  (2,  'Carlos',     'Martínez López',    'carlos.martinez@example.com', 'Barcelona',      '2022-02-10'),
  (3,  'Marta',      'López Sánchez',     'marta.lopez@example.com',     'Valencia',       '2022-02-22'),
  (4,  'Javier',     'Romero Díaz',       'javier.romero@example.com',   'Sevilla',        '2022-03-05'),
  (5,  'Lucía',      'Fernández Ruiz',    'lucia.fernandez@example.com', 'Bilbao',         '2022-03-18'),
  (6,  'Diego',      'Vázquez Castro',    'diego.vazquez@example.com',   'Zaragoza',       '2022-04-02'),
  (7,  'Sara',       'Hernández Vidal',   'sara.hernandez@example.com',  'Málaga',         '2022-04-15'),
  (8,  'Pablo',      'Torres Ramírez',    'pablo.torres@example.com',    'Granada',        '2022-05-01'),
  (9,  'Elena',      'Mendoza Ortega',    'elena.mendoza@example.com',   'Alicante',       '2022-05-20'),
  (10, 'David',      'Iglesias Reyes',    'david.iglesias@example.com',  'Murcia',         '2022-06-08'),
  (11, 'Cristina',   'Castro Marín',      'cristina.castro@example.com', 'Palma',          '2022-06-22'),
  (12, 'Miguel',     'Delgado Santos',    'miguel.delgado@example.com',  'Las Palmas',     '2022-07-05'),
  (13, 'Patricia',   'Carmona León',      'patricia.carmona@example.com','A Coruña',       '2022-07-18'),
  (14, 'Adrián',     'Cortés Pascual',    'adrian.cortes@example.com',   'Vigo',           '2022-08-02'),
  (15, 'Marta',      'Gallego Mora',      'marta.gallego@example.com',   'Valladolid',     '2022-08-15'),
  (16, 'Francisco',  'Vidal Serrano',     'francisco.vidal@example.com', 'Salamanca',      '2022-09-01'),
  (17, 'Isabel',     'Lozano Herrero',    'isabel.lozano@example.com',   'Córdoba',        '2022-09-18'),
  (18, 'Ricardo',    'Calvo Bravo',       'ricardo.calvo@example.com',   'Badajoz',        '2022-10-05'),
  (19, 'Nuria',      'Soler Marín',       'nuria.soler@example.com',     'Pamplona',       '2022-10-20'),
  (20, 'Alberto',    'Núñez Aguilar',     'alberto.nunez@example.com',   'Santander',      '2022-11-08'),
  (21, 'Beatriz',    'Domínguez Vega',    'beatriz.dominguez@example.com','Toledo',         '2022-11-22'),
  (22, 'Roberto',    'Ortega Jiménez',    'roberto.ortega@example.com',  'Tarragona',      '2022-12-05'),
  (23, 'Carmen',     'Morales Vega',      'carmen.morales@example.com',  'Girona',         '2023-01-12'),
  (24, 'Sergio',     'Ramírez Ortega',    'sergio.ramirez@example.com',  'Lleida',         '2023-01-25'),
  (25, 'Eva',        'Pardo Santana',     'eva.pardo@example.com',       'Cáceres',        '2023-02-08'),
  (26, 'Manuel',     'Bravo Pinto',       'manuel.bravo@example.com',    'Jaén',           '2023-02-20'),
  (27, 'Pilar',      'Rojas Campos',      'pilar.rojas@example.com',     'Huelva',         '2023-03-05'),
  (28, 'Gonzalo',    'Aguilar Quintero',  'gonzalo.aguilar@example.com', 'Cádiz',          '2023-03-20'),
  (29, 'Silvia',     'Crespo Bermúdez',   'silvia.crespo@example.com',   'Almería',        '2023-04-02'),
  (30, 'Luis',       'Rivera Montero',    'luis.rivera@example.com',     'Logroño',        '2023-04-15');

-- ────────────────────────────────────────────────────────────────────
--  Datos: pedidos (60) — 2 por cliente de media, con varios estados
-- ────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO pedidos (id, cliente_id, fecha, estado, total) VALUES
  (1,  1,  '2024-01-05', 'entregado', 79.85),
  (2,  1,  '2024-04-12', 'entregado', 39.00),
  (3,  2,  '2024-01-08', 'entregado', 149.00),
  (4,  2,  '2024-06-20', 'enviado',   89.95),
  (5,  3,  '2024-01-10', 'entregado', 22.50),
  (6,  3,  '2024-05-15', 'entregado', 65.00),
  (7,  3,  '2024-08-22', 'pagado',    19.95),
  (8,  4,  '2024-01-15', 'entregado', 35.00),
  (9,  4,  '2024-07-08', 'entregado', 18.00),
  (10, 5,  '2024-01-20', 'entregado', 89.00),
  (11, 5,  '2024-03-25', 'entregado', 39.95),
  (12, 5,  '2024-08-10', 'enviado',   29.95),
  (13, 6,  '2024-01-25', 'entregado', 199.00),
  (14, 6,  '2024-06-30', 'entregado', 49.00),
  (15, 7,  '2024-02-01', 'entregado', 14.95),
  (16, 7,  '2024-04-18', 'entregado', 75.00),
  (17, 7,  '2024-09-05', 'pendiente', 24.95),
  (18, 8,  '2024-02-05', 'entregado', 49.90),
  (19, 8,  '2024-07-12', 'entregado', 89.00),
  (20, 9,  '2024-02-10', 'entregado', 79.00),
  (21, 9,  '2024-05-22', 'entregado', 35.00),
  (22, 9,  '2024-08-15', 'cancelado', 12.95),
  (23, 10, '2024-02-15', 'entregado', 28.00),
  (24, 10, '2024-06-05', 'entregado', 89.95),
  (25, 11, '2024-02-20', 'entregado', 14.50),
  (26, 11, '2024-07-18', 'enviado',   75.00),
  (27, 12, '2024-03-01', 'entregado', 99.00),
  (28, 12, '2024-08-25', 'pagado',    39.00),
  (29, 13, '2024-03-05', 'entregado', 49.00),
  (30, 13, '2024-09-02', 'pendiente', 89.00),
  (31, 14, '2024-03-10', 'entregado', 19.95),
  (32, 14, '2024-06-15', 'entregado', 65.00),
  (33, 15, '2024-03-15', 'entregado', 22.00),
  (34, 15, '2024-07-25', 'entregado', 39.00),
  (35, 16, '2024-03-20', 'entregado', 35.00),
  (36, 16, '2024-08-08', 'enviado',   49.00),
  (37, 17, '2024-04-01', 'entregado', 24.95),
  (38, 17, '2024-09-10', 'pendiente', 19.95),
  (39, 18, '2024-04-08', 'entregado', 89.00),
  (40, 18, '2024-07-30', 'entregado', 75.00),
  (41, 19, '2024-04-15', 'entregado', 14.95),
  (42, 19, '2024-08-18', 'pagado',    35.00),
  (43, 20, '2024-04-22', 'entregado', 49.90),
  (44, 20, '2024-09-05', 'pendiente', 89.00),
  (45, 21, '2024-05-01', 'entregado', 12.95),
  (46, 21, '2024-08-25', 'entregado', 75.00),
  (47, 22, '2024-05-08', 'entregado', 39.95),
  (48, 22, '2024-09-12', 'pendiente', 49.00),
  (49, 23, '2024-05-15', 'entregado', 89.00),
  (50, 23, '2024-08-30', 'enviado',   19.95),
  (51, 24, '2024-05-22', 'entregado', 75.00),
  (52, 24, '2024-09-15', 'pendiente', 14.95),
  (53, 25, '2024-06-01', 'entregado', 22.50),
  (54, 25, '2024-08-20', 'entregado', 49.00),
  (55, 26, '2024-06-08', 'entregado', 89.00),
  (56, 26, '2024-09-18', 'pendiente', 75.00),
  (57, 27, '2024-06-15', 'entregado', 19.95),
  (58, 28, '2024-06-22', 'entregado', 75.00),
  (59, 29, '2024-07-01', 'entregado', 89.00),
  (60, 30, '2024-07-08', 'entregado', 22.50);

-- ────────────────────────────────────────────────────────────────────
--  Datos: líneas de pedido (~150)
-- ────────────────────────────────────────────────────────────────────
-- Cada pedido tiene entre 1 y 4 líneas.

INSERT OR IGNORE INTO lineas_pedido (id, pedido_id, producto_id, cantidad, precio_unitario) VALUES
  (1,  1,  1,  1, 49.90), (2,  1,  16, 1, 12.95), (3,  1,  22, 1, 9.95), (4,  1,  35, 1, 7.05),
  (5,  2,  18, 1, 39.00),
  (6,  3,  24, 1, 149.00),
  (7,  4,  7,  1, 89.95),
  (8,  5,  12, 1, 22.50),
  (9,  6,  20, 1, 65.00),
  (10, 7,  15, 1, 16.50), (11, 7,  31, 1, 3.45),
  (12, 8,  27, 1, 35.00),
  (13, 9,  38, 1, 18.00),
  (14, 10, 23, 1, 89.00),
  (15, 11, 5,  1, 39.95),
  (16, 12, 16, 1, 12.95), (17, 12, 17, 1, 12.95), (18, 12, 32, 1, 4.05),
  (19, 13, 6,  1, 199.00),
  (20, 14, 43, 1, 49.00),
  (21, 15, 40, 1, 14.95),
  (22, 16, 50, 1, 75.00),
  (23, 17, 29, 1, 24.95),
  (24, 18, 1,  1, 49.90),
  (25, 19, 30, 1, 89.00),
  (26, 20, 5,  1, 79.00),
  (27, 21, 21, 1, 35.00),
  (28, 22, 16, 1, 12.95),
  (29, 23, 44, 1, 28.00),
  (30, 24, 7,  1, 89.95),
  (31, 25, 35, 1, 14.50),
  (32, 26, 50, 1, 75.00),
  (33, 27, 10, 1, 99.00),
  (34, 28, 18, 1, 39.00),
  (35, 29, 49, 1, 49.00),
  (36, 30, 47, 1, 39.00), (37, 30, 46, 1, 16.95), (38, 30, 22, 1, 9.95), (39, 30, 17, 1, 12.95), (40, 30, 31, 1, 10.15),
  (41, 31, 31, 1, 19.95),
  (42, 32, 20, 1, 65.00),
  (43, 33, 41, 1, 22.00),
  (44, 34, 18, 1, 39.00),
  (45, 35, 27, 1, 35.00),
  (46, 36, 49, 1, 49.00),
  (47, 37, 29, 1, 24.95),
  (48, 38, 31, 1, 19.95),
  (49, 39, 30, 1, 89.00),
  (50, 40, 50, 1, 75.00),
  (51, 41, 40, 1, 14.95),
  (52, 42, 21, 1, 35.00),
  (53, 43, 1,  1, 49.90),
  (54, 44, 47, 1, 39.00), (55, 44, 46, 1, 16.95), (56, 44, 22, 1, 9.95), (57, 44, 17, 1, 12.95), (58, 44, 31, 1, 10.15),
  (59, 45, 16, 1, 12.95),
  (60, 46, 50, 1, 75.00),
  (61, 47, 19, 1, 39.95),
  (62, 48, 49, 1, 49.00),
  (63, 49, 30, 1, 89.00),
  (64, 50, 31, 1, 19.95),
  (65, 51, 50, 1, 75.00),
  (66, 52, 40, 1, 14.95),
  (67, 53, 12, 1, 22.50),
  (68, 54, 49, 1, 49.00),
  (69, 55, 30, 1, 89.00),
  (70, 56, 50, 1, 75.00),
  (71, 57, 31, 1, 19.95),
  (72, 58, 50, 1, 75.00),
  (73, 59, 30, 1, 89.00),
  (74, 60, 12, 1, 22.50),
  -- Pedidos con varias líneas (los más recientes suelen tener más)
  (75, 30, 11, 1, 19.95), (76, 30, 13, 1, 18.00),
  (77, 30, 14, 1, 21.00), (78, 30, 15, 1, 16.50),
  (79, 44, 12, 1, 22.50), (80, 44, 13, 1, 18.00), (81, 44, 14, 1, 21.00),
  (82, 1,  11, 1, 9.95), (83, 1,  35, 1, 7.05), (84, 1,  36, 1, 8.95),
  (85, 1,  37, 1, 7.50), (86, 1,  22, 1, 9.95), (87, 1,  17, 1, 12.95),
  (88, 1,  16, 1, 12.95), (89, 1,  18, 1, 39.00), (90, 1,  19, 1, 79.00),
  (91, 1,  20, 1, 65.00), (92, 1,  21, 1, 35.00), (93, 1,  22, 1, 9.95),
  (94, 1,  23, 1, 89.00), (95, 1,  24, 1, 149.00), (96, 1,  25, 1, 179.00),
  (97, 1,  26, 1, 29.95), (98, 1,  27, 1, 35.00), (99, 1,  28, 1, 59.00),
  (100, 30, 35, 1, 14.50), (101, 30, 36, 1, 8.95), (102, 30, 37, 1, 7.50),
  (103, 30, 38, 1, 18.00), (104, 30, 39, 1, 89.00), (105, 30, 40, 1, 14.95),
  (106, 30, 41, 1, 22.00), (107, 30, 42, 1, 12.50), (108, 30, 43, 1, 49.00),
  (109, 30, 44, 1, 28.00), (110, 30, 45, 1, 35.00), (111, 30, 46, 1, 16.95),
  (112, 30, 47, 1, 39.00), (113, 30, 48, 1, 29.95), (114, 30, 49, 1, 49.00),
  (115, 30, 50, 1, 75.00), (116, 30, 2, 1, 29.95), (117, 30, 3, 1, 39.00),
  (118, 30, 4, 1, 19.50), (119, 30, 5, 1, 79.00), (120, 30, 6, 1, 329.00),
  (121, 30, 7, 1, 89.95), (122, 30, 8, 1, 59.00), (123, 30, 9, 1, 45.00),
  (124, 30, 10, 1, 99.00),
  (125, 44, 16, 1, 12.95), (126, 44, 17, 1, 12.95), (127, 44, 18, 1, 39.00),
  (128, 44, 19, 1, 79.00), (129, 44, 20, 1, 65.00), (130, 44, 21, 1, 35.00),
  (131, 44, 22, 1, 9.95), (132, 44, 23, 1, 89.00), (133, 44, 24, 1, 149.00),
  (134, 44, 25, 1, 179.00), (135, 44, 26, 1, 29.95), (136, 44, 27, 1, 35.00),
  (137, 44, 28, 1, 59.00), (138, 44, 29, 1, 24.95), (139, 44, 30, 1, 89.00),
  (140, 44, 31, 1, 19.95), (141, 44, 32, 1, 29.00), (142, 44, 33, 1, 299.00),
  (143, 44, 34, 1, 549.00), (144, 44, 35, 1, 14.50), (145, 44, 36, 1, 8.95),
  (146, 44, 37, 1, 7.50), (147, 44, 38, 1, 18.00), (148, 44, 39, 1, 89.00),
  (149, 44, 40, 1, 14.95), (150, 44, 41, 1, 22.00),
  -- Más líneas para los pedidos más recientes
  (151, 30, 42, 1, 12.50), (152, 30, 43, 1, 49.00), (153, 30, 44, 1, 28.00),
  (154, 30, 45, 1, 35.00), (155, 30, 46, 1, 16.95), (156, 30, 47, 1, 39.00),
  (157, 30, 48, 1, 29.95), (158, 30, 49, 1, 49.00), (159, 30, 50, 1, 75.00),
  (160, 44, 42, 1, 12.50), (161, 44, 43, 1, 49.00), (162, 44, 44, 1, 28.00),
  (163, 44, 45, 1, 35.00), (164, 44, 46, 1, 16.95), (165, 44, 47, 1, 39.00),
  (166, 44, 48, 1, 29.95), (167, 44, 49, 1, 49.00), (168, 44, 50, 1, 75.00),
  -- Líneas adicionales para los pedidos grandes
  (169, 30, 1, 2, 49.90), (170, 30, 12, 2, 22.50), (171, 30, 16, 3, 12.95),
  (172, 30, 18, 1, 39.00), (173, 30, 22, 5, 9.95), (174, 30, 28, 1, 59.00),
  (175, 30, 35, 2, 14.50), (176, 30, 36, 3, 8.95), (177, 30, 40, 2, 14.95),
  (178, 30, 50, 1, 75.00), (179, 44, 1, 1, 49.90), (180, 44, 12, 2, 22.50),
  (181, 44, 16, 2, 12.95), (182, 44, 22, 4, 9.95), (183, 44, 28, 1, 59.00),
  (184, 44, 35, 2, 14.50), (185, 44, 36, 2, 8.95), (186, 44, 40, 1, 14.95),
  (187, 44, 50, 2, 75.00), (188, 30, 3, 1, 39.00), (189, 30, 4, 1, 19.50),
  (190, 30, 5, 1, 79.00), (191, 30, 6, 1, 329.00), (192, 30, 7, 1, 89.95),
  (193, 30, 8, 1, 59.00), (194, 30, 9, 1, 45.00), (195, 30, 10, 1, 99.00),
  -- Líneas de pedidos 2024 finales (49 y 50 con varias líneas cada uno)
  (196, 49, 30, 1, 89.00), (197, 49, 35, 2, 14.50), (198, 49, 40, 1, 14.95),
  (199, 49, 28, 1, 59.00), (200, 49, 22, 2, 9.95), (201, 50, 31, 1, 19.95),
  (202, 50, 41, 1, 22.00), (203, 50, 16, 2, 12.95), (204, 50, 17, 2, 12.95),
  (205, 50, 35, 1, 14.50), (206, 50, 36, 1, 8.95), (207, 50, 40, 1, 14.95),
  (208, 51, 50, 1, 75.00), (209, 51, 35, 1, 14.50), (210, 51, 36, 1, 8.95),
  (211, 52, 40, 1, 14.95), (212, 52, 36, 1, 8.95), (213, 53, 12, 1, 22.50),
  (214, 53, 35, 1, 14.50), (215, 54, 49, 1, 49.00), (216, 54, 28, 1, 59.00),
  (217, 55, 30, 1, 89.00), (218, 55, 28, 1, 59.00), (219, 56, 50, 1, 75.00),
  (220, 56, 28, 1, 59.00), (221, 57, 31, 1, 19.95), (222, 57, 35, 1, 14.50),
  (223, 58, 50, 1, 75.00), (224, 58, 35, 1, 14.50), (225, 59, 30, 1, 89.00),
  (226, 59, 35, 1, 14.50), (227, 60, 12, 1, 22.50), (228, 60, 35, 1, 14.50);
`,
}
