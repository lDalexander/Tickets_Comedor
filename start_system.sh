#!/bin/bash

# Start System Script for Comedor Tickets System

# Function to check if a command exists
command_exists () {
    type "$1" &> /dev/null ;
}

echo "--- Starting Comedor System Integration ---"

# 0. Cleanup old processes
echo "🧹 Cleaning up old processes..."
pkill -f "node server.js"
pkill -f "python comedor.py"
pkill -f "python main.py"
sleep 1

# 1. Check for Environment Variables
if [ ! -f "backend/python_core/.env" ]; then
    echo "❌ Error: backend/python_core/.env not found!"
    exit 1
fi

# 2. Start Node.js Backend
echo "🚀 Starting Node.js Backend..."
cd backend
if [ ! -d "node_modules" ]; then
    echo "📦 Installing Node dependencies..."
    npm install
fi

# Run node directly to avoid npm PID issues
nohup node server.js > ../backend.log 2>&1 &
BACKEND_PID=$!
echo "✅ Backend started (PID: $BACKEND_PID)"
cd ..

# 3. Start Python Worker
echo "🐍 Starting Python Comedor Worker..."
cd backend/python_core
if [ ! -d "venv" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate venv
source venv/bin/activate

echo "📦 Checking Python dependencies..."
# Only run pip if requirements changed or verify simple check?
# To speed up, we can skip if libs exist, but pip is fast enough.
pip install -r requirements.txt > /dev/null 2>&1

nohup python main.py > ../../comedor_worker.log 2>&1 &
WORKER_PID=$!
echo "✅ Worker started (PID: $WORKER_PID)"
cd ../..

sleep 2
# Validate PIDs
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "❌ Error: Node.js Backend failed to start. Check backend.log."
fi
if ! kill -0 $WORKER_PID 2>/dev/null; then
    echo "❌ Error: Python Worker failed to start. Check comedor_worker.log."
fi
# 4. Start Frontend (Optional, usually for dev)
echo "🎨 Starting Frontend..."
cd frontend
nohup npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

sleep 2
if ! ps -p $BACKEND_PID > /dev/null; then
    echo "❌ Error: Node.js Backend failed to start. Check backend.log."
fi
if ! ps -p $WORKER_PID > /dev/null; then
    echo "❌ Error: Python Worker failed to start. Check comedor_worker.log."
fi

echo "--- System Status Checked ---"
echo "pids: Backend=$BACKEND_PID, Worker=$WORKER_PID"
echo "Logs are being written to backend.log and comedor_worker.log"
echo "To stop: kill $BACKEND_PID $WORKER_PID"
