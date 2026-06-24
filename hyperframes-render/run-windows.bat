@echo off
REM #Note: WEB2.0 — khoi dong hyperframes-render tren Windows (double-click).
cd /d "%~dp0"
where node >nul 2>nul || (echo Can Node 22+ ^(winget install OpenJS.NodeJS^) & pause & exit /b 1)
where ffmpeg >nul 2>nul || echo [!] Thieu ffmpeg: winget install Gyan.FFmpeg
where cloudflared >nul 2>nul || echo [!] Thieu cloudflared: winget install cloudflare.cloudflared
if not exist node_modules npm install
node server.js
pause
