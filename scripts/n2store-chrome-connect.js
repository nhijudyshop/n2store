#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Launch Chrome n2store profile với --remote-debugging-port, rồi Playwright
// connectOverCDP để control + capture console/network. Khác n2store-browser-session.js:
// dùng REAL Chrome profile thay vì Chromium fresh — có sẵn extensions + login state.
//
// Chạy:
//   node scripts/n2store-chrome-connect.js [--port 9222] [--profile-name "Profile 4"]
//
// Yêu cầu: đóng Chrome trước khi chạy (kill all Chrome processes).
//
// Commands (qua FIFO /tmp/n2store-session.fifo):
//   nav <url>, eval <js>, feval <js>, console [N|filter], netlast [N],
//   clearconsole, clearnet, dumpconsole <path>, shot <path>, help, quit

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn, execSync } = require('child_process');
const { chromium } = require('playwright');

const ARGS = (() => {
    const a = process.argv.slice(2);
    const out = {
        port: 9222,
        profileName: 'Profile 4',
        userDataDir: path.join(process.env.HOME, 'Library/Application Support/Google/Chrome'),
        chromeBin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        ext: '',
        skipLaunch: false, // assume Chrome already running with debug port
    };
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--port') out.port = Number(a[++i]);
        else if (a[i] === '--profile-name') out.profileName = a[++i];
        else if (a[i] === '--user-data-dir') out.userDataDir = a[++i];
        else if (a[i] === '--ext') out.ext = a[++i];
        else if (a[i] === '--skip-launch') out.skipLaunch = true;
    }
    return out;
})();

const OUT_DIR = path.join(__dirname, '..', 'downloads', 'n2store-session');
fs.mkdirSync(OUT_DIR, { recursive: true });
const SESSION_LOG = path.join(OUT_DIR, 'chrome-cdp-session.log');
const logFile = fs.createWriteStream(SESSION_LOG, { flags: 'a' });
const ts = () => new Date().toISOString();
const log = (...a) => {
    const line = `[${ts()}] ${a.join(' ')}`;
    console.log(line);
    logFile.write(line + '\n');
};

function isPortInUse(port) {
    try {
        execSync(`lsof -i :${port} -sTCP:LISTEN -P -n -t`, { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

async function waitForPort(port, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (isPortInUse(port)) return true;
        await new Promise((r) => setTimeout(r, 200));
    }
    return false;
}

(async () => {
    if (!ARGS.skipLaunch) {
        if (isPortInUse(ARGS.port)) {
            log(
                `Port ${ARGS.port} đã được dùng — Chrome có thể đang chạy với debug port. Skip launch, sẽ connect.`
            );
        } else {
            const chromeArgs = [
                `--remote-debugging-port=${ARGS.port}`,
                `--user-data-dir=${ARGS.userDataDir}`,
                `--profile-directory=${ARGS.profileName}`,
                '--no-first-run',
                '--no-default-browser-check',
            ];
            if (ARGS.ext) {
                chromeArgs.push(`--load-extension=${path.resolve(ARGS.ext)}`);
            }
            log(`Launching Chrome (Profile=${ARGS.profileName}, port=${ARGS.port})…`);
            const proc = spawn(ARGS.chromeBin, chromeArgs, {
                detached: true,
                stdio: 'ignore',
            });
            proc.unref();
            log(`Chrome PID=${proc.pid}, waiting for port ${ARGS.port}…`);
            const ok = await waitForPort(ARGS.port);
            if (!ok) {
                console.error(
                    `FATAL: Chrome không listen port ${ARGS.port} sau 15s. ` +
                        `Có thể Chrome đã chạy với profile khác hoặc bị block. ` +
                        `Kill all Chrome (Cmd+Q) rồi chạy lại.`
                );
                process.exit(1);
            }
        }
    }

    log(`Connecting via CDP http://localhost:${ARGS.port}…`);
    const browser = await chromium.connectOverCDP(`http://localhost:${ARGS.port}`);
    const contexts = browser.contexts();
    if (!contexts.length) {
        console.error('FATAL: Chrome có debug port nhưng không có context nào.');
        process.exit(1);
    }
    const ctx = contexts[0];
    const pages = ctx.pages();
    const page = pages.length > 0 ? pages[0] : await ctx.newPage();
    log(`Connected. Active context has ${pages.length} page(s), using first.`);
    log(`Current URL: ${page.url()}`);

    // ── Console buffer (capture console.*, page errors, request failures) ──
    const consoleBuf = [];
    const pushConsole = (level, text, location) => {
        consoleBuf.push({ t: ts(), level, text: String(text).slice(0, 1200), location });
        if (consoleBuf.length > 500) consoleBuf.shift();
    };
    const attachConsoleListeners = (target) => {
        target.on('console', (msg) => {
            const loc = msg.location();
            const locStr = loc?.url ? `${loc.url.slice(-80)}:${loc.lineNumber}` : '';
            pushConsole(msg.type(), msg.text(), locStr);
        });
        target.on('pageerror', (err) => pushConsole('pageerror', err.message || String(err), ''));
        target.on('requestfailed', (req) => {
            pushConsole(
                'netfail',
                `${req.method()} ${req.url().slice(-150)} — ${req.failure()?.errorText || '?'}`,
                ''
            );
        });
    };
    attachConsoleListeners(page);
    ctx.on('page', (p) => attachConsoleListeners(p));

    // ── Network buffer (last 200 calls) ──
    const netBuf = [];
    page.on('response', async (res) => {
        const u = res.url();
        if (
            /by-phone|fb-global-id|conversations|messages|switchChatPage|api\/realtime|api\/v2|search|customers|facebook\.com|pancake/i.test(
                u
            )
        ) {
            try {
                const json = await res.json().catch(() => null);
                netBuf.push({
                    t: ts(),
                    status: res.status(),
                    method: res.request().method(),
                    url: u.slice(0, 250),
                    body: json ? JSON.stringify(json).slice(0, 600) : null,
                });
                if (netBuf.length > 200) netBuf.shift();
            } catch (_) {}
        }
    });

    log('Ready. Type help for commands. Browser stays open.');

    const getFrame = () =>
        page.frames().find((f) => /tab1-orders\.html/.test(f.url())) || page.mainFrame();

    const safe = async (fn, label) => {
        try {
            const r = await fn();
            const s = r === undefined ? 'undefined' : JSON.stringify(r);
            log(`${label} →`, (s == null ? String(s) : s).slice(0, 800));
        } catch (e) {
            log(`${label} ERROR:`, String(e).slice(0, 300));
        }
    };

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false,
    });
    rl.on('line', async (raw) => {
        const line = raw.trim();
        if (!line) return;
        const idx = line.indexOf(' ');
        const cmd = (idx === -1 ? line : line.slice(0, idx)).toLowerCase();
        const arg = idx === -1 ? '' : line.slice(idx + 1).trim();

        if (cmd === 'quit' || cmd === 'exit') {
            log('Disconnecting (Chrome stays open).');
            await browser.close().catch(() => {});
            process.exit(0);
        }
        if (cmd === 'help') {
            console.log(
                'Commands: nav <url> | eval <js> | feval <js> | console [N|filter] | netlast [N] | clearconsole | clearnet | dumpconsole [path] | shot <path> | listpages | quit'
            );
            return;
        }
        if (cmd === 'nav') {
            await safe(async () => {
                await page.goto(arg, { waitUntil: 'domcontentloaded' });
                return { ok: true, url: page.url() };
            }, `nav ${arg}`);
            return;
        }
        if (cmd === 'listpages') {
            const all = ctx.pages().map((p, i) => ({ idx: i, url: p.url() }));
            console.log(JSON.stringify(all, null, 2));
            return;
        }
        if (cmd === 'eval') {
            await safe(() => page.evaluate(`(async()=>{ ${arg} })()`), 'eval');
            return;
        }
        if (cmd === 'feval') {
            await safe(() => getFrame().evaluate(`(async()=>{ ${arg} })()`), 'feval');
            return;
        }
        if (cmd === 'netlast') {
            const n = Number(arg) || 10;
            console.log(JSON.stringify(netBuf.slice(-n), null, 2));
            return;
        }
        if (cmd === 'clearnet') {
            netBuf.length = 0;
            log('Network buffer cleared.');
            return;
        }
        if (cmd === 'console') {
            let slice;
            const num = Number(arg);
            if (Number.isFinite(num) && num > 0) {
                slice = consoleBuf.slice(-num);
            } else if (arg) {
                slice = consoleBuf.filter((c) => c.text.includes(arg) || c.location?.includes(arg));
            } else {
                slice = consoleBuf.slice(-30);
            }
            const lines = slice.map(
                (c) => `[${c.t.split('T')[1]?.slice(0, 12)}] ${c.level.padEnd(7)} ${c.text}`
            );
            console.log(`-- ${slice.length}/${consoleBuf.length} entries --`);
            for (const l of lines) console.log(l);
            return;
        }
        if (cmd === 'clearconsole') {
            consoleBuf.length = 0;
            log('Console buffer cleared.');
            return;
        }
        if (cmd === 'dumpconsole') {
            const p = arg || path.join(OUT_DIR, `console-${Date.now()}.json`);
            fs.writeFileSync(p, JSON.stringify(consoleBuf, null, 2));
            log(`Dumped ${consoleBuf.length} entries to ${p}`);
            return;
        }
        if (cmd === 'shot') {
            const p = arg || path.join(OUT_DIR, `shot-${Date.now()}.png`);
            await safe(async () => {
                await page.screenshot({ path: p, fullPage: true });
                return { ok: true, path: p };
            }, `shot ${p}`);
            return;
        }
        log(`Unknown command: ${cmd}. Type help.`);
    });
})().catch((e) => {
    console.error('FATAL', e.message);
    process.exit(1);
});
