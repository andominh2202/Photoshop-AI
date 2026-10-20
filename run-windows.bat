@echo off
setlocal enabledelayedexpansion
title PhotoshopAI - Windows Studio
echo ========================================================
echo        PhotoshopAI - Windows Desktop Application
echo ========================================================
echo.

where cargo >nul 2>&1
set HAS_CARGO=%ERRORLEVEL%

where rustc >nul 2>&1
set HAS_RUSTC=%ERRORLEVEL%

if %HAS_CARGO% NEQ 0 (
    echo [WARNING] Cargo was not found in PATH!
    echo To build native Tauri release with DirectML AI acceleration, install Rust from:
    echo https://rustup.rs/
    echo.
) else if %HAS_RUSTC% NEQ 0 (
    echo [WARNING] Rust toolchain is incomplete (rustc missing).
    echo Please configure Rust from: https://rustup.rs/
    echo.
) else (
    echo [OK] Rust toolchain detected:
    cargo --version
)

echo.
set /p CHOICE="Launch Desktop runtime? [1] Tauri Release (Rust+DirectML) [2] Electron Desktop (default: 2): "
if "%CHOICE%"=="" set CHOICE=2

echo.
powershell -NoProfile -Command "[System.IO.File]::WriteAllText('.build_start.tmp', [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString())"

if "%CHOICE%"=="1" (
    if %HAS_CARGO% NEQ 0 (
        echo [ERROR] Cannot build Tauri: Rust/Cargo is not installed.
        echo Please install Rust from https://rustup.rs/
        pause
        exit /b 1
    )
    echo [*] Building and launching Tauri native app in Release mode...
    call npx tauri build --release
) else (
    echo [*] Launching Electron desktop window...
    node electron/run-desktop.cjs
    if !ERRORLEVEL! NEQ 0 (
        echo.
        echo [Notice] Trying fallback dev mode...
        call npm run app
    )
)

if exist .build_start.tmp (
    powershell -NoProfile -Command "$start = [long](Get-Content .build_start.tmp); $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); $diff = ($now - $start) / 1000.0; Write-Host ('[Timer] Total execution/build time: ' + [math]::Round($diff, 2) + ' seconds') -ForegroundColor Green"
    del .build_start.tmp >nul 2>&1
)

echo.
pause
