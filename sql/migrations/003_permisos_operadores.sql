-- Migración 003: Permisos granulares para operadores (usuarios_impresion_manual)
-- Ejecutar como: mysql -u admin -p control_comedor < 003_permisos_operadores.sql
--
-- Modelo de permisos (lista separada por comas en la columna `permisos`):
--   superadmin -> acceso total; NO se puede borrar desde el panel (solo desde la BD)
--   admin      -> acceso al panel /admin-v2
--   visita     -> imprimir tickets de visita  (/api/manual-tickets/print)
--   tercero    -> imprimir tickets a terceros (/api/manual-tickets/print-tercero)

ALTER TABLE usuarios_impresion_manual
  ADD COLUMN permisos VARCHAR(255) NOT NULL DEFAULT ''
  COMMENT 'Lista separada por comas: superadmin,admin,visita,tercero';

-- Poblar conservando lo que cada usuario puede hacer hoy.
-- Hoy cualquier usuario activo puede imprimir visita y tercero (el login manual
-- solo valida `activo`), así que todos conservan visita,tercero.
UPDATE usuarios_impresion_manual
  SET permisos = 'visita,tercero';

-- Los que ya tenían rol admin conservan además acceso al panel.
UPDATE usuarios_impresion_manual
  SET permisos = 'admin,visita,tercero'
  WHERE rol = 'admin';

-- Super administrador (John Garcia). No se podrá borrar desde el panel.
UPDATE usuarios_impresion_manual
  SET permisos = 'superadmin,admin,visita,tercero'
  WHERE username = 'agarcia';

-- Verificar resultado
SELECT id, username, nombre_real, rol, activo, permisos
FROM usuarios_impresion_manual
ORDER BY id;
