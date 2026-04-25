#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * Deep compare: 2 tab Chromium song song chạy lần lượt qua mọi route
 *  - Tab A: clone (http://localhost:8765/#<route>)
 *  - Tab B: live (https://app.resident.vn<route>) với storageState
 *
 * Mỗi route: chụp ảnh + đếm DOM + capture XHR live → ghi report.
 * Mục tiêu: phát hiện chỗ clone thiếu chức năng so với live.
 *
 * Output: downloads/resident-deep-compare/<ts>/
 *   ├── live/<slug>.png            — full-page live
 *   ├── clone/<slug>.png           — full-page clone
 *   ├── live/<slug>.dom.json       — DOM stats live
 *   ├── clone/<slug>.dom.json      — DOM stats clone
 *   ├── live/<slug>.xhr.json       — XHR captured trên route đó
 *   ├── REPORT.md                  — diff side-by-side dạng human-readable
 *   └── manifest.json
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(ROOT, 'downloads', 'resident-crawl', 'auth-state.json');
const CLONE_DIR = path.join(ROOT, 'resident');
const PORT = Number(process.env.PORT || 8765);

const TS = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = path.join(ROOT, 'downloads', 'resident-deep-compare', TS);
['live', 'clone'].forEach((d) => fs.mkdirSync(path.join(OUT, d), { recursive: true }));

if (!fs.existsSync(STATE_FILE)) {
    console.error('[fatal] cần auth-state.json — chạy resident-save-auth.js');
    process.exit(1);
}

const ROUTES = [
    { path: '/', title: 'Bảng điều khiển' },
    { path: '/apartments', title: 'Toà nhà' },
    { path: '/rooms', title: 'Phòng' },
    { path: '/beds', title: 'Giường' },
    { path: '/apartment-layout', title: 'Sơ đồ toà nhà' },
    { path: '/locations', title: 'Khu vực' },
    { path: '/leads', title: 'Lead khách' },
    { path: '/reservations', title: 'Đặt cọc' },
    { path: '/contracts', title: 'Hợp đồng' },
    { path: '/tenants/active', title: 'Cư dân' },
    { path: '/vehicles', title: 'Phương tiện' },
    { path: '/invoices', title: 'Hoá đơn' },
    { path: '/income-expenses', title: 'Thu chi' },
    { path: '/finance/cash-flow', title: 'Dòng tiền' },
    { path: '/fees', title: 'Khoản thu' },
    { path: '/meter-logs', title: 'Chỉ số đồng hồ' },
    { path: '/tasks', title: 'Việc của tôi' },
    { path: '/tasks/all', title: 'Tất cả việc' },
    { path: '/notifications', title: 'Thông báo' },
    { path: '/inventory/assets', title: 'Tài sản' },
    { path: '/general-setting', title: 'Cài đặt' },
];

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
};

function startServer() {
    return new Promise((resolve) => {
        const s = http.createServer((req, res) => {
            const u = decodeURIComponent((req.url || '/').split('?')[0]);
            const p = path.join(CLONE_DIR, u === '/' ? 'index.html' : u);
            if (!p.startsWith(CLONE_DIR)) return res.writeHead(403).end();
            fs.stat(p, (err, st) => {
                if (err || !st.isFile()) return res.writeHead(404).end();
                res.writeHead(200, {
                    'Content-Type': MIME[path.extname(p)] || 'application/octet-stream',
                });
                fs.createReadStream(p).pipe(res);
            });
        });
        s.listen(PORT, () => resolve(s));
    });
}

function slug(p) {
    return p.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'root';
}

async function domStats(page) {
    return await page.evaluate(() => {
        const body = document.body;
        if (!body) return null;
        const counts = (sel) => document.querySelectorAll(sel).length;
        const all = document.querySelectorAll('*');
        const interactives = document.querySelectorAll(
            'button, a[href], input, select, [role="button"], [role="tab"], [role="menuitem"]'
        );
        const buttonsTexts = [...document.querySelectorAll('button')]
            .map((b) => (b.innerText || b.title || '').trim())
            .filter((s) => s && s.length < 50)
            .slice(0, 50);
        const headings = [...document.querySelectorAll('h1,h2,h3')]
            .map((h) => h.innerText.trim())
            .filter((s) => s)
            .slice(0, 30);
        const navLinks = [...document.querySelectorAll('nav a, aside a, [role="navigation"] a')]
            .map((a) => (a.innerText || a.getAttribute('aria-label') || '').trim())
            .filter((s) => s)
            .slice(0, 60);
        const tableRows = counts('table tr, [role="row"]');
        const tabs = [...document.querySelectorAll('[role="tab"], .tab, .nav-tabs li, .tabs li')]
            .map((t) => t.innerText.trim())
            .filter((s) => s)
            .slice(0, 20);
        const filters = [
            ...document.querySelectorAll(
                'select, input[type="search"], input[placeholder*="ìm"], input[placeholder*="earch"]'
            ),
        ]
            .map((i) => i.placeholder || i.getAttribute('aria-label') || i.name || '')
            .filter((s) => s)
            .slice(0, 20);
        return {
            url: location.href,
            title: document.title,
            allCount: all.length,
            interactiveCount: interactives.length,
            tableRows,
            buttons: buttonsTexts,
            headings,
            navLinks,
            tabs,
            filters,
        };
    });
}

async function main() {
    const server = await startServer();
    console.log(`[ok] server :${PORT}`);

    const browser = await chromium.launch({
        headless: false,
        args: ['--disable-blink-features=AutomationControlled'],
    });
    const ctxClone = await browser.newContext({ viewport: { width: 1366, height: 850 } });
    const ctxLive = await browser.newContext({
        viewport: { width: 1366, height: 850 },
        storageState: STATE_FILE,
    });
    const tabClone = await ctxClone.newPage();
    const tabLive = await ctxLive.newPage();

    // Capture XHR theo route hiện tại
    let currentRouteSlug = null;
    const xhrByRoute = new Map();
    tabLive.on('response', async (res) => {
        if (!currentRouteSlug) return;
        const url = res.url();
        if (!url.includes('api.resident.vn')) return;
        const req = res.request();
        if (!['xhr', 'fetch'].includes(req.resourceType())) return;
        try {
            const ct = (res.headers()['content-type'] || '').toLowerCase();
            if (!ct.includes('json')) return;
            const buf = await res.body().catch(() => null);
            if (!buf) return;
            const list = xhrByRoute.get(currentRouteSlug) || [];
            list.push({
                method: req.method(),
                url,
                status: res.status(),
                size: buf.length,
                sample: buf.slice(0, 800).toString('utf8'),
            });
            xhrByRoute.set(currentRouteSlug, list);
        } catch {}
    });

    await tabClone.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await tabLive.goto('https://app.resident.vn/', { waitUntil: 'domcontentloaded' });
    await tabLive.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});

    if (tabLive.url().includes('/auth/signin')) {
        console.error('[fatal] state hết hạn — chạy resident-save-auth.js');
        await browser.close();
        process.exit(2);
    }
    console.log('[ok] tab clone + live ready');

    const results = [];
    for (let i = 0; i < ROUTES.length; i++) {
        const route = ROUTES[i];
        const sl = slug(route.path);
        currentRouteSlug = sl;
        console.log(`\n[${i + 1}/${ROUTES.length}] ${route.path}  (${route.title})`);

        try {
            await Promise.all([
                tabClone.goto(`http://localhost:${PORT}/#${route.path}`, {
                    waitUntil: 'domcontentloaded',
                }),
                tabLive.goto(`https://app.resident.vn${route.path}`, {
                    waitUntil: 'domcontentloaded',
                }),
            ]);
            await tabLive.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
            await Promise.all([
                tabClone.evaluate(
                    () =>
                        new Promise((r) => {
                            let t = 0;
                            const s = () => {
                                window.scrollBy(0, 800);
                                t += 800;
                                if (t >= document.body.scrollHeight + 1000) return r();
                                setTimeout(s, 200);
                            };
                            s();
                        })
                ),
                tabLive.evaluate(
                    () =>
                        new Promise((r) => {
                            let t = 0;
                            const s = () => {
                                window.scrollBy(0, 800);
                                t += 800;
                                if (t >= document.body.scrollHeight + 1000) return r();
                                setTimeout(s, 200);
                            };
                            s();
                        })
                ),
            ]).catch(() => {});
            await tabLive.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
            await tabClone.waitForTimeout(800);

            const [domClone, domLive] = await Promise.all([domStats(tabClone), domStats(tabLive)]);
            await Promise.all([
                tabClone
                    .screenshot({ path: path.join(OUT, 'clone', sl + '.png'), fullPage: true })
                    .catch(() => {}),
                tabLive
                    .screenshot({ path: path.join(OUT, 'live', sl + '.png'), fullPage: true })
                    .catch(() => {}),
            ]);
            fs.writeFileSync(
                path.join(OUT, 'clone', sl + '.dom.json'),
                JSON.stringify(domClone, null, 2)
            );
            fs.writeFileSync(
                path.join(OUT, 'live', sl + '.dom.json'),
                JSON.stringify(domLive, null, 2)
            );
            const xhr = xhrByRoute.get(sl) || [];
            fs.writeFileSync(
                path.join(OUT, 'live', sl + '.xhr.json'),
                JSON.stringify(xhr, null, 2)
            );

            results.push({
                route: route.path,
                title: route.title,
                slug: sl,
                clone: {
                    allCount: domClone?.allCount,
                    interactives: domClone?.interactiveCount,
                    tableRows: domClone?.tableRows,
                    headings: domClone?.headings?.length,
                    buttons: domClone?.buttons?.length,
                    navLinks: domClone?.navLinks?.length,
                },
                live: {
                    allCount: domLive?.allCount,
                    interactives: domLive?.interactiveCount,
                    tableRows: domLive?.tableRows,
                    headings: domLive?.headings?.length,
                    buttons: domLive?.buttons?.length,
                    navLinks: domLive?.navLinks?.length,
                },
                xhrCount: xhr.length,
                xhrUniqueEndpoints: [
                    ...new Set(xhr.map((x) => x.method + ' ' + new URL(x.url).pathname)),
                ],
            });
            console.log(
                `  clone: ${domClone?.allCount} els, ${domClone?.interactiveCount} ifs, rows=${domClone?.tableRows}`
            );
            console.log(
                `  live : ${domLive?.allCount} els, ${domLive?.interactiveCount} ifs, rows=${domLive?.tableRows}, xhr=${xhr.length}`
            );
        } catch (e) {
            console.warn(`  [err] ${e.message}`);
            results.push({ route: route.path, error: String(e.message || e) });
        }
    }

    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(results, null, 2));

    // Generate REPORT.md
    const ratio = (a, b) => (a && b ? ((a / b) * 100).toFixed(0) + '%' : '—');
    let md = `# Resident clone vs live — deep compare\n\n`;
    md += `Run: ${TS}\n\n`;
    md += `| Route | Title | Clone els | Live els | Coverage | Buttons C/L | Headings C/L | Rows C/L | XHR live | Endpoints |\n`;
    md += `|---|---|---:|---:|---:|---:|---:|---:|---:|---|\n`;
    for (const r of results) {
        if (r.error) {
            md += `| \`${r.route}\` | ERR | — | — | — | — | — | — | — | ${r.error} |\n`;
            continue;
        }
        md += `| \`${r.route}\` | ${r.title} | ${r.clone.allCount} | ${r.live.allCount} | ${ratio(r.clone.allCount, r.live.allCount)} | ${r.clone.buttons}/${r.live.buttons} | ${r.clone.headings}/${r.live.headings} | ${r.clone.tableRows}/${r.live.tableRows} | ${r.xhrCount} | ${r.xhrUniqueEndpoints?.slice(0, 5).join('<br>') || ''} |\n`;
    }

    md += `\n## XHR endpoints quan sát theo route\n\n`;
    for (const r of results) {
        if (!r.xhrUniqueEndpoints || !r.xhrUniqueEndpoints.length) continue;
        md += `### \`${r.route}\` (${r.title})\n\n`;
        for (const ep of r.xhrUniqueEndpoints) md += `- \`${ep}\`\n`;
        md += `\n`;
    }

    md += `\n## Buttons xuất hiện ở live nhưng KHÔNG ở clone (sample 20 đầu)\n\n`;
    for (const r of results) {
        const liveBtnsPath = path.join(OUT, 'live', r.slug + '.dom.json');
        const cloneBtnsPath = path.join(OUT, 'clone', r.slug + '.dom.json');
        if (!fs.existsSync(liveBtnsPath) || !fs.existsSync(cloneBtnsPath)) continue;
        const live = JSON.parse(fs.readFileSync(liveBtnsPath, 'utf8'));
        const clone = JSON.parse(fs.readFileSync(cloneBtnsPath, 'utf8'));
        const diff = (live.buttons || []).filter(
            (b) => !(clone.buttons || []).some((c) => c.includes(b) || b.includes(c))
        );
        if (!diff.length) continue;
        md += `### \`${r.route}\`\n\n`;
        for (const b of diff.slice(0, 20)) md += `- ${b}\n`;
        md += `\n`;
    }

    fs.writeFileSync(path.join(OUT, 'REPORT.md'), md);
    console.log(`\n[ok] manifest: ${path.join(OUT, 'manifest.json')}`);
    console.log(`[ok] report  : ${path.join(OUT, 'REPORT.md')}`);
    console.log(
        `[ok] live xhr: ${[...xhrByRoute.values()].reduce((s, l) => s + l.length, 0)} requests captured`
    );

    // Giữ tab mở để user view; chỉ exit khi browser đóng tay
    browser.on('disconnected', () => process.exit(0));
    if (!process.stdin.isTTY) {
        console.log('\n[ok] 2 tab vẫn mở. Đóng cửa sổ Chromium để exit.');
    } else {
        console.log('Nhấn Ctrl+C để đóng.');
    }
}

main().catch((e) => {
    console.error('[fatal]', e);
    process.exit(1);
});
