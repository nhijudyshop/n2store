@echo off
REM #Note: WEB2.0+1.0 - TURNKEY: cai dat collector cham cong CHAY TU DONG khi bat may,
REM day du lieu sang CA Web 1.0 (/api/attendance) VA Web 2.0 (/api/web2-attendance).
REM Bam dup 1 LAN. Tu nhan biet che do ZK pull / ADMS de KHONG tao collector thu 2.
setlocal enabledelayedexpansion
cd /d "%~dp0"
set "SYNC_DIR=%~dp0"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

echo ============================================================
echo   CAI DAT CHAM CONG TU DONG (Web 1.0 + Web 2.0 dual-push)
echo ============================================================
echo.

REM [1] Node.js
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Chua cai Node.js. Tai: https://nodejs.org roi chay lai.
  pause
  exit /b 1
)
for /f "tokens=*" %%a in ('node -v') do set NV=%%a
echo Node.js: %NV%
call npm install --production >nul 2>&1

REM [2] Secret Web 2.0 -> web2-config.json (de day sang trang Cham cong Web 2.0)
echo.
if exist web2-config.json (
  echo web2-config.json: DA CO (giu nguyen).
) else (
  echo Dan SECRET Web 2.0 ^(giong WEB2_ATTENDANCE_SECRET tren Render^).
  echo  - Neu dung che do ADMS thi co the bo trong ^(Enter^), ADMS khong can secret.
  set "SEC="
  set /p "SEC=Secret: "
  if not "!SEC!"=="" (
    > web2-config.json echo {
    >>web2-config.json echo   "attendanceSecret": "!SEC!",
    >>web2-config.json echo   "renderBase": "https://chatomni-proxy.nhijudyshop.workers.dev"
    >>web2-config.json echo }
    echo Da luu web2-config.json.
  ) else (
    echo Bo qua secret. ^(ZK pull se KHONG day Web2 neu thieu; ADMS van chay.^)
  )
)

REM [3] Tu nhan biet che do dang chay (giu nguyen de khong tao collector thu 2)
set "MODE=ZK"
if exist "%STARTUP_DIR%\adms-proxy.vbs" set "MODE=ADMS"
echo.
echo Che do: %MODE%   ^(ADMS neu da co adms-proxy.vbs; nguoc lai ZK pull^)

REM [4] Dung moi instance cu (ca 2 che do) de tranh tranh ket noi
echo Dang dung tien trinh cu...
for /f "tokens=2" %%a in ('wmic process where "commandline like '%%index.js%%'" get processid 2^>nul ^| findstr /r "[0-9]"') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=2" %%a in ('wmic process where "commandline like '%%adms-proxy%%'" get processid 2^>nul ^| findstr /r "[0-9]"') do taskkill /f /pid %%a >nul 2>&1

REM [5] Tao startup VBS (chay AN khi dang nhap Windows) cho dung che do
if not exist "logs" mkdir logs
if "%MODE%"=="ADMS" (
  set "STARTUP_VBS=%STARTUP_DIR%\adms-proxy.vbs"
  del "%STARTUP_DIR%\attendance-sync.vbs" >nul 2>&1
  > "!STARTUP_VBS!" echo Set sh = CreateObject("WScript.Shell")
  >>"!STARTUP_VBS!" echo sh.CurrentDirectory = "%SYNC_DIR:~0,-1%"
  >>"!STARTUP_VBS!" echo sh.Run "cmd /c node adms-proxy.js >> logs\adms-proxy.log 2>&1", 0, False
) else (
  set "STARTUP_VBS=%STARTUP_DIR%\attendance-sync.vbs"
  del "%STARTUP_DIR%\adms-proxy.vbs" >nul 2>&1
  > "!STARTUP_VBS!" echo Set sh = CreateObject("WScript.Shell")
  >>"!STARTUP_VBS!" echo sh.CurrentDirectory = "%SYNC_DIR:~0,-1%"
  >>"!STARTUP_VBS!" echo sh.Run "cmd /c node index.js >> logs\service.log 2>&1", 0, False
)
echo Startup: OK ^(tu chay khi bat may^)

REM [6] Chay ngay bay gio (AN cua so)
echo Dang khoi dong ngay...
start "" wscript.exe "!STARTUP_VBS!"

echo.
echo ============================================================
echo   XONG! Collector chay nen + tu bat khi mo may.
echo   - Day du lieu sang CA Web 1.0 va Web 2.0 (dual-push).
echo   - Che do: %MODE%   - Log: %SYNC_DIR%logs\
echo   - Kiem tra: mo trang Cham cong sau 1-2 phut -> "Dang dong bo".
echo   - Tat tu dong: chay go-tu-dong.bat
echo ============================================================
echo.
pause
