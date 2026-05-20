// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Customer Wallet — storage + Firestore sync + PBH fetch.
//
// Schema (localStorage `customerWallet_v1`, Firestore `customer_wallet_v1/main`):
//   {
//     wallets: {
//       [phone]: {
//         phone, name, totalPurchased, paidAmount, returnedAmount, balance,
//         returnedLineKeys: { [pbhNumber|lineKey]: { qty, amount, ts } },
//         transactions: [{ id, ts, type, amount, note, ref }]
//       }
//     },
//     lastUpdated
//   }

(function (global) {
    'use strict';

    const STORAGE_KEY = 'customerWallet_v1';
    const FIRESTORE_COLLECTION = 'customer_wallet_v1';
    const FIRESTORE_DOC = 'main';
    const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
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
            console.warn('[CustomerWallet] load fail:', e.message);
            return emptyState();
        }
    }

    function save(state) {
        try {
            state.lastUpdated = Date.now();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.warn('[CustomerWallet] save fail:', e.message);
        }
    }

    function cleanupOldTransactions(state) {
        const cutoff = Date.now() - RETENTION_MS;
        let mutated = false;
        for (const k of Object.keys(state.wallets || {})) {
            const w = state.wallets[k];
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

    function getOrCreateWallet(state, phone, name) {
        if (!state.wallets[phone]) {
            state.wallets[phone] = {
                phone,
                name: name || phone,
                totalPurchased: 0,
                paidAmount: 0,
                returnedAmount: 0,
                balance: 0,
                returnedLineKeys: {},
                transactions: [],
            };
        }
        const w = state.wallets[phone];
        if (name && (!w.name || w.name === phone)) w.name = name;
        w.totalPurchased = Number(w.totalPurchased) || 0;
        w.paidAmount = Number(w.paidAmount) || 0;
        w.returnedAmount = Number(w.returnedAmount) || 0;
        w.returnedLineKeys = w.returnedLineKeys || {};
        w.transactions = Array.isArray(w.transactions) ? w.transactions : [];
        return w;
    }

    function recalcBalance(w) {
        w.balance = (w.totalPurchased || 0) - (w.paidAmount || 0) - (w.returnedAmount || 0);
    }

    function addTransaction(state, phone, txn) {
        const w = getOrCreateWallet(state, phone);
        const entry = {
            id: 'tx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
            ts: Date.now(),
            type: txn.type,
            amount: Number(txn.amount) || 0,
            note: txn.note || '',
            ref: txn.ref || null,
        };
        w.transactions.push(entry);
        if (entry.type === 'return') {
            w.returnedAmount += entry.amount;
            if (entry.ref && Array.isArray(entry.ref.lineKeys)) {
                for (const k of entry.ref.lineKeys) {
                    w.returnedLineKeys[k] = { ts: entry.ts };
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
                if (typeof firebase === 'undefined' || !firebase.firestore) return false;
                this._db = firebase.firestore();
                const remote = await this._load();
                if (remote) localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
                this._listen();
                return true;
            } catch (e) {
                console.warn('[CustomerWallet.Sync] init fail:', e.message);
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
                console.warn('[CustomerWallet.Sync] load fail:', e.message);
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
                (err) => console.warn('[CustomerWallet.Sync] snap err:', err.message)
            );
        },

        async push(state) {
            if (!this._db || this._isListening) return false;
            try {
                await this._db
                    .collection(FIRESTORE_COLLECTION)
                    .doc(FIRESTORE_DOC)
                    .set({ data: state, lastUpdated: Date.now() }, { merge: true });
                return true;
            } catch (e) {
                console.warn('[CustomerWallet.Sync] push fail:', e.message);
                return false;
            }
        },
    };

    // Fetch SePay incoming deposits since `since` (unix ms). Match by linked_customer_phone.
    async function fetchDeposits(since) {
        try {
            const url = `${WORKER_URL}/api/wallet-deposits/load?since=${Number(since) || 0}&limit=200`;
            const r = await fetch(url);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            return Array.isArray(data?.deposits) ? data.deposits : [];
        } catch (e) {
            console.warn('[CustomerWallet] fetchDeposits fail:', e.message);
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

    function normPhone(p) {
        const s = String(p || '').replace(/\D/g, '');
        if (!s) return '';
        if (s.startsWith('84') && s.length >= 11) return '0' + s.slice(2);
        return s;
    }

    // Apply deposits: match by linkedPhone → type='payment'. Idempotent via sepayId.
    function applyDeposits(state, deposits) {
        const processed = getProcessedSepayIds(state);
        let added = 0;
        for (const d of deposits || []) {
            if (!d?.sepayId) continue;
            const sid = String(d.sepayId);
            if (processed.has(sid)) continue;
            const phone = normPhone(d.linkedPhone);
            if (!phone) continue;
            const w = state.wallets[phone];
            if (!w) continue; // chỉ cộng nếu KH đã có trong ví
            const amount = Number(d.amount) || 0;
            if (amount <= 0) continue;
            const entry = {
                id: `tx-sepay-${sid.slice(-12)}`,
                ts: Number(d.ts) || Date.now(),
                type: 'payment',
                amount,
                note: `SePay: ${(d.content || d.referenceCode || '').slice(0, 160)}`,
                ref: { sepayId: sid, source: 'sepay', linkedPhone: phone },
            };
            w.transactions.push(entry);
            w.paidAmount += amount;
            recalcBalance(w);
            added++;
        }
        if (added) save(state);
        return added;
    }

    // Fetch ALL native-orders (Đơn Web) — paginated. Trả về list (phone, name) để
    // ví KH tạo entry cho mọi KH có đơn Web (kể cả chưa lập PBH → công nợ = 0).
    // Render auto-create customer record qua upsertCustomerFromOrder rồi.
    async function fetchNativeOrders(maxPages = 20, pageSize = 200) {
        const all = [];
        for (let page = 1; page <= maxPages; page++) {
            try {
                const r = await fetch(
                    `${WORKER_URL}/api/native-orders/load?limit=${pageSize}&page=${page}`
                );
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const data = await r.json();
                let batch = [];
                if (Array.isArray(data?.orders)) batch = data.orders;
                else if (Array.isArray(data?.data)) batch = data.data;
                else if (Array.isArray(data)) batch = data;
                if (!batch.length) break;
                all.push(...batch);
                if (batch.length < pageSize) break;
            } catch (e) {
                console.warn(`[CustomerWallet] fetchNativeOrders page ${page} fail:`, e.message);
                break;
            }
        }
        return all;
    }

    // Fetch ALL PBH from Render with pagination loop. Mỗi page = 500 rows.
    // Stop khi page trả về < pageSize (đã hết) hoặc gặp lỗi.
    async function fetchPbhList(maxPages = 20, pageSize = 500) {
        const all = [];
        for (let page = 0; page < maxPages; page++) {
            const offset = page * pageSize;
            try {
                const r = await fetch(
                    `${WORKER_URL}/api/fast-sale-orders/load?limit=${pageSize}&offset=${offset}`
                );
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const data = await r.json();
                let batch = [];
                if (Array.isArray(data)) batch = data;
                else if (Array.isArray(data.data)) batch = data.data;
                else if (Array.isArray(data.orders)) batch = data.orders;
                if (!batch.length) break;
                all.push(...batch);
                if (batch.length < pageSize) break; // hết
            } catch (e) {
                console.warn(`[CustomerWallet] fetchPbhList page ${page} fail:`, e.message);
                break;
            }
        }
        return all;
    }

    global.CustomerWalletStorage = {
        load,
        save,
        cleanupOldTransactions,
        getOrCreateWallet,
        recalcBalance,
        addTransaction,
        fetchPbhList,
        fetchNativeOrders,
        fetchDeposits,
        applyDeposits,
        Sync,
        RETENTION_MS,
    };
})(window);
