@echo off
REM #Note: WEB2.0 — chay Camera Bridge + tunnel tren may dong goi (Windows).
REM Chay 2 thu: (1) camera-bridge.js (node) nghe 127.0.0.1:8141, (2) camera-tunnel.ps1
REM (cloudflared, tuy chon — chi can neu may KHAC muon dung camera nay).
REM
REM TRUOC KHI CHAY: mo camera.config.json dien ip/user/pass camera KBVision.
REM   (copy camera.config.example.json -> camera.config.json roi sua)
REM Va BAT 'CGI Service' trong camera: Setting > Safety > System Service > tick CGI.

setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua cai Node.js. Tai tai https://nodejs.org roi chay lai.
  pause
  exit /b 1
)

echo Dang khoi dong Camera Bridge (127.0.0.1:8141)...
start "N2Store Camera Bridge" cmd /k node camera-bridge.js

REM Tunnel (tuy chon) — chi mo neu co cloudflared.exe canh file nay.
if exist "%~dp0cloudflared.exe" (
  echo Dang khoi dong tunnel cloudflared (cho may khac dung chung)...
  start "N2Store Camera Tunnel" powershell -ExecutionPolicy Bypass -File camera-tunnel.ps1
) else (
  echo [Chu y] Khong thay cloudflared.exe -^> chi chup anh tren CHINH may nay ^(localhost^).
  echo         Muon may khac dung chung: tai cloudflared.exe de canh file nay roi chay lai.
)

echo.
echo Xong. Giu cac cua so vua mo. Dong cua so bridge = tat chup anh.
endlocal
