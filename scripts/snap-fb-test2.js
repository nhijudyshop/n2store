#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Test 2: Verify getDisplayMedia + auto-select Facebook tab works
// Bypass TPOS UI — directly test browser API trên tab tpos-pancake.
const { chromium } = require('playwright');
const { restoreLoginSession } = require('./restore-login-session.js');

const BASE = process.env.BASE || 'http://localhost:8080';

(async () => {
    const browser = await chromium.launch({
        headless: false,
        args: [
            '--auto-accept-this-tab-capture',
            '--auto-select-desktop-capture-source=Facebook',
            '--use-fake-ui-for-media-stream',
        ],
    });
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.grantPermissions(['camera', 'microphone'], { origin: BASE });
    await restoreLoginSession(ctx, { base: BASE });

    console.log('[test2] Opening FB tab...');
    const fbPage = await ctx.newPage();
    await fbPage
        .goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 })
        .catch((e) => console.warn(' FB load:', e.message));
    console.log('  FB title:', await fbPage.title());

    console.log('[test2] Opening tpos-pancake...');
    const tposPage = await ctx.newPage();
    await tposPage.goto(`${BASE}/live-chat/index.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
    });
    await tposPage.waitForTimeout(5000);

    console.log('[test2] Triggering getDisplayMedia via eval...');
    tposPage.on('console', (msg) =>
        console.log('  [console]', msg.type(), msg.text().slice(0, 200))
    );
    const result = await tposPage.evaluate(async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'never', displaySurface: 'browser' },
                audio: false,
            });
            const tracks = stream.getVideoTracks();
            const trackLabel = tracks[0]?.label || '(no label)';
            const video = document.createElement('video');
            video.srcObject = stream;
            video.muted = true;
            video.playsInline = true;
            await video.play();
            await new Promise((r) => setTimeout(r, 800));
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            stream.getTracks().forEach((t) => t.stop());
            return {
                ok: true,
                trackLabel,
                width: canvas.width,
                height: canvas.height,
                jpegSize: dataUrl.length,
                preview: dataUrl.slice(0, 60),
            };
        } catch (e) {
            return { ok: false, error: e.name + ': ' + e.message };
        }
    });
    console.log('[test2] Result:');
    console.log(JSON.stringify(result, null, 2));

    if (result.ok && result.jpegSize > 5000) {
        console.log('[test2] ✓ getDisplayMedia + auto-pick Facebook tab WORKS');
        // Save sample to file for visual inspect
        const dataUrl = await tposPage.evaluate(async () => {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'never', displaySurface: 'browser' },
                audio: false,
            });
            const video = document.createElement('video');
            video.srcObject = stream;
            video.muted = true;
            await video.play();
            await new Promise((r) => setTimeout(r, 600));
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            const url = canvas.toDataURL('image/jpeg', 0.7);
            stream.getTracks().forEach((t) => t.stop());
            return url;
        });
        const fs = require('fs');
        const b64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
        fs.writeFileSync('/tmp/snap-fb-result.jpg', Buffer.from(b64, 'base64'));
        console.log('[test2] Saved /tmp/snap-fb-result.jpg');
    }

    console.log('[test2] Keeping browser open 10s then exit...');
    await tposPage.waitForTimeout(10000);
    await browser.close();
    process.exit(result.ok ? 0 : 1);
})();
