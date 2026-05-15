#!/usr/bin/env node
// One-shot: open Pancake admin, type real query into search input,
// capture every fetch/XHR/WS frame + Redux action dispatched while
// the filter runs. Prints a JSON summary.
//
// Usage: node scripts/pancake-search-trace.js "huynh thanh dat"

const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const SECRETS = fs.readFileSync(path.join(__dirname, '..', 'serect_dont_push.txt'), 'utf-8');
const pick = (re) => SECRETS.match(re)?.[1]?.trim();
const JWT = pick(/^PANCAKE_JWT:\s*(\S+)/m);
const UID = pick(/^PANCAKE_USER_UID:\s*(\S+)/m);
const SID = pick(/^PANCAKE_SESSION_ID:\s*(\S+)/m);
const FBID = pick(/^PANCAKE_FB_ID:\s*(\S+)/m);

const QUERY = process.argv[2] || 'huynh thanh dat';

(async () => {
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addCookies([
        {
            name: 'jwt',
            value: JWT,
            domain: '.pancake.vn',
            path: '/',
            secure: true,
            sameSite: 'Lax',
        },
        {
            name: 'access_token',
            value: JWT,
            domain: '.pancake.vn',
            path: '/',
            secure: true,
            sameSite: 'Lax',
        },
        { name: 'locale', value: 'vi', domain: '.pancake.vn', path: '/', sameSite: 'Lax' },
        { name: 'country', value: 'VN', domain: '.pancake.vn', path: '/', sameSite: 'Lax' },
    ]);
    await ctx.addInitScript(
        ({ jwt, uid, sid, fbId }) => {
            try {
                localStorage.setItem('jwt', jwt);
                localStorage.setItem('access_token', jwt);
                localStorage.setItem('user_uid', uid);
                localStorage.setItem('session_id', sid);
                localStorage.setItem('fb_id', fbId);
            } catch (_e) {
                /* */
            }
        },
        { jwt: JWT, uid: UID, sid: SID, fbId: FBID }
    );

    const page = await ctx.newPage();
    const netLog = [];
    const wsFrames = [];

    // Capture all network requests (filter for relevant ones)
    page.on('request', (req) => {
        const u = req.url();
        if (
            /pancake\.vn|pages\.fm/.test(u) &&
            !/static|\.png|\.jpg|\.css|\.js$|google-analytics|sentry/i.test(u)
        ) {
            netLog.push({
                t: Date.now(),
                method: req.method(),
                url: u.slice(0, 280),
                postData: req.postData()?.slice(0, 400) || null,
            });
        }
    });
    page.on('response', async (res) => {
        const u = res.url();
        if (/pancake\.vn|pages\.fm/.test(u) && /search|customer|conversation|filter/i.test(u)) {
            const entry = netLog.find((e) => e.url === u.slice(0, 280) && !e.status);
            if (entry) entry.status = res.status();
        }
    });

    // Capture WS frames
    page.on('websocket', (ws) => {
        ws.on('framesent', (e) => {
            const p = typeof e.payload === 'string' ? e.payload : (e.payload?.toString?.() ?? '');
            wsFrames.push({ t: Date.now(), dir: 'OUT', len: p.length, head: p.slice(0, 400) });
        });
        ws.on('framereceived', (e) => {
            const p = typeof e.payload === 'string' ? e.payload : (e.payload?.toString?.() ?? '');
            wsFrames.push({ t: Date.now(), dir: 'IN', len: p.length, head: p.slice(0, 400) });
        });
    });

    // Hook Redux dispatch via init script
    await page.addInitScript(() => {
        window._waitForStore = () =>
            new Promise((res) => {
                const t = setInterval(() => {
                    if (window.__pancakeReduxStore__) {
                        clearInterval(t);
                        const store = window.__pancakeReduxStore__;
                        window._actLog = [];
                        const od = store.dispatch.bind(store);
                        store.dispatch = function (a) {
                            try {
                                window._actLog.push({
                                    t: Date.now(),
                                    type: a?.type,
                                    payload: a?.payload
                                        ? JSON.stringify(a.payload).slice(0, 250)
                                        : null,
                                });
                                if (window._actLog.length > 300) window._actLog.shift();
                            } catch (_e) {
                                /* */
                            }
                            return od(a);
                        };
                        res();
                    }
                }, 50);
            });
    });

    console.log('Navigating…');
    await page.goto('https://pancake.vn/NhiJudyStore', {
        waitUntil: 'networkidle',
        timeout: 45_000,
    });
    await page.waitForTimeout(5000);
    await page.evaluate(() => window._waitForStore && window._waitForStore());
    await page.waitForTimeout(1000);

    // Mark t0 — clear logs
    const t0 = Date.now();
    netLog.length = 0;
    wsFrames.length = 0;
    await page.evaluate(() => {
        window._actLog = [];
    });

    console.log(`Typing query: "${QUERY}"`);
    await page.click('.conversation-menu-search-input');
    await page.fill('.conversation-menu-search-input', ''); // clear
    await page.waitForTimeout(200);
    await page.type('.conversation-menu-search-input', QUERY, { delay: 90 });
    console.log('Waiting 5s for debounce + responses…');
    await page.waitForTimeout(5000);

    const actLog = await page.evaluate(() => window._actLog || []);
    const result = await page.evaluate(() => {
        const c = window.__pancakeReduxStore__.getState().conversations;
        const list = Array.from(document.querySelectorAll('.conversation-list-item'))
            .slice(0, 10)
            .map((el) => el.textContent.replace(/\s+/g, ' ').trim().slice(0, 70));
        return {
            filterShopCustomers: c.filterShopCustomers,
            filteredConversationsCloneList: c.filteredConversationsCloneList?.length || 0,
            visibleRowsCount: document.querySelectorAll('.conversation-list-item').length,
            visibleSample: list,
        };
    });

    console.log('\n=== Network calls during search ===');
    for (const n of netLog) {
        const dt = n.t - t0;
        console.log(`  +${dt.toString().padStart(5)}ms  ${n.method.padEnd(6)} ${n.url}`);
        if (n.postData) console.log(`           body: ${n.postData.slice(0, 200)}`);
    }
    console.log('\n=== WS frames during search ===');
    const interesting = wsFrames.filter((f) => !f.head.includes('heartbeat'));
    for (const f of interesting.slice(0, 30)) {
        const dt = f.t - t0;
        console.log(`  +${dt.toString().padStart(5)}ms  ${f.dir} ${f.head.slice(0, 200)}`);
    }
    console.log('\n=== Redux actions dispatched ===');
    const actCounts = {};
    for (const a of actLog) actCounts[a.type] = (actCounts[a.type] || 0) + 1;
    for (const [type, n] of Object.entries(actCounts).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${n.toString().padStart(3)}  ${type}`);
    }
    console.log('\n=== Filter state after search ===');
    console.log(JSON.stringify(result, null, 2));

    const out = path.join(
        __dirname,
        '..',
        'downloads',
        'n2store-session',
        'pancake-inspect',
        `search-trace-${Date.now()}.json`
    );
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
        out,
        JSON.stringify({ query: QUERY, netLog, wsFrames: interesting, actLog, result }, null, 2)
    );
    console.log(`\nFull trace → ${out}`);
    await browser.close();
})().catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
});
