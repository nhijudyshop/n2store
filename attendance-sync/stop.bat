@echo off
taskkill /f /fi "WINDOWTITLE eq node*" >nul 2>&1
for /f "skip=1 tokens=2" %%p in ('wmic process where "commandline like ''%%index.js%%'' " get processid 2^>nul') do (
    taskkill /f /pid %%p >nul 2>&1
)
echo Stopped.
pause
