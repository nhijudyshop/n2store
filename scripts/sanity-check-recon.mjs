// Sanity check: load upload #32240280 record, look up uploadResults[stt].orderId
// for sample STTs, then fetch each order via TPOS direct GET (proven endpoint).
// Compare actual TPOS Details vs reconcile's claim that B1895D/B914/etc are missing.

import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8080';

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();

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

const out = await page.evaluate(async () => {
    const WORKER = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const headers = await window.tokenManager.getAuthHeader();
    const db = firebase.database();

    // Find upload record #32240280
    const tree = (await db.ref('productAssignments_v2_history').once('value')).val() || {};
    let record = null;
    for (const recs of Object.values(tree)) {
        for (const [fk, rec] of Object.entries(recs || {})) {
            if (fk.endsWith('32240280')) { record = rec; break; }
        }
        if (record) break;
    }
    if (!record) return { error: 'record not found' };

    // STT → orderId map từ uploadResults
    const sttToOrderId = {};
    (record.uploadResults || []).forEach((r) => {
        if (r.orderId) sttToOrderId[String(r.stt)] = r.orderId;
    });

    // Sample các (STT, expected product) bị reconcile flag là rớt
    const targets = [
        { stt: '87', expected: 'B1895D' },
        { stt: '48', expected: 'B914' },
        { stt: '6', expected: 'B914' },
        { stt: '33', expected: 'B914' },
        { stt: '53', expected: 'B1907S' },
        { stt: '47', expected: 'B1907M' },
    ];

    const results = [];
    for (const t of targets) {
        const orderId = sttToOrderId[t.stt];
        if (!orderId) {
            results.push({ ...t, error: 'no orderId in uploadResults' });
            continue;
        }
        try {
            const r = await fetch(
                `${WORKER}/api/odata/SaleOnline_Order(${orderId})?$expand=Details($expand=Product)`,
                { headers: { ...headers, Accept: 'application/json' } }
            );
            if (!r.ok) {
                results.push({ ...t, orderId, error: `HTTP ${r.status}` });
                continue;
            }
            const ord = await r.json();
            const codes = (ord.Details || []).map(
                (d) => d.Product?.DefaultCode || d.ProductCode || ''
            );
            const codesUpper = codes.map((c) => (c || '').toUpperCase());
            results.push({
                ...t,
                orderId,
                Number: ord.Number,
                campaign: ord.LiveCampaignName,
                productCount: codes.length,
                productCodes: codes,
                tposHasExpected: codesUpper.includes(t.expected.toUpperCase()),
            });
        } catch (e) {
            results.push({ ...t, orderId, error: String(e) });
        }
    }
    return { results };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
