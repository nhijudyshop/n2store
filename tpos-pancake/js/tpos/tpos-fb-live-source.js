// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — nguồn comment live qua FB Graph (web2-fb-live), thay TPOS. Flag-gated.
// =====================================================================
// TposFbLiveSource — nguồn comment livestream ĐỘC LẬP TPOS, qua backend
// /api/web2-fb-live (FB Graph + Pancake page token). Dùng để REWIRE cột
// "xem comment livestream" của tpos-pancake khỏi TPOS.
//
// ⚠ FLAG-GATED + FALLBACK-SAFE (rewire mù an toàn — verify ở buổi live kế):
//   - Mặc định TẮT (localStorage `web2_live_source` ≠ 'fbgraph') → cột chạy
//     TPOS như cũ, shop KHÔNG bị ảnh hưởng.
//   - Bật: `localStorage.setItem('web2_live_source','fbgraph')` rồi reload.
//     loadComments lỗi → tpos-api tự fallback TPOS. Realtime lỗi → vẫn còn
//     polling load. Sai bất kỳ đâu → tắt flag là về TPOS ngay (không mất live).
//
// MẤU CHỐT: token = Pancake page_access_token (FB token thật). Comment shape
// = FB-native (backend mapComment) → tái dùng TposRealtime.handleSSEMessage +
// tpos-comment-list KHÔNG cần đổi.
//
// Hỗ trợ "chọn chiến dịch CŨ coi comment CŨ": loadComments gọi
// /api/web2-fb-live/comments?liveVideoId= (1-shot, cả VOD) — không cần live.
// =====================================================================

(function () {
    'use strict';
    if (typeof window === 'undefined') return;

    const FLAG_KEY = 'web2_live_source'; // 'fbgraph' = bật | khác/null = TPOS (mặc định)
    const KEEPALIVE_MS = 5 * 60 * 1000; // refresh poller keepalive < POLLER_STALE_MS(8') server

    function enabled() {
        try {
            return localStorage.getItem(FLAG_KEY) === 'fbgraph';
        } catch {
            return false;
        }
    }

    function base() {
        return (
            (window.TposState && window.TposState.workerUrl) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }

    // postId = Facebook_PostId dạng `pageId_videoId` → lấy videoId (live video).
    function videoId(postId) {
        const s = String(postId || '');
        return s.includes('_') ? s.split('_').pop() : s;
    }

    async function pageToken(pageId) {
        try {
            return (await window.PancakeAPI?.getPageAccessToken(pageId)) || null;
        } catch {
            return null;
        }
    }

    // 1-shot load comments (live đang chạy HOẶC chiến dịch cũ/VOD).
    async function loadComments(pageId, postId) {
        const token = await pageToken(pageId);
        if (!token) throw new Error('FB-live: thiếu page token (Pancake)');
        const lv = videoId(postId);
        if (!lv) throw new Error('FB-live: thiếu liveVideoId');
        const url = `${base()}/api/web2-fb-live/comments?liveVideoId=${encodeURIComponent(lv)}&token=${encodeURIComponent(token)}&limit=100`;
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        const d = await r.json().catch(() => ({}));
        if (!d || d.success === false) throw new Error(d?.error || 'FB-live comments failed');
        return { comments: d.data || [], nextPageUrl: null };
    }

    const _active = new Map(); // liveVideoId → { unsub, keepalive }

    async function startRealtime(pageId, postId, pageName) {
        const token = await pageToken(pageId);
        if (!token) {
            console.warn('[FB-LIVE-SRC] không có page token → bỏ realtime');
            return;
        }
        const lv = videoId(postId);
        if (!lv || _active.has(lv)) return;

        const start = () =>
            fetch(`${base()}/api/web2-fb-live/poll/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ liveVideoId: lv, pageId, token }),
            }).catch((e) => console.warn('[FB-LIVE-SRC] poll/start fail:', e.message));

        await start();
        // SSE: comment mới broadcast qua web2:livestream:<lv> → reuse handleSSEMessage.
        const unsub = window.Web2SSE?.subscribe(`web2:livestream:${lv}`, (evt) => {
            const comments = evt?.data?.comments || evt?.comments;
            if (
                Array.isArray(comments) &&
                comments.length &&
                window.TposRealtime?.handleSSEMessage
            ) {
                try {
                    window.TposRealtime.handleSSEMessage(JSON.stringify(comments), pageName || '');
                } catch (e) {
                    console.warn('[FB-LIVE-SRC] ingest fail:', e.message);
                }
            }
        });
        const keepalive = setInterval(start, KEEPALIVE_MS);
        _active.set(lv, { unsub, keepalive });
        if (window.TposCommentList?.updateConnectionStatus) {
            window.TposCommentList.updateConnectionStatus(true, 'sse');
        }
        console.log('[FB-LIVE-SRC] realtime started for live', lv);
    }

    function _stopOne(id, a) {
        try {
            a.unsub && a.unsub();
        } catch {}
        clearInterval(a.keepalive);
        fetch(`${base()}/api/web2-fb-live/poll/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ liveVideoId: id }),
        }).catch(() => {});
        _active.delete(id);
    }

    function stopRealtime(postId) {
        if (postId) {
            const lv = videoId(postId);
            const a = _active.get(lv);
            if (a) _stopOne(lv, a);
        } else {
            for (const [id, a] of Array.from(_active.entries())) _stopOne(id, a);
        }
    }

    // ─── Page discovery (Pancake) → shape crmTeams/allPages giống TPOS ──────
    // Trả { crmTeams, allPages } để loadCRMTeams set thẳng vào state.
    async function fetchPagesAsCrmTeams() {
        const pages = (await window.PancakeAPI?.fetchPages?.()) || [];
        const allPages = pages.map((p) => ({
            Id: Number(p.id), // selector so === parseInt(pageId) (precision nhất quán)
            Facebook_PageId: String(p.id),
            Facebook_TypeId: 'Page',
            Name: p.name || String(p.id),
            Facebook_UserName: p.name || '',
            teamId: 0,
            teamName: 'Pancake Pages',
        }));
        const crmTeams = allPages.length
            ? [{ Id: 0, Name: 'Pancake Pages', Childs: allPages }]
            : [];
        return { crmTeams, allPages };
    }

    // ─── Live video discovery (FB Graph) → shape liveCampaign giống TPOS ────
    // pageIds: 1 hoặc nhiều page. Trả mảng campaign-like.
    async function fetchVideosAsCampaigns(pageIds) {
        const ids = Array.isArray(pageIds) ? pageIds : [pageIds];
        const out = [];
        for (const pid of ids) {
            const pageId = String(pid || '').trim();
            if (!pageId) continue;
            const token = await pageToken(pageId);
            if (!token) continue;
            try {
                const url = `${base()}/api/web2-fb-live/videos?pageId=${encodeURIComponent(pageId)}&token=${encodeURIComponent(token)}&limit=50`;
                const r = await fetch(url, { headers: { Accept: 'application/json' } });
                const d = await r.json().catch(() => ({}));
                if (!d || d.success === false || !Array.isArray(d.data)) continue;
                for (const v of d.data) {
                    const vid = String(v.videoId || v.objectId || '');
                    if (!vid) continue;
                    out.push({
                        Id: vid, // checkbox value + find(x.Id===id)
                        Name: v.title || '(live)',
                        Facebook_UserId: pageId, // = pageId
                        Facebook_LiveId: `${pageId}_${vid}`, // = postId cho loadComments/startSSE
                        Facebook_UserName: out.length === 0 ? '' : '', // điền sau từ allPages nếu cần
                        DateCreated: v.channelCreatedTime || null,
                        StatusLive: v.statusLive || null,
                        _thumbnail: v.thumbnail?.url || null,
                    });
                }
            } catch (e) {
                console.warn('[FB-LIVE-SRC] fetchVideos fail page', pageId, e.message);
            }
        }
        return out;
    }

    window.TposFbLiveSource = {
        enabled,
        loadComments,
        startRealtime,
        stopRealtime,
        videoId,
        fetchPagesAsCrmTeams,
        fetchVideosAsCampaigns,
    };
})();
