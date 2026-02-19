# Lunch Ticket Dashboard Documentation / Documentación del Proyecto

---

# [EN] English Version

## 1. Project Overview
The **Lunch Ticket Dashboard** is a real-time web application designed to visualize dining hall statistics. It tracks daily lunches, printed tickets, duplicates, and lunch types (Normal/Special) through an interactive and visually premium interface.

## 2. Features
- **Real-time Dashboard**: Auto-updates every 30 seconds to show the latest data.
- **Visual Analytics**:
    - **Line Chart**: Shows trends of lunches vs. tickets over the last 5 days.
    - **Doughnut Chart**: Displays the distribution of lunch types (Normal vs. Special).
    - **Stat Cards**: Immediate view of daily totals and duplicate attempts.
- **Duplicate Detection**: A dedicated section that logs every attempt to print a duplicate ticket, including user details and timestamp.
- **Premium UI**: Designed with a "Glassmorphism" aesthetic, featuring dark mode, neon accents, and smooth transitions.

## 3. Technical Architecture
### Frontend (The User Interface)
- **Framework**: React 18 (built with Vite for speed).
- **Styling**: Pure CSS using CSS Variables for theming and specific "glass" effects.
- **Charting**: `chart.js` powered by `react-chartjs-2`.
- **Icons**: `lucide-react` library.
### Backend (The API)
- **Runtime**: Node.js.
- **Server Framework**: Express.js.
- **Database Connector**: `mysql2` with connection pooling for performance.
- **Logging**: Winston logger (captures all events and errors to files).

## 4. Database Schema
The application expects a MySQL table structure similar to this:

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT (PK) | Unique Ticket ID |
| `user_id` | VARCHAR | User Identifier (e.g., Employee ID) |
| `status` | ENUM | 'Printed' or 'Duplicate_Attempt' |
| `type` | ENUM | 'Normal' or 'Special' |
| `created_at` | DATETIME | Timestamp of event |

## 5. API Endpoints
- `GET /api/stats/summary`: Aggregate counts for the current day.
- `GET /api/stats/daily`: Trend data for the previous 5 days.
- `GET /api/stats/duplicates`: List of recent blocked duplicate attempts.

## 6. Setup & Installation
1.  **Configure Database**: Create the table in MySQL and update `backend/.env` with your credentials.
2.  **Start Backend**: Run `node server.js` in the `backend/` folder.
3.  **Start Frontend**: Run `npm run dev` in the `frontend/` folder.

## 7. Setup as Service (Auto-Start)
To make the system run automatically on boot (like a server), we now use two separate services for better stability:

1.  Run the installation script with sudo:
    ```bash
    sudo ./install_service.sh
    ```
2.  Thee services will be installed:
    - `comedor-backend.service` (Node.js API)
    - `comedor-frontend.service` (Web Interface)
    - `comedor-worker.service` (Python Hardware Logic)
3.  Check status:
    - `sudo systemctl status comedor-frontend`
    - `sudo systemctl status comedor-backend`
    - `sudo systemctl status comedor-worker`

## 8. Troubleshooting & Error History
This section documents the specific issues encountered during implementation and their solutions.

### 4. Integration: Monolithic vs Split Services
**Issue**: Running both processes in a single `start_system.sh` script via systemd caused instability (Node exited immediately).
**Cause**: Shell wrappers interacting with Systemd's `forking` type can cause signal handling issues.
**Solution**: Refactored into two independent `Type=simple` services (`comedor-backend` and `comedor-worker`). This is the industry standard for robust deployments.
This section documents the specific issues encountered during implementation and their solutions.

### 1. Frontend: Uncaught SyntaxError (LucideIcon)
**Issue**: Blank page. Console showed `Uncaught SyntaxError: ... export named 'LucideIcon'`.
**Cause**: The library `lucide-react` does not export `LucideIcon` in the javascript runtime.
**Solution**: Removed the invalid import in `src/components/StatCard.jsx`.
```javascript
// Old (Cause of error)
import { LucideIcon } from 'lucide-react';
// New (Fixed)
// import removed entirely
```

### 2. Backend: Port Conflict & "Zombie" Process
**Issue**: Backend server exits immediately with code 0. `Error: listen EADDRINUSE: address already in use :::5000`.
**Cause**: A previous Node.js process was still running in the background (Zombie process with PID 5712), holding port 5000 locked.
**Solution**:
1.  Killed the zombie process using `taskkill /F /PID 5712`.
2.  Changed the port to **5001** in `backend/.env` just to be safe.
3.  Updated `frontend/src/components/Dashboard.jsx` to fetch from `http://localhost:5001/api`.

### 3. Database: Table Name Mismatch (Error 1146)
**Issue**: Backend logs showed `ER_NO_SUCH_TABLE: Table 'control_comedor.registro' doesn't exist`.
**Cause**: The code queries used the singular table name `registro`, but the actual database schema (checked via script) used the plural `registros`.
**Solution**:
Updated all SQL queries in `backend/routes/dashboardRoutes.js` to use `FROM registros`.
```javascript
// Fixed Query Example
const sql = "SELECT COUNT(*) as total FROM registros ...";
```


### 5. Python: 'dotenv' Module Missing & PIP Restrictions
**Issue**: Python worker failed with `ModuleNotFoundError: No module named 'dotenv'` and `pip install` failed with "externally managed environment".
**Cause**: Modern Linux distributions block global `pip install` to protect system packages.
**Solution**:
Updated `start_system.sh` to automatically create and use a Python Virtual Environment (`venv`):
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 7. Frontend: systemctl status = exit-code 127 (Permission denied)
**Issue**: Frontend service fails with `sh: 1: vite: Permission denied`.
**Cause**: The `vite` binary in `node_modules` lost its execution permissions.
**Solution**:
Run: `chmod +x frontend/node_modules/.bin/vite` and restart service.

---

# [ES] Versión en Español

... (Secciones 1-6 igual que arriba) ...

## 7. Configuración como Servicio (Auto-Inicio)
Para la máxima estabilidad, el sistema se divide en dos servicios independientes:

1.  Ejecuta el script de instalación:
    ```bash
    sudo ./install_service.sh
    ```
2.  Se instalarán:
    - `comedor-backend` (API Logs)
    - `comedor-frontend` (Página Web)
    - `comedor-worker` (Hardware Biómetrico/Impresora)
3.  Verificar estado: `sudo systemctl status comedor-frontend`.

## 8. Historial de Errores y Soluciones (Troubleshooting)
### 7. Frontend: systemctl status = exit-code 127 (Permission denied)
**Issue**: Frontend service fails with `sh: 1: vite: Permission denied`.
**Cause**: The `vite` binary in `node_modules` lost its execution permissions.
**Solution**:
Run: `chmod +x frontend/node_modules/.bin/vite` and restart service.

### 4. Integración: Servicios Separados
**Problema**: Ejecutar todo en un solo script (`start_system.sh`) bajo Systemd causaba cierres inesperados.
**Solución**: Se separó en dos servicios nativos de Linux (`Systemd Type=simple`). Esto garantiza que si uno falla, se reinicie solo, sin afectar al otro.
Esta sección documenta los problemas técnicos encontrados durante la implementación y cómo se resolvieron.

### 1. Frontend: Error de Importación (LucideIcon)
**Problema**: Pantalla en blanco. La consola mostraba error de exportación de `LucideIcon`.
**Causa**: Importación incorrecta de la librería de iconos.
**Solución**: Se eliminó la línea `import { LucideIcon } from 'lucide-react';` en `StatCard.jsx`.

### 2. Backend: Conflicto de Puerto y Proceso Fantasma
**Problema**: El servidor backend se cerraba inmediatamente al iniciar.
**Causa**: Un proceso de Node.js "zombie" (PID 5712) se quedó colgado en segundo plano ocupando el puerto 5000, impidiendo iniciar uno nuevo.
**Solución**:
1.  Se eliminó el proceso fantasma desde la terminal (`taskkill`).
2.  Se cambió el puerto del servidor a **5001** en el archivo `.env`.
3.  Se actualizó el Frontend (`Dashboard.jsx`) para conectarse al puerto 5001.

### 3. Base de Datos: Nombre de Tabla Incorrecto
**Problema**: Logs del backend mostraban `ER_NO_SUCH_TABLE: Table 'control_comedor.registro' doesn't exist`.
**Causa**: El código buscaba la tabla `registro` (singular), pero en la base de datos real (XAMPP) la tabla se llama `registros` (plural).
**Solución**:
Se corrigieron todas las consultas SQL en `dashboardRoutes.js` para apuntar a la tabla correcta: `registros`.
```javascript
// Ejemplo de consulta corregida
const sql = "SELECT COUNT(*) as total FROM registros ...";
```


### 5. Python: Falta módulo 'dotenv' y Restricciones de PIP
**Problema**: El worker fallaba con `ModuleNotFoundError` y `pip install` daba error de "externally managed environment".
**Causa**: Linux bloquea la instalación global de paquetes pip para proteger el sistema.
**Solución**:
Se actualizó `start_system.sh` para crear y usar automáticamente un Entorno Virtual (`venv`):
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 7. Frontend: Permiso Denegado (Error 127)
**Problema**: El servicio falla con `vite: Permission denied`.
**Causa**: El ejecutable `vite` no tiene permisos de ejecución.
**Solución**:
Ejecutar: `chmod +x frontend/node_modules/.bin/vite` y reiniciar el servicio.
