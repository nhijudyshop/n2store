// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module.
// =====================================================
// Web 2.0 — Pancake JWT token monitor + auto-refresh
// =====================================================
//
// Vì sao tồn tại: JWT pancake (cookie `jwt`, valid ~90 ngày) sẽ hết hạn. Khi
// hết hạn thì Tab1 + native-orders + chat mất khả năng gửi tin/comment. Module
// này theo dõi expiry và TỰ ĐỘNG lấy token mới qua extension (không cần user
// bấm nút, không cần mở tab pancake.vn) — chỉ cần đang đăng nhập pancake.vn
// trong cùng trình duyệt.
//
// Cơ chế auto:
//   page → window.postMessage({type:'GET_PANCAKE_TOKEN'})
//        → n2store-extension content script → service worker
//        → chrome.cookies.getAll({domain:'pancake.vn', name:'jwt'})
//        → trả về GET_PANCAKE_TOKEN_SUCCESS {token}
//   (cookie `jwt` KHÔNG HttpOnly nhưng cross-origin nên trang không tự đọc
//    được — phải qua extension có `cookies` permission.)
//
// API:
//   Web2PancakeToken.getStatus()            → { state, hasToken, exp, secondsLeft, daysLeft, decoded }
//   Web2PancakeToken.isExtensionPresent()   → bool
//   Web2PancakeToken.fetchFromExtension(ms) → Promise<{ ok, token?, reason? }>
//   Web2PancakeToken.applyToken(token)      → { ok, decoded?, reason? }
//   Web2PancakeToken.ensureFresh(opts)      → Promise<{ ok, refreshed, state, reason? }>
//
// state: 'none' | 'expired' | 'critical' (≤1 ngày) | 'soon' (≤3 ngày) | 'ok'

(function () {
    'use strict';

    if (window.Web2PancakeToken) return; // idempotent

    const LS_JWT = 'pancake_jwt_token';
    const LS_JWT_EXP = 'pancake_jwt_token_expiry';

    const WARN_DAYS = 1; // ≤ 1 ngày → critical, tự refresh + cảnh báo
    const SOON_DAYS = 3; // ≤ 3 ngày → banner nhắc nhở (chưa ép)
    const EXT_TIMEOUT_MS = 4500;
    const EXT_MARKER_ATTR = 'data-n2store-extension';

    function _decode(token) {
        if (window.Web2Chat?.decodeJwt) return window.Web2Chat.decodeJwt(token);
        if (window.Web2JwtUtils) return window.Web2JwtUtils.decode(token);
        try {
            const p = String(token).split('.');
            if (p.length !== 3) return null;
            return JSON.parse(atob(p[1].replace(/-/g, '+').replace(/_/g, '/')));
        } catch {
            return null;
        }
    }

    /**
     * Trạng thái token hiện tại. Đọc localStorage trực tiếp (không qua getJwt vì
     * getJwt trả null khi hết hạn — ở đây cần biết token cũ + exp để hiển thị).
     */
    function getStatus() {
        let token = null;
        let expLS = null;
        try {
            token = localStorage.getItem(LS_JWT);
            expLS = parseInt(localStorage.getItem(LS_JWT_EXP) || '', 10);
        } catch {
            /* localStorage chặn */
        }
        if (!token) {
            return { state: 'none', hasToken: false, exp: 0, secondsLeft: 0, daysLeft: 0 };
        }
        const decoded = _decode(token);
        const exp = (Number.isFinite(expLS) && expLS) || decoded?.exp || 0;
        const now = Date.now() / 1000;
        const secondsLeft = exp ? exp - now : Infinity;
        const daysLeft = secondsLeft === Infinity ? Infinity : secondsLeft / 86400;

        let state;
        if (secondsLeft <= 0) state = 'expired';
        else if (daysLeft <= WARN_DAYS) state = 'critical';
        else if (daysLeft <= SOON_DAYS) state = 'soon';
        else state = 'ok';

        return { state, hasToken: true, token, exp, secondsLeft, daysLeft, decoded };
    }

    function isExtensionPresent() {
        try {
            return !!document.documentElement.getAttribute(EXT_MARKER_ATTR);
        } catch {
            return false;
        }
    }

    /**
     * Hỏi extension lấy cookie jwt của pancake.vn. Resolve { ok, token } hoặc
     * { ok:false, reason }. reason: 'no_extension' | 'timeout' | 'not_logged_in' | ...
     */
    function fetchFromExtension(timeoutMs) {
        return new Promise((resolve) => {
            if (!isExtensionPresent()) {
                resolve({ ok: false, reason: 'no_extension' });
                return;
            }
            const requestId =
                'pkt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
            let done = false;

            function cleanup() {
                if (done) return;
                done = true;
                clearTimeout(timer);
                window.removeEventListener('message', onMessage);
            }
            function onMessage(e) {
                if (e.source !== window) return;
                const d = e.data;
                if (!d || d.requestId !== requestId) return;
                if (d.type === 'GET_PANCAKE_TOKEN_SUCCESS') {
                    cleanup();
                    resolve({ ok: true, token: d.token });
                } else if (d.type === 'GET_PANCAKE_TOKEN_FAILURE') {
                    cleanup();
                    resolve({ ok: false, reason: d.reason || 'failed' });
                }
            }
            const timer = setTimeout(() => {
                cleanup();
                resolve({ ok: false, reason: 'timeout' });
            }, timeoutMs || EXT_TIMEOUT_MS);

            window.addEventListener('message', onMessage);
            window.postMessage({ type: 'GET_PANCAKE_TOKEN', requestId }, '*');
        });
    }

    /**
     * Validate + lưu token (localStorage qua Web2Chat.setJwt). Strip prefix
     * "token=" / "jwt=" nếu user paste cả cookie.
     */
    function applyToken(rawToken) {
        const token = String(rawToken || '')
            .trim()
            .replace(/^(?:jwt|token)=/i, '')
            .trim();
        if (!token) return { ok: false, reason: 'empty' };
        const decoded = _decode(token);
        if (!decoded) return { ok: false, reason: 'decode' };
        if (decoded.exp && decoded.exp < Date.now() / 1000) {
            return { ok: false, reason: 'expired' };
        }
        if (window.Web2Chat?.setJwt) {
            window.Web2Chat.setJwt(token, decoded.exp || null);
        } else {
            try {
                localStorage.setItem(LS_JWT, token);
                if (decoded.exp) localStorage.setItem(LS_JWT_EXP, String(decoded.exp));
            } catch {
                return { ok: false, reason: 'storage' };
            }
        }
        return { ok: true, decoded };
    }

    /**
     * Đảm bảo token còn tươi. Nếu state ∈ {none, expired, critical} → thử lấy
     * token mới qua extension. Trả về kết quả để caller quyết định hiện modal.
     *
     * opts.force   — refresh kể cả khi state ok/soon
     * opts.timeout — timeout extension (ms)
     */
    async function ensureFresh(opts = {}) {
        const status = getStatus();
        const needs =
            opts.force ||
            status.state === 'none' ||
            status.state === 'expired' ||
            status.state === 'critical';
        if (!needs) {
            return { ok: true, refreshed: false, state: status.state };
        }
        const res = await fetchFromExtension(opts.timeout);
        if (!res.ok) {
            return { ok: false, refreshed: false, state: status.state, reason: res.reason };
        }
        const applied = applyToken(res.token);
        if (!applied.ok) {
            return {
                ok: false,
                refreshed: false,
                state: status.state,
                reason: 'apply_' + applied.reason,
            };
        }
        const after = getStatus();
        return { ok: true, refreshed: true, state: after.state, decoded: applied.decoded };
    }

    window.Web2PancakeToken = {
        WARN_DAYS,
        SOON_DAYS,
        getStatus,
        isExtensionPresent,
        fetchFromExtension,
        applyToken,
        ensureFresh,
    };
})();
