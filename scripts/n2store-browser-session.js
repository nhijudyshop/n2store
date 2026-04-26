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

const ARGS = (() => {
    const a = process.argv.slice(2);
    const out = { user: '', pass: '' };
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--user') out.user = a[++i];
        else if (a[i] === '--pass') out.pass = a[++i];
    }
    return out;
})();
if (!ARGS.user || !ARGS.pass) {
    console.error('Usage: node scripts/n2store-browser-session.js --user U --pass P');
    process.exit(1);
}

const BASE = 'https://nhijudyshop.github.io/n2store';
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
    log('Launching Chromium (no-cache, headless=false)…');
    const browser = await chromium.launch({
        headless: false,
        args: ['--disable-application-cache', '--disk-cache-size=0', '--media-cache-size=0'],
    });
    const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        bypassCSP: true,
    });
    await ctx.route('**/*.js', (route) => {
        route.continue({
            headers: {
                ...route.request().headers(),
                'cache-control': 'no-cache, no-store, must-revalidate',
                pragma: 'no-cache',
            },
        });
    });

    const page = await ctx.newPage();

    // Network buffer (last 200 calls)
    const netBuf = [];
    page.on('response', async (res) => {
        const u = res.url();
        if (
            /by-phone|fb-global-id|conversations|messages|switchChatPage|api\/realtime|api\/v2|search|customers/i.test(
                u
            )
        ) {
            try {
                const json = await res.json().catch(() => null);
                netBuf.push({
                    t: ts(),
                    status: res.status(),
                    url: u.slice(0, 250),
                    body: json ? JSON.stringify(json).slice(0, 600) : null,
                });
                if (netBuf.length > 200) netBuf.shift();
            } catch (_) {}
        }
    });

    // ── Login ────────────────────────────────────────────────────
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
            log(`${label} →`, JSON.stringify(r).slice(0, 800));
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
            await browser.close();
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
    console.error('FATAL', e);
    process.exit(1);
});
