// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — nguồn comment live qua Pancake (pages.fm) + FB Graph EAA optional. Thay Live.
// =====================================================================
// LiveSource — nguồn dữ liệu cột "xem comment livestream" ĐỘC LẬP Live.
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

    function worker() {
        return (
            (window.LiveState && window.LiveState.workerUrl) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    function nowS() {
        return Math.floor(Date.now() / 1000);
    }
    function enabled() {
        return true; // Live đã gỡ — nguồn này luôn dùng
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
        const cust = (Array.isArray(c.customers) && c.customers[0]) || {};
        const from = c.from || cust || {};
        // fb_id thường nằm ở customers[0], KHÔNG ở from → ưu tiên cust trước (tránh avatar xám).
        const fbId = cust.fb_id || from.fb_id || from.id || c.from_psid || null;
        const avatar =
            cust.avatar ||
            cust.picture?.data?.url ||
            cust.profile_pic ||
            cust.image_url ||
            from.avatar ||
            from.picture?.data?.url ||
            from.profile_pic ||
            null;
        return {
            id: c.id || c.thread_id || c.thread_key,
            from: {
                id: fbId,
                name: from.name || cust.name || '',
                picture: avatar ? { data: { url: avatar } } : undefined,
            },
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

    // pages.fm trả tối đa ~50 post/lần. Floor mặc định: chỉ lùi 365 ngày (đủ xa
    // cho mọi buổi live cần xem lại) để cursor không chạy vô tận.
    const POSTS_FLOOR_S = 365 * 86400;
    const POSTS_PAGE_SIZE = 50;

    // inserted_at pages.fm = "2026-06-08T11:51:55" (UTC, không hậu tố Z) → epoch s.
    function _postEpoch(p) {
        const s = p.inserted_at || p.created_time;
        if (!s) return 0;
        const t = Math.floor(new Date(String(s).includes('Z') ? s : s + 'Z').getTime() / 1000);
        return Number.isFinite(t) && t > 0 ? t : 0;
    }

    function _postToCampaign(p, pageId) {
        return {
            Id: String(p.id),
            Name: p.message || p.title || '(livestream)',
            Facebook_UserId: pageId,
            Facebook_LiveId: String(p.id), // pages.fm post id = pageId_xxx
            Facebook_UserName: '',
            DateCreated: p.inserted_at || p.created_time || null,
            StatusLive:
                p.live_video_status ||
                p.live_status ||
                (p.is_living || p.in_progress ? 'LIVE' : null),
            _thumbnail: p.picture || p.cover || (p.attachments && p.attachments[0]?.url) || null,
        };
    }

    // ── Live videos (= posts type=livestream) → campaign-like ───────────
    //
    // Phân trang bằng cursor THỜI GIAN (end_time): pages.fm posts sort inserted_at
    // desc, capped ~50/lần. Lần đầu end_time=now; "tải thêm" → end_time = inserted_at
    // cũ nhất batch trước − 1 (lấy bài cũ hơn). Mỗi page độc lập, hết khi
    // posts<50 hoặc done.
    //
    // @param {string|string[]} pageIds
    // @param {{cursors?: Object}} [opts] — cursors = { [pageId]: {oldest,done} },
    //        truyền vào để tải tiếp (mutated tại chỗ + trả về). Bỏ trống = tải mới.
    // @returns {Promise<{campaigns: Array, cursors: Object}>}
    async function fetchVideosAsCampaigns(pageIds, opts = {}) {
        const ids = Array.isArray(pageIds) ? pageIds : [pageIds];
        const cursors = opts.cursors || {};
        const out = [];
        const now = nowS();
        const floor = now - POSTS_FLOOR_S;
        for (const pid of ids) {
            const pageId = String(pid || '').trim();
            if (!pageId) continue;
            const cur = cursors[pageId] || (cursors[pageId] = { oldest: null, done: false });
            if (cur.done) continue;
            const jwt = _accountJwtForPage(pageId);
            if (!jwt) continue;
            const endTime = cur.oldest ? cur.oldest - 1 : now;
            if (endTime <= floor) {
                cur.done = true;
                continue;
            }
            try {
                const d = await _pfmGet(
                    `pages/${pageId}/posts?start_time=${floor}&end_time=${endTime}`,
                    jwt
                );
                const posts = Array.isArray(d.posts)
                    ? d.posts
                    : Array.isArray(d.data)
                      ? d.data
                      : [];
                let oldestEpoch = cur.oldest || endTime;
                for (const p of posts) {
                    const ep = _postEpoch(p);
                    if (ep && (!oldestEpoch || ep < oldestEpoch)) oldestEpoch = ep;
                    if (p.type !== 'livestream' && !p.is_live_video && !p.live_video_id) continue;
                    out.push(_postToCampaign(p, pageId));
                }
                // Cursor lùi tới bài cũ nhất; hết khi batch < page size hoặc API done.
                cur.oldest = oldestEpoch;
                if (posts.length < POSTS_PAGE_SIZE || d.done === true) cur.done = true;
            } catch (e) {
                console.warn('[FB-LIVE-SRC] posts fail', pageId, e.message);
                cur.done = true; // tránh kẹt vòng lặp tải thêm khi page lỗi
            }
        }
        // Xen kẽ tất cả page theo MỚI NHẤT lên đầu (Store/House trộn theo ngày).
        out.sort((a, b) => {
            const ta = a.DateCreated ? new Date(a.DateCreated).getTime() : 0;
            const tb = b.DateCreated ? new Date(b.DateCreated).getTime() : 0;
            return tb - ta;
        });
        return { campaigns: out, cursors };
    }

    // ── Comments của 1 bài live: conversations type=COMMENT lọc post_id ──
    async function loadComments(pageId, postId) {
        const jwt = _accountJwtForPage(pageId);
        if (!jwt) throw new Error('FB-live: không có account JWT cho page ' + pageId);
        const pid = fullPostId(pageId, postId);
        const now = nowS();
        const comments = [];
        const seen = new Set(); // DEDUPE theo comment id — pages.fm có thể trả
        // trùng conversation giữa các page_number → tránh lặp dòng (5 bản giống nhau).
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
            let added = 0;
            let matched = 0; // conversation thuộc ĐÚNG post này (lọc post_id)
            for (const c of cv) {
                if (String(c.post_id) !== pid) continue;
                matched++;
                const cm = _convToComment(c);
                if (!cm.id || seen.has(cm.id)) continue;
                seen.add(cm.id);
                comments.push(cm);
                added++;
            }
            // Hết trang thật → dừng.
            if (cv.length < 20) break;
            // Trang CÓ comment của post này nhưng toàn trùng (pages.fm trả lặp page)
            // → dừng. KHÔNG dừng khi matched===0 (page lọc theo post khác — comment
            // của post này có thể nằm ở trang sau → tránh "lấy không đủ comment").
            if (matched > 0 && added === 0) break;
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
                if (fresh.length && window.LiveRealtime?.handleSSEMessage) {
                    // chronological (cũ→mới) cho hiển thị nhất quán
                    fresh.reverse();
                    window.LiveRealtime.handleSSEMessage(JSON.stringify(fresh), pageName || '');
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
        if (window.LiveCommentList?.updateConnectionStatus) {
            window.LiveCommentList.updateConnectionStatus(true, 'poll');
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

    window.LiveSource = {
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
