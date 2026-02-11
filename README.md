# Documentación del Sistema de Comedor (v3.0)
## Resumen
Sistema de gestión de tickets de almuerzo con integración de reloj biométrico ZKTeco, interfaz web para selección de menú y reportes, e impresión térmica de tickets.

## Desarrollado por
**Ing. John Alexander Garcia**
Versión Actual: **3.0**

## Arquitectura
- **Backend (Node.js/Express):** Gestiona la API, base de datos y lógica de negocios web.
- **Worker (Python):** Conecta con el biométrico ZKTeco, monitorea asistencia y controla la impresora térmica.
- **Frontend (React/Vite):** Interfaz para usuarios (selección de menú) y administradores (dashboard).
- **Base de Datos (MySQL):** Almacena usuarios, registros, menús y preferencias.

## Funcionalidades Clave (v3.0)

### 1. Roles de Usuario
- **Operativo:** Personal de planta/taller. Tienen una preferencia predeterminada (Normal/Dieta). Al marcar en el reloj, se imprime automáticamente su preferencia.
- **Administrativo:** Personal de oficina. Pueden seleccionar su menú día a día para toda la semana a través de la web.

### 2. Selección de Menú
- **Web Interface:** 
- **Operativo:** Toggle simple para cambiar entre Normal y Dieta. Esta selección persiste indefinidamente.
- **Administrativo:** Calendario semanal para elegir menú específico por día.

### 3. Lógica de Impresión
El worker de Python () consulta la base de datos al recibir una marcación:
1.  Busca selección específica para el día (Tabla ) -> Prioridad Alta (Admin).
2.  Si no hay selección diaria, busca preferencia predeterminada (columna  en ) -> Prioridad Media (Operativo).
3.  Si es Gerencia (lista VIP), imprime ticket especial.
4.  Por defecto: Ticket Normal.

### 4. Numeración de Tickets
- Se reinicia diariamente.
- Secuencial para todos los tipos de ticket (1, 2, 3...).
- Reutiliza números si se borran registros para evitar huecos.

### 5. Reportes
- Dashboard en tiempo real con gráficas.
- Exportación a Excel que incluye **TODOS** los tipos de tickets (Normal, Dieta, Extra, Gerencia), excluyendo duplicados bloqueados.

## Despliegue
- Servicios systemd: , , .
- Logs en tiempo real vía socket.io en el dashboard.

