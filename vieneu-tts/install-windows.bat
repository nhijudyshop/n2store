@echo off
REM #Note: WEB2.0 - Windows: NHAP DUP file nay -> MENU chon engine giong (VieNeu / OmniVoice) de cai + chay + tunnel cho dien thoai.
chcp 65001 >nul
title Server giong (may shop) - VieNeu / OmniVoice
cd /d "%~dp0"

:MENU
cls
echo ===============================================
echo    Server giong (may shop, Windows)
echo ===============================================
echo.
echo   [1] VieNeu     - nhe ~595MB, tieng Viet, clone 3-5s
echo   [2] OmniVoice  - nang vai GB, 600+ ngon ngu, clone SOTA + Voice Design
echo   [0] Cai HET    - cai ca 2 engine (khong chay), roi chon cai de chay
echo   [Q] Thoat
echo.
set "CHOICE="
set /p "CHOICE=Bam so roi Enter: "
if "%CHOICE%"=="1" goto VIENEU
if "%CHOICE%"=="2" goto OMNIVOICE
if "%CHOICE%"=="0" goto ALL
if /i "%CHOICE%"=="Q" exit /b
echo.
echo [!] Lua chon khong hop le.
timeout /t 2 >nul
goto MENU

REM ============================ VieNeu ============================
:VIENEU
set "TTS_ENGINE=vieneu"
call :ENSURE_PY
if errorlevel 1 goto PAUSE_MENU
call :SETUP_VIENEU
if errorlevel 1 goto PAUSE_MENU
call :ENSURE_CLOUDFLARED
echo.
echo [*] Khoi dong VieNeu... lan dau tai model ~595MB, vui long cho.
".venv\Scripts\python.exe" serve.py
goto END

REM =========================== OmniVoice ==========================
:OMNIVOICE
set "TTS_ENGINE=omnivoice"
call :ENSURE_PY
if errorlevel 1 goto PAUSE_MENU
call :SETUP_OMNIVOICE
if errorlevel 1 goto PAUSE_MENU
call :ENSURE_CLOUDFLARED
echo.
echo [*] Khoi dong OmniVoice... lan dau tai model ~vai GB, vui long cho.
".venv-omnivoice\Scripts\python.exe" serve.py
goto END

REM ===================== Cai HET (ca 2 engine) ====================
:ALL
call :ENSURE_PY
if errorlevel 1 goto PAUSE_MENU
echo.
echo [*] Cai ca 2 engine (VieNeu + OmniVoice)...
call :SETUP_VIENEU
call :SETUP_OMNIVOICE
call :ENSURE_CLOUDFLARED
echo.
echo [OK] Da cai xong CA 2 engine. Chon engine de CHAY:
echo   [1] VieNeu   [2] OmniVoice   [Q] Thoat
set "C2="
set /p "C2=Bam so roi Enter: "
if "%C2%"=="1" goto VIENEU
if "%C2%"=="2" goto OMNIVOICE
goto END

REM ===================== subroutines =====================
:ENSURE_PY
set "PY=python"
%PY% --version >nul 2>nul
if errorlevel 1 set "PY=py"
%PY% --version >nul 2>nul
if errorlevel 1 (
  echo [*] Chua co Python - dang cai Python 3.11 qua winget...
  winget install -e --id Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements
  echo [!] Da cai Python. Vui long DONG cua so nay va NHAP DUP lai file de tiep tuc.
  pause
  exit /b 1
)
exit /b 0

:SETUP_VIENEU
if not exist ".venv\Scripts\python.exe" (
  echo [*] Tao moi truong VieNeu...
  %PY% -m venv .venv
)
".venv\Scripts\python.exe" -m pip install -q --upgrade pip
".venv\Scripts\python.exe" -c "import vieneu,fastapi,uvicorn" 2>nul
if errorlevel 1 (
  echo [*] Cai thu vien VieNeu lan dau ~2 phut...
  ".venv\Scripts\python.exe" -m pip install -q -r requirements.txt
)
exit /b 0

:SETUP_OMNIVOICE
if not exist ".venv-omnivoice\Scripts\python.exe" (
  echo [*] Tao moi truong OmniVoice...
  %PY% -m venv .venv-omnivoice
)
set "OPY=.venv-omnivoice\Scripts\python.exe"
"%OPY%" -m pip install -q --upgrade pip
"%OPY%" -c "import omnivoice,torch,fastapi,uvicorn" 2>nul
if errorlevel 1 (
  echo [*] Cai PyTorch + OmniVoice lan dau ~vai GB, cho lau...
  echo     [May NVIDIA muon dung GPU: xem requirements-omnivoice.txt de cai torch ban CUDA]
  "%OPY%" -m pip install torch torchaudio
  "%OPY%" -m pip install -r requirements-omnivoice.txt
)
exit /b 0

:ENSURE_CLOUDFLARED
if not exist "cloudflared.exe" (
  echo [*] Tai cloudflared...
  curl -L -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
)
exit /b 0

:PAUSE_MENU
echo.
pause
goto MENU

:END
echo.
echo Da dung. Nhan phim bat ky de dong.
pause >nul
