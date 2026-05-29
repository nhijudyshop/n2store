// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// Web2 Variants — Shared cache + Firestore tickler realtime
// =====================================================
//
// Mục đích: dùng chung giữa "Kho Biến Thể" (web2-variants), Kho SP
// (web2-products), Sổ Order (so-order). Variant chỉ có 1 nguồn duy
// nhất; mọi trang gọi `Web2VariantsCache.init()` rồi pick.
//
// Realtime: tickler doc Firestore `web2_variants_sync/notify`. Mọi
// CRUD ghi vào doc; các client snapshot listener auto reload list.
//
// Public API:
//   await Web2VariantsCache.init()
//   Web2VariantsCache.getAll()                // Array<Variant> active
//   Web2VariantsCache.getAllIncludingInactive()
//   Web2VariantsCache.findByValue(q, limit=10)
//   Web2VariantsCache.findByValueExact(v)
//   Web2VariantsCache.has(value)
//   Web2VariantsCache.pushTickle({action})
//   Web2VariantsCache.subscribe(cb)
//   Web2VariantsCache.refresh()

(function (global) {
    'use strict';

    if (global.Web2VariantsCache) return;

    const FIRESTORE_COLLECTION = 'web2_variants_sync';
    const FIRESTORE_DOC = 'notify';
    const REFRESH_DEBOUNCE_MS = 400;

    const state = {
        all: [], // mọi variant (cả inactive)
        byValueLower: new Map(),
        listeners: new Set(),
        initialized: false,
        initPromise: null,
        clientId: _clientId(),
        db: null,
        unsubscribe: null,
        lastSeenTickle: 0,
        refreshTimer: null,
    };

    function _clientId() {
        try {
            const key = '__web2VariantsCacheClientId';
            const existing = sessionStorage.getItem(key);
            if (existing) return existing;
            const fresh =
                'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
            sessionStorage.setItem(key, fresh);
            return fresh;
        } catch {
            return 'v-' + Date.now().toString(36);
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

    function _ensureFirestore() {
        if (state.db) return state.db;
        if (typeof firebase === 'undefined' || !firebase.firestore) return null;
        try {
            state.db = firebase.firestore();
            return state.db;
        } catch {
            return null;
        }
    }

    async function _loadList() {
        if (!global.Web2VariantsApi) return;
        try {
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
            state.all = all;
            state.byValueLower = new Map(all.map((v) => [_normalize(v.value), v]));
            _emit('refresh');
        } catch (e) {
            console.warn('[Web2VariantsCache] load failed:', e.message);
        }
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

    function _scheduleRefresh(reason) {
        if (state.refreshTimer) clearTimeout(state.refreshTimer);
        state.refreshTimer = setTimeout(async () => {
            state.refreshTimer = null;
            await _loadList();
        }, REFRESH_DEBOUNCE_MS);
        if (reason) _emit(reason);
    }

    function _setupRealtime() {
        // SSE bridge only — Firestore fallback removed 2026-05-29 (SSE verified
        // stable từ 2026-05-19). Xem docs/web2/SSE-REALTIME.md.
        if (global.Web2SSE && typeof global.Web2SSE.subscribe === 'function') {
            state.unsubscribe = global.Web2SSE.subscribe('web2:variants', (msg) => {
                if (msg?.data?.by && msg.data.by === state.clientId) return;
                _scheduleRefresh('sse');
            });
        } else {
            console.warn(
                '[Web2VariantsCache] Web2SSE bridge not loaded — realtime updates disabled. Manual refresh required.'
            );
        }
    }

    async function init() {
        if (state.initialized) return state;
        if (state.initPromise) return state.initPromise;
        state.initPromise = (async () => {
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

    async function pushTickle(_opts = {}) {
        // Firestore tickle write removed 2026-05-29 — SSE topic 'web2:variants'
        // đã fan-out qua server (web2RealtimeSseRoutes.notifyClients).
        _scheduleRefresh('local');
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
        pushTickle,
        subscribe,
        _normalize,
    };
})(typeof window !== 'undefined' ? window : globalThis);
