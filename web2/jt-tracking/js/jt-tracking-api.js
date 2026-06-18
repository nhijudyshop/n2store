// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// J&T Tracking — fetch wrapper + auth headers (x-web2-token) + relative time (GMT+7 friendly).
(function () {
    'use strict';

    const { API } = window.JtTrackingConst;

    function AUTHH(extra) {
        if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders(extra);
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth'))?.token;
            return t ? { ...(extra || {}), 'x-web2-token': t } : { ...(extra || {}) };
        } catch {
            return { ...(extra || {}) };
        }
    }
    async function api(path, opts = {}) {
        const res = await fetch(API + path, {
            method: opts.method || 'GET',
            headers: AUTHH(opts.body ? { 'Content-Type': 'application/json' } : {}),
            body: opts.body ? JSON.stringify(opts.body) : undefined,
        });
        const j = await res.json().catch(() => ({ success: false, error: 'Phản hồi lỗi' }));
        if (!res.ok || !j.success) throw new Error(j.error || 'HTTP ' + res.status);
        return j;
    }

    // ── time (GMT+7) ────────────────────────────────────────────────
    function relTime(epoch) {
        if (!epoch) return '';
        const diff = Date.now() - Number(epoch);
        const m = Math.round(diff / 60000);
        if (m < 1) return 'vừa xong';
        if (m < 60) return m + ' phút trước';
        const h = Math.round(m / 60);
        if (h < 24) return h + ' giờ trước';
        const d = Math.round(h / 24);
        return d + ' ngày trước';
    }

    window.JtTrackingApi = { api, AUTHH, relTime, API };
})();
