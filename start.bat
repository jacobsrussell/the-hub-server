@echo off
title The Hub — Dashboard Server
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  npm install
  echo.
)

echo ════════════════════════════════════════════
echo   THE HUB — Server Launcher
echo ════════════════════════════════════════════
echo.
echo   [1] Run server (foreground)
echo   [2] Run server (always-on via PM2)
echo   [3] Stop PM2 server
echo.
set /p choice="  Choose: "

if "%choice%"=="1" (
  echo.
  echo Starting server in foreground...
  node server.js
) else if "%choice%"=="2" (
  echo.
  where pm2 >nul 2>nul
  if %errorlevel% neq 0 (
    echo Installing PM2 globally...
    npm install -g pm2
  )
  pm2 start ecosystem.config.js
  pm2 save
  echo.
  echo Server is now running always-on!
  echo Dashboard: http://localhost:3000/dashboard
  echo App:       http://localhost:3000/
  echo.
  echo PM2 commands:
  echo   pm2 status      — check status
  echo   pm2 logs         — view logs
  echo   pm2 restart all  — restart
  echo   pm2 stop all     — stop
  echo   pm2 delete all   — remove
) else if "%choice%"=="3" (
  pm2 stop the-hub
  pm2 delete the-hub
  echo Server stopped and removed.
) else (
  echo Invalid choice.
)
pause
