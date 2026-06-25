// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Live Comment List — STATE module. Nguồn dữ liệu hiển thị (filter người-ẩn, cap
 * render), badge tổng comment/đơn, infinite-scroll sentinel, append batch cũ hơn,
 * row signature, drag-defer flush. Tách MOVE-only từ live-comment-list.js. Load
 * SAU base (cần window._LiveCmtList) + TRƯỚC actions/render gọi các method này.
 */
(function () {
    'use strict';
    const NS = window._LiveCmtList;
    const RENDER_LIMIT_INITIAL = NS.RENDER_LIMIT_INITIAL;
    const RENDER_LIMIT_STEP = NS.RENDER_LIMIT_STEP;

    Object.assign(window.LiveCommentList, {
        /**
         * Toàn bộ comment SAU filter người-ẩn, TRƯỚC cap render. Đây là nguồn DUY
         * NHẤT cho mọi đường render (full render / infinite-scroll append / SSE
         * prepend) — 3H7: trước đây _appendOlderBatch + prependComments đọc
         * state.comments thô → người-ẩn lọt DOM + offset lệch gây dòng trùng khi cuộn.
         * @returns {Array}
         */
        _filteredAll() {
            let all = window.LiveState.comments || [];
            if (window.LiveHiddenCommenters?.list?.()?.length) {
                all = all.filter((c) => !window.LiveHiddenCommenters.isHidden(c));
            }
            return all;
        },

        /**
         * Danh sách comment HIỂN THỊ (cap N mới nhất). Comments đã sort newest-first.
         * @returns {Array}
         */
        _visibleComments() {
            // Ẩn comment theo NGƯỜI (LiveHiddenCommenters — mặc định 2 page shop).
            // Comment vẫn nguyên trong state, bỏ ẩn là hiện lại ngay không cần refetch.
            const all = this._filteredAll();
            // Tổng comment SAU khi trừ người bị ẩn, TRƯỚC cap render — cho badge
            // "💬 N" topbar (user 2026-06-11: "hiện tổng comment ngoại trừ ẩn").
            this._totalAfterHidden = all.length;
            const lim = this._renderLimit || RENDER_LIMIT_INITIAL;
            return lim >= all.length ? all : all.slice(0, lim);
        },

        /**
         * Badge "💬 N" trên topbar (#liveTopbarActions) — tổng comment của các
         * livestream đang chọn, KHÔNG tính comment của người bị ẩn (mặc định 2
         * page shop). Cập nhật mỗi lần render dispatch.
         */
        _updateTotalBadge() {
            const slot = document.getElementById('liveTopbarActions');
            if (!slot) return;
            let el = document.getElementById('liveCommentTotal');
            if (!el) {
                el = document.createElement('span');
                el.id = 'liveCommentTotal';
                el.title = 'Tổng comment livestream (không tính người bị ẩn 🙈)';
                el.style.cssText =
                    'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;font-size:12px;font-weight:700;color:#1d4ed8;white-space:nowrap;flex-shrink:0;';
                slot.insertBefore(el, slot.firstChild);
            }
            const n = this._totalAfterHidden ?? (window.LiveState.comments || []).length;
            el.innerHTML = `💬 ${n.toLocaleString('vi-VN')}`; // fallback tức thì (số đã load)
            // Tổng comment THẬT từ Pancake (comment_count của post đang xem) — async, override.
            this._updateRealCommentTotal();

            // Badge "🛒 N đơn" — số đơn web đã tạo trong (các) livestream đang chọn.
            let oel = document.getElementById('liveOrderTotal');
            if (!oel) {
                oel = document.createElement('span');
                oel.id = 'liveOrderTotal';
                oel.title = 'Số giỏ hàng đã tạo trong (các) livestream đang chọn';
                oel.style.cssText =
                    'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;font-size:12px;font-weight:700;color:#15803d;white-space:nowrap;flex-shrink:0;';
                // Chèn ngay SAU badge comment.
                if (el.nextSibling) slot.insertBefore(oel, el.nextSibling);
                else slot.appendChild(oel);
            }
            oel.innerHTML = `🛒 ${this._orderCount().toLocaleString('vi-VN')} giỏ hàng`;

            // Bảng "Thông tin Livestream" (cột Video) — cập nhật theo cùng nhịp
            // render comment (event-driven, debounce nội bộ, KHÔNG poller).
            window.LiveStatsPanel?.scheduleUpdate?.();
        },

        /**
         * Tổng comment THẬT trên Pancake = tổng `comment_count` các bài live đang xem
         * (distinct post_id của comment đã load). Fetch TRỰC TIẾP Pancake qua Web2Chat
         * (không poller), cache 60s/page. Override badge khi có (giữ số đã-load làm fallback).
         */
        async _updateRealCommentTotal() {
            if (!window.Web2Chat?.fetchLivePosts) return;
            const comments = (window.LiveState && window.LiveState.comments) || [];
            const byPage = new Map(); // pageId -> Set(postId)
            for (const c of comments) {
                const pid = String(c._pageId || c.page_id || '');
                const post = String(c.post_id || c._postId || '');
                if (!pid || !post) continue;
                if (!byPage.has(pid)) byPage.set(pid, new Set());
                byPage.get(pid).add(post);
            }
            if (!byPage.size) return;
            const token = (this._realTotalSeq = (this._realTotalSeq || 0) + 1); // chống race
            let total = 0;
            let any = false;
            for (const [pid, postSet] of byPage) {
                const r = await window.Web2Chat.fetchLivePosts(pid);
                if (!r || !r.ok) continue;
                const map = new Map(r.posts.map((p) => [p.postId, p.commentCount]));
                for (const post of postSet) {
                    if (map.has(post)) {
                        total += map.get(post) || 0;
                        any = true;
                    }
                }
            }
            if (!any || token !== this._realTotalSeq) return; // stale → bỏ
            const el = document.getElementById('liveCommentTotal');
            if (el) {
                el.innerHTML = `💬 ${total.toLocaleString('vi-VN')}`;
                el.title = 'Tổng comment thật trên Pancake (các livestream đang xem)';
            }
        },

        /**
         * Số ĐƠN web (native-orders) đã tạo trong (các) livestream đang chọn = số mã đơn
         * NATIVE_WEB DUY NHẤT của các comment đang hiển thị (state.comments). 1 khách =
         * 1 đơn (sessionIndexMap theo fromId), đếm distinct code để không trùng.
         * @returns {number}
         */
        _orderCount() {
            const state = window.LiveState;
            const map = state.sessionIndexMap;
            if (!map || !map.size) return 0;
            const orders = new Set();
            for (const c of state.comments || []) {
                const fromId = c.from?.id;
                if (!fromId) continue;
                const raw = map.get(fromId);
                if (raw && raw.source === 'NATIVE_WEB' && raw.code) orders.add(raw.code);
            }
            return orders.size;
        },

        /**
         * Reset cap về mặc định (gọi khi đổi tập comment — chọn campaign khác).
         */
        resetRenderLimit() {
            this._renderLimit = RENDER_LIMIT_INITIAL;
        },

        /**
         * Có nên fade dòng comment MỚI không? Flow thường → có (fade opacity thuần, dịu).
         * BURST (dồn dập) → KHÔNG → hiện tức thì, tránh 30 fade chồng = nháy. Burst = 1
         * batch > 5 dòng, HOẶC > 12 dòng fade trong 2s gần đây.
         * @param {number} batchN
         * @returns {boolean}
         */
        _shouldAnimateNew(batchN) {
            if (batchN > 5) return false;
            const now = Date.now();
            this._animTimes = (this._animTimes || []).filter((t) => now - t < 2000);
            if (this._animTimes.length >= 12) return false;
            for (let i = 0; i < batchN; i++) this._animTimes.push(now);
            return true;
        },

        /**
         * Inject pill số dư ví Web 2.0 ([data-w2wallet-phone] → "Ví: X₫") sau mỗi
         * render. Idempotent (Web2WalletBalance skip element đã done). Thay "Nợ Live".
         */
        _attachWalletBalances() {
            const list = document.getElementById('liveCommentList');
            if (list && window.Web2WalletBalance?.attachBalances) {
                window.Web2WalletBalance.attachBalances(list);
            }
        },

        /**
         * Infinite scroll: cuộn gần đáy list → tự load thêm RENDER_LIMIT_STEP comment
         * cũ hơn. Dùng IntersectionObserver trên sentinel ở cuối (không scroll handler
         * churn). Append batch mới TRƯỚC sentinel → giữ nguyên các dòng đã có + vị trí
         * scroll, KHÔNG rebuild toàn list.
         */
        _ensureScrollSentinel() {
            const list = document.getElementById('liveCommentList');
            if (!list) return;
            const lim = this._renderLimit || RENDER_LIMIT_INITIAL;
            // Đếm theo danh sách ĐÃ lọc người-ẩn (3H7) — đếm raw làm sentinel sống
            // mãi dù hết comment hiển thị.
            const hasMore = this._filteredAll().length > lim;
            let sentinel = document.getElementById('liveScrollSentinel');
            if (!hasMore) {
                if (sentinel) sentinel.remove();
                this._scrollObserver?.disconnect();
                return;
            }
            if (!sentinel) {
                sentinel = document.createElement('div');
                sentinel.id = 'liveScrollSentinel';
                sentinel.style.cssText = 'height:1px;width:100%;';
            }
            // Luôn để sentinel ở cuối.
            if (list.lastElementChild !== sentinel) list.appendChild(sentinel);
            // Wire observer (root = list scroll container, prefetch trước 400px).
            // Nếu list bị rebuild (renderContainer) → root cũ detached → tạo lại.
            if (this._scrollObserver && this._scrollObserver.root !== list) {
                this._scrollObserver.disconnect();
                this._scrollObserver = null;
            }
            if (!this._scrollObserver) {
                this._scrollObserver = new IntersectionObserver(
                    (entries) => {
                        if (entries.some((e) => e.isIntersecting)) this._appendOlderBatch();
                    },
                    { root: list, rootMargin: '0px 0px 400px 0px' }
                );
            }
            // LUÔN disconnect trước khi observe — tránh observe trùng/sentinel cũ.
            this._scrollObserver.disconnect();
            this._scrollObserver.observe(sentinel);
        },

        /**
         * Append batch comment cũ hơn (RENDER_LIMIT_STEP) vào cuối, trước sentinel.
         * Không rebuild list → giữ scroll + dòng cũ. Chunked để không block.
         */
        _appendOlderBatch() {
            if (this._loadingOlder) return;
            const list = document.getElementById('liveCommentList');
            if (!list) return;
            const oldLim = this._renderLimit || RENDER_LIMIT_INITIAL;
            // 3H7: slice trên danh sách ĐÃ lọc người-ẩn — cùng nguồn với
            // _visibleComments, offset khớp → không lọt người ẩn / không dòng trùng.
            const all = this._filteredAll();
            if (oldLim >= all.length) {
                this._ensureScrollSentinel();
                return;
            }
            this._loadingOlder = true;
            const newLim = Math.min(oldLim + RENDER_LIMIT_STEP, all.length);
            const batch = all.slice(oldLim, newLim);
            const sentinel = document.getElementById('liveScrollSentinel');
            const schedule = (cb) => setTimeout(cb, 0);
            const CHUNK = 25;
            // Generation token: full re-render (renderCommentsNow) bump _renderGen →
            // batch đang chạy trên DOM/slice cũ phải ABORT, tránh chèn row stale.
            const gen = (this._renderGen = this._renderGen || 0);
            let i = 0;
            const step = () => {
                if (gen !== this._renderGen) {
                    // List đã bị full re-render giữa chừng → bỏ batch này.
                    this._loadingOlder = false;
                    return;
                }
                const parts = [];
                const end = Math.min(i + CHUNK, batch.length);
                for (; i < end; i++) parts.push(this.renderCommentItem(batch[i]));
                const html = parts.join('');
                if (sentinel && sentinel.parentNode === list) {
                    sentinel.insertAdjacentHTML('beforebegin', html);
                } else {
                    list.insertAdjacentHTML('beforeend', html);
                }
                if (i < batch.length) {
                    schedule(step);
                } else {
                    this._renderLimit = newLim;
                    this._loadingOlder = false;
                    this._ensureScrollSentinel(); // re-observe (hoặc gỡ nếu hết)
                    this._attachWalletBalances();
                }
            };
            schedule(step);
        },
    });
})();
