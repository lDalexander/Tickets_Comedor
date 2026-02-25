# Referencia de API REST (NodeJS)

El Backend NodeJS expone las siguientes rutas, divididas modularmente.

## URL Base
```
http://localhost:3000/api
```
*(Asumiendo el puerto por defecto `3000`). Todas las repuestas devuelven un objeto JSON.*

---

## 1. Módulo Estadísticas (`/stats`)

Consultas cacheadas mediante `LRU-Cache` en memoria (5 Minutos de retención por Endpoint) para disminuir el desgaste de la BD.

### `GET /stats/summary`
Retorna el sumario de comidas emitidas para el dashboard de totales.
* **Query Params (Opcionales):**
  * `startDate` (e.g. `2024-05-01`)
  * `endDate`   (e.g. `2024-05-07`)
  * `type`      (e.g. `extra`, `especial`)
* **Respuesta de Extracción (Ejemplo 200 OK):**
```json
{
  "totalLunches": 105,
  "totalNormal": 80,
  "totalSpecial": 25,
  "mostPopularType": "Almuerzo Normal"
}
```

### `GET /stats/history`
Retorna la tabla paginada/filas absolutas requeridas por el grid en la pantalla inicial de historial.
* **Query Params:** `startDate`, `endDate`, `type`.
* **Respuesta de Extracción (Ejemplo 200 OK):**
```json
[
  {
    "id": 16900,
    "user": "JUAN PEREZ",
    "numero_ticket": 120,
    "date": "2026-05-15",
    "time": "12:30:15",
    "type": "ALMUERZO NORMAL",
    "status": "Impreso"
  }
]
```

### `GET /stats/daily`
Devuelve el histórico en series de tiempo para inyectarlo en los `ChartsJS`.

### `GET /stats/export-excel`
Inicia una descarga como `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` construyendo un archivo sobre la marcha con `exceljs`.

---

## 2. Módulo Eventos SSE (`/events`)

### `GET /events/live`
Abre una conexión **Server-Sent Events (SSE)**.
* **Propósito:** Emite un stream unidireccional de la tabla `registros` cuando Node detecta una nueva inserción de Python mediante un long-polling asíncrono y ultra liviano.
* **Ejemplo del Cliente (Frontend):**
```js
const eventSource = new EventSource('/api/events/live');
eventSource.onmessage = function(event) {
  console.log("Nuevo ticket lanzado:", JSON.parse(event.data));
};
```

---

## 3. Módulo Administración Dieta Semanal (`/preferences`)

Contiene la administración y alteración del Menú para cada trabajador.

### `GET /preferences/users`
Lista todos los usuarios extraídos de `usuarios` para cargarlos en los combos seleccionables o búsquedas indexadas.

### `GET /preferences/list`
Extrae todas las celdas elegidas en el menú actual según fecha de inicio usando JOINs y GROUPs relacionales.

### `POST /preferences/save`
Sobrescribe las elecciones del menú de la dieta.
* **Headers:** `Content-Type: application/json`
* **Body Request:**
```json
{
  "userId": "ZKT_908",
  "selections": {
    "2026-05-15": "especial",
    "2026-05-16": "normal"
  }
}
```

---

## 4. Módulo Tickets Forzados (Visitas / Manuales) (`/tickets`)

Permite a Recepción generar tickets de Almuerzo extra sorteando la necesidad del biométrico, lo cual detona el script en Python (`reprint_ticket.py`).

### `POST /tickets/manual`
Levanta el comando asincrónico directo contra la impresora.
* **Cuerpo JSON Requerido:**
```json
{
  "usuarioId": "VISITA_001",
  "nombre": "INVITADO DE VENTAS",
  "departamento": "EXTERNO",
  "tipoTicket": "extra"
}
```
* **Respuesta de Extracción (Ejemplo 200 OK):**
```json
{
  "success": true,
  "message": "Ticket extra procesado correctamente mediante Python.",
  "ticketId": 35789
}
```
