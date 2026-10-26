@echo off
REM HCM Lite — one-click run (Windows).
REM No Docker, no Atlas, no .env editing needed: the backend starts its own
REM in-memory MongoDB if MONGO_URI is not set in server\.env.
REM Safe to run twice: if the backend is already running on port 5000, this
REM script will NOT start a second one (that was the old EADDRINUSE crash).
REM Usage: double-click run.bat, then open http://localhost:5173
REM Stop:  double-click stop.bat, or close the two "HCM Lite" windows.
cd /d %~dp0

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 20+ from https://nodejs.org/ and run run.bat again.
  pause
  exit /b 1
)

echo Installing backend dependencies (first run only)...
if not exist server\node_modules (
  cd server && call npm install && cd ..
)
echo Installing frontend dependencies (first run only)...
if not exist client\node_modules (
  cd client && call npm install && cd ..
)

REM Check if backend is already healthy — do NOT start a second one.
curl -s http://localhost:5000/api/health >nul 2>nul
if %errorlevel%==0 (
  echo Backend is ALREADY running on http://localhost:5000 — not starting a second one.
  echo If that backend is stale, run stop.bat first, then run.bat again.
) else (
  echo Starting backend on http://localhost:5000 ...
  echo (First run: the in-memory MongoDB binary downloads once, so this can take up to a minute.)
  start "HCM Lite - Backend" cmd /k "cd /d %~dp0server && npm run dev"
)

echo Starting frontend on http://localhost:5173 ...
start "HCM Lite - Frontend" cmd /k "cd /d %~dp0client && npm run dev"

echo Waiting for the backend to be ready (up to 90 seconds)...
for /l %%i in (1,1,90) do (
  curl -s http://localhost:5000/api/health >nul 2>nul
  if %errorlevel%==0 goto :backend_ready
  timeout /t 1 /nobreak >nul
)
echo WARNING: backend is not responding yet on http://localhost:5000.
echo Check the "HCM Lite - Backend" window for an error. The frontend will keep retrying in the browser.
goto :open_browser
:backend_ready
echo Backend is ready.

:open_browser
echo.
echo HCM Lite is running!
echo   App:     http://localhost:5173
echo   Backend: http://localhost:5000/api/health
echo   First step in the browser: Setup (create company + Admin account), then Login.
echo   IMPORTANT: run run.bat only ONCE. Running it twice causes "Port 5000 is already in use".
echo   To stop: double-click stop.bat, or close the two "HCM Lite" windows.
start http://localhost:5173
pause
