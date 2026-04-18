// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// GIỎ TRỐNG CLEANUP (no more auto-sync)
// =====================================================
// Chính sách mới (2026-04-18):
//   - KHÔNG auto-gắn tag GIỎ TRỐNG theo SL nữa
//   - Bảng KHÔNG cho phép gắn tag GIỎ TRỐNG (TAG + TAG XL)
//   - Filter "GIỎ TRỐNG" trên panel giờ lọc theo TotalQuantity === 0
//   - Module này chỉ còn nhiệm vụ: phát hiện tag GIỎ TRỐNG lỡ bị gắn
//     → tự động gỡ trên TPOS + clear XL state (nếu subTag=GIO_TRONG)
// API alias giữ nguyên (window.batchEmptyCartSync / scheduleEmptyCartSync)
// để không vỡ caller cũ.
// =====================================================

(function() {
    'use strict';

    if (window.__tab1EmptyCartAutoSyncLoaded) {
        return;
    }
    window.__tab1EmptyCartAutoSyncLoaded = true;

    const LOG = '[EMPTY-CART-CLEANUP]';
    const ASSIGN_TAG_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag';
    const GIO_TRONG_NAME_UPPER = 'GIỎ TRỐNG';
    const BATCH_STAGGER_MS = 100;
    const BATCH_MAX_PARALLEL = 3;

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

    function _hasGioTrongTag(order) {
        return _parseTags(order?.Tags).some(t =>
            String(t?.Name || '').trim().toUpperCase() === GIO_TRONG_NAME_UPPER
        );
    }

    /**
     * Clear XL state if orphan subTag=GIO_TRONG exists (legacy data).
     * Preserves flags + tTags.
     */
    function _clearXLGioTrong(orderCode) {
        if (!orderCode) return;
        const state = window.ProcessingTagState;
        if (!state || typeof state.getOrderData !== 'function' || typeof state.setOrderData !== 'function') return;

        const existing = state.getOrderData(orderCode);
        if (existing?.subTag !== 'GIO_TRONG') return;

        const nextData = {
            ...existing,
            category: existing.category === 3 ? null : existing.category,
            subTag: null,
            subState: null,
            assignedAt: Date.now()
        };

        try {
            state.setOrderData(orderCode, nextData);
            if (typeof window._ptagRefreshRow === 'function') {
                window._ptagRefreshRow(orderCode);
            }
            if (typeof window.queueProcessingTagSave === 'function') {
                window.queueProcessingTagSave(orderCode, nextData);
            } else if (typeof window.saveProcessingTagToAPI === 'function') {
                window.saveProcessingTagToAPI(orderCode, nextData).catch(() => {});
            }
            console.log(`${LOG} cleared XL GIO_TRONG → ${orderCode}`);
        } catch (e) {
            console.warn(`${LOG} clear XL failed for ${orderCode}:`, e.message);
        }
    }

    /**
     * Remove TPOS tag "GIỎ TRỐNG" from a single order via AssignTag (replace).
     * Updates local OrderStore + row UI on success.
     */
    async function _removeGioTrongTagTPOS(order) {
        if (!order || !order.Id) return false;
        const tags = _parseTags(order.Tags);
        const filtered = tags.filter(t =>
            String(t?.Name || '').trim().toUpperCase() !== GIO_TRONG_NAME_UPPER
        );
        if (filtered.length === tags.length) return false;

        try {
            if (!window.tokenManager || !window.API_CONFIG?.smartFetch) {
                console.warn(`${LOG} tokenManager/smartFetch unavailable, skip removal for ${order.Code}`);
                return false;
            }
            const headers = await window.tokenManager.getAuthHeader();
            const res = await window.API_CONFIG.smartFetch(ASSIGN_TAG_URL, {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    Tags: filtered.map(t => ({ Id: t.Id, Color: t.Color, Name: t.Name })),
                    OrderId: order.Id
                })
            });
            if (!res.ok) {
                console.warn(`${LOG} AssignTag HTTP ${res.status} for ${order.Code}`);
                return false;
            }
            const newTagsStr = JSON.stringify(filtered);
            if (window.OrderStore?.isInitialized) {
                window.OrderStore.update(order.Id, { Tags: newTagsStr });
            }
            if (typeof window.updateRowTagsOnly === 'function') {
                window.updateRowTagsOnly(order.Id, newTagsStr, order.Code);
            }
            console.log(`${LOG} removed TPOS tag GIỎ TRỐNG → ${order.Code}`);
            return true;
        } catch (e) {
            console.warn(`${LOG} remove TPOS tag failed for ${order.Code}:`, e.message);
            return false;
        }
    }

    /**
     * Per-order cleanup: remove TPOS tag + clear XL state if present.
     */
    async function scheduleEmptyCartSync(order) {
        if (!order) return;
        if (_hasGioTrongTag(order)) {
            await _removeGioTrongTagTPOS(order);
        }
        _clearXLGioTrong(order.Code);
    }

    /**
     * Batch cleanup: scan orders → remove any TPOS tag GIỎ TRỐNG + clear XL orphan.
     * Non-blocking: XL clear runs inline (fast), TPOS removals run staggered.
     */
    async function batchEmptyCartSync(orders) {
        if (!Array.isArray(orders) || orders.length === 0) return;

        // Phase 1: Clear XL state orphans (fast, no network)
        let xlCleared = 0;
        for (const o of orders) {
            if (!o?.Code) continue;
            const existing = window.ProcessingTagState?.getOrderData?.(o.Code);
            if (existing?.subTag === 'GIO_TRONG') {
                _clearXLGioTrong(o.Code);
                xlCleared++;
            }
        }
        if (xlCleared > 0) {
            console.log(`${LOG} cleared ${xlCleared} XL GIO_TRONG orphans`);
        }

        // Phase 2: Remove TPOS tag GIỎ TRỐNG on any order that still has it
        const needRemoval = orders.filter(o => o?.Id && _hasGioTrongTag(o));
        if (needRemoval.length === 0) return;

        console.log(`${LOG} removing TPOS tag GIỎ TRỐNG from ${needRemoval.length} orders`);

        let i = 0;
        async function worker() {
            while (i < needRemoval.length) {
                const idx = i++;
                await _removeGioTrongTagTPOS(needRemoval[idx]);
                await new Promise(r => setTimeout(r, BATCH_STAGGER_MS));
            }
        }
        const workers = Array.from({ length: BATCH_MAX_PARALLEL }, () => worker());
        await Promise.all(workers);
        console.log(`${LOG} TPOS tag cleanup done: ${needRemoval.length} orders`);
    }

    window.scheduleEmptyCartSync = scheduleEmptyCartSync;
    window.batchEmptyCartSync = batchEmptyCartSync;

    console.log(`${LOG} module loaded (cleanup-only mode)`);
})();
