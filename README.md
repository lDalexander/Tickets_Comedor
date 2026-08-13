# SIGAC — Sistema de Gestión de Acceso al Comedor
## DETCUADOR S.A. | Control biométrico de almuerzos en tiempo real

**Versión:** 3.2  
**Servidor de producción:** `http://150.36.200.252:5001`  
**Stack:** Python + Node.js + React + Nginx + MariaDB  

---

## ¿Qué es SIGAC?

Sistema corporativo que automatiza el control de almuerzos del personal. Integra un lector biométrico ZKTeco, una termoimpresora ESC/POS, un dashboard web en tiempo real y un panel de administración completo.

**El flujo completo:** empleado pone el dedo → Python identifica, registra en BD y manda a imprimir → Node.js detecta el nuevo registro → Socket.IO envía el evento al browser → el dashboard se actualiza en tiempo real (< 2 segundos).

---

## Documentación

| Documento | Para quién |
|-----------|-----------|
| [documentacion/README.md](documentacion/README.md) | Desarrolladores — setup, comandos, referencia rápida |
| [documentacion/ARCHITECTURE.md](documentacion/ARCHITECTURE.md) | Todos — diagramas C4, flujos, patrones, decisiones |
| [documentacion/API_REFERENCE.md](documentacion/API_REFERENCE.md) | Desarrolladores — todos los endpoints documentados |
| [documentacion/DICCIONARIO_BASE_DATOS.md](documentacion/DICCIONARIO_BASE_DATOS.md) | Desarrolladores / DBA — diccionario de datos completo de `control_comedor` |
| [documentacion/INFORME_TECNICO.md](documentacion/INFORME_TECNICO.md) | TI — stack completo, seguridad, tests, métricas |
| [documentacion/MANUAL_OPERACIONES.md](documentacion/MANUAL_OPERACIONES.md) | Ops / TI — operaciones diarias, deploy, backup |
| [documentacion/GUIA_SOLUCION_PROBLEMAS.md](documentacion/GUIA_SOLUCION_PROBLEMAS.md) | Ops / TI — diagnóstico de 16+ problemas comunes |
| [documentacion/GUIA_ESTUDIANTES.md](documentacion/GUIA_ESTUDIANTES.md) | Nuevos devs — onboarding completo |
| [documentacion/INFORME_A_GERENCIA.md](documentacion/INFORME_A_GERENCIA.md) | Dirección — estado del sistema, no técnico |

---

## Inicio Rápido

```bash
# Backend
cd backend && npm install && cp .env.example .env && node server.js

# Frontend
cd frontend && npm install && npm run dev

# Tests
cd backend && npm test
```

Ver [documentacion/GUIA_ESTUDIANTES.md](documentacion/GUIA_ESTUDIANTES.md) para setup completo.

---

## Estado del Sistema (Mayo 2026)

- Revisión de seguridad completada — 5/5 vulnerabilidades críticas resueltas
- 19+ tests automatizados con Jest + Supertest
- Nginx en producción (reemplaza Vite como servidor)
- Socket.IO funcionando con WebSocket + HTTP long-polling correctamente configurado

---

*Desarrollado por: John Garcia — Departamento de Sistemas, DETCUADOR S.A.*
