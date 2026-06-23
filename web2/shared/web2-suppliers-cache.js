// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web2 Suppliers — Shared cache (read names + ensure-create)
// =====================================================
//
// Mục đích: dùng chung cho mọi trang Web 2.0 cần dropdown gợi ý NCC.
// ĐỢT E + 3W5 (2026-06-12): nguồn từ Firestore → SERVER
// `/api/web2-supplier-wallet/suppliers` (bảng web2_supplier_meta, web2Db).
//
// 2026-06-23: bộ máy fetch + persist + SSE invalidate + dedup + listeners ĐÃ
// DELEGATE sang primitive dùng chung `Web2SmartCache` (web2-smart-cache.js) thay
// vì tự cài lặp. Lợi: thêm IDB persist (NCC sống qua reload/offline) + SWR +
// dedup mà KHÔNG đổi public API. Domain logic (normalize/search/ensure) giữ nguyên.
// Self-load primitive trong init() (async, luôn được await) → không lệ thuộc thứ
// tự load script; thiếu primitive → fallback fetch trực tiếp (degraded, vẫn chạy).
//
// Public API (KHÔNG đổi):
//   await Web2SuppliersCache.init()              // load names, idempotent
//   Web2SuppliersCache.getNames()                // string[] sorted
//   Web2SuppliersCache.has(name)                 // boolean (case-insensitive)
//   Web2SuppliersCache.search(q, limit, extras)  // string[] match contains
//   await Web2SuppliersCache.ensure(name)        // create empty wallet nếu chưa có
//   Web2SuppliersCache.subscribe(cb)             // notify khi cache thay đổi
//   Web2SuppliersCache.refresh()                 // force reload
//   Web2SuppliersCache.normalize(name)           // key chuẩn hoá (lowercase + bỏ dấu)

(function (global) {
    'use strict';

    if (global.Web2SuppliersCache) return;

    // Capture src ngay lúc eval (document.currentScript null khi init() chạy sau).
    const _SELF_SRC =
        (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) ||
        '';

    const WORKER_URL =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const API_BASE = `${WORKER_URL}/api/web2-supplier-wallet`;

    const state = {
        names: new Set(), // lowercased keys
        originals: new Map(), // lowercased → original casing
        initialized: false,
        initPromise: null,
        listeners: new Set(),
    };

    let _cache = null; // Web2SmartCache instance

    function _normalize(s) {
        return String(s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd')
            .trim();
    }

    function _rebuildIndex(namesArr) {
        state.names.clear();
        state.originals.clear();
        for (const name of namesArr || []) {
            const trimmed = String(name || '').trim();
            if (!trimmed) continue;
            const key = _normalize(trimmed);
            if (!state.names.has(key)) {
                state.names.add(key);
                state.originals.set(key, trimmed);
            }
        }
    }

    function _notify(reason) {
        for (const cb of state.listeners) {
            try {
                cb(reason);
            } catch (e) {
                console.warn('[Web2SuppliersCache] listener fail:', e.message);
            }
        }
    }

    async function _fetchSuppliers() {
        const r = await fetch(`${API_BASE}/suppliers`);
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d?.success === false) throw new Error(d?.error || `HTTP ${r.status}`);
        return (d.data || []).map((x) => x.name).filter(Boolean);
    }

    // Self-load primitive nếu thiếu (chưa autoload qua sidebar khi page gọi sớm).
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
            name: 'suppliers',
            topic: 'web2:supplier-wallet',
            fetcher: _fetchSuppliers,
            ttl: 5 * 60 * 1000,
            persist: true,
            debounceMs: 600,
        });
        // Mỗi lần cache đổi (persist-restore / revalidate / SSE / set) → rebuild
        // index + báo consumer. Rebuild idempotent nên gọi nhiều lần vô hại.
        _cache.subscribe((names) => {
            _rebuildIndex(names || []);
            _notify('cache');
        });
        return _cache;
    }

    async function init() {
        if (state.initialized) return;
        if (state.initPromise) return state.initPromise;
        state.initPromise = (async () => {
            await _ensureSmartCache();
            if (global.Web2SmartCache) {
                try {
                    const names = await _getCache().get(); // persist-instant + revalidate + SSE
                    _rebuildIndex(names || []);
                } catch (e) {
                    console.warn('[Web2SuppliersCache] smart-cache init fail:', e.message);
                }
            } else {
                // Fallback degraded: fetch trực tiếp (không persist/SSE) — giữ page chạy.
                try {
                    _rebuildIndex(await _fetchSuppliers());
                } catch (e) {
                    console.warn('[Web2SuppliersCache] fallback fetch fail:', e.message);
                }
            }
            state.initialized = true;
            _notify('init');
        })();
        return state.initPromise;
    }

    async function refresh() {
        if (_cache) {
            try {
                const names = await _cache.refresh();
                _rebuildIndex(names || []);
                _notify('refresh');
            } catch (e) {
                console.warn('[Web2SuppliersCache] refresh fail:', e.message);
            }
            return;
        }
        try {
            _rebuildIndex(await _fetchSuppliers());
            _notify('refresh');
        } catch (e) {
            console.warn('[Web2SuppliersCache] refresh (fallback) fail:', e.message);
        }
    }

    function getNames() {
        const arr = [];
        for (const orig of state.originals.values()) arr.push(orig);
        arr.sort((a, b) => a.localeCompare(b, 'vi'));
        return arr;
    }

    function has(name) {
        if (!name) return false;
        return state.names.has(_normalize(name));
    }

    function search(query, limit, extras) {
        const max = Number(limit) || 10;
        const q = _normalize(query);
        const merged = new Map(); // normKey → original
        for (const [k, orig] of state.originals.entries()) merged.set(k, orig);
        if (Array.isArray(extras)) {
            for (const raw of extras) {
                const trimmed = String(raw || '').trim();
                if (!trimmed) continue;
                const k = _normalize(trimmed);
                if (!merged.has(k)) merged.set(k, trimmed);
            }
        }
        const all = Array.from(merged.values());
        if (!q) {
            return all.sort((a, b) => a.localeCompare(b, 'vi')).slice(0, max);
        }
        const startsWith = [];
        const contains = [];
        for (const name of all) {
            const n = _normalize(name);
            if (n === q)
                startsWith.unshift(name); // exact match first
            else if (n.startsWith(q)) startsWith.push(name);
            else if (n.includes(q)) contains.push(name);
        }
        return [...startsWith, ...contains].slice(0, max);
    }

    // ENFORCE-PREP (2026-06-12): POST /suppliers gate WEB2_AUTH_ENFORCE=1.
    function _authHeaders(extra) {
        if (global.Web2Auth?.authHeaders) return global.Web2Auth.authHeaders(extra);
        const h = { ...(extra || {}) };
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
            if (t) h['x-web2-token'] = t;
        } catch {
            /* ignore */
        }
        return h;
    }

    // Ghi NCC mới vào meta server. Atomic ON CONFLICT per-row.
    async function ensure(name) {
        const trimmed = String(name || '').trim();
        if (!trimmed) return { ok: false, reason: 'empty' };
        const key = _normalize(trimmed);
        if (state.names.has(key)) return { ok: true, created: false };
        try {
            const r = await fetch(`${API_BASE}/suppliers`, {
                method: 'POST',
                headers: _authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ name: trimmed }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || d?.success === false) throw new Error(d?.error || `HTTP ${r.status}`);
            // Cập nhật index local ngay + đẩy vào smart cache (persist + skip-echo SSE).
            state.names.add(key);
            state.originals.set(key, trimmed);
            if (_cache) _cache.set(Array.from(state.originals.values()));
            _notify('ensure-created');
            return { ok: true, created: true };
        } catch (e) {
            console.warn('[Web2SuppliersCache] ensure fail:', e.message);
            return { ok: false, reason: 'server-error', error: e.message };
        }
    }

    function subscribe(cb) {
        if (typeof cb !== 'function') return () => {};
        state.listeners.add(cb);
        return () => state.listeners.delete(cb);
    }

    global.Web2SuppliersCache = {
        init,
        refresh,
        getNames,
        has,
        search,
        ensure,
        subscribe,
        // normalize(name) — key chuẩn hoá tên NCC dùng CHUNG (tránh mỗi trang
        // tự normalize lệch NFC/NFD → match fail).
        normalize: _normalize,
    };
})(window);
