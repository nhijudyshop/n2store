@echo off
chcp 65001 >nul 2>&1
echo ══════════════════════════════════════════════
echo   N2Store Attendance Sync - Setup 1 lần
echo ══════════════════════════════════════════════
echo.

:: Lay duong dan hien tai
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: ── Buoc 1: Kiem tra Node.js ──
echo [1/5] Kiem tra Node.js...
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo.
    echo   [LOI] Node.js chua cai dat!
    echo   Tai tai: https://nodejs.org/en/download
    echo   Chon ban LTS ^(v20^)
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo   Node %NODE_VER% ✓

:: ── Buoc 2: Kiem tra serviceAccountKey.json ──
echo.
echo [2/5] Kiem tra Firebase key...
if not exist "%SCRIPT_DIR%serviceAccountKey.json" (
    echo.
    echo   [LOI] Thieu file serviceAccountKey.json!
    echo.
    echo   Cach tao:
    echo   1. Vao https://console.firebase.google.com
    echo   2. Chon project n2shop-69e37
    echo   3. Project Settings → Service accounts
    echo   4. Generate new private key → tai file JSON
    echo   5. Doi ten thanh serviceAccountKey.json
    echo   6. Copy vao thu muc: %SCRIPT_DIR%
    echo.
    echo   Sau do chay lai setup.bat
    pause
    exit /b 1
)
echo   serviceAccountKey.json ✓

:: ── Buoc 3: Cai dat npm packages ──
echo.
echo [3/5] Cai dat dependencies...
if exist node_modules (
    echo   node_modules da co, bo qua.
) else (
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo   [LOI] npm install that bai!
        pause
        exit /b 1
    )
)
echo   npm packages ✓

:: ── Buoc 4: Cai autostart ──
echo.
echo [4/5] Cai tu dong chay khi bat may...
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT=%STARTUP%\N2Store-Attendance-Sync.lnk"
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%SCRIPT_DIR%start-hidden.vbs'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Description = 'N2Store Attendance Sync'; $s.Save()" >nul 2>&1
if exist "%SHORTCUT%" (
    echo   Autostart ✓
) else (
    echo   [CANH BAO] Khong tao duoc autostart, ban co the chay start-hidden.vbs thu cong
)

:: ── Buoc 5: Tao thu muc logs ──
if not exist logs mkdir logs

:: ── Hoan tat ──
echo.
echo [5/5] Khoi dong service...
echo.
echo ══════════════════════════════════════════════
echo   SETUP HOAN TAT!
echo.
echo   • Service dang chay an
echo   • Tu dong chay moi lan bat may
echo   • Log: %SCRIPT_DIR%logs\
echo.
echo   Lenh:
echo     start-hidden.vbs    = Chay an
echo     stop.bat            = Dung
echo     node diagnose.js    = Chan doan
echo ══════════════════════════════════════════════
echo.

:: Chay service ngay
start "" wscript.exe "%SCRIPT_DIR%start-hidden.vbs"
echo Service da khoi dong!
echo.
pause
