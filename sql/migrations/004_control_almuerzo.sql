-- Migración 004: Control de tiempo de almuerzo (doble marcación en el biométrico)
-- Ejecutar como: mysql -u admin -p control_comedor < 004_control_almuerzo.sql
--
-- Modelo:
--   1ª marcación del día -> imprime ticket y ABRE una sesión (hora_salida).
--   2ª marcación del día -> si pasaron al menos `almuerzo_retorno_min_minutos`,
--                           es RETORNO: cierra la sesión y calcula el tiempo usado.
--                           Si pasó menos, sigue siendo INTENTO DE DUPLICADO
--                           (alguien reintentando porque no salió el ticket).
--   3ª marcación en adelante -> INTENTO DE DUPLICADO (la sesión ya está cerrada).
--
-- El tiempo se guarda en SEGUNDOS porque el límite de 30 min es estricto:
-- un retorno a 30:40 debe contar como excedido, y TIMESTAMPDIFF(MINUTE) lo
-- truncaría a 30. `minutos_usados` es una columna generada solo para lectura.

-- Sobre la colación: se fija utf8mb4_general_ci y NO el default utf8mb4_0900_ai_ci
-- de la base. Las tablas `registros` y `usuarios` vienen del dump antiguo en
-- general_ci, y con una colación distinta cualquier JOIN contra ellas aborta con
-- "Illegal mix of collations" (el backfill de la migración 005 es justamente ese JOIN).
CREATE TABLE IF NOT EXISTS `almuerzo_sesiones` (
  `id`              INT AUTO_INCREMENT PRIMARY KEY,
  `user_id`         VARCHAR(50)  NOT NULL,
  `nombre`          VARCHAR(150) DEFAULT NULL,
  `fecha`           DATE         NOT NULL,
  `hora_salida`     TIME         NOT NULL COMMENT 'Marcación 1: impresión del ticket',
  `hora_retorno`    TIME         DEFAULT NULL COMMENT 'Marcación 2: regreso del almuerzo',
  `segundos_usados` INT          DEFAULT NULL COMMENT 'hora_retorno - hora_salida, en segundos',
  `minutos_usados`  INT AS (FLOOR(`segundos_usados` / 60)) STORED,
  `tipo_ticket`     VARCHAR(50)  DEFAULT NULL COMMENT 'TICKET ALMUERZO / DIETA / GERENCIA',
  `numero_ticket`   INT          DEFAULT NULL,
  `estado`          ENUM('EN_ALMUERZO','A_TIEMPO','EXCEDIDO','SIN_RETORNO')
                    NOT NULL DEFAULT 'EN_ALMUERZO',
  `origen`          ENUM('BIOMETRICO','BACKFILL') NOT NULL DEFAULT 'BIOMETRICO'
                    COMMENT 'BIOMETRICO = medido en vivo / BACKFILL = inferido del historico (ver 005)',
  `cierre_manual`   TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 = cerrada por un admin, no por el biométrico',
  `observacion`     VARCHAR(255) DEFAULT NULL,
  `creado_en`       TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en`  TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_user_fecha` (`user_id`, `fecha`),
  KEY `idx_fecha_estado` (`fecha`, `estado`),
  KEY `idx_fecha_minutos` (`fecha`, `minutos_usados`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Corrige instalaciones donde la tabla se creó con la colación por defecto de la
-- base antes de que se detectara el problema. Idempotente: si ya está en
-- general_ci, MySQL no cambia nada.
ALTER TABLE `almuerzo_sesiones` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- Parámetros del módulo. INSERT idempotente: si la clave ya existe no se pisa
-- el valor que el admin haya ajustado desde el panel.
INSERT INTO `configuracion` (`clave`, `valor`) VALUES
  ('almuerzo_control_activo',       'true'),
  ('almuerzo_minutos_permitidos',   '30'),
  ('almuerzo_tolerancia_minutos',   '0'),
  ('almuerzo_retorno_min_minutos',  '8'),
  ('almuerzo_horario_fin_retorno',  '15:30'),
  ('almuerzo_excluir_ids',          '14,27'),
  ('almuerzo_email_activo',         'true'),
  ('almuerzo_email_destinos',       'agarcia@detcuador.com')
ON DUPLICATE KEY UPDATE `clave` = `clave`;

-- Referencia de cada clave:
--   almuerzo_control_activo      true/false. Interruptor maestro. En false el worker
--                                se comporta como antes (2ª marcación = duplicado).
--   almuerzo_minutos_permitidos  Minutos concedidos para almorzar.
--   almuerzo_tolerancia_minutos  Gracia extra antes de marcar EXCEDIDO. 0 = estricto.
--   almuerzo_retorno_min_minutos Umbral que separa un retorno real de un reintento.
--   almuerzo_horario_fin_retorno Hasta qué hora se aceptan retornos, más allá de
--                                `horario_fin`. Sin esto, quien saca ticket a las
--                                13:50 y vuelve a las 14:25 no quedaría registrado.
--   almuerzo_excluir_ids         IDs sin control de tiempo (VIPs con ticket extra).
--   almuerzo_email_activo        true/false para el reporte diario por correo.
--   almuerzo_email_destinos      Destinatarios separados por coma.

-- Verificar resultado
SELECT `clave`, `valor` FROM `configuracion` WHERE `clave` LIKE 'almuerzo_%' ORDER BY `clave`;
SHOW COLUMNS FROM `almuerzo_sesiones`;
