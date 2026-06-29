#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// 3-tab persistent browser test — opens tpos-pancake + products + native-orders
// in same BrowserContext, lets user observe realtime SSE across tabs.
// Exposes minimal HTTP API on port 9998 to send commands per tab.

const { chromium } = require('playwright');
const http = require('http');
const {
    restoreLoginSession,
} = require('/Users/mac/Desktop/n2store/scripts/restore-login-session.js');

const BASE = process.env.BASE || 'http://localhost:8080';
const HTTP_PORT = 9998;

(async () => {
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext();
    await restoreLoginSession(ctx, { base: BASE });

    const pages = {
        tpos: await ctx.newPage(),
        products: await ctx.newPage(),
        native: await ctx.newPage(),
    };

    console.log('[multi-tab] Opening 3 tabs…');
    await pages.tpos.goto(`${BASE}/live-chat/index.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
    });
    await pages.products.goto(`${BASE}/web2/products/index.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
    });
    await pages.native.goto(`${BASE}/native-orders/index.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
    });
    console.log('[multi-tab] All 3 tabs open. URLs:');
    for (const [name, p] of Object.entries(pages)) console.log(`  ${name.padEnd(8)} → ${p.url()}`);

    // HTTP API: POST /eval?tab=tpos {"js":"..."} → run JS in given tab
    http.createServer(async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);
        const tab = url.searchParams.get('tab') || 'tpos';
        if (!(tab in pages)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'unknown tab: ' + tab }));
            return;
        }
        if (req.method === 'GET' && url.pathname === '/health') {
            res.end(
                JSON.stringify({
                    ok: true,
                    tabs: Object.fromEntries(Object.entries(pages).map(([k, p]) => [k, p.url()])),
                })
            );
            return;
        }
        if (req.method === 'POST' && url.pathname === '/eval') {
            let body = '';
            req.on('data', (c) => (body += c));
            req.on('end', async () => {
                try {
                    const { js } = JSON.parse(body || '{}');
                    if (!js) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ error: 'missing js' }));
                        return;
                    }
                    const result = await pages[tab].evaluate(js);
                    res.end(JSON.stringify({ ok: true, tab, result }));
                } catch (e) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'unknown route' }));
    }).listen(HTTP_PORT, '127.0.0.1', () =>
        console.log(`[multi-tab] HTTP API on http://127.0.0.1:${HTTP_PORT}`)
    );

    process.on('SIGTERM', async () => {
        await browser.close();
        process.exit(0);
    });
    // Keep running
    await new Promise(() => {});
})();
