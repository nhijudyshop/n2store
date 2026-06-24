@echo off
REM #Note: WEB2.0 - 1 NUT go bo agent cham cong DG-600 (dung + xoa autostart). Bam dup file nay.
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo.
echo ============================================================
echo   GO BO CHAM CONG DG-600 (dung tien trinh + xoa autostart)
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [LOI] Chua cai Node.js. Khong the go tu dong.
  echo.
  pause
  exit /b 1
)

node setup.js --uninstall
echo.
pause
