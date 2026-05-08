// Quick verification of orders-report Bill Đã Xóa tab.
// Loads page via local HTTP server, captures console + network errors,
// and reads computed counts/first rows.

import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8080';
const USER = process.env.U || 'admin';
const PASS = process.env.P || 'admin@@';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const consoleMessages = [];
const errors = [];
const failedRequests = [];
const apiCalls = [];

page.on('console', (m) => {
    const text = m.text();
    consoleMessages.push(`[${m.type()}] ${text}`);
});
page.on('pageerror', (e) => errors.push(`PAGE-ERROR: ${e.message}`));
page.on('requestfailed', (req) => failedRequests.push(`${req.method()} ${req.url()} -> ${req.failure()?.errorText}`));
page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('/api/invoice-status/delete')) {
        try {
            const json = await resp.json();
            apiCalls.push({ url, status: resp.status(), success: json.success, count: (json.entries || []).length });
        } catch (_) {
            apiCalls.push({ url, status: resp.status(), success: false, count: 0 });
        }
    }
});

// Login at /index.html
await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.fill('#username', USER);
await page.fill('#password', PASS);
await page.press('#password', 'Enter');
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2000);

// Navigate to the fixed page
await page.goto(`${BASE}/orders-report/tab-pending-delete.html?t=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(4000); // wait for loadData to finish

const state = await page.evaluate(() => {
    const txt = (sel) => document.querySelector(sel)?.textContent?.trim() || '';
    return {
        totalCount: txt('#totalCount'),
        countAll: txt('#countAll'),
        countVisible: txt('#countVisible'),
        countHidden: txt('#countHidden'),
        rowCount: document.querySelectorAll('#tableBody tr').length,
        topRows: [...document.querySelectorAll('#tableBody tr')].slice(0, 5).map((r) =>
            r.textContent.replace(/\s+/g, ' ').trim().slice(0, 200)
        ),
        userFilterOptions: [...document.querySelectorAll('#userFilter option')].map((o) => o.textContent.trim()),
        dateFilterOptions: [...document.querySelectorAll('#dateFilter option')].map((o) => o.textContent.trim()),
    };
});

console.log('===== STATE =====');
console.log(JSON.stringify(state, null, 2));
console.log('===== API CALLS =====');
console.log(JSON.stringify(apiCalls, null, 2));
console.log('===== PAGE ERRORS =====');
console.log(errors.length === 0 ? 'NONE' : errors.join('\n'));
console.log('===== FAILED REQUESTS =====');
console.log(failedRequests.length === 0 ? 'NONE' : failedRequests.join('\n'));
console.log('===== KEY CONSOLE LINES (PENDING-DELETE) =====');
const relevant = consoleMessages.filter((m) => m.includes('PENDING-DELETE') || m.includes('error') || m.includes('Error'));
console.log(relevant.length === 0 ? 'NONE' : relevant.join('\n'));

await browser.close();
