@echo off
echo.
echo  ATTENDANCE SYNC - SETUP
echo  ========================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not installed
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%a in ('node -v') do set NV=%%a
echo Node.js: %NV%

if not exist "serviceAccountKey.json" (
    echo [ERROR] Missing serviceAccountKey.json
    echo Get it from Firebase Console ^> Project Settings ^> Service Accounts
    pause
    exit /b 1
)
echo Firebase key: OK

echo.
echo Installing packages...
call npm install --production
if errorlevel 1 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
)
echo Packages: OK

echo.
echo Testing device connection...
node test.js
echo.

set /p A="Auto-start on boot? (y/n): "
if /i "%A%"=="y" (
    copy /y start.vbs "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\attendance-sync.vbs" >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Cannot install autostart
    ) else (
        echo Autostart: OK
    )
)

echo.
echo  SETUP COMPLETE
echo  ========================
echo  Start:    start.vbs
echo  Stop:     stop.bat
echo  Test:     node test.js
echo  Diagnose: node diagnose.js
echo  Logs:     logs\
echo.
pause
