#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
//
// Test livestream snapshot Phase 3:
//   1. Launch Chromium với --auto-select-desktop-capture-source=regex "Facebook"
//      + --auto-accept-this-tab-capture → getDisplayMedia tự pick FB tab
//   2. Open 2 tabs: tpos-pancake (auth restored) + facebook.com (public)
//   3. Trigger snap qua programmatic click → verify ảnh saved
//
// Usage: node scripts/snap-fb-test.js

const { chromium } = require('playwright');
const { restoreLoginSession } = require('./restore-login-session.js');

const BASE = process.env.BASE || 'http://localhost:8080';

(async () => {
    console.log('[snap-fb-test] launching Chromium with auto-capture flags...');
    const browser = await chromium.launch({
        headless: false,
        args: [
            '--auto-accept-this-tab-capture',
            '--auto-select-desktop-capture-source=Facebook',
            // Permissions
            '--use-fake-ui-for-media-stream',
            '--enable-features=AutoAcceptTabCapture,GetDisplayMediaSetAutoSelectAllScreens',
        ],
    });
    const ctx = await browser.newContext({
        permissions: ['camera', 'microphone'],
    });
    // Grant display-capture permission for tpos-pancake origin
    await ctx.grantPermissions(['camera', 'microphone'], { origin: BASE });

    console.log('[snap-fb-test] restoring login session for tpos-pancake...');
    await restoreLoginSession(ctx, { base: BASE });

    console.log('[snap-fb-test] opening FB tab (public, no login)...');
    const fbPage = await ctx.newPage();
    await fbPage
        .goto('https://www.facebook.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        })
        .catch((e) => console.warn('[snap-fb-test] FB page load warn:', e.message));
    console.log('  FB tab title:', await fbPage.title());

    console.log('[snap-fb-test] opening tpos-pancake tab...');
    const tposPage = await ctx.newPage();
    await tposPage.goto(`${BASE}/live-chat/index.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
    });
    await tposPage.waitForTimeout(8000); // wait scripts load + TPOS state populate

    // Check DOM state — where is the mode chip mounted?
    console.log('[snap-fb-test] inspecting DOM state...');
    const inspect = await tposPage.evaluate(() => {
        const chip1 = document.getElementById('tpos-snap-page-chip');
        const chip2 = document.getElementById('tpos-snap-real-chip');
        const findParent = (el) => {
            if (!el) return null;
            return {
                tag: el.parentElement?.tagName,
                id: el.parentElement?.id,
                class: el.parentElement?.className?.slice(0, 80),
            };
        };
        return {
            chip1_exists: !!chip1,
            chip1_parent: findParent(chip1),
            chip2_exists: !!chip2,
            chip2_parent: findParent(chip2),
            chip2_text: chip2?.textContent?.trim(),
            tposHeader: !!document.querySelector(
                '.tpos-header-bar, .tpos-toolbar, #tposCommentHeader'
            ),
            tposContent: !!document.querySelector('#tposContent'),
            snapButtons: document.querySelectorAll('.tpos-snap-btn').length,
            mode: localStorage.getItem('tpos_snap_mode') || 'live (default)',
        };
    });
    console.log('  DOM inspect:', JSON.stringify(inspect, null, 2));

    // Find a comment row + click 📸 button
    const snapBtns = await tposPage.locator('.tpos-snap-btn').count();
    console.log(`[snap-fb-test] found ${snapBtns} snap buttons on TPOS rows`);
    if (snapBtns === 0) {
        console.log(
            '[snap-fb-test] no snap buttons → no TPOS comments loaded (need real TPOS auth + page selected). Aborting click test.'
        );
    } else {
        console.log('[snap-fb-test] clicking first 📸 button...');
        // Listen for any console errors
        tposPage.on('console', (msg) => {
            const t = msg.text();
            if (t.includes('[snap') || t.includes('snap-') || msg.type() === 'error') {
                console.log('  [PAGE-CONSOLE]', msg.type(), t.slice(0, 200));
            }
        });
        await tposPage.locator('.tpos-snap-btn').first().click();
        // Wait for snap to complete (and picker auto-pick FB)
        await tposPage.waitForTimeout(6000);
    }

    console.log('[snap-fb-test] keeping browser open for manual inspection — Ctrl+C to exit');
    // Keep running
    await new Promise(() => {});
})();
