// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Supplier Wallet — storage. ĐỢT E (2026-06-12, audit vòng 3): SOURCE OF TRUTH
// chuyển từ Firestore doc `web2_supplier_wallet/main` (client-write,
// last-write-wins → lost-update 2 tab/2 user, fire-and-forget, purge mất audit)
// sang SERVER LEDGER `/api/web2-supplier-wallet` (web2Db, transaction +
// idempotent tx_id, SSE topic web2:supplier-wallet).
//
// Shape state client GIỮ NGUYÊN (app/render không đổi):
//   {
//     wallets: {
//       [supplierName]: {
//         supplier, totalPurchased, paidAmount, returnedAmount, balance,
//         returnedRowIds: { [rowId]: { qty, amount, ts } },
//         transactions: [{ id, ts, type, amount, note, ref, performedBy, moveName }]
//       }
//     },
//     lastUpdated, lastDepositSync
//   }
//   totalPurchased/balance vẫn DERIVE client-side từ so-order (server không lưu).
//
// MONEY OP: addTransaction giờ là ASYNC — POST /tx server TRƯỚC (await),
// thành công mới apply local. Sync.push = no-op (deprecated). Migration
// one-time: Sync.init thấy server rỗng → đọc Firestore legacy (READ-ONLY)
// → POST /import (server-guarded chỉ chạy khi rỗng).

(function (global) {
    'use strict';

    const STORAGE_KEY = 'supplierWallet_v1'; // localStorage cache — giữ tên cũ để không mất data local
    const FIRESTORE_COLLECTION = 'web2_supplier_wallet'; // LEGACY — chỉ còn đọc 1 lần cho migration
    const FIRESTORE_DOC = 'main';
    const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // legacy const (export compat — không purge nữa)
    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const API_BASE = `${WORKER_URL}/api/web2-supplier-wallet`;
    const API_FALLBACK = 'https://n2store-fallback.onrender.com/api/web2-supplier-wallet';

    // ENFORCE-PREP (2026-06-12): POST /tx|/suppliers|/import sắp gate
    // WEB2_AUTH_ENFORCE=1. Page load web2-auth.js → Web2Auth.authHeaders;
    // không load → đọc thẳng localStorage 'web2_auth'.
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

    async function _api(path, options) {
        // Dual-base (worker → Render direct). Mutation idempotent theo txId nên
        // retry fallback an toàn (server ON CONFLICT trả alreadyProcessed).
        // ENFORCE-PREP (2026-06-12): _api là choke point — gắn x-web2-token mặc định.
        const opts = { ...(options || {}), headers: _authHeaders(options?.headers) };
        try {
            const r = await fetch(API_BASE + path, opts);
            const d = await r.json().catch(() => ({}));
            if (!r.ok || d?.success === false) throw new Error(d?.error || `HTTP ${r.status}`);
            return d;
        } catch (e) {
            const r = await fetch(API_FALLBACK + path, opts);
            const d = await r.json().catch(() => ({}));
            if (!r.ok || d?.success === false) throw new Error(d?.error || `HTTP ${r.status}`);
            return d;
        }
    }

    function emptyState() {
        return { wallets: {}, lastUpdated: 0 };
    }

    // P1 2026-05-30: persist localStorage → IndexedDB qua Web2IdbStore.
    let _idbStore = null;
    function _getStore() {
        if (_idbStore) return _idbStore;
        const root = typeof window !== 'undefined' ? window : globalThis;
        if (!root.Web2IdbStore) return null;
        _idbStore = root.Web2IdbStore.open('supplier_wallet_storage', {
            migrateFromLs: STORAGE_KEY,
        });
        return _idbStore;
    }

    let _cachedState = null;
    let _writeTimer = null;
    const WRITE_DEBOUNCE_MS = 150;

    async function load() {
        try {
            const store = _getStore();
            let parsed = null;
            if (store) parsed = await store.get();
            if (!parsed) {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    try {
                        parsed = JSON.parse(raw);
                    } catch {
                        parsed = null;
                    }
                }
            }
            if (!parsed || typeof parsed !== 'object') {
                _cachedState = emptyState();
                return _cachedState;
            }
            parsed.wallets = parsed.wallets || {};
            _cachedState = parsed;
            return parsed;
        } catch (e) {
            console.warn('[SupplierWallet] load fail:', e.message);
            _cachedState = emptyState();
            return _cachedState;
        }
    }

    function loadCached() {
        return _cachedState || emptyState();
    }

    function save(state) {
        state.lastUpdated = Date.now();
        _cachedState = state;
        if (_writeTimer) clearTimeout(_writeTimer);
        _writeTimer = setTimeout(async () => {
            _writeTimer = null;
            try {
                const store = _getStore();
                if (store) await store.set(state);
                else localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            } catch (e) {
                console.warn('[SupplierWallet] save fail:', e.message);
            }
        }, WRITE_DEBOUNCE_MS);
    }

    async function flush() {
        if (!_writeTimer) return;
        clearTimeout(_writeTimer);
        _writeTimer = null;
        if (!_cachedState) return;
        try {
            const store = _getStore();
            if (store) await store.set(_cachedState);
            else localStorage.setItem(STORAGE_KEY, JSON.stringify(_cachedState));
        } catch (e) {
            console.warn('[SupplierWallet] flush fail:', e.message);
        }
    }

    // ĐỢT E: KHÔNG purge nữa — server ledger giữ FULL audit (purge 30 ngày cũ
    // làm mất vết tiền vĩnh viễn, bug E-purge-30d). Giữ export cho compat.
    function cleanupOldTransactions() {
        return false;
    }

    function getOrCreateWallet(state, supplier) {
        if (!state.wallets[supplier]) {
            state.wallets[supplier] = {
                supplier,
                totalPurchased: 0,
                paidAmount: 0,
                returnedAmount: 0,
                balance: 0,
                returnedRowIds: {},
                transactions: [],
            };
        }
        const w = state.wallets[supplier];
        // Migration: ensure shape
        w.totalPurchased = Number(w.totalPurchased) || 0;
        w.paidAmount = Number(w.paidAmount) || 0;
        w.returnedAmount = Number(w.returnedAmount) || 0;
        w.returnedRowIds = w.returnedRowIds || {};
        w.transactions = Array.isArray(w.transactions) ? w.transactions : [];
        return w;
    }

    function recalcBalance(w) {
        w.balance = (w.totalPurchased || 0) - (w.paidAmount || 0) - (w.returnedAmount || 0);
    }

    // ĐỢT E: MONEY OP — POST server TRƯỚC (await), thành công mới apply local.
    // txId sinh client 1 lần → retry/dual-base/2 máy cùng ghi = server dedupe
    // (alreadyProcessed), hết fire-and-forget + lost-update của bản Firestore.
    // THROW khi server fail — caller toast lỗi, KHÔNG ghi local lệch server.
    async function addTransaction(state, supplier, txn) {
        const txId = txn.txId || 'tx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        const d = await _api('/tx', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                supplier,
                type: txn.type,
                amount: Number(txn.amount) || 0,
                note: txn.note || '',
                ref: txn.ref || null,
                performedBy: txn.performedBy || null,
                txId,
                rowReturns: txn.rowReturns || null,
            }),
        });
        const entry = d.tx || {
            id: txId,
            ts: Date.now(),
            type: txn.type,
            amount: Number(txn.amount) || 0,
            note: txn.note || '',
            ref: txn.ref || null,
            performedBy: txn.performedBy || null,
        };
        if (d.alreadyProcessed) return entry; // server đã có (retry) — không apply đôi
        const w = getOrCreateWallet(state, supplier);
        w.transactions.push(entry);
        if (entry.type === 'return') {
            w.returnedAmount += entry.amount;
            // C18 (2026-06-13): CHỈ ghi returnedRowIds khi có rowReturns (qty/amount
            // THẬT). Bỏ fallback {qty:0,amount:0} theo ref.rowIds — entry qty:0 là
            // rác, gây rủi ro over-refund (filter A2 coi qty:0 = chưa trả đủ).
            const rowReturns = txn.rowReturns || null;
            if (rowReturns) {
                for (const [rid, v] of Object.entries(rowReturns)) {
                    w.returnedRowIds[rid] = {
                        qty: Number(v?.qty) || 0,
                        amount: Number(v?.amount) || 0,
                        ts: entry.ts,
                    };
                }
            }
        } else if (entry.type === 'payment') {
            w.paidAmount += entry.amount;
        }
        recalcBalance(w);
        save(state);
        return entry;
    }

    // ---- Server sync (ĐỢT E) ----
    // init: GET /state từ server ledger. Server RỖNG + Firestore legacy còn data
    // → POST /import one-time (server-guarded: chỉ import khi rỗng, gọi lặp vô
    // hại) rồi GET lại. push: DEPRECATED no-op — mutation đã ghi server từng
    // giao dịch qua addTransaction, không còn ghi đè cả doc (gốc lost-update).
    let _pushWarned = false;
    const Sync = {
        async init(_onRemote) {
            try {
                let d = await _api('/state');
                if (d?.data?.empty) {
                    const legacy = await Sync._loadLegacyFirestore();
                    if (legacy && Object.keys(legacy.wallets || {}).length) {
                        try {
                            const imp = await _api('/import', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    wallets: legacy.wallets,
                                    suppliers: legacy.suppliers,
                                }),
                            });
                            console.log('[SupplierWallet.Sync] migration:', imp?.imported || imp);
                            d = await _api('/state');
                        } catch (e) {
                            console.warn('[SupplierWallet.Sync] import fail:', e.message);
                        }
                    }
                }
                const server = d?.data;
                if (server?.wallets) {
                    const local = _cachedState || (await load());
                    // Giữ field local-only (lastDepositSync, totalPurchased sẽ
                    // được app derive lại từ so-order ngay sau init).
                    const merged = {
                        wallets: server.wallets,
                        lastUpdated: server.lastUpdated || Date.now(),
                        lastDepositSync: local?.lastDepositSync || 0,
                    };
                    _cachedState = merged;
                    const store = _getStore();
                    if (store) await store.set(merged);
                }
                return true;
            } catch (e) {
                console.warn('[SupplierWallet.Sync] init fail (dùng cache local):', e.message);
                return false;
            }
        },

        // Đọc legacy Firestore 1 LẦN cho migration — READ-ONLY, không ghi/xoá.
        async _loadLegacyFirestore() {
            try {
                if (typeof firebase === 'undefined' || !firebase.firestore) return null;
                const db = firebase.firestore();
                const [walletSnap, supSnap] = await Promise.all([
                    db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC).get(),
                    db.collection('web2_suppliers').doc('main').get(),
                ]);
                const wallets = walletSnap.exists ? walletSnap.data()?.data?.wallets || null : null;
                const suppliers = supSnap.exists ? supSnap.data()?.data?.suppliers || [] : [];
                if (!wallets) return null;
                return { wallets, suppliers };
            } catch (e) {
                console.warn('[SupplierWallet.Sync] legacy read fail:', e.message);
                return null;
            }
        },

        async push() {
            if (!_pushWarned) {
                _pushWarned = true;
                console.info(
                    '[SupplierWallet.Sync] push() deprecated (đợt E) — mutation đã ghi server per-tx'
                );
            }
            return true;
        },
    };

    // Fetch SePay incoming deposits since `since` (unix ms). Match by content substring vs supplier name.
    async function fetchDeposits(since) {
        try {
            const url = `${WORKER_URL}/api/wallet-deposits/load?since=${Number(since) || 0}&limit=200`;
            const r = await fetch(url);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            return Array.isArray(data?.deposits) ? data.deposits : [];
        } catch (e) {
            console.warn('[SupplierWallet] fetchDeposits fail:', e.message);
            return [];
        }
    }

    function getProcessedSepayIds(state) {
        const ids = new Set();
        for (const k of Object.keys(state.wallets || {})) {
            const txs = state.wallets[k].transactions || [];
            for (const tx of txs) {
                if (tx.ref?.sepayId) ids.add(String(tx.ref.sepayId));
            }
        }
        return ids;
    }

    function normalize(s) {
        return String(s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    // Match deposit content vs supplier name. Tránh false positive bằng cách yêu cầu
    // supplier name normalized length ≥ 4 và xuất hiện như TỪ NGUYÊN (cả 2 phía space).
    // C12 (2026-06-13): TRƯỚC đây còn check prefix-only `includes(' '+n)` + suffix-only
    // `includes(n+' ')` → "chuyen huanlong" KHỚP NHẦM NCC "huan" (vì ' huanlong' chứa
    // ' huan') → SePay refund gán sai NCC. Giờ CHỈ match cả-2-phía-space + sort theo
    // độ dài giảm dần → NCC tên dài hơn ("huanlong") được xét trước, thắng trước.
    function matchSupplier(content, supplierNames) {
        const c = ' ' + normalize(content) + ' ';
        if (c.trim().length < 4) return null;
        const sorted = (supplierNames || [])
            .map((name) => ({ name, n: normalize(name) }))
            .filter((x) => x.n.length >= 4)
            .sort((a, b) => b.n.length - a.n.length);
        for (const { name, n } of sorted) {
            if (c.includes(' ' + n + ' ')) return name;
        }
        return null;
    }

    // Apply deposits: refund từ NCC → type='payment'. ĐỢT E: ghi qua server
    // với txId deterministic `tx-sepay-<sid>` → 2 máy cùng poll = server dedupe
    // (UNIQUE tx_id), hết cảnh nhân đôi cross-machine của bản Firestore.
    async function applyDeposits(state, deposits) {
        const processed = getProcessedSepayIds(state);
        const supplierNames = Object.keys(state.wallets || {});
        let added = 0;
        for (const d of deposits || []) {
            if (!d?.sepayId) continue;
            const sid = String(d.sepayId);
            if (processed.has(sid)) continue;
            const amount = Number(d.amount) || 0;
            if (amount <= 0) continue;
            const matched = matchSupplier(d.content || '', supplierNames);
            if (!matched) continue;
            try {
                const entry = await addTransaction(state, matched, {
                    type: 'payment',
                    amount,
                    note: `SePay refund: ${(d.content || '').slice(0, 160)}`,
                    ref: { sepayId: sid, source: 'sepay', matchedSupplier: matched },
                    txId: `tx-sepay-${sid.slice(-12)}`,
                });
                if (entry) added++;
            } catch (e) {
                console.warn('[SupplierWallet] applyDeposits tx fail:', e.message);
            }
        }
        return added;
    }

    // Load so-order data (read-only) to derive purchases.
    // P1 2026-05-30: soOrder_v1 chuyển sang IDB. Đọc IDB → fallback Firestore
    // → fallback localStorage legacy.
    async function _readSoOrderLocal() {
        if (global.Web2IdbStore) {
            try {
                const store = global.Web2IdbStore.open('so_order_storage', {
                    migrateFromLs: 'soOrder_v1',
                });
                const d = await store.get();
                if (d) return d;
            } catch (e) {
                console.warn('[SupplierWallet] IDB read fail:', e.message);
            }
        }
        const raw = localStorage.getItem('soOrder_v1');
        return raw ? JSON.parse(raw) : null;
    }

    async function loadSoOrderData() {
        try {
            if (typeof firebase === 'undefined' || !firebase.firestore) {
                return await _readSoOrderLocal();
            }
            const db = firebase.firestore();
            const snap = await db.collection('web2_so_order').doc('main').get();
            if (snap.exists) {
                const payload = snap.data() || {};
                if (payload.data) return payload.data;
            }
            return await _readSoOrderLocal();
        } catch (e) {
            console.warn('[SupplierWallet] loadSoOrderData fail:', e.message);
            return null;
        }
    }

    global.SupplierWalletStorage = {
        load,
        loadCached,
        save,
        flush,
        cleanupOldTransactions,
        getOrCreateWallet,
        recalcBalance,
        addTransaction,
        loadSoOrderData,
        fetchDeposits,
        applyDeposits,
        Sync,
        RETENTION_MS,
    };
})(window);
