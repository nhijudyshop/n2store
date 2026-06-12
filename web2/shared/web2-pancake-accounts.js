// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module.
// =====================================================
// Web 2.0 — Pancake ACCOUNTS manager (DB-backed)
// =====================================================
//
// Quản lý nhiều tài khoản Pancake (mỗi FB login = 1 account JWT). Lưu ở
// **Render Postgres** bảng `pancake_accounts` (CHIA CHUNG với Web 1.0 — cùng
// store token, web1/web2 thấy nhau ngay). KHÔNG tạo bảng web2_ riêng.
//
// Endpoint (proxy qua CF Worker → Render):
//   GET    /api/pancake-accounts            → { success, accounts: [row...] }
//   POST   /api/pancake-accounts/sync       → upsert { accounts: { [id]: {...} } }
//   PUT    /api/pancake-accounts/:id         → { is_active?, token?, name?, ... }
//   DELETE /api/pancake-accounts/:id
//
// account_id = JWT payload `uid` (KHỚP Web 1.0 PancakeTokenManager — tránh
// trùng row). Active account là per-device (localStorage `web2_pancake_active_account_id`).
//
// API:
//   Web2PancakeAccounts.list()              → Promise<{ ok, accounts, reason? }>
//   Web2PancakeAccounts.addFromToken(token) → Promise<{ ok, accountId, decoded, reason? }>
//   Web2PancakeAccounts.remove(accountId)   → Promise<{ ok, reason? }>
//   Web2PancakeAccounts.setEnabled(id, on)  → Promise<{ ok, reason? }>   (is_active = sync on/off)
//   Web2PancakeAccounts.setActiveLocal(acc) → { ok }  (đặt JWT active trên máy này)
//   Web2PancakeAccounts.getActiveId()       → string|null
//   Web2PancakeAccounts.isExpired(exp)      → bool

(function () {
    'use strict';

    if (window.Web2PancakeAccounts) return; // idempotent

    const WORKER_URL =
        window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const BASE = WORKER_URL + '/api/pancake-accounts';

    const LS = {
        JWT: 'pancake_jwt_token',
        JWT_EXP: 'pancake_jwt_token_expiry',
        ACTIVE_ACCOUNT_ID: 'web2_pancake_active_account_id',
    };

    function _decode(token) {
        if (window.Web2Chat?.decodeJwt) return window.Web2Chat.decodeJwt(token);
        try {
            const p = String(token).split('.');
            if (p.length !== 3) return null;
            return JSON.parse(atob(p[1].replace(/-/g, '+').replace(/_/g, '/')));
        } catch {
            return null;
        }
    }

    function isExpired(exp) {
        if (!exp) return false;
        return Date.now() / 1000 >= Number(exp);
    }

    // ENFORCE-PREP (2026-06-12): gắn x-web2-token cho route soft-gated
    // (WEB2_AUTH_ENFORCE=1). Page load web2-auth.js → Web2Auth.authHeaders;
    // không load → đọc thẳng localStorage 'web2_auth' (chung origin).
    function _authHeaders(extra) {
        if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders(extra);
        const h = { ...(extra || {}) };
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
            if (t) h['x-web2-token'] = t;
        } catch {
            /* ignore */
        }
        return h;
    }

    async function _json(url, init) {
        // ENFORCE-PREP (2026-06-12): _json là choke point của CẢ
        // /api/pancake-accounts/* lẫn /api/web2/pancake-refresh/*.
        const opts = { ...(init || {}), headers: _authHeaders(init?.headers) };
        const r = await fetch(url, opts);
        const t = await r.text();
        let d = null;
        try {
            d = t ? JSON.parse(t) : null;
        } catch {
            /* not json */
        }
        if (!r.ok) {
            const e = new Error('HTTP ' + r.status + ': ' + t.slice(0, 160));
            e.status = r.status;
            throw e;
        }
        return d;
    }

    async function list() {
        try {
            const d = await _json(BASE, { method: 'GET' });
            const accounts = Array.isArray(d?.accounts) ? d.accounts : [];
            return { ok: true, accounts };
        } catch (e) {
            return { ok: false, reason: e.message, accounts: [] };
        }
    }

    /**
     * Thêm/cập nhật account từ 1 JWT token. account_id = uid. Server tự bóc
     * fb_id/fb_name từ token. Strip prefix "jwt="/"token=" nếu user paste cả cookie.
     */
    async function addFromToken(rawToken) {
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
        const accountId = decoded.uid || 'account_' + Date.now();
        const body = {
            accounts: {
                [accountId]: {
                    token,
                    exp: decoded.exp || null,
                    uid: decoded.uid || null,
                    name: decoded.fb_name || decoded.name || null,
                    savedAt: Date.now(),
                },
            },
        };
        try {
            await _json(BASE + '/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            return { ok: true, accountId, decoded };
        } catch (e) {
            return { ok: false, reason: e.message };
        }
    }

    async function remove(accountId) {
        if (!accountId) return { ok: false, reason: 'no_id' };
        try {
            await _json(BASE + '/' + encodeURIComponent(accountId), { method: 'DELETE' });
            // Nếu account vừa xoá đang là active trên máy này → clear JWT local.
            if (getActiveId() === accountId) {
                try {
                    localStorage.removeItem(LS.JWT);
                    localStorage.removeItem(LS.JWT_EXP);
                    localStorage.removeItem(LS.ACTIVE_ACCOUNT_ID);
                } catch {
                    /* ignore */
                }
            }
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: e.message };
        }
    }

    /** Bật/tắt is_active (account có được sync sang máy khác hay không). */
    async function setEnabled(accountId, enabled) {
        if (!accountId) return { ok: false, reason: 'no_id' };
        try {
            await _json(BASE + '/' + encodeURIComponent(accountId), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !!enabled }),
            });
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: e.message };
        }
    }

    function getActiveId() {
        try {
            return localStorage.getItem(LS.ACTIVE_ACCOUNT_ID);
        } catch {
            return null;
        }
    }

    /**
     * Đặt account này thành JWT active trên MÁY NÀY (per-device). acc là row DB
     * ({account_id, token, token_exp}) hoặc object {uid, token, exp}.
     */
    function setActiveLocal(acc) {
        if (!acc || !acc.token) return { ok: false, reason: 'no_token' };
        try {
            localStorage.setItem(LS.JWT, acc.token);
            const exp = acc.token_exp || acc.exp;
            if (exp) localStorage.setItem(LS.JWT_EXP, String(exp));
            localStorage.setItem(LS.ACTIVE_ACCOUNT_ID, acc.account_id || acc.uid || '');
            return { ok: true };
        } catch {
            return { ok: false, reason: 'storage' };
        }
    }

    // =====================================================
    // Auto-refresh (server-side login) — /api/web2/pancake-refresh
    // =====================================================
    const REFRESH_BASE = WORKER_URL + '/api/web2/pancake-refresh';

    /** Trạng thái creds + auto_refresh từng account (KHÔNG có password). */
    async function getRefreshStatus() {
        try {
            const d = await _json(REFRESH_BASE + '/status', { method: 'GET' });
            const map = {};
            for (const a of d?.accounts || []) map[a.account_id] = a;
            return { ok: true, map, credsKeyConfigured: !!d?.credsKeyConfigured };
        } catch (e) {
            return { ok: false, reason: e.message, map: {} };
        }
    }

    /** Lưu credentials (mã hoá ở server) + bật/tắt auto_refresh. */
    async function saveCreds(accountId, identity, password, autoRefresh) {
        if (!accountId || !identity || !password) return { ok: false, reason: 'missing' };
        try {
            await _json(REFRESH_BASE + '/' + encodeURIComponent(accountId) + '/credentials', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identity, password, auto_refresh: autoRefresh !== false }),
            });
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: e.message };
        }
    }

    async function deleteCreds(accountId) {
        try {
            await _json(REFRESH_BASE + '/' + encodeURIComponent(accountId) + '/credentials', {
                method: 'DELETE',
            });
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: e.message };
        }
    }

    /**
     * Gia hạn NGAY 1 account. Không có opts → dùng creds đã lưu. Có
     * {identity,password} → login luôn (kèm save:true để lưu lại).
     */
    async function refreshNow(accountId, opts = {}) {
        try {
            const d = await _json(REFRESH_BASE + '/' + encodeURIComponent(accountId), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(opts),
            });
            return { ok: true, exp: d.exp, name: d.name, accountId: d.accountId };
        } catch (e) {
            // _json ném HTTP message; bóc reason nếu có
            return { ok: false, reason: e.message };
        }
    }

    window.Web2PancakeAccounts = {
        WORKER_URL,
        list,
        addFromToken,
        remove,
        setEnabled,
        getActiveId,
        setActiveLocal,
        isExpired,
        getRefreshStatus,
        saveCreds,
        deleteCreds,
        refreshNow,
    };
})();
