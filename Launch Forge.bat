@echo off
cd /d "%~dp0"

where node >nul 2>&1
if not errorlevel 1 goto :node_ok

echo Node is required but not installed.
where winget >nul 2>&1
if errorlevel 1 goto :node_manual

set /p REPLY=Install Node 20 LTS via winget? [y/N] 
if /i "%REPLY%"=="y" goto :winget_install
goto :node_manual

:winget_install
winget install OpenJS.NodeJS.LTS
goto :node_ok

:node_manual
echo Download Node from https://nodejs.org, then re-run.
exit /b 1

:node_ok
if not exist "node_modules" goto :setup
if not exist "friday\.env" goto :setup
goto :dev

:setup
node scripts\setup.mjs
if errorlevel 1 exit /b 1

:dev
npm run dev
