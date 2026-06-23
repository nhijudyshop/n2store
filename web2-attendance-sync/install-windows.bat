@echo off
REM WEB2.0 - Dong bo may cham cong DG-600 -> trang Cham cong (Windows).
REM Che do ZK pull (keo du lieu qua mang LAN cong 4370) - DA TEST CHAY DUOC.
REM Bam dup de chay. Giu cua so mo de no dong bo lien tuc (5 phut/lan).
cd /d "%~dp0"

if not exist config.json (
  echo [1/3] Chua co config.json - tao tu mau...
  copy config.example.json config.json >nul 2>&1
  echo.
  echo === MO file config.json sua 2 cho roi CHAY LAI file nay: ===
  echo   - attendanceSecret : dan secret WEB2_ATTENDANCE_SECRET
  echo   - device.ip        : IP may cham cong trong mang LAN (vd 192.168.1.201)
  echo.
  pause
  exit /b 1
)

if not exist node_modules\node-zklib (
  echo [2/3] Cai thu vien lan dau (can mang internet)...
  call npm install
  if errorlevel 1 (
    echo Loi cai npm. Kiem tra da cai Node.js chua: https://nodejs.org
    pause
    exit /b 1
  )
)

echo [3/3] Dang dong bo may cham cong DG-600 (keo du lieu cong 4370)...
echo Giu cua so nay MO. Dong bo moi 5 phut. Dong cua so = dung.
node sync.js
pause
