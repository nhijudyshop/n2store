// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// AUTO-SYNC GIỎ TRỐNG TAG
// Logic:
//   - SL === 0  → server tự gắn tag GIỎ TRỐNG
//   - SL  >  0  → server tự gỡ tag GIỎ TRỐNG
// Server đảm nhiệm dedupe + gọi TPOS API.
// Client chỉ push event {orderId, orderCode, totalQuantity, currentTags}
// Trigger:
//   1. Sau khi fetchOrders() complete → batch sync toàn bộ
//   2. updateOrderInTable() detect TotalQuantity change → per-row sync (debounce 3s)
// =====================================================

(function() {
    'use strict';

    const LOG = '[EMPTY-CART-AUTO]';
    const SYNC_URL = 'https://n2store-realtime.onrender.com/api/tpos/empty-cart-sync';
    const DEBOUNCE_MS = 3000;
    const BATCH_STAGGER_MS = 100; // Stagger between requests during batch
    const BATCH_MAX_PARALLEL = 3;

    // orderId → setTimeout handle (per-order debounce)
    const _debounceTimers = new Map();

    /**
     * Parse Tags string/array → [{Id,Name,Color},...]
     */
    function _parseTags(tagsRaw) {
        if (!tagsRaw) return [];
        if (Array.isArray(tagsRaw)) return tagsRaw;
        try {
            const parsed = JSON.parse(tagsRaw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    /**
     * Sync XL (Tag XL panel) GIO_TRONG subtag based on server action.
     * - action='added' → assignOrderCategory(code, 3, {subTag: 'GIO_TRONG'})
     *                    (preserves existing flags + tTags via merge logic)
     * - action='removed' → only clear if XL.subTag === 'GIO_TRONG'
     */
    async function _syncXLGioTrong(orderCode, action) {
        if (!orderCode) return;
        const state = window.ProcessingTagState;
        if (!state || typeof state.getOrderData !== 'function') return;

        try {
            const data = state.getOrderData(orderCode);

            if (action === 'added') {
                // Skip if already set
                if (data && data.category === 3 && data.subTag === 'GIO_TRONG') return;
                if (typeof window.assignOrderCategory === 'function') {
                    await window.assignOrderCategory(orderCode, 3, {
                        subTag: 'GIO_TRONG',
                        source: 'AUTO-EMPTY-CART'
                    });
                    console.log(`${LOG} XL set GIO_TRONG → ${orderCode}`);
                }
            } else if (action === 'removed') {
                // Only clear if currently set to GIO_TRONG
                if (!data || data.subTag !== 'GIO_TRONG') return;
                if (typeof window.clearProcessingTag === 'function') {
                    await window.clearProcessingTag(orderCode);
                    console.log(`${LOG} XL clear GIO_TRONG → ${orderCode}`);
                }
            }
        } catch (e) {
            console.warn(`${LOG} XL sync failed for ${orderCode}:`, e.message);
        }
    }

    /**
     * POST to server with order info. Server decides whether to call TPOS.
     */
    async function _pushSync(order) {
        if (!order || !order.Id) return null;
        const sl = Number(order.TotalQuantity) || 0;
        const currentTags = _parseTags(order.Tags).map(t => ({
            Id: t.Id,
            Name: t.Name,
            Color: t.Color
        }));

        try {
            const res = await fetch(SYNC_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: order.Id,
                    orderCode: order.Code,
                    totalQuantity: sl,
                    currentTags
                })
            });
            if (!res.ok) {
                console.warn(`${LOG} HTTP ${res.status} for ${order.Code}`);
                return null;
            }
            const data = await res.json();
            // Update local Tags if server actually changed them
            if (data.action === 'added' || data.action === 'removed') {
                console.log(`${LOG} ${data.action} GIỎ TRỐNG → ${order.Code} (SL=${sl})`);
                if (data.newTags) {
                    // Avoid re-triggering ourselves: update Tags via OrderStore quietly
                    if (window.OrderStore?.isInitialized) {
                        window.OrderStore.update(order.Id, { Tags: JSON.stringify(data.newTags) });
                    }
                    // Update row UI inline (no re-render)
                    if (typeof window.updateRowTagsOnly === 'function') {
                        window.updateRowTagsOnly(order.Id, JSON.stringify(data.newTags), order.Code);
                    }
                }
                // Also sync XL (Tag XL panel) — set/unset GIO_TRONG subtag
                _syncXLGioTrong(order.Code, data.action);
            }
            return data;
        } catch (e) {
            console.warn(`${LOG} Push failed for ${order.Code}:`, e.message);
            return null;
        }
    }

    /**
     * Schedule a debounced sync for a single order.
     * Multiple calls within DEBOUNCE_MS for the same orderId collapse into one.
     */
    function scheduleEmptyCartSync(order) {
        if (!order || !order.Id) return;
        const id = order.Id;

        // Cancel any pending timer for this order
        if (_debounceTimers.has(id)) {
            clearTimeout(_debounceTimers.get(id));
        }

        const handle = setTimeout(() => {
            _debounceTimers.delete(id);
            // Re-fetch latest order from store at fire-time (avoid stale snapshot)
            const fresh = window.OrderStore?.get?.(id) || order;
            _pushSync(fresh);
        }, DEBOUNCE_MS);

        _debounceTimers.set(id, handle);
    }

    /**
     * Batch sync all orders (called after fetchOrders).
     * Throttled to avoid bursting the server.
     */
    async function batchEmptyCartSync(orders) {
        if (!Array.isArray(orders) || orders.length === 0) return;
        console.log(`${LOG} Batch sync ${orders.length} orders…`);

        let i = 0;
        async function worker() {
            while (i < orders.length) {
                const idx = i++;
                await _pushSync(orders[idx]);
                await new Promise(r => setTimeout(r, BATCH_STAGGER_MS));
            }
        }
        const workers = Array.from({ length: BATCH_MAX_PARALLEL }, () => worker());
        await Promise.all(workers);
        console.log(`${LOG} Batch sync done.`);
    }

    /**
     * Wrap updateOrderInTable to detect TotalQuantity changes.
     * Must run AFTER tab1-table.js loads.
     */
    function _installUpdateHook() {
        const orig = window.updateOrderInTable;
        if (typeof orig !== 'function') {
            console.warn(`${LOG} updateOrderInTable not found, retry in 500ms`);
            setTimeout(_installUpdateHook, 500);
            return;
        }
        if (orig.__emptyCartHooked) return;

        window.updateOrderInTable = function(orderId, updatedData) {
            // Capture old TotalQuantity BEFORE calling orig
            const before = window.OrderStore?.get?.(orderId);
            const oldSL = before ? Number(before.TotalQuantity) || 0 : null;

            const result = orig.apply(this, arguments);

            // Detect SL change
            if (updatedData && Object.prototype.hasOwnProperty.call(updatedData, 'TotalQuantity')) {
                const newSL = Number(updatedData.TotalQuantity) || 0;
                if (oldSL !== newSL) {
                    const after = window.OrderStore?.get?.(orderId);
                    if (after) scheduleEmptyCartSync(after);
                }
            }
            return result;
        };
        window.updateOrderInTable.__emptyCartHooked = true;
        console.log(`${LOG} updateOrderInTable hook installed`);
    }

    // =====================================================
    // EXPOSE
    // =====================================================
    window.scheduleEmptyCartSync = scheduleEmptyCartSync;
    window.batchEmptyCartSync = batchEmptyCartSync;

    // Install hook on DOMContentLoaded (tab1-table.js loads before this)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _installUpdateHook);
    } else {
        _installUpdateHook();
    }

    console.log(`${LOG} module loaded`);
})();
