@echo off
REM #Note: WEB2.0 - CAI dong bo cham cong TU DONG: chay nen khi dang nhap Windows,
REM tu chay lai neu loi. Bam dup 1 LAN de cai. Tat: chay go-tu-dong.bat.
cd /d "%~dp0"
setlocal
set "TN=N2Store ChamCong DG600"

echo ============================================================
echo  CAI DONG BO CHAM CONG TU DONG (chay nen khi bat may)
echo ============================================================
echo.

REM [1] Config
if not exist config.json (
  copy config.example.json config.json >nul 2>&1
  echo === Chua co config.json - da tao tu mau. ===
  echo Mo file config.json, dan secret WEB2_ATTENDANCE_SECRET, roi CHAY LAI file nay.
  echo.
  pause
  exit /b 1
)

REM [2] Thu vien (lan dau)
if not exist node_modules\node-zklib (
  echo [1/3] Cai thu vien lan dau (can internet)...
  call npm install
  if errorlevel 1 (
    echo Loi npm. Kiem tra da cai Node.js chua: https://nodejs.org
    pause
    exit /b 1
  )
)

REM [3] Dang ky Task Scheduler chay khi dang nhap (an cua so qua run-hidden.vbs)
echo [2/3] Dang dang ky chay tu dong khi dang nhap Windows...
schtasks /Create /F /TN "%TN%" /SC ONLOGON /TR "wscript.exe \"%~dp0run-hidden.vbs\"" >nul
if errorlevel 1 (
  echo.
  echo [!] Khong tao duoc tac vu - thuong do thieu quyen Admin.
  echo     CHUOT PHAI file cai-tu-dong.bat -^> "Run as administrator" roi chay lai.
  echo.
  pause
  exit /b 1
)

REM [4] Chay ngay bay gio (khong can doi reboot)
echo [3/3] Dang khoi dong dong bo ngay bay gio (chay nen)...
wscript.exe "%~dp0run-hidden.vbs"

echo.
echo [OK] XONG. Tu gio CU BAT MAY LA TU DONG dong bo (5 phut/lan, chay nen,
echo      khong can mo cua so, khong can mo trang web).
echo.
echo  - Kiem tra: mo trang Cham cong sau 1-2 phut se thay "Dang dong bo".
echo  - Muon TAT tu dong: chay go-tu-dong.bat
echo.
pause
