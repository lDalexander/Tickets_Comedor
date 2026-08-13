-- Migración 002: Sacar IDs de usuarios especiales del código a la BD
-- Ejecutar como: mysql -u admin -p control_comedor < 002_add_tipo_especial.sql

ALTER TABLE usuarios
  ADD COLUMN tipo_especial VARCHAR(20) NULL DEFAULT NULL
  COMMENT 'NULL=normal, VIP=sin anti-rebote, GERENCIA=ticket especial';

-- Migrar los IDs hardcodeados del worker Python
-- Ajusta los valores de cedula si los IDs reales son distintos
UPDATE usuarios SET tipo_especial = 'VIP'      WHERE zk_id IN ('14', '27');
UPDATE usuarios SET tipo_especial = 'GERENCIA'  WHERE zk_id IN ('16', '119', '120');

-- Verificar resultado
SELECT zk_id, nombre_completo, tipo_especial
FROM usuarios
WHERE tipo_especial IS NOT NULL
ORDER BY tipo_especial;
