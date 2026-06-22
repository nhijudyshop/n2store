// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// Live Stats Panel — bảng "Thông tin Livestream" dưới ô video ở cột video phải
// (layout 3 cột live-chat, 2026-06-22). Gom số liệu CÁC bài livestream đang chọn:
// tổng bình luận / lượt xem / lượt thích / chia sẻ / SĐT thu được (Pancake post
// API qua Web2Chat.fetchLivePosts — cache 60s) + đơn web đã tạo + người đã ẩn
// (state cục bộ). Event-driven: LiveCommentList._updateTotalBadge() gọi
// scheduleUpdate() mỗi lần render comment đổi → KHÔNG poller (CLAUDE.md rule 6).

(function (global) {
    'use strict';

    if (global.LiveStatsPanel) return;

    let _host = null;
    let _debounce = null;
    let _seq = 0; // chống race async fetch

    const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');

    // ── Gom số liệu từ Pancake (các post của comment đang load) + state cục bộ ──
    async function computeStats(token) {
        const LS = global.LiveState;
        const comments = (LS && LS.comments) || [];

        // distinct postId theo từng page (chỉ comment có cả page + post)
        const byPage = new Map();
        for (const c of comments) {
            const pid = String(c._pageId || c.page_id || '');
            const post = String(c.post_id || c._postId || '');
            if (!pid || !post) continue;
            if (!byPage.has(pid)) byPage.set(pid, new Set());
            byPage.get(pid).add(post);
        }

        const agg = {
            comments: 0,
            views: 0,
            likes: 0,
            shares: 0,
            phones: 0,
            posts: 0,
            living: false,
            hasPancake: false,
        };

        if (global.Web2Chat?.fetchLivePosts && byPage.size) {
            for (const [pid, postSet] of byPage) {
                const r = await global.Web2Chat.fetchLivePosts(pid);
                if (token !== _seq) return null; // stale → bỏ
                if (!r || !r.ok) continue;
                const map = new Map(r.posts.map((p) => [p.postId, p]));
                for (const postId of postSet) {
                    const p = map.get(postId);
                    if (!p) continue;
                    agg.hasPancake = true;
                    agg.posts += 1;
                    agg.comments += p.commentCount || 0;
                    agg.views += p.viewCount || 0;
                    agg.likes += p.likeCount || 0;
                    agg.shares += p.shareCount || 0;
                    agg.phones += p.phoneCount || 0;
                    if (p.living) agg.living = true;
                }
            }
        }

        // Fallback tổng comment khi chưa có data Pancake = số đã load (trừ người ẩn).
        if (!agg.hasPancake) {
            const LCL = global.LiveCommentList;
            agg.comments = (LCL && LCL._totalAfterHidden) ?? comments.length;
        }

        // Đơn web đã tạo trong (các) livestream đang chọn.
        try {
            agg.orders = global.LiveCommentList?._orderCount?.() || 0;
        } catch (e) {
            agg.orders = 0;
        }

        // Số NGƯỜI đã ẩn (distinct fromId) trong tập comment đang load.
        let hidden = 0;
        try {
            const HC = global.LiveHiddenCommenters;
            if (HC?.isHidden) {
                const set = new Set();
                for (const c of comments) {
                    if (!HC.isHidden(c)) continue;
                    const id = c.from?.id || c.fromId;
                    if (id) set.add(String(id));
                }
                hidden = set.size;
            }
        } catch (e) {
            /* ignore */
        }
        agg.hidden = hidden;

        return agg;
    }

    function render(s) {
        if (!_host) return;
        const statusPill = s.living
            ? '<span class="lvstat-pill live">🔴 Đang live</span>'
            : s.posts
              ? '<span class="lvstat-pill ended">Đã kết thúc</span>'
              : '<span class="lvstat-pill idle">Chưa chọn live</span>';

        const cells = [
            { ico: '💬', lbl: 'Bình luận', val: s.comments, cls: 'c-comments' },
            { ico: '👁️', lbl: 'Lượt xem', val: s.views, cls: 'c-views' },
            { ico: '❤️', lbl: 'Lượt thích', val: s.likes, cls: 'c-likes' },
            { ico: '🔁', lbl: 'Chia sẻ', val: s.shares, cls: 'c-shares' },
            { ico: '📞', lbl: 'SĐT thu', val: s.phones, cls: 'c-phones' },
            { ico: '🛒', lbl: 'Đơn đã tạo', val: s.orders, cls: 'c-orders' },
            { ico: '🙈', lbl: 'Đã ẩn', val: s.hidden, cls: 'c-hidden' },
        ];

        _host.innerHTML = `
            <div class="lvstat-head">
                <span class="lvstat-title">📊 Thông tin Livestream</span>
                ${statusPill}
            </div>
            <div class="lvstat-grid">
                ${cells
                    .map(
                        (c) => `
                    <div class="lvstat-cell ${c.cls}">
                        <span class="lvstat-ico">${c.ico}</span>
                        <span class="lvstat-num">${fmt(c.val)}</span>
                        <span class="lvstat-lbl">${c.lbl}</span>
                    </div>`
                    )
                    .join('')}
            </div>
            ${
                s.posts > 1
                    ? `<div class="lvstat-foot">Tổng hợp ${s.posts} livestream đang chọn</div>`
                    : ''
            }
        `;
    }

    async function update() {
        if (!_host) return;
        const token = (_seq = _seq + 1);
        try {
            const s = await computeStats(token);
            if (!s || token !== _seq) return; // stale
            render(s);
        } catch (e) {
            /* giữ nội dung cũ nếu lỗi */
        }
    }

    function scheduleUpdate(delay) {
        clearTimeout(_debounce);
        _debounce = setTimeout(update, typeof delay === 'number' ? delay : 400);
    }

    function mount(hostEl) {
        _host = typeof hostEl === 'string' ? document.getElementById(hostEl) : hostEl;
        if (!_host) return;
        // Skeleton ban đầu (chưa có data).
        render({
            comments: 0,
            views: 0,
            likes: 0,
            shares: 0,
            phones: 0,
            orders: 0,
            hidden: 0,
            posts: 0,
            living: false,
        });
        update();
    }

    global.LiveStatsPanel = { mount, update, scheduleUpdate };
})(typeof window !== 'undefined' ? window : globalThis);
