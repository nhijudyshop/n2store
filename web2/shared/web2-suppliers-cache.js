// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web2 Suppliers — Shared cache (read names + ensure-create)
// =====================================================
//
// Mục đích: dùng chung cho mọi trang Web 2.0 cần dropdown gợi ý NCC từ
// "Ví NCC" (so-order modal, native-orders, supplier-wallet itself…).
// Đọc trực tiếp Firestore `web2_supplier_wallet/main` — KHÔNG dùng SSE hub
// vì supplier-wallet đã có Firestore Sync layer, và list NCC ít khi thay đổi.
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

    const FIRESTORE_COLLECTION = 'web2_supplier_wallet';
    const FIRESTORE_DOC = 'main';

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

    function _getDb() {
        if (typeof firebase === 'undefined' || !firebase.firestore) return null;
        try {
            return firebase.firestore();
        } catch {
            return null;
        }
    }

    function _setNames(walletsObj) {
        state.names.clear();
        state.originals.clear();
        for (const name of Object.keys(walletsObj || {})) {
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

    async function _loadFromFirestore() {
        const db = _getDb();
        if (!db) return false;
        try {
            const snap = await db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC).get();
            if (!snap.exists) {
                _setNames({});
                return true;
            }
            const payload = snap.data() || {};
            const wallets = payload.data?.wallets || {};
            _setNames(wallets);
            return true;
        } catch (e) {
            console.warn('[Web2SuppliersCache] load fail:', e.message);
            return false;
        }
    }

    function _attachSnapshot() {
        if (state.unsubSnapshot) return;
        const db = _getDb();
        if (!db) return;
        try {
            state.unsubSnapshot = db
                .collection(FIRESTORE_COLLECTION)
                .doc(FIRESTORE_DOC)
                .onSnapshot(
                    (snap) => {
                        if (!snap.exists) {
                            _setNames({});
                            _notify('snapshot');
                            return;
                        }
                        const payload = snap.data() || {};
                        const wallets = payload.data?.wallets || {};
                        _setNames(wallets);
                        _notify('snapshot');
                    },
                    (err) => {
                        console.warn('[Web2SuppliersCache] snapshot err:', err.message);
                    }
                );
        } catch (e) {
            console.warn('[Web2SuppliersCache] snapshot attach fail:', e.message);
        }
    }

    async function init() {
        if (state.initialized) return;
        if (state.initPromise) return state.initPromise;
        state.initPromise = (async () => {
            await _loadFromFirestore();
            _attachSnapshot();
            state.initialized = true;
            _notify('init');
        })();
        return state.initPromise;
    }

    async function refresh() {
        const ok = await _loadFromFirestore();
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

    // Ghi NCC mới vào Firestore với wallet entry rỗng. Idempotent.
    async function ensure(name) {
        const trimmed = String(name || '').trim();
        if (!trimmed) return { ok: false, reason: 'empty' };
        const key = _normalize(trimmed);
        if (state.names.has(key)) return { ok: true, created: false };
        const db = _getDb();
        if (!db) {
            console.warn('[Web2SuppliersCache] no firebase — cannot ensure');
            return { ok: false, reason: 'no-firestore' };
        }
        try {
            // Read-modify-write để giữ wallets khác. Dùng merge với dot-path
            // sẽ cleaner nhưng Firestore object set merge OK với data.wallets.
            const ref = db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC);
            const snap = await ref.get();
            const payload = snap.exists ? snap.data() || {} : {};
            const data = payload.data || { wallets: {} };
            data.wallets = data.wallets || {};
            if (data.wallets[trimmed]) {
                // Local out-of-sync — refresh state.
                state.names.add(key);
                state.originals.set(key, trimmed);
                _notify('ensure-existing');
                return { ok: true, created: false };
            }
            data.wallets[trimmed] = {
                supplier: trimmed,
                totalPurchased: 0,
                paidAmount: 0,
                returnedAmount: 0,
                balance: 0,
                returnedRowIds: {},
                transactions: [],
            };
            await ref.set({ data, lastUpdated: Date.now() }, { merge: true });
            state.names.add(key);
            state.originals.set(key, trimmed);
            _notify('ensure-created');
            return { ok: true, created: true };
        } catch (e) {
            console.warn('[Web2SuppliersCache] ensure fail:', e.message);
            return { ok: false, reason: 'firestore-error', error: e.message };
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
    };
})(window);
