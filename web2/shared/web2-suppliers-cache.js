// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web2 Suppliers — Shared cache (read names + ensure-create)
// =====================================================
//
// Mục đích: dùng chung cho mọi trang Web 2.0 cần dropdown gợi ý NCC.
// ĐỢT E + 3W5 (2026-06-12): nguồn chuyển từ Firestore `web2_supplier_wallet/main`
// (onSnapshot — vi phạm quy tắc 6 + ensure() RMW lost-update) sang SERVER
// `/api/web2-supplier-wallet/suppliers` (bảng web2_supplier_meta, web2Db).
// Realtime: Web2SSE topic `web2:supplier-wallet` (bridge có sẵn thì subscribe,
// không có thì thôi — list NCC ít đổi, init/refresh là đủ).
//
// Public API:
//   await Web2SuppliersCache.init()              // load names, idempotent
//   Web2SuppliersCache.getNames()                // string[] sorted
//   Web2SuppliersCache.has(name)                 // boolean (case-insensitive)
//   Web2SuppliersCache.search(q, limit, extras)  // string[] match contains
//   await Web2SuppliersCache.ensure(name)        // create empty wallet nếu chưa có
//   Web2SuppliersCache.subscribe(cb)             // notify khi cache thay đổi
//   Web2SuppliersCache.refresh()                 // force reload

(function (global) {
    'use strict';

    if (global.Web2SuppliersCache) return;

    const WORKER_URL =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const API_BASE = `${WORKER_URL}/api/web2-supplier-wallet`;

    const state = {
        names: new Set(), // lowercased → original casing kept in `originals`
        originals: new Map(), // lowercased → original name
        initialized: false,
        initPromise: null,
        listeners: new Set(),
        unsubSnapshot: null,
    };

    function _normalize(s) {
        return String(s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd')
            .trim();
    }

    function _setNames(namesArr) {
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

    async function _loadFromServer() {
        try {
            const r = await fetch(`${API_BASE}/suppliers`);
            const d = await r.json().catch(() => ({}));
            if (!r.ok || d?.success === false) throw new Error(d?.error || `HTTP ${r.status}`);
            _setNames((d.data || []).map((x) => x.name));
            return true;
        } catch (e) {
            console.warn('[Web2SuppliersCache] load fail:', e.message);
            return false;
        }
    }

    // 3W5: realtime qua SSE hub web2 thay Firestore onSnapshot. Bridge không
    // load trên page → bỏ qua (list NCC ít đổi). Debounce 600ms gom burst.
    function _attachSse() {
        if (state.unsubSnapshot) return;
        if (!global.Web2SSE?.subscribe) return;
        try {
            let timer = null;
            state.unsubSnapshot = global.Web2SSE.subscribe('web2:supplier-wallet', () => {
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => refresh(), 600);
            });
        } catch (e) {
            console.warn('[Web2SuppliersCache] SSE attach fail:', e.message);
        }
    }

    async function init() {
        if (state.initialized) return;
        if (state.initPromise) return state.initPromise;
        state.initPromise = (async () => {
            await _loadFromServer();
            _attachSse();
            state.initialized = true;
            _notify('init');
        })();
        return state.initPromise;
    }

    async function refresh() {
        const ok = await _loadFromServer();
        if (ok) _notify('refresh');
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
        // Merge canonical names + extras (deduped, case-insensitive).
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

    // ENFORCE-PREP (2026-06-12): POST /suppliers sắp gate WEB2_AUTH_ENFORCE=1.
    // Page load web2-auth.js → Web2Auth.authHeaders; không load → đọc thẳng
    // localStorage 'web2_auth'.
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

    // Ghi NCC mới vào meta server. Atomic ON CONFLICT per-row — hết RMW
    // lost-update của bản Firestore (3W5/đợt E).
    async function ensure(name) {
        const trimmed = String(name || '').trim();
        if (!trimmed) return { ok: false, reason: 'empty' };
        const key = _normalize(trimmed);
        if (state.names.has(key)) return { ok: true, created: false };
        try {
            const r = await fetch(`${API_BASE}/suppliers`, {
                method: 'POST',
                // ENFORCE-PREP (2026-06-12)
                headers: _authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ name: trimmed }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || d?.success === false) throw new Error(d?.error || `HTTP ${r.status}`);
            state.names.add(key);
            state.originals.set(key, trimmed);
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
        // normalize(name) — key chuẩn hoá tên NCC (lowercase + bỏ dấu + đ→d).
        // Expose để consumer khác (vd matching tên NCC) dùng CHUNG 1 hàm, tránh
        // mỗi trang tự normalize khác nhau (NFC/NFD lệch → match fail).
        normalize: _normalize,
    };
})(window);
