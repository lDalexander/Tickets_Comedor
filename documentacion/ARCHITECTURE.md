# Arquitectura del Sistema SIGAC
## Sistema de Gestión de Acceso al Comedor — DETCUADOR S.A.

**Versión:** 3.2  
**Última actualización:** Mayo 2026  
**Autor:** John Garcia  

---

## Índice

1. [Visión General](#1-visión-general)
2. [Diagrama de Contexto (C4 Nivel 1)](#2-diagrama-de-contexto-c4-nivel-1)
3. [Diagrama de Contenedores (C4 Nivel 2)](#3-diagrama-de-contenedores-c4-nivel-2)
4. [Diagrama de Componentes (C4 Nivel 3)](#4-diagrama-de-componentes-c4-nivel-3)
5. [Flujos de Datos Críticos](#5-flujos-de-datos-críticos)
6. [Capa de Infraestructura](#6-capa-de-infraestructura)
7. [Modelo de Datos](#7-modelo-de-datos)
8. [Seguridad en Profundidad](#8-seguridad-en-profundidad)
9. [Patrones de Diseño Implementados](#9-patrones-de-diseño-implementados)
10. [Decisiones Arquitectónicas (ADR)](#10-decisiones-arquitectónicas-adr)
11. [Limitaciones y Deuda Técnica](#11-limitaciones-y-deuda-técnica)

---

## 1. Visión General

SIGAC es un sistema corporativo de control biométrico de almuerzos para ~140 empleados de DETCUADOR S.A. Integra hardware de terceros (lector biométrico ZKTeco y termoimpresora ESC/POS en red) con una interfaz web en tiempo real.

### Principios arquitectónicos

- **Separación de responsabilidades estricta** — cada capa hace exactamente una cosa.
- **Fail-fast en secretos** — el servidor no arranca si falta cualquier variable de entorno crítica.
- **Defensa en profundidad** — validaciones redundantes (horario verificado en Python y en Node).
- **Hardware isolation** — todo el acceso a dispositivos físicos está confinado al worker Python.
- **Producción primero** — Nginx como proxy, Express enlazado solo a `127.0.0.1`, secretos fuera del repo.

### Stack tecnológico

| Capa | Tecnología | Versión | Rol |
|------|-----------|---------|-----|
| Proxy | Nginx | 1.24+ | Reverse proxy, archivos estáticos |
| API | Node.js + Express 5 | 18 LTS | REST API, Socket.IO, lógica de negocio |
| Worker | Python 3.11 | 3.11 | Biometría, termoimpresora |
| Frontend | React + Vite | 18 / 5.x | SPA dashboard |
| Base de datos | MariaDB | 10.4 | Almacenamiento persistente |
| Auth | JWT + bcrypt | jwt 9.x / bcrypt 6.x | Autenticación admin |
| Real-time | Socket.IO | 4.x | Eventos bidireccionales |
| Logging | Winston | 3.x | Logs estructurados JSON |
| Tests | Jest + Supertest | 30.x / 7.x | Tests de integración |

---

## 2. Diagrama de Contexto (C4 Nivel 1)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DETCUADOR S.A. (LAN 150.36.200.x)            │
│                                                                         │
│  ┌──────────────┐    HTTP/WS     ┌─────────────────────────────────┐   │
│  │  Empleado    │ ─────────────► │                                 │   │
│  │  (browser)   │               │         SIGAC                   │   │
│  └──────────────┘               │   Sistema de Gestión de         │   │
│                                 │   Acceso al Comedor             │   │
│  ┌──────────────┐    TCP/ZK      │                                 │   │
│  │  Biométrico  │ ─────────────► │   Servidor Ubuntu               │   │
│  │  ZKTeco K40  │               │   150.36.200.252                │   │
│  └──────────────┘               └─────────────────────────────────┘   │
│                                             │                          │
│  ┌──────────────┐  ESC/POS (TCP:9100)       │                          │
│  │ Termoimpresora│ ◄─────────────────────────┘                         │
│  │ 150.36.200.9 │                                                       │
│  └──────────────┘                                                       │
│                                                                         │
│  ┌──────────────┐    SMTP (TLS:587)                                     │
│  │  Outlook     │ ◄──────────── Alertas automáticas de estado          │
│  │  SMTP        │                                                       │
│  └──────────────┘                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Actores externos

| Actor | Tipo | Protocolo | Descripción |
|-------|------|-----------|-------------|
| Empleados | Humano | HTTP/WebSocket | Consultan dashboard, seleccionan menú semanal |
| Administrador | Humano | HTTP + JWT Bearer | Gestiona configuración, tablas y datos |
| Operador de comedor | Humano | HTTP + credencial simple | Imprime tickets manuales para visitas |
| Biométrico ZKTeco K40 | Sistema | TCP pyzk (puerto 4370) | Genera eventos de huella dactilar |
| Termoimpresora ESC/POS | Sistema | TCP raw (puerto 9100) | Recibe comandos de impresión |
| Servidor SMTP Outlook | Sistema | SMTP STARTTLS (587) | Recibe alertas automatizadas del sistema |

---

## 3. Diagrama de Contenedores (C4 Nivel 2)

```
                          LAN Corporativa (150.36.200.x)
                                      │
                                      │ :5001
                              ┌───────▼────────┐
                              │     NGINX      │
                              │  Reverse Proxy │
                              │  Static Files  │
                              └───────┬────────┘
                                      │
              ┌───────────────────────┼──────────────────────────┐
              │ /api/* y /socket.io/* │                    /*    │
              │                       │                          │
     ┌────────▼──────────────────────▼────────┐   ┌─────────────▼──────┐
     │         NODE.JS + EXPRESS 5             │   │   frontend/dist     │
     │         Backend API Server              │   │  (React build)      │
     │         :5002 (127.0.0.1 only)         │   │  Archivos estáticos │
     │                                         │   └────────────────────┘
     │  ┌──────────────┐ ┌──────────────────┐  │
     │  │  REST API    │ │   Socket.IO      │  │
     │  │  /api/*      │ │   (real-time)    │  │
     │  └──────┬───────┘ └────────┬─────────┘  │
     │         │                  │             │
     │  ┌──────▼──────────────────▼──────────┐  │
     │  │      mysql2 Pool (maxConn: 10)      │  │
     │  └──────────────────┬─────────────────┘  │
     └─────────────────────┼─────────────────────┘
                           │
              ┌────────────▼────────────┐
              │      MariaDB 10.4       │
              │   control_comedor       │
              └────────────┬────────────┘
                           │ (base de datos compartida)
     ┌─────────────────────┼──────────────────────────┐
     │  PYTHON WORKER      │                          │
     │  python_core/       │ mysql.connector Pool (5) │
     │  main.py            │                          │
     │                     │                          │
     │  ┌───────────────┐  └──────────────────────────┘
     │  │  pyzk         │                              │
     │  │  TCP:4370     │                              │
     │  └──────┬────────┘                              │
     │         │                                       │
     │  ┌──────▼──────────┐  ┌──────────────────────┐ │
     │  │ ZKTeco K40      │  │  ESC/POS TCP:9100    │ │
     │  │ live_capture()  │  │  Network printer     │ │
     │  └─────────────────┘  └──────────────────────┘ │
     └───────────────────────────────────────────────────┘
```

### Descripción de contenedores

#### Nginx (Reverse Proxy + Servidor Estático)
- Escucha en `:5001` (interfaz pública de la LAN)
- Sirve archivos estáticos de `frontend/dist/` con cache de 30 días para assets con hash de Vite
- Hace proxy de `/api/*` y `/socket.io/*` a Express en `127.0.0.1:5002`
- Configurado con `map $http_upgrade $connection_upgrade` para correcto manejo de WebSocket vs HTTP polling
- `proxy_buffering off` en `/socket.io/` — imprescindible para HTTP long-polling
- Config en: `nginx/comedor.conf`, mapa en: `nginx/websocket_map.conf`

#### Node.js Backend (`backend/server.js`)
- Express 5 enlazado a `127.0.0.1:5002` en producción (inaccesible directamente desde la red)
- Sirve la API REST bajo `/api/`
- Maneja eventos Socket.IO para actualizaciones en tiempo real
- Ejecuta polling a MariaDB cada 2 segundos para nuevos registros → emite `new_log` vía Socket.IO
- Carga secretos desde `/etc/comedor/secrets.env` vía systemd `EnvironmentFile=`
- Rate limiting en 3 niveles, CORS dinámico, trust proxy

#### Python Worker (`backend/python_core/main.py`)
- Proceso independiente gestionado por systemd (`comedor-worker.service`)
- Mantiene conexión TCP persistente al biométrico ZKTeco (puerto 4370)
- Usa `live_capture(new_timeout=120)` — yield periódico evita bloqueo TCP indefinido
- Reconecta automáticamente: ante desconexión (5s delay), cambio de día, o 2h de inactividad
- Escribe directamente en MariaDB (tabla `registros`)
- Controla la termoimpresora ESC/POS vía TCP
- Hilo secundario para monitoreo de impresora y sync de usuarios (cada 12h)

#### React SPA (`frontend/`)
- Build estático en `frontend/dist/` servido por Nginx
- Rutas: `/` (Dashboard), `/seleccion` (Selección de Menú), `/admin-v2` (Panel Admin)
- `/admin` redirige automáticamente a `/admin-v2`
- Consume la API REST vía fetch y SWR (con revalidación cada 60s)
- Recibe eventos en tiempo real vía Socket.IO client

#### MariaDB (`control_comedor`)
- Instancia local en `localhost:3306`
- Accedida desde Node.js (pool 10) y Python (pool 5) de forma concurrente
- Fuente de verdad única para registros, usuarios, configuración

---

## 4. Diagrama de Componentes (C4 Nivel 3)

### Backend Node.js

```
backend/
├── server.js                   ← Entry point: Express, Socket.IO, polling, middlewares
├── db.js                       ← mysql2 connection pool (x10) + helper query()
├── utils/
│   └── logger.js               ← Winston JSON logger + logError() con contexto req
├── repositories/
│   └── statsRepository.js      ← Repository Pattern: todas las queries de estadísticas
│                                  + caché de IDs especiales (TTL 5 min)
└── routes/
    ├── adminRoutes.js           ← JWT-protected: login, CRUD tablas, reimpresión
    ├── configRoutes.js          ← Config key-value + /especiales (cacheado)
    ├── dashboardRoutes.js       ← Estadísticas, historial, exportación Excel
    └── manualTicketRoutes.js    ← Login operador, print visita, print tercero
```

#### Flujo de middlewares en Express

```
HTTP Request
  │
  ├─ app.set('trust proxy', 1)        → IPs reales detrás de Nginx
  ├─ cors(corsOptions)                 → whitelist desde CORS_ORIGINS env
  ├─ express.json()                    → body parser JSON
  ├─ logger.info() middleware          → log de cada request entrante
  │
  ├─ /api/admin/login       → limitadorLogin (10 req / 15 min por IP)
  ├─ /api/manual-tickets/login → limitadorLogin
  ├─ /api/manual-tickets/*  → limitadorTickets (30 req / min por IP)
  ├─ /api/*                 → limitadorGeneral (200 req / min por IP)
  │
  ├─ /api/admin/*       → adminRoutes.js    (requiere JWT Bearer + rol)
  ├─ /api/config/*      → configRoutes.js   (GET público, POST requiere JWT)
  ├─ /api/manual-tickets/* → manualTicketRoutes.js
  └─ /api/*             → dashboardRoutes.js (endpoints públicos)
```

### Python Worker

```
backend/python_core/
├── main.py                     ← Entry point: loop ZK, threading, debounce
├── reprint_ticket.py           ← Script CLI para reimpresión desde Node
└── src/
    ├── __init__.py
    ├── database.py             ← Clase Database: pool MySQL, lógica de negocio completa
    └── printer.py              ← Clase TicketPrinter: ESC/POS, estado, email SMTP async
```

#### Flujo de eventos en el worker Python

```
main()
  │
  ├─ Database()                  → conecta pool MySQL (5 conexiones)
  ├─ TicketPrinter()             → configura ESC/POS + email executor
  ├─ Thread(tarea_monitoreo)     → daemon: verifica impresora + sync usuarios cada 12h
  │
  └─ while True:  (loop de reconexión)
       ├─ ZK(IP, port=4370).connect()
       ├─ get_users() → sincronizar_usuarios_masivo()
       └─ for event in live_capture(new_timeout=120):
            │
            ├─ [día cambió] → break (reconectar para limpiar socket TCP)
            ├─ [inactividad > 2h] → break (prevenir TCP drop silencioso)
            │
            └─ process_biometric_event(event):
                 ├─ [event is None] → return (yield vacío)
                 ├─ debounce: 5s ventana por user (VIP omite debounce)
                 ├─ printer.verificar_estado()
                 ├─ db.verificar_horario() → consulta BD configuracion
                 ├─ db.obtener_nombre_real(user_id) → BD usuarios (inserta si nuevo)
                 ├─ db.registrar_evento(user_id, nombre):
                 │    ├─ _verificar_menu() → ¿dieta hoy?
                 │    ├─ _es_duplicado() → ¿ya comió?
                 │    ├─ _get_siguiente_ticket() → primer hueco disponible
                 │    └─ INSERT registros
                 └─ printer.imprimir_ticket_*() → TCP:9100 ESC/POS
```

---

## 5. Flujos de Datos Críticos

### 5.1 Evento Biométrico → Ticket Impreso → Dashboard

```
Empleado pone huella dactilar
      │
      ▼ TCP:4370  (pyzk protocol)
ZKTeco K40 genera AttendanceRecord
      │ {user_id, timestamp}
      ▼
Python::process_biometric_event()
      │
      ├─ [debounce < 5s] ──────────────────► return (ignorar rebote)
      │
      ├─ verificar_horario() ──► BD configuracion
      │   └─ [fuera horario] ──────────────► return (sin registro)
      │
      ├─ obtener_nombre_real(user_id) ──► BD usuarios
      │   └─ [user nuevo] ──────────────► INSERT usuarios
      │
      ├─ registrar_evento(user_id, nombre) ──► BD
      │   ├─ _verificar_menu() → ¿menu_diario.opcion=2 o tipo='Dieta'?
      │   ├─ _es_duplicado() → COUNT registros hoy
      │   ├─ _get_siguiente_ticket() → primer hueco en secuencia
      │   └─ INSERT registros {user_id, nombre, fecha, hora, descripcion, numero_ticket}
      │
      └─ imprimir_ticket_valido() ──► TCP:9100
            ├─ _imprimir_header(ticket_number)
            ├─ nombre, fecha, tipo (NORMAL/DIETA/GERENCIA)
            ├─ restricciones (SIN SOPA, SIN ARROZ si aplica)
            └─ _imprimir_footer() + p.cut()

(≤2 segundos después)
Node.js::checkNewRecords() [setInterval 2000ms]
      │ SELECT * FROM registros WHERE id > lastProcessedId ORDER BY id ASC
      └─ io.emit('new_log', {type, message, status})
              │
              ▼ Socket.IO (WebSocket o HTTP long-polling vía Nginx)
      Browser::LiveTerminal.jsx
      → addLog() → renderiza nuevo ítem en terminal en tiempo real
```

### 5.2 Login Admin → Acceso al Panel

```
Admin escribe usuario + contraseña en LoginForm
      │
      ▼ POST /api/admin/login  (limitadorLogin: 10/15min/IP)
      │
      ├─ validar username && password presentes → 400 si no
      ├─ SELECT FROM usuarios_impresion_manual WHERE username=? AND activo=1 AND rol='admin'
      ├─ rows.length === 0 → 401 "Usuario no encontrado o sin permisos"
      ├─ bcrypt.compare(password, user.password_hash)
      │   └─ !match → 401 "Contraseña incorrecta"
      │
      └─ jwt.sign({id, nombre, rol}, JWT_SECRET, {expiresIn: '8h'})
              │
              ▼ {success: true, token, user}
      Frontend guarda token en localStorage
              │
              ▼ Cada request subsiguiente:
      Authorization: Bearer <token>
              │
              ▼ checkAuth('admin')(req, res, next)
      jwt.verify(token, JWT_SECRET) → 401 si inválido/expirado
      req.adminUser = decoded → next()
              │
              ▼ checkAuth('superadmin') además verifica decoded.rol === 'superadmin'
```

### 5.3 Ticket Manual de Visita

```
Operador en ManualTicketModal
      │
      ├─ POST /api/manual-tickets/login {username, password}
      │   ├─ SELECT FROM usuarios_impresion_manual WHERE username=? AND activo=1
      │   └─ bcrypt.compare() → {user.id, user.nombre_real}
      │
      └─ POST /api/manual-tickets/print {visitorName, printedByUserId}
            ├─ verificar usuario activo en usuarios_impresion_manual
            ├─ verificar horario desde BD configuracion
            ├─ calcular siguiente ticket (idéntico a Python)
            ├─ INSERT log_tickets_manuales (auditoría)
            ├─ INSERT registros (user_id="VISITA_{timestamp}", descripcion="TICKET VISITA")
            └─ exec("python reprint_ticket.py --name --type --autoriza --ticket_number")
                    └─ printer.imprimir_ticket_visitante(visitante, autoriza, numero)
```

### 5.4 Selección de Menú Semanal

```
Empleado en /seleccion
      │
      ├─ GET /api/users/:zkId → {nombre, role, defaultMenuType}
      ├─ GET /api/menu/:zkId → selecciones de la semana actual
      │
      └─ (empleado hace cambios)
      │
      └─ POST /api/menu {userId, selections: [{date, option},...]}
            ├─ pool.getConnection() + beginTransaction()
            ├─ para cada selección:
            │   ├─ SELECT FROM menu_diario WHERE user_id=? AND fecha=?
            │   ├─ exists → UPDATE menu_diario SET opcion=?
            │   └─ !exists → INSERT menu_diario
            ├─ commit() / rollback() en error
            └─ io.emit('new_log', {type:'WEB', mensaje:'Menú actualizado...'})
```

---

## 6. Capa de Infraestructura

### Servicios systemd

| Servicio | Archivo | Puerto | Usuario | Restart |
|---------|---------|--------|---------|---------|
| `comedor-backend` | `comedor-backend.service` | 5002 | john | always / 5s |
| `comedor-worker` | `comedor-worker.service` | — | john | always / 5s |
| `nginx` | sistema | 5001 | www-data | sistema |

#### comedor-backend.service
```ini
[Unit]
Description=Comedor Backend (Node.js)
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=john
WorkingDirectory=/home/john/comedor/Tickets_Comedor/backend
EnvironmentFile=/etc/comedor/secrets.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
```

**Comandos de gestión:**
```bash
sudo systemctl status comedor-backend      # Ver estado
sudo systemctl restart comedor-backend     # Reiniciar
sudo journalctl -u comedor-backend -f      # Ver logs en vivo
sudo journalctl -u comedor-backend -n 100  # Ver últimas 100 líneas
```

### Gestión de secretos

Los secretos de producción viven en `/etc/comedor/secrets.env`:
- Propietario/permisos: `john:john 600` (solo john puede leer)
- Generado con: `sudo bash nginx/crear_secrets.sh`
- **No está en el repositorio git** (`.gitignore`)
- Leído por systemd vía `EnvironmentFile=` — no necesita `dotenv` en producción

Variables requeridas en `/etc/comedor/secrets.env`:
```bash
PORT=5002
NODE_ENV=production
DB_HOST=localhost
DB_USER=admin
DB_PASSWORD=<contraseña>
DB_NAME=control_comedor
DB_PORT=3306
ADMIN_JWT_SECRET=<128 chars hex aleatorio>
SMTP_SERVER=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=no-reply@detcuador.com
SMTP_PASS=<contraseña app>
EMAIL_DESTINO=agarcia@detcuador.com
IP_BIOMETRICO=150.36.200.12
IP_IMPRESORA=150.36.200.9
PUERTO_ZK=4370
CORS_ORIGINS=http://150.36.200.252:5001,http://100.76.97.125:5001
LOG_PATH=/var/log/comedor/backend-errors.log
```

### Topología de red

```
[Clientes LAN] ──:5001──► [Nginx] ──:5002 (127.0.0.1)──► [Express/Socket.IO]
                                                                  │
                                                          [MariaDB :3306]
                                                                  │
[Python worker] ──TCP:4370──► [ZKTeco 150.36.200.12]             │
[Python worker] ──TCP:9100──► [Impresora 150.36.200.9]           │
[Python worker] ──SMTP:587──► [smtp-mail.outlook.com]            │
[Python worker] ──────────────────────────────────────────────────┘
```

Express escucha en `127.0.0.1:5002` en producción (`NODE_ENV=production`). En desarrollo escucha en `0.0.0.0` para acceso directo sin Nginx.

### Configuración Nginx (detalles técnicos)

```nginx
# nginx/websocket_map.conf — incluido en http{} de nginx.conf
map $http_upgrade $connection_upgrade {
    default   upgrade;    # Petición WebSocket: Connection: Upgrade
    ''        keep-alive; # Petición HTTP polling: Connection: keep-alive
}
```

**Por qué el map en lugar de `Connection: "Upgrade"` fijo:**
Socket.IO usa WebSocket cuando el navegador lo soporta y cae a HTTP long-polling como fallback.
Un WebSocket requiere `Connection: Upgrade`. Una petición de HTTP polling requiere `Connection: keep-alive`.
Si se pone `Connection: Upgrade` en *todas* las peticiones a `/socket.io/`, los POLLs de Socket.IO fallan con error "Session ID unknown" porque Nginx no mantiene la conexión correctamente.

```nginx
# nginx/comedor.conf (sección crítica Socket.IO)
location /socket.io/ {
    proxy_pass http://127.0.0.1:5002;
    proxy_http_version 1.1;
    proxy_set_header Upgrade     $http_upgrade;
    proxy_set_header Connection  $connection_upgrade;  # ← variable del map
    proxy_buffering off;                               # ← crítico para long-polling
    proxy_read_timeout 3600s;                          # ← 1h para WebSockets persistentes
}
```

**Por qué `proxy_buffering off`:**
Nginx por defecto acumula la respuesta completa antes de enviarla al cliente. En HTTP long-polling, la respuesta no termina hasta que hay datos nuevos o se alcanza el timeout del cliente. Con buffering activo, el cliente nunca recibe la respuesta parcial. Con `off`, cada byte se reenvía inmediatamente al cliente.

---

## 7. Modelo de Datos

> **Referencia completa:** [DICCIONARIO_BASE_DATOS.md](DICCIONARIO_BASE_DATOS.md) — todas las columnas, tipos, dominios, índices y reglas de integridad, extraídos del esquema real de producción.

### Diagrama de tablas

```
usuarios
├── zk_id (PK, VARCHAR 50)      ← ID numérico del biométrico
├── nombre_completo
├── tipo_menu_predeterminado    ← 'Normal' | 'Dieta'
├── role                        ← rol descriptivo (ej. 'Operativo')
└── tipo_especial               ← NULL | 'VIP' | 'GERENCIA'  (migración 002 — ⚠️ PENDIENTE de aplicar en producción a julio 2026)

menu_diario
├── id (PK)
├── user_id (FK → usuarios.zk_id)
├── fecha
├── opcion                      ← 1=Normal, 2=Dieta
├── sin_sopa (BOOL)
└── sin_arroz (BOOL)

registros                       ← tabla central, fuente de toda estadística
├── id (PK)
├── user_id                     ← zk_id numérico O 'VISITA_{timestamp}'
├── nombre
├── fecha
├── hora
├── descripcion                 ← tipo de ticket (ver valores abajo)
└── numero_ticket

configuracion                   ← key-value del sistema
├── clave (PK)
└── valor
-- Claves: horario_activo, horario_inicio, horario_fin

usuarios_impresion_manual       ← operadores del módulo de tickets manuales
├── id (PK)
├── username (UNIQUE)
├── password_hash               ← bcrypt $2b$10$...
├── nombre_real
├── activo (BOOL)
├── rol                         ← 'admin' | 'operador' | 'superadmin'
└── created_at

log_tickets_manuales            ← auditoría de impresiones manuales
├── id (PK)
├── nombre_visitante
├── impreso_por_usuario_id (FK → usuarios_impresion_manual.id)
└── created_at
```

### Valores de `registros.descripcion`

| Valor | Generado por | Significado |
|-------|-------------|-------------|
| `TICKET ALMUERZO` | Python worker | Almuerzo normal, primera vez del día |
| `TICKET DIETA` | Python worker | Menú de dieta, primera vez del día |
| `TICKET GERENCIA` | Python worker | Usuario en lista de gerencia |
| `TICKET EXTRA` | Python worker | VIP, segunda visita al comedor |
| `INTENTO DE DUPLICADO` | Python worker | Usuario ya comió, no es VIP |
| `TICKET VISITA` | Node.js manualTicketRoutes | Visitante/proveedor externo |
| `TICKET TERCERO` | Node.js manualTicketRoutes | Empleado sin poder ir al biométrico |

*Nota: Existen registros legacy con minúsculas ('Ticket Almuerzo', etc.) de versiones anteriores. El sistema los soporta en todas las queries mediante constantes que incluyen ambas formas.*

### Lógica de determinación de tipo de ticket

```
Evento para user_id X:
  │
  ├─ [X in IDS_CON_ESPECIAL ('16','119','120')] ──────────► TICKET GERENCIA
  │
  ├─ [ya_comio = true]
  │   ├─ [X in IDS_VIPS ('14','27')] ────────────────────► TICKET EXTRA
  │   └─ [else] ─────────────────────────────────────────► INTENTO DE DUPLICADO
  │
  └─ [ya_comio = false]
      ├─ [menu_diario.opcion = 2 HOY] ───────────────────► TICKET DIETA
      ├─ [sin menu_diario Y tipo_menu_predeterminado='Dieta'] ► TICKET DIETA
      └─ [else] ─────────────────────────────────────────► TICKET ALMUERZO
```

### Algoritmo de numeración sin colisiones

Utilizado tanto en Python (`database.py::_get_siguiente_ticket`) como en Node.js (`manualTicketRoutes.js`) para garantizar consistencia cuando ambos procesos insertan simultáneamente:

```python
# Obtener números usados hoy en orden ASC
used_numbers = [1, 2, 4, 5, 7]  # ejemplo con huecos

ticket_number = 1
for n in used_numbers:
    if n == ticket_number:
        ticket_number += 1   # ocupado, intentar siguiente
    elif n > ticket_number:
        break                # hueco encontrado — usar ticket_number actual
# resultado: 3 (primer hueco disponible)
```

Este enfoque llena huecos dejados por registros eliminados o tickets de mantenimiento, asegurando una secuencia densa sin vacíos.

---

## 8. Seguridad en Profundidad

### Modelo de amenazas y controles implementados

| Amenaza | Control | Ubicación |
|---------|---------|-----------|
| Credenciales hardcodeadas | Variables de entorno + `process.exit(1)` si falta `ADMIN_JWT_SECRET` | `adminRoutes.js:12-16` |
| Brute force en login | Rate limit: 10 intentos / 15 min por IP | `server.js:80-86` |
| JWT sin caducidad | `expiresIn: '8h'` | `adminRoutes.js:57` |
| JWT con secret débil | `ADMIN_JWT_SECRET` generado como 128 hex chars aleatorios | `nginx/crear_secrets.sh:11` |
| CORS no controlado | Whitelist dinámica desde `CORS_ORIGINS` env var | `server.js:28-45` |
| SQL injection | `mysql2.execute()` con parámetros `?` en todas las queries | `db.js:24-33` |
| Acceso directo a Express | Express escucha solo en `127.0.0.1` en producción | `server.js:22` |
| Secretos en repositorio git | `/etc/comedor/secrets.env` fuera del repo, en `.gitignore` | `.gitignore` |
| IP cliente manipulada | `app.set('trust proxy', 1)` — confía en `X-Forwarded-For` de Nginx | `server.js:24` |
| DoS por requests masivos | 3 rate limiters escalonados (200, 30, 10 req/período) | `server.js:80-107` |
| Escalada de privilegios admin→superadmin | JWT payload verifica `decoded.rol === 'superadmin'` | `adminRoutes.js:26` |
| Exposición de stack traces | Errores de BD/servidor retornan mensaje genérico al cliente | todos los routes |
| Password en texto plano | bcrypt con `saltOrRounds=10` para todos los passwords | `adminRoutes.js:111`, `manualTicketRoutes.js:36` |

### Controles pendientes de mejora

| Riesgo | Estado | Impacto | Esfuerzo |
|--------|--------|---------|----------|
| `manualTicketRoutes.js` CRUD sin JWT (`/users` GET/POST/PUT/DELETE) | Abierto | Medio | 1h |
| `multipleStatements: true` en `db.js` | Abierto | Bajo | 30min |
| IDs especiales hardcodeados en Python | Abierto | Bajo (mantenibilidad) | 2h |

### Gestión del ciclo de vida de secretos

```bash
# Generación inicial
sudo bash nginx/crear_secrets.sh
# → genera ADMIN_JWT_SECRET = node crypto.randomBytes(64).hex() (128 chars)

# Permisos aplicados automáticamente
chown john:john /etc/comedor/secrets.env
chmod 600 /etc/comedor/secrets.env

# Rotación de JWT secret
sudo nano /etc/comedor/secrets.env      # cambiar ADMIN_JWT_SECRET
sudo systemctl restart comedor-backend  # invalida todos los tokens activos

# Verificación
sudo cat /etc/comedor/secrets.env       # requiere sudo o ser john
```

---

## 9. Patrones de Diseño Implementados

### Repository Pattern (`statsRepository.js`)

```javascript
class StatsRepository {
    async getSummary(req) { ... }  // estadísticas del día o rango
    async getDaily(req)   { ... }  // histórico agrupado por día
    async getHistory(req) { ... }  // historial paginado con filtros
    async getExport(req)  { ... }  // exportación sin límite para Excel
}

// Exportado como singleton
module.exports = new StatsRepository();
// También exporta la función de caché para uso en configRoutes.js
module.exports.obtenerEspecialesCacheado = obtenerEspecialesCacheado;
```

El controlador de rutas (`dashboardRoutes.js`) solo llama métodos del repositorio y no contiene ninguna query SQL directa.

### Strategy Pattern (tipos de ticket)

La lógica de determinación del tipo de ticket está encapsulada en `Database.registrar_evento()`. Los llamadores (`process_biometric_event`, `manualTicketRoutes`) solo pasan el `user_id` y obtienen `(tipo_evento, numero_ticket)`. Las reglas de negocio (VIP, GERENCIA, duplicado) no se filtran hacia afuera.

### Observer Pattern (Socket.IO)

```
Python Worker ──INSERT──► MariaDB::registros
                                    ▲
                 Node.js polling cada 2s (checkNewRecords)
                                    │
                 io.emit('new_log', {type, message, status})
                                    │
                 Socket.IO ──► todos los browsers conectados
                 LiveTerminal.jsx::addLog() ──► re-render
```

### Cache-Aside Pattern (`obtenerEspecialesCacheado`)

```javascript
let _cacheEspeciales = null;
let _cacheEspecialesTs = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function obtenerEspecialesCacheado() {
    // Cache hit
    if (_cacheEspeciales && (Date.now() - _cacheEspecialesTs < CACHE_TTL)) {
        return _cacheEspeciales;
    }
    // Cache miss: leer de BD y actualizar
    const rows = await db.query('SELECT zk_id, tipo_especial FROM usuarios WHERE tipo_especial IS NOT NULL');
    _cacheEspeciales = {
        vips:     rows.filter(r => r.tipo_especial === 'VIP').map(r => String(r.zk_id)),
        gerencia: rows.filter(r => r.tipo_especial === 'GERENCIA').map(r => String(r.zk_id))
    };
    _cacheEspecialesTs = Date.now();
    return _cacheEspeciales;
}
```

### Singleton (módulos Node.js)

`db.js` exporta un pool de conexiones único. `statsRepository.js` exporta una instancia única. Al ser cargados vía `require()`, Node.js los cachea y retorna la misma instancia en todos los módulos que los importan.

### Template Method Pattern (impresión de tickets)

```python
class TicketPrinter:
    def _imprimir_header(self, p, ticket_number):  # template step
        # logo, empresa, número de ticket
    
    def _imprimir_footer(self, p):                  # template step
        # separador, "VALIDO POR 1 ALMUERZO", corte
    
    def imprimir_ticket_valido(self, ...):          # concrete method
        p = self._conectar()
        self._imprimir_header(p, ticket_number)     # usa template
        # ... contenido específico ...
        self._imprimir_footer(p)                    # usa template
```

### Debounce Pattern (biométrico)

```python
last_scan_time = {}  # {user_id: timestamp}

# Limpieza periódica para evitar memory leak
keys_to_delete = [k for k, t in last_scan_time.items() if current_time - t > 10]
for k in keys_to_delete:
    del last_scan_time[k]

# Verificación de rebote (excepto VIPs)
if not es_vip:
    if user_id_str in last_scan_time and (current_time - last_scan_time[user_id_str] < 5):
        return  # ignorar rebote
    last_scan_time[user_id_str] = current_time
```

---

## 10. Decisiones Arquitectónicas (ADR)

### ADR-001: Python separado de Node.js para hardware

**Contexto:** El acceso al biométrico ZKTeco y la impresora ESC/POS requiere librerías específicas de Python.

**Decisión:** Proceso Python completamente separado, comunicado con Node.js únicamente vía MariaDB (no IPC directo).

**Razón:** `pyzk` (biométrico) y `python-escpos` (impresora) solo existen en Python. Forzar integración en Node.js requeriría wrappers frágiles o bindings nativos complejos con alto riesgo de fallos en producción.

**Consecuencias:**
- (+) Cada proceso es independientemente reiniciable sin afectar al otro.
- (+) Fallos del hardware no afectan la disponibilidad de la API web.
- (-) Máximo 2 segundos de latencia para que un evento biométrico aparezca en el dashboard.
- (-) Si ambos procesos insertan tickets simultáneamente, deben coordinarse vía algoritmo de numeración idéntico.

### ADR-002: Polling de BD en lugar de pub/sub

**Contexto:** Se necesita que el frontend reciba eventos del worker Python en tiempo real.

**Decisión:** Node.js consulta MariaDB cada 2 segundos buscando registros con `id > lastProcessedId`.

**Razón:** Evita introducir Redis o RabbitMQ como dependencia adicional en un sistema de ~140 usuarios con ≤20 eventos biométricos concurrentes en hora punta.

**Consecuencias:**
- (+) Sin dependencias adicionales de infraestructura.
- (-) ~43.200 consultas SQL vacías al día si no hay eventos. Con índice en `id`, el costo es mínimo.
- (-) Latencia máxima de 2 segundos entre evento y visualización.

### ADR-003: Nginx como único punto de entrada

**Contexto:** Se necesita servir archivos estáticos del frontend y la API REST desde el mismo origen.

**Decisión:** Nginx en `:5001` como proxy inverso. Express enlazado solo a `127.0.0.1:5002`.

**Razón:**
1. Nginx sirve archivos estáticos 10x más eficientemente que Express (sendfile, zero-copy).
2. Cache de 30 días para assets Vite (que llevan hash en el nombre) sin código adicional en Express.
3. Express queda aislado de la red, reduciendo superficie de ataque.
4. Preparado para agregar SSL en Nginx sin modificar código de la aplicación.

### ADR-004: JWT para admin, sesión simple para operadores

**Contexto:** Se necesita autenticación diferenciada para el panel admin (alto riesgo) y los operadores de impresión manual (bajo riesgo).

**Decisión:** Panel admin usa JWT HMAC-SHA256 con expiración de 8h. Operadores usan sesión en localStorage sin JWT.

**Razón:** Los operadores solo tienen acceso a imprimir tickets, operación auditada en `log_tickets_manuales`. La complejidad de gestionar JWT para ~5 operadores no justifica el beneficio en este contexto.

**Consecuencia conocida:** Los endpoints CRUD de `manualTicketRoutes.js` (`/users` GET/POST/PUT/DELETE) no requieren autenticación. Identificado como mejora pendiente.

### ADR-005: Secretos en archivo separado del repositorio

**Decisión:** Todos los secretos de producción en `/etc/comedor/secrets.env`, fuera del repositorio git.

**Razón:** El repositorio puede compartirse o hacerse público en el futuro. Las credenciales de producción (BD, JWT secret, SMTP, IPs) no deben estar en el historial de git.

**Implementación:** systemd `EnvironmentFile=/etc/comedor/secrets.env` inyecta las variables al proceso en tiempo de arranque. El archivo tiene permisos `600` (solo el usuario `john` puede leerlo).

---

## 11. Limitaciones y Deuda Técnica

### Deuda técnica priorizada

| Prioridad | Ítem | Archivo | Esfuerzo |
|-----------|------|---------|----------|
| Alta | CRUD operadores sin JWT en `manualTicketRoutes.js` | `manualTicketRoutes.js:17-79` | 1h |
| Alta | Python worker con IDs hardcodeados en lugar de consumir `/api/config/especiales` | `database.py:44-45` | 2h |
| Media | `IDS_CON_ESPECIAL` duplicado en manualTicketRoutes | `manualTicketRoutes.js:300` | 30min |
| Media | `multipleStatements: true` en mysql2 (innecesario) | `db.js:15` | 30min |
| Baja | `reimprimir_ticket()` duplica ~60% del código de `imprimir_ticket_valido()` | `printer.py:278-335` | 1h |
| Baja | `process_biometric_event` definida dentro de `main()` (dificulta testing) | `main.py:66` | 2h refactor |
| Baja | Python usa root logger en lugar de `logging.getLogger(__name__)` | `main.py:20-25` | 30min |

### Limitaciones de diseño actuales

1. **Sin SSL nativo** — Nginx escucha en HTTP puro (`:5001`). Aceptable dentro de LAN corporativa; requiere certificado TLS para acceso externo o desde internet.
2. **Sin cola de reintento en impresión** — Si la termoimpresora falla, el ticket queda registrado en BD pero no impreso. No hay mecanismo automático de reintento.
3. **Sin redundancia de servidor** — Un único servidor. Si cae, el sistema es inaccesible hasta reinicio manual.
4. **Polling cada 2s en Node.js** — Latencia máxima de 2s entre registro biométrico y visualización en dashboard. Aceptable para este caso de uso; no escalable a miles de eventos/minuto.
5. **Sin invalidación de JWT por logout** — Los tokens JWT son válidos hasta su expiración (8h) aunque el admin cierre sesión. Mitigable con una lista negra en Redis si fuera necesario.
