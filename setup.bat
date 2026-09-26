@echo off
TITLE MagxxxVot PRO - Automatic Setup ^& Launcher
COLOR 0A

:: Ensure working directory is set to script folder when double clicked
cd /d "%~dp0"

echo =======================================================
echo     MAGXXIC VAULT / MagxxxVot PRO Setup ^& Launcher
echo =======================================================
echo.

:: Step 1: Check Node.js Environment
echo [1/3] Checking Node.js runtime environment...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Node.js is not detected on your system PATH!
    echo Please install Node.js (v18 or higher) from https://nodejs.org/
    echo After installing Node.js, double-click setup.bat again.
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%v in ('node -v 2^>nul') do set NODE_VERSION=%%v
echo [OK] Node.js version %NODE_VERSION% detected.
echo.

:: Step 2: Install Dependencies if needed
echo [2/3] Verifying and installing project dependencies...
if not exist "node_modules\" (
    echo Installing package dependencies via npm install...
    call npm install
) else (
    echo node_modules folder detected. Refreshing dependencies...
    call npm install --no-audit
)

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to complete npm install!
    echo Please check your network connection and retry.
    echo.
    pause
    exit /b 1
)

echo [OK] Dependencies ready.
echo.

:: Step 3: Launch Web App & Server
echo [3/3] Starting MagxxxVot PRO server...
echo Server running at http://localhost:3000
echo.

start "" "http://localhost:3000"
call npm start

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Server terminated unexpectedly.
    pause
)
