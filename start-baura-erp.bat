@echo off
cd /d "%~dp0"

echo ========================================
echo Starting Baura Bakery ERP
echo ========================================

echo.
echo Starting Backend and Frontend...
start "Baura Bakery ERP" cmd /k "npm run start:local"

echo.
echo Opening browser...
timeout /t 4 /nobreak >nul
start http://localhost:5173

echo.
echo Done.
pause