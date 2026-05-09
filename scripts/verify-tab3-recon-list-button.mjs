// Verify outer "Đối Soát TPOS" button in history-list opens detail + auto-runs reconcile.

import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8080';
const SHORT = process.env.SHORT || '32240280';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERR: ${e.message}`));
page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`CONSOLE-ERR: ${m.text()}`);
});

await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.fill('#username', 'admin');
await page.fill('#password', 'admin@@');
await page.press('#password', 'Enter');
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);

await page.goto(`${BASE}/orders-report/tab3-product-assignment.html?t=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(8000);

const result = await page.evaluate(async (shortKey) => {
    const out = {};
    try {
        // Find the record's keys
        const db = firebase.database();
        const tree = (await db.ref('productAssignments_v2_history').once('value')).val() || {};
        let uid = null, fk = null;
        for (const [u, recs] of Object.entries(tree)) {
            for (const k of Object.keys(recs || {})) {
                if (k.endsWith(shortKey)) { uid = u; fk = k; break; }
            }
            if (fk) break;
        }
        out.found = { uid, fk };
        if (!fk) { out.error = 'record not found'; return out; }

        // Open the V2 history modal first (so the list renders).
        if (typeof window.openUploadHistoryV2Modal !== 'function') {
            out.error = 'openUploadHistoryV2Modal not defined';
            return out;
        }
        await window.openUploadHistoryV2Modal();
        await new Promise((r) => setTimeout(r, 3000));

        // Verify the new "Đối Soát TPOS" button exists in the list.
        const buttons = [...document.querySelectorAll('button.btn-warning')].filter((b) =>
            (b.textContent || '').includes('Đối Soát TPOS')
        );
        out.outerButtonsFound = buttons.length;
        if (buttons.length === 0) {
            out.error = 'No outer "Đối Soát TPOS" button rendered';
            return out;
        }

        // Click reconcileFromListV2 directly with our target key (more reliable
        // than trying to find the right row in DOM).
        if (typeof window.reconcileFromListV2 !== 'function') {
            out.error = 'reconcileFromListV2 not defined';
            return out;
        }
        const t0 = Date.now();
        await window.reconcileFromListV2(fk, uid);
        await new Promise((r) => setTimeout(r, 22000)); // wait for Excel fetch + render

        const resultsEl = document.getElementById('tab3ReconcileResults');
        out.elapsedMs = Date.now() - t0;
        out.resultsHtmlLength = resultsEl ? resultsEl.innerHTML.length : 0;
        const summary = resultsEl?.querySelector('.alert');
        out.summaryText = summary ? summary.textContent.replace(/\s+/g, ' ').trim() : null;
        out.excelLine = resultsEl?.querySelector('.text-muted.small')?.textContent.replace(/\s+/g, ' ').trim();
        const droppedRows = [...(resultsEl?.querySelectorAll('table tbody tr') || [])].map((tr) =>
            tr.textContent.replace(/\s+/g, ' ').trim().slice(0, 250)
        );
        out.droppedRows = droppedRows;
    } catch (e) {
        out.error = String(e);
    }
    return out;
}, SHORT);

console.log(JSON.stringify(result, null, 2));
console.log('===== ERRORS =====');
console.log(errors.length === 0 ? 'NONE' : errors.slice(0, 10).join('\n'));

await browser.close();
