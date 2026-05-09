// Verify bulk reconcile auto-picks user's currently-active campaign.

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

// Simulate tab1 broadcasting CAMPAIGN_CHANGED_FOR_TAB3 with a specific campaign
// (in production this happens automatically when user picks campaign in tab1).
log('Simulating tab1 → tab3 CAMPAIGN_CHANGED_FOR_TAB3 = "STORE 30/03/2026"…');
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

// Sanity check: state.activeCampaignNames should be set
const stateCheck = await page.evaluate(() => {
    return window._tab3?.state?.activeCampaignNames || [];
});
log(`state.activeCampaignNames = ${JSON.stringify(stateCheck)}`);

log('Open history modal…');
await page.evaluate(() => window.openUploadHistoryV2Modal());
await page.waitForTimeout(4000);

log('Click "Đối soát toàn chiến dịch"…');
await page.click('#reconcileAllCampaignBtn');
await page.waitForTimeout(1500);

// Inspect picker default selection
const pickerInfo = await page.evaluate(() => {
    const sel = document.getElementById('bulkReconCampaignSelect');
    return {
        selected: sel?.value,
        firstOptText: sel?.options[0]?.textContent,
        hasActiveTag: [...(sel?.options || [])].some((o) => o.textContent.includes('👀')),
    };
});
log(`Picker default: "${pickerInfo.selected}" (firstOpt: "${pickerInfo.firstOptText}")`);
log(`Has active-campaign tag (👀): ${pickerInfo.hasActiveTag}`);

// Auto-run should kick off — wait for output
log('Waiting for auto-run to render…');
const t0 = Date.now();
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
log(`Auto-run rendered after ${Date.now() - t0}ms`);

const finalState = await page.evaluate(() => {
    const out = document.getElementById('bulkReconRunOutput');
    return {
        summary: out?.querySelector('.alert')?.textContent.replace(/\s+/g, ' ').trim(),
        droppedRowsCount: out?.querySelectorAll('table tbody tr').length || 0,
    };
});
console.log('===== FINAL =====');
console.log(JSON.stringify(finalState, null, 2));
console.log('===== ERRORS =====');
console.log(errors.length === 0 ? 'NONE' : errors.slice(0, 5).join('\n'));

const ok =
    pickerInfo.selected === 'STORE 30/03/2026' &&
    pickerInfo.hasActiveTag &&
    finalState.summary?.includes('STORE 30/03/2026');

console.log('===== VERDICT =====');
console.log(ok ? '✅ PASS — auto-pick + auto-run on active campaign' : '❌ FAIL');

await browser.close();
process.exit(ok ? 0 : 1);
