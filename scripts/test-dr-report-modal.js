#!/usr/bin/env node
// Verify Báo cáo modal: triple-click drPresetHint → modal opens, tabs work, editing persists
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

    const consoleErrors = [];
    page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
    });
    page.on('pageerror', (e) => consoleErrors.push('PAGEERR: ' + String(e).slice(0, 200)));

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((ls) => {
        for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
        localStorage.removeItem('dr-report-overrides-v1');
    }, session.localStorage);

    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const log = (label, data) => console.log(`[${label}]`, JSON.stringify(data));

    // Wait for hint to populate
    await page.waitForFunction(
        () => document.getElementById('drPresetHint')?.textContent?.includes('Đang lọc'),
        { timeout: 8000 }
    );

    // Test 1: Triple-click drPresetHint opens modal
    await page.evaluate(() => {
        const hint = document.getElementById('drPresetHint');
        const r = hint.getBoundingClientRect();
        for (let i = 0; i < 3; i++) {
            hint.dispatchEvent(
                new MouseEvent('click', { bubbles: true, clientX: r.left + 5, clientY: r.top + 5 })
            );
        }
    });
    await page.waitForTimeout(500);
    const t1 = await page.evaluate(() => {
        const modal = document.getElementById('drReportModal');
        return {
            modalExists: !!modal,
            modalOpen: modal?.classList.contains('open'),
            tabs: [...document.querySelectorAll('#drReportTabs button')].map((b) => ({
                tab: b.dataset.tab,
                label: b.textContent.trim(),
                active: b.classList.contains('active'),
            })),
            tableHasRows: document.querySelectorAll('#drReportTbody tr').length,
            subtitle: document.getElementById('drReportRangeLabel')?.textContent,
        };
    });
    log('modal-open', t1);

    // Test 2: Switch to NAP tab + check rendering
    await page.evaluate(() => document.querySelector('#drReportTabs button[data-tab=nap]').click());
    await page.waitForTimeout(500);
    const t2 = await page.evaluate(() => {
        return {
            activeTab: document.querySelector('#drReportTabs button.active')?.dataset.tab,
            rowCount: document.querySelectorAll('#drReportTbody tr').length,
        };
    });
    log('switch-nap-tab', t2);

    // Test 3: Switch back to TOMATO + edit SL ĐƠN
    await page.evaluate(() =>
        document.querySelector('#drReportTabs button[data-tab=tomato]').click()
    );
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        const inp = document.querySelector(
            '#drReportTbody tr input[type=number][data-field=slDon]'
        );
        if (inp) {
            inp.value = '99';
            inp.dispatchEvent(new Event('blur'));
        }
    });
    await page.waitForTimeout(500);
    const t3 = await page.evaluate(() => {
        const stored = JSON.parse(localStorage.getItem('dr-report-overrides-v1') || '{}');
        return {
            storageKeys: Object.keys(stored).length,
            firstKey: Object.keys(stored)[0],
            firstValue: stored[Object.keys(stored)[0]],
        };
    });
    log('edit-sl-don-persisted', t3);

    // Test 4: Click TIỀN cell → image modal opens
    await page.evaluate(() => {
        const cell = document.querySelector('#drReportTbody tr td.money-cell');
        if (cell) cell.click();
    });
    await page.waitForTimeout(400);
    const t4 = await page.evaluate(() => {
        const m = document.getElementById('drReportImgModal');
        const pasteVisible = document.getElementById('drReportImgPaste')?.style.display !== 'none';
        return {
            imgModalOpen: m?.classList.contains('open'),
            pasteZoneVisible: pasteVisible,
            subtitle: document.getElementById('drReportImgSubtitle')?.textContent,
        };
    });
    log('image-modal-opens', t4);

    // Test 5: Close image modal + screenshot
    await page.evaluate(() => document.getElementById('drReportImgClose').click());
    await page.waitForTimeout(300);
    await page.screenshot({
        path: 'downloads/n2store-session/dr-report-modal.png',
        fullPage: false,
    });

    log('console-errors', { count: consoleErrors.length, sample: consoleErrors.slice(0, 3) });

    await browser.close();
    console.log('=== Done ===');
})().catch((e) => {
    console.error('TEST_FAIL:', e);
    process.exit(1);
});
