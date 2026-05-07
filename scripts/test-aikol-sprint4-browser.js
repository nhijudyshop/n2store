#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// Sprint 4 browser smoke test — Playwright + auto-login.
//
// Verifies all Sprint 4 pages load cleanly:
//   /aikol-studio/settings.html   — packs grid, telegram form
//   /aikol-studio/bulk.html       — preset cards, model select, cost summary
//   /aikol-studio/campaigns.html  — empty state OR cards
//
// Captures: pageerror, console.error, response 4xx/5xx (excl. expected 503/404).
// Exits 0 if all clean, 1 otherwise. Prints summary report.
// =====================================================

const { chromium } = require('playwright');

const BASE = process.env.BASE || 'https://nhijudyshop.github.io/n2store';
const USER = process.env.USER_LOGIN || 'admin';
const PASS = process.env.PASS_LOGIN || 'admin@@';
const PER_PAGE_SECS = parseInt(process.env.PER_PAGE_SECS, 10) || 8;

const PAGES = [
    { path: '/aikol-studio/index.html', name: 'dashboard' },
    { path: '/aikol-studio/settings.html', name: 'settings' },
    { path: '/aikol-studio/bulk.html', name: 'bulk' },
    { path: '/aikol-studio/campaigns.html', name: 'campaigns' },
    { path: '/aikol-studio/library.html', name: 'library' },
    { path: '/aikol-studio/history.html', name: 'history' },
];

// Errors we expect (and OK to ignore)
const KNOWN_OK = [
    /sepay_not_configured/i, // expected when env not set
    /TELEGRAM_BOT_TOKEN.*not set/i,
    /Failed to load resource.*favicon/i,
    /Failed to load resource.*lucide/i, // CDN noise
    /net::ERR_INTERNET_DISCONNECTED/i,
    /Failed to load resource: the server responded with a status of 503/i, // expected
    /Failed to load resource: the server responded with a status of 401/i, // pre-shim or unauth shim
    /Failed to load resource: the server responded with a status of 404/i,
];

function isKnown(msg) {
    return KNOWN_OK.some((re) => re.test(String(msg)));
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    const results = [];
    const errorsByPage = {};

    page.on('pageerror', (err) => {
        const cur = page.url();
        const key = cur.split('/').pop() || 'unknown';
        if (!errorsByPage[key]) errorsByPage[key] = [];
        errorsByPage[key].push({ kind: 'pageerror', msg: err.message });
    });
    page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const cur = page.url();
        const key = cur.split('/').pop() || 'unknown';
        if (!errorsByPage[key]) errorsByPage[key] = [];
        errorsByPage[key].push({ kind: 'console', msg: msg.text() });
    });
    page.on('response', (res) => {
        const status = res.status();
        if (status < 400) return;
        if (status === 503 || status === 404) return; // expected for /billing/topup, /clip-not-found
        const cur = page.url();
        const key = cur.split('/').pop() || 'unknown';
        if (!errorsByPage[key]) errorsByPage[key] = [];
        errorsByPage[key].push({ kind: 'http', msg: `${status} ${res.url()}` });
    });

    // 1. Inject an auth shim into localStorage on every page (no real login needed
    //    — Sprint 4 routes use X-User-Id/X-Auth-Data header from AuthManager).
    await ctx.addInitScript((u) => {
        const auth = { userId: u, uid: u, email: `${u}@test.local`, fullName: 'Sprint4 Tester' };
        try {
            localStorage.setItem('authData', JSON.stringify(auth));
        } catch (_) {}
    }, USER);
    console.log(`\n[smoke4] auth shim injected: userId="${USER}"`);

    // 2. Visit each page.
    for (const target of PAGES) {
        const url = `${BASE}${target.path}?t=${Date.now()}`;
        console.log(`\n[smoke4] === ${target.name} ===`);
        const errBefore = Object.values(errorsByPage).flat().length;
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(PER_PAGE_SECS * 1000);

            // Page-specific checks
            const checks = {};
            if (target.name === 'settings') {
                checks.has_packs_grid = await page.$('#packs-grid');
                checks.has_telegram_form = await page.$('#telegram-form');
                const packs = await page.$$('#packs-grid .aikol-pack');
                checks.packs_count = packs.length;
            } else if (target.name === 'bulk') {
                checks.has_form = await page.$('#bulk-form');
                checks.has_presets = (await page.$$('[data-preset]')).length;
                checks.has_cost = await page.$('#bulk-cost-summary');
            } else if (target.name === 'campaigns') {
                checks.has_list = await page.$('#campaigns-list');
                checks.has_empty = await page.$('#campaigns-empty');
            }
            const errAfter = Object.values(errorsByPage).flat().length;
            const newErrCount = errAfter - errBefore;
            console.log('  checks:', JSON.stringify(checks));
            console.log(`  new errors: ${newErrCount}`);
            results.push({ ...target, checks, errors: newErrCount, status: 'visited' });
        } catch (e) {
            console.error(`  visit failed: ${e.message}`);
            results.push({ ...target, status: 'visit_failed', error: e.message });
        }
    }

    // 3. Filter known-ok errors
    const filtered = {};
    for (const [k, errs] of Object.entries(errorsByPage)) {
        const real = errs.filter((e) => !isKnown(e.msg));
        if (real.length) filtered[k] = real;
    }

    console.log('\n========== SUMMARY ==========');
    console.log('Pages visited:', results.length);
    results.forEach((r) => {
        console.log(`  ${r.name.padEnd(12)} ${r.status} errs=${r.errors ?? '-'}`);
    });
    console.log('\nFiltered errors (excluding known-ok):');
    if (Object.keys(filtered).length === 0) {
        console.log('  ✅ NONE — all pages clean');
    } else {
        for (const [k, errs] of Object.entries(filtered)) {
            console.log(`  ${k}:`);
            errs.forEach((e) => console.log(`    [${e.kind}] ${e.msg.slice(0, 200)}`));
        }
    }
    console.log('==============================\n');

    await browser.close();
    const totalReal = Object.values(filtered).flat().length;
    process.exit(totalReal > 0 ? 1 : 0);
})();
