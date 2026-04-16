@echo off
cd /d "%~dp0"

:: Check for node_modules
if not exist "node_modules" (
    call npm install
)

:: Launch Electron with hidden console — everything runs inside the app
start "" /min cmd /c "npm run dev"
exit
