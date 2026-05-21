#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Persistent Playwright browser session — login 1 lần, giữ open, run nhiều task qua REPL/CLI mà không tắt.
//
// Chạy:
//   node scripts/n2store-browser-session.js --user U --pass P
//
// Khi browser đã sẵn sàng, gõ command ở stdin (Enter để gửi):
//   nav <url>                     — điều hướng trang chính (vd: nav https://nhijudyshop.github.io/n2store/orders-report/main.html)
//   eval <js>                     — chạy js trong main page (return JSON)
//   feval <js>                    — chạy js trong tab1-orders iframe (return JSON)
//   filter <key|null>             — set Tag XL filter (vd: filter subtag_CHUA_PHAN_HOI, filter null)
//   flag <key>                    — toggle flag filter (vd: flag CHO_LIVE)
//   search <q>                    — gõ vào ô search (debounced trong app)
//   openchat <selector>           — click element trong iframe (mở modal chat)
//   switchpage <id|substr-name>   — switch chat page (gọi window.switchChatPage)
//   chatstate                     — dump current chat state JSON
//   netlast [N]                   — show last N captured network calls (default 10)
//   clearnet                      — clear network log buffer
//   shot <path>                   — full-page screenshot
//   help                          — list commands
//   quit                          — close browser & exit
//
// Mọi command đều log thời gian, ghi network calls vào buffer.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright');
const { ensureLocalServer } = require('./lib/ensure-local-server');
const { restoreLoginSession } = require('./restore-login-session');

const ARGS = (() => {
    const a = process.argv.slice(2);
    const out = {
        user: '',
        pass: '',
        base: 'https://nhijudyshop.github.io/n2store',
        ext: '',
        profile: '', // path to Chrome user-data dir (parent của Profile X)
        profileName: '', // tên Profile sub-dir (vd "Profile 4")
        chromeChannel: '', // 'chrome' để dùng stable Chrome thay vì Chromium
    };
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--user') out.user = a[++i];
        else if (a[i] === '--pass') out.pass = a[++i];
        else if (a[i] === '--base') out.base = a[++i];
        else if (a[i] === '--ext') out.ext = a[++i];
        else if (a[i] === '--profile') out.profile = a[++i];
        else if (a[i] === '--profile-name') out.profileName = a[++i];
        else if (a[i] === '--channel') out.chromeChannel = a[++i];
    }
    return out;
})();
if (!ARGS.profile && (!ARGS.user || !ARGS.pass)) {
    console.error(
        'Usage: node scripts/n2store-browser-session.js --user U --pass P [--base URL]\n' +
            '  Localhost: --base http://localhost:8080  (cần `python3 -m http.server 8080`)\n' +
            '  Existing profile: --profile /path/to/Chrome --profile-name "Profile 4" [--channel chrome]'
    );
    process.exit(1);
}

const BASE = ARGS.base.replace(/\/+$/, '');
const ORDERS = `${BASE}/orders-report/main.html`;
const OUT_DIR = path.join(__dirname, '..', 'downloads', 'n2store-session');
fs.mkdirSync(OUT_DIR, { recursive: true });
const SESSION_LOG = path.join(OUT_DIR, 'session.log');

const logFile = fs.createWriteStream(SESSION_LOG, { flags: 'a' });
const ts = () => new Date().toISOString();
const log = (...a) => {
    const line = `[${ts()}] ${a.join(' ')}`;
    console.log(line);
    logFile.write(line + '\n');
};

(async () => {
    // Auto-start localhost server nếu BASE là localhost (không cần user pre-launch)
    await ensureLocalServer(BASE, path.join(__dirname, '..'));

    let browser = null;
    let ctx;
    if (ARGS.profile) {
        // Launch Chrome stable channel với existing user-data-dir (vd Profile 4 = n2store).
        // Yêu cầu Chrome đã đóng hoàn toàn (singleton lock).
        const userDataDir = path.resolve(ARGS.profile);
        const channel = ARGS.chromeChannel || 'chrome';
        log(
            `Launching ${channel} với existing profile (${userDataDir}${ARGS.profileName ? ` / ${ARGS.profileName}` : ''})…`
        );
        const launchArgs = [];
        if (ARGS.profileName) launchArgs.push(`--profile-directory=${ARGS.profileName}`);
        if (ARGS.ext) {
            const extPath = path.resolve(ARGS.ext);
            // Với existing profile, KHÔNG dùng --disable-extensions-except (sẽ làm tắt
            // các extension user đã cài). Chỉ thêm --load-extension cho web2-extension.
            launchArgs.push(`--load-extension=${extPath}`);
        }
        ctx = await chromium.launchPersistentContext(userDataDir, {
            channel,
            headless: false,
            viewport: { width: 1440, height: 900 },
            bypassCSP: true,
            ignoreDefaultArgs: ['--disable-extensions'],
            args: launchArgs,
        });
    } else if (ARGS.ext) {
        const extPath = path.resolve(ARGS.ext);
        log(`Launching Chromium persistent (extension=${extPath})…`);
        // Extension load yêu cầu launchPersistentContext (browser.launch không support).
        // Persistent profile lưu ở /tmp để không lưu trữ lâu dài.
        const userDataDir = path.join(require('os').tmpdir(), `n2store-ext-profile-${Date.now()}`);
        ctx = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            viewport: { width: 1440, height: 900 },
            bypassCSP: true,
            // Playwright default args include --disable-extensions → bỏ nó để extension load được.
            ignoreDefaultArgs: ['--disable-extensions'],
            args: [
                '--disable-application-cache',
                '--disk-cache-size=0',
                '--media-cache-size=0',
                `--disable-extensions-except=${extPath}`,
                `--load-extension=${extPath}`,
            ],
        });
    } else {
        log('Launching Chromium (no-cache, headless=false)…');
        browser = await chromium.launch({
            headless: false,
            args: ['--disable-application-cache', '--disk-cache-size=0', '--media-cache-size=0'],
        });
        ctx = await browser.newContext({
            viewport: { width: 1440, height: 900 },
            bypassCSP: true,
        });
    }
    await ctx.route('**/*.js', (route) => {
        route.continue({
            headers: {
                ...route.request().headers(),
                'cache-control': 'no-cache, no-store, must-revalidate',
                pragma: 'no-cache',
            },
        });
    });

    // Reuse first page if persistent context already opened one (extension mode);
    // newPage otherwise.
    const pages = ctx.pages();
    const page = pages.length > 0 ? pages[0] : await ctx.newPage();

    // Console buffer + persistent file logging — capture page console.*, SW console,
    // uncaught errors. Để debug extension flow khi user tự thao tác.
    const consoleBuf = [];
    const consoleFile = fs.createWriteStream(path.join(OUT_DIR, `console-${Date.now()}.log`), {
        flags: 'a',
    });
    const pushConsole = (level, text, location, source = 'page') => {
        const entry = {
            t: ts(),
            source,
            level,
            text: String(text).slice(0, 1200),
            location,
        };
        consoleBuf.push(entry);
        if (consoleBuf.length > 1000) consoleBuf.shift();
        // Append to file for persistence (even if buffer overflows)
        consoleFile.write(
            `[${entry.t}] ${source}:${level.padEnd(7)} ${entry.text}${location ? ' @ ' + location : ''}\n`
        );
    };
    const attachConsoleListeners = (target, source = 'page') => {
        target.on('console', (msg) => {
            const loc = msg.location();
            const locStr = loc?.url ? `${loc.url.slice(-80)}:${loc.lineNumber}` : '';
            pushConsole(msg.type(), msg.text(), locStr, source);
        });
        target.on('pageerror', (err) =>
            pushConsole('pageerror', err.message || String(err), '', source)
        );
        target.on('requestfailed', (req) => {
            pushConsole(
                'netfail',
                `${req.method()} ${req.url().slice(-150)} — ${req.failure()?.errorText || '?'}`,
                '',
                source
            );
        });
    };
    attachConsoleListeners(page, 'page');
    // Listen for new pages (popups, extension pages)
    ctx.on('page', (p) => attachConsoleListeners(p, 'popup'));
    // Listen for service workers (extensions' background scripts)
    ctx.on('serviceworker', (sw) => {
        log(`Service worker registered: ${sw.url().slice(0, 120)}`);
        attachConsoleListeners(sw, 'sw');
    });
    // Capture already-registered SWs
    for (const sw of ctx.serviceWorkers()) {
        attachConsoleListeners(sw, 'sw');
        log(`Pre-existing SW attached: ${sw.url().slice(0, 120)}`);
    }

    // Network buffer + persistent file — capture relevant API calls + FB Graph + Pancake.
    const netBuf = [];
    const netFile = fs.createWriteStream(path.join(OUT_DIR, `network-${Date.now()}.log`), {
        flags: 'a',
    });
    const captureResponse = async (res) => {
        const u = res.url();
        if (
            /by-phone|fb-global-id|conversations|messages|switchChatPage|api\/realtime|api\/v2|search|customers|facebook\.com|pancake\.vn|pages\.fm|graph\.facebook|business\.facebook|messaging\/send|mercury\/upload|api\/graphql/i.test(
                u
            )
        ) {
            try {
                const status = res.status();
                const method = res.request().method();
                const txt = await res.text().catch(() => '');
                let body = txt;
                // Pretty for JSON-like
                try {
                    const parsed = JSON.parse(txt);
                    body = JSON.stringify(parsed);
                } catch {}
                const reqHeaders = res.request().headers();
                const reqBody = res.request().postData() || '';
                const entry = {
                    t: ts(),
                    status,
                    method,
                    url: u.slice(0, 350),
                    reqBody: reqBody.slice(0, 1500),
                    body: body.slice(0, 2000),
                };
                netBuf.push(entry);
                if (netBuf.length > 500) netBuf.shift();
                netFile.write(JSON.stringify(entry) + '\n');
            } catch (_) {}
        }
    };
    page.on('response', captureResponse);
    ctx.on('page', (p) => p.on('response', captureResponse));

    // ── Restore or Login ─────────────────────────────────────────
    // Khi dùng existing Chrome profile (--profile), KHÔNG auto-login/restore
    // — profile đã có session, cookies, login state. Chỉ nav tới BASE và đợi.
    if (ARGS.profile) {
        log('Using existing Chrome profile — skipping login/restore.');
        await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    } else {
        let restored = null;
        try {
            restored = await restoreLoginSession(ctx, { base: BASE });
        } catch (e) {
            log('restoreLoginSession failed:', String(e).slice(0, 200));
        }
        if (restored) {
            log('Restored session from secret file. capturedAt=', restored.capturedAt);
            await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
        } else {
            log('Login →', `${BASE}/`);
            await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('#username');
            await page.fill('#username', ARGS.user);
            await page.fill('#password', ARGS.pass);
            await page.locator('#password').press('Enter');
            await page
                .waitForFunction(
                    () =>
                        !/\/n2store\/?$|\/n2store\/index\.html$/.test(location.href) ||
                        !!localStorage.getItem('loginindex_auth'),
                    { timeout: 30_000 }
                )
                .catch(() => {});
        }
    }
    log('After login URL:', page.url());

    // Default: navigate to orders
    log('Navigate to orders-report/main.html');
    await page.goto(`${ORDERS}?t=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    log('Ready. Type help for commands. Browser stays open until quit.');

    const getFrame = () =>
        page.frames().find((f) => /tab1-orders\.html/.test(f.url())) || page.mainFrame();

    const safe = async (fn, label) => {
        try {
            const r = await fn();
            // JSON.stringify(undefined) returns undefined (not 'undefined') — guard
            // before calling .slice so eval/feval with no return doesn't crash here.
            const s = r === undefined ? 'undefined' : JSON.stringify(r);
            log(`${label} →`, (s == null ? String(s) : s).slice(0, 800));
        } catch (e) {
            log(`${label} ERROR:`, String(e).slice(0, 300));
        }
    };

    // ── REPL ─────────────────────────────────────────────────────
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
            log('Quitting.');
            if (browser) await browser.close();
            else await ctx.close();
            process.exit(0);
        }
        if (cmd === 'help') {
            console.log(
                'Commands: nav <url> | eval <js> | feval <js> | filter <key|null> | flag <key> | search <q> | openchat <selector> | switchpage <id|name> | chatstate | netlast [N] | clearnet | shot <path> | help | quit'
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
        if (cmd === 'addcookie') {
            // addcookie name=value; domain=.foo.com; path=/[; secure][; httpOnly]
            // VD: addcookie jwt=eyJ...; domain=.pancake.vn; path=/
            await safe(async () => {
                const parts = arg
                    .split(';')
                    .map((s) => s.trim())
                    .filter(Boolean);
                const kv = parts[0].split('=');
                const cookie = { name: kv[0], value: parts[0].slice(kv[0].length + 1) };
                for (let i = 1; i < parts.length; i++) {
                    const [k, v] = parts[i].split('=');
                    const key = k.toLowerCase();
                    if (key === 'domain') cookie.domain = v;
                    else if (key === 'path') cookie.path = v;
                    else if (key === 'secure') cookie.secure = true;
                    else if (key === 'httponly') cookie.httpOnly = true;
                    else if (key === 'samesite') cookie.sameSite = v;
                    else if (key === 'expires') cookie.expires = Number(v);
                }
                if (!cookie.path) cookie.path = '/';
                if (cookie.expires === undefined) {
                    cookie.expires = Math.floor(Date.now() / 1000) + 86400 * 90;
                }
                await ctx.addCookies([cookie]);
                return { ok: true, name: cookie.name, domain: cookie.domain };
            }, `addcookie`);
            return;
        }
        if (cmd === 'routeblock') {
            // routeblock <urlGlob> — abort requests matching the glob (for safety:
            // block real send API calls while inspecting flow).
            await safe(async () => {
                await ctx.route(arg, (route) => {
                    log(
                        `[ROUTE-BLOCK] aborted ${route.request().method()} ${route.request().url().slice(0, 200)}`
                    );
                    route.abort('blockedbyclient');
                });
                return { ok: true, blocked: arg };
            }, `routeblock`);
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
        if (cmd === 'filter') {
            const key = arg === 'null' || arg === '' ? null : arg;
            await safe(
                () =>
                    getFrame().evaluate((k) => {
                        if (typeof window._ptagSetFilter === 'function') {
                            window._ptagSetFilter(k);
                            return { ok: true, key: k };
                        }
                        return { ok: false, reason: 'no _ptagSetFilter' };
                    }, key),
                `filter ${key}`
            );
            return;
        }
        if (cmd === 'flag') {
            await safe(
                () =>
                    getFrame().evaluate((k) => {
                        if (typeof window._ptagToggleFlagFilter === 'function') {
                            window._ptagToggleFlagFilter(k);
                            return { ok: true, key: k };
                        }
                        return { ok: false, reason: 'no _ptagToggleFlagFilter' };
                    }, arg),
                `flag ${arg}`
            );
            return;
        }
        if (cmd === 'search') {
            await safe(
                () =>
                    getFrame().evaluate((q) => {
                        const inp = document.querySelector(
                            '#searchInput, input[placeholder*="Tìm"]'
                        );
                        if (!inp) return { ok: false };
                        inp.focus();
                        inp.value = q;
                        inp.dispatchEvent(new Event('input', { bubbles: true }));
                        inp.dispatchEvent(new Event('keyup', { bubbles: true }));
                        return { ok: true, query: q };
                    }, arg),
                `search ${arg}`
            );
            return;
        }
        if (cmd === 'openchat') {
            await safe(
                () =>
                    getFrame().evaluate((sel) => {
                        const el = sel ? document.querySelector(sel) : null;
                        if (!el) {
                            // default: click first row's chat trigger
                            const row = document.querySelector('#tableBody tr[data-order-id]');
                            const trigger =
                                row?.querySelector(
                                    '[onclick*="openChat"], [onclick*="openInbox"], [onclick*="showChat"], [onclick*="Inbox"], .chat-trigger, .messages-cell, [data-column="messages"], [data-column="comments"]'
                                ) || row;
                            if (!trigger) return { ok: false, reason: 'no trigger' };
                            trigger.click();
                            return { ok: true, used: 'fallback first row' };
                        }
                        el.click();
                        return { ok: true, used: sel };
                    }, arg),
                `openchat ${arg}`
            );
            return;
        }
        if (cmd === 'switchpage') {
            await safe(
                () =>
                    getFrame().evaluate((needle) => {
                        const pages = window.pancakeDataManager?.pages || [];
                        let p = pages.find((x) => String(x.id) === needle);
                        if (!p)
                            p = pages.find((x) =>
                                (x.name || '').toLowerCase().includes(needle.toLowerCase())
                            );
                        if (!p)
                            return {
                                ok: false,
                                reason: 'no match',
                                pages: pages.map((x) => ({ id: x.id, name: x.name })),
                            };
                        if (typeof window.switchChatPage !== 'function')
                            return { ok: false, reason: 'no switchChatPage' };
                        window.switchChatPage(p.id);
                        return { ok: true, switchedTo: { id: p.id, name: p.name } };
                    }, arg),
                `switchpage ${arg}`
            );
            return;
        }
        if (cmd === 'chatstate') {
            await safe(
                () =>
                    getFrame().evaluate(() => ({
                        currentChatChannelId: window.currentChatChannelId,
                        currentChatPSID: window.currentChatPSID,
                        currentChatPhone: window.currentChatPhone,
                        currentCustomerName: window.currentCustomerName,
                        currentConversationId: window.currentConversationId,
                        firstMessages: Array.from(
                            document.querySelectorAll(
                                '#chatMessages .chat-message-text, #chatMessages [class*="message"]'
                            )
                        )
                            .slice(0, 6)
                            .map((el) => el.textContent.slice(0, 120).trim())
                            .filter(Boolean),
                    })),
                'chatstate'
            );
            return;
        }
        if (cmd === 'netlast') {
            const n = Number(arg) || 10;
            const slice = netBuf.slice(-n);
            console.log(JSON.stringify(slice, null, 2));
            return;
        }
        if (cmd === 'clearnet') {
            netBuf.length = 0;
            log('Network buffer cleared.');
            return;
        }
        if (cmd === 'console') {
            // console [N|filter] — dump last N (default 30) hoặc filter substring
            let slice;
            const num = Number(arg);
            if (Number.isFinite(num) && num > 0) {
                slice = consoleBuf.slice(-num);
            } else if (arg) {
                slice = consoleBuf.filter((c) => c.text.includes(arg) || c.location?.includes(arg));
            } else {
                slice = consoleBuf.slice(-30);
            }
            // Compact 1-line format để dễ scan
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
            // dumpconsole <filepath> — write full buffer JSON to file
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
        if (cmd === 'storage') {
            // Dump full Playwright storageState (cookies incl. HttpOnly +
            // localStorage + sessionStorage) — usable to re-auth later via
            // context.addCookies() / page.evaluate(localStorage population).
            const p = arg || path.join(OUT_DIR, `storage-${Date.now()}.json`);
            await safe(async () => {
                const state = await ctx.storageState();
                fs.writeFileSync(p, JSON.stringify(state, null, 2));
                return {
                    ok: true,
                    path: p,
                    cookies: state.cookies.length,
                    origins: state.origins.length,
                };
            }, `storage ${p}`);
            return;
        }
        log(`Unknown command: ${cmd}. Type help.`);
    });
})().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
});
