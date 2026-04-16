@echo off
title The Forge - Software Development Studio
cd /d "%~dp0"

echo.
echo   The Forge - Software Development Studio
echo   ========================================
echo.

:: Check for node_modules
if not exist "node_modules" (
    echo   Installing dependencies...
    call npm install
    echo.
)

echo   Starting dev server...
echo   Dashboard will open at http://localhost:5180
echo.
echo   Press Ctrl+C to stop.
echo.

call npm run vite
