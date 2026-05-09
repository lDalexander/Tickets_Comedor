# INFORME DE GESTIÓN TÉCNICA: SISTEMA INTEGRADO DE GESTION DE COMEDOR (SIGAC)

**Para:** Gerencia General / Dirección de Operaciones
**De:** Departamento de Sistemas / TI (John Garcia)
**Fecha:** 18 de Febrero de 2026
**Asunto:** Entrega de Proyecto, Valoración Técnica y Análisis de ROI

---

## 1. RESUMEN EJECUTIVO

Tras un ciclo de **desarrollo intensivo de aproximadamente 4 meses**, se hace entrega oficial de la versión unificada y estable del **Sistema de Control de Comedor**.

Este proyecto no es una simple instalación de software comercial; es una solución de **Ingeniería de Software a Medida (Custom Software)** diseñada específicamente para la infraestructura y reglas de negocio de **Detcuador S.A.** El sistema integra hardware biométrico industrial, impresión térmica y una plataforma web en tiempo real, operando sobre un servidor Linux de alta disponibilidad.

El objetivo cumplido ha sido automatizar, controlar y auditar el consumo de alimentos de la plantilla (~110 colaboradores diarios), eliminando el uso de tickets manuales, reduciendo el error humano y proveyendo data financiera exacta a la gerencia.

---

## 2. ALCANCE Y COMPLEJIDAD TÉCNICA (La "Caja Negra")

El sistema opera bajo una arquitectura híbrida y modular que garantiza robustez y escalabilidad. A diferencia de programas básicos, aquí convergen múltiples tecnologías:

### A. Arquitectura Unificada (Backend Híbrido)
Se diseñó un núcleo de procesamiento dual:
*   **Node.js (API & Web):** Gestiona la interfaz administrativa, reportes visuales y la comunicación en tiempo real (WebSockets) para que el Dashboard se actualice al instante sin recargar la página.
*   **Python (Core Hardware):** Un "cerebro" dedicado exclusivamente a conversar con los dispositivos físicos (Lector de Huella y Impresora), procesando protocolos binarios complejos en milisegundos.

### B. Integración de Hardware (IoT)
El mayor desafío técnico superado fue la comunicación directa con hardware:
1.  **Biometría ZKTeco:** Ingeniería inversa de protocolos para validar huellas en < 1 segundo, cruzando datos con la base de datos para evitar "dobles consumos" el mismo día.
2.  **Impresión Térmica:** Drivers personalizados para la impresora SAT 38T/Epson, permitiendo cortar tickets automáticamente y alertar si falta papel o la tapa está abierta.

### C. Base de Datos Relacional
Estructura normalizada en **MySQL** que garantiza la integridad de los datos. No se perderá información de consumos, incluso si hay fallos de energía, gracias a un sistema de registro transaccional.

---

## 3. VALOR AGREGADO Y BENEFICIOS ESTRATÉGICOS

La decisión de desarrollar esta solución *In-House* (internamente) frente a comprar un software enlatado aporta beneficios tangibles:

1.  **Ahorro en Licencias (OPEX):**
    *   *Software Comercial:* Costo promedio de $3-$5 USD por usuario/mes. Para 110 usuarios = **~$550 USD mensuales de ahorro recurrente.**
    *   *SIGAC:* **$0 USD anuales.** Propiedad intelectual 100% de la empresa.

2.  **Independencia Tecnológica:**
    *   Los datos son nuestros. No residen en nubes de terceros ni dependen de conexión a internet externa. La privacidad y disponibilidad son totales.

3.  **Adaptabilidad "A Medida":**
    *   Si mañana cambian las reglas del comedor (ej. nuevos horarios, subsidios diferenciados), el sistema se adapta internamente sin pagar costosas consultorías externas.

---

## 4. VALORACIÓN DEL ACTIVOS DIGITAL (Costo de Desarrollo)

Basado en el esfuerzo de **4 meses de trabajo**, investigación y programación especializada, se detalla la valoración de mercado de este activo digital si fuese contratado a una firma de desarrollo externa:

| Fase del Proyecto | Descripción Técnica | Esfuerzo Aprox. | Valor Comercial Est. |
| :--- | :--- | :--- | :--- |
| **1. Análisis e Ingeniería** | Levantamiento de requerimientos, diseño de BD y lógica. | 80 Horas | $2,400 USD |
| **2. Backend (Node + Python)** | Programación del núcleo, API, Sockets y Servicios Linux. | 220 Horas | $6,600 USD |
| **3. Integración Hardware** | Desarrollo de drivers para ZK y Thermal Printer (Alta complejidad). | 140 Horas | $4,200 USD |
| **4. Frontend & UX** | Panel Administrativo, Dashboard en tiempo real, Reportes. | 120 Horas | $3,600 USD |
| **5. QA & Despliegue** | Pruebas de estrés, seguridad, manuales y puesta en producción. | 80 Horas | $2,400 USD |
| **TOTAL ESTIMADO** | **4 Meses de Desarrollo Full-Stack** | **640 Horas** | **$19,200 USD** |

*> Nota: Valor referencial basado en tarifa estándar de $30/hora para desarrollo especializado en integración de hardware.*

---

## 5. CONCLUSIÓN

El Sistema **SIGAC** está operativo y estable. Representa un salto cualitativo en la gestión interna de Detcuador S.A.

Se entrega no solo el código fuente, sino un ecosistema documentado con manuales de operación, guías técnicas y procedimientos de recuperación ante desastres, asegurando la continuidad del negocio a largo plazo.

Atentamente,

**John Garcia**
*Líder de Proyecto / Desarrollo de Sistemas*
