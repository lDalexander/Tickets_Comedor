# Informe Técnico del Sistema SIGAC
## Sistema de Gestión de Acceso al Comedor — DETCUADOR S.A.

**Versión:** 6.0 (Post-Hardening de Seguridad)  
**Fecha:** Mayo 2026  
**Autor:** John Garcia — Departamento de Sistemas / TI  
**Ubicación del código:** `/home/john/comedor/Tickets_Comedor/`  

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Stack Tecnológico Completo](#2-stack-tecnológico-completo)
3. [Estructura del Proyecto](#3-estructura-del-proyecto)
4. [Módulos del Sistema](#4-módulos-del-sistema)
5. [Seguridad: Vulnerabilidades Resueltas](#5-seguridad-vulnerabilidades-resueltas)
6. [Análisis de Calidad del Código](#6-análisis-de-calidad-del-código)
7. [Suite de Tests](#7-suite-de-tests)
8. [Infraestructura de Producción](#8-infraestructura-de-producción)
9. [Métricas del Sistema](#9-métricas-del-sistema)
10. [Historial de Versiones](#10-historial-de-versiones)
11. [Trabajo Pendiente](#11-trabajo-pendiente)

---

## 1. Resumen Ejecutivo

SIGAC (Sistema de Gestión de Acceso al Comedor) es una solución corporativa completa desarrollada internamente por el Departamento de TI de DETCUADOR S.A. para gestionar el control biométrico de almuerzos del personal.

### ¿Qué resuelve?

Antes de SIGAC, el control de almuerzos se realizaba manualmente mediante listas físicas, sin auditoría, sin datos históricos y sin mecanismo para detectar intentos de duplicación. SIGAC automatiza completamente este proceso:

1. **El empleado pone el dedo** en el lector biométrico ZKTeco K40.
2. **El sistema identifica** al empleado, verifica si ya almorzó, y determina el tipo de ticket.
3. **Se imprime automáticamente** el ticket en la termoimpresora.
4. **El dashboard web** refleja el evento en tiempo real (< 2 segundos).
5. **Los administradores** pueden gestionar configuración, consultar estadísticas y exportar datos desde el navegador.

### Estado actual (Mayo 2026)

El sistema lleva operando desde Enero 2026. Ha pasado por una revisión completa de seguridad y calidad en Mayo 2026 que resolvió todas las vulnerabilidades críticas identificadas:

| Aspecto | Estado |
|---------|--------|
| Vulnerabilidades FATALES | 0 (resueltas en hardening v3.2) |
| Cobertura de tests | 19+ casos de prueba |
| Uptime estimado | > 99% |
| Usuarios registrados | ~140 empleados |
| Promedio diario de almuerzos | ~90-100 tickets |

---

## 2. Stack Tecnológico Completo

### Backend — Node.js

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| `express` | 5.2.1 | Framework web HTTP |
| `socket.io` | 4.8.3 | Comunicación en tiempo real (WebSocket + polling) |
| `mysql2` | 3.16.2 | Driver MariaDB con connection pool |
| `jsonwebtoken` | 9.0.3 | JWT para autenticación admin |
| `bcrypt` | 6.0.0 | Hash de contraseñas |
| `express-rate-limit` | 8.5.1 | Rate limiting por IP |
| `cors` | 2.8.6 | CORS configurable |
| `winston` | 3.19.0 | Logging estructurado JSON |
| `dotenv` | 17.2.3 | Variables de entorno en desarrollo |
| `exceljs` | 4.4.0 | Exportación a Excel (.xlsx) |
| `jest` | 30.4.2 | Framework de tests |
| `supertest` | 7.2.2 | HTTP testing para tests de integración |

### Backend — Python

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| `pyzk` | latest | Protocolo ZKTeco (TCP biométrico) |
| `python-escpos` | latest | Control termoimpresora ESC/POS |
| `mysql-connector-python` | latest | Driver MariaDB con pool |
| `python-dotenv` | latest | Variables de entorno |

### Frontend — React

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| `react` | 18.x | UI framework |
| `react-dom` | 18.x | DOM renderer |
| `react-router-dom` | 7.x | SPA routing |
| `socket.io-client` | 4.x | Cliente Socket.IO |
| `swr` | 2.x | Data fetching con revalidación |
| `axios` | 1.x | Cliente HTTP |
| `chart.js` + `react-chartjs-2` | 4.x / 5.x | Gráficos de estadísticas |
| `lucide-react` | 0.292 | Iconos |
| `vite` | 5.x | Build tool + dev server |

### Infraestructura

| Componente | Tecnología | Versión |
|-----------|-----------|---------|
| Proxy reverso | Nginx | 1.24+ |
| Base de datos | MariaDB | 10.4 |
| Sistema operativo | Ubuntu | 22.04 LTS |
| Gestión de procesos | systemd | — |

---

## 3. Estructura del Proyecto

```
Tickets_Comedor/
├── backend/
│   ├── server.js                    ← Entry point Node.js
│   ├── db.js                        ← mysql2 pool + query helper
│   ├── package.json                 ← dependencias + config Jest
│   ├── .env.example                 ← template de variables de entorno
│   ├── logs/
│   │   ├── combined.log             ← log completo Winston (info+error)
│   │   └── error.log                ← solo errores Winston
│   ├── migrations/
│   │   └── 001_add_admin_role.js    ← migración de usuarios admin
│   ├── python_core/
│   │   ├── main.py                  ← worker biométrico 24/7
│   │   ├── reprint_ticket.py        ← CLI de reimpresión
│   │   ├── send_maintenance_status.py ← notificación de mantenimiento
│   │   ├── requirements.txt         ← dependencias Python
│   │   ├── .env.example             ← template Python
│   │   └── src/
│   │       ├── database.py          ← clase Database (pool + lógica de negocio)
│   │       └── printer.py           ← clase TicketPrinter (ESC/POS + SMTP)
│   ├── repositories/
│   │   └── statsRepository.js       ← Repository Pattern + caché especiales
│   ├── routes/
│   │   ├── adminRoutes.js           ← JWT-auth: CRUD, login, reimpresión
│   │   ├── configRoutes.js          ← configuración + IDs especiales
│   │   ├── dashboardRoutes.js       ← estadísticas, historial, export
│   │   └── manualTicketRoutes.js    ← login operador, tickets visita/tercero
│   ├── tests/
│   │   ├── setup.js                 ← env de test (JWT, DB, PORT)
│   │   ├── auth.test.js             ← 7 tests autenticación JWT
│   │   ├── config.test.js           ← 4 tests config y especiales
│   │   ├── tickets.test.js          ← 6 tests tickets manuales
│   │   └── rateLimit.test.js        ← 2 tests rate limiting (429)
│   └── utils/
│       └── logger.js                ← Winston JSON + logError() helper
├── frontend/
│   ├── src/
│   │   ├── App.jsx                  ← Router principal (4 rutas)
│   │   ├── main.jsx                 ← entry point React
│   │   ├── index.css                ← estilos globales glassmorphism
│   │   ├── components/
│   │   │   ├── Dashboard.jsx        ← vista principal
│   │   │   ├── LiveTerminal.jsx     ← terminal en tiempo real
│   │   │   ├── Charts.jsx           ← gráficos Chart.js
│   │   │   ├── StatCard.jsx         ← tarjeta de estadística
│   │   │   ├── MenuSelection.jsx    ← selección menú semanal
│   │   │   ├── ManualTicketModal.jsx ← modal ticket visita
│   │   │   ├── ThirdPartyTicketModal.jsx ← modal ticket tercero
│   │   │   ├── Admin/               ← (deprecated — reemplazado por AdminV2)
│   │   │   └── AdminV2/
│   │   │       ├── AdminV2Panel.jsx ← panel admin completo
│   │   │       └── ...              ← sub-componentes admin
│   │   └── hooks/                   ← custom React hooks
│   ├── dist/                        ← build de producción (no en git)
│   └── package.json
├── sql/
│   ├── control_comedor.sql          ← esquema completo + datos iniciales
│   └── migrations/
│       ├── 001_add_admin_role.sql   ← migración inicial roles
│       └── 002_add_tipo_especial.sql ← columna tipo_especial en usuarios
├── nginx/
│   ├── comedor.conf                 ← config Nginx del servidor
│   ├── websocket_map.conf           ← mapa Connection para WebSocket
│   ├── crear_secrets.sh             ← generador de /etc/comedor/secrets.env
│   └── instalar.sh                  ← instalador completo del sistema
├── documentacion/
│   ├── README.md                    ← guía de desarrollo
│   ├── ARCHITECTURE.md              ← arquitectura C4 + ADR + patrones
│   ├── API_REFERENCE.md             ← referencia completa de API
│   ├── INFORME_TECNICO.md           ← este documento
│   ├── MANUAL_OPERACIONES.md        ← operaciones y mantenimiento
│   ├── GUIA_SOLUCION_PROBLEMAS.md  ← troubleshooting
│   ├── INFORME_A_GERENCIA.md        ← resumen ejecutivo para dirección
│   └── GUIA_ESTUDIANTES.md          ← onboarding de nuevos desarrolladores
├── comedor-backend.service          ← systemd: Node.js
├── comedor-frontend.service         ← systemd: (obsoleto, Nginx lo reemplazó)
├── comedor-worker.service           ← systemd: Python worker
├── deploy_frontend.sh               ← script de despliegue frontend
└── README.md                        ← índice del repositorio
```

---

## 4. Módulos del Sistema

### 4.1 Worker Biométrico (`python_core/main.py`)

El núcleo del sistema. Proceso Python que corre 24/7 como servicio systemd.

**Responsabilidades:**
- Mantener conexión TCP persistente al biométrico ZKTeco (puerto 4370)
- Capturar eventos de huella dactilar en tiempo real (`live_capture`)
- Determinar el tipo de ticket a emitir según las reglas de negocio
- Registrar el evento en la base de datos
- Controlar la termoimpresora ESC/POS via TCP (puerto 9100)
- Enviar alertas por email ante cambios de estado de la impresora

**Características de resiliencia:**
- Debounce de 5 segundos para evitar doble marcación
- Reconexión automática ante desconexión del biométrico (5s delay)
- Reconexión por cambio de día (limpieza de socket TCP)
- Reconexión por inactividad de 2 horas (previene TCP drop silencioso)
- Hilo secundario de monitoreo: verifica impresora y sincroniza usuarios cada 12 horas
- Limpieza del diccionario `last_scan_time` para evitar memory leak

### 4.2 API REST + Socket.IO (`backend/server.js` y rutas)

**Responsabilidades:**
- Exponer la API REST bajo `/api/` con Express 5
- Gestionar conexiones WebSocket vía Socket.IO 4
- Hacer polling a MariaDB cada 2 segundos → emitir eventos `new_log`
- Servir los archivos estáticos del frontend compilado (fallback cuando Nginx no está)
- Aplicar rate limiting, CORS, autenticación JWT

**Rutas:**

| Módulo | Base URL | Auth | Propósito |
|--------|---------|------|-----------|
| Admin | `/api/admin` | JWT (admin/superadmin) | Login, CRUD BD, reimpresión |
| Config | `/api/config` | GET: ninguna; POST: JWT | Horario, IDs especiales |
| Dashboard | `/api` | Ninguna | Estadísticas, historial, export |
| Manual Tickets | `/api/manual-tickets` | Credencial simple | Visitas, terceros |

### 4.3 Frontend SPA (`frontend/src/`)

**Rutas:**
- `/` — Dashboard principal con estadísticas, gráficos y terminal en vivo
- `/seleccion` — Selección de menú semanal por empleado
- `/admin-v2` — Panel de administración completo (protegido con JWT)
- `/admin` → redirige a `/admin-v2`

**Características técnicas:**
- SWR para data fetching con revalidación automática cada 60 segundos
- Socket.IO client para actualizaciones en tiempo real sin polling manual
- Glassmorphism como sistema visual (fondo difuminado, bordes translúcidos)
- React Router DOM v7 con navegación del lado del cliente
- Chart.js 4 + react-chartjs-2 para gráficos de estadísticas

### 4.4 Panel AdminV2 (`frontend/src/components/AdminV2/`)

El panel de administración completo reemplaza el antiguo `AdminPanel` y `SuperAdminPanel` (archivados en `frontend/src/_deprecated/`). Login con credenciales de administrador → JWT almacenado en `localStorage` (`comedor_admin_token`, expira a las 8 horas). La navegación es por secciones (sidebar responsive con drawer en móvil):

| Sección | Archivo (`sections/`) | Qué hace | Endpoints principales |
|---------|----------------------|----------|----------------------|
| **Resumen** | `ResumenSection.jsx` | Estado del sistema (BD/API) y totales del día en tarjetas | `GET /api/stats/summary`, `GET /api/health` |
| **Registros** | `RegistrosSection.jsx` | Historial filtrable (fechas, tipo); reimprimir, editar y eliminar registros; exportar Excel administrativo | `GET /api/stats/history`, `POST /api/admin/reprint`, `PUT/DELETE /api/admin/data/registros/id/:id`, `GET /api/admin/report/excel` |
| **Empleados** | `EmpleadosSection.jsx` | Edición inline de rol y menú predeterminado de empleados del biométrico | `GET /api/admin/data/usuarios`, `PUT /api/admin/data/usuarios/zk_id/:id` |
| **Operadores** | `OperadoresSection.jsx` | CRUD de cuentas del panel (crear, renombrar, activar/desactivar, cambiar rol admin↔operador) | `GET/POST/PUT/DELETE /api/manual-tickets/users`, `PUT /api/admin/data/usuarios_impresion_manual/id/:id` |
| **Configuración** | `ConfiguracionSection.jsx` | Horario de servicio (activar restricción, hora inicio/fin) | `GET /api/config`, `POST /api/config` |
| **Auditoría** | `AuditoriaSection.jsx` | Trazabilidad de tickets manuales: quién imprimió qué y cuándo | `GET /api/admin/data/log_tickets_manuales`, `GET /api/manual-tickets/users` |

---

## 5. Seguridad: Vulnerabilidades Resueltas

### Versión pre-hardening (antes de Mayo 2026)

La versión 3.1 tenía **5 vulnerabilidades FATALES**:

| # | Vulnerabilidad | Severidad | CVSS estimado |
|---|---------------|-----------|---------------|
| F-1 | `ADMIN_SECRET='admin123'` hardcodeado en `adminRoutes.js` | CRÍTICO | 9.8 |
| F-2 | `SUPER_SECRET='supersecret'` hardcodeado en `adminRoutes.js` | CRÍTICO | 9.8 |
| F-3 | Endpoint `POST /api/admin/query` ejecutaba SQL arbitrario sin sanitización | CRÍTICO | 9.1 |
| F-4 | JWT_SECRET con fallback `'development-secret-key'` si no había env var | ALTO | 8.1 |
| F-5 | Credenciales en historial de git (SMTP, DB password, IPs) | ALTO | 7.5 |

### Cambios implementados en v3.2

**F-1 y F-2 — Eliminación de credenciales hardcodeadas:**
```javascript
// ANTES (FATAL):
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';

// DESPUÉS (SEGURO):
const JWT_SECRET = process.env.ADMIN_JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL: ADMIN_JWT_SECRET no configurada.');
    process.exit(1);  // El servidor no arranca sin el secret
}
```

**F-3 — Eliminación del endpoint SQL arbitrario:**
```javascript
// ELIMINADO COMPLETAMENTE:
// router.post('/query', checkAuth('admin'), async (req, res) => {
//     const [rows] = await pool.query(req.body.sql);  // ← SQL injection total
//     res.json(rows);
// });
```

**F-4 — JWT sin fallback inseguro:**
El `process.exit(1)` garantiza que si `ADMIN_JWT_SECRET` no está configurada, el servidor no arranca en absoluto, en lugar de usar una clave débil predecible.

**F-5 — Secretos fuera del repositorio:**
- Creado `/etc/comedor/secrets.env` con permisos `600`
- Script `nginx/crear_secrets.sh` genera `ADMIN_JWT_SECRET` aleatorio de 128 caracteres hex
- Documentado procedimiento de rotación de credenciales
- `.gitignore` protege `.env` en todos los subdirectorios

### Mejoras adicionales de seguridad implementadas

**Rate Limiting (3 niveles):**
```javascript
// Login: 10 intentos cada 15 minutos (por IP)
const limitadorLogin = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

// Tickets manuales: 30/minuto
const limitadorTickets = rateLimit({ windowMs: 60 * 1000, max: 30 });

// API general: 200/minuto
const limitadorGeneral = rateLimit({ windowMs: 60 * 1000, max: 200 });
```

**CORS dinámico:**
```javascript
const ORIGENES_PERMITIDOS = (process.env.CORS_ORIGINS || '')
    .split(',').map(o => o.trim()).filter(Boolean);
```
Sin hardcoding de IPs en el código.

**Trust proxy correcto:**
```javascript
app.set('trust proxy', 1);
```
Permite que el rate limiter use la IP real del cliente (no la IP de Nginx) cuando Express está detrás de un proxy.

**Express en localhost en producción:**
```javascript
const BIND_HOST = process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0';
```
Express no es accesible directamente desde la red en producción.

---

## 6. Análisis de Calidad del Código

### Evaluación contra Python Clean Code (testdriven.io)

| Regla | Estado | Detalle |
|-------|--------|---------|
| Nombres descriptivos (variables, funciones) | BIEN | `registrar_evento`, `verificar_horario`, `_es_duplicado` son autoexplicativos |
| Funciones pequeñas y de una sola responsabilidad | BIEN | `_verificar_menu`, `_es_duplicado`, `_get_siguiente_ticket` bien separadas |
| Evitar números mágicos | PARCIAL | `5` y `5000` para debounce sin constante nombrada; `9100` sin constante |
| Type hints completos | PARCIAL | `database.py` tiene hints en la mayoría; `main.py` los tiene solo en `process_biometric_event` |
| Docstrings | BIEN | Todas las clases y métodos públicos documentados en español |
| DRY (Don't Repeat Yourself) | PARCIAL | `imprimir_ticket_valido` y `reimprimir_ticket` comparten ~60% del código |
| SOLID - Single Responsibility | BIEN | `Database` solo maneja BD, `TicketPrinter` solo maneja hardware |
| SOLID - Open/Closed | BIEN | Nuevos tipos de ticket se añaden modificando solo `registrar_evento` |
| Manejo de excepciones | BIEN | Todos los métodos usan try/except con logging y valores de retorno seguros |
| Logging apropiado | PARCIAL | Usa root logger en lugar de `logging.getLogger(__name__)` |
| PEP 8 | BIEN | Nombres snake_case, 4 espacios, líneas razonables |
| Separación en módulos | BIEN | `src/database.py`, `src/printer.py` bien separados |

### Evaluación del backend Node.js

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| Organización en capas | EXCELENTE | router → repository → db |
| Repository Pattern | EXCELENTE | `statsRepository.js` centraliza todas las queries |
| Manejo de errores | BIEN | `logError()` con contexto, mensajes genéricos al cliente |
| Rate limiting | EXCELENTE | 3 niveles escalonados correctamente configurados |
| Validación de entrada | BIEN | Fechas validadas en repository, campos requeridos verificados |
| Logging | BIEN | Winston JSON con timestamp, separación error/combined |
| Testing | BIEN | Jest + Supertest, 19+ tests, mocks de BD |
| Seguridad | EXCELENTE | JWT fail-fast, CORS dinámico, trust proxy |
| Complejidad ciclomática | ACEPTABLE | `manualTicketRoutes.js` tiene funciones largas (print-tercero ~80 líneas) |

### Evaluación del frontend React

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| Composición de componentes | BIEN | Componentes atómicos (StatCard, Charts) bien separados |
| Gestión de estado | BIEN | SWR para server state, useState para UI state |
| Actualizaciones en tiempo real | BIEN | Socket.IO integrado correctamente en useEffect con cleanup |
| Routing | BIEN | React Router v7 con redirect `/admin` → `/admin-v2` |
| Diseño visual | BIEN | Glassmorphism cohesivo, responsive |
| Código deprecated | BIEN | `Admin/` movido a `_deprecated/` con comentarios claros |
| Accesibilidad | NO EVALUADO | Sin tests de accesibilidad |

---

## 7. Suite de Tests

Los tests viven en `backend/tests/` y usan Jest + Supertest.

### Estructura

```
tests/
├── setup.js            ← variables de entorno para tests
├── auth.test.js        ← autenticación JWT (7 tests)
├── config.test.js      ← configuración y especiales (4 tests)
├── tickets.test.js     ← tickets manuales (6 tests)
└── rateLimit.test.js   ← rate limiting 429 (2 tests)
```

### Tests por archivo

#### `auth.test.js` (7 tests)
1. Login exitoso → retorna token JWT
2. Contraseña incorrecta → 401
3. Usuario no encontrado → 401
4. Body vacío → 400
5. Sin token → 403
6. Token expirado → 401
7. Token válido llega al handler → 200

#### `config.test.js` (4 tests)
1. GET /config devuelve objeto key-value
2. GET /config/especiales devuelve `{vips, gerencia}`
3. POST /config sin auth → 403
4. POST /config con auth → 200

#### `tickets.test.js` (6 tests)
1. Login operador exitoso
2. Login operador inactivo → 401
3. Print sin datos → 400
4. Print visita exitoso (mock Python exec)
5. Print tercero — usuario no autorizado → 403
6. Print tercero — duplicado → 409

#### `rateLimit.test.js` (2 tests)
1. 10 intentos de login → todos retornan 401
2. Undécimo intento → 429

### Ejecutar tests

```bash
cd backend

# Todos los tests
npm test

# Con cobertura
npm run test:coverage

# En modo watch (durante desarrollo)
npm run test:watch

# Un archivo específico
npx jest tests/auth.test.js
```

### Setup de tests (`tests/setup.js`)

```javascript
process.env.ADMIN_JWT_SECRET = 'test-jwt-secret-for-jest-do-not-use-in-production';
process.env.DB_NAME = 'control_comedor_test';
process.env.NODE_ENV = 'test';
process.env.PORT = '0';  // puerto aleatorio para tests en paralelo
```

Los tests mockean el módulo `../db` para no requerir una BD real:
```javascript
jest.mock('../db', () => ({
    query: jest.fn(),
    pool: { promise: () => ({ getConnection: jest.fn(), query: jest.fn() }) }
}));
```

---

## 8. Infraestructura de Producción

### Servidor

- **IP:** `150.36.200.252`
- **OS:** Ubuntu 22.04 LTS
- **Usuario del servicio:** `john`
- **Directorio del proyecto:** `/home/john/comedor/Tickets_Comedor/`

### Servicios systemd activos

```bash
comedor-backend.service   # Node.js Express en :5002 (localhost)
comedor-worker.service    # Python biométrico
nginx.service             # Proxy + static files en :5001
mysql.service             # MariaDB en :3306 (localhost)
```

### Archivos de configuración clave

| Archivo | Propósito |
|---------|-----------|
| `/etc/comedor/secrets.env` | Secretos de producción (perms 600) |
| `/etc/nginx/sites-enabled/comedor` | Enlace simbólico a `nginx/comedor.conf` |
| `/etc/nginx/conf.d/websocket_map.conf` | Mapa WebSocket/HTTP para Nginx |
| `/etc/systemd/system/comedor-backend.service` | Servicio Node.js |
| `/etc/systemd/system/comedor-worker.service` | Servicio Python |

### Logs en producción

| Log | Ubicación | Rotación |
|-----|-----------|---------|
| Backend combined | `backend/logs/combined.log` | Manual |
| Backend errors | `backend/logs/error.log` | Manual |
| Nginx access | `/var/log/nginx/comedor-access.log` | logrotate automático |
| Nginx error | `/var/log/nginx/comedor-error.log` | logrotate automático |
| systemd journal | `journalctl -u comedor-backend` | Automático (systemd-journald) |

---

## 9. Métricas del Sistema

### Capacidad y rendimiento estimados

| Métrica | Valor estimado |
|---------|---------------|
| Empleados simultáneos en hora punta | ~10-20 |
| Eventos biométricos por día | ~90-100 |
| Latencia biométrico → impresora | < 500ms |
| Latencia biométrico → dashboard | ≤ 2000ms |
| Conexiones BD concurrentes (Node) | hasta 10 |
| Conexiones BD concurrentes (Python) | hasta 5 |
| Consultas BD por segundo (polling) | ~0.5 (una cada 2s) |

### Espacio en disco estimado

| Componente | Espacio |
|-----------|---------|
| Código fuente (sin node_modules/dist) | ~5 MB |
| `node_modules` | ~200 MB |
| `frontend/dist` (build compilado) | ~5 MB |
| `backend/python_core/venv` | ~100 MB |
| BD MariaDB (1 año de datos) | ~50-100 MB |
| Logs Winston (sin rotar) | ~1-10 MB/mes |

---

## 10. Historial de Versiones

| Versión | Fecha | Cambios principales |
|---------|-------|---------------------|
| 1.0 | Ene 2026 | Primera versión funcional: biométrico + impresora + dashboard básico |
| 2.0 | Ene 2026 | Panel Admin, selección de menú semanal, tickets de visita |
| 3.0 | Feb 2026 | AdminV2, tickets tercero, exportación Excel, Socket.IO |
| 3.1 | Feb 2026 | Correcciones de bugs, integración Nginx inicial |
| 3.2 | May 2026 | **Hardening completo de seguridad:** eliminación credenciales hardcodeadas, endpoint SQL eliminado, rate limiting, CORS dinámico, JWT fail-fast, tests Jest, secretos en `/etc/comedor/secrets.env`, Nginx con WebSocket map correcto, caché de IDs especiales, `logError()` estructurado |

---

## 11. Trabajo Pendiente

### Prioridad Alta

1. **JWT para CRUD de operadores** — `manualTicketRoutes.js` líneas 17-79 no verifican JWT. Cualquiera con acceso a la red puede crear/listar/modificar operadores sin autenticarse.

2. **Python worker consume `/api/config/especiales`** — actualmente `database.py:44-45` tiene los IDs VIP/GERENCIA hardcodeados. Deben consultarse desde la API del backend con caché local, para que cambios en la BD se reflejen sin reiniciar el worker.

### Prioridad Media

3. **Eliminar `multipleStatements: true`** de `db.js:15` — no se usa y amplía superficie de ataque.

4. **Unificar IDS_CON_ESPECIAL** — `manualTicketRoutes.js:300` tiene la misma lista hardcodeada que `database.py`. Debe consumir `/api/config/especiales`.

### Prioridad Baja

5. **Refactorizar `reimprimir_ticket()`** en `printer.py` — comparte ~60% del código con `imprimir_ticket_valido()`. Extraer a método privado compartido.

6. **Mover `process_biometric_event` fuera de `main()`** para facilitar testing unitario del worker Python.

7. **Logging Python con Logger nombrado** — cambiar `logging.basicConfig` por `logging.getLogger(__name__)` en todos los módulos Python.

8. **SSL/TLS en Nginx** — para acceso desde fuera de la LAN corporativa.

9. **Rotación automática de logs** — configurar `logrotate` para los logs de Winston o migrar a `winston-daily-rotate-file`.
