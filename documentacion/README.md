# Sistema de Tickets de Comedor
> Un sistema completo en tiempo real para la validación biométrica, impresión de tickets y monitoreo de consumos de comedor corporativo.

## Inicio Rápido (Quick Start)

### Requisitos Previos
* **Node.js** (v18+)
* **Python** (3.10+)
* **MariaDB** / MySQL
* Soporte para `systemd` (Linux Ubuntu/Debian recomendado)
* Dispositivo Biométrico ZKTeco compatible (probado con SilkFP-101TA)
* Impresora Térmica conectada por RED.

### Instalación y Ejecución

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/lDalexander/Tickets_Comedor.git
   cd Tickets_Comedor
   ```

2. **Base de Datos:**
   Restaura la estructura e índices iniciales usando el archivo `control_comedor.sql` (Ver la configuración detallada en `ARCHITECTURE.md`).

3. **Variables de Entorno:**
   Copia el archivo `.env.example` en la raíz de `backend` y `frontend` renombrándolo a `.env`. Asegúrate de completar tus credenciales de base de datos y puertos.

   *Ejemplo Backend (`backend/.env`):*
   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=tu_password
   DB_NAME=control_comedor
   PORT=3000
   ```

   *Ejemplo Python (`backend/python_core/.env`):*
   Asegúrate de configurar IP, puerto e IDs de la impresora y el dispositivo biométrico en crudo dentro del código de Python o sus variables según correspondan.

4. **Arranque Completo del Sistema:**
   Este proyecto incluye un script bash que instala **todas** las dependencias requeridas en Python (bajo un entorno virtual `venv`) y Node.js, y arranca los procesos como servicios del sistema.
   ```bash
   chmod +x start_system.sh
   ./start_system.sh
   ```

Una vez finalizado, el **Frontend** estará disponible en el puerto especificado (por defecto `http://localhost:5173`) y la **API Backend** corriendo (por defecto `http://localhost:3000`).

---

## Características Principales (Features)
- **Captura Biométrica en Tiempo Real:** Comunicación continua por TCP con dispositivos ZKTeco procesada de forma asincrónica.
- **Impresión Térmica Instántanea:** Manejo seguro de impresoras térmicas ESC/POS (Epson/Zebra) evitando cuellos de botella mediante control re-entrante.
- **Validación Anti-duplicidad:** Reglas de validación y control de anti-passback en backend previniendo consumos dobles fuera de la lógica permitida.
- **Dashboard en Tiempo Real:** Interfaz analítica en React que usa SWR y componentes optimizados para mapear estadísticas y tendencias de uso en vivo.
- **Panel Administrativo:** Interfaz para control absoluto del menú semanal de dietas.
- **Sistema de Caché y Pool de Conexiones:** Empleo riguroso de Patrones de Repositorio (Repository Pattern), LRU Cache en NodeJS y Connection Pooling (MySQL) en Python/Node.

---

## Estructura de la Documentación

Toda la documentación vital del sistema se divide de la siguiente manera:

* [**ARCHITECTURE.md**](./ARCHITECTURE.md) - Explicación detallada de la arquitectura de software C4, capas del sistema y estructura de base de datos.
* [**API_REFERENCE.md**](./API_REFERENCE.md) - Documentación completa de los endpoints REST alojados en Node.js.
* [**GUIA_ESTUDIANTES.md**](./GUIA_ESTUDIANTES.md) - Guía manual inicial heredada o de onboarding.
* [**MANUAL_OPERACIONES.md**](./MANUAL_OPERACIONES.md) - Pasos y resoluciones a tomar para la operatividad del hardware (Biométrico e Impresoras).

## Licencia
*DETCUADOR S.A. | John Alexander Garcia | Todos los derechos reservados.*
