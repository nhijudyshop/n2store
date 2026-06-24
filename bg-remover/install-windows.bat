@echo off
REM #Note: WEB2.0 - Windows: NHAP DUP file nay -> cai + chay server TACH NEN + tunnel cho dien thoai.
chcp 65001 >nul
title Server tach nen (may shop)
cd /d "%~dp0"

call :ENSURE_PY
if errorlevel 1 goto PAUSE
call :SETUP
if errorlevel 1 goto PAUSE
call :ENSURE_CLOUDFLARED
echo.
echo [*] Khoi dong server tach nen... lan dau tai model ~170MB, vui long cho.
".venv\Scripts\python.exe" serve.py
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

:SETUP
if not exist ".venv\Scripts\python.exe" (
  echo [*] Tao moi truong...
  %PY% -m venv .venv
)
".venv\Scripts\python.exe" -m pip install -q --upgrade pip
".venv\Scripts\python.exe" -c "import rembg,fastapi,uvicorn" 2>nul
if errorlevel 1 (
  echo [*] Cai thu vien lan dau ~2-3 phut...
  ".venv\Scripts\python.exe" -m pip install -q -r requirements.txt
)
exit /b 0

:ENSURE_CLOUDFLARED
if not exist "cloudflared.exe" (
  echo [*] Tai cloudflared...
  curl -L -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
)
exit /b 0

:PAUSE
echo.
pause
goto END

:END
echo.
echo Da dung. Nhan phim bat ky de dong.
pause >nul
