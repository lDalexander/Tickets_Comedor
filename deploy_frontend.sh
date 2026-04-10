#!/bin/bash
# ===========================================================
# deploy_frontend.sh - Reconstruir y desplegar el frontend
# Usar cuando se hagan cambios al código del frontend.
# El backend (Express) sirve los archivos estáticos de dist/.
# ===========================================================

set -e

FRONTEND_DIR="/home/john/comedor/Tickets_Comedor/frontend"

echo "======================================"
echo "   DEPLOY FRONTEND (Build + Restart)  "
echo "======================================"

# 1. Build
echo "📦 Construyendo frontend..."
cd "$FRONTEND_DIR"
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Error en el build. Abortando."
    exit 1
fi

echo "✅ Build completado."

# 2. Restart backend (que sirve los estáticos)
echo "🔄 Reiniciando backend para cargar nuevos archivos..."
sudo systemctl restart comedor-backend.service

if [ $? -eq 0 ]; then
    echo "✅ Backend reiniciado."
else
    echo "⚠️ Error reiniciando backend."
fi

echo "======================================"
echo " ✅ DEPLOY COMPLETADO"
echo " Accede al panel desde: http://150.36.200.252:5001"
echo "======================================"
