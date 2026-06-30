// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// W2PM core — shared namespace, mutable state, formatters, auth/fetch,
// notify + user context cho pending-match modal (Web 2.0 balance-history).
// MOVE-only split của web2-pending-match.js (giữ hành vi byte-identical).
// =====================================================================
// Cross-module mutable state sống Ở ĐÂY (W2PM.*) để mọi module thấy cùng
// 1 nguồn sau reassign. Các fn tham chiếu chéo gọi qua W2PM.fn (resolve
// tại call-time, không phụ thuộc thứ tự khai báo).
// =====================================================================

(function (global) {
    'use strict';

    const W2PM = global.W2PM || (global.W2PM = {});

    // ---- Endpoints / constants ----
    W2PM.BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/balance-history';
    W2PM.DIRECT_BASE = 'https://web2-api-kv04.onrender.com/api/web2/balance-history';
    // 2026-06-03: kho KH riêng Web 2.0 (web2_customers @ web2Db) — bỏ /api/v2/customers Web 1.0
    W2PM.CUSTOMER_SEARCH_BASE =
        'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/customers/search';
    W2PM.CUSTOMER_SEARCH_FALLBACK = 'https://web2-api-kv04.onrender.com/api/web2/customers/search';
    W2PM._WORKER_AVATAR = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/fb-avatar';

    // ---- Shared mutable state ----
    W2PM._modal = null;
    W2PM._pendingList = [];
    W2PM._searchQuery = '';
    W2PM._searchDebounceTimer = null;
    W2PM._badge = null;
    W2PM._fbObserver = null;
    W2PM._customSearchDebounceTimers = new Map();
    W2PM._customSearchCache = new Map();
    W2PM._pancakeSearchCache = new Map();
    W2PM._fbTailCache = new Map();

    // ENFORCE-PREP (2026-06-12): gắn x-web2-token cho /api/web2/balance-history/pending/:id/resolve
    // + :id/link (soft-gate → WEB2_AUTH_ENFORCE=1). Choke point: jsonFetch.
    function authHeaders(extra) {
        if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders(extra);
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth'))?.token;
            return t ? { ...(extra || {}), 'x-web2-token': t } : { ...(extra || {}) };
        } catch {
            return { ...(extra || {}) };
        }
    }

    async function jsonFetch(url, options) {
        const opts = { ...(options || {}), headers: authHeaders((options || {}).headers) }; // ENFORCE-PREP (2026-06-12)
        const r = await fetch(url, opts);
        const ct = r.headers.get('content-type') || '';
        const body = ct.includes('json') ? await r.json() : await r.text();
        if (!r.ok) {
            const msg =
                (body && body.error) ||
                (typeof body === 'string' ? body.slice(0, 200) : `HTTP ${r.status}`);
            throw new Error(msg);
        }
        return body;
    }

    async function withFallback(path, options) {
        try {
            return await jsonFetch(`${W2PM.BASE}${path}`, options);
        } catch (e) {
            return await jsonFetch(`${W2PM.DIRECT_BASE}${path}`, options);
        }
    }

    async function listPending() {
        const r = await withFallback('/pending');
        return Array.isArray(r?.data) ? r.data : [];
    }

    async function resolvePending(id, phone, name, resolvedBy) {
        return await withFallback(`/pending/${encodeURIComponent(id)}/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, name, resolvedBy }),
        });
    }

    async function linkManual(txId, phone, name) {
        return await withFallback(`/${encodeURIComponent(txId)}/link`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, name }),
        });
    }

    function escapeHtml(value) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(value);
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(value); // 1 nguồn
        if (value == null) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function fmtVnd(n) {
        if (window.Web2Format) return window.Web2Format.vnd(n); // 1 nguồn (₫)
        return Math.round(Number(n) || 0).toLocaleString('vi-VN') + '₫';
    }

    function fmtTime(iso) {
        if (!iso) return '—';
        try {
            const d = new Date(iso);
            return (
                d.toLocaleDateString('vi-VN') +
                ' ' +
                d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
            );
        } catch {
            return iso;
        }
    }

    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {}
        console.log(`[Web2Pending:${type || 'info'}]`, msg);
    }

    function getCurrentUserName() {
        try {
            const authStr =
                localStorage.getItem('loginindex_auth') ||
                sessionStorage.getItem('loginindex_auth') ||
                '{}';
            const auth = JSON.parse(authStr);
            return auth.username || auth.userName || auth.email || 'admin';
        } catch {
            return 'admin';
        }
    }

    function _normalize(s) {
        return String(s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd')
            .trim();
    }

    function _normalizePhoneInput(raw) {
        if (window.Web2PhoneUtils && window.Web2PhoneUtils.norm)
            return window.Web2PhoneUtils.norm(raw);
        let s = String(raw || '').replace(/[^0-9]/g, '');
        if (s.startsWith('84') && s.length >= 11) s = '0' + s.slice(2);
        return s;
    }

    W2PM.authHeaders = authHeaders;
    W2PM.jsonFetch = jsonFetch;
    W2PM.withFallback = withFallback;
    W2PM.listPending = listPending;
    W2PM.resolvePending = resolvePending;
    W2PM.linkManual = linkManual;
    W2PM.escapeHtml = escapeHtml;
    W2PM.fmtVnd = fmtVnd;
    W2PM.fmtTime = fmtTime;
    W2PM.notify = notify;
    W2PM.getCurrentUserName = getCurrentUserName;
    W2PM._normalize = _normalize;
    W2PM._normalizePhoneInput = _normalizePhoneInput;
})(window);
