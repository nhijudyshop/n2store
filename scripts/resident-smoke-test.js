#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/** Smoke test clone — start static server, screenshot từng route */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const CLONE_DIR = path.join(ROOT, 'resident');
const OUT_DIR = path.join(ROOT, 'downloads', 'resident-clone-smoke');
fs.mkdirSync(OUT_DIR, { recursive: true });
const PORT = 8766;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
};

function startServer() {
    return new Promise((resolve) => {
        const s = http.createServer((req, res) => {
            const u = decodeURIComponent((req.url || '/').split('?')[0]);
            const p = path.join(CLONE_DIR, u === '/' ? 'index.html' : u);
            if (!p.startsWith(CLONE_DIR)) return res.writeHead(403).end();
            fs.stat(p, (err, st) => {
                if (err || !st.isFile()) return res.writeHead(404).end('404 ' + u);
                res.writeHead(200, {
                    'Content-Type': MIME[path.extname(p)] || 'application/octet-stream',
                });
                fs.createReadStream(p).pipe(res);
            });
        });
        s.listen(PORT, () => resolve(s));
    });
}

const ROUTES = [
    '/',
    '/apartments',
    '/rooms',
    '/leads',
    '/contracts',
    '/invoices',
    '/income-expenses',
    '/finance/cash-flow',
    '/tenants/active',
    '/tasks/all',
    '/notifications',
    '/general-setting',
    '/changelog',
];

async function main() {
    const server = await startServer();
    console.log('[ok] server :' + PORT);
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 850 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push({ type: 'pageerror', msg: e.message }));
    page.on('console', (m) => {
        if (m.type() === 'error') errors.push({ type: 'console', msg: m.text() });
    });

    const results = [];
    for (const r of ROUTES) {
        const url = `http://localhost:${PORT}/#${r}`;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(800);
        const title = await page
            .locator('#route-title')
            .textContent()
            .catch(() => '');
        const bodyHasContent = await page.evaluate(() => {
            const b = document.getElementById('route-body');
            return b && b.innerText.length > 30;
        });
        const fname = (r.replace(/[^a-z0-9]+/gi, '_') || 'root') + '.png';
        await page.screenshot({ path: path.join(OUT_DIR, fname), fullPage: false });
        results.push({ route: r, title, bodyHasContent });
        console.log(`  ${bodyHasContent ? '✓' : '✗'} ${r.padEnd(28)} → ${title}`);
    }

    fs.writeFileSync(
        path.join(OUT_DIR, 'smoke.json'),
        JSON.stringify({ results, errors, timestamp: new Date().toISOString() }, null, 2)
    );
    console.log('\nErrors:', errors.length);
    if (errors.length) console.log(errors.slice(0, 5));
    console.log('Screenshots:', OUT_DIR);

    await browser.close();
    server.close();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
