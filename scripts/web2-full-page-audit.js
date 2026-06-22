// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 test. Audit chi tiết từng trang menu Web 2.0.
const { chromium } = require('playwright');
const { restoreLoginSession } = require('./restore-login-session');
const { ensureLocalServer } = require('./lib/ensure-local-server');
const fs = require('fs');

const BASE = 'http://localhost:8080';
const OUT_DIR = 'downloads/n2store-session';

// 34 trang menu Web 2.0 (label + path), theo thứ tự sidebar.
const PAGES = [
    ['Tổng quan', '/web2/overview/index.html'],
    ['Dashboard KPI', '/web2/dashboard/index.html'],
    ['KPI Nhân viên', '/web2/kpi/index.html'],
    ['Thông báo', '/web2/notifications/index.html'],
    ['Lịch sử thao tác', '/web2/audit-log/index.html'],
    ['Đối soát CK', '/web2/ck-dashboard/index.html'],
    ['Studio chụp tách nền', '/web2/photo-studio/index.html'],
    ['Phân quyền', '/web2/users-permissions/index.html'],
    ['SSE Monitor', '/web2/admin-sse-monitor/index.html'],
    ['Bảng dịch vụ & chi phí', '/web2/services-dashboard/index.html'],
    ['Bán hàng (PBH)', '/web2/fastsaleorder-invoice/index.html'],
    ['Đối soát đóng gói', '/web2/reconcile/index.html'],
    ['Trả hàng (PBH refund)', '/web2/fastsaleorder-refund/index.html'],
    ['Thu về (returns)', '/web2/returns/index.html'],
    ['Phiếu giao hàng', '/web2/fastsaleorder-delivery/index.html'],
    ['Đơn Web (native-orders)', '/native-orders/index.html'],
    ['Sổ Order', '/so-order/index.html'],
    ['Live Chat', '/live-chat/index.html'],
    ['Trả hàng NCC', '/web2/purchase-refund/index.html'],
    ['Công nợ NCC', '/web2/supplier-debt/index.html'],
    ['Ví NCC', '/web2/supplier-wallet/index.html'],
    ['Lịch sử số dư (SePay)', '/web2/balance-history/index.html'],
    ['Kho Khách Hàng', '/web2/customers/index.html'],
    ['Ví Khách Hàng', '/web2/customer-wallet/index.html'],
    ['Kho SP', '/web2/products/index.html'],
    ['Kho Biến Thể', '/web2/variants/index.html'],
    ['Thống kê doanh thu', '/web2/report-revenue/index.html'],
    ['Thống kê giao hàng', '/web2/report-delivery/index.html'],
    ['Lấy comment Live', '/web2/livestream-poller/index.html'],
    ['Người dùng', '/web2/users/index.html'],
    ['Pancake (Token)', '/web2/pancake-settings/index.html'],
    ['Phương thức giao hàng', '/web2/delivery-zone/index.html'],
    ['Máy in', '/web2/printer-settings/index.html'],
];

const NOISE =
    /favicon|\.png|\.jpg|\.svg|\.woff|lucide|unpkg|gstatic|googleapis|ERR_INTERNET|net::ERR_FAILED loading.*\.(png|jpg)/i;

(async () => {
    await ensureLocalServer(BASE, process.cwd());
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const snap = await restoreLoginSession(ctx, { base: BASE });
    if (!snap) console.error('WARN: no login snapshot');

    const results = [];
    for (const [name, url] of PAGES) {
        const page = await ctx.newPage();
        const pageErrors = [];
        const consoleErrors = [];
        const apiFailures = [];
        page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 160)));
        page.on('console', (m) => {
            if (m.type() === 'error') {
                const t = m.text().slice(0, 200);
                if (!NOISE.test(t)) consoleErrors.push(t);
            }
        });
        page.on('response', (r) => {
            const u = r.url();
            const s = r.status();
            if (s >= 400 && /chatomni-proxy|onrender\.com|\/api\//.test(u) && !NOISE.test(u)) {
                apiFailures.push(
                    `${s} ${u.replace('https://chatomni-proxy.nhijudyshop.workers.dev', '').slice(0, 90)}`
                );
            }
        });
        const t0 = Date.now();
        let dom = {};
        try {
            await page.goto(`${BASE}${url}?t=${Date.now()}`, {
                waitUntil: 'domcontentloaded',
                timeout: 35000,
            });
            await page.waitForTimeout(6000);
            dom = await page.evaluate(() => {
                const txt = document.body.innerText || '';
                const rows = document.querySelectorAll(
                    'table tbody tr, [data-code], .card-row, .list-item, .pr-li, .ov-page'
                ).length;
                const emptyEl = [...document.querySelectorAll('*')].some(
                    (e) =>
                        e.children.length === 0 &&
                        /không có|chưa có|trống|no data|empty|chưa nhập/i.test(e.textContent || '')
                );
                const h1 = (
                    document.querySelector('h1,h2,.page-title,.web2-page-title')?.textContent || ''
                )
                    .trim()
                    .slice(0, 60);
                return {
                    path: location.pathname,
                    rows,
                    hasEmptyState: emptyEl,
                    h1,
                    bodyLen: txt.length,
                    hasSpinner: /đang tải|loading/i.test(txt),
                };
            });
        } catch (e) {
            dom = { error: String(e.message).slice(0, 140) };
        }
        const loadMs = Date.now() - t0;
        const bounced = /login|auth/i.test(dom.path || '') && !url.includes('login');
        // dedup
        const uniq = (a) => [...new Set(a)];
        results.push({
            name,
            url,
            ok:
                !dom.error &&
                pageErrors.length === 0 &&
                consoleErrors.length === 0 &&
                apiFailures.length === 0 &&
                !bounced,
            bounced,
            loadMs,
            h1: dom.h1 || null,
            rows: dom.rows ?? null,
            empty: dom.hasEmptyState ?? null,
            bodyLen: dom.bodyLen ?? null,
            pageErrors: uniq(pageErrors),
            consoleErrors: uniq(consoleErrors).slice(0, 5),
            apiFailures: uniq(apiFailures).slice(0, 8),
            loadError: dom.error || null,
        });
        process.stderr.write(`  ${results[results.length - 1].ok ? '✅' : '⚠️ '} ${name}\n`);
        await page.close();
    }
    await browser.close();

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(`${OUT_DIR}/web2-page-audit.json`, JSON.stringify(results, null, 2));
    // print compact table
    console.log('\n=== WEB 2.0 PER-PAGE AUDIT ===');
    for (const r of results) {
        const flags = [];
        if (r.bounced) flags.push('BOUNCED-LOGIN');
        if (r.loadError) flags.push('LOAD-ERR:' + r.loadError);
        if (r.pageErrors.length) flags.push(`pageErr×${r.pageErrors.length}`);
        if (r.consoleErrors.length) flags.push(`consoleErr×${r.consoleErrors.length}`);
        if (r.apiFailures.length) flags.push(`apiFail×${r.apiFailures.length}`);
        console.log(
            `${r.ok ? '✅' : '⚠️ '} ${r.name.padEnd(26)} rows=${String(r.rows).padEnd(4)} ${r.loadMs}ms ${flags.join(' ')}`
        );
        for (const e of r.pageErrors) console.log(`      🔴 pageError: ${e}`);
        for (const e of r.consoleErrors) console.log(`      🟠 console: ${e}`);
        for (const e of r.apiFailures) console.log(`      🟡 api: ${e}`);
    }
    const bad = results.filter((r) => !r.ok);
    console.log(
        `\n${results.length - bad.length}/${results.length} clean. ${bad.length} need review: ${bad.map((r) => r.name).join(', ') || 'none'}`
    );
})();
