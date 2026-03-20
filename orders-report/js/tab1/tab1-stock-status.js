/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║               TAB1 STOCK STATUS ENGINE (Kiểm tra tồn kho)                  ║
 * ║     Tự động check tồn kho từng đơn → badge + auto Processing Tags          ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  [A] STATE & CONFIG                                                         ║
 * ║  [B] DATA LOADING (Firebase)                                                ║
 * ║  [C] STOCK COMPUTATION (Classify + Allocate)                                ║
 * ║  [D] PROCESSING TAGS SYNC                                                   ║
 * ║  [E] UI RENDERING (Badges, Tooltips, Filter)                                ║
 * ║  [F] PUBLIC API                                                             ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

(function () {
    'use strict';

    // =====================================================
    // [A] STATE & CONFIG
    // =====================================================

    const StockStatusEngine = {
        _stockMap: new Map(),        // ProductCode → { qty, name, id }
        _orderProducts: new Map(),   // OrderId → [{ code, name, qty }]
        _orderStatus: new Map(),     // OrderId → { status, blocking[], stockTags[] }
        _checked: false,
        _loading: false,
        _summaryStats: { ready: 0, waiting: 0, critical: 0, noProducts: 0 },
        _activeFilter: null,         // null | 'ready' | 'waiting' | 'critical'
    };

    const STOCK_TAG_PREFIX = 'STOCK_CHO_';
    const STOCK_TAG_COLOR = '#f59e0b';
    const STOCK_TAG_CATEGORY = 1; // MỤC OKE (same as CHO_HANG)

    // =====================================================
    // [B] DATA LOADING (Firebase)
    // =====================================================

    /**
     * Extract ProductCode from NameGet pattern: "Tên SP [CODE] - NCC"
     */
    function extractProductCode(nameGet) {
        if (!nameGet) return null;
        const str = typeof nameGet === 'string' ? nameGet : (nameGet.NameGet || nameGet.Name || '');
        const match = str.match(/\[([^\]]+)\]/);
        return match ? match[1].trim() : null;
    }

    /**
     * Load stock data from orderProducts Firebase path
     * Returns: Map<ProductCode, { qty, name, id }>
     */
    async function loadStockData(tposCampaignId) {
        const db = firebase.database();
        const snapshot = await db.ref(`orderProducts/${tposCampaignId}`).once('value');
        const data = snapshot.val() || {};

        const stockMap = new Map();
        Object.entries(data).forEach(([key, product]) => {
            if (!product || !product.Id) return;
            const code = extractProductCode(product);
            if (!code) return;

            stockMap.set(code, {
                qty: product.QtyAvailable != null ? product.QtyAvailable : 0,
                name: product.NameGet || product.Name || code,
                id: String(product.Id),
            });
        });

        console.log(`[STOCK] Loaded stock for ${stockMap.size} products from orderProducts/${tposCampaignId}`);
        return stockMap;
    }

    /**
     * Load order product details from report_order_details Firebase path
     * Returns: Map<OrderId, [{ code, name, qty }]>
     */
    async function loadOrderProductDetails(campaignName) {
        const db = firebase.database();
        const sanitizedName = campaignName.replace(/[.$#\[\]\/]/g, '_');
        const snapshot = await db.ref(`report_order_details/${sanitizedName}/orders`).once('value');
        const data = snapshot.val();

        const orderProductsMap = new Map();
        if (!data) {
            console.warn('[STOCK] No order details found at report_order_details/' + sanitizedName);
            return orderProductsMap;
        }

        const orders = Array.isArray(data) ? data : Object.values(data);
        orders.forEach(item => {
            const order = item.order || item;
            const orderId = String(order.Id || item.Id || '');
            if (!orderId) return;

            const products = [];
            (order.Details || []).forEach(detail => {
                const code = detail.ProductCode || detail.DefaultCode || extractProductCode(detail.ProductNameGet || detail.ProductName);
                if (!code) return;
                products.push({
                    code,
                    name: detail.ProductNameGet || detail.ProductName || code,
                    qty: detail.Quantity || 0,
                });
            });

            if (products.length > 0) {
                orderProductsMap.set(orderId, products);
            }
        });

        console.log(`[STOCK] Loaded product details for ${orderProductsMap.size} orders`);
        return orderProductsMap;
    }

    // =====================================================
    // [C] STOCK COMPUTATION (Classify + Allocate)
    // =====================================================

    /**
     * Main computation: classify orders → allocate stock → tag waiting
     */
    function computeAll() {
        const stockMap = StockStatusEngine._stockMap;
        const orderProducts = StockStatusEngine._orderProducts;
        const statusMap = StockStatusEngine._orderStatus;
        statusMap.clear();

        // Get all orders sorted by STT for allocation priority
        const allOrders = window.getAllOrders ? window.getAllOrders() : [];
        const orderSttMap = new Map();
        allOrders.forEach(o => orderSttMap.set(String(o.Id), o.SessionIndex || 9999));

        // Phase 1 — Classify: tentatively ready vs waiting
        const tentativeReady = [];
        const initialWaiting = [];

        orderProducts.forEach((products, orderId) => {
            const blocking = [];
            products.forEach(p => {
                const stock = stockMap.get(p.code);
                const available = stock ? stock.qty : 0;
                if (available < p.qty) {
                    blocking.push({ code: p.code, name: p.name, need: p.qty, have: available });
                }
            });

            if (blocking.length === 0) {
                tentativeReady.push(orderId);
            } else {
                initialWaiting.push({ orderId, blocking });
            }
        });

        // Phase 2 — Allocate stock (ưu tiên đơn đủ toàn bộ SP)
        const remainingStock = new Map();
        stockMap.forEach((v, k) => remainingStock.set(k, v.qty));

        // Sort by STT ASC
        tentativeReady.sort((a, b) => (orderSttMap.get(a) || 9999) - (orderSttMap.get(b) || 9999));

        const confirmedReady = [];
        const overflowWaiting = [];

        tentativeReady.forEach(orderId => {
            const products = orderProducts.get(orderId);
            // Check if we can allocate all products
            let canAllocate = true;
            products.forEach(p => {
                const remaining = remainingStock.get(p.code) || 0;
                if (remaining < p.qty) canAllocate = false;
            });

            if (canAllocate) {
                // Deduct stock
                products.forEach(p => {
                    remainingStock.set(p.code, (remainingStock.get(p.code) || 0) - p.qty);
                });
                confirmedReady.push(orderId);
            } else {
                // Moved to waiting due to insufficient remaining stock
                const blocking = [];
                products.forEach(p => {
                    const remaining = remainingStock.get(p.code) || 0;
                    if (remaining < p.qty) {
                        blocking.push({ code: p.code, name: p.name, need: p.qty, have: remaining });
                    }
                });
                overflowWaiting.push({ orderId, blocking });
            }
        });

        // Phase 3 — Build final status map
        let readyCount = 0, waitingCount = 0, criticalCount = 0;

        confirmedReady.forEach(orderId => {
            statusMap.set(orderId, { status: 'ready', blocking: [], stockTags: [] });
            readyCount++;
        });

        [...initialWaiting, ...overflowWaiting].forEach(({ orderId, blocking }) => {
            const hasCritical = blocking.some(b => b.have === 0);
            const status = hasCritical ? 'critical' : 'waiting';
            const stockTags = blocking.map(b => `${STOCK_TAG_PREFIX}${b.code}`);

            statusMap.set(orderId, { status, blocking, stockTags });
            if (hasCritical) criticalCount++;
            else waitingCount++;
        });

        StockStatusEngine._summaryStats = {
            ready: readyCount,
            waiting: waitingCount,
            critical: criticalCount,
            noProducts: (allOrders.length - orderProducts.size),
        };

        console.log(`[STOCK] Computed: ${readyCount} ready, ${waitingCount} waiting, ${criticalCount} critical`);
    }

    // =====================================================
    // [D] PROCESSING TAGS SYNC
    // =====================================================

    /**
     * Sync stock tags to Processing Tags system
     */
    async function syncProcessingTags() {
        const campaignId = ProcessingTagState._campaignId;
        if (!campaignId) {
            console.warn('[STOCK] No campaignId for processing tags sync');
            return;
        }

        // 1. Collect all unique STOCK_CHO_ keys needed
        const neededTagKeys = new Set();
        StockStatusEngine._orderStatus.forEach(({ stockTags }) => {
            stockTags.forEach(key => neededTagKeys.add(key));
        });

        // 2. Ensure tag definitions exist
        let defsChanged = false;
        neededTagKeys.forEach(tagKey => {
            const exists = ProcessingTagState._tagDefinitions.some(d => d.key === tagKey);
            if (!exists) {
                const code = tagKey.replace(STOCK_TAG_PREFIX, '');
                ProcessingTagState._tagDefinitions.push({
                    key: tagKey,
                    label: `Chờ ${code}`,
                    color: STOCK_TAG_COLOR,
                    category: STOCK_TAG_CATEGORY,
                });
                defsChanged = true;
            }
        });

        if (defsChanged) {
            try {
                await fetch(_ptagApiUrl(`processing-tag-defs/${campaignId}`), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ definitions: ProcessingTagState._tagDefinitions }),
                });
                console.log('[STOCK] Updated tag definitions with stock tags');
            } catch (e) {
                console.error('[STOCK] Error saving tag definitions:', e);
            }
        }

        // 3. Build assignments and removals
        const assignments = [];
        const removals = [];

        // Get all orders that are visible
        const allOrders = window.getAllOrders ? window.getAllOrders() : [];
        const allOrderIds = new Set(allOrders.map(o => String(o.Id)));

        allOrderIds.forEach(orderId => {
            const stockStatus = StockStatusEngine._orderStatus.get(orderId);
            const neededStockTags = stockStatus ? stockStatus.stockTags : [];
            const existingTags = ProcessingTagState._orderTags.get(orderId) || [];
            const existingStockKeys = existingTags.filter(t => t.key.startsWith(STOCK_TAG_PREFIX)).map(t => t.key);

            // Tags to add
            neededStockTags.forEach(tagKey => {
                if (!existingStockKeys.includes(tagKey)) {
                    assignments.push({
                        orderId,
                        tagKey,
                        category: STOCK_TAG_CATEGORY,
                        note: 'auto-stock',
                    });
                    // Optimistic UI update
                    const existing = ProcessingTagState._orderTags.get(orderId) || [];
                    existing.push({ key: tagKey, category: STOCK_TAG_CATEGORY, note: 'auto-stock', assignedAt: Date.now() });
                    ProcessingTagState._orderTags.set(orderId, existing);
                }
            });

            // Tags to remove (stock tags no longer needed)
            existingStockKeys.forEach(tagKey => {
                if (!neededStockTags.includes(tagKey)) {
                    removals.push({ orderId, tagKey });
                    // Optimistic UI update
                    const existing = ProcessingTagState._orderTags.get(orderId) || [];
                    const filtered = existing.filter(t => t.key !== tagKey);
                    if (filtered.length > 0) {
                        ProcessingTagState._orderTags.set(orderId, filtered);
                    } else {
                        ProcessingTagState._orderTags.delete(orderId);
                    }
                }
            });

            // Update cell DOM if any changes
            if (assignments.some(a => a.orderId === orderId) || removals.some(r => r.orderId === orderId)) {
                _ptagUpdateCellDOM(orderId);
            }
        });

        // 4. Bulk assign via API
        if (assignments.length > 0) {
            try {
                await fetch(_ptagApiUrl(`processing-tags/${campaignId}/bulk`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        assignments,
                        assignedBy: 'auto-stock',
                    }),
                });
                console.log(`[STOCK] Bulk assigned ${assignments.length} stock tags`);
            } catch (e) {
                console.error('[STOCK] Bulk assign error:', e);
            }
        }

        // 5. Remove stale tags via API
        for (const { orderId, tagKey } of removals) {
            try {
                await fetch(_ptagApiUrl(`processing-tags/${campaignId}/${orderId}/${tagKey}`), {
                    method: 'DELETE',
                });
            } catch (e) {
                console.error(`[STOCK] Error removing tag ${tagKey} from ${orderId}:`, e);
            }
        }

        if (removals.length > 0) {
            console.log(`[STOCK] Removed ${removals.length} stale stock tags`);
        }

        // Refresh panel if open
        if (typeof _ptagRenderPanelCards === 'function') {
            _ptagRenderPanelCards();
        }
    }

    // =====================================================
    // [E] UI RENDERING (Badges, Tooltips, Filter)
    // =====================================================

    /**
     * Render stock badge inline for STT cell
     */
    function renderStockBadgeInline(orderId) {
        if (!StockStatusEngine._checked) return '';
        const status = StockStatusEngine._orderStatus.get(String(orderId));
        if (!status) return '';

        const colors = { ready: '#10b981', waiting: '#f59e0b', critical: '#ef4444' };
        const labels = { ready: 'Đủ hàng', waiting: 'Chờ hàng', critical: 'Hết hàng' };
        const color = colors[status.status] || '#9ca3af';
        const label = labels[status.status] || '';

        // Build tooltip content
        let tooltipContent = label;
        if (status.blocking && status.blocking.length > 0) {
            tooltipContent += ':\n' + status.blocking.map(b =>
                `• ${b.code}: cần ${b.qty}, tồn ${b.have}`
            ).join('\n');
        }

        return `<div class="stock-badge stock-${status.status}"
            style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;cursor:help;"
            title="${tooltipContent.replace(/"/g, '&quot;')}"></div>`;
    }

    /**
     * Render stock column in product detail expansion
     */
    function renderStockColumnHeader() {
        if (!StockStatusEngine._checked) return '';
        return '<th style="padding: 6px 12px; text-align: center; width: 80px; font-weight: 600;">Tồn kho</th>';
    }

    function renderStockColumnCell(detail) {
        if (!StockStatusEngine._checked) return '';
        const code = detail.ProductCode || detail.DefaultCode || extractProductCode(detail.ProductNameGet || detail.ProductName);
        if (!code) return '<td style="padding: 6px 12px; text-align: center; width: 80px; color: #9ca3af;">-</td>';

        const stock = StockStatusEngine._stockMap.get(code);
        const qty = stock ? stock.qty : 0;
        const needed = detail.Quantity || 0;

        let color, icon;
        if (qty >= needed) {
            color = '#10b981';
            icon = '<i class="fas fa-check-circle" style="margin-right:3px;"></i>';
        } else if (qty > 0) {
            color = '#f59e0b';
            icon = '<i class="fas fa-exclamation-triangle" style="margin-right:3px;"></i>';
        } else {
            color = '#ef4444';
            icon = '<i class="fas fa-times-circle" style="margin-right:3px;"></i>';
        }

        return `<td style="padding: 6px 12px; text-align: center; width: 80px; color: ${color}; font-weight: 500;">${icon}${qty}</td>`;
    }

    /**
     * Get row class for stock highlighting
     */
    function getStockRowClass(orderId) {
        if (!StockStatusEngine._checked) return '';
        const status = StockStatusEngine._orderStatus.get(String(orderId));
        if (!status) return '';
        if (status.status === 'waiting') return 'stock-row-waiting';
        if (status.status === 'critical') return 'stock-row-critical';
        return '';
    }

    /**
     * Update summary bar
     */
    function updateSummaryBar() {
        const bar = document.getElementById('stockSummaryBar');
        if (!bar) return;

        const s = StockStatusEngine._summaryStats;
        bar.style.display = 'flex';
        bar.innerHTML = `
            <span class="stock-summary-item stock-summary-ready" onclick="window.StockStatusEngine.filterByStatus('ready')" title="Đơn đủ hàng, sẵn sàng ship">
                <i class="fas fa-check-circle"></i> ${s.ready} đủ hàng
            </span>
            <span class="stock-summary-item stock-summary-waiting" onclick="window.StockStatusEngine.filterByStatus('waiting')" title="Đơn thiếu SP nhưng còn tồn">
                <i class="fas fa-clock"></i> ${s.waiting} chờ hàng
            </span>
            <span class="stock-summary-item stock-summary-critical" onclick="window.StockStatusEngine.filterByStatus('critical')" title="Đơn có SP tồn = 0">
                <i class="fas fa-exclamation-triangle"></i> ${s.critical} hết hàng
            </span>
            ${StockStatusEngine._activeFilter ? `<span class="stock-summary-item stock-summary-clear" onclick="window.StockStatusEngine.filterByStatus(null)" title="Xóa bộ lọc">
                <i class="fas fa-times"></i> Xóa lọc
            </span>` : ''}
        `;
    }

    /**
     * Filter table by stock status
     */
    function filterByStatus(status) {
        StockStatusEngine._activeFilter = StockStatusEngine._activeFilter === status ? null : status;
        updateSummaryBar();

        // Re-render table with filter
        if (typeof performTableSearch === 'function') {
            performTableSearch();
        }
    }

    /**
     * Check if order passes stock filter (called from table rendering)
     */
    function passesStockFilter(orderId) {
        if (!StockStatusEngine._checked || !StockStatusEngine._activeFilter) return true;
        const status = StockStatusEngine._orderStatus.get(String(orderId));
        if (!status) return StockStatusEngine._activeFilter === null;
        return status.status === StockStatusEngine._activeFilter;
    }

    // =====================================================
    // [F] PUBLIC API
    // =====================================================

    /**
     * Main entry: Initialize stock check
     */
    StockStatusEngine.init = async function () {
        if (StockStatusEngine._loading) return;
        StockStatusEngine._loading = true;

        const btn = document.getElementById('btnStockCheck');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang kiểm tra...';
        }

        try {
            // Get campaign info
            const campaign = window.campaignManager?.activeCampaign;
            const campaignId = window.campaignManager?.activeCampaignId;
            if (!campaign || !campaignId) {
                throw new Error('Chưa chọn chiến dịch');
            }

            const campaignName = campaign.name || document.getElementById('activeCampaignLabel')?.textContent?.trim();
            const tposCampaignId = campaign.tposCampaignId || campaignId;

            if (!campaignName) {
                throw new Error('Không tìm thấy tên chiến dịch');
            }

            console.log(`[STOCK] Starting stock check - Campaign: ${campaignName}, TPOS ID: ${tposCampaignId}`);

            // 1. Load stock data from orderProducts
            StockStatusEngine._stockMap = await loadStockData(tposCampaignId);

            if (StockStatusEngine._stockMap.size === 0) {
                throw new Error('Không có dữ liệu tồn kho. Hãy đảm bảo đã thêm sản phẩm vào chiến dịch.');
            }

            // 2. Load order product details
            StockStatusEngine._orderProducts = await loadOrderProductDetails(campaignName);

            if (StockStatusEngine._orderProducts.size === 0) {
                throw new Error('Không có chi tiết đơn hàng. Hãy bấm "Lấy chi tiết đơn hàng" trước.');
            }

            // 3. Compute stock status
            computeAll();

            // 4. Mark as checked and refresh table
            StockStatusEngine._checked = true;
            StockStatusEngine._activeFilter = null;
            updateSummaryBar();

            // Re-render table
            if (typeof performTableSearch === 'function') {
                performTableSearch();
            }

            // 5. Sync processing tags
            await syncProcessingTags();

            const s = StockStatusEngine._summaryStats;
            if (window.notificationManager) {
                window.notificationManager.success(
                    `Kiểm tra tồn kho: ${s.ready} đủ hàng, ${s.waiting} chờ, ${s.critical} hết`,
                    5000,
                    'Tồn kho'
                );
            }

        } catch (err) {
            console.error('[STOCK] Error:', err);
            if (window.notificationManager) {
                window.notificationManager.error(err.message || 'Lỗi kiểm tra tồn kho', 5000);
            }
        } finally {
            StockStatusEngine._loading = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-boxes-stacked"></i> Kiểm tra tồn kho';
            }
        }
    };

    StockStatusEngine.getOrderStatus = function (orderId) {
        return StockStatusEngine._orderStatus.get(String(orderId)) || null;
    };

    StockStatusEngine.renderBadge = renderStockBadgeInline;
    StockStatusEngine.renderStockColumnHeader = renderStockColumnHeader;
    StockStatusEngine.renderStockColumnCell = renderStockColumnCell;
    StockStatusEngine.getStockRowClass = getStockRowClass;
    StockStatusEngine.passesStockFilter = passesStockFilter;
    StockStatusEngine.filterByStatus = filterByStatus;

    // Expose globally
    window.StockStatusEngine = StockStatusEngine;

})();
