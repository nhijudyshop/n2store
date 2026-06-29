#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module.
//
// Verify data load trên TẤT CẢ trang menu Web 2.0 sau khi tách DB (2026-06-03).
// Mỗi trang: nav → đợi API settle → log mọi API call (status, success, item count)
// + console errors. Mục tiêu: phát hiện trang nào data KHÔNG load (relation does
// not exist / 500 / success:false / empty) sau migration DB web2Db.
//
// Usage:
//   node scripts/web2-verify-data-load.js --base http://localhost:8080
//   node scripts/web2-verify-data-load.js                 # default localhost:8080
//
// Tự spawn `python3 -m http.server 8080` nếu localhost chưa listen.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ensureLocalServer } = require('./lib/ensure-local-server');
const { restoreLoginSession } = require('./restore-login-session');

const argv = process.argv.slice(2);
const getArg = (name, def) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const BASE = getArg('base', 'http://localhost:8080');
const USER = getArg('user', 'admin');
const PASS = getArg('pass', 'admin@@');
const PER_PAGE_MS = Number(getArg('per-page-ms', '8000'));

// Toàn bộ trang menu Web 2.0 (từ web2/shared/tpos-sidebar.js `our:` paths).
const PAGES = [
    '/web2/overview/index.html',
    '/web2/dashboard/index.html',
    '/web2/kpi/index.html',
    '/web2/notifications/index.html',
    '/web2/audit-log/index.html',
    '/web2/photo-studio/index.html',
    '/web2/users-permissions/index.html',
    '/web2/admin-sse-monitor/index.html',
    '/web2/services-dashboard/index.html',
    '/web2/fastsaleorder-invoice/index.html',
    '/web2/reconcile/index.html',
    '/web2/fastsaleorder-refund/index.html',
    '/web2/fastsaleorder-delivery/index.html',
    '/web2/live-campaign/index.html',
    '/native-orders/index.html',
    '/so-order/index.html',
    '/live-chat/index.html',
    '/web2/purchase-refund/index.html',
    '/web2/supplier-debt/index.html',
    '/web2/supplier-wallet/index.html',
    '/web2/balance-history/index.html',
    '/web2/partner-customer/index.html',
    '/web2/customer-wallet/index.html',
    '/web2/products/index.html',
    '/web2/variants/index.html',
    '/web2/report-revenue/index.html',
    '/web2/report-delivery/index.html',
    '/web2/users/index.html',
    '/web2/pancake-settings/index.html',
];

const isApi = (u) => /\/api\//.test(u) && !/\/realtime\/.*\/sse/.test(u);

function countItems(json) {
    if (Array.isArray(json)) return json.length;
    if (json && typeof json === 'object') {
        for (const k of ['data', 'items', 'rows', 'results', 'records', 'list']) {
            if (Array.isArray(json[k])) return json[k].length;
        }
        if (json.data && typeof json.data === 'object' && Array.isArray(json.data.items))
            return json.data.items.length;
    }
    return null;
}

async function login(browser) {
    const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        bypassCSP: true,
    });
    await ctx.route('**/*.js', (route) =>
        route.continue({
            headers: { ...route.request().headers(), 'cache-control': 'no-cache, no-store' },
        })
    );
    const snap = await restoreLoginSession(ctx, { base: BASE }).catch(() => null);
    if (snap) {
        console.log('[auth] restored stored session');
        return ctx;
    }
    console.log('[auth] no stored session → form login');
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#username', { timeout: 20000 });
    await page.fill('#username', USER);
    await page.fill('#password', PASS);
    await page.locator('#password').press('Enter');
    await page.waitForTimeout(2500);
    await page.close();
    return ctx;
}

async function checkPage(ctx, urlPath) {
    const url = `${BASE}${urlPath}?t=${Date.now()}`;
    const page = await ctx.newPage();
    const apis = []; // {url, status, ok, success, count}
    const consoleErrs = [];

    page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const t = msg.text();
        if (/^Failed to load resource/i.test(t) || /net::ERR_/i.test(t)) return; // network noise
        consoleErrs.push(t.slice(0, 240));
    });
    page.on('pageerror', (e) => consoleErrs.push('[pageerror] ' + (e.message || '').slice(0, 240)));

    page.on('response', async (resp) => {
        const ru = resp.url();
        if (!isApi(ru)) return;
        const status = resp.status();
        let success = null;
        let count = null;
        try {
            const ct = resp.headers()['content-type'] || '';
            if (/json/.test(ct)) {
                const j = await resp.json();
                if (j && typeof j === 'object' && 'success' in j) success = j.success;
                count = countItems(j);
            }
        } catch (_) {}
        apis.push({
            url: ru.replace(/[?&]t=\d+/, '').replace(/^https?:\/\/[^/]+/, ''),
            status,
            ok: resp.ok(),
            success,
            count,
        });
    });

    let navErr = null;
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForLoadState('networkidle', { timeout: PER_PAGE_MS }).catch(() => {});
    } catch (e) {
        navErr = (e.message || '').slice(0, 160);
    }
    await page.waitForTimeout(800);
    await page.close();

    // Dedup API by path, keep worst status.
    const byPath = new Map();
    for (const a of apis) {
        const prev = byPath.get(a.url);
        if (!prev || a.status >= prev.status) byPath.set(a.url, a);
    }
    const uniq = [...byPath.values()];
    const failed = uniq.filter((a) => !a.ok || a.success === false);
    return { urlPath, navErr, apis: uniq, failed, consoleErrs };
}

(async () => {
    if (/localhost|127\.0\.0\.1/.test(BASE)) {
        await ensureLocalServer(BASE, path.join(__dirname, '..'));
    }
    const browser = await chromium.launch({ headless: true });
    const ctx = await login(browser);

    const results = [];
    for (let i = 0; i < PAGES.length; i++) {
        const r = await checkPage(ctx, PAGES[i]);
        results.push(r);
        const apiN = r.apis.length;
        const failN = r.failed.length;
        const errN = r.consoleErrs.length;
        const totalRows = r.apis.reduce((s, a) => s + (a.count || 0), 0);
        const flag = failN || errN || r.navErr ? '❌' : apiN === 0 ? '⚪' : '✅';
        console.log(
            `${flag} [${String(i + 1).padStart(2)}/${PAGES.length}] ${r.urlPath}  ` +
                `api=${apiN} fail=${failN} err=${errN} rows≈${totalRows}` +
                (r.navErr ? `  NAV_ERR:${r.navErr}` : '')
        );
        for (const f of r.failed) {
            console.log(`      ↳ FAIL ${f.status} success=${f.success} ${f.url}`);
        }
        for (const e of r.consoleErrs.slice(0, 4)) {
            console.log(`      ↳ ERR ${e}`);
        }
    }

    // Summary
    const bad = results.filter((r) => r.failed.length || r.consoleErrs.length || r.navErr);
    const empty = results.filter((r) => !r.navErr && !r.failed.length && r.apis.length === 0);
    console.log('\n========== SUMMARY ==========');
    console.log(`Tổng trang: ${results.length}`);
    console.log(
        `✅ OK (có data load): ${results.filter((r) => r.apis.length && !r.failed.length && !r.consoleErrs.length && !r.navErr).length}`
    );
    console.log(
        `⚪ Không gọi API (tĩnh/manual): ${empty.length}  → ${empty.map((r) => r.urlPath).join(', ') || '—'}`
    );
    console.log(`❌ Có lỗi: ${bad.length}`);
    for (const r of bad) {
        console.log(
            `   ${r.urlPath}: fail=${r.failed.length} err=${r.consoleErrs.length}${r.navErr ? ' nav=' + r.navErr : ''}`
        );
    }

    const outDir = path.join(__dirname, '..', 'downloads', 'n2store-session');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
        path.join(outDir, 'web2-data-load-report.json'),
        JSON.stringify(results, null, 2)
    );
    console.log(`\nReport: downloads/n2store-session/web2-data-load-report.json`);

    await browser.close();
    process.exit(bad.length ? 1 : 0);
})();
