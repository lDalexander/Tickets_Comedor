#!/bin/bash
# ===========================================================
# deploy_frontend.sh - Reconstruir y desplegar el frontend
# Usar cuando se hagan cambios al código del frontend.
# Nginx sirve los archivos estáticos de frontend/dist/.
# ===========================================================

set -e

FRONTEND_DIR="/home/john/comedor/Tickets_Comedor/frontend"

echo "======================================"
echo "   DEPLOY FRONTEND (Build + Reload)   "
echo "======================================"

# 1. Build
echo "Construyendo frontend..."
cd "$FRONTEND_DIR"
npm run build

echo "Build completado."

# 2. Reload Nginx para que sirva los nuevos archivos
echo "Recargando Nginx..."
sudo systemctl reload nginx

if [ $? -eq 0 ]; then
    echo "Nginx recargado."
else
    echo "Error recargando Nginx."
fi

echo "======================================"
echo " DEPLOY COMPLETADO"
echo " Accede al panel desde: http://150.36.200.252:5001"
echo "======================================"
