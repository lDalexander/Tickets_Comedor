# SIGAC — Sistema de Gestión de Acceso al Comedor
## Guía de Desarrollo — DETCUADOR S.A.

**Versión:** 3.2  
**Servidor de producción:** `http://150.36.200.252:5001`  
**Repositorio:** `/home/john/comedor/Tickets_Comedor/`  

---

## Inicio Rápido (Desarrollo Local)

### 1. Backend Node.js

```bash
cd backend
npm install
cp .env.example .env    # editar con credenciales locales
node server.js          # arranca en :5002
```

### 2. Frontend React

```bash
cd frontend
npm install
npm run dev             # arranca en :5173 con proxy a :5002
```

### 3. Tests

```bash
cd backend
npm test                # ejecutar suite completa
npm run test:coverage   # con reporte de cobertura
```

### 4. Build de producción

```bash
cd frontend && npm run build   # compila a frontend/dist/
sudo systemctl reload nginx    # Nginx sirve el nuevo build
```

---

## Documentación Completa

| Documento | Contenido |
|-----------|-----------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Diagramas C4, flujos de datos, patrones de diseño, ADR |
| [API_REFERENCE.md](API_REFERENCE.md) | Todos los endpoints: request, response, errores, ejemplos curl |
| [DICCIONARIO_BASE_DATOS.md](DICCIONARIO_BASE_DATOS.md) | Diccionario de datos: todas las tablas, columnas, dominios, índices, relaciones y reglas |
| [INFORME_TECNICO.md](INFORME_TECNICO.md) | Stack, estructura, seguridad, tests, métricas, versiones |
| [MANUAL_OPERACIONES.md](MANUAL_OPERACIONES.md) | Operaciones diarias: arranque, logs, backup, deploy, secretos |
| [GUIA_SOLUCION_PROBLEMAS.md](GUIA_SOLUCION_PROBLEMAS.md) | Diagnóstico y solución de 16+ problemas comunes |
| [GUIA_ESTUDIANTES.md](GUIA_ESTUDIANTES.md) | Onboarding: setup local, arquitectura para devs, convenciones |
| [INFORME_A_GERENCIA.md](INFORME_A_GERENCIA.md) | Estado del sistema en términos no técnicos para dirección |

---

## Estructura del Proyecto

```
Tickets_Comedor/
├── backend/                    ← Node.js: API + Socket.IO
│   ├── server.js               ← entry point
│   ├── db.js                   ← mysql2 pool
│   ├── routes/                 ← adminRoutes, configRoutes, dashboardRoutes, manualTicketRoutes
│   ├── repositories/           ← statsRepository.js (Repository Pattern)
│   ├── utils/logger.js         ← Winston JSON + logError()
│   ├── tests/                  ← Jest + Supertest (19+ tests)
│   └── python_core/            ← Python: biométrico + impresora
│       ├── main.py             ← worker 24/7
│       └── src/                ← database.py, printer.py
├── frontend/                   ← React 18 + Vite
│   └── src/
│       ├── App.jsx             ← Router (/, /seleccion, /admin-v2)
│       └── components/         ← Dashboard, AdminV2, LiveTerminal, etc.
├── nginx/                      ← configuración Nginx + scripts de instalación
├── sql/                        ← esquema + migraciones
├── documentacion/              ← toda la documentación
├── comedor-backend.service     ← systemd: Node.js
├── comedor-worker.service      ← systemd: Python
└── deploy_frontend.sh          ← script de deploy del frontend
```

---

## Comandos de Producción

```bash
# Estado de servicios
sudo systemctl status comedor-backend comedor-worker nginx

# Logs en tiempo real
sudo journalctl -u comedor-backend -f
sudo journalctl -u comedor-worker -f

# Reiniciar backend
sudo systemctl restart comedor-backend

# Ver logs de errores Winston
tail -f backend/logs/error.log

# Health check
curl http://localhost:5001/api/health
```

---

## Variables de Entorno Requeridas

Ver `/etc/comedor/secrets.env` en producción, o `backend/.env` en desarrollo.

| Variable | Descripción |
|---------|-------------|
| `ADMIN_JWT_SECRET` | Secret para firma JWT (requerido — sin esto el servidor no arranca) |
| `DB_HOST/USER/PASSWORD/NAME/PORT` | Conexión a MariaDB |
| `SMTP_*` / `EMAIL_DESTINO` | Alertas por email |
| `IP_BIOMETRICO` / `IP_IMPRESORA` / `PUERTO_ZK` | Hardware |
| `CORS_ORIGINS` | IPs permitidas por CORS (separadas por coma) |
| `NODE_ENV` | `production` enlaza Express a 127.0.0.1; `development` a 0.0.0.0 |

---

## API: Endpoints Principales

| Método | Endpoint | Auth | Descripción |
|--------|---------|------|-------------|
| GET | `/api/health` | — | Health check |
| POST | `/api/admin/login` | — | Login → JWT (rate: 10/15min) |
| GET | `/api/stats/summary` | — | Resumen estadístico del día |
| GET | `/api/stats/history` | — | Historial con filtros |
| GET | `/api/stats/export` | — | Exportar a Excel |
| GET | `/api/config` | — | Configuración del sistema |
| POST | `/api/config` | JWT | Actualizar configuración |
| GET | `/api/config/especiales` | — | IDs VIP y Gerencia (cacheado 5min) |
| POST | `/api/manual-tickets/login` | — | Login operador |
| POST | `/api/manual-tickets/print` | operador | Imprimir ticket visita |
| POST | `/api/manual-tickets/print-tercero` | operador | Imprimir ticket tercero |

Ver [API_REFERENCE.md](API_REFERENCE.md) para la referencia completa.

---

## Seguridad: Estado Actual

| Aspecto | Estado |
|---------|--------|
| Credenciales hardcodeadas | RESUELTO — variables de entorno |
| JWT con secret débil | RESUELTO — process.exit(1) si no hay secret |
| Endpoint SQL arbitrario | RESUELTO — eliminado |
| Rate limiting | IMPLEMENTADO — 3 niveles |
| CORS dinámico | IMPLEMENTADO — whitelist desde env |
| Trust proxy | IMPLEMENTADO — IPs reales detrás de Nginx |
| CRUD operadores sin JWT | PENDIENTE — baja prioridad |
| IDs especiales hardcodeados en Python | PENDIENTE — media prioridad |

---

## Pendiente (Deuda Técnica)

Ver [INFORME_TECNICO.md §11](INFORME_TECNICO.md#11-trabajo-pendiente) para la lista completa priorizada.

Resumen:
1. **ALTA** — Migración 002 (`tipo_especial`) **no aplicada en producción**: `GET /api/config/especiales` devuelve 500 (verificado julio 2026). Aplicar `sql/migrations/002_add_tipo_especial.sql` — ver [DICCIONARIO_BASE_DATOS.md §3](DICCIONARIO_BASE_DATOS.md)
2. **ALTA** — `manualTicketRoutes.js` CRUD sin JWT
3. **ALTA** — Python worker: consumir `/api/config/especiales` en lugar de hardcoding
4. **MEDIA** — eliminar `multipleStatements: true` en `db.js`
5. **MEDIA** — unificar `IDS_CON_ESPECIAL` duplicado en `manualTicketRoutes.js`
