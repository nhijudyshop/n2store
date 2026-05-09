// Verify STORE+HOUSE same-date merging in bulk reconcile picker.

import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8080';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERR: ${e.message}`));
page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`ERR: ${m.text().slice(0, 200)}`);
});

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

// Make tab1 broadcast active campaign = "STORE 30/03/2026" (HOUSE 30/03/2026 also exists in history → should merge)
await page.evaluate(() => {
    window.postMessage(
        {
            type: 'CAMPAIGN_CHANGED_FOR_TAB3',
            campaignNames: ['STORE 30/03/2026'],
        },
        '*'
    );
});
await page.waitForTimeout(500);

await page.evaluate(() => window.openUploadHistoryV2Modal());
await page.waitForTimeout(4000);

await page.click('#reconcileAllCampaignBtn');
await page.waitForTimeout(1500);

const pickerInfo = await page.evaluate(() => {
    const sel = document.getElementById('bulkReconCampaignSelect');
    return {
        defaultValue: sel?.value,
        defaultLabel: sel?.options[sel.selectedIndex]?.textContent,
        firstFiveLabels: [...(sel?.options || [])].slice(0, 5).map((o) => o.textContent.trim()),
    };
});
log(`default: ${pickerInfo.defaultLabel}`);
log(`firstFive: ${JSON.stringify(pickerInfo.firstFiveLabels, null, 2)}`);

// Auto-run should fire for active group → wait for output
log('Wait for auto-run merged output…');
const t0 = Date.now();
await page
    .waitForFunction(
        () => {
            const out = document.getElementById('bulkReconRunOutput');
            const txt = out?.textContent || '';
            return txt.includes('khớp') || txt.includes('TPOS không có') || txt.includes('thành công');
        },
        { timeout: 90000 }
    )
    .catch(() => {});
log(`Render after ${Date.now() - t0}ms`);

const finalState = await page.evaluate(() => {
    const out = document.getElementById('bulkReconRunOutput');
    const summaryEl = out?.querySelector('.alert');
    return {
        summaryRaw: summaryEl?.innerText.replace(/\s+/g, ' ').trim(),
        droppedRows: out?.querySelectorAll('table tbody tr').length || 0,
        sampleDropRowText:
            out?.querySelectorAll('table tbody tr')[0]?.textContent.replace(/\s+/g, ' ').trim().slice(0, 250),
    };
});
console.log('===== FINAL =====');
console.log(JSON.stringify(finalState, null, 2));

const ok =
    pickerInfo.defaultValue?.startsWith('__date__:') &&
    pickerInfo.defaultLabel?.includes('30/03/2026') &&
    pickerInfo.defaultLabel?.includes('gộp') &&
    finalState.summaryRaw?.includes('gộp');

console.log('===== ERRORS =====');
console.log(errors.length === 0 ? 'NONE' : errors.slice(0, 5).join('\n'));
console.log('===== VERDICT =====');
console.log(ok ? '✅ PASS — STORE+HOUSE 30/03/2026 merged into 1 option, auto-run gộp' : '❌ FAIL');

await browser.close();
process.exit(ok ? 0 : 1);
