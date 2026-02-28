@echo off
echo ========================================
echo   Cai dat tu dong chay khi bat may
echo ========================================
echo.

:: Lay duong dan hien tai
set "SCRIPT_DIR=%~dp0"

:: Tao shortcut trong Startup folder
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT=%STARTUP%\N2Store-Attendance-Sync.lnk"

:: Dung PowerShell tao shortcut
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%SCRIPT_DIR%start-hidden.vbs'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Description = 'N2Store Attendance Sync Service'; $s.Save()"

if exist "%SHORTCUT%" (
    echo.
    echo [OK] Da cai dat thanh cong!
    echo.
    echo Service se tu dong chay an moi lan bat may.
    echo Shortcut: %SHORTCUT%
    echo.
    echo Lenh huu ich:
    echo   - Chay ngay:  double-click start-hidden.vbs
    echo   - Dung:       double-click stop.bat
    echo   - Go bo:      double-click uninstall-autostart.bat
) else (
    echo.
    echo [LOI] Khong tao duoc shortcut!
    echo Thu chay bang tay: copy shortcut start-hidden.vbs vao:
    echo   %STARTUP%
)

echo.
pause
