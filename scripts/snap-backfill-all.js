#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// One-off backfill: load tpos-pancake, group state.comments by campaign,
// POST /offline-batch per campaign với broadcastStartMs đúng.

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
        if (t.includes('[snap') || t.includes('backfill')) console.log(' [page]', t.slice(0, 200));
    });

    console.log('Load tpos-pancake...');
    await page.goto(`${BASE}/live-chat/index.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(10000);
    await page.evaluate(() => window.eventBus?.emit('tpos:crmTeamChanged', 'all'));
    await page.waitForTimeout(15000); // wait campaigns + comments load

    // Group comments by (pageId, liveVideoId, campaignId)
    const result = await page.evaluate(async (API_BASE) => {
        const st = window.TposState;
        const comments = st?.comments || [];
        const allPages = st?.allPages || [];
        const liveCampaigns = st?.liveCampaigns || [];
        if (!comments.length) return { error: 'no comments in state' };

        const groups = new Map();
        for (const c of comments) {
            if (!c.from?.id) continue;
            const campaignId = c._campaignId || st.selectedCampaign?.Id;
            if (!campaignId) continue;
            // page is staff? skip
            const camp = liveCampaigns.find((x) => x.Id === campaignId);
            if (!camp) continue;
            const pageId = camp.Facebook_UserId;
            const isStaff = c.from.id === pageId;
            if (isStaff) continue;
            const key = `${pageId}_${camp.Facebook_LiveId}_${campaignId}`;
            if (!groups.has(key)) {
                groups.set(key, {
                    pageId,
                    pageObj: allPages.find((p) => p.Facebook_PageId === pageId),
                    campaign: camp,
                    liveVideoId: camp.Facebook_LiveId,
                    comments: [],
                });
            }
            groups.get(key).comments.push(c);
        }

        const summary = [];
        for (const [key, g] of groups) {
            if (!g.pageObj) {
                summary.push({ key, error: 'no pageObj for ' + g.pageId });
                continue;
            }
            // Fetch broadcastStartMs via TPOS livevideo proxy
            let videoInfo = null;
            try {
                const proxyBase = st.proxyBaseUrl;
                const r = await window.TposApi.authenticatedFetch(
                    `${proxyBase}/facebook/livevideo?pageid=${g.pageId}&limit=50`
                );
                const json = await r.json();
                const videos = json?.data?.data || [];
                const vid = String(g.liveVideoId).replace(/^\d+_/, '');
                videoInfo = videos.find((v) => v.objectId === g.liveVideoId || v.objectId === vid);
            } catch (e) {
                summary.push({ key, error: 'livevideo fetch fail: ' + e.message });
                continue;
            }
            if (!videoInfo?.channelCreatedTime) {
                summary.push({
                    key,
                    error: 'no broadcast_start_time',
                    commentCount: g.comments.length,
                });
                continue;
            }
            const broadcastStartMs = new Date(videoInfo.channelCreatedTime).getTime();
            const payload = {
                pageId: g.pageId,
                pageName: g.pageObj.Name,
                pageUsername:
                    {
                        117267091364524: 'NhiJudyHouse.VietNam',
                        270136663390370: 'NhiJudyStore',
                    }[g.pageId] || null,
                liveCampaignId: String(g.campaign.Id),
                liveVideoId: g.liveVideoId,
                broadcastStartMs,
                thumbnailUrl: videoInfo.thumbnail?.url || null,
                comments: g.comments.map((c) => {
                    const raw = c.created_time || c.createdTime || c.inserted_at || c.created_at;
                    const t = raw ? new Date(raw).getTime() : NaN;
                    return {
                        commentId: c.id,
                        customerFbUserId: c.from.id,
                        customerName: c.from.name || '?',
                        createdTime: Number.isFinite(t) ? t : Date.now(),
                        message: (c.message || '').slice(0, 200),
                    };
                }),
                skipExisting: true,
                user: { id: 'backfill-script', name: 'Backfill Script' },
            };
            try {
                const r = await fetch(`${API_BASE}/api/livestream/offline-batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'omit',
                    body: JSON.stringify(payload),
                });
                const d = await r.json();
                summary.push({
                    key,
                    pageName: g.pageObj.Name,
                    campaignName: g.campaign.Name?.slice(0, 30),
                    broadcastStart: videoInfo.channelCreatedTime,
                    sentCount: payload.comments.length,
                    createdCount: d.created?.length || 0,
                    skippedCount: d.skipped?.length || 0,
                    failedCount: d.failed?.length || 0,
                });
            } catch (e) {
                summary.push({ key, error: 'POST fail: ' + e.message });
            }
        }
        return { totalGroups: groups.size, summary };
    }, API);

    console.log('\n=== BACKFILL RESULT ===');
    console.log(JSON.stringify(result, null, 2));

    await page.waitForTimeout(3000);
    await browser.close();
})();
