// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// One-off: mở browser headful đến Kling dev portal, để user login manual,
// rồi nhận command qua stdin (FIFO) để extract API key/secret từ page.
// USAGE: (tail -f /tmp/kling.fifo) | node scripts/kling-api-extract.js

const { chromium } = require('playwright');
const readline = require('readline');

const KLING_URLS = [
    'https://app.klingai.com/global/dev/api-key',
    'https://app.klingai.com/global/dev',
    'https://app.klingai.com/global/dev/api-management',
    'https://app.klingai.com/global/dev/document-api',
];

const log = (...args) => console.log(`[${new Date().toISOString()}]`, ...args);

(async () => {
    log('Launching Chromium headful — user sẽ login Kling manual…');
    const browser = await chromium.launch({
        headless: false,
        args: ['--start-maximized'],
    });
    const ctx = await browser.newContext({
        viewport: null,
        locale: 'en-US',
    });
    const page = await ctx.newPage();

    // Navigate to first candidate URL
    await page.goto(KLING_URLS[0], { waitUntil: 'domcontentloaded' }).catch(() => {});
    log('Page opened:', page.url());
    log('→ Login Kling account trong browser. Sau đó type lệnh ở stdin/FIFO.');
    log('Available commands:');
    log('  url             — current URL');
    log('  goto <url>      — navigate');
    log('  scrape          — auto-scan page for API key/secret patterns');
    log('  eval <js>       — run JS in page, log return');
    log('  cookies         — dump cookies (session/auth)');
    log('  storage         — dump localStorage + sessionStorage');
    log('  text            — dump visible body text (for scraping)');
    log('  shot <path>     — screenshot');
    log('  quit            — close');

    const safe = async (label, fn) => {
        try {
            const r = await fn();
            const s = r === undefined ? 'undefined' : JSON.stringify(r, null, 2);
            log(`${label} →`, (s == null ? String(s) : s).slice(0, 4000));
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
            await browser.close();
            process.exit(0);
        }
        if (cmd === 'url') {
            log('URL:', page.url());
            return;
        }
        if (cmd === 'goto') {
            await safe(`goto ${arg}`, async () => {
                await page.goto(arg, { waitUntil: 'domcontentloaded' });
                return { ok: true, url: page.url() };
            });
            return;
        }
        if (cmd === 'eval') {
            await safe('eval', () => page.evaluate(`(async()=>{ ${arg} })()`));
            return;
        }
        if (cmd === 'cookies') {
            await safe('cookies', async () => {
                const cookies = await ctx.cookies();
                return cookies.map((c) => ({
                    name: c.name,
                    value: c.value.slice(0, 80),
                    domain: c.domain,
                    path: c.path,
                    expires: c.expires,
                    httpOnly: c.httpOnly,
                    secure: c.secure,
                }));
            });
            return;
        }
        if (cmd === 'storage') {
            await safe('storage', () =>
                page.evaluate(() => {
                    const ls = {};
                    const ss = {};
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        const v = localStorage.getItem(k) || '';
                        ls[k] = v.length > 200 ? v.slice(0, 200) + '…' : v;
                    }
                    for (let i = 0; i < sessionStorage.length; i++) {
                        const k = sessionStorage.key(i);
                        const v = sessionStorage.getItem(k) || '';
                        ss[k] = v.length > 200 ? v.slice(0, 200) + '…' : v;
                    }
                    return { localStorage: ls, sessionStorage: ss };
                })
            );
            return;
        }
        if (cmd === 'text') {
            await safe('text', () => page.evaluate(() => document.body.innerText.slice(0, 6000)));
            return;
        }
        if (cmd === 'scrape') {
            // Auto-scan page + storage for API key / secret patterns.
            await safe('scrape', () =>
                page.evaluate(() => {
                    const out = { found: [], hints: [] };
                    const haystacks = [];
                    haystacks.push({ src: 'body', text: document.body.innerText });
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        haystacks.push({
                            src: 'localStorage:' + k,
                            text: localStorage.getItem(k) || '',
                        });
                    }
                    for (let i = 0; i < sessionStorage.length; i++) {
                        const k = sessionStorage.key(i);
                        haystacks.push({
                            src: 'sessionStorage:' + k,
                            text: sessionStorage.getItem(k) || '',
                        });
                    }
                    // Common Kling key formats:
                    //   AccessKey: alphanumeric ~24 chars
                    //   SecretKey: alphanumeric ~32+ chars
                    //   JWT-formatted token (eyJ…)
                    const patterns = [
                        { name: 'AccessKey-like', re: /\b[A-Za-z0-9]{20,32}\b/g, max: 5 },
                        { name: 'SecretKey-like', re: /\b[A-Za-z0-9]{40,}\b/g, max: 5 },
                        {
                            name: 'JWT',
                            re: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
                            max: 3,
                        },
                    ];
                    for (const h of haystacks) {
                        for (const p of patterns) {
                            const m = (h.text || '').match(p.re);
                            if (m) {
                                out.found.push({
                                    src: h.src,
                                    pattern: p.name,
                                    matches: m.slice(0, p.max),
                                });
                            }
                        }
                    }
                    // Also scan input values (forms might have key fields)
                    const inputs = Array.from(document.querySelectorAll('input'));
                    for (const i of inputs) {
                        if (i.value && i.value.length >= 20 && i.value.length <= 200) {
                            out.hints.push({
                                src: `input[${i.name || i.id || i.type}]`,
                                value: i.value.slice(0, 120),
                            });
                        }
                    }
                    // Look for elements/buttons mentioning "key", "secret"
                    const buttons = Array.from(document.querySelectorAll('button, .ant-btn'));
                    out.hints.push({
                        src: 'buttons',
                        labels: buttons
                            .map((b) => (b.textContent || '').trim())
                            .filter((t) => /key|secret|generate|create/i.test(t))
                            .slice(0, 8),
                    });
                    return out;
                })
            );
            return;
        }
        if (cmd === 'shot') {
            await safe(`shot ${arg}`, async () => {
                await page.screenshot({ path: arg || '/tmp/kling-shot.png', fullPage: true });
                return { ok: true, path: arg || '/tmp/kling-shot.png' };
            });
            return;
        }
        log('Unknown command:', cmd, '— type "quit" to exit.');
    });
})();
