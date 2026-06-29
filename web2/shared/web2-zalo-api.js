// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — ZaloApi wrapper (/api/web2-zalo).
// =====================================================================
// ZaloApi — wrapper toàn bộ /api/web2-zalo (web2Db). Dual base: CF Worker →
// Render direct fallback. Trang web2/zalo dùng; KHÔNG gọi Zalo API trực tiếp.
// =====================================================================

(function () {
    'use strict';

    const WORKER =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const BASE = WORKER + '/api/web2-zalo';
    const DIRECT = 'https://web2-api-kv04.onrender.com/api/web2-zalo';

    // GLOBAL (2026-06-29): 1 tài khoản Zalo dùng chung cả dự án (bỏ per-máy owner-scoped).
    // owner = hằng số '__global__' → mọi máy tính ra cùng SSE topic + cùng thấy/dùng 1 account.
    // (Server cũng ép _owner='__global__'; header x-web2-zalo-owner chỉ còn để tương thích.)
    const GLOBAL_OWNER = '__global__';
    function _zaloOwner() {
        return GLOBAL_OWNER;
    }
    if (!window.Web2ZaloOwner) window.Web2ZaloOwner = _zaloOwner; // dùng chung (SSE topic)

    function _authHeaders() {
        const h = { 'x-web2-zalo-owner': _zaloOwner() };
        if (window.Web2Auth?.authHeaders) return Object.assign(h, window.Web2Auth.authHeaders());
        try {
            const t =
                window.Web2Auth?.getStored?.()?.token ||
                JSON.parse(localStorage.getItem('web2_auth') || '{}')?.token;
            if (t) h['x-web2-token'] = t;
        } catch {}
        return h;
    }

    async function _fetch(path, options) {
        const opts = options || {};
        opts.headers = Object.assign(
            { Accept: 'application/json', 'Content-Type': 'application/json' },
            _authHeaders(),
            opts.headers || {}
        );
        let lastErr = null;
        for (const base of [BASE, DIRECT]) {
            let res;
            try {
                res = await fetch(base + path, opts);
            } catch (e) {
                lastErr = e; // lỗi mạng/CORS → thử base kế (fallback)
                continue;
            }
            const ct = res.headers.get('content-type') || '';
            const data = ct.includes('application/json') ? await res.json().catch(() => ({})) : {};
            if (res.status >= 500) {
                lastErr = new Error(data.error || `HTTP ${res.status}`);
                continue; // server lỗi → thử fallback base
            }
            // 2xx/4xx có phản hồi rõ ràng → KHÔNG double-hit base kia.
            // Thất bại (4xx HOẶC 200 {success:false}) → throw để caller catch xử lý.
            if (!res.ok || data.success === false) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            return data;
        }
        throw lastErr || new Error('Network error');
    }

    function _qs(params) {
        const sp = new URLSearchParams();
        Object.entries(params || {}).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') sp.set(k, v);
        });
        const s = sp.toString();
        return s ? '?' + s : '';
    }

    window.ZaloApi = {
        // status + accounts
        status() {
            return _fetch('/status', { method: 'GET' });
        },
        accounts() {
            return _fetch('/accounts', { method: 'GET' });
        },
        createAccount(label) {
            return _fetch('/accounts', { method: 'POST', body: JSON.stringify({ label }) });
        },
        // (loginQr/qr/reconnect đã GỠ 2026-06-23 — chỉ đăng nhập bằng phiên chat.zalo.me
        //  trên trình duyệt qua loginCookie. "Kết nối lại" = đăng nhập Zalo lại.)
        disconnect(key) {
            return _fetch(`/accounts/${encodeURIComponent(key)}/disconnect`, { method: 'POST' });
        },
        // Focus-lease: heartbeat giữ phiên khi tab công cụ đang focus. Trả {connected}.
        lease(key) {
            return _fetch(`/accounts/${encodeURIComponent(key)}/lease`, { method: 'POST' });
        },
        // Nhường phiên cho chat.zalo.me khi mất focus / đóng tab.
        release(key) {
            return _fetch(`/accounts/${encodeURIComponent(key)}/release`, { method: 'POST' });
        },
        // Release tin cậy lúc đóng tab (pagehide) — sendBeacon không huỷ khi tab unload.
        // Gửi cả 2 base (worker + direct) cho chắc; owner header đi kèm trong body vì
        // sendBeacon không set custom header → server đọc owner từ body fallback.
        releaseBeacon(key) {
            try {
                const path = `/accounts/${encodeURIComponent(key)}/release`;
                const payload = JSON.stringify({ _owner: _zaloOwner() });
                const blob = new Blob([payload], { type: 'application/json' });
                let ok = false;
                for (const base of [BASE, DIRECT]) {
                    try {
                        ok = navigator.sendBeacon(base + path, blob) || ok;
                    } catch {}
                }
                return ok;
            } catch {
                return false;
            }
        },
        deleteAccount(key) {
            return _fetch(`/accounts/${encodeURIComponent(key)}`, { method: 'DELETE' });
        },
        // (setPrimary đã GỠ 2026-06-23 — per-máy: không có TK chính toàn cục.)
        // Đăng nhập Zalo bằng phiên chat.zalo.me (cookie+imei+userAgent từ extension) — không cần QR.
        loginCookie(key, creds) {
            return _fetch(`/accounts/${encodeURIComponent(key)}/login-cookie`, {
                method: 'POST',
                body: JSON.stringify(creds),
            });
        },
        // Bắt đầu đăng nhập QR — server đẩy sự kiện QR (ảnh/đã quét/hết hạn/thành công)
        // qua SSE topic web2:zalo:qr:<key>. Trả {started:true, topic}.
        loginQr(key) {
            return _fetch(`/accounts/${encodeURIComponent(key)}/login-qr`, { method: 'POST' });
        },
        self(key) {
            return _fetch(`/accounts/${encodeURIComponent(key)}/self`, { method: 'GET' });
        },
        friends(key) {
            return _fetch(`/accounts/${encodeURIComponent(key)}/friends`, { method: 'GET' });
        },
        groups(key) {
            return _fetch(`/accounts/${encodeURIComponent(key)}/groups`, { method: 'GET' });
        },
        // lookup người khác
        lookup({ accountKey, phone, uid }) {
            return _fetch('/lookup' + _qs({ accountKey, phone, uid }), { method: 'GET' });
        },
        // conversations + messages
        syncConversations(key) {
            return _fetch(`/accounts/${encodeURIComponent(key)}/sync-conversations`, {
                method: 'POST',
            });
        },
        conversations(params) {
            return _fetch('/conversations' + _qs(params), { method: 'GET' });
        },
        messages(convId, limit, before) {
            return _fetch(
                `/conversations/${encodeURIComponent(convId)}/messages` + _qs({ limit, before }),
                { method: 'GET' }
            );
        },
        loadHistory(convId, { limit, before, beforeId } = {}) {
            return _fetch(
                `/conversations/${encodeURIComponent(convId)}/messages` +
                    _qs({ limit, before, beforeId }),
                { method: 'GET' }
            );
        },
        // Kéo lịch sử nhóm CŨ từ Zalo về DB (khi "Tải tin cũ hơn" mà DB đã hết tin).
        backfill(convId, count) {
            return _fetch(`/conversations/${encodeURIComponent(convId)}/backfill`, {
                method: 'POST',
                body: JSON.stringify({ count: count || 200 }),
            });
        },
        // Thành viên nhóm (uid+tên+avatar) → dropdown @tag trong ô soạn.
        groupMembers(convId) {
            return _fetch(`/conversations/${encodeURIComponent(convId)}/members`, {
                method: 'GET',
            });
        },
        sendMessage(body) {
            return _fetch('/send-message', { method: 'POST', body: JSON.stringify(body) });
        },
        // ── chat đầy đủ: ảnh/file/sticker/reaction/recall/forward/typing/seen ──
        sendImage(body) {
            return _fetch('/send-image', { method: 'POST', body: JSON.stringify(body) });
        },
        sendFile(body) {
            return _fetch('/send-file', { method: 'POST', body: JSON.stringify(body) });
        },
        sendSticker(body) {
            return _fetch('/send-sticker', { method: 'POST', body: JSON.stringify(body) });
        },
        react(body) {
            return _fetch('/react', { method: 'POST', body: JSON.stringify(body) });
        },
        recall(body) {
            return _fetch('/recall', { method: 'POST', body: JSON.stringify(body) });
        },
        // Xoá tin ở phía mình (delete-for-me) — khác recall (thu hồi 2 phía).
        deleteMessage(body) {
            return _fetch('/delete-message', { method: 'POST', body: JSON.stringify(body) });
        },
        forward(body) {
            return _fetch('/forward', { method: 'POST', body: JSON.stringify(body) });
        },
        typing(body) {
            return _fetch('/typing', { method: 'POST', body: JSON.stringify(body) });
        },
        seen(body) {
            return _fetch('/seen', { method: 'POST', body: JSON.stringify(body) });
        },
        // Quản lý hội thoại (ghim / tắt thông báo / đánh dấu chưa đọc) — DB-driven.
        pinConversation(convId, pinned) {
            return _fetch(`/conversations/${encodeURIComponent(convId)}/pin`, {
                method: 'POST',
                body: JSON.stringify({ pinned }),
            });
        },
        muteConversation(convId, muted, until) {
            return _fetch(`/conversations/${encodeURIComponent(convId)}/mute`, {
                method: 'POST',
                body: JSON.stringify({ muted, until }),
            });
        },
        markConversation(convId, unread) {
            return _fetch(`/conversations/${encodeURIComponent(convId)}/mark`, {
                method: 'POST',
                body: JSON.stringify({ unread }),
            });
        },
        stickers(accountKey, q) {
            return _fetch('/stickers' + _qs({ accountKey, q }), { method: 'GET' });
        },
        quickReplies(accountKey) {
            return _fetch('/quick-replies' + _qs({ accountKey }), { method: 'GET' });
        },
        // Lưu câu trả lời nhanh mới lên Zalo của tài khoản.
        addQuickReply({ accountKey, keyword, title }) {
            return _fetch('/quick-replies', {
                method: 'POST',
                body: JSON.stringify({ accountKey, keyword, title }),
            });
        },
        // OA + ZNS
        oaConnect(body) {
            return _fetch('/oa/connect', { method: 'POST', body: JSON.stringify(body) });
        },
        syncTemplates(oaRef) {
            return _fetch('/oa/sync-templates', {
                method: 'POST',
                body: JSON.stringify({ oaRef }),
            });
        },
        znsTemplates() {
            return _fetch('/zns/templates', { method: 'GET' });
        },
        sendZns(body) {
            return _fetch('/send-zns', { method: 'POST', body: JSON.stringify(body) });
        },
        sendCs(body) {
            return _fetch('/oa/send-cs', { method: 'POST', body: JSON.stringify(body) });
        },
        znsLog(params) {
            return _fetch('/zns/log' + _qs(params), { method: 'GET' });
        },
    };
})();
