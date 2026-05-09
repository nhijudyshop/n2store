// Fetch HOUSE 06/05/2026 Excel and dump raw rows for STT 33, 87, 48, 6 — see why
// my reconcile parser misses B914/B1895D when direct OData GET confirms they're there.

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

    const campaigns = [
        { name: 'HOUSE 06/05/2026', id: 'dcb29150-2b4c-3bb0-cc2d-3a210f180bd8' },
        { name: 'STORE 06/05/2026', id: '057f56c3-f761-fb7b-a65a-3a210f17d9ba' },
    ];

    const out = {};
    for (const c of campaigns) {
        const url = `${WORKER}/api/SaleOnline_Order/ExportFile?campaignId=${c.id}&sort=date`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json', Accept: '*/*' },
            body: JSON.stringify({ data: '{}' }),
        });
        if (!res.ok) {
            out[c.name] = { error: `HTTP ${res.status}` };
            continue;
        }
        const buf = await res.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rowsR2 = XLSX.utils.sheet_to_json(sheet, { range: 2, defval: null });
        const rowsR1 = XLSX.utils.sheet_to_json(sheet, { range: 1, defval: null });
        const rowsR0 = XLSX.utils.sheet_to_json(sheet, { range: 0, defval: null });

        out[c.name] = {
            sheetName: wb.SheetNames[0],
            rowsR2_count: rowsR2.length,
            rowsR1_count: rowsR1.length,
            rowsR0_count: rowsR0.length,
            rowsR2_keys: rowsR2[0] ? Object.keys(rowsR2[0]) : [],
            rowsR1_keys: rowsR1[0] ? Object.keys(rowsR1[0]) : [],
            sampleR2: rowsR2.slice(0, 2),
            // Find rows where STT-like column = 33, 87, 48, 6, 53
            stt33: rowsR2.find((r) => {
                const k = Object.keys(r)[0];
                const v = r[k];
                return String(v).trim() === '33';
            }),
            stt87: rowsR2.find((r) => {
                const k = Object.keys(r)[0];
                const v = r[k];
                return String(v).trim() === '87';
            }),
            stt48: rowsR2.find((r) => {
                const k = Object.keys(r)[0];
                const v = r[k];
                return String(v).trim() === '48';
            }),
        };
    }
    return out;
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
