// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web2 Variants — Shared cache (biến thể dùng chung)
// =====================================================
//
// Mục đích: dùng chung giữa Kho Biến Thể (web2-variants), Kho SP (web2-products),
// Sổ Order (so-order). Variant 1 nguồn duy nhất; mọi trang gọi init() rồi pick.
//
// 2026-06-23: bộ máy fetch + SSE invalidate + dedup + listeners ĐÃ DELEGATE sang
// primitive `Web2SmartCache` (web2-smart-cache.js) thay vì tự cài lặp. Bonus: thêm
// IDB persist (variant sống qua reload). Domain logic (normalize/findByValue/
// getColorShortMap) giữ nguyên. Public API KHÔNG đổi.
//
// Public API:
//   await Web2VariantsCache.init()
//   Web2VariantsCache.getAll()                // Array<Variant> active
//   Web2VariantsCache.getAllIncludingInactive()
//   Web2VariantsCache.findByValue(q, limit=10)
//   Web2VariantsCache.findByValueExact(v)
//   Web2VariantsCache.has(value)
//   Web2VariantsCache.getColorShortMap()
//   Web2VariantsCache.pushTickle({action})
//   Web2VariantsCache.subscribe(cb)
//   Web2VariantsCache.refresh()

(function (global) {
    'use strict';

    if (global.Web2VariantsCache) return;

    const _SELF_SRC =
        (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) ||
        '';

    const state = {
        all: [], // mọi variant (cả inactive)
        byValueLower: new Map(),
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
                console.error('[Web2VariantsCache] listener error:', e);
            }
        });
    }

    let _colorShortMap = null;
    function _rebuild(all) {
        state.all = Array.isArray(all) ? all : [];
        _colorShortMap = null; // invalidate memo khi data variant đổi
        // byValueLower CHỈ build từ variant active — findByValueExact dùng validate SP,
        // không được nhận biến thể đã deactivate.
        state.byValueLower = new Map(
            state.all.filter((v) => v.isActive).map((v) => [_normalize(v.value), v])
        );
    }

    async function _fetchVariants() {
        if (!global.Web2VariantsApi) throw new Error('Web2VariantsApi missing');
        const all = [];
        let page = 1;
        while (true) {
            const resp = await global.Web2VariantsApi.list({ page, limit: 2000 });
            const batch = Array.isArray(resp?.variants) ? resp.variants : [];
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
            name: 'variants',
            topic: 'web2:variants',
            fetcher: _fetchVariants,
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
                    console.warn('[Web2VariantsCache] smart-cache init fail:', e.message);
                }
            } else {
                try {
                    _rebuild(await _fetchVariants());
                } catch (e) {
                    console.warn('[Web2VariantsCache] fallback fetch fail:', e.message);
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
                console.warn('[Web2VariantsCache] refresh fail:', e.message);
            }
            return;
        }
        try {
            _rebuild(await _fetchVariants());
            _emit('refresh');
        } catch (e) {
            console.warn('[Web2VariantsCache] refresh (fallback) fail:', e.message);
        }
    }

    function getAll() {
        return state.all.filter((v) => v.isActive);
    }
    function getAllIncludingInactive() {
        return state.all.slice();
    }

    function findByValue(query, limit = 10) {
        const q = _normalize(query);
        if (!q) return getAll().slice(0, limit);
        const out = [];
        for (const v of state.all) {
            if (!v.isActive) continue;
            const n = _normalize(v.value);
            if (n === q) out.unshift(v);
            else if (n.startsWith(q)) out.push(v);
            else if (n.includes(q)) out.push(v);
            if (out.length > limit * 3) break;
        }
        return out.slice(0, limit);
    }

    function findByValueExact(value) {
        const q = _normalize(value);
        if (!q) return null;
        return state.byValueLower.get(q) || null;
    }

    function has(value) {
        return !!findByValueExact(value);
    }

    // colorShortMap: { <ASCII_UPPER tên màu strip "Màu "> : shortCode locked }.
    // NGUỒN CHUNG (P5 2026-06-15): memoize, invalidate khi data variant đổi.
    function getColorShortMap() {
        if (_colorShortMap) return _colorShortMap;
        const PC = global.Web2ProductCode;
        const all = getAll();
        const map = {};
        if (PC && typeof PC.toAsciiUpper === 'function') {
            for (const v of all) {
                if (!/màu/i.test(v.groupName || '')) continue;
                if (!v.shortCode) continue;
                const stripped = String(v.value || '')
                    .replace(/^\s*M[àáạăâ]u\s+/iu, '')
                    .trim();
                const key = PC.toAsciiUpper(stripped);
                if (key) map[key] = v.shortCode;
            }
        }
        if (all.length) _colorShortMap = map;
        return map;
    }

    async function pushTickle(_opts = {}) {
        // Báo cache thay đổi → revalidate từ server (SSE topic 'web2:variants' cũng
        // fan-out cho client khác). Emit 'local' ngay cho UI snappy.
        _emit('local');
        if (_cache) _cache.invalidate();
    }

    function subscribe(cb) {
        if (typeof cb !== 'function') return () => {};
        state.listeners.add(cb);
        return () => state.listeners.delete(cb);
    }

    global.Web2VariantsCache = {
        init,
        refresh,
        getAll,
        getAllIncludingInactive,
        findByValue,
        findByValueExact,
        has,
        getColorShortMap,
        pushTickle,
        subscribe,
        _normalize,
    };
})(typeof window !== 'undefined' ? window : globalThis);
