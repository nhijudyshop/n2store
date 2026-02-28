@echo off
echo Dang dung service...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq N2Store*" 2>nul
taskkill /F /IM wscript.exe /FI "WINDOWTITLE eq N2Store*" 2>nul
echo Done.
pause
