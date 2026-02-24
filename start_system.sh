#!/bin/bash

# ============================================================
# Script de Arranque - Sistema de Comedor
# ============================================================
# Este script reinicia TODOS los servicios del sistema usando systemd.
# Es seguro ejecutarlo múltiples veces: siempre detiene todo primero
# y luego inicia todo limpio. No genera procesos duplicados.
#
# USO:  ./start_system.sh
# ============================================================

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║       SISTEMA DE COMEDOR - REINICIO COMPLETO            ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# --- PASO 0: Verificar archivos necesarios ---
if [ ! -f "backend/python_core/.env" ]; then
    echo "❌ Error: backend/python_core/.env no encontrado!"
    exit 1
fi

# --- PASO 1: Detener ABSOLUTAMENTE TODO ---
echo "🧹 [1/5] Deteniendo servicios..."

# Matar procesos huérfanos que NO estén bajo systemd
pkill -f "node server.js" 2>/dev/null
pkill -f "python.*main.py" 2>/dev/null
pkill -f "python comedor.py" 2>/dev/null
pkill -f "vite" 2>/dev/null
pkill -f "npm run dev" 2>/dev/null

# Liberar puertos ocupados (5001=backend API, 5173=frontend)
sudo fuser -k 5173/tcp 2>/dev/null
sudo fuser -k 5001/tcp 2>/dev/null

# Detener servicios systemd (esto pide contraseña la primera vez)
sudo systemctl stop comedor-backend.service 2>/dev/null
sudo systemctl stop comedor-worker.service 2>/dev/null
sudo systemctl stop comedor-frontend.service 2>/dev/null
sudo systemctl stop comedor-maintenance.timer 2>/dev/null
sleep 1

# Verificar que realmente no quede nada
REMAINING=$(ps aux | grep -E "(python.*main\.py|node server\.js)" | grep -v grep | wc -l)
if [ "$REMAINING" -gt 0 ]; then
    echo "   ⚠️ Matando procesos resistentes..."
    pkill -9 -f "python.*main.py" 2>/dev/null
    pkill -9 -f "node server.js" 2>/dev/null
    sleep 1
fi
echo "   ✅ Todo detenido."

# --- PASO 2: Verificar dependencias (solo si faltan) ---
echo "📦 [2/5] Verificando dependencias..."

# Node.js
if [ ! -d "backend/node_modules" ]; then
    echo "   Instalando dependencias Node.js..."
    cd backend && npm install && cd ..
else
    echo "   ✅ Node.js OK"
fi

# Python venv
if [ ! -d "backend/python_core/venv" ]; then
    echo "   Creando entorno virtual Python..."
    cd backend/python_core
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt > /dev/null 2>&1
    cd ../..
else
    echo "   ✅ Python venv OK"
fi

# --- PASO 3: Habilitar y arrancar servicios via systemd ---
echo "🚀 [3/5] Iniciando servicios con systemd..."

sudo systemctl enable comedor-backend.service 2>/dev/null
sudo systemctl enable comedor-worker.service 2>/dev/null
sudo systemctl enable comedor-frontend.service 2>/dev/null
sudo systemctl enable comedor-maintenance.timer 2>/dev/null

sudo systemctl restart comedor-backend.service
sudo systemctl restart comedor-worker.service
sudo systemctl restart comedor-frontend.service
sudo systemctl restart comedor-maintenance.timer

sleep 3

# --- PASO 4: Verificar que arrancaron correctamente ---
echo "🔍 [4/5] Verificando estado..."
echo ""

ALL_OK=true

# Backend
if systemctl is-active --quiet comedor-backend; then
    BPID=$(systemctl show comedor-backend --property=MainPID --value)
    echo "   ✅ Backend Node.js    (PID: $BPID)"
else
    echo "   ❌ Backend Node.js    FALLÓ - Ver: journalctl -u comedor-backend -n 20"
    ALL_OK=false
fi

# Worker
if systemctl is-active --quiet comedor-worker; then
    WPID=$(systemctl show comedor-worker --property=MainPID --value)
    echo "   ✅ Worker Python      (PID: $WPID)"
else
    echo "   ❌ Worker Python      FALLÓ - Ver: journalctl -u comedor-worker -n 20"
    ALL_OK=false
fi

# Frontend
if systemctl is-active --quiet comedor-frontend; then
    FPID=$(systemctl show comedor-frontend --property=MainPID --value)
    echo "   ✅ Frontend Vite      (PID: $FPID)"
else
    echo "   ❌ Frontend Vite      FALLÓ - Ver: journalctl -u comedor-frontend -n 20"
    ALL_OK=false
fi

# Maintenance Timer
if systemctl is-active --quiet comedor-maintenance.timer; then
    echo "   ✅ Timer Mantenimiento"
else
    echo "   ⚠️ Timer Mantenimiento no activo"
fi

# --- PASO 5: Resumen ---
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
if [ "$ALL_OK" = true ]; then
    echo "║   ✅  SISTEMA ARRANCADO CORRECTAMENTE                   ║"
else
    echo "║   ⚠️  ALGUNOS SERVICIOS FALLARON (ver arriba)           ║"
fi
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║  Comandos útiles:                                        ║"
echo "║    Ver estado:   sudo systemctl status comedor-worker    ║"
echo "║    Ver logs:     journalctl -u comedor-worker -f         ║"
echo "║    Reiniciar:    ./start_system.sh                       ║"
echo "║    Detener todo: sudo systemctl stop comedor-{backend,worker,frontend}  ║"
echo "║                                                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
