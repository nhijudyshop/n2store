@echo off
REM #Note: WEB2.0+1.0 - TAT cham cong tu dong: go khoi Windows startup + dung tien trinh.
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

echo Dang go khoi Windows startup...
del "%STARTUP_DIR%\attendance-sync.vbs" >nul 2>&1
del "%STARTUP_DIR%\adms-proxy.vbs" >nul 2>&1

echo Dang dung tien trinh dang chay...
for /f "tokens=2" %%a in ('wmic process where "commandline like '%%index.js%%'" get processid 2^>nul ^| findstr /r "[0-9]"') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=2" %%a in ('wmic process where "commandline like '%%adms-proxy%%'" get processid 2^>nul ^| findstr /r "[0-9]"') do taskkill /f /pid %%a >nul 2>&1

echo.
echo [OK] Da tat cham cong tu dong. Lan bat may sau se KHONG tu chay nua.
echo      Muon bat lai: chay cai-dat-tu-dong.bat
echo.
pause
