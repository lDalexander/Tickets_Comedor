#!/bin/bash
# Crea /etc/comedor/secrets.env con todos los valores de producción
# Ejecutar con: sudo bash /home/john/comedor/Tickets_Comedor/nginx/crear_secrets.sh

set -e

echo "--- Creando directorio /etc/comedor ---"
mkdir -p /etc/comedor

echo "--- Generando ADMIN_JWT_SECRET ---"
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

echo "--- Escribiendo /etc/comedor/secrets.env ---"
cat > /etc/comedor/secrets.env << EOF
# Secretos de producción — Sistema de Tickets Comedor
# NO commitear este archivo

PORT=5002
NODE_ENV=production

DB_HOST=localhost
DB_USER=admin
DB_PASSWORD=3012
DB_NAME=control_comedor
DB_PORT=3306

ADMIN_JWT_SECRET=${JWT_SECRET}

SMTP_SERVER=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=no-reply@detcuador.com
SMTP_PASS=jykvnwzjjqwymgzp
EMAIL_DESTINO=agarcia@detcuador.com

IP_BIOMETRICO=150.36.200.12
IP_IMPRESORA=150.36.200.9
PUERTO_ZK=4370

CORS_ORIGINS=http://150.36.200.252:5001
LOG_PATH=/var/log/comedor/backend-errors.log
EOF

echo "--- Ajustando permisos ---"
chown john:john /etc/comedor/secrets.env
chmod 600 /etc/comedor/secrets.env

echo ""
echo "=== secrets.env creado en /etc/comedor/secrets.env ==="
echo "    JWT_SECRET generado automaticamente"
echo "    Verifica los valores con: sudo cat /etc/comedor/secrets.env"
