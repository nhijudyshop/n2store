#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * Resident.vn crawler v2 — capture XHR/fetch trên MỌI host (không chỉ same-origin)
 *
 * - Reuse cookies từ session đã login (cookies.json từ run trước) hoặc chờ login lại.
 * - BFS các route đã biết từ manifest v1.
 * - Wait kỹ cho SPA fetch hết data (3s networkidle + scroll).
 * - Capture mọi response JSON/XHR bất kể host.
 *
 * Usage:
 *   node scripts/resident-crawl-v2.js
 *   COOKIES=/path/to/cookies.json node scripts/resident-crawl-v2.js   # reuse cookies
 *   ROUTES=/path/to/routes.json node scripts/resident-crawl-v2.js     # custom routes list
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT_HOST = 'app.resident.vn';
const APP_ROOT = `https://${ROOT_HOST}`;

const TS = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_DIR = path.resolve(__dirname, '..', 'downloads', 'resident-crawl', TS + '-v2');
const PAGES_DIR = path.join(OUT_DIR, 'pages');
const API_DIR = path.join(OUT_DIR, 'api');
const SHOTS_DIR = path.join(OUT_DIR, 'screenshots');
[OUT_DIR, PAGES_DIR, API_DIR, SHOTS_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));

// Lấy cookies file mới nhất từ run v1
function findLatestCookies() {
    const baseDir = path.resolve(__dirname, '..', 'downloads', 'resident-crawl');
    if (!fs.existsSync(baseDir)) return null;
    const dirs = fs
        .readdirSync(baseDir)
        .filter((d) => !d.endsWith('-v2'))
        .map((d) => path.join(baseDir, d, 'cookies.json'))
        .filter(fs.existsSync)
        .sort();
    return dirs.length ? dirs[dirs.length - 1] : null;
}

const COOKIES_FILE = process.env.COOKIES || findLatestCookies();
console.log(`[info] cookies file: ${COOKIES_FILE || '(none, will require login)'}`);

// Routes - hardcode từ kết quả v1
const DEFAULT_ROUTES = [
    '/',
    '/apartment-layout',
    '/notifications',
    '/tasks',
    '/tasks/all',
    '/general-setting',
    '/apartments',
    '/rooms',
    '/beds',
    '/leads',
    '/leads?leadStatus=new',
    '/leads?leadStatus=success',
    '/reservations',
    '/reservations?reservationStatus=2',
    '/reservations?reservationStatuses=1',
    '/contracts',
    '/invoices',
    '/invoices?month=04-2026',
    '/finance/cash-flow',
    '/changelog',
    '/locations',
    '/fees',
    '/inventory/assets',
    '/tenants/active',
    '/vehicles',
    '/meter-logs',
    '/meter-logs?month=04-2026',
    '/income-expenses',
];
const ROUTES = process.env.ROUTES
    ? JSON.parse(fs.readFileSync(process.env.ROUTES, 'utf8'))
    : DEFAULT_ROUTES;

function slug(u) {
    try {
        const url = new URL(u, APP_ROOT);
        const p = (url.host + url.pathname + url.search)
            .replace(/[^a-z0-9]+/gi, '_')
            .replace(/^_+|_+$/g, '');
        return (p || 'root').slice(0, 140);
    } catch {
        return 'unknown';
    }
}

async function main() {
    const browser = await chromium.launch({
        headless: false,
        args: ['--disable-blink-features=AutomationControlled'],
    });
    const context = await browser.newContext({
        viewport: { width: 1366, height: 850 },
        userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    if (COOKIES_FILE) {
        try {
            const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
            await context.addCookies(cookies);
            console.log(`[ok] đã load ${cookies.length} cookies`);
        } catch (e) {
            console.warn(`[warn] không load được cookies: ${e.message}`);
        }
    }

    const page = await context.newPage();

    const manifest = {
        startedAt: new Date().toISOString(),
        host: ROOT_HOST,
        routes: ROUTES,
        pages: [],
        api: [],
        hosts: {},
        errors: [],
    };

    let counter = 0;
    page.on('response', async (res) => {
        const url = res.url();
        const req = res.request();
        const resourceType = req.resourceType();
        if (!['xhr', 'fetch', 'document', 'eventsource', 'websocket'].includes(resourceType))
            return;
        try {
            const ct = (res.headers()['content-type'] || '').toLowerCase();
            const status = res.status();
            const method = req.method();
            const isJson = ct.includes('json');
            const isText = ct.includes('text') || ct.includes('xml');
            if (!isJson && !isText && resourceType !== 'document') return;
            const buf = await res.body().catch(() => null);
            if (!buf) return;
            const idx = String(++counter).padStart(4, '0');
            const ext = isJson ? 'json' : ct.includes('html') ? 'html' : 'txt';
            const fname = `${idx}-${method}-${slug(url)}.${ext}`;
            const fpath = path.join(API_DIR, fname);
            fs.writeFileSync(fpath, buf);
            const host = new URL(url).host;
            manifest.hosts[host] = (manifest.hosts[host] || 0) + 1;
            manifest.api.push({
                idx,
                method,
                url,
                host,
                status,
                contentType: ct,
                resourceType,
                size: buf.length,
                postData: req.postData() || null,
                file: path.relative(OUT_DIR, fpath),
            });
        } catch {}
    });

    // Login check: đi tới root, nếu vẫn redirect /auth/signin thì chờ user login
    console.log('[step] Đi tới root để verify auth ...');
    await page.goto(APP_ROOT + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    let url0 = page.url();
    if (url0.includes('/auth/signin')) {
        console.log('[wait] cookies hết hạn — vui lòng login lại trên Chromium ...');
        const start = Date.now();
        while (Date.now() - start < 15 * 60 * 1000) {
            if (!page.url().includes('/auth/signin')) break;
            await page.waitForTimeout(1500);
        }
    }
    // save cookies sau khi confirmed login
    fs.writeFileSync(
        path.join(OUT_DIR, 'cookies.json'),
        JSON.stringify(await context.cookies(), null, 2)
    );

    // Crawl từng route, chờ kỹ
    for (let i = 0; i < ROUTES.length; i++) {
        const route = ROUTES[i];
        const full = APP_ROOT + route;
        console.log(`[crawl ${i + 1}/${ROUTES.length}] ${full}`);
        try {
            await page.goto(full, { waitUntil: 'domcontentloaded', timeout: 30000 });
            // chờ networkidle dài hơn, để SPA fetch xong
            await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
            // scroll để trigger lazy
            await page
                .evaluate(async () => {
                    await new Promise((res) => {
                        let total = 0;
                        const step = () => {
                            window.scrollBy(0, 800);
                            total += 800;
                            if (total >= document.body.scrollHeight + 1500) return res();
                            setTimeout(step, 200);
                        };
                        step();
                    });
                })
                .catch(() => {});
            await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
            await page.waitForTimeout(1200);

            const html = await page.content();
            const sl = slug(route || '/');
            fs.writeFileSync(path.join(PAGES_DIR, `${sl}.html`), html);
            await page
                .screenshot({ path: path.join(SHOTS_DIR, `${sl}.png`), fullPage: true })
                .catch(() => {});
            const title = await page.title().catch(() => '');
            manifest.pages.push({
                route,
                finalUrl: page.url(),
                title,
                slug: sl,
            });
        } catch (e) {
            manifest.errors.push({ route, error: String(e.message || e) });
            console.warn(`[err] ${route} → ${e.message}`);
        }
    }

    manifest.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

    console.log('\n=== DONE v2 ===');
    console.log(`pages : ${manifest.pages.length}`);
    console.log(`api   : ${manifest.api.length}`);
    console.log(`hosts : ${JSON.stringify(manifest.hosts)}`);
    console.log(`errors: ${manifest.errors.length}`);
    console.log(`out   : ${OUT_DIR}`);

    await browser.close();
}

main().catch((e) => {
    console.error('[fatal]', e);
    process.exit(1);
});
