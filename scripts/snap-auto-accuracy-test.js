#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Accuracy test cho auto-snap default ON + offline path.
// Steps:
//  1. Launch Chromium + restore auth
//  2. Open tpos-pancake → wait TPOS state populate
//  3. Hook console + eventBus
//  4. Inject fake comment via eventBus.emit('tpos:newComment', ...)
//     với commentTime đã biết → verify offset_seconds match expectation
//  5. Cleanup snap

const { chromium } = require('playwright');
const { restoreLoginSession } = require('./restore-login-session.js');
const BASE = process.env.BASE || 'http://localhost:8080';
const API = 'https://n2store-fallback.onrender.com';

(async () => {
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext();
    await restoreLoginSession(ctx, { base: BASE });

    const page = await ctx.newPage();
    page.on('console', (msg) => {
        const t = msg.text();
        if (t.includes('[snap') || t.includes('[TPOS') || msg.type() === 'error') {
            console.log('  [console]', msg.type(), t.slice(0, 220));
        }
    });
    console.log('[acc-test] navigating tpos-pancake...');
    await page.goto(`${BASE}/live-chat/index.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
    });
    console.log('[acc-test] waiting 12s for TPOS state populate...');
    await page.waitForTimeout(15000);

    // Inspect TPOS state
    const tposState = await page.evaluate(() => ({
        hasState: !!window.TposState,
        liveCampaigns: window.TposState?.liveCampaigns?.length || 0,
        allPages: window.TposState?.allPages?.length || 0,
        selectedPage: window.TposState?.selectedPage?.Name || null,
        autoMode: window.TposLivestreamSnap?._getSnapPagePref
            ? localStorage.getItem('tpos_snap_auto')
            : 'unknown',
        firstCampaign: window.TposState?.liveCampaigns?.[0]
            ? {
                  id: window.TposState.liveCampaigns[0].Id,
                  liveId: window.TposState.liveCampaigns[0].Facebook_LiveId,
                  name: window.TposState.liveCampaigns[0].Name,
                  pageId: window.TposState.liveCampaigns[0].Facebook_UserId,
              }
            : null,
    }));
    console.log('[acc-test] TPOS state:', JSON.stringify(tposState, null, 2));

    if (!tposState.firstCampaign) {
        console.log('[acc-test] No campaign → cannot test offset. Aborting.');
        await page.waitForTimeout(20000);
        await browser.close();
        return;
    }

    // Fetch broadcastStartMs from TPOS proxy via Render
    const broadcastInfo = await page.evaluate(
        async ({ pageId, liveVideoId }) => {
            const proxyBase = window.TposState?.proxyBaseUrl;
            const r = await window.TposApi.authenticatedFetch(
                `${proxyBase}/facebook/livevideo?pageid=${pageId}&limit=50`
            );
            const json = await r.json();
            const videos = json?.data?.data || [];
            const vid = liveVideoId.replace(/^\d+_/, '');
            const m = videos.find((v) => v.objectId === liveVideoId || v.objectId === vid);
            return m
                ? {
                      objectId: m.objectId,
                      channelCreatedTime: m.channelCreatedTime,
                      title: m.title,
                      statusLive: m.statusLive,
                  }
                : null;
        },
        { pageId: tposState.firstCampaign.pageId, liveVideoId: tposState.firstCampaign.liveId }
    );
    console.log('[acc-test] broadcast info:', JSON.stringify(broadcastInfo, null, 2));

    if (!broadcastInfo?.channelCreatedTime) {
        console.log('[acc-test] No broadcast_start_time → cannot verify accuracy.');
        await page.waitForTimeout(20000);
        await browser.close();
        return;
    }

    const broadcastStartMs = Number(broadcastInfo.channelCreatedTime);
    // Generate fake comment 5 min after broadcast start
    const fakeCommentTime = broadcastStartMs + 5 * 60 * 1000;
    const expectedOffsetSec = Math.floor((fakeCommentTime - broadcastStartMs) / 1000);
    console.log(
        `[acc-test] expected offset for fake comment 5min after start: ${expectedOffsetSec}s`
    );

    // Inject fake comment via eventBus
    const customerFbUserId = `acc_test_${Date.now()}`;
    console.log('[acc-test] emitting fake comment via eventBus...');
    await page.evaluate(
        ({ commentTime, customerFbUserId }) => {
            window.eventBus.emit('tpos:newComment', {
                comment: {
                    id: `acc_test_comment_${Date.now()}`,
                    from: { id: customerFbUserId, name: 'Acc Test KH' },
                    created_time: new Date(commentTime).toISOString(),
                    message: 'accuracy test comment',
                },
                isStaff: false,
            });
        },
        { commentTime: fakeCommentTime, customerFbUserId }
    );

    console.log('[acc-test] waiting 6s for backend to process...');
    await page.waitForTimeout(6000);

    // Fetch created snapshot to verify
    const snapshot = await page.evaluate(
        async ({ customerFbUserId, API }) => {
            const r = await fetch(
                `${API}/api/livestream/snapshots?customerFbUserId=${customerFbUserId}`,
                {
                    credentials: 'omit',
                }
            );
            return r.json();
        },
        { customerFbUserId, API }
    );

    if (snapshot.snapshots?.length === 0) {
        console.log('[acc-test] ❌ FAIL: no snapshot created');
    } else {
        const snap = snapshot.snapshots[0];
        const actualOffset = snap.offsetSeconds;
        const accurate = actualOffset === expectedOffsetSec;
        console.log(
            `[acc-test] ${accurate ? '✅ PASS' : '❌ FAIL'}: offset_seconds = ${actualOffset} (expected ${expectedOffsetSec})`
        );
        console.log(`  livestreamUrl: ${snap.livestreamUrl}`);
        console.log(`  thumbnailUrl: ${snap.thumbnailUrl}`);
        // Cleanup
        await page.evaluate(
            async ({ id, API }) => {
                await fetch(`${API}/api/livestream/snapshot/${id}`, {
                    method: 'DELETE',
                    credentials: 'omit',
                });
            },
            { id: snap.id, API }
        );
        console.log(`[acc-test] cleaned snapshot id=${snap.id}`);
    }

    console.log('[acc-test] keeping browser 10s then exit...');
    await page.waitForTimeout(10000);
    await browser.close();
})();
