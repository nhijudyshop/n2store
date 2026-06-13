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
    const DIRECT = 'https://n2store-fallback.onrender.com/api/web2-zalo';

    function _authHeaders() {
        try {
            const t =
                window.Web2Auth?.getStored?.()?.token ||
                JSON.parse(localStorage.getItem('web2_auth') || '{}')?.token;
            return t ? { 'x-web2-token': t } : {};
        } catch {
            return {};
        }
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
        loginQr(key) {
            return _fetch(`/accounts/${encodeURIComponent(key)}/login-qr`, { method: 'POST' });
        },
        qr(key) {
            return _fetch(`/accounts/${encodeURIComponent(key)}/qr`, { method: 'GET' });
        },
        reconnect(key) {
            return _fetch(`/accounts/${encodeURIComponent(key)}/reconnect`, { method: 'POST' });
        },
        disconnect(key) {
            return _fetch(`/accounts/${encodeURIComponent(key)}/disconnect`, { method: 'POST' });
        },
        deleteAccount(key) {
            return _fetch(`/accounts/${encodeURIComponent(key)}`, { method: 'DELETE' });
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
        messages(convId, limit) {
            return _fetch(
                `/conversations/${encodeURIComponent(convId)}/messages` + _qs({ limit }),
                { method: 'GET' }
            );
        },
        sendMessage(body) {
            return _fetch('/send-message', { method: 'POST', body: JSON.stringify(body) });
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
