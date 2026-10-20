@echo off
setlocal enabledelayedexpansion
title PhotoshopAI - Web Dev Server
echo ========================================================
echo        PhotoshopAI - Starting Web Server...
echo ========================================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not found in PATH!
    echo Please install Node.js 20 or higher from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

node -e "const v = parseInt(process.versions.node.split('.')[0], 10); if (isNaN(v) || v < 20) { console.error('[ERROR] Node.js version 20+ is required. Found: ' + process.version); process.exit(1); }"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Please update Node.js to v20 or newer to run PhotoshopAI.
    pause
    exit /b 1
)

echo [OK] Node.js environment verified:
node -v
echo.
echo Open your browser at http://localhost:1420
echo.
call npm run dev
pause
