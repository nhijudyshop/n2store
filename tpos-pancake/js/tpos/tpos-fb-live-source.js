// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — nguồn comment live qua Pancake (pages.fm) + FB Graph EAA optional. Thay TPOS.
// =====================================================================
// TposFbLiveSource — nguồn dữ liệu cột "xem comment livestream" ĐỘC LẬP TPOS.
//
// ⚠ KIẾN TRÚC (xác nhận 2026-06-07 với live thật):
//   - Pancake CHỈ đưa JWT (eyJh) chạy trên pages.fm — KHÔNG phải FB EAA token,
//     gọi thẳng graph.facebook.com → "Bad signature". Vậy NGUỒN CHÍNH = pages.fm
//     Pancake API (qua worker /api/pancake/*, account JWT). Đã verify: lấy được
//     post livestream + 60 comment thật.
//   - HYBRID "dùng cả": nếu page có FB EAA token thật (EAA..., user tạo qua Meta
//     System User, lưu /api/pancake-page-tokens) → dùng graph.facebook.com (giàu
//     hơn, realtime poll qua web2-fb-live). Token eyJh → pages.fm.
//
// Comment livestream = Pancake conversations type=COMMENT lọc theo post_id bài
// live. Mỗi conversation = 1 comment thread (snippet = nội dung comment).
//
// Multi-account: chọn account JWT admin page (pancakeTokenManager.accounts).
// =====================================================================

(function () {
    'use strict';
    if (typeof window === 'undefined') return;

    const POLL_MS = 4000; // poll comment mới mỗi 4s (client-side, pages.fm)
    const LOOKBACK_S = 6 * 3600; // cửa sổ comment 6h
    const POSTS_LOOKBACK_S = 7 * 86400; // posts 7 ngày

    function worker() {
        return (
            (window.TposState && window.TposState.workerUrl) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    function nowS() {
        return Math.floor(Date.now() / 1000);
    }
    function enabled() {
        return true; // TPOS đã gỡ — nguồn này luôn dùng
    }

    // postId chuẩn pages.fm = `pageId_xxxxx`. Giữ nguyên (Facebook_LiveId).
    function fullPostId(pageId, postId) {
        const s = String(postId || '');
        if (s.includes('_')) return s;
        return `${pageId}_${s}`;
    }

    // ── Token resolution ────────────────────────────────────────────────
    // Account JWT (pages.fm) cho page: account nào admin page đó.
    function _accountJwtForPage(pageId) {
        const tm = window.pancakeTokenManager;
        if (!tm) return null;
        const accs = tm.accounts || {};
        for (const id of Object.keys(accs)) {
            const a = accs[id];
            if (!a || !a.token) continue;
            if (Array.isArray(a.pages) && a.pages.map(String).includes(String(pageId))) {
                return a.token;
            }
        }
        return tm.currentToken || null; // fallback active
    }
    // FB EAA token thật cho page (nếu có) — cache pancakeTokenManager.pageAccessTokens
    // CHỈ tính là EAA khi prefix 'EAA' (eyJ = Pancake JWT, bỏ).
    function _eaaTokenForPage(pageId) {
        try {
            const t = window.pancakeTokenManager?.pageAccessTokens?.[pageId]?.token;
            return t && String(t).startsWith('EAA') ? t : null;
        } catch {
            return null;
        }
    }

    async function _pfmGet(path, jwt) {
        const sep = path.includes('?') ? '&' : '?';
        const url = `${worker()}/api/pancake/${path}${sep}access_token=${encodeURIComponent(jwt)}`;
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        return r.json().catch(() => ({}));
    }

    // ── Map 1 COMMENT conversation (pages.fm) → comment shape FB-native ──
    function _convToComment(c) {
        const from = c.from || (Array.isArray(c.customers) && c.customers[0]) || {};
        return {
            id: c.id || c.thread_id || c.thread_key,
            from: { id: from.id || from.fb_id || c.from_psid || null, name: from.name || '' },
            message: c.snippet || c.last_sent_message || '',
            created_time: c.inserted_at || c.last_customer_interactive_at || null,
            parent: null,
            post_id: c.post_id || null,
            _conv: true,
            _hasOrder: !!c.has_livestream_order,
            _phones: c.recent_phone_numbers || [],
        };
    }

    // ── Pages (multi-account) từ store token (3 page có token) ───────────
    async function fetchPagesAsCrmTeams() {
        try {
            const r = await fetch(`${worker()}/api/pancake-page-tokens`, {
                headers: { Accept: 'application/json' },
            });
            const d = await r.json().catch(() => ({}));
            const toks = d.tokens || {};
            const allPages = Object.keys(toks).map((pid) => ({
                Id: Number(pid),
                Facebook_PageId: String(pid),
                Facebook_TypeId: 'Page',
                Name: toks[pid].pageName || String(pid),
                Facebook_UserName: toks[pid].pageName || '',
                teamId: 0,
                teamName: 'Pancake Pages',
            }));
            const crmTeams = allPages.length
                ? [{ Id: 0, Name: 'Pancake Pages', Childs: allPages }]
                : [];
            return { crmTeams, allPages };
        } catch (e) {
            console.warn('[FB-LIVE-SRC] fetchPages fail:', e.message);
            return { crmTeams: [], allPages: [] };
        }
    }

    // ── Live videos (= posts type=livestream) → campaign-like ───────────
    async function fetchVideosAsCampaigns(pageIds) {
        const ids = Array.isArray(pageIds) ? pageIds : [pageIds];
        const out = [];
        const now = nowS();
        for (const pid of ids) {
            const pageId = String(pid || '').trim();
            if (!pageId) continue;
            const jwt = _accountJwtForPage(pageId);
            if (!jwt) continue;
            try {
                const d = await _pfmGet(
                    `pages/${pageId}/posts?start_time=${now - POSTS_LOOKBACK_S}&end_time=${now}`,
                    jwt
                );
                const posts = Array.isArray(d.posts)
                    ? d.posts
                    : Array.isArray(d.data)
                      ? d.data
                      : [];
                for (const p of posts) {
                    if (p.type !== 'livestream' && !p.is_live_video && !p.live_video_id) continue;
                    out.push({
                        Id: String(p.id),
                        Name: p.message || p.title || '(livestream)',
                        Facebook_UserId: pageId,
                        Facebook_LiveId: String(p.id), // pages.fm post id = pageId_xxx
                        Facebook_UserName: '',
                        DateCreated: p.inserted_at || p.created_time || null,
                        StatusLive: p.live_status || (p.is_living ? 'LIVE' : null),
                        _thumbnail:
                            p.picture ||
                            p.cover ||
                            (p.attachments && p.attachments[0]?.url) ||
                            null,
                    });
                }
            } catch (e) {
                console.warn('[FB-LIVE-SRC] posts fail', pageId, e.message);
            }
        }
        return out;
    }

    // ── Comments của 1 bài live: conversations type=COMMENT lọc post_id ──
    async function loadComments(pageId, postId) {
        const jwt = _accountJwtForPage(pageId);
        if (!jwt) throw new Error('FB-live: không có account JWT cho page ' + pageId);
        const pid = fullPostId(pageId, postId);
        const now = nowS();
        const comments = [];
        // page qua tối đa 5 trang để gom comment của post này (live nhiều thread)
        for (let pageNum = 1; pageNum <= 5; pageNum++) {
            const d = await _pfmGet(
                `pages/${pageId}/conversations?type=COMMENT&since=${now - LOOKBACK_S}&until=${now}&page_number=${pageNum}`,
                jwt
            );
            const cv = Array.isArray(d.conversations)
                ? d.conversations
                : Array.isArray(d.data)
                  ? d.data
                  : [];
            if (!cv.length) break;
            for (const c of cv) {
                if (String(c.post_id) === pid) comments.push(_convToComment(c));
            }
            if (cv.length < 20) break; // hết trang
        }
        return { comments, nextPageUrl: null };
    }

    // ── Realtime: client poll loadComments, dedupe → handleSSEMessage ────
    const _active = new Map(); // postId → { timer, seen:Set }

    async function startRealtime(pageId, postId, pageName) {
        const pid = fullPostId(pageId, postId);
        if (_active.has(pid)) return;
        const st = { timer: null, seen: new Set() };
        _active.set(pid, st);
        const tick = async () => {
            try {
                const { comments } = await loadComments(pageId, postId);
                const fresh = comments.filter((c) => c.id && !st.seen.has(c.id));
                fresh.forEach((c) => st.seen.add(c.id));
                if (st.seen.size > 5000) st.seen = new Set(Array.from(st.seen).slice(-2500));
                if (fresh.length && window.TposRealtime?.handleSSEMessage) {
                    // chronological (cũ→mới) cho hiển thị nhất quán
                    fresh.reverse();
                    window.TposRealtime.handleSSEMessage(JSON.stringify(fresh), pageName || '');
                }
            } catch (e) {
                console.warn('[FB-LIVE-SRC] poll fail:', e.message);
            }
        };
        // seed seen từ loadComments hiện có (đã render bởi loadComments lần đầu)
        try {
            const { comments } = await loadComments(pageId, postId);
            comments.forEach((c) => c.id && st.seen.add(c.id));
        } catch {}
        st.timer = setInterval(tick, POLL_MS);
        if (window.TposCommentList?.updateConnectionStatus) {
            window.TposCommentList.updateConnectionStatus(true, 'poll');
        }
        console.log('[FB-LIVE-SRC] realtime poll started for post', pid);
    }

    function stopRealtime(postId) {
        const stopOne = (id, st) => {
            clearInterval(st.timer);
            _active.delete(id);
        };
        if (postId) {
            for (const [id, st] of Array.from(_active.entries())) {
                if (id.endsWith(String(postId)) || id === String(postId)) stopOne(id, st);
            }
        } else {
            for (const [id, st] of Array.from(_active.entries())) stopOne(id, st);
        }
    }

    // Giữ tên cũ videoId cho caller (postId pages.fm đã full → trả nguyên).
    function videoId(postId) {
        return String(postId || '');
    }

    window.TposFbLiveSource = {
        enabled,
        loadComments,
        startRealtime,
        stopRealtime,
        videoId,
        fetchPagesAsCrmTeams,
        fetchVideosAsCampaigns,
        _eaaTokenForPage, // cho web2-fb-live EAA path (optional)
    };
})();
