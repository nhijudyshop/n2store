// Verify picker sorts by date desc (newest first).

import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8080';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 23)}] ${m}`);

await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.fill('#username', 'admin');
await page.fill('#password', 'admin@@');
await page.press('#password', 'Enter');
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);

await page.goto(`${BASE}/orders-report/tab3-product-assignment.html?t=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(7000);

// KHÔNG broadcast active campaign — để xem sort thuần theo date.
await page.evaluate(() => window.openUploadHistoryV2Modal());
await page.waitForTimeout(4000);

await page.click('#reconcileAllCampaignBtn');
await page.waitForTimeout(1500);

const pickerInfo = await page.evaluate(() => {
    const sel = document.getElementById('bulkReconCampaignSelect');
    return {
        defaultValue: sel?.value,
        defaultLabel: sel?.options[sel.selectedIndex]?.textContent,
        topTen: [...(sel?.options || [])].slice(0, 10).map((o) => o.textContent.trim()),
    };
});

console.log('===== TOP 10 (sorted desc by date) =====');
pickerInfo.topTen.forEach((label, i) => console.log(`  ${i + 1}. ${label}`));
console.log(`\ndefault: ${pickerInfo.defaultLabel}`);

// Extract dates from top-10 and verify they are non-increasing
const dates = pickerInfo.topTen.map((label) => {
    const m = label.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    return m ? m[1] : null;
});
const toMs = (d) => {
    if (!d) return 0;
    const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : 0;
};
const msList = dates.map(toMs);
let nonIncreasing = true;
for (let i = 1; i < msList.length; i++) {
    if (msList[i] > msList[i - 1]) {
        nonIncreasing = false;
        console.log(`!! Out of order at index ${i}: ${dates[i - 1]} → ${dates[i]}`);
    }
}

console.log('\n===== VERDICT =====');
console.log(nonIncreasing ? '✅ PASS — picker sorted desc by date (newest first)' : '❌ FAIL');

await browser.close();
process.exit(nonIncreasing ? 0 : 1);
