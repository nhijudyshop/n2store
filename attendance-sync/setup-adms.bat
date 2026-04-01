@echo off
echo.
echo  ADMS PROXY - SETUP
echo  ========================
echo.

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found! Install from https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%a in ('node -v') do set NV=%%a
echo Node.js: %NV%

:: Kill old attendance-sync and adms-proxy instances
echo.
echo Stopping old services...
taskkill /f /fi "WINDOWTITLE eq attendance-sync" >nul 2>&1
for /f "tokens=2" %%a in ('wmic process where "commandline like '%%index.js%%'" get processid 2^>nul ^| findstr /r "[0-9]"') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=2" %%a in ('wmic process where "commandline like '%%adms-proxy%%'" get processid 2^>nul ^| findstr /r "[0-9]"') do taskkill /f /pid %%a >nul 2>&1
echo Old services stopped.

:: Create startup VBS
set "SYNC_DIR=%~dp0"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "STARTUP_VBS=%STARTUP_DIR%\adms-proxy.vbs"

:: Remove old attendance-sync startup if exists
del "%STARTUP_DIR%\attendance-sync.vbs" >nul 2>&1

echo Creating startup script...
> "%STARTUP_VBS%" echo Set sh = CreateObject("WScript.Shell")
>>"%STARTUP_VBS%" echo sh.CurrentDirectory = "%SYNC_DIR:~0,-1%"
>>"%STARTUP_VBS%" echo sh.Run "cmd /c node adms-proxy.js >> logs\adms-proxy.log 2>&1", 0, False
echo Startup: OK (runs on boot)

:: Start NOW (hidden)
echo.
echo Starting ADMS proxy...
if not exist "logs" mkdir logs
start "" wscript.exe "%STARTUP_VBS%"
echo Service: RUNNING on port 8081

echo.
echo  ========================
echo  SETUP COMPLETE!
echo  - ADMS proxy running on port 8081
echo  - Machine pushes data to this PC
echo  - PC forwards to Render cloud
echo  - Auto-starts on Windows boot
echo  - Logs: %SYNC_DIR%logs\adms-proxy.log
echo  ========================
echo.
pause
