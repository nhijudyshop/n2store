#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Verify Báo cáo view-swap (not modal overlay)
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
        viewport: { width: 1400, height: 900 },
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((ls) => {
        for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
    }, session.localStorage);
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    // Open báo cáo via triple-click hint
    await page.waitForFunction(
        () => document.getElementById('drPresetHint')?.textContent?.includes('Đang lọc'),
        { timeout: 8000 }
    );
    await page.evaluate(() => {
        const hint = document.getElementById('drPresetHint');
        const r = hint.getBoundingClientRect();
        for (let i = 0; i < 3; i++) {
            hint.dispatchEvent(
                new MouseEvent('click', { bubbles: true, clientX: r.left + 5, clientY: r.top + 5 })
            );
        }
    });
    await page.waitForTimeout(800);

    const state = await page.evaluate(() => {
        const modal = document.getElementById('drReportModal');
        const cs = window.getComputedStyle(modal);
        return {
            bodyHasReportClass: document.body.classList.contains('dr-mode-report'),
            modalOpen: modal?.classList.contains('open'),
            modalPosition: cs.position,
            modalZIndex: cs.zIndex,
            modalBackdrop: cs.backdropFilter,
            mainHeaderHidden:
                window.getComputedStyle(document.querySelector('.dr-header')).display === 'none',
            filterHidden:
                window.getComputedStyle(document.getElementById('drFilterSection')).display ===
                'none',
        };
    });
    console.log('[after-open]', JSON.stringify(state));

    // Tab switch timing — measure perceived lag
    const switchTimes = [];
    for (let i = 0; i < 3; i++) {
        const tabs = ['nap', 'city', 'tomato'];
        const target = tabs[i];
        const t0 = Date.now();
        await page.evaluate((t) => {
            document.querySelector(`#drReportTabs button[data-tab=${t}]`).click();
        }, target);
        // Wait for active class swap
        await page.waitForFunction(
            (t) =>
                document
                    .querySelector(`#drReportTabs button[data-tab=${t}]`)
                    ?.classList.contains('active'),
            target,
            { timeout: 2000 }
        );
        switchTimes.push({ tab: target, ms: Date.now() - t0 });
    }
    console.log('[tab-switch-times]', JSON.stringify(switchTimes));

    // Screenshot
    await page.screenshot({
        path: 'downloads/n2store-session/dr-report-view.png',
        fullPage: false,
    });

    // Close
    await page.evaluate(() => document.getElementById('drReportClose').click());
    await page.waitForTimeout(400);
    const closed = await page.evaluate(() => ({
        bodyHasReportClass: document.body.classList.contains('dr-mode-report'),
        mainHeaderVisible:
            window.getComputedStyle(document.querySelector('.dr-header')).display !== 'none',
    }));
    console.log('[after-close]', JSON.stringify(closed));

    await browser.close();
    console.log('=== Done ===');
})().catch((e) => {
    console.error('TEST_FAIL:', e);
    process.exit(1);
});
