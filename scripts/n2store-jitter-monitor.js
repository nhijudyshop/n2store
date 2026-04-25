#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Mục đích: login n2store -> chuyển filter Tag XL = "ĐƠN CHƯA PHẢN HỒI" -> monitor jitter (re-render bảng) trong N giây.
// Chạy:  node scripts/n2store-jitter-monitor.js --user "<U>" --pass "<P>" [--seconds 90]

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ARGS = (() => {
    const a = process.argv.slice(2);
    const out = { seconds: 90, user: '', pass: '' };
    for (let i = 0; i < a.length; i++) {
        if (a[i] === '--user') out.user = a[++i];
        else if (a[i] === '--pass') out.pass = a[++i];
        else if (a[i] === '--seconds') out.seconds = Number(a[++i]) || 90;
    }
    return out;
})();

if (!ARGS.user || !ARGS.pass) {
    console.error('Usage: node scripts/n2store-jitter-monitor.js --user U --pass P [--seconds 90]');
    process.exit(1);
}

const BASE_URL = 'https://nhijudyshop.github.io/n2store';
const LOGIN_URL = `${BASE_URL}/`;
const ORDERS_URL = `${BASE_URL}/orders-report/main.html`;
const OUT_DIR = path.join(__dirname, '..', 'downloads', 'n2store-jitter');
const COOKIE_FILE = path.join(OUT_DIR, 'cookies.json');
const STORAGE_FILE = path.join(OUT_DIR, 'storage-state.json');
const LOG_FILE = path.join(OUT_DIR, 'jitter-log.json');

fs.mkdirSync(OUT_DIR, { recursive: true });

const ts = () => new Date().toISOString();
const log = (...a) => console.log(`[${ts()}]`, ...a);

(async () => {
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    // Capture network requests for diagnosis
    const netLog = [];
    page.on('request', (req) => {
        const u = req.url();
        if (/firestore|googleapis|chatomni|workers\.dev|render\.com|tpos|pancake/i.test(u)) {
            netLog.push({ t: ts(), method: req.method(), url: u.slice(0, 220) });
        }
    });

    log('Open login page:', LOGIN_URL);
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#username, input[name="username"]', { timeout: 30_000 });

    log('Type credentials');
    await page.fill('#username', ARGS.user);
    await page.fill('#password', ARGS.pass);
    // Press Enter to submit (avoids click-stability issues with animated button)
    await page.locator('#password').press('Enter');

    log('Wait for redirect away from login (or auth saved to localStorage)');
    // Wait for either URL change OR authState in storage
    await page
        .waitForFunction(
            () => {
                if (!/\/n2store\/?$|\/n2store\/index\.html$/.test(location.href)) return true;
                try {
                    const ls =
                        localStorage.getItem('loginindex_auth') ||
                        localStorage.getItem('authState');
                    return !!ls;
                } catch (_) {
                    return false;
                }
            },
            { timeout: 30_000 }
        )
        .catch(() => {});
    await page.waitForTimeout(2_000);
    log('After login, current URL:', page.url());

    log('Navigate to', ORDERS_URL);
    await page
        .goto(ORDERS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        .catch((e) => log('goto warn:', e.message));

    // Wait for tab1 iframe / table to render
    log('Wait for orders table');
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(3_000);

    // Save cookies + storage
    const cookies = await ctx.cookies();
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
    await ctx.storageState({ path: STORAGE_FILE });
    log('Cookies saved →', COOKIE_FILE);
    log('Storage saved →', STORAGE_FILE);

    // Tab1 lives in an iframe (orders-frame). Find it.
    const frame = page.frames().find((f) => /tab1-orders\.html/.test(f.url())) || page.mainFrame();
    log('Working on frame:', frame.url());

    // Switch Tag XL filter -> "ĐƠN CHƯA PHẢN HỒI" via public API (matches sidebar click)
    const trySetFilter = async () => {
        return await frame.evaluate(() => {
            try {
                if (typeof window._ptagSetFilter !== 'function') {
                    return { ok: false, reason: '_ptagSetFilter not available' };
                }
                window._ptagSetFilter('subtag_CHUA_PHAN_HOI');
                return { ok: true };
            } catch (e) {
                return { ok: false, reason: e.message };
            }
        });
    };

    log('Try to set Tag XL = ĐƠN CHƯA PHẢN HỒI');
    let setRes = await trySetFilter();
    log('Filter result:', setRes);
    await page.waitForTimeout(2_000);

    // Instrument the table for jitter detection
    log('Instrument MutationObserver + renderTable hook in iframe');
    await frame.evaluate(() => {
        window.__jitter = {
            events: [],
            renderCalls: [],
            searchCalls: [],
            lastSig: '',
            startedAt: Date.now(),
        };

        // Hook performTableSearch + renderTable to capture caller stack
        const wrap = (name) => {
            const orig = window[name];
            if (typeof orig !== 'function') return;
            window[name] = function (...args) {
                const stack = new Error().stack || '';
                const top = stack.split('\n').slice(2, 6).join(' | ');
                window.__jitter[name === 'performTableSearch' ? 'searchCalls' : 'renderCalls'].push(
                    {
                        t: Date.now(),
                        stack: top.slice(0, 600),
                    }
                );
                return orig.apply(this, args);
            };
        };
        wrap('performTableSearch');
        wrap('renderTable');
        // Also intercept schedulePerformTableSearch to capture call origin
        const origSched = window.schedulePerformTableSearch;
        if (typeof origSched === 'function') {
            window.schedulePerformTableSearch = function (...args) {
                const stack = new Error().stack || '';
                window.__jitter.searchCalls.push({
                    t: Date.now(),
                    src: 'schedule',
                    stack: stack.split('\n').slice(2, 6).join(' | ').slice(0, 600),
                });
                return origSched.apply(this, args);
            };
        }

        const tbody =
            document.querySelector('#ordersTable tbody') ||
            document.querySelector('table tbody') ||
            document.querySelector('[role="grid"] [role="rowgroup"]') ||
            document.body;
        const observer = new MutationObserver((muts) => {
            const now = Date.now();
            let added = 0,
                removed = 0,
                attr = 0;
            for (const m of muts) {
                added += m.addedNodes?.length || 0;
                removed += m.removedNodes?.length || 0;
                if (m.type === 'attributes') attr++;
            }
            if (added + removed + attr > 0) {
                window.__jitter.events.push({ t: now, added, removed, attr });
            }
        });
        observer.observe(tbody, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style'],
        });
        window.__jitter.observer = observer;

        // Capture console errors / warnings
        const origErr = console.error.bind(console);
        const origWarn = console.warn.bind(console);
        window.__jitter.consoleErr = [];
        window.__jitter.consoleWarn = [];
        console.error = (...a) => {
            window.__jitter.consoleErr.push({
                t: Date.now(),
                msg: a.map(String).join(' ').slice(0, 400),
            });
            origErr(...a);
        };
        console.warn = (...a) => {
            window.__jitter.consoleWarn.push({
                t: Date.now(),
                msg: a.map(String).join(' ').slice(0, 400),
            });
            origWarn(...a);
        };
    });

    log(`Monitoring jitter for ${ARGS.seconds}s — leave the page idle`);
    await page.waitForTimeout(ARGS.seconds * 1000);

    const result = await frame.evaluate(() => {
        const j = window.__jitter || {};
        const now = Date.now();
        return {
            events: j.events || [],
            renderCalls: j.renderCalls || [],
            searchCalls: j.searchCalls || [],
            consoleErr: j.consoleErr || [],
            consoleWarn: j.consoleWarn || [],
            durationMs: now - (j.startedAt || now),
        };
    });

    // Bucket events per second
    const buckets = {};
    for (const ev of result.events) {
        const sec = Math.floor((ev.t - (result.events[0]?.t || ev.t)) / 1000);
        buckets[sec] = (buckets[sec] || 0) + ev.added + ev.removed + ev.attr;
    }

    const summary = {
        durationMs: result.durationMs,
        totalMutationEvents: result.events.length,
        perSecondBuckets: buckets,
        renderTableCallCount: result.renderCalls.length,
        performTableSearchCallCount: result.searchCalls.length,
        renderCalls: result.renderCalls,
        searchCalls: result.searchCalls,
        consoleErrCount: result.consoleErr.length,
        consoleWarnCount: result.consoleWarn.length,
        firstErrors: result.consoleErr.slice(0, 10),
        firstWarns: result.consoleWarn.slice(0, 10),
        networkAll: netLog,
    };

    fs.writeFileSync(LOG_FILE, JSON.stringify(summary, null, 2));
    log('Summary →', LOG_FILE);
    log('Total mutation events:', summary.totalMutationEvents);
    log('Per-second buckets:', JSON.stringify(buckets));
    log('Console errors:', summary.consoleErrCount, 'warns:', summary.consoleWarnCount);

    await browser.close();
})().catch((err) => {
    console.error('FATAL', err);
    process.exit(1);
});
