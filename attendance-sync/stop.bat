@echo off
for /f "tokens=2 delims=," %%a in ('tasklist /fi "imagename eq node.exe" /fo csv /nh') do (
    wmic process where "ProcessId=%%~a" get commandline 2^>nul | findstr /i "index.js" >nul 2>&1
    if not errorlevel 1 taskkill /f /pid %%~a >nul 2>&1
)
echo Stopped.
pause
