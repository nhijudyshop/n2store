// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — phone→Pancake conversation resolve + customer search + avatar hydrate.
// Live consumers: inbox-add.js (_resolveInboxConvByPhone, _searchPancakeCustomers),
// render.js (_hydrateInboxAvatars). The old chat-modal engine that used the conv-row /
// merge / time helpers was removed (chat unified into Web2CustomerChat 2026-06-19).

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    /**
     * Pancake avatar proxy URL. Relocated here from the deleted
     * native-orders-message-render.js — the only remaining live consumer is
     * `_hydrateInboxAvatars` below (inbox tab avatar resolve).
     */
    NO._avatarUrl = function _avatarUrl(fbId, pageId) {
        // pageId TÙY CHỌN: avatar vẫn lấy được chỉ với fbId (giống renderAvatar) →
        // hiện được avatar đơn Inbox khi chỉ có fbId từ kho KH (không có page).
        if (!fbId) return '';
        const base =
            window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        const jwt = window.Web2Chat?.getJwt() || '';
        const params = new URLSearchParams({ id: fbId });
        if (pageId) params.set('page', pageId);
        if (jwt) params.set('token', jwt);
        return `${base}/api/fb-avatar?${params.toString()}`;
    };

    // Lấy fbId của KH từ KHO web2_customers theo SĐT (LOCAL — không cần đăng nhập
    // Pancake). Dùng cho hydrate avatar đơn Inbox: kho trước, Pancake sau.
    NO._khoFbByPhone = async function _khoFbByPhone(phone) {
        const p = String(phone || '').trim();
        if (!p) return null;
        const base =
            window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        try {
            // /customers/:phone là route auth-gated (PII) → gửi x-web2-token. (audit 2026-06-30)
            let w2Headers = {};
            if (window.Web2Auth?.authHeaders) {
                w2Headers = window.Web2Auth.authHeaders();
            } else {
                try {
                    const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
                    if (t) w2Headers = { 'x-web2-token': t };
                } catch {
                    /* no token */
                }
            }
            const r = await fetch(`${base}/api/web2/customers/${encodeURIComponent(p)}`, {
                headers: w2Headers,
            });
            const j = await r.json();
            const c = j && (j.customer || j.data);
            const fbId = c && (c.fbId || c.fb_id);
            return fbId ? { fbId: String(fbId), name: c.name || '' } : null;
        } catch {
            return null;
        }
    };

    /**
     * Pull the conversation list and render rows into the sidebar.
     *
     * Multi-page: fetch from EVERY page the user has a JWT for (House,
     * Store, … in localStorage `pancake_all_accounts`) so the sidebar
     * isn't artificially scoped to the order's page. The WS handler
     * already accepts cross-page events, so this just brings the
     * initial list (and fallback poll) in line with realtime coverage.
     * Highlights the row that matches the currently-open order's customer.
     */
    NO._getSidebarPageIds = function _getSidebarPageIds(order) {
        const set = new Set();
        if (order && order.fbPageId) set.add(String(order.fbPageId));
        // Every page across every saved account — covers House + Store
        // even when `Web2Chat.getAllPageAccessTokens` only has 1 page.
        try {
            const accs = JSON.parse(localStorage.getItem('pancake_all_accounts') || '{}');
            for (const v of Object.values(accs)) {
                const pages = Array.isArray(v?.pages) ? v.pages : [];
                for (const p of pages) {
                    const pid = p?.id || p?.page_id || p?.pageId;
                    if (pid) set.add(String(pid));
                }
            }
        } catch {
            /* tolerate; fall back to order.fbPageId only */
        }
        // Page-access-token map is a useful secondary source when the
        // multi-account JSON is empty (older installs).
        const pat = window.Web2Chat?.getAllPageAccessTokens?.() || {};
        for (const k of Object.keys(pat)) set.add(String(k));
        return [...set].filter(Boolean);
    };

    // ============ INBOX-ONLY: resolve hội thoại Pancake theo SĐT ============
    // Đơn inbox tay thường CHƯA có fb_id (khác đơn livestream — luôn có sẵn
    // fbUserId/fbPageId). Khi chỉ có SĐT, search hội thoại Pancake theo SĐT để
    // lấy psid + page + avatar → hiện avatar ở list + mở đúng đoạn hội thoại.
    // KHÔNG đụng logic đơn livestream: các nhánh dùng helper này đều gate bằng
    // "order thiếu fbPageId" (đơn livestream luôn có fbPageId → không bao giờ vào).
    NO._inboxPhoneCache = new Map();
    // normPhone -> Promise|resolved|null

    NO._normPhone = function _normPhone(p) {
        let s = String(p || '').replace(/\D/g, '');
        if (!s) return '';
        if (s.length === 11 && s.startsWith('84')) s = '0' + s.slice(2);
        else if (!s.startsWith('0') && s.length >= 9) s = '0' + s.slice(-9);
        return s;
    };

    NO._resolveInboxConvByPhone = async function _resolveInboxConvByPhone(phone) {
        const norm = NO._normPhone(phone);
        if (!norm || norm.length < 8) return null;
        const cached = NO._inboxPhoneCache.get(norm);
        if (cached !== undefined) return cached; // promise hoặc value (kể cả null đã cache)
        const job = (async () => {
            if (!window.Web2Chat?.searchConversations) return null;
            if (window.Web2Chat.syncFromRenderDB) {
                try {
                    await window.Web2Chat.syncFromRenderDB();
                } catch {
                    /* tolerate */
                }
            }
            const pageIds = NO._getSidebarPageIds({});
            if (!pageIds.length) return null;
            const settled = await Promise.allSettled(
                pageIds.map((pid) => window.Web2Chat.searchConversations(pid, norm))
            );
            let best = null;
            const tail9 = norm.slice(-9);
            for (let i = 0; i < settled.length; i++) {
                const r = settled[i];
                if (r.status !== 'fulfilled' || !r.value?.ok) continue;
                const convs = r.value.conversations || [];
                for (const c of convs) {
                    const cust = c.customers?.[0] || c.from || {};
                    const cphone = NO._normPhone(cust.phone || cust.phone_number || '');
                    const phoneMatch = cphone && (cphone === norm || cphone.endsWith(tail9));
                    // Nhiều kết quả mà SĐT không khớp → bỏ (tránh nhận nhầm khách khác).
                    if (!phoneMatch && convs.length > 1) continue;
                    const fbId = String(cust.fb_id || cust.id || c.from_customer_id || '');
                    if (!fbId) continue;
                    const isInbox = (c.type || '').toUpperCase() === 'INBOX';
                    const cand = {
                        fbId,
                        pageId: String(c.page_id || c.fb_page_id || pageIds[i] || ''),
                        conversationId: c.id || null,
                        name: cust.name || cust.full_name || c.name || '',
                        avatarUrl: c.from?.avatar_url || cust.avatar_url || '',
                        phoneMatch: !!phoneMatch,
                        isInbox,
                    };
                    // Ưu tiên: SĐT khớp > INBOX type > kết quả đầu.
                    if (
                        !best ||
                        (cand.phoneMatch && !best.phoneMatch) ||
                        (cand.phoneMatch === best.phoneMatch && cand.isInbox && !best.isInbox)
                    ) {
                        best = cand;
                    }
                }
            }
            return best;
        })();
        NO._inboxPhoneCache.set(norm, job);
        const res = await job;
        // Cache giá trị thật. Nếu KHÔNG tìm thấy → xoá khỏi cache để lần sau (vd
        // sau khi token sẵn sàng / mở chat) có thể thử lại.
        if (res) NO._inboxPhoneCache.set(norm, res);
        else NO._inboxPhoneCache.delete(norm);
        return res;
    };

    // ============ Tìm KHÁCH qua Pancake theo tên / SĐT (cho modal Thêm đơn) ====
    // Trả về DANH SÁCH ứng viên hội thoại Pancake khớp `query` (tên / SĐT / nội
    // dung tin) trên MỌI page user có token. Mỗi ứng viên đã đủ fb context để gửi
    // tin nhắn: { fbId(psid), pageId, conversationId, name, phone, avatarUrl,
    // isInbox }. Dùng để đơn inbox tạo tay cũng "nhắn được" như đơn live-chat.
    NO._searchPancakeCustomers = async function _searchPancakeCustomers(query, { signal } = {}) {
        const q = String(query || '').trim();
        if (!q || !window.Web2Chat?.searchConversations) return [];
        if (window.Web2Chat.syncFromRenderDB) {
            try {
                await window.Web2Chat.syncFromRenderDB();
            } catch {
                /* tolerate — vẫn thử search với token đang có */
            }
        }
        const pageIds = NO._getSidebarPageIds({});
        if (!pageIds.length) return [];
        const settled = await Promise.allSettled(
            pageIds.map((pid) => window.Web2Chat.searchConversations(pid, q, { signal }))
        );
        // Gom theo fbId (1 KH có thể xuất hiện nhiều page / nhiều conv). Ưu tiên
        // conv INBOX (nhắn tin được 24h) + có SĐT.
        const byFbId = new Map();
        for (let i = 0; i < settled.length; i++) {
            const r = settled[i];
            if (r.status !== 'fulfilled' || !r.value?.ok) continue;
            for (const c of r.value.conversations || []) {
                const cust = c.customers?.[0] || c.from || {};
                const fbId = String(cust.fb_id || cust.id || c.from_customer_id || '');
                if (!fbId) continue;
                const isInbox = (c.type || '').toUpperCase() === 'INBOX';
                const phone = cust.phone || cust.phone_number || '';
                const cand = {
                    fbId,
                    pageId: String(c.page_id || c.fb_page_id || pageIds[i] || ''),
                    conversationId: c.id || null,
                    name: cust.name || cust.full_name || c.name || '',
                    phone,
                    avatarUrl: c.from?.avatar_url || cust.avatar_url || '',
                    isInbox,
                };
                const cur = byFbId.get(fbId);
                if (
                    !cur ||
                    (cand.isInbox && !cur.isInbox) ||
                    (cand.isInbox === cur.isInbox && cand.phone && !cur.phone)
                ) {
                    byFbId.set(fbId, cand);
                }
            }
        }
        // INBOX trước (nhắn được), rồi tới có SĐT.
        return [...byFbId.values()]
            .sort(
                (a, b) =>
                    Number(b.isInbox) - Number(a.isInbox) || (b.phone ? 1 : 0) - (a.phone ? 1 : 0)
            )
            .slice(0, 8);
    };

    // Sau khi render danh sách đơn inbox: với các row có SĐT nhưng chưa có fb_id,
    // resolve avatar theo SĐT rồi gắn ảnh + lưu fb context vào order in-memory để
    // mở chat tức thì. Chạy nền (không chặn render). Chỉ chạy ở tab Inbox.
    NO._inboxAvatarHydrating = false;

    NO._hydrateInboxAvatars = async function _hydrateInboxAvatars() {
        if (NO.STATE.channel !== 'web2_inbox' || NO._inboxAvatarHydrating) return;
        const tb = NO.tbody();
        if (!tb) return;
        const wraps = [...tb.querySelectorAll('.web2-customer-avatar-wrap')].filter(
            (w) =>
                !w.dataset.fbUserId &&
                (w.dataset.customerPhone || '').trim() &&
                w.dataset.avatarHydrated !== '1'
        );
        if (!wraps.length) return;
        NO._inboxAvatarHydrating = true;
        try {
            for (const wrap of wraps.slice(0, 40)) {
                wrap.dataset.avatarHydrated = '1';
                const phone = wrap.dataset.customerPhone;
                const code = wrap.closest('tr')?.dataset?.code;
                let fbId = null;
                let pageId = null;
                let avatarUrl = null;
                // 1) KHO KH trước (local, không cần Pancake login) — đủ để hiện avatar.
                try {
                    const k = await NO._khoFbByPhone(phone);
                    if (k && k.fbId) fbId = k.fbId;
                } catch {
                    /* tolerate */
                }
                // 2) Kho không có → Pancake (cần login) để lấy fbId + page + avatar thật.
                if (!fbId) {
                    try {
                        const r = await NO._resolveInboxConvByPhone(phone);
                        if (r && r.fbId) {
                            fbId = r.fbId;
                            pageId = r.pageId;
                            avatarUrl = r.avatarUrl;
                        }
                    } catch {
                        /* tolerate */
                    }
                }
                if (!fbId) continue;
                const o = NO.STATE.orders.find((x) => x.code === code);
                if (o) {
                    // Giữ fb id thật nếu đã có; bỏ qua giá trị rác (vd sentinel).
                    o.fbUserId = NO._isRealFbId(o.fbUserId) ? o.fbUserId : fbId;
                    o.fbPageId = o.fbPageId || pageId;
                }
                wrap.dataset.fbUserId = fbId;
                if (pageId) wrap.dataset.fbPageId = pageId;
                const av = wrap.querySelector('.cust-avatar');
                if (av && !av.querySelector('.cust-avatar-img')) {
                    const url = avatarUrl || NO._avatarUrl(fbId, pageId);
                    if (url) {
                        const initial = av.textContent.trim();
                        av.innerHTML =
                            `<span class="cust-avatar-initial">${NO.escapeHtml(initial)}</span>` +
                            `<img class="cust-avatar-img" src="${NO.escapeHtml(url)}" alt="" loading="lazy" onload="this.classList.add('loaded')" onerror="this.remove()">`;
                    }
                }
            }
        } finally {
            NO._inboxAvatarHydrating = false;
        }
    };
})();
