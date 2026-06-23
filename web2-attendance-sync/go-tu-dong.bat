@echo off
REM #Note: WEB2.0 - TAT dong bo cham cong tu dong (go khoi Windows startup + dung tien trinh).
cd /d "%~dp0"
set "TN=N2Store ChamCong DG600"

echo Dang go khoi Windows startup...
schtasks /Delete /F /TN "%TN%" >nul 2>&1

echo Dang dung tien trinh dong bo dang chay (node sync.js)...
REM Chi dung dung node dang chay sync.js (KHONG dung node khac).
wmic process where "name='node.exe' and CommandLine like '%%sync.js%%'" call terminate >nul 2>&1

echo.
echo [OK] Da TAT tu dong + dung dong bo. Lan bat may sau se KHONG tu dong nua.
echo      Muon bat lai: chay cai-tu-dong.bat
echo.
pause
