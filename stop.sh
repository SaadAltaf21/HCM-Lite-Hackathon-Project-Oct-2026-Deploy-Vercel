#!/bin/bash
# HCM Lite — stop the servers on ports 5000 (backend) and 5173 (frontend).
# Use this if you get "Port 5000 is already in use" / EADDRINUSE.
# Usage: ./stop.sh
fuser -k 5000/tcp 5173/tcp 2>/dev/null || true
sleep 1
echo "Stopped HCM Lite servers on ports 5000 and 5173 (if they were running)."
echo "Now run ./run.sh again — only once."
