@echo off
echo Starting Enterprise HRMS Project...

:: Get the directory of the batch file
set "PROJECT_DIR=%~dp0"

echo Starting Backend Server...
start "HRMS Backend" cmd /k "cd /d "%PROJECT_DIR%backend" && npm run dev"

echo Starting Frontend Server...
start "HRMS Frontend" cmd /k "cd /d "%PROJECT_DIR%" && npm run dev"

echo Done. Both servers should be opening in new terminal windows.
pause
