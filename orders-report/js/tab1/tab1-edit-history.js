// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// TAB1 — EDIT HISTORY STORE
// Log thay đổi đơn hàng trong edit modal (add/remove/qty/price product) +
// restore snapshot trước khi sửa. Persist localStorage để survive reload.
// API:
//   - window.OrderEditHistory.captureSnapshot(orderId, orderCode, details)
//   - window.OrderEditHistory.logChange(orderId, action, payload)
//   - window.OrderEditHistory.getHistory(orderId)
//   - window.OrderEditHistory.getSnapshot(orderId)
//   - window.OrderEditHistory.restore(orderId)
//   - window.OrderEditHistory.clearHistory(orderId)
//   - window.OrderEditHistory.getAllOrderIds()
// =====================================================

(function () {
    'use strict';
    if (window.__orderEditHistoryLoaded) return;
    window.__orderEditHistoryLoaded = true;

    const LS_KEY = 'n2s_order_edit_history_v1';
    const MAX_HISTORY_PER_ORDER = 50;
    const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    // In-memory cache: { [orderId]: { snapshot, snapshotAt, orderCode, changes: [...] } }
    let _store = {};

    function _load() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return {};
            const obj = JSON.parse(raw);
            // Cleanup expired entries
            const cutoff = Date.now() - MAX_AGE_MS;
            const cleaned = {};
            for (const [orderId, entry] of Object.entries(obj)) {
                if (entry?.snapshotAt && entry.snapshotAt > cutoff) {
                    cleaned[orderId] = entry;
                }
            }
            return cleaned;
        } catch (e) {
            return {};
        }
    }

    function _save() {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(_store));
        } catch (e) {
            // Quota exceeded → drop oldest entries until fit
            try {
                const entries = Object.entries(_store).sort(
                    (a, b) => (a[1].snapshotAt || 0) - (b[1].snapshotAt || 0)
                );
                while (entries.length > 5) {
                    const [oldId] = entries.shift();
                    delete _store[oldId];
                }
                localStorage.setItem(LS_KEY, JSON.stringify(_store));
            } catch (e2) {
                console.warn('[EDIT-HISTORY] localStorage save failed:', e2.message);
            }
        }
    }

    _store = _load();

    /**
     * Capture snapshot of order's Details array RIGHT BEFORE user starts editing.
     * Idempotent — if snapshot already exists for this orderId in the same session,
     * keep the original (preserve "trước khi sửa" intent across multi-step edits).
     */
    function captureSnapshot(orderId, orderCode, details) {
        if (!orderId) return;
        const id = String(orderId);
        if (_store[id]?.snapshot) {
            // Already have snapshot — keep it (don't overwrite mid-edit)
            return;
        }
        _store[id] = {
            orderCode: orderCode || '',
            snapshotAt: Date.now(),
            // Deep clone Details to avoid mutation
            snapshot: JSON.parse(JSON.stringify(details || [])),
            changes: [],
        };
        _save();
        console.log(`[EDIT-HISTORY] Snapshot captured for order ${orderCode || id}`);
    }

    /**
     * Log a change action. payload is action-specific:
     *   add:    { productId, productCode, productName, quantity, price }
     *   remove: { productId, productCode, productName, quantity, price, atIndex }
     *   qty:    { productId, productCode, productName, oldQty, newQty }
     *   price:  { productId, productCode, productName, oldPrice, newPrice }
     */
    function logChange(orderId, action, payload) {
        if (!orderId) return;
        const id = String(orderId);
        if (!_store[id]) {
            // No snapshot → can't restore but still log changes for visibility
            _store[id] = { snapshotAt: Date.now(), snapshot: null, changes: [] };
        }
        const entry = {
            at: Date.now(),
            action,
            ...payload,
            user: window.authManager?.getAuthState?.()?.displayName || 'Unknown',
        };
        _store[id].changes.push(entry);
        // Cap history per order
        if (_store[id].changes.length > MAX_HISTORY_PER_ORDER) {
            _store[id].changes = _store[id].changes.slice(-MAX_HISTORY_PER_ORDER);
        }
        _save();
        console.log(`[EDIT-HISTORY] ${action} logged for order ${id}:`, entry);
    }

    function getHistory(orderId) {
        const entry = _store[String(orderId)];
        return entry?.changes || [];
    }

    function getSnapshot(orderId) {
        const entry = _store[String(orderId)];
        if (!entry?.snapshot) return null;
        // Return clone to caller (prevent mutation of stored snapshot)
        return JSON.parse(JSON.stringify(entry.snapshot));
    }

    function getEntry(orderId) {
        return _store[String(orderId)] || null;
    }

    /**
     * Restore: replace currentEditOrderData.Details với snapshot ban đầu.
     * Caller (modal) sau đó re-render UI. Sau restore, snapshot vẫn giữ
     * (user có thể restore lại lần nữa nếu lỡ tay sửa tiếp).
     */
    function restore(orderId) {
        const id = String(orderId);
        const snap = getSnapshot(id);
        if (!snap) return null;
        // Log restore action
        if (_store[id]) {
            _store[id].changes.push({
                at: Date.now(),
                action: 'restore',
                user: window.authManager?.getAuthState?.()?.displayName || 'Unknown',
            });
            _save();
        }
        return snap;
    }

    function clearHistory(orderId) {
        const id = String(orderId);
        delete _store[id];
        _save();
    }

    function getAllOrderIds() {
        return Object.keys(_store);
    }

    /**
     * Trả mảng entries gọn cho admin tools/UI hiển thị.
     */
    function getAllEntries() {
        return Object.entries(_store)
            .map(([orderId, entry]) => ({
                orderId,
                orderCode: entry.orderCode || '',
                snapshotAt: entry.snapshotAt,
                changeCount: (entry.changes || []).length,
                hasSnapshot: !!entry.snapshot,
                lastChangeAt:
                    entry.changes?.length > 0
                        ? entry.changes[entry.changes.length - 1].at
                        : entry.snapshotAt,
            }))
            .sort((a, b) => (b.lastChangeAt || 0) - (a.lastChangeAt || 0));
    }

    window.OrderEditHistory = {
        captureSnapshot,
        logChange,
        getHistory,
        getSnapshot,
        getEntry,
        restore,
        clearHistory,
        getAllOrderIds,
        getAllEntries,
    };
})();
