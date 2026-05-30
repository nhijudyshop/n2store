// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
//
// Web2IdbStore — generic IndexedDB key-value helper cho Web 2.0 stores.
//
// Lý do dùng: Web 2.0 dữ liệu lớn (Sổ Order, ví KH/NCC, balance history…)
// → localStorage 5-10MB cap + sync block main thread. IDB 50% disk + async.
//
// API (chỉ get/set/remove, không index/cursor — keep simple):
//
//   const store = Web2IdbStore.open('so_order_cache', { migrateFromLs: 'soOrder_v1' });
//   const data = await store.get('main');     // null nếu chưa có
//   await store.set('main', { ... });          // serializable object
//   await store.remove('main');
//
// Auto-migrate: lần đầu open() với option `migrateFromLs` → kiểm tra
// localStorage[lsKey] → nếu có, JSON.parse → put vào IDB key 'main' →
// xóa localStorage key. Idempotent (chỉ chạy 1 lần vì sau đó LS rỗng).
//
// Error handling: IDB fail (private mode, quota exceeded) → log + return
// null/false. Caller PHẢI có fallback nếu IDB unavailable.
//
// Browser support: IDB hỗ trợ tất cả browser modern (kể cả Safari iOS).

(function (global) {
    'use strict';

    if (global.Web2IdbStore) return; // idempotent

    const IDB_NAME = 'web2_kv_v1';
    const IDB_VERSION = 1;

    // 1 connection cho toàn bộ instance — open lazy, share giữa các store.
    let _idbPromise = null;
    function _openConnection() {
        if (_idbPromise) return _idbPromise;
        _idbPromise = new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                reject(new Error('IndexedDB unavailable'));
                return;
            }
            const req = indexedDB.open(IDB_NAME, IDB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                // Tạo các store đã biết. Caller open() store mới sẽ trigger
                // version bump + onupgradeneeded chạy lại (xử lý ở open()).
                if (!db.objectStoreNames.contains('_default')) {
                    db.createObjectStore('_default');
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
            req.onblocked = () => reject(new Error('IDB blocked'));
        }).catch((e) => {
            console.warn('[Web2IdbStore] open connection failed:', e.message);
            _idbPromise = null;
            return null;
        });
        return _idbPromise;
    }

    // Để hỗ trợ tạo store mới động, dùng pattern: open lần đầu version 1
    // với store _default; sau đó open lại version N với onupgradeneeded
    // tạo store mới. Đơn giản hơn: hardcode tất cả store name expected ở
    // version 1. Có thể bump version sau khi cần thêm store.
    //
    // Ở đây dùng 1 object store _kv duy nhất, store name làm prefix key.
    // Caller open('so_order_cache') → key = 'so_order_cache:main' v.v.
    //
    // Tránh phức tạp versioning. Trade-off: tất cả store dùng chung 1
    // object store nhưng prefix tách namespace.

    async function _idbGet(prefixedKey) {
        const db = await _openConnection();
        if (!db) return null;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction('_default', 'readonly');
                const req = tx.objectStore('_default').get(prefixedKey);
                req.onsuccess = () => resolve(req.result ?? null);
                req.onerror = () => resolve(null);
            } catch (e) {
                console.warn('[Web2IdbStore] get failed:', e.message);
                resolve(null);
            }
        });
    }

    async function _idbSet(prefixedKey, value) {
        const db = await _openConnection();
        if (!db) return false;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction('_default', 'readwrite');
                const req = tx.objectStore('_default').put(value, prefixedKey);
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
            } catch (e) {
                console.warn('[Web2IdbStore] set failed:', e.message);
                resolve(false);
            }
        });
    }

    async function _idbRemove(prefixedKey) {
        const db = await _openConnection();
        if (!db) return false;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction('_default', 'readwrite');
                const req = tx.objectStore('_default').delete(prefixedKey);
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
            } catch (e) {
                console.warn('[Web2IdbStore] remove failed:', e.message);
                resolve(false);
            }
        });
    }

    // Auto-migrate localStorage → IDB. Chỉ chạy nếu IDB chưa có key tương
    // ứng VÀ localStorage có data. Idempotent.
    async function _maybeMigrateFromLs(prefixedKey, lsKey) {
        try {
            const existing = await _idbGet(prefixedKey);
            if (existing != null) return; // đã có ở IDB
            const raw = localStorage.getItem(lsKey);
            if (!raw) return;
            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch {
                return;
            }
            const ok = await _idbSet(prefixedKey, parsed);
            if (ok) {
                localStorage.removeItem(lsKey);
                console.log(`[Web2IdbStore] migrated "${lsKey}" → IDB`);
            }
        } catch (e) {
            console.warn(`[Web2IdbStore] migrate fail for ${lsKey}:`, e.message);
        }
    }

    function open(storeName, opts = {}) {
        const prefix = String(storeName || '').trim();
        if (!prefix) throw new Error('storeName required');
        const lsKey = opts.migrateFromLs || null;
        const _key = (k) => `${prefix}:${k}`;
        // Trigger migrate lần đầu open (nếu có lsKey). Không await — caller
        // sau đó gọi get/set sẽ tự await trong _idbPromise chain.
        let _migratePromise = null;
        if (lsKey) {
            _migratePromise = _maybeMigrateFromLs(_key('main'), lsKey);
        }
        return {
            async get(key = 'main') {
                if (_migratePromise) await _migratePromise;
                return _idbGet(_key(key));
            },
            async set(key, value) {
                if (arguments.length === 1) {
                    // set(value) → key='main'
                    value = key;
                    key = 'main';
                }
                if (_migratePromise) await _migratePromise;
                return _idbSet(_key(key), value);
            },
            async remove(key = 'main') {
                if (_migratePromise) await _migratePromise;
                return _idbRemove(_key(key));
            },
            // Đợi migrate xong (nếu caller cần guarantee trước khi đọc).
            async ready() {
                if (_migratePromise) await _migratePromise;
                return true;
            },
        };
    }

    global.Web2IdbStore = { open };
})(typeof window !== 'undefined' ? window : globalThis);
