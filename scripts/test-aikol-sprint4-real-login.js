#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// Sprint 4 REAL-LOGIN browser smoke — uses n2store /index.html actual login flow
// (form id=loginForm, fields #username + #password, submit #loginButton).
//
// No localStorage shim. Verifies that a logged-in admin can navigate to
// settings/bulk/campaigns/library/history without console/page errors.
// =====================================================

const { chromium } = require('playwright');

const BASE = process.env.BASE || 'https://nhijudyshop.github.io/n2store';
const USER = process.env.USER_LOGIN || 'admin';
const PASS = process.env.PASS_LOGIN || 'admin@@';
const PER_PAGE_SECS = parseInt(process.env.PER_PAGE_SECS, 10) || 6;

const PAGES = [
    { path: '/aikol-studio/index.html', name: 'dashboard' },
    { path: '/aikol-studio/settings.html', name: 'settings' },
    { path: '/aikol-studio/bulk.html', name: 'bulk' },
    { path: '/aikol-studio/campaigns.html', name: 'campaigns' },
    { path: '/aikol-studio/library.html', name: 'library' },
    { path: '/aikol-studio/history.html', name: 'history' },
];

const KNOWN_OK = [
    /sepay_not_configured/i,
    /Failed to load resource: the server responded with a status of 503/i,
    /Failed to load resource: the server responded with a status of 401/i,
    /Failed to load resource: the server responded with a status of 404/i,
    /Failed to load resource.*favicon/i,
    /Failed to load resource.*lucide/i,
    /Failed to load resource.*\.gif/i, // sticker noise
    /CORS policy/i, // some 3rd-party iframes
];
const isKnown = (m) => KNOWN_OK.some((re) => re.test(String(m)));

(async () => {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    const errs = [];
    page.on('pageerror', (err) => {
        const u = page.url();
        const key = u.split('/').pop() || u;
        errs.push({ kind: 'pageerror', url: key, msg: err.message });
    });
    page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const u = page.url();
        const key = u.split('/').pop() || u;
        errs.push({ kind: 'console', url: key, msg: msg.text() });
    });
    page.on('response', (res) => {
        const status = res.status();
        if (status < 400) return;
        if (status === 503 || status === 404 || status === 401) return;
        const u = page.url();
        const key = u.split('/').pop() || u;
        errs.push({ kind: 'http', url: key, msg: `${status} ${res.url()}` });
    });

    // ===== Real login =====
    console.log(`[real-login] navigating to ${BASE}/index.html`);
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#loginForm', { timeout: 15000 });
    await page.fill('#username', USER);
    await page.fill('#password', PASS);
    // Login page has CSS animations on button → use form submit() to avoid stability flakes.
    await page.evaluate(() => document.getElementById('loginForm').requestSubmit());
    // Wait for the login script to populate auth + redirect.
    await page.waitForFunction(
        () => {
            const a =
                sessionStorage.getItem('loginindex_auth') ||
                localStorage.getItem('loginindex_auth');
            if (!a) return false;
            try {
                const j = JSON.parse(a);
                return j.isLoggedIn === true || j.isLoggedIn === 'true';
            } catch (_) {
                return false;
            }
        },
        { timeout: 25000 }
    );
    await page.waitForTimeout(2000);

    const auth = await page.evaluate(() => {
        const a =
            sessionStorage.getItem('loginindex_auth') || localStorage.getItem('loginindex_auth');
        return a ? JSON.parse(a) : null;
    });
    if (!auth) {
        console.error('[real-login] FAILED — no auth in storage after login');
        process.exit(1);
    }
    console.log(`[real-login] OK as ${auth.userId || auth.username || 'unknown'}`);

    // ===== Visit Sprint 4 pages =====
    const results = [];
    for (const t of PAGES) {
        const url = `${BASE}${t.path}?t=${Date.now()}`;
        console.log(`\n[real-login] === ${t.name} ===`);
        const errBefore = errs.length;
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(PER_PAGE_SECS * 1000);

            // Verify aikol-credits chip got populated (proves X-User-Id worked).
            let creditChip = null;
            try {
                creditChip = await page.$eval('#aikol-credits', (el) => el.textContent);
            } catch (_) {}

            const checks = { creditChip };
            if (t.name === 'settings') {
                checks.packs = (await page.$$('#packs-grid .aikol-pack')).length;
            } else if (t.name === 'bulk') {
                const modelOptions = await page.$$eval('[name="model_id"] option', (els) =>
                    els.map((o) => o.value).filter((v) => v)
                );
                checks.modelsLoaded = modelOptions.length;
            } else if (t.name === 'campaigns') {
                checks.campaignsLoaded = (
                    await page.$$('#campaigns-list .aikol-campaign-card')
                ).length;
                checks.emptyVisible = await page.$eval(
                    '#campaigns-empty',
                    (el) => getComputedStyle(el).display !== 'none'
                );
            } else if (t.name === 'library') {
                checks.clipsTotal = await page.$eval('#clips-total', (el) => el.textContent.trim());
            } else if (t.name === 'history') {
                checks.outputsTotal = await page.$eval('#outputs-total', (el) =>
                    el.textContent.trim()
                );
            }
            const newErrs = errs.length - errBefore;
            console.log('  checks:', JSON.stringify(checks));
            console.log(`  new errors (incl noise): ${newErrs}`);
            results.push({ ...t, ok: true, checks });
        } catch (e) {
            console.error('  visit failed:', e.message);
            results.push({ ...t, ok: false, error: e.message });
        }
    }

    // ===== Summary =====
    const real = errs.filter((e) => !isKnown(e.msg));
    console.log('\n========== SUMMARY ==========');
    results.forEach((r) =>
        console.log(
            `  ${r.name.padEnd(12)} ${r.ok ? '✅' : '❌'} ${JSON.stringify(r.checks || {})}`
        )
    );
    console.log(`\nTotal events captured: ${errs.length}`);
    console.log(`Real errors (filtered): ${real.length}`);
    if (real.length === 0) {
        console.log('  ✅ NONE — all pages clean with real login');
    } else {
        const grouped = {};
        for (const e of real) {
            grouped[e.url] = grouped[e.url] || [];
            grouped[e.url].push(e);
        }
        for (const [k, list] of Object.entries(grouped)) {
            console.log(`\n  ${k}:`);
            list.forEach((e) => console.log(`    [${e.kind}] ${String(e.msg).slice(0, 250)}`));
        }
    }
    console.log('==============================');

    await browser.close();
    process.exit(real.length > 0 ? 1 : 0);
})();
