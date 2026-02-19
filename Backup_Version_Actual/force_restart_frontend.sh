
#!/bin/bash

# Configuration
PORT=5173
SERVICE_NAME="comedor-frontend.service"

echo "========================================="
echo "🛠️  Resetting Frontend Service (Port $PORT)"
echo "========================================="

# 1. Kill any existing process on port 5173
PID_PORT=$(lsof -t -i:$PORT)

if [ -n "$PID_PORT" ]; then
    echo "⚠️  Found process $PID_PORT using port $PORT. Killing it..."
    sudo kill -9 $PID_PORT
    echo "✅ Process $PID_PORT killed."
else
    echo "✅ Port $PORT is free. No clean-up needed."
fi

# 2. Kill stray Node processes related to Vite
echo "🧹 Cleaning up any 'vite' processes..."
pkill -f "vite"
if [ $? -eq 0 ]; then
   echo "   - Killed related 'vite' processes."
else
   echo "   - No stray 'vite' processes found."
fi

# 3. Restart the Systemd Service
echo "🔄 Restarting '$SERVICE_NAME'..."
sudo systemctl restart "$SERVICE_NAME"

# 4. Verification Loop
echo "⏳ Waiting for service to bind to port $PORT..."
for i in {1..10}; do
    sleep 1
    if lsof -i:$PORT > /dev/null; then
        echo "✅ SUCCESS! Frontend is running on port $PORT."
        exit 0
    fi
    echo -n "."
done

echo ""
echo "❌ ERROR: Timeout waiting for service start. Check logs:"
sudo journalctl -u "$SERVICE_NAME" -n 20 --no-pager
exit 1
