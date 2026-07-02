// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — SSE Bridge (replace Firestore tickle listeners)
// =====================================================
//
// Single EventSource multiplexed across multiple topics. Replaces per-store
// Firestore onSnapshot tickles → save Firestore reads/writes, reduce flicker.
//
// Server side (TÁCH RIÊNG khỏi Web 1.0 từ 2026-05-26):
//   render.com/routes/realtime-sse-web2.js — notifyClients(topic, data, eventType)
//   Endpoint: /api/realtime/web2/sse?keys=web2:foo,web2:bar
// CF Worker (isWeb2Path) proxies /api/realtime/web2/* → web2-api Render (nơi GIỮ SSE
// client thật). n2store-fallback chỉ HTTP-relay notify Web 2.0 phát sinh ở Web 1.0
// (SePay→ví KH) qua /sse/relay-notify; cross-instance web2-api↔web2-api = Postgres
// LISTEN/NOTIFY (channel web2_sse). Xem realtime-sse-web2.js header.
//
// Public API:
//   Web2SSE.subscribe(topic, callback) → unsubscribe fn
//   Web2SSE.subscribeReload(topic|topic[], reloadFn, {debounce=500}) → unsub
//       (subscribe + debounce reload — 1 nguồn thay boilerplate clearTimeout/setTimeout)
//   Web2SSE.topics() → string[] of currently-subscribed topics
//   Web2SSE.close() → tear down EventSource
//
// Topic naming convention: `web2:<entity>` (eg `web2:products`, `web2:variants`,
// `web2:so-order`, `web2:supplier-wallet`).

(function (global) {
    'use strict';

    if (global.Web2SSE) return;

    // 1 nguồn base-URL = WEB2_CONFIG.REALTIME_SSE (web2-auth.js); literal chỉ là fallback
    // cho trang không load web2-auth (vd context ngoài web2).
    const SSE_BASE =
        global.WEB2_CONFIG?.REALTIME_SSE ||
        'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime/web2/sse';
    const RECONNECT_BASE_MS = 1500;
    const RECONNECT_MAX_MS = 30000;

    // topic → Set<callback>
    const subscribers = new Map();
    let es = null;
    let reconnectAttempts = 0;
    let reconnectTimer = null;
    let lastConnectedAt = 0;
    // MEDIUM-cleanup (2026-06-13): track thời điểm nhận event GẦN NHẤT (không phải
    // chỉ lúc connect). Refocus check dùng cái này để chỉ force-reopen khi THẬT SỰ
    // im lặng quá lâu, tránh reopen mỗi >60s dù connection vẫn sống & nhận event.
    let lastEventAt = 0;
    // reload-on-reconnect (2026-06-13): sau khi SSE đứt (deploy backend restart, mạng
    // chập) rồi nối lại, server KHÔNG replay event đã phát trong cửa sổ đứt → page hiển
    // thị data cũ ("data không sync" khi deploy backend dày). Khi reconnect, bắn synthetic
    // event 'resync' để mọi page re-fetch 1 lần. Bỏ qua reopen do đổi topic (không mất data).
    let everConnected = false;
    let suppressResyncOnce = false;
    // C16 (2026-06-13): tập topic của EventSource đang mở (sorted CSV) — tránh
    // reopen khi tập không đổi. Cập nhật trong _openConnection.
    let _prevTopicsStr = '';

    function _dispatchResync() {
        for (const [topic, subs] of subscribers) {
            if (!subs || !subs.size) continue;
            for (const cb of subs) {
                try {
                    cb({
                        topic,
                        eventType: 'resync',
                        data: null,
                        timestamp: Date.now(),
                        resync: true,
                    });
                } catch (e) {
                    console.error('[Web2SSE] resync subscriber error', e);
                }
            }
        }
    }

    // Coalesce nhiều trigger resync trong cửa sổ ngắn → 1 đợt re-fetch. Round-2 (2026-06-22):
    // server resync-on-relisten + client reconnect-resync + liveness-ping false-positive có
    // thể chồng nhau → tránh thundering-herd (mọi subscriber re-fetch nhiều lần). Trailing 250ms.
    let _resyncTimer = null;
    function _scheduleResync() {
        if (_resyncTimer) return;
        _resyncTimer = setTimeout(() => {
            _resyncTimer = null;
            _dispatchResync();
        }, 250);
    }

    function _openConnection() {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        if (es) {
            try {
                es.close();
            } catch (_) {}
            es = null;
        }
        const topics = Array.from(subscribers.keys());
        if (!topics.length) {
            _prevTopicsStr = '';
            return;
        }
        _prevTopicsStr = topics.slice().sort().join(','); // C16: nhớ tập topic đang mở
        const url = `${SSE_BASE}?keys=${encodeURIComponent(topics.join(','))}`;
        try {
            es = new EventSource(url);
        } catch (e) {
            console.warn('[Web2SSE] EventSource ctor failed:', e.message);
            _scheduleReconnect();
            return;
        }

        es.addEventListener('connected', () => {
            const isReconnect = everConnected;
            everConnected = true;
            reconnectAttempts = 0;
            lastConnectedAt = Date.now();
            lastEventAt = Date.now();
            // Chỉ resync khi đây là LẦN NỐI LẠI (đứt rồi lên), KHÔNG phải connect đầu
            // tiên, và KHÔNG phải reopen do đổi topic (suppressResyncOnce).
            if (isReconnect && !suppressResyncOnce) {
                _scheduleResync();
            }
            suppressResyncOnce = false;
        });

        const handleData = (eventType) => (ev) => {
            lastEventAt = Date.now(); // MEDIUM-cleanup (2026-06-13): connection còn sống
            let payload = null;
            try {
                payload = JSON.parse(ev.data);
            } catch {
                return;
            }
            const topic = payload?.key;
            if (!topic) return;
            // Exact-match dispatch. Wildcard ':*' subscribers (vd 'web2:wallet:*') được
            // SERVER fan-out tới (server-side prefix-match trong _localNotify, 2026-06-22)
            // với payload.key = ĐÚNG key '*' đã subscribe → exact-match ở đây luôn đúng.
            const subs = subscribers.get(topic);
            if (!subs || !subs.size) return;
            for (const cb of subs) {
                try {
                    cb({ topic, eventType, data: payload.data, timestamp: payload.timestamp });
                } catch (e) {
                    console.error('[Web2SSE] subscriber error', e);
                }
            }
        };
        // realtime-sse.js emits 'update', 'deleted', 'created'. Also handle generic.
        es.addEventListener('update', handleData('update'));
        es.addEventListener('created', handleData('created'));
        es.addEventListener('deleted', handleData('deleted'));
        es.addEventListener('change', handleData('change'));
        // 1D FIX (2026-06-12): POST /sse/test phát eventType 'test' — bridge
        // không nghe làm recipe verify CLAUDE.md false-negative ("curl thấy
        // event mà page im lặng").
        es.addEventListener('test', handleData('test'));
        // Rank 2 (2026-06-22): server bắn 'resync' khi LISTEN client (cross-instance)
        // nối lại sau khi mất → browser re-fetch toàn bộ (bù event bỏ lỡ trong cửa sổ
        // rớt — lúc đó socket SSE KHÔNG đứt nên reconnect-resync phía client không fire).
        es.addEventListener('resync', () => {
            lastEventAt = Date.now();
            _scheduleResync();
        });
        // Rank 5 (2026-06-22): heartbeat NAMED event 30s → CHỈ bump lastEventAt (biết
        // connection còn sống), KHÔNG dispatch tới subscriber. Trước server gửi comment
        // ':heartbeat' EventSource nuốt im → lastEventAt không nhúc nhích → refocus
        // tưởng im lặng > 60s → reopen-storm (resync + reload toàn bộ) trên tab quiet còn sống.
        es.addEventListener('heartbeat', () => {
            lastEventAt = Date.now();
        });

        es.onerror = () => {
            // EventSource auto-reconnects, but if connection is closed by
            // server or proxy, we force a fresh socket with up-to-date
            // topic list (subscriber set may have changed).
            if (es && es.readyState === EventSource.CLOSED) {
                _scheduleReconnect();
            }
        };
    }

    function _scheduleReconnect() {
        if (reconnectTimer) return;
        // audit r6 (2026-06-21): reconnect theo lịch = ĐỨT MẠNG thật (không phải
        // reopen do đổi topic). Nếu reopen-đổi-topic set suppressResyncOnce=true rồi
        // EventSource lỗi NGAY trước 'connected' → cờ kẹt true, lần connect lại bỏ
        // qua resync → trang stale. Xoá cờ ở đây để reconnect thật luôn resync.
        suppressResyncOnce = false;
        reconnectAttempts++;
        const delay = Math.min(
            RECONNECT_BASE_MS * Math.pow(1.6, reconnectAttempts - 1),
            RECONNECT_MAX_MS
        );
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            _openConnection();
        }, delay);
    }

    function _refreshConnectionForTopicChange() {
        // Topic set changed → reopen EventSource with new keys param.
        // Debounce 50ms in case caller subscribes multiple topics in a row.
        if (_refreshConnectionForTopicChange._t) {
            clearTimeout(_refreshConnectionForTopicChange._t);
        }
        _refreshConnectionForTopicChange._t = setTimeout(() => {
            _refreshConnectionForTopicChange._t = null;
            // C16 (2026-06-13): chỉ reopen khi tập topic THỰC SỰ đổi so với lần
            // connect gần nhất. Tránh churn (close+open EventSource + reattach
            // listeners) khi subscribe/unsubscribe gộp lại không đổi tập topic
            // (vd subscribe rồi unsubscribe trong cửa sổ debounce; hoặc đã có
            // EventSource đúng keys rồi). _prevTopicsStr cập nhật ở _openConnection.
            const topicsStr = Array.from(subscribers.keys()).sort().join(',');
            if (topicsStr === _prevTopicsStr && es && es.readyState !== 2 /* CLOSED */) {
                return;
            }
            // Reopen vì đổi topic (server vẫn sống suốt) → KHÔNG mất data → đừng resync.
            suppressResyncOnce = true;
            _openConnection();
        }, 50);
    }

    function subscribe(topic, callback) {
        if (typeof topic !== 'string' || !topic.trim()) return () => {};
        if (typeof callback !== 'function') return () => {};
        topic = topic.trim();
        let set = subscribers.get(topic);
        if (!set) {
            set = new Set();
            subscribers.set(topic, set);
            _refreshConnectionForTopicChange();
        }
        set.add(callback);
        return function unsubscribe() {
            const s = subscribers.get(topic);
            if (!s) return;
            s.delete(callback);
            if (!s.size) {
                subscribers.delete(topic);
                _refreshConnectionForTopicChange();
            }
        };
    }

    // subscribeReload(topics, reloadFn, opts?) — subscribe + DEBOUNCE reload. Thay
    // boilerplate `clearTimeout(t); t=setTimeout(load,500)` + subscribe lặp ở ~15
    // page-app: gom burst event (nhiều mutation liên tiếp → CHỈ 1 reload). topics =
    // string HOẶC string[]. opts.debounce mặc định 500ms (trailing). Trả unsub (tự
    // clear timer + unsubscribe mọi topic).
    function subscribeReload(topicOrList, reloadFn, opts) {
        if (typeof reloadFn !== 'function') return function () {};
        const delay = (opts && Number(opts.debounce)) || 500;
        const list = Array.isArray(topicOrList) ? topicOrList : [topicOrList];
        let timer = null;
        function schedule() {
            clearTimeout(timer);
            timer = setTimeout(function () {
                timer = null;
                try {
                    reloadFn();
                } catch (e) {
                    console.error('[Web2SSE] subscribeReload reload error', e);
                }
            }, delay);
        }
        const unsubs = list.map(function (t) {
            return subscribe(t, schedule);
        });
        return function () {
            clearTimeout(timer);
            timer = null;
            unsubs.forEach(function (u) {
                if (u) u();
            });
        };
    }

    function topics() {
        return Array.from(subscribers.keys());
    }

    function close() {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        if (_resyncTimer) {
            clearTimeout(_resyncTimer);
            _resyncTimer = null;
        }
        if (es) {
            try {
                es.close();
            } catch (_) {}
            es = null;
        }
        subscribers.clear();
    }

    // Pull-on-focus integration: when tab visible again after a long hide,
    // EventSource may have been suspended by browser. Force a fresh socket.
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && subscribers.size) {
                // MEDIUM-cleanup (2026-06-13): dùng lastEventAt (event gần nhất) thay
                // vì lastConnectedAt (lúc connect) → chỉ reopen khi im lặng quá lâu
                // THẬT SỰ, không force-reopen connection đang sống & nhận event đều.
                const since = Date.now() - (lastEventAt || lastConnectedAt);
                // Rank 5 (2026-06-22): heartbeat NAMED event giờ bump lastEventAt mỗi 30s
                // nên 'since' chỉ lớn khi connection THẬT SỰ chết. Ngưỡng 90s = 3 nhịp
                // heartbeat margin → 1 nhịp rớt do hiccup KHÔNG gây reopen oan. Reopen chỉ
                // khi socket không còn OPEN, hoặc im lặng vượt 90s (suspended/half-open thật).
                if (!es || es.readyState !== EventSource.OPEN || since > 90000) {
                    _openConnection();
                }
            }
        });
    }

    global.Web2SSE = { subscribe, subscribeReload, topics, close };
})(typeof window !== 'undefined' ? window : globalThis);
