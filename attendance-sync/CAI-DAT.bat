@echo off
REM #Note: WEB2.0 - 1 NUT cai dat agent cham cong DG-600 (ADMS proxy). Bam dup file nay.
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo.
echo ============================================================
echo   CAI DAT CHAM CONG DG-600 (Web 2.0) - tu go ban cu + tu cai
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [LOI] Chua cai Node.js. Tai tai https://nodejs.org roi chay lai file nay.
  echo.
  pause
  exit /b 1
)

node setup.js
set "RC=%ERRORLEVEL%"

echo.
if not "%RC%"=="0" (
  echo [!] Co loi o tren (ma loi %RC%). Doc cac dong [LOI] de biet nguyen nhan.
) else (
  echo [OK] Hoan tat. Co the dong cua so nay.
)
echo.
pause
