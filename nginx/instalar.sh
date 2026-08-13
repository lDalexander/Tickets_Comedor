#!/bin/bash
# Instalación de Nginx para el sistema de Tickets Comedor
# Ejecutar con: sudo bash /home/john/comedor/Tickets_Comedor/nginx/instalar.sh

set -e

PROYECTO="/home/john/comedor/Tickets_Comedor"

echo "--- Copiando servicios systemd ---"
cp "$PROYECTO/comedor-backend.service"  /etc/systemd/system/comedor-backend.service
cp "$PROYECTO/comedor-frontend.service" /etc/systemd/system/comedor-frontend.service

echo "--- Enlazando config Nginx ---"
ln -sf "$PROYECTO/nginx/comedor.conf" /etc/nginx/sites-enabled/comedor
rm -f /etc/nginx/sites-enabled/default

echo "--- Verificando config Nginx ---"
nginx -t

echo "--- Recargando systemd ---"
systemctl daemon-reload

echo "--- Deshabilitando Vite (reemplazado por Nginx) ---"
systemctl stop comedor-frontend  || true
systemctl disable comedor-frontend || true

echo "--- Reiniciando backend en puerto 5002 ---"
systemctl restart comedor-backend

echo "--- Recargando Nginx ---"
systemctl reload nginx

echo ""
echo "=== Verificacion ==="
sleep 2
curl -s http://localhost:5002/api/health && echo " <- Express OK (puerto 5002)"
curl -s http://localhost:5001/api/health && echo " <- Nginx OK (puerto 5001)"

echo ""
echo "=== Listo. Accede desde: http://150.36.200.252:5001 ==="
