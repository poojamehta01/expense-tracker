#!/bin/bash
cd "$(dirname "$0")"

# Kill anything on port 3000
PID=$(lsof -ti :3000)
if [ -n "$PID" ]; then
  echo "Killing existing process on port 3000 (PID $PID)..."
  kill -9 $PID
  sleep 1
fi

echo "Starting Expense Tracker..."
npm start
