#!/usr/bin/env node
// Click từng menu item liên quan Calls, ghi lại URL đích và network request

const fs = require('fs');
const path = require('path');
const SECRETS_FILE = path.resolve(__dirname, '..', 'serect_dont_push.txt');

(async () => {
    const { chromium } = require('playwright');
    const content = fs.readFileSync(SECRETS_FILE, 'utf8');
    const line = content
        .split('\n')
        .find((l) => l.includes('pbx-ucaas.oncallcx.vn') && !l.includes('PBX_HOST'));
    const after = line.replace(/^\s*\d+\/?\s*/, '').replace(/"[^"]*"\s*/, '');
    const parts = after.trim().split(/\s+/);
    const creds = { username: parts[0], password: parts.slice(1).join(' ') };

    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const nav = [];
    page.on('framenavigated', (f) => {
        if (f === page.mainFrame()) nav.push({ ts: Date.now(), url: f.url() });
    });

    await page.goto('https://pbx-ucaas.oncallcx.vn/portal/login.xhtml', {
        waitUntil: 'networkidle',
    });
    await page.locator('input[type="text"]').first().fill(creds.username);
    await page.locator('input[type="password"]').first().fill(creds.password);
    await Promise.all([
        page.waitForLoadState('networkidle').catch(() => {}),
        page.locator('button[type="submit"], input[type="submit"]').first().click(),
    ]);
    await page.waitForTimeout(2500);

    const targets = ['Calls', 'Live Calls', 'Call Analytics', 'Logs', 'Extensions'];
    const results = [];

    for (const label of targets) {
        try {
            // Thử click anchor hoặc menuitem có text
            const locator = page
                .locator(
                    `a:has-text("${label}"), [role="menuitem"]:has-text("${label}"), .ui-menuitem-text:has-text("${label}")`
                )
                .first();
            const count = await locator.count();
            if (count === 0) {
                results.push({ label, found: false });
                continue;
            }

            const urlBefore = page.url();
            await locator.click({ timeout: 3000 }).catch(() => {});
            await page.waitForTimeout(1500);
            const urlAfter = page.url();
            const htmlSnippet = (await page.content()).slice(0, 2000);
            const hasAudio = /audio|\.wav|\.mp3|record|ghi.?âm/i.test(await page.content());
            const title = await page.title();

            results.push({ label, urlBefore, urlAfter, title, hasAudioKeyword: hasAudio });
            console.log(
                `[${label}] -> ${urlAfter} (title=${title.slice(0, 60)}) audio?=${hasAudio}`
            );

            // Dump HTML snapshot để inspect
            const snap = path.resolve(
                __dirname,
                '..',
                'docs',
                `oncallcx-page-${label.replace(/\s+/g, '_')}.html`
            );
            fs.writeFileSync(snap, await page.content());

            // Quay lại dashboard trước khi thử label kế
            await page.goto('https://pbx-ucaas.oncallcx.vn/portal/pbxDashboard.xhtml', {
                waitUntil: 'networkidle',
            });
            await page.waitForTimeout(1000);
        } catch (e) {
            results.push({ label, error: e.message });
        }
    }

    fs.writeFileSync(
        path.resolve(__dirname, '..', 'docs', 'oncallcx-menu-click-results.json'),
        JSON.stringify({ navigations: nav, results }, null, 2)
    );
    console.log('\n=== NAV HISTORY ===');
    nav.forEach((n) => console.log(' ', n.url));

    await browser.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
