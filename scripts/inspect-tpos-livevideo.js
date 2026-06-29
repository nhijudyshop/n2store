#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Inspect TPOS livevideo proxy response — tìm fields chứa time-based thumbnails.

const { chromium } = require('playwright');
const { restoreLoginSession } = require('./restore-login-session.js');
const BASE = process.env.BASE || 'http://localhost:8080';

(async () => {
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext();
    await restoreLoginSession(ctx, { base: BASE });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/live-chat/index.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(10000);
    await page.evaluate(() => window.eventBus?.emit('tpos:crmTeamChanged', 'all'));
    await page.waitForTimeout(12000);

    const data = await page.evaluate(async () => {
        const st = window.TposState;
        const pageId = st.liveCampaigns[0]?.Facebook_UserId;
        const proxyBase = st.proxyBaseUrl;
        const r = await window.TposApi.authenticatedFetch(
            `${proxyBase}/facebook/livevideo?pageid=${pageId}&limit=5`
        );
        return r.json();
    });

    const videos = data?.data?.data || [];
    console.log('=== TOTAL VIDEOS:', videos.length, '===\n');
    if (videos[0]) {
        console.log('=== FULL KEYS of video[0]: ===');
        console.log(Object.keys(videos[0]).sort().join('\n'));
        console.log('\n=== video[0] (full): ===');
        console.log(JSON.stringify(videos[0], null, 2).slice(0, 8000));
    }
    await browser.close();
})();
