// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — kho đa dụng.
/**
 * Web2PosInstaller — NGUỒN DÙNG CHUNG cho "Tải file cài đặt máy POS" (.bat).
 *
 * 1 bat `cai-may-pos.bat` cài CẢ: Print Bridge (in máy IP) + Giọng VieNeu (clone giọng) —
 * chạy nền ẩn + AUTO-START mỗi khi mở máy + tự xoá auto/instance CŨ (chống trùng).
 * Trang nào cần (printer-settings, video-maker, …) chỉ load script này rồi gọi:
 *
 *   Web2PosInstaller.downloadInstaller()      // tải cai-may-pos.bat
 *   Web2PosInstaller.downloadUninstaller()    // tải go-may-pos.bat (gỡ cả 2)
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

    // bat GỘP: xoá auto cũ → Print Bridge → tải&chạy vieneu-windows-setup.ps1
    function batContent() {
        const root = siteRoot();
        const pbUrl = root + '/scripts/print-bridge.ps1';
        const vBase = root + '/vieneu-tts';
        const vPs1 = vBase + '/vieneu-windows-setup.ps1';
        return [
            '@echo off',
            'chcp 65001 >nul',
            'setlocal',
            'set "DIR=%LOCALAPPDATA%\\N2StorePrintBridge"',
            'set "STARTUP=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"',
            'set "PBURL=' + pbUrl + '"',
            'set "VPS1=' + vPs1 + '"',
            'set "VBASE=' + vBase + '"',
            'echo ===========================================================',
            'echo   Cai N2Store POS: Print Bridge + Giong VieNeu (tu chay nen)',
            'echo ===========================================================',
            'REM --- 0) Tat auto/instance CU (tranh trung) ---',
            'del /f /q "%STARTUP%\\N2StorePrintBridge.vbs" 2>nul',
            'del /f /q "%STARTUP%\\N2StoreVieNeu.vbs" 2>nul',
            'schtasks /delete /tn "VieNeu-TTS" /f >nul 2>nul',
            'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'wscript.exe\'\\" | Where-Object { $_.CommandLine -like \'*N2Store*\' } | ForEach-Object { try{ Stop-Process -Id $_.ProcessId -Force }catch{} }" 2>nul',
            'REM --- 1) Print Bridge ---',
            'if not exist "%DIR%" mkdir "%DIR%"',
            'echo [1/2] Tai Print Bridge ...',
            "powershell -NoProfile -Command \"try{ Invoke-WebRequest -Uri '%PBURL%' -OutFile '%DIR%\\print-bridge.ps1' -UseBasicParsing; exit 0 }catch{ exit 1 }\"",
            'if not exist "%DIR%\\print-bridge.ps1" ( echo [LOI] Khong tai duoc Print Bridge & pause & exit /b 1 )',
            '> "%DIR%\\run-hidden.vbs" echo CreateObject("WScript.Shell").Run "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""%DIR%\\print-bridge.ps1""", 0, False',
            'copy /Y "%DIR%\\run-hidden.vbs" "%STARTUP%\\N2StorePrintBridge.vbs" >nul',
            'wscript "%DIR%\\run-hidden.vbs"',
            'echo   [OK] Print Bridge chay nen (http://127.0.0.1:17777)',
            'REM --- 2) Giong VieNeu (tai ps1 rieng + chay) ---',
            'echo [2/2] Cai Giong VieNeu (lan dau ~595MB, vai phut)...',
            "powershell -NoProfile -Command \"try{ Invoke-WebRequest -Uri '%VPS1%' -OutFile '%DIR%\\vieneu-setup.ps1' -UseBasicParsing; exit 0 }catch{ exit 1 }\"",
            'if not exist "%DIR%\\vieneu-setup.ps1" ( echo [BO QUA] Khong tai duoc VieNeu setup & goto :done )',
            'powershell -NoProfile -ExecutionPolicy Bypass -File "%DIR%\\vieneu-setup.ps1" -VBase "%VBASE%"',
            ':done',
            'echo.',
            'echo  [HOAN TAT] Print Bridge + Giong VieNeu dang chay nen, TU BAT moi khi mo may.',
            'echo  Vao trang Tao video se tu hien may nay o muc Giong VieNeu.',
            'echo.',
            'pause',
        ].join('\r\n');
    }

    function uninstallBatContent() {
        return [
            '@echo off',
            'chcp 65001 >nul',
            'set "DIR=%LOCALAPPDATA%\\N2StorePrintBridge"',
            'set "VDIR=%LOCALAPPDATA%\\N2StoreVieNeu"',
            'set "STARTUP=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"',
            'echo Dang tat va go N2Store Print Bridge + Giong VieNeu ...',
            'del /f /q "%STARTUP%\\N2StorePrintBridge.vbs" 2>nul',
            'del /f /q "%STARTUP%\\N2StoreVieNeu.vbs" 2>nul',
            'schtasks /delete /tn "VieNeu-TTS" /f >nul 2>nul',
            "powershell -NoProfile -Command \"Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*print-bridge.ps1*' -or $_.CommandLine -like '*serve.py*' -or $_.CommandLine -like '*N2Store*' -or ($_.Name -eq 'cloudflared.exe' -and $_.CommandLine -like '*N2StoreVieNeu*') } | ForEach-Object { try{ Stop-Process -Id $_.ProcessId -Force }catch{} }\" 2>nul",
            'rmdir /s /q "%DIR%" 2>nul',
            'rmdir /s /q "%VDIR%" 2>nul',
            'echo.',
            'echo  [OK] Da tat + go Print Bridge + Giong VieNeu. Khong con tu bat khi mo may.',
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
                    'Đã tải bộ cài — bấm đúp để chạy trên máy POS',
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
