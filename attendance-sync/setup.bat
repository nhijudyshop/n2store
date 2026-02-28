@echo off
echo ========================================
echo   CAI DAT ATTENDANCE SYNC SERVICE
echo ========================================
echo.

REM Kiem tra Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [LOI] Chua cai Node.js
    echo Tai tai: https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%a in ('node -v') do set NODE_VER=%%a
echo Node.js: %NODE_VER%
echo.

REM Kiem tra serviceAccountKey.json
if not exist "serviceAccountKey.json" (
    echo [LOI] Thieu file serviceAccountKey.json
    echo.
    echo Huong dan:
    echo   1. Vao Firebase Console -^> Project Settings
    echo   2. Tab Service accounts -^> Generate new private key
    echo   3. Luu file vao thu muc nay voi ten serviceAccountKey.json
    echo.
    pause
    exit /b 1
)
echo serviceAccountKey.json: OK
echo.

REM Cai dat npm packages
echo Dang cai dat thu vien...
call npm install
if errorlevel 1 (
    echo [LOI] npm install that bai
    pause
    exit /b 1
)
echo Thu vien: OK
echo.

REM Test ket noi
echo Dang test ket noi may cham cong...
echo (Neu treo qua 15 giay, nhan Ctrl+C)
echo.
node test-connection.js
echo.

REM Hoi cai autostart
echo ========================================
set /p AUTOSTART="Ban muon tu dong chay khi bat may? (y/n): "
if /i "%AUTOSTART%"=="y" (
    echo Dang cai autostart...
    copy /y start-hidden.vbs "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\attendance-sync.vbs" >nul
    if errorlevel 1 (
        echo [LOI] Khong the cai autostart
    ) else (
        echo Autostart: OK
    )
)

echo.
echo ========================================
echo   CAI DAT HOAN TAT!
echo.
echo   Chay service:   start-hidden.vbs
echo   Dung service:   stop.bat
echo   Chan doan:      node diagnose.js
echo   Test ket noi:   node test-connection.js
echo ========================================
pause
