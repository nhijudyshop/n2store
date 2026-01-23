/**
 * =====================================================
 * ACCOUNTANT MODULE
 * =====================================================
 * Tab Kế Toán - Duyệt giao dịch, Điều chỉnh công nợ
 * Created: 2026-01-19
 * =====================================================
 */

(function () {
    'use strict';

    // =====================================================
    // CONFIGURATION
    // =====================================================

    const API_BASE_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : 'https://chatomni-proxy.nhijudyshop.workers.dev';

    const CONFIG = {
        REFRESH_INTERVAL: 30000, // 30 seconds
        PAGE_SIZE: 20,
        PENDING_ALERT_HOURS: 24
    };

    // =====================================================
    // STATE
    // =====================================================

    const state = {
        currentSubTab: 'pending', // pending | approved | adjustment
        pendingQueue: [],
        approvedToday: [],
        adjustmentsToday: [],
        selectedIds: new Set(),
        pagination: {
            pending: { page: 1, totalPages: 1, total: 0 },
            approved: { page: 1, totalPages: 1, total: 0 },
            adjustments: { page: 1, totalPages: 1, total: 0 }
        },
        filters: {
            pending: { startDate: '', endDate: '', search: '' },
            approved: { startDate: '', endDate: '', search: '' }
        },
        stats: {
            pending: 0,
            pendingOverdue: 0,
            approvedToday: 0,
            rejectedToday: 0,
            adjustmentsToday: 0
        },
        refreshTimer: null,
        isLoading: false,
        // Approve modal state
        approveModal: {
            transactionId: null,
            imageUrl: null,
            imageFile: null,
            isUploading: false
        }
    };

    // =====================================================
    // TOOLTIP SYSTEM
    // =====================================================

    let tooltipEl = null;

    function initTooltip() {
        // Create tooltip element if not exists
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.className = 'acc-global-tooltip';
            document.body.appendChild(tooltipEl);
        }

        // Use event delegation on the pending table body
        const tableBody = document.getElementById('accPendingTableBody');
        if (tableBody) {
            tableBody.addEventListener('mouseenter', handleTooltipEnter, true);
            tableBody.addEventListener('mouseleave', handleTooltipLeave, true);
        }
    }

    function handleTooltipEnter(e) {
        const target = e.target.closest('.content-tooltip');
        if (!target) return;

        const text = target.getAttribute('data-tooltip');
        if (!text) return;

        tooltipEl.textContent = text;
        tooltipEl.classList.add('visible');

        // Position tooltip below the element
        const rect = target.getBoundingClientRect();
        const tooltipRect = tooltipEl.getBoundingClientRect();

        let left = rect.left;
        let top = rect.bottom + 8;

        // Prevent overflow right
        if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }

        // Prevent overflow bottom - show above if needed
        if (top + tooltipRect.height > window.innerHeight - 10) {
            top = rect.top - tooltipRect.height - 8;
            // Move arrow to bottom
            tooltipEl.style.setProperty('--arrow-top', 'auto');
            tooltipEl.style.setProperty('--arrow-bottom', '-6px');
        }

        tooltipEl.style.left = left + 'px';
        tooltipEl.style.top = top + 'px';
    }

    function handleTooltipLeave(e) {
        const target = e.target.closest('.content-tooltip');
        if (!target) return;

        tooltipEl.classList.remove('visible');
    }

    // =====================================================
    // DOM ELEMENTS
    // =====================================================

    const elements = {
        // Dashboard
        dashboard: null,
        statPending: null,
        statApproved: null,
        statRejected: null,
        statAdjustment: null,
        alertBar: null,

        // Sub-tabs
        subTabs: null,
        tabPending: null,
        tabApproved: null,
        tabAdjustment: null,

        // Panels
        panelPending: null,
        panelApproved: null,
        panelAdjustment: null,

        // Pending queue
        pendingTable: null,
        pendingTableBody: null,
        bulkBar: null,
        bulkCount: null,
        selectAllCheckbox: null,

        // Approved today
        approvedTable: null,
        approvedTableBody: null,
        approvedDateFilter: null,

        // Adjustment form
        adjustmentForm: null,
        adjustmentPhone: null,
        adjustmentName: null,
        adjustmentBalance: null,
        adjustmentType: null,
        adjustmentAmount: null,
        adjustmentReason: null,
        adjustmentSubmit: null,
        customerLookup: null,

        // Adjustment history
        adjustmentHistoryBody: null,

        // Modals
        rejectModal: null,
        changeModal: null,

        // Pagination
        paginationPending: null,
        paginationApproved: null
    };

    // =====================================================
    // INITIALIZATION
    // =====================================================

    function init() {
        console.log('[ACCOUNTANT] Initializing module...');

        // Cache DOM elements
        cacheElements();

        // Setup event listeners
        setupEventListeners();

        // Initialize tooltip system
        initTooltip();

        // Set default date for approved filter
        if (elements.approvedDateFilter) {
            elements.approvedDateFilter.value = new Date().toISOString().split('T')[0];
        }

        // Load initial data
        loadDashboardStats();
        loadPendingQueue();

        // Start auto-refresh
        startAutoRefresh();

        // Render auto-approve toggle for Admin users
        renderAutoApproveToggle();

        console.log('[ACCOUNTANT] Module initialized');
    }

    function cacheElements() {
        // Dashboard
        elements.dashboard = document.getElementById('accDashboard');
        elements.statPending = document.getElementById('accStatPending');
        elements.statApproved = document.getElementById('accStatApproved');
        elements.statRejected = document.getElementById('accStatRejected');
        elements.statAdjustment = document.getElementById('accStatAdjustment');
        elements.alertBar = document.getElementById('accAlertBar');

        // Sub-tabs
        elements.subTabs = document.getElementById('accSubTabs');
        elements.tabPending = document.getElementById('accTabPending');
        elements.tabApproved = document.getElementById('accTabApproved');
        elements.tabAdjustment = document.getElementById('accTabAdjustment');

        // Panels
        elements.panelPending = document.getElementById('accPanelPending');
        elements.panelApproved = document.getElementById('accPanelApproved');
        elements.panelAdjustment = document.getElementById('accPanelAdjustment');

        // Pending queue
        elements.pendingTableBody = document.getElementById('accPendingTableBody');
        elements.bulkBar = document.getElementById('accBulkBar');
        elements.bulkCount = document.getElementById('accBulkCount');
        elements.selectAllCheckbox = document.getElementById('accSelectAll');

        // Filters - Pending
        elements.pendingStartDate = document.getElementById('accPendingStartDate');
        elements.pendingEndDate = document.getElementById('accPendingEndDate');
        elements.pendingSearch = document.getElementById('accPendingSearch');

        // Filters - Approved
        elements.approvedStartDate = document.getElementById('accApprovedStartDate');
        elements.approvedEndDate = document.getElementById('accApprovedEndDate');
        elements.approvedSearch = document.getElementById('accApprovedSearch');

        // Approved table
        elements.approvedTableBody = document.getElementById('accApprovedTableBody');

        // Adjustment form
        elements.adjustmentForm = document.getElementById('accAdjustmentForm');
        elements.adjustmentPhone = document.getElementById('accAdjustmentPhone');
        elements.adjustmentName = document.getElementById('accAdjustmentName');
        elements.adjustmentBalance = document.getElementById('accAdjustmentBalance');
        elements.adjustmentAmount = document.getElementById('accAdjustmentAmount');
        elements.adjustmentReason = document.getElementById('accAdjustmentReason');
        elements.adjustmentSubmit = document.getElementById('accAdjustmentSubmit');
        elements.customerLookup = document.getElementById('accCustomerLookup');

        // Adjustment history
        elements.adjustmentHistoryBody = document.getElementById('accAdjustmentHistoryBody');

        // Modals
        elements.rejectModal = document.getElementById('accRejectModal');
        elements.changeModal = document.getElementById('accChangeModal');

        // Approve Modal
        elements.approveModal = document.getElementById('accApproveModal');
        elements.approveNote = document.getElementById('accApproveNote');
        elements.approveDropzone = document.getElementById('accApproveDropzone');
        elements.approveImageInput = document.getElementById('accApproveImageInput');
        elements.approveImagePreview = document.getElementById('accApproveImagePreview');
        elements.approvePreviewImg = document.getElementById('accApprovePreviewImg');
        elements.approveUploadOverlay = document.getElementById('accApproveUploadOverlay');
        elements.approveUploadStatus = document.getElementById('accApproveUploadStatus');
        elements.approveConfirmBtn = document.getElementById('accApproveConfirmBtn');
        elements.approveSummary = document.getElementById('accApproveSummary');

        // Pagination
        elements.paginationPending = document.getElementById('accPaginationPending');
        elements.paginationApproved = document.getElementById('accPaginationApproved');
    }

    function setupEventListeners() {
        // Sub-tab switching
        if (elements.tabPending) {
            elements.tabPending.addEventListener('click', () => switchSubTab('pending'));
        }
        if (elements.tabApproved) {
            elements.tabApproved.addEventListener('click', () => switchSubTab('approved'));
        }
        if (elements.tabAdjustment) {
            elements.tabAdjustment.addEventListener('click', () => switchSubTab('adjustment'));
        }

        // Select all checkbox
        if (elements.selectAllCheckbox) {
            elements.selectAllCheckbox.addEventListener('change', handleSelectAll);
        }

        // Adjustment form submit
        if (elements.adjustmentForm) {
            elements.adjustmentForm.addEventListener('submit', handleAdjustmentSubmit);
        }

        // Phone input for customer lookup
        if (elements.adjustmentPhone) {
            elements.adjustmentPhone.addEventListener('input', debounce(handlePhoneLookup, 500));
        }

        // Approved date filter
        if (elements.approvedDateFilter) {
            elements.approvedDateFilter.addEventListener('change', () => loadApprovedToday());
        }

        // Modal close buttons
        document.querySelectorAll('.acc-modal-close').forEach(btn => {
            btn.addEventListener('click', closeAllModals);
        });

        // Click outside modal to close
        document.querySelectorAll('.acc-modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closeAllModals();
            });
        });

        // Filter Event Listeners
        // Presets
        document.querySelectorAll('.acc-preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => setFilterPreset(e.target));
        });

        // Inputs
        ['pending', 'approved'].forEach(tab => {
            const start = elements[`${tab}StartDate`];
            const end = elements[`${tab}EndDate`];
            const search = elements[`${tab}Search`];

            if (start) start.addEventListener('change', () => handleFilterChange(tab));
            if (end) end.addEventListener('change', () => handleFilterChange(tab));
            if (search) search.addEventListener('input', debounce(() => handleFilterChange(tab), 500));
        });

        // =====================================================
        // APPROVE MODAL EVENT LISTENERS
        // =====================================================

        // Dropzone click to open file picker
        if (elements.approveDropzone) {
            elements.approveDropzone.addEventListener('click', () => {
                elements.approveImageInput?.click();
            });

            // Drag and drop
            elements.approveDropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                elements.approveDropzone.classList.add('dragover');
            });

            elements.approveDropzone.addEventListener('dragleave', () => {
                elements.approveDropzone.classList.remove('dragover');
            });

            elements.approveDropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                elements.approveDropzone.classList.remove('dragover');
                const files = e.dataTransfer.files;
                if (files.length > 0 && files[0].type.startsWith('image/')) {
                    handleApproveImageSelect(files[0]);
                }
            });
        }

        // File input change
        if (elements.approveImageInput) {
            elements.approveImageInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    handleApproveImageSelect(e.target.files[0]);
                }
            });
        }

        // Paste handler for approve modal (Ctrl+V)
        if (elements.approveModal) {
            elements.approveModal.addEventListener('paste', (e) => {
                const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
                if (!items) return;

                for (let item of items) {
                    if (item.kind === 'file' && item.type.startsWith('image/')) {
                        e.preventDefault();
                        const blob = item.getAsFile();
                        handleApproveImageSelect(blob);
                        break;
                    }
                }
            });
        }
    }

    // =====================================================
    // FILTER LOGIC
    // =====================================================

    function setFilterPreset(btn) {
        const preset = btn.dataset.preset;
        const days = parseInt(btn.dataset.days);
        const tab = btn.dataset.tab; // 'pending' or 'approved'

        // Remove active class from all presets in this group
        btn.parentElement.querySelectorAll('.acc-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Calculate dates
        let start = new Date();
        let end = new Date();

        if (preset === 'today') {
            // Start and end are today
        } else if (preset === 'yesterday') {
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
        } else if (!isNaN(days)) {
            start.setDate(end.getDate() - days);
        }

        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];

        // Update inputs
        if (elements[`${tab}StartDate`]) elements[`${tab}StartDate`].value = startStr;
        if (elements[`${tab}EndDate`]) elements[`${tab}EndDate`].value = endStr;

        // Trigger change
        handleFilterChange(tab);
    }

    function handleFilterChange(tab) {
        const start = elements[`${tab}StartDate`]?.value;
        const end = elements[`${tab}EndDate`]?.value;
        const search = elements[`${tab}Search`]?.value?.trim();

        // Update state
        state.filters[tab] = { startDate: start, endDate: end, search: search };

        // Reload data
        if (tab === 'pending') {
            loadPendingQueue(1);
        } else if (tab === 'approved') {
            loadApprovedToday(1);
        }
    }

    function startAutoRefresh() {
        if (state.refreshTimer) clearInterval(state.refreshTimer);

        state.refreshTimer = setInterval(() => {
            // Only refresh if on pending tab and visible
            if (state.currentSubTab === 'pending' && document.visibilityState === 'visible') {
                console.log('[ACCOUNTANT] Auto-refreshing (silent)...');
                loadDashboardStats();
                loadPendingQueue(state.pagination.pending.page, true); // silent = true to avoid flickering
            }
        }, CONFIG.REFRESH_INTERVAL);
    }

    function stopAutoRefresh() {
        if (state.refreshTimer) {
            clearInterval(state.refreshTimer);
            state.refreshTimer = null;
        }
    }

    // =====================================================
    // SUB-TAB SWITCHING
    // =====================================================

    function switchSubTab(tabName) {
        state.currentSubTab = tabName;

        // Update tab buttons
        document.querySelectorAll('.acc-sub-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update panels
        document.querySelectorAll('.acc-sub-panel').forEach(panel => {
            panel.classList.toggle('active', panel.dataset.panel === tabName);
        });

        // Load data for tab
        switch (tabName) {
            case 'pending':
                loadPendingQueue();
                break;
            case 'approved':
                loadApprovedToday();
                break;
            case 'adjustment':
                loadAdjustmentsToday();
                break;
        }

        // Reinitialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }
    }

    // =====================================================
    // DASHBOARD STATS
    // =====================================================

    async function loadDashboardStats() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/v2/balance-history/accountant/stats`);
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to load stats');
            }

            state.stats = result.stats;
            renderDashboard();

        } catch (error) {
            console.error('[ACCOUNTANT] Stats error:', error);
        }
    }

    function renderDashboard() {
        const { pending, pendingOverdue, approvedToday, rejectedToday, adjustmentsToday } = state.stats;

        // Update stat cards
        if (elements.statPending) {
            elements.statPending.querySelector('.stat-value').textContent = pending;
            const subEl = elements.statPending.querySelector('.stat-sub');
            if (subEl) {
                subEl.textContent = pendingOverdue > 0 ? `🔴 ${pendingOverdue} quá 24h` : '';
                subEl.style.display = pendingOverdue > 0 ? 'inline-block' : 'none';
            }
        }

        if (elements.statApproved) {
            elements.statApproved.querySelector('.stat-value').textContent = approvedToday;
        }

        if (elements.statRejected) {
            elements.statRejected.querySelector('.stat-value').textContent = rejectedToday;
        }

        if (elements.statAdjustment) {
            elements.statAdjustment.querySelector('.stat-value').textContent = adjustmentsToday;
        }

        // Update alert bar
        if (elements.alertBar) {
            if (pendingOverdue > 0) {
                elements.alertBar.classList.remove('hidden');
                elements.alertBar.querySelector('.alert-text').textContent =
                    `⚠️ ${pendingOverdue} giao dịch chờ duyệt > 24h`;
            } else {
                elements.alertBar.classList.add('hidden');
            }
        }

        // Update tab badge
        const pendingBadge = document.getElementById('accPendingBadge');
        if (pendingBadge) {
            pendingBadge.textContent = pending;
            pendingBadge.style.display = pending > 0 ? 'inline' : 'none';
        }
    }

    // =====================================================
    // PENDING QUEUE
    // =====================================================

    async function loadPendingQueue(page = 1, silent = false) {
        if (state.isLoading) return;
        state.isLoading = true;

        // Only show loading if not silent refresh (auto-refresh)
        if (!silent) {
            showLoading(elements.pendingTableBody);
        }

        const { startDate, endDate, search } = state.filters.pending;
        const query = new URLSearchParams({
            page: page,
            limit: CONFIG.PAGE_SIZE,
            startDate: startDate || '',
            endDate: endDate || '',
            search: search || ''
        });

        try {
            const response = await fetch(
                `${API_BASE_URL}/api/v2/balance-history/verification-queue?${query.toString()}`
            );
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to load queue');
            }

            state.pendingQueue = result.data;
            state.pagination.pending = {
                page: result.pagination.page,
                totalPages: result.pagination.totalPages,
                total: result.pagination.total
            };

            renderPendingQueue();
            updatePagination('pending');

            // Clear selection on page change
            state.selectedIds.clear();
            updateBulkBar();

        } catch (error) {
            console.error('[ACCOUNTANT] Load queue error:', error);
            showError(elements.pendingTableBody, error.message);
        } finally {
            state.isLoading = false;
        }
    }

    function renderPendingQueue() {
        if (!elements.pendingTableBody) return;

        if (state.pendingQueue.length === 0) {
            elements.pendingTableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="acc-empty-state">
                        <div class="empty-icon">✅</div>
                        <div class="empty-text">Không có giao dịch nào chờ duyệt</div>
                    </td>
                </tr>
            `;
            return;
        }

        elements.pendingTableBody.innerHTML = state.pendingQueue.map(tx => {
            const amount = parseFloat(tx.amount || 0);
            const amountFormatted = amount.toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + 'đ';
            const timeStr = formatDateTime(tx.transaction_date);

            // Calculate wait time
            const waitTime = calculateWaitTime(tx.verified_at || tx.created_at);
            const waitClass = waitTime.hours >= 24 ? 'danger' : (waitTime.hours >= 2 ? 'warning' : 'normal');

            // Customer display
            const hasCustomer = tx.linked_customer_phone;
            const canChange = hasCustomer && tx.wallet_processed !== true;

            // Escape for onclick
            const escapedName = (tx.customer_name || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
            const escapedPhone = (tx.linked_customer_phone || '').replace(/'/g, "\\'");

            return `
                <tr data-tx-id="${tx.id}">
                    <td class="col-checkbox">
                        <input type="checkbox" class="acc-row-checkbox" data-id="${tx.id}"
                            ${state.selectedIds.has(tx.id) ? 'checked' : ''}
                            ${tx.wallet_processed ? 'disabled' : ''}
                            onchange="AccountantModule.toggleSelect(${tx.id})">
                    </td>
                    <td class="col-time">${timeStr}</td>
                    <td class="col-amount amount-in">${amountFormatted}</td>
                    <td class="col-content"><span class="content-tooltip" data-tooltip="${(tx.content || '').replace(/"/g, '&quot;')}">${truncate(tx.content || '', 30)}</span></td>
                    <td class="col-customer">
                        ${hasCustomer ? `
                            <div class="acc-customer-info">
                                <span class="customer-name">${tx.customer_name || 'Chưa có tên'}</span>
                                <span class="customer-phone">${tx.linked_customer_phone}</span>
                                ${canChange ? `<span class="btn-change" onclick="AccountantModule.showChangeModal(${tx.id}, '${escapedPhone}', '${escapedName}')">Thay đổi</span>` : ''}
                            </div>
                        ` : `<span class="acc-text-muted">Chưa gán KH</span>`}
                    </td>
                    <td class="col-staff">${getMatchMethodBadge(tx.match_method)}</td>
                    <td class="col-wait">
                        <span class="acc-wait-time ${waitClass}">${waitTime.display}</span>
                    </td>
                    <td class="col-actions">
                        ${tx.wallet_processed ? `
                            <span class="acc-text-muted acc-text-sm">🔒 Đã cộng ví</span>
                        ` : (hasCustomer ? `
                            <div class="acc-action-buttons">
                                <button class="acc-btn acc-btn-approve" onclick="AccountantModule.approve(${tx.id})" title="Duyệt">
                                    <i data-lucide="check" style="width:14px;height:14px"></i>
                                </button>
                                <button class="acc-btn acc-btn-reject" onclick="AccountantModule.showRejectModal(${tx.id})" title="Từ chối">
                                    <i data-lucide="x" style="width:14px;height:14px"></i>
                                </button>
                            </div>
                        ` : `<span class="acc-text-muted acc-text-sm">Gán KH trước</span>`)}
                    </td>
                </tr>
            `;
        }).join('');

        // Re-render Lucide icons only in this container
        if (window.lucide && elements.pendingTableBody) {
            lucide.createIcons({ root: elements.pendingTableBody });
        }
    }

    function calculateWaitTime(dateString) {
        if (!dateString) return { hours: 0, display: 'N/A' };

        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        let display;
        if (diffHours >= 24) {
            const days = Math.floor(diffHours / 24);
            display = `${days}d ${diffHours % 24}h`;
        } else if (diffHours > 0) {
            display = `${diffHours}h ${diffMins}m`;
        } else {
            display = `${diffMins}m`;
        }

        return { hours: diffHours, display };
    }

    /**
     * Format date/time as "HH:MM DD/MM" in Vietnam timezone
     * @param {string|Date} dateInput
     * @returns {string}
     */
    function formatDateTime(dateInput) {
        if (!dateInput) return 'N/A';
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return 'N/A';

        // Use Vietnam timezone explicitly
        const options = {
            timeZone: 'Asia/Ho_Chi_Minh',
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit'
        };

        const parts = new Intl.DateTimeFormat('vi-VN', options).formatToParts(date);
        const get = (type) => parts.find(p => p.type === type)?.value || '';

        return `${get('hour')}:${get('minute')} ${get('day')}/${get('month')}`;
    }

    /**
     * Get badge for match_method
     */
    function getMatchMethodBadge(method) {
        const badges = {
            'qr_code': '<span class="badge badge-success">QR Code</span>',
            'exact_phone': '<span class="badge badge-success">SĐT chính xác</span>',
            'single_match': '<span class="badge badge-info">TPOS</span>',
            'pending_match': '<span class="badge badge-warning">Chọn KH</span>',
            'manual_entry': '<span class="badge badge-primary">Nhập tay</span>',
            'manual_link': '<span class="badge badge-secondary">Kế toán gán</span>'
        };
        return badges[method] || '<span class="badge badge-light">N/A</span>';
    }

    // =====================================================
    // BULK SELECTION
    // =====================================================

    function handleSelectAll(e) {
        const isChecked = e.target.checked;
        state.selectedIds.clear();

        if (isChecked) {
            state.pendingQueue.forEach(tx => {
                if (!tx.wallet_processed && tx.linked_customer_phone) {
                    state.selectedIds.add(tx.id);
                }
            });
        }

        // Update all checkboxes
        document.querySelectorAll('.acc-row-checkbox').forEach(cb => {
            const id = parseInt(cb.dataset.id);
            const tx = state.pendingQueue.find(t => t.id === id);
            if (tx && !tx.wallet_processed && tx.linked_customer_phone) {
                cb.checked = isChecked;
            }
        });

        updateBulkBar();
    }

    function toggleSelect(id) {
        if (state.selectedIds.has(id)) {
            state.selectedIds.delete(id);
        } else {
            state.selectedIds.add(id);
        }
        updateBulkBar();
    }

    function updateBulkBar() {
        const count = state.selectedIds.size;

        if (elements.bulkBar) {
            if (count > 0) {
                elements.bulkBar.classList.add('visible');
                if (elements.bulkCount) {
                    elements.bulkCount.textContent = count;
                }
            } else {
                elements.bulkBar.classList.remove('visible');
            }
        }

        // Update select all checkbox state
        if (elements.selectAllCheckbox) {
            const selectableCount = state.pendingQueue.filter(tx =>
                !tx.wallet_processed && tx.linked_customer_phone
            ).length;
            elements.selectAllCheckbox.checked = count > 0 && count === selectableCount;
            elements.selectAllCheckbox.indeterminate = count > 0 && count < selectableCount;
        }
    }

    // =====================================================
    // APPROVE / REJECT ACTIONS
    // =====================================================

    /**
     * Show approve modal instead of direct approval
     */
    async function approve(transactionId) {
        showApproveModal(transactionId);
    }

    /**
     * Show the approve modal for a transaction
     */
    function showApproveModal(transactionId) {
        // Permission check
        if (!window.authManager?.hasDetailedPermission('balance-history', 'approveTransaction')) {
            showNotification('Bạn không có quyền duyệt giao dịch', 'error');
            return;
        }

        // Find transaction
        const tx = state.pendingQueue.find(t => t.id === transactionId);
        if (!tx) {
            showNotification('Không tìm thấy giao dịch', 'error');
            return;
        }

        // Security check
        if (tx.wallet_processed === true) {
            showNotification('Giao dịch đã được cộng vào ví, không thể duyệt lại', 'error');
            return;
        }

        if (!elements.approveModal) return;

        // Reset state
        state.approveModal = {
            transactionId: transactionId,
            imageUrl: null,
            imageFile: null,
            isUploading: false
        };

        // Reset form
        if (elements.approveNote) elements.approveNote.value = '';
        clearApproveImage();

        // Show transaction summary
        const amount = parseFloat(tx.amount || 0).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + 'đ';
        if (elements.approveSummary) {
            elements.approveSummary.innerHTML = `
                <div class="summary-row">
                    <span class="summary-label">Số tiền:</span>
                    <span class="summary-value amount-in">${amount}</span>
                </div>
                <div class="summary-row">
                    <span class="summary-label">Khách hàng:</span>
                    <span class="summary-value">${tx.customer_name || tx.linked_customer_phone || 'N/A'}</span>
                </div>
                <div class="summary-row">
                    <span class="summary-label">Nội dung:</span>
                    <span class="summary-value">${truncate(tx.content || '', 50)}</span>
                </div>
            `;
        }

        elements.approveModal.classList.add('visible');

        // Reinitialize icons
        if (window.lucide) lucide.createIcons();
    }

    /**
     * Handle image file selection (from file picker, drag-drop, or paste)
     */
    async function handleApproveImageSelect(file) {
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            showNotification('Chỉ chấp nhận file ảnh (JPEG, PNG, GIF, WebP)', 'error');
            return;
        }

        // Validate file size (max 5MB)
        const maxSize = 5 * 1024 * 1024;
        if (file.size > maxSize) {
            showNotification('File quá lớn (tối đa 5MB)', 'error');
            return;
        }

        state.approveModal.imageFile = file;

        // Show preview
        const reader = new FileReader();
        reader.onload = async (e) => {
            if (elements.approvePreviewImg) {
                elements.approvePreviewImg.src = e.target.result;
            }
            if (elements.approveImagePreview) {
                elements.approveImagePreview.style.display = 'block';
            }
            if (elements.approveDropzone) {
                elements.approveDropzone.style.display = 'none';
            }

            // Reinitialize icons for remove button
            if (window.lucide) lucide.createIcons();

            // Start upload immediately
            await uploadApproveImage(file, e.target.result);
        };
        reader.readAsDataURL(file);
    }

    /**
     * Upload image to Firebase via server endpoint
     */
    async function uploadApproveImage(file, base64Data) {
        if (state.approveModal.isUploading) return;

        state.approveModal.isUploading = true;

        // Show loading state
        if (elements.approveUploadOverlay) {
            elements.approveUploadOverlay.style.display = 'flex';
        }
        if (elements.approveUploadStatus) {
            elements.approveUploadStatus.textContent = 'Đang tải lên...';
            elements.approveUploadStatus.className = 'acc-upload-status uploading';
        }
        if (elements.approveConfirmBtn) {
            elements.approveConfirmBtn.disabled = true;
        }

        try {
            // Generate filename
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(2, 8);
            const extension = file.name?.split('.').pop() || 'jpg';
            const filename = `approval_${timestamp}_${random}.${extension}`;

            // Upload to Firebase via server endpoint
            const response = await fetch(`${API_BASE_URL}/api/upload/image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64Data,
                    fileName: filename,
                    folderPath: 'accountant-approvals',
                    mimeType: file.type
                })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Upload failed');
            }

            state.approveModal.imageUrl = result.url;

            // Update UI - success
            if (elements.approveUploadOverlay) {
                elements.approveUploadOverlay.style.display = 'none';
            }
            if (elements.approveUploadStatus) {
                elements.approveUploadStatus.textContent = 'Đã tải lên thành công';
                elements.approveUploadStatus.className = 'acc-upload-status success';
            }

        } catch (error) {
            console.error('[ACCOUNTANT] Image upload error:', error);

            // Show error state
            if (elements.approveUploadOverlay) {
                elements.approveUploadOverlay.style.display = 'none';
            }
            if (elements.approveUploadStatus) {
                elements.approveUploadStatus.textContent = 'Lỗi tải lên - bỏ qua ảnh';
                elements.approveUploadStatus.className = 'acc-upload-status error';
            }

            showNotification(`Lỗi tải ảnh: ${error.message}`, 'error');
            state.approveModal.imageUrl = null;

        } finally {
            state.approveModal.isUploading = false;
            if (elements.approveConfirmBtn) {
                elements.approveConfirmBtn.disabled = false;
            }
        }
    }

    /**
     * Clear the image preview and reset state
     */
    function clearApproveImage() {
        state.approveModal.imageFile = null;
        state.approveModal.imageUrl = null;

        if (elements.approvePreviewImg) {
            elements.approvePreviewImg.src = '';
        }
        if (elements.approveImagePreview) {
            elements.approveImagePreview.style.display = 'none';
        }
        if (elements.approveDropzone) {
            elements.approveDropzone.style.display = 'flex';
        }
        if (elements.approveImageInput) {
            elements.approveImageInput.value = '';
        }
        if (elements.approveUploadStatus) {
            elements.approveUploadStatus.textContent = '';
            elements.approveUploadStatus.className = 'acc-upload-status';
        }
        if (elements.approveUploadOverlay) {
            elements.approveUploadOverlay.style.display = 'none';
        }
    }

    /**
     * Confirm approval with note and optional image
     */
    async function confirmApprove() {
        const transactionId = state.approveModal.transactionId;
        if (!transactionId) return;

        // Don't allow confirmation while uploading
        if (state.approveModal.isUploading) {
            showNotification('Vui lòng đợi tải ảnh xong', 'warning');
            return;
        }

        const note = elements.approveNote?.value?.trim() || 'Duyệt bởi kế toán';
        const imageUrl = state.approveModal.imageUrl;

        const userInfo = window.authManager?.getUserInfo() || {};
        const performedBy = userInfo.email || userInfo.displayName || userInfo.username || 'Unknown';

        // Disable button
        if (elements.approveConfirmBtn) {
            elements.approveConfirmBtn.disabled = true;
            elements.approveConfirmBtn.innerHTML = '<div class="acc-loading-spinner" style="width:14px;height:14px"></div> Đang xử lý...';
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/v2/balance-history/${transactionId}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    verified_by: performedBy,
                    note: note,
                    verification_image_url: imageUrl || null
                })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to approve');
            }

            showNotification(`Đã duyệt giao dịch #${transactionId}`, 'success');
            closeAllModals();

            // Refresh data
            loadDashboardStats();
            loadPendingQueue(state.pagination.pending.page);

        } catch (error) {
            console.error('[ACCOUNTANT] Approve error:', error);
            showNotification(`Lỗi: ${error.message}`, 'error');

        } finally {
            // Re-enable button
            if (elements.approveConfirmBtn) {
                elements.approveConfirmBtn.disabled = false;
                elements.approveConfirmBtn.innerHTML = '<i data-lucide="check" style="width:14px;height:14px"></i> Xác nhận duyệt';
                if (window.lucide) lucide.createIcons();
            }
        }
    }

    async function bulkApprove() {
        if (state.selectedIds.size === 0) {
            showNotification('Chưa chọn giao dịch nào', 'warning');
            return;
        }

        // Permission check
        if (!window.authManager?.hasDetailedPermission('balance-history', 'approveTransaction')) {
            showNotification('Bạn không có quyền duyệt giao dịch', 'error');
            return;
        }

        const ids = Array.from(state.selectedIds);
        const userInfo = window.authManager?.getUserInfo() || {};
        const performedBy = userInfo.email || userInfo.displayName || userInfo.username || 'Unknown';

        if (!confirm(`Xác nhận duyệt ${ids.length} giao dịch?`)) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/v2/balance-history/bulk-approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transaction_ids: ids,
                    verified_by: performedBy
                })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to bulk approve');
            }

            showNotification(`Đã duyệt ${result.approved} giao dịch`, 'success');

            // Clear selection and refresh
            state.selectedIds.clear();
            updateBulkBar();
            loadDashboardStats();
            loadPendingQueue(state.pagination.pending.page);

        } catch (error) {
            console.error('[ACCOUNTANT] Bulk approve error:', error);
            showNotification(`Lỗi: ${error.message}`, 'error');
        }
    }

    function showRejectModal(transactionId) {
        // Permission check
        if (!window.authManager?.hasDetailedPermission('balance-history', 'approveTransaction')) {
            showNotification('Bạn không có quyền từ chối giao dịch', 'error');
            return;
        }

        if (!elements.rejectModal) return;

        elements.rejectModal.dataset.txId = transactionId;
        document.getElementById('accRejectReason').value = '';
        elements.rejectModal.classList.add('visible');
    }

    async function confirmReject() {
        const transactionId = elements.rejectModal?.dataset.txId;
        const reason = document.getElementById('accRejectReason')?.value?.trim();

        if (!reason || reason.length < 5) {
            showNotification('Vui lòng nhập lý do từ chối (ít nhất 5 ký tự)', 'error');
            return;
        }

        const userInfo = window.authManager?.getUserInfo() || {};
        const performedBy = userInfo.email || userInfo.displayName || userInfo.username || 'Unknown';

        try {
            const response = await fetch(`${API_BASE_URL}/api/v2/balance-history/${transactionId}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rejected_by: performedBy,
                    reason: reason
                })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to reject');
            }

            showNotification(`Đã từ chối giao dịch #${transactionId}`, 'success');
            closeAllModals();

            // Refresh
            loadDashboardStats();
            loadPendingQueue(state.pagination.pending.page);

        } catch (error) {
            console.error('[ACCOUNTANT] Reject error:', error);
            showNotification(`Lỗi: ${error.message}`, 'error');
        }
    }

    // =====================================================
    // CHANGE PHONE MODAL
    // =====================================================

    function showChangeModal(transactionId, currentPhone, currentName) {
        // Permission check
        if (!window.authManager?.hasDetailedPermission('balance-history', 'approveTransaction')) {
            showNotification('Bạn không có quyền thay đổi giao dịch', 'error');
            return;
        }

        // Security check
        const tx = state.pendingQueue.find(t => t.id === transactionId);
        if (tx?.wallet_processed === true) {
            showNotification('Không thể thay đổi SĐT - Giao dịch đã được cộng vào ví', 'error');
            return;
        }

        if (!elements.changeModal) return;

        elements.changeModal.dataset.txId = transactionId;
        document.getElementById('accChangePhone').value = currentPhone || '';
        document.getElementById('accChangeName').value = currentName || '';

        // Reset lookup state
        const lookupResult = document.getElementById('accChangeLookupResult');
        if (lookupResult) {
            lookupResult.innerHTML = '';
            lookupResult.className = '';
        }

        elements.changeModal.classList.add('visible');

        // Trigger lookup if phone is valid
        if (currentPhone?.replace(/\D/g, '').length === 10) {
            lookupCustomerForChange(currentPhone);
        }
    }

    async function lookupCustomerForChange(phone) {
        const lookupResult = document.getElementById('accChangeLookupResult');
        if (!lookupResult) return;

        const normalized = phone.replace(/\D/g, '');
        if (normalized.length !== 10) {
            lookupResult.innerHTML = '';
            return;
        }

        lookupResult.innerHTML = '<div class="tpos-loading"><span class="loading-spinner"></span> Đang tìm...</div>';

        try {
            // Use TPOS search API (same as main.js) for accurate customer names
            const response = await fetch(`${API_BASE_URL}/api/sepay/tpos/search/${normalized}`);
            const result = await response.json();

            // API returns { success, data: [{ phone, count, customers: [...] }] }
            const phoneGroups = result.data || [];
            const customers = phoneGroups.flatMap(group => group.customers || []);

            if (!result.success || !customers.length) {
                lookupResult.innerHTML = '<div class="tpos-result error">Không tìm thấy KH</div>';
                return;
            }

            if (customers.length === 1) {
                const customer = customers[0];
                document.getElementById('accChangeName').value = customer.name || '';
                lookupResult.innerHTML = `<div class="tpos-result">✅ ${customer.name}</div>`;
            } else {
                // Multiple customers
                const options = customers.map(c =>
                    `<option value="${c.name}">${c.name} - ${c.phone || ''}</option>`
                ).join('');
                lookupResult.innerHTML = `
                    <div class="tpos-multiple">
                        <span>⚠️ Tìm thấy ${customers.length} KH</span>
                        <select id="accChangeCustomerSelect" onchange="document.getElementById('accChangeName').value = this.value">
                            <option value="">-- Chọn KH --</option>
                            ${options}
                        </select>
                    </div>
                `;
            }
        } catch (error) {
            console.error('[ACCOUNTANT] Customer lookup error:', error);
            lookupResult.innerHTML = '<div class="tpos-result error">Lỗi kết nối TPOS</div>';
        }
    }

    async function confirmChange() {
        const transactionId = elements.changeModal?.dataset.txId;
        const newPhone = document.getElementById('accChangePhone')?.value?.trim();
        const newName = document.getElementById('accChangeName')?.value?.trim();

        if (!newPhone || newPhone.replace(/\D/g, '').length !== 10) {
            showNotification('Vui lòng nhập số điện thoại hợp lệ (10 số)', 'error');
            return;
        }

        const userInfo = window.authManager?.getUserInfo() || {};
        const performedBy = userInfo.email || userInfo.displayName || userInfo.username || 'Unknown';

        if (!confirm(`Xác nhận THAY ĐỔI SĐT thành ${newPhone} và DUYỆT giao dịch #${transactionId}?\n\nTiền sẽ được cộng vào ví khách hàng mới ngay lập tức.`)) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/sepay/transaction/${transactionId}/phone`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: newPhone,
                    customer_name: newName || null,
                    entered_by: performedBy,
                    is_accountant_correction: true
                })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to update');
            }

            showNotification(`Đã thay đổi SĐT thành ${newPhone} và duyệt`, 'success');
            closeAllModals();

            // Refresh
            loadDashboardStats();
            loadPendingQueue(state.pagination.pending.page);

        } catch (error) {
            console.error('[ACCOUNTANT] Change error:', error);
            showNotification(`Lỗi: ${error.message}`, 'error');
        }
    }

    // =====================================================
    // APPROVED TODAY
    // =====================================================

    async function loadApprovedToday(page = 1) {
        if (!elements.approvedTableBody) return;

        showLoading(elements.approvedTableBody);

        const { startDate, endDate, search } = state.filters.approved;
        const query = new URLSearchParams({
            page: page,
            limit: CONFIG.PAGE_SIZE,
            startDate: startDate || '',
            endDate: endDate || '',
            search: search || ''
        });

        try {
            const response = await fetch(
                `${API_BASE_URL}/api/v2/balance-history/approved-today?${query.toString()}`
            );
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to load');
            }

            state.approvedToday = result.data;
            state.pagination.approved = {
                page: result.pagination.page,
                totalPages: result.pagination.totalPages,
                total: result.pagination.total
            };

            renderApprovedToday();
            updatePagination('approved');

        } catch (error) {
            console.error('[ACCOUNTANT] Load approved error:', error);
            showError(elements.approvedTableBody, error.message);
        }
    }

    function renderApprovedToday() {
        if (!elements.approvedTableBody) return;

        if (state.approvedToday.length === 0) {
            elements.approvedTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="acc-empty-state">
                        <div class="empty-icon">📋</div>
                        <div class="empty-text">Chưa có giao dịch được duyệt ngày này</div>
                    </td>
                </tr>
            `;
            return;
        }

        elements.approvedTableBody.innerHTML = state.approvedToday.map(tx => {
            const amount = parseFloat(tx.amount || 0).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + 'đ';
            const verifiedAt = formatDateTime(tx.verified_at);
            const txDate = formatDateTime(tx.transaction_date);

            // Dịch ghi chú
            let note = tx.verification_note || '';
            if (note.includes('Auto-approved by accountant')) {
                // Format: Auto-approved by accountant [user] at [time]
                // Rút gọn vì đã có cột Duyệt bởi
                note = 'Tự động duyệt';
            } else if (note === 'Approved by accountant') {
                note = 'Duyệt thủ công';
            } else if (note === 'Bulk approved') {
                note = 'Duyệt hàng loạt';
            }

            // Build note cell with optional image thumbnail
            let noteHtml = '<div class="acc-note-wrapper">';
            if (tx.verification_image_url) {
                noteHtml += `
                    <div class="acc-approve-image-thumb">
                        <img src="${tx.verification_image_url}" alt="Xác nhận CK" loading="lazy">
                        <div class="acc-zoom-overlay" style="background-image: url('${tx.verification_image_url}')"></div>
                    </div>
                `;
            }
            noteHtml += `<span class="acc-approve-note">${note}</span></div>`;

            return `
                <tr>
                    <td>${verifiedAt}</td>
                    <td>${txDate}</td>
                    <td class="amount-in">${amount}</td>
                    <td>
                        <div class="acc-customer-info">
                            <span class="customer-name">${tx.customer_name || 'N/A'}</span>
                            <span class="customer-phone">${tx.linked_customer_phone || ''}</span>
                        </div>
                    </td>
                    <td>${getMatchMethodBadge(tx.match_method)}</td>
                    <td><span class="badge badge-info">${tx.verified_by || 'N/A'}</span></td>
                    <td>${noteHtml}</td>
                </tr>
            `;
        }).join('');
    }

    // =====================================================
    // MANUAL ADJUSTMENT
    // =====================================================

    async function handlePhoneLookup(e) {
        const phone = e.target.value.replace(/\D/g, '');

        if (phone.length !== 10) {
            if (elements.customerLookup) {
                elements.customerLookup.classList.remove('visible');
            }
            if (elements.adjustmentName) elements.adjustmentName.value = '';
            if (elements.adjustmentBalance) elements.adjustmentBalance.value = '';
            return;
        }

        try {
            // Use TPOS search API for accurate customer names
            const response = await fetch(`${API_BASE_URL}/api/sepay/tpos/search/${phone}`);
            const result = await response.json();

            // API returns { success, data: [{ phone, count, customers: [...] }] }
            const phoneGroups = result.data || [];
            const customers = phoneGroups.flatMap(group => group.customers || []);

            if (!result.success || !customers.length) {
                if (elements.customerLookup) {
                    elements.customerLookup.classList.add('visible');
                    elements.customerLookup.innerHTML = '<span class="acc-text-danger">Không tìm thấy KH</span>';
                }
                return;
            }

            const customer = customers[0];

            if (elements.adjustmentName) {
                elements.adjustmentName.value = customer.name || '';
            }

            // Get wallet balance
            const balanceResponse = await fetch(`${API_BASE_URL}/api/v2/wallet/balance?phone=${phone}`);
            const balanceResult = await balanceResponse.json();

            const balance = balanceResult.success ? (balanceResult.balance || 0) : 0;
            if (elements.adjustmentBalance) {
                elements.adjustmentBalance.value = balance.toLocaleString('vi-VN') + 'đ';
            }

            if (elements.customerLookup) {
                elements.customerLookup.classList.add('visible');
                elements.customerLookup.innerHTML = `
                    <span class="lookup-name">✅ ${customer.name}</span>
                    <span class="lookup-balance">Số dư: ${balance.toLocaleString('vi-VN')}đ</span>
                `;
            }

        } catch (error) {
            console.error('[ACCOUNTANT] Phone lookup error:', error);
        }
    }

    async function handleAdjustmentSubmit(e) {
        e.preventDefault();

        const phone = elements.adjustmentPhone?.value?.replace(/\D/g, '');
        const name = elements.adjustmentName?.value?.trim();
        const typeRadio = document.querySelector('input[name="adjustmentType"]:checked');
        const type = typeRadio?.value;
        const amount = parseFloat(elements.adjustmentAmount?.value || 0);
        const reason = elements.adjustmentReason?.value?.trim();

        // Validation
        if (!phone || phone.length !== 10) {
            showNotification('Vui lòng nhập số điện thoại hợp lệ (10 số)', 'error');
            return;
        }

        if (!type) {
            showNotification('Vui lòng chọn loại điều chỉnh', 'error');
            return;
        }

        if (!amount || amount <= 0) {
            showNotification('Vui lòng nhập số tiền hợp lệ', 'error');
            return;
        }

        if (!reason || reason.length < 10) {
            showNotification('Vui lòng nhập lý do (ít nhất 10 ký tự)', 'error');
            return;
        }

        // Permission check
        if (!window.authManager?.hasDetailedPermission('balance-history', 'adjustWallet')) {
            showNotification('Bạn không có quyền điều chỉnh công nợ', 'error');
            return;
        }

        const userInfo = window.authManager?.getUserInfo() || {};
        const performedBy = userInfo.email || userInfo.displayName || userInfo.username || 'Unknown';

        if (!confirm(`Xác nhận ${type === 'add' ? 'CỘNG' : 'TRỪ'} ${amount.toLocaleString('vi-VN')}đ cho khách ${name || phone}?\n\nLý do: ${reason}`)) {
            return;
        }

        if (elements.adjustmentSubmit) {
            elements.adjustmentSubmit.disabled = true;
            elements.adjustmentSubmit.textContent = 'Đang xử lý...';
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/v2/wallet/manual-adjustment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: phone,
                    customer_name: name,
                    type: type, // 'add' or 'subtract'
                    amount: amount,
                    reason: reason,
                    performed_by: performedBy
                })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to adjust');
            }

            showNotification(`Đã ${type === 'add' ? 'cộng' : 'trừ'} ${amount.toLocaleString('vi-VN')}đ cho ${name || phone}`, 'success');

            // Reset form
            elements.adjustmentForm.reset();
            if (elements.customerLookup) {
                elements.customerLookup.classList.remove('visible');
            }

            // Refresh
            loadDashboardStats();
            loadAdjustmentsToday();

        } catch (error) {
            console.error('[ACCOUNTANT] Adjustment error:', error);
            showNotification(`Lỗi: ${error.message}`, 'error');
        } finally {
            if (elements.adjustmentSubmit) {
                elements.adjustmentSubmit.disabled = false;
                elements.adjustmentSubmit.textContent = 'Thực hiện điều chỉnh';
            }
        }
    }

    async function loadAdjustmentsToday() {
        if (!elements.adjustmentHistoryBody) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/v2/wallet/adjustments-today`);
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to load');
            }

            state.adjustmentsToday = result.data;
            renderAdjustmentsToday();

        } catch (error) {
            console.error('[ACCOUNTANT] Load adjustments error:', error);
            elements.adjustmentHistoryBody.innerHTML = `<tr><td colspan="6" class="acc-text-danger">Lỗi: ${error.message}</td></tr>`;
        }
    }

    function renderAdjustmentsToday() {
        if (!elements.adjustmentHistoryBody) return;

        if (state.adjustmentsToday.length === 0) {
            elements.adjustmentHistoryBody.innerHTML = `
                <tr>
                    <td colspan="6" class="acc-text-muted" style="text-align: center; padding: 20px;">
                        Chưa có điều chỉnh nào hôm nay
                    </td>
                </tr>
            `;
            return;
        }

        elements.adjustmentHistoryBody.innerHTML = state.adjustmentsToday.map(adj => {
            const time = formatDateTime(adj.created_at);
            const amount = parseFloat(adj.amount || 0).toLocaleString('vi-VN') + 'đ';
            const typeClass = adj.type === 'add' ? 'type-add' : 'type-subtract';
            const typeIcon = adj.type === 'add' ? '+' : '-';

            return `
                <tr>
                    <td>${time}</td>
                    <td class="${typeClass}">${typeIcon}${amount}</td>
                    <td>${adj.customer_name || adj.phone}</td>
                    <td>${adj.reason || ''}</td>
                    <td>${adj.performed_by || 'N/A'}</td>
                </tr>
            `;
        }).join('');
    }

    // =====================================================
    // PAGINATION
    // =====================================================

    function updatePagination(type) {
        const pag = state.pagination[type];
        const container = type === 'pending' ? elements.paginationPending : elements.paginationApproved;

        if (!container) return;

        container.innerHTML = `
            <button class="acc-btn acc-btn-secondary" onclick="AccountantModule.changePage('${type}', -1)" ${pag.page <= 1 ? 'disabled' : ''}>
                <i data-lucide="chevron-left" style="width:16px;height:16px"></i> Trước
            </button>
            <span class="page-info">Trang ${pag.page} / ${pag.totalPages} (${pag.total} GD)</span>
            <button class="acc-btn acc-btn-secondary" onclick="AccountantModule.changePage('${type}', 1)" ${pag.page >= pag.totalPages ? 'disabled' : ''}>
                Sau <i data-lucide="chevron-right" style="width:16px;height:16px"></i>
            </button>
        `;

        if (window.lucide) lucide.createIcons();
    }

    function changePage(type, delta) {
        const newPage = state.pagination[type].page + delta;
        if (newPage < 1 || newPage > state.pagination[type].totalPages) return;

        if (type === 'pending') {
            loadPendingQueue(newPage);
        } else if (type === 'approved') {
            loadApprovedToday(newPage);
        }
    }

    // =====================================================
    // UTILITIES
    // =====================================================

    function showLoading(container) {
        if (!container) return;
        container.innerHTML = `
            <tr>
                <td colspan="8" class="acc-loading">
                    <div class="loading-spinner"></div>
                    <div>Đang tải...</div>
                </td>
            </tr>
        `;
    }

    function showError(container, message) {
        if (!container) return;
        container.innerHTML = `
            <tr>
                <td colspan="8" class="acc-empty-state">
                    <div class="empty-icon">❌</div>
                    <div class="empty-text acc-text-danger">Lỗi: ${message}</div>
                </td>
            </tr>
        `;
    }

    function closeAllModals() {
        document.querySelectorAll('.acc-modal-overlay').forEach(modal => {
            modal.classList.remove('visible');
        });
    }

    function showNotification(message, type = 'info') {
        // Use existing notification system if available
        if (window.notificationManager) {
            window.notificationManager.show(message, type);
        } else if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            alert(message);
        }
    }

    function truncate(str, len) {
        if (!str) return '';
        return str.length > len ? str.substring(0, len) + '...' : str;
    }

    function debounce(fn, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // =====================================================
    // AUTO-APPROVE TOGGLE
    // =====================================================

    /**
     * Render Auto-Approve Toggle
     * Chỉ hiển thị cho Admin
     */
    async function renderAutoApproveToggle() {
        // Check if user has toggleAutoApprove permission
        let hasPermission = false;

        // Method 1: authManager.hasDetailedPermission
        if (window.authManager?.hasDetailedPermission) {
            hasPermission = window.authManager.hasDetailedPermission('balance-history', 'toggleAutoApprove');
        }

        // Method 2: Check if user is Admin role (fallback)
        if (!hasPermission && window.authManager?.getUserRole) {
            const role = window.authManager.getUserRole();
            hasPermission = role === 'Admin';
        }

        // Method 3: Check user data directly
        if (!hasPermission && window.authManager?.user) {
            const user = window.authManager.user;
            hasPermission = user.role === 'Admin';
        }

        console.log('[ACCOUNTANT] toggleAutoApprove permission check:', hasPermission);

        if (!hasPermission) {
            console.log('[ACCOUNTANT] User does not have toggleAutoApprove permission');
            return;
        }

        const container = document.getElementById('verificationPanel');
        if (!container) {
            console.log('[ACCOUNTANT] verificationPanel not found');
            return;
        }

        // Check if toggle already exists
        if (document.getElementById('autoApproveToggleContainer')) return;

        // Create toggle container
        const toggleContainer = document.createElement('div');
        toggleContainer.id = 'autoApproveToggleContainer';
        toggleContainer.className = 'auto-approve-setting';
        toggleContainer.innerHTML = `
            <div class="toggle-wrapper">
                <label class="toggle-label">
                    <span class="toggle-text">Tự động duyệt giao dịch auto-match</span>
                    <div class="toggle-switch">
                        <input type="checkbox" id="autoApproveToggle" />
                        <span class="toggle-slider"></span>
                    </div>
                </label>
                <small class="toggle-hint" id="toggleHint">
                    Đang tải...
                </small>
            </div>
        `;

        // Insert before the dashboard cards
        const dashboard = container.querySelector('.acc-dashboard, #accDashboard');
        if (dashboard) {
            container.insertBefore(toggleContainer, dashboard);
        } else {
            container.insertAdjacentElement('afterbegin', toggleContainer);
        }

        // Load current setting
        await loadAutoApproveSetting();

        // Add event listener
        const toggle = document.getElementById('autoApproveToggle');
        if (toggle) {
            toggle.addEventListener('change', async (e) => {
                await toggleAutoApprove(e.target.checked);
            });
        }
    }

    /**
     * Load current auto-approve setting from server
     */
    async function loadAutoApproveSetting() {
        const toggle = document.getElementById('autoApproveToggle');
        const hint = document.getElementById('toggleHint');

        if (!toggle) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/v2/balance-history/settings/auto-approve`);
            const data = await response.json();

            if (data.success) {
                toggle.checked = data.enabled;
                updateToggleHint(data.enabled);
            }
        } catch (error) {
            console.error('[ACCOUNTANT] Failed to load auto-approve setting:', error);
            if (hint) {
                hint.textContent = 'Lỗi tải cài đặt';
                hint.style.color = 'var(--danger)';
            }
        }
    }

    /**
     * Toggle auto-approve setting
     */
    async function toggleAutoApprove(enabled) {
        const toggle = document.getElementById('autoApproveToggle');
        const hint = document.getElementById('toggleHint');

        if (hint) {
            hint.textContent = 'Đang lưu...';
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/v2/balance-history/settings/auto-approve`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ enabled })
            });

            const data = await response.json();

            if (data.success) {
                updateToggleHint(enabled);

                // Show notification
                if (window.notificationManager) {
                    window.notificationManager.show(
                        enabled ? 'Đã BẬT tự động duyệt giao dịch auto-match' : 'Đã TẮT tự động duyệt - Tất cả giao dịch cần kế toán duyệt',
                        enabled ? 'info' : 'warning',
                        3000
                    );
                }
            } else {
                throw new Error(data.error || 'Unknown error');
            }
        } catch (error) {
            console.error('[ACCOUNTANT] Failed to toggle auto-approve:', error);

            // Revert toggle
            if (toggle) {
                toggle.checked = !enabled;
            }

            if (hint) {
                hint.textContent = 'Lỗi lưu cài đặt';
                hint.style.color = 'var(--danger)';
            }

            if (window.notificationManager) {
                window.notificationManager.show('Lỗi lưu cài đặt: ' + error.message, 'error', 3000);
            }
        }
    }

    /**
     * Update toggle hint text
     */
    function updateToggleHint(enabled) {
        const hint = document.getElementById('toggleHint');
        if (hint) {
            if (enabled) {
                hint.textContent = 'BẬT: Giao dịch auto-match tự động cộng ví';
                hint.style.color = 'var(--success)';
            } else {
                hint.textContent = 'TẮT: Tất cả giao dịch cần kế toán duyệt';
                hint.style.color = 'var(--warning)';
            }
        }
    }

    // =====================================================
    // PUBLIC API
    // =====================================================

    window.AccountantModule = {
        init,
        switchSubTab,
        loadDashboardStats,
        loadPendingQueue,
        loadApprovedToday,
        loadAdjustmentsToday,
        approve,
        bulkApprove,
        showRejectModal,
        confirmReject,
        showChangeModal,
        lookupCustomerForChange,
        confirmChange,
        toggleSelect,
        changePage,
        stopAutoRefresh,
        setFilterPreset,
        handleFilterChange,
        // Approve modal functions
        showApproveModal,
        confirmApprove,
        clearApproveImage
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOM already loaded, but wait a tick for other scripts
        setTimeout(init, 100);
    }

})();
