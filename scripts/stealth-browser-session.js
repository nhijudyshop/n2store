// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Stealth browser session — bypass Google OAuth automated-browser detection.
// USAGE: (tail -f /tmp/stealth.fifo) | node scripts/stealth-browser-session.js [start_url]
//
// Differences from kling-api-extract.js:
//   - --disable-blink-features=AutomationControlled
//   - Real user-agent + navigator.webdriver override
//   - Persistent context (real user data dir) for Google to trust cookies

const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const readline = require('readline');

const START_URL = process.argv[2] || 'about:blank';
const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

(async () => {
    const userDataDir = path.join(os.tmpdir(), 'n2store-stealth-profile');
    log(`Launching Chromium stealth (userDataDir: ${userDataDir})…`);

    const ctx = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: null,
        locale: 'en-US',
        userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        args: [
            '--disable-blink-features=AutomationControlled',
            '--start-maximized',
            '--no-first-run',
            '--disable-features=IsolateOrigins,site-per-process',
        ],
        ignoreDefaultArgs: ['--enable-automation'],
    });

    // Hide navigator.webdriver, override `navigator.plugins` etc
    await ctx.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', {
            get: () => [{ name: 'Chrome PDF Plugin' }, { name: 'Chrome PDF Viewer' }],
        });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        // Hide CDP marker
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
    });

    const page = ctx.pages()[0] || (await ctx.newPage());
    await page.goto(START_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
    log('Page:', page.url());
    log('→ Login manual. Profile lưu tại:', userDataDir);
    log('Commands: url | goto <url> | eval <js> | text | shot <path> | cookies | storage | quit');

    const safe = async (label, fn) => {
        try {
            const r = await fn();
            const s = r === undefined ? 'undefined' : JSON.stringify(r, null, 2);
            log(`${label} →`, (s ?? String(s)).slice(0, 4000));
        } catch (e) {
            log(`${label} ERROR:`, String(e).slice(0, 400));
        }
    };

    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    rl.on('line', async (raw) => {
        const line = raw.trim();
        if (!line) return;
        const idx = line.indexOf(' ');
        const cmd = (idx === -1 ? line : line.slice(0, idx)).toLowerCase();
        const arg = idx === -1 ? '' : line.slice(idx + 1).trim();

        if (cmd === 'quit' || cmd === 'exit') {
            log('Closing.');
            await ctx.close();
            process.exit(0);
        }
        if (cmd === 'url') return log('URL:', page.url());
        if (cmd === 'goto') {
            return safe(`goto ${arg}`, async () => {
                await page.goto(arg, { waitUntil: 'domcontentloaded' });
                return { ok: true, url: page.url() };
            });
        }
        if (cmd === 'eval') return safe('eval', () => page.evaluate(`(async()=>{ ${arg} })()`));
        if (cmd === 'text')
            return safe('text', () => page.evaluate(() => document.body.innerText.slice(0, 8000)));
        if (cmd === 'shot') {
            return safe(`shot ${arg}`, async () => {
                const p = arg || '/tmp/stealth-shot.png';
                await page.screenshot({ path: p, fullPage: true });
                return { ok: true, path: p };
            });
        }
        if (cmd === 'cookies') {
            return safe('cookies', async () => {
                const c = await ctx.cookies();
                return c.map((x) => ({
                    name: x.name,
                    value: x.value.slice(0, 50),
                    domain: x.domain,
                }));
            });
        }
        if (cmd === 'storage') {
            return safe('storage', () =>
                page.evaluate(() => {
                    const out = { ls: {}, ss: {} };
                    for (let i = 0; i < localStorage.length; i++)
                        out.ls[localStorage.key(i)] = (
                            localStorage.getItem(localStorage.key(i)) || ''
                        ).slice(0, 200);
                    for (let i = 0; i < sessionStorage.length; i++)
                        out.ss[sessionStorage.key(i)] = (
                            sessionStorage.getItem(sessionStorage.key(i)) || ''
                        ).slice(0, 200);
                    return out;
                })
            );
        }
        log('Unknown command:', cmd);
    });
})();
