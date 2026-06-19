// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared module.
// =====================================================================
// Web2JwtUtils — 1 NGUỒN giải mã JWT / kiểm tra hết hạn cho Web 2.0.
//
// Lý do (dedup, 2026-06-19): base64UrlDecode / decodeToken / decodeJwt /
// isTokenExpired bị copy-paste rải nhiều file — live-chat/pancake-token-codec.js
// (UTF-8 + safety-margin 1h), web2-chat-tokens.js (atob 3 phần), customer-store…
// Mỗi bản lệch nhẹ (UTF-8 vs atob thô, có/không margin). Gom 1 nguồn pure.
//
// API:
//   Web2JwtUtils.decode(jwt)            → payload object | null
//   Web2JwtUtils.base64UrlDecode(str)   → chuỗi đã decode (UTF-8 an toàn) | null
//   Web2JwtUtils.isExpired(jwt, margin) → bool (true nếu KHÔNG có exp HOẶC
//                                          đã qua exp-margin; margin = giây)
//   Web2JwtUtils.expiresAt(jwt)         → ms epoch | null
//   Web2JwtUtils.shortToken(t)          → chuỗi mask "abcd…wxyz" (log an toàn)
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2JwtUtils) return;

    // Decode base64url → chuỗi UTF-8. Trả null thay vì throw (caller robust).
    function base64UrlDecode(str) {
        if (!str || typeof str !== 'string') return null;
        try {
            let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
            const pad = base64.length % 4;
            if (pad) {
                if (pad === 1) return null; // độ dài base64url không hợp lệ
                base64 += '='.repeat(4 - pad);
            }
            if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return null;
            const binary = atob(base64);
            // atob trả chuỗi byte-per-char → decode UTF-8 cho ký tự non-ASCII.
            try {
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                return new TextDecoder('utf-8').decode(bytes);
            } catch {
                return binary; // môi trường thiếu TextDecoder → chuỗi thô
            }
        } catch {
            return null;
        }
    }

    // Giải mã payload (phần giữa) của JWT. KHÔNG verify chữ ký (client-side).
    function decode(jwt) {
        if (!jwt || typeof jwt !== 'string') return null;
        const parts = jwt.split('.');
        if (parts.length !== 3 || !parts[1]) return null;
        const json = base64UrlDecode(parts[1]);
        if (!json) return null;
        try {
            return JSON.parse(json);
        } catch {
            return null;
        }
    }

    // exp epoch (ms). JWT `exp` là GIÂY → ×1000. null nếu thiếu/không hợp lệ.
    function expiresAt(jwt) {
        const p = decode(jwt);
        if (!p) return null;
        const exp = Number(p.exp);
        return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
    }

    // true nếu token hết hạn (hoặc không có exp). margin = số GIÂY đệm an toàn
    // (coi như hết hạn sớm margin giây — pancake-token-codec dùng 3600s).
    // Chấp nhận cả chuỗi JWT lẫn epoch (giây) trực tiếp cho tương thích ngược.
    function isExpired(jwt, marginSec) {
        const margin = Number(marginSec) || 0;
        let expSec = null;
        if (typeof jwt === 'number') {
            expSec = jwt; // epoch giây truyền thẳng
        } else {
            const ms = expiresAt(jwt);
            expSec = ms == null ? null : Math.floor(ms / 1000);
        }
        if (!expSec) return true; // không có exp → coi như hết hạn
        const nowSec = Math.floor(Date.now() / 1000);
        return nowSec >= expSec - margin;
    }

    // Mask token cho log/UI: "abcd…wxyz" (8 ký tự đầu + 8 cuối). KHÔNG lộ token.
    function shortToken(t) {
        const s = String(t == null ? '' : t);
        if (!s) return '';
        if (s.length <= 20) return s.slice(0, 4) + '…';
        return s.slice(0, 8) + '…' + s.slice(-8);
    }

    global.Web2JwtUtils = { decode, base64UrlDecode, isExpired, expiresAt, shortToken };
})(typeof window !== 'undefined' ? window : globalThis);
