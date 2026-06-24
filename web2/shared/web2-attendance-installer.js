// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — 1-click tải & cài agent Chấm công DG-600.
/**
 * Web2AttendanceInstaller — NGUỒN DÙNG CHUNG cho "Tải file cài Chấm công" (.bat).
 *
 * 1 bat `cai-cham-cong.bat` TỰ tải folder `attendance-sync/` (từ site) về
 * `%LOCALAPPDATA%\N2StoreChamCong` rồi chạy `node setup.js` — setup.js lo HẾT phần
 * còn lại: kiểm tra, tự gỡ bản cũ, tự test chuỗi proxy→server, autostart (chạy nền +
 * tự bật khi mở máy), in IP LAN. Bấm đúp 1 lần là xong.
 *
 * Trang nào cần (printer-settings, cham-cong, …) chỉ load script này rồi gọi:
 *   Web2AttendanceInstaller.downloadInstaller()    // tải cai-cham-cong.bat
 *   Web2AttendanceInstaller.downloadUninstaller()  // tải go-cham-cong.bat
 *   Web2AttendanceInstaller.renderButtons(target, { showUninstall, onInstall })
 *   Web2AttendanceInstaller.batContent() / .uninstallBatContent()  // chuỗi bat thô
 *
 * URL tải tính từ SITE-ROOT (trước "/web2/") → chạy đúng mọi trang web2, mọi domain
 * (nhijudy.store hoặc nhijudyshop.github.io/n2store).
 */
(function (global) {
    'use strict';

    // Các file của agent cần tải về (config.json KHÔNG tải — chứa secret, tự tạo từ example).
    const FILES = [
        'setup.js',
        'adms-proxy.js',
        'lib-config.js',
        'config.example.json',
        'package.json',
    ];
    const APP_DIR = '%LOCALAPPDATA%\\N2StoreChamCong';
    const STARTUP = '%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup';

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

    // bat: tải folder agent về %LOCALAPPDATA%\N2StoreChamCong rồi node setup.js.
    function batContent() {
        const base = siteRoot() + '/attendance-sync';
        const lines = [
            '@echo off',
            'chcp 65001 >nul',
            'setlocal',
            'title N2Store - Cai Cham Cong DG-600',
            'set "DIR=' + APP_DIR + '"',
            'set "BASE=' + base + '"',
            'echo =========================================================',
            'echo   CAI CHAM CONG DG-600 (tu tai + tu cai + tu kiem tra)',
            'echo =========================================================',
            'echo.',
            // [1] Node.js
            'where node >nul 2>&1',
            'if errorlevel 1 (',
            '  echo [LOI] Chua cai Node.js. Tai https://nodejs.org ^(ban LTS^) roi chay lai file nay.',
            '  echo.',
            '  pause',
            '  exit /b 1',
            ')',
            // [2] tao folder + tai cac file
            'if not exist "%DIR%" mkdir "%DIR%"',
            'echo Dang tai agent ve "%DIR%" ...',
        ];
        for (const f of FILES) {
            lines.push(
                'powershell -NoProfile -Command "try{ Invoke-WebRequest -Uri \'%BASE%/' +
                    f +
                    "' -OutFile '%DIR%\\" +
                    f +
                    '\' -UseBasicParsing; exit 0 }catch{ exit 1 }"'
            );
            lines.push(
                'if not exist "%DIR%\\' +
                    f +
                    '" ( echo   [LOI] Khong tai duoc ' +
                    f +
                    ' & pause & exit /b 1 )'
            );
            lines.push('echo   [OK] ' + f);
        }
        lines.push(
            // [3] config.json: tao tu example neu chua co (KHONG ghi de — giu secret cu)
            'if not exist "%DIR%\\config.json" copy /Y "%DIR%\\config.example.json" "%DIR%\\config.json" >nul',
            // [4] chay setup.js (lo het: tu go ban cu + test + autostart + chay nen)
            'echo.',
            'echo Dang cai dat (setup.js)...',
            'cd /d "%DIR%"',
            'node setup.js',
            'echo.',
            'echo Neu thay KET QUA: XONG la da chay nen + tu bat khi mo may.',
            'echo Go bo: tai "file go" o cung trang, hoac chay: node "%DIR%\\setup.js" --uninstall',
            'echo.',
            'pause'
        );
        return lines.join('\r\n');
    }

    function uninstallBatContent() {
        return [
            '@echo off',
            'chcp 65001 >nul',
            'set "DIR=' + APP_DIR + '"',
            'set "STARTUP=' + STARTUP + '"',
            'echo Dang go agent Cham cong DG-600 ...',
            // uu tien setup.js --uninstall (kill cong + xoa autostart)
            'if exist "%DIR%\\setup.js" ( cd /d "%DIR%" & node setup.js --uninstall )',
            // belt-and-suspenders: xoa autostart + kill proxy du node loi
            'del /f /q "%STARTUP%\\web2-attendance-adms.vbs" 2>nul',
            'del /f /q "%STARTUP%\\web2-attendance.vbs" 2>nul',
            'del /f /q "%STARTUP%\\adms-proxy.vbs" 2>nul',
            'del /f /q "%STARTUP%\\attendance-sync.vbs" 2>nul',
            'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like \'*adms-proxy.js*\' } | ForEach-Object { try{ Stop-Process -Id $_.ProcessId -Force }catch{} }" 2>nul',
            'echo.',
            'echo  [OK] Da go. Khong con tu bat khi mo may. Muon cai lai: tai file cai dat.',
            'echo.',
            'pause',
        ].join('\r\n');
    }

    function downloadInstaller() {
        _download('cai-cham-cong.bat', batContent());
        return true;
    }
    function downloadUninstaller() {
        _download('go-cham-cong.bat', uninstallBatContent());
        return true;
    }

    let _styled = false;
    function _ensureStyle() {
        if (_styled) return;
        _styled = true;
        const s = document.createElement('style');
        s.textContent =
            '.w2att-btns{display:flex;flex-wrap:wrap;gap:8px}' +
            '.w2att-btn{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 13px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid transparent}' +
            '.w2att-btn i{width:15px;height:15px}' +
            '.w2att-primary{background:var(--web2-primary,#0068ff);color:#fff}' +
            '.w2att-danger{background:#fff;color:#dc2626;border-color:#fecaca}';
        document.head.appendChild(s);
    }

    function renderButtons(target, opts) {
        opts = opts || {};
        const el = typeof target === 'string' ? document.querySelector(target) : target;
        if (!el) return;
        _ensureStyle();
        el.classList.add('w2att-btns');
        el.innerHTML =
            '<button type="button" class="w2att-btn w2att-primary" data-w2att="install"><i data-lucide="download"></i> ' +
            (opts.installLabel || 'Tải file cài Chấm công (.bat)') +
            '</button>' +
            (opts.showUninstall
                ? '<button type="button" class="w2att-btn w2att-danger" data-w2att="uninstall"><i data-lucide="power-off"></i> Tải file gỡ</button>'
                : '');
        el.querySelector('[data-w2att="install"]')?.addEventListener('click', () => {
            downloadInstaller();
            if (global.notificationManager?.show)
                global.notificationManager.show(
                    'Đã tải file cài Chấm công — chép sang máy POS, bấm đúp để chạy',
                    'success'
                );
            opts.onInstall && opts.onInstall();
        });
        el.querySelector('[data-w2att="uninstall"]')?.addEventListener('click', () => {
            downloadUninstaller();
            if (global.notificationManager?.show)
                global.notificationManager.show('Đã tải file gỡ — bấm đúp để chạy', 'success');
        });
        if (global.lucide) global.lucide.createIcons();
    }

    global.Web2AttendanceInstaller = {
        siteRoot,
        batContent,
        uninstallBatContent,
        downloadInstaller,
        downloadUninstaller,
        renderButtons,
    };
})(window);
