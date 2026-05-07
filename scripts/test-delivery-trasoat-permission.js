#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Verify canTraSoat() permission whitelist.
// Cases:
//   1. admin → allowed
//   2. username='bobo' → allowed (new)
//   3. displayName='bobo' → allowed (new)
//   4. displayName='Phước đẹp trai' → allowed (existing)
//   5. random user with no whitelist match → denied
// Strategy: stub window.authManager with fake getUserInfo/isAdmin, call canTraSoat()
// indirectly by triggering DeliveryReport.traSoat() and observing whether the
// "không có quyền" alert fires (denied) or scan mode actually toggles (allowed).
// Easier: probe the DOM — initDeliveryReport hides #drBtnTraSoat if !canTraSoat,
// so by reloading the page after stubbing authManager we can observe display state.

const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:8080';

const cases = [
    { label: 'admin', isAdmin: true, username: 'admin', displayName: 'Admin', expect: true },
    {
        label: 'username=bobo',
        isAdmin: false,
        username: 'bobo',
        displayName: 'BoBo',
        expect: true,
    },
    {
        label: 'username=BOBO (case-insensitive)',
        isAdmin: false,
        username: 'BOBO',
        displayName: '',
        expect: true,
    },
    {
        label: 'displayName=bobo',
        isAdmin: false,
        username: 'someone',
        displayName: 'bobo',
        expect: true,
    },
    {
        label: 'displayName=Phước đẹp trai',
        isAdmin: false,
        username: 'phuoc',
        displayName: 'Phước đẹp trai',
        expect: true,
    },
    {
        label: 'random user',
        isAdmin: false,
        username: 'someone',
        displayName: 'Khác',
        expect: false,
    },
];

(async () => {
    const browser = await chromium.launch({ headless: true });
    const assertions = [];

    // Login once to capture localStorage so subsequent contexts can reuse auth
    const loginCtx = await browser.newContext();
    const loginPage = await loginCtx.newPage();
    await loginPage.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await loginPage
        .fill('input[name="user"], input[type="text"], #username', 'admin')
        .catch(() => {});
    await loginPage.fill('input[type="password"]', 'admin@@').catch(() => {});
    await loginPage.keyboard.press('Enter');
    await loginPage.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    const storageState = await loginCtx.storageState();
    await loginCtx.close();

    for (const c of cases) {
        // Fresh context per case so addInitScript doesn't accumulate.
        const ctx = await browser.newContext({ storageState });
        ctx.route('**/*.js', (r) => {
            const headers = { ...r.request().headers(), 'cache-control': 'no-cache' };
            r.continue({ headers });
        });
        const page = await ctx.newPage();
        page.on('dialog', async (d) => await d.accept().catch(() => {}));

        await page.addInitScript((stub) => {
            // Intercept any future `window.authManager = …` assignment so the stub
            // is applied BEFORE delivery-report.js's IIFE calls canTraSoat() (which
            // hides #drBtnTraSoat for non-allowed users on init).
            let _real;
            Object.defineProperty(window, 'authManager', {
                configurable: true,
                get() {
                    return _real;
                },
                set(val) {
                    _real = val;
                    if (val) {
                        val.isAdmin = () => stub.isAdmin;
                        val.getUserInfo = () => ({
                            username: stub.username,
                            displayName: stub.displayName,
                        });
                    }
                },
            });
        }, c);

        await page.goto(`${BASE}/delivery-report/index.html?t=${Date.now()}`, {
            waitUntil: 'domcontentloaded',
        });
        await page
            .waitForFunction(() => !!window.DeliveryReport && !!window.authManager, {
                timeout: 15_000,
            })
            .catch(() => {});
        await page.waitForTimeout(800);

        const result = await page.evaluate(() => {
            const btn = document.getElementById('drBtnTraSoat');
            return {
                btnHidden: !btn || btn.style.display === 'none',
                userInfo: window.authManager?.getUserInfo?.(),
                isAdmin: window.authManager?.isAdmin?.(),
            };
        });
        const allowed = !result.btnHidden;
        const ok = allowed === c.expect;
        const tag = ok ? 'PASS' : 'FAIL';
        assertions.push(
            `${tag}: ${c.label} → expected ${c.expect ? 'allowed' : 'denied'}, got ${
                allowed ? 'allowed' : 'denied'
            } (info=${JSON.stringify(result.userInfo)} isAdmin=${result.isAdmin})`
        );

        await ctx.close();
    }

    console.log('=== ASSERTIONS ===');
    assertions.forEach((a) => console.log('  ' + a));
    const failed = assertions.filter((a) => a.startsWith('FAIL:'));
    console.log(`\n${failed.length} failures.`);

    await browser.close();
    process.exit(failed.length > 0 ? 1 : 0);
})().catch((e) => {
    console.error('FATAL:', e);
    process.exit(2);
});
