// #Note: Doc CLAUDE.md, MEMORY.md, docs/dev-log.md truoc khi code. Cap nhat dev-log sau thay doi. | WEB2.0 — 1 NUT cai/go agent cham cong DG-600 (ADMS proxy).
// =====================================================================
// MOT NUT cai dat agent cham cong (ADMS proxy) cho may shop.
//
//   Cai dat (mac dinh): node setup.js
//     1) Kiem tra Node.js
//     2) Kiem tra cu phap (syntax) + #Note header MOI file .js
//     3) Kiem tra/ tao config.json
//     4) GO BO ban cu: dung tien trinh cu (ca 2 folder) + xoa autostart cu
//     5) npm install (chap nhan loi — ADMS proxy KHONG can thu vien)
//     6) TU KIEM TRA chuoi: proxy -> worker -> web2-api (GET /iclock/cdata)
//     7) Cai autostart (chay nen khi bat may) + chay ngay
//     8) In tom tat + IP LAN may nay + cach kiem tra
//
//   Go bo hoan toan:  node setup.js --uninstall
//
// CHAY DUOC: Windows (chinh) + Mac/Linux. ASCII-only de console Windows khong loi font.
// Khong ai duoc lam hong Web 1.0 — agent nay doc lap (chi forward /iclock/* sang
// /api/web2-attendance-adms cua web2-api), khong dung chung gi voi he cu.
// =====================================================================

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { execSync, spawn } = require('child_process');
const { loadConfig } = require('./lib-config');

const DIR = __dirname;
const IS_WIN = process.platform === 'win32';
const UNINSTALL = process.argv.includes('--uninstall');

// Ten autostart MOI (Windows). Xoa luon cac ten CU de tranh chay trung.
const AUTOSTART_NAME = 'web2-attendance-adms.vbs';
const OLD_AUTOSTART_NAMES = [
    'web2-attendance-adms.vbs',
    'web2-attendance.vbs',
    'adms-proxy.vbs',
    'attendance-sync.vbs',
];
// Cac script collector cu can dung (ca folder attendance-sync Web 1.0).
const OLD_SCRIPT_MARKERS = ['adms-proxy.js', 'index.js', 'sync.js'];

const errors = [];
const warnings = [];
const C = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
};
// Mau ANSI: TAT tren Windows cmd (hien escape code rac) tru khi FORCE_COLOR.
const USE_COLOR = !!process.stdout.isTTY && (!IS_WIN || !!process.env.FORCE_COLOR);
function paint(s, color) {
    return USE_COLOR ? color + s + C.reset : s;
}
function line(s) {
    console.log(s == null ? '' : String(s));
}
function head(s) {
    line('');
    line(paint('=== ' + s + ' ===', C.bold + C.cyan));
}
function ok(s) {
    line('  ' + paint('[OK]', C.green) + ' ' + s);
}
function warn(s) {
    warnings.push(s);
    line('  ' + paint('[!]', C.yellow) + ' ' + s);
}
function fail(s) {
    errors.push(s);
    line('  ' + paint('[LOI]', C.red) + ' ' + s);
}

// ── helpers ───────────────────────────────────────────────────────────────
function listJsFiles() {
    return fs
        .readdirSync(DIR)
        .filter((f) => f.endsWith('.js'))
        .sort();
}

function lanIPv4s() {
    const out = [];
    const ifs = os.networkInterfaces();
    for (const name of Object.keys(ifs)) {
        for (const i of ifs[name] || []) {
            if (i.family === 'IPv4' && !i.internal) out.push(i.address);
        }
    }
    return out;
}

function startupDir() {
    // Windows: thu muc Startup cua user dang dang nhap.
    const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appdata, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

// Dung MOI tien trinh dang giu cong proxyPort + moi node chay script collector cu.
function killOld(proxyPort) {
    let killed = 0;
    // 1) Kill theo CONG (chac chan giai phong cong cho proxy moi bind).
    try {
        if (IS_WIN) {
            const out = execSync('netstat -ano', { encoding: 'utf8' });
            const pids = new Set();
            for (const ln of out.split(/\r?\n/)) {
                // ...  TCP  0.0.0.0:8081  0.0.0.0:0  LISTENING  <pid>
                const m = ln.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
                if (m && Number(m[1]) === proxyPort) pids.add(m[2]);
            }
            for (const pid of pids) {
                if (Number(pid) === process.pid) continue;
                try {
                    execSync('taskkill /F /PID ' + pid, { stdio: 'ignore' });
                    killed++;
                } catch (_) {}
            }
        } else {
            const out = execSync('lsof -ti tcp:' + proxyPort + ' -sTCP:LISTEN || true', {
                encoding: 'utf8',
                shell: '/bin/bash',
            });
            for (const pid of out.split(/\s+/).filter(Boolean)) {
                try {
                    process.kill(Number(pid), 'SIGTERM');
                    killed++;
                } catch (_) {}
            }
        }
    } catch (_) {}

    // 2) Kill theo COMMAND LINE (collector cu ca 2 folder, du khac cong).
    try {
        if (IS_WIN) {
            // PowerShell: ben vung hon wmic (wmic bi go o Windows 11 moi).
            const ps =
                "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'node' -and (" +
                OLD_SCRIPT_MARKERS.map((m) => "$_.CommandLine -like '*" + m + "*'").join(' -or ') +
                ') } | ForEach-Object { $_.ProcessId }';
            const out = execSync(
                'powershell -NoProfile -ExecutionPolicy Bypass -Command "' + ps + '"',
                { encoding: 'utf8' }
            );
            for (const pid of out
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean)) {
                if (String(Number(pid)) !== pid) continue;
                if (Number(pid) === process.pid) continue;
                try {
                    execSync('taskkill /F /PID ' + pid, { stdio: 'ignore' });
                    killed++;
                } catch (_) {}
            }
        } else {
            for (const m of OLD_SCRIPT_MARKERS) {
                try {
                    execSync('pkill -f ' + m + ' || true', { stdio: 'ignore', shell: '/bin/bash' });
                } catch (_) {}
            }
        }
    } catch (_) {}

    return killed;
}

function removeOldAutostart() {
    if (!IS_WIN) return 0;
    let removed = 0;
    const dir = startupDir();
    for (const name of OLD_AUTOSTART_NAMES) {
        const p = path.join(dir, name);
        try {
            if (fs.existsSync(p)) {
                fs.unlinkSync(p);
                removed++;
            }
        } catch (e) {
            warn('Khong xoa duoc autostart cu: ' + p + ' (' + e.message + ')');
        }
    }
    return removed;
}

function installAutostartWindows() {
    const dir = startupDir();
    if (!fs.existsSync(dir)) {
        warn('Khong tim thay thu muc Startup (' + dir + '). Bo qua autostart.');
        return null;
    }
    const vbsPath = path.join(dir, AUTOSTART_NAME);
    // Dung DUONG DAN TUYET DOI toi node.exe — autostart (Startup) co the KHONG co
    // node trong PATH -> bare "node" se im lang khong chay. process.execPath = node.exe.
    // VBScript: nhung dau " trong chuoi bang "". Backslash la literal (khong escape).
    const nodeExe = process.execPath;
    const vbs =
        'Set sh = CreateObject("WScript.Shell")\r\n' +
        'sh.CurrentDirectory = "' +
        DIR.replace(/\\+$/, '') +
        '"\r\n' +
        'sh.Run "cmd /c ""' +
        nodeExe +
        '"" adms-proxy.js >> logs\\adms-proxy.log 2>&1", 0, False\r\n';
    fs.writeFileSync(vbsPath, vbs, 'utf8');
    return vbsPath;
}

// Khoi dong proxy chay nen ngay bay gio.
function launchProxy(vbsPath) {
    try {
        if (!fs.existsSync(path.join(DIR, 'logs'))) fs.mkdirSync(path.join(DIR, 'logs'));
    } catch (_) {}
    if (IS_WIN && vbsPath) {
        const child = spawn('wscript.exe', [vbsPath], {
            cwd: DIR,
            detached: true,
            stdio: 'ignore',
        });
        child.unref();
        return true;
    }
    // Mac/Linux: chay nen detached, ghi log.
    try {
        const logFd = fs.openSync(path.join(DIR, 'logs', 'adms-proxy.log'), 'a');
        const child = spawn(process.execPath, ['adms-proxy.js'], {
            cwd: DIR,
            detached: true,
            stdio: ['ignore', logFd, logFd],
        });
        child.unref();
        return true;
    } catch (e) {
        warn('Khong khoi dong nen duoc: ' + e.message);
        return false;
    }
}

// Tu kiem tra chuoi day du: spawn proxy tam -> GET /iclock/cdata -> kiem body.
function selfTest(proxyPort) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, ['adms-proxy.js'], {
            cwd: DIR,
            env: Object.assign({}, process.env, { WEB2_PROXY_PORT: String(proxyPort) }),
            stdio: 'ignore',
        });
        let done = false;
        const finish = (result) => {
            if (done) return;
            done = true;
            try {
                child.kill('SIGTERM');
            } catch (_) {}
            // Cho cong giai phong truoc khi cai instance that.
            setTimeout(() => resolve(result), IS_WIN ? 1200 : 600);
        };
        child.on('error', (e) =>
            finish({ pass: false, reason: 'khong chay duoc proxy: ' + e.message })
        );

        // Goi proxy; neu chua bind kip cong (proxy khoi dong cham tren may yeu) ->
        // thu lai toi 6 lan moi 800ms, tranh bao LOI gia.
        const MAX_TRIES = 6;
        let lastReason = 'het thoi gian cho (mang/internet?)';
        const attempt = (tries) => {
            const req = http.get(
                {
                    host: '127.0.0.1',
                    port: proxyPort,
                    path: '/iclock/cdata?SN=SELFTEST&options=all&pushver=2.4.0',
                    timeout: 20000,
                },
                (res) => {
                    let body = '';
                    res.on('data', (c) => (body += c));
                    res.on('end', () => {
                        const text = String(body);
                        if (text.includes('GET OPTION FROM')) {
                            finish({ pass: true, status: res.statusCode, body: text });
                        } else {
                            finish({
                                pass: false,
                                status: res.statusCode,
                                reason:
                                    'web2-api KHONG tra dung cau hinh ADMS. Body: ' +
                                    text.slice(0, 160).replace(/\s+/g, ' '),
                            });
                        }
                    });
                }
            );
            req.on('timeout', () => {
                req.destroy();
                finish({ pass: false, reason: 'het thoi gian cho (mang/internet?)' });
            });
            req.on('error', (e) => {
                // ECONNREFUSED = proxy chua bind kip -> cho roi thu lai.
                lastReason = e.message;
                if (e.code === 'ECONNREFUSED' && tries < MAX_TRIES) {
                    setTimeout(() => attempt(tries + 1), 800);
                } else {
                    finish({ pass: false, reason: lastReason });
                }
            });
        };
        // Cho proxy bind cong lan dau.
        setTimeout(() => attempt(1), 1200);
    });
}

// ── UNINSTALL ───────────────────────────────────────────────────────────────
function doUninstall() {
    head('GO BO AGENT CHAM CONG');
    const cfg = loadConfig();
    const removed = removeOldAutostart();
    ok('Da xoa ' + removed + ' autostart (khong con tu chay khi bat may).');
    const killed = killOld(cfg.proxyPort);
    ok('Da dung ' + killed + ' tien trinh dang chay (cong ' + cfg.proxyPort + ' + collector cu).');
    line('');
    line(paint('Da GO BO xong. May se KHONG tu day du lieu nua.', C.green));
    line('Muon cai lai: bam dup CAI-DAT.bat (Windows) / cai-dat.command (Mac).');
}

// ── INSTALL ───────────────────────────────────────────────────────────────
async function doInstall() {
    line(paint('================================================================', C.bold));
    line(paint('  CAI DAT AGENT CHAM CONG DG-600  ->  trang Cham cong (Web 2.0)', C.bold + C.cyan));
    line(paint('================================================================', C.bold));
    line('  Thu muc: ' + DIR);

    // [1] Node.js
    head('[1/8] Kiem tra Node.js');
    line('  Node ' + process.version + ' / ' + process.platform + '/' + process.arch);
    const major = Number((process.version.match(/^v(\d+)/) || [])[1] || 0);
    if (major < 14)
        warn('Node qua cu (' + process.version + '). Nen cai Node 18+ : https://nodejs.org');
    else ok('Node.js OK.');

    // [2] Syntax + #Note moi file .js
    head('[2/8] Kiem tra cu phap (syntax) + #Note header cac file .js');
    const jsFiles = listJsFiles();
    for (const f of jsFiles) {
        const full = path.join(DIR, f);
        try {
            execSync('"' + process.execPath + '" --check "' + full + '"', { stdio: 'pipe' });
            // #Note header (quy uoc du an).
            const firstLine = fs.readFileSync(full, 'utf8').split(/\r?\n/)[0] || '';
            if (!/#Note/.test(firstLine))
                warn(f + ': thieu #Note header o dong dau (quy uoc du an).');
            else ok(f + ': syntax OK + #Note OK.');
        } catch (e) {
            const msg = (e.stderr ? e.stderr.toString() : e.message)
                .split(/\r?\n/)
                .slice(0, 3)
                .join(' ');
            fail(f + ': LOI SYNTAX -> ' + msg);
        }
    }

    // [3] Config
    head('[3/8] Kiem tra config.json');
    const cfgPath = path.join(DIR, 'config.json');
    if (!fs.existsSync(cfgPath)) {
        const examplePath = path.join(DIR, 'config.example.json');
        if (fs.existsSync(examplePath)) {
            fs.copyFileSync(examplePath, cfgPath);
            warn('Chua co config.json -> da tao tu mau. Mo sua "attendanceSecret" neu can.');
        } else {
            fail('Thieu ca config.json lan config.example.json.');
        }
    }
    let cfg = loadConfig();
    // Validate JSON
    try {
        if (fs.existsSync(cfgPath)) JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        ok('config.json hop le. renderBase=' + cfg.renderBase + ' | proxyPort=' + cfg.proxyPort);
    } catch (e) {
        fail('config.json KHONG phai JSON hop le: ' + e.message);
    }
    if (!cfg.attendanceSecret || /DAT_GIONG|ĐẶT_GIỐNG/i.test(cfg.attendanceSecret)) {
        warn(
            'Chua dat attendanceSecret that. ADMS van chay (endpoint /iclock khong bat buoc secret), ' +
                'nhung nen dat giong WEB2_ATTENDANCE_SECRET tren Render.'
        );
    } else {
        ok('attendanceSecret: da co.');
    }

    // [4] Go ban cu (tu xoa)
    head('[4/8] Go ban cu (dung tien trinh + xoa autostart cu)');
    const removed = removeOldAutostart();
    ok('Da xoa ' + removed + ' autostart cu (' + OLD_AUTOSTART_NAMES.join(', ') + ').');
    const killed = killOld(cfg.proxyPort);
    ok('Da dung ' + killed + ' tien trinh cu (giai phong cong ' + cfg.proxyPort + ').');

    // [5] npm install (chap nhan loi)
    head('[5/8] Cai thu vien (npm install) — ADMS proxy KHONG bat buoc');
    try {
        execSync('npm install --omit=dev --no-audit --no-fund', {
            cwd: DIR,
            stdio: 'ignore',
            timeout: 180000,
        });
        ok('npm install xong.');
    } catch (e) {
        warn(
            'npm install loi/bo qua (ADMS proxy van chay khong can thu vien). ' + (e.message || '')
        );
    }

    // [6] Tu kiem tra chuoi proxy -> worker -> web2-api
    head('[6/8] Tu kiem tra ket noi (proxy -> worker -> web2-api)');
    line('  Dang thu GET /iclock/cdata qua proxy cong ' + cfg.proxyPort + ' ...');
    const test = await selfTest(cfg.proxyPort);
    if (test.pass) {
        ok('CHUOI HOAT DONG! web2-api tra dung cau hinh ADMS (HTTP ' + test.status + ').');
        ok(
            '=> May cham cong se nhan duoc phan hoi dung va bat dau day du lieu len trang Cham cong.'
        );
    } else {
        fail('Tu kiem tra THAT BAI: ' + test.reason);
        line(
            '     Goi y: kiem tra Internet may nay + renderBase trong config.json + web2-api con song.'
        );
    }

    // [7] Autostart + chay ngay
    head('[7/8] Cai chay nen khi bat may + chay ngay');
    let vbsPath = null;
    if (IS_WIN) {
        vbsPath = installAutostartWindows();
        if (vbsPath) ok('Autostart: ' + vbsPath + ' (tu chay an khi bat may).');
    } else {
        warn('Mac/Linux: bo qua autostart (chi can tren may shop Windows). Se chay nen ngay.');
    }
    const launched = launchProxy(vbsPath);
    if (launched) ok('Proxy dang chay nen. Log: ' + path.join(DIR, 'logs', 'adms-proxy.log'));
    else warn('Khong khoi dong nen duoc — chay tay: node adms-proxy.js');

    // [8] Tom tat
    head('[8/8] TOM TAT');
    const ips = lanIPv4s();
    line('  Cau hinh tren MAY CHAM CONG DG-600 (menu Comm / Cloud / ADMS server):');
    line(
        '    - Server address = IP cua MAY NAY tren LAN: ' +
            paint(ips.join('  hoac  ') || '(khong do duoc)', C.bold)
    );
    line(
        '    - Server port    = ' +
            paint(String(cfg.proxyPort), C.bold) +
            '   |   Mode = Auto upload / Tu dong tai du lieu'
    );
    line('  Xem log realtime:  http://localhost:' + cfg.proxyPort + '/debug');
    line(
        '  Kiem tra: cham 1 dau van tay -> mo trang Cham cong (Quan tri vien) -> "Dang ket noi" + punch hien ra.'
    );
    line('  Go bo hoan toan:   bam dup GO-BO.bat (Windows) / go-bo.command (Mac).');

    line('');
    if (errors.length) {
        line(
            paint(
                'KET QUA: CO ' + errors.length + ' LOI — xem [LOI] o tren. Chua chay duoc on.',
                C.red + C.bold
            )
        );
        for (const e of errors) line('   - ' + e);
    } else if (warnings.length) {
        line(
            paint(
                'KET QUA: XONG (co ' + warnings.length + ' canh bao [!] khong chan).',
                C.yellow + C.bold
            )
        );
    } else {
        line(paint('KET QUA: XONG — moi thu OK. Agent cham cong dang chay nen.', C.green + C.bold));
    }
    process.exitCode = errors.length ? 1 : 0;
}

// ── main ───────────────────────────────────────────────────────────────────
(async () => {
    try {
        if (UNINSTALL) doUninstall();
        else await doInstall();
    } catch (e) {
        line(paint('LOI NGHIEM TRONG: ' + (e && e.stack ? e.stack : e), C.red));
        process.exitCode = 1;
    }
})();
