#!/usr/bin/env node
// Persistent browser session đã login TPOS + n2store.
// Gửi commands qua FIFO: echo "<cmd>" > /tmp/tpos-debug.fifo
// Commands:
//   nav <url>           - navigate
//   eval <js>           - run JS, print result
//   feval <js>          - run async JS (returns promise)
//   fetchtpos <url>     - fetch with credentials:'include' (TPOS cookies)
//   fetchcf <url>       - fetch CF worker (credentials:'omit')
//   nlast               - dump 20 last network calls
//   reqsby <pattern>    - dump network calls matching pattern
//   quit

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const FIFO = '/tmp/tpos-debug.fifo';

function readSecret() {
    const txt = fs.readFileSync(path.join(__dirname, '..', 'serect_dont_push.txt'), 'utf8');
    const find = (k) => {
        const m = txt.match(new RegExp(`^${k}\\s*[:=]?\\s*(.+)$`, 'm'));
        return m ? m[1].trim() : null;
    };
    return {
        tposAccess: find('TPOS_ACCESS_TOKEN'),
        tposRefresh: find('TPOS_REFRESH_TOKEN'),
    };
}

(async () => {
    const sec = readSecret();
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();

    const netLog = [];
    page.on('request', (r) => {
        netLog.push({ url: r.url(), method: r.method(), startedAt: Date.now() });
        if (netLog.length > 500) netLog.shift();
    });
    page.on('response', (r) => {
        const m = netLog.find((x) => x.url === r.url() && !x.respAt);
        if (m) {
            m.respAt = Date.now();
            m.status = r.status();
        }
    });

    await ctx.addInitScript((s) => {
        try {
            localStorage.setItem('accessToken', s.tposAccess);
            localStorage.setItem('refreshToken', s.tposRefresh);
            localStorage.setItem('clientId', 'tmtWebApp');
            localStorage.setItem('companyId', '1');
            localStorage.setItem('userName', 'nvkt');
            localStorage.setItem('tenantId', 'tomato.tpos.vn');
        } catch {}
    }, sec);

    // Login TPOS first (sets cookies)
    console.log('[session] Login TPOS...');
    await page.goto('https://tomato.tpos.vn/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    console.log('[session] TPOS URL:', page.url());

    // Setup FIFO
    if (!fs.existsSync(FIFO)) {
        require('child_process').execSync(`mkfifo ${FIFO}`);
    }
    console.log(`[session] READY. Send commands: echo "<cmd>" > ${FIFO}`);

    // Open FIFO for read (will block — keep open via tail)
    const rl = readline.createInterface({
        input: fs.createReadStream(FIFO, { flags: 'r+' }),
    });
    rl.on('line', async (line) => {
        line = line.trim();
        if (!line) return;
        const [cmd, ...rest] = line.split(/\s+/);
        const arg = rest.join(' ');
        try {
            if (cmd === 'quit') {
                console.log('[bye]');
                await browser.close();
                process.exit(0);
            } else if (cmd === 'nav') {
                console.log(`[nav] ${arg}`);
                await page.goto(arg, { timeout: 30000 });
                console.log(`[nav] → ${page.url()}`);
            } else if (cmd === 'eval' || cmd === 'feval') {
                const code = arg;
                const result = await page.evaluate(async (c) => {
                    try {
                        const fn = new Function('return (async () => { return (' + c + '); })()');
                        return await fn();
                    } catch (e) {
                        return { __err: String(e?.message || e) };
                    }
                }, code);
                console.log('[eval]', JSON.stringify(result, null, 2).slice(0, 2000));
            } else if (cmd === 'fetchtpos') {
                const url = arg;
                const r = await page.evaluate(async (u) => {
                    const r = await fetch(u, { credentials: 'include' });
                    let body = null;
                    try {
                        body = await r.json();
                    } catch {}
                    return { status: r.status, count: body?.data?.length, body };
                }, url);
                console.log('[fetchtpos]', JSON.stringify(r, null, 2).slice(0, 2000));
            } else if (cmd === 'fetchcf') {
                const url = arg;
                const r = await page.evaluate(async (u) => {
                    const r = await fetch(u, { credentials: 'omit' });
                    let body = null;
                    try {
                        body = await r.json();
                    } catch {}
                    return { status: r.status, count: body?.data?.length, body };
                }, url);
                console.log('[fetchcf]', JSON.stringify(r, null, 2).slice(0, 2000));
            } else if (cmd === 'nlast') {
                console.log('[nlast]');
                netLog.slice(-20).forEach((r) => {
                    console.log(
                        `  ${r.status || '...'} ${r.respAt ? r.respAt - r.startedAt + 'ms' : '?'} ${r.method} ${r.url.slice(0, 120)}`
                    );
                });
            } else if (cmd === 'reqsby') {
                console.log(`[reqsby ${arg}]`);
                netLog
                    .filter((r) => r.url.includes(arg))
                    .slice(-15)
                    .forEach((r) => {
                        console.log(
                            `  ${r.status || '...'} ${r.respAt ? r.respAt - r.startedAt + 'ms' : '?'} ${r.method} ${r.url.slice(0, 150)}`
                        );
                    });
            } else {
                console.log('[unknown cmd]', cmd);
            }
        } catch (e) {
            console.error('[err]', e.message);
        }
    });

    await new Promise(() => {});
})().catch((e) => {
    console.error('FATAL:', e.message);
    process.exit(1);
});
