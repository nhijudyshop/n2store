// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Kho KH warehouse (web2_customers). warehouse riêng.
// =====================================================================
// CustomersApi — wrapper /api/web2/customers (warehouse Web 2.0, web2Db).
// ĐỘC LẬP WEB2: chỉ đọc/ghi kho KH riêng. Dual base (CF Worker → fallback
// Render direct) cho mọi call để chịu lỗi edge.
// =====================================================================

(function () {
    'use strict';

    // 1 nguồn base-URL = WEB2_CONFIG (web2-auth.js load trước); literal chỉ là fallback.
    const WORKER =
        (window.API_CONFIG?.WORKER_URL ||
            window.WEB2_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev') + '/api/web2/customers';
    const DIRECT =
        (window.WEB2_CONFIG?.WEB2_API || 'https://web2-api-kv04.onrender.com') +
        '/api/web2/customers';

    // ENFORCE-PREP (2026-06-12): gắn x-web2-token cho mutation /api/web2/customers/*
    // (create/upsert/merge/:id PATCH/DELETE… — soft-gate → WEB2_AUTH_ENFORCE=1).
    function _authHeaders() {
        if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders();
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth'))?.token;
            return t ? { 'x-web2-token': t } : {};
        } catch {
            return {};
        }
    }

    async function _fetch(path, options) {
        const opts = options || {};
        opts.headers = Object.assign(
            { Accept: 'application/json', 'Content-Type': 'application/json' },
            _authHeaders(), // ENFORCE-PREP (2026-06-12)
            opts.headers || {}
        );
        let lastErr = null;
        for (const base of [WORKER, DIRECT]) {
            try {
                const res = await fetch(base + path, opts);
                const ct = res.headers.get('content-type') || '';
                const data = ct.includes('application/json') ? await res.json() : {};
                if (!res.ok && data.success !== true) {
                    // 4xx có body JSON {error} → trả luôn (không thử base khác).
                    if (res.status >= 400 && res.status < 500 && data.error) return data;
                    throw new Error(data.error || `HTTP ${res.status}`);
                }
                return data;
            } catch (e) {
                lastErr = e;
            }
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

    const CustomersApi = {
        // GET /list — { search, status, tier, source, tag, activeOnly, page, limit }
        list(params) {
            return _fetch('/list' + _qs(params), { method: 'GET' });
        },
        // POST /create
        create(body) {
            return _fetch('/create', { method: 'POST', body: JSON.stringify(body) });
        },
        // PATCH /:id
        update(id, body) {
            return _fetch('/' + encodeURIComponent(id), {
                method: 'PATCH',
                body: JSON.stringify(body),
            });
        },
        // DELETE /:id?force=
        remove(id, force) {
            return _fetch('/' + encodeURIComponent(id) + (force ? '?force=true' : ''), {
                method: 'DELETE',
            });
        },
        // POST /merge — { primaryId, secondaryId }
        merge(primaryId, secondaryId) {
            return _fetch('/merge', {
                method: 'POST',
                body: JSON.stringify({ primaryId, secondaryId }),
            });
        },
        // POST /upsert — { phone, name?, address?, fbId? }
        upsert(body) {
            return _fetch('/upsert', { method: 'POST', body: JSON.stringify(body) });
        },
        // GET /lookup-deep — fallback Pancake khi Kho KH trống.
        // { q, live }. Tự import KH tìm được (non-destructive). Trả {tier, imported, livePolled}.
        lookupDeep(q, { live = false } = {}) {
            return _fetch('/lookup-deep' + _qs({ q, live: live ? 1 : undefined }), {
                method: 'GET',
            });
        },
    };

    window.CustomersApi = CustomersApi;
})();
