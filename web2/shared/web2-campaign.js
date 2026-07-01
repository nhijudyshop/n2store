// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared.
// =====================================================
// Web2Campaign — NGUỒN DUY NHẤT cho "chiến dịch livestream" (chiến dịch CHA).
//
// Gom logic chiến dịch từng FORK rời ở live-chat (LiveCampaignManager) +
// native-orders (native-orders-filters-campaigns) về 1 client dùng chung. Mọi
// trang cần chiến dịch (live-chat, native-orders, live-tv, live-control) gọi
// module này — KHÔNG tự fetch /api/web2-live-comments/campaigns nữa.
//
// 1 chiến dịch CHA = web2_live_parent_campaigns. Có thể gom:
//   • BÀI livestream  → /api/web2-live-comments (đã có)
//   • SẢN PHẨM        → /api/web2-campaign-products (mới — cho trang TV)
//
// ⚠ "campaign" có 3 nghĩa — module này CHỈ là chiến dịch CHA (id BIGSERIAL).
//   KHÔNG phải state.liveCampaigns (video FB) hay native_orders.live_campaign_id.
//
// API (window.Web2Campaign):
//   Campaign:  list() · create(name,note) · remove(id)
//   Bài:       listPosts() · listAssignments() · listPagePosts() · assignPost(cid,{postId,postTitle,pageId}) · unassignPost(postId)
//   Sản phẩm:  listProducts(cid) · addProducts(cid, codes) · removeProduct(cid, code) · reorder(cid, codes) · setPinned(cid, code, pinned)
//   Realtime:  subscribe(cb) → unsub  (SSE web2:live-comments + web2:campaign-products)
//   Helper:    authHeaders(extra)
// =====================================================
(function (global) {
    'use strict';
    if (global.Web2Campaign) return;

    function workerBase() {
        return (
            (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
            (global.WEB2_CONFIG && global.WEB2_CONFIG.WORKER_URL) ||
            (global.LiveState && global.LiveState.workerUrl) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    const LC_BASE = () => `${workerBase()}/api/web2-live-comments`;
    const CP_BASE = () => `${workerBase()}/api/web2-campaign-products`;

    function authHeaders(extra) {
        const h = Object.assign({}, extra || {});
        try {
            if (global.Web2Auth && global.Web2Auth.authHeaders)
                return global.Web2Auth.authHeaders(h);
            const t = JSON.parse(localStorage.getItem('web2_auth') || 'null');
            if (t && t.token) h['x-web2-token'] = t.token;
        } catch (e) {
            /* ignore */
        }
        return h;
    }

    async function _json(url, opts = {}) {
        const res = await fetch(url, {
            ...opts,
            headers: { Accept: 'application/json', ...authHeaders(), ...(opts.headers || {}) },
            signal: opts.signal || (AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined),
        });
        let data = null;
        try {
            data = await res.json();
        } catch (e) {
            /* non-json */
        }
        if (!res.ok) {
            const err = new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
            err.status = res.status;
            err.body = data;
            throw err;
        }
        return data;
    }
    function _post(url, body) {
        return _json(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {}),
        });
    }
    function _patch(url, body) {
        return _json(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {}),
        });
    }

    const Web2Campaign = {
        authHeaders,
        get workerBase() {
            return workerBase();
        },

        // ── Chiến dịch cha ────────────────────────────────────────────
        // → [{ id, name, note, created_at, post_count, comment_count }]
        async list() {
            const j = await _json(`${LC_BASE()}/campaigns`);
            return (j && j.data) || [];
        },
        async create(name, note) {
            const j = await _post(`${LC_BASE()}/campaigns`, { name, note: note || null });
            return j && j.id;
        },
        async remove(id) {
            return _json(`${LC_BASE()}/campaigns/${encodeURIComponent(id)}`, { method: 'DELETE' });
        },

        // ── Bài livestream ⇄ chiến dịch ───────────────────────────────
        async listPosts() {
            const j = await _json(`${LC_BASE()}/posts`);
            return (j && j.data) || [];
        },
        // Trạng thái gán bài→chiến dịch LẤY TỪ BẢNG GÁN (web2_live_post_assign),
        // KHÔNG phụ thuộc comment. listPosts() chỉ trả post CÒN comment trong
        // web2_live_comments → live CŨ mất comment hiện "chưa gom" dù đã gom. Dùng
        // hàm này cho picker để hiển thị đúng. → [{ post_id, campaign_id, ... }]
        async listAssignments() {
            const j = await _json(`${LC_BASE()}/assignments`);
            return (j && j.data) || [];
        },
        // Bài (post_id) đã gán vào 1 chiến dịch cha → [postId]. Dùng cho bộ lọc mọi
        // trang: chiến dịch → tập bài → lọc native_orders theo fb_post_id ∈ tập này.
        // Nguồn-sự-thật = web2_live_post_assign (độc lập comment). Fallback listPosts
        // (comment-driven) khi backend chưa có /assignments (deploy gap).
        async postsForCampaign(campaignId) {
            const cid = String(campaignId);
            try {
                const a = await this.listAssignments();
                return (a || [])
                    .filter((p) => String(p.campaign_id) === cid)
                    .map((p) => String(p.post_id));
            } catch (e) {
                const posts = await this.listPosts();
                return (posts || [])
                    .filter((p) => String(p.campaign_id) === cid)
                    .map((p) => String(p.post_id));
            }
        },
        async listPagePosts() {
            const j = await _json(`${LC_BASE()}/page-posts`);
            return (j && j.data) || [];
        },
        async assignPost(campaignId, { postId, postTitle, pageId } = {}) {
            return _post(`${LC_BASE()}/campaigns/${encodeURIComponent(campaignId)}/assign`, {
                postId,
                postTitle,
                pageId,
            });
        },
        async unassignPost(postId) {
            return _post(`${LC_BASE()}/unassign`, { postId });
        },

        // ── Sản phẩm ⇄ chiến dịch (cho trang TV) ──────────────────────
        // → [{ code, name, imageUrl, stock, pendingQty, status, supplier, variant,
        //      sort, pinned, missing, sold, newCust }]
        // opts.sync=true (chỉ live-control gửi) → server auto-add SP chờ hàng (Sổ
        // Order) lên board, mới nhất trên đầu. TV gọi KHÔNG sync (read-only).
        async listProducts(campaignId, opts) {
            const sync = opts && opts.sync ? '&sync=1' : '';
            const j = await _json(
                `${CP_BASE()}/?campaignId=${encodeURIComponent(campaignId)}${sync}`
            );
            return (j && j.items) || [];
        },
        async addProducts(campaignId, codes) {
            const arr = Array.isArray(codes) ? codes : [codes];
            return _post(`${CP_BASE()}/`, { campaignId, productCodes: arr });
        },
        async removeProduct(campaignId, productCode) {
            return _json(`${CP_BASE()}/`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ campaignId, productCode }),
            });
        },
        async reorder(campaignId, order) {
            return _patch(`${CP_BASE()}/reorder`, { campaignId, order });
        },
        async setPinned(campaignId, productCode, pinned) {
            return _patch(`${CP_BASE()}/pin`, { campaignId, productCode, pinned: !!pinned });
        },
        // "Số NCC báo" tuyệt đối → web2_products.pending_qty + broadcast web2:campaign-products
        // (topic trang TV nghe → cập nhật realtime). KHÔNG dùng adjust-pending (web2:products).
        async setPending(campaignId, productCode, pendingQty) {
            return _patch(`${CP_BASE()}/pending`, {
                campaignId,
                productCode,
                pendingQty: Math.max(0, Math.floor(Number(pendingQty) || 0)),
            });
        },

        // ── Điều khiển màn TV (layout + trang) ────────────────────────
        // getTvControl → { rows, cols, page } (default 1×4 nếu chưa cấu hình).
        // setTvControl(patch) → upsert phần được gửi + broadcast web2:live-tv-control.
        async getTvControl(campaignId) {
            const j = await _json(
                `${CP_BASE()}/control?campaignId=${encodeURIComponent(campaignId)}`
            );
            return (j && j.control) || { rows: 1, cols: 4, page: 0 };
        },
        // Chi tiết giỏ KH của 1 SP (đơn draft chứa SP) — cho popup GIỎ / KH MỚI.
        // → [{ orderCode, stt, customerName, phone, address, fbId, fbName, qty,
        //      isNewCust, avatar, comment }] (avatar+comment từ web2_live_comments).
        async getCartDetail(code, opts) {
            // opts.campaignId → backend áp CÙNG gate phiên-live như board (số GIỎ popup
            // khớp board); opts.mode='new' → backend strip PII row non-new. Thiếu → global.
            let qs = `code=${encodeURIComponent(code)}`;
            const cid = opts && opts.campaignId;
            if (cid != null && cid !== '' && Number.isFinite(Number(cid)))
                qs += `&campaignId=${encodeURIComponent(cid)}`;
            if (opts && opts.mode) qs += `&mode=${encodeURIComponent(opts.mode)}`;
            const j = await _json(`${CP_BASE()}/cart-detail?${qs}`);
            return (j && j.items) || [];
        },
        async setTvControl(campaignId, patch) {
            const j = await _patch(
                `${CP_BASE()}/control?campaignId=${encodeURIComponent(campaignId)}`,
                patch || {}
            );
            return (j && j.control) || null;
        },

        // ── Realtime ──────────────────────────────────────────────────
        // cb({ topic, eventType, data }). Subscribe CẢ 2 topic: chiến dịch (bài) +
        // SP-trong-chiến-dịch. Trả hàm unsubscribe gộp.
        subscribe(cb) {
            if (!global.Web2SSE || !global.Web2SSE.subscribe) {
                console.warn('[Web2Campaign] Web2SSE chưa load — bỏ realtime');
                return function () {};
            }
            const u1 = global.Web2SSE.subscribe('web2:live-comments', (msg) =>
                cb({ topic: 'web2:live-comments', ...msg })
            );
            const u2 = global.Web2SSE.subscribe('web2:campaign-products', (msg) =>
                cb({ topic: 'web2:campaign-products', ...msg })
            );
            return function () {
                try {
                    u1 && u1();
                } catch (e) {}
                try {
                    u2 && u2();
                } catch (e) {}
            };
        },
    };

    global.Web2Campaign = Web2Campaign;
})(typeof window !== 'undefined' ? window : globalThis);
