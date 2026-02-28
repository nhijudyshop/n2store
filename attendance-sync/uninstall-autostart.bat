@echo off
echo Dang go bo tu dong chay...

set "SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\N2Store-Attendance-Sync.lnk"

if exist "%SHORTCUT%" (
    del "%SHORTCUT%"
    echo [OK] Da go bo. Service se khong tu dong chay khi bat may nua.
) else (
    echo Khong tim thay - chua cai dat hoac da go roi.
)

echo.
pause
