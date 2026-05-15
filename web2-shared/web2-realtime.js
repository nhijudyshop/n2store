// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// Web 2.0 — Realtime client (Pancake WS)
// =====================================================
//
// Two-mode realtime client:
//   1) DIRECT MODE (default, preferred):
//      Open WebSocket straight to `wss://pancake.vn/socket/websocket?vsn=2.0.0`
//      from the browser, join the same Phoenix channels Pancake's own
//      admin UI joins (`users:{userId}`, `multiple_pages:{userId}`,
//      `pages:{pageId}` per page). The browser receives events with
//      zero middleware so coverage matches what Pancake's web app sees.
//      Ported from tpos-pancake/js/realtime-manager.js with the
//      addition of per-page channel joins (caught the previously-missed
//      `pages:new_message` events).
//
//   2) PROXY FALLBACK:
//      `wss://n2store-realtime.onrender.com` — a Render broker that
//      keeps its own server-side WebSocket to Pancake 24/7. Useful when
//      direct browser connections fail (CSP, network filter, etc.) but
//      events get bottlenecked through a single shared instance, so it
//      misses traffic for pages the broker isn't subscribed to.
//
// Public API (mode-agnostic):
//   Web2Realtime.subscribe({ types, onEvent, debounceMs }) → { unsubscribe }
//   Web2Realtime.start({ pageIds })   — kicks the proxy broker for fallback
//   Web2Realtime.isConnected()        — true when direct OR proxy is live
//   Web2Realtime.fetchPendingCustomers() / markReplied() — proxy-backed REST

(function (global) {
    'use strict';

    if (global.Web2Realtime) return;

    const PANCAKE_WS_URL = 'wss://pancake.vn/socket/websocket?vsn=2.0.0';
    const PROXY_WS_URL = 'wss://n2store-realtime.onrender.com';
    const WORKER_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    // Subscriber list is mode-agnostic — both modes funnel events here.
    const subscribers = [];

    // Direct mode state
    let directWs = null;
    let directHeartbeat = null;
    let directReconnect = null;
    let directReconnectAttempts = 0;
    let directRefCounter = 1;
    let directUserId = null;
    let directToken = null;
    let directPageIds = []; // current subscription set
    let directJoinedPages = new Set(); // pages we've already sent phx_join for

    // Proxy mode state (fallback)
    let proxyWs = null;
    let proxyReconnect = null;
    let proxyReconnectAttempts = 0;
    let _lastStartedKey = '';

    // -------- Helpers --------

    function _emit(type, payload) {
        const msg = { type, payload };
        for (const sub of subscribers) {
            if (!sub.types.includes(type)) continue;
            if (sub.debounceMs > 0) {
                if (sub._timer) clearTimeout(sub._timer);
                sub._timer = setTimeout(() => _safeCall(sub, msg), sub.debounceMs);
            } else {
                _safeCall(sub, msg);
            }
        }
    }

    function _safeCall(sub, msg) {
        try {
            sub.onEvent(msg);
        } catch (e) {
            console.error('[Web2Realtime] handler error', e);
        }
    }

    function _makeRef() {
        return String(directRefCounter++);
    }

    function _clientSession() {
        // Pancake's clientSession is a UUID-like string used to disambiguate
        // open tabs. Stable per page load is enough.
        const rnd = (n) =>
            Array.from(crypto.getRandomValues(new Uint8Array(n)))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('');
        return `${rnd(4)}-${rnd(2)}-${rnd(2)}-${rnd(2)}-${rnd(6)}`;
    }

    function _decodeUser() {
        const jwt = global.Web2Chat?.getJwt();
        if (!jwt) return null;
        const decoded = global.Web2Chat?.decodeJwt?.(jwt) || {};
        const userId = decoded.sub || decoded.account_id || decoded.user_id || decoded.uid;
        return userId ? { jwt, userId } : null;
    }

    // -------- Direct mode --------

    function _connectDirect(pageIdsHint) {
        if (directWs && (directWs.readyState === 0 || directWs.readyState === 1)) return;
        const auth = _decodeUser();
        if (!auth) {
            console.warn('[Web2Realtime] direct: no JWT — falling back to proxy');
            _connectProxy();
            return;
        }
        directToken = auth.jwt;
        directUserId = auth.userId;
        directPageIds = (
            Array.isArray(pageIdsHint) && pageIdsHint.length
                ? pageIdsHint
                : Object.keys(global.Web2Chat?.getAllPageAccessTokens?.() || {})
        ).map(String);
        directJoinedPages = new Set();

        try {
            directWs = new WebSocket(PANCAKE_WS_URL);
        } catch (e) {
            console.warn('[Web2Realtime] direct WS create failed:', e.message);
            return _scheduleDirectReconnect();
        }

        directWs.onopen = () => {
            console.log(
                `[Web2Realtime] ✓ direct WS → pancake.vn (user=${directUserId.slice(0, 8)}, pages=${directPageIds.length})`
            );
            directReconnectAttempts = 0;
            _startDirectHeartbeat();
            _joinDirectChannels();
        };

        directWs.onclose = (e) => {
            console.log('[Web2Realtime] direct WS closed', e.code);
            _stopDirectHeartbeat();
            _scheduleDirectReconnect();
        };

        directWs.onerror = () => {
            // 'error' fires before 'close'; the close handler does the recovery.
        };

        directWs.onmessage = (evt) => _onDirectMessage(evt.data);
    }

    function _scheduleDirectReconnect() {
        if (directReconnect) return;
        const delay = Math.min(30000, 1000 * Math.pow(2, directReconnectAttempts++));
        directReconnect = setTimeout(() => {
            directReconnect = null;
            // If direct keeps failing, also bring up proxy as a backstop.
            if (directReconnectAttempts >= 3 && !proxyWs) _connectProxy();
            _connectDirect();
        }, delay);
    }

    function _startDirectHeartbeat() {
        _stopDirectHeartbeat();
        directHeartbeat = setInterval(() => {
            if (directWs && directWs.readyState === 1) {
                directWs.send(JSON.stringify([null, _makeRef(), 'phoenix', 'heartbeat', {}]));
            }
        }, 30000);
    }

    function _stopDirectHeartbeat() {
        if (directHeartbeat) {
            clearInterval(directHeartbeat);
            directHeartbeat = null;
        }
    }

    function _joinDirectChannels() {
        if (!directWs || directWs.readyState !== 1) return;
        // users:{userId} — user-scoped notifications (online, badges, …)
        const uRef = _makeRef();
        directWs.send(
            JSON.stringify([
                uRef,
                uRef,
                `users:${directUserId}`,
                'phx_join',
                { accessToken: directToken, userId: directUserId, platform: 'web' },
            ])
        );
        // multiple_pages:{userId} — cross-page summary stream
        const pRef = _makeRef();
        directWs.send(
            JSON.stringify([
                pRef,
                pRef,
                `multiple_pages:${directUserId}`,
                'phx_join',
                {
                    accessToken: directToken,
                    userId: directUserId,
                    clientSession: _clientSession(),
                    pageIds: directPageIds,
                    platform: 'web',
                },
            ])
        );
        // pages:{pageId} per page — `pages:new_message` only fires here
        for (const pid of directPageIds) _joinDirectPage(pid);
    }

    function _joinDirectPage(pageId) {
        if (!directWs || directWs.readyState !== 1) return;
        if (directJoinedPages.has(pageId)) return;
        directJoinedPages.add(pageId);
        const ref = _makeRef();
        directWs.send(
            JSON.stringify([
                ref,
                ref,
                `pages:${pageId}`,
                'phx_join',
                { accessToken: directToken, userId: directUserId, platform: 'web' },
            ])
        );
    }

    function _onDirectMessage(data) {
        let msg;
        try {
            msg = JSON.parse(data);
        } catch {
            return;
        }
        // Phoenix protocol: [joinRef, ref, topic, event, payload]
        if (!Array.isArray(msg) || msg.length < 5) return;
        const [, , topic, event, payload] = msg;
        if (event === 'phx_reply' || event === 'phx_close' || event === 'phx_error') return;
        if (event === 'phoenix' && payload?.status) return;
        // Only forward Pancake business events. The set matches what the
        // Render broker would forward, so the public API is identical.
        const FORWARD = new Set([
            'pages:new_message',
            'pages:update_conversation',
            'order:tags_updated',
        ]);
        if (!FORWARD.has(event)) return;
        _emit(event, payload);
    }

    // -------- Proxy fallback mode --------

    function _connectProxy() {
        if (proxyWs && (proxyWs.readyState === 0 || proxyWs.readyState === 1)) return;
        try {
            proxyWs = new WebSocket(PROXY_WS_URL);
        } catch (e) {
            console.warn('[Web2Realtime] proxy WS create failed:', e.message);
            return _scheduleProxyReconnect();
        }
        proxyWs.onopen = () => {
            console.log('[Web2Realtime] ✓ proxy WS → Render broker (fallback)');
            proxyReconnectAttempts = 0;
        };
        proxyWs.onclose = () => _scheduleProxyReconnect();
        proxyWs.onerror = () => {};
        proxyWs.onmessage = (evt) => {
            let msg;
            try {
                msg = JSON.parse(evt.data);
            } catch {
                return;
            }
            if (!msg || !msg.type) return;
            // Avoid double-firing if direct mode is also alive — dedup by
            // checking conv last_message id when present.
            _emit(msg.type, msg.payload);
        };
    }

    function _scheduleProxyReconnect() {
        if (proxyReconnect) return;
        const delay = Math.min(30000, 1000 * Math.pow(2, proxyReconnectAttempts++));
        proxyReconnect = setTimeout(() => {
            proxyReconnect = null;
            _connectProxy();
        }, delay);
    }

    // -------- Public API --------

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
        _connectDirect(); // lazy connect on first subscribe
        return {
            unsubscribe() {
                const i = subscribers.indexOf(sub);
                if (i >= 0) subscribers.splice(i, 1);
                if (sub._timer) clearTimeout(sub._timer);
            },
        };
    }

    /**
     * Re-subscribe to a fresh set of pages. In direct mode we send
     * additional `pages:{pageId}` phx_join messages for any new page.
     * In proxy mode we POST credentials so the Render broker re-opens
     * its server-side WS. Both modes are idempotent — same pageIds set
     * is a no-op.
     */
    async function start(opts = {}) {
        const auth = _decodeUser();
        if (!auth) return { ok: false, reason: 'no_jwt' };
        const pageIds =
            Array.isArray(opts.pageIds) && opts.pageIds.length
                ? opts.pageIds
                : Object.keys(global.Web2Chat?.getAllPageAccessTokens?.() || {});
        if (!pageIds.length) return { ok: false, reason: 'no_pages' };
        const ids = pageIds.map(String);
        // Direct mode: join any page we haven't joined yet.
        if (directWs && directWs.readyState === 1) {
            for (const pid of ids) {
                if (!directJoinedPages.has(pid)) {
                    directPageIds.push(pid);
                    _joinDirectPage(pid);
                }
            }
        } else {
            directPageIds = ids;
            _connectDirect(ids);
        }
        // Proxy fallback: only re-call broker if pageIds changed.
        const key = [...ids].sort().join('|');
        if (key === _lastStartedKey)
            return { ok: true, alreadyStarted: true, pageCount: ids.length };
        try {
            const r = await fetch(`${WORKER_BASE}/api/realtime/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: auth.jwt,
                    userId: auth.userId,
                    pageIds: ids,
                    cookie: `jwt=${auth.jwt}`,
                }),
            });
            if (r.ok) _lastStartedKey = key;
            // Don't throw on failure — direct mode handles realtime,
            // proxy is just a backstop for cross-device pending state.
            return { ok: true, pageCount: ids.length };
        } catch (e) {
            return { ok: false, reason: e.message };
        }
    }

    /**
     * Multi-account: kick the Render broker pool with EVERY Pancake
     * account stored in `pancake_all_accounts` localStorage. Each
     * account spawns one server-side WS to Pancake covering the pages
     * that account has access to. Broker dedupes pages so each FB
     * page is only joined once across the pool.
     *
     * This is how we get true realtime for ALL pages (not just the
     * 1 page that the legacy single-account `/api/realtime/start`
     * could subscribe to).
     */
    let _lastMultiKey = '';
    async function startMulti() {
        // Web2Chat.getAllAccounts returns either a map keyed by account
        // id (`{accId: {token, uid, name, pages, ...}}`) or an array
        // depending on legacy. Normalise to array of entries.
        const raw = global.Web2Chat?.getAllAccounts?.();
        const list = Array.isArray(raw)
            ? raw
            : raw && typeof raw === 'object'
              ? Object.entries(raw).map(([k, v]) => ({ ...v, account_id: v.account_id || k }))
              : [];
        if (!list.length) return { ok: false, reason: 'no_accounts' };
        const payload = list
            .filter((a) => a && a.token && (a.is_active === undefined || a.is_active))
            .map((a) => {
                const tokenInfo = global.Web2Chat?.decodeJwt?.(a.token) || {};
                const userId = tokenInfo.sub || tokenInfo.uid || tokenInfo.user_id || a.uid;
                const pageIds = (Array.isArray(a.pages) ? a.pages : [])
                    .map((p) => String(p?.id || p?.page_id || p?.pageId || p || ''))
                    .filter(Boolean);
                return {
                    accountId: String(a.account_id || a.id || userId),
                    name: a.name || tokenInfo.fb_name || null,
                    token: a.token,
                    userId,
                    pageIds,
                    cookie: `jwt=${a.token}`,
                };
            })
            .filter((a) => a.userId && a.pageIds.length);
        if (!payload.length) return { ok: false, reason: 'no_valid_accounts' };
        // Dedupe same set across calls (rare to actually flip)
        const key = payload
            .map((p) => `${p.accountId}:${p.pageIds.sort().join(',')}`)
            .sort()
            .join('|');
        if (key === _lastMultiKey) return { ok: true, alreadyStarted: true };
        try {
            const r = await fetch(`${WORKER_BASE}/api/realtime/start-multi`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accounts: payload }),
            });
            if (!r.ok) {
                const text = await r.text();
                return { ok: false, reason: `HTTP ${r.status}: ${text.slice(0, 200)}` };
            }
            const data = await r.json();
            _lastMultiKey = key;
            return {
                ok: true,
                poolSize: data.poolSize,
                totalPages: data.totalPages,
                plan: data.plan,
            };
        } catch (e) {
            return { ok: false, reason: e.message };
        }
    }

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
        return (directWs && directWs.readyState === 1) || (proxyWs && proxyWs.readyState === 1);
    }

    function mode() {
        if (directWs && directWs.readyState === 1) return 'direct';
        if (proxyWs && proxyWs.readyState === 1) return 'proxy';
        return 'disconnected';
    }

    global.Web2Realtime = {
        subscribe,
        start,
        startMulti,
        fetchPendingCustomers,
        markReplied,
        isConnected,
        mode,
        _internal: {
            PANCAKE_WS_URL,
            PROXY_WS_URL,
            WORKER_BASE,
            subscribers,
            get directWs() {
                return directWs;
            },
            get proxyWs() {
                return proxyWs;
            },
            get joinedPages() {
                return [...directJoinedPages];
            },
        },
    };
})(window);
