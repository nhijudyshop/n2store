#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
//
// One-shot Playwright trace of every WebSocket frame Pancake admin
// sends/receives on the inbox page. Uses `page.on('websocket', ...)`
// which fires before the WebSocket exists, unlike runtime monkey-
// patching. Output: a JSON file + console summary you can diff
// against the Render broker output to find missing event types.
//
// Usage: node scripts/pancake-ws-trace.js [seconds]   (default 60s)

const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const SECRETS = fs.readFileSync(path.join(__dirname, '..', 'serect_dont_push.txt'), 'utf-8');
const pick = (re) => SECRETS.match(re)?.[1]?.trim();
const JWT = pick(/^PANCAKE_JWT:\s*(\S+)/m);
const UID = pick(/^PANCAKE_USER_UID:\s*(\S+)/m);
const SID = pick(/^PANCAKE_SESSION_ID:\s*(\S+)/m);
const FBID = pick(/^PANCAKE_FB_ID:\s*(\S+)/m);
if (!JWT) {
    console.error('No PANCAKE_JWT in secrets file');
    process.exit(1);
}

const SECONDS = parseInt(process.argv[2], 10) || 60;
const OUT = path.join(__dirname, '..', 'downloads', 'n2store-session', 'pancake-inspect');
fs.mkdirSync(OUT, { recursive: true });
const LOG_PATH = path.join(OUT, `ws-trace-${Date.now()}.json`);

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

    const frames = [];
    const sockets = [];
    page.on('websocket', (ws) => {
        const id = sockets.length;
        const meta = { id, url: ws.url(), openedAt: new Date().toISOString() };
        sockets.push(meta);
        console.log(`[WS#${id}] OPEN url=${meta.url}`);
        ws.on('framesent', (e) => {
            const payload =
                typeof e.payload === 'string' ? e.payload : (e.payload?.toString?.() ?? '');
            frames.push({
                t: Date.now(),
                sockId: id,
                dir: 'OUT',
                len: payload.length,
                head: payload.slice(0, 800),
            });
        });
        ws.on('framereceived', (e) => {
            const payload =
                typeof e.payload === 'string' ? e.payload : (e.payload?.toString?.() ?? '');
            frames.push({
                t: Date.now(),
                sockId: id,
                dir: 'IN',
                len: payload.length,
                head: payload.slice(0, 800),
            });
        });
        ws.on('close', () => console.log(`[WS#${id}] CLOSE`));
    });

    console.log(`Navigating to pancake.vn/NhiJudyStore…`);
    await page.goto('https://pancake.vn/NhiJudyStore', {
        waitUntil: 'networkidle',
        timeout: 45_000,
    });
    await page.waitForTimeout(4000);
    // Open a conversation so inbox topics are subscribed
    await page.evaluate(() =>
        document.querySelectorAll('.media-body.body-conver-item')[0]?.click()
    );
    await page.waitForTimeout(3000);
    console.log(`Tracing ${SECONDS}s of WS frames…`);
    const startCount = frames.length;
    await page.waitForTimeout(SECONDS * 1000);
    const endCount = frames.length;

    // Bucket events by topic/event so we can see what types arrive
    const bucket = {};
    for (const f of frames.slice(startCount)) {
        try {
            const j = JSON.parse(f.head);
            const key = `${f.dir} ${j.topic || j.type || '<no-topic>'} ${j.event || ''}`;
            bucket[key] = (bucket[key] || 0) + 1;
        } catch {
            const key = `${f.dir} <non-json>`;
            bucket[key] = (bucket[key] || 0) + 1;
        }
    }

    fs.writeFileSync(
        LOG_PATH,
        JSON.stringify(
            {
                sockets,
                totalFrames: frames.length,
                framesPostNav: frames.length - startCount,
                bucket,
                frames: frames.slice(-100),
            },
            null,
            2
        )
    );
    console.log('\n=== Sockets opened ===');
    sockets.forEach((s) => console.log(`  #${s.id} ${s.url}`));
    console.log('\n=== Frame counts by (direction topic event) ===');
    for (const [k, n] of Object.entries(bucket).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${n.toString().padStart(4, ' ')}  ${k}`);
    }
    console.log(`\nFull trace saved to ${LOG_PATH}`);
    await browser.close();
})().catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
});
