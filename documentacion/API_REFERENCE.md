# Referencia Completa de API REST — SIGAC
## Sistema de Gestión de Acceso al Comedor — DETCUADOR S.A.

**Versión:** 3.2  
**Base URL (producción):** `http://150.36.200.252:5001/api`  
**Base URL (desarrollo):** `http://localhost:5002/api`  
**Content-Type:** `application/json`  
**Última actualización:** Mayo 2026  

---

## Índice

1. [Autenticación](#1-autenticación)
2. [Rate Limiting](#2-rate-limiting)
3. [Módulo Admin (`/api/admin`)](#3-módulo-admin-apiadmin)
   - 3.1 [Módulo Control de Almuerzo (`/api/almuerzos`)](#31-módulo-control-de-almuerzo-apialmuerzos)
4. [Módulo Configuración (`/api/config`)](#4-módulo-configuración-apiconfig)
5. [Módulo Dashboard (`/api`)](#5-módulo-dashboard-api)
6. [Módulo Tickets Manuales (`/api/manual-tickets`)](#6-módulo-tickets-manuales-apimanual-tickets)
7. [Endpoints Auxiliares](#7-endpoints-auxiliares)
8. [Eventos Socket.IO](#8-eventos-socketio)
9. [Códigos de Error](#9-códigos-de-error)
10. [Ejemplos con curl](#10-ejemplos-con-curl)

---

## 1. Autenticación

### JWT Bearer Token

Los endpoints del panel admin requieren un token JWT en el header `Authorization`:

```
Authorization: Bearer <token>
```

El token se obtiene desde `POST /api/admin/login` y tiene una duración de **8 horas**.

#### Niveles de acceso

| Nivel | Valor JWT `rol` | Endpoints accesibles |
|-------|----------------|---------------------|
| `admin` | `"admin"` | Todos los endpoints `/api/admin/*` |
| `superadmin` | `"superadmin"` | `admin` + endpoints marcados como superadmin |

#### Respuesta cuando el token es inválido

```json
// 401 Unauthorized — token inválido o expirado
{ "error": "Token inválido o expirado" }

// 403 Forbidden — sin token o formato incorrecto
{ "error": "Unauthorized Access" }

// 403 Forbidden — rol insuficiente
{ "error": "Se requiere acceso superadmin" }
```

### Autenticación de Operadores (módulo manual-tickets)

Los operadores del módulo de tickets manuales se autentican con `POST /api/manual-tickets/login` y el `id` recibido se incluye en el body de las peticiones posteriores como `printedByUserId`. No utiliza JWT.

---

## 2. Rate Limiting

| Endpoint | Límite | Ventana | Header de respuesta |
|---------|--------|---------|---------------------|
| `POST /api/admin/login` | 10 req | 15 minutos | `RateLimit-*` |
| `POST /api/manual-tickets/login` | 10 req | 15 minutos | `RateLimit-*` |
| `POST /api/manual-tickets/*` | 30 req | 1 minuto | `RateLimit-*` |
| Todos los demás `/api/*` | 200 req | 1 minuto | `RateLimit-*` |

Cuando se supera el límite:
```json
// 429 Too Many Requests
{ "error": "Demasiados intentos. Espera 15 minutos." }
```

Los límites son **por IP** (usando la IP real del cliente, correctamente resuelta detrás de Nginx con `trust proxy 1`).

---

## 3. Módulo Admin (`/api/admin`)

Todos los endpoints excepto `POST /login` requieren `Authorization: Bearer <token>`.

### POST /api/admin/login

Autentica un administrador y retorna un JWT.

**Autenticación requerida:** No  
**Rate limit:** 10/15min

**Request body:**
```json
{
    "username": "admin",
    "password": "contraseña"
}
```

**Respuesta exitosa (200):**
```json
{
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
        "id": 1,
        "nombre": "John Garcia",
        "rol": "admin"
    }
}
```

**Errores:**
| Código | Mensaje | Causa |
|--------|---------|-------|
| 400 | `"Credenciales requeridas"` | username o password ausente |
| 401 | `"Usuario no encontrado o sin permisos de administrador"` | usuario no existe o `activo=0` o `rol != 'admin'` |
| 401 | `"Contraseña incorrecta"` | bcrypt.compare falló |
| 429 | `"Demasiados intentos. Espera 15 minutos."` | límite de rate excedido |
| 500 | `"Error del servidor"` | error de BD |

---

### GET /api/admin/tables

Lista todas las tablas de la base de datos.

**Autenticación:** admin  

**Respuesta (200):**
```json
["configuracion", "log_tickets_manuales", "menu_diario", "registros", "usuarios", "usuarios_impresion_manual"]
```

---

### GET /api/admin/schema/:table

Describe la estructura de una tabla.

**Autenticación:** admin  
**Parámetros URL:** `table` — nombre de la tabla

**Respuesta (200):**
```json
[
    {
        "Field": "id",
        "Type": "int(11)",
        "Null": "NO",
        "Key": "PRI",
        "Default": null,
        "Extra": "auto_increment"
    },
    {
        "Field": "nombre",
        "Type": "varchar(255)",
        "Null": "YES",
        "Key": "",
        "Default": null,
        "Extra": ""
    }
]
```

---

### GET /api/admin/data/:table

Obtiene los datos de una tabla (máximo 2000 registros, orden DESC por primera columna).

**Autenticación:** admin  
**Parámetros URL:** `table` — nombre de la tabla

**Respuesta (200):**
```json
[
    {
        "id": 42,
        "user_id": "78",
        "nombre": "Juan Pérez López",
        "fecha": "2026-05-09",
        "hora": "12:34:21",
        "descripcion": "TICKET ALMUERZO",
        "numero_ticket": 15
    }
]
```

---

### POST /api/admin/data/:table

Inserta un nuevo registro en una tabla.

**Autenticación:** admin  
**Parámetros URL:** `table` — nombre de la tabla  
**Nota especial:** Si `table === 'usuarios_impresion_manual'` y el body incluye `password_hash`, el valor se hashea con bcrypt automáticamente.

**Request body:** Objeto con los campos a insertar.
```json
{
    "username": "operador1",
    "password_hash": "contraseñaPlana",
    "nombre_real": "María Torres",
    "activo": 1,
    "rol": "operador"
}
```

**Respuesta (200):**
```json
{ "success": true }
```

---

### PUT /api/admin/data/:table/:pk/:val

Actualiza un registro existente.

**Autenticación:** admin  
**Parámetros URL:**
- `table` — nombre de la tabla
- `pk` — nombre de la columna de clave primaria
- `val` — valor de la clave primaria del registro a actualizar

**Nota especial:** Si `table === 'usuarios_impresion_manual'` y el body incluye `password_hash` con menos de 50 caracteres (es decir, una contraseña plana), se hashea automáticamente con bcrypt.

**Request body:** Campos a actualizar.
```json
{ "nombre_real": "María Torres Actualizada", "activo": 0 }
```

**Respuesta (200):**
```json
{ "success": true }
```

---

### DELETE /api/admin/data/:table/:pk/:val

Elimina un registro de una tabla.

**Autenticación:** admin  
**Parámetros URL:** `table`, `pk`, `val` (igual que PUT)

**Respuesta (200):**
```json
{ "success": true }
```

---

### POST /api/admin/reprint

Reimprime un ticket existente usando el worker Python.

**Autenticación:** admin  

**Request body:**
```json
{
    "name": "Juan Pérez López",
    "date": "2026-05-09",
    "time": "12:34:21",
    "type": "TICKET ALMUERZO",
    "ticket_number": 15
}
```

**Valores válidos para `type`:** `TICKET ALMUERZO`, `TICKET DIETA`, `TICKET GERENCIA`, `TICKET EXTRA`, `TICKET VISITA`

**Respuesta exitosa (200):**
```json
{ "success": true, "message": "Ticket sent to printer" }
```

**Errores:**
| Código | Mensaje | Causa |
|--------|---------|-------|
| 400 | `"Missing required fields"` | Algún campo obligatorio ausente |
| 500 | `"Error al reimprimir el ticket. Revisa los logs."` | Error al ejecutar el script Python |

---

### GET /api/admin/report/excel

Genera el reporte administrativo completo en Excel (3 hojas: Registros, Resumen y Auditoría Manual).

**Autenticación:** admin

**Query params opcionales:** `startDate`, `endDate` (formato `YYYY-MM-DD`; default: hoy)

**Respuesta:** Archivo XLSX con `Content-Disposition: attachment; filename="reporte_admin_DESDE_a_HASTA.xlsx"`.

| Hoja | Contenido |
|------|-----------|
| Registros | Todas las transacciones del rango (incluye duplicados), con color por tipo de ticket |
| Resumen | Totales por tipo de ticket (con %) y totales por día (válidos vs duplicados) |
| Auditoría Manual | Log de tickets manuales con el operador que los imprimió |

**Errores:** 401/403 (sin token o inválido), 500 (error de generación)

Implementación: `backend/routes/adminRoutes.js` (`router.get('/report/excel', ...)`)

---

## 3.1 Módulo Control de Almuerzo (`/api/almuerzos`)

Consulta el tiempo de almuerzo emparejando la salida (marcación que imprime el ticket) con el retorno (segunda marcación). Alimenta la sección **Almuerzos** del panel AdminV2.

Todas las rutas exigen token de admin. Implementación: `backend/routes/almuerzoRoutes.js` + `backend/repositories/almuerzoRepository.js`.

**Estados devueltos en el campo `estado`:**

| Estado | `estadoLabel` | Significado |
|--------|---------------|-------------|
| `A_TIEMPO` | A tiempo | Retornó dentro del límite |
| `EXCEDIDO` | Excedió el tiempo | Retornó pasado el límite |
| `EN_ALMUERZO` | En almuerzo | Salió hoy y sigue dentro de su tiempo |
| `EXCEDIDO_EN_CURSO` | Sin marcar (tiempo vencido) | Salió hoy, ya pasó su tiempo y no ha marcado |
| `SIN_RETORNO` | No marcó retorno | Cerró el día sin marcar |

> El estado es **derivado en tiempo de consulta**, no el que está guardado en la fila. Ver DICCIONARIO_BASE_DATOS.md §9.

---

### GET /api/almuerzos

Listado paginado de sesiones.

**Autenticación:** admin

**Query params opcionales:**

| Param | Descripción |
|-------|-------------|
| `fecha` | Un solo día (`YYYY-MM-DD`). Tiene prioridad sobre `desde`/`hasta` |
| `desde`, `hasta` | Rango de fechas. Si vienen invertidos se ordenan automáticamente |
| `estado` | Uno de los cinco estados de la tabla anterior. Un valor no válido se ignora |
| `q` | Búsqueda por nombre o `zk_id` |
| `page` | Número de página (default `1`) |
| `pageSize` | `20`, `50`, `100` o `250` (default `50`; otro valor cae al default) |

Sin parámetros de fecha devuelve **el día de hoy**.

**Respuesta (200):**
```json
{
    "data": [
        {
            "id": 7,
            "userId": "101",
            "nombre": "ORELLANA MOSQUERA ROGER GABRIEL",
            "fecha": "2026-08-12",
            "horaSalida": "12:11",
            "horaRetorno": "12:48",
            "segundos": 2245,
            "duracion": "37:25",
            "estado": "EXCEDIDO",
            "estadoLabel": "Excedió el tiempo",
            "tipoTicket": "TICKET ALMUERZO",
            "numeroTicket": 5,
            "cierreManual": false,
            "observacion": null,
            "origen": "BIOMETRICO"
        }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 50
}
```

`origen: "BACKFILL"` indica un dato reconstruido del histórico por la migración 005, no una medición en vivo.

**Errores:** 401/403 (sin token o inválido), 500

---

### GET /api/almuerzos/resumen

Totales del rango, para las tarjetas del panel.

**Autenticación:** admin

**Query params:** los mismos de fecha que `GET /api/almuerzos` (`fecha` | `desde`+`hasta`).

**Respuesta (200):**
```json
{
    "desde": "2026-08-12",
    "hasta": "2026-08-12",
    "salidas": 49,
    "retornos": 49,
    "aTiempo": 12,
    "excedidos": 37,
    "enAlmuerzo": 0,
    "excedidoEnCurso": 0,
    "sinRetorno": 0,
    "sinMarcar": 0,
    "promedioSegundos": 1950,
    "maximoSegundos": 2401,
    "promedioDuracion": "32:30",
    "maximoDuracion": "40:01",
    "minutosPermitidos": 30,
    "toleranciaMinutos": 0,
    "controlActivo": true
}
```

| Campo | Detalle |
|-------|---------|
| `sinMarcar` | `sinRetorno + excedidoEnCurso`. Es el número que importa para gestión: quienes no marcaron y ya se les venció el tiempo |
| `promedioSegundos` | Solo de quienes retornaron. `null` si nadie retornó |
| `controlActivo` | Refleja `almuerzo_control_activo`. En `false` el panel avisa que no se están registrando sesiones nuevas |

---

### GET /api/almuerzos/excel

Descarga el detalle del rango en Excel.

**Autenticación:** admin

**Query params:** los mismos de fecha y filtro que `GET /api/almuerzos`.

**Respuesta:** XLSX con `Content-Disposition: attachment; filename="control_almuerzo_FECHA.xlsx"` (o `..._DESDE_a_HASTA.xlsx`).

| Hoja | Contenido |
|------|-----------|
| Control de Almuerzo | Detalle con color por estado y columna de origen (Biométrico / Inferido) |
| Resumen | Totales del rango y parámetros vigentes |

---

### POST /api/almuerzos/:id/cerrar-manual

Registra el retorno de alguien que olvidó marcar en el biométrico. La sesión queda con `cierre_manual = 1` y el estado se recalcula con el límite vigente.

**Autenticación:** **superadmin** (un token de `admin` recibe 403)

**Body:**
```json
{
    "horaRetorno": "13:05",
    "observacion": "Olvidó marcar al regresar"
}
```

| Campo | Requerido | Detalle |
|-------|-----------|---------|
| `horaRetorno` | Sí | Formato `HH:MM` o `HH:MM:SS` |
| `observacion` | No | Se recorta a 200 caracteres. Se le anexa el nombre del admin que hizo el cierre |

**Respuesta (200):**
```json
{ "success": true, "estado": "A_TIEMPO", "duracion": "21:52" }
```

**Errores:**

| Código | Motivo |
|--------|--------|
| 400 | Hora inválida, ID inválido, sesión inexistente, sesión ya cerrada, o retorno anterior a la salida |
| 403 | Token de `admin` sin permiso `superadmin` |
| 500 | Error interno |

---

## 4. Módulo Configuración (`/api/config`)

### GET /api/config

Obtiene toda la configuración del sistema como objeto key-value.

**Autenticación:** No requerida  

**Respuesta (200):**
```json
{
    "horario_activo": "true",
    "horario_inicio": "11:30",
    "horario_fin": "14:00",
    "almuerzo_control_activo": "true",
    "almuerzo_minutos_permitidos": "30",
    "almuerzo_tolerancia_minutos": "0",
    "almuerzo_retorno_min_minutos": "8",
    "almuerzo_horario_fin_retorno": "15:30",
    "almuerzo_excluir_ids": "14,27",
    "almuerzo_email_activo": "true",
    "almuerzo_email_destinos": "agarcia@detcuador.com"
}
```

Las claves `almuerzo_*` controlan el módulo de tiempo de almuerzo. Ver DICCIONARIO_BASE_DATOS.md §6 para el significado de cada una.

---

### POST /api/config

Actualiza una o más claves de configuración (upsert).

**Autenticación:** JWT Bearer (cualquier nivel admin)  

**Request body:** Objeto con las claves a actualizar.
```json
{
    "horario_activo": "true",
    "horario_inicio": "11:30",
    "horario_fin": "14:00"
}
```

**Respuesta (200):**
```json
{ "success": true, "message": "Configuration updated" }
```

**Errores:**
| Código | Mensaje | Causa |
|--------|---------|-------|
| 400 | `"No data provided"` | Body vacío o ausente |
| 401 | `"Token inválido o expirado"` | Token JWT inválido |
| 500 | `"Database error"` | Error de BD |

---

### GET /api/config/especiales

Retorna los IDs de usuarios especiales (VIP y Gerencia) desde la tabla `usuarios`.  
**Cacheado en memoria por 5 minutos** para reducir consultas a BD.  
Consumido por el frontend y potencialmente por el worker Python.

**Autenticación:** No requerida  

**Respuesta (200):**
```json
{
    "vips": ["14", "27"],
    "gerencia": ["16", "119", "120"]
}
```

---

## 5. Módulo Dashboard (`/api`)

Todos los endpoints de este módulo son **públicos** (sin autenticación).

### GET /api/stats/summary

Resumen de estadísticas del día actual o de un rango de fechas.

**Query params opcionales:**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `startDate` | `YYYY-MM-DD` | Inicio del rango |
| `endDate` | `YYYY-MM-DD` | Fin del rango |

**Respuesta (200):**
```json
{
    "totalLunches": 87,
    "totalNormal": 62,
    "totalDieta": 14,
    "totalGerencia": 3,
    "totalVisita": 5,
    "totalExtra": 2,
    "totalTercero": 1,
    "totalSpecial": 22,
    "mostPopularType": "TICKET ALMUERZO"
}
```

---

### GET /api/stats/daily

Estadísticas agrupadas por día (últimos 8 días por defecto).

**Query params opcionales:** `startDate`, `endDate`

**Respuesta (200):**
```json
[
    {
        "date": "2026-05-01",
        "lunches": 95,
        "type_normal": 70,
        "type_dieta": 15,
        "type_gerencia": 3,
        "type_visita": 5,
        "type_extra": 2
    },
    {
        "date": "2026-05-02",
        "lunches": 88,
        "type_normal": 65,
        "type_dieta": 13,
        "type_gerencia": 3,
        "type_visita": 4,
        "type_extra": 3
    }
]
```

---

### GET /api/stats/history

Historial de registros con filtros opcionales (máximo 100 registros).

**Query params opcionales:**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `startDate` | `YYYY-MM-DD` | Inicio del rango |
| `endDate` | `YYYY-MM-DD` | Fin del rango |
| `type` | string | Filtrar por tipo: `normal`, `dieta`, `gerencia`, `visita`, `extra`, `tercero` |

**Respuesta (200):**
```json
[
    {
        "id": 542,
        "user": "Ana Rodríguez Vega",
        "time": "12:01:45",
        "date": "2026-05-09",
        "type": "TICKET DIETA",
        "numero_ticket": 3
    }
]
```

---

### GET /api/stats/export-excel

Exporta registros como archivo Excel (.xlsx). (Es el botón de exportación del Dashboard público; para el reporte administrativo completo ver `GET /api/admin/report/excel`.)

**Query params requeridos:** `startDate`, `endDate`  
**Query params opcionales:** `type`

**Respuesta:** Archivo Excel con `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.  
Nombre del archivo incluido en `Content-Disposition: attachment; filename="...xlsx"`.

---

### GET /api/logs/today

Obtiene los logs del día actual formateados para la terminal en vivo.

**Respuesta (200):**
```json
[
    {
        "id": 540,
        "timestamp": "11:58:33",
        "type": "TICKET",
        "message": "Carlos Mendoza - TICKET ALMUERZO",
        "status": "success"
    },
    {
        "id": 541,
        "timestamp": "12:01:12",
        "type": "ALERTA",
        "message": "Pedro López - Intento de Duplicado",
        "status": "error"
    }
]
```

---

## 6. Módulo Tickets Manuales (`/api/manual-tickets`)

### POST /api/manual-tickets/login

Autentica a un operador de impresión manual.

**Autenticación requerida:** No  
**Rate limit:** 10/15min

**Request body:**
```json
{
    "username": "operador1",
    "password": "contraseña"
}
```

**Respuesta exitosa (200):**
```json
{
    "success": true,
    "user": {
        "id": 3,
        "username": "operador1",
        "nombre_real": "María Torres"
    }
}
```

**Errores:**
| Código | Mensaje | Causa |
|--------|---------|-------|
| 401 | `"Usuario no encontrado o inactivo"` | usuario no existe o `activo=0` |
| 401 | `"Contraseña incorrecta"` | bcrypt.compare falló |

---

### POST /api/manual-tickets/print

Imprime un ticket para un visitante/proveedor externo.

**Autenticación:** `printedByUserId` válido en BD  
**Rate limit:** 30/min

**Request body:**
```json
{
    "visitorName": "Dr. Ramiro Castro",
    "printedByUserId": 3
}
```

**Respuesta exitosa (200):**
```json
{
    "success": true,
    "message": "Ticket #47 enviado a impresión"
}
```

**Errores:**
| Código | Mensaje | Causa |
|--------|---------|-------|
| 400 | `"Missing data"` | visitorName o printedByUserId ausente |
| 403 | `"Usuario no autorizado"` | printedByUserId no existe en BD |
| 403 | `"Fuera de horario de servicio (HH:MM - HH:MM)"` | petición fuera del horario configurado |
| 500 | `"Error imprimiendo ticket. Revisa los logs."` | fallo en el script Python |

---

### POST /api/manual-tickets/print-tercero

Imprime un ticket para un empleado que no puede ir al biométrico.

El sistema determina el tipo de ticket automáticamente (ALMUERZO/DIETA/GERENCIA) usando la misma lógica que el worker Python.

**Autenticación:** `printedByUserId` válido en BD  
**Rate limit:** 30/min

**Request body:**
```json
{
    "employeeId": "78",
    "printedByUserId": 3
}
```

**Respuesta exitosa (200):**
```json
{
    "success": true,
    "message": "Ticket #48 (TICKET ALMUERZO) para Juan Pérez enviado a impresión",
    "ticketNumber": 48,
    "tipoTicket": "TICKET ALMUERZO",
    "impresoPor": "María Torres"
}
```

**Errores:**
| Código | Mensaje | Causa |
|--------|---------|-------|
| 400 | `"Faltan datos requeridos"` | employeeId o printedByUserId ausente |
| 403 | `"Usuario no autorizado o inactivo"` | printedByUserId inactivo o inexistente |
| 403 | `"Fuera de horario de servicio (HH:MM - HH:MM)"` | fuera del horario configurado |
| 404 | `"Empleado no encontrado con ese ID"` | employeeId no existe en `usuarios` |
| 409 | `"<Nombre> ya tiene ticket registrado hoy"` | duplicado — ya comió hoy |
| 500 | `"Error imprimiendo ticket. Revisa los logs."` | fallo en el script Python |

---

### GET /api/manual-tickets/users

Lista todos los operadores/usuarios de impresión manual.

**Autenticación:** No requerida *(deuda técnica conocida — debería requerir JWT)*  

**Respuesta (200):**
```json
[
    {
        "id": 1,
        "username": "admin",
        "nombre_real": "John Garcia",
        "activo": 1,
        "created_at": "2026-01-15T14:30:00.000Z"
    },
    {
        "id": 3,
        "username": "operador1",
        "nombre_real": "María Torres",
        "activo": 1,
        "created_at": "2026-02-01T08:00:00.000Z"
    }
]
```

---

### POST /api/manual-tickets/users

Crea un nuevo operador de impresión manual.

**Autenticación:** No requerida *(deuda técnica conocida)*  

**Request body:**
```json
{
    "username": "operador2",
    "password": "contraseñaSegura",
    "nombre_real": "Roberto Vargas"
}
```

**Respuesta (200):**
```json
{ "success": true, "message": "Usuario creado" }
```

---

### PUT /api/manual-tickets/users/:id

Actualiza un operador. Si se incluye `password`, se hashea automáticamente.

**Autenticación:** No requerida *(deuda técnica conocida)*  

**Request body:**
```json
{
    "nombre_real": "Roberto Vargas Actualizado",
    "activo": 1,
    "password": "nuevaContraseña"
}
```

**Respuesta (200):**
```json
{ "success": true, "message": "Usuario actualizado" }
```

---

### DELETE /api/manual-tickets/users/:id

Elimina permanentemente un operador.

**Autenticación:** No requerida *(deuda técnica conocida)*  

**Respuesta (200):**
```json
{ "success": true, "message": "Usuario eliminado" }
```

---

## 7. Endpoints Auxiliares

### GET /api/health

Health check para monitoreo externo.

**Autenticación:** No requerida  

**Respuesta (200):**
```json
{ "status": "online", "timestamp": "2026-05-09T14:30:00.000Z" }
```

---

### GET /api/users/:id

Obtiene información de un empleado por su ZK ID.

**Autenticación:** No requerida  
**Parámetros URL:** `id` — ZK ID del empleado (número como string)

**Respuesta exitosa (200):**
```json
{
    "success": true,
    "name": "Ana Rodríguez Vega",
    "role": "Operativo",
    "defaultMenuType": "Dieta"
}
```

**Error (404):**
```json
{ "success": false, "message": "Usuario no encontrado" }
```

---

### PUT /api/users/:id/preferences

Actualiza el rol y preferencia de menú de un empleado. También emite evento Socket.IO `new_log` para notificar el cambio en tiempo real.

**Autenticación:** No requerida  

**Request body:**
```json
{
    "role": "Operativo",
    "defaultMenuType": "Dieta"
}
```

**Valores válidos `defaultMenuType`:** `"Normal"` | `"Dieta"`

**Respuesta (200):**
```json
{ "success": true }
```

---

### GET /api/search/users

Búsqueda de empleados por nombre o ID (para autocompletado). Retorna máximo 10 resultados.

**Query params requeridos:**
| Param | Descripción |
|-------|-------------|
| `q` | Término de búsqueda (mínimo 1 carácter) |

**Respuesta (200):**
```json
[
    { "zk_id": "78", "nombre_completo": "Juan Pérez López" },
    { "zk_id": "79", "nombre_completo": "Juana Pérez Torres" }
]
```

---

### GET /api/menu/:userId

Obtiene las selecciones de menú de la semana actual para un empleado.

**Autenticación:** No requerida  

**Respuesta (200):**
```json
[
    { "id": 25, "user_id": "78", "fecha": "2026-05-12", "opcion": 1, "sin_sopa": 0, "sin_arroz": 0 },
    { "id": 26, "user_id": "78", "fecha": "2026-05-13", "opcion": 2, "sin_sopa": 1, "sin_arroz": 0 }
]
```

`opcion`: `1` = Normal, `2` = Dieta

---

### POST /api/menu

Guarda o actualiza selecciones de menú semanales. Usa transacción SQL (insert o update según existan).

**Autenticación:** No requerida  

**Request body:**
```json
{
    "userId": "78",
    "selections": [
        { "date": "2026-05-12", "option": 1 },
        { "date": "2026-05-13", "option": 2 },
        { "date": "2026-05-14", "option": 1 }
    ]
}
```

**Respuesta (200):**
```json
{ "success": true }
```

**Error (400):**
```json
{ "error": "Missing data" }
```

---

## 8. Eventos Socket.IO

La URL de conexión es la misma que la base URL (Nginx enruta `/socket.io/` al backend).

```javascript
import { io } from 'socket.io-client';
const socket = io('http://150.36.200.252:5001');
```

### Evento: `new_log`

Emitido por el servidor cuando:
- El worker Python registra un nuevo evento biométrico (polling cada 2s)
- Un operador actualiza preferencias de usuario (`PUT /api/users/:id/preferences`)
- Un operador actualiza el menú semanal (`POST /api/menu`)

**Payload:**
```json
{
    "type": "TICKET",
    "message": "Ana Rodríguez - TICKET DIETA",
    "status": "success"
}
```

| Campo | Valores posibles |
|-------|-----------------|
| `type` | `"TICKET"`, `"ALERTA"`, `"WEB"` |
| `status` | `"success"`, `"error"`, `"info"` |
| `message` | Texto descriptivo del evento |

**Ejemplo de escucha en React:**
```javascript
useEffect(() => {
    socket.on('new_log', (log) => {
        setLogs(prev => [...prev.slice(-99), log]); // mantener últimos 100
    });
    return () => socket.off('new_log');
}, []);
```

---

## 9. Códigos de Error

### Respuestas de error estándar

Todos los errores retornan JSON con la clave `error`:

```json
{ "error": "Descripción del error" }
```

### Tabla de códigos HTTP

| Código | Significado | Causa común |
|--------|-------------|-------------|
| 200 | OK | Operación exitosa |
| 400 | Bad Request | Campos requeridos ausentes o inválidos |
| 401 | Unauthorized | Credenciales incorrectas o token inválido/expirado |
| 403 | Forbidden | Sin permisos, rol insuficiente, o fuera de horario |
| 404 | Not Found | Recurso no encontrado (empleado, tabla, etc.) |
| 409 | Conflict | Registro duplicado (empleado ya tiene ticket hoy) |
| 429 | Too Many Requests | Rate limit excedido |
| 500 | Internal Server Error | Error de BD u otro error interno |

### Mensajes de error por módulo

Los endpoints de `adminRoutes.js` retornan mensajes genéricos para errores de servidor (no filtran información interna):
```json
{ "error": "Error interno del servidor. Contacta al administrador." }
```

Los endpoints de `dashboardRoutes.js` retornan:
```json
{ "error": "Database error" }
```

---

## 10. Ejemplos con curl

### Login y obtener token

```bash
# Login admin
TOKEN=$(curl -s -X POST http://150.36.200.252:5001/api/admin/login \
    -H 'Content-Type: application/json' \
    -d '{"username":"admin","password":"tu_password"}' \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

echo "Token: $TOKEN"
```

### Consultar estadísticas del día

```bash
curl http://150.36.200.252:5001/api/stats/summary
```

### Consultar estadísticas de un rango

```bash
curl "http://150.36.200.252:5001/api/stats/summary?startDate=2026-05-01&endDate=2026-05-09"
```

### Ver historial filtrando por dieta

```bash
curl "http://150.36.200.252:5001/api/stats/history?startDate=2026-05-09&endDate=2026-05-09&type=dieta"
```

### Actualizar configuración de horario

```bash
curl -X POST http://150.36.200.252:5001/api/config \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"horario_activo":"true","horario_inicio":"11:30","horario_fin":"14:00"}'
```

### Obtener IDs especiales cacheados

```bash
curl http://150.36.200.252:5001/api/config/especiales
```

### Reimprimir un ticket

```bash
curl -X POST http://150.36.200.252:5001/api/admin/reprint \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{
        "name": "Juan Pérez López",
        "date": "2026-05-09",
        "time": "12:34:21",
        "type": "TICKET ALMUERZO",
        "ticket_number": 15
    }'
```

### Imprimir ticket de visita

```bash
# Paso 1: Login operador
OPERATOR_ID=$(curl -s -X POST http://150.36.200.252:5001/api/manual-tickets/login \
    -H 'Content-Type: application/json' \
    -d '{"username":"operador1","password":"su_password"}' \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")

# Paso 2: Imprimir
curl -X POST http://150.36.200.252:5001/api/manual-tickets/print \
    -H 'Content-Type: application/json' \
    -d "{\"visitorName\":\"Dr. Ramiro Castro\",\"printedByUserId\":$OPERATOR_ID}"
```

### Health check

```bash
curl http://150.36.200.252:5001/api/health
# → {"status":"online","timestamp":"2026-05-09T14:30:00.000Z"}
```

### Exportar a Excel (descargar archivo)

```bash
curl -o "reporte_mayo.xlsx" \
    "http://150.36.200.252:5001/api/stats/export-excel?startDate=2026-05-01&endDate=2026-05-31"
```
