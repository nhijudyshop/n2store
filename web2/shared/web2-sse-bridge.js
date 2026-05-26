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
// CF Worker proxies /api/realtime/web2/* → n2store-fallback Render (handleRealtimeProxy).
//
// Public API:
//   Web2SSE.subscribe(topic, callback) → unsubscribe fn
//   Web2SSE.topics() → string[] of currently-subscribed topics
//   Web2SSE.close() → tear down EventSource
//
// Topic naming convention: `web2:<entity>` (eg `web2:products`, `web2:variants`,
// `web2:so-order`, `web2:supplier-wallet`).

(function (global) {
    'use strict';

    if (global.Web2SSE) return;

    const SSE_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime/web2/sse';
    const RECONNECT_BASE_MS = 1500;
    const RECONNECT_MAX_MS = 30000;

    // topic → Set<callback>
    const subscribers = new Map();
    let es = null;
    let reconnectAttempts = 0;
    let reconnectTimer = null;
    let lastConnectedAt = 0;

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
        if (!topics.length) return;
        const url = `${SSE_BASE}?keys=${encodeURIComponent(topics.join(','))}`;
        try {
            es = new EventSource(url);
        } catch (e) {
            console.warn('[Web2SSE] EventSource ctor failed:', e.message);
            _scheduleReconnect();
            return;
        }

        es.addEventListener('connected', () => {
            reconnectAttempts = 0;
            lastConnectedAt = Date.now();
        });

        const handleData = (eventType) => (ev) => {
            let payload = null;
            try {
                payload = JSON.parse(ev.data);
            } catch {
                return;
            }
            const topic = payload?.key;
            if (!topic) return;
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

    function topics() {
        return Array.from(subscribers.keys());
    }

    function close() {
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
        subscribers.clear();
    }

    // Pull-on-focus integration: when tab visible again after a long hide,
    // EventSource may have been suspended by browser. Force a fresh socket.
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && subscribers.size) {
                const since = Date.now() - lastConnectedAt;
                if (!es || es.readyState !== EventSource.OPEN || since > 60000) {
                    _openConnection();
                }
            }
        });
    }

    global.Web2SSE = { subscribe, topics, close };
})(typeof window !== 'undefined' ? window : globalThis);
