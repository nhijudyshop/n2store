// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Quản lý chi tiêu: API client.
// =====================================================================
// Fetch wrapper (x-web2-token) cho /api/web2-cashbook. Base từ WEB2_CONFIG.
// =====================================================================

(function (global) {
    'use strict';

    const cfg = global.WEB2_CONFIG || {};
    const WORKER =
        cfg.WORKER_URL ||
        (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const BASE = WORKER + '/api/web2-cashbook';

    function AUTHH(extra) {
        if (global.Web2Auth?.authHeaders) return global.Web2Auth.authHeaders(extra);
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth'))?.token;
            return t ? { ...(extra || {}), 'x-web2-token': t } : { ...(extra || {}) };
        } catch {
            return { ...(extra || {}) };
        }
    }
    async function api(path, opts = {}) {
        const res = await fetch(BASE + path, {
            method: opts.method || 'GET',
            headers: AUTHH(opts.body ? { 'Content-Type': 'application/json' } : {}),
            body: opts.body ? JSON.stringify(opts.body) : undefined,
        });
        const j = await res.json().catch(() => ({ success: false, error: 'Phản hồi lỗi' }));
        if (!res.ok || !j.success) throw new Error(j.error || 'HTTP ' + res.status);
        return j;
    }
    function qs(obj) {
        const p = Object.entries(obj)
            .filter(([, v]) => v != null && v !== '')
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
        return p.length ? '?' + p.join('&') : '';
    }

    global.ChiTieuApi = {
        BASE,
        imageUrl: (id) => (id ? BASE + '/images/' + id : ''),
        listVouchers: (filter) => api('/vouchers' + qs(filter || {})),
        getVoucher: (id) => api('/vouchers/' + id),
        createVoucher: (body) => api('/vouchers', { method: 'POST', body }),
        updateVoucher: (id, body) => api('/vouchers/' + id, { method: 'PATCH', body }),
        cancelVoucher: (id, reason) =>
            api('/vouchers/' + id + '/cancel', { method: 'POST', body: { reason } }),
        deleteVoucher: (id) => api('/vouchers/' + id, { method: 'DELETE' }),
        voucherAudit: (id) => api('/vouchers/' + id + '/audit'),
        listCategories: (type) => api('/categories' + qs({ type })),
        addCategory: (type, name, sourceCode) =>
            api('/categories', { method: 'POST', body: { type, name, sourceCode } }),
        delCategory: (id) => api('/categories/' + id, { method: 'DELETE' }),
        listSources: () => api('/sources'),
        addSource: (code, name, isDefault) =>
            api('/sources', { method: 'POST', body: { code, name, isDefault } }),
        delSource: (code) => api('/sources/' + encodeURIComponent(code), { method: 'DELETE' }),
        uploadImage: (dataUrl) => api('/images', { method: 'POST', body: { dataUrl } }),
        summary: (filter) => api('/summary' + qs(filter || {})),
        report: (filter) => api('/report' + qs(filter || {})),
    };
})(window);
