# Manual de Operaciones y Mantenimiento — SIGAC
## Sistema de Gestión de Acceso al Comedor — DETCUADOR S.A.

**Versión:** 3.2  
**Servidor:** `150.36.200.252` | Usuario: `john` | Proyecto: `/home/john/comedor/Tickets_Comedor/`  
**Última actualización:** Mayo 2026  
**Autor:** John Garcia  

---

## Índice

1. [Arquitectura de Servicios](#1-arquitectura-de-servicios)
2. [Verificación de Estado del Sistema](#2-verificación-de-estado-del-sistema)
3. [Arranque y Parada del Sistema](#3-arranque-y-parada-del-sistema)
4. [Despliegue de Actualizaciones](#4-despliegue-de-actualizaciones)
5. [Gestión de la Base de Datos](#5-gestión-de-la-base-de-datos)
6. [Gestión de Logs](#6-gestión-de-logs)
7. [Gestión de Usuarios del Sistema](#7-gestión-de-usuarios-del-sistema)
8. [Configuración del Horario de Servicio](#8-configuración-del-horario-de-servicio)
   - 8.1 [Control de Tiempo de Almuerzo](#81-control-de-tiempo-de-almuerzo)
9. [Gestión de Secretos y Credenciales](#9-gestión-de-secretos-y-credenciales)
10. [Tareas de Mantenimiento Periódico](#10-tareas-de-mantenimiento-periódico)
11. [Instalación desde Cero](#11-instalación-desde-cero)
12. [Migraciones de Base de Datos](#12-migraciones-de-base-de-datos)

---

## 1. Arquitectura de Servicios

El sistema corre como **4 servicios independientes**:

| Servicio | Proceso | Puerto | Gestión |
|---------|---------|--------|---------|
| `nginx` | Reverse proxy + static files | :5001 (público) | `sudo systemctl {cmd} nginx` |
| `comedor-backend` | Node.js Express API + Socket.IO | :5002 (localhost) | `sudo systemctl {cmd} comedor-backend` |
| `comedor-worker` | Python: biométrico + impresora | — | `sudo systemctl {cmd} comedor-worker` |
| `mysql` / `mariadb` | Base de datos MariaDB | :3306 (localhost) | `sudo systemctl {cmd} mysql` |

**Dependencia de arranque:** `mariadb` → `comedor-worker` → `comedor-backend` → `nginx`

Más dos tareas programadas (`oneshot`, no residentes):

| Temporizador | Cuándo | Qué hace |
|--------------|--------|----------|
| `comedor-maintenance.timer` | Diario 05:00 | Autodiagnóstico y reparación (`daily_maintenance.sh`) |
| `comedor-lunch-report.timer` | Lun–Vie 14:30 | Envía el reporte de tiempo de almuerzo por correo (§8.1) |

```bash
systemctl list-timers 'comedor-*' --all
```

---

## 2. Verificación de Estado del Sistema

### Estado de todos los servicios (comando rápido)

```bash
for svc in nginx comedor-backend comedor-worker mysql; do
    echo "=== $svc ==="; sudo systemctl is-active $svc; done
```

### Estado detallado

```bash
sudo systemctl status nginx
sudo systemctl status comedor-backend
sudo systemctl status comedor-worker
sudo systemctl status mysql
```

### Verificación de puertos

```bash
# Verificar que Nginx escucha en :5001
sudo ss -tlnp | grep 5001

# Verificar que Express escucha en :5002 (solo 127.0.0.1)
sudo ss -tlnp | grep 5002

# Verificar MariaDB en :3306
sudo ss -tlnp | grep 3306
```

### Health check vía API

```bash
# Debe responder {"status":"online",...}
curl -s http://localhost:5001/api/health

# Directo a Express (sin Nginx)
curl -s http://localhost:5002/api/health
```

### Verificar Nginx

```bash
sudo nginx -t          # verificar sintaxis de configuración
sudo nginx -T          # mostrar configuración completa parseada
```

---

## 3. Arranque y Parada del Sistema

### Reinicio completo del sistema (orden correcto)

```bash
sudo systemctl restart mysql
sleep 3
sudo systemctl restart comedor-worker
sudo systemctl restart comedor-backend
sudo systemctl reload nginx
```

### Reinicio solo del backend (más común)

```bash
sudo systemctl restart comedor-backend
# Verificar que arrancó correctamente
sudo journalctl -u comedor-backend -n 20
```

### Reinicio del worker Python

```bash
sudo systemctl restart comedor-worker
# Ver logs del worker
sudo journalctl -u comedor-worker -f
```

### Parada total (mantenimiento)

```bash
sudo systemctl stop comedor-worker
sudo systemctl stop comedor-backend
sudo systemctl stop nginx
# (No parar mysql a menos que sea necesario — tiene datos activos)
```

### Habilitar servicios para inicio automático con el sistema

```bash
sudo systemctl enable comedor-backend
sudo systemctl enable comedor-worker
sudo systemctl enable nginx
```

---

## 4. Despliegue de Actualizaciones

### 4.1 Actualización del Frontend (React)

El frontend compilado vive en `frontend/dist/`. Para actualizar:

```bash
cd /home/john/comedor/Tickets_Comedor

# 1. Descargar cambios del repositorio
git pull origin main

# 2. Instalar dependencias si cambiaron
cd frontend && npm install && cd ..

# 3. Compilar el build de producción
cd frontend && npm run build && cd ..

# 4. Recargar Nginx (solo para limpiar cache de proceso, los archivos ya están)
sudo systemctl reload nginx

echo "Frontend actualizado OK"
```

**Nota:** Nginx sirve directamente los archivos de `frontend/dist/`. El recargo de Nginx es instantáneo y sin downtime.

### 4.2 Actualización del Backend (Node.js)

```bash
cd /home/john/comedor/Tickets_Comedor

# 1. Descargar cambios
git pull origin main

# 2. Instalar dependencias si cambiaron
cd backend && npm install && cd ..

# 3. Reiniciar servicio (Express necesita reinicio para cargar nuevo código)
sudo systemctl restart comedor-backend

# 4. Verificar que arrancó sin errores
sudo journalctl -u comedor-backend -n 30
curl -s http://localhost:5002/api/health
```

**Tiempo de downtime:** ~2-5 segundos durante el reinicio.

### 4.3 Actualización del Worker Python

```bash
cd /home/john/comedor/Tickets_Comedor/backend/python_core

# 1. Actualizar dependencias Python si cambiaron
source venv/bin/activate
pip install -r requirements.txt
deactivate

# 2. Reiniciar servicio
sudo systemctl restart comedor-worker

# 3. Verificar que reconectó al biométrico
sudo journalctl -u comedor-worker -n 30
```

### 4.4 Script de despliegue frontend automatizado

```bash
bash /home/john/comedor/Tickets_Comedor/deploy_frontend.sh
```

Este script compila el frontend, actualiza `frontend/dist/` y recarga Nginx.

---

## 5. Gestión de la Base de Datos

### Acceso a MariaDB

```bash
# Acceso como admin del sistema
mysql -u admin -p control_comedor

# O desde root de MySQL
sudo mysql control_comedor
```

### Consultas de operación frecuentes

```sql
-- Ver registros de hoy
SELECT id, nombre, hora, descripcion, numero_ticket 
FROM registros 
WHERE fecha = CURDATE() 
ORDER BY id DESC;

-- Conteo por tipo hoy
SELECT descripcion, COUNT(*) as total 
FROM registros 
WHERE fecha = CURDATE() 
GROUP BY descripcion;

-- Ver usuarios especiales
SELECT zk_id, nombre_completo, tipo_especial 
FROM usuarios 
WHERE tipo_especial IS NOT NULL;

-- Ver configuración actual
SELECT * FROM configuracion;

-- Ver operadores activos
SELECT id, username, nombre_real, rol, activo 
FROM usuarios_impresion_manual;
```

### Backup manual

```bash
# Backup completo de la base de datos
DATE=$(date +%Y%m%d_%H%M%S)
mysqldump -u admin -p control_comedor > /home/john/backups/comedor_${DATE}.sql
echo "Backup guardado: /home/john/backups/comedor_${DATE}.sql"

# Restaurar desde backup
mysql -u admin -p control_comedor < /home/john/backups/comedor_YYYYMMDD_HHMMSS.sql
```

### Backup automático (si está configurado)

Revisar si existe cron para backup:
```bash
crontab -l
sudo crontab -l
```

---

## 6. Gestión de Logs

### Logs del backend (Node.js — Winston)

```bash
# Log de errores (solo nivel error)
tail -f /home/john/comedor/Tickets_Comedor/backend/logs/error.log

# Log completo (info + error)
tail -f /home/john/comedor/Tickets_Comedor/backend/logs/combined.log

# Ver últimas 50 líneas de errores
tail -50 /home/john/comedor/Tickets_Comedor/backend/logs/error.log

# Buscar errores de BD
grep "Database" /home/john/comedor/Tickets_Comedor/backend/logs/error.log | tail -20

# Ver logs en formato legible (JSON parseado)
tail -f /home/john/comedor/Tickets_Comedor/backend/logs/combined.log | python3 -c "
import sys, json
for line in sys.stdin:
    try:
        d = json.loads(line)
        print(f'{d[\"timestamp\"]} [{d[\"level\"]}] {d[\"message\"]}')
    except: print(line, end='')
"
```

### Logs del backend (systemd journal)

```bash
# Ver en tiempo real
sudo journalctl -u comedor-backend -f

# Ver últimas 100 líneas
sudo journalctl -u comedor-backend -n 100

# Ver logs de hoy
sudo journalctl -u comedor-backend --since today

# Ver logs de las últimas 2 horas
sudo journalctl -u comedor-backend --since "2 hours ago"

# Buscar errores específicos
sudo journalctl -u comedor-backend -p err --since today
```

### Logs del worker Python (systemd journal)

```bash
# Ver en tiempo real
sudo journalctl -u comedor-worker -f

# Ver con timestamps relativos
sudo journalctl -u comedor-worker -n 50 --no-hostname

# Buscar reconexiones al biométrico
sudo journalctl -u comedor-worker | grep -i "conectando\|conectado\|error conexión"
```

### Logs del worker Python (archivo)

```bash
# El worker escribe en comedor_worker.log (relativo a su WorkingDirectory)
tail -f /home/john/comedor/Tickets_Comedor/backend/python_core/comedor_worker.log
```

### Logs de Nginx

```bash
# Log de acceso
sudo tail -f /var/log/nginx/comedor-access.log

# Log de errores
sudo tail -f /var/log/nginx/comedor-error.log

# Ver las últimas peticiones a la API
sudo grep "/api/" /var/log/nginx/comedor-access.log | tail -20

# Ver errores 5xx de Nginx
sudo grep " 5[0-9][0-9] " /var/log/nginx/comedor-access.log | tail -20
```

### Rotación de logs

Los logs de Winston no tienen rotación automática configurada. Si crecen demasiado:

```bash
# Ver tamaño actual
du -sh /home/john/comedor/Tickets_Comedor/backend/logs/

# Truncar log combinado (conserva el archivo vacío)
> /home/john/comedor/Tickets_Comedor/backend/logs/combined.log

# Truncar log de errores
> /home/john/comedor/Tickets_Comedor/backend/logs/error.log

# No es necesario reiniciar — Winston reabre el archivo en el próximo write
```

---

## 7. Gestión de Usuarios del Sistema

### Crear un nuevo administrador (panel admin)

**Opción A — Vía Panel AdminV2:**
1. Acceder a `http://150.36.200.252:5001/admin-v2`
2. Login con credenciales de administrador
3. Ir a tabla `usuarios_impresion_manual`
4. Clic en "Agregar" → completar campos
5. El panel hashea automáticamente la contraseña

**Opción B — Vía SQL directo:**
```bash
# 1. Generar hash bcrypt desde Node
node -e "const bcrypt=require('bcrypt'); bcrypt.hash('nueva_contraseña',10).then(h=>console.log(h))"

# 2. Insertar en BD
mysql -u admin -p control_comedor <<EOF
INSERT INTO usuarios_impresion_manual (username, password_hash, nombre_real, rol, activo)
VALUES ('nuevo_admin', '\$2b\$10\$HASH_GENERADO', 'Nombre Completo', 'admin', 1);
EOF
```

### Cambiar contraseña de un admin

```bash
# Generar nuevo hash
HASH=$(node -e "const bcrypt=require('bcrypt'); bcrypt.hash('nueva_contraseña',10).then(h=>console.log(h))" \
    -e "")

# Actualizar en BD
mysql -u admin -p control_comedor -e "
UPDATE usuarios_impresion_manual 
SET password_hash = '$HASH' 
WHERE username = 'admin';"
```

### Desactivar un usuario sin eliminarlo

```bash
mysql -u admin -p control_comedor -e "
UPDATE usuarios_impresion_manual SET activo = 0 WHERE username = 'usuario_a_desactivar';"
```

### Añadir un usuario como VIP o Gerencia

```bash
# Marcar como VIP (puede comer dos veces)
mysql -u admin -p control_comedor -e "
UPDATE usuarios SET tipo_especial = 'VIP' WHERE zk_id = '27';"

# Marcar como Gerencia (menú especial)
mysql -u admin -p control_comedor -e "
UPDATE usuarios SET tipo_especial = 'GERENCIA' WHERE zk_id = '121';"

# Remover categoría especial
mysql -u admin -p control_comedor -e "
UPDATE usuarios SET tipo_especial = NULL WHERE zk_id = '121';"
```

**Importante:** Después de cambiar IDs especiales en BD, la caché del endpoint `/api/config/especiales` se invalida automáticamente en máximo 5 minutos. El worker Python, sin embargo, usa los valores hardcodeados en `database.py` hasta que se reinicie — ver deuda técnica en ARCHITECTURE.md.

---

## 8. Configuración del Horario de Servicio

El horario determina cuándo el sistema acepta eventos del biométrico y peticiones de impresión manual.

### Ver configuración actual

```bash
curl -s http://localhost:5001/api/config | python3 -m json.tool
```

### Actualizar horario vía API (requiere token admin)

```bash
# Obtener token primero
TOKEN=$(curl -s -X POST http://localhost:5001/api/admin/login \
    -H 'Content-Type: application/json' \
    -d '{"username":"admin","password":"TU_CONTRASEÑA"}' \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Activar horario 11:30 - 14:00
curl -s -X POST http://localhost:5001/api/config \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"horario_activo":"true","horario_inicio":"11:30","horario_fin":"14:00"}'

# Desactivar restricción de horario
curl -s -X POST http://localhost:5001/api/config \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"horario_activo":"false"}'
```

### Actualizar horario vía SQL directo

```bash
mysql -u admin -p control_comedor <<EOF
INSERT INTO configuracion (clave, valor) VALUES ('horario_activo', 'true')
    ON DUPLICATE KEY UPDATE valor = 'true';
INSERT INTO configuracion (clave, valor) VALUES ('horario_inicio', '11:30')
    ON DUPLICATE KEY UPDATE valor = '11:30';
INSERT INTO configuracion (clave, valor) VALUES ('horario_fin', '14:00')
    ON DUPLICATE KEY UPDATE valor = '14:00';
EOF
```

---

## 8.1 Control de Tiempo de Almuerzo

Mide cuánto tarda cada empleado en almorzar: la **primera** marcación del día imprime el ticket y registra la salida; la **segunda** registra el retorno. El tiempo permitido son 30 minutos estrictos.

### A quién se le controla: zonas de trabajo

Cada empleado tiene una `zona` (`usuarios.zona`, migración 006) y solo las zonas marcadas como controladas se contabilizan. Se administra en **AdminV2 → Zonas**.

| Zona | ¿Se contabiliza? |
|------|------------------|
| `SOLIDO`, `LIQUIDO`, `SOPLADO`, `MANTENIMIENTO` | Sí |
| `BODEGA`, `LOGISTICA`, `ADMINISTRATIVOS` | No |
| Sin zona asignada | Según `almuerzo_controlar_sin_zona` (hoy `true`) |

El worker descarta a alguien por tres motivos, en este orden:

1. `almuerzo_control_activo` está en `false` (apaga todo).
2. Su `zk_id` está en `almuerzo_excluir_ids` — override individual, manda sobre la zona.
3. Su zona no está en `almuerzo_zonas_controladas`.

Si `almuerzo_zonas_controladas` queda **vacía**, se mide a todos: así una configuración borrada por error no apaga el módulo en silencio.

En la sección Zonas se puede filtrar por zona (o por *sin asignar*), seleccionar varias personas con las casillas y asignarles zona de una sola vez. Cambiar **qué zonas se controlan** requiere cuenta superadmin y confirmar con *Guardar cambios*: afecta la medición de toda la planta.

Para agregar una zona nueva al catálogo, sin tocar código:

```bash
mysql -u admin -p control_comedor -e \
  "UPDATE configuracion SET valor = CONCAT(valor, ',PATIO') WHERE clave = 'almuerzo_zonas_disponibles';"
```

Si alguien queda con una zona que no está en el catálogo, la sección Zonas lo avisa como *zona huérfana* (no aparecería en el selector).

### Cómo se decide qué es un retorno

| Situación | Resultado |
|-----------|-----------|
| 1ª marcación del día | Imprime ticket y abre la sesión |
| 2ª marcación **antes** de `almuerzo_retorno_min_minutos` (8 min) | `INTENTO DE DUPLICADO`, no imprime. Se asume reintento porque el ticket no salió |
| 2ª marcación **después** del umbral | `RETORNO ALMUERZO`, cierra la sesión y calcula el tiempo. **No imprime nada** |
| 3ª marcación en adelante | `INTENTO DE DUPLICADO` (la sesión ya está cerrada) |

La ventana horaria del comedor (`horario_fin = 14:00`) **se extiende** hasta `almuerzo_horario_fin_retorno` (15:30) para quien tenga una salida abierta. Sin eso, quien saca ticket a las 13:50 y vuelve a las 14:25 no quedaría registrado.

### Ver y ajustar los parámetros

Todos viven en la tabla `configuracion` y son editables desde el panel AdminV2 → Configuración. Ver la lista completa en DICCIONARIO_BASE_DATOS.md §6.

```bash
mysql -u admin -p control_comedor -e \
  "SELECT clave, valor FROM configuracion WHERE clave LIKE 'almuerzo_%' ORDER BY clave;"
```

**Relajar el límite estricto** (ejemplo: dar 5 minutos de gracia, de modo que 34:59 aún cumpla):

```bash
mysql -u admin -p control_comedor -e \
  "UPDATE configuracion SET valor = '5' WHERE clave = 'almuerzo_tolerancia_minutos';"
```

El cambio aplica en menos de un minuto (el worker cachea la configuración 60 segundos) y **recalcula solo las sesiones nuevas**: las ya cerradas conservan el estado con que se guardaron.

### Apagar el módulo sin desplegar código

```bash
mysql -u admin -p control_comedor -e \
  "UPDATE configuracion SET valor = 'false' WHERE clave = 'almuerzo_control_activo';"
```

El worker vuelve al comportamiento anterior (la 2ª marcación es duplicado) en menos de un minuto, sin reiniciar nada. Es la vía de rollback. El panel muestra un aviso mientras está apagado.

### Reporte diario por correo

Lo envía `comedor-lunch-report.timer` de lunes a viernes a las 14:30, vía SMTP con las credenciales de `backend/python_core/.env`.

```bash
# Estado del temporizador y próximo disparo
systemctl list-timers comedor-lunch-report --all

# Ver qué pasó en el último envío
journalctl -u comedor-lunch-report -n 40 --no-pager

# Probar sin enviar: imprime el resumen y guarda el HTML en /tmp
cd /home/john/comedor/Tickets_Comedor/backend/python_core
./venv/bin/python send_lunch_report.py --fecha 2026-08-12 --dry-run

# Enviar manualmente el reporte de un día
./venv/bin/python send_lunch_report.py --fecha 2026-08-12

# Enviar a destinatarios puntuales, sin tocar la configuración
./venv/bin/python send_lunch_report.py --to jefe@detcuador.com,rrhh@detcuador.com
```

El correo trae la tabla del día más tres bloques: **excedieron**, **no marcaron el retorno** y **aún en almuerzo**. El tercero existe porque el correo sale a las 14:30 y el comedor cierra a las 14:00: quien sacó ticket a las 13:55 sigue dentro de su derecho de 30 minutos y no debe figurar como incumplimiento.

Para desactivar el envío sin borrar el timer:

```bash
mysql -u admin -p control_comedor -e \
  "UPDATE configuracion SET valor = 'false' WHERE clave = 'almuerzo_email_activo';"
```

### Sesiones que quedaron abiertas

Quien no marcó el retorno queda `EN_ALMUERZO` hasta que el mantenimiento de las 05:00 (paso `[3.1]` de `daily_maintenance.sh`) lo pasa a `SIN_RETORNO`. Se puede forzar:

```bash
cd /home/john/comedor/Tickets_Comedor/backend/python_core
./venv/bin/python cerrar_sesiones_almuerzo.py              # días anteriores a hoy
./venv/bin/python cerrar_sesiones_almuerzo.py 2026-08-12   # una fecha concreta
```

El panel no espera a ese cierre: deriva el estado en tiempo de consulta. El script solo normaliza lo que está guardado.

### Corregir a alguien que olvidó marcar

Desde el panel AdminV2 → Almuerzos, con cuenta **superadmin**, el botón **Cerrar** de la fila permite registrar la hora de retorno a mano. La sesión queda marcada como cierre manual y con el motivo que se indique, para que la corrección sea auditable.

### Datos históricos: `origen`

Las sesiones anteriores al 13 de agosto de 2026 fueron **reconstruidas** por `sql/migrations/005_backfill_almuerzo.sql` a partir de segundas marcaciones registradas cuando aún no existía el control de tiempo. Se distinguen por `origen = 'BACKFILL'` y aparecen marcadas como *inferido* en el panel, en el Excel y en el correo.

Solo se cargaron las 528 sesiones donde hubo una segunda marcación real. **No** se reconstruyeron las ~13 700 salidas sin retorno: antes de este módulo nadie pedía marcar al volver (solo ~4 personas al día de ~110 lo hacían por su cuenta), así que registrarlas habría inventado incumplimientos que nunca existieron.

> Los datos `BACKFILL` sirven como referencia de tendencia, **no** como evidencia para una medida disciplinaria individual.

---

## 9. Gestión de Secretos y Credenciales

### Ver secretos actuales

```bash
sudo cat /etc/comedor/secrets.env
```

### Regenerar JWT Secret (invalida todos los tokens activos)

```bash
# Generar nuevo secret
NEW_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

# Actualizar en archivo de secretos
sudo sed -i "s/^ADMIN_JWT_SECRET=.*/ADMIN_JWT_SECRET=${NEW_SECRET}/" /etc/comedor/secrets.env

# Reiniciar backend para aplicar
sudo systemctl restart comedor-backend

echo "JWT Secret rotado. Todos los admins deben volver a iniciar sesión."
```

### Actualizar CORS para nueva IP

```bash
# Agregar nueva IP al whitelist de CORS
sudo sed -i 's/^CORS_ORIGINS=.*/CORS_ORIGINS=http:\/\/150.36.200.252:5001,http:\/\/NUEVA_IP:5001/' \
    /etc/comedor/secrets.env

sudo systemctl restart comedor-backend
```

### Actualizar contraseña de BD

```bash
# 1. Cambiar en MySQL
mysql -u root -p -e "ALTER USER 'admin'@'localhost' IDENTIFIED BY 'nueva_contraseña';"

# 2. Actualizar en archivo de secretos
sudo sed -i 's/^DB_PASSWORD=.*/DB_PASSWORD=nueva_contraseña/' /etc/comedor/secrets.env

# 3. Reiniciar servicios
sudo systemctl restart comedor-backend comedor-worker
```

### Actualizar contraseña SMTP

```bash
sudo sed -i 's/^SMTP_PASS=.*/SMTP_PASS=nueva_contraseña_app/' /etc/comedor/secrets.env
sudo systemctl restart comedor-worker
```

---

## 10. Tareas de Mantenimiento Periódico

### Diario

```bash
# Verificar que todos los servicios están activos
for svc in nginx comedor-backend comedor-worker mysql; do
    status=$(systemctl is-active $svc)
    echo "$svc: $status"
    [ "$status" != "active" ] && echo "  ⚠️  SERVICIO CAÍDO — reiniciar: sudo systemctl restart $svc"
done

# Verificar health endpoint
curl -s http://localhost:5001/api/health

# Ver si hay errores recientes en el backend
sudo journalctl -u comedor-backend -p err --since "1 hour ago" --no-pager
```

### Semanal

```bash
# Backup de la base de datos
DATE=$(date +%Y%m%d)
mkdir -p /home/john/backups
mysqldump -u admin -p control_comedor > /home/john/backups/comedor_${DATE}.sql
echo "Backup: comedor_${DATE}.sql"

# Limpiar logs Winston si son muy grandes
du -sh /home/john/comedor/Tickets_Comedor/backend/logs/
# Si > 100MB: truncar combined.log

# Verificar espacio en disco
df -h /
df -h /home
```

### Mensual

```bash
# Limpiar backups antiguos (conservar últimos 30 días)
find /home/john/backups -name "comedor_*.sql" -mtime +30 -delete

# Revisar log de tickets manuales (auditoría)
mysql -u admin -p control_comedor -e "
SELECT 
    DATE(created_at) as fecha,
    COUNT(*) as tickets_manuales
FROM log_tickets_manuales 
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY DATE(created_at)
ORDER BY fecha DESC;"

# Actualizar dependencias Node (evaluar actualizaciones de seguridad)
cd /home/john/comedor/Tickets_Comedor/backend
npm audit
npm audit fix --only=prod
```

---

## 11. Instalación desde Cero

Para instalación en un nuevo servidor Ubuntu.

### 11.1 Prerrequisitos

```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Python 3.11 + pip + venv
sudo apt install -y python3.11 python3.11-venv python3.11-dev python3-pip

# MariaDB
sudo apt install -y mariadb-server mariadb-client

# Nginx
sudo apt install -y nginx

# Herramientas
sudo apt install -y git curl
```

### 11.2 Configurar MariaDB

```bash
sudo mysql_secure_installation

# Crear base de datos y usuario
sudo mysql <<EOF
CREATE DATABASE control_comedor CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER 'admin'@'localhost' IDENTIFIED BY 'contraseña_segura';
GRANT ALL PRIVILEGES ON control_comedor.* TO 'admin'@'localhost';
FLUSH PRIVILEGES;
EOF

# Importar esquema
mysql -u admin -p control_comedor < /home/john/comedor/Tickets_Comedor/sql/control_comedor.sql

# Ejecutar migración 002 (si aplica)
mysql -u admin -p control_comedor < /home/john/comedor/Tickets_Comedor/sql/migrations/002_add_tipo_especial.sql
```

### 11.3 Instalar dependencias del proyecto

```bash
# Backend Node.js
cd /home/john/comedor/Tickets_Comedor/backend
npm install

# Worker Python
cd /home/john/comedor/Tickets_Comedor/backend/python_core
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate

# Frontend (compilar)
cd /home/john/comedor/Tickets_Comedor/frontend
npm install
npm run build
```

### 11.4 Crear secretos

```bash
sudo bash /home/john/comedor/Tickets_Comedor/nginx/crear_secrets.sh
# Editar los valores si necesario
sudo nano /etc/comedor/secrets.env
```

### 11.5 Instalar servicios y Nginx

```bash
sudo bash /home/john/comedor/Tickets_Comedor/nginx/instalar.sh
```

Este script:
1. Copia los archivos `.service` a `/etc/systemd/system/`
2. Enlaza la config de Nginx a `/etc/nginx/sites-enabled/`
3. Verifica la config de Nginx
4. Recarga systemd
5. Reinicia el backend
6. Recarga Nginx

### 11.6 Configurar websocket_map.conf en Nginx

```bash
# Asegurar que el mapa WebSocket esté incluido en la config global de Nginx
sudo cp /home/john/comedor/Tickets_Comedor/nginx/websocket_map.conf \
        /etc/nginx/conf.d/websocket_map.conf

# O incluirlo en nginx.conf dentro del bloque http{}
# include /home/john/comedor/Tickets_Comedor/nginx/websocket_map.conf;

sudo nginx -t && sudo systemctl reload nginx
```

### 11.7 Verificación final

```bash
# Todos los servicios activos
for svc in nginx comedor-backend mysql; do echo "$svc: $(systemctl is-active $svc)"; done

# API responde
curl -s http://localhost:5001/api/health
# → {"status":"online",...}

# Frontend carga
curl -s -o /dev/null -w "%{http_code}" http://localhost:5001/
# → 200
```

---

## 12. Migraciones de Base de Datos

Las migraciones son scripts SQL incrementales en `sql/migrations/`. Se aplican **una sola vez** y en orden.

### Migración 002: Columna tipo_especial

```bash
# Verificar si ya fue aplicada
mysql -u admin -p control_comedor -e "SHOW COLUMNS FROM usuarios LIKE 'tipo_especial';"

# Si no existe la columna, aplicar migración
mysql -u admin -p control_comedor < \
    /home/john/comedor/Tickets_Comedor/sql/migrations/002_add_tipo_especial.sql

# Verificar resultado
mysql -u admin -p control_comedor -e "
SELECT zk_id, nombre_completo, tipo_especial 
FROM usuarios 
WHERE tipo_especial IS NOT NULL;"
```

**Contenido de la migración 002:**
```sql
ALTER TABLE usuarios ADD COLUMN tipo_especial VARCHAR(20) NULL DEFAULT NULL;
UPDATE usuarios SET tipo_especial = 'VIP' WHERE zk_id IN ('14', '27');
UPDATE usuarios SET tipo_especial = 'GERENCIA' WHERE zk_id IN ('16', '119', '120');
```

### Migración 004: Control de tiempo de almuerzo — **aplicada 13/08/2026**

Crea la tabla `almuerzo_sesiones` y las 8 claves `almuerzo_*` de configuración.

```bash
# Verificar si ya fue aplicada
mysql -u admin -p control_comedor -e "SHOW TABLES LIKE 'almuerzo_sesiones';"

mysql -u admin -p control_comedor < \
    /home/john/comedor/Tickets_Comedor/sql/migrations/004_control_almuerzo.sql
```

Es re-ejecutable: `CREATE TABLE IF NOT EXISTS`, los `INSERT` de configuración son idempotentes y el `ALTER ... CONVERT TO` de colación no hace nada si ya está en `utf8mb4_general_ci`.

> **Requiere reiniciar el worker** para que empiece a registrar sesiones:
> `sudo systemctl restart comedor-worker`. Hacerlo fuera de la franja 11:30–15:30.

### Migración 005: Reconstrucción histórica — **aplicada 13/08/2026**

Reinterpreta los `INTENTO DE DUPLICADO` históricos como retornos y llena `almuerzo_sesiones` con 528 sesiones desde febrero de 2026, etiquetadas `origen = 'BACKFILL'`.

```bash
mysql -u admin -p control_comedor < \
    /home/john/comedor/Tickets_Comedor/sql/migrations/005_backfill_almuerzo.sql

# Verificar
mysql -u admin -p control_comedor -e "
SELECT origen, estado, COUNT(*) FROM almuerzo_sesiones GROUP BY origen, estado;"
```

Es idempotente por el `UNIQUE (user_id, fecha)` más `ON DUPLICATE KEY` no-op: re-ejecutarla no duplica ni sobrescribe lo medido en vivo. Ver la advertencia sobre la calidad de estos datos en §8.1.

### Migración 006: Zonas de trabajo — **aplicada 13/08/2026**

Agrega `usuarios.zona` y las 3 claves `almuerzo_zona*`. Siembra zona `ADMINISTRATIVOS` a los 22 empleados con `role = 'Administrativo'`; los 154 operativos quedan sin zona y se clasifican desde AdminV2 → Zonas.

```bash
mysql -u admin -p control_comedor < \
    /home/john/comedor/Tickets_Comedor/sql/migrations/006_zonas_almuerzo.sql

# Verificar el avance de la clasificación
mysql -u admin -p control_comedor -e "
SELECT COALESCE(zona,'(sin zona)') zona, COUNT(*) FROM usuarios GROUP BY zona ORDER BY 2 DESC;"
```

Re-ejecutable: el `ADD COLUMN` y el `ADD KEY` son condicionales y el sembrado solo toca a quien no tiene zona.

> **Requiere reiniciar el worker** para que aplique el filtro por zona.

### Aplicar una nueva migración

Convención de nombre: `NNN_descripcion_breve.sql` (ej. `003_add_indice_registros.sql`)

```bash
# Aplicar
mysql -u admin -p control_comedor < sql/migrations/003_descripcion.sql

# Verificar
mysql -u admin -p control_comedor -e "DESCRIBE registros;"
```

**Regla:** Nunca modificar una migración ya aplicada. Crear una nueva migración para corregir o revertir.
