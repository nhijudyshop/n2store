@echo off
REM WEB2.0 - chay ADMS proxy cham cong (Windows). Bam dup de chay.
cd /d "%~dp0"
if not exist config.json (
  echo Chua co config.json - copy tu config.example.json roi sua secret + IP may.
  copy config.example.json config.json >nul 2>&1
  echo Da tao config.json mau. Mo sua roi chay lai.
  pause
  exit /b 1
)
echo Chay ADMS proxy cham cong... (dong cua so de dung)
node adms-proxy.js
pause
