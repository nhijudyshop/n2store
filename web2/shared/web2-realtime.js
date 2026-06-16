// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// Web 2.0 — Realtime client (Pancake WS)
// =====================================================
//
// Realtime client — PROXY-ONLY (2026-06-16, DIRECT_DISABLED=true):
//   Luôn dùng broker `web2-realtime` (browser → wss://web2-realtime.onrender.com).
//   ĐÃ BỎ kết nối direct tới pancake.vn vì: browser user thật không có session
//   pancake.vn → direct luôn fail 1006 (log đỏ vô hại nhưng gây hiểu nhầm), và
//   broker đã giữ WS server-side tới Pancake 24/7 đủ 2 trang Live (Store+House).
//   Code direct mode giữ lại (gate bằng DIRECT_DISABLED) để bật lại nếu cần.
//
//   [LEGACY] DIRECT MODE (đã tắt): nối thẳng wss://pancake.vn join Phoenix
//   channels (users/multiple_pages/pages:{id}) — coverage = Pancake admin UI.
//
//   2) PROXY FALLBACK:
//      `wss://web2-realtime.onrender.com` — service Render Web 2.0 'web2-realtime'
//      (live-chat/server) giờ phục vụ CẢ relay Pancake→SSE LẪN WS broker cho
//      browser (folded 2026-06-16, Stage 1). Giữ WS server-side tới Pancake 24/7
//      theo trang đã chọn ở pancake-settings (Store + House). Hết phụ thuộc
//      service/project cũ n2store-realtime.
//
// Public API (mode-agnostic):
//   Web2Realtime.subscribe({ types, onEvent, debounceMs }) → { unsubscribe }
//   Web2Realtime.start({ pageIds })   — kicks the proxy broker for fallback
//   Web2Realtime.isConnected()        — true when direct OR proxy is live
//   Web2Realtime.fetchPendingCustomers() — unread inbox ban đầu = fetch Pancake
//      TRỰC TIẾP (Web2Chat), KHÔNG bảng pending_customers / KHÔNG Web 1.0.

(function (global) {
    'use strict';

    if (global.Web2Realtime) return;

    const PANCAKE_WS_URL = 'wss://pancake.vn/socket/websocket?vsn=2.0.0';
    // Broker = service Web 2.0 'web2-realtime' (đã fold WS broker + /api/realtime/
    // start-multi vào live-chat/server, Stage 1 2026-06-16). 1 nguồn URL = WEB2_CONFIG.REALTIME.
    const PROXY_HTTP_URL =
        (window.WEB2_CONFIG && window.WEB2_CONFIG.REALTIME) || 'https://web2-realtime.onrender.com';
    const PROXY_WS_URL = PROXY_HTTP_URL.replace(/^http/, 'ws'); // wss://web2-realtime.onrender.com
    // PROXY-ONLY: KHÔNG thử direct WS pancake.vn (luôn fail 1006 cho user thật +
    // broker web2-realtime đã phủ đủ). Đặt false để bật lại direct mode.
    const DIRECT_DISABLED = true;
    const WORKER_BASE =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';

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
    let directOpenedAt = 0; // 0 = never opened — handshake/auth failed
    let directHandshakeFailed = false; // sticky: stop retrying direct after 1st handshake failure

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
        // PROXY-ONLY: bỏ qua direct pancake.vn → vào thẳng broker web2-realtime.
        // Hết log đỏ "wss://pancake.vn failed 1006". Bật lại: DIRECT_DISABLED=false.
        if (DIRECT_DISABLED) {
            _connectProxy();
            return;
        }
        if (directWs && (directWs.readyState === 0 || directWs.readyState === 1)) return;
        // Sticky guard: nếu lần đầu handshake fail (JWT invalid / pancake reject) →
        // không retry direct nữa, chỉ dùng proxy. Tránh log "WS failed: 403" 4× mỗi lần
        // mount native-orders trong môi trường JWT hết hạn / test (Playwright).
        if (directHandshakeFailed) {
            _connectProxy();
            return;
        }
        // Test env / headless automation: skip direct WS to pancake.vn (sẽ luôn fail
        // do thiếu pancake.vn session cookies). Browser tự đặt navigator.webdriver=true
        // cho Playwright/Selenium/Puppeteer/CDP. Real user → undefined/false → fall through.
        if (typeof navigator !== 'undefined' && navigator.webdriver === true) {
            console.log('[Web2Realtime] webdriver detected → skipping direct WS, using proxy only');
            directHandshakeFailed = true;
            _connectProxy();
            return;
        }
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
            directOpenedAt = Date.now();
            directReconnectAttempts = 0;
            _startDirectHeartbeat();
            _joinDirectChannels();
        };

        directWs.onclose = (e) => {
            const neverOpened = directOpenedAt === 0;
            console.log(
                '[Web2Realtime] direct WS closed',
                e.code,
                neverOpened ? '(handshake failed — switching to proxy permanently)' : ''
            );
            _stopDirectHeartbeat();
            if (neverOpened) {
                // Code 1006 + never opened = TLS/HTTP handshake failed (403/401/network).
                // JWT invalid hoặc pancake từ chối kết nối → stop retry, dùng proxy.
                directHandshakeFailed = true;
                _connectProxy();
                return;
            }
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
            // 1 account → bọc thành accounts[] cho start-multi của web2-realtime
            // (KHÔNG còn /api/realtime/start đơn ở Web 1.0 fallback).
            const r = await fetch(`${PROXY_HTTP_URL}/api/realtime/start-multi`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accounts: [
                        {
                            accountId: auth.userId,
                            userId: auth.userId,
                            name: auth.userId ? String(auth.userId).slice(0, 8) : 'acc',
                            token: auth.jwt,
                            pageIds: ids,
                            cookie: `jwt=${auth.jwt}`,
                        },
                    ],
                }),
            });
            if (r.ok) _lastStartedKey = key;
            // Don't throw on failure — direct mode handles realtime,
            // proxy is just a backstop.
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
                const rawPages = Array.isArray(a.pages) ? a.pages : [];
                // Carry {id, name} pairs so the broker can persist labels
                // — pool-status response then shows "Nhi Judy House"
                // alongside the bare page id.
                const pages = rawPages
                    .map((p) => {
                        const id = String(p?.id || p?.page_id || p?.pageId || p || '');
                        if (!id) return null;
                        return { id, name: p?.name || p?.page_name || null };
                    })
                    .filter(Boolean);
                const pageIds = pages.map((p) => p.id);
                return {
                    accountId: String(a.account_id || a.id || userId),
                    name: a.name || tokenInfo.fb_name || null,
                    token: a.token,
                    userId,
                    pageIds,
                    pages,
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
            // POST thẳng tới broker web2-realtime (PROXY_HTTP_URL) — /api/realtime/
            // start-multi đã fold vào service này (Stage 1). CORS mở cho mọi origin.
            const r = await fetch(`${PROXY_HTTP_URL}/api/realtime/start-multi`, {
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

    // Unread inbox ban đầu = fetch Pancake TRỰC TIẾP 1 lần qua Web2Chat
    // (browser→worker→pancake.vn). KHÔNG còn bảng pending_customers, KHÔNG đụng
    // Web 1.0 (n2store-fallback). Live update sau đó do WS broker lo.
    // Quét các trang có page-access-token (Store/House/… đã cấu hình ở
    // pancake-settings); lọc client-side unread_count > 0.
    async function fetchPendingCustomers(limit = 100) {
        const chat = global.Web2Chat;
        if (!chat || typeof chat.fetchConversationsByPage !== 'function') {
            return { ok: false, reason: 'no_web2chat', customers: [] };
        }
        let pageIds = Object.keys(
            (typeof chat.getAllPageAccessTokens === 'function' && chat.getAllPageAccessTokens()) ||
                {}
        );
        if (!pageIds.length && typeof chat.listPages === 'function') {
            try {
                const lp = await chat.listPages();
                const arr = lp?.pages || lp || [];
                pageIds = (Array.isArray(arr) ? arr : [])
                    .map((p) => String(p.id || p.pageId || p))
                    .filter(Boolean);
            } catch {
                /* ignore */
            }
        }
        if (!pageIds.length) return { ok: false, reason: 'no_pages', customers: [] };
        const customers = [];
        for (const pageId of pageIds) {
            try {
                const r = await chat.fetchConversationsByPage(pageId, { limit });
                if (!r.ok) continue;
                for (const c of r.conversations || []) {
                    if (c.type && c.type !== 'INBOX') continue;
                    if (!(Number(c.unread_count) > 0)) continue;
                    const cust = (c.customers && c.customers[0]) || c.from || {};
                    const psid = cust.psid || cust.id || c.from?.id;
                    if (!psid || String(psid) === String(c.page_id || pageId)) continue;
                    customers.push({
                        psid: String(psid),
                        page_id: String(c.page_id || pageId),
                        customer_name: cust.name || c.from?.name || '',
                        last_message_snippet: c.snippet || '',
                        last_message_time:
                            c.updated_at || c.last_message?.inserted_at || Date.now(),
                        message_count: Number(c.unread_count) || 1,
                        type: 'INBOX',
                    });
                }
            } catch {
                /* page hiccup → continue */
            }
        }
        return { ok: true, customers };
    }

    // KHÔNG còn server-side pending table → mark-replied chỉ là LOCAL (badge tự
    // xoá khỏi list). Giữ chữ ký để caller không vỡ.
    async function markReplied() {
        return { ok: true, local: true };
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
