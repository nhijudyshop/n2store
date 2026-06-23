// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web2 Products — Shared cache (kho SP dùng chung)
// =====================================================
//
// Mục đích: dùng chung giữa "Kho SP Web 2.0" và mọi trang cần tra cứu SP
// (so-order, native-orders, …). Mỗi trang `await Web2ProductsCache.init()` 1 lần.
//
// 2026-06-23: bộ máy IDB persist + TTL + SWR + Web2SSE invalidate + dedup +
// listeners ĐÃ DELEGATE sang primitive `Web2SmartCache` (web2-smart-cache.js) thay
// vì tự cài lặp (~200 dòng IDB/SSE/SWR boilerplate gỡ bỏ). Domain logic (normalize,
// findByCode/findByName ranking, findByNameVariant, _upsertLocal/_removeLocal) GIỮ
// NGUYÊN. Public API KHÔNG đổi. Self-load Web2ProductsApi + Web2SmartCache nếu thiếu.
//
// Public API:
//   await Web2ProductsCache.init()       // load list + realtime (idempotent)
//   Web2ProductsCache.getAll()           // Array<Product>
//   Web2ProductsCache.findByCode(code)   // Product | null
//   Web2ProductsCache.findByName(q, n=8) // top-N gợi ý theo tên/mã (ranking)
//   Web2ProductsCache.findByNameExact(name)
//   Web2ProductsCache.findByNameVariant(name, variant)
//   Web2ProductsCache.has(code) / hasByName(name)
//   Web2ProductsCache.pushTickle(opts)   // gọi sau mỗi CRUD local
//   Web2ProductsCache.subscribe(cb)      // cb(reason) khi cache thay đổi
//   Web2ProductsCache.refresh()          // ép reload list từ API
//   Web2ProductsCache.isReady()
//   Web2ProductsCache._upsertLocal(p) / _removeLocal(code)

(function (global) {
    'use strict';

    if (global.Web2ProductsCache) return;

    const _SELF_SRC =
        (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) ||
        '';

    const state = {
        byCode: new Map(), // code → product
        list: [], // ordered snapshot
        listeners: new Set(),
        initialized: false,
        initPromise: null,
    };
    let _cache = null;

    function _normalize(text) {
        return String(text || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd')
            .trim();
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

    function _rebuild(list) {
        state.list = Array.isArray(list) ? list : [];
        state.byCode = new Map(state.list.map((p) => [p.code, p]));
    }

    // ── self-load Web2ProductsApi (vài trang load cache nhưng không load API) ──
    let _apiLoadPromise = null;
    function _ensureApiLoaded() {
        if (global.Web2ProductsApi) return Promise.resolve(true);
        if (_apiLoadPromise) return _apiLoadPromise;
        _apiLoadPromise = new Promise((resolve) => {
            try {
                if (typeof document === 'undefined' || !_SELF_SRC) {
                    resolve(false);
                    return;
                }
                const url = new URL('web2-products-api.js?v=20260620a', _SELF_SRC).href;
                const s = document.createElement('script');
                s.src = url;
                s.async = false;
                s.onload = () => resolve(!!global.Web2ProductsApi);
                s.onerror = () => resolve(false);
                document.head.appendChild(s);
            } catch {
                resolve(false);
            }
        });
        return _apiLoadPromise;
    }

    let _smartLoadPromise = null;
    function _ensureSmartCache() {
        if (global.Web2SmartCache) return Promise.resolve(true);
        if (_smartLoadPromise) return _smartLoadPromise;
        _smartLoadPromise = new Promise((resolve) => {
            try {
                if (typeof document === 'undefined' || !_SELF_SRC) {
                    resolve(false);
                    return;
                }
                const url = new URL('web2-smart-cache.js?v=20260623a', _SELF_SRC).href;
                const s = document.createElement('script');
                s.src = url;
                s.async = false;
                s.onload = () => resolve(!!global.Web2SmartCache);
                s.onerror = () => resolve(false);
                document.head.appendChild(s);
            } catch {
                resolve(false);
            }
        });
        return _smartLoadPromise;
    }

    async function _fetchProducts() {
        if (!global.Web2ProductsApi) await _ensureApiLoaded();
        if (!global.Web2ProductsApi) throw new Error('Web2ProductsApi missing');
        // Active + inactive — UI quyết định hiển thị. Pull tới 1000 SP/lần,
        // phân trang server-side đến hết (cap 20k).
        const all = [];
        let page = 1;
        const limit = 1000;
        while (true) {
            const resp = await global.Web2ProductsApi.list({ page, limit });
            const batch = Array.isArray(resp?.products) ? resp.products : [];
            all.push(...batch);
            if (!resp?.hasMore || batch.length === 0) break;
            page += 1;
            if (page > 20) break; // safety cap
        }
        return all;
    }

    function _getCache() {
        if (_cache) return _cache;
        _cache = global.Web2SmartCache.create({
            name: 'products',
            topic: 'web2:products',
            fetcher: _fetchProducts,
            ttl: 5 * 60 * 1000,
            maxAge: 24 * 60 * 60 * 1000, // 24h hard persist expire (như cũ)
            persist: true,
            debounceMs: 400,
        });
        _cache.subscribe((list) => {
            _rebuild(list || []);
            _emit('refresh');
        });
        return _cache;
    }

    async function init() {
        if (state.initialized) return state;
        if (state.initPromise) return state.initPromise;
        state.initPromise = (async () => {
            await _ensureSmartCache();
            if (global.Web2SmartCache) {
                try {
                    _rebuild(await _getCache().get()); // persist-instant + revalidate + SSE
                } catch (e) {
                    console.warn('[Web2ProductsCache] smart-cache init fail:', e.message);
                }
            } else {
                try {
                    _rebuild(await _fetchProducts());
                } catch (e) {
                    console.warn('[Web2ProductsCache] fallback fetch fail:', e.message);
                }
            }
            state.initialized = true;
            return state;
        })();
        return state.initPromise;
    }

    async function refresh() {
        if (_cache) {
            try {
                _rebuild(await _cache.refresh());
                _emit('refresh');
            } catch (e) {
                console.warn('[Web2ProductsCache] refresh fail:', e.message);
            }
            return;
        }
        try {
            _rebuild(await _fetchProducts());
            _emit('refresh');
        } catch (e) {
            console.warn('[Web2ProductsCache] refresh (fallback) fail:', e.message);
        }
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
        // Ranking heuristic (P1 2026-05-30): query ngắn (<4) gộp tier + sort theo
        // (stock+pending)*1000 + nameLen; query dài giữ tier order.
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

    // Strict name + variant match (badge so-order: biến thể "Đỏ" KHÔNG mượn nhầm
    // mã SP "Trắng" cùng tên). Không khớp → null.
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

    // Báo cache thay đổi sau CRUD local. Other clients/tabs nhận qua SSE 'web2:products'.
    async function pushTickle(_opts = {}) {
        _emit('local');
        if (_cache) _cache.invalidate();
    }

    function subscribe(callback) {
        if (typeof callback !== 'function') return () => {};
        state.listeners.add(callback);
        return () => state.listeners.delete(callback);
    }

    function _upsertLocal(product) {
        if (!product || !product.code) return;
        const list = state.list.slice();
        const idx = list.findIndex((p) => p.code === product.code);
        if (idx === -1) list.unshift(product);
        else list[idx] = product;
        if (_cache) _cache.set(list);
        else _rebuild(list);
    }

    function _removeLocal(code) {
        if (!code) return;
        const list = state.list.filter((p) => p.code !== code);
        if (_cache) _cache.set(list);
        else _rebuild(list);
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
        isReady: () => state.initialized === true,
        _upsertLocal,
        _removeLocal,
        _normalize,
    };
})(typeof window !== 'undefined' ? window : globalThis);
