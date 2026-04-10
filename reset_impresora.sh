#!/bin/bash

echo "======================================"
echo "    RESET DE IMPRESORA Y SERVICIO     "
echo "======================================"

# 1. Obtener IP de la impresora desde el archivo .env
ENV_FILE="/home/john/comedor/Tickets_Comedor/backend/python_core/.env"
if [ -f "$ENV_FILE" ]; then
    # Extraer la IP ignorando comentarios y espacios
    IP_IMPRESORA=$(grep '^IP_IMPRESORA=' "$ENV_FILE" | cut -d '=' -f2)
else
    echo "⚠️ Archivo .env no encontrado. Usando IP por defecto."
    IP_IMPRESORA="150.36.200.9"
fi

echo "🔍 IP de Impresora configurada: $IP_IMPRESORA"

# 2. Verificar conexión por Ping
echo "📡 Verificando conexión de red (Ping)..."
ping -c 2 $IP_IMPRESORA > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ Ping exitoso: La impresora está en la red."
else
    echo "   ❌ Fallo en el Ping: La impresora no responde en la red."
    echo "      Por favor, revisa que esté encendida y conectada a la red."
    exit 1
fi

# 3. Limpiar buffer de la impresora (Comando ESC/POS INIT)
echo "🖨️ Enviando comando de inicialización a la impresora (limpiar buffer)..."
# \x1B\x40 es el comando ESC @ que inicializa la impresora en ESC/POS
# \x10\x14\x01\x00\x05 enviaria un CLEAR buffer para impresoras Epson, pero con INIT suele bastar.
echo -ne '\x1B\x40' | nc -w 2 $IP_IMPRESORA 9100 > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ Buffer de impresora limpiado."
else
    echo "   ⚠️ No se pudo enviar el comando a través de netcat (¿puerto 9100 bloqueado o en uso?)."
fi

# 4. Reiniciar el servicio del worker (maneja la conexión)
echo "🔄 Reiniciando el servicio comedor-worker..."
sudo systemctl restart comedor-worker.service
if [ $? -eq 0 ]; then
    echo "   ✅ Servicio comedor-worker reiniciado exitosamente."
else
    echo "   ❌ Error al reiniciar el servicio comedor-worker. Puede que no tengas permisos sudo sin contraseña."
fi

echo "======================================"
echo " ✅ PROCESO COMPLETADO "
echo " Si la impresora sigue sin imprimir:"
echo " 1. Verifica si tiene papel y que la tapa esté bien cerrada."
echo " 2. Apaga y enciende la impresora físicamente."
echo "======================================"
