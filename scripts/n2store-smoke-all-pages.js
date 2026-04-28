#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Mục đích: smoke test toàn bộ ~139 HTML pages trong project — load mỗi trang, capture console
// errors / unhandled rejections / HTTP status / page title / broken-DOM markers.
// Output: downloads/n2store-session/smoke-report.json + smoke-report.md
//
// Run: node scripts/n2store-smoke-all-pages.js --user U --pass P [--concurrency 4] [--per-page-secs 8]

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ARGS = (() => {
    const a = process.argv.slice(2);
    const out = { user: '', pass: '', concurrency: 4, perPageSecs: 8 };
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--user') out.user = a[++i];
        else if (a[i] === '--pass') out.pass = a[++i];
        else if (a[i] === '--concurrency') out.concurrency = Number(a[++i]) || 4;
        else if (a[i] === '--per-page-secs') out.perPageSecs = Number(a[++i]) || 8;
    }
    return out;
})();
if (!ARGS.user || !ARGS.pass) {
    console.error('Usage: --user U --pass P [--concurrency 4] [--per-page-secs 8]');
    process.exit(1);
}

const BASE = 'https://nhijudyshop.github.io/n2store';
const OUT_DIR = path.join(__dirname, '..', 'downloads', 'n2store-session');
const REPORT_JSON = path.join(OUT_DIR, 'smoke-report.json');
const REPORT_MD = path.join(OUT_DIR, 'smoke-report.md');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Pages to test — relative to BASE
const PAGES = [
    // Login/landing
    '/',
    '/index.html',
    '/privacy-policy.html',
    // orders-report
    '/orders-report/main.html',
    '/orders-report/tab1-orders.html',
    '/orders-report/tab-overview.html',
    '/orders-report/tab-pending-delete.html',
    '/orders-report/tab-kpi-commission.html',
    '/orders-report/tab-live-ledger.html',
    '/orders-report/tab3-product-assignment.html',
    '/orders-report/migration-kpi-per-user.html',
    // App top-level
    '/AI/gemini.html',
    '/balance-history/index.html',
    '/bangkiemhang/index.html',
    '/customer-hub/index.html',
    '/delivery-report/index.html',
    '/doi-soat/index.html',
    '/don-inbox/index.html',
    '/facebook-services/index.html',
    '/fb-ads/index.html',
    '/firebase-stats/index.html',
    '/hanghoan/index.html',
    '/inbox/index.html',
    '/inventory-tracking/index.html',
    '/invoice-compare/index.html',
    '/issue-tracking/index.html',
    '/lichsuchinhsua/index.html',
    '/native-orders/index.html',
    '/nhanhang/index.html',
    '/order-management/index.html',
    '/order-management/order-list.html',
    '/order-management/hidden-products.html',
    '/phone-management/index.html',
    '/phone-management/monitor.html',
    '/product-warehouse/index.html',
    '/project-tracker/index.html',
    '/purchase-orders/index.html',
    '/purchase-orders/goods-receiving/index.html',
    '/purchase-orders/label-test.html',
    '/quy-trinh/index.html',
    '/render-data-manager/index.html',
    '/resident/index.html',
    '/service-costs/index.html',
    '/soluong-live/index.html',
    '/soluong-live/sales-report.html',
    '/soluong-live/social-sales.html',
    '/soluong-live/soluong-list.html',
    '/soluong-live/hidden-soluong.html',
    '/soorder/index.html',
    '/soquy/index.html',
    '/soquy/huong_dan_so_quy.html',
    '/supplier-debt/index.html',
    '/tpos-pancake/index.html',
    '/user-management/index.html',
    '/web2-products/index.html',
    // stitch_customer
    '/stitch_customer/customer_search.html',
    '/stitch_customer/Unlinked_Bank_Transactions.html',
    '/stitch_customer/transaction-activity.html',
    // web2/* — sample subset (full list in WEB2_PAGES below)
];

// web2/* sub-pages — TPOS module mirrors. Many similar — test all to catch broken paths.
const WEB2_PAGES = [
    'account-chi',
    'account-deposit',
    'account-inventory',
    'account-journal',
    'account-list',
    'account-payment-change',
    'account-payment-chi',
    'account-payment-list',
    'account-payment-thu',
    'account-thu',
    'application-user',
    'barcode-product-label',
    'callcenter-config',
    'category-distributor',
    'company',
    'configs-advanced',
    'configs-general',
    'configs-printer',
    'configs-roles',
    'configs-twofa',
    'coupon-program',
    'delivery-carrier',
    'export-file',
    'fastpurchaseorder-invoice',
    'fastpurchaseorder-refund',
    'fastsaleorder-delivery',
    'fastsaleorder-invoice',
    'fastsaleorder-refund',
    'history-cross-check-product',
    'history-ds',
    'inventory-valuation',
    'ir-mailserver',
    'live-campaign',
    'loyalty-program',
    'mail-template',
    'offer-program',
    'partner-category',
    'partner-category-revenue-config',
    'partner-customer',
    'partner-supplier',
    'pos-config',
    'pos-order',
    'pos-session',
    'product-attribute',
    'product-attribute-value',
    'product-category',
    'product-label-paper',
    'product-template',
    'product-uom',
    'product-uom-categ',
    'product-variant',
    'promotion-program',
    'report-audit-fastsale',
    'report-business-results',
    'report-cash-journal',
    'report-customer-debt',
    'report-delivery',
    'report-exported',
    'report-imported',
    'report-not-invoice',
    'report-order',
    'report-partner-create',
    'report-product-invoice',
    'report-purchase',
    'report-rate-saleonline',
    'report-refund',
    'report-revenue',
    'report-supplier-debt',
    'res-currency',
    'revenue-began-customer',
    'revenue-began-supplier',
    'sale-online-facebook',
    'sale-order',
    'sale-quotation',
    'sales-channel',
    'stock-fifo-vacuum',
    'stock-inventory',
    'stock-location',
    'stock-move',
    'stock-picking-type',
    'stock-warehouse-product',
    'tag',
    'wi-invoice',
    'wi-invoice-config',
    'wi-invoice-history',
    'xuat-nhap-ton',
];
WEB2_PAGES.forEach((p) => PAGES.push(`/web2/${p}/index.html`));

const ts = () => new Date().toISOString();
const log = (...a) => console.log(`[${ts()}]`, ...a);

async function loginContext(browser) {
    const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        bypassCSP: true,
    });
    await ctx.route('**/*.js', (route) => {
        route.continue({
            headers: { ...route.request().headers(), 'cache-control': 'no-cache, no-store' },
        });
    });
    const page = await ctx.newPage();
    log('Login…');
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
    await page.waitForTimeout(2000);
    await page.close();
    log('Login OK — context ready (cookies + localStorage cached)');
    return ctx;
}

async function smokeOne(ctx, urlPath) {
    const url = `${BASE}${urlPath}?t=${Date.now()}`;
    const page = await ctx.newPage();
    const errs = [];
    const warns = [];
    const unhandled = [];
    let httpStatus = null;

    // Network noise patterns — browser-level, không phải app bug. Tách riêng để không lẫn.
    const isNetworkNoise = (txt) => {
        return /^Failed to load resource:/i.test(txt) || /net::ERR_/i.test(txt);
    };
    const networkNoise = [];
    page.on('console', (msg) => {
        const text = msg.text();
        if (msg.type() === 'error') {
            if (isNetworkNoise(text)) networkNoise.push(text.slice(0, 400));
            else errs.push(text.slice(0, 400));
        } else if (msg.type() === 'warning') warns.push(text.slice(0, 400));
    });
    page.on('pageerror', (e) => unhandled.push((e.message || String(e)).slice(0, 400)));
    page.on('response', (res) => {
        if (res.url() === url || res.url().startsWith(`${BASE}${urlPath}`)) {
            httpStatus = res.status();
        }
    });

    let title = '';
    let bodyHasContent = false;
    let visibleError = '';
    let durationMs = 0;
    const t0 = Date.now();
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page
            .waitForLoadState('networkidle', { timeout: ARGS.perPageSecs * 1000 })
            .catch(() => {});
        await page.waitForTimeout(Math.min(ARGS.perPageSecs * 1000, 8000));
        title = await page.title().catch(() => '');
        const meta = await page.evaluate(() => {
            const txt = document.body?.innerText || '';
            // Tighten regex để loại false-positive "500 / trang" (pagination), "500.000 đ" (giá),
            // "500 requests" (rate-limit info). Match chỉ khi đứng riêng + có context lỗi rõ ràng.
            const PATTERNS = [
                /\b(404)\s*(error|not\s*found|page\s*not\s*found)/i,
                /\b(500)\s*(internal|server\s*error)\b/i,
                /HTTP\s*(404|500|503)\b/i,
                /\bError\s*loading\b/i,
                /\bForbidden\b/i,
                /\bUnauthorized\b/i,
                /Lỗi\s*(tải|hệ\s*thống|nghiêm\s*trọng|xử\s*lý\s*dữ\s*liệu)/i,
                /\bLỖI\b\s*[\(:].*?(không|fail)/i,
            ];
            let hit = '';
            for (const re of PATTERNS) {
                const m = txt.match(re);
                if (m) {
                    hit = m[0];
                    break;
                }
            }
            return {
                bodyChars: txt.length,
                visibleErr: hit,
                hasMain: !!document.querySelector('main, #app, .app-container, .main-content'),
            };
        });
        bodyHasContent = meta.bodyChars > 50 || meta.hasMain;
        visibleError = meta.visibleErr;
        durationMs = Date.now() - t0;
    } catch (e) {
        errs.push(`navigate failed: ${(e.message || String(e)).slice(0, 200)}`);
    }
    await page.close();

    return {
        path: urlPath,
        httpStatus,
        title,
        bodyHasContent,
        visibleError,
        durationMs,
        errors: errs, // app-level errors only (network noise tách riêng)
        networkNoise: networkNoise.length, // count only — Failed to load resource / ERR_*
        warns,
        unhandled,
    };
}

async function runBatch(ctx, paths, concurrency) {
    const results = [];
    let idx = 0;
    async function worker() {
        while (idx < paths.length) {
            const i = idx++;
            const p = paths[i];
            log(`[${i + 1}/${paths.length}] ${p}`);
            try {
                const r = await smokeOne(ctx, p);
                results.push(r);
            } catch (e) {
                results.push({ path: p, fatal: e.message });
            }
        }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return results;
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await loginContext(browser);

    log(`Smoke ${PAGES.length} pages with concurrency=${ARGS.concurrency}…`);
    const results = await runBatch(ctx, PAGES, ARGS.concurrency);
    results.sort((a, b) => a.path.localeCompare(b.path));

    fs.writeFileSync(REPORT_JSON, JSON.stringify(results, null, 2));

    // Markdown summary
    const broken = results.filter(
        (r) =>
            r.fatal ||
            (r.httpStatus && r.httpStatus >= 400) ||
            !r.bodyHasContent ||
            r.visibleError ||
            r.errors.length > 0 ||
            r.unhandled.length > 0
    );
    const clean = results.filter((r) => !broken.includes(r));

    let md = `# Smoke Test Report — ${results.length} pages\n\n`;
    md += `Generated: ${ts()}\n\n`;
    md += `- ✅ Clean: **${clean.length}**\n- ❌ Issues: **${broken.length}**\n\n`;
    md += `## Pages with issues (sorted by severity)\n\n`;
    md += `| Path | HTTP | Title | Errors | Unhandled | Visible | Body? | Notes |\n|---|---|---|---|---|---|---|---|\n`;
    for (const r of broken) {
        md += `| \`${r.path}\` | ${r.httpStatus ?? '—'} | ${(r.title || '').slice(0, 30)} | ${r.errors.length} | ${r.unhandled.length} | ${(r.visibleError || '').slice(0, 40)} | ${r.bodyHasContent ? '✓' : '✗'} | ${r.fatal || ''} |\n`;
    }
    md += `\n## Top errors (first 3 per broken page)\n\n`;
    for (const r of broken) {
        if (r.errors.length === 0 && r.unhandled.length === 0) continue;
        md += `### \`${r.path}\`\n`;
        for (const e of r.errors.slice(0, 3)) md += `- err: ${e.replace(/\|/g, '\\|')}\n`;
        for (const e of r.unhandled.slice(0, 3)) md += `- unh: ${e.replace(/\|/g, '\\|')}\n`;
        md += '\n';
    }
    md += `\n## Clean pages (${clean.length})\n\n`;
    md += clean.map((r) => `- \`${r.path}\``).join('\n') + '\n';

    fs.writeFileSync(REPORT_MD, md);
    log(`Report → ${REPORT_MD}`);
    log(`JSON   → ${REPORT_JSON}`);
    log(`Summary: ${clean.length} clean, ${broken.length} with issues`);

    await browser.close();
})().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
});
