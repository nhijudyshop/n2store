// Probe live: does Product(152750) (B914) fetch return data via the same code path tab3-upload uses?
// Also fetch order 01770000-... to see Details now and verify B914 is missing.

import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8080';
const ORDER_ID = '01770000-5d70-0015-b9c1-08deabef01e5';
const PRODUCT_ID = 152750; // B914

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

// Login
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

const result = await page.evaluate(async ({ orderId, productId }) => {
    const out = {};
    const WORKER = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const headers = window.tokenManager ? await window.tokenManager.getAuthHeader() : {};

    // Probe 1: Product(B914) fetch — does fetchProductDetails get back a valid product?
    try {
        const r = await fetch(`${WORKER}/api/odata/Product(${productId})?$expand=UOM`, { headers });
        const text = await r.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) {}
        out.productFetch = {
            status: r.status,
            ok: r.ok,
            hasData: !!parsed,
            id: parsed?.Id,
            defaultCode: parsed?.DefaultCode,
            name: parsed?.Name,
            priceVariant: parsed?.PriceVariant,
            listPrice: parsed?.ListPrice,
            active: parsed?.Active,
            uom: parsed?.UOM?.Name,
            firstChars: text.slice(0, 200),
        };
    } catch (e) { out.productFetch = { error: String(e) }; }

    // Probe 2: Order details NOW
    try {
        const r = await fetch(`${WORKER}/api/odata/SaleOnline_Order(${orderId})?$expand=Details($expand=Product),Partner,User,CRMTeam`, { headers });
        const ord = await r.json();
        out.orderNow = {
            ok: r.ok,
            status: r.status,
            Number: ord.Number,
            SessionIndex: ord.SessionIndex,
            DateInvoice: ord.DateInvoice,
            ReceiverName: ord.ReceiverName,
            DetailsCount: (ord.Details || []).length,
            Details: (ord.Details || []).map((d) => ({
                ProductId: d.Product?.Id || d.ProductId,
                ProductCode: d.Product?.DefaultCode || d.ProductCode,
                Quantity: d.Quantity,
                Note: d.Note,
            })),
        };
    } catch (e) { out.orderNow = { error: String(e) }; }

    return out;
}, { orderId: ORDER_ID, productId: PRODUCT_ID });

console.log(JSON.stringify(result, null, 2));
await browser.close();
