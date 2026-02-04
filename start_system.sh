#!/bin/bash

# Start System Script for Comedor Tickets System

# Function to check if a command exists
command_exists () {
    type "$1" &> /dev/null ;
}

echo "--- Starting Comedor System Integration ---"

# 1. Check for Environment Variables
if [ ! -f "backend_comedor/.env" ]; then
    echo "❌ Error: backend_comedor/.env not found!"
    exit 1
fi

if [ ! -f "backend/.env" ]; then
    echo "⚠️ Warning: backend/.env not found! Creating symlink or copy if needed."
    # Optional logic to sync envs
fi

# 2. Start Node.js Backend
echo "🚀 Starting Node.js Backend..."
cd backend
if [ ! -d "node_modules" ]; then
    echo "📦 Installing Node dependencies..."
    npm install
fi
# Start in background using nohup or just &
# Using npm start if script exists, or node server.js
nohup npm start > ../backend.log 2>&1 &
BACKEND_PID=$!
echo "✅ Backend started (PID: $BACKEND_PID)"
cd ..

# 3. Start Python Worker
echo "🐍 Starting Python Comedor Worker..."
cd backend_comedor
# Verify virtual environment or install deps
if command_exists pip3; then
    # echo "📦 Checking Python dependencies (this might take a moment)..."
    # pip3 install -r requirements.txt > /dev/null 2>&1
    :
fi

nohup python3 comedor.py > ../comedor_worker.log 2>&1 &
WORKER_PID=$!
echo "✅ Worker started (PID: $WORKER_PID)"
cd ..

# 4. Start Frontend (Optional, usually for dev)
# echo "🎨 Starting Frontend..."
# cd frontend
# nohup npm run dev > ../frontend.log 2>&1 &
# FRONTEND_PID=$!
# cd ..

echo "--- System Started Successfully ---"
echo "pids: Backend=$BACKEND_PID, Worker=$WORKER_PID"
echo "Logs are being written to backend.log and comedor_worker.log"
echo "To stop: kill $BACKEND_PID $WORKER_PID"
