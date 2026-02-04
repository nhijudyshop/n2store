/**
 * Order Creation History Module
 * Tracks and displays history of orders created via "Phiếu bán hàng" and "Tạo nhanh PBH"
 * Data stored in Firebase Firestore with auto-delete after 14 days
 */

(function() {
    'use strict';

    // =====================================================
    // CONSTANTS
    // =====================================================
    const COLLECTION_NAME = 'order_creation_history';
    const RETENTION_DAYS = 14;
    const MAX_DISPLAY_RECORDS = 500;

    // =====================================================
    // STATE
    // =====================================================
    let historyData = [];
    let filteredData = [];
    let isLoading = false;

    // =====================================================
    // FIREBASE HELPERS
    // =====================================================

    /**
     * Get Firestore reference
     */
    function getFirestore() {
        if (typeof firebase !== 'undefined' && firebase.firestore) {
            return firebase.firestore();
        }
        console.warn('[ORDER-HISTORY] Firestore not available');
        return null;
    }

    /**
     * Get collection reference
     */
    function getCollection() {
        const db = getFirestore();
        if (!db) return null;
        return db.collection(COLLECTION_NAME);
    }

    // =====================================================
    // SAVE HISTORY
    // =====================================================

    /**
     * Save order creation to history
     * @param {Object} orderData - Order data to save
     * @param {string} source - 'fast-sale' or 'sale-modal'
     */
    async function saveOrderHistory(orderData, source) {
        try {
            const collection = getCollection();
            if (!collection) {
                console.warn('[ORDER-HISTORY] Cannot save - Firestore not available');
                return false;
            }

            const now = new Date();
            const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

            // Get current user info
            const currentUser = window.billTokenManager?.getUsername?.() ||
                               window.tokenManager?.getUsername?.() ||
                               'unknown';

            const historyRecord = {
                // Timestamps
                createdAt: firebase.firestore.Timestamp.fromDate(now),
                expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt),

                // Order identification
                saleOnlineId: orderData.saleOnlineId || orderData.SaleOnlineIds?.[0] || null,
                reference: orderData.reference || orderData.Reference || '',
                fastSaleOrderId: orderData.fastSaleOrderId || orderData.Id || null,

                // Campaign info
                liveCampaignId: orderData.liveCampaignId || orderData.LiveCampaignId || null,
                liveCampaignName: orderData.liveCampaignName || orderData.LiveCampaignName || '',

                // Customer info
                customerName: orderData.customerName || orderData.PartnerDisplayName || orderData.ReceiverName || '',
                customerPhone: orderData.customerPhone || orderData.Phone || orderData.ReceiverPhone || '',
                address: orderData.address || orderData.ReceiverAddress || orderData.Address || '',

                // Order details
                products: (orderData.products || orderData.OrderLines || []).map(p => ({
                    name: p.ProductName || p.name || '',
                    quantity: p.ProductUOMQty || p.quantity || 1,
                    price: p.PriceUnit || p.price || 0,
                    total: p.PriceTotal || p.total || 0
                })),
                totalAmount: orderData.totalAmount || orderData.AmountTotal || 0,
                shippingFee: orderData.shippingFee || orderData.DeliveryPrice || 0,

                // Carrier info
                carrierId: orderData.carrierId || orderData.CarrierId || null,
                carrierName: orderData.carrierName || orderData.CarrierName || '',

                // Meta info
                source: source, // 'fast-sale' or 'sale-modal'
                createdBy: currentUser,

                // Extra info for filtering
                sessionIndex: orderData.sessionIndex || orderData.SessionIndex || ''
            };

            await collection.add(historyRecord);
            console.log('[ORDER-HISTORY] ✅ Saved order history:', historyRecord.reference);

            // Update badge count
            updateBadgeCount();

            return true;
        } catch (error) {
            console.error('[ORDER-HISTORY] Error saving history:', error);
            return false;
        }
    }

    /**
     * Save multiple orders at once (for fast-sale batch)
     * @param {Array} ordersData - Array of order data
     * @param {string} source - Source identifier
     */
    async function saveOrderHistoryBatch(ordersData, source) {
        try {
            const collection = getCollection();
            if (!collection) return false;

            const batch = getFirestore().batch();
            const now = new Date();
            const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
            const currentUser = window.billTokenManager?.getUsername?.() ||
                               window.tokenManager?.getUsername?.() ||
                               'unknown';

            for (const orderData of ordersData) {
                const docRef = collection.doc();
                const historyRecord = {
                    createdAt: firebase.firestore.Timestamp.fromDate(now),
                    expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt),
                    saleOnlineId: orderData.SaleOnlineIds?.[0] || null,
                    reference: orderData.Reference || '',
                    fastSaleOrderId: orderData.Id || null,
                    liveCampaignId: orderData.LiveCampaignId || null,
                    liveCampaignName: orderData.LiveCampaignName || '',
                    customerName: orderData.PartnerDisplayName || orderData.ReceiverName || '',
                    customerPhone: orderData.Phone || orderData.ReceiverPhone || '',
                    address: orderData.ReceiverAddress || orderData.Address || '',
                    products: (orderData.OrderLines || []).map(p => ({
                        name: p.ProductName || '',
                        quantity: p.ProductUOMQty || 1,
                        price: p.PriceUnit || 0,
                        total: p.PriceTotal || 0
                    })),
                    totalAmount: orderData.AmountTotal || 0,
                    shippingFee: orderData.DeliveryPrice || 0,
                    carrierId: orderData.CarrierId || null,
                    carrierName: orderData.CarrierName || '',
                    source: source,
                    createdBy: currentUser,
                    sessionIndex: orderData.SessionIndex || ''
                };
                batch.set(docRef, historyRecord);
            }

            await batch.commit();
            console.log(`[ORDER-HISTORY] ✅ Saved ${ordersData.length} orders to history`);
            updateBadgeCount();
            return true;
        } catch (error) {
            console.error('[ORDER-HISTORY] Error saving batch history:', error);
            return false;
        }
    }

    // =====================================================
    // LOAD HISTORY
    // =====================================================

    /**
     * Load history from Firebase
     */
    async function loadHistory() {
        try {
            isLoading = true;
            renderLoading();

            const collection = getCollection();
            if (!collection) {
                historyData = [];
                renderEmpty('Firestore chưa được khởi tạo');
                return;
            }

            // Query with ordering by createdAt descending
            const snapshot = await collection
                .orderBy('createdAt', 'desc')
                .limit(MAX_DISPLAY_RECORDS)
                .get();

            historyData = [];
            const now = new Date();

            snapshot.forEach(doc => {
                const data = doc.data();
                // Check if record has expired
                const expiresAt = data.expiresAt?.toDate?.() || new Date(0);
                if (expiresAt > now) {
                    historyData.push({
                        id: doc.id,
                        ...data,
                        createdAt: data.createdAt?.toDate?.() || new Date(),
                        expiresAt: expiresAt
                    });
                }
            });

            console.log(`[ORDER-HISTORY] Loaded ${historyData.length} records`);

            filteredData = [...historyData];
            renderTable();
            updateBadgeCount();

        } catch (error) {
            console.error('[ORDER-HISTORY] Error loading history:', error);
            renderEmpty('Lỗi khi tải dữ liệu: ' + error.message);
        } finally {
            isLoading = false;
        }
    }

    /**
     * Cleanup expired records (called periodically)
     */
    async function cleanupExpiredRecords() {
        try {
            const collection = getCollection();
            if (!collection) return;

            const now = firebase.firestore.Timestamp.fromDate(new Date());
            const snapshot = await collection
                .where('expiresAt', '<', now)
                .limit(100)
                .get();

            if (snapshot.empty) {
                console.log('[ORDER-HISTORY] No expired records to clean');
                return;
            }

            const batch = getFirestore().batch();
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
            });

            await batch.commit();
            console.log(`[ORDER-HISTORY] Cleaned ${snapshot.size} expired records`);

        } catch (error) {
            console.error('[ORDER-HISTORY] Error cleaning expired records:', error);
        }
    }

    // =====================================================
    // FILTER & SEARCH
    // =====================================================

    /**
     * Apply filters to history data
     */
    function applyFilters() {
        const searchInput = document.getElementById('orderHistorySearch');
        const sourceSelect = document.getElementById('orderHistorySource');
        const dateFrom = document.getElementById('orderHistoryDateFrom');
        const dateTo = document.getElementById('orderHistoryDateTo');

        const searchTerm = (searchInput?.value || '').toLowerCase().trim();
        const sourceFilter = sourceSelect?.value || '';
        const fromDate = dateFrom?.value ? new Date(dateFrom.value) : null;
        const toDate = dateTo?.value ? new Date(dateTo.value + 'T23:59:59') : null;

        filteredData = historyData.filter(record => {
            // Search filter
            if (searchTerm) {
                const searchFields = [
                    record.customerName,
                    record.customerPhone,
                    record.reference,
                    record.address,
                    record.carrierName,
                    record.liveCampaignName
                ].map(f => (f || '').toLowerCase());

                if (!searchFields.some(f => f.includes(searchTerm))) {
                    return false;
                }
            }

            // Source filter
            if (sourceFilter && record.source !== sourceFilter) {
                return false;
            }

            // Date range filter
            const recordDate = record.createdAt;
            if (fromDate && recordDate < fromDate) {
                return false;
            }
            if (toDate && recordDate > toDate) {
                return false;
            }

            return true;
        });

        renderTable();
        updateFilterStats();
    }

    /**
     * Update filter stats display
     */
    function updateFilterStats() {
        const statsEl = document.getElementById('orderHistoryFilterStats');
        if (statsEl) {
            statsEl.textContent = `Hiển thị ${filteredData.length} / ${historyData.length} bản ghi`;
        }
    }

    // =====================================================
    // RENDER UI
    // =====================================================

    /**
     * Render loading state
     */
    function renderLoading() {
        const tbody = document.getElementById('orderHistoryTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8">
                        <div class="order-history-loading">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Đang tải lịch sử...</p>
                        </div>
                    </td>
                </tr>
            `;
        }
    }

    /**
     * Render empty state
     */
    function renderEmpty(message = 'Chưa có lịch sử ra đơn') {
        const tbody = document.getElementById('orderHistoryTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8">
                        <div class="order-history-empty">
                            <i class="fas fa-history"></i>
                            <p>${message}</p>
                        </div>
                    </td>
                </tr>
            `;
        }
        updateFilterStats();
    }

    /**
     * Render history table
     */
    function renderTable() {
        const tbody = document.getElementById('orderHistoryTableBody');
        if (!tbody) return;

        if (filteredData.length === 0) {
            renderEmpty(historyData.length === 0 ? 'Chưa có lịch sử ra đơn' : 'Không tìm thấy kết quả');
            return;
        }

        tbody.innerHTML = filteredData.map(record => {
            const createdAt = record.createdAt;
            const dateStr = createdAt.toLocaleDateString('vi-VN');
            const timeStr = createdAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

            const productsCount = record.products?.length || 0;
            const totalQty = record.products?.reduce((sum, p) => sum + (p.quantity || 0), 0) || 0;

            return `
                <tr>
                    <td class="cell-time">
                        <div class="date">${dateStr}</div>
                        <div>${timeStr}</div>
                    </td>
                    <td class="cell-customer">
                        <div class="name">${escapeHtml(record.customerName || '-')}</div>
                        <div class="phone">${escapeHtml(record.customerPhone || '-')}</div>
                    </td>
                    <td class="cell-address" title="${escapeHtml(record.address || '')}">
                        ${escapeHtml(record.address || '-')}
                    </td>
                    <td>
                        <span title="${productsCount} SP, ${totalQty} cái">${productsCount} SP</span>
                    </td>
                    <td class="cell-amount">
                        ${formatCurrency(record.totalAmount)}
                    </td>
                    <td class="cell-carrier">
                        <span class="carrier-name">${escapeHtml(record.carrierName || '-')}</span>
                        <div style="font-size:11px;color:#9ca3af;">Ship: ${formatCurrency(record.shippingFee)}</div>
                    </td>
                    <td class="cell-source">
                        <span class="badge ${record.source === 'fast-sale' ? 'fast-sale' : 'sale-modal'}">
                            ${record.source === 'fast-sale' ? 'Tạo nhanh' : 'Phiếu BH'}
                        </span>
                    </td>
                    <td class="cell-user">
                        ${escapeHtml(record.createdBy || '-')}
                    </td>
                </tr>
            `;
        }).join('');

        updateFilterStats();
    }

    /**
     * Update badge count on header button
     */
    function updateBadgeCount() {
        const badge = document.querySelector('.order-history-btn .badge');
        if (badge) {
            // Count today's records
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayCount = historyData.filter(r => r.createdAt >= today).length;

            if (todayCount > 0) {
                badge.textContent = todayCount > 99 ? '99+' : todayCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    // =====================================================
    // MODAL CONTROL
    // =====================================================

    /**
     * Show order history modal
     */
    function showModal() {
        const modal = document.getElementById('orderHistoryModal');
        if (modal) {
            modal.classList.add('show');
            loadHistory();
        }
    }

    /**
     * Hide order history modal
     */
    function hideModal() {
        const modal = document.getElementById('orderHistoryModal');
        if (modal) {
            modal.classList.remove('show');
        }
    }

    // =====================================================
    // UTILITIES
    // =====================================================

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    function formatCurrency(amount) {
        if (!amount && amount !== 0) return '0đ';
        return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    /**
     * Initialize order history module
     */
    function init() {
        console.log('[ORDER-HISTORY] Initializing...');

        // Bind event listeners
        const modal = document.getElementById('orderHistoryModal');
        if (modal) {
            // Close on overlay click
            modal.querySelector('.modal-overlay')?.addEventListener('click', hideModal);

            // Close button
            modal.querySelector('.close-btn')?.addEventListener('click', hideModal);

            // Footer close button
            document.getElementById('orderHistoryCloseBtn')?.addEventListener('click', hideModal);

            // Refresh button
            document.getElementById('orderHistoryRefreshBtn')?.addEventListener('click', () => {
                loadHistory();
            });
        }

        // Header button
        document.getElementById('orderHistoryBtn')?.addEventListener('click', showModal);

        // Filter inputs
        document.getElementById('orderHistorySearch')?.addEventListener('input', debounce(applyFilters, 300));
        document.getElementById('orderHistorySource')?.addEventListener('change', applyFilters);
        document.getElementById('orderHistoryDateFrom')?.addEventListener('change', applyFilters);
        document.getElementById('orderHistoryDateTo')?.addEventListener('change', applyFilters);

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal?.classList.contains('show')) {
                hideModal();
            }
        });

        // Cleanup expired records on init (background)
        setTimeout(() => cleanupExpiredRecords(), 5000);

        console.log('[ORDER-HISTORY] ✅ Initialized');
    }

    /**
     * Debounce helper
     */
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // =====================================================
    // EXPORT TO GLOBAL
    // =====================================================
    window.OrderHistoryManager = {
        init,
        saveOrderHistory,
        saveOrderHistoryBatch,
        showModal,
        hideModal,
        loadHistory
    };

    // Auto-init when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // Small delay to ensure Firebase is ready
        setTimeout(init, 500);
    }

})();
