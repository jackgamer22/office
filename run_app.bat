@echo off
REM Batch script to run the Email Verifier Application (Backend and Frontend)
REM This script is designed for a Windows environment with Python and Node.js/npm installed.

ECHO ============================================================
ECHO Starting Email Verifier Application
ECHO ============================================================

REM Get the directory of this .bat script
SET SCRIPT_DIR=%~dp0
ECHO Script directory: %SCRIPT_DIR%

REM --- Backend (Flask) ---
ECHO.
ECHO --- Starting Flask Backend Server ---
ECHO Make sure you have Python installed and the requirements from backend/requirements.txt
CD /D "%SCRIPT_DIR%backend"
IF ERRORLEVEL 1 (
    ECHO ERROR: Could not change directory to %SCRIPT_DIR%backend
    GOTO :EOF
)

ECHO Current directory: %CD%
ECHO Starting Flask server on port 5001...
ECHO You will need to open a new command prompt for the frontend, or run this in the background.
START "Flask Backend" cmd /c "python app.py"
REM An alternative if you want it in the same window and block:
REM python app.py
ECHO Flask backend server started (or attempted to start in a new window).
ECHO.

REM --- Frontend (React) ---
ECHO --- Managing React Frontend ---
CD /D "%SCRIPT_DIR%backend\frontend"
IF ERRORLEVEL 1 (
    ECHO ERROR: Could not change directory to %SCRIPT_DIR%backend\frontend
    GOTO :EOF
)

ECHO Current directory: %CD%

ECHO.
ECHO Step 1: Install frontend dependencies (if not already installed)
ECHO Running npm install...
npm install
IF ERRORLEVEL 1 (
    ECHO WARNING: npm install failed. Frontend might not work correctly.
) ELSE (
    ECHO npm install completed.
)

ECHO.
ECHO Step 2: Attempt to build the React application for production
ECHO NOTE: There were known issues getting this build to work in the development environment.
ECHO This step might fail.
ECHO Running npm run build...
npm run build
IF ERRORLEVEL 1 (
    ECHO WARNING: npm run build failed. Production build not created.
    ECHO See error messages above for details.
) ELSE (
    ECHO npm run build completed successfully. The built app is in the 'build' folder.
    ECHO (Flask is not currently configured to serve this build).
)

ECHO.
ECHO Step 3: Start the React Development Server (for testing/development)
ECHO This is an alternative way to view the frontend if the production build fails or is not served.
ECHO The React app will attempt to connect to the backend API (Flask).
ECHO Ensure the Flask backend is running.
ECHO Running npm start...
npm start

ECHO.
ECHO ============================================================
ECHO Script finished.
ECHO Backend should be running on http://localhost:5001
ECHO React Dev Server (if started) typically on http://localhost:3000
ECHO ============================================================

:EOF
PAUSE
