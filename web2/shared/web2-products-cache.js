// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// Web2 Products — Shared cache + Firestore tickler realtime
// =====================================================
//
// Mục đích: dùng chung giữa "Kho SP Web 2.0" (web2-products) và mọi trang
// cần tra cứu sản phẩm (so-order, native-orders, …). Mỗi trang chỉ cần
// `await Web2ProductsCache.init()` 1 lần, sau đó:
//   - getAll() → mảng SP active
//   - findByCode(code), findByName(query), has(code), …
// CRUD đi qua `Web2ProductsApi`; sau khi mutate xong gọi
//   Web2ProductsCache.pushTickle({ action, code })
// để các client khác (và các tab khác cùng máy) tự reload cache.
//
// Realtime model:
//   - Tickler doc Firestore = `web2_products_sync/notify` chứa
//     `{ lastUpdated, by, action, code }`. Mỗi mutate ghi đè 4 field.
//   - Tất cả client mở snapshot listener; khi `by` ≠ chính mình → reload list.
//   - Cùng máy, các tab khác cũng nhận được snapshot → cache stale-while-revalidate.
//
// Public API:
//   await Web2ProductsCache.init()       // load list + bật listener (idempotent)
//   Web2ProductsCache.getAll()           // Array<Product>
//   Web2ProductsCache.findByCode(code)   // Product | null
//   Web2ProductsCache.findByName(q, n=8) // top-N gợi ý theo tên/mã
//   Web2ProductsCache.has(code)          // boolean
//   Web2ProductsCache.pushTickle(opts)   // gọi sau mỗi CRUD local
//   Web2ProductsCache.subscribe(cb)      // cb(reason) khi cache thay đổi
//   Web2ProductsCache.refresh()          // ép reload list từ API

(function (global) {
    'use strict';

    if (global.Web2ProductsCache) return; // idempotent

    const FIRESTORE_COLLECTION = 'web2_products_sync';
    const FIRESTORE_DOC = 'notify';
    const REFRESH_DEBOUNCE_MS = 400;

    const state = {
        byCode: new Map(), // code → product
        list: [], // ordered snapshot
        listeners: new Set(),
        initialized: false,
        initPromise: null,
        clientId: _generateClientId(),
        db: null,
        unsubscribe: null,
        lastSeenTickle: 0,
        refreshTimer: null,
    };

    function _generateClientId() {
        try {
            const key = '__web2ProductsCacheClientId';
            const existing = sessionStorage.getItem(key);
            if (existing) return existing;
            const fresh =
                'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
            sessionStorage.setItem(key, fresh);
            return fresh;
        } catch {
            return 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        }
    }

    function _normalize(text) {
        return String(text || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd')
            .trim();
    }

    function _ensureApi() {
        if (!global.Web2ProductsApi) {
            console.warn('[Web2ProductsCache] Web2ProductsApi missing — không thể tải kho SP');
            return false;
        }
        return true;
    }

    // C8-cleanup (2026-06-13): _ensureFirestore() ĐÃ GỠ — Firestore tickle bỏ từ
    // 2026-05-29 (realtime qua SSE `web2:products`), hàm này không còn caller → dead.

    // P1 2026-05-30: Persistent cache → IndexedDB (chuyển từ localStorage).
    // Lý do: localStorage limit 5-10MB, sync API block main thread; IndexedDB
    // 50% disk available, async (chỉ tốn ~10-30ms), structured clone (giữ
    // type Date, Map nếu cần sau này). Page reload → load IDB (sub-50ms) →
    // initialized=true → background HTTP fetch revalidate qua SSE.
    //
    // Migrate path: nếu thấy key `web2ProductsCache_v1` ở localStorage cũ →
    // import vào IDB rồi xóa localStorage entry.
    const LEGACY_LS_KEY = 'web2ProductsCache_v1';
    const IDB_NAME = 'web2_cache';
    const IDB_VERSION = 1;
    const IDB_STORE = 'kv';
    const IDB_KEY_PRODUCTS = 'products';
    const PERSIST_TTL_MS = 24 * 60 * 60 * 1000; // 24h hard expire

    let _idbPromise = null;
    function _openIdb() {
        if (_idbPromise) return _idbPromise;
        _idbPromise = new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                reject(new Error('IndexedDB unavailable'));
                return;
            }
            const req = indexedDB.open(IDB_NAME, IDB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
            req.onblocked = () => reject(new Error('IDB open blocked'));
        }).catch((e) => {
            console.warn('[Web2ProductsCache] IDB open failed:', e.message);
            _idbPromise = null;
            return null;
        });
        return _idbPromise;
    }

    function _idbGet(db, key) {
        return new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(IDB_STORE, 'readonly');
                const store = tx.objectStore(IDB_STORE);
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    function _idbSet(db, key, value) {
        return new Promise((resolve, reject) => {
            try {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                const store = tx.objectStore(IDB_STORE);
                const req = store.put(value, key);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            } catch (e) {
                reject(e);
            }
        });
    }

    // Migrate localStorage legacy → IDB rồi xóa key cũ. Idempotent.
    async function _migrateLegacyLsToIdb() {
        try {
            const raw = localStorage.getItem(LEGACY_LS_KEY);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            localStorage.removeItem(LEGACY_LS_KEY);
            if (!obj || !Array.isArray(obj.list)) return null;
            const db = await _openIdb();
            if (db) await _idbSet(db, IDB_KEY_PRODUCTS, obj);
            return obj;
        } catch (e) {
            console.warn('[Web2ProductsCache] LS→IDB migrate failed:', e.message);
            return null;
        }
    }

    async function _loadFromPersist() {
        try {
            const db = await _openIdb();
            let obj = db ? await _idbGet(db, IDB_KEY_PRODUCTS) : null;
            // Fallback: thử migrate từ localStorage cũ
            if (!obj || !Array.isArray(obj.list)) {
                obj = await _migrateLegacyLsToIdb();
            }
            if (!obj || !Array.isArray(obj.list)) return false;
            if (!obj.ts || Date.now() - obj.ts > PERSIST_TTL_MS) {
                if (db) await _idbSet(db, IDB_KEY_PRODUCTS, null);
                return false;
            }
            state.list = obj.list;
            state.byCode = new Map(obj.list.map((p) => [p.code, p]));
            return obj.list.length;
        } catch (e) {
            console.warn('[Web2ProductsCache] persist load failed:', e.message);
            return false;
        }
    }

    let _persistDebounceTimer = null;
    function _saveToPersist() {
        if (_persistDebounceTimer) clearTimeout(_persistDebounceTimer);
        _persistDebounceTimer = setTimeout(async () => {
            _persistDebounceTimer = null;
            try {
                const db = await _openIdb();
                if (!db) return;
                const payload = { ts: Date.now(), list: state.list };
                await _idbSet(db, IDB_KEY_PRODUCTS, payload);
            } catch (e) {
                console.warn('[Web2ProductsCache] persist save failed:', e.message);
            }
        }, 200);
    }

    async function _loadList() {
        if (!_ensureApi()) return;
        try {
            // Active + inactive both — UI quyết định hiển thị. Pull up
            // tới 1000 SP/lần để cover toàn bộ kho hiện tại; phân trang
            // server-side đến khi hết.
            const all = [];
            let page = 1;
            const limit = 1000;
            while (true) {
                const resp = await global.Web2ProductsApi.list({ page, limit });
                const batch = Array.isArray(resp?.products) ? resp.products : [];
                all.push(...batch);
                if (!resp?.hasMore || batch.length === 0) break;
                page += 1;
                if (page > 20) break; // safety cap 20k SP
            }
            state.list = all;
            state.byCode = new Map(all.map((p) => [p.code, p]));
            _saveToPersist();
            _emit('refresh');
        } catch (e) {
            console.warn('[Web2ProductsCache] load failed:', e.message);
        }
    }

    function _emit(reason) {
        state.listeners.forEach((cb) => {
            try {
                cb(reason);
            } catch (e) {
                console.error('[Web2ProductsCache] listener error:', e);
            }
        });
    }

    function _scheduleRefresh(reason) {
        if (state.refreshTimer) clearTimeout(state.refreshTimer);
        state.refreshTimer = setTimeout(async () => {
            state.refreshTimer = null;
            await _loadList();
        }, REFRESH_DEBOUNCE_MS);
        if (reason) _emit(reason);
    }

    function _setupRealtime() {
        // SSE bridge only (server pub/sub on Render). Firestore tickle fallback
        // removed 2026-05-29 — SSE production verified stable từ 2026-05-19.
        // Nếu SSE bridge chưa load (race condition), cache vẫn hoạt động qua
        // _scheduleRefresh thủ công từ pushTickle().
        if (global.Web2SSE && typeof global.Web2SSE.subscribe === 'function') {
            state.unsubscribe = global.Web2SSE.subscribe('web2:products', (msg) => {
                // Don't refresh on our own echo.
                if (msg?.data?.by && msg.data.by === state.clientId) return;
                _scheduleRefresh('sse');
            });
        } else {
            console.warn(
                '[Web2ProductsCache] Web2SSE bridge not loaded — realtime updates disabled. Manual refresh required.'
            );
        }
    }

    async function init() {
        if (state.initialized) return state;
        if (state.initPromise) return state.initPromise;
        // P1 2026-05-30: Stale-while-revalidate — load IDB persist trước khi
        // await HTTP fetch. IDB read ~10-30ms (vs 200-1500ms HTTP cold). Khi
        // có persist: initialized=true ngay sau read → background fetch
        // revalidate; không có persist → fallback fetch HTTP như cũ.
        state.initPromise = (async () => {
            const persistCount = await _loadFromPersist();
            if (persistCount) {
                state.initialized = true;
                _setupRealtime();
                _emit('persist-restore');
                // Background revalidate — không await trong init promise.
                _loadList().catch((e) =>
                    console.warn('[Web2ProductsCache] revalidate fail:', e.message)
                );
                return state;
            }
            // Cold start — fetch HTTP rồi setup realtime.
            await _loadList();
            _setupRealtime();
            state.initialized = true;
            return state;
        })();
        return state.initPromise;
    }

    async function refresh() {
        await _loadList();
    }

    function getAll() {
        return state.list.slice();
    }

    function findByCode(code) {
        if (!code) return null;
        return state.byCode.get(String(code).trim()) || null;
    }

    function findByName(query, limit = 8) {
        const q = _normalize(query);
        if (!q) return [];
        const exact = [];
        const startsWith = [];
        const contains = [];
        for (const p of state.list) {
            const name = _normalize(p.name);
            const code = _normalize(p.code);
            if (name === q || code === q) exact.push(p);
            else if (name.startsWith(q) || code.startsWith(q)) startsWith.push(p);
            else if (name.includes(q) || code.includes(q)) contains.push(p);
            if (exact.length + startsWith.length + contains.length > limit * 4) break;
        }
        // P1 2026-05-30: ranking heuristic — user feedback gõ "b4" trả SP cũ
        // tên ngắn "B4" stock=1 lên top thay vì SP đầy đủ "2000 QUAN test
        // nhap b4" stock=6.
        //
        // Cách fix:
        //   - Query NGẮN (<4 chars) → gộp tất cả tier + sort theo composite
        //     score (stock + name length). Tên ngắn = q exact match KHÔNG
        //     ưu tiên vì nó thường là noise (SP cũ test, code rút gọn).
        //   - Query DÀI (>=4 chars) → giữ tier order (exact → startsWith →
        //     contains) vì user gõ tên đầy đủ chủ ý.
        //   - Trong cùng tier: sort theo (stock + pending) * 1000 + nameLen.
        const scoreFor = (p) => {
            const s = Number(p.stock) || 0;
            const pq = Number(p.pendingQty) || 0;
            const nameLen = String(p.name || '').length;
            return (s + pq) * 1000 + nameLen;
        };
        if (q.length < 4) {
            const all = [...exact, ...startsWith, ...contains];
            all.sort((a, b) => scoreFor(b) - scoreFor(a));
            return all.slice(0, limit);
        }
        const sortTier = (arr) => arr.sort((a, b) => scoreFor(b) - scoreFor(a));
        sortTier(exact);
        sortTier(startsWith);
        sortTier(contains);
        return [...exact, ...startsWith, ...contains].slice(0, limit);
    }

    function has(code) {
        return state.byCode.has(String(code || '').trim());
    }

    function hasByName(name) {
        const q = _normalize(name);
        if (!q) return false;
        for (const p of state.list) {
            if (_normalize(p.name) === q) return true;
        }
        return false;
    }

    function findByNameExact(name) {
        const q = _normalize(name);
        if (!q) return null;
        for (const p of state.list) {
            if (_normalize(p.name) === q) return p;
        }
        return null;
    }

    // Strict name + variant match. Trả SP CHỈ khi khớp ĐÚNG cả tên lẫn biến thể
    // (so sánh normalized; biến thể rỗng/null xem như nhau). Dùng cho badge so-order:
    // hàng biến thể "Đỏ" KHÔNG được mượn nhầm mã SP "Trắng" cùng tên (findByNameExact
    // bỏ qua biến thể). Không khớp → null (UI để trống tới khi SP đúng biến thể tồn tại).
    function findByNameVariant(name, variant) {
        const qn = _normalize(name);
        if (!qn) return null;
        const qv = _normalize(variant);
        for (const p of state.list) {
            if (_normalize(p.name) !== qn) continue;
            if (_normalize(p.variant) === qv) return p;
        }
        return null;
    }

    /**
     * Báo cho các client/tab khác là kho SP vừa thay đổi.
     * Gọi sau khi POST/PATCH/DELETE thành công ở client hiện tại.
     */
    async function pushTickle(_opts = {}) {
        // Refresh local trước cho UI hiện tại.
        _scheduleRefresh('local');
        // Firestore tickle write removed 2026-05-29. Server-side notify SSE
        // topic 'web2:products' đã hoạt động ổn định. Other clients SẼ nhận
        // qua SSE bridge — không cần Firestore tickle redundant nữa.
    }

    function subscribe(callback) {
        if (typeof callback !== 'function') return () => {};
        state.listeners.add(callback);
        return () => state.listeners.delete(callback);
    }

    function _upsertLocal(product) {
        if (!product || !product.code) return;
        state.byCode.set(product.code, product);
        const idx = state.list.findIndex((p) => p.code === product.code);
        if (idx === -1) state.list.unshift(product);
        else state.list[idx] = product;
        _saveToPersist();
    }

    function _removeLocal(code) {
        if (!code) return;
        state.byCode.delete(code);
        state.list = state.list.filter((p) => p.code !== code);
        _saveToPersist();
    }

    global.Web2ProductsCache = {
        init,
        refresh,
        getAll,
        findByCode,
        findByName,
        findByNameExact,
        findByNameVariant,
        has,
        hasByName,
        pushTickle,
        subscribe,
        // P1 2026-05-30: expose flag init xong (kể cả khi list rỗng).
        // Caller cần biết "cache đã chạy 1 lần fetch xong" vs "list rỗng vì
        // kho thật sự rỗng" để pick fast-path (no loading).
        isReady: () => state.initialized === true,
        _upsertLocal,
        _removeLocal,
        _normalize,
    };
})(typeof window !== 'undefined' ? window : globalThis);
