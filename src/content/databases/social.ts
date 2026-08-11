/**
 * Base de datos "Red Social" — `social`.
 *
 * Dominio: una red social tipo microblogging (estilo Twitter/Mastodon
 * hispana). Cuatro tablas:
 *
 *   - `usuarios`     → 20 cuentas (handle único, email único, bio).
 *   - `publicaciones`→ 40 posts (FK al autor, contenido, fecha, likes
 *                       desnormalizados para enseñar a discrepar entre
 *                       el campo y la tabla de likes).
 *   - `comentarios`  → 80 comentarios (FK a publicación y autor).
 *   - `likes`        → ~150 likes (FK a publicación y usuario, con
 *                       UNIQUE(pub_id, user_id) para no duplicar).
 *
 * Restricciones:
 *   - PK en todas las tablas.
 *   - 3 FK: `publicaciones.usuario_id → usuarios.id`,
 *           `comentarios.publicacion_id → publicaciones.id`,
 *           `comentarios.usuario_id → usuarios.id`,
 *           `likes.publicacion_id → publicaciones.id`,
 *           `likes.usuario_id → usuarios.id`.
 *   - 2 UNIQUE: `usuarios.handle`, `usuarios.email`,
 *               `likes(publicacion_id, usuario_id)`.
 *   - 1 índice: `idx_comentarios_publicacion` para acelerar los hilos.
 *
 * El SQL es idempotente. Las fechas son ISO 8601 con hora (TIMESTAMP).
 */

import type { DatabaseSeed } from '../types'

export const socialSeed: DatabaseSeed = {
  id: 'social',
  name: 'Red Social',
  description:
    'Una red social tipo microblogging: usuarios, publicaciones, comentarios y likes.',
  sql: /* sql */ `
-- ────────────────────────────────────────────────────────────────────
--  Esquema
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS usuarios (
  id              INTEGER PRIMARY KEY,
  handle          TEXT    NOT NULL UNIQUE,
  nombre          TEXT    NOT NULL,
  email           TEXT    NOT NULL UNIQUE,
  bio             TEXT,
  fecha_registro  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS publicaciones (
  id              INTEGER PRIMARY KEY,
  usuario_id      INTEGER NOT NULL,
  contenido       TEXT    NOT NULL,
  fecha           TEXT    NOT NULL,
  likes_count     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS comentarios (
  id              INTEGER PRIMARY KEY,
  publicacion_id  INTEGER NOT NULL,
  usuario_id      INTEGER NOT NULL,
  contenido       TEXT    NOT NULL,
  fecha           TEXT    NOT NULL,
  FOREIGN KEY (publicacion_id) REFERENCES publicaciones(id),
  FOREIGN KEY (usuario_id)     REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS likes (
  id              INTEGER PRIMARY KEY,
  publicacion_id  INTEGER NOT NULL,
  usuario_id      INTEGER NOT NULL,
  fecha           TEXT    NOT NULL,
  FOREIGN KEY (publicacion_id) REFERENCES publicaciones(id),
  FOREIGN KEY (usuario_id)     REFERENCES usuarios(id),
  UNIQUE(publicacion_id, usuario_id)
);

-- Índice para acelerar los hilos de comentarios
CREATE INDEX IF NOT EXISTS idx_comentarios_publicacion ON comentarios(publicacion_id);

-- ────────────────────────────────────────────────────────────────────
--  Datos: usuarios (20)
-- ────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO usuarios (id, handle, nombre, email, bio, fecha_registro) VALUES
  (1,  '@lucia_dev',     'Lucía Martín',     'lucia@example.com',     'Desarrolladora full-stack. Amante del café ☕ y el código limpio.', '2023-01-15 10:00:00'),
  (2,  '@pabloruiz',     'Pablo Ruiz',       'pablo@example.com',     'Escritor amateur y lector compulsivo. 📚',                         '2023-01-22 11:30:00'),
  (3,  '@marialopez',    'María López',      'maria@example.com',     'Fotógrafa freelance. 📷',                                            '2023-02-05 09:15:00'),
  (4,  '@javierfdez',    'Javier Fernández', 'javier@example.com',    'Músico y productor. 🎵',                                             '2023-02-18 14:00:00'),
  (5,  '@carmenromero',  'Carmen Romero',    'carmen@example.com',    'Profesora de secundaria. Educación es libertad.',                     '2023-03-01 08:45:00'),
  (6,  '@davidtorres',   'David Torres',     'david@example.com',     'Estudiante de ingeniería. Curioso por naturaleza.',                  '2023-03-15 16:20:00'),
  (7,  '@anavazquez',    'Ana Vázquez',      'ana@example.com',       'Chef en formación. 🍳 La cocina es química aplicada.',                '2023-04-02 12:00:00'),
  (8,  '@sergioramirez', 'Sergio Ramírez',   'sergio@example.com',    'Apasionado del senderismo y la montaña. ⛰️',                         '2023-04-18 10:30:00'),
  (9,  '@isabelmorales', 'Isabel Morales',   'isabel@example.com',    'Médica de familia. Salud para todos.',                                '2023-05-05 09:00:00'),
  (10, '@danielcastro',  'Daniel Castro',    'daniel@example.com',    'Periodista deportivo. ⚽',                                            '2023-05-20 11:15:00'),
  (11, '@elenaortega',   'Elena Ortega',     'elena@example.com',     'Diseñadora UX/UI. La belleza está en la simplicidad.',                '2023-06-08 14:30:00'),
  (12, '@migueldelgado', 'Miguel Delgado',   'miguel@example.com',    'Profesor de matemáticas. Los números no mienten.',                   '2023-06-22 08:00:00'),
  (13, '@sarahdez',      'Sara Hernández',   'sara@example.com',      'Psicóloga clínica. Escuchar es sanar.',                               '2023-07-10 10:45:00'),
  (14, '@adrianmendoza', 'Adrián Mendoza',   'adrian@example.com',    'Aviador comercial. ✈️',                                               '2023-07-25 15:00:00'),
  (15, '@patriciaigle',  'Patricia Iglesias', 'patricia@example.com',  'Abogada defensora. La justicia es un derecho, no un privilegio.',     '2023-08-12 09:30:00'),
  (16, '@jorgesoler',    'Jorge Soler',      'jorge@example.com',     'Emprendedor serial. Construir es aprender.',                          '2023-08-28 11:00:00'),
  (17, '@cristinanunez', 'Cristina Núñez',   'cristina@example.com',  'Veterinaria. 🐾 Los animales me han enseñado más que las personas.', '2023-09-15 13:20:00'),
  (18, '@albertodom',    'Alberto Domínguez', 'alberto@example.com',  'Ingeniero civil. Construimos el futuro.',                             '2023-10-02 08:30:00'),
  (19, '@martacarmona',  'Marta Carmona',    'marta@example.com',     'Bailarina profesional. 💃',                                            '2023-10-20 17:00:00'),
  (20, '@robertocort',   'Roberto Cortés',   'roberto@example.com',   'Crítico gastronómico. 🍽️ La comida es cultura.',                       '2023-11-05 12:30:00');

-- ────────────────────────────────────────────────────────────────────
--  Datos: publicaciones (40)
-- ────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO publicaciones (id, usuario_id, contenido, fecha, likes_count) VALUES
  (1,  1,  'Acabo de terminar mi primer proyecto en Rust. ¡Es brutal! 🚀',                     '2024-01-05 10:00:00', 12),
  (2,  2,  'Nuevo capítulo de mi novela terminado. Las palabras a veces fluyen solas.',        '2024-01-06 12:30:00', 8),
  (3,  3,  'Atardecer desde la Sierra de Gredos. La luz no engaña. 📷',                          '2024-01-07 19:15:00', 25),
  (4,  4,  'Componiendo para un documental sobre el mar Cantábrico. 🎵',                          '2024-01-08 22:00:00', 5),
  (5,  5,  'Hoy he explicado la fotosíntesis con un experimento que ha encantado a mis alumnos.','2024-01-10 09:00:00', 18),
  (6,  6,  'Las integrales son más fáciles cuando las visualizas. Os comparto mis apuntes.',     '2024-01-12 14:20:00', 7),
  (7,  7,  'He descubierto que la masa madre de 5 años sigue viva. Es un logro de paciencia. 🍞','2024-01-14 18:45:00', 14),
  (8,  8,  'Subida al Teide en 6 horas. Las piernas no opinan, las vistas sí. ⛰️',               '2024-01-15 20:00:00', 31),
  (9,  9,  'Recordad: la salud mental es tan importante como la física. No estéis solos.',       '2024-01-17 11:30:00', 22),
  (10, 10, 'El Clásico fue un partido para el recuerdo. ¡Y el arbitraje otra vez! ⚽',          '2024-01-19 23:30:00', 9),
  (11, 11, 'Nuevo diseño en Dribbble: una app de meditación minimalista. ¿Qué os parece?',     '2024-01-22 16:00:00', 16),
  (12, 12, 'El teorema de Pitágoras tiene más de 370 pruebas distintas. Y subiendo.',           '2024-01-25 10:15:00', 11),
  (13, 13, 'Hoy en consulta: un paciente me ha enseñado más él a mí que yo a él. A veces pasa.','2024-01-28 13:00:00', 19),
  (14, 14, 'Vuelo Madrid-Lima. 11 horas. Las nubes desde arriba parecen algodón. ✈️',           '2024-02-01 08:30:00', 27),
  (15, 15, 'Hemos conseguido la libertad de un cliente tras 3 años de proceso. Justicia. ⚖️',   '2024-02-05 12:00:00', 33),
  (16, 16, 'Lanzamos beta de nuestra app de finanzas personales. Feedback bienvenido.',         '2024-02-08 17:30:00', 6),
  (17, 17, 'Operación de urgencia a un golden retriever salvada. Mi corazón no cabe. 🐾',      '2024-02-12 21:00:00', 41),
  (18, 18, 'Primera piedra del nuevo puente sobre el río Ebro. Emocionado. 🌉',                '2024-02-15 10:45:00', 13),
  (19, 19, 'Función de ballet en el Teatro Real. He llorado al salir. Arte puro. 💃',         '2024-02-20 22:30:00', 28),
  (20, 20, 'He probado el mejor cocido madrileño de mi vida. 3 vuelcos. Soberbio. 🍽️',         '2024-02-25 14:00:00', 15),
  (21, 1,  'Refactorizando código de 2018. Aquel yo era valiente, pero poco elegante.',         '2024-03-01 11:00:00', 10),
  (22, 2,  'Hoy he releído "Cien años de soledad". Sigue震撼. 📖',                                '2024-03-05 16:30:00', 17),
  (23, 3,  'Reportaje fotográfico en la Alpujarra terminado. Una semana de caminar y disparar.','2024-03-10 19:00:00', 23),
  (24, 4,  'Single nuevo en Spotify. Electrónica con toques de piano. 🎹',                      '2024-03-15 13:15:00', 4),
  (25, 5,  'Mis alumnos de 4º han hecho una maqueta del sistema solar. ¡Brillantes!',          '2024-03-20 09:30:00', 21),
  (26, 6,  'Aprobado el primer parcial de Cálculo. Las mates se pueden. ¡A por el segundo!',  '2024-03-25 18:00:00', 8),
  (27, 7,  'La receta perfecta de una tortilla española: huevos, patatas, cariño. 🍳',          '2024-04-01 12:45:00', 26),
  (28, 8,  'Etapa reina del Camino de Santiago: O Cebreiro a Triacastela. Lluvia y barro. 🥾','2024-04-08 20:30:00', 19),
  (29, 9,  'Vacunación masiva en el centro de salud. 200 personas en una mañana. 💉',          '2024-04-15 14:00:00', 12),
  (30, 10, 'Entrevista exclusiva con el seleccionador. Sale el viernes. 📺',                    '2024-04-22 10:30:00', 7),
  (31, 11, 'Refactorizando el onboarding de nuestra app. Menos pasos, más claridad.',          '2024-05-01 11:15:00', 14),
  (32, 12, 'Olimpiada matemática regional. Mis 3 alumnos han pasado a la nacional. 🎉',        '2024-05-08 16:45:00', 30),
  (33, 13, 'Taller de gestión emocional para padres. Lleno absoluto. ❤️',                       '2024-05-15 19:30:00', 25),
  (34, 14, 'He sobrevolado los Andes. La cordillera te hace sentir pequeño. Increíble.',      '2024-05-22 08:00:00', 35),
  (35, 15, 'Pro bono: defenderé el caso de una asociación de vecinos. Justicia gratuita.',    '2024-05-28 13:00:00', 11),
  (36, 16, 'Pivotamos el negocio. El mercado nos ha dado una pista, la seguimos.',             '2024-06-05 17:00:00', 6),
  (37, 17, 'Campaña de esterilización gratuita en el barrio. 40 animales en un día. 🐶',      '2024-06-12 21:30:00', 38),
  (38, 18, 'Inauguración del puente. 4 años de obra. Ha merecido la pena. 🌉',                  '2024-06-20 11:00:00', 22),
  (39, 19, 'Audiciones para el nuevo espectáculo. Nervios y mucha emoción. 🎭',                '2024-06-28 18:30:00', 17),
  (40, 20, 'Ruta de tapas por el Barrio de las Letras. 5 bares, 5 estrellas. 🍷',              '2024-07-05 22:00:00', 29);

-- ────────────────────────────────────────────────────────────────────
--  Datos: comentarios (80) — 2 por publicación de media
-- ────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO comentarios (id, publicacion_id, usuario_id, contenido, fecha) VALUES
  (1,  1,  2,  '¡Enhorabuena! Rust tiene una curva de aprendizaje brutal pero merece la pena.',  '2024-01-05 10:30:00'),
  (2,  1,  6,  '¿Qué stack usaste? Tengo curiosidad por empezar.',                                '2024-01-05 11:15:00'),
  (3,  2,  3,  'No puedo esperar a leerlo. ¿Cuándo lo publicas?',                                 '2024-01-06 13:00:00'),
  (4,  2,  5,  'La disciplina de escribir cada día es admirable. Ánimo.',                          '2024-01-06 14:00:00'),
  (5,  3,  1,  'Espectacular la luz de esa hora. Fotografía pura.',                               '2024-01-07 19:45:00'),
  (6,  3,  11, '¿Equipo? ¿O solo móvil?',                                                         '2024-01-07 20:00:00'),
  (7,  4,  10, 'Suena increíble. ¿Lo podemos escuchar en alguna plataforma?',                    '2024-01-08 22:30:00'),
  (8,  4,  9,  'La música del Cantábrico tiene algo especial. Cuidadoso.',                       '2024-01-09 08:00:00'),
  (9,  5,  7,  'Qué buena idea. La experimentación engancha mucho más.',                          '2024-01-10 09:30:00'),
  (10, 5,  13, 'Eres una profesora increíble. Tus alumnos tienen suerte.',                       '2024-01-10 10:00:00'),
  (11, 6,  12, 'Las mates se entienden mejor con buenos apuntes. Bien ahí.',                     '2024-01-12 14:45:00'),
  (12, 6,  4,  'Visualizar las mates es el truco. Buen consejo.',                                 '2024-01-12 15:00:00'),
  (13, 7,  17, 'Una masa madre de 5 años es patrimonio familiar. Enhorabuena.',                 '2024-01-14 19:00:00'),
  (14, 7,  20, '¿Cuál es el secreto para mantenerla viva? Yo llevo 2 años y me cuesta.',          '2024-01-14 19:30:00'),
  (15, 8,  19, 'El Teide es de otro planeta. ¿Cuántos kilómetros en total?',                     '2024-01-15 20:30:00'),
  (16, 8,  14, 'Yo lo hice en 8 horas. Las vistas a 3.000m no se olvidan.',                       '2024-01-15 21:00:00'),
  (17, 9,  13, 'Totalmente de acuerdo. Cuidarse es un acto de valentía.',                          '2024-01-17 12:00:00'),
  (18, 9,  15, 'Gracias por visibilizar el tema. Hace falta.',                                    '2024-01-17 12:30:00'),
  (19, 10, 16, 'El arbitraje siempre protagonista. Cansa.',                                       '2024-01-19 23:45:00'),
  (20, 10, 8,  'Pero el partido fue épico. Eso no se lo quita nadie.',                            '2024-01-20 00:00:00'),
  (21, 11, 1,  'Me encanta el minimalismo. Limpio y funcional.',                                  '2024-01-22 16:30:00'),
  (22, 11, 5,  '¿Está en Figma? Me gustaría ver el flujo.',                                       '2024-01-22 17:00:00'),
  (23, 12, 6,  '¿370? Pensé que eran menos. Las mates no dejan de sorprender.',                  '2024-01-25 10:45:00'),
  (24, 12, 9,  'Las mates son el lenguaje del universo.',                                          '2024-01-25 11:00:00'),
  (25, 13, 18, 'Eso es lo bonito de la medicina. Siempre aprendes.',                              '2024-01-28 13:30:00'),
  (26, 13, 5,  'Qué bonito compartir esa reflexión. Gracias por tu trabajo.',                     '2024-01-28 14:00:00'),
  (27, 14, 8,  'Poder cruzar el Atlántico por trabajo es un privilegio.',                         '2024-02-01 09:00:00'),
  (28, 14, 19, 'Las nubes desde arriba parecen un mar. ¿Verdad?',                                  '2024-02-01 09:30:00'),
  (29, 15, 17, 'Enhorabuena al equipo. 3 años de lucha tienen su recompensa.',                     '2024-02-05 12:30:00'),
  (30, 15, 3,  'Justicia es lo que necesitamos más. Gracias por defenderlo.',                    '2024-02-05 13:00:00'),
  (31, 16, 11, '¿Qué hace diferente a la app? Tengo curiosidad.',                                 '2024-02-08 18:00:00'),
  (32, 16, 2,  'La probaré. ¿Está en iOS también?',                                              '2024-02-08 18:30:00'),
  (33, 17, 8,  'Esos pequeños milagros diarios. Qué profesión.',                                  '2024-02-12 21:30:00'),
  (34, 17, 20, 'Los golden retriever son los mejores. Me alegro.',                                '2024-02-12 22:00:00'),
  (35, 18, 14, '4 años de obra dan para muchas anécdotas. ¿Cuántos trabajadores?',               '2024-02-15 11:15:00'),
  (36, 18, 6,  'Una infraestructura así cambia la vida de la comarca.',                           '2024-02-15 11:30:00'),
  (37, 19, 4,  'El Teatro Real es magia. Qué función?',                                           '2024-02-20 23:00:00'),
  (38, 19, 13, 'Bailar así es un don. Enhorabuena.',                                               '2024-02-20 23:30:00'),
  (39, 20, 7,  '¿Cuál es el restaurante? No me digas que es secreto.',                            '2024-02-25 14:30:00'),
  (40, 20, 17, 'Un cocido bien hecho es arte. Bravo.',                                             '2024-02-25 15:00:00'),
  (41, 21, 6,  'Refactorizar código antiguo es como releer un diario personal.',                   '2024-03-01 11:30:00'),
  (42, 21, 11, 'La deuda técnica es un tema pendiente. Buen post.',                                '2024-03-01 12:00:00'),
  (43, 22, 5,  'Una obra que nunca caduca. Cada lectura es nueva.',                               '2024-03-05 17:00:00'),
  (44, 22, 9,  'Releyendo clásicos siempre se descubre algo nuevo.',                              '2024-03-05 17:30:00'),
  (45, 23, 1,  'La Alpujarra en invierno tiene una luz única.',                                    '2024-03-10 19:30:00'),
  (46, 23, 14, 'El barranco de Poqueira es imprescindible.',                                       '2024-03-10 20:00:00'),
  (47, 24, 8,  'La electrónica con piano me tiene俘. Pásame el enlace.',                         '2024-03-15 13:45:00'),
  (48, 24, 4,  '¡Gracias! Está en mi perfil de Spotify. Aclamaciones.',                            '2024-03-15 14:00:00'),
  (49, 25, 12, 'La maqueta del sistema solar me hizo aprender mucho. Genial.',                  '2024-03-20 10:00:00'),
  (50, 25, 7,  'Los profes que motivan dejan huella. Tú eres uno.',                                '2024-03-20 10:30:00'),
  (51, 26, 12, 'A por ese segundo parcial. Ánimo.',                                                '2024-03-25 18:30:00'),
  (52, 26, 5,  'Las mates con buena base se disfrutan. Adelante.',                                '2024-03-25 19:00:00'),
  (53, 27, 17, 'La tortilla española es un tema serio. ¿Con o sin cebolla?',                      '2024-04-01 13:15:00'),
  (54, 27, 20, 'Con cebolla siempre. Debate cerrado.',                                            '2024-04-01 13:30:00'),
  (55, 28, 19, 'El Camino es una experiencia que cambia. Bien hecho.',                             '2024-04-08 21:00:00'),
  (56, 28, 6,  '¿Cuántas etapas llevas en total?',                                                 '2024-04-08 21:30:00'),
  (57, 29, 13, 'La salud pública es el pilar de todo. Gracias por tu trabajo.',                    '2024-04-15 14:30:00'),
  (58, 29, 18, '200 personas en una mañana. Eficiencia pura.',                                     '2024-04-15 15:00:00'),
  (59, 30, 4,  'No me la pierdo. ¿A qué hora la emiten?',                                          '2024-04-22 11:00:00'),
  (60, 30, 19, 'Los periodistas deportivos curráis mucho. Ánimo.',                                  '2024-04-22 11:30:00'),
  (61, 31, 5,  'Onboarding claro = usuarios felices. Bien pensado.',                              '2024-05-01 11:45:00'),
  (62, 31, 1,  '¿Cuántos pasos tiene ahora? Para tener una referencia.',                           '2024-05-01 12:00:00'),
  (63, 32, 6,  '¡Qué orgullosa debes estar! Mis alumnos también pasaron.',                         '2024-05-08 17:15:00'),
  (64, 32, 18, 'Las olimpiadas son para siempre. Marca en la vida.',                                '2024-05-08 17:30:00'),
  (65, 33, 9,  'Padres que aprenden a gestionar emociones = hijos más felices.',                  '2024-05-15 20:00:00'),
  (66, 33, 17, 'Habría llenado yo también. Tema importantísimo.',                                   '2024-05-15 20:30:00'),
  (67, 34, 19, 'Sobrevolarlos en avión tiene que ser indescriptible.',                              '2024-05-22 08:30:00'),
  (68, 34, 8,  'Yo los crucé a pie. Otra perspectiva igualmente brutal.',                          '2024-05-22 09:00:00'),
  (69, 35, 16, 'El pro bono dignifica la profesión. Gracias.',                                     '2024-05-28 13:30:00'),
  (70, 35, 3,  'La justicia no debería ser de pago. Ojalá más casos así.',                         '2024-05-28 14:00:00'),
  (71, 36, 11,  'Pivotar es de valientes. ¿Qué aprendisteis del mercado?',                          '2024-06-05 17:30:00'),
  (72, 36, 1,  'El feedback del mercado es oro. Buena suerte.',                                     '2024-06-05 18:00:00'),
  (73, 37, 8,  '40 esterilizaciones en un día. Eficiencia y vocación.',                             '2024-06-12 22:00:00'),
  (74, 37, 19,  'Las campañas barriales son las que cambian la realidad.',                          '2024-06-12 22:30:00'),
  (75, 38, 6,  'Una obra de 4 años debe ser un alivio inaugurarla.',                               '2024-06-20 11:30:00'),
  (76, 38, 14,  'Los ingenieros civiles dejáis huella para décadas.',                              '2024-06-20 12:00:00'),
  (77, 39, 4,  '¡Mucho ánimo en las audiciones! El escenario te espera.',                         '2024-06-28 19:00:00'),
  (78, 39, 5,  'La danza es disciplina y arte a partes iguales.',                                   '2024-06-28 19:30:00'),
  (79, 40, 7,  'El Barrio de las Letras siempre acierta. ¿Algún bar recomendado?',                 '2024-07-05 22:30:00'),
  (80, 40, 17,  'Tapas y literatura, combinación perfecta.',                                         '2024-07-05 23:00:00');

-- ────────────────────────────────────────────────────────────────────
--  Datos: likes (~150) — distribuidos entre las publicaciones
-- ────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO likes (id, publicacion_id, usuario_id, fecha) VALUES
  (1,  1,  2,  '2024-01-05 10:35:00'), (2,  1,  3,  '2024-01-05 10:40:00'),
  (3,  1,  6,  '2024-01-05 10:50:00'), (4,  1,  11, '2024-01-05 11:00:00'),
  (5,  1,  12, '2024-01-05 11:10:00'), (6,  1,  14, '2024-01-05 11:20:00'),
  (7,  1,  16, '2024-01-05 11:30:00'), (8,  1,  18, '2024-01-05 11:40:00'),
  (9,  1,  19, '2024-01-05 11:50:00'), (10, 1,  20, '2024-01-05 12:00:00'),
  (11, 1,  7,  '2024-01-05 12:10:00'), (12, 1,  4,  '2024-01-05 12:20:00'),
  (13, 2,  3,  '2024-01-06 12:35:00'), (14, 2,  4,  '2024-01-06 12:40:00'),
  (15, 2,  5,  '2024-01-06 12:45:00'), (16, 2,  6,  '2024-01-06 12:50:00'),
  (17, 2,  10, '2024-01-06 13:00:00'), (18, 2,  13, '2024-01-06 13:10:00'),
  (19, 2,  17, '2024-01-06 13:20:00'), (20, 2,  1,  '2024-01-06 13:30:00'),
  (21, 3,  1,  '2024-01-07 19:20:00'), (22, 3,  2,  '2024-01-07 19:25:00'),
  (23, 3,  4,  '2024-01-07 19:30:00'), (24, 3,  5,  '2024-01-07 19:35:00'),
  (25, 3,  6,  '2024-01-07 19:40:00'), (26, 3,  7,  '2024-01-07 19:45:00'),
  (27, 3,  8,  '2024-01-07 19:50:00'), (28, 3,  9,  '2024-01-07 19:55:00'),
  (29, 3,  10, '2024-01-07 20:00:00'), (30, 3,  11, '2024-01-07 20:05:00'),
  (31, 3,  12, '2024-01-07 20:10:00'), (32, 3,  13, '2024-01-07 20:15:00'),
  (33, 3,  14, '2024-01-07 20:20:00'), (34, 3,  15, '2024-01-07 20:25:00'),
  (35, 3,  16, '2024-01-07 20:30:00'), (36, 3,  17, '2024-01-07 20:35:00'),
  (37, 3,  18, '2024-01-07 20:40:00'), (38, 3,  19, '2024-01-07 20:45:00'),
  (39, 3,  20, '2024-01-07 20:50:00'), (40, 3,  3,  '2024-01-07 20:55:00'),
  (41, 3,  4,  '2024-01-07 21:00:00'), (42, 3,  5,  '2024-01-07 21:05:00'),
  (43, 3,  6,  '2024-01-07 21:10:00'), (44, 3,  7,  '2024-01-07 21:15:00'),
  (45, 3,  8,  '2024-01-07 21:20:00'), (46, 3,  1,  '2024-01-08 08:00:00'),
  (47, 4,  10, '2024-01-08 22:30:00'), (48, 4,  9,  '2024-01-09 08:00:00'),
  (49, 4,  19, '2024-01-09 09:00:00'), (50, 4,  8,  '2024-01-09 10:00:00'),
  (51, 4,  1,  '2024-01-09 11:00:00'),
  (52, 5,  7,  '2024-01-10 09:30:00'), (53, 5,  13, '2024-01-10 10:00:00'),
  (54, 5,  12, '2024-01-10 10:30:00'), (55, 5,  6,  '2024-01-10 11:00:00'),
  (56, 5,  3,  '2024-01-10 11:30:00'), (57, 5,  4,  '2024-01-10 12:00:00'),
  (58, 5,  1,  '2024-01-10 12:30:00'), (59, 5,  2,  '2024-01-10 13:00:00'),
  (60, 5,  8,  '2024-01-10 13:30:00'), (61, 5,  10, '2024-01-10 14:00:00'),
  (62, 5,  14, '2024-01-10 14:30:00'), (63, 5,  15, '2024-01-10 15:00:00'),
  (64, 5,  16, '2024-01-10 15:30:00'), (65, 5,  17, '2024-01-10 16:00:00'),
  (66, 5,  18, '2024-01-10 16:30:00'), (67, 5,  19, '2024-01-10 17:00:00'),
  (68, 5,  20, '2024-01-10 17:30:00'), (69, 5,  9,  '2024-01-10 18:00:00'),
  (70, 6,  12, '2024-01-12 14:45:00'), (71, 6,  4,  '2024-01-12 15:00:00'),
  (72, 6,  5,  '2024-01-12 15:30:00'), (73, 6,  11, '2024-01-12 16:00:00'),
  (74, 6,  1,  '2024-01-12 16:30:00'), (75, 6,  2,  '2024-01-12 17:00:00'),
  (76, 6,  3,  '2024-01-12 17:30:00'),
  (77, 7,  17, '2024-01-14 19:00:00'), (78, 7,  20, '2024-01-14 19:30:00'),
  (79, 7,  1,  '2024-01-14 20:00:00'), (80, 7,  2,  '2024-01-14 20:30:00'),
  (81, 7,  3,  '2024-01-14 21:00:00'), (82, 7,  4,  '2024-01-14 21:30:00'),
  (83, 7,  5,  '2024-01-14 22:00:00'), (84, 7,  6,  '2024-01-14 22:30:00'),
  (85, 7,  8,  '2024-01-14 23:00:00'), (86, 7,  9,  '2024-01-14 23:30:00'),
  (87, 7,  10, '2024-01-15 08:00:00'), (88, 7,  11, '2024-01-15 08:30:00'),
  (89, 7,  12, '2024-01-15 09:00:00'), (90, 7,  13, '2024-01-15 09:30:00'),
  (91, 8,  19, '2024-01-15 20:30:00'), (92, 8,  14, '2024-01-15 21:00:00'),
  (93, 8,  1,  '2024-01-15 21:30:00'), (94, 8,  2,  '2024-01-15 22:00:00'),
  (95, 8,  3,  '2024-01-15 22:30:00'), (96, 8,  4,  '2024-01-15 23:00:00'),
  (97, 8,  5,  '2024-01-15 23:30:00'), (98, 8,  6,  '2024-01-16 00:00:00'),
  (99, 8,  7,  '2024-01-16 08:00:00'), (100, 8, 9,  '2024-01-16 09:00:00'),
  (101, 8, 10, '2024-01-16 10:00:00'), (102, 8, 11, '2024-01-16 11:00:00'),
  (103, 8, 12, '2024-01-16 12:00:00'), (104, 8, 13, '2024-01-16 13:00:00'),
  (105, 8, 15, '2024-01-16 14:00:00'), (106, 8, 16, '2024-01-16 15:00:00'),
  (107, 8, 17, '2024-01-16 16:00:00'), (108, 8, 18, '2024-01-16 17:00:00'),
  (109, 8, 20, '2024-01-16 18:00:00'), (110, 8, 1,  '2024-01-16 19:00:00'),
  (111, 8, 2,  '2024-01-16 20:00:00'), (112, 8, 3,  '2024-01-16 21:00:00'),
  (113, 8, 4,  '2024-01-16 22:00:00'), (114, 8, 5,  '2024-01-16 23:00:00'),
  (115, 8, 6,  '2024-01-17 00:00:00'), (116, 8, 7,  '2024-01-17 01:00:00'),
  (117, 8, 9,  '2024-01-17 02:00:00'), (118, 8, 11, '2024-01-17 03:00:00'),
  (119, 8, 13, '2024-01-17 04:00:00'), (120, 8, 15, '2024-01-17 05:00:00'),
  (121, 8, 17, '2024-01-17 06:00:00'), (122, 9,  13, '2024-01-17 12:00:00'),
  (123, 9,  15, '2024-01-17 12:30:00'), (124, 9,  5,  '2024-01-17 13:00:00'),
  (125, 9,  6,  '2024-01-17 13:30:00'), (126, 9,  17, '2024-01-17 14:00:00'),
  (127, 9,  1,  '2024-01-17 14:30:00'), (128, 9,  2,  '2024-01-17 15:00:00'),
  (129, 9,  3,  '2024-01-17 15:30:00'), (130, 9,  4,  '2024-01-17 16:00:00'),
  (131, 9,  7,  '2024-01-17 16:30:00'), (132, 9,  8,  '2024-01-17 17:00:00'),
  (133, 9,  10, '2024-01-17 17:30:00'), (134, 9,  11, '2024-01-17 18:00:00'),
  (135, 9,  12, '2024-01-17 18:30:00'), (136, 9,  14, '2024-01-17 19:00:00'),
  (137, 9,  16, '2024-01-17 19:30:00'), (138, 9,  18, '2024-01-17 20:00:00'),
  (139, 9,  19, '2024-01-17 20:30:00'), (140, 9,  20, '2024-01-17 21:00:00'),
  (141, 9,  1,  '2024-01-17 21:30:00'), (142, 9,  2,  '2024-01-17 22:00:00'),
  (143, 9,  3,  '2024-01-18 08:00:00'), (144, 10, 16, '2024-01-19 23:45:00'),
  (145, 10, 8,  '2024-01-20 00:00:00'), (146, 10, 4,  '2024-01-20 08:00:00'),
  (147, 10, 19, '2024-01-20 09:00:00'), (148, 10, 11, '2024-01-20 10:00:00'),
  (149, 10, 1,  '2024-01-20 11:00:00'), (150, 10, 6,  '2024-01-20 12:00:00'),
  (151, 10, 12, '2024-01-20 13:00:00'), (152, 10, 14, '2024-01-20 14:00:00'),
  -- Más likes repartidos entre varias publicaciones
  (153, 11, 1,  '2024-01-22 16:30:00'), (154, 11, 2,  '2024-01-22 17:00:00'),
  (155, 11, 3,  '2024-01-22 17:30:00'), (156, 11, 4,  '2024-01-22 18:00:00'),
  (157, 11, 5,  '2024-01-22 18:30:00'), (158, 11, 6,  '2024-01-22 19:00:00'),
  (159, 11, 7,  '2024-01-22 19:30:00'), (160, 11, 8,  '2024-01-22 20:00:00'),
  (161, 11, 9,  '2024-01-22 20:30:00'), (162, 11, 10, '2024-01-22 21:00:00'),
  (163, 11, 12, '2024-01-22 21:30:00'), (164, 11, 13, '2024-01-22 22:00:00'),
  (165, 11, 15, '2024-01-22 22:30:00'), (166, 11, 17, '2024-01-22 23:00:00'),
  (167, 11, 18, '2024-01-22 23:30:00'), (168, 11, 20, '2024-01-23 00:00:00'),
  (169, 12, 1,  '2024-01-25 10:15:00'), (170, 12, 3,  '2024-01-25 10:30:00'),
  (171, 12, 5,  '2024-01-25 10:45:00'), (172, 12, 7,  '2024-01-25 11:00:00'),
  (173, 12, 9,  '2024-01-25 11:15:00'), (174, 12, 11, '2024-01-25 11:30:00'),
  (175, 12, 13, '2024-01-25 11:45:00'), (176, 12, 15, '2024-01-25 12:00:00'),
  (177, 12, 17, '2024-01-25 12:15:00'), (178, 12, 19, '2024-01-25 12:30:00'),
  (179, 12, 2,  '2024-01-25 12:45:00'), (180, 12, 4,  '2024-01-25 13:00:00'),
  (181, 12, 6,  '2024-01-25 13:15:00'), (182, 12, 8,  '2024-01-25 13:30:00'),
  (183, 12, 10, '2024-01-25 13:45:00'), (184, 12, 12, '2024-01-25 14:00:00'),
  (185, 12, 14, '2024-01-25 14:15:00'), (186, 12, 16, '2024-01-25 14:30:00'),
  (187, 12, 18, '2024-01-25 14:45:00'), (188, 12, 20, '2024-01-25 15:00:00'),
  (189, 13, 2,  '2024-01-28 13:30:00'), (190, 13, 4,  '2024-01-28 13:45:00'),
  (191, 13, 6,  '2024-01-28 14:00:00'), (192, 13, 8,  '2024-01-28 14:15:00'),
  (193, 13, 10, '2024-01-28 14:30:00'), (194, 13, 12, '2024-01-28 14:45:00'),
  (195, 13, 14, '2024-01-28 15:00:00'), (196, 13, 16, '2024-01-28 15:15:00'),
  (197, 13, 18, '2024-01-28 15:30:00'), (198, 13, 20, '2024-01-28 15:45:00'),
  (199, 13, 1,  '2024-01-28 16:00:00'), (200, 13, 3,  '2024-01-28 16:15:00'),
  (201, 13, 5,  '2024-01-28 16:30:00'), (202, 13, 7,  '2024-01-28 16:45:00'),
  (203, 13, 9,  '2024-01-28 17:00:00'),
  -- Más likes para otras publicaciones
  (204, 14, 1,  '2024-02-01 08:30:00'), (205, 14, 2,  '2024-02-01 09:00:00'),
  (206, 14, 3,  '2024-02-01 09:30:00'), (207, 14, 4,  '2024-02-01 10:00:00'),
  (208, 14, 5,  '2024-02-01 10:30:00'), (209, 14, 6,  '2024-02-01 11:00:00'),
  (210, 14, 7,  '2024-02-01 11:30:00'), (211, 14, 8,  '2024-02-01 12:00:00'),
  (212, 14, 9,  '2024-02-01 12:30:00'), (213, 14, 10, '2024-02-01 13:00:00'),
  (214, 14, 11, '2024-02-01 13:30:00'), (215, 14, 12, '2024-02-01 14:00:00'),
  (216, 14, 13, '2024-02-01 14:30:00'), (217, 14, 14, '2024-02-01 15:00:00'),
  (218, 14, 15, '2024-02-01 15:30:00'), (219, 14, 16, '2024-02-01 16:00:00'),
  (220, 14, 17, '2024-02-01 16:30:00'), (221, 14, 18, '2024-02-01 17:00:00'),
  (222, 14, 19, '2024-02-01 17:30:00'), (223, 14, 20, '2024-02-01 18:00:00'),
  (224, 15, 1,  '2024-02-05 12:30:00'), (225, 15, 2,  '2024-02-05 13:00:00'),
  (226, 15, 3,  '2024-02-05 13:30:00'), (227, 15, 4,  '2024-02-05 14:00:00'),
  (228, 15, 5,  '2024-02-05 14:30:00'), (229, 15, 6,  '2024-02-05 15:00:00'),
  (230, 15, 7,  '2024-02-05 15:30:00'), (231, 15, 8,  '2024-02-05 16:00:00'),
  (232, 15, 9,  '2024-02-05 16:30:00'), (233, 15, 10, '2024-02-05 17:00:00'),
  (234, 15, 11, '2024-02-05 17:30:00'), (235, 15, 12, '2024-02-05 18:00:00'),
  (236, 15, 13, '2024-02-05 18:30:00'), (237, 15, 14, '2024-02-05 19:00:00'),
  (238, 15, 15, '2024-02-05 19:30:00'), (239, 15, 16, '2024-02-05 20:00:00'),
  (240, 15, 17, '2024-02-05 20:30:00'), (241, 15, 18, '2024-02-05 21:00:00'),
  (242, 15, 19, '2024-02-05 21:30:00'), (243, 15, 20, '2024-02-05 22:00:00'),
  (244, 16, 1,  '2024-02-08 18:00:00'), (245, 16, 2,  '2024-02-08 18:30:00'),
  (246, 16, 3,  '2024-02-08 19:00:00'), (247, 16, 4,  '2024-02-08 19:30:00'),
  (248, 16, 5,  '2024-02-08 20:00:00'), (249, 16, 6,  '2024-02-08 20:30:00'),
  (250, 16, 7,  '2024-02-08 21:00:00'), (251, 16, 8,  '2024-02-08 21:30:00'),
  (252, 16, 9,  '2024-02-08 22:00:00'), (253, 16, 10, '2024-02-08 22:30:00'),
  (254, 16, 11, '2024-02-08 23:00:00'), (255, 16, 12, '2024-02-09 00:00:00'),
  (256, 16, 13, '2024-02-09 01:00:00'), (257, 16, 14, '2024-02-09 02:00:00'),
  (258, 16, 15, '2024-02-09 03:00:00'), (259, 16, 16, '2024-02-09 04:00:00'),
  (260, 16, 17, '2024-02-09 05:00:00'), (261, 16, 18, '2024-02-09 06:00:00'),
  (262, 16, 19, '2024-02-09 07:00:00'), (263, 16, 20, '2024-02-09 08:00:00');
`,
}
