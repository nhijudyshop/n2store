// End-to-end browser test: actually CLICK the new "Đối Soát TPOS" button (not eval).
// Visit tab3 → open history modal → locate target row → click its outer button → wait → assert.

import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8080';
const SHORT = process.env.SHORT || '32240280';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const errors = [];
const consoleLines = [];
page.on('pageerror', (e) => errors.push(`PAGEERR: ${e.message}`));
page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') errors.push(`CONSOLE-ERR: ${t}`);
    if (t.includes('[RECON-V2]') || t.includes('reconcil') || t.includes('campaign')) {
        consoleLines.push(`[${m.type()}] ${t.slice(0, 200)}`);
    }
});

const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 23)}] ${msg}`);

log('Login…');
await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.fill('#username', 'admin');
await page.fill('#password', 'admin@@');
await page.press('#password', 'Enter');
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);

log('Open tab3-product-assignment.html…');
await page.goto(`${BASE}/orders-report/tab3-product-assignment.html?t=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(8000);

log('Open Lịch Sử Upload V2 modal…');
await page.evaluate(() => window.openUploadHistoryV2Modal());
await page.waitForTimeout(4000);

// Switch to "Tất cả người dùng" để diện cover lớn hơn (không bắt buộc).
await page.evaluate(() => {
    const sel = document.getElementById('historyV2UserFilter');
    if (sel) {
        sel.value = 'all';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
});
await page.waitForTimeout(2500);

// Take screenshot to confirm button visible
await page.screenshot({
    path: 'downloads/n2store-session/tab3-history-modal-with-button.png',
    fullPage: false,
});
log('Screenshot saved → downloads/n2store-session/tab3-history-modal-with-button.png');

// Pick the FIRST visible "Đối Soát TPOS" button (any record demonstrates feature).
const targetButton = await page.evaluate(() => {
    const allBtns = [...document.querySelectorAll('button')];
    const matched = allBtns.filter((b) =>
        (b.textContent || '').includes('Đối Soát TPOS') && b.offsetParent !== null
    );
    if (matched.length === 0) {
        return { exists: false, totalRendered: 0 };
    }
    matched[0].setAttribute('data-test-target', '1');
    return {
        exists: true,
        totalRendered: matched.length,
        onclick: matched[0].getAttribute('onclick'),
        text: matched[0].textContent.replace(/\s+/g, ' ').trim(),
    };
});

log(`Target button: ${JSON.stringify(targetButton)}`);
if (!targetButton.exists) {
    console.log('FAIL: no "Đối Soát TPOS" button rendered in history list');
    await browser.close();
    process.exit(1);
}

log('Clicking the button…');
const t0 = Date.now();
await page.click('button[data-test-target="1"]');

// Wait for reconcile to finish — detail modal opens, then reconcile fetches Excel.
log('Waiting for reconcile to render…');
await page.waitForFunction(
    () => {
        const el = document.getElementById('tab3ReconcileResults');
        if (!el) return false;
        const txt = el.textContent || '';
        return txt.includes('khớp') || txt.includes('TPOS không có') || txt.includes('Lỗi');
    },
    { timeout: 60000 }
).catch(() => {});
const elapsed = Date.now() - t0;
log(`Reconcile rendered after ${elapsed}ms`);

const finalState = await page.evaluate(() => {
    const resultsEl = document.getElementById('tab3ReconcileResults');
    if (!resultsEl) return { error: 'no results element' };
    const summary = resultsEl.querySelector('.alert');
    const excelLineEl = resultsEl.querySelector('.text-muted.small');
    const droppedRows = [...resultsEl.querySelectorAll('table tbody tr')].map((tr) =>
        tr.textContent.replace(/\s+/g, ' ').trim().slice(0, 200)
    );
    return {
        summary: summary ? summary.textContent.replace(/\s+/g, ' ').trim() : null,
        excelLine: excelLineEl
            ? excelLineEl.textContent.replace(/\s+/g, ' ').trim()
            : null,
        droppedRows,
    };
});

console.log('===== FINAL STATE =====');
console.log(JSON.stringify(finalState, null, 2));

await page.screenshot({
    path: 'downloads/n2store-session/tab3-recon-result.png',
    fullPage: false,
});
log('Screenshot saved → downloads/n2store-session/tab3-recon-result.png');

console.log('===== KEY CONSOLE =====');
console.log(consoleLines.length === 0 ? 'NONE' : consoleLines.slice(-15).join('\n'));
console.log('===== ERRORS =====');
console.log(errors.length === 0 ? 'NONE' : errors.slice(0, 8).join('\n'));

// Assertions: button rendered → click → reconcile produced result with Excel line + summary.
const summaryOk =
    finalState.summary &&
    /\d+\s*bản ghi/.test(finalState.summary) &&
    (finalState.summary.includes('khớp') || finalState.summary.includes('TPOS không có'));
const excelOk = finalState.excelLine && /Excel đã tải|→/.test(finalState.excelLine);

console.log('===== VERDICT =====');
console.log(`summaryOk=${summaryOk}  excelOk=${excelOk}  buttons=${targetButton.totalRendered}`);
const ok = summaryOk && excelOk;
console.log(ok ? '✅ PASS — outer button click triggers reconcile end-to-end' : '❌ FAIL');

await browser.close();
process.exit(ok ? 0 : 1);
