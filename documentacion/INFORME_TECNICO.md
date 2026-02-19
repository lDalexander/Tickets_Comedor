# Informe Técnico del Proyecto: Sistema de Control de Comedor

**Versión:** 5.0 (Módulo Visitas)
**Fecha:** 19 de Febrero de 2026
**Ubicación del Código:** `/home/john/comedor/Tickets_Comedor/`

## 1. Resumen Ejecutivo
El sistema "Tickets Comedor" gestiona el control de asistencia y almuerzos mediante autenticación biométrica y un panel de administración web. Esta versión 5.0 incorpora un **Módulo de Tickets Manuales** para visitas y proveedores, permitiendo impresiones autorizadas sin registro biométrico.

## 2. Arquitectura del Sistema (Stack Tecnológico)

El proyecto utiliza una arquitectura **MERN Modificada** (MySQL, Express, React, Node) + Python para hardware.

### 🔵 Frontend (Cliente Web)
*   **Framework:** React 18 (Vite)
*   **Componentes Clave:** `Dashboard.jsx`, `ManualTicketModal.jsx`, `AdminPanel.jsx`.
*   **Estilos:** CSS Modules / Glassmorphism
*   **Ubicación:** `Tickets_Comedor/frontend/`
*   **Puerto Desarrollo:** 5173

### 🟢 Backend (Servidor API)
*   **Runtime:** Node.js (Express)
*   **Base de Datos:** MySQL
*   **Ubicación:** `Tickets_Comedor/backend/`
*   **Puerto:** 5000 (o 5001 si hay conflicto)
*   **Responsabilidad:** API REST, Logs, WebSocket (Socket.io) para tiempo real.

### 🟠 Core Worker (Lógica de Negocio y Hardware)
*   **Lenguaje:** Python 3
*   **Librerías:** `pyzk` (Biométrico), `python-escpos` (Impresora), `mysql-connector`.
*   **Ubicación:** `Tickets_Comedor/backend/python_core/`
*   **Responsabilidad:** Leer huellas, validar reglas de negocio, imprimir tickets.

## 3. Estructura de Directorios (Unificada)

La gran novedad de esta versión es la consolidación del backend:

```text
Tickets_Comedor/
├── backend/                  # Servidor Principal
│   ├── python_core/          # Módulo Python (Hardware)
│   │   ├── src/              # Clases (Database, Printer)
│   │   ├── main.py           # Loop principal
│   │   └── reprint_ticket.py # Script de utilería
│   ├── routes/               # Rutas API Node.js
│   └── server.js             # Punto de entrada Node.js
│
├── frontend/                 # Interfaz de Usuario
│   ├── src/components/       # Componentes React
│   └── vite.config.js
│
└── documentacion/            # Manuales y Guías
```

## 4. Base de Datos
El sistema utiliza una base de datos MySQL llamada `control_comedor` (o similar según `.env`).

**Tablas Principales:**
*   `usuarios`: Empleados con su ID de biométrico (`zk_id`), rol y preferencias.
*   `registros`: Historial de marcas (huellas), tickets entregados y duplicados.
*   `menu_diario`: Selecciones de menú (Normal/Dieta) por fecha.
*   **[NUEVA]** `usuarios_impresion_manual`: Usuarios autorizados para emitir tickets manuales.
*   **[NUEVA]** `log_tickets_manuales`: Auditoría de tickets impresos manualmente.

## 5. Funcionamiento del Flujo de Datos

1.  **Detección**: El `main.py` (Python) detecta una huella en el lector ZK.
2.  **Validación**: Python consulta MySQL. Si el usuario no ha comido hoy -> **APRUEBA**.
3.  **Acción**:
    *   Python envía comandos a la Impresora Térmica.
    *   Python registra el evento en la tabla `registros`.
4.  **Notificación**:
    *   El servidor Node.js (`server.js`) detecta el nuevo registro en MySQL (polling).
    *   Node.js emite un evento `Socket.io` al Frontend.
    *   El Dashboard muestra el evento en tiempo real.

## 6. Variables de Entorno (.env)
Se manejan configuraciones sensibles en archivos `.env`:

*   `backend/.env`: Credenciales de BD, Puerto (5000), Clave secreta de Admin.
*   `backend/python_core/.env`: IP del Biométrico, IP de la Impresora.

---
**Nota:** Este documento reemplaza a versiones anteriores de documentación técnica.
