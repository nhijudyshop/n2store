// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * KPI Commission Tab - Tab "KPI - HOA HỒNG"
 * Quản lý và hiển thị KPI upselling sản phẩm
 *
 * Runs inside iframe (tab-kpi-commission.html)
 * Uses namespace pattern to avoid conflicts
 * Firebase initialized via firebase-config.js in HTML
 *
 * Firestore Collections:
 * - kpi_statistics/{userId}/dates/{date}
 * - kpi_audit_log/{auto-id}
 * - kpi_base/{orderId}
 * - report_order_details/{campaignName}
 */

const KPICommission = {
    // ========================================
    // STATE MANAGEMENT (12.1)
    // ========================================
    state: {
        filters: {
            campaign: '',
            employee: '',
            dateFrom: '',
            dateTo: '',
            status: '',
        },
        statsData: [], // Raw kpi_statistics data [{userId, userName, dates: {...}}]
        filteredData: [], // Filtered + aggregated data for display
        currentEmployeeOrders: [], // Orders for Modal L1
        currentOrderId: null, // Current order in Modal L2
        currentEmployeeUserId: null,
        isLoading: false,
        employeeNameCache: {}, // Cache for resolved employee names (Bug #4 fix)
        // 'simple' = chỉ hiển thị đơn/user có KPI > 0 (default, hành vi cũ).
        // 'full'   = hiển thị TẤT CẢ đơn gồm cả đơn chưa tick KPI (KPI = 0).
        // Persist localStorage per-user để giữ giữa session.
        displayMode: (() => {
            try {
                return localStorage.getItem('kpiDisplayMode') || 'simple';
            } catch (e) {
                return 'simple';
            }
        })(),
    },

    KPI_PER_PRODUCT: 5000,

    // ========================================
    // HELPERS
    // ========================================
    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN').format(amount || 0) + 'đ';
    },

    formatTimestamp(ts) {
        if (!ts) return '---';
        let date;
        if (ts.toDate && typeof ts.toDate === 'function') {
            date = ts.toDate();
        } else if (ts.seconds) {
            date = new Date(ts.seconds * 1000);
        } else if (ts instanceof Date) {
            date = ts;
        } else {
            date = new Date(ts);
        }
        if (isNaN(date.getTime())) return '---';
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    reinitIcons() {
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    getDb() {
        if (window.firebase && window.firebase.firestore) {
            return window.firebase.firestore();
        }
        return null;
    },

    showEl(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
    },

    hideEl(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    },

    getSourceBadge(source) {
        const chatSources = ['chat_confirm_held', 'chat_decrease', 'chat_from_dropped'];
        const mergeSources = ['merge'];
        if (chatSources.includes(source)) {
            return `<span class="source-badge source-chat">${this.escapeHtml(source)}</span>`;
        }
        if (mergeSources.includes(source)) {
            return `<span class="source-badge source-merge">${this.escapeHtml(source)}</span>`;
        }
        return `<span class="source-badge source-non-chat">${this.escapeHtml(source)}</span>`;
    },

    getActionClass(action) {
        if (action === 'add') return 'action-add';
        if (action === 'remove') return 'action-remove';
        if (action === 'merge') return 'action-merge';
        return '';
    },

    getActionLabel(action) {
        if (action === 'add') return '+ Thêm';
        if (action === 'remove') return '− Xóa';
        if (action === 'merge') return '⇄ Merge';
        return action || '';
    },

    // ========================================
    // EMPLOYEE NAME RESOLUTION (20.1 - Bug #4 fix)
    // ========================================
    /**
     * Resolve employee name from multiple sources with caching.
     * Priority: kpi_statistics → kpi_base → employee_ranges → users → fallback
     * Never returns raw userId alone.
     * @param {string} userId
     * @returns {Promise<string>} resolved display name
     */
    async resolveEmployeeName(userId) {
        if (!userId) return 'Không xác định';
        if (userId === 'unassigned') {
            this.state.employeeNameCache[userId] = 'Chưa phân công';
            return 'Chưa phân công';
        }
        if (this.state.employeeNameCache[userId]) {
            return this.state.employeeNameCache[userId];
        }

        let name = null;

        // Source 1: statsData (already loaded from PostgreSQL)
        for (const stat of this.state.statsData) {
            if (stat.userId === userId && stat.userName && stat.userName !== userId) {
                name = stat.userName;
                break;
            }
        }

        // Source 2: employee_ranges (Firebase settings - admin panel)
        if (!name) {
            const db = this.getDb();
            if (db) {
                try {
                    const rangesDoc = await db.collection('settings').doc('employee_ranges').get();
                    if (rangesDoc.exists) {
                        const ranges = rangesDoc.data().ranges || [];
                        const found = ranges.find((r) => (r.userId || r.id) === userId);
                        if (found) name = found.userName || found.name || null;
                    }
                } catch (e) {}
            }
        }

        // Source 3: admin pattern
        if (!name && userId.startsWith('user_admin_')) name = 'Administrator';

        // Fallback
        if (!name) name = `Nhân viên (${userId})`;

        this.state.employeeNameCache[userId] = name;
        return name;
    },

    // ========================================
    // BATCH RESOLVE EMPLOYEE NAMES (Performance optimization)
    // ========================================
    /**
     * Resolve employee names in batch to avoid N+1 Firestore queries.
     * Loads employee_ranges once, then batch queries kpi_base and users.
     * @param {string[]} userIds - array of unique user IDs
     */
    async batchResolveEmployeeNames(userIds) {
        if (!userIds || userIds.length === 0) return;

        // Special cases
        for (const uid of userIds) {
            if (uid === 'unassigned') this.state.employeeNameCache[uid] = 'Chưa phân công';
            else if (uid.startsWith('user_admin_'))
                this.state.employeeNameCache[uid] = 'Administrator';
        }

        const unresolved = userIds.filter((id) => !this.state.employeeNameCache[id]);
        if (unresolved.length === 0) return;

        // Source 1: statsData (already from PostgreSQL)
        for (const uid of unresolved) {
            for (const stat of this.state.statsData) {
                if (stat.userId === uid && stat.userName && stat.userName !== uid) {
                    this.state.employeeNameCache[uid] = stat.userName;
                    break;
                }
            }
        }

        // Source 2: employee_ranges (Firebase settings - admin panel)
        let stillUnresolved = unresolved.filter((id) => !this.state.employeeNameCache[id]);
        if (stillUnresolved.length > 0) {
            const db = this.getDb();
            if (db) {
                try {
                    const rangesDoc = await db.collection('settings').doc('employee_ranges').get();
                    if (rangesDoc.exists) {
                        const ranges = rangesDoc.data().ranges || [];
                        for (const uid of stillUnresolved) {
                            const found = ranges.find((r) => (r.userId || r.id) === uid);
                            if (found) {
                                const name = found.userName || found.name;
                                if (name) this.state.employeeNameCache[uid] = name;
                            }
                        }
                    }
                } catch (e) {}
            }
        }

        // Fallback
        for (const uid of unresolved) {
            if (!this.state.employeeNameCache[uid]) {
                this.state.employeeNameCache[uid] = `Nhân viên (${uid})`;
            }
        }
    },

    // ========================================
    // STALE STATISTICS DETECTION (20.3 - Bug #4 fix)
    // ========================================
    /**
     * Detect stale statistics by checking BASE existence for each order.
     * Batch queries kpi_base in chunks of 10 (Firestore 'in' query limit).
     * Marks orders with missing BASE as _stale: true.
     * @param {Array} statsData - array of {userId, userName, dates: {...}}
     * @returns {Promise<Array>} statsData with stale markers
     */
    async detectStaleStatistics(statsData) {
        if (!statsData || statsData.length === 0) return statsData;
        const KPI_API = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime';

        // Collect all unique orderCodes from statistics
        const allOrderCodes = new Set();
        for (const stat of statsData) {
            for (const dateData of Object.values(stat.dates || {})) {
                for (const order of dateData.orders || []) {
                    if (order.orderCode) allOrderCodes.add(order.orderCode);
                }
            }
        }

        if (allOrderCodes.size === 0) return statsData;

        // Batch check BASE existence via REST API
        let existingBases = new Set();
        try {
            const res = await fetch(`${KPI_API}/kpi-base/check-exists`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderCodes: [...allOrderCodes] }),
            });
            if (res.ok) {
                const data = await res.json();
                existingBases = new Set(data.existing || []);
            }
        } catch (e) {
            console.warn('[KPI Tab] detectStaleStatistics: check-exists failed:', e.message);
        }

        // Mark stale orders (BASE missing)
        for (const stat of statsData) {
            for (const dateData of Object.values(stat.dates || {})) {
                for (const order of dateData.orders || []) {
                    if (order.orderCode && !existingBases.has(order.orderCode)) {
                        order._stale = true;
                        order._staleReason = 'BASE đã bị xóa';
                    }
                }
            }
        }

        return statsData;
    },

    // ========================================
    // EMPTY STATE (20.6 - Bug #4 fix)
    // ========================================
    /**
     * Display empty state message when kpi_statistics is empty.
     * Shows a user-friendly message instead of a blank table or error.
     */
    renderEmptyState() {
        this.hideEl('kpiTableLoading');
        this.hideEl('kpiTableWrapper');
        this.showEl('kpiTableEmpty');

        const emptyEl = document.getElementById('kpiTableEmpty');
        if (emptyEl) {
            const msgEl = emptyEl.querySelector('p');
            if (msgEl) {
                msgEl.textContent =
                    'Chưa có dữ liệu KPI. Dữ liệu sẽ xuất hiện sau khi gửi tin nhắn hàng loạt và nhân viên thao tác sản phẩm.';
            }
        }

        // Reset summary cards to zero
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        setVal('totalEmployees', '0');
        setVal('totalOrdersWithBase', '0');
        setVal('totalNetProducts', '0');
        setVal('totalKPIAmount', '0đ');
    },

    // ========================================
    // INIT (12.2)
    // ========================================
    async init() {
        try {
            this.state.isLoading = true;
            this.showEl('kpiTableLoading');
            this.hideEl('kpiTableEmpty');
            this.hideEl('kpiTableWrapper');

            // Load invoice status + KPI stats in parallel from Render API
            await Promise.all([this.loadInvoiceStatusData(), this.loadAllStatistics()]);
            // Derive filters from loaded data
            await this.loadCampaignOptions();
            await this.loadEmployeeOptions();

            // Auto-select campaign from parent window's active campaign
            this.syncCampaignFromParent();

            // Sync nút toggle mode với state đã khôi phục từ localStorage
            this.updateDisplayModeLabel();

            // Bind filter v2 (date presets, status chips, more menu) — sets default 30d
            this._bindFilterV2();

            await this.applyFilters();
            this.reinitIcons();
        } catch (error) {
            console.error('[KPI Tab] Init error:', error);
            this.hideEl('kpiTableLoading');
            this.showEl('kpiTableEmpty');
        } finally {
            this.state.isLoading = false;
        }
    },

    // ========================================
    // LOAD DATA FROM RENDER PostgreSQL
    // ========================================
    async loadAllStatistics() {
        const KPI_API = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime';

        try {
            const res = await fetch(`${KPI_API}/kpi-statistics`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const rows = data.statistics || [];

            if (rows.length === 0) {
                this.state.statsData = [];
                this.renderEmptyState();
                return;
            }

            // Group by userId → dates
            const userMap = {};
            for (const row of rows) {
                if (!userMap[row.userId]) {
                    userMap[row.userId] = {
                        userId: row.userId,
                        userName: row.userName || row.userId,
                        dates: {},
                    };
                }
                const dateKey =
                    typeof row.date === 'string' ? row.date.substring(0, 10) : String(row.date);
                userMap[row.userId].dates[dateKey] = {
                    totalNetProducts: row.totalNetProducts || 0,
                    totalKPI: row.totalKPI || 0,
                    orders: row.orders || [],
                };
                // Use userName from row if available
                if (row.userName && row.userName !== row.userId) {
                    userMap[row.userId].userName = row.userName;
                }
            }

            const allStats = Object.values(userMap);
            this.state.statsData = allStats;

            // Handle unassigned and admin display names
            for (const stat of allStats) {
                if (stat.userId === 'unassigned') {
                    stat.userName = 'Chưa phân công';
                } else if (stat.userId.startsWith('user_admin_') && stat.userName === stat.userId) {
                    stat.userName = 'Administrator';
                }
                this.state.employeeNameCache[stat.userId] = stat.userName;
            }

            // Detect stale statistics (BASE missing)
            await this.detectStaleStatistics(allStats);
        } catch (error) {
            console.error('[KPI Tab] Error loading statistics:', error);
        }
    },

    // ========================================
    // LOAD CAMPAIGN OPTIONS (12.3)
    // ========================================
    async loadCampaignOptions() {
        const select = document.getElementById('kpiFilterCampaign');
        if (!select) return;

        // Derive campaigns from loaded statsData
        const campaigns = new Set();
        for (const stat of this.state.statsData) {
            for (const dateData of Object.values(stat.dates || {})) {
                for (const order of dateData.orders || []) {
                    if (order.campaignName) campaigns.add(order.campaignName);
                }
            }
        }

        [...campaigns].sort().forEach((name) => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
    },

    // ========================================
    // SYNC CAMPAIGN FROM PARENT WINDOW
    // ========================================
    syncCampaignFromParent() {
        try {
            const parentCM = window.parent?.campaignManager;
            if (!parentCM?.activeCampaign) return;

            const activeName =
                parentCM.activeCampaign.name || parentCM.activeCampaign.displayName || '';
            if (!activeName) return;

            const select = document.getElementById('kpiFilterCampaign');
            if (!select) return;

            // Exact match first
            for (const opt of select.options) {
                if (opt.value === activeName) {
                    select.value = activeName;
                    console.log('[KPI Tab] Auto-selected campaign:', activeName);
                    return;
                }
            }

            // Partial match fallback (campaign name in KPI stats may differ slightly)
            const normalizedActive = activeName.trim().toLowerCase();
            for (const opt of select.options) {
                if (opt.value && opt.value.trim().toLowerCase() === normalizedActive) {
                    select.value = opt.value;
                    console.log('[KPI Tab] Auto-selected campaign (normalized):', opt.value);
                    return;
                }
            }

            console.warn('[KPI Tab] Active campaign not found in KPI data:', activeName);
        } catch (e) {
            // Cross-origin or iframe access error — silently ignore
        }
    },

    // ========================================
    // LOAD EMPLOYEE OPTIONS (12.3)
    // ========================================
    async loadEmployeeOptions() {
        const select = document.getElementById('kpiFilterEmployee');
        if (!select) return;

        try {
            // Use already-loaded statsData + cached names from batchResolve
            const employees = new Map();
            for (const stat of this.state.statsData) {
                const name =
                    this.state.employeeNameCache[stat.userId] || stat.userName || stat.userId;
                employees.set(stat.userId, name);
            }

            // Populate dropdown
            const sorted = [...employees.entries()].sort((a, b) => a[1].localeCompare(b[1]));
            sorted.forEach(([id, name]) => {
                const opt = document.createElement('option');
                opt.value = id;
                if (id === 'unassigned') {
                    opt.textContent = 'Chưa phân công';
                } else {
                    opt.textContent = name && name !== id ? name : id;
                }
                select.appendChild(opt);
            });
        } catch (error) {
            console.error('[KPI Tab] Error loading employees:', error);
        }
    },

    // ========================================
    // APPLY FILTERS (12.4)
    // ========================================
    /**
     * Toggle giữa 2 chế độ hiển thị:
     *   - 'simple' (default, strict): chỉ count SP đã tick (post-feature behavior).
     *   - 'full' (legacy): count MỌI SP qualify variants, bỏ qua sale flag
     *     (pre-feature behavior — như trước khi thêm checkbox).
     * Dashboard swap giữa order.kpi ↔ order.kpiLegacy ngay (dữ liệu đã persist).
     * Persist localStorage, re-apply filters + refresh detail modal (nếu đang mở).
     */
    toggleDisplayMode() {
        const next = this.state.displayMode === 'simple' ? 'full' : 'simple';
        this.state.displayMode = next;
        try {
            localStorage.setItem('kpiDisplayMode', next);
        } catch (e) {}
        this.updateDisplayModeLabel();
        // Re-apply filter + render với mode mới
        this.applyFilters();
        // Nếu modal chi tiết KPI (Modal L1) đang mở → re-render table theo mode mới
        const modalL1 = document.getElementById('modalEmployeeOrders');
        if (modalL1 && modalL1.style.display !== 'none' && this.state.currentEmployeeOrders) {
            this.filterEmployeeOrders();
        }
        // Nếu modal chi tiết đơn (Modal L2) đang mở trên tab "So sánh KPI" → re-render
        const modalL2 = document.getElementById('modalOrderDetails');
        if (modalL2 && modalL2.style.display !== 'none' && this.state.currentOrderId) {
            this.renderNetKPITab(this.state.currentOrderId);
        }
    },

    /** Update label + icon trên nút toggle dựa trên state hiện tại. */
    updateDisplayModeLabel() {
        const label = document.getElementById('displayModeLabel');
        const btn = document.getElementById('btnToggleDisplayMode');
        if (!label || !btn) return;
        if (this.state.displayMode === 'full') {
            label.textContent = 'Hiển thị đầy đủ';
            btn.title = 'Đang xem TẤT CẢ đơn (gồm cả chưa tick KPI). Click để chỉ xem đơn có KPI.';
        } else {
            label.textContent = 'Chỉ có KPI';
            btn.title = 'Đang ẩn đơn không có KPI. Click để xem đầy đủ (bao gồm đơn chưa tick).';
        }
    },

    async applyFilters() {
        // Read filter values — status từ chip, các value khác từ inputs
        this.state.filters.campaign =
            (document.getElementById('kpiFilterCampaign') || {}).value || '';
        this.state.filters.employee =
            (document.getElementById('kpiFilterEmployee') || {}).value || '';
        this.state.filters.dateFrom =
            (document.getElementById('kpiFilterDateFrom') || {}).value || '';
        this.state.filters.dateTo = (document.getElementById('kpiFilterDateTo') || {}).value || '';
        // Status đọc từ active chip (filter v2) thay vì select cũ
        const activeChip = document.querySelector('.kpi-status-chips .kpi-chip.is-active');
        this.state.filters.status = activeChip ? activeChip.dataset.status || '' : '';
        this._renderFiltersSummary();

        const { campaign, employee, dateFrom, dateTo, status } = this.state.filters;

        // Filter statsData
        let filtered = [];

        for (const stat of this.state.statsData) {
            // Filter by employee
            if (employee && stat.userId !== employee) continue;

            const employeeOrders = [];

            for (const [dateKey, dateData] of Object.entries(stat.dates)) {
                // Filter by date range
                if (dateFrom && dateKey < dateFrom) continue;
                if (dateTo && dateKey > dateTo) continue;

                const orders = dateData.orders || [];
                for (const order of orders) {
                    // Filter by campaign
                    if (campaign && order.campaignName !== campaign) continue;

                    // Filter by status
                    if (status === 'ok' && order.hasDiscrepancy) continue;
                    if (status === 'discrepancy' && !order.hasDiscrepancy) continue;

                    employeeOrders.push({
                        ...order,
                        date: dateKey,
                    });
                }
            }

            if (employeeOrders.length > 0) {
                filtered.push({
                    userId: stat.userId,
                    userName: stat.userName || stat.userId,
                    orders: employeeOrders,
                });
            }
        }

        this.state.filteredData = filtered;

        // Update UI
        this.updateSummaryCards(filtered);
        await this.renderKPITable(filtered);
    },

    // ========================================
    // UPDATE SUMMARY CARDS (12.5)
    // ========================================
    updateSummaryCards(filteredData) {
        let totalEmployees = 0;
        let totalOrders = 0;
        let totalNet = 0;
        let totalKPI = 0;

        const fullMode = this.state.displayMode === 'full';

        for (const emp of filteredData) {
            let empHasValidOrders = false;
            for (const order of emp.orders) {
                // Exclude stale orders regardless of mode.
                if (order._stale) continue;
                // Simple mode: bỏ qua đơn KPI = 0. Full mode: đếm hết.
                const hasKpi = (order.netProducts || 0) > 0 || (order.kpi || 0) > 0;
                if (!fullMode && !hasKpi) continue;
                empHasValidOrders = true;
                totalOrders++;
                totalNet += order.netProducts || 0;
                totalKPI += order.kpi || 0;
            }
            if (empHasValidOrders) totalEmployees++;
        }

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setVal('totalEmployees', totalEmployees);
        setVal('totalOrdersWithBase', totalOrders);
        setVal('totalNetProducts', totalNet);
        setVal('totalKPIAmount', this.formatCurrency(totalKPI));
    },

    // ========================================
    // INVOICE STATUS — self-contained, fetches from Render API directly
    // ========================================

    // ShowState display config (mirrors Tab 1)
    _SHOW_STATE_CONFIG: {
        Nháp: { color: '#6c757d', bgColor: '#f3f4f6', borderColor: '#d1d5db' },
        'Đã xác nhận': { color: '#2563eb', bgColor: '#dbeafe', borderColor: '#93c5fd' },
        'Huỷ bỏ': {
            color: '#dc2626',
            bgColor: '#fee2e2',
            borderColor: '#fca5a5',
            style: 'text-decoration: line-through;',
        },
        'Đã thanh toán': { color: '#059669', bgColor: '#d1fae5', borderColor: '#6ee7b7' },
        'Hoàn thành': { color: '#059669', bgColor: '#d1fae5', borderColor: '#6ee7b7' },
    },
    _STATE_CODE_CONFIG: {
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
    },

    // Invoice data cache: SaleOnlineId → latest invoice object
    _invoiceCache: new Map(),
    _invoiceCacheLoaded: false,

    /**
     * Load invoice status data directly from Render API.
     * Builds a Map of SaleOnlineId → latest invoice entry.
     */
    async loadInvoiceStatusData() {
        if (this._invoiceCacheLoaded) return;
        try {
            const apiBase =
                (window.API_CONFIG?.WORKER_URL ||
                    'https://chatomni-proxy.nhijudyshop.workers.dev') + '/api/invoice-status';
            const response = await fetch(`${apiBase}/load`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Load failed');

            // Group by SaleOnlineId, keep latest by timestamp
            const latestMap = new Map();
            for (const row of result.entries || []) {
                const soId = row.sale_online_id;
                if (!soId) continue;
                const ts = parseInt(row.entry_timestamp) || 0;
                const existing = latestMap.get(soId);
                if (!existing || ts > existing._ts) {
                    latestMap.set(soId, {
                        SaleOnlineId: soId,
                        Id: row.tpos_id,
                        Number: row.number,
                        Reference: row.reference,
                        ShowState: row.show_state,
                        StateCode: row.state_code,
                        IsMergeCancel: row.is_merge_cancel,
                        UserName: row.user_name,
                        CarrierName: row.carrier_name,
                        DateInvoice: row.date_invoice,
                        _ts: ts,
                    });
                }
            }
            this._invoiceCache = latestMap;
            this._invoiceCacheLoaded = true;
            console.log(`[KPI] Loaded ${latestMap.size} invoice entries`);
        } catch (e) {
            console.error('[KPI] Failed to load invoice status:', e);
        }
    },

    _getShowStateConfig(showState) {
        return (
            this._SHOW_STATE_CONFIG[showState] || {
                color: '#6c757d',
                bgColor: '#f3f4f6',
                borderColor: '#d1d5db',
            }
        );
    },

    _getStateCodeConfig(stateCode, isMergeCancel) {
        if (isMergeCancel) return this._STATE_CODE_CONFIG.IsMergeCancel;
        return this._STATE_CODE_CONFIG[stateCode] || this._STATE_CODE_CONFIG.None;
    },

    /**
     * Phiếu TPOS có bị hủy không? (cả Huỷ bỏ thường lẫn IsMergeCancel/state=cancel).
     * Đơn có invoice hủy KHÔNG được tính KPI (giống đơn refund).
     * @param {object|null|undefined} invoice
     * @returns {boolean}
     */
    _isInvoiceCancelled(invoice) {
        if (!invoice) return false;
        const showState = invoice.ShowState || '';
        const stateCode = invoice.StateCode || '';
        return (
            invoice.State === 'cancel' ||
            stateCode === 'cancel' ||
            invoice.IsMergeCancel === true ||
            showState === 'Huỷ bỏ' ||
            showState === 'Hủy bỏ'
        );
    },

    /**
     * Đơn có bị loại khỏi KPI không? Trả về 'refund' | 'cancel' | null.
     * Truyền vào `recon` từ _reconByOrder (có thể null khi chưa chạy đối soát).
     * Đối với 'cancel' — phát hiện ngay từ invoice cache, không cần recon.
     */
    _getKpiExclusionKind(orderId, recon) {
        if (recon?.isRefunded) return 'refund';
        const invoice = this._invoiceCache?.get(orderId);
        if (this._isInvoiceCancelled(invoice)) return 'cancel';
        return null;
    },

    /**
     * Render invoice status cell for a single order in KPI tab.
     * @param {string} orderId - SaleOnlineId
     * @returns {string} HTML string
     */
    renderKPIInvoiceStatusCell(orderId) {
        const invoiceData = this._invoiceCache.get(orderId);
        if (!invoiceData) {
            return '<span style="color: #9ca3af;">−</span>';
        }

        const showState = invoiceData.ShowState || '';
        const stateCode = invoiceData.StateCode || 'None';
        const isMergeCancel = invoiceData.IsMergeCancel === true;
        const showStateConfig = this._getShowStateConfig(showState);
        const stateCodeConfig = this._getStateCodeConfig(stateCode, isMergeCancel);
        const stateCodeStyle = stateCodeConfig.style || '';

        let html = '<div style="display: flex; flex-direction: column; gap: 2px;">';

        // Row 1: ShowState badge + UserName + Invoice Number
        html += '<div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">';

        if (showState) {
            const showStateStyle = showStateConfig.style || '';
            html += `<span style="background: ${showStateConfig.bgColor}; color: ${showStateConfig.color}; border: 1px solid ${showStateConfig.borderColor}; font-size: 11px; padding: 1px 6px; border-radius: 4px; font-weight: 500; ${showStateStyle}" title="Số phiếu: ${invoiceData.Number || ''}">${showState}</span>`;
        }

        if (invoiceData.UserName) {
            html += `<span style="background: #e0e7ff; color: #4338ca; font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 500;" title="Người tạo bill">${invoiceData.UserName}</span>`;
        }

        if (invoiceData.Number) {
            const shortNum = invoiceData.Number.replace(/^NJD\//, '');
            html += `<span style="background: #f0f9ff; color: #0369a1; font-size: 9px; padding: 1px 4px; border-radius: 3px; font-weight: 500; border: 1px solid #bae6fd; cursor: pointer;" onclick="navigator.clipboard.writeText('${invoiceData.Number.replace(/'/g, "\\'")}'); event.stopPropagation();" title="Click để copy mã phiếu">${shortNum}</span>`;
        }

        html += '</div>';

        // Row 2: StateCode text
        html += `<div style="font-size: 11px; color: ${stateCodeConfig.color}; ${stateCodeStyle}">${stateCodeConfig.label}</div>`;

        // Row 3: DateInvoice
        if (invoiceData.DateInvoice) {
            const d = new Date(invoiceData.DateInvoice);
            if (!isNaN(d.getTime())) {
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const hh = String(d.getHours()).padStart(2, '0');
                const mi = String(d.getMinutes()).padStart(2, '0');
                html += `<div style="font-size: 10px; color: #6b7280;" title="${d.toLocaleString('vi-VN')}">${dd}/${mm} ${hh}:${mi}</div>`;
            }
        }

        html += '</div>';
        return html;
    },

    /**
     * Render aggregate invoice status summary for employee row.
     * Shows count badges by ShowState: "120 Đã TT | 5 Đã XN | 2 Hủy | 3 −"
     * @param {Array} orders - Array of order objects for this employee
     * @returns {string} HTML string
     */
    renderKPIInvoiceStatusSummary(orders) {
        if (!orders || orders.length === 0) {
            return '<span style="color: #9ca3af;">−</span>';
        }

        // Count orders by ShowState
        const counts = {};
        let noInvoice = 0;

        for (const order of orders) {
            const invoiceData = this._invoiceCache.get(order.orderId);
            if (!invoiceData) {
                noInvoice++;
                continue;
            }
            const state = invoiceData.ShowState || 'Không rõ';
            counts[state] = (counts[state] || 0) + 1;
        }

        // Build badges in priority order
        const stateOrder = ['Đã thanh toán', 'Đã xác nhận', 'Nháp', 'Huỷ bỏ'];
        const shortLabels = {
            'Đã thanh toán': 'Đã TT',
            'Đã xác nhận': 'Đã XN',
            Nháp: 'Nháp',
            'Huỷ bỏ': 'Hủy',
            'Hoàn thành': 'HT',
        };

        let html = '<div style="display:flex; flex-wrap:wrap; gap:3px;">';

        for (const state of stateOrder) {
            if (!counts[state]) continue;
            const cfg = this._getShowStateConfig(state);
            const label = shortLabels[state] || state;
            const style = cfg.style || '';
            html += `<span style="background:${cfg.bgColor};color:${cfg.color};border:1px solid ${cfg.borderColor};font-size:10px;padding:1px 5px;border-radius:3px;font-weight:500;${style}">${counts[state]} ${label}</span>`;
            delete counts[state];
        }

        // Any remaining states not in stateOrder
        for (const [state, count] of Object.entries(counts)) {
            const cfg = this._getShowStateConfig(state);
            const label = shortLabels[state] || state;
            const style = cfg?.style || '';
            html += `<span style="background:${cfg?.bgColor || '#f3f4f6'};color:${cfg?.color || '#6c757d'};border:1px solid ${cfg?.borderColor || '#d1d5db'};font-size:10px;padding:1px 5px;border-radius:3px;font-weight:500;${style}">${count} ${label}</span>`;
        }

        if (noInvoice > 0) {
            html += `<span style="background:#f3f4f6;color:#9ca3af;font-size:10px;padding:1px 5px;border-radius:3px;font-weight:500;">${noInvoice} −</span>`;
        }

        html += '</div>';
        return html;
    },

    // ========================================
    // INVOICE DETAIL MODAL — click số phiếu xem chi tiết
    // ========================================

    async showInvoiceDetail(invoiceId, invoiceNumber) {
        // Tạo modal nếu chưa có
        let modal = document.getElementById('invoiceDetailModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'invoiceDetailModal';
            modal.className = 'modal-overlay invoice-detail-modal';
            modal.innerHTML = `
                <div class="modal-container invoice-detail-container">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            <i data-lucide="receipt"></i>
                            Chi tiết phiếu <span id="invDetailNumber">—</span>
                        </h3>
                        <div class="invoice-detail-actions">
                            <a href="#" target="_blank" id="invDetailTposLink" class="kpi-icon-btn" title="Mở trên TPOS">
                                <i data-lucide="external-link"></i> TPOS
                            </a>
                            <button class="modal-close" onclick="document.getElementById('invoiceDetailModal').style.display='none'">
                                <i data-lucide="x"></i>
                            </button>
                        </div>
                    </div>
                    <div class="modal-body invoice-detail-body" id="invDetailBody">
                        <div class="loading-state"><div class="spinner"></div><p>Đang tải...</p></div>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            // Click outside to close
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.style.display = 'none';
            });
        }
        modal.style.display = 'flex';
        document.getElementById('invDetailNumber').textContent = invoiceNumber || '—';
        const tposLink = document.getElementById('invDetailTposLink');
        if (tposLink && invoiceId) {
            tposLink.href = `https://tomato.tpos.vn/#/app/fastsaleorder/${invoiceId}`;
        }
        const body = document.getElementById('invDetailBody');
        if (body)
            body.innerHTML =
                '<div class="loading-state"><div class="spinner"></div><p>Đang tải chi tiết phiếu...</p></div>';
        if (window.lucide?.createIcons) window.lucide.createIcons();

        if (!invoiceId) {
            if (body)
                body.innerHTML =
                    '<div class="empty-state"><p>Phiếu không có ID — không thể tải chi tiết.</p></div>';
            return;
        }

        try {
            const data = await this._fetchInvoiceDetail(invoiceId);
            if (!data) {
                if (body)
                    body.innerHTML =
                        '<div class="empty-state"><p>Không tải được chi tiết phiếu từ TPOS.</p></div>';
                return;
            }
            this._renderInvoiceDetail(body, data);
        } catch (e) {
            console.warn('[KPI Tab] Invoice detail fetch failed:', e?.message);
            if (body)
                body.innerHTML = `<div class="empty-state"><p>Lỗi: ${this.escapeHtml(e.message || '')}</p></div>`;
        }
    },

    async _fetchInvoiceDetail(invoiceId) {
        if (!this._invoiceDetailCache) this._invoiceDetailCache = new Map();
        if (this._invoiceDetailCache.has(invoiceId)) {
            return this._invoiceDetailCache.get(invoiceId);
        }
        const WORKER =
            window.API_CONFIG?.WORKER_URL ||
            window.parent?.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev';
        let authHeader;
        const tokenManager = window.tokenManager || window.parent?.tokenManager;
        if (tokenManager?.getAuthHeader) {
            authHeader = await tokenManager.getAuthHeader();
        } else {
            // Fallback to /api/token
            const companyId =
                window.ShopConfig?.getConfig?.()?.CompanyId ||
                window.parent?.ShopConfig?.getConfig?.()?.CompanyId ||
                1;
            const creds =
                companyId === 2
                    ? {
                          grant_type: 'password',
                          username: 'nvktshop1',
                          password: 'Aa@28612345678',
                          client_id: 'tmtWebApp',
                      }
                    : {
                          grant_type: 'password',
                          username: 'nvktlive1',
                          password: 'Aa@28612345678',
                          client_id: 'tmtWebApp',
                      };
            const formData = new URLSearchParams();
            for (const [k, v] of Object.entries(creds)) formData.append(k, v);
            const tokenRes = await fetch(`${WORKER}/api/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString(),
            });
            const tokenData = await tokenRes.json();
            authHeader = { Authorization: `Bearer ${tokenData.access_token}` };
        }
        const res = await fetch(
            `${WORKER}/api/odata/FastSaleOrder(${invoiceId})?$expand=OrderLines,Partner,User`,
            {
                headers: {
                    ...authHeader,
                    accept: 'application/json',
                    'feature-version': '2',
                    'x-tpos-lang': 'vi',
                },
            }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        this._invoiceDetailCache.set(invoiceId, data);
        return data;
    },

    _renderInvoiceDetail(container, data) {
        if (!container) return;
        const fmt = (n) => (n || 0).toLocaleString('vi-VN') + ' ₫';
        const date = data.DateInvoice ? new Date(data.DateInvoice).toLocaleString('vi-VN') : '—';
        const lines = data.OrderLines || [];
        const totalQty = lines.reduce((s, l) => s + (l.Quantity || 0), 0);

        const linesHtml = lines.length
            ? `<table class="inv-detail-items">
                <thead>
                    <tr>
                        <th>Sản phẩm</th>
                        <th>Mã</th>
                        <th>SL</th>
                        <th>Đơn giá</th>
                        <th>Thành tiền</th>
                    </tr>
                </thead>
                <tbody>
                    ${lines
                        .map(
                            (l) => `<tr>
                        <td>${this.escapeHtml(l.ProductName || l.ProductNameGet || l.Name || '—')}</td>
                        <td><code>${this.escapeHtml(l.ProductCode || '—')}</code></td>
                        <td class="num">${l.Quantity || 0}</td>
                        <td class="num">${fmt(l.Price)}</td>
                        <td class="num"><strong>${fmt(l.PriceSubTotal || (l.Price || 0) * (l.Quantity || 0))}</strong></td>
                    </tr>`
                        )
                        .join('')}
                </tbody>
            </table>`
            : '<div class="empty-state"><p>Phiếu không có dòng sản phẩm.</p></div>';

        container.innerHTML = `
            <div class="inv-detail-grid">
                <div class="inv-detail-card">
                    <div class="inv-detail-label">Số phiếu</div>
                    <div class="inv-detail-value"><strong>${this.escapeHtml(data.Number || '')}</strong></div>
                </div>
                <div class="inv-detail-card">
                    <div class="inv-detail-label">Ngày lập</div>
                    <div class="inv-detail-value">${this.escapeHtml(date)}</div>
                </div>
                <div class="inv-detail-card">
                    <div class="inv-detail-label">Trạng thái</div>
                    <div class="inv-detail-value">${this.escapeHtml(data.ShowState || data.State || '—')}</div>
                </div>
                <div class="inv-detail-card">
                    <div class="inv-detail-label">Khách hàng</div>
                    <div class="inv-detail-value">${this.escapeHtml(data.PartnerDisplayName || data.Partner?.Name || '—')}<br><small>${this.escapeHtml(data.Phone || data.Partner?.Phone || '')}</small></div>
                </div>
                <div class="inv-detail-card">
                    <div class="inv-detail-label">SĐT giao hàng</div>
                    <div class="inv-detail-value">${this.escapeHtml(data.Phone || '—')}</div>
                </div>
                <div class="inv-detail-card">
                    <div class="inv-detail-label">Địa chỉ</div>
                    <div class="inv-detail-value">${this.escapeHtml(data.Address || data.FullAddress || '—')}</div>
                </div>
                <div class="inv-detail-card">
                    <div class="inv-detail-label">NV bán</div>
                    <div class="inv-detail-value">${this.escapeHtml(data.UserName || data.User?.Name || '—')}</div>
                </div>
                <div class="inv-detail-card inv-detail-total">
                    <div class="inv-detail-label">Tổng tiền</div>
                    <div class="inv-detail-value"><strong>${fmt(data.AmountTotal)}</strong></div>
                </div>
            </div>
            ${data.Comment || data.Note ? `<div class="inv-detail-note"><strong>Ghi chú:</strong> ${this.escapeHtml(data.Comment || data.Note)}</div>` : ''}
            <h4 class="inv-detail-section-title"><i data-lucide="package"></i> Sản phẩm (${lines.length} loại, ${totalQty} SP)</h4>
            ${linesHtml}
        `;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    },

    // ========================================
    // FILTER BAR V2 — date presets, status chips, more menu
    // ========================================

    _formatDateForInput(d) {
        const yy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yy}-${mm}-${dd}`;
    },

    _applyDatePreset(preset) {
        const fromEl = document.getElementById('kpiFilterDateFrom');
        const toEl = document.getElementById('kpiFilterDateTo');
        const customWrap = document.getElementById('kpiDateCustom');
        if (!fromEl || !toEl) return;
        const today = new Date();
        const setRange = (from, to) => {
            fromEl.value = this._formatDateForInput(from);
            toEl.value = this._formatDateForInput(to);
        };
        if (preset === 'today') {
            setRange(today, today);
            if (customWrap) customWrap.style.display = 'none';
        } else if (preset === '7d') {
            const from = new Date(today);
            from.setDate(from.getDate() - 6);
            setRange(from, today);
            if (customWrap) customWrap.style.display = 'none';
        } else if (preset === '30d') {
            const from = new Date(today);
            from.setDate(from.getDate() - 29);
            setRange(from, today);
            if (customWrap) customWrap.style.display = 'none';
        } else if (preset === 'thismonth') {
            const from = new Date(today.getFullYear(), today.getMonth(), 1);
            setRange(from, today);
            if (customWrap) customWrap.style.display = 'none';
        } else if (preset === 'custom') {
            if (customWrap) customWrap.style.display = '';
        }
    },

    _bindFilterV2() {
        if (this.__filterV2Bound) return;
        this.__filterV2Bound = true;

        // Date preset buttons
        document.querySelectorAll('.kpi-preset-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                document
                    .querySelectorAll('.kpi-preset-btn')
                    .forEach((b) => b.classList.toggle('is-active', b === btn));
                const preset = btn.dataset.preset;
                this._applyDatePreset(preset);
                if (preset !== 'custom') {
                    this.applyFilters();
                }
            });
        });

        // Status chips
        document.querySelectorAll('.kpi-status-chips .kpi-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                document
                    .querySelectorAll('.kpi-status-chips .kpi-chip')
                    .forEach((c) => c.classList.toggle('is-active', c === chip));
                this.applyFilters();
            });
        });

        // Auto-apply on date inputs change
        ['kpiFilterDateFrom', 'kpiFilterDateTo'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => this.applyFilters());
            }
        });
        // Auto-apply on campaign / employee change
        ['kpiFilterCampaign', 'kpiFilterEmployee'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => this.applyFilters());
            }
        });

        // More actions menu
        const moreBtn = document.getElementById('btnKpiMoreActions');
        const moreMenu = document.getElementById('kpiMoreMenu');
        if (moreBtn && moreMenu) {
            moreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                moreMenu.classList.toggle('is-open');
            });
            document.addEventListener('click', () => {
                moreMenu.classList.remove('is-open');
            });
            moreMenu.addEventListener('click', (e) => e.stopPropagation());
        }

        // Apply initial preset (30d)
        this._applyDatePreset('30d');
    },

    _renderFiltersSummary() {
        const el = document.getElementById('kpiFiltersSummary');
        if (!el) return;
        const parts = [];
        const f = this.state.filters || {};
        if (f.dateFrom && f.dateTo) {
            parts.push(`📅 ${f.dateFrom} → ${f.dateTo}`);
        }
        if (f.campaign) parts.push(`🎯 ${f.campaign}`);
        if (f.employee) {
            const empSel = document.getElementById('kpiFilterEmployee');
            const label = empSel?.options[empSel.selectedIndex]?.text || f.employee;
            parts.push(`👤 ${label}`);
        }
        if (f.status) parts.push(f.status === 'ok' ? '✓ OK' : '⚠ Sai lệch');
        el.textContent = parts.length ? 'Filter: ' + parts.join(' · ') : '';
    },

    // ========================================
    // LEADERBOARD + HERO HELPERS (redesign)
    // ========================================

    _initials(name) {
        const parts = String(name || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
        if (parts.length === 0) return '?';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    },

    _avatarColor(seed) {
        const palette = [
            'linear-gradient(135deg, #6366f1, #ec4899)',
            'linear-gradient(135deg, #06b6d4, #3b82f6)',
            'linear-gradient(135deg, #f59e0b, #ef4444)',
            'linear-gradient(135deg, #10b981, #14b8a6)',
            'linear-gradient(135deg, #8b5cf6, #d946ef)',
            'linear-gradient(135deg, #ec4899, #f97316)',
        ];
        let hash = 0;
        for (let i = 0; i < (seed || '').length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
        return palette[hash % palette.length];
    },

    _renderLeaderboard(aggregated) {
        const wrap = document.getElementById('kpiLeaderboardWrapper');
        if (!wrap) return;
        if (!aggregated || aggregated.length === 0) {
            wrap.innerHTML = '';
            return;
        }
        const reconRan = !!(this._reconKpiLossByUser && this._reconKpiLossByUser.size > 0);
        const fullMode = this.state.displayMode === 'full';
        const maxNetKpi = aggregated.reduce((max, e) => {
            const loss = (this._reconKpiLossByUser?.get(e.userId) || {}).kpiLost || 0;
            return Math.max(max, e.totalKPI - loss);
        }, 0);
        let html = '';
        aggregated.forEach((emp, idx) => {
            const rank = idx + 1;
            let rankCls = '';
            if (rank === 1) rankCls = 'is-gold';
            else if (rank === 2) rankCls = 'is-silver';
            else if (rank === 3) rankCls = 'is-bronze';
            const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

            const orderCount = emp.orders.filter((o) => {
                if (o._stale) return false;
                if (fullMode) return true;
                return (o.netProducts || 0) > 0 || (o.kpi || 0) > 0;
            }).length;

            const lossInfo = this._reconKpiLossByUser?.get(emp.userId) || {
                kpiLost: 0,
                refundCount: 0,
            };
            const kpiNet = emp.totalKPI - lossInfo.kpiLost;
            const netPct = maxNetKpi > 0 ? Math.max(2, Math.round((kpiNet / maxNetKpi) * 100)) : 2;
            const lossPct =
                emp.totalKPI > 0 ? Math.round((lossInfo.kpiLost / emp.totalKPI) * 100) : 0;

            const initials = this._initials(emp.resolvedName);
            const avatarBg = this._avatarColor(emp.userId || emp.resolvedName);

            const refundBadge =
                reconRan && lossInfo.refundCount > 0
                    ? `<span class="lb-emp-refund-badge"><i data-lucide="undo-2"></i>${lossInfo.refundCount} hoàn</span>`
                    : '';

            html += `<div class="lb-row" onclick="window.KPICommission.showEmployeeOrders('${this.escapeHtml(emp.userId)}')" tabindex="0" role="button">
                <div class="lb-rank ${rankCls}" title="Hạng ${rank}">${rankIcon}</div>
                <div class="lb-employee">
                    <div class="lb-emp-info">
                        <div class="lb-emp-name">${this.escapeHtml(emp.resolvedName)}</div>
                        <div class="lb-emp-meta">
                            <span class="lb-emp-meta-item"><i data-lucide="package"></i>${orderCount} đơn</span>
                            <span class="lb-emp-meta-item"><i data-lucide="layers"></i>${emp.totalNetProducts} SP NET</span>
                            ${refundBadge}
                        </div>
                    </div>
                </div>
                <div class="lb-kpi-bar-wrap">
                    <div class="lb-kpi-bar-label">
                        <span>KPI thực</span>
                        <span class="lb-kpi-bar-pct">${maxNetKpi > 0 ? Math.round((kpiNet / maxNetKpi) * 100) : 0}%</span>
                    </div>
                    <div class="lb-kpi-bar">
                        <div class="lb-kpi-bar-net" style="width:${netPct}%;"></div>
                        ${lossInfo.kpiLost > 0 ? `<div class="lb-kpi-bar-loss" style="left:${netPct}%;width:${Math.min(lossPct, 100 - netPct)}%;" title="Bị loại do refund: ${this.formatCurrency(lossInfo.kpiLost)}"></div>` : ''}
                    </div>
                </div>
                <div class="lb-kpi-amount">
                    <div class="lb-kpi-amount-net">${this.formatCurrency(kpiNet)}</div>
                    <div class="lb-kpi-amount-gross ${lossInfo.kpiLost > 0 ? 'has-loss' : ''}">${lossInfo.kpiLost > 0 ? `gross ${this.formatCurrency(emp.totalKPI)} − ${this.formatCurrency(lossInfo.kpiLost)} hoàn` : 'không có loss'}</div>
                </div>
                <div class="lb-action">
                    <button class="lb-detail-btn" onclick="event.stopPropagation();window.KPICommission.showEmployeeOrders('${this.escapeHtml(emp.userId)}')"><i data-lucide="chevron-right"></i> Chi tiết</button>
                </div>
            </div>`;
        });
        wrap.innerHTML = html;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    },

    _updateHeroStats(aggregated) {
        const totalKpiNet = aggregated.reduce((sum, e) => {
            const loss = (this._reconKpiLossByUser?.get(e.userId) || {}).kpiLost || 0;
            return sum + (e.totalKPI - loss);
        }, 0);
        const totalKpiGross = aggregated.reduce((sum, e) => sum + e.totalKPI, 0);
        const totalRefunds = [...(this._reconKpiLossByUser?.values() || [])].reduce(
            (sum, v) => sum + (v.refundCount || 0),
            0
        );
        const reconRan = !!(this._reconKpiLossByUser && this._reconKpiLossByUser.size > 0);

        const set = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.textContent = v;
        };
        set('kpiHeroTotal', this.formatCurrency(totalKpiNet));
        set(
            'kpiHeroSub',
            reconRan
                ? `Đã đối soát · gross ${this.formatCurrency(totalKpiGross)}, loại ${this.formatCurrency(totalKpiGross - totalKpiNet)}`
                : 'Chưa chạy đối soát — hãy chạy để loại đơn hoàn'
        );
        set('kpiHeroEmps', aggregated.length.toLocaleString('vi-VN'));
        set('kpiHeroRefunds', reconRan ? totalRefunds.toLocaleString('vi-VN') : '—');
    },

    _bindLeaderboardToggle() {
        const btns = document.querySelectorAll('.lb-toggle-btn');
        btns.forEach((b) => {
            if (b.__lbBound) return;
            b.__lbBound = true;
            b.addEventListener('click', () => {
                const view = b.dataset.view;
                this._kpiViewMode = view;
                btns.forEach((x) => x.classList.toggle('is-active', x === b));
                const lbWrap = document.getElementById('kpiLeaderboardWrapper');
                const tableWrap = document.getElementById('kpiTableWrapper');
                if (view === 'leaderboard') {
                    if (lbWrap) lbWrap.style.display = '';
                    if (tableWrap) tableWrap.style.display = 'none';
                } else {
                    if (lbWrap) lbWrap.style.display = 'none';
                    if (tableWrap) tableWrap.style.display = '';
                }
            });
        });
    },

    _bindModalL1Tabs() {
        const tabs = document.querySelectorAll('.modalL1-tab');
        tabs.forEach((t) => {
            if (t.__l1Bound) return;
            t.__l1Bound = true;
            t.addEventListener('click', () => {
                const key = t.dataset.l1Tab;
                tabs.forEach((x) => x.classList.toggle('is-active', x === t));
                this._applyL1Tab(key);
            });
        });
    },

    _applyL1Tab(key) {
        this._l1ActiveTab = key;
        const tbody = document.getElementById('modalL1TableBody');
        const wrapper = document.getElementById('modalL1TableWrapper');
        const summary = document.getElementById('modalL1Summary');
        if (!tbody) return;
        const rows = tbody.querySelectorAll('tr[data-l1-order]');
        if (key === 'overview') {
            // Show only summary, hide table
            if (summary) summary.style.display = '';
            if (wrapper) wrapper.style.display = 'none';
            return;
        }
        if (wrapper) wrapper.style.display = '';
        if (summary) summary.style.display = '';
        rows.forEach((r) => {
            const isRefunded = r.classList.contains('is-refunded');
            const show = key === 'orders' || (key === 'refunds' && isRefunded);
            r.style.display = show ? '' : 'none';
            const detail = r.nextElementSibling;
            if (detail && detail.classList.contains('l1-detail-row')) {
                detail.style.display = show && detail.dataset.open === '1' ? '' : 'none';
            }
        });
    },

    // ========================================
    // RENDER KPI TABLE (12.6)
    // ========================================
    async renderKPITable(filteredData) {
        this.hideEl('kpiTableLoading');

        if (!filteredData || filteredData.length === 0) {
            this.showEl('kpiTableEmpty');
            this.hideEl('kpiTableWrapper');
            const lbWrap = document.getElementById('kpiLeaderboardWrapper');
            if (lbWrap) lbWrap.style.display = 'none';
            return;
        }

        this.hideEl('kpiTableEmpty');

        const aggregated = await this.aggregateByEmployee(filteredData);

        // Render leaderboard cards (default view) + table (alt view)
        this._renderLeaderboard(aggregated);
        this._updateHeroStats(aggregated);
        this._bindLeaderboardToggle();

        // Apply current view
        const viewMode = this._kpiViewMode || 'leaderboard';
        const lbWrap = document.getElementById('kpiLeaderboardWrapper');
        const tableWrap = document.getElementById('kpiTableWrapper');
        if (viewMode === 'leaderboard') {
            if (lbWrap) lbWrap.style.display = '';
            if (tableWrap) tableWrap.style.display = 'none';
        } else {
            if (lbWrap) lbWrap.style.display = 'none';
            if (tableWrap) tableWrap.style.display = '';
        }

        const tbody = document.getElementById('kpiTableBody');
        if (!tbody) return;

        // Hydrate cache cho mọi employee đang hiển thị (nếu chưa có recon
        // trong session) — đảm bảo per-employee recon đã cache hiển thị đúng.
        this._hydrateL1ReconCachesForEmployees(aggregated.map((e) => e.userId));

        const fullMode = this.state.displayMode === 'full';
        let html = '';
        aggregated.forEach((emp, idx) => {
            // reconRan per-employee: true nếu employee này đã có recon results
            // (từ global recon hoặc per-employee recon trong modal L1).
            const reconRan = !!(
                this._reconKpiLossByUser && this._reconKpiLossByUser.has(emp.userId)
            );
            const invoiceSummaryHtml = this.renderKPIInvoiceStatusSummary(emp.orders);

            const orderCount = emp.orders.filter((o) => {
                if (o._stale) return false;
                if (fullMode) return true;
                return (o.netProducts || 0) > 0 || (o.kpi || 0) > 0;
            }).length;

            // Đếm cancelled trực tiếp từ invoice cache — KHÔNG cần chờ recon.
            // Đơn có phiếu Hủy bỏ phải bị loại khỏi KPI gross ngay.
            let cancelledKpi = 0;
            let cancelledCount = 0;
            for (const order of emp.orders || []) {
                if (order._stale) continue;
                const inv = this._invoiceCache?.get(order.orderId);
                if (this._isInvoiceCancelled(inv)) {
                    cancelledKpi += order.kpi || 0;
                    cancelledCount++;
                }
            }

            const reconLoss = this._reconKpiLossByUser?.get(emp.userId) || {
                kpiLost: 0,
                refundCount: 0,
            };
            // Tránh đếm trùng: nếu recon đã mark đơn cancelled là refund thì
            // reconLoss đã bao gồm chúng. Lấy max cho an toàn (cancelled luôn
            // được detect độc lập từ invoice cache).
            const lossInfo = {
                kpiLost: Math.max(reconLoss.kpiLost, cancelledKpi),
                refundCount: Math.max(reconLoss.refundCount, cancelledCount),
                cancelledCount,
                cancelledKpi,
            };
            const kpiNet = emp.totalKPI - lossInfo.kpiLost;
            const hasLoss = lossInfo.kpiLost > 0;
            const lossTitle =
                cancelledCount > 0 && reconLoss.kpiLost === 0
                    ? `${cancelledCount} phiếu hủy — bị loại ${this.formatCurrency(cancelledKpi)}`
                    : `${lossInfo.refundCount} đơn loại (hoàn/hủy) — bị loại ${this.formatCurrency(lossInfo.kpiLost)}`;

            const grossCellHtml = hasLoss
                ? `<td class="col-kpi-gross" title="Tổng KPI trước khi loại đơn hoàn/hủy">${this.formatCurrency(emp.totalKPI)}</td>`
                : `<td class="col-kpi-gross" style="text-decoration:none;color:inherit;">${this.formatCurrency(emp.totalKPI)}</td>`;

            // Hiển thị refund cell khi recon đã chạy HOẶC có cancelled detect được
            const showRefundCell = reconRan || cancelledCount > 0;
            const refundCellHtml = showRefundCell
                ? `<td class="col-refund-count"><span class="refund-badge ${lossInfo.refundCount === 0 ? 'is-zero' : ''}" title="${lossTitle}">↩ ${lossInfo.refundCount}</span></td>`
                : `<td class="col-refund-count" style="color:#9ca3af;font-size:11px;" title="Chưa chạy đối soát">—</td>`;

            const netCellHtml = `<td class="col-kpi-net ${hasLoss ? 'has-loss' : ''}" title="${hasLoss ? lossTitle : 'Không có đơn hoàn/hủy'}">${this.formatCurrency(kpiNet)}</td>`;

            html += `<tr>
                <td>${idx + 1}</td>
                <td><a class="employee-link" onclick="KPICommission.showEmployeeOrders('${this.escapeHtml(emp.userId)}')">${this.escapeHtml(emp.resolvedName)}</a></td>
                <td>${orderCount}</td>
                <td>${emp.totalNetProducts}</td>
                ${grossCellHtml}
                ${refundCellHtml}
                ${netCellHtml}
                <td>${invoiceSummaryHtml}</td>
            </tr>`;
        });

        tbody.innerHTML = html;
        this.reinitIcons();
    },

    // ========================================
    // AGGREGATE BY EMPLOYEE (12.7)
    // ========================================
    async aggregateByEmployee(filteredData) {
        // filteredData is already grouped by employee from applyFilters.
        // Sum strict KPI (order.kpi) cho mọi mode. Simple mode: ẨN user có
        // totalKPI = 0 (không có SP nào được tick trong các đơn của user).
        const simpleMode = this.state.displayMode === 'simple';
        const results = [];
        for (const emp of filteredData) {
            let totalNetProducts = 0;
            let totalKPI = 0;

            for (const order of emp.orders) {
                totalNetProducts += order.netProducts || 0;
                totalKPI += order.kpi || 0;
            }

            // Simple mode: ẨN user có totalKPI = 0 (không có đơn nào được tính KPI)
            if (simpleMode && totalKPI <= 0 && totalNetProducts <= 0) continue;

            // Resolve employee name (Bug #4 fix - never show raw userId)
            const resolvedName = await this.resolveEmployeeName(emp.userId);

            results.push({
                userId: emp.userId,
                userName: emp.userName || emp.userId,
                resolvedName,
                orders: emp.orders,
                totalNetProducts,
                totalKPI,
            });
        }

        return results.sort((a, b) => b.totalKPI - a.totalKPI); // Sort by KPI descending
    },

    // ========================================
    // MODAL L1: SHOW EMPLOYEE ORDERS (12.8)
    // ========================================
    async showEmployeeOrders(userId) {
        const emp = this.state.filteredData.find((e) => e.userId === userId);
        if (!emp) {
            console.warn('[KPI Tab] Employee not found:', userId);
            return;
        }

        this.state.currentEmployeeUserId = userId;
        this.state.currentEmployeeOrders = emp.orders || [];

        // Set header - use resolved name (Bug #4 fix)
        const nameEl = document.getElementById('modalL1EmployeeName');
        if (nameEl) {
            const resolvedName = await this.resolveEmployeeName(userId);
            nameEl.textContent = resolvedName;
        }

        // Reset filters
        const statusFilter = document.getElementById('modalL1FilterStatus');
        if (statusFilter) statusFilter.value = '';
        const searchInput = document.getElementById('modalL1Search');
        if (searchInput) searchInput.value = '';

        // Áp dụng cache recon nếu có (cache TTL 7 ngày). Khi cache hết hạn
        // hoặc chưa từng đối soát → table render ở trạng thái "chưa check".
        const cached = this._readL1ReconCache(userId);
        if (cached?.results) {
            this._applyL1ReconCache(userId, cached.results);
        } else {
            this.renderEmployeeOrdersTable(this.state.currentEmployeeOrders);
        }

        // Update button label + cache info
        this._setL1ReconCacheInfo(userId);

        // Show modal
        this.showEl('modalEmployeeOrders');
        this.reinitIcons();
    },

    filterEmployeeOrders() {
        const statusVal = (document.getElementById('modalL1FilterStatus') || {}).value || '';
        const searchVal = ((document.getElementById('modalL1Search') || {}).value || '')
            .toLowerCase()
            .trim();

        let orders = this.state.currentEmployeeOrders;

        if (statusVal === 'ok') {
            orders = orders.filter((o) => !o.hasDiscrepancy);
        } else if (statusVal === 'discrepancy') {
            orders = orders.filter((o) => o.hasDiscrepancy);
        }

        if (searchVal) {
            orders = orders.filter((o) => {
                const oid = (o.orderId || '').toLowerCase();
                const code = (o.orderCode || '').toLowerCase();
                const stt = String(o.stt != null ? o.stt : '').toLowerCase();
                return (
                    oid.includes(searchVal) || code.includes(searchVal) || stt.includes(searchVal)
                );
            });
        }

        this.renderEmployeeOrdersTable(orders);
    },

    renderEmployeeOrdersTable(orders) {
        this.hideEl('modalL1Loading');

        if (!orders || orders.length === 0) {
            this.showEl('modalL1Empty');
            this.hideEl('modalL1TableWrapper');
            return;
        }

        this.hideEl('modalL1Empty');
        this.showEl('modalL1TableWrapper');

        const tbody = document.getElementById('modalL1TableBody');
        if (!tbody) return;

        const simpleMode = this.state.displayMode === 'simple';
        const reconRan = !!(this._reconByOrder && this._reconByOrder.size > 0);
        let html = '';
        let totalOrders = 0;
        let okOrders = 0;
        let refundOrders = 0;
        let kpiGross = 0;
        let kpiLost = 0;

        orders.forEach((order) => {
            if (order._stale) return;
            const recon = this._reconByOrder?.get(order.orderId);
            const exclusionKind = this._getKpiExclusionKind(order.orderId, recon);
            const isRefunded = exclusionKind === 'refund';
            const isCancelled = exclusionKind === 'cancel';
            const isExcluded = !!exclusionKind;
            // Simple mode: ẩn đơn 0 KPI — NHƯNG luôn hiện đơn loại (refund/cancel)
            // để user thấy lý do "không tính KPI" dù KPI=0
            if (simpleMode && !isExcluded && (order.netProducts || 0) <= 0 && (order.kpi || 0) <= 0)
                return;

            const invoiceHtml = this.renderKPIInvoiceStatusCell(order.orderId);
            const hasDiscrepancy = !!recon?.hasDiscrepancy && !isExcluded;
            const invNumber =
                recon?.invoiceNumber || this._invoiceCache?.get(order.orderId)?.Number || '';

            totalOrders++;
            kpiGross += order.kpi || 0;
            if (isExcluded) {
                refundOrders++;
                kpiLost += order.kpi || 0;
            } else {
                okOrders++;
            }

            const rowClass = isExcluded ? 'is-refunded' : hasDiscrepancy ? 'is-discrepancy' : '';

            let statusPill;
            if (isCancelled) {
                statusPill =
                    '<span class="kpi-status-pill pill-refund" title="Phiếu đã hủy trên TPOS — không tính KPI">✗ Hủy bỏ</span>';
            } else if (isRefunded) {
                statusPill = '<span class="kpi-status-pill pill-refund">↩ Đã hoàn</span>';
            } else if (hasDiscrepancy) {
                statusPill = '<span class="kpi-status-pill pill-discrepancy">⚠ Sai lệch</span>';
            } else if (reconRan) {
                statusPill = '<span class="kpi-status-pill pill-ok">✓ OK</span>';
            } else {
                statusPill =
                    '<span class="kpi-status-pill pill-untracked" title="Chưa chạy đối soát">— chưa check</span>';
            }

            const invId = this._invoiceCache?.get(order.orderId)?.Id;
            const invHtml = invNumber
                ? `<a class="recon-invoice-num is-link" href="javascript:void(0)" onclick="event.stopPropagation();window.KPICommission.showInvoiceDetail('${invId || ''}', '${this.escapeHtml(invNumber)}')" title="Xem chi tiết phiếu ${this.escapeHtml(invNumber)}">${this.escapeHtml(invNumber)}</a>`
                : '<span class="recon-invoice-num is-empty">—</span>';

            const toggleBtn = isRefunded
                ? `<button class="recon-toggle-btn l1-toggle-btn" onclick="window.KPICommission._toggleL1OrderDetail('${this.escapeHtml(order.orderId)}')" title="Xem món trả + lý do"><i data-lucide="chevron-right"></i></button>`
                : '';

            html += `<tr class="${rowClass}" data-l1-order="${this.escapeHtml(order.orderId)}">
                <td>${toggleBtn}${order.stt != null ? this.escapeHtml(String(order.stt)) : '---'}</td>
                <td><a class="order-link" onclick="KPICommission.showOrderDetails('${this.escapeHtml(order.orderId)}')">${this.escapeHtml(order.orderCode || order.orderId)}</a></td>
                <td>${invHtml}</td>
                <td>${this.escapeHtml(order.campaignName || '---')}</td>
                <td>${order.netProducts || 0}</td>
                <td>${this.formatCurrency(order.kpi || 0)}</td>
                <td>${statusPill}</td>
                <td>${invoiceHtml}</td>
            </tr>`;

            // Detail row — empty initially, populated lazy on click cho đơn refunded
            if (isRefunded) {
                html += `<tr class="recon-detail-row l1-detail-row" data-open="0" style="display:none;">
                    <td colspan="8">
                        <div class="recon-detail-content l1-detail-content">
                            <em>Click để load chi tiết món trả...</em>
                        </div>
                    </td>
                </tr>`;
            }
        });

        if (!html) {
            this.showEl('modalL1Empty');
            this.hideEl('modalL1TableWrapper');
            return;
        }

        tbody.innerHTML = html;

        // Render summary card — luôn populate values cho đúng count.
        // Show/hide xử lý ở _applyL1Tab (tab Tổng quan luôn show summary kèm
        // empty-state nếu chưa recon).
        const summary = document.getElementById('modalL1Summary');
        if (summary) {
            const set = (id, v) => {
                const el = document.getElementById(id);
                if (el) el.textContent = v;
            };
            set('l1SumTotalOrders', totalOrders.toLocaleString('vi-VN'));
            set('l1SumOkOrders', okOrders.toLocaleString('vi-VN'));
            set('l1SumRefundOrders', refundOrders.toLocaleString('vi-VN'));
            set('l1SumKpiGross', this.formatCurrency(kpiGross));
            set('l1SumKpiLost', this.formatCurrency(kpiLost));
            set('l1SumKpiNet', this.formatCurrency(kpiGross - kpiLost));
        }
        this._l1ReconRan = reconRan;

        // Update tab counts
        const setTab = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.textContent = v;
        };
        setTab('l1TabCountAll', totalOrders);
        setTab('l1TabCountRefund', refundOrders);

        // Bind tab clicks (idempotent)
        this._bindModalL1Tabs();
        // Apply current tab filter (default = orders)
        if (!this._l1ActiveTab) this._l1ActiveTab = 'orders';
        document
            .querySelectorAll('.modalL1-tab')
            .forEach((t) => t.classList.toggle('is-active', t.dataset.l1Tab === this._l1ActiveTab));
        this._applyL1Tab(this._l1ActiveTab);

        if (window.lucide?.createIcons) window.lucide.createIcons();
    },

    closeEmployeeOrders() {
        this.hideEl('modalEmployeeOrders');
        this.state.currentEmployeeUserId = null;
        this.state.currentEmployeeOrders = [];
    },

    // ========================================
    // PER-EMPLOYEE RECONCILIATION + 7-DAY CACHE
    // ========================================

    _L1_RECON_CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000, // 7 ngày
    _L1_RECON_CACHE_PREFIX: 'kpi_recon_l1_v1__',

    _getL1ReconCacheKey(userId) {
        return `${this._L1_RECON_CACHE_PREFIX}${userId}`;
    },

    _readL1ReconCache(userId) {
        try {
            const key = this._getL1ReconCacheKey(userId);
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            if (!obj || typeof obj !== 'object') return null;
            if (!obj.savedAt || !obj.results) return null;
            const ageMs = Date.now() - obj.savedAt;
            if (ageMs > this._L1_RECON_CACHE_TTL_MS) {
                localStorage.removeItem(key);
                return null;
            }
            return obj;
        } catch (e) {
            console.warn('[KPI L1] Read cache failed:', e?.message);
            return null;
        }
    },

    _writeL1ReconCache(userId, results) {
        try {
            const key = this._getL1ReconCacheKey(userId);
            const payload = {
                savedAt: Date.now(),
                ttlMs: this._L1_RECON_CACHE_TTL_MS,
                results,
            };
            localStorage.setItem(key, JSON.stringify(payload));
        } catch (e) {
            console.warn('[KPI L1] Write cache failed:', e?.message);
        }
    },

    _formatL1ReconAge(savedAt) {
        const diffMs = Date.now() - savedAt;
        if (diffMs < 60 * 1000) return 'vừa xong';
        const diffMin = Math.floor(diffMs / (60 * 1000));
        if (diffMin < 60) return `${diffMin} phút trước`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr} giờ trước`;
        const diffDay = Math.floor(diffHr / 24);
        return `${diffDay} ngày trước`;
    },

    /**
     * Hydrate per-employee recon cache vào maps in-memory. Idempotent.
     * Gọi trước khi render main KPI table để các employee đã có cache
     * hiển thị KPI loss + Hoàn count ngay (không cần reopen modal).
     */
    _hydrateL1ReconCachesForEmployees(userIds) {
        if (!Array.isArray(userIds) || userIds.length === 0) return;
        if (!this._reconByOrder) this._reconByOrder = new Map();
        if (!this._reconKpiLossByUser) this._reconKpiLossByUser = new Map();
        for (const userId of userIds) {
            if (this._reconKpiLossByUser.has(userId)) continue;
            const cache = this._readL1ReconCache(userId);
            if (!cache?.results) continue;
            for (const r of cache.results) this._reconByOrder.set(r.orderId, r);
            const emp = this.state.filteredData?.find((e) => e.userId === userId);
            let lossSum = 0;
            let refundCount = 0;
            for (const order of emp?.orders || []) {
                const r = this._reconByOrder.get(order.orderId);
                const inv = this._invoiceCache?.get(order.orderId);
                const isCancelled = this._isInvoiceCancelled(inv);
                if (r?.isRefunded || isCancelled) {
                    lossSum += order.kpi || 0;
                    refundCount++;
                }
            }
            this._reconKpiLossByUser.set(userId, { kpiLost: lossSum, refundCount });
        }
    },

    _setL1ReconCacheInfo(userId) {
        const infoEl = document.getElementById('modalL1ReconCacheInfo');
        const btn = document.getElementById('btnModalL1Recon');
        const lbl = document.getElementById('btnModalL1ReconLabel');
        if (!infoEl || !btn || !lbl) return;
        const cache = this._readL1ReconCache(userId);
        if (!cache) {
            infoEl.style.display = 'none';
            infoEl.className = 'l1-recon-cache-info';
            btn.classList.remove('is-cached');
            lbl.textContent = 'Chạy đối soát';
            return;
        }
        const ageMs = Date.now() - cache.savedAt;
        const isStale = ageMs > 3 * 24 * 60 * 60 * 1000; // > 3 ngày
        infoEl.style.display = '';
        infoEl.className = 'l1-recon-cache-info ' + (isStale ? 'is-stale' : 'is-fresh');
        infoEl.textContent = `Đã đối soát ${this._formatL1ReconAge(cache.savedAt)}`;
        btn.classList.add('is-cached');
        lbl.textContent = 'Đối soát lại';
    },

    /**
     * Áp dụng cache recon (1 employee) vào _reconByOrder + _reconKpiLossByUser
     * và re-render modal L1. Gọi khi mở modal nếu có cache fresh.
     */
    _applyL1ReconCache(userId, cachedResults) {
        if (!this._reconByOrder) this._reconByOrder = new Map();
        if (!this._reconKpiLossByUser) this._reconKpiLossByUser = new Map();

        const orders = this.state.currentEmployeeOrders || [];
        let lossSum = 0;
        let refundCount = 0;
        for (const r of cachedResults || []) {
            this._reconByOrder.set(r.orderId, r);
        }
        for (const order of orders) {
            const r = this._reconByOrder.get(order.orderId);
            const inv = this._invoiceCache?.get(order.orderId);
            const isCancelled = this._isInvoiceCancelled(inv);
            if (r?.isRefunded || isCancelled) {
                lossSum += order.kpi || 0;
                refundCount++;
            }
        }
        this._reconKpiLossByUser.set(userId, { kpiLost: lossSum, refundCount });

        // Re-render table với reconRan=true
        this.renderEmployeeOrdersTable(orders);
    },

    /**
     * Run reconciliation for ONLY the current employee in modal L1.
     * Always runs fresh and overwrites the 7-day cache. Cache lookup happens
     * automatically on `showEmployeeOrders` open — clicking the button is the
     * explicit "đối soát lại" action.
     */
    async runEmployeeReconciliation() {
        const userId = this.state.currentEmployeeUserId;
        if (!userId) {
            console.warn('[KPI L1] No employee selected');
            return;
        }

        const orders = (this.state.currentEmployeeOrders || []).filter((o) => !o._stale);
        if (orders.length === 0) {
            if (window.notificationManager?.warning) {
                window.notificationManager.warning('Không có đơn nào để đối soát', 2000);
            }
            return;
        }

        const btn = document.getElementById('btnModalL1Recon');
        const lbl = document.getElementById('btnModalL1ReconLabel');
        if (btn) {
            btn.disabled = true;
            btn.classList.add('is-running');
        }
        if (lbl) lbl.textContent = 'Đang đối soát...';

        try {
            // Step 1: đảm bảo invoice cache + refund excel
            const [, refundInfoRaw] = await Promise.all([
                this.loadInvoiceStatusData().catch((e) => {
                    console.warn('[KPI L1] Load invoice cache failed:', e?.message);
                }),
                this.fetchRefundedOrderCodes(3).catch((e) => {
                    console.warn('[KPI L1] Fetch refund excel failed:', e?.message);
                    return { codes: new Set(), totalRows: 0 };
                }),
            ]);
            const refundInfo = refundInfoRaw || { codes: new Set() };
            const refundedInvoiceNumbers = refundInfo.codes || new Set();

            // Step 2: reconcile từng đơn — worker pool concurrency 6
            const CONCURRENCY = Math.min(6, orders.length);
            const total = orders.length;
            const results = new Array(total);
            let nextIdx = 0;

            const reconcileOne = async (idx) => {
                const order = orders[idx];
                const invoice = this._invoiceCache?.get(order.orderId) || null;
                const invNumber = invoice?.Number || '';
                const isRefunded = !!(invNumber && refundedInvoiceNumbers.has(invNumber));
                const baseFields = {
                    orderId: order.orderId,
                    orderCode: order.orderCode || '',
                    invoiceNumber: invoice?.Number || '',
                    invoiceState: invoice?.ShowState || '',
                    kpiAmount: order.kpi || 0,
                    stt: order.stt,
                    expectedNet: order.netProducts || 0,
                };
                try {
                    let result = { hasDiscrepancy: false, discrepancies: [], actualNet: null };
                    if (window.kpiManager?.reconcileKPI) {
                        result = await window.kpiManager.reconcileKPI(
                            order.orderId,
                            order.campaignName,
                            order.orderCode
                        );
                    }
                    const refundDiscrepancy = isRefunded
                        ? [
                              {
                                  type: 'refunded',
                                  message: 'Đơn đã có trong refund excel — không tính KPI',
                              },
                          ]
                        : [];
                    results[idx] = {
                        ...baseFields,
                        actualNet:
                            result.actualNet != null ? result.actualNet : order.netProducts || 0,
                        hasDiscrepancy: isRefunded || result.hasDiscrepancy,
                        isRefunded,
                        discrepancies: [...refundDiscrepancy, ...(result.discrepancies || [])],
                    };
                } catch (e) {
                    console.error('[KPI L1] Recon error for', order.orderId, e);
                    results[idx] = {
                        ...baseFields,
                        actualNet: 'Lỗi',
                        hasDiscrepancy: true,
                        isRefunded,
                        discrepancies: [
                            ...(isRefunded ? [{ type: 'refunded', message: 'Đơn đã hoàn' }] : []),
                            { type: 'error', message: e?.message || 'lỗi' },
                        ],
                    };
                }
            };

            const workers = Array.from({ length: CONCURRENCY }, async () => {
                while (true) {
                    const myIdx = nextIdx++;
                    if (myIdx >= total) break;
                    await reconcileOne(myIdx);
                }
            });
            await Promise.all(workers);

            // Step 3: lưu cache 7 ngày + apply vào maps + re-render
            this._writeL1ReconCache(userId, results);
            this._applyL1ReconCache(userId, results);

            // Update main KPI table (cho employee này) để KPI thực reflect ngay
            try {
                await this.renderKPITable(this.state.filteredData || []);
            } catch (e) {
                console.warn('[KPI L1] Sync main table failed:', e?.message);
            }

            if (window.notificationManager?.success) {
                const refundCnt = results.filter((r) => r.isRefunded).length;
                const discCnt = results.filter((r) => r.hasDiscrepancy && !r.isRefunded).length;
                window.notificationManager.success(
                    `Đối soát xong ${total} đơn (hoàn: ${refundCnt}, sai lệch: ${discCnt})`,
                    2500
                );
            }
        } catch (e) {
            console.error('[KPI L1] Reconciliation failed:', e);
            if (window.notificationManager?.error) {
                window.notificationManager.error(`Đối soát thất bại: ${e.message}`, 3000);
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('is-running');
            }
            this._setL1ReconCacheInfo(userId);
        }
    },

    // ========================================
    // MODAL L2: SHOW ORDER DETAILS (12.9)
    // ========================================
    async showOrderDetails(orderId) {
        if (!orderId) return;

        this.state.currentOrderId = orderId;

        // Set header - show orderCode instead of raw orderId
        const orderIdEl = document.getElementById('modalL2OrderId');
        if (orderIdEl) {
            const order = this.state.currentEmployeeOrders.find((o) => o.orderId === orderId);
            orderIdEl.textContent = order?.orderCode || orderId;
        }

        // Reset to first tab
        this.switchOrderTab('kpi-compare');

        // Show modal
        this.showEl('modalOrderDetails');
        this.reinitIcons();

        // Load first tab data
        await this.renderNetKPITab(orderId);
    },

    switchOrderTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('[data-order-tab]').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-order-tab') === tabName);
        });

        // Update tab contents
        const tabMap = {
            'kpi-compare': 'tabKpiCompare',
            'audit-log': 'tabAuditLog',
            'all-products': 'tabAllProducts',
            'base-products': 'tabBaseProducts',
            inbox: 'tabInbox',
        };

        Object.values(tabMap).forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.style.display = 'none';
                el.classList.remove('active');
            }
        });

        const activeId = tabMap[tabName];
        if (activeId) {
            const el = document.getElementById(activeId);
            if (el) {
                el.style.display = '';
                el.classList.add('active');
            }
        }

        // Load tab data
        const orderId = this.state.currentOrderId;
        if (!orderId) return;

        if (tabName === 'kpi-compare') this.renderNetKPITab(orderId);
        else if (tabName === 'audit-log') this.renderAuditLogTab(orderId);
        else if (tabName === 'all-products') this.renderAllProductsTab(orderId);
        else if (tabName === 'base-products') this.renderBaseProductsTab(orderId);
        else if (tabName === 'inbox') this.renderInboxTab(orderId);
    },

    closeOrderDetails() {
        this.hideEl('modalOrderDetails');
        this.state.currentOrderId = null;
    },

    // ========================================
    // RENDER NET KPI TAB (12.10)
    // ========================================
    async renderNetKPITab(orderId) {
        this.showEl('kpiCompareLoading');
        this.hideEl('kpiCompareEmpty');
        this.hideEl('kpiCompareWrapper');

        try {
            // Find orderCode from current employee orders
            const orderData = this.state.currentEmployeeOrders.find((o) => o.orderId === orderId);
            const orderCode = orderData?.orderCode || orderId;

            // 1. Get BASE from REST API (chỉ để check sự tồn tại cho empty state)
            const base = window.kpiManager ? await window.kpiManager.getKPIBase(orderCode) : null;
            if (!base) {
                this.hideEl('kpiCompareLoading');
                this.showEl('kpiCompareEmpty');
                const emptyEl = document.getElementById('kpiCompareEmpty');
                if (emptyEl)
                    emptyEl.querySelector('p').textContent =
                        'Đơn hàng chưa có BASE snapshot. Không thể tính KPI.';
                return;
            }

            // 2. Gọi calculateNetKPI để áp đúng filter (productId + template + name-normalize + out_of_range)
            const kpiResult = window.kpiManager
                ? await window.kpiManager.calculateNetKPI(orderCode)
                : { details: {}, netProducts: 0, kpiAmount: 0 };

            // 3. Load sale flags cho orderCode này → highlight row nào được tick tính KPI
            if (window.KpiSaleFlagStore) {
                try {
                    await window.KpiSaleFlagStore.load(orderCode);
                } catch (e) {
                    console.warn('[KPI Tab] load sale flags failed:', e?.message);
                }
            }

            const simpleMode = this.state.displayMode === 'simple';

            const products = Object.entries(kpiResult.details || {})
                .map(([pid, data]) => {
                    const isSaleChecked = !!(
                        window.KpiSaleFlagStore && window.KpiSaleFlagStore.get(orderCode, pid)
                    );
                    const excluded = data.excludedBySaleFlag === true;
                    const unitKPI = data.unitKPI || this.KPI_PER_PRODUCT;
                    // KPI = 0 cho SP bị loại (chưa tick); ngược lại = net * unitKPI.
                    const kpi = excluded ? 0 : (data.net || 0) * unitKPI;
                    return {
                        pid,
                        code: data.code || '',
                        name: data.name || '',
                        added: data.added || 0,
                        removed: data.removed || 0,
                        net: data.net || 0,
                        kpi,
                        excluded,
                        isSaleChecked,
                    };
                })
                // Simple mode: chỉ show SP được tick (KPI > 0). Full mode: show tất cả
                // (row KPI > 0 tô xanh, row 0đ trắng — user review được SP nào chưa tick).
                .filter((p) => !simpleMode || !p.excluded);

            this.hideEl('kpiCompareLoading');

            if (products.length === 0) {
                this.showEl('kpiCompareEmpty');
                return;
            }

            this.showEl('kpiCompareWrapper');

            // Render table body
            const tbody = document.getElementById('kpiCompareBody');
            const tfoot = document.getElementById('kpiCompareFoot');
            if (!tbody) return;

            let totalAdded = 0,
                totalRemoved = 0,
                totalNet = 0,
                totalKPI = 0;
            let html = '';

            products.forEach((p, idx) => {
                totalAdded += p.added;
                totalRemoved += p.removed;
                totalNet += p.net;
                totalKPI += p.kpi;

                // Row tô xanh nhạt khi thực sự đóng góp KPI (p.kpi > 0).
                // Đồng bộ visual với cột "KPI (VNĐ)": row có tiền → xanh; row 0đ → trắng.
                const rowClass = p.kpi > 0 ? 'kpi-row-checked' : '';

                html += `<tr class="${rowClass}">
                    <td>${idx + 1}</td>
                    <td>${this.escapeHtml(p.code)}</td>
                    <td>${this.escapeHtml(p.name)}</td>
                    <td class="action-add">+${p.added}</td>
                    <td class="action-remove">-${p.removed}</td>
                    <td><strong>${p.net}</strong></td>
                    <td>${this.formatCurrency(p.kpi)}</td>
                </tr>`;
            });

            tbody.innerHTML = html;

            if (tfoot) {
                tfoot.innerHTML = `<tr>
                    <td colspan="3"><strong>Tổng cộng</strong></td>
                    <td class="action-add"><strong>+${totalAdded}</strong></td>
                    <td class="action-remove"><strong>-${totalRemoved}</strong></td>
                    <td><strong>${totalNet}</strong></td>
                    <td><strong>${this.formatCurrency(totalKPI)}</strong></td>
                </tr>`;
            }

            // Per-user attribution breakdown (audit-based, không phải chủ đơn)
            this.renderPerUserBreakdown(kpiResult);
        } catch (error) {
            console.error('[KPI Tab] Error rendering NET KPI tab:', error);
            this.hideEl('kpiCompareLoading');
            this.showEl('kpiCompareEmpty');
        }
    },

    renderPerUserBreakdown(kpiResult) {
        const wrapper = document.getElementById('kpiCompareWrapper');
        if (!wrapper) return;

        let breakdownEl = document.getElementById('kpiPerUserBreakdown');
        if (!breakdownEl) {
            breakdownEl = document.createElement('div');
            breakdownEl.id = 'kpiPerUserBreakdown';
            breakdownEl.style.cssText =
                'margin-top:16px;padding:12px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;';
            wrapper.appendChild(breakdownEl);
        }

        const perUserKPI = kpiResult.perUserKPI || {};
        const perUserNet = kpiResult.perUserNet || {};
        const perUserNames = kpiResult.perUserNames || {};
        const userIds = Object.keys(perUserKPI).filter((uid) => (perUserKPI[uid] || 0) > 0);

        if (userIds.length === 0) {
            breakdownEl.innerHTML =
                '<div style="color:#6b7280;font-size:13px;">Chưa có nhân viên nào được tính KPI cho đơn này.</div>';
            return;
        }

        userIds.sort((a, b) => (perUserKPI[b] || 0) - (perUserKPI[a] || 0));

        let rows = '';
        userIds.forEach((uid, i) => {
            rows += `<tr>
                <td>${i + 1}</td>
                <td>${this.escapeHtml(perUserNames[uid] || uid)}</td>
                <td><strong>${perUserNet[uid] || 0}</strong></td>
                <td><strong>${this.formatCurrency(perUserKPI[uid] || 0)}</strong></td>
            </tr>`;
        });

        breakdownEl.innerHTML = `
            <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">
                KPI theo nhân viên (dựa trên audit log — người thực sự upsell)
            </div>
            <table style="width:100%;font-size:13px;border-collapse:collapse;">
                <thead>
                    <tr style="background:#f3f4f6;">
                        <th style="padding:6px 8px;text-align:left;border:1px solid #e5e7eb;">#</th>
                        <th style="padding:6px 8px;text-align:left;border:1px solid #e5e7eb;">Nhân viên</th>
                        <th style="padding:6px 8px;text-align:left;border:1px solid #e5e7eb;">SP NET</th>
                        <th style="padding:6px 8px;text-align:left;border:1px solid #e5e7eb;">KPI</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;
    },

    // ========================================
    // RENDER AUDIT LOG TAB (12.11)
    // ========================================
    async renderAuditLogTab(orderId) {
        this.showEl('auditLogLoading');
        this.hideEl('auditLogEmpty');
        this.hideEl('auditLogWrapper');

        try {
            const orderData = this.state.currentEmployeeOrders.find((o) => o.orderId === orderId);
            const orderCode = orderData?.orderCode || orderId;

            // Get audit logs from REST API
            let auditLogs = [];
            if (window.kpiAuditLogger) {
                auditLogs = await window.kpiAuditLogger.getAuditLogsForOrder(orderCode);
            }

            this.hideEl('auditLogLoading');

            if (auditLogs.length === 0) {
                this.showEl('auditLogEmpty');
                return;
            }

            this.showEl('auditLogWrapper');

            // Get BASE from REST API
            const base = window.kpiManager ? await window.kpiManager.getKPIBase(orderCode) : null;
            const baseProductIds = new Set();
            if (base) {
                (base.products || []).forEach((p) => {
                    const pid = p.ProductId || p.productId;
                    if (pid) baseProductIds.add(Number(pid));
                });
            }

            // Non-chat sources for highlighting
            const nonChatSources = [
                'edit_modal_inline',
                'edit_modal_remove',
                'edit_modal_quantity',
                'sale_modal',
            ];

            // Render table
            const tbody = document.getElementById('auditLogBody');
            if (!tbody) return;

            let html = '';
            auditLogs.forEach((log, idx) => {
                let rowClass = '';
                let extraLabel = '';

                if (log.outOfRange === true || log.out_of_range === true) {
                    rowClass = 'audit-row-out-of-range';
                    extraLabel = '<span class="out-of-range-label">Ngoài phạm vi</span>';
                } else if (nonChatSources.includes(log.source)) {
                    rowClass = 'audit-row-non-chat';
                }

                html += `<tr class="${rowClass}">
                    <td>${idx + 1}</td>
                    <td>${this.formatTimestamp(log.createdAt || log.timestamp)}</td>
                    <td>${this.escapeHtml(log.userName || log.userId || '---')}${extraLabel}</td>
                    <td><span class="${this.getActionClass(log.action)}">${this.getActionLabel(log.action)}</span></td>
                    <td>${this.escapeHtml(log.productCode || '---')}</td>
                    <td>${this.escapeHtml(log.productName || '---')}</td>
                    <td>${log.quantity || 0}</td>
                    <td>${this.getSourceBadge(log.source)}</td>
                </tr>`;
            });

            tbody.innerHTML = html;

            // Summary: tính qua calculateNetKPI để áp đúng filter biến thể
            // (productId + tpos_template_id + normalized name + out_of_range).
            const kpiResult = window.kpiManager
                ? await window.kpiManager.calculateNetKPI(orderCode)
                : { details: {}, netProducts: 0, kpiAmount: 0 };

            let totalAdded = 0,
                totalRemoved = 0;
            for (const data of Object.values(kpiResult.details || {})) {
                totalAdded += data.added || 0;
                totalRemoved += data.removed || 0;
            }
            const totalNet = kpiResult.netProducts || 0;
            const totalKPI = kpiResult.kpiAmount || totalNet * this.KPI_PER_PRODUCT;

            // Render summary
            const summaryEl = document.getElementById('auditLogSummary');
            if (summaryEl) {
                summaryEl.innerHTML = `
                    <div class="audit-summary-row">
                        <span class="label">BASE products:</span>
                        <span class="value">${baseProductIds.size} sản phẩm</span>
                    </div>
                    <div class="audit-summary-row">
                        <span class="label">Tổng thêm (SP mới):</span>
                        <span class="value action-add">+${totalAdded}</span>
                    </div>
                    <div class="audit-summary-row">
                        <span class="label">Tổng xóa (SP mới):</span>
                        <span class="value action-remove">-${totalRemoved}</span>
                    </div>
                    <div class="audit-summary-row">
                        <span class="label">NET (SP mới):</span>
                        <span class="value">${totalNet}</span>
                    </div>
                    <div class="audit-summary-row total">
                        <span class="label">Tổng KPI:</span>
                        <span class="value">${this.formatCurrency(totalKPI)}</span>
                    </div>`;
            }
        } catch (error) {
            console.error('[KPI Tab] Error rendering audit log tab:', error);
            this.hideEl('auditLogLoading');
            this.showEl('auditLogEmpty');
        }
    },

    // ========================================
    // RENDER ALL PRODUCTS TAB (12.12)
    // ========================================
    async renderAllProductsTab(orderId) {
        this.showEl('allProductsLoading');
        this.hideEl('allProductsEmpty');
        this.hideEl('allProductsWrapper');

        try {
            const db = this.getDb();
            if (!db) throw new Error('Firestore not available');

            // Try to get from report_order_details first
            let products = null;

            // Find campaign name from current order data
            const order = this.state.currentEmployeeOrders.find((o) => o.orderId === orderId);
            const campaignName = order ? order.campaignName : null;

            if (campaignName) {
                const safeTableName = campaignName.replace(/[.$#\[\]\/]/g, '_');
                try {
                    const doc = await db
                        .collection('report_order_details')
                        .doc(safeTableName)
                        .get();
                    if (doc.exists) {
                        const data = doc.data();
                        const orderData = (data.orders || []).find(
                            (o) => (o.Id || o.id) === orderId
                        );
                        if (orderData && orderData.Details) {
                            products = orderData.Details.map((d) => ({
                                code: d.ProductCode || d.Code || d.DefaultCode || '',
                                name: d.ProductName || d.Name || '',
                                quantity: d.Quantity || 1,
                                price: d.Price || 0,
                            }));
                        }
                    }
                } catch (e) {
                    console.warn('[KPI Tab] Error loading from report_order_details:', e);
                }
            }

            this.hideEl('allProductsLoading');

            if (!products || products.length === 0) {
                this.showEl('allProductsEmpty');
                return;
            }

            this.showEl('allProductsWrapper');

            const tbody = document.getElementById('allProductsBody');
            if (!tbody) return;

            let html = '';
            products.forEach((p, idx) => {
                html += `<tr>
                    <td>${idx + 1}</td>
                    <td>${this.escapeHtml(p.code)}</td>
                    <td>${this.escapeHtml(p.name)}</td>
                    <td>${p.quantity}</td>
                    <td>${this.formatCurrency(p.price)}</td>
                </tr>`;
            });

            tbody.innerHTML = html;
        } catch (error) {
            console.error('[KPI Tab] Error rendering all products tab:', error);
            this.hideEl('allProductsLoading');
            this.showEl('allProductsEmpty');
        }
    },

    // ========================================
    // RENDER BASE PRODUCTS TAB (12.13)
    // ========================================
    async renderBaseProductsTab(orderId) {
        this.showEl('baseProductsLoading');
        this.hideEl('baseProductsEmpty');
        this.hideEl('baseProductsContent');

        try {
            const orderData = this.state.currentEmployeeOrders.find((o) => o.orderId === orderId);
            const orderCode = orderData?.orderCode || orderId;

            const base = window.kpiManager ? await window.kpiManager.getKPIBase(orderCode) : null;

            this.hideEl('baseProductsLoading');

            if (!base) {
                this.showEl('baseProductsEmpty');
                return;
            }

            this.showEl('baseProductsContent');

            // Render info
            const infoEl = document.getElementById('baseSnapshotInfo');
            if (infoEl) {
                const mergeNote = '';
                infoEl.innerHTML = `
                    <div class="base-info-item">
                        <i data-lucide="clock"></i>
                        <span>Thời gian: ${this.formatTimestamp(base.createdAt || base.timestamp)}</span>
                    </div>
                    <div class="base-info-item">
                        <i data-lucide="user"></i>
                        <span>Người lưu: ${this.escapeHtml(base.userName || base.userId || '---')}</span>
                    </div>
                    <div class="base-info-item">
                        <i data-lucide="hash"></i>
                        <span>STT: ${base.stt || '---'}</span>
                    </div>
                    <div class="base-info-item">
                        <i data-lucide="tag"></i>
                        <span>Campaign: ${this.escapeHtml(base.campaignName || '---')}${mergeNote}</span>
                    </div>`;
            }

            // Render products table
            const products = base.products || [];
            const tbody = document.getElementById('baseProductsBody');
            if (!tbody) return;

            let html = '';
            products.forEach((p, idx) => {
                html += `<tr>
                    <td>${idx + 1}</td>
                    <td>${this.escapeHtml(p.ProductCode || p.code || '')}</td>
                    <td>${this.escapeHtml(p.ProductName || p.productName || '')}</td>
                    <td>${p.Quantity || p.quantity || 0}</td>
                    <td>${this.formatCurrency(p.Price || p.price || 0)}</td>
                </tr>`;
            });

            tbody.innerHTML = html;
            this.reinitIcons();
        } catch (error) {
            console.error('[KPI Tab] Error rendering BASE products tab:', error);
            this.hideEl('baseProductsLoading');
            this.showEl('baseProductsEmpty');
        }
    },

    // ========================================
    // INBOX TAB — Pancake/Messenger messages của khách đặt đơn
    // ========================================

    /**
     * Lấy auth header TPOS — dùng chung cho mọi gọi OData từ KPI iframe.
     * Ưu tiên tokenManager nếu có; fallback POST /api/token với cred từ
     * KPI manager (đã có sẵn trong fetchRefundedOrderCodes).
     */
    async _getKpiTposAuthHeader() {
        if (this._kpiTposAuth?.expiresAt > Date.now()) return this._kpiTposAuth.header;
        const tokenManager =
            window.tokenManager || window.parent?.tokenManager || window.top?.tokenManager;
        if (tokenManager?.getAuthHeader) {
            const header = await tokenManager.getAuthHeader();
            // tokenManager tự refresh, không cache thêm
            return header;
        }
        const WORKER =
            window.API_CONFIG?.WORKER_URL ||
            window.parent?.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev';
        const creds = {
            grant_type: 'password',
            username: 'nvktlive1',
            password: 'Aa@28612345678',
            client_id: 'tmtWebApp',
        };
        const body = new URLSearchParams();
        for (const [k, v] of Object.entries(creds)) body.append(k, v);
        const tokenRes = await fetch(`${WORKER}/api/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        if (!tokenRes.ok) throw new Error(`Token HTTP ${tokenRes.status}`);
        const tj = await tokenRes.json();
        if (!tj.access_token) throw new Error('Invalid token response');
        const header = { Authorization: `Bearer ${tj.access_token}` };
        this._kpiTposAuth = { header, expiresAt: Date.now() + 50 * 60 * 1000 };
        return header;
    },

    /**
     * Lookup SaleOnline_Order on TPOS để lấy Facebook_PageId, Facebook_ASUserId,
     * Facebook_PostId, PartnerId. Cache trong-memory mỗi orderId 5 phút.
     */
    async _fetchSaleOnlineOrderForInbox(orderId) {
        if (!this._inboxOrderCache) this._inboxOrderCache = new Map();
        const cached = this._inboxOrderCache.get(orderId);
        if (cached && Date.now() - cached.savedAt < 5 * 60 * 1000) return cached.data;

        const WORKER =
            window.API_CONFIG?.WORKER_URL ||
            window.parent?.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev';

        const authHeader = await this._getKpiTposAuthHeader();
        const url = `${WORKER}/api/odata/SaleOnline_Order(${orderId})?$expand=Partner`;
        const res = await fetch(url, {
            headers: {
                ...authHeader,
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
        });
        if (!res.ok) throw new Error(`SaleOnline_Order HTTP ${res.status}`);
        const data = await res.json();
        this._inboxOrderCache.set(orderId, { savedAt: Date.now(), data });
        return data;
    },

    async renderInboxTab(orderId) {
        this.showEl('inboxLoading');
        this.hideEl('inboxEmpty');
        this.hideEl('inboxContent');

        try {
            const order = await this._fetchSaleOnlineOrderForInbox(orderId);
            const postId = order?.Facebook_PostId || '';
            // Facebook_PageId thường null cho đơn từ LIVE → derive từ
            // Facebook_PostId (format: "pageId_postId").
            const pageId =
                order?.Facebook_PageId || (postId ? String(postId).split('_')[0] : '') || '';
            const psid = order?.Facebook_ASUserId || '';
            const fbUserName = order?.Facebook_UserName || '';
            const partnerName = order?.Partner?.Name || order?.PartnerName || fbUserName || '';
            const partnerPhone = order?.Partner?.Phone || order?.Telephone || '';

            if (!pageId || !psid) {
                this.hideEl('inboxLoading');
                this.showEl('inboxEmpty');
                const emp = document.getElementById('inboxEmpty');
                if (emp) {
                    emp.querySelector('p').textContent =
                        !pageId && !psid
                            ? 'Đơn không có Facebook_PageId/PostId & Facebook_ASUserId — không map được Pancake.'
                            : !pageId
                              ? 'Đơn không có Facebook_PageId/PostId.'
                              : 'Đơn không có Facebook_ASUserId (psid).';
                }
                return;
            }

            // Render meta + messages
            const channelId = postId ? String(postId).split('_')[0] : pageId;
            const pancakeInboxUrl = `https://pages.fm/#!/conversation/${pageId}/inbox?psid=${psid}`;
            const meta = document.getElementById('inboxMeta');
            if (meta) {
                meta.innerHTML = `
                    <div class="inbox-meta-row">
                        <span class="inbox-meta-label">Khách:</span>
                        <span class="inbox-meta-value">${this.escapeHtml(partnerName || '—')}${partnerPhone ? ' · ' + this.escapeHtml(partnerPhone) : ''}</span>
                    </div>
                    <div class="inbox-meta-row">
                        <span class="inbox-meta-label">Page ID:</span>
                        <code class="inbox-code">${this.escapeHtml(pageId)}</code>
                        <span class="inbox-meta-label">PSID:</span>
                        <code class="inbox-code">${this.escapeHtml(psid)}</code>
                    </div>
                    <div class="inbox-meta-row">
                        <a class="inbox-pancake-link" href="${pancakeInboxUrl}" target="_blank" rel="noopener">
                            <i data-lucide="external-link"></i> Mở trên Pancake
                        </a>
                    </div>`;
            }

            // Fetch messages via PDM — flow giống tab1-chat-core:
            //   1) fetchConversationsByCustomerFbId(pageId, psid) → conversationId
            //   2) fetchMessages(pageId, convId, null, customerId) → messages[]
            const pdm =
                window.pancakeDataManager ||
                window.parent?.pancakeDataManager ||
                window.top?.pancakeDataManager;

            let messages = [];
            let conversationId = null;
            let usedPageId = pageId;
            let fetchError = null;

            if (pdm?.fetchConversationsByCustomerFbId && pdm?.fetchMessages) {
                try {
                    // Ensure pancakeTokenManager initialized (đọc JWT từ localStorage
                    // — đã login qua tab1 thì cùng origin → token sẵn sàng).
                    if (pdm.tm?.initialize) {
                        await pdm.tm.initialize().catch(() => {});
                    }

                    // 1) Resolve conversation từ pageId + psid
                    let convRes = await pdm.fetchConversationsByCustomerFbId(pageId, psid);
                    let convs = convRes?.conversations || [];
                    let conv = convs.find((c) => c.type === 'INBOX') || convs[0];

                    // 2) Nếu pageId derive sai → multi-page search
                    if (!conv && pdm.fetchConversationsByCustomerIdMultiPage) {
                        const mpRes = await pdm.fetchConversationsByCustomerIdMultiPage(psid);
                        const mpConvs = mpRes?.conversations || [];
                        conv = mpConvs.find((c) => c.type === 'INBOX') || mpConvs[0];
                        if (conv) {
                            usedPageId = conv.page_id || conv.from_psid_page || pageId;
                        }
                    }

                    // 3) Fetch messages
                    if (conv?.id) {
                        conversationId = conv.id;
                        const customerId = conv.from?.id || conv.from_id || psid;
                        const msgRes = await pdm.fetchMessages(
                            usedPageId,
                            conversationId,
                            null,
                            customerId
                        );
                        messages = msgRes?.messages || [];
                    } else {
                        fetchError =
                            'Không tìm thấy conversation cho PSID này (có thể đã bị xóa hoặc subscription page đã hết hạn).';
                    }
                } catch (e) {
                    console.warn('[KPI Inbox] PDM fetch failed:', e?.message || e);
                    fetchError = e?.message || 'Lỗi không xác định';
                }
            } else {
                fetchError =
                    'Pancake stack chưa load (cần shared/js/pancake-token-manager.js + pancake-data-manager.js).';
            }

            this._renderInboxMessages(messages, {
                pageId: usedPageId,
                psid,
                pancakeInboxUrl,
                conversationId,
                hasPdm: !!pdm,
                error: fetchError,
            });
            this.hideEl('inboxLoading');
            this.showEl('inboxContent');
            this.reinitIcons();
        } catch (e) {
            console.error('[KPI Inbox] Error:', e);
            this.hideEl('inboxLoading');
            this.showEl('inboxEmpty');
            const emp = document.getElementById('inboxEmpty');
            if (emp) {
                emp.querySelector('p').textContent = `Lỗi tải tin nhắn: ${e.message}`;
            }
        }
    },

    _renderInboxMessages(messages, ctx) {
        const wrap = document.getElementById('inboxMessages');
        if (!wrap) return;

        if (!messages || messages.length === 0) {
            const errText = ctx.error
                ? `<p class="inbox-err">${this.escapeHtml(ctx.error)}</p>`
                : '<p>Conversation rỗng (chưa có tin nhắn nào).</p>';
            wrap.innerHTML = `
                <div class="inbox-empty-list">
                    ${errText}
                    <p><a href="${ctx.pancakeInboxUrl}" target="_blank" rel="noopener">Mở trực tiếp trên Pancake</a> để xem full lịch sử.</p>
                </div>`;
            return;
        }

        // Sort by inserted_at / created_time ascending (oldest first → newest at bottom)
        const sorted = [...messages].sort((a, b) => {
            const ta = new Date(a.inserted_at || a.created_time || a.timestamp || 0).getTime();
            const tb = new Date(b.inserted_at || b.created_time || b.timestamp || 0).getTime();
            return ta - tb;
        });

        const pageId = String(ctx.pageId);
        let html = '';
        for (const msg of sorted) {
            const fromId = msg?.from?.id || msg.from_id || '';
            const isFromPage = String(fromId) === pageId;
            const side = isFromPage ? 'page' : 'customer';
            // Pancake Public API v1 messages có `original_message` (raw text) + `message` (HTML)
            const text = msg.original_message || this._stripHtml(msg.message || msg.text || '');
            const senderName = msg?.from?.name || (isFromPage ? 'Page' : 'Khách') || 'Unknown';
            const t = msg.inserted_at || msg.created_time || msg.timestamp || '';
            const tStr = t ? new Date(t).toLocaleString('vi-VN') : '';
            const attachments = msg.attachments || [];

            let attachHtml = '';
            for (const a of attachments) {
                const url = a.url || a.image_url || a.payload?.url || a.thumbnail_url || '';
                if (!url) continue;
                const typeStr = String(a.type || '').toLowerCase();
                if (typeStr === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(url)) {
                    attachHtml += `<a href="${this.escapeHtml(url)}" target="_blank" rel="noopener"><img src="${this.escapeHtml(url)}" class="inbox-attach-img" alt="" loading="lazy" /></a>`;
                } else if (typeStr === 'video' || /\.(mp4|webm|mov)$/i.test(url)) {
                    attachHtml += `<a href="${this.escapeHtml(url)}" target="_blank" rel="noopener" class="inbox-attach-file">🎬 Video</a>`;
                } else {
                    attachHtml += `<a href="${this.escapeHtml(url)}" target="_blank" rel="noopener" class="inbox-attach-file">📎 ${this.escapeHtml(a.name || 'Tệp đính kèm')}</a>`;
                }
            }

            html += `
                <div class="inbox-msg inbox-msg-${side}">
                    <div class="inbox-msg-bubble">
                        ${text ? `<div class="inbox-msg-text">${this.escapeHtml(text)}</div>` : ''}
                        ${attachHtml ? `<div class="inbox-msg-attach">${attachHtml}</div>` : ''}
                    </div>
                    <div class="inbox-msg-meta">
                        <span class="inbox-msg-sender">${this.escapeHtml(senderName)}</span>
                        ${tStr ? `<span class="inbox-msg-time">${this.escapeHtml(tStr)}</span>` : ''}
                    </div>
                </div>`;
        }

        wrap.innerHTML = html;
        // Scroll to bottom (latest message visible)
        wrap.scrollTop = wrap.scrollHeight;
    },

    _stripHtml(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = String(html);
        return tmp.textContent || tmp.innerText || '';
    },

    // ========================================
    // FETCH REFUND EXCEL (3 months) — TPOS FastSaleOrder/ExportFileRefund
    // ========================================

    /**
     * Fetch + parse refund excel 3 tháng gần nhất, return Set<orderCode> đã hoàn.
     * Refund excel có cột "Tham chiếu" = mã đơn gốc (vd "NJD/2026/62621").
     *
     * Endpoint: POST /api/FastSaleOrder/ExportFileRefund?TagIds=
     * Body: { data: JSON.stringify({Filter:{...}}), ids: [] }
     * Response: XLSX binary, sheet "Trả hàng", header row 3 (range:2 in JSON parse).
     */
    async fetchRefundedOrderCodes(monthsBack = 3) {
        if (typeof XLSX === 'undefined') {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }
        const WORKER =
            window.API_CONFIG?.WORKER_URL ||
            window.parent?.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev';
        // KPI iframe không có tokenManager — fetch token qua proxy /api/token (giống trahang.js)
        let authHeader;
        const tokenManager = window.tokenManager || window.parent?.tokenManager;
        if (tokenManager?.getAuthHeader) {
            authHeader = await tokenManager.getAuthHeader();
        } else {
            const companyId =
                window.ShopConfig?.getConfig?.()?.CompanyId ||
                window.parent?.ShopConfig?.getConfig?.()?.CompanyId ||
                1;
            const creds =
                companyId === 2
                    ? {
                          grant_type: 'password',
                          username: 'nvktshop1',
                          password: 'Aa@28612345678',
                          client_id: 'tmtWebApp',
                      }
                    : {
                          grant_type: 'password',
                          username: 'nvktlive1',
                          password: 'Aa@28612345678',
                          client_id: 'tmtWebApp',
                      };
            const formData = new URLSearchParams();
            for (const [k, v] of Object.entries(creds)) formData.append(k, v);
            const tokenRes = await fetch(`${WORKER}/api/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString(),
            });
            if (!tokenRes.ok) throw new Error(`Token HTTP ${tokenRes.status}`);
            const tokenData = await tokenRes.json();
            if (!tokenData.access_token) throw new Error('Invalid token response');
            authHeader = { Authorization: `Bearer ${tokenData.access_token}` };
        }
        const headers = authHeader;
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - monthsBack);
        const startISO = new Date(
            startDate.setHours(0, 0, 0, 0) - 7 * 60 * 60 * 1000
        ).toISOString();
        const endISO = new Date(
            endDate.setHours(23, 59, 59, 999) - 7 * 60 * 60 * 1000
        ).toISOString();
        const filter = {
            Filter: {
                logic: 'and',
                filters: [
                    { field: 'Type', operator: 'eq', value: 'refund' },
                    { field: 'DateInvoice', operator: 'gte', value: startISO },
                    { field: 'DateInvoice', operator: 'lte', value: endISO },
                    { field: 'IsMergeCancel', operator: 'neq', value: true },
                ],
            },
        };
        const res = await fetch(`${WORKER}/api/FastSaleOrder/ExportFileRefund?TagIds=`, {
            method: 'POST',
            headers: {
                ...headers,
                Accept: '*/*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ data: JSON.stringify(filter), ids: [] }),
        });
        if (!res.ok) throw new Error(`ExportFileRefund HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        // range:2 = skip 2 title rows, header is row 3 ("STT", "Khách hàng", ..., "Tham chiếu", ...)
        const rows = XLSX.utils.sheet_to_json(sheet, { range: 2, defval: null });
        const codes = new Set();
        for (const row of rows) {
            const ref = String(row['Tham chiếu'] || '').trim();
            if (ref) codes.add(ref);
        }
        console.log(
            `[KPI Tab] Refund excel ${monthsBack} tháng: ${rows.length} dòng, ${codes.size} mã đơn unique`
        );
        return { codes, totalRows: rows.length, startISO, endISO };
    },

    // ========================================
    // RECONCILIATION HELPERS (UI redesign)
    // ========================================

    _setReconProgress(stage, pct, detail) {
        const el = document.getElementById('reconProgress');
        if (!el) return;
        el.style.display = '';
        const stageEl = document.getElementById('reconProgressStage');
        const pctEl = document.getElementById('reconProgressPct');
        const fillEl = document.getElementById('reconProgressFill');
        const detailEl = document.getElementById('reconProgressDetail');
        if (stageEl) stageEl.textContent = stage || '';
        if (pctEl) pctEl.textContent = `${Math.round(pct || 0)}%`;
        if (fillEl) fillEl.style.width = `${Math.max(2, Math.min(100, pct || 0))}%`;
        if (detailEl) detailEl.textContent = detail || '';
    },

    _hideReconProgress() {
        const el = document.getElementById('reconProgress');
        if (el) el.style.display = 'none';
    },

    _animateCount(el, target, duration = 600) {
        if (!el) return;
        const start = parseInt((el.textContent || '0').replace(/\D/g, '')) || 0;
        const delta = target - start;
        if (delta === 0) {
            el.textContent = target.toLocaleString('vi-VN');
            return;
        }
        const t0 = performance.now();
        const tick = (now) => {
            const elapsed = now - t0;
            const t = Math.min(1, elapsed / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            const v = Math.round(start + delta * eased);
            el.textContent = v.toLocaleString('vi-VN');
            if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    },

    _formatVnd(amount) {
        if (!amount) return '0 ₫';
        return amount.toLocaleString('vi-VN') + ' ₫';
    },

    _bindReconChips() {
        const chips = document.querySelectorAll('.recon-chip');
        const cards = document.querySelectorAll('.recon-stat-card');
        const apply = (key) => {
            this._reconFilter = key;
            chips.forEach((c) => c.classList.toggle('is-active', c.dataset.filter === key));
            cards.forEach((c) => c.classList.toggle('is-active', c.dataset.filter === key));
            this._applyReconFilter();
        };
        chips.forEach((chip) => {
            if (chip.__reconBound) return;
            chip.__reconBound = true;
            chip.addEventListener('click', () => apply(chip.dataset.filter));
        });
        cards.forEach((card) => {
            if (card.__reconBound) return;
            card.__reconBound = true;
            card.addEventListener('click', () => apply(card.dataset.filter));
        });
    },

    _applyReconFilter() {
        const filter = this._reconFilter || 'all';
        const tbody = document.getElementById('reconTableBody');
        if (!tbody) return;
        const rows = tbody.querySelectorAll('tr[data-recon-row]');
        let visible = 0;
        rows.forEach((row) => {
            const status = row.dataset.reconStatus;
            const show =
                filter === 'all' ||
                (filter === 'ok' && status === 'ok') ||
                (filter === 'refunded' && status === 'refunded') ||
                (filter === 'discrepancy' && status === 'discrepancy');
            row.style.display = show ? '' : 'none';
            const detail = row.nextElementSibling;
            if (detail && detail.classList.contains('recon-detail-row')) {
                detail.style.display = show && detail.dataset.open === '1' ? '' : 'none';
            }
            if (show) visible++;
        });
        const emptyFilterEl = document.getElementById('reconEmptyFilter');
        if (emptyFilterEl) emptyFilterEl.style.display = visible === 0 ? '' : 'none';
    },

    _bindReconSort() {
        const headers = document.querySelectorAll('#reconResultsWrapper thead th[data-sort]');
        headers.forEach((th) => {
            if (th.__reconBound) return;
            th.__reconBound = true;
            th.addEventListener('click', () => {
                const key = th.dataset.sort;
                const cur = this._reconSort || {};
                const dir = cur.key === key && cur.dir === 'asc' ? 'desc' : 'asc';
                this._reconSort = { key, dir };
                headers.forEach((h) => h.classList.toggle('is-sorted', h === th));
                this._sortReconResults();
            });
        });
    },

    _sortReconResults() {
        const sort = this._reconSort;
        if (!sort) return;
        const tbody = document.getElementById('reconTableBody');
        if (!tbody) return;
        const allRows = Array.from(tbody.children);
        const pairs = [];
        for (let i = 0; i < allRows.length; i++) {
            if (allRows[i].dataset.reconRow != null) {
                const detail = allRows[i + 1]?.classList.contains('recon-detail-row')
                    ? allRows[i + 1]
                    : null;
                pairs.push({ main: allRows[i], detail });
            }
        }
        pairs.sort((a, b) => {
            const av = a.main.dataset[`sort_${sort.key}`] || '';
            const bv = b.main.dataset[`sort_${sort.key}`] || '';
            const an = parseFloat(av);
            const bn = parseFloat(bv);
            const isNum = !isNaN(an) && !isNaN(bn);
            const cmp = isNum ? an - bn : av.localeCompare(bv);
            return sort.dir === 'asc' ? cmp : -cmp;
        });
        const frag = document.createDocumentFragment();
        pairs.forEach(({ main, detail }) => {
            frag.appendChild(main);
            if (detail) frag.appendChild(detail);
        });
        tbody.appendChild(frag);
    },

    _toggleReconDetail(orderId) {
        const tbody = document.getElementById('reconTableBody');
        if (!tbody) return;
        const main = tbody.querySelector(`tr[data-order-id="${orderId}"]`);
        if (!main) return;
        const detail = main.nextElementSibling;
        if (!detail || !detail.classList.contains('recon-detail-row')) return;
        const isOpen = detail.dataset.open === '1';
        detail.dataset.open = isOpen ? '0' : '1';
        detail.style.display = isOpen ? 'none' : '';
        const btn = main.querySelector('.recon-toggle-btn');
        if (btn) btn.classList.toggle('is-open', !isOpen);
    },

    async exportReconciliationExcel() {
        if (!this._reconResults || this._reconResults.length === 0) {
            alert('Không có dữ liệu đối soát để xuất');
            return;
        }
        if (typeof XLSX === 'undefined') {
            alert('XLSX chưa load');
            return;
        }
        const rows = [
            [
                'Mã ĐH',
                'Số phiếu (TPOS)',
                'STT',
                'Expected',
                'Actual',
                'Delta',
                'Trạng thái',
                'Ghi chú',
            ],
        ];
        for (const r of this._reconResults) {
            const status = r.isRefunded
                ? 'Đã hoàn (loại KPI)'
                : r.hasDiscrepancy
                  ? 'Sai lệch'
                  : 'OK';
            const note = (r.discrepancies || []).map((d) => `[${d.type}] ${d.message}`).join(' | ');
            rows.push([
                r.orderCode,
                r.invoiceNumber || '',
                r.stt != null ? r.stt : '',
                r.expectedNet,
                typeof r.actualNet === 'number' ? r.actualNet : r.actualNet,
                typeof r.actualNet === 'number' ? r.actualNet - r.expectedNet : '',
                status,
                note,
            ]);
        }
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [
            { wch: 14 },
            { wch: 18 },
            { wch: 8 },
            { wch: 12 },
            { wch: 12 },
            { wch: 10 },
            { wch: 22 },
            { wch: 60 },
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Đối soát KPI');
        const fname = `doi-soat-kpi-${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fname);
    },

    // ========================================
    // RUN RECONCILIATION (12.14) — refresh + check refund excel
    // ========================================
    async runReconciliation() {
        const btn = document.getElementById('btnRunReconciliation');
        if (btn) btn.disabled = true;

        this.hideEl('reconEmpty');
        this.hideEl('reconResultsWrapper');
        const statsEl = document.getElementById('reconStatsCards');
        const ctrlEl = document.getElementById('reconControlBar');
        if (statsEl) statsEl.style.display = 'none';
        if (ctrlEl) ctrlEl.style.display = 'none';
        this._setReconProgress('Đang khởi tạo...', 2, '');

        const setLoadingMsg = (msg, pct, detail) => {
            this._setReconProgress(msg, pct, detail || '');
        };

        try {
            const db = this.getDb();
            if (!db) throw new Error('Firestore not available');

            // Collect all orders from filtered data
            const allOrders = [];
            for (const emp of this.state.filteredData) {
                for (const order of emp.orders) {
                    allOrders.push(order);
                }
            }

            if (allOrders.length === 0) {
                this.hideEl('reconLoading');
                this.showEl('reconEmpty');
                const emptyEl = document.getElementById('reconEmpty');
                if (emptyEl)
                    emptyEl.querySelector('p').textContent =
                        'Không có đơn hàng nào để đối soát. Hãy áp dụng bộ lọc trước.';
                if (btn) btn.disabled = false;
                return;
            }

            // Step 1: Load invoice cache + fetch refund excel SONG SONG
            // (independent — không phụ thuộc nhau, dùng Promise.all)
            setLoadingMsg(
                'Load invoice cache + refund excel song song...',
                8,
                'Promise.all 2 tasks độc lập'
            );
            const t1 = performance.now();
            const [, refundResult] = await Promise.all([
                this.loadInvoiceStatusData().catch((e) => {
                    console.warn('[KPI Tab] Load invoice cache failed:', e?.message);
                }),
                this.fetchRefundedOrderCodes(3).catch((e) => {
                    console.warn('[KPI Tab] Fetch refund excel failed:', e?.message);
                    if (window.notificationManager?.warning) {
                        window.notificationManager.warning(
                            'Không tải được refund excel — đối soát chỉ check trạng thái đơn',
                            2500
                        );
                    }
                    return { codes: new Set(), totalRows: 0 };
                }),
            ]);
            const refundInfo = refundResult || { codes: new Set(), totalRows: 0 };
            const refundedInvoiceNumbers = refundInfo.codes;
            console.log(
                `[KPI Tab] Step 1 (parallel) hoàn tất trong ${Math.round(performance.now() - t1)}ms`
            );

            // Step 1c: Map orderId → invoiceNumber, check refunded
            const orderIdToRefunded = new Map();
            const orderIdToInvoice = new Map();
            for (const order of allOrders) {
                const inv = this._invoiceCache.get(order.orderId);
                const invNumber = inv?.Number || '';
                orderIdToInvoice.set(order.orderId, inv || null);
                orderIdToRefunded.set(
                    order.orderId,
                    invNumber && refundedInvoiceNumbers.has(invNumber)
                );
            }
            const refundedKpiCount = [...orderIdToRefunded.values()].filter(Boolean).length;

            // Step 2: Reconcile từng đơn — WORKER POOL CONCURRENCY 8 (song song)
            // Trước: 134 sequential awaits ~30-60s. Sau: 8 workers parallel ~5-10s.
            const CONCURRENCY = 8;
            const total = allOrders.length;
            setLoadingMsg(
                `Kiểm tra audit log song song ${CONCURRENCY} workers (0/${total})`,
                25,
                `${refundedKpiCount} đơn đã được mark hoàn từ refund excel`
            );
            const results = new Array(total); // preserve order via index
            let processed = 0;
            let nextIdx = 0;
            const t2 = performance.now();

            const reconcileOne = async (idx) => {
                const order = allOrders[idx];
                const isRefunded = orderIdToRefunded.get(order.orderId) || false;
                const invoice = orderIdToInvoice.get(order.orderId);
                let result;
                try {
                    if (window.kpiManager && window.kpiManager.reconcileKPI) {
                        result = await window.kpiManager.reconcileKPI(
                            order.orderId,
                            order.campaignName,
                            order.orderCode
                        );
                    } else {
                        result = {
                            orderId: order.orderId,
                            hasDiscrepancy: false,
                            expected: {},
                            actual: {},
                            discrepancies: [],
                        };
                    }
                    const refundDiscrepancy = isRefunded
                        ? [
                              {
                                  type: 'refunded',
                                  message: `Đơn đã có trong refund excel — không tính KPI`,
                              },
                          ]
                        : [];
                    results[idx] = {
                        orderId: order.orderId,
                        orderCode: order.orderCode || '',
                        invoiceNumber: invoice?.Number || '',
                        invoiceState: invoice?.ShowState || '',
                        kpiAmount: order.kpi || 0,
                        stt: order.stt,
                        expectedNet: order.netProducts || 0,
                        actualNet:
                            result.actualNet != null ? result.actualNet : order.netProducts || 0,
                        hasDiscrepancy: isRefunded || result.hasDiscrepancy,
                        isRefunded,
                        discrepancies: [...refundDiscrepancy, ...(result.discrepancies || [])],
                    };
                } catch (e) {
                    console.error('[KPI Tab] Reconciliation error for order:', order.orderId, e);
                    results[idx] = {
                        orderCode: order.orderCode || '',
                        orderId: order.orderId,
                        invoiceNumber: invoice?.Number || '',
                        invoiceState: invoice?.ShowState || '',
                        kpiAmount: order.kpi || 0,
                        stt: order.stt,
                        expectedNet: order.netProducts || 0,
                        actualNet: 'Lỗi',
                        hasDiscrepancy: true,
                        isRefunded,
                        discrepancies: [
                            ...(isRefunded ? [{ type: 'refunded', message: 'Đơn đã hoàn' }] : []),
                            { type: 'error', message: e.message },
                        ],
                    };
                }
            };

            // Throttled progress UI update — chỉ refresh mỗi 200ms để tránh
            // reflow liên tục khi 8 workers fire callback đồng thời
            let lastProgressUpdate = 0;
            const updateProgress = (force) => {
                const now = performance.now();
                if (!force && now - lastProgressUpdate < 200) return;
                lastProgressUpdate = now;
                const pct = 25 + Math.round((processed / total) * 70);
                setLoadingMsg(
                    `Kiểm tra song song ${CONCURRENCY} workers (${processed}/${total})`,
                    pct,
                    `${refundedKpiCount} đã hoàn · ${results.filter((r) => r?.hasDiscrepancy && !r?.isRefunded).length} sai lệch khác phát hiện`
                );
            };

            // Worker pool: spawn N concurrent workers, each pulls from queue
            const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
                while (true) {
                    const myIdx = nextIdx++;
                    if (myIdx >= total) break;
                    await reconcileOne(myIdx);
                    processed++;
                    updateProgress(false);
                }
            });
            await Promise.all(workers);
            updateProgress(true);
            console.log(
                `[KPI Tab] Step 2 (concurrency ${CONCURRENCY}) hoàn tất ${total} đơn trong ${Math.round(performance.now() - t2)}ms`
            );

            setLoadingMsg('Render bảng kết quả...', 98, '');
            await new Promise((r) => setTimeout(r, 100));

            this._reconResults = results;
            this._indexReconResults(results);
            this._renderReconciliationUI(results, refundInfo);
            // Đồng bộ refund vào main KPI table (re-render để show cột Hoàn + KPI thực)
            try {
                await this.renderKPITable(this.state.filteredData || []);
            } catch (e) {
                console.warn('[KPI Tab] Sync KPI table after recon failed:', e?.message);
            }
            this._hideReconProgress();
        } catch (error) {
            console.error('[KPI Tab] Reconciliation error:', error);
            this._hideReconProgress();
            this.showEl('reconEmpty');
            const emptyEl = document.getElementById('reconEmpty');
            if (emptyEl) emptyEl.querySelector('p').textContent = `Lỗi đối soát: ${error.message}`;
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    /**
     * Build maps để các bảng khác (main KPI, modal L1) đọc nhanh:
     *   - _reconByOrder: orderId → { isRefunded, hasDiscrepancy, invoiceNumber, ... }
     *   - _reconRefundedRowMap: invoiceNumber → row excel (Khách hàng, Số phiếu, Tổng tiền,...)
     *   - _reconKpiLossByUser: userId → tổng KPI bị loại do refund
     */
    _indexReconResults(results) {
        this._reconByOrder = new Map();
        this._reconKpiLossByUser = new Map();
        for (const r of results) {
            this._reconByOrder.set(r.orderId, r);
        }
        // Aggregate KPI loss per user via this.state.filteredData.
        // Loại đơn = đơn refund (từ excel) HOẶC đơn có phiếu Hủy bỏ trên TPOS.
        const refundedSet = new Set(results.filter((r) => r.isRefunded).map((r) => r.orderId));
        for (const emp of this.state.filteredData || []) {
            let lossSum = 0;
            let refundCount = 0;
            for (const order of emp.orders || []) {
                const inv = this._invoiceCache?.get(order.orderId);
                const isCancelled = this._isInvoiceCancelled(inv);
                if (refundedSet.has(order.orderId) || isCancelled) {
                    lossSum += order.kpi || 0;
                    refundCount++;
                }
            }
            this._reconKpiLossByUser.set(emp.userId, {
                kpiLost: lossSum,
                refundCount,
            });
        }
    },

    /**
     * Fetch FastSaleOrder refund detail (món trả + lý do) on-demand cho 1 invoice.
     * Cache trong _reconRefundDetailCache để tránh fetch lặp.
     */
    async _fetchRefundDetailForInvoice(originalInvoiceNumber) {
        if (!this._reconRefundDetailCache) this._reconRefundDetailCache = new Map();
        if (this._reconRefundDetailCache.has(originalInvoiceNumber)) {
            return this._reconRefundDetailCache.get(originalInvoiceNumber);
        }
        const WORKER =
            window.API_CONFIG?.WORKER_URL ||
            window.parent?.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev';

        let authHeader;
        const tokenManager = window.tokenManager || window.parent?.tokenManager;
        if (tokenManager?.getAuthHeader) {
            authHeader = await tokenManager.getAuthHeader();
        } else if (this._reconAuthHeader) {
            authHeader = this._reconAuthHeader;
        } else {
            // Re-fetch token (shouldn't reach normally)
            authHeader = { Authorization: '' };
        }

        try {
            // Step 1: Find original invoice by Number qua GetView (OData direct trả 500)
            const findFilter = encodeURIComponent(
                "(Type eq 'invoice' and Number eq '" +
                    originalInvoiceNumber.replace(/'/g, "''") +
                    "')"
            );
            const findUrl = `${WORKER}/api/odata/FastSaleOrder/ODataService.GetView?$filter=${findFilter}&$top=1`;
            const findRes = await fetch(findUrl, {
                headers: {
                    ...authHeader,
                    accept: 'application/json',
                    'feature-version': '2',
                    'x-tpos-lang': 'vi',
                },
            });
            if (!findRes.ok) throw new Error(`Find HTTP ${findRes.status}`);
            const findData = await findRes.json();
            const origInvoice = findData.value?.[0];
            if (!origInvoice?.Id) {
                this._reconRefundDetailCache.set(originalInvoiceNumber, null);
                return null;
            }

            // Step 2: Find refund by RefundOrderId = origInvoice.Id (qua GetView)
            const refundFilter = encodeURIComponent(
                "(Type eq 'refund' and RefundOrderId eq " + origInvoice.Id + ')'
            );
            const refundUrl = `${WORKER}/api/odata/FastSaleOrder/ODataService.GetView?$filter=${refundFilter}&$top=5`;
            const refundRes = await fetch(refundUrl, {
                headers: {
                    ...authHeader,
                    accept: 'application/json',
                    'feature-version': '2',
                    'x-tpos-lang': 'vi',
                },
            });
            if (!refundRes.ok) throw new Error(`Refund HTTP ${refundRes.status}`);
            const refundDataList = await refundRes.json();
            const refundSummaries = refundDataList.value || [];

            // Step 3: GET full FastSaleOrder({id})?$expand=OrderLines cho mỗi refund
            const refunds = [];
            for (const summ of refundSummaries) {
                try {
                    const fullRes = await fetch(
                        `${WORKER}/api/odata/FastSaleOrder(${summ.Id})?$expand=OrderLines`,
                        {
                            headers: {
                                ...authHeader,
                                accept: 'application/json',
                                'feature-version': '2',
                                'x-tpos-lang': 'vi',
                            },
                        }
                    );
                    if (fullRes.ok) {
                        const full = await fullRes.json();
                        refunds.push(full);
                    } else {
                        refunds.push(summ);
                    }
                } catch (_) {
                    refunds.push(summ);
                }
            }
            const detail = {
                originalNumber: originalInvoiceNumber,
                refunds: refunds.map((r) => ({
                    Number: r.Number,
                    DateInvoice: r.DateInvoice,
                    AmountTotal: r.AmountTotal,
                    Comment: r.Comment || r.Note || '',
                    State: r.State,
                    ShowState: r.ShowState,
                    OrderLines: (r.OrderLines || []).map((l) => ({
                        ProductName: l.ProductName || l.ProductNameGet || l.Name,
                        Quantity: l.Quantity,
                        Price: l.Price,
                        Note: l.Note || '',
                    })),
                })),
            };
            this._reconRefundDetailCache.set(originalInvoiceNumber, detail);
            return detail;
        } catch (e) {
            console.warn('[KPI Tab] Fetch refund detail failed:', e?.message);
            this._reconRefundDetailCache.set(originalInvoiceNumber, null);
            return null;
        }
    },

    /**
     * Modal L1: expand row để load + hiển thị chi tiết món trả (cho đơn refunded).
     */
    async _toggleL1OrderDetail(orderId) {
        const tbody = document.getElementById('modalL1TableBody');
        if (!tbody) return;
        const row = tbody.querySelector(`tr[data-l1-order="${orderId}"]`);
        if (!row) return;
        const detail = row.nextElementSibling;
        if (!detail || !detail.classList.contains('l1-detail-row')) return;
        const isOpen = detail.dataset.open === '1';
        detail.dataset.open = isOpen ? '0' : '1';
        detail.style.display = isOpen ? 'none' : '';
        const btn = row.querySelector('.l1-toggle-btn');
        if (btn) btn.classList.toggle('is-open', !isOpen);
        if (!isOpen && detail.dataset.loaded !== '1') {
            // Lazy fetch refund detail
            const recon = this._reconByOrder?.get(orderId);
            const invNumber = recon?.invoiceNumber;
            const contentEl = detail.querySelector('.l1-detail-content');
            if (recon?.isRefunded && invNumber && contentEl) {
                contentEl.innerHTML =
                    '<div class="l1-detail-loading"><i class="fas fa-spinner fa-spin"></i> Đang tải chi tiết refund từ TPOS...</div>';
                const refundDetail = await this._fetchRefundDetailForInvoice(invNumber);
                if (!refundDetail || refundDetail.refunds.length === 0) {
                    contentEl.innerHTML =
                        '<div class="l1-detail-empty">Không tìm thấy chi tiết refund trên TPOS.</div>';
                } else {
                    contentEl.innerHTML = refundDetail.refunds
                        .map((rf) => {
                            const date = rf.DateInvoice
                                ? new Date(rf.DateInvoice).toLocaleString('vi-VN')
                                : '';
                            const reasonHtml = rf.Comment
                                ? `<div class="l1-detail-reason"><strong>Lý do:</strong> ${this.escapeHtml(rf.Comment)}</div>`
                                : '<div class="l1-detail-reason l1-detail-reason-empty">Không có lý do.</div>';
                            const itemsHtml = rf.OrderLines.length
                                ? `<table class="l1-detail-items"><thead><tr><th>SP</th><th>SL</th><th>Giá</th><th>Ghi chú</th></tr></thead><tbody>${rf.OrderLines.map(
                                      (l) =>
                                          `<tr><td>${this.escapeHtml(l.ProductName || '—')}</td><td>${l.Quantity}</td><td>${(l.Price || 0).toLocaleString('vi-VN')}đ</td><td>${this.escapeHtml(l.Note || '')}</td></tr>`
                                  ).join('')}</tbody></table>`
                                : '<div class="l1-detail-empty">Không có dòng sản phẩm trong refund.</div>';
                            return `<div class="l1-detail-refund">
                                <div class="l1-detail-header">
                                    <span class="l1-detail-tag">↩ ${this.escapeHtml(rf.Number)}</span>
                                    <span class="l1-detail-date">${this.escapeHtml(date)}</span>
                                    <span class="l1-detail-amount">${(rf.AmountTotal || 0).toLocaleString('vi-VN')}đ</span>
                                </div>
                                ${reasonHtml}
                                <div class="l1-detail-items-title">Món trả:</div>
                                ${itemsHtml}
                            </div>`;
                        })
                        .join('');
                }
            } else if (contentEl) {
                contentEl.innerHTML =
                    '<div class="l1-detail-empty">Đơn này không có refund. Click order link để xem chi tiết KPI items.</div>';
            }
            detail.dataset.loaded = '1';
            if (window.lucide?.createIcons) window.lucide.createIcons();
        }
    },

    _renderReconciliationUI(results, refundInfo) {
        const refundedCount = results.filter((r) => r.isRefunded).length;
        const otherDiscrepancies = results.filter((r) => r.hasDiscrepancy && !r.isRefunded).length;
        const okCount = results.length - refundedCount - otherDiscrepancies;

        const refundedKpiAmount = results
            .filter((r) => r.isRefunded)
            .reduce((sum, r) => sum + (r.kpiAmount || 0), 0);

        // Show stats cards + animate count
        const statsEl = document.getElementById('reconStatsCards');
        if (statsEl) statsEl.style.display = '';
        this._animateCount(document.getElementById('reconStatTotal'), results.length);
        this._animateCount(document.getElementById('reconStatOk'), okCount);
        this._animateCount(document.getElementById('reconStatRefunded'), refundedCount);
        this._animateCount(document.getElementById('reconStatDiscrepancy'), otherDiscrepancies);
        const refundSubEl = document.getElementById('reconStatRefundedSub');
        if (refundSubEl) {
            refundSubEl.textContent = refundedKpiAmount
                ? `Loại bỏ KPI: ${this._formatVnd(refundedKpiAmount)}`
                : '0 ₫ KPI bị loại';
        }

        // Show control bar + chip counts
        const ctrlEl = document.getElementById('reconControlBar');
        if (ctrlEl) ctrlEl.style.display = '';
        const setChip = (id, n) => {
            const el = document.getElementById(id);
            if (el) el.textContent = n.toLocaleString('vi-VN');
        };
        setChip('chipCountAll', results.length);
        setChip('chipCountOk', okCount);
        setChip('chipCountRefunded', refundedCount);
        setChip('chipCountDiscrepancy', otherDiscrepancies);
        const metaEl = document.getElementById('reconMetaInfo');
        if (metaEl) {
            metaEl.textContent = `Refund excel: ${refundInfo.totalRows} dòng · ${refundInfo.codes.size} mã đơn unique · check 3 tháng`;
        }

        // Render table
        this.showEl('reconResultsWrapper');
        this.hideEl('reconEmpty');
        // Remove old summary nếu có
        const oldSummary = document.getElementById('reconSummary');
        if (oldSummary) oldSummary.remove();
        this.renderReconciliationResults(results);

        // Bind chips/sort/cards (idempotent)
        this._bindReconChips();
        this._bindReconSort();

        // Default filter: highlight refunded + discrepancy first
        if (refundedCount > 0 || otherDiscrepancies > 0) {
            this._reconFilter = 'refunded';
            if (refundedCount === 0) this._reconFilter = 'discrepancy';
        } else {
            this._reconFilter = 'all';
        }
        document
            .querySelectorAll('.recon-chip')
            .forEach((c) =>
                c.classList.toggle('is-active', c.dataset.filter === this._reconFilter)
            );
        document
            .querySelectorAll('.recon-stat-card')
            .forEach((c) =>
                c.classList.toggle('is-active', c.dataset.filter === this._reconFilter)
            );
        this._applyReconFilter();

        // Re-init lucide icons cho elements mới
        if (window.lucide?.createIcons) {
            window.lucide.createIcons();
        }
    },

    renderReconciliationResults(results) {
        const tbody = document.getElementById('reconTableBody');
        if (!tbody) return;

        let html = '';
        results.forEach((r, idx) => {
            const deltaNum = typeof r.actualNet === 'number' ? r.actualNet - r.expectedNet : null;
            let deltaClass = 'delta-zero';
            if (deltaNum != null) {
                if (deltaNum > 0) deltaClass = 'delta-positive';
                else if (deltaNum < 0) deltaClass = 'delta-negative';
            }

            const status = r.isRefunded ? 'refunded' : r.hasDiscrepancy ? 'discrepancy' : 'ok';

            let statusHtml;
            if (r.isRefunded) {
                statusHtml =
                    '<span class="status-badge status-refunded">↩ Đã hoàn (loại KPI)</span>';
            } else if (r.hasDiscrepancy) {
                statusHtml = '<span class="status-badge status-discrepancy">⚠ Sai lệch</span>';
            } else {
                statusHtml = '<span class="status-badge status-ok">✅ OK</span>';
            }

            const invId = this._invoiceCache?.get(r.orderId)?.Id;
            const invHtml = r.invoiceNumber
                ? `<a class="recon-invoice-num is-link" href="javascript:void(0)" onclick="event.stopPropagation();window.KPICommission.showInvoiceDetail('${invId || ''}', '${this.escapeHtml(r.invoiceNumber)}')" title="Xem chi tiết phiếu ${this.escapeHtml(r.invoiceNumber)}">${this.escapeHtml(r.invoiceNumber)}</a>${r.invoiceState ? ` <span style="font-size:11px;color:#6b7280;">${this.escapeHtml(r.invoiceState)}</span>` : ''}`
                : '<span class="recon-invoice-num is-empty">— chưa có invoice</span>';

            const hasDetail = (r.discrepancies || []).length > 0;
            const toggleBtn = hasDetail
                ? `<button class="recon-toggle-btn" onclick="window.KPICommission._toggleReconDetail('${this.escapeHtml(r.orderId)}')" title="Xem chi tiết"><i data-lucide="chevron-right"></i></button>`
                : '';

            const refundedClass = r.isRefunded ? 'is-refunded' : '';
            const animDelay = Math.min(idx * 12, 600); // stagger fade-in

            html += `<tr class="${refundedClass}" data-recon-row="1" data-recon-status="${status}" data-order-id="${this.escapeHtml(r.orderId)}" data-sort_orderCode="${this.escapeHtml(r.orderCode || '')}" data-sort_stt="${r.stt != null ? r.stt : ''}" data-sort_expectedNet="${r.expectedNet}" data-sort_actualNet="${typeof r.actualNet === 'number' ? r.actualNet : ''}" data-sort_delta="${deltaNum != null ? deltaNum : ''}" style="animation-delay:${animDelay}ms;">
                <td>${toggleBtn}</td>
                <td class="recon-cell-code"><strong>${this.escapeHtml(r.orderCode || r.orderId)}</strong></td>
                <td>${invHtml}</td>
                <td class="recon-cell-num">${r.stt != null ? r.stt : '—'}</td>
                <td class="recon-cell-num">${(r.expectedNet || 0).toLocaleString('vi-VN')}</td>
                <td class="recon-cell-num">${typeof r.actualNet === 'number' ? r.actualNet.toLocaleString('vi-VN') : this.escapeHtml(String(r.actualNet))}</td>
                <td class="recon-cell-num ${deltaClass}">${deltaNum != null ? (deltaNum >= 0 ? '+' : '') + deltaNum.toLocaleString('vi-VN') : '—'}</td>
                <td>${statusHtml}</td>
            </tr>`;

            if (hasDetail) {
                const tagMap = {
                    refunded: 'tag-refund',
                    error: 'tag-error',
                    discrepancy: 'tag-discrepancy',
                    productMissing: 'tag-discrepancy',
                    quantityMismatch: 'tag-discrepancy',
                    statusMismatch: 'tag-discrepancy',
                };
                const detailItems = r.discrepancies
                    .map((d) => {
                        const tagClass = tagMap[d.type] || 'tag-discrepancy';
                        return `<li><span class="recon-detail-tag ${tagClass}">${this.escapeHtml(d.type)}</span> ${this.escapeHtml(d.message || '')}</li>`;
                    })
                    .join('');
                html += `<tr class="recon-detail-row" data-open="0" style="display:none;">
                    <td colspan="8">
                        <div class="recon-detail-content">
                            <div style="font-weight:600;color:#374151;margin-bottom:6px;">Chi tiết sai lệch / lý do loại:</div>
                            <ul>${detailItems}</ul>
                        </div>
                    </td>
                </tr>`;
            }
        });

        tbody.innerHTML = html;
    },

    // ========================================
    // EXPORT EXCEL (12.15)
    // ========================================
    async exportExcel() {
        try {
            if (typeof XLSX === 'undefined') {
                alert('Thư viện XLSX chưa được tải. Vui lòng thử lại.');
                return;
            }

            const aggregated = await this.aggregateByEmployee(this.state.filteredData);

            if (aggregated.length === 0) {
                alert('Không có dữ liệu để xuất. Hãy áp dụng bộ lọc trước.');
                return;
            }

            // Build data rows
            const rows = [
                ['STT', 'Tên nhân viên', 'Số đơn', 'SP NET', 'Tổng KPI (VNĐ)', 'Phiếu bán hàng'],
            ];

            aggregated.forEach((emp, idx) => {
                // Build invoice status summary text for Excel
                let invoiceSummary = '';
                const counts = {};
                let noInvoice = 0;
                for (const order of emp.orders) {
                    const inv = this._invoiceCache.get(order.orderId);
                    if (!inv) {
                        noInvoice++;
                        continue;
                    }
                    const state = inv.ShowState || 'Không rõ';
                    counts[state] = (counts[state] || 0) + 1;
                }
                const parts = [];
                for (const [state, count] of Object.entries(counts)) {
                    parts.push(`${count} ${state}`);
                }
                if (noInvoice > 0) parts.push(`${noInvoice} Chưa có`);
                invoiceSummary = parts.join(', ');

                rows.push([
                    idx + 1,
                    emp.resolvedName || emp.userName || emp.userId,
                    emp.orders.filter(
                        (o) => !o._stale && ((o.netProducts || 0) > 0 || (o.kpi || 0) > 0)
                    ).length,
                    emp.totalNetProducts,
                    emp.totalKPI,
                    invoiceSummary || '−',
                ]);
            });

            // Create workbook
            const ws = XLSX.utils.aoa_to_sheet(rows);

            // Set column widths
            ws['!cols'] = [
                { wch: 6 }, // STT
                { wch: 25 }, // Tên NV
                { wch: 10 }, // Số đơn
                { wch: 10 }, // SP NET
                { wch: 18 }, // Tổng KPI
                { wch: 30 }, // Phiếu bán hàng
            ];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'KPI Report');

            // Generate filename with date
            const now = new Date();
            const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
            const fileName = `KPI_Report_${dateStr}.xlsx`;

            XLSX.writeFile(wb, fileName);
        } catch (error) {
            console.error('[KPI Tab] Export error:', error);
            alert('Lỗi khi xuất Excel: ' + error.message);
        }
    },

    // ========================================
    // RECOMPUTE ALL KPI (backfill — áp logic mới cho data cũ)
    // Lấy mọi orderCode đã xuất hiện trong kpi_statistics (theo dateFrom/dateTo filter
    // đang chọn, hoặc toàn bộ nếu chưa chọn), chạy lại calculateNetKPI để áp logic
    // detect biến thể mới, rồi save lại statistics.
    // ========================================
    async recomputeAllKPI() {
        if (!window.kpiManager || !window.kpiManager.recalculateAndSaveKPI) {
            alert('KPI manager chưa sẵn sàng.');
            return;
        }

        const btn = document.getElementById('btnRecomputeAllKPI');
        const dateFrom = (document.getElementById('kpiFilterDateFrom') || {}).value || '';
        const dateTo = (document.getElementById('kpiFilterDateTo') || {}).value || '';

        const rangeText =
            dateFrom || dateTo
                ? `từ ${dateFrom || '—'} đến ${dateTo || '—'}`
                : 'TOÀN BỘ data (không có filter ngày)';
        if (
            !confirm(
                `Tính lại KPI ${rangeText}?\n\nHành động này:\n• Chạy calculateNetKPI cho từng đơn\n• Lưu đè lên kpi_statistics hiện tại\n• Có thể mất vài phút tùy số đơn\n\nTiếp tục?`
            )
        )
            return;

        const originalHTML = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2"></i> Đang tính…';
            this.reinitIcons();
        }

        try {
            // 1) Lấy danh sách orderCode cần tính lại.
            //    PHẢI lấy từ kpi_base (source of truth của đơn có BASE) — không phải
            //    kpi_statistics (chỉ chứa đơn ĐÃ CÓ KPI > 0 hoặc đã được save).
            //    Trước đây source từ kpi_statistics → đơn có BASE nhưng chưa tick SP
            //    nào (KPI=0) bị bỏ qua → không migrate được.
            //    Dùng endpoint /kpi-base/list-meta có support filter date/campaign.
            const campaign = this.state.filters.campaign || '';
            const qs = new URLSearchParams();
            if (dateFrom) qs.append('dateFrom', dateFrom);
            if (dateTo) qs.append('dateTo', dateTo);
            if (campaign) qs.append('campaign', campaign);
            const basesRes = await window.kpiManager.kpiAPI(
                'GET',
                `/kpi-base/list-meta${qs.toString() ? '?' + qs.toString() : ''}`
            );
            const bases = (basesRes && basesRes.bases) || [];

            const orderCodes = new Set();
            for (const b of bases) {
                if (b && b.orderCode) orderCodes.add(b.orderCode);
            }

            const total = orderCodes.size;
            if (total === 0) {
                alert('Không có đơn nào trong khoảng đã chọn.');
                return;
            }

            console.log(`[KPI Recompute] Bắt đầu tính lại ${total} đơn (parallel=20)...`);

            const CONCURRENCY = 20;
            const queue = Array.from(orderCodes);
            let done = 0;
            let failed = 0;

            const updateProgress = () => {
                if (!btn) return;
                btn.innerHTML = `<i data-lucide="loader-2"></i> ${done}/${total}…`;
                this.reinitIcons();
            };

            // Smoke test endpoint cleanup — fail fast nếu Render chưa deploy DELETE route.
            let cleanupAvailable = true;
            try {
                await window.kpiManager.kpiAPI(
                    'DELETE',
                    `/kpi-statistics/order/${encodeURIComponent('__probe_' + Date.now())}`
                );
            } catch (e) {
                const msg = String(e?.message || e);
                if (msg.includes('404')) {
                    cleanupAvailable = false;
                    console.warn(
                        '[KPI Recompute] DELETE /kpi-statistics/order chưa có trên server (404). Render có thể đang deploy — bấm lại sau vài phút.'
                    );
                    alert(
                        '⚠ Server Render chưa có endpoint dọn orphan (chưa deploy xong).\nBackfill vẫn sẽ chạy nhưng các đơn duplicate cũ SẼ KHÔNG ĐƯỢC DỌN.\n\nKhuyến nghị: đợi 2-3 phút cho Render deploy xong rồi bấm lại.'
                    );
                }
                // Non-404 errors: orderCode ngẫu nhiên không match row nào → server trả 200 hoặc lỗi khác — vẫn coi là available.
            }

            // Worker pool: mỗi worker pull 1 orderCode từ queue, cleanup + recompute, repeat.
            let cleanupFailures = 0;
            const worker = async () => {
                while (queue.length > 0) {
                    const orderCode = queue.shift();
                    if (!orderCode) break;
                    try {
                        // (1) Xoá orderCode khỏi mọi (userId, stat_date) row để dẹp orphan
                        //     từ các lần save cũ (sai ngày hoặc sai userId).
                        if (cleanupAvailable) {
                            try {
                                await window.kpiManager.kpiAPI(
                                    'DELETE',
                                    `/kpi-statistics/order/${encodeURIComponent(orderCode)}`
                                );
                            } catch (e) {
                                cleanupFailures++;
                                if (cleanupFailures <= 5) {
                                    console.warn(
                                        `[KPI Recompute] Cleanup fail ${orderCode}:`,
                                        e?.message || e
                                    );
                                }
                            }
                        }
                        // (2) Recompute + save vào đúng (userId, baseDate).
                        await window.kpiManager.recalculateAndSaveKPI(orderCode);
                    } catch (e) {
                        failed++;
                        console.warn(`[KPI Recompute] Fail ${orderCode}:`, e?.message || e);
                    }
                    done++;
                    if (done % 10 === 0 || done === total) updateProgress();
                }
            };

            const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker());
            await Promise.all(workers);

            console.log(
                `[KPI Recompute] Xong: ${done - failed}/${total} đơn, fail ${failed}, cleanup fail ${cleanupFailures}`
            );
            const cleanupWarn = !cleanupAvailable
                ? '\n\n⚠ Không dọn được orphan — các đơn duplicate cũ vẫn còn.\nĐợi Render deploy xong rồi bấm lại.'
                : cleanupFailures > 0
                  ? `\n\n⚠ ${cleanupFailures} đơn dọn orphan lỗi (xem console).`
                  : '';
            alert(
                `Hoàn tất: ${done - failed}/${total} đơn.\nFailed: ${failed}${cleanupWarn}\n\nĐang refresh bảng…`
            );
            await this.refreshData();
        } catch (e) {
            console.error('[KPI Recompute] error:', e);
            alert('Lỗi khi tính lại KPI: ' + (e?.message || e));
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
                this.reinitIcons();
            }
        }
    },

    // ========================================
    // REFRESH DATA (12.16)
    // ========================================
    async refreshData() {
        this.showEl('kpiTableLoading');
        this.hideEl('kpiTableEmpty');
        this.hideEl('kpiTableWrapper');

        // Reset summary cards
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        setVal('totalEmployees', '0');
        setVal('totalOrdersWithBase', '0');
        setVal('totalNetProducts', '0');
        setVal('totalKPIAmount', '0đ');

        // Clear name cache to force re-resolution
        this.state.employeeNameCache = {};

        try {
            await this.loadAllStatistics();
            await this.applyFilters();
            this.reinitIcons();
        } catch (error) {
            console.error('[KPI Tab] Refresh error:', error);
            this.hideEl('kpiTableLoading');
            this.showEl('kpiTableEmpty');
        }
    },
};

// ========================================
// WAIT FOR FIREBASE SDK
// ========================================
function waitForFirebase(timeout, interval) {
    timeout = timeout || 15000;
    interval = interval || 100;
    return new Promise(function (resolve, reject) {
        if (window.firebase && window.firebase.firestore) {
            return resolve();
        }
        var elapsed = 0;
        var timer = setInterval(function () {
            elapsed += interval;
            if (window.firebase && window.firebase.firestore) {
                clearInterval(timer);
                return resolve();
            }
            if (elapsed >= timeout) {
                clearInterval(timer);
                return reject(new Error('Firebase SDK load timeout after ' + timeout + 'ms'));
            }
        }, interval);
    });
}

// ========================================
// AUTO-INIT on DOMContentLoaded
// ========================================
document.addEventListener('DOMContentLoaded', function () {
    waitForFirebase(15000, 100)
        .then(function () {
            KPICommission.init();
        })
        .catch(function (err) {
            console.error('[KPI Tab] Firebase init failed:', err);
            KPICommission.hideEl('kpiTableLoading');
            var emptyEl = document.getElementById('kpiTableEmpty');
            if (emptyEl) {
                emptyEl.style.display = '';
                var msgEl = emptyEl.querySelector('p');
                if (msgEl) {
                    msgEl.textContent = 'Không thể kết nối Firebase. Vui lòng tải lại trang.';
                }
            }
        });
});

// Expose to window — `const KPICommission` không tự attach cho iframe parent / debug
try {
    window.KPICommission = KPICommission;
} catch (e) {}
