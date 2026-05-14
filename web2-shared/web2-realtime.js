// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// Web 2.0 — Realtime client (Pancake WS via Render proxy)
// =====================================================
//
// Lightweight WS client that subscribes to events broadcast by the
// Render realtime broker (`n2store-realtime.onrender.com`). The broker
// keeps a server-side WebSocket open to `pancake.vn` 24/7 and forwards
// these events to connected browsers:
//
//   pages:new_message         — new inbox message from / to a customer
//   pages:update_conversation — conversation read state changed
//
// Designed to mirror the `PbhRealtime.subscribe` API used by other Web 2.0
// pages — no shared code with `tpos-pancake/js/realtime-manager.js`.
//
// Usage:
//   const sub = window.Web2Realtime.subscribe({
//       types: ['pages:new_message'],
//       onEvent: (msg) => { ... },
//       debounceMs: 0,
//   });
//   sub.unsubscribe();
//
// Optional: `Web2Realtime.start({ pageIds })` pushes the user's JWT +
// page IDs to the Render server so the broker can re-subscribe to those
// pages. This is normally NOT required because the Render broker
// auto-reconnects from saved credentials, but a fresh setup needs it.

(function (global) {
    'use strict';

    if (global.Web2Realtime) return;

    const WS_URL = 'wss://n2store-realtime.onrender.com';
    const WORKER_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    const subscribers = [];
    let ws = null;
    let reconnectAttempts = 0;
    let reconnectTimer = null;
    let _started = false;

    function _connect() {
        if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
        try {
            ws = new WebSocket(WS_URL);
        } catch (e) {
            console.warn('[Web2Realtime] WS create failed:', e.message);
            return _scheduleReconnect();
        }
        ws.onopen = () => {
            reconnectAttempts = 0;
            console.log('[Web2Realtime] ✓ WS connected');
        };
        ws.onclose = () => {
            console.log('[Web2Realtime] WS closed → schedule reconnect');
            _scheduleReconnect();
        };
        ws.onerror = (e) => console.warn('[Web2Realtime] WS error', e?.message || e);
        ws.onmessage = (evt) => {
            let msg;
            try {
                msg = JSON.parse(evt.data);
            } catch {
                return;
            }
            if (!msg || !msg.type) return;
            for (const sub of subscribers) {
                if (!sub.types.includes(msg.type)) continue;
                if (sub.debounceMs > 0) {
                    if (sub._timer) clearTimeout(sub._timer);
                    sub._timer = setTimeout(() => {
                        try {
                            sub.onEvent(msg);
                        } catch (e) {
                            console.error('[Web2Realtime] handler error', e);
                        }
                    }, sub.debounceMs);
                } else {
                    try {
                        sub.onEvent(msg);
                    } catch (e) {
                        console.error('[Web2Realtime] handler error', e);
                    }
                }
            }
        };
    }

    function _scheduleReconnect() {
        if (reconnectTimer) return;
        const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts++));
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            _connect();
        }, delay);
    }

    /**
     * Subscribe to realtime events from the Render broker.
     * @param {{ types: string[], onEvent: (msg) => void, debounceMs?: number }} opts
     * @returns {{ unsubscribe: () => void }}
     */
    function subscribe(opts) {
        if (!opts || !Array.isArray(opts.types) || typeof opts.onEvent !== 'function') {
            throw new Error('Web2Realtime.subscribe requires { types: string[], onEvent: fn }');
        }
        const sub = {
            types: opts.types,
            onEvent: opts.onEvent,
            debounceMs: opts.debounceMs ?? 0,
            _timer: null,
        };
        subscribers.push(sub);
        _connect();
        return {
            unsubscribe() {
                const i = subscribers.indexOf(sub);
                if (i >= 0) subscribers.splice(i, 1);
                if (sub._timer) clearTimeout(sub._timer);
            },
        };
    }

    /**
     * Push credentials + pageIds to the Render realtime broker so it
     * (re-)opens its server-side WebSocket to Pancake. Only needed on
     * a brand-new server install — usually the broker already has
     * credentials saved.
     * @param {{ pageIds: string[] }} opts
     * @returns {Promise<{ok:boolean, reason?:string}>}
     */
    async function start(opts = {}) {
        if (_started) return { ok: true, alreadyStarted: true };
        const jwt = global.Web2Chat?.getJwt();
        if (!jwt) return { ok: false, reason: 'no_jwt' };
        const decoded = global.Web2Chat?.decodeJwt(jwt);
        const userId = decoded?.sub || decoded?.account_id || decoded?.user_id || decoded?.uid;
        if (!userId) return { ok: false, reason: 'no_user_id_in_jwt' };
        const pageIds =
            Array.isArray(opts.pageIds) && opts.pageIds.length
                ? opts.pageIds
                : Object.keys(global.Web2Chat?.getAllPageAccessTokens() || {});
        if (!pageIds.length) return { ok: false, reason: 'no_pages' };
        try {
            const r = await fetch(`${WORKER_BASE}/api/realtime/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: jwt,
                    userId,
                    pageIds,
                    cookie: `jwt=${jwt}`,
                }),
            });
            if (!r.ok) {
                const text = await r.text();
                return { ok: false, reason: `HTTP ${r.status}: ${text.slice(0, 200)}` };
            }
            _started = true;
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: e.message };
        }
    }

    /**
     * GET /api/realtime/pending-customers — initial state of unread customers.
     * @returns {Promise<{ok:boolean, customers?:Array}>}
     */
    async function fetchPendingCustomers(limit = 500) {
        try {
            const r = await fetch(
                `${WORKER_BASE}/api/realtime/pending-customers?limit=${encodeURIComponent(limit)}`
            );
            if (!r.ok) return { ok: false, reason: `HTTP ${r.status}`, customers: [] };
            const data = await r.json();
            if (!data?.success) return { ok: false, reason: 'no_success_flag', customers: [] };
            return { ok: true, customers: Array.isArray(data.customers) ? data.customers : [] };
        } catch (e) {
            return { ok: false, reason: e.message, customers: [] };
        }
    }

    /**
     * POST /api/realtime/mark-replied — clear unread when user replies.
     * @param {string} psid
     * @param {string|null} pageId
     */
    async function markReplied(psid, pageId) {
        if (!psid) return { ok: false, reason: 'no_psid' };
        try {
            const r = await fetch(`${WORKER_BASE}/api/realtime/mark-replied`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ psid, pageId: pageId || null }),
            });
            if (!r.ok) return { ok: false, reason: `HTTP ${r.status}` };
            const data = await r.json();
            return { ok: !!data?.success, removed: data?.removed || 0 };
        } catch (e) {
            return { ok: false, reason: e.message };
        }
    }

    function isConnected() {
        return ws && ws.readyState === 1;
    }

    global.Web2Realtime = {
        subscribe,
        start,
        fetchPendingCustomers,
        markReplied,
        isConnected,
        _internal: { WS_URL, WORKER_BASE },
    };
})(window);
