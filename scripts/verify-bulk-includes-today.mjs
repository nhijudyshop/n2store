// Run bulk reconcile cho 06/05/2026 group → verify nó include uploads hôm nay
// (#06888131, #06678443, ...) và fetch Excel đúng campaign 06/05.

import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8080';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.fill('#username', 'admin');
await page.fill('#password', 'admin@@');
await page.press('#password', 'Enter');
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);

await page.goto(`${BASE}/orders-report/tab3-product-assignment.html?t=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(6000);

await page.evaluate(() => window.openUploadHistoryV2Modal());
await page.waitForTimeout(3500);

await page.click('#reconcileAllCampaignBtn');
await page
    .waitForFunction(() => !!document.getElementById('bulkReconCampaignSelect'), { timeout: 30000 })
    .catch(() => {});
await page.waitForTimeout(800);

// Click run
await page.click('#bulkReconRunBtn');
await page
    .waitForFunction(
        () => {
            const out = document.getElementById('bulkReconRunOutput');
            const txt = out?.textContent || '';
            return txt.includes('khớp') || txt.includes('TPOS không có') || txt.includes('thành công');
        },
        { timeout: 60000 }
    )
    .catch(() => {});

const result = await page.evaluate(() => {
    const out = document.getElementById('bulkReconRunOutput');
    const summary = out?.querySelector('.alert')?.textContent.replace(/\s+/g, ' ').trim();
    const droppedRows = [...(out?.querySelectorAll('table tbody tr') || [])].map((tr) =>
        tr.textContent.replace(/\s+/g, ' ').trim().slice(0, 500)
    );
    // Extract all upload short IDs mentioned in the dropped table
    const text = out?.textContent || '';
    const shortIdsMentioned = new Set();
    const matches = text.matchAll(/#(\d{8,10})/g);
    for (const m of matches) shortIdsMentioned.add(m[1]);
    return {
        summary,
        droppedCount: droppedRows.length,
        firstThreeDroppedRows: droppedRows.slice(0, 3),
        shortIdsMentioned: [...shortIdsMentioned],
    };
});

console.log('===== BULK RECONCILE RESULT =====');
console.log('Summary:', result.summary);
console.log('\nFirst 3 dropped rows:');
result.firstThreeDroppedRows.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
console.log('\nUpload short-IDs mentioned in drops:', result.shortIdsMentioned);

// Check if today's uploads are in the result
const todayShortIds = ['06980475', '06888131', '06678443', '06563884', '06111532', '00860050', '00678026', '00183563', '95553024'];
const includedToday = todayShortIds.filter((s) => result.shortIdsMentioned.includes(s));
console.log(`\nToday's uploads with drops detected: ${includedToday.length}/${todayShortIds.length}`);
console.log(`  → ${includedToday.join(', ') || 'NONE'}`);
console.log(`(Note: today's uploads with 0 drops won't appear in the dropped table — only those WITH drops are listed)`);

await browser.close();
