@echo off
REM WEB2.0 - LAY DU LIEU CHAM CONG 1 LAN (bam nut lay). Bam dup khi muon lay.
REM Phai cung mang LAN voi may cham cong. Tu do IP may.
cd /d "%~dp0"

if not exist config.json (
  copy config.example.json config.json >nul 2>&1
  echo Mo config.json dan secret WEB2_ATTENDANCE_SECRET roi chay lai.
  pause
  exit /b 1
)
if not exist node_modules\node-zklib (
  echo Cai thu vien lan dau...
  call npm install
)

echo Dang lay du lieu cham cong (1 lan)...
node sync.js --once
echo.
echo Xong. Mo trang Cham cong de xem.
pause
