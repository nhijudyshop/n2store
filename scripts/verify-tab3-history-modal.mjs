// Open tab3-product-assignment.html, click "Lịch Sử Upload",
// click upload #32240280 detail, verify the modal renders with per-STT outcome
// badges. Dump the HTML containing STT 157 to confirm B914 row shows ❌ for STT 157.

import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8080';
const SHORT = process.env.SHORT || '32240280';
const STT = process.env.STT || '157';
const PCODE = process.env.PCODE || 'B914';

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

// Drive the render directly via the shared function — bypasses needing to click
// through the history list UI (which has filters etc).
const result = await page.evaluate(async ({ shortKey, targetStt, pcode }) => {
    const out = {};
    try {
        const db = firebase.database();
        const allUsers = await db.ref('productAssignments_v2_history').once('value');
        const tree = allUsers.val() || {};
        let foundUserId = null, foundFirebaseKey = null;
        for (const [uid, recs] of Object.entries(tree)) {
            for (const [fk] of Object.entries(recs || {})) {
                if (fk.endsWith(shortKey)) {
                    foundUserId = uid; foundFirebaseKey = fk; break;
                }
            }
            if (foundFirebaseKey) break;
        }
        out.found = { uid: foundUserId, fk: foundFirebaseKey };
        if (!foundFirebaseKey) return out;

        if (typeof window.viewUploadHistoryDetailV2 !== 'function') {
            out.error = 'viewUploadHistoryDetailV2 not defined';
            return out;
        }
        await window.viewUploadHistoryDetailV2(foundFirebaseKey, foundUserId);
        await new Promise((r) => setTimeout(r, 1500));
        const body = document.getElementById('historyV2DetailModalBody');
        const html = body ? body.innerHTML : '';
        out.modalHtmlLength = html.length;
        // Find rows containing pcode
        const rows = (html.match(new RegExp(`<tr>.*?${pcode}.*?</tr>`, 'gis')) || []);
        out.rowsContainingPcode = rows.length;
        out.firstRowSample = rows[0] ? rows[0].slice(0, 1500) : null;
        // Check whether STT badge is red (badge bg-danger) for our target STT inside the B914 row
        if (rows[0]) {
            const sttBadgeRe = new RegExp(`<span class="badge ([^"]+)"[^>]*>(?:❌|✓)?\\s*${targetStt}<`, 'gi');
            const m = sttBadgeRe.exec(rows[0]);
            out.sttBadgeMatch = m ? m[0] : null;
            out.sttIsRed = !!(m && m[1].includes('bg-danger'));
            out.sttIsGreen = !!(m && m[1].includes('bg-success'));
        }
    } catch (e) { out.error = String(e); }
    return out;
}, { shortKey: SHORT, targetStt: STT, pcode: PCODE });

console.log('===== MODAL CHECK =====');
console.log(JSON.stringify(result, null, 2));
console.log('===== ERRORS =====');
console.log(errors.length === 0 ? 'NONE' : errors.join('\n'));

await browser.close();
