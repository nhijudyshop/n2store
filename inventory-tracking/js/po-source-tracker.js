// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// PO SOURCE TRACKER
// Fetches purchase-orders Drafts from API, builds a Map keyed by inventory
// invoiceId (= dotHang.id) → Set of sanPham indices that have been pushed to
// at least one PO Draft. Inventory-tracking renderer reads this map to badge
// matched products.
//
// Source linkage was added to PO items via {sourceInvoiceId, sourceItemIdx}
// (see render.com/routes/v2/purchase-orders.js + inventory-tracking/js/modal-convert-po.js).
// =====================================================

(function () {
    const PO_LIST_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/v2/purchase-orders';

    // Map<sourceInvoiceId, Set<sourceItemIdx>>
    let _sourceMap = new Map();
    let _loadedAt = 0;
    let _loadingPromise = null;

    /**
     * Fetch all PO Drafts and rebuild the source map.
     * Idempotent — safe to call multiple times (will dedupe inflight requests).
     */
    async function refresh() {
        if (_loadingPromise) return _loadingPromise;
        _loadingPromise = (async () => {
            try {
                // pageSize 500 — Drafts thường ít, nếu nhiều hơn cần phân trang.
                const url = `${PO_LIST_URL}?status=DRAFT&pageSize=500`;
                const r = await fetch(url);
                if (!r.ok) {
                    console.warn('[PO-TRACKER] fetch failed:', r.status);
                    return;
                }
                const data = await r.json();
                const orders = Array.isArray(data?.orders)
                    ? data.orders
                    : Array.isArray(data?.data)
                      ? data.data
                      : Array.isArray(data)
                        ? data
                        : [];
                const next = new Map();
                for (const order of orders) {
                    const items = Array.isArray(order?.items) ? order.items : [];
                    for (const it of items) {
                        const invId = it?.sourceInvoiceId;
                        const idx = it?.sourceItemIdx;
                        if (!invId || typeof idx !== 'number') continue;
                        if (!next.has(invId)) next.set(invId, new Set());
                        next.get(invId).add(idx);
                    }
                }
                _sourceMap = next;
                _loadedAt = Date.now();
                console.log(
                    `[PO-TRACKER] Loaded ${orders.length} drafts, ${_sourceMap.size} invoices linked`
                );
            } catch (err) {
                console.warn('[PO-TRACKER] refresh error:', err.message);
            } finally {
                _loadingPromise = null;
            }
        })();
        return _loadingPromise;
    }

    /**
     * Check if inventory product (invoiceId, productIdx) has been pushed to a PO Draft.
     */
    function isInDraft(invoiceId, productIdx) {
        if (!invoiceId || typeof productIdx !== 'number') return false;
        const set = _sourceMap.get(invoiceId);
        return !!set && set.has(productIdx);
    }

    /**
     * Count products in this dotHang that have been pushed to at least one PO Draft.
     */
    function countInDraft(invoiceId) {
        if (!invoiceId) return 0;
        const set = _sourceMap.get(invoiceId);
        return set ? set.size : 0;
    }

    /**
     * Refresh + re-render the inventory table.
     * Called after convert-PO submits successfully.
     */
    async function refreshAndRerender() {
        await refresh();
        // `globalState` and `renderShipments` are declared in script-tag scope
        // (not window properties). Bare references work because all <script>
        // tags share the same global execution context.
        try {
            if (
                typeof renderShipments === 'function' &&
                typeof globalState !== 'undefined' &&
                globalState?.shipments
            ) {
                renderShipments(globalState.filteredShipments || globalState.shipments);
            }
        } catch (e) {
            console.warn('[PO-TRACKER] rerender failed:', e.message);
        }
    }

    window.PoSourceTracker = {
        refresh,
        refreshAndRerender,
        isInDraft,
        countInDraft,
        get loadedAt() {
            return _loadedAt;
        },
        get sourceMap() {
            return _sourceMap;
        },
    };

    console.log('[PO-TRACKER] Module loaded');
})();
