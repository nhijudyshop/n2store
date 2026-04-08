// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * TPOS Invoice Snapshot Store
 * --------------------------------------------------------
 * Receives realtime FastSaleOrder snapshots from the N2Store extension
 * (intercepted on https://tomato.tpos.vn/#/app/fastsaleorder/invoicelist)
 * via Render WebSocket event `tpos:invoice-list-updated`.
 *
 * Renders a NEW column "Phiếu bán hàng TPOS" showing the invoice state
 * and reconciliation status — independent of the existing InvoiceStatusStore
 * (which is backed by PostgreSQL).
 *
 * Data lifecycle:
 *   Extension push  →  handleMessage (tab1-tpos-realtime.js)
 *                 →   TPOSInvoiceSnapshotStore.upsertBatch(invoices)
 *                 →   refreshCellsFor(saleOnlineIds)
 *
 * Persistence: localStorage cache with 24h TTL for quick reload.
 * The extension push is the source of truth.
 */
(function () {
    'use strict';

    const LS_KEY = 'tposInvoiceSnapshot_v1';
    const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
    const COLD_START_URL = 'https://n2store-fallback.onrender.com/api/tpos/fastsale-snapshot';
    const COLD_START_LOOKBACK_MS = 24 * 60 * 60 * 1000; // last 24h of FSO updates
    // Direct TPOS OData via Cloudflare worker proxy — bypasses Render server
    // (used when Render is down or its DateUpdated bug returns 400).
    const TPOS_ODATA_PROXY = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/ODataService.GetView';
    const FSO_SELECT = 'Id,Number,State,ShowState,StateCode,IsMergeCancel,PartnerDisplayName,AmountTotal,AmountPaid,Residual,DateInvoice,SaleOnlineIds';

    // Config copied from tab1-fast-sale-invoice-status.js (private IIFE there).
    // Keep in sync if colours/labels change.
    const SHOW_STATE_CONFIG = {
        'Nháp': { color: '#6c757d', bgColor: '#f3f4f6', borderColor: '#d1d5db' },
        'Nháp (Chờ hàng)': { color: '#b45309', bgColor: '#fef3c7', borderColor: '#fcd34d' },
        'Đã xác nhận': { color: '#2563eb', bgColor: '#dbeafe', borderColor: '#93c5fd' },
        'Huỷ bỏ': {
            color: '#dc2626',
            bgColor: '#fee2e2',
            borderColor: '#fca5a5',
            style: 'text-decoration: line-through;',
        },
        'Hủy bỏ': {
            color: '#dc2626',
            bgColor: '#fee2e2',
            borderColor: '#fca5a5',
            style: 'text-decoration: line-through;',
        },
        'Đã thanh toán': { color: '#059669', bgColor: '#d1fae5', borderColor: '#6ee7b7' },
        'Hoàn thành': { color: '#059669', bgColor: '#d1fae5', borderColor: '#6ee7b7' },
    };

    const STATE_CODE_CONFIG = {
        draft: { label: 'Nháp', color: '#17a2b8' },
        NotEnoughInventory: { label: 'Chờ nhập hàng', color: '#e67e22' },
        cancel: { label: 'Hủy', color: '#6c757d', style: 'text-decoration: line-through;' },
        IsMergeCancel: {
            label: 'Hủy do gộp đơn',
            color: '#6c757d',
            style: 'text-decoration: line-through;',
        },
        CrossCheckingError: { label: 'Lỗi đối soát', color: '#c0392b' },
        CrossCheckComplete: { label: 'Hoàn thành đối soát', color: '#27ae60' },
        CrossCheckSuccess: { label: 'Đối soát OK', color: '#27ae60' },
        CrossChecking: { label: 'Đang đối soát', color: '#27ae60' },
        None: { label: 'Chưa đối soát', color: '#6c757d' },
    };

    function getStateCodeConfig(stateCode, isMergeCancel) {
        if (isMergeCancel) return STATE_CODE_CONFIG.IsMergeCancel;
        if (stateCode === 'cancel') return STATE_CODE_CONFIG.cancel;
        return STATE_CODE_CONFIG[stateCode] || STATE_CODE_CONFIG.None;
    }

    function getShowStateConfig(showState) {
        return (
            SHOW_STATE_CONFIG[showState] || {
                color: '#6c757d',
                bgColor: '#f3f4f6',
                borderColor: '#d1d5db',
            }
        );
    }

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    const TPOSInvoiceSnapshotStore = {
        _byId: new Map(), // Map<String(FastSaleOrder.Id), snapshot>
        _bySaleOnlineId: new Map(), // Map<saleOnlineId, Set<FastSaleOrder.Id>>
        _lastUpdateTs: 0,

        init() {
            this._loadFromLocalStorage();
            console.log(
                '[TPOS-INV-SNAP] Loaded',
                this._byId.size,
                'snapshots from cache'
            );
            // Cold-start bulk fetch — call TPOS directly via worker proxy
            // (Render server endpoint has been flaky; this path bypasses it).
            this._coldStartFromTPOS();
        },

        async _coldStartFromTPOS() {
            // Wait for tokenManager to be ready (it loads asynchronously after page init)
            if (!window.tokenManager || typeof window.tokenManager.getAuthHeader !== 'function') {
                setTimeout(() => this._coldStartFromTPOS(), 2000);
                return;
            }
            try {
                const sinceIso = new Date(Date.now() - COLD_START_LOOKBACK_MS).toISOString();
                const filter = `DateInvoice gt ${sinceIso}`;
                const url = `${TPOS_ODATA_PROXY}?$top=500` +
                    `&$select=${encodeURIComponent(FSO_SELECT)}` +
                    `&$filter=${encodeURIComponent(filter)}` +
                    `&$orderby=Id desc`;
                const headers = await window.tokenManager.getAuthHeader();
                const resp = await fetch(url, {
                    headers: { ...headers, accept: 'application/json' }
                });
                if (!resp.ok) {
                    console.warn('[TPOS-INV-SNAP] Cold-start (worker) HTTP', resp.status);
                    return;
                }
                const data = await resp.json();
                const list = Array.isArray(data?.value) ? data.value : [];
                if (list.length === 0) return;
                const affected = this.upsertBatch(list);
                console.log(
                    '[TPOS-INV-SNAP] Cold-start (worker proxy):',
                    list.length,
                    'snapshots → affected rows:',
                    affected.length
                );
                if (affected.length > 0) {
                    this.refreshCellsFor(affected);
                    if (typeof this.refreshStatusCellsFor === 'function') {
                        this.refreshStatusCellsFor(affected);
                    }
                }
            } catch (e) {
                console.warn('[TPOS-INV-SNAP] Cold-start (worker) error:', e.message);
            }
        },

        async _coldStartFromServer() {
            try {
                const since = Date.now() - COLD_START_LOOKBACK_MS;
                const resp = await fetch(`${COLD_START_URL}?since=${since}`, {
                    headers: { accept: 'application/json' }
                });
                if (!resp.ok) {
                    console.warn('[TPOS-INV-SNAP] Cold-start HTTP', resp.status);
                    return;
                }
                const data = await resp.json();
                if (!data || !data.success || !Array.isArray(data.invoices)) return;
                if (data.invoices.length === 0) return;
                const affected = this.upsertBatch(data.invoices);
                console.log(
                    '[TPOS-INV-SNAP] Cold-start: loaded',
                    data.invoices.length,
                    'snapshots from server',
                    data.cached ? '(cached)' : '',
                    '→ affected rows:',
                    affected.length
                );
                if (affected.length > 0) {
                    this.refreshCellsFor(affected);
                }
            } catch (e) {
                console.warn('[TPOS-INV-SNAP] Cold-start error:', e.message);
            }
        },

        _loadFromLocalStorage() {
            try {
                const raw = localStorage.getItem(LS_KEY);
                if (!raw) return;
                const parsed = JSON.parse(raw);
                if (!parsed || !Array.isArray(parsed.entries)) return;
                const now = Date.now();
                if (parsed.savedAt && now - parsed.savedAt > TTL_MS) {
                    localStorage.removeItem(LS_KEY);
                    return;
                }
                for (const snap of parsed.entries) {
                    this._indexOne(snap);
                }
            } catch (e) {
                console.warn('[TPOS-INV-SNAP] Load cache error:', e.message);
            }
        },

        _saveToLocalStorage() {
            try {
                const entries = Array.from(this._byId.values());
                localStorage.setItem(
                    LS_KEY,
                    JSON.stringify({ savedAt: Date.now(), entries })
                );
            } catch (e) {
                // Ignore quota errors — cache is best-effort
            }
        },

        _indexOne(snap) {
            if (!snap || snap.Id == null) return;
            const idKey = String(snap.Id);
            this._byId.set(idKey, snap);
            const saleOnlineIds = Array.isArray(snap.SaleOnlineIds)
                ? snap.SaleOnlineIds
                : [];
            for (const soId of saleOnlineIds) {
                if (!soId) continue;
                const key = String(soId);
                let set = this._bySaleOnlineId.get(key);
                if (!set) {
                    set = new Set();
                    this._bySaleOnlineId.set(key, set);
                }
                set.add(idKey);
            }
        },

        /**
         * Bulk-upsert snapshots. Older versions (by DateUpdated or Id parity)
         * are overwritten by newer ones.
         * @param {Array<Object>} invoices
         * @returns {Array<string>} affected saleOnlineIds (unique)
         */
        upsertBatch(invoices) {
            if (!Array.isArray(invoices) || invoices.length === 0) return [];
            const affected = new Set();
            for (const inv of invoices) {
                if (!inv || inv.Id == null) continue;
                const idKey = String(inv.Id);
                const existing = this._byId.get(idKey);
                if (existing && existing.DateUpdated && inv.DateUpdated) {
                    // Prefer newer DateUpdated
                    if (new Date(inv.DateUpdated).getTime() <= new Date(existing.DateUpdated).getTime()) {
                        // Same or older — skip but still mark rows as potentially affected
                        // to allow first-paint refresh when coming back from cache.
                    }
                }
                this._indexOne(inv);
                const list = Array.isArray(inv.SaleOnlineIds) ? inv.SaleOnlineIds : [];
                for (const soId of list) {
                    if (soId) affected.add(String(soId));
                }
            }
            this._lastUpdateTs = Date.now();
            this._saveToLocalStorage();
            return Array.from(affected);
        },

        /**
         * Return the most recent snapshot for a SaleOnlineId. If multiple
         * FastSaleOrders reference the same SaleOnlineId (e.g. cancel + new),
         * pick the one with the latest DateInvoice (fallback: largest Id).
         */
        getBySaleOnlineId(saleOnlineId) {
            if (!saleOnlineId) return null;
            const set = this._bySaleOnlineId.get(String(saleOnlineId));
            if (!set || set.size === 0) return null;
            let best = null;
            for (const idKey of set) {
                const snap = this._byId.get(idKey);
                if (!snap) continue;
                if (!best) {
                    best = snap;
                    continue;
                }
                const a = snap.DateInvoice ? new Date(snap.DateInvoice).getTime() : 0;
                const b = best.DateInvoice ? new Date(best.DateInvoice).getTime() : 0;
                if (a > b || (a === b && Number(snap.Id) > Number(best.Id))) {
                    best = snap;
                }
            }
            return best;
        },

        /**
         * Re-render the "invoice-status-tpos" cell for each matching DOM row.
         */
        refreshCellsFor(saleOnlineIds) {
            if (!Array.isArray(saleOnlineIds) || saleOnlineIds.length === 0) return;
            if (typeof window.renderInvoiceStatusTposCell !== 'function') return;
            let updated = 0;
            for (const soId of saleOnlineIds) {
                if (!soId) continue;
                const row = document.querySelector(
                    `tr[data-order-id="${soId}"]`
                );
                if (!row) continue;
                const cell = row.querySelector(
                    'td[data-column="invoice-status-tpos"]'
                );
                if (!cell) continue;
                const order =
                    (window.OrderStore && window.OrderStore.get && window.OrderStore.get(soId)) ||
                    (window.displayedData || []).find(
                        (o) => String(o.Id) === String(soId)
                    ) ||
                    { Id: soId };
                cell.innerHTML = window.renderInvoiceStatusTposCell(order);
                updated++;
            }
            if (updated > 0) {
                console.log(
                    '[TPOS-INV-SNAP] Refreshed',
                    updated,
                    'cells of',
                    saleOnlineIds.length,
                    'candidates'
                );
            }
        },

        /**
         * Fetch FRESH invoice snapshots from Render server (which proxies TPOS
         * invoicelist OData). Used by RT handler to ensure cells reflect the
         * authoritative state, not just whatever the WS payload happened to carry.
         * @param {Array<number|string>} invoiceIds - FastSaleOrder.Id list
         * @returns {Promise<Array<string>>} affected saleOnlineIds
         */
        async fetchFreshByIds(invoiceIds) {
            if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) return [];
            if (!window.tokenManager || typeof window.tokenManager.getAuthHeader !== 'function') return [];
            try {
                const ids = invoiceIds.filter(Boolean).map(Number).filter(Number.isFinite);
                if (ids.length === 0) return [];
                const filter = ids.map(i => `Id eq ${i}`).join(' or ');
                const url = `${TPOS_ODATA_PROXY}?$top=${ids.length}` +
                    `&$select=${encodeURIComponent(FSO_SELECT)}` +
                    `&$filter=${encodeURIComponent(filter)}`;
                const headers = await window.tokenManager.getAuthHeader();
                const resp = await fetch(url, {
                    headers: { ...headers, accept: 'application/json' }
                });
                if (!resp.ok) {
                    console.warn('[TPOS-INV-SNAP] fetchFreshByIds HTTP', resp.status);
                    return [];
                }
                const data = await resp.json();
                const list = Array.isArray(data?.value) ? data.value : [];
                if (list.length === 0) return [];
                return this.upsertBatch(list);
            } catch (e) {
                console.warn('[TPOS-INV-SNAP] fetchFreshByIds error:', e.message);
                return [];
            }
        },

        /**
         * Re-render the "status" (Trạng thái) cell for affected rows, deriving
         * the displayed status from the latest TPOS snapshot. UI-only override —
         * does NOT mutate order.Status or write back to Pancake.
         */
        refreshStatusCellsFor(saleOnlineIds) {
            if (!Array.isArray(saleOnlineIds) || saleOnlineIds.length === 0) return;
            let updated = 0;
            for (const soId of saleOnlineIds) {
                if (!soId) continue;
                const row = document.querySelector(`tr[data-order-id="${soId}"]`);
                if (!row) continue;
                const cell = row.querySelector('td[data-column="status"]');
                if (!cell) continue;
                const snap = this.getBySaleOnlineId(soId);
                const derived = deriveStatusFromTPOS(snap);
                if (!derived) continue;
                const order =
                    (window.OrderStore && window.OrderStore.get && window.OrderStore.get(soId)) ||
                    (window.displayedData || []).find((o) => String(o.Id) === String(soId)) ||
                    { Id: soId, Status: '' };
                cell.innerHTML =
                    `<span class="status-badge ${derived.cls}" style="cursor:pointer;" ` +
                    `onclick="openOrderStatusModal('${order.Id}', '${order.Status || ''}')" ` +
                    `data-order-id="${order.Id}" title="Cập nhật từ TPOS RT">` +
                    `${escapeHtml(derived.text)}</span>`;
                updated++;
            }
            if (updated > 0) {
                console.log('[TPOS-INV-SNAP] Refreshed', updated, 'status cells of', saleOnlineIds.length, 'candidates');
            }
        },

        stats() {
            return {
                snapshots: this._byId.size,
                saleOnlineIndex: this._bySaleOnlineId.size,
                lastUpdateTs: this._lastUpdateTs,
            };
        },
    };

    /**
     * Map a TPOS invoice snapshot to a display status for the "Trạng thái"
     * column. Returns null when there is no meaningful override → caller keeps
     * the existing Pancake-derived cell.
     */
    function deriveStatusFromTPOS(snap) {
        if (!snap) return null;
        const ss = snap.ShowState || '';
        const sc = snap.StateCode || '';
        if (snap.IsMergeCancel) return { text: 'Gộp/Hủy', cls: 'status-cancel' };
        if (/Hu[ỷy]\s*b[ỏo]/i.test(ss)) return { text: 'Đã hủy', cls: 'status-cancel' };
        if (ss === 'Nháp') return { text: 'Nháp', cls: 'status-draft' };
        if (ss === 'Hoàn thành' || ss === 'Đã thanh toán') {
            return { text: ss, cls: 'status-paid' };
        }
        if (ss === 'Đã xác nhận') {
            if (sc === 'CrossCheckComplete' || sc === 'CrossCheckSuccess') {
                return { text: 'Đã đối soát', cls: 'status-order strong' };
            }
            return { text: 'Đơn hàng', cls: 'status-order' };
        }
        return null;
    }

    /**
     * Render the cell HTML for the "Phiếu bán hàng TPOS" column.
     * @param {Object} order - SaleOnlineOrder row from web table
     * @returns {string} HTML string
     */
    function renderInvoiceStatusTposCell(order) {
        if (!order || !order.Id) {
            return '<span style="color:#9ca3af;">−</span>';
        }
        const snap = TPOSInvoiceSnapshotStore.getBySaleOnlineId(order.Id);
        if (!snap) {
            return '<span style="color:#9ca3af;">−</span>';
        }

        const showState = snap.ShowState || '';
        const stateCode = snap.StateCode || 'None';
        const isMergeCancel = snap.IsMergeCancel === true;
        const showStateCfg = getShowStateConfig(showState);
        const stateCodeCfg = getStateCodeConfig(stateCode, isMergeCancel);
        const stateCodeStyle = stateCodeCfg.style || '';
        const showStateStyle = showStateCfg.style || '';
        const numberEsc = escapeHtml(snap.Number || '');
        const showStateEsc = escapeHtml(showState || '−');
        const reconcileLabelEsc = escapeHtml(stateCodeCfg.label || '−');

        return (
            `<div class="invoice-status-tpos-cell" title="Số phiếu: ${numberEsc}">` +
            `<span class="state-badge" style="background:${showStateCfg.bgColor};color:${showStateCfg.color};border:1px solid ${showStateCfg.borderColor};${showStateStyle}">${showStateEsc}</span>` +
            `<span class="reconcile-line" style="color:${stateCodeCfg.color};${stateCodeStyle}">${reconcileLabelEsc}</span>` +
            `</div>`
        );
    }

    // Initialize cache on load
    TPOSInvoiceSnapshotStore.init();

    // Expose globally
    window.TPOSInvoiceSnapshotStore = TPOSInvoiceSnapshotStore;
    window.renderInvoiceStatusTposCell = renderInvoiceStatusTposCell;
})();
