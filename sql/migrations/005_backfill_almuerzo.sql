-- Migración 005: Reconstrucción histórica de sesiones de almuerzo
-- Ejecutar como: mysql -u admin -p control_comedor < 005_backfill_almuerzo.sql
--
-- CONTEXTO Y ADVERTENCIA
-- ---------------------
-- Antes de la migración 004 el sistema no medía el tiempo de almuerzo: la segunda
-- marcación del día se guardaba como 'INTENTO DE DUPLICADO'. Este script reinterpreta
-- esos duplicados como retornos para tener histórico desde el día uno.
--
-- La distribución de los tiempos respalda esa lectura pero NO la prueba. Medida
-- sobre los datos existentes, la diferencia entre el ticket y el duplicado es
-- bimodal:
--     0-2 min ...... 219 casos   <- rebote o reintento, NO es un retorno
--     2-8 min ......  70 casos   <- reintento tardío
--     8-25 min .....  43 casos   <- zona ambigua (el valle entre las dos modas)
--     25-35 min .... 276 casos   <- retorno típico
--     35-50 min .... 171 casos
--     50+ min ......  75 casos   <- dudoso como "retorno de almuerzo"
--
-- El umbral de 8 minutos (`almuerzo_retorno_min_minutos`) cae en el valle y separa
-- bien las dos poblaciones. Aun así, esas personas nunca marcaron con la intención
-- de registrar un retorno: los datos reconstruidos sirven como referencia y para
-- ver tendencias, NO como evidencia para una sanción individual.
--
-- Por eso cada sesión queda etiquetada en la columna `origen`:
--     BIOMETRICO -> medida en vivo por el worker (dato confiable)
--     BACKFILL   -> reconstruida por este script (dato inferido)
--
-- Es idempotente: las sesiones existentes no se tocan (ON DUPLICATE KEY no-op),
-- así que puede re-ejecutarse sin duplicar ni sobrescribir lo medido en vivo.

-- ── 1. Columna de procedencia ─────────────────────────────────────────────
-- Desde la corrección de la migración 004 la columna ya viene en el CREATE TABLE.
-- Este bloque solo cubre las instalaciones que aplicaron 004 antes de ese cambio.
-- MySQL no soporta ADD COLUMN IF NOT EXISTS: se hace condicional para que el
-- script se pueda re-ejecutar.
SET @existe_origen = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'almuerzo_sesiones'
       AND COLUMN_NAME = 'origen'
);
SET @sql_origen = IF(@existe_origen = 0,
    "ALTER TABLE almuerzo_sesiones
       ADD COLUMN origen ENUM('BIOMETRICO','BACKFILL') NOT NULL DEFAULT 'BIOMETRICO'
       COMMENT 'BIOMETRICO = medido en vivo / BACKFILL = inferido de duplicados historicos'
       AFTER estado",
    "SELECT 'La columna origen ya existe' AS aviso");
PREPARE stmt FROM @sql_origen;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── 2. Parámetros, leídos de la configuración vigente ─────────────────────
SET @limite_seg = (
    SELECT (CAST(COALESCE(MAX(CASE WHEN clave='almuerzo_minutos_permitidos'  THEN valor END), '30') AS SIGNED)
          + CAST(COALESCE(MAX(CASE WHEN clave='almuerzo_tolerancia_minutos' THEN valor END), '0')  AS SIGNED)) * 60
      FROM configuracion
);
SET @min_retorno_seg = (
    SELECT CAST(COALESCE(MAX(CASE WHEN clave='almuerzo_retorno_min_minutos' THEN valor END), '8') AS SIGNED) * 60
      FROM configuracion
);
SET @excluidos = (
    SELECT COALESCE(MAX(CASE WHEN clave='almuerzo_excluir_ids' THEN valor END), '')
      FROM configuracion
);

SELECT @limite_seg AS limite_segundos, @min_retorno_seg AS minimo_retorno_segundos, @excluidos AS ids_excluidos;

-- ── 3. Reconstrucción ─────────────────────────────────────────────────────
-- Se usan tablas temporales indexadas en lugar de una subconsulta correlacionada:
-- `registros` no tiene índice por (user_id, fecha), así que emparejar 14k tickets
-- contra 16k registros fila por fila tardaba más de dos minutos. Con las temporales
-- el emparejamiento es un equi-join por (user_id, fecha) y baja a menos de un segundo.

DROP TEMPORARY TABLE IF EXISTS tmp_salidas;
DROP TEMPORARY TABLE IF EXISTS tmp_marcas;

-- Primera marcación de ticket de cada persona por día = salida al almuerzo
CREATE TEMPORARY TABLE tmp_salidas AS
SELECT p.user_id, p.nombre, p.fecha, p.hora_salida, p.tipo_ticket, p.numero_ticket
FROM (
    SELECT
        r.user_id, r.nombre, r.fecha,
        r.hora AS hora_salida, r.descripcion AS tipo_ticket, r.numero_ticket,
        -- Si hubo varios tickets el mismo día, la salida es el primero
        ROW_NUMBER() OVER (PARTITION BY r.user_id, r.fecha ORDER BY r.hora ASC) AS rn
    FROM registros r
    WHERE r.descripcion IN ('TICKET ALMUERZO', 'Ticket Almuerzo',
                            'TICKET DIETA',    'Ticket Dieta',
                            'TICKET GERENCIA')
      AND r.user_id NOT LIKE 'VISITA_%'
      -- El COLLATE es obligatorio: @excluidos sale de `configuracion` (utf8mb4_0900_ai_ci)
      -- y `registros` está en utf8mb4_general_ci; sin esto MySQL aborta con
      -- "Illegal mix of collations".
      AND NOT FIND_IN_SET(r.user_id, @excluidos COLLATE utf8mb4_general_ci)
) p
WHERE p.rn = 1;

ALTER TABLE tmp_salidas ADD KEY idx_user_fecha (user_id, fecha);

-- Candidatas a retorno: segundas marcaciones del día
CREATE TEMPORARY TABLE tmp_marcas AS
SELECT r.user_id, r.fecha, r.hora
FROM registros r
WHERE r.descripcion IN ('INTENTO DE DUPLICADO', 'Intento de Duplicado', 'RETORNO ALMUERZO')
  AND r.user_id NOT LIKE 'VISITA_%';

ALTER TABLE tmp_marcas ADD KEY idx_user_fecha (user_id, fecha);

INSERT INTO almuerzo_sesiones
    (user_id, nombre, fecha, hora_salida, hora_retorno, segundos_usados,
     estado, origen, tipo_ticket, numero_ticket, observacion)
SELECT
    t.user_id,
    t.nombre,
    t.fecha,
    t.hora_salida,
    t.hora_retorno,
    IF(t.hora_retorno IS NULL, NULL, TIME_TO_SEC(TIMEDIFF(t.hora_retorno, t.hora_salida))),
    CASE
        WHEN t.hora_retorno IS NULL THEN 'SIN_RETORNO'
        WHEN TIME_TO_SEC(TIMEDIFF(t.hora_retorno, t.hora_salida)) > @limite_seg THEN 'EXCEDIDO'
        ELSE 'A_TIEMPO'
    END,
    'BACKFILL',
    t.tipo_ticket,
    t.numero_ticket,
    'Retorno inferido de INTENTO DE DUPLICADO'
FROM (
    SELECT
        s.user_id, s.nombre, s.fecha, s.hora_salida, s.tipo_ticket, s.numero_ticket,
        -- Primera marcación posterior al umbral: la candidata a retorno
        MIN(CASE WHEN TIME_TO_SEC(TIMEDIFF(m.hora, s.hora_salida)) >= @min_retorno_seg
                 THEN m.hora END) AS hora_retorno
    FROM tmp_salidas s
    JOIN tmp_marcas m ON m.user_id = s.user_id AND m.fecha = s.fecha
    GROUP BY s.user_id, s.nombre, s.fecha, s.hora_salida, s.tipo_ticket, s.numero_ticket
) t
-- Solo se cargan las sesiones con retorno detectado.
--
-- Reconstruir también las salidas sin segunda marcación añadiría ~13.700 filas
-- SIN_RETORNO que NO son incumplimientos: antes de este módulo nadie pedía marcar
-- al volver, y solo ~4 personas al día de ~110 lo hacían por su cuenta. Cargarlas
-- distorsionaría los promedios del panel y del reporte con una falta que no existió.
WHERE t.hora_retorno IS NOT NULL
ON DUPLICATE KEY UPDATE almuerzo_sesiones.id = almuerzo_sesiones.id;

DROP TEMPORARY TABLE IF EXISTS tmp_salidas;
DROP TEMPORARY TABLE IF EXISTS tmp_marcas;

-- ── 4. Verificación ───────────────────────────────────────────────────────
SELECT origen, estado, COUNT(*) AS cantidad
  FROM almuerzo_sesiones
 GROUP BY origen, estado
 ORDER BY origen, estado;

SELECT
    MIN(fecha) AS desde, MAX(fecha) AS hasta,
    COUNT(*) AS sesiones,
    SUM(hora_retorno IS NOT NULL) AS con_retorno,
    ROUND(AVG(CASE WHEN hora_retorno IS NOT NULL THEN minutos_usados END), 1) AS promedio_min
  FROM almuerzo_sesiones;
