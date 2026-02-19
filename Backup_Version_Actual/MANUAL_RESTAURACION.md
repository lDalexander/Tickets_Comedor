# Manual de Restauración de Servicio (Comedor)

Este documento detalla los pasos a seguir cuando se va la energía eléctrica o el servicio de tickets deja de funcionar (no imprime, no abre la página web).

## 1. Verificar Hardware (Físico)
Antes de nada, asegúrese de que los equipos tengan corriente y estén encendidos:

1.  **Impresora de Tickets**: ¿Tiene luz verde? ¿Tiene papel?
    *   *Si parpadea rojo*: Revise si falta papel o la tapa está mal cerrada.
    *   *Apagar y Prender*: A veces la impresora se bloquea. Apáguela del interruptor trasero, espere 5 segundos y enciéndala.
2.  **Biométrico (Reloj)**: ¿Está encendido?
    *   Si está apagado, verifique el cable de corriente.
3.  **Servidor (Computadora)**: Asegúrese de que el servidor esté encendido y conectado a la red.

## 2. Reiniciar el Servicio (Automático)

El sistema tiene unos scripts automáticos. Para reiniciar todo el sistema correctamente, siga estos pasos:

1.  Abra una terminal (consola).
2.  Ejecute el siguiente comando para reiniciar los servicios:

```bash
cd /home/john/comedor/Tickets_Comedor
sudo systemctl restart comedor-backend comedor-worker
```

*Le pedirá la contraseña de administrador (john).*

### Opción Alternativa (Script de Mantenimiento)
Si lo anterior no funciona, puede ejecutar el script de diagnóstico y reparación automática:

```bash
cd /home/john/comedor/Tickets_Comedor
./daily_maintenance.sh
```

Este script revisará paso a paso:
*   Espacio en disco
*   Base de datos
*   Conexión con Impresora y Biométrico
*   Servicios Web y Worker

Verá en pantalla mensajes en **VERDE** (OK) o **ROJO** (ERROR).

## 3. Verificar si funciona

1.  **Prueba Web**: Abra el navegador y vaya a `http://localhost:5173` (o la dirección del servidor). Verifique si carga el Dashboard.
2.  **Prueba Impresión**: Pida a alguien que ponga su huella. Debería salir el ticket.

## Resumen de Problemas Comunes

| Problema | Solución Probable |
| :--- | :--- |
| **No imprime nada** | Apague y prenda la impresora. Ejecute el paso 2. |
| **Imprime "MANTENIMIENTO"** | La base de datos no conectó. Espere 5 min o ejecute el paso 2. |
| **Página Web no carga** | Ejecute `daily_maintenance.sh` para reiniciar el backend. |
| **Hora incorrecta en ticket** | La hora del servidor Linux está mal. Ajuste la hora del sistema. |

---
**Soporte Técnico**: Contactar a John Garcia.
