# Guía de Onboarding para Nuevos Desarrolladores — SIGAC
## Sistema de Gestión de Acceso al Comedor — DETCUADOR S.A.

**Versión:** 3.2  
**Para:** Nuevos desarrolladores que se unen al proyecto  
**Tiempo estimado de lectura:** 45 minutos  
**Tiempo estimado para levantar el entorno local:** 30 minutos  

---

## ¿Para quién es esta guía?

Para cualquier desarrollador que llegue nuevo al proyecto SIGAC. Asume conocimientos básicos de:
- Terminal/bash
- JavaScript / Node.js
- Python (básico)
- SQL
- Git

Si vienes del mundo backend pero nunca tocaste React, no hay problema — la arquitectura está diseñada para que puedas trabajar en el backend sin tocar el frontend y viceversa.

---

## Índice

1. [El sistema en 5 minutos](#1-el-sistema-en-5-minutos)
2. [Arquitectura para desarrolladores](#2-arquitectura-para-desarrolladores)
3. [Configurar entorno de desarrollo](#3-configurar-entorno-de-desarrollo)
4. [Flujo de trabajo diario](#4-flujo-de-trabajo-diario)
5. [Entender la base de datos](#5-entender-la-base-de-datos)
6. [El worker Python](#6-el-worker-python)
7. [El backend Node.js](#7-el-backend-nodejs)
8. [El frontend React](#8-el-frontend-react)
9. [Ejecutar y escribir tests](#9-ejecutar-y-escribir-tests)
10. [Cómo contribuir](#10-cómo-contribuir)
11. [Convenciones del proyecto](#11-convenciones-del-proyecto)
12. [Preguntas frecuentes de desarrollo](#12-preguntas-frecuentes-de-desarrollo)

---

## 1. El Sistema en 5 Minutos

SIGAC registra quién almuerza cada día en la empresa. El flujo central es:

```
[Empleado pone dedo] → [Python identifica y registra en BD] → [Termoimpresora imprime ticket]
                                          ↓
                          [Node.js hace polling a BD cada 2s]
                                          ↓
                          [Socket.IO envía evento al browser]
                                          ↓
                          [Dashboard React muestra el evento]
```

Hay un proceso Python y un proceso Node.js corriendo en paralelo. **No se comunican directamente** — comparten únicamente la base de datos MariaDB. Python escribe. Node.js lee y sirve la web.

---

## 2. Arquitectura para Desarrolladores

```
┌─────────────────────────────────────────────────────┐
│                    LO QUE TOCA EL USUARIO           │
│                                                     │
│  Browser → http://150.36.200.252:5001               │
│               │                                     │
│               ▼                                     │
│           [NGINX :5001]                             │
│          /api/* → proxy a Node.js                   │
│          /*     → sirve frontend/dist/              │
│                                                     │
└─────────────────────────────────────────────────────┘
                │ /api/*
                ▼
┌─────────────────────────────────────────────────────┐
│              NODE.JS :5002 (backend/)               │
│                                                     │
│  Express routes:                                    │
│    /api/admin/*          → adminRoutes.js (JWT)     │
│    /api/config/*         → configRoutes.js          │
│    /api/manual-tickets/* → manualTicketRoutes.js    │
│    /api/*                → dashboardRoutes.js       │
│                                                     │
│  Socket.IO → emite 'new_log' cada 2s si hay datos   │
│  mysql2 pool → 10 conexiones a MariaDB              │
└─────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────┐
│              MARIADB :3306                          │
│              control_comedor                        │
│                                                     │
│  registros         ← tabla central de eventos       │
│  usuarios          ← empleados del biométrico       │
│  menu_diario       ← selecciones de menú semanal    │
│  configuracion     ← key-value del sistema          │
│  usuarios_impresion_manual ← operadores/admins      │
│  log_tickets_manuales ← auditoría de impresiones    │
└─────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────┐
│         PYTHON WORKER (python_core/)                │
│                                                     │
│  main.py → loop 24/7, escucha biométrico ZKTeco     │
│  src/database.py → toda la lógica de BD + negocio   │
│  src/printer.py → control impresora ESC/POS + email  │
│  mysql.connector pool → 5 conexiones a MariaDB      │
└─────────────────────────────────────────────────────┘
```

### La regla más importante

**Python nunca llama a Node.js. Node.js nunca llama a Python.**  
Cada uno hace su trabajo y comparten estado solo vía MariaDB.

La única excepción: cuando Node.js necesita imprimir un ticket (reimpresión desde AdminV2 o ticket manual), ejecuta `reprint_ticket.py` como proceso hijo con `child_process.exec()`.

---

## 3. Configurar Entorno de Desarrollo

### 3.1 Prerrequisitos

```bash
# Verificar versiones instaladas
node --version    # 18.x o superior
python3 --version # 3.10 o superior
mysql --version   # MariaDB 10.x
```

### 3.2 Clonar el repositorio

```bash
git clone <url-del-repo> Tickets_Comedor
cd Tickets_Comedor
```

### 3.3 Backend Node.js

```bash
cd backend

# Instalar dependencias
npm install

# Crear archivo .env desde el template
cp .env.example .env

# Editar .env con tus credenciales locales
nano .env
```

El `.env` mínimo para desarrollo:
```bash
PORT=5002
NODE_ENV=development
DB_HOST=localhost
DB_USER=tu_usuario_mysql
DB_PASSWORD=tu_contraseña_mysql
DB_NAME=control_comedor
ADMIN_JWT_SECRET=cualquier-string-largo-para-desarrollo-local
CORS_ORIGINS=http://localhost:5173
```

```bash
# Arrancar el backend en modo desarrollo
node server.js
# Debe mostrar: Server running on 0.0.0.0:5002
```

### 3.4 Frontend React

```bash
cd frontend

# Instalar dependencias
npm install

# Arrancar servidor de desarrollo Vite
npm run dev
# Debe mostrar: Local: http://localhost:5173/
```

Abre el navegador en `http://localhost:5173`. El frontend se conecta al backend en `:5002` automáticamente (configurado en `vite.config.js` como proxy).

### 3.4 Worker Python (opcional para desarrollo frontend/backend)

Solo necesitas el worker si vas a trabajar con la integración biométrica.

```bash
cd backend/python_core

# Crear entorno virtual
python3 -m venv venv
source venv/bin/activate  # Linux/Mac

# Instalar dependencias
pip install -r requirements.txt

# Crear .env
cp .env.example .env
nano .env
```

### 3.5 Base de datos

```bash
# Crear la BD y aplicar esquema
mysql -u root -p <<EOF
CREATE DATABASE control_comedor CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER 'dev'@'localhost' IDENTIFIED BY 'dev_password';
GRANT ALL PRIVILEGES ON control_comedor.* TO 'dev'@'localhost';
EOF

# Importar esquema
mysql -u dev -p control_comedor < sql/control_comedor.sql

# Aplicar migración 002
mysql -u dev -p control_comedor < sql/migrations/002_add_tipo_especial.sql
```

### 3.6 Verificar que todo funciona

```bash
# Verificar backend
curl http://localhost:5002/api/health
# → {"status":"online",...}

# Verificar estadísticas
curl http://localhost:5002/api/stats/summary
# → {"totalLunches":0,...}
```

---

## 4. Flujo de Trabajo Diario

### Durante desarrollo

1. **Backend:** `node backend/server.js` (o con nodemon: `npx nodemon backend/server.js`)
2. **Frontend:** `cd frontend && npm run dev`
3. **NO necesitas Nginx en desarrollo** — el servidor Vite hace proxy a Express directamente.

### Antes de hacer commit

```bash
# Ejecutar tests
cd backend && npm test

# Compilar el frontend (verificar que no haya errores de TypeScript/JSX)
cd frontend && npm run build

# Verificar que el build es correcto
ls frontend/dist/
```

### Desplegar en producción

```bash
# Compilar frontend
cd frontend && npm run build

# Recargar Nginx (sirve el nuevo build automáticamente)
sudo systemctl reload nginx

# Si cambió el backend:
sudo systemctl restart comedor-backend
```

---

## 5. Entender la Base de Datos

La tabla más importante es `registros`. Guarda cada evento del biométrico y cada ticket manual:

```sql
SELECT id, user_id, nombre, fecha, hora, descripcion, numero_ticket 
FROM registros 
WHERE fecha = CURDATE() 
ORDER BY id DESC;
```

Los valores de `descripcion`:
- `TICKET ALMUERZO` — almuerzo estándar, primera vez del día
- `TICKET DIETA` — menú de dieta
- `TICKET GERENCIA` — empleado de gerencia
- `TICKET EXTRA` — VIP que ya almorzó (segunda vez permitida)
- `INTENTO DE DUPLICADO` — intentó marcar de nuevo sin ser VIP
- `TICKET VISITA` — visitante externo (impresión manual)
- `TICKET TERCERO` — empleado que no pudo ir al biométrico (impresión manual)

**Por qué hay registros en minúsculas** ('Ticket Almuerzo'): son datos de versiones anteriores. Las queries del sistema soportan ambos formatos.

### La lógica de determinación de ticket

Esta lógica existe en dos lugares (Python y Node.js deben ser consistentes):

```
usuario X marca huella:

1. ¿Está en IDS_CON_ESPECIAL? → TICKET GERENCIA (sin importar si ya comió)
2. ¿Ya tiene registro de almuerzo hoy?
   - Sí + es VIP → TICKET EXTRA
   - Sí + no es VIP → INTENTO DE DUPLICADO
3. ¿Tiene dieta seleccionada hoy o por defecto? → TICKET DIETA
4. Por defecto → TICKET ALMUERZO
```

---

## 6. El Worker Python

### Estructura

```
python_core/
├── main.py        ← entry point: loop ZK, debounce, orquestación
└── src/
    ├── database.py  ← toda la lógica de BD y negocio
    └── printer.py   ← toda la lógica de hardware (impresora + email)
```

### Ejecutar manualmente (para debug)

```bash
cd backend/python_core
source venv/bin/activate
python main.py
```

### El loop principal

```python
while True:  # loop de reconexión externa
    try:
        conn = ZK(IP, port=4370).connect()
        users = conn.get_users()
        db.sincronizar_usuarios_masivo(users)
        
        for event in conn.live_capture(new_timeout=120):  # yield cada 120s max
            if dia_cambio: break  # reconectar para limpiar TCP
            if inactividad_2h: break
            if event: process_biometric_event(event, conn, user_map)
    except Exception as e:
        time.sleep(5)  # delay antes de reconectar
    finally:
        conn.disconnect()
```

### Puntos clave del worker

1. **`live_capture(new_timeout=120)`** — si no hay huellas, da un `yield None` cada 120 segundos. Esto permite verificar cambio de día y detectar inactividad sin bloquear indefinidamente.

2. **El debounce** — evita que un solo toque del dedo genere múltiples eventos:
   ```python
   if user_id_str in last_scan_time and (current_time - last_scan_time[user_id_str] < 5):
       return  # ignorar — es el mismo dedo dentro de los 5 segundos
   ```

3. **La impresora se consulta antes de procesar** — si está OFFLINE, el ticket igual se registra en BD pero no se imprime. Esto es intencional: el evento queda auditado aunque no haya papel físico.

---

## 7. El Backend Node.js

### Archivos más importantes

**`server.js`** — entry point. Aquí están:
- Configuración de Express y sus middlewares
- Configuración de Socket.IO
- Rate limiters
- El polling de BD cada 2 segundos (`checkNewRecords`)
- Los endpoints directos que no están en archivos de ruta separados (usuarios, menú)

**`db.js`** — abstracción del pool de MariaDB:
```javascript
// Así se usa en todos los archivos:
const db = require('../db');
const rows = await db.query('SELECT * FROM registros WHERE fecha = CURDATE()');
```

**`utils/logger.js`** — Winston configurado:
```javascript
const logger = require('../utils/logger');
const { logError } = require('../utils/logger');

logger.info('Mensaje informativo');
logger.warn('Advertencia');
logger.error('Error', { datos: 'adicionales' });
logError('nombre-contexto', error, req); // para errores en route handlers
```

**`repositories/statsRepository.js`** — todas las queries de estadísticas están aquí. Si necesitas una nueva estadística para el dashboard, añadela en este archivo.

### Cómo añadir un nuevo endpoint

1. **Decide en qué router va** — `adminRoutes.js` si requiere JWT, `dashboardRoutes.js` si es público, etc.
2. **Añade la ruta** siguiendo el patrón de las existentes.
3. **Usa `db.query()`** para queries a BD — ya maneja el pool y el logging.
4. **Usa `logError()`** en los catch blocks — incluye contexto de ruta/método/IP.

Ejemplo mínimo:
```javascript
router.get('/mi-endpoint', async (req, res) => {
    try {
        const rows = await db.query('SELECT * FROM registros WHERE fecha = CURDATE()');
        res.json(rows);
    } catch (error) {
        logError('mi-endpoint', error, req);
        res.status(500).json({ error: 'Error interno del servidor. Contacta al administrador.' });
    }
});
```

### El polling Socket.IO

```javascript
// En server.js, se ejecuta cada 2 segundos
async function checkNewRecords() {
    const newRecords = await db.query(
        "SELECT * FROM registros WHERE id > ?",
        [lastProcessedId]
    );
    if (newRecords.length > 0) {
        newRecords.forEach(record => {
            io.emit('new_log', { type, message, status });
        });
        lastProcessedId = newRecords[newRecords.length - 1].id;
    }
}
setInterval(checkNewRecords, 2000);
```

El `lastProcessedId` se inicializa con `MAX(id)` en la primera ejecución para no repetir el histórico cuando el servidor arranca.

---

## 8. El Frontend React

### Rutas

```javascript
<Route path="/" element={<Dashboard />} />           // dashboard principal
<Route path="/seleccion" element={<MenuSelection />} /> // menú semanal
<Route path="/admin" element={<Navigate to="/admin-v2" replace />} /> // redirect
<Route path="/admin-v2" element={<AdminV2Panel />} />  // panel admin
<Route path="*" element={<Navigate to="/" replace />} /> // catch-all
```

### Cómo los componentes obtienen datos

**SWR para datos que cambian gradualmente (estadísticas):**
```javascript
import useSWR from 'swr';
const fetcher = url => fetch(url).then(r => r.json());

const { data, error } = useSWR('/api/stats/summary', fetcher, {
    refreshInterval: 60000  // revalidar cada 60 segundos
});
```

**Socket.IO para eventos en tiempo real:**
```javascript
import { io } from 'socket.io-client';
const socket = io(window.location.origin);

useEffect(() => {
    socket.on('new_log', (log) => {
        // actualizar estado local con el nuevo log
    });
    return () => socket.off('new_log');  // cleanup obligatorio
}, []);
```

### El diseño visual (Glassmorphism)

Las clases CSS de glassmorphism están en `index.css`. La apariencia general es: fondo oscuro con burbujas difuminadas de color, tarjetas con fondo semi-transparente y borde translúcido.

```css
/* Clase típica de tarjeta */
.glass-card {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
}
```

### AdminV2Panel

El panel admin es el componente más complejo del frontend. Está organizado en secciones (`frontend/src/components/AdminV2/sections/`), cada una autocontenida:

1. **Login con JWT** — el hook `useAdminAuth.js` guarda el token en `localStorage` (`comedor_admin_token`), valida la expiración decodificando el claim `exp` y expone `authHeaders` para las peticiones. No hay refresh automático: al expirar (8h) hay que reloguear.
2. **Resumen** (`ResumenSection`) — tarjetas con totales del día y estado de BD/API.
3. **Registros** (`RegistrosSection`) — historial con filtros, reimpresión (`POST /api/admin/reprint`), edición/borrado (`PUT/DELETE /api/admin/data/registros/id/:id`) y export a Excel (`GET /api/admin/report/excel`).
4. **Empleados** (`EmpleadosSection`) — edición inline de `role` y `tipo_menu_predeterminado`.
5. **Operadores** (`OperadoresSection`) — CRUD de cuentas del panel y toggle de rol admin↔operador.
6. **Configuración** (`ConfiguracionSection`) — horario de servicio (`GET/POST /api/config`).
7. **Auditoría** (`AuditoriaSection`) — quién imprimió cada ticket manual.

Para agregar una sección nueva: crear el componente en `sections/`, registrarlo en el arreglo de navegación de `AdminV2Panel.jsx` y usar `authHeaders` en cada petición protegida.

---

## 9. Ejecutar y Escribir Tests

### Ejecutar tests existentes

```bash
cd backend

# Todos los tests
npm test

# Con coverage
npm run test:coverage

# Un archivo específico
npx jest tests/auth.test.js --verbose

# En modo watch (re-ejecuta al guardar)
npm run test:watch
```

### Cómo funciona el mock de BD

Los tests no necesitan una BD real. El archivo `tests/setup.js` configura las variables de entorno, y cada test mockea el módulo `db`:

```javascript
jest.mock('../db', () => ({
    query: jest.fn(),
    pool: { 
        promise: () => ({ 
            getConnection: jest.fn(),
            query: jest.fn() 
        }) 
    }
}));
```

Después en cada test:
```javascript
const db = require('../db');
db.query.mockResolvedValueOnce([{ id: 1, username: 'admin', ... }]);
```

### Escribir un nuevo test

```javascript
// tests/mi-nuevo-test.test.js
const request = require('supertest');
const { app } = require('../server');
const db = require('../db');

jest.mock('../db', () => ({
    query: jest.fn(),
    pool: { promise: () => ({ getConnection: jest.fn() }) }
}));

describe('Mi módulo', () => {
    beforeEach(() => {
        jest.resetAllMocks();  // importante: limpiar mocks entre tests
    });

    test('debería retornar 200 para /api/health', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('online');
    });

    test('debería retornar 401 sin auth', async () => {
        const res = await request(app).get('/api/admin/tables');
        expect(res.status).toBe(403);
    });
});
```

---

## 10. Cómo Contribuir

### Ramas

- `main` — producción. Solo se mergea con código revisado y testeado.
- `feature/*` — nuevas funcionalidades
- `fix/*` — correcciones de bugs

### Antes de hacer PR

1. `npm test` debe pasar al 100%
2. `npm run build` (en frontend/) no debe tener errores
3. El código nuevo debe seguir el estilo existente
4. Los endpoints nuevos deben tener al menos 1 test

### Convención de commits

```
tipo: descripción breve en español

Tipos: feat, fix, refactor, test, docs, chore
```

Ejemplos:
```
feat: agregar filtro por nombre en GET /api/stats/history
fix: corregir duplicado en numeración de tickets en concurrencia
test: agregar tests para rate limiting en tickets manuales
```

---

## 11. Convenciones del Proyecto

### Node.js / JavaScript

- `async/await` siempre — no callbacks ni `.then()` chains
- `require()` al inicio del archivo, no inline
- `try/catch` en todos los handlers de rutas, con `logError()` en el catch
- Respuestas de error: `res.status(N).json({ error: 'Mensaje descriptivo' })`
- Respuestas de éxito: `res.json({ success: true, ...datos })`

### Python

- snake_case para funciones y variables
- PascalCase para clases
- Docstrings en todos los métodos públicos
- Type hints en argumentos y retornos cuando sea posible
- `try/except Exception as e:` + `logging.error()` + valor de retorno seguro

### Base de datos

- Nunca usar `*` en SELECT en producción — especificar columnas
- Siempre parametrizar las queries con `?` placeholders
- Usar transacciones para operaciones de múltiples inserts/updates
- No modificar la estructura de tablas existentes — crear migraciones SQL

### Git

- Nunca hacer commit de `.env`, `venv/`, `node_modules/`, `dist/`
- No commitear archivos de log
- Los archivos con credenciales van en `/etc/comedor/` — nunca en el repo

---

## 12. Preguntas Frecuentes de Desarrollo

**¿Por qué hay dos archivos `.env`? (uno en `backend/` y otro en `backend/python_core/`)**

Son para diferentes runtimes. El `.env` en `backend/` lo carga Node.js vía `dotenv`. El `.env` en `backend/python_core/` lo carga Python vía `python-dotenv`. En producción, ambos son reemplazados por `/etc/comedor/secrets.env` cargado por systemd.

**¿Por qué Express escucha en `0.0.0.0` en desarrollo pero en `127.0.0.1` en producción?**

En desarrollo no hay Nginx haciendo proxy, así que Express necesita ser accesible desde la red local. En producción, Nginx es el único punto de entrada; Express no debe ser accesible directamente desde la red.

**¿Por qué Socket.IO usa HTTP long-polling en lugar de WebSocket puro?**

Socket.IO usa WebSocket cuando está disponible, pero cae automáticamente a HTTP long-polling si el WebSocket falla (firewalls corporativos, proxies, etc.). El sistema soporta ambos. La configuración de Nginx con el `map $http_upgrade $connection_upgrade` es justamente para que ambos modos funcionen correctamente a través del proxy.

**¿Por qué el polling es cada 2 segundos y no cada 500ms?**

Equilibrio entre latencia de actualización y carga en la BD. Con 140 empleados y ~100 eventos por día, 2 segundos es suficientemente rápido para el usuario y genera un impacto mínimo en la BD (~43k consultas/día, todas instantáneas con índice en `id`).

**¿Puedo añadir un campo a una tabla existente?**

Sí, pero debes:
1. Crear una migración SQL en `sql/migrations/NNN_descripcion.sql`
2. **Nunca modificar** `sql/control_comedor.sql` (es el esquema base de referencia)
3. Actualizar todas las queries que usan `SELECT *` para incluir la nueva columna explícitamente

**¿Por qué los tests mockean la BD en lugar de usar una BD real de test?**

Para que los tests sean rápidos, deterministas y puedan ejecutarse en CI sin infraestructura adicional. Los tests de integración con BD real pueden ser útiles pero requieren setup adicional (BD de test, seed data, teardown).

**¿Qué es `node_modules` en `backend/python_core/venv/`?**

El `venv/` de Python es el equivalente al `node_modules/` de Node.js. Contiene todas las dependencias Python instaladas. No se commitea al repo.

**¿Cómo agrego un nuevo tipo de ticket?**

1. En `database.py`: agregar el nuevo valor en `registrar_evento()`
2. En `statsRepository.js`: añadir una constante para el nuevo tipo y actualizar `getSummary()`
3. En `printer.py`: añadir la función `imprimir_ticket_nuevo_tipo()` si requiere diseño especial
4. Actualizar el esquema/documentación

**¿Qué pasa si el biométrico y Node.js generan el mismo número de ticket simultáneamente?**

El algoritmo de numeración (`_get_siguiente_ticket` en Python, y lógica equivalente en `manualTicketRoutes.js`) no usa bloqueo de BD. En teoría pueden generar el mismo número si dos eventos ocurren exactamente al mismo tiempo. En práctica con ~140 empleados es muy poco frecuente. La solución correcta sería agregar `SELECT ... FOR UPDATE` en el cálculo del ticket number.
