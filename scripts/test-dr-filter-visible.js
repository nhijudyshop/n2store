#!/usr/bin/env node
// Verify filter+stats are visible on entry (admin/lite), while table+cancel+status are hidden
const { chromium } = require('playwright');
const fs = require('fs');

const SECRET_FILE = '/Users/mac/Desktop/n2store/serect_dont_push.txt';
const BASE = 'http://localhost:8080';
const URL = `${BASE}/delivery-report/index.html?t=${Date.now()}`;

function restoreSession(host) {
    const txt = fs.readFileSync(SECRET_FILE, 'utf8');
    const marker = `## n2store_session_${host}`;
    const idx = txt.indexOf(marker);
    const end = txt.indexOf('\n## ', idx + marker.length);
    const block = txt.slice(idx, end > 0 ? end : undefined);
    const jsonLine = block.split('\n').find((l) => l.trim().startsWith('{"origin":'));
    const data = JSON.parse(jsonLine);
    return { localStorage: data.localStorage || {}, cookies: data.cookies || [] };
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const session = restoreSession('localhost_8080');
    const ctx = await browser.newContext({
        storageState: { cookies: session.cookies, origins: [] },
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((ls) => {
        for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
    }, session.localStorage);

    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const r = await page.evaluate(() => {
        const ids = [
            'drFilterSection',
            'drStatsBar',
            'drTableWrapper',
            'drCancelSection',
            'drAssignmentStatus',
        ];
        return ids.map((id) => {
            const el = document.getElementById(id);
            return { id, display: el?.style.display, visible: el?.offsetParent !== null };
        });
    });
    console.log('[lite-default-on-entry]', JSON.stringify(r));

    // Take screenshot
    await page.screenshot({
        path: 'downloads/n2store-session/dr-filter-auto-expand.png',
        fullPage: false,
    });

    await browser.close();
    console.log('=== Done ===');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
