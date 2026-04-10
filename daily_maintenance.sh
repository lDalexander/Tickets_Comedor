
#!/bin/bash

# Configuration
PROJECT_DIR="/home/john/comedor/Tickets_Comedor"
LOG_FILE="$PROJECT_DIR/maintenance.log"
FRONTEND_PORT=5173
BACKEND_PORT=5001
DB_PORT=3306
IP_IMPRESORA="150.36.200.9"
IP_BIOMETRICO="150.36.200.12"

# Services List
SERVICES=("mysql" "comedor-backend" "comedor-frontend" "comedor-worker")

# Redirect output to log file (append)
exec > >(tee -a ${LOG_FILE}) 2>&1

echo "========================================================"
echo "🛡️  MANTENIMIENTO DE SISTEMA - $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================================"

# --- FUNCION DE AYUDA ---
check_port() {
    local port=$1
    local name=$2
    if lsof -i:$port > /dev/null; then
        echo "   ✅ Puerto $port ($name) está ocupado (OK)."
        return 0
    else
        echo "   ⚠️ Puerto $port ($name) está LIBRE (Error)."
        return 1
    fi
}

api_health_check() {
    # Intenta conectar al endpoint de salud
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:$BACKEND_PORT/api/health)
    if [ "$HTTP_CODE" == "200" ]; then
        return 0
    else
        return 1
    fi
}

# ---------------------------------------------------------
# 0. LIMPIEZA DE LOGS ANTIGUOS (Prevenir disco lleno)
# ---------------------------------------------------------
echo "[0] Verificando tamaño de logs..."
# Si el log principal es mayor a 50MB, lo rotamos
if [ -f "$LOG_FILE" ] && [ $(stat -c%s "$LOG_FILE") -ge 52428800 ]; then
    echo "   📦 Log archivo muy grande. Rotando..."
    mv "$LOG_FILE" "$LOG_FILE.old"
    echo "Log rotado el $(date)" > "$LOG_FILE"
fi

# ---------------------------------------------------------
# 1. DISCO DURO
# ---------------------------------------------------------
echo "[1] Verificando Espacio en Disco..."
DISK_USAGE=$(df / | grep / | awk '{ print $5 }' | sed 's/%//g')
if [ "$DISK_USAGE" -gt 90 ]; then
    echo "   ❌ ALERTA CRITICA: Disco casi lleno ($DISK_USAGE%)."
    # Podríamos añadir limpieza automática aquí si fuera necesario
else
    echo "   ✅ Espacio en disco OK ($DISK_USAGE%)."
fi

# ---------------------------------------------------------
# 2. ASEGURAR SERVICIOS HABILITADOS (Auto-Start)
# ---------------------------------------------------------
echo "[2] Asegurando persistencia de servicios..."
for svc in "${SERVICES[@]}"; do
    if ! systemctl is-enabled --quiet $svc; then
        echo "   ⚠️ Habilitando $svc para inicio automático..."
        sudo systemctl enable $svc
    else
        echo "   ✅ $svc ya está habilitado."
    fi
done

# ---------------------------------------------------------
# 3. BASE DE DATOS (MySQL)
# ---------------------------------------------------------
echo "[3] Verificando Base de Datos..."
# Verificación 1: Servicio Systemd
if ! systemctl is-active --quiet mysql; then
    echo "   ⚠️ Servicio MySQL detenido. Reiniciando..."
    sudo systemctl restart mysql
    sleep 5
fi

# Verificación 2: Puerto TCP 3306
if check_port $DB_PORT "MySQL"; then
    echo "   ✅ Conexión TCP DB disponible."
else
    echo "   ❌ ALERTA: MySQL corre pero no escucha en $DB_PORT. Reiniciando forzado..."
    sudo systemctl restart mysql
    sleep 5
fi

# ---------------------------------------------------------
# 4. BACKEND API Check
# ---------------------------------------------------------
echo "[4] Verificando Backend API..."
NEEDS_RESTART=0

# Check de Puerto
if ! check_port $BACKEND_PORT "Backend"; then
    echo "   ⚠️ Puerto $BACKEND_PORT cerrado."
    NEEDS_RESTART=1
fi

# Check de Salud HTTP
if [ $NEEDS_RESTART -eq 0 ]; then
    if api_health_check; then
        echo "   ✅ API responde 200 OK."
    else
        echo "   ⚠️ API no responde correctamente."
        NEEDS_RESTART=1
    fi
fi

if [ $NEEDS_RESTART -eq 1 ]; then
    echo "   🔧 Reparando Backend..."
    # Matar cualquier proceso zombie en el puerto
    fuser -k $BACKEND_PORT/tcp > /dev/null 2>&1
    sudo systemctl restart comedor-backend.service
    sleep 5
    if api_health_check; then
        echo "   ✅ Backend recuperado."
    else
        echo "   ❌ ERROR: Backend sigue fallando tras reinicio."
    fi
fi

# ---------------------------------------------------------
# 5. FRONTEND Check
# ---------------------------------------------------------
echo "[5] Verificando Frontend..."
if ! check_port $FRONTEND_PORT "Frontend"; then
    echo "   ⚠️ Frontend caído. Ejecutando script de rescate..."
    cd "$PROJECT_DIR"
    sudo ./force_restart_frontend.sh
else
    # Doble verificación: A veces el puerto está tomado por "node" pero no es vite
    # curl rápido para ver si devuelve HTML
    if curl -s --max-time 3 http://localhost:$FRONTEND_PORT | grep -q "<html"; then
        echo "   ✅ Frontend sirve contenido HTML."
    else
        echo "   ⚠️ Puerto abierto pero no sirve HTML. Posible proceso zombie."
        cd "$PROJECT_DIR"
        sudo ./force_restart_frontend.sh
    fi
fi

# ---------------------------------------------------------
# 6. WORKER PYTHON Check
# ---------------------------------------------------------
echo "[6] Verificando Worker Python..."
if systemctl is-active --quiet comedor-worker.service; then
    echo "   ✅ Worker Python activo."
else
    echo "   ⚠️ Worker Python detenido. Reiniciando..."
    sudo systemctl restart comedor-worker.service
fi

# ---------------------------------------------------------
# 7. CONECTIVIDAD HARDWARE Check
# ---------------------------------------------------------
echo "[7] Verificando Hardware..."
if ping -c 1 -W 2 $IP_IMPRESORA > /dev/null; then
    echo "   ✅ Impresora OK."
else
    echo "   ❌ ERROR: Impresora desconectada."
fi

if ping -c 1 -W 2 $IP_BIOMETRICO > /dev/null; then
    echo "   ✅ Biométrico OK."
else
    echo "   ❌ ERROR: Biométrico desconectado."
fi

echo "[8] Enviando Reporte SMTP..."
cd "$PROJECT_DIR/backend/python_core"
./venv/bin/python send_maintenance_status.py
cd "$PROJECT_DIR"

echo "========================================================"
echo "🏁 FIN DE MANTENIMIENTO: $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================================"
echo ""
