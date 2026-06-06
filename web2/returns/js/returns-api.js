// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Thu về — API client. Wrap fetch tới Render qua Cloudflare worker proxy.
// =====================================================================
(function () {
    'use strict';

    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const BASE = `${WORKER_URL}/api/web2-returns`;

    function _user() {
        try {
            const info = window.Web2UserInfo?.get?.() || {};
            return {
                userId: info.id || info.userId || null,
                userName: info.name || info.userName || null,
            };
        } catch {
            return { userId: null, userName: null };
        }
    }

    async function _json(url, opts) {
        const res = await fetch(url, {
            cache: 'no-cache',
            headers: { 'Content-Type': 'application/json' },
            ...opts,
        });
        let data = null;
        try {
            data = await res.json();
        } catch {}
        if (!res.ok || (data && data.success === false) || (data && data.error)) {
            throw new Error((data && data.error) || `HTTP ${res.status}`);
        }
        return data;
    }

    window.Web2ReturnsApi = {
        list(params = {}) {
            const q = new URLSearchParams(params).toString();
            return _json(`${BASE}/list?${q}`);
        },
        pending() {
            return _json(`${BASE}/pending`);
        },
        get(code) {
            return _json(`${BASE}/${encodeURIComponent(code)}`);
        },
        create(payload) {
            return _json(BASE, {
                method: 'POST',
                body: JSON.stringify({ ...payload, ..._user() }),
            });
        },
        approve(code) {
            return _json(`${BASE}/${encodeURIComponent(code)}/approve`, {
                method: 'POST',
                body: JSON.stringify(_user()),
            });
        },
        remove(code) {
            return _json(`${BASE}/${encodeURIComponent(code)}`, {
                method: 'DELETE',
                body: JSON.stringify(_user()),
            });
        },
        // --- Lookup helpers (reuse Web 2.0 endpoints) ---
        searchCustomers(q) {
            return _json(
                `${WORKER_URL}/api/web2/customers/search?search=${encodeURIComponent(q)}&limit=8`
            );
        },
        customerOrders(phone) {
            return _json(
                `${WORKER_URL}/api/web2/customer-orders/${encodeURIComponent(phone)}?limit=30`
            );
        },
        searchProducts(q) {
            return _json(
                `${WORKER_URL}/api/web2-products/list?search=${encodeURIComponent(q)}&activeOnly=true&limit=20`
            );
        },
    };
})();
