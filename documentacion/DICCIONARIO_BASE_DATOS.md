# Diccionario de Base de Datos — SIGAC
## Sistema de Gestión de Acceso al Comedor — DETCUADOR S.A.

**Base de datos:** `control_comedor`
**Motor:** MySQL 8.0 / MariaDB — InnoDB
**Charset:** `utf8mb4` (colaciones mixtas: `utf8mb4_general_ci` en tablas originales, `utf8mb4_0900_ai_ci` en tablas nuevas)
**Última actualización del documento:** Agosto 2026
**Fuente:** esquema extraído directamente de la base de datos de producción (`SHOW CREATE TABLE`)

---

## Índice

1. [Visión general del modelo](#1-visión-general-del-modelo)
2. [Diagrama entidad-relación](#2-diagrama-entidad-relación)
3. [Tabla `usuarios`](#3-tabla-usuarios)
4. [Tabla `registros`](#4-tabla-registros)
5. [Tabla `menu_diario`](#5-tabla-menu_diario)
6. [Tabla `configuracion`](#6-tabla-configuracion)
7. [Tabla `usuarios_impresion_manual`](#7-tabla-usuarios_impresion_manual)
8. [Tabla `log_tickets_manuales`](#8-tabla-log_tickets_manuales)
9. [Tabla `almuerzo_sesiones`](#9-tabla-almuerzo_sesiones)
10. [Matriz tabla ↔ código](#10-matriz-tabla--código)
11. [Convenciones y reglas de integridad](#11-convenciones-y-reglas-de-integridad)
12. [Consultas de referencia](#12-consultas-de-referencia)

---

## 1. Visión General del Modelo

La base de datos tiene **7 tablas** organizadas en cuatro dominios:

| Dominio | Tablas | Propósito |
|---------|--------|-----------|
| **Operación biométrica** | `usuarios`, `registros`, `menu_diario` | Empleados sincronizados del ZKTeco, marcaciones de almuerzo y preferencia de menú del día |
| **Tickets manuales** | `usuarios_impresion_manual`, `log_tickets_manuales` | Operadores/admins del panel web y auditoría de tickets impresos manualmente (visitas y terceros) |
| **Control de almuerzo** | `almuerzo_sesiones` | Emparejamiento salida/retorno y tiempo consumido por cada empleado (migración 004) |
| **Configuración** | `configuracion` | Parámetros del sistema clave-valor (horario de servicio, control de almuerzo) |

Volumen aproximado (agosto 2026): ~175 empleados, ~16 100 registros de marcación (desde febrero 2026), ~1 300 selecciones de menú, ~535 tickets manuales, ~550 sesiones de almuerzo.

---

## 2. Diagrama Entidad-Relación

```
┌──────────────────────┐          ┌──────────────────────────┐
│      usuarios        │          │        registros         │
│──────────────────────│          │──────────────────────────│
│ PK zk_id             │◄─ ─ ─ ─ ─│    user_id (lógica, sin  │
│    nombre_completo   │  join    │       FK física)         │
│    role              │  lógico  │ PK id                    │
│    tipo_menu_predet. │          │    nombre, fecha, hora   │
└──────────┬───────────┘          │    descripcion           │
           ┆ join lógico          │    numero_ticket         │
           ▼                      └──────────────────────────┘
┌──────────────────────┐
│     menu_diario      │          ┌──────────────────────────┐
│──────────────────────│          │      configuracion       │
│ PK id                │          │──────────────────────────│
│ UK (user_id, fecha)  │          │ PK clave                 │
│    opcion (1|2)      │          │    valor                 │
│    sin_sopa          │          │    updated_at            │
│    sin_arroz         │          └──────────────────────────┘
└──────────────────────┘

┌──────────────────────────┐      ┌──────────────────────────┐
│ usuarios_impresion_manual│      │   log_tickets_manuales   │
│──────────────────────────│      │──────────────────────────│
│ PK id                    │◄─────│ FK impreso_por_usuario_id│
│ UK username              │ (FK  │ PK id                    │
│    password_hash (bcrypt)│ real)│    nombre_visitante      │
│    nombre_real, rol      │      │    fecha_impresion       │
│    activo, created_at    │      └──────────────────────────┘
└──────────────────────────┘

┌──────────────────────────────┐
│      almuerzo_sesiones       │  Deriva de `registros`: la 1ª marcación
│──────────────────────────────│  del día abre la sesión (hora_salida) y
│ PK id                        │  la 2ª la cierra (hora_retorno).
│ UK (user_id, fecha)          │◄─ ─ ─ ─ ─ join lógico con usuarios.zk_id
│    hora_salida, hora_retorno │
│    segundos_usados           │
│    minutos_usados (GENERATED)│
│    estado, origen            │
│    cierre_manual, observacion│
└──────────────────────────────┘
```

> **Nota importante:** la única foreign key **física** del esquema es
> `log_tickets_manuales.impreso_por_usuario_id → usuarios_impresion_manual.id`.
> Las relaciones `registros.user_id → usuarios.zk_id` y `menu_diario.user_id → usuarios.zk_id`
> son **lógicas** (se resuelven con JOIN en el código, sin constraint). Esto es intencional:
> el worker debe poder registrar marcaciones aunque el usuario aún no esté sincronizado
> desde el biométrico.

---

## 3. Tabla `usuarios`

Catálogo de empleados sincronizado desde el lector biométrico ZKTeco. Es la fuente de verdad de nombre y rol de cada persona.

**Escriben:** worker Python (sincronización desde el ZKTeco), panel AdminV2 (edición de rol/menú).
**Leen:** worker Python, todas las rutas del backend Node.

| Columna | Tipo | Nulo | Default | Descripción |
|---------|------|------|---------|-------------|
| `zk_id` | `varchar(50)` | NO | — | **PK.** ID del usuario en el dispositivo ZKTeco. Es texto porque el ZKTeco lo entrega como string |
| `nombre_completo` | `varchar(150)` | NO | — | Nombre completo del empleado tal como está enrolado en el biométrico |
| `role` | `varchar(50)` | SÍ | `'Operativo'` | Rol del empleado. Dominio observado: `Operativo`, `Administrativo`, `Visitante`. Con rol `Administrativo` la pantalla de selección permite elegir menú por día |
| `zona` | `varchar(20)` | SÍ | NULL | Área de trabajo (migración 006). `NULL` = sin clasificar. Decide a quién se le controla el tiempo de almuerzo. Ver dominio abajo |
| `tipo_menu_predeterminado` | `varchar(50)` | SÍ | `'Normal'` | Tipo de menú que se imprime por defecto. Dominio: `Normal`, `Dieta` |

**Dominio de `zona`**

El catálogo no está en el esquema: vive en `configuracion.almuerzo_zonas_disponibles`, para poder agregar o quitar zonas sin migrar. Por eso la columna es `VARCHAR` y no `ENUM`.

| Zona | ¿Se le controla el tiempo de almuerzo? |
|------|----------------------------------------|
| `SOLIDO` | Sí |
| `LIQUIDO` | Sí |
| `SOPLADO` | Sí |
| `MANTENIMIENTO` | Sí |
| `BODEGA` | No |
| `LOGISTICA` | No |
| `ADMINISTRATIVOS` | No |
| `NULL` (sin clasificar) | Según `almuerzo_controlar_sin_zona` (hoy `true`) |

> `zona` y `role` son **independientes**. `role` controla la pantalla de selección de menú; `zona` controla la medición del almuerzo. Un `Administrativo` de `role` fue sembrado con zona `ADMINISTRATIVOS` por la migración 006, pero después pueden divergir sin problema.

**Índices**

| Nombre | Tipo | Columnas | Uso |
|--------|------|----------|-----|
| `PRIMARY` | PK | `zk_id` | — |
| `idx_usuarios_zona` | INDEX | `zona` | Filtros por zona del panel y del reporte |

> ⚠️ **Migración 002 pendiente en producción (verificado julio 2026).** El archivo
> `sql/migrations/002_add_tipo_especial.sql` agrega la columna `tipo_especial`
> (`NULL` | `'VIP'` | `'GERENCIA'`), pero **no está aplicada**: la tabla de producción no tiene esa
> columna. Consecuencias actuales:
> - `GET /api/config/especiales` devuelve **500** (`statsRepository.js:50` consulta `tipo_especial`).
> - Los IDs especiales siguen **hardcodeados** en el código: VIP = `['14','27']` y
>   GERENCIA = `['16','119','120']` en `backend/python_core/src/database.py` (líneas 44-45)
>   y duplicados en `backend/routes/manualTicketRoutes.js`.
> Para aplicar: `mysql -u admin -p control_comedor < sql/migrations/002_add_tipo_especial.sql`
> (ver MANUAL_OPERACIONES.md §12) y actualizar este documento.

**Semántica de usuarios especiales (hoy en código, no en BD):**

| Categoría | zk_id | Efecto |
|-----------|-------|--------|
| VIP | `14`, `27` | Sin filtro anti-rebote; una segunda marcación en el día genera `TICKET EXTRA` en vez de rechazo |
| GERENCIA | `16`, `119`, `120` | Su marcación siempre genera `TICKET GERENCIA` |

---

## 4. Tabla `registros`

Bitácora de marcaciones del comedor: cada fila es un intento de almuerzo (exitoso o rechazado). Es la tabla central del sistema — de aquí salen las estadísticas del dashboard, el historial del panel admin y las exportaciones a Excel.

**Escriben:** worker Python (marcaciones biométricas), backend Node (tickets manuales de visita/tercero).
**Leen:** `statsRepository.js` (estadísticas), `server.js` (polling para Socket.IO), rutas admin (historial/exportación), `backup_comedor.py`.

| Columna | Tipo | Nulo | Default | Descripción |
|---------|------|------|---------|-------------|
| `id` | `int` | NO | AUTO_INCREMENT | **PK.** Identificador del registro |
| `user_id` | `varchar(50)` | NO | — | `zk_id` del empleado (join lógico a `usuarios`). Para tickets de visita se genera un ID sintético `VISITA_{timestamp}`; en tickets de tercero se usa el `zk_id` real del empleado |
| `nombre` | `varchar(150)` | SÍ | NULL | Nombre desnormalizado en el momento de la marcación (snapshot; no cambia si luego se renombra al usuario) |
| `fecha` | `date` | NO | — | Fecha de la marcación (zona horaria del servidor) |
| `hora` | `time` | NO | — | Hora de la marcación |
| `descripcion` | `varchar(50)` | SÍ | NULL | Tipo de evento. Ver dominio abajo |
| `numero_ticket` | `int` | SÍ | `0` | Número correlativo del ticket impreso **dentro del día**. `0` = sin ticket (p. ej. duplicado rechazado) |

**Dominio de `descripcion`** (valores reales en producción):

| Valor | Significado | ¿Imprime ticket? |
|-------|-------------|------------------|
| `TICKET ALMUERZO` | Almuerzo normal de empleado | Sí |
| `TICKET DIETA` | Menú de dieta (según `tipo_menu_predeterminado`) | Sí |
| `TICKET GERENCIA` | Menú especial de gerencia | Sí |
| `TICKET VISITA` | Ticket manual para visitante (panel operador) | Sí |
| `TICKET EXTRA` | Segundo almuerzo autorizado (VIP) / ticket de tercero | Sí |
| `RETORNO ALMUERZO` | Segunda marcación del día: el empleado regresó del almuerzo. Cierra su fila en `almuerzo_sesiones` | No (`numero_ticket = NULL`) |
| `INTENTO DE DUPLICADO` | Rechazo: el empleado ya almorzó hoy y la marcación llegó **antes** del umbral `almuerzo_retorno_min_minutos` (reintento por ticket no impreso), o su sesión ya estaba cerrada | No (`numero_ticket = 0`) |

**Índices**

| Nombre | Tipo | Columnas | Uso |
|--------|------|----------|-----|
| `PRIMARY` | PK | `id` | — |
| `idx_registros_fecha_desc` | INDEX | `(fecha, descripcion)` | Optimiza las consultas de estadísticas del día y filtros del historial |

---

## 5. Tabla `menu_diario`

Selección de menú del día por empleado (opción 1 u opción 2) con preferencias, hecha desde la pantalla de selección del frontend.

**Escriben:** backend Node (`server.js` — pantalla de selección), tickets manuales.
**Leen:** worker Python (para imprimir la opción correcta en el ticket), backend Node.

| Columna | Tipo | Nulo | Default | Descripción |
|---------|------|------|---------|-------------|
| `id` | `int` | NO | AUTO_INCREMENT | **PK** |
| `user_id` | `varchar(50)` | SÍ | NULL | `zk_id` del empleado (join lógico a `usuarios`) |
| `fecha` | `date` | SÍ | NULL | Día al que aplica la selección |
| `opcion` | `int` | SÍ | NULL | Opción de menú elegida. Dominio: `1` = menú normal, `2` = menú de dieta (el worker imprime `TICKET DIETA` si hay una fila con `opcion = 2` para hoy) |
| `fecha_registro` | `datetime` | SÍ | `CURRENT_TIMESTAMP` | Momento en que se hizo la selección |
| `sin_sopa` | `tinyint(1)` | SÍ | `0` | `1` = el empleado pidió su almuerzo sin sopa |
| `sin_arroz` | `tinyint(1)` | SÍ | `0` | `1` = el empleado pidió su almuerzo sin arroz |

**Índices**

| Nombre | Tipo | Columnas | Uso |
|--------|------|----------|-----|
| `PRIMARY` | PK | `id` | — |
| `user_id` | UNIQUE | `(user_id, fecha)` | **Regla de negocio:** máximo una selección de menú por empleado por día. Los upserts dependen de este unique |

---

## 6. Tabla `configuracion`

Almacén clave-valor de parámetros del sistema, editable desde el panel AdminV2 (sección Configuración).

**Escriben:** `configRoutes.js` (POST /api/config, requiere JWT admin).
**Leen:** worker Python (valida horario antes de imprimir), backend Node.

| Columna | Tipo | Nulo | Default | Descripción |
|---------|------|------|---------|-------------|
| `clave` | `varchar(50)` | NO | — | **PK.** Nombre del parámetro |
| `valor` | `text` | SÍ | NULL | Valor serializado como texto |
| `updated_at` | `timestamp` | SÍ | `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | Última modificación (automático) |

**Claves existentes en producción**

| Clave | Ejemplo de valor | Significado |
|-------|------------------|-------------|
| `horario_activo` | `true` / `false` | Si `true`, solo se imprimen tickets dentro del rango horario |
| `horario_inicio` | `11:30` | Hora de inicio del servicio de almuerzo |
| `horario_fin` | `14:00` | Hora de fin del servicio de almuerzo |

**Claves del control de tiempo de almuerzo** (migración 004)

| Clave | Valor en producción | Significado |
|-------|--------------------|-------------|
| `almuerzo_control_activo` | `true` | Interruptor maestro. En `false` el worker vuelve al comportamiento anterior (la 2ª marcación es duplicado) sin necesidad de desplegar código. Es la vía de rollback |
| `almuerzo_minutos_permitidos` | `30` | Minutos concedidos para almorzar, contados desde la marcación que imprime el ticket |
| `almuerzo_tolerancia_minutos` | `0` | Gracia adicional antes de marcar `EXCEDIDO`. `0` = límite estricto: 30:01 ya incumple |
| `almuerzo_retorno_min_minutos` | `8` | Umbral que separa un retorno real de un reintento por ticket no impreso. Por debajo, la marcación sigue siendo `INTENTO DE DUPLICADO` |
| `almuerzo_horario_fin_retorno` | `15:30` | Hasta qué hora se aceptan retornos, más allá de `horario_fin`. Sin esta ventana, quien saca ticket a las 13:50 y vuelve a las 14:25 no quedaría registrado |
| `almuerzo_excluir_ids` | `14,27` | `zk_id` sin control de tiempo (VIPs con derecho a ticket extra). No se les abre sesión, para que no aparezcan como `SIN_RETORNO` |
| `almuerzo_email_activo` | `true` | Habilita los reportes por correo (diario **y** semanal) |
| `almuerzo_email_destinos` | `agarcia@detcuador.com` | Destinatarios de los reportes, separados por coma |
| `almuerzo_email_destinos_semanal` | *(no creada)* | Opcional. Si existe, recibe el resumen semanal en lugar de `almuerzo_email_destinos` |
| `almuerzo_zonas_disponibles` | `BODEGA,LOGISTICA,SOLIDO,LIQUIDO,SOPLADO,MANTENIMIENTO,ADMINISTRATIVOS` | Catálogo de zonas que ofrece el selector del panel (migración 006) |
| `almuerzo_zonas_controladas` | `SOLIDO,LIQUIDO,SOPLADO,MANTENIMIENTO` | Subconjunto de zonas a las que SÍ se mide el tiempo. Editable en AdminV2 → Zonas (solo superadmin) |
| `almuerzo_controlar_sin_zona` | `true` | Qué hacer con quien no tiene zona. `true` = se le controla, para no apagar la medición mientras se clasifica al personal |

> Para agregar un parámetro nuevo basta un `INSERT` — no requiere migración. Documentar aquí cualquier clave nueva.
>
> **Cuidado con la duplicación:** `almuerzo_excluir_ids` repite la lista `IDS_VIPS` que sigue *hardcodeada* en `backend/python_core/src/database.py`. Si cambian los VIPs hay que actualizar ambos lugares.

---

## 7. Tabla `usuarios_impresion_manual`

Cuentas de acceso al panel web (operadores de tickets manuales y administradores del panel AdminV2). **No confundir con `usuarios`** (empleados del biométrico).

**Escriben:** rutas admin (CRUD de operadores), scripts de mantenimiento.
**Leen:** `manualTicketRoutes.js` (login operador), `adminRoutes.js` (login admin con JWT).

| Columna | Tipo | Nulo | Default | Descripción |
|---------|------|------|---------|-------------|
| `id` | `int` | NO | AUTO_INCREMENT | **PK** |
| `username` | `varchar(50)` | NO | — | Nombre de usuario para login. **UNIQUE** |
| `password_hash` | `varchar(255)` | NO | — | Hash bcrypt de la contraseña (nunca se guarda en claro) |
| `nombre_real` | `varchar(100)` | NO | — | Nombre de la persona (se imprime en la auditoría) |
| `activo` | `tinyint(1)` | SÍ | `1` | `0` = cuenta deshabilitada (soft delete; no se borran filas para preservar la FK de auditoría) |
| `created_at` | `timestamp` | SÍ | `CURRENT_TIMESTAMP` | Fecha de creación de la cuenta |
| `rol` | `varchar(20)` | NO | `'operador'` | Dominio: `operador` (solo imprime tickets), `admin` (acceso completo al panel AdminV2). Agregada por la migración `001_add_admin_role.js` |

**Índices**

| Nombre | Tipo | Columnas |
|--------|------|----------|
| `PRIMARY` | PK | `id` |
| `username` | UNIQUE | `username` |

---

## 8. Tabla `log_tickets_manuales`

Auditoría de cada ticket impreso manualmente (visitas y terceros): quién lo imprimió y cuándo. Alimenta la sección Auditoría del panel AdminV2.

**Escriben:** `manualTicketRoutes.js` (al imprimir).
**Leen:** `adminRoutes.js` (consulta de auditoría).

| Columna | Tipo | Nulo | Default | Descripción |
|---------|------|------|---------|-------------|
| `id` | `int` | NO | AUTO_INCREMENT | **PK** |
| `nombre_visitante` | `varchar(150)` | NO | — | Nombre del visitante o tercero para quien se imprimió el ticket. Los tickets de tercero llevan el marcador `[TERCERO]` en este campo |
| `impreso_por_usuario_id` | `int` | NO | — | **FK → `usuarios_impresion_manual.id`.** Operador que imprimió |
| `fecha_impresion` | `timestamp` | SÍ | `CURRENT_TIMESTAMP` | Momento de la impresión |

**Índices y constraints**

| Nombre | Tipo | Columnas / Referencia |
|--------|------|----------------------|
| `PRIMARY` | PK | `id` |
| `impreso_por_usuario_id` | INDEX | `impreso_por_usuario_id` |
| `log_tickets_manuales_ibfk_1` | FOREIGN KEY | `impreso_por_usuario_id → usuarios_impresion_manual(id)` (RESTRICT) |

> Por la FK con `ON DELETE RESTRICT` implícito, **no se puede eliminar un operador que ya imprimió tickets** — usar `activo = 0` (soft delete).

---

## 9. Tabla `almuerzo_sesiones`

Empareja la salida al almuerzo con el retorno y guarda el tiempo consumido. Una fila por empleado y día. Creada por la migración `sql/migrations/004_control_almuerzo.sql`.

**Escriben:** worker Python (`src/database.py` — abre la sesión al imprimir el ticket, la cierra al detectar el retorno), `cerrar_sesiones_almuerzo.py` (marca `SIN_RETORNO` en el mantenimiento de las 05:00), `almuerzoRepository.js` (cierre manual desde el panel).
**Leen:** `almuerzoRepository.js` (panel AdminV2, sección Almuerzos), `send_lunch_report.py` (reporte diario por correo).

| Columna | Tipo | Nulo | Default | Descripción |
|---------|------|------|---------|-------------|
| `id` | `int` | NO | AUTO_INCREMENT | **PK** |
| `user_id` | `varchar(50)` | NO | — | `zk_id` del empleado (join lógico a `usuarios`) |
| `nombre` | `varchar(150)` | SÍ | NULL | Nombre desnormalizado al momento de la salida (snapshot) |
| `fecha` | `date` | NO | — | Día de la sesión |
| `hora_salida` | `time` | NO | — | Marcación 1: la que imprime el ticket |
| `hora_retorno` | `time` | SÍ | NULL | Marcación 2: regreso del almuerzo. `NULL` = todavía no marcó |
| `segundos_usados` | `int` | SÍ | NULL | `hora_retorno - hora_salida` en **segundos** |
| `minutos_usados` | `int` | SÍ | GENERATED | Columna generada `STORED`: `FLOOR(segundos_usados / 60)`. Solo para lectura cómoda |
| `tipo_ticket` | `varchar(50)` | SÍ | NULL | Tipo del ticket que abrió la sesión (`TICKET ALMUERZO`, `TICKET DIETA`, `TICKET GERENCIA`) |
| `numero_ticket` | `int` | SÍ | NULL | Número del ticket impreso ese día |
| `estado` | `enum` | NO | `EN_ALMUERZO` | Estado **persistido**. Ver dominio abajo |
| `origen` | `enum` | NO | `BIOMETRICO` | `BIOMETRICO` = medido en vivo por el worker. `BACKFILL` = reconstruido del histórico por la migración 005 (dato inferido) |
| `cierre_manual` | `tinyint(1)` | NO | `0` | `1` = cerrada por un superadmin desde el panel, no por el biométrico |
| `observacion` | `varchar(255)` | SÍ | NULL | Motivo del cierre manual o nota del backfill |
| `creado_en` | `timestamp` | SÍ | `CURRENT_TIMESTAMP` | Alta de la fila |
| `actualizado_en` | `timestamp` | SÍ | `ON UPDATE CURRENT_TIMESTAMP` | Última modificación |

**¿Por qué segundos y no minutos?** Porque el límite es estricto (`almuerzo_tolerancia_minutos = 0`). `TIMESTAMPDIFF(MINUTE, ...)` truncaría un retorno de 30:40 a 30 minutos y lo dejaría pasar como cumplido.

**Dominio de `estado`** (lo que está guardado en la fila)

| Valor | Significado |
|-------|-------------|
| `EN_ALMUERZO` | Salió y aún no ha marcado el retorno |
| `A_TIEMPO` | Retornó dentro del límite |
| `EXCEDIDO` | Retornó pasado el límite |
| `SIN_RETORNO` | Cerró el día sin marcar retorno (lo asigna el mantenimiento de las 05:00) |

**Estado efectivo** (lo que se muestra en el panel y el correo)

El worker solo escribe el estado definitivo cuando alguien marca su retorno, así que quien salió hace 45 minutos y no ha vuelto sigue guardado como `EN_ALMUERZO` pese a que ya no está dentro de su tiempo. El panel y el reporte **derivan** el estado real en tiempo de consulta:

| Estado efectivo | Cómo se deriva |
|-----------------|----------------|
| `A_TIEMPO` / `EXCEDIDO` | Hay `hora_retorno`: se usa el `estado` guardado |
| `SIN_RETORNO` | Sin `hora_retorno` y `fecha < CURDATE()` |
| `EXCEDIDO_EN_CURSO` | Sin `hora_retorno`, es hoy, y ya pasó el límite |
| `EN_ALMUERZO` | Sin `hora_retorno`, es hoy, y sigue dentro de su tiempo |

La expresión vive en `SQL_ESTADO_EFECTIVO` (`backend/repositories/almuerzoRepository.js`) y está **duplicada** en `SQL_SESIONES` (`backend/python_core/send_lunch_report.py`). Es la misma regla consumida desde dos lenguajes: si cambia una, hay que cambiar la otra.

**Índices**

| Nombre | Tipo | Columnas | Uso |
|--------|------|----------|-----|
| `PRIMARY` | PK | `id` | — |
| `uq_user_fecha` | UNIQUE | `(user_id, fecha)` | **Regla de negocio:** máximo una sesión por empleado por día. De aquí sale la idempotencia: el worker puede reintentar y el backfill puede re-ejecutarse sin duplicar |
| `idx_fecha_estado` | INDEX | `(fecha, estado)` | Filtros del panel y del resumen diario |
| `idx_fecha_minutos` | INDEX | `(fecha, minutos_usados)` | Ordenamientos y promedios por rango |

**Colación:** `utf8mb4_general_ci`, deliberadamente distinta del default `utf8mb4_0900_ai_ci` de la base. `registros` y `usuarios` vienen del dump antiguo en `general_ci`, y con otra colación cualquier `JOIN` contra ellas aborta con *Illegal mix of collations*.

---

## 10. Matriz Tabla ↔ Código

Qué archivo lee (R) o escribe (W) cada tabla:

| Archivo | usuarios | registros | menu_diario | configuracion | usuarios_impresion_manual | log_tickets_manuales | almuerzo_sesiones |
|---------|:--------:|:---------:|:-----------:|:-------------:|:------------------------:|:--------------------:|:-----------------:|
| `python_core/main.py` + `src/database.py` | R/W | W | R | R | — | — | R/W |
| `python_core/cerrar_sesiones_almuerzo.py` | — | — | — | — | — | — | W |
| `python_core/send_lunch_report.py` | — | — | — | R | — | — | R |
| `backend/server.js` | R | R | W | — | — | — | — |
| `backend/repositories/statsRepository.js` | R | R | — | — | — | — | — |
| `backend/repositories/almuerzoRepository.js` | — | — | — | R | — | — | R/W |
| `backend/routes/adminRoutes.js` | R/W | R | — | — | R/W | R | — |
| `backend/routes/configRoutes.js` | R | — | — | R/W | — | — | — |
| `backend/routes/manualTicketRoutes.js` | R | W | R/W | R | R | W | — |
| `backup_comedor.py` | — | R | R | — | — | — | — |

---

## 11. Convenciones y Reglas de Integridad

1. **Sin FKs físicas hacia `usuarios`** — los joins `registros ↔ usuarios` y `menu_diario ↔ usuarios` son lógicos por `user_id = zk_id`. El código debe tolerar marcaciones de IDs no sincronizados.
2. **Un almuerzo por día** — regla aplicada en el worker Python (busca `registros` del día antes de imprimir), no en la BD. Los rechazos quedan como `INTENTO DE DUPLICADO`.
3. **Una selección de menú por día** — sí está aplicada en BD (`UNIQUE (user_id, fecha)` en `menu_diario`).
4. **`numero_ticket` es correlativo por día**, no global: reinicia cada día y rellena huecos (si se anula el 3, el próximo ticket toma el 3).
5. **Soft delete de operadores** — nunca `DELETE` en `usuarios_impresion_manual`; la FK de auditoría lo impide y se perdería trazabilidad. Usar `activo = 0`.
6. **Datos desnormalizados a propósito** — `registros.nombre` es un snapshot histórico; no "corregirlo" con updates masivos.
7. **Colaciones mixtas** — las tablas originales usan `utf8mb4_general_ci` y las nuevas `utf8mb4_0900_ai_ci`. En JOINs entre `varchar` de distintas colaciones MySQL puede requerir `COLLATE` explícito; mantener la colación de la tabla al agregar columnas.
8. **Migraciones** — esquema base en `sql/control_comedor.sql`; cambios incrementales en `sql/migrations/` (SQL) y `backend/migrations/` (Node). Toda alteración de esquema debe quedar en una migración y reflejarse en este diccionario. Estado actual: `001_add_admin_role.js` **aplicada** (columna `rol` existe); `002_add_tipo_especial.sql` **PENDIENTE** (ver §3).
9. **Retención de datos** — `backup_comedor.py` (cron semanal) respalda toda la BD, la envía por correo y, **solo si el envío fue exitoso**, purga `registros` con más de 15 días y `menu_diario` con más de 7 días. El histórico completo vive en los backups `.tar.gz` (correo + `./Backups/`, últimos 3 locales). Nota: los datos actuales de producción se remontan a febrero 2026, señal de que la purga no se está ejecutando — verificar el cron si se desea la política de retención.

---

## 12. Consultas de Referencia

```sql
-- Almuerzos servidos hoy por tipo
SELECT descripcion, COUNT(*) AS total
FROM registros
WHERE fecha = CURDATE() AND descripcion <> 'INTENTO DE DUPLICADO'
GROUP BY descripcion;

-- ¿Quién no ha almorzado hoy? (empleados activos sin registro)
SELECT u.zk_id, u.nombre_completo
FROM usuarios u
LEFT JOIN registros r
  ON r.user_id = u.zk_id AND r.fecha = CURDATE()
  AND r.descripcion <> 'INTENTO DE DUPLICADO'
WHERE r.id IS NULL;

-- Selecciones de menú de hoy con preferencias
SELECT u.nombre_completo, m.opcion, m.sin_sopa, m.sin_arroz
FROM menu_diario m
JOIN usuarios u ON u.zk_id = m.user_id
WHERE m.fecha = CURDATE();

-- Auditoría de tickets manuales del mes
SELECT l.fecha_impresion, l.nombre_visitante, o.nombre_real AS impreso_por
FROM log_tickets_manuales l
JOIN usuarios_impresion_manual o ON o.id = l.impreso_por_usuario_id
WHERE l.fecha_impresion >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
ORDER BY l.fecha_impresion DESC;

-- Próximo número de ticket del día (lógica de huecos)
SELECT MIN(t.n) AS proximo
FROM (
  SELECT 1 AS n
  UNION SELECT numero_ticket + 1 FROM registros WHERE fecha = CURDATE()
) t
WHERE t.n NOT IN (SELECT numero_ticket FROM registros WHERE fecha = CURDATE());
```

---

*Documento generado a partir del esquema real de producción. Mantenerlo sincronizado con cada migración.*
