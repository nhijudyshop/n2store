// E2E test: Đối soát toàn chiến dịch button — pick 1 campaign, run bulk reconcile.

import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8080';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERR: ${e.message}`));
page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`CONSOLE-ERR: ${m.text().slice(0, 200)}`);
});

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 23)}] ${m}`);

log('Login…');
await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.fill('#username', 'admin');
await page.fill('#password', 'admin@@');
await page.press('#password', 'Enter');
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);

log('Tab3…');
await page.goto(`${BASE}/orders-report/tab3-product-assignment.html?t=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(7000);

log('Open history modal…');
await page.evaluate(() => window.openUploadHistoryV2Modal());
await page.waitForTimeout(4000);

// Verify the new bulk recon button exists
const headerBtnInfo = await page.evaluate(() => {
    const btn = document.getElementById('reconcileAllCampaignBtn');
    return btn
        ? { exists: true, text: btn.textContent.trim(), visible: btn.offsetParent !== null }
        : { exists: false };
});
log(`Header button: ${JSON.stringify(headerBtnInfo)}`);
if (!headerBtnInfo.exists) {
    console.log('FAIL: header button not found');
    await browser.close();
    process.exit(1);
}

log('Click "Đối soát toàn chiến dịch"…');
await page.click('#reconcileAllCampaignBtn');
await page.waitForTimeout(1500);

const pickerInfo = await page.evaluate(() => {
    const sel = document.getElementById('bulkReconCampaignSelect');
    if (!sel) return { exists: false };
    return {
        exists: true,
        optionCount: sel.options.length,
        selected: sel.value,
        firstThree: [...sel.options].slice(0, 3).map((o) => o.textContent.trim().slice(0, 80)),
    };
});
log(`Picker: ${JSON.stringify(pickerInfo, null, 2)}`);
if (!pickerInfo.exists || pickerInfo.optionCount === 0) {
    console.log('FAIL: picker not rendered or empty');
    await browser.close();
    process.exit(1);
}

log('Click "Chạy đối soát"…');
const t0 = Date.now();
await page.click('#bulkReconRunBtn');

// Wait for output to render
await page
    .waitForFunction(
        () => {
            const out = document.getElementById('bulkReconRunOutput');
            const txt = out?.textContent || '';
            return txt.includes('khớp') || txt.includes('TPOS không có') || txt.includes('Lỗi') || txt.includes('thành công');
        },
        { timeout: 60000 }
    )
    .catch(() => {});
log(`Bulk reconcile rendered after ${Date.now() - t0}ms`);

const finalState = await page.evaluate(() => {
    const out = document.getElementById('bulkReconRunOutput');
    if (!out) return { error: 'no output' };
    const summary = out.querySelector('.alert')?.textContent.replace(/\s+/g, ' ').trim();
    const droppedRowsCount = out.querySelectorAll('table tbody tr').length;
    const sampleDropRow =
        out.querySelectorAll('table tbody tr')[0]?.textContent.replace(/\s+/g, ' ').trim().slice(0, 250);
    return { summary, droppedRowsCount, sampleDropRow };
});

console.log('===== BULK RECONCILE RESULT =====');
console.log(JSON.stringify(finalState, null, 2));

console.log('===== ERRORS =====');
console.log(errors.length === 0 ? 'NONE' : errors.slice(0, 6).join('\n'));

await browser.close();
process.exit(finalState.summary ? 0 : 1);
