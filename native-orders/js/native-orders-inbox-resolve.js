// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — phone→Pancake conversation resolve + customer search + avatar hydrate + conv row html. MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

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

    NO._fetchConvsMerged = async function _fetchConvsMerged(pageIds, limitPerPage) {
        if (!pageIds.length) return { ok: false, reason: 'no_pages', conversations: [] };
        const settled = await Promise.allSettled(
            pageIds.map((pid) =>
                window.Web2Chat.fetchConversationsByPage(pid, { limit: limitPerPage })
            )
        );
        const all = [];
        for (const r of settled) {
            if (r.status !== 'fulfilled' || !r.value?.ok) continue;
            for (const c of r.value.conversations || []) all.push(c);
        }
        // Dedupe by conv id (a customer might appear in multiple pages
        // under different conv IDs — that's fine, two rows). Sort by
        // updated_at desc, top 50 to mirror the single-page cap.
        const byId = new Map();
        for (const c of all) {
            const k = String(c.id || '');
            if (!k) continue;
            const cur = byId.get(k);
            if (!cur) {
                byId.set(k, c);
                continue;
            }
            const t1 = new Date(c.updated_at || c.last_sent_at || 0).getTime();
            const t2 = new Date(cur.updated_at || cur.last_sent_at || 0).getTime();
            if (t1 > t2) byId.set(k, c);
        }
        const merged = [...byId.values()].sort((a, b) => {
            const ta = new Date(a.updated_at || a.last_sent_at || 0).getTime();
            const tb = new Date(b.updated_at || b.last_sent_at || 0).getTime();
            return tb - ta;
        });
        return { ok: true, conversations: merged.slice(0, 50) };
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
                let r = null;
                try {
                    r = await NO._resolveInboxConvByPhone(phone);
                } catch {
                    /* tolerate */
                }
                if (!r || !r.fbId) continue;
                const o = NO.STATE.orders.find((x) => x.code === code);
                if (o) {
                    // Giữ fb id thật nếu đã có; bỏ qua giá trị rác (vd sentinel).
                    o.fbUserId = NO._isRealFbId(o.fbUserId) ? o.fbUserId : r.fbId;
                    o.fbPageId = o.fbPageId || r.pageId;
                }
                wrap.dataset.fbUserId = r.fbId;
                wrap.dataset.fbPageId = r.pageId;
                const av = wrap.querySelector('.cust-avatar');
                if (av && !av.querySelector('.cust-avatar-img')) {
                    const url = r.avatarUrl || NO._avatarUrl(r.fbId, r.pageId);
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

    /**
     * Format any timestamp as `HH:mm` in GMT+7 (Asia/Ho_Chi_Minh).
     *
     * Pancake's API returns timestamps like `"2026-05-15T03:03:57.107000"`
     * — ISO-shaped but WITHOUT a 'Z' suffix or offset. Per the ECMAScript
     * spec, JS parses a date-time without a timezone as **local time**, so
     * a browser in GMT+7 would record this as 03:03 GMT+7 (= 20:03 UTC
     * the day before). Pancake actually stores them in UTC, so we
     * normalise by appending 'Z' when the input is a string with no
     * explicit offset.
     */
    NO._fmtVnTime = function _fmtVnTime(ts) {
        if (!ts) return '';
        let parseInput = ts;
        if (typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(ts)) {
            const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(ts);
            if (!hasZone) parseInput = ts + 'Z';
        }
        const d = new Date(parseInput);
        if (Number.isNaN(d.getTime())) return '';
        try {
            return d.toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Ho_Chi_Minh',
            });
        } catch {
            return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        }
    };

    NO._convRowHtml = function _convRowHtml(c, currentOrder) {
        const cust = c.customers?.[0] || c.from || {};
        const fbId = String(cust.fb_id || cust.id || c.from_customer_id || '');
        const cName = cust.name || cust.full_name || 'Khách';
        const lastMsg =
            (c.last_message?.message || c.last_message_text || c.snippet || '').slice(0, 120) ||
            '(không có nội dung)';
        const updated = c.updated_at || c.last_sent_at || c.inserted_at;
        const time = NO._fmtVnTime(updated);
        const isActive =
            String(currentOrder.fbUserId || '') === fbId &&
            String(currentOrder.fbPageId || '') === String(c.page_id || c.fb_page_id || '');
        const unread = c.unread_count || c.unread || 0;
        const tagList = Array.isArray(c.tags) ? c.tags : [];
        const tagCount = tagList.length;
        const tagIdsStr = tagList.map((t) => String(t)).join(',');
        const hasPhone = c.has_phone === true ? 1 : 0;
        const hasLive = c.has_livestream_order === true ? 1 : 0;
        // "Đã trả lời" = tin cuối do admin/page gửi. Pancake lưu
        // last_sent_by.admin_name khi admin reply; fallback so sánh id với
        // page_id (admin gửi qua page-level token, id sẽ là page_id).
        const lsb = c.last_sent_by || {};
        const repliedByAdmin =
            !!lsb.admin_name || (lsb.id && String(lsb.id) === String(c.page_id || ''));
        const replied = repliedByAdmin ? 1 : 0;
        // Avatar fetch needs the conv's OWN page id — sidebar is now
        // multi-page so House/Store rows coexist. Hardcoding
        // currentOrder.fbPageId (the modal opener) breaks the avatar
        // for every row coming from a different page.
        const rowPageId = String(c.page_id || c.fb_page_id || currentOrder.fbPageId || '');
        const avatarUrl =
            c.from?.avatar_url ||
            cust.avatar_url ||
            (fbId && rowPageId ? NO._avatarUrl(fbId, rowPageId) : '');
        const initial = (cName || '?').trim().charAt(0).toUpperCase();
        const avatarHtml = avatarUrl
            ? `<img class="w2-inbox-conv-avatar" src="${NO.escapeHtml(avatarUrl)}" alt="${NO.escapeHtml(cName)}" loading="lazy" onerror="this.outerHTML='<div class=&quot;w2-inbox-conv-avatar&quot; style=&quot;display:flex;align-items:center;justify-content:center;color:#64748b;font-weight:700;&quot;>${NO.escapeHtml(initial)}</div>'" />`
            : `<div class="w2-inbox-conv-avatar" style="display:flex;align-items:center;justify-content:center;color:#64748b;font-weight:700;">${NO.escapeHtml(initial)}</div>`;
        return `<div class="w2-inbox-conv ${isActive ? 'is-active' : ''} ${unread ? 'is-unread' : ''}" data-fb-id="${NO.escapeHtml(fbId)}" data-c-name="${NO.escapeHtml(cName)}" data-conv-id="${NO.escapeHtml(c.id || '')}" data-page-id="${NO.escapeHtml(rowPageId)}" data-tag-count="${tagCount}" data-tag-ids="${NO.escapeHtml(tagIdsStr)}" data-has-phone="${hasPhone}" data-has-live="${hasLive}" data-replied="${replied}">
            ${avatarHtml}
            <div class="w2-inbox-conv-body">
                <div class="w2-inbox-conv-top">
                    <span class="w2-inbox-conv-name">${NO.escapeHtml(cName)}</span>
                    <span class="w2-inbox-conv-time">${NO.escapeHtml(time)}</span>
                </div>
                <div class="w2-inbox-conv-preview">${NO.escapeHtml(lastMsg)}</div>
            </div>
            ${unread ? `<span class="w2-inbox-conv-badge" title="${unread} chưa đọc"></span>` : ''}
        </div>`;
    };
})();
