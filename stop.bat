@echo off
REM HCM Lite — stop the servers on ports 5000 (backend) and 5173 (frontend).
REM Use this if you get "Port 5000 is already in use" / EADDRINUSE.
REM Usage: double-click stop.bat, then run run.bat again — only once.
echo Stopping HCM Lite servers on ports 5000 and 5173...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>nul
echo Done. Now run run.bat again — only once.
pause
