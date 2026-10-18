@echo off
title PhotoshopAI - Windows Desktop Studio
echo ========================================================
echo        PhotoshopAI - Windows Desktop Application
echo ========================================================
echo.
echo Launching native desktop window...
echo.

node electron/run-desktop.cjs

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [Notice] Trying fallback dev mode...
    call npm run app
)

pause
