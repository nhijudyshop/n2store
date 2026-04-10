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

    // Module guard — chống IIFE chạy 2 lần (vd recursive iframe load)
    if (window.__tab1EmptyCartAutoSyncLoaded) {
        return;
    }
    window.__tab1EmptyCartAutoSyncLoaded = true;

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
     * Lightweight XL sync — bypass assignOrderCategory chain to avoid:
     *   - Triggering syncXLToTPOS (TPOS already handled by server)
     *   - Heavy auto-detect-flags + autoDetectFlags chain
     * Directly mutate ProcessingTagState + save API + refresh row.
     *
     * Independent of server action — runs purely on actual SL.
     * - SL=0 + XL.subTag !== 'GIO_TRONG' → set category=3, subTag='GIO_TRONG'
     * - SL>0 + XL.subTag === 'GIO_TRONG' → clear category+subTag (preserve flags+tTags)
     */
    async function _syncXLGioTrong(orderCode, totalQuantity) {
        if (!orderCode) return;
        const state = window.ProcessingTagState;
        if (!state || typeof state.getOrderData !== 'function' || typeof state.setOrderData !== 'function') return;

        try {
            const existing = state.getOrderData(orderCode);
            // Stricter check: must have BOTH category=3 AND subTag=GIO_TRONG.
            // Orphan state (subTag=GIO_TRONG but category=null) is treated as missing
            // because renderProcessingTagCell checks category first.
            const hasGT = existing?.category === 3 && existing?.subTag === 'GIO_TRONG';
            let nextData = null;

            // Special rule: đơn đã "ĐÃ GỘP KHÔNG CHỐT" thì không gắn GIỎ TRỐNG
            if (totalQuantity === 0 && existing?.category === 3 && existing?.subTag === 'DA_GOP_KHONG_CHOT') {
                return;
            }

            if (totalQuantity === 0 && !hasGT) {
                // SET GIO_TRONG (preserve flags + tTags)
                nextData = {
                    category: 3,
                    subTag: 'GIO_TRONG',
                    subState: null,
                    flags: existing?.flags ? [...existing.flags] : [],
                    tTags: existing?.tTags ? [...existing.tTags] : [],
                    note: existing?.note || '',
                    assignedAt: Date.now(),
                    previousPosition: existing?.previousPosition || null
                };
            } else if (totalQuantity > 0 && hasGT) {
                // CLEAR — keep flags + tTags, drop category/subTag/subState
                nextData = {
                    ...existing,
                    category: null,
                    subTag: null,
                    subState: null,
                    assignedAt: Date.now()
                };
            } else {
                return; // noop
            }

            // 1. Mutate local state
            state.setOrderData(orderCode, nextData);

            // 2. Refresh row UI (idempotent, fast)
            if (typeof window._ptagRefreshRow === 'function') {
                window._ptagRefreshRow(orderCode);
            }

            // 3. Persist to server (fire-and-forget; no await blocking batch)
            if (typeof window.saveProcessingTagToAPI === 'function') {
                window.saveProcessingTagToAPI(orderCode, nextData).catch(e => {
                    console.warn(`${LOG} save XL ${orderCode} failed:`, e.message);
                });
            }

            // Only log per-row changes from individual updates (not batch)
            if (_debounceTimers.size > 0) {
                console.log(`${LOG} XL ${totalQuantity === 0 ? 'set' : 'clear'} GIO_TRONG → ${orderCode}`);
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

        // Special rule: nếu đơn đã có "ĐÃ GỘP KHÔNG CHỐT" thì KHÔNG cần thêm "GIỎ TRỐNG"
        // (đơn gốc đã được gộp sang đơn khác — không cần đánh dấu giỏ trống nữa)
        if (sl === 0) {
            const xl = window.ProcessingTagState?.getOrderData?.(order.Code);
            if (xl?.category === 3 && xl?.subTag === 'DA_GOP_KHONG_CHOT') {
                console.log(`${LOG} skip GIỎ TRỐNG for ${order.Code} (already DA_GOP_KHONG_CHOT)`);
                return null;
            }
        }

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
            // Update local Tags if server actually changed them on TPOS
            if (data.action === 'added' || data.action === 'removed') {
                console.log(`${LOG} ${data.action} GIỎ TRỐNG (TPOS) → ${order.Code} (SL=${sl})`);
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
            }
            // ALWAYS sync XL based on actual SL (not gated on server action).
            // Server may return 'noop' if TPOS already correct, but XL might still be stale.
            _syncXLGioTrong(order.Code, sl);
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
    // Match tag GIỎ TRỐNG đồng bộ với server logic (name uppercase exact match).
    // Server cũng accept match qua Id nhưng client không biết Id → match qua name là đủ
    // (mọi tag GIỎ TRỐNG trên TPOS đều có name "GIỎ TRỐNG").
    const GIO_TRONG_NAME_UPPER = 'GIỎ TRỐNG';
    function _hasGioTrongTag(order) {
        return _parseTags(order?.Tags).some(t =>
            String(t?.Name || '').trim().toUpperCase() === GIO_TRONG_NAME_UPPER
        );
    }

    async function batchEmptyCartSync(orders) {
        if (!Array.isArray(orders) || orders.length === 0) return;

        // Phase 1: Chunked XL sync — yield to main thread every CHUNK_SIZE orders
        // to prevent UI freeze on 3000+ orders
        const CHUNK_SIZE = 200;
        const state = window.ProcessingTagState;
        let xlChanged = 0;
        let xlSkipped = 0;

        function processXLChunk(startIdx) {
            const end = Math.min(startIdx + CHUNK_SIZE, orders.length);
            for (let i = startIdx; i < end; i++) {
                const o = orders[i];
                if (!o?.Code) continue;
                const sl = Number(o.TotalQuantity) || 0;

                // Fast-path: skip if XL state already matches SL
                if (state && typeof state.getOrderData === 'function') {
                    const existing = state.getOrderData(o.Code);
                    const hasGT = existing?.category === 3 && existing?.subTag === 'GIO_TRONG';
                    if (sl > 0 && !hasGT) { xlSkipped++; continue; }
                    if (sl === 0 && hasGT) { xlSkipped++; continue; }
                }

                _syncXLGioTrong(o.Code, sl);
                xlChanged++;
            }
            if (end < orders.length) {
                setTimeout(() => processXLChunk(end), 0); // yield to main thread
            } else {
                console.log(`${LOG} XL sync done: ${xlChanged} changed, ${xlSkipped} skipped (${orders.length} total)`);
            }
        }
        // Start chunked XL sync (non-blocking)
        processXLChunk(0);

        // Phase 2: Pre-filter POST — only orders that actually need TPOS Tag change
        const needSync = orders.filter(o => {
            if (!o || !o.Id) return false;
            const sl = Number(o.TotalQuantity) || 0;
            const hasGT = _hasGioTrongTag(o);
            return (sl === 0 && !hasGT) || (sl > 0 && hasGT);
        });

        if (needSync.length === 0) {
            console.log(`${LOG} TPOS sync: 0/${orders.length} need change`);
            return;
        }
        console.log(`${LOG} TPOS sync: ${needSync.length}/${orders.length} need change`);

        // Phase 3: Staggered HTTP requests (reduced parallelism to avoid server overload)
        let i = 0;
        async function worker() {
            while (i < needSync.length) {
                const idx = i++;
                await _pushSync(needSync[idx]);
                await new Promise(r => setTimeout(r, BATCH_STAGGER_MS));
            }
        }
        const workers = Array.from({ length: BATCH_MAX_PARALLEL }, () => worker());
        await Promise.all(workers);
        console.log(`${LOG} TPOS sync done: ${needSync.length} orders synced`);
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
