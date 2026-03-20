@echo off
chcp 65001 >nul 2>&1
title N2Store Pancake Extension - Cai Dat
cls

echo ==========================================
echo   N2Store Pancake Extension - Cai Dat
echo ==========================================
echo.

:: Detect script location
set "SCRIPT_DIR=%~dp0"
set "EXT_SOURCE=%SCRIPT_DIR%.."

:: Verify extension files exist
if exist "%EXT_SOURCE%\manifest.json" goto :found
set "EXT_SOURCE=%SCRIPT_DIR%"
if exist "%EXT_SOURCE%\manifest.json" goto :found
echo LOI: Khong tim thay file manifest.json
echo Dam bao file install-windows.bat nam trong folder pancake-extension\
echo.
pause
exit /b 1

:found
:: Install location
set "INSTALL_DIR=%LOCALAPPDATA%\N2Store\pancake-extension"

echo 1. Dang copy extension vao: %INSTALL_DIR%
echo.

:: Create install directory
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: Copy all extension files
xcopy "%EXT_SOURCE%\_locales" "%INSTALL_DIR%\_locales\" /E /I /Y /Q >nul 2>&1
xcopy "%EXT_SOURCE%\images" "%INSTALL_DIR%\images\" /E /I /Y /Q >nul 2>&1
xcopy "%EXT_SOURCE%\scripts" "%INSTALL_DIR%\scripts\" /E /I /Y /Q >nul 2>&1
copy /Y "%EXT_SOURCE%\manifest.json" "%INSTALL_DIR%\" >nul
copy /Y "%EXT_SOURCE%\offscreen.html" "%INSTALL_DIR%\" >nul 2>&1
copy /Y "%EXT_SOURCE%\pancext.html" "%INSTALL_DIR%\" >nul 2>&1
copy /Y "%EXT_SOURCE%\sandbox.html" "%INSTALL_DIR%\" >nul 2>&1

echo    Da copy xong!
echo.

:: Verify
if not exist "%INSTALL_DIR%\manifest.json" (
    echo LOI: Copy that bai!
    pause
    exit /b 1
)

:: Create Desktop shortcut (batch file as launcher)
set "LAUNCHER=%USERPROFILE%\Desktop\N2Store Chrome.bat"
(
echo @echo off
echo start "" "chrome.exe" --load-extension="%INSTALL_DIR%"
) > "%LAUNCHER%"

echo 2. Da tao shortcut: Desktop\N2Store Chrome.bat
echo.

:: Check Chrome paths
set "CHROME_PATH="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME_PATH=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

echo ==========================================
echo   HUONG DAN:
echo ==========================================
echo.
echo   CACH 1 (De nhat - 30 giay):
echo   1. Mo Chrome, go vao thanh dia chi: chrome://extensions
echo   2. Bat "Developer mode" (goc phai tren)
echo   3. Nhan "Load unpacked"
echo   4. Chon folder: %INSTALL_DIR%
echo   5. Xong! Refresh trang inbox.
echo.
echo   CACH 2 (Tu dong - can tat Chrome truoc):
echo   1. Tat hoan toan Chrome
echo   2. Double-click "N2Store Chrome" tren Desktop
echo.
echo ==========================================
echo   CAI DAT HOAN TAT!
echo ==========================================
echo.
echo   Extension da luu tai: %INSTALL_DIR%
echo   Shortcut tren Desktop: N2Store Chrome.bat
echo.

:: Ask to open chrome://extensions
set /p choice="Mo chrome://extensions ngay bay gio? (y/n): "
if /i "%choice%"=="y" (
    if not "%CHROME_PATH%"=="" (
        start "" "%CHROME_PATH%" "chrome://extensions"
    ) else (
        start chrome://extensions
    )
)

echo.
pause
