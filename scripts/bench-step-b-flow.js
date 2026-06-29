#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Verify Step B: pill → click → dash.js plays raw stream → video.captureStream
// → buffer fills → frame is full 16:9 video pixels.

const { chromium } = require('playwright');
const { restoreLoginSession } = require('./restore-login-session.js');
const fs = require('fs');
const path = require('path');

const BASE = 'https://nhijudy.store';

(async () => {
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await restoreLoginSession(ctx, { base: BASE });
    const page = await ctx.newPage();

    const consoleErrs = [];
    page.on('console', (msg) => {
        const t = msg.text();
        if (t.includes('[snap') || t.includes('TPOS-API') || t.includes('dash')) {
            console.log('[page]', t.slice(0, 220));
        }
        if (msg.type() === 'error' && !t.includes('favicon')) {
            consoleErrs.push(t.slice(0, 150));
        }
    });

    const results = [];
    const ph = (n, ms) => {
        results.push({ n, ms });
        console.log(`  [${n}] ${ms}ms`);
    };

    console.log('\n=== Load page ===');
    const t0 = Date.now();
    await page.goto(`${BASE}/live-chat/index.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
    });
    ph('Page load', Date.now() - t0);

    // Wait state + campaigns
    await page.waitForFunction(() => window.TposState?.allPages?.length > 0);
    await page.evaluate(() => window.eventBus.emit('tpos:crmTeamChanged', 'all'));
    await page.waitForFunction(() => window.TposState?.liveCampaigns?.length > 0);
    console.log('State ready');

    // Wait pill
    console.log('\n=== Wait pill BẬT AUTO-SNAP ===');
    const t1 = Date.now();
    try {
        await page.waitForSelector('#tpos-snap-go-pill', { timeout: 15000 });
        ph('Pill appeared', Date.now() - t1);
        const pillInfo = await page.evaluate(() => {
            const p = document.getElementById('tpos-snap-go-pill');
            if (!p) return null;
            return { text: p.innerText, ariaDisabled: p.disabled };
        });
        console.log(`  Pill: ${JSON.stringify(pillInfo)}`);

        // ASSERT: no iframe FB plugin loaded yet (deferred)
        const noIframe = await page.evaluate(() => !document.getElementById('tpos-snap-fb-embed'));
        console.log(`  Iframe FB deferred (not loaded yet): ${noIframe ? '✓' : '✗'}`);
    } catch (e) {
        console.log('  ❌ Pill not found:', e.message);
    }

    // ===== Click pill → backend stream-url + dash.js =====
    console.log('\n=== Click pill → stream-url + dash.js ===');
    const t2 = Date.now();
    await page.bringToFront();
    const pillClicked = await page.evaluate(() => {
        const p = document.getElementById('tpos-snap-go-pill');
        if (!p) return false;
        p.click();
        return true;
    });
    if (!pillClicked) {
        console.log('  ❌ Cannot click pill');
        await browser.close();
        return;
    }

    // Wait until wrapper + <video> appears
    try {
        await page.waitForSelector('#tpos-snap-fb-video', { timeout: 15000 });
        ph('Video element mounted', Date.now() - t2);
    } catch {
        console.log('  ❌ Video element not mounted');
    }

    // Inspect wrapper
    const wrap = await page.evaluate(() => {
        const w = document.getElementById('tpos-snap-fb-wrapper');
        const v = document.getElementById('tpos-snap-fb-video');
        const l = document.getElementById('tpos-snap-video-loading');
        if (!w) return null;
        return {
            wrapperW: w.getBoundingClientRect().width,
            wrapperH: w.getBoundingClientRect().height,
            hasVideo: !!v,
            hasLoading: !!l,
            loadingText: l?.textContent,
        };
    });
    console.log('  Wrapper:', JSON.stringify(wrap));

    // Wait for dash.js to load + video to start
    console.log('\n=== Wait video play (max 30s) ===');
    const t3 = Date.now();
    let videoState = null;
    for (let i = 0; i < 60; i++) {
        videoState = await page.evaluate(() => {
            const v = document.getElementById('tpos-snap-fb-video');
            if (!v) return { error: 'no video element' };
            return {
                videoW: v.videoWidth,
                videoH: v.videoHeight,
                readyState: v.readyState,
                paused: v.paused,
                ended: v.ended,
                err: v.error?.message,
                hasDashjs: !!window.dashjs,
            };
        });
        if (videoState.videoW > 0 && !videoState.paused) break;
        await page.waitForTimeout(500);
    }
    ph('Video has frames', Date.now() - t3);
    console.log('  Video state:', JSON.stringify(videoState));

    // Wait for captureStream → buffer
    console.log('\n=== Wait frame buffer ===');
    const t4 = Date.now();
    let bufCount = 0;
    for (let i = 0; i < 30; i++) {
        bufCount = await page.evaluate(() => window.TposLivestreamSnap?._getBufferCount?.() || 0);
        if (bufCount > 0) break;
        await page.waitForTimeout(500);
    }
    ph('Buffer populated', Date.now() - t4);
    console.log(`  Frame buffer count: ${bufCount}`);

    if (bufCount > 0) {
        // Save first frame + analyze dimensions
        const frameData = await page.evaluate(() => {
            const f = window.TposLivestreamSnap?._getLatestFrame?.();
            return f?.jpegBase64 || null;
        });
        if (frameData) {
            const outDir = path.join(__dirname, '..', 'downloads', 'snap-bench');
            fs.mkdirSync(outDir, { recursive: true });
            const fpath = path.join(outDir, `frame-step-b-${Date.now()}.jpg`);
            fs.writeFileSync(fpath, Buffer.from(frameData, 'base64'));
            const size = fs.statSync(fpath).size;
            const dims = await page.evaluate(async (b64) => {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => resolve({ w: img.width, h: img.height });
                    img.onerror = () => resolve({ error: 'load fail' });
                    img.src = 'data:image/jpeg;base64,' + b64;
                });
            }, frameData);
            const ratio = dims.w / dims.h;
            console.log(`\n✅ Frame saved: ${fpath}`);
            console.log(`   Size: ${size} bytes`);
            console.log(`   Dimensions: ${dims.w}×${dims.h}`);
            console.log(`   Aspect ratio: ${ratio.toFixed(2)} (16:9 = 1.78)`);
            console.log(
                ratio > 1.6 && ratio < 1.9
                    ? '   ✅ 16:9 (full video frame)'
                    : '   ⚠ NOT 16:9 — check crop'
            );
        }
    } else {
        console.log('  ❌ No frames captured');
    }

    console.log('\n=== SUMMARY ===');
    results.forEach((r) => console.log(`  ${r.n}: ${r.ms}ms`));
    const total = results.reduce((a, r) => a + r.ms, 0);
    console.log(`  TOTAL: ${total}ms`);
    console.log(`\nConsole errors: ${consoleErrs.length}`);
    consoleErrs.slice(0, 5).forEach((e) => console.log('  ' + e));

    console.log('\nBrowser alive 20s để bạn inspect...');
    await page.waitForTimeout(20000);
    await browser.close();
})().catch((e) => {
    console.error('FAIL:', e.message);
    process.exit(1);
});
