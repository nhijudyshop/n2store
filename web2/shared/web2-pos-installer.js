// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — kho đa dụng.
/**
 * Web2PosInstaller — NGUỒN DÙNG CHUNG cho "Tải file cài đặt máy POS" (.bat).
 *
 * 1 bat `cai-may-pos.bat` = MENU bấm số: [1] Print Bridge (in máy IP), [2] Giọng VieNeu,
 * [3] Giọng OmniVoice (đa ngôn ngữ + Voice Design), [0] cài hết. Chạy nền ẩn + AUTO-START
 * mỗi khi mở máy + tự xoá auto/instance CŨ (chống trùng). Mỗi giọng 1 port riêng (8123/8124).
 * Trang nào cần (printer-settings, video-maker, …) chỉ load script này rồi gọi:
 *
 *   Web2PosInstaller.downloadInstaller()      // tải cai-may-pos.bat (menu)
 *   Web2PosInstaller.downloadUninstaller()    // tải go-may-pos.bat (gỡ cả 3)
 *   Web2PosInstaller.renderButtons(target, { showUninstall, installLabel, onInstall })
 *   Web2PosInstaller.batContent() / .uninstallBatContent()   // chuỗi bat thô
 *
 * URL tải file tính từ SITE-ROOT (trước "/web2/") → chạy đúng từ mọi trang web2,
 * mọi domain (nhijudy.store hoặc nhijudyshop.github.io/n2store).
 */
(function (global) {
    'use strict';

    // root site = phần path trước "/web2/" (vd https://nhijudy.store hoặc .../n2store)
    function siteRoot() {
        const m = (location.pathname || '').match(/^(.*?)\/web2\//);
        return location.origin + (m ? m[1] : '');
    }

    function _download(filename, content) {
        const blob = new Blob([content], { type: 'application/octet-stream' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            URL.revokeObjectURL(a.href);
            a.remove();
        }, 200);
    }

    // bat MENU: bấm số chọn Print Bridge / VieNeu / OmniVoice / cài hết.
    // Mỗi engine giọng cài qua vieneu-windows-setup.ps1 -Engine <vieneu|omnivoice>.
    function batContent() {
        const root = siteRoot();
        const pbUrl = root + '/scripts/print-bridge.ps1';
        const ptUrl = root + '/scripts/print-tunnel.ps1';
        const cfUrl =
            'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
        const vBase = root + '/vieneu-tts';
        const vPs1 = vBase + '/vieneu-windows-setup.ps1';
        const gBase = root + '/gemini-tryon';
        const gPs1 = gBase + '/gemini-tryon-windows-setup.ps1';
        return [
            '@echo off',
            'chcp 65001 >nul',
            'setlocal',
            'title N2Store POS - Cai dat',
            'set "DIR=%LOCALAPPDATA%\\N2StorePrintBridge"',
            'set "STARTUP=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"',
            'set "PBURL=' + pbUrl + '"',
            'set "PTURL=' + ptUrl + '"',
            'set "CFURL=' + cfUrl + '"',
            'set "VPS1=' + vPs1 + '"',
            'set "VBASE=' + vBase + '"',
            'set "GPS1=' + gPs1 + '"',
            'set "GBASE=' + gBase + '"',
            ':MENU',
            'cls',
            'echo =========================================================',
            'echo   N2Store POS - Cai dat (bam so roi Enter)',
            'echo =========================================================',
            'echo.',
            'echo   [1] May in (Print Bridge + tunnel) - in bill may IP; DT/PC khac in qua tunnel',
            'echo   [2] Giong VieNeu            - tieng Viet, clone 3-5s (~595MB)',
            'echo   [3] Giong OmniVoice         - 600+ ngon ngu, clone + Voice Design (~vai GB)',
            'echo   [4] Gemini Ghep do/Ghep mat - tao anh FREE bang acc Google (xoay tua nhieu acc)',
            'echo   [0] Cai HET (ca 4)',
            'echo   [Q] Thoat',
            'echo.',
            'set "CHOICE="',
            'set /p "CHOICE=Bam so roi Enter: "',
            'if "%CHOICE%"=="1" goto DO_PRINTER',
            'if "%CHOICE%"=="2" goto DO_VIENEU',
            'if "%CHOICE%"=="3" goto DO_OMNI',
            'if "%CHOICE%"=="4" goto DO_GEMINI',
            'if "%CHOICE%"=="0" goto DO_ALL',
            'if /i "%CHOICE%"=="Q" exit /b',
            'echo [!] Lua chon khong hop le.',
            'timeout /t 2 >nul',
            'goto MENU',
            ':DO_PRINTER',
            'call :PRINTER',
            'goto FIN',
            ':DO_VIENEU',
            'call :VIENEU',
            'goto FIN',
            ':DO_OMNI',
            'call :OMNIVOICE',
            'goto FIN',
            ':DO_GEMINI',
            'call :GEMINI',
            'goto FIN',
            ':DO_ALL',
            'call :PRINTER',
            'call :VIENEU',
            'call :OMNIVOICE',
            'call :GEMINI',
            'goto FIN',
            ':FIN',
            'echo.',
            'echo [HOAN TAT] Thanh phan da chon dang chay nen + TU BAT khi mo may.',
            'echo Vao trang Tao video / Cai dat may in se tu hien.',
            'echo.',
            'pause',
            'exit /b',
            ':PRINTER',
            'echo.',
            'echo [May in] Cai Print Bridge...',
            'if not exist "%DIR%" mkdir "%DIR%"',
            'del /f /q "%STARTUP%\\N2StorePrintBridge.vbs" 2>nul',
            "powershell -NoProfile -Command \"try{ Invoke-WebRequest -Uri '%PBURL%' -OutFile '%DIR%\\print-bridge.ps1' -UseBasicParsing; exit 0 }catch{ exit 1 }\"",
            'if not exist "%DIR%\\print-bridge.ps1" ( echo   [LOI] Khong tai duoc Print Bridge & exit /b 1 )',
            '> "%DIR%\\run-hidden.vbs" echo CreateObject("WScript.Shell").Run "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""%DIR%\\print-bridge.ps1""", 0, False',
            'copy /Y "%DIR%\\run-hidden.vbs" "%STARTUP%\\N2StorePrintBridge.vbs" >nul',
            'wscript "%DIR%\\run-hidden.vbs"',
            'echo   [OK] May in chay nen (http://127.0.0.1:17777)',
            'echo [May in] Cai tunnel (DT/PC khac in qua) ...',
            // tat tunnel CU truoc khi chay lai (tranh 2 cloudflared = 2 URL).
            "powershell -NoProfile -Command \"Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*print-tunnel.ps1*' -or ($_.Name -eq 'cloudflared.exe' -and $_.CommandLine -like '*17777*') } | ForEach-Object { try{ Stop-Process -Id $_.ProcessId -Force }catch{} }\" 2>nul",
            'del /f /q "%STARTUP%\\N2StorePrintTunnel.vbs" 2>nul',
            "powershell -NoProfile -Command \"try{ Invoke-WebRequest -Uri '%PTURL%' -OutFile '%DIR%\\print-tunnel.ps1' -UseBasicParsing; exit 0 }catch{ exit 1 }\"",
            // cloudflared ~30MB: chi tai khi thieu (idempotent, lan sau khoi tai lai).
            'if not exist "%DIR%\\cloudflared.exe" ( echo   Tai cloudflared (~30MB, lan dau)... & powershell -NoProfile -Command "try{ Invoke-WebRequest -Uri \'%CFURL%\' -OutFile \'%DIR%\\cloudflared.exe\' -UseBasicParsing; exit 0 }catch{ exit 1 }" )',
            'if not exist "%DIR%\\print-tunnel.ps1" ( echo   [BO QUA] Khong tai duoc tunnel - van in duoc tren may nay & exit /b 0 )',
            'if not exist "%DIR%\\cloudflared.exe" ( echo   [BO QUA] Khong tai duoc cloudflared - van in duoc tren may nay & exit /b 0 )',
            '> "%DIR%\\run-tunnel-hidden.vbs" echo CreateObject("WScript.Shell").Run "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""%DIR%\\print-tunnel.ps1""", 0, False',
            'copy /Y "%DIR%\\run-tunnel-hidden.vbs" "%STARTUP%\\N2StorePrintTunnel.vbs" >nul',
            'wscript "%DIR%\\run-tunnel-hidden.vbs"',
            'echo   [OK] Tunnel chay nen - DT/PC khac in duoc ma KHONG can chay Print Bridge.',
            'exit /b 0',
            ':VIENEU',
            'echo.',
            'echo [VieNeu] Cai giong VieNeu (lan dau ~595MB, vai phut)...',
            'if not exist "%DIR%" mkdir "%DIR%"',
            'del /f /q "%STARTUP%\\N2StoreVieNeu.vbs" 2>nul',
            'schtasks /delete /tn "VieNeu-TTS" /f >nul 2>nul',
            "powershell -NoProfile -Command \"try{ Invoke-WebRequest -Uri '%VPS1%' -OutFile '%DIR%\\engine-setup.ps1' -UseBasicParsing; exit 0 }catch{ exit 1 }\"",
            'if not exist "%DIR%\\engine-setup.ps1" ( echo   [BO QUA] Khong tai duoc setup & exit /b 1 )',
            'powershell -NoProfile -ExecutionPolicy Bypass -File "%DIR%\\engine-setup.ps1" -VBase "%VBASE%" -Engine vieneu',
            'exit /b 0',
            ':OMNIVOICE',
            'echo.',
            'echo [OmniVoice] Cai giong OmniVoice (lan dau ~vai GB, cho lau)...',
            'if not exist "%DIR%" mkdir "%DIR%"',
            'del /f /q "%STARTUP%\\N2StoreOmniVoice.vbs" 2>nul',
            "powershell -NoProfile -Command \"try{ Invoke-WebRequest -Uri '%VPS1%' -OutFile '%DIR%\\engine-setup.ps1' -UseBasicParsing; exit 0 }catch{ exit 1 }\"",
            'if not exist "%DIR%\\engine-setup.ps1" ( echo   [BO QUA] Khong tai duoc setup & exit /b 1 )',
            'powershell -NoProfile -ExecutionPolicy Bypass -File "%DIR%\\engine-setup.ps1" -VBase "%VBASE%" -Engine omnivoice',
            'exit /b 0',
            ':GEMINI',
            'echo.',
            'echo [Gemini] Cai sidecar tao anh Gemini (lan dau ~1-2 phut)...',
            'if not exist "%DIR%" mkdir "%DIR%"',
            'del /f /q "%STARTUP%\\N2StoreGeminiTryon.vbs" 2>nul',
            "powershell -NoProfile -Command \"try{ Invoke-WebRequest -Uri '%GPS1%' -OutFile '%DIR%\\gemini-setup.ps1' -UseBasicParsing; exit 0 }catch{ exit 1 }\"",
            'if not exist "%DIR%\\gemini-setup.ps1" ( echo   [BO QUA] Khong tai duoc setup & exit /b 1 )',
            'powershell -NoProfile -ExecutionPolicy Bypass -File "%DIR%\\gemini-setup.ps1" -VBase "%GBASE%"',
            'echo.',
            'echo   ==== DEBUG Gemini ====',
            'echo   - Ket qua server (LEN / KHONG LEN) + log loi hien o phia tren.',
            'echo   - Log day du: %LOCALAPPDATA%\\N2StoreGeminiTryon\\gemini-tryon.log',
            'echo   - Cau hinh cookie + Chan doan: http://localhost:8131/',
            'exit /b 0',
        ].join('\r\n');
    }

    function uninstallBatContent() {
        return [
            '@echo off',
            'chcp 65001 >nul',
            'set "DIR=%LOCALAPPDATA%\\N2StorePrintBridge"',
            'set "VDIR=%LOCALAPPDATA%\\N2StoreVieNeu"',
            'set "ODIR=%LOCALAPPDATA%\\N2StoreOmniVoice"',
            'set "GDIR=%LOCALAPPDATA%\\N2StoreGeminiTryon"',
            'set "STARTUP=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"',
            'echo Dang tat va go N2Store POS (Print Bridge + VieNeu + OmniVoice + Gemini) ...',
            'del /f /q "%STARTUP%\\N2StorePrintBridge.vbs" 2>nul',
            'del /f /q "%STARTUP%\\N2StorePrintTunnel.vbs" 2>nul',
            'del /f /q "%STARTUP%\\N2StoreVieNeu.vbs" 2>nul',
            'del /f /q "%STARTUP%\\N2StoreOmniVoice.vbs" 2>nul',
            'del /f /q "%STARTUP%\\N2StoreGeminiTryon.vbs" 2>nul',
            'schtasks /delete /tn "VieNeu-TTS" /f >nul 2>nul',
            "powershell -NoProfile -Command \"Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*print-bridge.ps1*' -or $_.CommandLine -like '*print-tunnel.ps1*' -or ($_.Name -eq 'cloudflared.exe' -and $_.CommandLine -like '*17777*') -or $_.CommandLine -like '*serve.py*' -or $_.CommandLine -like '*N2Store*' } | ForEach-Object { try{ Stop-Process -Id $_.ProcessId -Force }catch{} }\" 2>nul",
            'rmdir /s /q "%DIR%" 2>nul',
            'rmdir /s /q "%VDIR%" 2>nul',
            'rmdir /s /q "%ODIR%" 2>nul',
            'rmdir /s /q "%GDIR%" 2>nul',
            'echo.',
            'echo  [OK] Da tat + go het (Print Bridge + VieNeu + OmniVoice + Gemini). Khong con tu bat khi mo may.',
            'echo.',
            'pause',
        ].join('\r\n');
    }

    function downloadInstaller() {
        _download('cai-may-pos.bat', batContent());
        return true;
    }
    function downloadUninstaller() {
        _download('go-may-pos.bat', uninstallBatContent());
        return true;
    }

    let _styled = false;
    function _ensureStyle() {
        if (_styled) return;
        _styled = true;
        const s = document.createElement('style');
        s.textContent =
            '.w2pos-btns{display:flex;flex-wrap:wrap;gap:8px}' +
            '.w2pos-btn{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 13px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid transparent}' +
            '.w2pos-btn i{width:15px;height:15px}' +
            '.w2pos-primary{background:var(--web2-primary,#0068ff);color:#fff}' +
            '.w2pos-danger{background:#fff;color:#dc2626;border-color:#fecaca}';
        document.head.appendChild(s);
    }

    // Render sẵn cụm nút vào target (selector hoặc element).
    function renderButtons(target, opts) {
        opts = opts || {};
        const el = typeof target === 'string' ? document.querySelector(target) : target;
        if (!el) return;
        _ensureStyle();
        el.classList.add('w2pos-btns');
        el.innerHTML =
            '<button type="button" class="w2pos-btn w2pos-primary" data-w2pos="install"><i data-lucide="download"></i> ' +
            (opts.installLabel || 'Tải bộ cài máy POS (.bat)') +
            '</button>' +
            (opts.showUninstall
                ? '<button type="button" class="w2pos-btn w2pos-danger" data-w2pos="uninstall"><i data-lucide="power-off"></i> Gỡ</button>'
                : '');
        el.querySelector('[data-w2pos="install"]')?.addEventListener('click', () => {
            downloadInstaller();
            if (global.notificationManager?.show)
                global.notificationManager.show(
                    'Đã tải bộ cài — bấm đúp để chạy trên máy POS (menu bấm số)',
                    'success'
                );
            opts.onInstall && opts.onInstall();
        });
        el.querySelector('[data-w2pos="uninstall"]')?.addEventListener(
            'click',
            downloadUninstaller
        );
        if (global.lucide) global.lucide.createIcons();
    }

    global.Web2PosInstaller = {
        siteRoot,
        batContent,
        uninstallBatContent,
        downloadInstaller,
        downloadUninstaller,
        renderButtons,
    };
})(window);
