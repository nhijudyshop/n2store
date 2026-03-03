@echo off
echo.
echo  ATTENDANCE SYNC - SETUP
echo  ========================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found
    pause
    exit /b 1
)
for /f "tokens=*" %%a in ('node -v') do set NV=%%a
echo Node.js: %NV%

if not exist "serviceAccountKey.json" (
    echo [ERROR] Missing serviceAccountKey.json
    pause
    exit /b 1
)
echo Firebase key: OK

echo.
echo Installing...
call npm install --production
if errorlevel 1 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
)
echo Install: OK

echo.
echo Testing device (TCP then UDP)...
node test.js
echo.

set /p A="Auto-start on boot? (y/n): "
if /i "%A%"=="y" (
    copy /y start.vbs "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\attendance-sync.vbs" >nul 2>&1
    if not errorlevel 1 echo Autostart: OK
)

echo.
echo  DONE
echo  ========================
pause
