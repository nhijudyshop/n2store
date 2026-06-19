@echo off
REM #Note: WEB2.0 - Windows: NHAP DUP file nay de TU CAI + chay server giong VieNeu + tunnel cho dien thoai.
chcp 65001 >nul
title VieNeu - Server giong (may shop)
cd /d "%~dp0"
echo ===============================================
echo    VieNeu - Server giong (may shop, Windows)
echo ===============================================

REM --- 1) Python (cai qua winget neu thieu) ---
set "PY=python"
%PY% --version >nul 2>nul
if errorlevel 1 set "PY=py"
%PY% --version >nul 2>nul
if errorlevel 1 (
  echo [*] Chua co Python - dang cai Python 3.11 qua winget...
  winget install -e --id Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements
  echo [!] Da cai Python. Vui long DONG cua so nay va NHAP DUP lai file de tiep tuc.
  pause
  exit /b
)

REM --- 2) venv + thu vien ---
if not exist ".venv\Scripts\python.exe" (
  echo [*] Tao moi truong Python...
  %PY% -m venv .venv
)
set "VPY=.venv\Scripts\python.exe"
"%VPY%" -m pip install -q --upgrade pip
"%VPY%" -c "import vieneu,fastapi,uvicorn" 2>nul
if errorlevel 1 (
  echo [*] Cai thu vien lan dau ~2 phut...
  "%VPY%" -m pip install -q -r requirements.txt
)

REM --- 3) cloudflared.exe (cho dien thoai) ---
if not exist "cloudflared.exe" (
  echo [*] Tai cloudflared...
  curl -L -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
)

REM --- 4) chay (server + tunnel + tu bao danh) ---
echo [*] Khoi dong... lan dau tai model ~595MB, vui long cho.
"%VPY%" serve.py
echo.
echo Da dung. Nhan phim bat ky de dong.
pause >nul
