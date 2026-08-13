# Guía de Solución de Problemas — SIGAC
## Sistema de Gestión de Acceso al Comedor — DETCUADOR S.A.

**Versión:** 3.2  
**Última actualización:** Mayo 2026  

---

## Regla de Oro

**Leer los logs antes de tocar cualquier cosa.** El 80% de los problemas se diagnostican en los primeros 10 líneas del log correcto.

```bash
# Diagnóstico rápido completo
echo "=== SERVICIOS ===" && for svc in nginx comedor-backend comedor-worker mysql; do echo "$svc: $(systemctl is-active $svc)"; done
echo "=== PUERTOS ===" && sudo ss -tlnp | grep -E '5001|5002|3306'
echo "=== HEALTH ===" && curl -s http://localhost:5001/api/health
echo "=== BACKEND ERRORES (últimas 10 líneas) ===" && sudo journalctl -u comedor-backend -p err -n 10 --no-pager
echo "=== WORKER ERRORES (últimas 10 líneas) ===" && sudo journalctl -u comedor-worker -p err -n 10 --no-pager
```

---

## Índice de Problemas

| Síntoma | Sección |
|---------|---------|
| El dashboard no carga (pantalla en blanco o error 502) | [§1](#1-el-dashboard-no-carga) |
| Terminal en vivo dice "OFFLINE" o "Desconectado" | [§2](#2-terminal-en-vivo-offline-o-desconectado) |
| Socket.IO no conecta / mensajes de "session ID unknown" | [§3](#3-socketio-no-conecta) |
| El biométrico no registra huellas / sin eventos | [§4](#4-el-biométrico-no-registra-eventos) |
| La impresora no imprime tickets | [§5](#5-la-impresora-no-imprime) |
| No llegan emails de alerta | [§6](#6-no-llegan-emails-de-alerta) |
| El Panel Admin no permite login | [§7](#7-el-panel-admin-no-permite-login) |
| CORS error en el navegador | [§8](#8-cors-error-en-el-navegador) |
| Errores 429 (Too Many Requests) | [§9](#9-errores-429-too-many-requests) |
| Backend no arranca: "FATAL: ADMIN_JWT_SECRET" | [§10](#10-backend-no-arranca-fatal-admin_jwt_secret) |
| Estadísticas muestran números incorrectos | [§11](#11-estadísticas-incorrectas) |
| Empleado marcó huella pero no aparece en dashboard | [§12](#12-evento-biométrico-no-aparece-en-dashboard) |
| Ticket impreso con número incorrecto | [§13](#13-número-de-ticket-incorrecto) |
| Error al reimprimir ticket desde AdminV2 | [§14](#14-error-al-reimprimir-ticket) |
| Worker Python no reconecta al biométrico | [§15](#15-worker-python-no-reconecta) |
| Base de datos: errores de conexión | [§16](#16-errores-de-conexión-a-base-de-datos) |

---

## 1. El Dashboard No Carga

### Síntomas
- Pantalla en blanco
- Error 502 Bad Gateway en el navegador
- Error "No se puede conectar" o similar

### Diagnóstico

```bash
# Paso 1: ¿Nginx está activo?
sudo systemctl status nginx

# Paso 2: ¿Express está activo y en el puerto correcto?
sudo systemctl status comedor-backend
sudo ss -tlnp | grep 5002

# Paso 3: ¿El frontend existe compilado?
ls -la /home/john/comedor/Tickets_Comedor/frontend/dist/index.html

# Paso 4: Ver errores de Nginx
sudo tail -20 /var/log/nginx/comedor-error.log

# Paso 5: Ver errores del backend
sudo journalctl -u comedor-backend -n 30 --no-pager
```

### Soluciones

**Si Nginx está caído:**
```bash
sudo nginx -t              # verificar configuración
sudo systemctl start nginx
```

**Si Express está caído:**
```bash
sudo journalctl -u comedor-backend -n 50 --no-pager  # leer causa
sudo systemctl start comedor-backend
```

**Si el frontend no existe:**
```bash
cd /home/john/comedor/Tickets_Comedor/frontend
npm install
npm run build
sudo systemctl reload nginx
```

**Si Nginx muestra 502 pero Express parece activo:**
```bash
# Verificar que Express escucha en la IP correcta
sudo ss -tlnp | grep 5002
# Debe mostrar: 127.0.0.1:5002 — NO 0.0.0.0:5002 en producción

# Si muestra 0.0.0.0 en producción, verificar NODE_ENV
sudo cat /etc/comedor/secrets.env | grep NODE_ENV
# Debe ser: NODE_ENV=production
```

---

## 2. Terminal en Vivo: OFFLINE o Desconectado

### Síntomas
- El componente LiveTerminal muestra "OFFLINE" en badge rojo
- Mensajes repetidos de "Desconectado del servidor"
- Los eventos biométricos no aparecen en tiempo real

### Diagnóstico

```bash
# Paso 1: ¿Socket.IO puede conectar? (desde el servidor)
curl -s "http://localhost:5002/socket.io/?EIO=4&transport=polling" | head -c 100

# Paso 2: Ver logs de Socket.IO en backend
sudo journalctl -u comedor-backend | grep -i "socket\|cors\|upgrade" | tail -20

# Paso 3: Ver errores de Nginx para /socket.io/
sudo grep "socket" /var/log/nginx/comedor-error.log | tail -20

# Paso 4: ¿El CORS_ORIGINS incluye la IP desde la que accedes?
sudo grep CORS_ORIGINS /etc/comedor/secrets.env
```

### Soluciones

**Problema de CORS (más común):**
```bash
# Ver desde qué IP accede el navegador — buscar en logs de Nginx
sudo tail -20 /var/log/nginx/comedor-access.log
# La IP del cliente es el primer campo

# Agregar la IP faltante a CORS_ORIGINS
sudo nano /etc/comedor/secrets.env
# CORS_ORIGINS=http://150.36.200.252:5001,http://NUEVA_IP:5001

sudo systemctl restart comedor-backend
```

**Problema con proxy_buffering (Socket.IO long-polling):**
```bash
# Verificar que proxy_buffering off está en la config
grep -A5 "location /socket.io/" /home/john/comedor/Tickets_Comedor/nginx/comedor.conf
# Debe incluir: proxy_buffering off;

# Verificar que el mapa de Connection header existe
cat /etc/nginx/conf.d/websocket_map.conf
# Debe mostrar el bloque map $http_upgrade $connection_upgrade

# Verificar que la config del servidor lo usa
grep "connection_upgrade" /home/john/comedor/Tickets_Comedor/nginx/comedor.conf

sudo nginx -t && sudo systemctl reload nginx
```

**Verificar websocket_map.conf:**
```bash
# Si no existe, crearlo
sudo cp /home/john/comedor/Tickets_Comedor/nginx/websocket_map.conf \
        /etc/nginx/conf.d/websocket_map.conf

# O agregar al nginx.conf dentro del bloque http{}
sudo nano /etc/nginx/nginx.conf
# Agregar dentro de http {}: include /etc/nginx/conf.d/websocket_map.conf;

sudo nginx -t && sudo systemctl reload nginx
```

---

## 3. Socket.IO No Conecta

### Síntomas
- Error en consola del navegador: "WebSocket connection failed"
- Error: "xhr poll error" repetido
- "Session ID unknown" en los logs del backend

### Diagnóstico

```bash
# Verificar que los headers de WebSocket llegan correctamente
curl -v -H "Connection: Upgrade" -H "Upgrade: websocket" \
    "http://localhost:5001/socket.io/?EIO=4&transport=websocket" 2>&1 | head -30

# Ver si hay errores de "Session ID unknown"
sudo journalctl -u comedor-backend | grep -i "session\|unknown" | tail -20
```

### Solución

El error "Session ID unknown" en POST de Socket.IO casi siempre indica que `proxy_set_header Connection $connection_upgrade` está mal configurado o falta el `map`.

Ver sección §2 para la solución completa.

---

## 4. El Biométrico No Registra Eventos

### Síntomas
- Empleados ponen huella pero no salen tickets
- No aparecen eventos en el dashboard
- El worker Python muestra errores de conexión

### Diagnóstico

```bash
# Paso 1: ¿El worker está activo?
sudo systemctl status comedor-worker

# Paso 2: Ver logs del worker en tiempo real
sudo journalctl -u comedor-worker -f

# Paso 3: Verificar conectividad al biométrico
ping -c 3 150.36.200.12
telnet 150.36.200.12 4370    # Ctrl+] para salir

# Paso 4: Ver últimos eventos del worker
sudo journalctl -u comedor-worker -n 50 --no-pager
```

### Soluciones

**Worker caído:**
```bash
sudo systemctl start comedor-worker
sudo journalctl -u comedor-worker -n 20 --no-pager
```

**No puede conectar al biométrico:**
```bash
# Verificar IP configurada
grep IP_BIOMETRICO /etc/comedor/secrets.env

# Verificar conectividad de red
ping 150.36.200.12

# Si la red está bien pero no conecta: reiniciar el biométrico físicamente
# (es un proceso común en dispositivos ZKTeco — el socket TCP puede quedar 
# en estado TIME_WAIT indefinidamente en el dispositivo)
```

**El worker conecta pero no registra:**
```bash
# Ver si hay errores de BD en el worker
sudo journalctl -u comedor-worker | grep -i "error\|mysql\|database" | tail -20

# Verificar que MariaDB está activo
sudo systemctl status mysql
```

**Verificar que el horario no está bloqueando:**
```bash
curl -s http://localhost:5001/api/config
# Si horario_activo = "true", verificar que la hora actual está dentro del rango
# Si es fuera de horario intencionalmente, esto es comportamiento correcto
```

---

## 5. La Impresora No Imprime

### Síntomas
- Empleado marca huella, aparece en dashboard, pero no sale ticket
- El worker muestra "OMITIENDO IMPRESIÓN: OFFLINE" o similar
- Tickets manuales fallan al imprimir

### Diagnóstico

```bash
# Verificar conectividad a la impresora (puerto 9100)
nc -zv 150.36.200.9 9100
# Si responde: "Connection to 150.36.200.9 9100 port [tcp/*] succeeded!"

ping -c 3 150.36.200.9

# Ver estado reportado por el worker
sudo journalctl -u comedor-worker | grep -i "impresora\|OFFLINE\|papel\|tapa" | tail -20
```

### Soluciones según estado

**OFFLINE — impresora apagada o sin red:**
```bash
# 1. Verificar que la impresora está encendida
# 2. Verificar que el cable de red está conectado
# 3. Hacer ping: ping 150.36.200.9
# 4. Si responde al ping pero da OFFLINE, reiniciar la impresora
```

**SIN_PAPEL:**
- Físicamente recargar el rollo de papel en la impresora.
- El worker detectará automáticamente el cambio de estado y enviará un email de "recuperada".

**TAPA_ABIERTA:**
- Cerrar la tapa de la impresora firmemente hasta escuchar "clic".

**ERROR_MECANICO:**
- Revisar si hay papel atascado.
- Abrir y cerrar la tapa para intentar liberarlo.
- Si persiste, reiniciar la impresora.

**Error al ejecutar script Python de reimpresión:**
```bash
# Verificar que el venv Python existe
ls /home/john/comedor/Tickets_Comedor/backend/python_core/venv/bin/python

# Verificar que reprint_ticket.py existe
ls /home/john/comedor/Tickets_Comedor/backend/python_core/reprint_ticket.py

# Probar manualmente
/home/john/comedor/Tickets_Comedor/backend/python_core/venv/bin/python \
    /home/john/comedor/Tickets_Comedor/backend/python_core/reprint_ticket.py \
    --name "Test" --type "TICKET ALMUERZO" --ticket_number 1 \
    --date "2026-05-09" --time "12:00:00"
```

---

## 6. No Llegan Emails de Alerta

### Síntomas
- Impresora cambia de estado pero no llega email
- Fallo crítico de BD sin email de notificación

### Diagnóstico

```bash
# Ver intentos de envío de email en el worker
sudo journalctl -u comedor-worker | grep -i "email\|smtp\|correo" | tail -20

# Ver errores SMTP
sudo journalctl -u comedor-worker | grep -i "email\|smtp\|error" | tail -30
```

### Soluciones

**Credenciales SMTP incorrectas:**
```bash
# Verificar configuración SMTP
grep "SMTP\|EMAIL" /etc/comedor/secrets.env

# Probar manualmente envío SMTP
python3 -c "
import smtplib
from email.mime.text import MIMEText
msg = MIMEText('Test desde SIGAC')
msg['From'] = 'no-reply@detcuador.com'
msg['To'] = 'agarcia@detcuador.com'
msg['Subject'] = 'Test'
with smtplib.SMTP('smtp-mail.outlook.com', 587) as s:
    s.starttls()
    s.login('no-reply@detcuador.com', 'TU_CONTRASEÑA_APP')
    s.send_message(msg)
    print('OK')
"
```

**Contraseña de aplicación expirada:**
- Outlook requiere contraseñas de aplicación para SMTP.
- Regenerar en: cuenta Microsoft → Seguridad → Contraseñas de aplicación.
- Actualizar en `/etc/comedor/secrets.env` → `SMTP_PASS=nueva_contraseña`.
- `sudo systemctl restart comedor-worker`

---

## 7. El Panel Admin No Permite Login

### Síntomas
- "Usuario no encontrado o sin permisos de administrador"
- "Contraseña incorrecta"
- Error 429 al intentar múltiples veces

### Diagnóstico

```bash
# Verificar que el usuario existe y tiene rol 'admin'
mysql -u admin -p control_comedor -e "
SELECT id, username, nombre_real, rol, activo 
FROM usuarios_impresion_manual 
WHERE username = 'admin';"

# Ver intentos de login en logs
sudo journalctl -u comedor-backend | grep -i "login\|admin" | tail -20
```

### Soluciones

**Usuario no existe o `activo=0`:**
```bash
# Ver todos los admins
mysql -u admin -p control_comedor -e "
SELECT username, rol, activo FROM usuarios_impresion_manual WHERE rol = 'admin';"

# Reactivar usuario
mysql -u admin -p control_comedor -e "
UPDATE usuarios_impresion_manual SET activo = 1 WHERE username = 'admin';"
```

**Contraseña olvidada — resetear:**
```bash
# Generar nuevo hash
HASH=$(node -e "const b=require('bcrypt'); b.hash('nueva_contraseña',10).then(h=>console.log(h))" \
    -e "" 2>/dev/null || \
    cd /home/john/comedor/Tickets_Comedor/backend && \
    node -e "require('bcrypt').hash('nueva_contraseña',10).then(h=>{console.log(h);process.exit()})")

# Actualizar
mysql -u admin -p control_comedor \
    -e "UPDATE usuarios_impresion_manual SET password_hash = '${HASH}' WHERE username = 'admin';"
```

**Error 429 — rate limit activo:**
- Esperar 15 minutos desde el último intento fallido.
- El rate limit es por IP: si accedes desde otra IP, no está bloqueada.

**JWT_SECRET cambió:**
- Todos los tokens son inválidos después de cambiar `ADMIN_JWT_SECRET`.
- Solución: volver a iniciar sesión para obtener un token nuevo.

---

## 8. CORS Error en el Navegador

### Síntomas
- Error en consola del navegador: "Access to fetch at '...' from origin '...' has been blocked by CORS policy"
- Las peticiones a `/api/` fallan con error de red

### Diagnóstico

```bash
# Ver qué IP está bloqueada (aparece en logs del backend)
sudo journalctl -u comedor-backend | grep -i "cors" | tail -10

# Verificar CORS_ORIGINS actual
grep CORS_ORIGINS /etc/comedor/secrets.env
```

### Solución

```bash
# La IP bloqueada debe agregarse a CORS_ORIGINS
# Ejemplo: agregar 100.76.97.125:5001 (acceso VPN)
sudo sed -i 's/^CORS_ORIGINS=.*/CORS_ORIGINS=http:\/\/150.36.200.252:5001,http:\/\/100.76.97.125:5001/' \
    /etc/comedor/secrets.env

sudo systemctl restart comedor-backend
```

**Verificación:**
```bash
# El nuevo origen debe estar permitido
curl -v -H "Origin: http://NUEVA_IP:5001" http://localhost:5001/api/health 2>&1 | grep -i "access-control"
```

---

## 9. Errores 429 Too Many Requests

### Síntomas
- Respuestas con código 429 al llamar a la API
- "Demasiados intentos. Espera 15 minutos." en login
- "Demasiadas solicitudes de tickets." en impresión manual

### Límites configurados

| Endpoint | Límite | Ventana |
|---------|--------|---------|
| `/api/admin/login` | 10 req | 15 min |
| `/api/manual-tickets/login` | 10 req | 15 min |
| `/api/manual-tickets/*` | 30 req | 1 min |
| `/api/*` | 200 req | 1 min |

### Soluciones

**Para login bloqueado:** Esperar el tiempo de la ventana (15 minutos para login).

**Para llamadas automatizadas que superan el límite general:**
- Revisar si hay scripts o integraciones que llamen a la API en bucle
- Implementar throttling en el lado cliente

**En desarrollo/testing — aumentar límites temporalmente:**
```javascript
// backend/server.js — ajustar para testing
const limitadorGeneral = rateLimit({
    windowMs: 60 * 1000,
    max: 1000,  // aumentar temporalmente
    ...
});
```

---

## 10. Backend No Arranca: "FATAL: ADMIN_JWT_SECRET"

### Síntomas
- `sudo systemctl start comedor-backend` falla
- Los logs muestran: `FATAL: ADMIN_JWT_SECRET no configurada. El servidor no puede arrancar.`

### Causa

El archivo `/etc/comedor/secrets.env` no existe, no tiene la variable `ADMIN_JWT_SECRET`, o el servicio no puede leerlo.

### Solución

```bash
# Verificar que el archivo existe
sudo ls -la /etc/comedor/secrets.env

# Si no existe: crear con el script
sudo bash /home/john/comedor/Tickets_Comedor/nginx/crear_secrets.sh

# Si existe pero falta la variable
sudo grep ADMIN_JWT_SECRET /etc/comedor/secrets.env

# Si la variable está vacía, regenerar
JWT=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
sudo sed -i "s/^ADMIN_JWT_SECRET=.*/ADMIN_JWT_SECRET=${JWT}/" /etc/comedor/secrets.env

# Verificar permisos
sudo ls -la /etc/comedor/secrets.env
# Debe mostrar: -rw------- 1 john john

# Reiniciar
sudo systemctl start comedor-backend
sudo journalctl -u comedor-backend -n 10
```

---

## 11. Estadísticas Incorrectas

### Síntomas
- El conteo del dashboard no coincide con lo esperado
- Faltan algunos tipos de ticket en los totales

### Diagnóstico

```bash
# Ver qué hay exactamente en la BD para hoy
mysql -u admin -p control_comedor -e "
SELECT descripcion, COUNT(*) as total 
FROM registros 
WHERE fecha = CURDATE() 
GROUP BY descripcion 
ORDER BY total DESC;"
```

### Causa probable

Registros legacy con descripciones en minúsculas ('Ticket Almuerzo' vs 'TICKET ALMUERZO'). El sistema soporta ambos formatos en las queries de `statsRepository.js`.

```bash
# Ver si hay registros legacy
mysql -u admin -p control_comedor -e "
SELECT descripcion, COUNT(*) FROM registros 
WHERE descripcion LIKE 'Ticket %' 
GROUP BY descripcion;"
```

**Si hay registros legacy que afectan los totales, normalizar:**
```sql
UPDATE registros SET descripcion = 'TICKET ALMUERZO' WHERE descripcion = 'Ticket Almuerzo';
UPDATE registros SET descripcion = 'TICKET DIETA' WHERE descripcion = 'Ticket Dieta';
UPDATE registros SET descripcion = 'TICKET EXTRA' WHERE descripcion = 'Ticket Extra';
```

---

## 12. Evento Biométrico No Aparece en Dashboard

### Síntomas
- Empleado marcó huella correctamente (ticket impreso) pero no aparece en la terminal en vivo
- El evento está en la BD pero no se emite por Socket.IO

### Diagnóstico

```bash
# Verificar que el evento está en BD
mysql -u admin -p control_comedor -e "
SELECT id, nombre, hora, descripcion FROM registros 
WHERE fecha = CURDATE() ORDER BY id DESC LIMIT 5;"

# Verificar que el polling de Node está funcionando
sudo journalctl -u comedor-backend | grep -i "Emitted\|polling\|new records" | tail -10
```

### Solución

Si el evento está en BD pero no aparece en el dashboard:

1. **El Socket.IO puede estar desconectado** — ver §2.
2. **El polling se detuvo** — reiniciar el backend:
   ```bash
   sudo systemctl restart comedor-backend
   ```
3. **`lastProcessedId` está mal inicializado** — esto se resetea al reiniciar.

---

## 13. Número de Ticket Incorrecto

### Síntomas
- Dos tickets con el mismo número
- Tickets con número 0

### Causa

Condición de carrera: el worker Python y Node.js calculan el siguiente ticket simultáneamente sin bloqueo de BD.

### Diagnóstico

```bash
# Buscar números duplicados hoy
mysql -u admin -p control_comedor -e "
SELECT numero_ticket, COUNT(*) as veces 
FROM registros 
WHERE fecha = CURDATE() 
GROUP BY numero_ticket 
HAVING COUNT(*) > 1;"
```

### Solución

Si ocurre raramente (< 1 vez por semana): aceptable dado el nivel de concurrencia. 

Si ocurre frecuentemente: añadir SELECT FOR UPDATE en `_get_siguiente_ticket()` en Python y la función equivalente en Node.js para bloquear la fila durante el cálculo.

Corrección manual de duplicado:
```sql
-- Reasignar número al registro más nuevo con el mismo número
UPDATE registros 
SET numero_ticket = (SELECT MAX(numero_ticket) + 1 FROM registros WHERE fecha = CURDATE())
WHERE id = (SELECT id FROM registros WHERE fecha = CURDATE() AND numero_ticket = N ORDER BY id DESC LIMIT 1);
```

---

## 14. Error al Reimprimir Ticket

### Síntomas
- "Error al reimprimir el ticket. Revisa los logs." en el panel admin
- El script Python falla al ejecutarse

### Diagnóstico

```bash
# Ver el error exacto en los logs
sudo journalctl -u comedor-backend | grep -i "reprint\|Error" | tail -20

# Verificar que el venv Python existe
ls -la /home/john/comedor/Tickets_Comedor/backend/python_core/venv/bin/python

# Probar la impresora directamente
nc -zv 150.36.200.9 9100
```

### Solución

**venv no existe:**
```bash
cd /home/john/comedor/Tickets_Comedor/backend/python_core
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
```

**Impresora offline:** Ver §5.

**Nombre con caracteres especiales en el comando exec:**
Este es un bug conocido — el nombre del empleado se pasa sin escape en el comando shell. Solución temporal: usar la reimpresión desde la misma terminal del servidor con comillas escapadas.

---

## 15. Worker Python No Reconecta

### Síntomas
- Los logs muestran "Error conexión Biométrico: ..." repetido
- El worker no vuelve a conectarse aunque el biométrico esté disponible

### Diagnóstico

```bash
# Ver si el loop de reconexión está funcionando
sudo journalctl -u comedor-worker -f

# El mensaje normal es: "Conectando a Biométrico 150.36.200.12..."
# cada 5 segundos si hay fallo
```

### Solución

```bash
# Reiniciar el worker (el loop while True debería auto-reconectar, 
# pero si el proceso cuelga es mejor reiniciarlo)
sudo systemctl restart comedor-worker

# Si el biométrico responde al ping pero el worker no conecta:
ping -c 3 150.36.200.12
telnet 150.36.200.12 4370

# El biométrico ZKTeco a veces necesita reiniciarse para liberar el socket TCP
# (Reinicio físico: apagar y encender el dispositivo)
```

---

## 16. Errores de Conexión a Base de Datos

### Síntomas
- Backend logs: "Database Query Error" o "Error creating connection pool"
- Worker logs: "Error conectando a BD"
- API retorna 500 en endpoints que necesitan BD

### Diagnóstico

```bash
# Paso 1: ¿MariaDB está activo?
sudo systemctl status mysql

# Paso 2: ¿Se puede conectar?
mysql -u admin -p control_comedor -e "SELECT 1;"

# Paso 3: Ver logs de MariaDB
sudo journalctl -u mysql -n 30

# Paso 4: Ver pool exhausted en backend
sudo journalctl -u comedor-backend | grep -i "pool\|connection\|database" | tail -20
```

### Soluciones

**MariaDB caído:**
```bash
sudo systemctl start mysql
sudo journalctl -u mysql -n 20
```

**Contraseña de BD incorrecta:**
```bash
# Verificar credenciales
grep "DB_" /etc/comedor/secrets.env

# Probar conexión manual
mysql -u admin -p$(grep DB_PASSWORD /etc/comedor/secrets.env | cut -d= -f2) control_comedor -e "SELECT 1;"
```

**Pool agotado (demasiadas conexiones simultáneas):**
```bash
# Ver conexiones activas en MariaDB
mysql -u admin -p control_comedor -e "SHOW PROCESSLIST;"

# Matar conexiones zombies si las hay
mysql -u admin -p control_comedor -e "SHOW PROCESSLIST\G" | grep -A5 "Sleep"
```

**Disco lleno (MariaDB no puede escribir):**
```bash
df -h /
df -h /var/lib/mysql

# Si disco lleno: limpiar logs antiguos de Nginx
sudo find /var/log/nginx -name "*.gz" -mtime +30 -delete
sudo nginx -s reopen

# Limpiar logs Winston del backend
> /home/john/comedor/Tickets_Comedor/backend/logs/combined.log
```
