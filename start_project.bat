@echo off
echo Starting Enterprise HRMS Project...

:: Get the directory of the batch file
set "PROJECT_DIR=%~dp0"

echo Starting Backend Server...
start "HRMS Backend" /D "%PROJECT_DIR%backend" cmd /k "node server.js"

echo Starting Frontend Server...
start "HRMS Frontend" /D "%PROJECT_DIR%" cmd /k "npm run dev"

echo Done. Both servers should be opening in new terminal windows.

