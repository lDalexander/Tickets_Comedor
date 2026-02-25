#!/bin/bash

# Colores para facilitar la lectura
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}======================================${NC}"
echo -e "${YELLOW}  Diagnóstico del Sistema de Comedor  ${NC}"
echo -e "${YELLOW}======================================${NC}\n"

echo -e "1. Chequeando el Estado de los Servicios (Systemd)...\n"

function check_service {
    if systemctl is-active --quiet $1; then
        echo -e "[${GREEN} OK ${NC}] El servicio $1 está corriendo."
    else
        echo -e "[${RED}FAIL${NC}] El servicio $1 NO está corriendo o está bloqueado."
        echo -e "         -> Para revisar el error exacto lanza: ${YELLOW}sudo journalctl -u $1 -n 20 --no-pager${NC}"
    fi
}

check_service "comedor-worker.service"
check_service "comedor-backend.service"
check_service "comedor-frontend.service"

# Revisar la base de datos (según si es mariadb o mysql en el servidor)
if systemctl is-active --quiet mariadb; then
    check_service "mariadb.service"
elif systemctl is-active --quiet mysql; then
    check_service "mysql.service"
else
    echo -e "[${RED}FAIL${NC}] Base de Datos MariaDB/MySQL NO parece estar iniciada."
fi

echo -e "\n2. Chequeando los Puertos de Red...\n"

function check_port {
    # Usar 'ss' o 'netstat' si está disponible
    if ss -tuln 2>/dev/null | grep -q ":$1 " || netstat -tuln 2>/dev/null | grep -q ":$1 "; then
        echo -e "[${GREEN} OK ${NC}] Puerto $1 ($2) está escuchando correctamente."
    else
        echo -e "[${RED}FAIL${NC}] Puerta $1 ($2) parece estar CERRADA o inactiva."
    fi
}

check_port 5001 "Backend Node.js API"
check_port 5173 "Frontend React Vite"
check_port 3306 "Base de Datos MySQL/MariaDB"

echo -e "\n${YELLOW}======================================${NC}"
echo -e "¿Necesitas monitorear los registros (logs) en tiempo real?"
echo -e "Usa el comando: ${GREEN}sudo journalctl -u <nombre_del_servicio> -f${NC}"
echo -e "${YELLOW}======================================${NC}\n"
