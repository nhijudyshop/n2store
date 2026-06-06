// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Supplier Wallet — storage + Firestore sync.
//
// Schema (localStorage `supplierWallet_v1`, Firestore `web2_supplier_wallet/main` —
// renamed 2026-05-25 from `supplier_wallet_v1`):
//   {
//     wallets: {
//       [supplierName]: {
//         supplier, totalPurchased, paidAmount, returnedAmount, balance,
//         returnedRowIds: { [rowId]: { qty, amount, ts } },
//         transactions: [{ id, ts, type, amount, note, ref }]
//       }
//     },
//     lastUpdated
//   }
//
// Pattern: Firestore = source of truth; localStorage = warm cache; realtime listener
// re-applies remote updates (with echo guard).

(function (global) {
    'use strict';

    const STORAGE_KEY = 'supplierWallet_v1'; // localStorage cache — giữ tên cũ để không mất data local
    const FIRESTORE_COLLECTION = 'web2_supplier_wallet'; // renamed 2026-05-25 from supplier_wallet_v1
    const FIRESTORE_DOC = 'main';
    const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

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

    // Auto-purge transactions older than 30 days. Returns true if state mutated.
    function cleanupOldTransactions(state) {
        const cutoff = Date.now() - RETENTION_MS;
        let mutated = false;
        for (const supplier of Object.keys(state.wallets || {})) {
            const w = state.wallets[supplier];
            if (!Array.isArray(w.transactions)) {
                w.transactions = [];
                continue;
            }
            const before = w.transactions.length;
            w.transactions = w.transactions.filter((t) => Number(t.ts) > cutoff);
            if (w.transactions.length !== before) mutated = true;
        }
        return mutated;
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

    function addTransaction(state, supplier, txn) {
        const w = getOrCreateWallet(state, supplier);
        const entry = {
            id: 'tx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
            ts: Date.now(),
            type: txn.type, // 'return' | 'payment' | 'purchase' (synthetic)
            amount: Number(txn.amount) || 0,
            note: txn.note || '',
            ref: txn.ref || null,
            performedBy: txn.performedBy || null, // audit: ai thao tác
        };
        w.transactions.push(entry);
        if (entry.type === 'return') {
            w.returnedAmount += entry.amount;
            if (entry.ref && Array.isArray(entry.ref.rowIds)) {
                for (const id of entry.ref.rowIds) {
                    w.returnedRowIds[id] = { qty: 0, amount: 0, ts: entry.ts };
                }
            }
        } else if (entry.type === 'payment') {
            w.paidAmount += entry.amount;
        }
        recalcBalance(w);
        save(state);
        return entry;
    }

    // ---- Firestore sync ----
    const Sync = {
        _db: null,
        _unsub: null,
        _isListening: false,
        _onRemote: null,

        async init(_onRemote) {
            // Firestore listener removed 2026-05-29. _onRemote callback no
            // longer wired — SSE topics 'wallet:all' + 'web2:wallet:*' xử lý
            // realtime trong supplier-wallet-app layer.
            try {
                if (typeof firebase === 'undefined' || !firebase.firestore) {
                    console.warn('[SupplierWallet.Sync] no firebase — local only');
                    return false;
                }
                this._db = firebase.firestore();
                const remote = await this._load();
                if (remote) {
                    // P1 2026-05-30: persist qua IDB
                    _cachedState = remote;
                    const store = _getStore();
                    if (store) await store.set(remote);
                }
                return true;
            } catch (e) {
                console.warn('[SupplierWallet.Sync] init fail:', e.message);
                return false;
            }
        },

        async _load() {
            if (!this._db) return null;
            try {
                const snap = await this._db
                    .collection(FIRESTORE_COLLECTION)
                    .doc(FIRESTORE_DOC)
                    .get();
                if (!snap.exists) return null;
                const payload = snap.data() || {};
                return payload.data || null;
            } catch (e) {
                console.warn('[SupplierWallet.Sync] load fail:', e.message);
                return null;
            }
        },

        async push(state) {
            if (!this._db) return false;
            try {
                await this._db
                    .collection(FIRESTORE_COLLECTION)
                    .doc(FIRESTORE_DOC)
                    .set({ data: state, lastUpdated: Date.now() }, { merge: true });
                return true;
            } catch (e) {
                console.warn('[SupplierWallet.Sync] push fail:', e.message);
                return false;
            }
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
    // supplier name normalized length ≥ 4 và xuất hiện như từ riêng (boundary check).
    function matchSupplier(content, supplierNames) {
        const c = ' ' + normalize(content) + ' ';
        if (c.trim().length < 4) return null;
        for (const name of supplierNames) {
            const n = normalize(name);
            if (n.length < 4) continue;
            if (c.includes(' ' + n + ' ') || c.includes(' ' + n) || c.includes(n + ' ')) {
                return name;
            }
        }
        return null;
    }

    // Apply deposits: refund money từ NCC chuyển trở lại → type='payment' (giảm balance).
    function applyDeposits(state, deposits) {
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
            const w = state.wallets[matched];
            const entry = {
                id: `tx-sepay-${sid.slice(-12)}`,
                ts: Number(d.ts) || Date.now(),
                type: 'payment',
                amount,
                note: `SePay refund: ${(d.content || '').slice(0, 160)}`,
                ref: { sepayId: sid, source: 'sepay', matchedSupplier: matched },
            };
            w.transactions.push(entry);
            w.paidAmount += amount;
            recalcBalance(w);
            added++;
        }
        if (added) save(state);
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
