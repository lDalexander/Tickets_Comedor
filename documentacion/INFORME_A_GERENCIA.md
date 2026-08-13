# Informe de Gestión Técnica: SIGAC
## Sistema de Gestión de Acceso al Comedor — DETCUADOR S.A.

**Para:** Gerencia General / Dirección de Operaciones  
**De:** Departamento de Sistemas / TI — John Garcia  
**Fecha:** Mayo 2026  
**Asunto:** Estado del sistema, revisión de seguridad completada y proyección operativa

---

## Resumen Ejecutivo

El Sistema de Gestión de Acceso al Comedor (SIGAC) lleva operando desde enero de 2026 con plena disponibilidad. En mayo de 2026 se completó una revisión técnica integral que resolvió **todas las vulnerabilidades de seguridad identificadas** en el sistema, elevando la postura de seguridad de la solución de "riesgo alto" a "riesgo bajo".

**Inversión en la revisión:** ~40 horas de desarrollo interno.  
**Costo en licencias externas:** $0 (todo software de código abierto).  
**Vulnerabilidades críticas resueltas:** 5 de 5.

---

## 1. ¿Qué Hace el Sistema?

SIGAC automatiza el control de almuerzos del personal de DETCUADOR S.A.:

1. El empleado pone el dedo en el lector biométrico.
2. El sistema identifica al empleado en menos de un segundo.
3. Determina si corresponde almuerzo normal, dieta, menú de gerencia, o si ya almorzó.
4. Imprime automáticamente el ticket en la termoimpresora.
5. El evento aparece en el dashboard web en tiempo real (menos de 2 segundos).
6. Los datos quedan auditados en la base de datos para consulta histórica.

**Usuarios cubiertos:** ~140 empleados  
**Promedio diario:** ~90-100 almuerzos registrados

---

## 2. Estado Operativo (Mayo 2026)

### Disponibilidad

El sistema opera como servicio automatizado de sistema operativo (`systemd`). Si el servidor reinicia, todos los servicios arrancan automáticamente. No requiere intervención manual para reanudarse.

| Componente | Estado | Tiempo activo estimado |
|-----------|--------|----------------------|
| Servidor biométrico (Python) | ACTIVO | 24/7 |
| API web (Node.js) | ACTIVO | 24/7 |
| Dashboard web (Nginx) | ACTIVO | 24/7 |
| Base de datos (MariaDB) | ACTIVO | 24/7 |

### Alertas automáticas

El sistema envía correos automáticamente a `agarcia@detcuador.com` en estos casos:
- Impresora apagada o desconectada
- Impresora sin papel
- Tapa de impresora abierta
- Error mecánico (atasco de papel)
- Fallo crítico en la base de datos
- Recuperación de la impresora (vuelta a estado normal)

---

## 3. Revisión de Seguridad — Resultados

### Antes de la revisión (riesgo ALTO)

Se identificaron **5 vulnerabilidades críticas** que, de ser explotadas, podrían comprometer la integridad de los datos y el control del sistema:

| Vulnerabilidad | Riesgo |
|---------------|--------|
| Contraseñas de administrador escritas directamente en el código fuente | Cualquiera que accediera al código podía tomar control total |
| Endpoint que permitía ejecutar cualquier consulta a la base de datos | Podría borrar, modificar o extraer toda la información |
| Clave de seguridad JWT con valor predecible | Cualquiera podía fabricar tokens de administrador sin conocer la contraseña |
| Credenciales de base de datos y correo electrónico en el historial de git | Datos sensibles potencialmente filtrados si el repositorio se compartiera |

### Después de la revisión (riesgo BAJO)

Todas las vulnerabilidades fueron resueltas:

| Acción | Resultado |
|--------|-----------|
| Credenciales movidas a archivo protegido del sistema | Solo el usuario `john` puede leer las credenciales |
| Endpoint SQL arbitrario eliminado definitivamente | Imposible ejecutar SQL no autorizado |
| Clave JWT: 128 caracteres aleatorios, generada automáticamente | Imposible fabricar tokens sin la clave del servidor |
| Sistema de bloqueo ante credenciales no configuradas | El servidor no arranca si falta la clave JWT — falla de forma segura |
| Límite de intentos de login: 10 intentos por 15 minutos | Protección automática contra ataques de fuerza bruta |

---

## 4. Nuevas Funcionalidades Disponibles (v3.2)

### 4.1 Horario de servicio configurable

El panel de administración permite activar/desactivar el horario de atención del comedor sin modificar código. Una vez activado, el sistema rechaza automáticamente huellas y tickets manuales fuera del horario establecido.

### 4.2 Categorías especiales en base de datos

Los empleados VIP y de Gerencia ahora pueden gestionarse desde la base de datos a través del panel admin, sin necesidad de intervención técnica. El sistema incluye una migración SQL lista para aplicar (`sql/migrations/002_add_tipo_especial.sql`).

### 4.3 Tickets para empleados ausentes (Tercero)

El operador de comedor puede registrar e imprimir un ticket para un empleado que no pueda ir al biométrico (por ej., trabajo remoto ese día). El sistema verifica que el empleado no haya almorzado ya y aplica las mismas reglas de tipo de ticket.

### 4.4 Registro de auditoría de impresiones manuales

Cada impresión manual (visita o tercero) queda registrada con: qué visitante/empleado, quién imprimió y a qué hora. Consultable desde el panel admin.

### 4.5 Dashboard mejorado con panel AdminV2

El panel de administración fue completamente rediseñado:
- Vista de todas las tablas de la base de datos con paginación
- Edición directa de registros desde el navegador
- Reimpresión de tickets históricos con un clic
- Gestión de operadores (crear, desactivar, cambiar contraseña)

---

## 5. Requerimientos de Infraestructura Actuales

El sistema funciona completamente en el servidor existente (`150.36.200.252`) sin necesidad de servidores adicionales.

### Hardware del sistema

| Dispositivo | Modelo | IP | Estado |
|------------|--------|-----|--------|
| Servidor Ubuntu | — | 150.36.200.252 | ACTIVO |
| Lector biométrico | ZKTeco K40 | 150.36.200.12 | ACTIVO |
| Termoimpresora | ESC/POS Red | 150.36.200.9 | ACTIVO |

### Requerimientos de mantenimiento preventivo

| Elemento | Frecuencia recomendada | Responsable |
|---------|----------------------|-------------|
| Cambio de rollo de papel en impresora | Según consumo (~semanal) | Operador de comedor |
| Backup de base de datos | Semanal | TI |
| Revisión de logs de errores | Semanal | TI |
| Actualización de dependencias de seguridad | Mensual | TI |

---

## 6. Proyección y Próximos Pasos

### Mejoras recomendadas (corto plazo)

1. **Aplicar migración SQL 002** para activar la gestión de IDs especiales desde la base de datos. Tiempo estimado: 5 minutos.

2. **Autenticación completa en módulo de operadores** — los endpoints de gestión de operadores (crear/modificar/eliminar) actualmente no requieren autenticación admin. Corrección estimada: 1 hora de desarrollo.

3. **Rotación del historial de git** — purgar credenciales antiguas del historial con `git filter-branch`. Tiempo estimado: 30 minutos con guía técnica.

### Mejoras recomendadas (mediano plazo)

4. **SSL/HTTPS** — para acceso seguro desde fuera de la red corporativa o VPN. Requiere certificado digital y configuración en Nginx.

5. **Rotación automática de logs** — evitar que los archivos de log crezcan indefinidamente.

---

## 7. Conclusión

SIGAC se encuentra en un estado técnico sólido. La revisión de seguridad de mayo 2026 eliminó todos los riesgos críticos identificados. El sistema ofrece:

- **Control biométrico confiable** con resiliencia ante desconexiones del dispositivo
- **Auditoría completa** de todos los eventos (biométricos, manuales, administrativos)
- **Interfaz web moderna** accesible desde cualquier PC de la red corporativa
- **Alertas automáticas** que notifican al equipo de TI antes de que los usuarios reporten problemas
- **Cero costo de licencias** — construido íntegramente con tecnologías de código abierto

El único mantenimiento operativo requerido es el cambio periódico del rollo de papel en la termoimpresora, que el personal del comedor ya maneja de forma autónoma.

---

*Documento preparado por: John Garcia — Departamento de Sistemas, DETCUADOR S.A.*  
*Para consultas técnicas: agarcia@detcuador.com*
