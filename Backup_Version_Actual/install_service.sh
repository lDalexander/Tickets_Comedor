#!/bin/bash

# Script to install Comedor Service
# Must be run with sudo

if [ "$EUID" -ne 0 ]; then
  echo "❌ Please run as root (sudo ./install_service.sh)"
  exit 1
fi

echo "--- Installing Comedor Services (Split) ---"

# 1. Stop old service if exists
systemctl stop comedor.service 2>/dev/null
systemctl disable comedor.service 2>/dev/null

# 2. Copy service files
cp comedor-backend.service /etc/systemd/system/
cp comedor-worker.service /etc/systemd/system/
cp comedor-frontend.service /etc/systemd/system/
echo "✅ Service files copied."

# 3. Reload daemon
systemctl daemon-reload

# 4. Enable and Start
systemctl enable comedor-backend.service
systemctl enable comedor-worker.service
systemctl enable comedor-frontend.service

systemctl restart comedor-backend.service
systemctl restart comedor-worker.service
systemctl restart comedor-frontend.service

echo "✅ Services started!"

echo "--- Status Options ---"
echo "Backend:  systemctl status comedor-backend"
echo "Worker:   systemctl status comedor-worker"
echo "Frontend: systemctl status comedor-frontend"
