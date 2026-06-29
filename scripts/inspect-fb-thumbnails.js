#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Test FB Graph /{video_id}/thumbnails endpoint — có nhiều thumbnails với timestamp không?

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

    const out = await page.evaluate(async () => {
        const st = window.TposState;
        const liveVideoId = st.liveCampaigns[0]?.Facebook_LiveId?.replace(/^\d+_/, '') || null;
        const pageId = st.liveCampaigns[0]?.Facebook_UserId;
        const proxyBase = st.proxyBaseUrl;
        const tries = [];
        for (const endpoint of [
            `${proxyBase}/facebook/livevideo-thumbnails?pageid=${pageId}&videoid=${liveVideoId}`,
            `${proxyBase}/facebook/video-thumbnails?videoid=${liveVideoId}`,
            `${proxyBase}/facebook/livevideo?pageid=${pageId}&videoid=${liveVideoId}&fields=thumbnails`,
        ]) {
            try {
                const r = await window.TposApi.authenticatedFetch(endpoint);
                const txt = await r.text();
                tries.push({
                    endpoint,
                    status: r.status,
                    body: txt.slice(0, 500),
                });
            } catch (e) {
                tries.push({ endpoint, error: e.message });
            }
        }
        return { liveVideoId, pageId, tries };
    });
    console.log(JSON.stringify(out, null, 2));
    await browser.close();
})();
