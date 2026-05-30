// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web2UserInfo — shared helper lấy current user + attach vào CRUD payloads
// =====================================================
//
// Mục đích: 1 nơi duy nhất để mọi trang Web 2.0 lấy thông tin user hiện tại
// + đính vào payload trước khi gọi server (cho audit log).
//
// P1 2026-05-30: user ask "có hệ thống user → mấy cái lịch sử chỉnh sửa
// kèm theo tên user tương tác" → apply cho tất cả trang Web 2.0.
//
// Source priority:
//   1. Web2Auth.getStored() (primary — web 2.0 native auth)
//   2. AuthManager.getCurrentUser() (legacy fallback)
//   3. null → "(ẩn danh)"
//
// Public API:
//   Web2UserInfo.get()                              → { userId, userName, sourcePage }
//   Web2UserInfo.attachToPayload(payload, sourcePage)  → mutates payload + returns it
//   Web2UserInfo.attachToBody(body, sourcePage)        → adds userId/userName to body object
//   Web2UserInfo.label()                            → display name "Nguyễn Văn A" hoặc "(ẩn danh)"
//   Web2UserInfo.detectSourcePage()                 → auto-derive từ window.location pathname
//
// Pattern dùng:
//   const payload = { code, name, data: {...} };
//   Web2UserInfo.attachToPayload(payload);  // adds createdBy, data.createdByName, seeds data.history[0]
//   await fetch(`/api/web2/<entity>/create`, { body: JSON.stringify(payload) });

(function (global) {
    'use strict';

    if (global.Web2UserInfo) return; // idempotent

    function _readWeb2Auth() {
        try {
            return global.Web2Auth?.getStored?.()?.user || null;
        } catch {
            return null;
        }
    }

    function _readLegacyAuth() {
        try {
            return global.AuthManager?.getCurrentUser?.() || null;
        } catch {
            return null;
        }
    }

    /**
     * Auto-derive sourcePage từ window.location pathname.
     * /web2/products/index.html → "web2-products"
     * /web2/purchase-refund/index.html → "web2-purchase-refund"
     * /so-order/index.html → "so-order"
     */
    function detectSourcePage() {
        try {
            const path = (global.location?.pathname || '').toLowerCase();
            const m = path.match(/\/(web2)\/([^/]+)/);
            if (m) return `web2-${m[2]}`;
            const m2 = path.match(/\/([^/]+)\/index\.html?$/);
            if (m2) return m2[1];
            return 'web2-unknown';
        } catch {
            return 'web2-unknown';
        }
    }

    /**
     * Lấy current user + sourcePage. Trả về object stable
     * { userId, userName, sourcePage } luôn có 3 fields (fallback "(ẩn danh)").
     */
    function get(sourcePage) {
        const user = _readWeb2Auth() || _readLegacyAuth();
        const page = sourcePage || detectSourcePage();
        if (!user) {
            return { userId: null, userName: '(ẩn danh)', sourcePage: page };
        }
        return {
            userId: user.id || user.uid || user.username || user.email || null,
            userName: user.displayName || user.username || user.email || user.name || '(ẩn danh)',
            sourcePage: page,
        };
    }

    /** Hiển thị label "Tên user" hoặc "(ẩn danh)" — dùng cho UI inline */
    function label() {
        return get().userName;
    }

    /**
     * Đính user info vào payload cho `/api/web2/<entity>/create|update`.
     * Mutates payload + returns. Backward compatible — pages không pass
     * sourcePage thì auto-detect.
     *
     * Tạo:
     *   payload.createdBy = userId
     *   payload.data.createdByName = userName
     *   payload.data.history = [{ts, action:'create', userId, userName, sourcePage, note}]
     *
     * Update (khi caller gọi attachToPayload với action='update'):
     *   payload.updatedBy = userId
     *   payload.data.updatedByName = userName
     *   (server tự append history entry qua web2-generic.js)
     */
    function attachToPayload(payload, sourcePage) {
        const info = get(sourcePage);
        if (!payload || typeof payload !== 'object') return payload;
        if (!payload.data || typeof payload.data !== 'object') payload.data = {};
        // Backward compat: nếu caller chưa set createdBy, set theo userId
        if (!payload.createdBy) payload.createdBy = info.userId;
        payload.userId = info.userId;
        payload.userName = info.userName;
        payload.sourcePage = info.sourcePage;
        if (!payload.data.createdByName) payload.data.createdByName = info.userName;
        // Seed initial history nếu chưa có (CREATE flow)
        if (!Array.isArray(payload.data.history)) {
            payload.data.history = [
                {
                    ts: Date.now(),
                    action: 'create',
                    userId: info.userId,
                    userName: info.userName,
                    sourcePage: info.sourcePage,
                    note: null,
                },
            ];
        }
        return payload;
    }

    /**
     * Đính user info vào body cho state-machine endpoints (approve/cancel/etc).
     * Khác attachToPayload ở chỗ không seed history (server sẽ append entry).
     * Mutates body + returns.
     */
    function attachToBody(body, sourcePage) {
        const info = get(sourcePage);
        if (!body || typeof body !== 'object') body = {};
        body.userId = info.userId;
        body.userName = info.userName;
        body.sourcePage = info.sourcePage;
        return body;
    }

    global.Web2UserInfo = {
        get,
        label,
        detectSourcePage,
        attachToPayload,
        attachToBody,
    };
})(typeof window !== 'undefined' ? window : globalThis);
