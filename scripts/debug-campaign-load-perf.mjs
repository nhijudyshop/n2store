// Debug perf for "hard reload main.html → choose campaign in modal → orders rendered".
// Measures every phase + lists slow network calls grouped by host+path.

import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8080';
const USER = process.env.U || 'admin';
const PASS = process.env.P || 'admin@@';
const SLOW_MS = Number(process.env.SLOW_MS || 500);
const TARGET_OPT_INDEX = Number(process.env.OPT || 1); // 1 = first real campaign in modal dropdown

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ bypassCSP: true });
const page = await ctx.newPage();

// Force-uncached: simulate hard reload for every fetch.
await ctx.route('**/*', (route) => {
    const headers = {
        ...route.request().headers(),
        'cache-control': 'no-cache, no-store, must-revalidate',
        pragma: 'no-cache',
    };
    route.continue({ headers });
});

const requests = new Map();
const errors = [];
const consoleLines = [];

page.on('console', (m) => {
    const text = m.text();
    if (m.type() === 'error') errors.push(text);
    if (
        text.includes('[CAMPAIGN]') ||
        text.includes('[SEARCH]') ||
        text.includes('[INIT]') ||
        text.includes('[SYNC]') ||
        text.includes('[REALTIME]') ||
        text.includes('[KPI]') ||
        text.includes('[EMPLOYEE]') ||
        text.includes('[TPOS]') ||
        text.includes('[PANCAKE]') ||
        text.includes('[ERROR]') ||
        text.includes('Error')
    ) {
        consoleLines.push(`[${m.type()}] ${text}`);
    }
});
page.on('pageerror', (e) => errors.push(`PAGEERR: ${e.message}`));

page.on('request', (req) => {
    requests.set(req, {
        url: req.url(),
        method: req.method(),
        start: Date.now(),
        end: 0,
        status: 0,
        resourceType: req.resourceType(),
    });
});
page.on('response', (resp) => {
    const r = requests.get(resp.request());
    if (r) {
        r.end = Date.now();
        r.status = resp.status();
    }
});
page.on('requestfailed', (req) => {
    const r = requests.get(req);
    if (r) {
        r.end = Date.now();
        r.status = 'FAIL ' + (req.failure()?.errorText || '');
    }
});

const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 23)}] ${msg}`);

// 1) Login.
log('Login…');
await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.fill('#username', USER);
await page.fill('#password', PASS);
await page.press('#password', 'Enter');
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);
log(`Logged in. URL=${page.url()}`);

// 2) Hard nav to main.html.
log('Hard reload main.html…');
const t0 = Date.now();
await page.goto(`${BASE}/orders-report/main.html?t=${Date.now()}`, { waitUntil: 'domcontentloaded' });
const tDom = Date.now();
log(`main.html DOMContentLoaded: ${tDom - t0}ms`);

// 3) Wait until tab1 frame's selectCampaignModal is visible AND has options.
log('Wait for selectCampaignModal to be ready…');
let tab1Frame = null;
let modalOptions = [];
const tModalWaitStart = Date.now();
for (let i = 0; i < 60; i++) {
    tab1Frame = page.frames().find((f) => f.url().includes('tab1-orders.html'));
    if (tab1Frame) {
        const got = await tab1Frame.evaluate(() => {
            const modal = document.getElementById('selectCampaignModal');
            const dd = document.getElementById('selectCampaignDropdown');
            const display = modal ? getComputedStyle(modal).display : 'none';
            const opts = dd ? [...dd.options].map((o) => ({ v: o.value, t: o.textContent.trim() })) : [];
            return { display, opts };
        }).catch(() => ({ display: 'none', opts: [] }));
        if (got.display === 'flex' && got.opts.length > 1) {
            modalOptions = got.opts;
            break;
        }
    }
    await page.waitForTimeout(500);
}
const tModalReady = Date.now();
log(`selectCampaignModal ready: +${tModalReady - tModalWaitStart}ms (${tModalReady - t0}ms after hard reload). Options=${modalOptions.length}`);
if (modalOptions.length < 2) {
    log('Not enough campaign options. Bailing.');
    await browser.close();
    process.exit(1);
}
log(`First 5 modal options: ${JSON.stringify(modalOptions.slice(0, 5), null, 2)}`);

// 4) Pick a campaign and click Confirm.
const target = modalOptions[TARGET_OPT_INDEX] || modalOptions[1];
log(`Target campaign: ${JSON.stringify(target)}`);

const tChangeStart = Date.now();
log(`>>> Selecting campaign + clicking confirmSelectCampaign() at t+${tChangeStart - t0}ms`);
await tab1Frame.evaluate((value) => {
    const dd = document.getElementById('selectCampaignDropdown');
    dd.value = value;
    dd.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof window.confirmSelectCampaign === 'function') {
        window.confirmSelectCampaign();
    }
}, target.v);

// 5) Wait for orders table to settle.
let tFirstRow = 0;
let tStable = 0;
let lastRowCount = -1;
let stableSince = 0;
const POLL_MS = 250;
const TIMEOUT_MS = 90000;
for (let i = 0; i < TIMEOUT_MS / POLL_MS; i++) {
    const state = await tab1Frame.evaluate(() => {
        const tbody = document.querySelector('#ordersTable tbody, table.orders-table tbody, table tbody');
        const rows = tbody ? tbody.querySelectorAll('tr').length : 0;
        const loadingVisible =
            !!document.querySelector('.loading-overlay:not([style*="display: none"]), .spinner-overlay:not([style*="display: none"])');
        const modal = document.getElementById('selectCampaignModal');
        const modalDisplay = modal ? getComputedStyle(modal).display : 'none';
        return { rows, loadingVisible, modalDisplay };
    }).catch(() => ({ rows: 0, loadingVisible: false, modalDisplay: 'unknown' }));

    if (state.rows > 0 && tFirstRow === 0) {
        tFirstRow = Date.now();
        log(`First-row paint at t+${tFirstRow - tChangeStart}ms (rows=${state.rows}, modal=${state.modalDisplay})`);
    }

    if (state.rows === lastRowCount && state.rows > 0 && !state.loadingVisible) {
        if (!stableSince) stableSince = Date.now();
        if (Date.now() - stableSince > 2000) {
            tStable = Date.now();
            log(`Rows stable at t+${tStable - tChangeStart}ms (rows=${state.rows})`);
            break;
        }
    } else {
        stableSince = 0;
        lastRowCount = state.rows;
    }
    await page.waitForTimeout(POLL_MS);
}
if (!tStable) log(`!!! Rows never stable within ${TIMEOUT_MS}ms. lastRowCount=${lastRowCount}`);

// 6) Slow request analysis (only those that started after the change AND completed).
const all = [...requests.values()].filter((r) => r.start >= tChangeStart && r.end > 0);
const slow = all
    .map((r) => ({ ...r, dur: r.end - r.start }))
    .filter((r) => r.dur >= SLOW_MS)
    .sort((a, b) => b.dur - a.dur);

log(`\n===== TOTAL REQUESTS during change window: ${all.length} =====`);
log(`===== SLOW (>${SLOW_MS}ms): ${slow.length} =====`);
slow.slice(0, 30).forEach((r, i) => {
    const u = r.url.length > 140 ? r.url.slice(0, 140) + '…' : r.url;
    log(`#${(i + 1).toString().padStart(2)} ${r.dur.toString().padStart(5)}ms [${r.status}] ${r.method} ${u}`);
});

// Group slow by host + first 3 path segments.
const groups = new Map();
all.forEach((r) => {
    let url;
    try { url = new URL(r.url); } catch { return; }
    const key = `${url.host}${url.pathname.split('/').slice(0, 4).join('/')}`;
    if (!groups.has(key)) groups.set(key, { key, count: 0, totalMs: 0, maxMs: 0, slowCount: 0 });
    const g = groups.get(key);
    g.count += 1;
    g.totalMs += (r.end - r.start);
    g.maxMs = Math.max(g.maxMs, r.end - r.start);
    if ((r.end - r.start) >= SLOW_MS) g.slowCount += 1;
});
const topGroups = [...groups.values()].sort((a, b) => b.totalMs - a.totalMs).slice(0, 15);
log(`\n===== ALL REQUESTS GROUPED (host + path[0..3]), top 15 by totalMs =====`);
topGroups.forEach((g) =>
    log(`${g.totalMs.toString().padStart(6)}ms total · ${g.count.toString().padStart(3)} req · max ${g.maxMs.toString().padStart(5)}ms · slow ${g.slowCount} · ${g.key}`)
);

log(`\n===== TIMINGS =====`);
log(`hard reload → DOMContentLoaded:        ${tDom - t0}ms`);
log(`hard reload → modal ready:             ${tModalReady - t0}ms`);
log(`confirm campaign → first row paint:    ${tFirstRow ? tFirstRow - tChangeStart : 'N/A'}ms`);
log(`confirm campaign → rows stable:        ${tStable ? tStable - tChangeStart : 'TIMEOUT'}ms`);
log(`hard reload → rows stable:             ${tStable ? tStable - t0 : 'TIMEOUT'}ms (TOTAL UX TIME)`);

log(`\n===== KEY CONSOLE LINES (last 60) =====`);
consoleLines.slice(-60).forEach((l) => log(l));
log(`\n===== ERRORS =====`);
log(errors.length === 0 ? 'NONE' : errors.slice(0, 10).join('\n'));

await browser.close();
