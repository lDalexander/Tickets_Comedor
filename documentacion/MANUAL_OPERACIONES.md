# Manual de Operaciones y Mantenimiento - Tickets Comedor

Este documento es la guía definitiva para operadores y soporte técnico. Cubre procedimientos de inicio, restauración de servicio y solución de problemas comunes.

**Ubicación del Proyecto:** `/home/john/comedor/Tickets_Comedor/`

---

## 1. Gestión de Servicios (Systemd)

El sistema opera con 3 servicios automáticos de Linux.

| Servicio | Descripción | Comando de Estado |
| :--- | :--- | :--- |
| `comedor-backend` | API y Servidor Web (Node.js) | `sudo systemctl status comedor-backend` |
| `comedor-worker` | Lógica de Hardware (Python) | `sudo systemctl status comedor-worker` |
| `comedor-frontend`| Interfaz de Usuario (React) | `sudo systemctl status comedor-frontend` |

### 🔄 Reiniciar Todo el Sistema
Si el sistema falla o se comporta de manera extraña, ejecute este comando en la terminal:

```bash
sudo systemctl restart comedor-backend comedor-worker comedor-frontend
```

---

## 2. Restauración de Servicio (Q&A)

### 🔴 Problema: "No imprime tickets al poner la huella"
1.  **Verifique la Impresora**: ¿Tiene luz verde? ¿Tiene papel? ¿Está conectada a la red?
2.  **Reinicie el Worker**: Es el cerebro que habla con el biométrico.
    ```bash
    sudo systemctl restart comedor-worker
    ```
3.  **Verifique Logs**:
    ```bash
    journalctl -u comedor-worker -f
    ```
    *Si ve mensajes de "Conectando...", el sistema está intentando recuperar la conexión.*

### 🔴 Problema: "La página web no carga"
1.  **Verifique el Backend**:
    ```bash
    sudo systemctl restart comedor-backend
    ```
2.  **Verifique el Frontend**:
    ```bash
    sudo systemctl restart comedor-frontend
    ```

### 🔴 Problema: "Hora incorrecta en el ticket"
La hora la dicta el servidor Linux.
1.  Verifique la fecha: `date`
2.  Si está mal, contacte al administrador de sistemas para ajustar la hora del servidor.

---

## 3. Script de Mantenimiento Automático (`daily_maintenance.sh`)

Existe un script diseñado para "curar" el sistema de forma automática. Ejecútelo si los reinicios manuales no funcionan.

```bash
cd /home/john/comedor/Tickets_Comedor
sudo ./daily_maintenance.sh
```

**¿Qué hace este script?**
1.  Verifica espacio en disco.
2.  Limpia archivos temporales.
3.  Reinicia todos los servicios en el orden correcto.
4.  Verifica la conectividad con la base de datos.
5.  Envía un reporte de estado.

---

## 4. Instalación de Servicios (Setup Inicial)

Si migra el servidor a otra máquina, use el script de instalación incluido:

```bash
cd /home/john/comedor/Tickets_Comedor
chmod +x install_service.sh
sudo ./install_service.sh
```

Este script copiará los archivos `.service` configurados y habilitará el inicio automático al encender la PC.

---

## 5. Ubicación de Archivos Clave

*   **Logs del Sistema**: `journalctl -u [nombre-servicio]`
*   **Código Fuente Python**: `Tickets_Comedor/backend/python_core/`
*   **Código Fuente Node**: `Tickets_Comedor/backend/`
*   **Configuración (.env)**:
    *   `Tickets_Comedor/backend/.env` (Puerto Web, DB)
    *   `Tickets_Comedor/backend/python_core/.env` (IPs Biométrico/Impresora)

---
**Soporte Técnico**: Contactar al Administrador del Sistema.
