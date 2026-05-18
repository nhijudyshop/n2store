// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Supplier Wallet — storage + Firestore sync.
//
// Schema (localStorage `supplierWallet_v1`, Firestore `supplier_wallet_v1/main`):
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

    const STORAGE_KEY = 'supplierWallet_v1';
    const FIRESTORE_COLLECTION = 'supplier_wallet_v1';
    const FIRESTORE_DOC = 'main';
    const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    function emptyState() {
        return { wallets: {}, lastUpdated: 0 };
    }

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return emptyState();
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return emptyState();
            parsed.wallets = parsed.wallets || {};
            return parsed;
        } catch (e) {
            console.warn('[SupplierWallet] load fail:', e.message);
            return emptyState();
        }
    }

    function save(state) {
        try {
            state.lastUpdated = Date.now();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.warn('[SupplierWallet] save fail:', e.message);
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

        async init(onRemote) {
            this._onRemote = onRemote;
            try {
                if (typeof firebase === 'undefined' || !firebase.firestore) {
                    console.warn('[SupplierWallet.Sync] no firebase — local only');
                    return false;
                }
                this._db = firebase.firestore();
                const remote = await this._load();
                if (remote) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
                }
                this._listen();
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

        _listen() {
            if (!this._db) return;
            const ref = this._db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC);
            this._unsub = ref.onSnapshot(
                (snap) => {
                    if (!snap.exists) return;
                    const payload = snap.data() || {};
                    if (!payload.data) return;
                    this._isListening = true;
                    try {
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.data));
                        if (this._onRemote) this._onRemote(payload.data);
                    } finally {
                        setTimeout(() => {
                            this._isListening = false;
                        }, 50);
                    }
                },
                (err) => console.warn('[SupplierWallet.Sync] snap err:', err.message)
            );
        },

        async push(state) {
            if (!this._db) return false;
            if (this._isListening) return false;
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
    async function loadSoOrderData() {
        try {
            if (typeof firebase === 'undefined' || !firebase.firestore) {
                // fallback to localStorage
                const raw = localStorage.getItem('soOrder_v1');
                return raw ? JSON.parse(raw) : null;
            }
            const db = firebase.firestore();
            const snap = await db.collection('so_order_v2').doc('main').get();
            if (snap.exists) {
                const payload = snap.data() || {};
                if (payload.data) return payload.data;
            }
            const raw = localStorage.getItem('soOrder_v1');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.warn('[SupplierWallet] loadSoOrderData fail:', e.message);
            return null;
        }
    }

    global.SupplierWalletStorage = {
        load,
        save,
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
