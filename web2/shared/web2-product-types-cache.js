// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web2 Product Types — Shared cache (LOẠI sản phẩm dùng chung)
// =====================================================
//
// Dùng chung giữa trang quản lý Loại SP (web2/product-types), Kho SP
// (web2/products), Sổ Order (so-order). 1 nguồn duy nhất; mọi trang init() rồi
// pick loại. Delegate fetch/SSE/dedup/IDB sang primitive Web2SmartCache.
//
// Public API:
//   await Web2ProductTypesCache.init()
//   Web2ProductTypesCache.getAll()                 // Array<Type> active
//   Web2ProductTypesCache.getAllIncludingInactive()
//   Web2ProductTypesCache.findByName(q, limit=20)
//   Web2ProductTypesCache.has(name)
//   Web2ProductTypesCache.pushTickle({action})
//   Web2ProductTypesCache.subscribe(cb)
//   Web2ProductTypesCache.refresh()

(function (global) {
    'use strict';

    if (global.Web2ProductTypesCache) return;

    const _SELF_SRC =
        (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) ||
        '';

    const state = {
        all: [],
        byNameLower: new Map(),
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
                console.error('[Web2ProductTypesCache] listener error:', e);
            }
        });
    }

    function _rebuild(all) {
        state.all = Array.isArray(all) ? all : [];
        state.byNameLower = new Map(
            state.all.filter((t) => t.isActive).map((t) => [_normalize(t.name), t])
        );
    }

    async function _fetchTypes() {
        if (!global.Web2ProductTypesApi) throw new Error('Web2ProductTypesApi missing');
        const all = [];
        let page = 1;
        while (true) {
            const resp = await global.Web2ProductTypesApi.list({ page, limit: 2000 });
            const batch = Array.isArray(resp?.types) ? resp.types : [];
            all.push(...batch);
            if (!resp?.hasMore || batch.length === 0) break;
            page += 1;
            if (page > 10) break;
        }
        return all;
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

    function _getCache() {
        if (_cache) return _cache;
        _cache = global.Web2SmartCache.create({
            name: 'product-types',
            topic: 'web2:product-types',
            fetcher: _fetchTypes,
            ttl: 5 * 60 * 1000,
            persist: true,
            debounceMs: 400,
        });
        _cache.subscribe((all) => {
            _rebuild(all || []);
            _emit('cache');
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
                    _rebuild(await _getCache().get());
                } catch (e) {
                    console.warn('[Web2ProductTypesCache] smart-cache init fail:', e.message);
                }
            } else {
                try {
                    _rebuild(await _fetchTypes());
                } catch (e) {
                    console.warn('[Web2ProductTypesCache] fallback fetch fail:', e.message);
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
                console.warn('[Web2ProductTypesCache] refresh fail:', e.message);
            }
            return;
        }
        try {
            _rebuild(await _fetchTypes());
            _emit('refresh');
        } catch (e) {
            console.warn('[Web2ProductTypesCache] refresh (fallback) fail:', e.message);
        }
    }

    function getAll() {
        return state.all.filter((t) => t.isActive);
    }
    function getAllIncludingInactive() {
        return state.all.slice();
    }

    function findByName(query, limit = 20) {
        const q = _normalize(query);
        if (!q) return getAll().slice(0, limit);
        const out = [];
        for (const t of getAll()) {
            const n = _normalize(t.name);
            if (n === q) out.unshift(t);
            else if (n.startsWith(q)) out.push(t);
            else if (n.includes(q)) out.push(t);
        }
        return out.slice(0, limit);
    }

    function has(name) {
        return state.byNameLower.has(_normalize(name));
    }

    async function pushTickle(_opts = {}) {
        _emit('local');
        if (_cache) _cache.invalidate();
    }

    function subscribe(cb) {
        if (typeof cb !== 'function') return () => {};
        state.listeners.add(cb);
        return () => state.listeners.delete(cb);
    }

    global.Web2ProductTypesCache = {
        init,
        refresh,
        getAll,
        getAllIncludingInactive,
        findByName,
        has,
        pushTickle,
        subscribe,
        _normalize,
    };
})(typeof window !== 'undefined' ? window : globalThis);
