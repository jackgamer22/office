@echo off
TITLE MagxxxVot PRO - Lead ^& Email Extractor Setup
COLOR 0A

echo =======================================================
echo          MagxxxVot PRO - Lead ^& Email Extractor
echo =======================================================
echo.

:: Step 1: Check Node.js Installation
echo [1/3] Checking Node.js installation...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not added to PATH!
    echo Please download and install Node.js (v18+) from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

FOR /F "tokens=*" %%g IN ('node -v') DO (SET NODE_VER=%%g)
echo [OK] Node.js version detected: %NODE_VER%
echo.

:: Step 2: Install NPM Dependencies
echo [2/3] Installing dependencies (npm install)...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install npm dependencies!
    echo Please check your internet connection or npm permissions.
    echo.
    pause
    exit /b 1
)
echo [OK] Dependencies installed successfully.
echo.

:: Step 3: Launch Web Application ^& Open Browser
echo [3/3] Launching MagxxxVot PRO Server on http://localhost:3000 ...
echo.
start "" "http://localhost:3000"
call npm start

pause
