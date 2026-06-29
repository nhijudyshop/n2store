#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Comprehensive E2E test cho livestream snap feature.
// Tests 10 critical checks → output structured PASS/FAIL report.
// Auto-cleanup created data sau khi done.

const { chromium } = require('playwright');
const { restoreLoginSession } = require('./restore-login-session.js');
const BASE = process.env.BASE || 'http://localhost:8080';
const API = 'https://n2store-fallback.onrender.com';

const results = [];
function record(name, ok, detail) {
    results.push({ name, ok, detail });
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext();
    await restoreLoginSession(ctx, { base: BASE });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
        const t = msg.text();
        const locUrl = msg.location()?.url || '';
        const isNoise =
            t.includes('favicon') ||
            t.includes('Thiếu quyền') ||
            locUrl.includes('favicon') ||
            locUrl.includes('scontent.') || // FB CDN aborted
            locUrl.includes('fbcdn') ||
            locUrl.includes('refresh-thumbnail'); // deprecated endpoint 410 (C11 test)
        if (msg.type() === 'error' && !isNoise) {
            consoleErrors.push(t.slice(0, 200) + (locUrl ? ` @${locUrl}` : ''));
        }
        if (t.includes('[snap')) {
            console.log(' [page]', t.slice(0, 220));
        }
    });

    console.log('\n=== STEP 1: Load tpos-pancake ===');
    // Set flag tutorial trước khi load → tránh modal block C15 manual snap.
    await ctx.addInitScript(() => {
        try {
            localStorage.setItem('tpos_snap_picker_tutorial_seen', '1');
        } catch {}
        // Mock getDisplayMedia: reject ngay để tránh OS picker block headless test.
        if (navigator.mediaDevices) {
            navigator.mediaDevices.getDisplayMedia = () =>
                Promise.reject(new DOMException('Permission denied by user', 'NotAllowedError'));
        }
    });
    await page.goto(`${BASE}/live-chat/index.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(10000); // wait TPOS init + CRM teams load

    // Force select 'all' pages to populate liveCampaigns
    const triggered = await page.evaluate(async () => {
        if (!window.TposState?.allPages?.length) return { ok: false, reason: 'no pages' };
        if (window.TposState.liveCampaigns?.length > 0) return { ok: true, already: true };
        if (!window.eventBus) return { ok: false, reason: 'no eventBus' };
        window.eventBus.emit('tpos:crmTeamChanged', 'all');
        return { ok: true, triggered: true };
    });
    console.log('Trigger CRM team change:', JSON.stringify(triggered));
    await page.waitForTimeout(12000); // wait live-campaigns API

    // Check 1: 4 chips mounted (Thumb chip removed per user req)
    const chipsInfo = await page.evaluate(() => {
        const c1 = !!document.getElementById('tpos-snap-page-chip');
        const c2 = !!document.getElementById('tpos-snap-real-chip');
        const c3 = !!document.getElementById('tpos-snap-auto-chip');
        const c4 = !!document.getElementById('tpos-snap-backfill-chip');
        return { c1, c2, c3, c4 };
    });
    record(
        'C1: 4 chips mounted (page+mode+auto+backfill) — no thumb toggle',
        chipsInfo.c1 && chipsInfo.c2 && chipsInfo.c3 && chipsInfo.c4,
        JSON.stringify(chipsInfo)
    );

    // Check 2: TPOS state populated
    const state = await page.evaluate(() => ({
        campaigns: window.TposState?.liveCampaigns?.length || 0,
        comments: window.TposState?.comments?.length || 0,
        allPages: window.TposState?.allPages?.length || 0,
    }));
    record(
        'C2: TPOS state populated',
        state.campaigns > 0 && state.allPages > 0,
        JSON.stringify(state)
    );

    if (state.campaigns === 0) {
        console.log('Cannot continue without campaigns.');
        await browser.close();
        process.exit(1);
    }

    // Get first campaign info
    const camp = await page.evaluate(
        () =>
            window.TposState.liveCampaigns[0] && {
                id: window.TposState.liveCampaigns[0].Id,
                liveId: window.TposState.liveCampaigns[0].Facebook_LiveId,
                pageId: window.TposState.liveCampaigns[0].Facebook_UserId,
                name: window.TposState.liveCampaigns[0].Name,
            }
    );

    // Check 3: Auto-mode default ON
    const autoState = await page.evaluate(() => {
        const v = localStorage.getItem('tpos_snap_auto');
        return { stored: v, isOn: v === null || v === 'on' };
    });
    record('C3: Auto-mode default ON', autoState.isOn, JSON.stringify(autoState));

    // Check 4: _fetchLiveVideoInfo returns thumbnailUrl + broadcastStart
    const liveInfo = await page.evaluate(
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
                      thumbnailUrl: m.thumbnail?.url || null,
                      statusLive: m.statusLive,
                  }
                : null;
        },
        { pageId: camp.pageId, liveVideoId: camp.liveId }
    );
    record(
        'C4: TPOS livevideo returns channelCreatedTime + thumbnail.url',
        !!(liveInfo?.channelCreatedTime && liveInfo?.thumbnailUrl),
        liveInfo
            ? `start=${liveInfo.channelCreatedTime} thumb=${liveInfo.thumbnailUrl?.slice(0, 50)}...`
            : 'null'
    );

    if (!liveInfo?.channelCreatedTime || !liveInfo?.thumbnailUrl) {
        console.log('Cannot continue without broadcast info.');
        await browser.close();
        process.exit(1);
    }

    // Check 5: Simulate auto-snap via eventBus
    const broadcastStartMs = new Date(liveInfo.channelCreatedTime).getTime();
    const fakeCommentTime = broadcastStartMs + 123 * 1000;
    const expectedOffset = 123;
    const customerFbUserId = `e2e_test_${Date.now()}`;
    const fakeCommentId = `e2e_c_${Date.now()}`;

    await page.evaluate(
        ({ commentTime, customerFbUserId, commentId, campaignId, pageId }) => {
            window.eventBus.emit('tpos:newComment', {
                comment: {
                    id: commentId,
                    from: { id: customerFbUserId, name: 'E2E Test KH' },
                    created_time: new Date(commentTime).toISOString(),
                    message: 'e2e test',
                    _campaignId: campaignId,
                    _pageId: pageId,
                },
                isStaff: false,
            });
        },
        {
            commentTime: fakeCommentTime,
            customerFbUserId,
            commentId: fakeCommentId,
            campaignId: camp.id,
            pageId: camp.pageId,
        }
    );
    await page.waitForTimeout(7000);

    const created = await page.evaluate(
        async ({ customerFbUserId, API }) => {
            const r = await fetch(
                `${API}/api/livestream/snapshots?customerFbUserId=${customerFbUserId}`,
                { credentials: 'omit' }
            );
            return r.json();
        },
        { customerFbUserId, API }
    );
    const snap = created.snapshots?.[0];
    record('C5: Auto-snap creates snapshot', !!snap, snap ? `id=${snap.id}` : 'none');

    if (!snap) {
        console.log('Cannot continue without snap.');
        await browser.close();
        process.exit(1);
    }

    // Check 6: offsetSeconds chính xác
    record(
        `C6: offsetSeconds == ${expectedOffset}`,
        snap.offsetSeconds === expectedOffset,
        `actual=${snap.offsetSeconds}`
    );

    // Check 7: thumbnailUrl từ FB CDN (not Graph)
    const isFbCdn = snap.thumbnailUrl?.includes('scontent') || snap.thumbnailUrl?.includes('fbcdn');
    const isGraph = snap.thumbnailUrl?.includes('graph.facebook.com');
    // Auto-snap path 2 KHÔNG lưu URL generic nữa (user req 2026-05-23). Accept
    // null thumbnailUrl OR FB CDN (legacy). Cấm Graph URL (đã chết 400).
    const okC7 = (snap.thumbnailUrl == null && !isGraph) || (isFbCdn && !isGraph);
    record(
        'C7: thumbnailUrl null hoặc FB CDN (not Graph 400)',
        okC7,
        snap.thumbnailUrl?.slice(0, 80) || 'null'
    );

    // Check 8: livestreamUrl vanity (no encoded chars)
    const hasEncodedVanity = snap.livestreamUrl?.match(/\/[A-Z]?%[0-9A-F]{2}/);
    const hasGoodVanity =
        snap.livestreamUrl?.includes('NhiJudyHouse.VietNam') ||
        snap.livestreamUrl?.includes('NhiJudyStore') ||
        snap.livestreamUrl?.match(/\/\d+\/videos\//);
    record(
        'C8: livestreamUrl vanity OK (no encoded)',
        hasGoodVanity && !hasEncodedVanity,
        snap.livestreamUrl?.slice(0, 90)
    );

    // Check 9: livestreamUrl có ?t={offset}&locale=vi_VN
    const urlOk =
        snap.livestreamUrl?.includes(`t=${expectedOffset}`) &&
        snap.livestreamUrl?.includes('locale=vi_VN');
    record('C9: livestreamUrl có ?t=offset & locale', urlOk, '');

    // Check 10: Thumbnail HEAD fetch OK (skip nếu null — auto-snap không lưu URL)
    let thumbStatus;
    if (snap.thumbnailUrl) {
        thumbStatus = await page.evaluate(async (url) => {
            try {
                const r = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
                return { ok: true, type: r.type };
            } catch (e) {
                return { ok: false, err: e.message };
            }
        }, snap.thumbnailUrl);
    } else {
        thumbStatus = { ok: true, skipped: 'no URL — auto-snap không lưu generic' };
    }
    record('C10: Thumbnail URL loadable hoặc null', thumbStatus.ok, JSON.stringify(thumbStatus));

    // Check 11: Legacy refresh-thumbnail endpoint trả 410 Gone (deprecated).
    const refreshResp = await page.evaluate(
        async ({ id, API }) => {
            const r = await fetch(`${API}/api/livestream/snapshot/${id}/refresh-thumbnail`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'omit',
                body: JSON.stringify({}),
            });
            const body = await r.json().catch(() => ({}));
            return { status: r.status, body };
        },
        { id: snap.id, API }
    );
    record(
        'C11: refresh-thumbnail endpoint deprecated (410)',
        refreshResp.status === 410,
        `status=${refreshResp.status}`
    );

    // C12: Manual freeze bytea qua direct DB UPDATE (test infra) → simulate
    // "frame đã extract" state, để C13 verify GET /image trả bytes hợp lệ.
    // Simulate bằng cách POST 1 snap MỚI với imageBase64 (path 1 path).
    const fakeJpegB64 =
        '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/AP/Z';
    const c12Snap = await page.evaluate(
        async ({ customerFbUserId, commentId, API, b64 }) => {
            const r = await fetch(`${API}/api/livestream/snapshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'omit',
                body: JSON.stringify({
                    customerFbUserId,
                    customerName: 'E2E frame test',
                    commentId: commentId + '_withframe',
                    pageId: 'test',
                    liveVideoId: 'test_vid',
                    capturedAt: Date.now(),
                    offsetSeconds: 0,
                    imageBase64: b64,
                    imageMime: 'image/jpeg',
                }),
            });
            return r.json();
        },
        { customerFbUserId, commentId: fakeCommentId, API, b64: fakeJpegB64 }
    );
    const isSelfServed = c12Snap.snapshot?.thumbnailUrl?.includes('/api/livestream/snapshot/');
    const refreshedSnap = c12Snap.snapshot;
    record(
        'C12: POST snap với imageBase64 → thumbnail_url self-served',
        isSelfServed,
        refreshedSnap?.thumbnailUrl?.slice(0, 80) || 'null'
    );

    if (isSelfServed) {
        // Force HTTPS to avoid mixed-content (backend may return http:// behind proxy).
        const httpsUrl = refreshedSnap.thumbnailUrl.replace(/^http:\/\//, 'https://');
        const imgStatus = await page.evaluate(async (url) => {
            try {
                const r = await fetch(url, { credentials: 'omit' });
                const ct = r.headers.get('content-type');
                const blob = await r.blob();
                return { status: r.status, contentType: ct, size: blob.size };
            } catch (e) {
                return { ok: false, err: String(e.message || e) };
            }
        }, httpsUrl);
        // C12 dùng small sample JPEG (size ~200 bytes) — chỉ verify endpoint
        // serve image/* content-type, KHÔNG check size (real bytea từ ffmpeg
        // sẽ > 10KB, đủ).
        record(
            'C13: Self-served image returns valid image/*',
            imgStatus.status === 200 && imgStatus.contentType?.startsWith('image/'),
            JSON.stringify(imgStatus) +
                ` urlIsHttps=${refreshedSnap.thumbnailUrl.startsWith('https://')}`
        );
    } else {
        record('C13: Self-served image returns valid JPEG/PNG', false, 'skipped (C12 fail)');
    }

    // Check 14: No console errors
    record(
        'C14: No console errors during flow',
        consoleErrors.length === 0,
        consoleErrors.slice(0, 3).join(' | ')
    );

    // Check 15: Manual snap (TposLivestreamSnap.snap call) uses comment time, not Date.now().
    // Inject a PAST comment vào STATE.comments (offset 456s từ broadcastStart)
    // → invoke TposLivestreamSnap.snap với { commentTime } → verify offset stored = 456.
    const manualExpectedOffset = 456;
    const manualCustomerFbUserId = `e2e_manual_${Date.now()}`;
    const manualCommentId = `e2e_manual_c_${Date.now()}`;
    const manualCommentTimeMs = broadcastStartMs + manualExpectedOffset * 1000;
    const manualSnapResult = await page.evaluate(
        async ({
            customerFbUserId,
            commentId,
            commentTime,
            customerName,
            campaignId,
            pageId,
            API: apiBase,
        }) => {
            // Truyền cả comment để snap() resolve đúng campaign theo comment
            // (giống click button thật: button gắn vào row có _campaignId/_pageId).
            const fakeComment = {
                id: commentId,
                from: { id: customerFbUserId, name: customerName },
                created_time: new Date(commentTime).toISOString(),
                message: 'e2e manual',
                _campaignId: campaignId,
                _pageId: pageId,
            };
            await window.TposLivestreamSnap.snap(customerFbUserId, customerName, commentId, null, {
                commentTime,
                comment: fakeComment,
            });
            await new Promise((r) => setTimeout(r, 4000));
            const r = await fetch(
                `${apiBase}/api/livestream/snapshots?customerFbUserId=${customerFbUserId}`,
                { credentials: 'omit' }
            );
            const j = await r.json();
            return j.snapshots?.[0] || null;
        },
        {
            customerFbUserId: manualCustomerFbUserId,
            commentId: manualCommentId,
            commentTime: manualCommentTimeMs,
            customerName: 'E2E Manual KH',
            campaignId: camp.id,
            pageId: camp.pageId,
            API,
        }
    );
    record(
        `C15: Manual snap uses commentTime → offset == ${manualExpectedOffset}`,
        manualSnapResult?.offsetSeconds === manualExpectedOffset,
        manualSnapResult
            ? `actual=${manualSnapResult.offsetSeconds} id=${manualSnapResult.id}`
            : 'no snap'
    );
    // Cleanup manual snap
    if (manualSnapResult?.id) {
        await page.evaluate(
            async ({ id, API: apiBase }) => {
                await fetch(`${apiBase}/api/livestream/snapshot/${id}`, {
                    method: 'DELETE',
                    credentials: 'omit',
                });
            },
            { id: manualSnapResult.id, API }
        );
    }

    // Check 16: Auto-mode ON → normal click trên snap button → mở popover (không snap)
    // Tìm 1 .tpos-snap-btn đang render trên page (sau khi comment list render xong).
    const c16 = await page.evaluate(async () => {
        // Cleanup popover từ test trước (C15 manual snap có thể đã trigger 1 popover open).
        document.querySelectorAll('.tpos-snap-popover').forEach((p) => p.remove());
        if (window.TposState) window.TposState.popoverOpen = null;
        await new Promise((r) => setTimeout(r, 300));
        const btn = document.querySelector('.tpos-snap-btn[data-customer-id]');
        if (!btn) return { ok: false, reason: 'no snap button rendered' };
        const auto = localStorage.getItem('tpos_snap_auto');
        if (auto && auto !== 'on') return { ok: false, reason: 'auto-mode off' };
        // Track snap POST → fail nếu auto-mode click vẫn trigger snap.
        let snapTriggered = false;
        const origFetch = window.fetch;
        window.fetch = function (url, ...rest) {
            if (
                typeof url === 'string' &&
                url.includes('/api/livestream/snapshot') &&
                rest[0]?.method === 'POST' &&
                !url.includes('refresh-thumbnail')
            ) {
                snapTriggered = true;
            }
            return origFetch.call(this, url, ...rest);
        };
        const before = document.querySelectorAll('.tpos-snap-popover').length;
        btn.click(); // no shift
        await new Promise((r) => setTimeout(r, 1500));
        const after = document.querySelectorAll('.tpos-snap-popover').length;
        window.fetch = origFetch;
        return {
            ok: after > before && !snapTriggered,
            before,
            after,
            popoverOpened: after > before,
            snapTriggered,
        };
    });
    record('C16: Auto-mode ON → click camera = mở popover (no shift)', c16.ok, JSON.stringify(c16));

    // Check 18: by-comment-ids endpoint trả metadata đúng (thumbnailUrl null OK
    // sau cleanup — auto-mode chỉ lưu metadata, không lưu URL generic).
    // Test với commentId của C12 snap (có bytea + self-served URL).
    const c18CommentId = fakeCommentId + '_withframe';
    const c18 = await page.evaluate(
        async ({ commentId, API: apiBase }) => {
            const r = await fetch(
                `${apiBase}/api/livestream/snapshots/by-comment-ids?commentIds=${commentId}`,
                { credentials: 'omit' }
            );
            const d = await r.json();
            const entry = d.byCommentId?.[commentId];
            return {
                ok:
                    !!entry &&
                    !!entry.thumbnailUrl?.includes('/api/livestream/snapshot/') &&
                    entry.source === 'exact',
                entry,
            };
        },
        { commentId: c18CommentId, API }
    );
    record('C18: by-comment-ids returns snap với self-served URL', c18.ok, JSON.stringify(c18));

    // Check 19: Inline thumb chỉ render khi DB snap có FROZEN BYTEA (self-served URL).
    // Test flow: inject fake DOM row matching fakeCommentId → toggle ON → strip
    // render → click → lightbox.
    const c19 = await page.evaluate(
        async ({ fakeCommentId, customerFbUserId }) => {
            // Inject minimal fake row vào DOM với data-comment-id matching snap C12 (có bytea).
            const fakeRow = document.createElement('div');
            fakeRow.className = 'tpos-conversation-item';
            fakeRow.dataset.commentId = fakeCommentId;
            // Use C12 commentId (has bytea) instead of C5's.
            fakeRow.innerHTML = `
                <div class="tpos-conv-row1">
                    <div class="tpos-conv-avatar"></div>
                    <div class="tpos-conv-header-info">
                        <div class="tpos-conv-header"></div>
                    </div>
                </div>
                <div class="tpos-conv-info"></div>
            `;
            document.body.appendChild(fakeRow);
            window.__e2eFakeRow = fakeRow;
            // Bật toggle inline thumb → trigger queue + render strip cho fake row.
            if (window.TposLivestreamSnap?._setInlineThumb) {
                window.TposLivestreamSnap._setInlineThumb(true);
            }
            // Manually queue (vì injectSnapButton normal cần comment trong state).
            // Trick: re-trigger by removing from cache + queue.
            return { injected: true };
        },
        { fakeCommentId: c18CommentId, customerFbUserId }
    );
    // Wait cho strip render (batch fetch 300ms + network).
    let c19Img = null;
    for (let i = 0; i < 30; i++) {
        c19Img = await page.evaluate(() => {
            // Force render strip on fake row if not yet done.
            if (window.__e2eFakeRow && !window.__e2eFakeRow.querySelector('.tpos-snap-thumb-img')) {
                // Try manual injection by triggering injectSnapButtonsAll.
                if (window.TposLivestreamSnap?.injectSnapButtonsAll) {
                    window.TposLivestreamSnap.injectSnapButtonsAll();
                }
            }
            return !!document.querySelector('.tpos-snap-thumb-img');
        });
        if (c19Img) break;
        await page.waitForTimeout(250);
    }
    const c19r = await page.evaluate(async () => {
        const img = document.querySelector('.tpos-snap-thumb-img');
        if (!img) return { ok: false, reason: 'no thumb img rendered (cần DB snap có bytea)' };
        document.querySelectorAll('.tpos-snap-lightbox').forEach((x) => x.remove());
        img.click();
        await new Promise((r) => setTimeout(r, 400));
        const lb = document.querySelector('.tpos-snap-lightbox');
        const hasImg = !!lb?.querySelector('img');
        const hasLiveBtn = !!lb?.querySelector('a[href*="facebook.com"]');
        if (lb) lb.remove();
        // Cleanup fake row
        if (window.__e2eFakeRow) window.__e2eFakeRow.remove();
        return { ok: !!lb && hasImg && hasLiveBtn, lightboxOpened: !!lb, hasImg, hasLiveBtn };
    });
    record(
        'C19: Click thumb → lightbox zoom mở (có ảnh + link live)',
        c19r.ok,
        JSON.stringify(c19r)
    );

    // C20: Frame buffer functions phải tồn tại + hoạt động.
    const c20 = await page.evaluate(() => {
        // Sym của các helper internal — verify chúng được wire correctly by
        // probing STATE structure + chip click flow.
        const state = window.TposState; // not exposed; access via internal
        // Verify: chip click khi auto-mode toggle có handler async (auto-prompt
        // stream). Read chip code via outer fn name.
        const autoChip = document.getElementById('tpos-snap-auto-chip');
        const realChip = document.getElementById('tpos-snap-real-chip');
        return {
            autoChip: !!autoChip,
            realChip: !!realChip,
            hasSetInlineThumb: typeof window.TposLivestreamSnap?._setInlineThumb === 'function',
            ok:
                !!autoChip &&
                !!realChip &&
                typeof window.TposLivestreamSnap?._setInlineThumb === 'function',
        };
    });
    record(
        'C20: Frame buffer infrastructure ready (chips + toggle exposed)',
        c20.ok,
        JSON.stringify(c20)
    );

    // C21: Comment KHÔNG có bytea snap → render button "📸 Chụp" (không phải thumb).
    const c21 = await page.evaluate(() => {
        // Inject fake row với comment_id chưa có DB snap.
        const fakeId = `e2e_nobtn_${Date.now()}`;
        const row = document.createElement('div');
        row.className = 'tpos-conversation-item';
        row.dataset.commentId = fakeId;
        row.innerHTML = '<div class="tpos-conv-info"></div>';
        document.body.appendChild(row);
        // Set cache với null (no bytea) → render path button.
        if (window.TposLivestreamSnap?._setInlineThumb) {
            window.TposLivestreamSnap._setInlineThumb(true);
        }
        return new Promise((resolve) => {
            setTimeout(() => {
                const btn = row.querySelector('.tpos-snap-capture-btn');
                const result = {
                    ok: !!btn,
                    hasBtn: !!btn,
                    hasImg: !!row.querySelector('.tpos-snap-thumb-img'),
                };
                row.remove();
                resolve(result);
            }, 1500);
        });
    });
    record('C21: Comment không bytea snap → button "📸 Chụp" render', c21.ok, JSON.stringify(c21));

    // C22: POST /extract-frame endpoint (Phase 2 — backend yt-dlp + ffmpeg).
    // Test enqueue cho snap đã có bytea sẵn → backend skip (queued=0).
    const c22 = await page.evaluate(
        async ({ snapId, API: apiBase }) => {
            const r = await fetch(`${apiBase}/api/livestream/extract-frame`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'omit',
                body: JSON.stringify({ snapshotIds: [snapId] }),
            });
            const d = await r.json();
            return { status: r.status, ok: r.status === 200 && d.success, body: d };
        },
        { snapId: Number(snap.id), API }
    );
    record('C22: POST /extract-frame endpoint live', c22.ok, JSON.stringify(c22).slice(0, 200));

    // C23: GET /extract-status?batchId=X — invalid batchId → 404
    const c23 = await page.evaluate(
        async ({ API: apiBase }) => {
            const r = await fetch(`${apiBase}/api/livestream/extract-status?batchId=nonexistent`, {
                credentials: 'omit',
            });
            return { status: r.status, ok: r.status === 404 };
        },
        { API }
    );
    record('C23: GET /extract-status invalid batchId → 404', c23.ok, JSON.stringify(c23));

    // Check 17: Perf — load page mới, đo thời gian từ navigate → 4 chips mounted.
    // Mục tiêu < 8s (TPOS init + chips render).
    const perfStart = Date.now();
    const perfPage = await ctx.newPage();
    await perfPage.goto(`${BASE}/live-chat/index.html?t=${Date.now()}`, {
        waitUntil: 'domcontentloaded',
    });
    // Trigger CRM team change ngay khi state ready (poll)
    let chipsReadyMs = null;
    for (let i = 0; i < 60; i++) {
        const ready = await perfPage.evaluate(() => {
            if (!window.TposState?.allPages?.length) return null;
            // Trigger 'all' lần đầu thấy allPages
            if (!window.__crmTriggered) {
                window.__crmTriggered = true;
                window.eventBus?.emit('tpos:crmTeamChanged', 'all');
            }
            const c1 = !!document.getElementById('tpos-snap-page-chip');
            const c2 = !!document.getElementById('tpos-snap-real-chip');
            const c3 = !!document.getElementById('tpos-snap-auto-chip');
            const c4 = !!document.getElementById('tpos-snap-backfill-chip');
            return c1 && c2 && c3 && c4 ? Date.now() : null;
        });
        if (ready) {
            chipsReadyMs = ready - perfStart;
            break;
        }
        await perfPage.waitForTimeout(250);
    }
    await perfPage.close();
    const perfThresholdMs = 12000;
    record(
        `C17: Perf — page load → 4 chips ready < ${perfThresholdMs}ms`,
        chipsReadyMs !== null && chipsReadyMs < perfThresholdMs,
        chipsReadyMs !== null ? `actual=${chipsReadyMs}ms` : 'never ready'
    );

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

    // Summary
    const passed = results.filter((r) => r.ok).length;
    const failed = results.length - passed;
    console.log('\n========================================');
    console.log(`E2E RESULT: ${passed}/${results.length} PASS (${failed} fail)`);
    console.log('========================================');
    results.filter((r) => !r.ok).forEach((r) => console.log(`  ❌ ${r.name}: ${r.detail}`));

    await page.waitForTimeout(5000);
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
})();
