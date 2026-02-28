@echo off
echo ==============================================
echo   N2Store Attendance Sync - Setup
echo ==============================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo [1/5] Kiem tra Node.js...
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   LOI: Node.js chua cai. Tai tai nodejs.org
    pause
    exit /b 1
)
node --version
echo   OK
echo.

echo [2/5] Kiem tra Firebase key...
if not exist "serviceAccountKey.json" (
    echo   LOI: Thieu serviceAccountKey.json
    echo   Vao Firebase Console tai ve roi copy vao day
    pause
    exit /b 1
)
echo   OK
echo.

echo [3/5] Cai dat npm packages...
if not exist "node_modules" (
    call npm install
) else (
    echo   Da co, bo qua
)
echo   OK
echo.

echo [4/5] Cai autostart...
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUP%\N2Store-Attendance-Sync.lnk"
powershell -Command "$s=New-Object -COM WScript.Shell;$sc=$s.CreateShortcut('%LNK%');$sc.TargetPath='%SCRIPT_DIR%start-hidden.vbs';$sc.WorkingDirectory='%SCRIPT_DIR%';$sc.Save()" >nul 2>&1
if exist "%LNK%" (
    echo   OK
) else (
    echo   CANH BAO: Khong tao duoc autostart
)
echo.

echo [5/5] Khoi dong service...
if not exist "logs" mkdir logs
start "" wscript.exe "%SCRIPT_DIR%start-hidden.vbs"
echo   OK
echo.

echo ==============================================
echo   HOAN TAT
echo   Service dang chay an.
echo   Tu dong chay moi lan bat may.
echo ==============================================
echo.
pause
