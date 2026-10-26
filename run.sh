#!/bin/bash
# HCM Lite — one-click run (Mac / Linux).
# No Docker, no Atlas, no .env editing needed: the backend starts its own
# in-memory MongoDB if MONGO_URI is not set in server/.env.
# Safe to run twice: if the backend is already running on port 5000, this
# script will NOT start a second one (that was the old EADDRINUSE crash).
# Usage: ./run.sh        (then open http://localhost:5173)
# Stop:  ./stop.sh  (or Ctrl+C in this terminal)
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node.js 20+ from https://nodejs.org/ and run ./run.sh again."
  exit 1
fi

echo "Installing backend dependencies (first run only)..."
(cd server && [ -d node_modules ] || npm install)
echo "Installing frontend dependencies (first run only)..."
(cd client && [ -d node_modules ] || npm install)

cleanup() { kill $SERVER_PID $CLIENT_PID 2>/dev/null || true; }
trap cleanup EXIT INT TERM

if curl -s http://localhost:5000/api/health >/dev/null 2>&1; then
  echo "Backend is ALREADY running on http://localhost:5000 — not starting a second one."
  echo "If that backend is stale, run ./stop.sh first, then ./run.sh again."
  SERVER_PID=""
else
  echo "Starting backend on http://localhost:5000 ..."
  echo "(First run: the in-memory MongoDB binary downloads once, so this can take up to a minute.)"
  (cd server && npm run dev) &
  SERVER_PID=$!
fi

echo "Starting frontend on http://localhost:5173 ..."
(cd client && npm run dev) &
CLIENT_PID=$!

echo "Waiting for the backend to be ready (up to 90 seconds)..."
for i in $(seq 1 90); do
  if curl -s http://localhost:5000/api/health >/dev/null 2>&1; then break; fi
  sleep 1
done
if curl -s http://localhost:5000/api/health >/dev/null 2>&1; then
  echo "Backend is ready."
else
  echo "WARNING: backend is not responding yet on http://localhost:5000."
  echo "Check the backend terminal for an error. The frontend will keep retrying in the browser."
fi

echo ""
echo "HCM Lite is running!"
echo "  App:     http://localhost:5173"
echo "  Backend: http://localhost:5000/api/health"
echo "  First step in the browser: Setup (create company + Admin account), then Login."
echo "  Press Ctrl+C to stop both servers, or run ./stop.sh in another terminal."
if command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:5173 >/dev/null 2>&1 || true;
elif command -v open >/dev/null 2>&1; then open http://localhost:5173 >/dev/null 2>&1 || true; fi
wait
