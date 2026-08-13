-- Migración 006: Zonas de trabajo y control de almuerzo por zona
-- Ejecutar como: mysql -u admin -p control_comedor < 006_zonas_almuerzo.sql
--
-- Agrega `usuarios.zona` para clasificar a cada empleado por área de trabajo y
-- decidir a quién se le controla el tiempo de almuerzo. Los administrativos no
-- deben contabilizarse.
--
-- La columna es VARCHAR y no ENUM a propósito: así se puede agregar o quitar una
-- zona editando `almuerzo_zonas_disponibles` desde el panel, sin migrar el esquema.
--
-- NO se toca `usuarios.role` (Operativo/Administrativo): ese campo lo usa la
-- pantalla de selección de menú (con rol Administrativo se puede elegir menú por
-- día) y es independiente de la zona.

-- ── 1. Columna `zona` ─────────────────────────────────────────────────────
-- MySQL no soporta ADD COLUMN IF NOT EXISTS: se hace condicional para poder
-- re-ejecutar el script.
SET @existe_zona = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'usuarios'
       AND COLUMN_NAME = 'zona'
);
SET @sql_zona = IF(@existe_zona = 0,
    "ALTER TABLE usuarios
       ADD COLUMN zona VARCHAR(20) NULL DEFAULT NULL
       COMMENT 'Area de trabajo. NULL = sin clasificar. Ver almuerzo_zonas_disponibles'
       AFTER role",
    "SELECT 'La columna zona ya existe' AS aviso");
PREPARE stmt FROM @sql_zona;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Índice para los filtros por zona del panel
SET @existe_idx = (
    SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'usuarios'
       AND INDEX_NAME = 'idx_usuarios_zona'
);
SET @sql_idx = IF(@existe_idx = 0,
    "ALTER TABLE usuarios ADD KEY idx_usuarios_zona (zona)",
    "SELECT 'El indice idx_usuarios_zona ya existe' AS aviso");
PREPARE stmt FROM @sql_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── 2. Parámetros de configuración ────────────────────────────────────────
INSERT INTO `configuracion` (`clave`, `valor`) VALUES
  ('almuerzo_zonas_disponibles', 'BODEGA,LOGISTICA,SOLIDO,LIQUIDO,SOPLADO,MANTENIMIENTO,ADMINISTRATIVOS'),
  ('almuerzo_zonas_controladas', 'SOLIDO,LIQUIDO,SOPLADO,MANTENIMIENTO'),
  ('almuerzo_controlar_sin_zona', 'true')
ON DUPLICATE KEY UPDATE `clave` = `clave`;

-- Referencia:
--   almuerzo_zonas_disponibles   Catálogo de zonas que ofrece el selector del panel.
--   almuerzo_zonas_controladas   Subconjunto al que SÍ se le mide el tiempo de almuerzo.
--   almuerzo_controlar_sin_zona  Qué hacer con quien todavía no tiene zona asignada.
--                                'true'  = se le controla (no se apaga la medición
--                                          mientras se clasifica a la gente).
--                                'false' = solo se mide a quien tenga zona controlada.

-- ── 3. Sembrado inicial ───────────────────────────────────────────────────
-- Los administrativos se deducen del `role` que ya existe: es información
-- confiable y son justamente los que no deben contabilizarse. Los operativos
-- quedan sin zona (NULL) porque su área concreta no se puede inferir de la BD:
-- hay que clasificarlos desde el panel AdminV2 -> Zonas.
UPDATE usuarios
   SET zona = 'ADMINISTRATIVOS'
 WHERE role = 'Administrativo'
   AND (zona IS NULL OR zona = '');

-- ── 4. Verificación ───────────────────────────────────────────────────────
SELECT COALESCE(zona, '(sin zona)') AS zona, COUNT(*) AS empleados
  FROM usuarios
 GROUP BY zona
 ORDER BY empleados DESC;

SELECT clave, valor FROM configuracion WHERE clave LIKE 'almuerzo_zona%' OR clave = 'almuerzo_controlar_sin_zona';
