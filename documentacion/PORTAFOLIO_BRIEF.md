# Brief para IA

> **Instrucción para la IA que lea esto:** Usa toda la información de este documento para generar una página web de portafolio (landing de proyecto destacado) atractiva, profesional y responsive. El público objetivo son reclutadores técnicos, líderes de ingeniería y clientes potenciales. El tono debe ser profesional pero accesible. No copies este texto literalmente: reescríbelo, estructúralo en secciones visuales, agrega íconos/diagramas donde aporten, y destaca el impacto y las decisiones de ingeniería. El autor es **John Garcia**, desarrollador full-stack.

---

## 1. Identidad del proyecto

- **Nombre:** SIGAC — Sistema de Gestión de Acceso al Comedor
- **Cliente / contexto:** DETCUADOR S.A. (proyecto corporativo interno, en producción real)
- **Rol del autor:** Desarrollador full-stack único — diseño, arquitectura, desarrollo, despliegue y mantenimiento end-to-end
- **Estado:** En producción desde enero 2026, operando 24/7 con >99% de uptime estimado
- **Versión actual:** 3.2 (post-hardening de seguridad)
- **Tipo:** Sistema integral de IoT + web en tiempo real (hardware biométrico + impresión térmica + dashboard web)

## 2. El problema que resuelve (pitch de una línea)

Reemplazó el control manual de almuerzos en papel —sin auditoría, sin historial y sin defensa contra duplicados— por un sistema biométrico totalmente automatizado que identifica al empleado, imprime su ticket y refleja el evento en un dashboard web en menos de 2 segundos.

**Antes:** listas físicas, sin datos, sin trazabilidad, fraude imposible de detectar.
**Después:** ~140 empleados gestionados, ~90-100 tickets diarios, historial 100% auditable y exportable a Excel.

## 3. Cómo funciona (el flujo estrella)

Este es el punto a destacar visualmente, idealmente como un diagrama de pasos animado:

1. **Empleado pone el dedo** en un lector biométrico ZKTeco K40.
2. **Un worker en Python** recibe el evento por TCP, identifica al empleado, verifica horario, aplica anti-rebote (5s) y detecta si ya almorzó ese día.
3. **El sistema determina el tipo de ticket** (almuerzo, dieta, gerencia, extra/VIP, visita, tercero, o marca un intento de duplicado).
4. **Imprime el ticket** automáticamente en una termoimpresora ESC/POS de red.
5. **El backend Node.js** detecta el nuevo registro y emite el evento por Socket.IO.
6. **El dashboard React** se actualiza en **tiempo real (< 2 segundos)** sin recargar.

## 4. Stack tecnológico

Arquitectura de **3 servicios independientes** orquestados como servicios systemd en un servidor Linux:

### Worker biométrico — Python (~1.000 LOC)
- `pyzk` — protocolo TCP de lectores ZKTeco
- `python-escpos` — control de termoimpresora ESC/POS
- `mysql-connector-python` — acceso a base de datos con pool de conexiones
- Corre como servicio systemd `comedor-worker`

### Backend / API — Node.js (~2.400 LOC)
- **Express 5** — API REST
- **Socket.IO 4** — tiempo real (WebSocket + long-polling como fallback)
- **mysql2** — driver MariaDB con connection pool
- **jsonwebtoken + bcrypt** — autenticación JWT y hash de contraseñas
- **express-rate-limit** — rate limiting por IP
- **winston** — logging estructurado en JSON
- **exceljs** — exportación de reportes a Excel (.xlsx)
- Puerto 5001, servicio systemd `comedor-backend`

### Frontend — React (~4.300 LOC)
- **React 18 + Vite** — SPA
- **SWR** — fetching y cache de datos con revalidación
- **socket.io-client** — eventos en tiempo real
- **Chart.js + react-chartjs-2** — gráficas de estadísticas
- **react-router-dom 7** — enrutamiento
- **lucide-react** — iconografía
- Servido por **Nginx** en producción (reemplazó a Vite dev server)

### Infraestructura
- **MariaDB 10.4** — base de datos `control_comedor`
- **Nginx** como reverse proxy / servidor de estáticos
- **systemd** — gestión de los 3 servicios + timer de mantenimiento
- Servidor Linux on-premise (producción: `150.36.200.252:5001`)

## 5. Características destacables (para tarjetas/highlights)

- **Tiempo real de verdad:** del dedo al dashboard en menos de 2 segundos vía Socket.IO.
- **Anti-fraude integrado:** detección de duplicados del día, anti-rebote de 5s y registro de "intentos de duplicado".
- **7 tipos de ticket** con reglas de negocio: almuerzo, dieta, gerencia, extra/VIP, visita, tercero e intento de duplicado.
- **Panel de administración profesional (Admin V2):** sidebar, diseño mobile-first, login JWT (sesión de 8h), con secciones de Resumen, Registros (con reimpresión), Empleados, Operadores, Configuración y Auditoría.
- **Selección de menú diario** (con opciones como "sin sopa" / "sin arroz").
- **Tickets manuales y para terceros/visitas** desde el panel web.
- **Exportación a Excel** de registros y estadísticas históricas.
- **Estadísticas y gráficas** de consumo diario e histórico.
- **Mantenimiento automatizado:** un timer systemd ejecuta un script diario que verifica disco, servicios, puertos y hardware, y envía un reporte por correo (SMTP).

## 6. Ingeniería y buenas prácticas (lo que impresiona a un técnico)

- **Hardening de seguridad:** revisión completa que resolvió todas las vulnerabilidades críticas identificadas — autenticación JWT, hash bcrypt, rate limiting, CORS configurable, consultas parametrizadas.
- **Autenticación dual** en el backend: compatibilidad legacy (`x-admin-secret`) y JWT Bearer (panel nuevo) en una migración sin downtime.
- **Suite de pruebas automatizadas:** 19+ casos con Jest + Supertest cubriendo autenticación, configuración, tickets y rate limiting.
- **Logging estructurado** en JSON con winston.
- **Patrón repository** en el backend para acceso a datos.
- **Despliegue reproducible:** scripts de instalación, deploy y reinicio; servicios definidos como unidades systemd.
- **Documentación exhaustiva:** 8 documentos para distintas audiencias (arquitectura con diagramas C4, referencia de API, informe técnico, manual de operaciones, guía de troubleshooting con 16+ problemas comunes, onboarding y un informe ejecutivo para gerencia).

## 7. Integración con hardware (el diferenciador)

Punto de venta clave: **no es una app web más, integra hardware físico real**.

- Lector biométrico **ZKTeco K40** vía protocolo propietario sobre TCP.
- **Termoimpresora ESC/POS de red** con generación de tickets formateados (logo, datos, número de ticket).
- Manejo de fallos de hardware: reconexión, scripts de reseteo de impresora, diagnóstico.

## 8. Métricas de impacto (para mostrar en números grandes)

- **~140** empleados gestionados
- **~90-100** tickets impresos por día
- **< 2 s** de latencia del evento al dashboard
- **> 99%** uptime estimado
- **0** vulnerabilidades críticas tras el hardening
- **19+** tests automatizados
- En **producción continua** desde enero 2026

## 9. Sugerencias de diseño para la IA generadora

- **Hero:** nombre SIGAC + subtítulo "Control biométrico de almuerzos en tiempo real" + un badge de "En producción". Botón/etiqueta de stack.
- **Sección de flujo:** diagrama de 6 pasos (dedo → Python → BD → impresora → Node.js/Socket.IO → dashboard).
- **Grid de stack** dividido en 3 columnas (Python / Node.js / React) + infraestructura.
- **Tarjetas de features** con íconos.
- **Banda de métricas** con números grandes (140 empleados, <2s, >99%, etc.).
- **Sección "Decisiones de ingeniería"** para el hardening, tests y arquitectura de servicios.
- Paleta sobria y corporativa; resaltar el carácter de "sistema real en producción, no un proyecto de juguete".
- Nota: **omitir IPs internas, credenciales y rutas de servidor** en la página pública por seguridad — son solo contexto para entender el proyecto.

## 10. Resumen de una línea (para meta/SEO o tarjeta de proyecto)

> SIGAC: sistema corporativo full-stack (Python + Node.js + React) que integra biometría ZKTeco e impresión térmica para automatizar y auditar el control de almuerzos en tiempo real, en producción para ~140 empleados.
