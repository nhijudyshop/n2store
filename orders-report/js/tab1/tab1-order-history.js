/**
 * Order Creation History Module
 * Tracks and displays history of orders created via "Phiếu bán hàng" and "Tạo nhanh PBH"
 * Data stored in Firebase Firestore with auto-delete after 14 days
 *
 * Optimized for 4000+ records with:
 * - Server-side date filtering
 * - Client-side pagination (50/100/200 per page)
 * - Debounced search
 */

(function() {
    'use strict';

    // =====================================================
    // CONSTANTS
    // =====================================================
    const COLLECTION_NAME = 'order_creation_history';
    const RETENTION_DAYS = 14;
    const DEFAULT_PAGE_SIZE = 50;
    const PAGE_SIZE_OPTIONS = [50, 100, 200];

    // =====================================================
    // STATE
    // =====================================================
    let historyData = [];      // All loaded data from Firebase
    let filteredData = [];     // After applying search/source filter
    let currentPage = 1;
    let pageSize = DEFAULT_PAGE_SIZE;
    let isLoading = false;
    let totalRecords = 0;

    // =====================================================
    // FIREBASE HELPERS
    // =====================================================

    function getFirestore() {
        if (typeof firebase !== 'undefined' && firebase.firestore) {
            return firebase.firestore();
        }
        console.warn('[ORDER-HISTORY] Firestore not available');
        return null;
    }

    function getCollection() {
        const db = getFirestore();
        if (!db) return null;
        return db.collection(COLLECTION_NAME);
    }

    // =====================================================
    // SAVE HISTORY
    // =====================================================

    async function saveOrderHistory(orderData, source) {
        try {
            const collection = getCollection();
            if (!collection) {
                console.warn('[ORDER-HISTORY] Cannot save - Firestore not available');
                return false;
            }

            const now = new Date();
            const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

            const currentUser = window.billTokenManager?.getUsername?.() ||
                               window.tokenManager?.getUsername?.() ||
                               'unknown';

            // Create date string for efficient querying (YYYY-MM-DD)
            const dateStr = now.toISOString().split('T')[0];

            const historyRecord = {
                createdAt: firebase.firestore.Timestamp.fromDate(now),
                expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt),
                dateStr: dateStr, // For efficient date range queries

                saleOnlineId: orderData.saleOnlineId || orderData.SaleOnlineIds?.[0] || null,
                reference: orderData.reference || orderData.Reference || '',
                fastSaleOrderId: orderData.fastSaleOrderId || orderData.Id || null,
                liveCampaignId: orderData.liveCampaignId || orderData.LiveCampaignId || null,
                liveCampaignName: orderData.liveCampaignName || orderData.LiveCampaignName || '',
                customerName: orderData.customerName || orderData.PartnerDisplayName || orderData.ReceiverName || '',
                customerPhone: orderData.customerPhone || orderData.Phone || orderData.ReceiverPhone || '',
                address: orderData.address || orderData.ReceiverAddress || orderData.Address || '',
                products: (orderData.products || orderData.OrderLines || []).map(p => ({
                    name: p.ProductName || p.name || '',
                    quantity: p.ProductUOMQty || p.quantity || 1,
                    price: p.PriceUnit || p.price || 0,
                    total: p.PriceTotal || p.total || 0
                })),
                totalAmount: orderData.totalAmount || orderData.AmountTotal || 0,
                shippingFee: orderData.shippingFee || orderData.DeliveryPrice || 0,
                carrierId: orderData.carrierId || orderData.CarrierId || null,
                carrierName: orderData.carrierName || orderData.CarrierName || '',
                source: source,
                createdBy: currentUser,
                sessionIndex: orderData.sessionIndex || orderData.SessionIndex || '',

                // Searchable fields (lowercase for case-insensitive search)
                _searchName: (orderData.customerName || orderData.PartnerDisplayName || '').toLowerCase(),
                _searchPhone: (orderData.customerPhone || orderData.Phone || '').replace(/\D/g, '')
            };

            await collection.add(historyRecord);
            console.log('[ORDER-HISTORY] ✅ Saved order history:', historyRecord.reference);
            updateBadgeCount();
            return true;
        } catch (error) {
            console.error('[ORDER-HISTORY] Error saving history:', error);
            return false;
        }
    }

    async function saveOrderHistoryBatch(ordersData, source) {
        try {
            const collection = getCollection();
            if (!collection) return false;

            const batch = getFirestore().batch();
            const now = new Date();
            const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
            const dateStr = now.toISOString().split('T')[0];
            const currentUser = window.billTokenManager?.getUsername?.() ||
                               window.tokenManager?.getUsername?.() ||
                               'unknown';

            for (const orderData of ordersData) {
                const docRef = collection.doc();
                const customerName = orderData.PartnerDisplayName || orderData.ReceiverName || '';
                const customerPhone = orderData.Phone || orderData.ReceiverPhone || '';

                const historyRecord = {
                    createdAt: firebase.firestore.Timestamp.fromDate(now),
                    expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt),
                    dateStr: dateStr,
                    saleOnlineId: orderData.SaleOnlineIds?.[0] || null,
                    reference: orderData.Reference || '',
                    fastSaleOrderId: orderData.Id || null,
                    liveCampaignId: orderData.LiveCampaignId || null,
                    liveCampaignName: orderData.LiveCampaignName || '',
                    customerName: customerName,
                    customerPhone: customerPhone,
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
                    sessionIndex: orderData.SessionIndex || '',
                    _searchName: customerName.toLowerCase(),
                    _searchPhone: customerPhone.replace(/\D/g, '')
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
    // LOAD HISTORY (Optimized with date range)
    // =====================================================

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

            // Get date range from filter (default: last 3 days for performance)
            const dateFrom = document.getElementById('orderHistoryDateFrom')?.value;
            const dateTo = document.getElementById('orderHistoryDateTo')?.value;

            let query = collection.orderBy('createdAt', 'desc');

            // Apply server-side date filtering for better performance
            if (dateFrom) {
                const fromDate = new Date(dateFrom);
                fromDate.setHours(0, 0, 0, 0);
                query = query.where('createdAt', '>=', firebase.firestore.Timestamp.fromDate(fromDate));
            }

            if (dateTo) {
                const toDate = new Date(dateTo);
                toDate.setHours(23, 59, 59, 999);
                query = query.where('createdAt', '<=', firebase.firestore.Timestamp.fromDate(toDate));
            }

            // If no date filter, default to last 3 days
            if (!dateFrom && !dateTo) {
                const threeDaysAgo = new Date();
                threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
                threeDaysAgo.setHours(0, 0, 0, 0);
                query = query.where('createdAt', '>=', firebase.firestore.Timestamp.fromDate(threeDaysAgo));

                // Auto-fill date filter UI
                const dateFromInput = document.getElementById('orderHistoryDateFrom');
                if (dateFromInput && !dateFromInput.value) {
                    dateFromInput.value = threeDaysAgo.toISOString().split('T')[0];
                }
            }

            // Limit to prevent loading too much data
            query = query.limit(5000);

            const snapshot = await query.get();

            historyData = [];
            const now = new Date();

            snapshot.forEach(doc => {
                const data = doc.data();
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

            // Reset to page 1 when loading new data
            currentPage = 1;
            applyFilters();
            updateBadgeCount();

        } catch (error) {
            console.error('[ORDER-HISTORY] Error loading history:', error);
            renderEmpty('Lỗi khi tải dữ liệu: ' + error.message);
        } finally {
            isLoading = false;
        }
    }

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
    // FILTER & SEARCH (Client-side for text search)
    // =====================================================

    function applyFilters() {
        const searchInput = document.getElementById('orderHistorySearch');
        const sourceSelect = document.getElementById('orderHistorySource');

        const searchTerm = (searchInput?.value || '').toLowerCase().trim();
        const sourceFilter = sourceSelect?.value || '';

        // Client-side filtering for search and source
        filteredData = historyData.filter(record => {
            // Source filter
            if (sourceFilter && record.source !== sourceFilter) {
                return false;
            }

            // Search filter (client-side for flexibility)
            if (searchTerm) {
                const searchFields = [
                    record.customerName,
                    record.customerPhone,
                    record.reference,
                    record.address,
                    record.carrierName,
                    record.liveCampaignName,
                    record.createdBy
                ].map(f => (f || '').toLowerCase());

                if (!searchFields.some(f => f.includes(searchTerm))) {
                    return false;
                }
            }

            return true;
        });

        totalRecords = filteredData.length;

        // Ensure current page is valid
        const maxPage = Math.ceil(totalRecords / pageSize) || 1;
        if (currentPage > maxPage) {
            currentPage = maxPage;
        }

        renderTable();
        renderPagination();
        updateFilterStats();
    }

    function updateFilterStats() {
        const statsEl = document.getElementById('orderHistoryFilterStats');
        if (statsEl) {
            const start = totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1;
            const end = Math.min(currentPage * pageSize, totalRecords);
            statsEl.textContent = `${start}-${end} / ${totalRecords} bản ghi`;
        }
    }

    // =====================================================
    // PAGINATION
    // =====================================================

    function getCurrentPageData() {
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        return filteredData.slice(start, end);
    }

    function goToPage(page) {
        const maxPage = Math.ceil(totalRecords / pageSize) || 1;
        currentPage = Math.max(1, Math.min(page, maxPage));
        renderTable();
        renderPagination();
        updateFilterStats();

        // Scroll to top of table
        document.querySelector('.order-history-modal .modal-body')?.scrollTo(0, 0);
    }

    function changePageSize(newSize) {
        pageSize = newSize;
        currentPage = 1; // Reset to first page
        renderTable();
        renderPagination();
        updateFilterStats();
    }

    function renderPagination() {
        const container = document.getElementById('orderHistoryPagination');
        if (!container) return;

        const totalPages = Math.ceil(totalRecords / pageSize) || 1;

        let paginationHtml = `
            <div class="pagination-info">
                <select id="orderHistoryPageSize" class="page-size-select">
                    ${PAGE_SIZE_OPTIONS.map(size =>
                        `<option value="${size}" ${size === pageSize ? 'selected' : ''}>${size}/trang</option>`
                    ).join('')}
                </select>
            </div>
            <div class="pagination-controls">
        `;

        // Previous button
        paginationHtml += `
            <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">
                <i class="fas fa-chevron-left"></i>
            </button>
        `;

        // Page numbers
        const maxVisiblePages = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        if (startPage > 1) {
            paginationHtml += `<button class="page-btn" data-page="1">1</button>`;
            if (startPage > 2) {
                paginationHtml += `<span class="page-ellipsis">...</span>`;
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            paginationHtml += `
                <button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>
            `;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                paginationHtml += `<span class="page-ellipsis">...</span>`;
            }
            paginationHtml += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
        }

        // Next button
        paginationHtml += `
            <button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">
                <i class="fas fa-chevron-right"></i>
            </button>
        `;

        paginationHtml += '</div>';

        container.innerHTML = paginationHtml;

        // Bind events
        container.querySelectorAll('.page-btn[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!btn.disabled) {
                    goToPage(parseInt(btn.dataset.page));
                }
            });
        });

        document.getElementById('orderHistoryPageSize')?.addEventListener('change', (e) => {
            changePageSize(parseInt(e.target.value));
        });
    }

    // =====================================================
    // RENDER UI
    // =====================================================

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
        renderPagination();
        updateFilterStats();
    }

    function renderTable() {
        const tbody = document.getElementById('orderHistoryTableBody');
        if (!tbody) return;

        const pageData = getCurrentPageData();

        if (pageData.length === 0) {
            renderEmpty(historyData.length === 0 ? 'Chưa có lịch sử ra đơn (chọn ngày để tải)' : 'Không tìm thấy kết quả');
            return;
        }

        tbody.innerHTML = pageData.map(record => {
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

        renderPagination();
        updateFilterStats();
    }

    function updateBadgeCount() {
        const badge = document.querySelector('.order-history-btn .badge');
        if (badge) {
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

    function showModal() {
        const modal = document.getElementById('orderHistoryModal');
        if (modal) {
            modal.classList.add('show');

            // Set default date range (last 3 days) if not set
            const dateFromInput = document.getElementById('orderHistoryDateFrom');
            const dateToInput = document.getElementById('orderHistoryDateTo');

            if (dateFromInput && !dateFromInput.value) {
                const threeDaysAgo = new Date();
                threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
                dateFromInput.value = threeDaysAgo.toISOString().split('T')[0];
            }

            if (dateToInput && !dateToInput.value) {
                dateToInput.value = new Date().toISOString().split('T')[0];
            }

            loadHistory();
        }
    }

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

    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    function init() {
        console.log('[ORDER-HISTORY] Initializing...');

        const modal = document.getElementById('orderHistoryModal');
        if (modal) {
            modal.querySelector('.modal-overlay')?.addEventListener('click', hideModal);
            modal.querySelector('.close-btn')?.addEventListener('click', hideModal);
            document.getElementById('orderHistoryCloseBtn')?.addEventListener('click', hideModal);
            document.getElementById('orderHistoryRefreshBtn')?.addEventListener('click', () => {
                loadHistory();
            });
        }

        document.getElementById('orderHistoryBtn')?.addEventListener('click', showModal);

        // Search with debounce (300ms)
        document.getElementById('orderHistorySearch')?.addEventListener('input', debounce(applyFilters, 300));

        // Source filter (immediate)
        document.getElementById('orderHistorySource')?.addEventListener('change', applyFilters);

        // Date filters trigger reload from Firebase
        document.getElementById('orderHistoryDateFrom')?.addEventListener('change', loadHistory);
        document.getElementById('orderHistoryDateTo')?.addEventListener('change', loadHistory);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal?.classList.contains('show')) {
                hideModal();
            }
        });

        // Cleanup expired records on init (background)
        setTimeout(() => cleanupExpiredRecords(), 5000);

        console.log('[ORDER-HISTORY] ✅ Initialized');
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 500);
    }

})();
