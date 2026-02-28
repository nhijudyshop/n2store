@echo off
echo Dang dung attendance-sync service...
taskkill /f /fi "WINDOWTITLE eq attendance-sync*" >nul 2>&1
wmic process where "commandline like '%sync-service.js%'" call terminate >nul 2>&1
for /f "tokens=2" %%a in ('tasklist /fi "IMAGENAME eq node.exe" /fo list ^| findstr "PID"') do (
    wmic process where "ProcessId=%%a" get commandline 2^>nul | findstr "sync-service" >nul 2>&1 && taskkill /f /pid %%a >nul 2>&1
)
echo Service da dung.
pause
