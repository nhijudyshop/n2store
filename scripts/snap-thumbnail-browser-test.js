#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Browser test: verify auto-mode snap creates snapshot WITH valid thumbnail URL
// (FB CDN signed URL từ TPOS livevideo, KHÔNG phải FB Graph picture 400)

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
        if (t.includes('[snap') || t.includes('live video') || msg.type() === 'error') {
            console.log(' [page]', msg.type(), t.slice(0, 200));
        }
    });
    console.log('[thumb-test] Open tpos-pancake (cache-bust)...');
    await page.goto(`${BASE}/live-chat/index.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
    });
    console.log('[thumb-test] Waiting 20s for TPOS state populate (campaigns + comments)...');
    await page.waitForTimeout(20000);

    // Inspect TPOS state + cached video info
    const state = await page.evaluate(() => {
        const st = window.TposState;
        return {
            campaigns: st?.liveCampaigns?.length || 0,
            firstCamp: st?.liveCampaigns?.[0]
                ? {
                      id: st.liveCampaigns[0].Id,
                      liveId: st.liveCampaigns[0].Facebook_LiveId,
                      pageId: st.liveCampaigns[0].Facebook_UserId,
                      name: st.liveCampaigns[0].Name,
                  }
                : null,
            comments: st?.comments?.length || 0,
        };
    });
    console.log('[thumb-test] TPOS state:', JSON.stringify(state, null, 2));

    if (!state.firstCamp) {
        console.log('[thumb-test] ❌ No campaign — cannot test auto flow.');
        await browser.close();
        return;
    }

    // Fetch live video info via TPOS proxy (verify thumbnail.url field exists)
    const videoInfo = await page.evaluate(
        async ({ pageId, liveVideoId }) => {
            const proxyBase = window.TposState.proxyBaseUrl;
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
                      thumbnailKeys: m.thumbnail ? Object.keys(m.thumbnail) : null,
                      thumbnailUrl: m.thumbnail?.url || m.thumbnail?.uri || null,
                  }
                : null;
        },
        { pageId: state.firstCamp.pageId, liveVideoId: state.firstCamp.liveId }
    );
    console.log('[thumb-test] Video info from TPOS:', JSON.stringify(videoInfo, null, 2));

    if (!videoInfo?.thumbnailUrl) {
        console.log(
            '[thumb-test] ⚠️ TPOS không trả thumbnail.url cho video này → frontend sẽ pass undefined → backend dùng FB Graph fallback (broken).'
        );
    } else {
        console.log('[thumb-test] ✅ TPOS có thumbnail URL:', videoInfo.thumbnailUrl.slice(0, 100));
    }

    // Emit fake comment via eventBus to trigger auto-snap
    const customerFbUserId = `thumb_test_${Date.now()}`;
    const commentTime = videoInfo?.channelCreatedTime
        ? new Date(videoInfo.channelCreatedTime).getTime() + 60000 // +1 min after start
        : Date.now();
    console.log('[thumb-test] Emit fake comment...');
    await page.evaluate(
        ({ commentTime, customerFbUserId, campaignId, pageId }) => {
            window.eventBus.emit('tpos:newComment', {
                comment: {
                    id: `thumb_test_c_${Date.now()}`,
                    from: { id: customerFbUserId, name: 'Thumb Test KH' },
                    created_time: new Date(commentTime).toISOString(),
                    message: 'thumbnail test',
                    _campaignId: campaignId,
                    _pageId: pageId,
                },
                isStaff: false,
            });
        },
        {
            commentTime,
            customerFbUserId,
            campaignId: state.firstCamp.id,
            pageId: state.firstCamp.pageId,
        }
    );

    console.log('[thumb-test] Wait 8s for backend processing...');
    await page.waitForTimeout(8000);

    // Verify snapshot has correct thumbnail URL
    const snap = await page.evaluate(
        async ({ customerFbUserId, API }) => {
            const r = await fetch(
                `${API}/api/livestream/snapshots?customerFbUserId=${customerFbUserId}`,
                { credentials: 'omit' }
            );
            return r.json();
        },
        { customerFbUserId, API }
    );
    if (!snap.snapshots?.length) {
        console.log('[thumb-test] ❌ No snapshot created — auto-mode flow failed.');
    } else {
        const s = snap.snapshots[0];
        console.log('[thumb-test] Snap thumbnailUrl:', s.thumbnailUrl?.slice(0, 100));
        console.log('[thumb-test] livestreamUrl:', s.livestreamUrl?.slice(0, 100));
        console.log('[thumb-test] offsetSeconds:', s.offsetSeconds);
        if (s.thumbnailUrl?.includes('scontent') || s.thumbnailUrl?.includes('fbcdn')) {
            console.log('[thumb-test] ✅ PASS: thumbnail từ FB CDN');
            // Probe thumb URL — chỉ kiểm tra response status
            const status = await page.evaluate(async (url) => {
                try {
                    const r = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
                    return { ok: true, type: r.type, status: r.status };
                } catch (e) {
                    return { ok: false, err: e.message };
                }
            }, s.thumbnailUrl);
            console.log('[thumb-test] HEAD fetch:', JSON.stringify(status));
        } else if (s.thumbnailUrl?.includes('graph.facebook.com')) {
            console.log('[thumb-test] ❌ FAIL: vẫn dùng FB Graph URL (broken)');
        } else if (!s.thumbnailUrl) {
            console.log('[thumb-test] ⚠️ thumbnailUrl = NULL (placeholder)');
        }
        // Cleanup
        await page.evaluate(
            async ({ id, API }) => {
                await fetch(`${API}/api/livestream/snapshot/${id}`, {
                    method: 'DELETE',
                    credentials: 'omit',
                });
            },
            { id: s.id, API }
        );
        console.log('[thumb-test] Cleaned snapshot id=' + s.id);
    }

    await page.waitForTimeout(8000);
    await browser.close();
})();
