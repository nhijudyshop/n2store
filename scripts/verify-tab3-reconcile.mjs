// Open Chi Tiết Upload #32240280 modal, click "Đối soát TPOS", verify the
// reconciliation panel detects B914 → STT 157 as missing on TPOS.

import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8080';
const SHORT = process.env.SHORT || '32240280';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const errors = [];
const importantLogs = [];
page.on('pageerror', (e) => errors.push(`PAGEERR: ${e.message}`));
page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') errors.push(`CONSOLE-ERR: ${t}`);
    if (t.includes('[RECON-V2]') || t.includes('Reconcile')) importantLogs.push(`[${m.type()}] ${t}`);
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

// Open detail modal directly via window.viewUploadHistoryDetailV2
const result = await page.evaluate(async (shortKey) => {
    const out = {};
    try {
        const db = firebase.database();
        const tree = (await db.ref('productAssignments_v2_history').once('value')).val() || {};
        let uid = null, fk = null;
        for (const [u, recs] of Object.entries(tree)) {
            for (const k of Object.keys(recs || {})) {
                if (k.endsWith(shortKey)) { uid = u; fk = k; break; }
            }
            if (fk) break;
        }
        if (!fk) { out.error = 'record not found'; return out; }
        out.found = { uid, fk };

        await window.viewUploadHistoryDetailV2(fk, uid);
        await new Promise((r) => setTimeout(r, 1500));

        // Click reconcile button
        if (typeof window.reconcileUploadWithTPOSV2 !== 'function') {
            out.error = 'reconcileUploadWithTPOSV2 not defined';
            return out;
        }
        await window.reconcileUploadWithTPOSV2();
        // Wait for TPOS Excel fetch + render — could take 3-15s.
        await new Promise((r) => setTimeout(r, 20000));

        const resultsEl = document.getElementById('tab3ReconcileResults');
        out.resultsHtmlLength = resultsEl ? resultsEl.innerHTML.length : 0;
        out.resultsHtmlPreview = resultsEl
            ? resultsEl.innerHTML.replace(/\s+/g, ' ').slice(0, 3500)
            : null;
        // Extract summary numbers
        const summary = resultsEl?.querySelector('.alert');
        out.summaryText = summary ? summary.textContent.replace(/\s+/g, ' ').trim() : null;
        // Extract dropped rows
        const droppedRows = [...(resultsEl?.querySelectorAll('table tbody tr') || [])].map((tr) =>
            tr.textContent.replace(/\s+/g, ' ').trim().slice(0, 250)
        );
        out.droppedRows = droppedRows;
    } catch (e) {
        out.error = String(e);
    }
    return out;
}, SHORT);

console.log('===== RECONCILE RESULT =====');
console.log(JSON.stringify(result, null, 2));
console.log('===== KEY LOGS =====');
console.log(importantLogs.length === 0 ? 'NONE' : importantLogs.slice(-30).join('\n'));
console.log('===== ERRORS =====');
console.log(errors.length === 0 ? 'NONE' : errors.slice(0, 10).join('\n'));

await browser.close();
