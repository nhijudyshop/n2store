// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web2SmartCache — primitive cache stale-while-revalidate dùng chung Web 2.0
// =====================================================
//
// GỐC (2026-06-23): Mọi cache hiện có (Web2ProductsCache, Web2VariantsCache,
// Web2SuppliersCache, Web2CustomerStore) tự cài LẶP cùng một bộ máy:
//   IDB persist + TTL + stale-while-revalidate + Web2SSE invalidate +
//   echo-suppress (clientId) + debounced refresh + listeners + in-flight dedup.
// → ~1000 dòng gần trùng. Module này gom 1 NGUỒN; trang/feature mới chỉ cần
//   truyền `fetcher` (+ `topic` SSE tuỳ chọn) là có cache đầy đủ.
//
// Tham khảo concept: SWR / TanStack Query (stale-while-revalidate, dedup,
// background revalidate, focus refetch) nhưng viết thuần vanilla, không build step,
// bám đúng hạ tầng sẵn có (Web2IdbStore + Web2SSE).
//
// ─── 2 chế độ ───────────────────────────────────────────────────────────────
//
// 1) SINGLE — cache 1 giá trị (cả list / object):
//    const c = Web2SmartCache.create({
//      name: 'products',                 // namespace (IDB key + echo clientId)
//      topic: 'web2:products',           // SSE topic invalidate (tuỳ chọn)
//      fetcher: async () => [...],        // hàm tải dữ liệu
//      ttl: 5 * 60_000,                  // soft TTL → quá hạn = stale (revalidate nền)
//      maxAge: 24 * 60 * 60_000,         // hard TTL → persist cũ hơn thì bỏ
//      persist: true,                    // IDB persist (mặc định true)
//      swr: true,                        // stale-while-revalidate (mặc định true)
//      debounceMs: 400,                  // gom burst SSE/invalidate
//      applyEvent: (msg, cur) => undef,  // (advanced) patch tại chỗ từ payload SSE
//    });
//    await c.get();          // trả value (SWR: stale → trả ngay + revalidate nền)
//    c.peek();               // sync: value hiện có hoặc null (KHÔNG fetch)
//    await c.refresh();      // ép fetch mới
//    c.set(value);           // set thủ công sau mutation đã biết (skip echo kế)
//    c.mutate(v => next);    // optimistic update local
//    c.invalidate();         // đánh dấu stale (+ revalidate nền)
//    const off = c.subscribe((value, reason) => {...});
//    c.isReady(); c.isStale(); c.dispose();
//
// 2) KEYED — cache theo key (entity-by-id), LRU + TTL:
//    const c = Web2SmartCache.createKeyed({
//      name: 'customer',
//      fetcher: async (key) => ({...}),  // tải 1 entity theo key
//      topicFor: (key) => `web2:customer:${key}`, // SSE per-key (tuỳ chọn)
//      ttl, maxAge, maxEntries: 500,
//    });
//    await c.get(key); c.peek(key); await c.refresh(key);
//    c.set(key, val); c.invalidate(key | '*'); c.subscribe(cb); c.dispose();
//
// Lỗi: fetcher throw → KHÔNG vỡ; log warn + trả value cũ (hoặc null). Khớp hành vi
// các cache cũ (load fail → giữ data cũ).

(function (global) {
    'use strict';

    if (global.Web2SmartCache) return; // idempotent

    // ── Self-heal dependency: cache cần Web2IdbStore để persist. Vài trang load
    //    smart-cache nhưng không load idb-store → tự nạp bản shared (như
    //    Web2ProductsCache tự nạp API). Không có IDB → persist tắt, vẫn chạy memory.
    const _SELF_SRC =
        (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) ||
        '';
    let _idbStoreLoadPromise = null;
    function _ensureIdbStore() {
        if (global.Web2IdbStore) return Promise.resolve(true);
        if (_idbStoreLoadPromise) return _idbStoreLoadPromise;
        _idbStoreLoadPromise = new Promise((resolve) => {
            try {
                if (typeof document === 'undefined' || !_SELF_SRC) {
                    resolve(false);
                    return;
                }
                const url = new URL('web2-idb-store.js?v=20260623a', _SELF_SRC).href;
                const s = document.createElement('script');
                s.src = url;
                s.async = false;
                s.onload = () => resolve(!!global.Web2IdbStore);
                s.onerror = () => resolve(false);
                document.head.appendChild(s);
            } catch {
                resolve(false);
            }
        });
        return _idbStoreLoadPromise;
    }

    // ── clientId per-tab (echo-suppression): mutation của chính tab này phát SSE
    //    với data.by === clientId → bỏ qua, tránh self-refresh thừa.
    function _makeClientId(ns) {
        try {
            const key = `__w2sc_cid_${ns}`;
            const ex = sessionStorage.getItem(key);
            if (ex) return ex;
            const fresh =
                's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
            sessionStorage.setItem(key, fresh);
            return fresh;
        } catch {
            return 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        }
    }

    const DEFAULTS = {
        ttl: 5 * 60 * 1000, // 5 phút → stale
        maxAge: 24 * 60 * 60 * 1000, // 24h → persist hard-expire
        persist: true,
        swr: true,
        debounceMs: 400,
    };

    // =====================================================================
    // SINGLE-VALUE CACHE
    // =====================================================================
    function create(opts = {}) {
        const cfg = { ...DEFAULTS, ...opts };
        const name = String(cfg.name || '').trim();
        if (!name) throw new Error('Web2SmartCache.create: cần `name`');
        if (typeof cfg.fetcher !== 'function') {
            throw new Error('Web2SmartCache.create(' + name + '): cần fetcher() function');
        }
        const clientId = _makeClientId(name);

        const st = {
            value: undefined,
            has: false,
            fetchedAt: 0,
            inflight: null, // Promise dedup
            initialized: false,
            listeners: new Set(),
            sseUnsub: null,
            refreshTimer: null,
            disposed: false,
            persistLoaded: false,
        };

        // ── IDB persist (1 key 'main' dưới namespace smartcache:<name>) ──────
        let _idb = null;
        let _idbReady = null;
        function _getIdb() {
            if (!cfg.persist) return Promise.resolve(null);
            if (_idbReady) return _idbReady;
            _idbReady = _ensureIdbStore().then(() => {
                if (!global.Web2IdbStore) return null;
                try {
                    _idb = global.Web2IdbStore.open(`smartcache:${name}`);
                } catch {
                    _idb = null;
                }
                return _idb;
            });
            return _idbReady;
        }

        let _persistTimer = null;
        function _saveToPersist() {
            if (!cfg.persist) return;
            if (_persistTimer) clearTimeout(_persistTimer);
            _persistTimer = setTimeout(async () => {
                _persistTimer = null;
                try {
                    const idb = await _getIdb();
                    if (!idb || st.disposed) return;
                    await idb.set('main', { ts: st.fetchedAt || Date.now(), value: st.value });
                } catch (e) {
                    console.warn(`[Web2SmartCache:${name}] persist save fail:`, e.message);
                }
            }, 200);
        }

        async function _loadFromPersist() {
            if (!cfg.persist || st.persistLoaded) return false;
            st.persistLoaded = true;
            try {
                const idb = await _getIdb();
                if (!idb) return false;
                const obj = await idb.get('main');
                if (!obj || obj.value === undefined) return false;
                if (!obj.ts || Date.now() - obj.ts > cfg.maxAge) {
                    await idb.remove('main');
                    return false;
                }
                // Chỉ nhận persist nếu chưa có giá trị tươi hơn từ memory.
                if (!st.has) {
                    st.value = obj.value;
                    st.has = true;
                    st.fetchedAt = obj.ts;
                }
                return true;
            } catch (e) {
                console.warn(`[Web2SmartCache:${name}] persist load fail:`, e.message);
                return false;
            }
        }

        // ── listeners ───────────────────────────────────────────────────────
        function _emit(reason) {
            for (const cb of st.listeners) {
                try {
                    cb(st.value, reason);
                } catch (e) {
                    console.error(`[Web2SmartCache:${name}] listener error:`, e);
                }
            }
        }

        function isStale() {
            if (!st.has) return true;
            if (cfg.ttl <= 0) return true; // ttl<=0 = always-revalidate
            return Date.now() - st.fetchedAt > cfg.ttl;
        }

        // ── fetch + dedup ───────────────────────────────────────────────────
        function _revalidate(reason) {
            if (st.inflight) return st.inflight;
            st.inflight = (async () => {
                try {
                    const val = await cfg.fetcher();
                    if (st.disposed) return st.value;
                    st.value = val;
                    st.has = true;
                    st.fetchedAt = Date.now();
                    st.initialized = true;
                    _saveToPersist();
                    _emit(reason || 'fetch');
                    return val;
                } catch (e) {
                    console.warn(`[Web2SmartCache:${name}] fetch fail:`, e.message);
                    st.initialized = true; // đã chạy 1 lần (kể cả lỗi)
                    return st.has ? st.value : null; // giữ data cũ nếu có
                } finally {
                    st.inflight = null;
                }
            })();
            return st.inflight;
        }

        function _scheduleRevalidate(reason) {
            if (st.refreshTimer) clearTimeout(st.refreshTimer);
            st.refreshTimer = setTimeout(() => {
                st.refreshTimer = null;
                if (!st.disposed) _revalidate(reason);
            }, cfg.debounceMs);
        }

        // ── SSE invalidation ────────────────────────────────────────────────
        function _setupRealtime() {
            if (!cfg.topic || st.sseUnsub) return;
            if (!global.Web2SSE || typeof global.Web2SSE.subscribe !== 'function') return;
            try {
                st.sseUnsub = global.Web2SSE.subscribe(cfg.topic, (msg) => {
                    // echo-suppress CHÍNH XÁC: chỉ bỏ qua event do chính tab này phát
                    // (data.by === clientId). KHÔNG blanket-suppress theo thời gian —
                    // tránh nuốt nhầm mutation của tab/máy khác đến ngay sau set() local.
                    if (msg?.data?.by && msg.data.by === clientId) return;
                    // (advanced) patch tại chỗ từ payload nếu consumer cung cấp.
                    if (typeof cfg.applyEvent === 'function' && st.has) {
                        try {
                            const next = cfg.applyEvent(msg, st.value);
                            if (next !== undefined) {
                                st.value = next;
                                st.fetchedAt = Date.now();
                                _saveToPersist();
                                _emit('sse-apply');
                                return;
                            }
                        } catch (e) {
                            console.warn(`[Web2SmartCache:${name}] applyEvent fail:`, e.message);
                        }
                    }
                    _scheduleRevalidate('sse');
                });
            } catch (e) {
                console.warn(`[Web2SmartCache:${name}] SSE attach fail:`, e.message);
            }
        }

        // ── public API ──────────────────────────────────────────────────────
        async function get(o = {}) {
            const force = o.force === true;
            if (st.disposed) return st.has ? st.value : null;
            _setupRealtime();
            // Lần đầu: thử persist (SWR instant) trước khi await fetch.
            if (!st.has && !st.persistLoaded) {
                await _loadFromPersist();
                if (st.has && cfg.swr && !force) {
                    _emit('persist-restore');
                    _revalidate('revalidate'); // nền, không await
                    return st.value;
                }
            }
            if (st.has && !force && !isStale()) return st.value; // tươi
            if (st.has && !force && isStale() && cfg.swr) {
                _revalidate('revalidate'); // nền
                return st.value; // trả stale ngay
            }
            return _revalidate(force ? 'force' : 'fetch'); // cold / force / stale-no-swr
        }

        // init() = warmup tương thích các cache cũ (load persist + revalidate).
        async function init() {
            if (st.initialized && st.has) {
                _setupRealtime();
                return st.value;
            }
            return get();
        }

        function refresh() {
            return _revalidate('refresh');
        }

        function peek() {
            return st.has ? st.value : null;
        }

        // set thủ công sau khi đã biết giá trị mới (vd vừa POST thành công). SSE echo
        // của chính mutation này (nếu server fan-out) cùng lắm gây 1 refetch thừa,
        // KHÔNG sai — nên không blanket-suppress (tránh nuốt update tab khác).
        function set(value, reason) {
            st.value = value;
            st.has = true;
            st.fetchedAt = Date.now();
            st.initialized = true;
            _saveToPersist();
            _emit(reason || 'set');
            return value;
        }

        function mutate(fn, reason) {
            if (typeof fn !== 'function') return st.value;
            return set(fn(st.has ? st.value : null), reason || 'mutate');
        }

        function invalidate(o = {}) {
            st.fetchedAt = 0; // hoá stale
            if (o.revalidate !== false) _scheduleRevalidate('invalidate');
            else _emit('invalidate');
        }

        function subscribe(cb) {
            if (typeof cb !== 'function') return () => {};
            st.listeners.add(cb);
            return () => st.listeners.delete(cb);
        }

        function dispose() {
            st.disposed = true;
            if (st.refreshTimer) clearTimeout(st.refreshTimer);
            if (_persistTimer) clearTimeout(_persistTimer);
            if (st.sseUnsub) {
                try {
                    st.sseUnsub();
                } catch {}
                st.sseUnsub = null;
            }
            st.listeners.clear();
        }

        return {
            get,
            init,
            refresh,
            peek,
            set,
            mutate,
            invalidate,
            subscribe,
            isReady: () => st.initialized === true,
            isStale,
            dispose,
            clientId,
            _name: name,
        };
    }

    // =====================================================================
    // KEYED CACHE (entity-by-id, LRU + TTL). Memory-first; persist tuỳ chọn
    // (snapshot cả map dưới 1 IDB key).
    // =====================================================================
    function createKeyed(opts = {}) {
        const cfg = {
            ...DEFAULTS,
            persist: false, // keyed mặc định memory-only
            maxEntries: 500,
            ...opts,
        };
        const name = String(cfg.name || '').trim();
        if (!name) throw new Error('Web2SmartCache.createKeyed: cần `name`');
        if (typeof cfg.fetcher !== 'function') {
            throw new Error('Web2SmartCache.createKeyed(' + name + '): cần fetcher(key) function');
        }
        const clientId = _makeClientId(name);

        // key → { value, fetchedAt, inflight, sseUnsub }
        const entries = new Map(); // dùng insertion order làm LRU (Map giữ thứ tự)
        const listeners = new Set();
        let disposed = false;
        let _globalSseUnsub = null;
        let _globalSseTimer = null;

        function _touchLru(key) {
            // re-insert để đẩy key lên "mới nhất" cuối Map.
            const e = entries.get(key);
            if (!e) return;
            entries.delete(key);
            entries.set(key, e);
        }

        function _evictIfNeeded() {
            while (entries.size > cfg.maxEntries) {
                const oldestKey = entries.keys().next().value; // đầu Map = cũ nhất
                const e = entries.get(oldestKey);
                if (e && e.sseUnsub) {
                    try {
                        e.sseUnsub();
                    } catch {}
                }
                entries.delete(oldestKey);
            }
        }

        function _emit(key, value, reason) {
            for (const cb of listeners) {
                try {
                    cb(key, value, reason);
                } catch (e) {
                    console.error(`[Web2SmartCache:${name}] keyed listener error:`, e);
                }
            }
        }

        function _ensureEntry(key) {
            let e = entries.get(key);
            if (!e) {
                e = { value: undefined, has: false, fetchedAt: 0, inflight: null, sseUnsub: null };
                entries.set(key, e);
                _setupRealtimeFor(key, e);
                _evictIfNeeded();
            }
            return e;
        }

        // Per-key SSE: CHỈ khi có topicFor(key) (topic riêng từng entity, vd
        // web2:customer:<id>) → event của key nào revalidate đúng key đó. Topic
        // GLOBAL chung (cfg.topic) xử lý ở _setupGlobalRealtime (subscribe 1 lần,
        // lazy invalidate-all) — tránh refetch storm mọi key khi 1 entity đổi.
        function _setupRealtimeFor(key, e) {
            if (typeof cfg.topicFor !== 'function') return;
            const topic = cfg.topicFor(key);
            if (!topic || e.sseUnsub) return;
            if (!global.Web2SSE || typeof global.Web2SSE.subscribe !== 'function') return;
            try {
                let timer = null;
                e.sseUnsub = global.Web2SSE.subscribe(topic, (msg) => {
                    if (msg?.data?.by && msg.data.by === clientId) return;
                    if (timer) clearTimeout(timer);
                    timer = setTimeout(() => {
                        if (!disposed) _revalidate(key);
                    }, cfg.debounceMs);
                });
            } catch {}
        }

        // Global topic (cfg.topic, không có topicFor): 1 subscription cho cả cache.
        // Event bất kỳ → mark TẤT CẢ entry stale (lazy, get kế revalidate) thay vì
        // refetch ngay từng key → tránh storm N request khi 1 KH đổi.
        function _setupGlobalRealtime() {
            if (typeof cfg.topicFor === 'function' || !cfg.topic) return;
            if (_globalSseUnsub) return;
            if (!global.Web2SSE || typeof global.Web2SSE.subscribe !== 'function') return;
            try {
                _globalSseUnsub = global.Web2SSE.subscribe(cfg.topic, (msg) => {
                    if (msg?.data?.by && msg.data.by === clientId) return;
                    for (const e of entries.values()) e.fetchedAt = 0; // mark stale
                    if (_globalSseTimer) clearTimeout(_globalSseTimer);
                    _globalSseTimer = setTimeout(() => {
                        if (!disposed) _emit('*', null, 'sse-stale');
                    }, cfg.debounceMs);
                });
            } catch {}
        }

        function _isStale(e) {
            if (!e || !e.has) return true;
            if (cfg.ttl <= 0) return true; // ttl<=0 = always-revalidate
            return Date.now() - e.fetchedAt > cfg.ttl;
        }

        function _revalidate(key) {
            const e = _ensureEntry(key);
            if (e.inflight) return e.inflight;
            e.inflight = (async () => {
                try {
                    const val = await cfg.fetcher(key);
                    if (disposed) return e.value;
                    e.value = val;
                    e.has = true;
                    e.fetchedAt = Date.now();
                    _touchLru(key);
                    _emit(key, val, 'fetch');
                    return val;
                } catch (err) {
                    console.warn(`[Web2SmartCache:${name}] fetch(${key}) fail:`, err.message);
                    return e.has ? e.value : null;
                } finally {
                    e.inflight = null;
                }
            })();
            return e.inflight;
        }

        async function get(key, o = {}) {
            if (disposed) return null;
            const force = o.force === true;
            const e = _ensureEntry(key);
            if (e.has && !force && !_isStale(e)) {
                _touchLru(key);
                return e.value;
            }
            if (e.has && !force && _isStale(e) && cfg.swr) {
                _revalidate(key); // nền
                return e.value; // stale ngay
            }
            return _revalidate(key);
        }

        function peek(key) {
            const e = entries.get(key);
            return e && e.has ? e.value : null;
        }

        function refresh(key) {
            return _revalidate(key);
        }

        function set(key, value, reason) {
            const e = _ensureEntry(key);
            e.value = value;
            e.has = true;
            e.fetchedAt = Date.now();
            _touchLru(key);
            _emit(key, value, reason || 'set');
            return value;
        }

        function invalidate(key) {
            if (key === '*' || key === undefined) {
                for (const e of entries.values()) e.fetchedAt = 0;
                _emit('*', null, 'invalidate-all');
                return;
            }
            const e = entries.get(key);
            if (e) {
                e.fetchedAt = 0;
                _emit(key, e.has ? e.value : null, 'invalidate');
            }
        }

        function subscribe(cb) {
            if (typeof cb !== 'function') return () => {};
            listeners.add(cb);
            return () => listeners.delete(cb);
        }

        function dispose() {
            disposed = true;
            if (_globalSseUnsub) {
                try {
                    _globalSseUnsub();
                } catch {}
                _globalSseUnsub = null;
            }
            if (_globalSseTimer) clearTimeout(_globalSseTimer);
            for (const e of entries.values()) {
                if (e.sseUnsub) {
                    try {
                        e.sseUnsub();
                    } catch {}
                }
            }
            entries.clear();
            listeners.clear();
        }

        _setupGlobalRealtime(); // 1 subscription cho topic global (nếu có)

        return {
            get,
            peek,
            refresh,
            set,
            invalidate,
            subscribe,
            size: () => entries.size,
            keys: () => Array.from(entries.keys()),
            dispose,
            clientId,
            _name: name,
        };
    }

    global.Web2SmartCache = { create, createKeyed, _DEFAULTS: DEFAULTS };
})(typeof window !== 'undefined' ? window : globalThis);
