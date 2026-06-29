#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Browser test: đo tốc độ + verify capture full video frame
// 1. Load tpos-pancake → time đến khi iframe FB ready
// 2. Auto-accept getDisplayMedia via Chrome flag
// 3. Click "BẬT AUTO-SNAP" → measure connect time
// 4. Wait frame buffer → dump frame[0] to disk → analyze dimensions + content

const { chromium } = require('playwright');
const { restoreLoginSession } = require('./restore-login-session.js');
const fs = require('fs');
const path = require('path');

const BASE = 'https://nhijudy.store';

(async () => {
    const browser = await chromium.launch({
        headless: false,
        // Auto-accept getDisplayMedia for current tab + skip permission prompts
        args: [
            '--auto-accept-this-tab-capture',
            '--use-fake-ui-for-media-stream',
            '--enable-features=GetDisplayMediaSetAutoSelectAllScreens',
        ],
    });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await restoreLoginSession(ctx, { base: BASE });
    const page = await ctx.newPage();

    page.on('console', (msg) => {
        const t = msg.text();
        if (t.includes('[snap') || t.includes('TPOS-API') || t.includes('Hls')) {
            console.log('[page]', t.slice(0, 200));
        }
    });

    const phases = [];
    function phase(name, t) {
        phases.push({ name, ms: t });
        console.log(`  [phase] ${name}: ${t}ms`);
    }

    console.log('\n=== STEP 1: Load page ===');
    const t0 = Date.now();
    await page.goto(`${BASE}/live-chat/index.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
    });
    phase('DOMContentLoaded', Date.now() - t0);

    console.log('\n=== STEP 2: Wait TposState + live campaigns ===');
    const t1 = Date.now();
    await page.waitForFunction(() => window.TposState?.allPages?.length > 0, { timeout: 30000 });
    phase('TposState ready', Date.now() - t1);

    const t2 = Date.now();
    await page.evaluate(() => window.eventBus.emit('tpos:crmTeamChanged', 'all'));
    await page.waitForFunction(() => window.TposState?.liveCampaigns?.length > 0, {
        timeout: 30000,
    });
    phase('liveCampaigns loaded', Date.now() - t2);

    console.log('\n=== STEP 3: Wait for iframe inject + load ===');
    const t3 = Date.now();
    // Banner/iframe should auto-inject (function _maybeShowAutoSnapBanner)
    // Wait for iframe element to exist
    await page.waitForSelector('#tpos-snap-fb-embed', { timeout: 30000 });
    phase('Iframe element mounted', Date.now() - t3);

    // Wait for iframe content to start loading
    const t4 = Date.now();
    await page.waitForTimeout(5000); // FB plugin load
    phase('Iframe content load wait', Date.now() - t4);

    // Snapshot wrapper dimensions
    const wrapperInfo = await page.evaluate(() => {
        const w = document.getElementById('tpos-snap-fb-wrapper');
        if (!w) return null;
        const r = w.getBoundingClientRect();
        return {
            width: Math.round(r.width),
            height: Math.round(r.height),
            visible: r.width > 0 && r.height > 0,
            scale: w._scale,
            videoHeight: w._videoHeight,
            innerCount: w.querySelectorAll('iframe').length,
            hasGoBtn: !!w.querySelector('#tpos-snap-fb-go'),
        };
    });
    console.log('  Wrapper:', JSON.stringify(wrapperInfo));

    console.log('\n=== STEP 4: Click BẬT AUTO-SNAP → trigger share ===');
    await page.bringToFront(); // ensure tab is foreground for capture
    const t5 = Date.now();
    await page.click('#tpos-snap-fb-go');
    // Wait for STATE.captureStream via debug accessor
    try {
        await page.waitForFunction(() => window.TposLivestreamSnap?._getStreamActive?.() === true, {
            timeout: 30000,
        });
        phase('Share connected (stream active)', Date.now() - t5);
    } catch (e) {
        console.log('  [warn] Share connect timeout:', e.message);
    }

    console.log('\n=== STEP 5: Wait frame buffer ===');
    const t6 = Date.now();
    // Frame buffer captures every 5s. Wait for at least 1 entry.
    const bufInfo = await page.evaluate(async () => {
        // Wait up to 30s for first frame (capture interval 5s)
        for (let i = 0; i < 60; i++) {
            const n = window.TposLivestreamSnap?._getBufferCount?.() || 0;
            if (n > 0) {
                const f = window.TposLivestreamSnap._getLatestFrame();
                return {
                    count: n,
                    firstJpegLen: f?.jpegBase64?.length || 0,
                    firstJpegStart: f?.jpegBase64?.slice(0, 50),
                };
            }
            await new Promise((r) => setTimeout(r, 500));
        }
        return { count: 0 };
    });
    phase('Frame buffer populated', Date.now() - t6);
    console.log('  Buffer:', JSON.stringify(bufInfo));

    if (bufInfo.count > 0 && bufInfo.firstJpegLen > 0) {
        // Save frame to disk + analyze
        const outDir = path.join(__dirname, '..', 'downloads', 'snap-bench');
        fs.mkdirSync(outDir, { recursive: true });
        const ts = Date.now();
        const filename = path.join(outDir, `frame-${ts}.jpg`);

        const base64 = await page.evaluate(() => {
            const f = window.TposLivestreamSnap?._getLatestFrame?.();
            return f?.jpegBase64 || null;
        });
        if (base64) {
            fs.writeFileSync(filename, Buffer.from(base64, 'base64'));
            const stats = fs.statSync(filename);
            console.log(`\n✅ Frame saved: ${filename} (${stats.size} bytes)`);
            // Get image dimensions via canvas (in browser)
            const dims = await page.evaluate(async (b64) => {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => resolve({ w: img.width, h: img.height });
                    img.onerror = () => resolve({ error: 'load fail' });
                    img.src = 'data:image/jpeg;base64,' + b64;
                });
            }, base64);
            console.log(`  Dimensions: ${dims.w || '?'}×${dims.h || '?'}`);
            console.log(`  Aspect ratio: ${(dims.w / dims.h).toFixed(2)} (16:9 = 1.78)`);
            if (dims.w / dims.h > 1.6 && dims.w / dims.h < 1.9) {
                console.log('  ✅ Aspect ratio matches 16:9 (video)');
            } else {
                console.log('  ❌ Aspect ratio does NOT match 16:9 — likely cropped wrong');
            }
        }
    }

    console.log('\n=== SUMMARY ===');
    phases.forEach((p) => console.log(`  ${p.name}: ${p.ms}ms`));
    const total = phases.reduce((a, p) => a + p.ms, 0);
    console.log(`  TOTAL: ${total}ms`);

    console.log('\nBrowser kept alive 30s để bạn inspect...');
    await page.waitForTimeout(30000);
    await browser.close();
})().catch((e) => {
    console.error('FAIL:', e.message);
    process.exit(1);
});
