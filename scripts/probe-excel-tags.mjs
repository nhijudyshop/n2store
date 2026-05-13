// Probe: tải Excel campaign 06/05/2026 → đếm số STT có tag skip
// ("ĐÃ GỘP KO CHỐT" / "KHÔNG CẦN CHỐT") trong cột Nhãn.

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
await page.waitForTimeout(7000);

// Trigger _fetchCampaignExcel via bulk recon picker → run real fetch for
// campaign id 057f56c3 (STORE 06/05) or dcb29150 (HOUSE 06/05).
const out = await page.evaluate(async () => {
    // Fetch raw Excel and inspect columns + tag values directly.
    const WORKER = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const headers = await window.tokenManager.getAuthHeader();
    // Scan top campaigns to find any with skip tags. First, fetch recent
    // campaigns from OData (last 60 days), then probe each Excel.
    const odataUrl = `${WORKER}/api/odata/SaleOnline_LiveCampaign?$top=40&$orderby=DateCreated+desc`;
    const odataRes = await fetch(odataUrl, {
        headers: { ...headers, Accept: 'application/json' },
    });
    const odata = odataRes.ok ? await odataRes.json() : { value: [], _status: odataRes.status };
    const ids = {};
    for (const c of (odata.value || []).slice(0, 20)) {
        if (c.Id && c.Name) ids[c.Name] = c.Id;
    }
    if (Object.keys(ids).length === 0) {
        return { _debug: { odataStatus: odata._status, sample: odata.value?.[0], odataUrl } };
    }
    const results = {};
    for (const [name, cid] of Object.entries(ids)) {
        const url = `${WORKER}/api/SaleOnline_Order/ExportFile?campaignId=${cid}&sort=date`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json', Accept: '*/*' },
            body: JSON.stringify({ data: '{}' }),
        });
        if (!res.ok) {
            results[name] = { error: `HTTP ${res.status}` };
            continue;
        }
        const buf = await res.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { range: 2, defval: null });
        const cols = rows.length ? Object.keys(rows[0]) : [];
        const tagKey = cols.find((k) => /^Nh[aã]n$/i.test(k)) || cols.find((k) => /Nh[aã]n/i.test(k));
        const tagCounts = new Map();
        const skipSttSamples = [];
        const skipNorm = ['da gop ko chot', 'khong can chot'];
        const _norm = (s) =>
            String(s || '')
                .normalize('NFD')
                .replace(/[̀-ͯ]/g, '')
                .replace(/đ/gi, 'd')
                .toLowerCase()
                .trim()
                .replace(/\s+/g, ' ');
        const sttKey = cols.find((k) => k === '###') || cols[1] || cols[0];
        for (const row of rows) {
            const t = String(row[tagKey] || '');
            if (!t) continue;
            for (const tok of t.split(/[,;\/\n\r]+/).map((x) => x.trim()).filter(Boolean)) {
                tagCounts.set(tok, (tagCounts.get(tok) || 0) + 1);
                if (skipNorm.includes(_norm(tok))) {
                    if (skipSttSamples.length < 10) {
                        skipSttSamples.push({ stt: String(row[sttKey] || ''), tag: tok });
                    }
                }
            }
        }
        const sorted = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
        results[name] = {
            cid,
            rowsCount: rows.length,
            tagColumnName: tagKey,
            topTags: sorted,
            skipSttSamples,
        };
    }
    return results;
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
